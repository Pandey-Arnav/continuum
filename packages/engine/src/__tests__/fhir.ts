import assert from "node:assert/strict";
import { buildFhirBundle } from "../fhir";

const bundle = buildFhirBundle({
  generatedAt: "2026-01-02T00:00:00Z",
  patient: { id: "patient 1", displayName: "Test Patient", externalIdentifier: "EXT-1" },
  entries: [
    {
      id: "entry 1",
      sourceType: "chw_voice_visit",
      createdAt: "2026-01-01T00:00:00Z",
      protocolId: "antenatal_ncd_v1",
      facts: [
        {
          category: "weight_kg",
          value: 62,
          unit: "kg",
          timestamp: "2026-01-01T00:00:00Z",
          note: "weight 62 kg",
          flagLevel: "green",
          flagReason: "Weight recorded",
          ruleId: "anc.info.weight",
        },
      ],
    },
  ],
});

assert.equal(bundle.resourceType, "Bundle");
assert.equal(bundle.entry.length, 3);
assert.equal(bundle.entry[0].resource.resourceType, "Patient");
assert.equal(bundle.entry[1].resource.resourceType, "Observation");
assert.equal(bundle.entry[2].resource.resourceType, "Provenance");

console.log("FHIR TEST PASSED — patient, observation, and provenance resources verified.");
