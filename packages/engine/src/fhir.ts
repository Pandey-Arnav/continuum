import type { FlaggedEntry, SourceType } from "./types";

export interface FhirExportPatient {
  id: string;
  displayName: string;
  birthDate?: string | null;
  externalIdentifier?: string | null;
}

export interface FhirExportEntry {
  id: string;
  sourceType: SourceType;
  createdAt: string;
  protocolId: string;
  facts: FlaggedEntry[];
}

export interface FhirBundle {
  resourceType: "Bundle";
  type: "collection";
  timestamp: string;
  meta: { tag: Array<{ system: string; code: string; display: string }> };
  entry: Array<{ fullUrl: string; resource: Record<string, unknown> }>;
}

function fhirId(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9\-.]/g, "-").slice(0, 64);
  return normalized || "continuum-resource";
}

function valueField(fact: FlaggedEntry): Record<string, unknown> {
  if (typeof fact.value === "number") {
    return { valueQuantity: { value: fact.value, unit: fact.unit } };
  }
  return { valueString: String(fact.value) };
}

export function buildFhirBundle(args: {
  patient: FhirExportPatient;
  entries: FhirExportEntry[];
  generatedAt?: string;
}): FhirBundle {
  const patientId = fhirId(args.patient.id);
  const bundleEntries: FhirBundle["entry"] = [
    {
      fullUrl: `https://continuum.example/fhir/Patient/${patientId}`,
      resource: {
        resourceType: "Patient",
        id: patientId,
        identifier: args.patient.externalIdentifier
          ? [{ system: "urn:continuum:external-patient-id", value: args.patient.externalIdentifier }]
          : undefined,
        name: [{ text: args.patient.displayName }],
        birthDate: args.patient.birthDate ?? undefined,
      },
    },
  ];

  for (const entry of args.entries) {
    const observationIds: string[] = [];
    entry.facts.forEach((fact, index) => {
      const observationId = fhirId(`${entry.id}-${index}`);
      observationIds.push(observationId);
      bundleEntries.push({
        fullUrl: `https://continuum.example/fhir/Observation/${observationId}`,
        resource: {
          resourceType: "Observation",
          id: observationId,
          status: "final",
          category: [{ text: entry.sourceType.replace(/_/g, " ") }],
          code: { text: fact.category.replace(/_/g, " ") },
          subject: { reference: `Patient/${patientId}` },
          effectiveDateTime: fact.timestamp || entry.createdAt,
          ...valueField(fact),
          interpretation: [{ text: fact.flagLevel }],
          note: fact.note ? [{ text: fact.note }] : undefined,
          method: { text: `Continuum deterministic rule ${fact.ruleId}` },
        },
      });
    });

    const provenanceId = fhirId(`provenance-${entry.id}`);
    bundleEntries.push({
      fullUrl: `https://continuum.example/fhir/Provenance/${provenanceId}`,
      resource: {
        resourceType: "Provenance",
        id: provenanceId,
        target: observationIds.map((id) => ({ reference: `Observation/${id}` })),
        recorded: entry.createdAt,
        agent: [{ type: { text: "Continuum capture and human verification workflow" }, who: { display: "Continuum" } }],
        entity: [{ role: "source", what: { display: `Protocol ${entry.protocolId}` } }],
      },
    });
  }

  return {
    resourceType: "Bundle",
    type: "collection",
    timestamp: args.generatedAt ?? new Date().toISOString(),
    meta: {
      tag: [{ system: "https://continuum.example/fhir/export-status", code: "pilot", display: "Pilot export; validate against the target implementation guide" }],
    },
    entry: bundleEntries,
  };
}
