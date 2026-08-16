import assert from "node:assert/strict";
import { checkEvaluationGate, evaluateExtractions } from "../evaluation";

const report = evaluateExtractions([
  {
    id: "case-1",
    expected: [
      { category: "weight_kg", value: 62, unit: "kg" },
      { category: "severe_headache", value: "present" },
    ],
    predicted: [
      { category: "weight_kg", value: 62, unit: "kg", timestamp: "2026-01-01T00:00:00Z", evidenceVerified: true },
      { category: "severe_headache", value: "absent", timestamp: "2026-01-01T00:00:00Z", evidenceVerified: true },
      { category: "temperature_f", value: 99, unit: "F", timestamp: "2026-01-01T00:00:00Z", evidenceVerified: false },
    ],
  },
]);

assert.equal(report.expectedFacts, 2);
assert.equal(report.predictedFacts, 3);
assert.equal(report.exactMatches, 1);
assert.equal(report.precision, 1 / 3);
assert.equal(report.recall, 1 / 2);
assert.equal(report.evidenceMatchRate, 2 / 3);
assert.equal(report.byCategory.find((row) => row.category === "weight_kg")?.exactMatches, 1);

const gate = checkEvaluationGate(report, {
  minimumCases: 200,
  minimumPrecision: 0.9,
  minimumRecall: 0.9,
  minimumEvidenceMatchRate: 0.95,
});
assert.equal(gate.passed, false);
assert.ok(gate.failures.some((failure) => failure.startsWith("cases")));
assert.ok(gate.failures.some((failure) => failure.startsWith("evidence match")));

console.log("EVALUATION TEST PASSED — exact-match, category, and evidence metrics verified.");
