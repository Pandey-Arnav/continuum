import { detectLongitudinalSignals, LongitudinalEntry } from "../longitudinal";

const entries: LongitudinalEntry[] = [
  {
    id: "visit-1",
    createdAt: "2026-08-01T10:00:00Z",
    sourceType: "chw_voice_visit",
    flaggedEntries: [{ category: "severe_headache", value: "present", timestamp: "2026-08-01T10:00:00Z", flagLevel: "red", flagReason: "reported", ruleId: "r1" }],
  },
  {
    id: "visit-2",
    createdAt: "2026-08-03T10:00:00Z",
    sourceType: "chw_voice_visit",
    flaggedEntries: [{ category: "severe_headache", value: "present", timestamp: "2026-08-03T10:00:00Z", flagLevel: "red", flagReason: "reported", ruleId: "r1" }],
  },
  {
    id: "discharge-1",
    createdAt: "2026-08-04T10:00:00Z",
    sourceType: "discharge_photo",
    flaggedEntries: [{ category: "medication_change", value: "start A", timestamp: "2026-08-04T10:00:00Z", flagLevel: "amber", flagReason: "changed", ruleId: "r2" }],
  },
  {
    id: "discharge-2",
    createdAt: "2026-08-05T10:00:00Z",
    sourceType: "discharge_photo",
    flaggedEntries: [{ category: "medication_change", value: "stop B", timestamp: "2026-08-05T10:00:00Z", flagLevel: "amber", flagReason: "changed", ruleId: "r2" }],
  },
];

const signals = detectLongitudinalSignals(entries);
if (!signals.some((signal) => signal.id === "recurring-red:severe_headache" && signal.level === "red")) {
  throw new Error("Expected recurring red category signal");
}
if (!signals.some((signal) => signal.id === "multiple-medication-changes")) {
  throw new Error("Expected medication reconciliation signal");
}
if (!signals.some((signal) => signal.id === "cross-source-continuity")) {
  throw new Error("Expected cross-source continuity signal");
}

console.log("LONGITUDINAL TEST PASSED — recurring, medication, and cross-source rules verified.");
