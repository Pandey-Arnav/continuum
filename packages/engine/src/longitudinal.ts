import { FlagLevel, FlaggedEntry, SourceType } from "./types";

export interface LongitudinalEntry {
  id: string;
  createdAt: string;
  sourceType: SourceType;
  flaggedEntries: FlaggedEntry[];
}

export interface LongitudinalSignal {
  id: string;
  level: FlagLevel;
  title: string;
  detail: string;
  evidenceCount: number;
  category?: string;
  entryIds: string[];
}

const rank: Record<FlagLevel, number> = { green: 0, amber: 1, red: 2 };

/**
 * Pure, deterministic longitudinal rules. These rules summarize patterns in
 * verdicts already produced by compare(); they never ask a model to infer a
 * trend and never change an underlying entry's flag.
 */
export function detectLongitudinalSignals(entries: LongitudinalEntry[]): LongitudinalSignal[] {
  const categoryEvents = new Map<string, { entryId: string; level: FlagLevel }[]>();

  for (const entry of entries) {
    const worstByCategory = new Map<string, FlagLevel>();
    for (const fact of entry.flaggedEntries) {
      const current = worstByCategory.get(fact.category);
      if (!current || rank[fact.flagLevel] > rank[current]) worstByCategory.set(fact.category, fact.flagLevel);
    }
    for (const [category, level] of worstByCategory) {
      const events = categoryEvents.get(category) ?? [];
      events.push({ entryId: entry.id, level });
      categoryEvents.set(category, events);
    }
  }

  const signals: LongitudinalSignal[] = [];
  for (const [category, events] of categoryEvents) {
    const redEvents = events.filter((event) => event.level === "red");
    const flaggedEvents = events.filter((event) => event.level !== "green");
    if (redEvents.length >= 2) {
      signals.push({
        id: `recurring-red:${category}`,
        level: "red",
        title: `Recurring ${category.replace(/_/g, " ")}`,
        detail: `${redEvents.length} separate captures contain a red rule result for this category. Review the underlying evidence and rule IDs.`,
        evidenceCount: redEvents.length,
        category,
        entryIds: redEvents.map((event) => event.entryId),
      });
    } else if (flaggedEvents.length >= 2) {
      signals.push({
        id: `recurring-flag:${category}`,
        level: "amber",
        title: `Repeated flagged ${category.replace(/_/g, " ")}`,
        detail: `${flaggedEvents.length} separate captures contain amber or red rule results for this category.`,
        evidenceCount: flaggedEvents.length,
        category,
        entryIds: flaggedEvents.map((event) => event.entryId),
      });
    }
  }

  const medicationEvents = entries.filter((entry) =>
    entry.flaggedEntries.some((fact) => fact.category === "medication_change")
  );
  if (medicationEvents.length >= 2) {
    signals.push({
      id: "multiple-medication-changes",
      level: "amber",
      title: "Multiple medication changes documented",
      detail: `${medicationEvents.length} captures contain medication changes. This is a reconciliation prompt, not an interaction warning.`,
      evidenceCount: medicationEvents.length,
      category: "medication_change",
      entryIds: medicationEvents.map((entry) => entry.id),
    });
  }

  const sources = new Set(entries.map((entry) => entry.sourceType));
  if (sources.size >= 2) {
    signals.push({
      id: "cross-source-continuity",
      level: "green",
      title: "Cross-source record connected",
      detail: "Community visits and discharge records are visible in the same evidence trail.",
      evidenceCount: entries.length,
      entryIds: entries.map((entry) => entry.id),
    });
  }

  return signals.sort((a, b) => rank[b.level] - rank[a.level] || b.evidenceCount - a.evidenceCount);
}
