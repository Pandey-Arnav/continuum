// compare(): the deterministic core of the engine. Pure function, no network
// call, no model of any kind. Every flag it produces is traceable to exactly
// one Rule in the given Protocol. This is the one piece of the pipeline that
// is explicitly NOT allowed to be an LLM call — see docs in README.
import { FlaggedEntry, FlagResult, Protocol, StructuredEntry } from "./types";

const FLAG_RANK: Record<FlagResult["flagLevel"], number> = {
  green: 0,
  amber: 1,
  red: 2,
};

/**
 * Compares each structured entry against every rule in the protocol whose
 * category matches, and keeps the highest-severity match. Entries with no
 * matching rule are not silently dropped — they come back flagged green
 * with an explicit "no rule matched" reason, so nothing disappears from the
 * evidence trail.
 */
export function compare(entries: StructuredEntry[], protocol: Protocol): FlaggedEntry[] {
  return entries.map((entry) => {
    const matches = protocol.rules
      .filter((rule) => rule.category === entry.category)
      .map((rule) => rule.evaluate(entry))
      .filter((result): result is FlagResult => result !== null);

    if (matches.length === 0) {
      return {
        ...entry,
        flagLevel: "green" as const,
        flagReason: `No rule in "${protocol.name}" matched category "${entry.category}"; recorded as informational.`,
        ruleId: "none",
      };
    }

    const worst = matches.reduce((a, b) => (FLAG_RANK[b.flagLevel] > FLAG_RANK[a.flagLevel] ? b : a));
    return { ...entry, ...worst };
  });
}

export function highestFlagLevel(flags: FlaggedEntry[]): FlagResult["flagLevel"] {
  if (flags.length === 0) return "green";
  return flags.reduce((a, b) => (FLAG_RANK[b.flagLevel] > FLAG_RANK[a.flagLevel] ? b : a)).flagLevel;
}
