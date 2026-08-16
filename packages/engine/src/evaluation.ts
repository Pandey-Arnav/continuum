import type { StructuredEntry } from "./types";

export interface EvaluationCase {
  id: string;
  expected: Array<Pick<StructuredEntry, "category" | "value" | "unit">>;
  predicted: StructuredEntry[];
}

export interface CategoryEvaluation {
  category: string;
  expected: number;
  predicted: number;
  exactMatches: number;
  precision: number;
  recall: number;
}

export interface EvaluationReport {
  cases: number;
  expectedFacts: number;
  predictedFacts: number;
  exactMatches: number;
  precision: number;
  recall: number;
  f1: number;
  evidenceMatchRate: number;
  byCategory: CategoryEvaluation[];
}

export interface EvaluationGate {
  minimumCases: number;
  minimumPrecision: number;
  minimumRecall: number;
  minimumEvidenceMatchRate: number;
}

export interface EvaluationGateResult {
  passed: boolean;
  failures: string[];
}

function normalizeValue(value: string | number): string {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "invalid";
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function factKey(fact: Pick<StructuredEntry, "category" | "value" | "unit">): string {
  return [fact.category.trim().toLowerCase(), normalizeValue(fact.value), fact.unit?.trim().toLowerCase() ?? ""].join("|");
}

function safeRatio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

export function evaluateExtractions(cases: EvaluationCase[]): EvaluationReport {
  const expectedByCategory = new Map<string, number>();
  const predictedByCategory = new Map<string, number>();
  const matchesByCategory = new Map<string, number>();
  let expectedFacts = 0;
  let predictedFacts = 0;
  let exactMatches = 0;
  let evidenceMatched = 0;

  for (const evaluationCase of cases) {
    const remaining = new Map<string, number>();
    for (const fact of evaluationCase.expected) {
      expectedFacts += 1;
      expectedByCategory.set(fact.category, (expectedByCategory.get(fact.category) ?? 0) + 1);
      const key = factKey(fact);
      remaining.set(key, (remaining.get(key) ?? 0) + 1);
    }

    for (const fact of evaluationCase.predicted) {
      predictedFacts += 1;
      if (fact.evidenceVerified) evidenceMatched += 1;
      predictedByCategory.set(fact.category, (predictedByCategory.get(fact.category) ?? 0) + 1);
      const key = factKey(fact);
      const available = remaining.get(key) ?? 0;
      if (available > 0) {
        exactMatches += 1;
        matchesByCategory.set(fact.category, (matchesByCategory.get(fact.category) ?? 0) + 1);
        remaining.set(key, available - 1);
      }
    }
  }

  const categories = new Set([...expectedByCategory.keys(), ...predictedByCategory.keys()]);
  const byCategory = [...categories].sort().map((category) => {
    const expected = expectedByCategory.get(category) ?? 0;
    const predicted = predictedByCategory.get(category) ?? 0;
    const matches = matchesByCategory.get(category) ?? 0;
    return {
      category,
      expected,
      predicted,
      exactMatches: matches,
      precision: safeRatio(matches, predicted),
      recall: safeRatio(matches, expected),
    };
  });

  const precision = safeRatio(exactMatches, predictedFacts);
  const recall = safeRatio(exactMatches, expectedFacts);
  return {
    cases: cases.length,
    expectedFacts,
    predictedFacts,
    exactMatches,
    precision,
    recall,
    f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall),
    evidenceMatchRate: safeRatio(evidenceMatched, predictedFacts),
    byCategory,
  };
}

export function checkEvaluationGate(report: EvaluationReport, gate: EvaluationGate): EvaluationGateResult {
  const failures: string[] = [];
  if (report.cases < gate.minimumCases) failures.push(`cases ${report.cases} < ${gate.minimumCases}`);
  if (report.precision < gate.minimumPrecision) failures.push(`precision ${report.precision.toFixed(4)} < ${gate.minimumPrecision.toFixed(4)}`);
  if (report.recall < gate.minimumRecall) failures.push(`recall ${report.recall.toFixed(4)} < ${gate.minimumRecall.toFixed(4)}`);
  if (report.evidenceMatchRate < gate.minimumEvidenceMatchRate) failures.push(`evidence match ${report.evidenceMatchRate.toFixed(4)} < ${gate.minimumEvidenceMatchRate.toFixed(4)}`);
  return { passed: failures.length === 0, failures };
}
