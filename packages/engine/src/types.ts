// Shared types for the capture -> structure -> compare -> flag -> handoff pipeline.
// Both the community health worker (voice) scenario and the hospital discharge
// (photo) scenario flow through these exact same shapes.

export type SourceType = "chw_voice_visit" | "discharge_photo";

export type RecipientRole =
  | "supervising_health_worker"
  | "patient"
  | "doctor"
  | "family_member";

export type FlagLevel = "green" | "amber" | "red";

/** Output of capture(): plain text pulled out of a raw voice note or photo. */
export interface RawCapture {
  sourceType: SourceType;
  text: string;
  language?: string; // e.g. "hi", "mr", "en" — detected/declared source language
  translatedText?: string; // English translation, when input was non-English
  mediaRef?: string; // storage path/URI of the original audio or image, for the evidence trail
}

/** A single fact pulled out of raw text by structure(). No judgment attached yet. */
export interface StructuredEntry {
  category: string; // e.g. "blood_pressure_systolic", "medication_change", "red_flag_symptom"
  value: string | number;
  unit?: string;
  timestamp: string; // ISO 8601
  note?: string; // short verbatim snippet this was extracted from, for traceability
  evidenceVerified?: boolean; // true only when `note` can be found in the raw capture text
  extractionConfidence?: "high" | "review"; // deterministic provenance quality, never model self-confidence
}

/** compare()'s verdict for one structured entry. Always traceable to a ruleId. */
export interface FlagResult {
  flagLevel: FlagLevel;
  flagReason: string;
  ruleId: string;
}

export type FlaggedEntry = StructuredEntry & FlagResult;

/** A single deterministic, inspectable rule. No ML/LLM involved in evaluate(). */
export interface Rule {
  id: string;
  category: string;
  description: string;
  evaluate: (entry: StructuredEntry) => FlagResult | null;
}

/** A named bundle of rules — either a clinical screening protocol or a patient/family baseline. */
export interface Protocol {
  id: string;
  name: string;
  description: string;
  governance: {
    version: string;
    status: "draft_unapproved" | "clinically_approved" | "retired";
    sourceTitle: string;
    sourceUri?: string;
    jurisdiction?: string;
    approvedBy?: string;
    approvedAt?: string;
    reviewDueAt?: string;
  };
  rules: Rule[];
}

/** Schema/protocol context handed to structure() so extraction knows what to look for. */
export interface SchemaContext {
  protocolId: string;
  categories: { category: string; description: string; unit?: string }[];
  instructions: string;
}

export interface HandoffResult {
  recipientRole: RecipientRole;
  summary: string;
  highestFlagLevel: FlagLevel;
}

/** Persisted shape — mirrors the `entries` table in Postgres. */
export interface Entry {
  id: string;
  sourceType: SourceType;
  rawInputRef: string | null;
  rawText: string;
  structuredData: StructuredEntry[];
  category: string;
  flagLevel: FlagLevel;
  flagReason: string;
  ruleId: string;
  recipient: RecipientRole;
  handoffSummary: string;
  createdAt: string;
}
