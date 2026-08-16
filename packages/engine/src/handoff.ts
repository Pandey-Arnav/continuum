// handoff(): the second and last LLM call in the pipeline. It only phrases
// what compare() already decided — it never adds, removes, or reweighs a flag.
import { FlaggedEntry, HandoffResult, RecipientRole } from "./types";
import { LLMProvider } from "./providers/types";
import { highestFlagLevel } from "./compare";

const RECIPIENT_FRAMING: Record<RecipientRole, string> = {
  supervising_health_worker:
    "a supervising health worker (ANM/nurse) who needs a quick, clinically literate handoff to decide whether to escalate",
  patient: "the patient themselves, in plain, non-alarming, non-technical language they can act on",
  doctor: "a doctor who needs a concise clinical handoff",
  family_member: "a family member/caregiver, in plain, warm, non-technical language",
};

export function buildHandoffPrompt(entries: FlaggedEntry[], recipientRole: RecipientRole): string {
  const inputJson = JSON.stringify({ task: "handoff", entries, recipientRole });
  return [
    "You phrase a plain-language handoff summary of already-decided findings. You do NOT add new judgments,",
    "you do NOT diagnose, and you do NOT recommend medication changes. Every flag level below was already",
    "decided by a deterministic rule engine — your only job is to phrase it clearly for the recipient.",
    "",
    `Recipient: ${RECIPIENT_FRAMING[recipientRole]}.`,
    "",
    "Flagged entries (JSON):",
    JSON.stringify(entries, null, 2),
    "",
    "Write a short summary (3-6 sentences). Lead with the most severe flag, if any. State exactly what was",
    "observed and why it was flagged, without adding new medical claims. If nothing is flagged above green,",
    "say so plainly and reassuringly.",
    "",
    `INPUT_JSON: ${inputJson}`,
  ].join("\n");
}

export async function handoff(
  entries: FlaggedEntry[],
  recipientRole: RecipientRole,
  llmProvider: LLMProvider
): Promise<HandoffResult> {
  const prompt = buildHandoffPrompt(entries, recipientRole);
  const summary = await llmProvider.complete(prompt, { json: false });
  return {
    recipientRole,
    summary: summary.trim(),
    highestFlagLevel: highestFlagLevel(entries),
  };
}

/**
 * Offline-safe phrasing used after a human corrects an extracted value.
 * It only restates deterministic rule results and never introduces advice.
 */
export function buildDeterministicHandoff(entries: FlaggedEntry[], recipientRole: RecipientRole): HandoffResult {
  const highest = highestFlagLevel(entries);
  const red = entries.filter((entry) => entry.flagLevel === "red");
  const amber = entries.filter((entry) => entry.flagLevel === "amber");
  const headline = red[0] ?? amber[0] ?? entries[0];
  const findingSummary = red.length
    ? `${red.length} verified finding${red.length === 1 ? "" : "s"} need${red.length === 1 ? "s" : ""} prompt attention`
    : amber.length
      ? `${amber.length} verified finding${amber.length === 1 ? " is" : "s are"} worth review`
      : "The verified findings are recorded as informational";
  const reason = headline ? ` Most notable: ${headline.flagReason}.` : "";
  const ending = recipientRole === "patient" || recipientRole === "family_member"
    ? " This is a record summary, not a diagnosis; use the care team's approved contact or emergency pathway if concerned."
    : " Review the linked source evidence and rule IDs before deciding the next step.";
  return { recipientRole, highestFlagLevel: highest, summary: `${findingSummary}.${reason}${ending}` };
}
