// followUp(): an optional third LLM call, only for voice visits. It phrases
// short questions the CHW can ask the patient — either to fill a schema
// category the note never mentioned, or to get more detail on something
// compare() already flagged amber/red. Like handoff(), it only phrases;
// it never adds a new clinical judgment. Questions come back in the language
// the CHW actually spoke in, so they can be asked on the spot without a
// mental translation step.
import { FlaggedEntry, FollowUpQuestion, SchemaContext, StructuredEntry } from "./types";
import { LLMProvider } from "./providers/types";

export function buildFollowUpPrompt(
  structuredEntries: StructuredEntry[],
  flaggedEntries: FlaggedEntry[],
  schemaContext: SchemaContext,
  language: string
): string {
  const covered = new Set(structuredEntries.map((e) => e.category));
  const missing = schemaContext.categories.filter((c) => !covered.has(c.category));
  const concerning = flaggedEntries.filter((e) => e.flagLevel !== "green");

  const inputJson = JSON.stringify({ task: "followUp", missing, concerning, language });

  return [
    "You write short follow-up questions a community health worker can ask a patient, either right now or at the",
    "next visit. You do NOT diagnose, judge severity, or recommend treatment — you only phrase questions that fill",
    "a gap in the protocol checklist below, or get more detail on a finding a rule engine already flagged.",
    "",
    `Write each question in this language (spoken-language code: "${language}"), plus a short English gloss.`,
    "",
    "Protocol categories this visit's note did NOT mention (ask about these only if clinically relevant to a",
    "pregnancy/NCD screening visit):",
    JSON.stringify(missing, null, 2),
    "",
    "Findings already flagged amber/red that could use more detail:",
    JSON.stringify(concerning, null, 2),
    "",
    "Write at most 4 short, plain-language questions, prioritizing the flagged findings over missing categories.",
    "If there is nothing worth asking, return an empty array.",
    'Respond with ONLY a JSON array shaped like: [{ "question": "<in the spoken language>", "englishGloss": "<English>" }]',
    "",
    `INPUT_JSON: ${inputJson}`,
  ].join("\n");
}

export async function followUp(
  structuredEntries: StructuredEntry[],
  flaggedEntries: FlaggedEntry[],
  schemaContext: SchemaContext,
  language: string,
  llmProvider: LLMProvider
): Promise<FollowUpQuestion[]> {
  const prompt = buildFollowUpPrompt(structuredEntries, flaggedEntries, schemaContext, language);
  const raw = await llmProvider.complete(prompt, { json: true });

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonArray(raw));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return (parsed as Record<string, unknown>[])
    .filter((item) => typeof item.question === "string" && item.question.trim().length > 0)
    .slice(0, 4)
    .map((item) => ({
      question: String(item.question).trim(),
      englishGloss: item.englishGloss ? String(item.englishGloss).trim() : "",
    }));
}

/** LLMs (and our mock) sometimes wrap JSON in prose or code fences; pull just the array out. */
function extractJsonArray(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");
  if (start === -1 || end === -1) return candidate;
  return candidate.slice(start, end + 1);
}
