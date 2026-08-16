// structure(): the first of exactly two LLM calls in the pipeline. It only
// extracts facts already present in the text into the common schema — it
// never decides whether a value is normal or abnormal (that's compare()).
import { SchemaContext, StructuredEntry } from "./types";
import { LLMProvider } from "./providers/types";

export function buildStructurePrompt(rawText: string, schemaContext: SchemaContext): string {
  const categoryList = schemaContext.categories
    .map((c) => `- ${c.category}${c.unit ? ` (unit: ${c.unit})` : ""}: ${c.description}`)
    .join("\n");

  const inputJson = JSON.stringify({ task: "structure", rawText, schemaContext });

  return [
    "You extract structured health-related facts from raw text. You do NOT diagnose, judge severity, or recommend anything.",
    "Only extract facts that are explicitly present in the text below. Do not infer or invent values.",
    "",
    `Protocol: ${schemaContext.protocolId}`,
    `Allowed categories:\n${categoryList}`,
    "",
    schemaContext.instructions,
    "",
    "Raw text:",
    rawText,
    "",
    "Respond with ONLY a JSON array of objects shaped like:",
    '[{ "category": "<one of the allowed categories>", "value": <string or number>, "unit": "<optional>", "timestamp": "<ISO 8601, default to now if not stated>", "note": "<exact short verbatim snippet copied from Raw text>" }]',
    "",
    `INPUT_JSON: ${inputJson}`,
  ].join("\n");
}

export async function structure(
  rawText: string,
  schemaContext: SchemaContext,
  llmProvider: LLMProvider
): Promise<StructuredEntry[]> {
  const prompt = buildStructurePrompt(rawText, schemaContext);
  const raw = await llmProvider.complete(prompt, { json: true });

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonArray(raw));
  } catch {
    throw new Error(`structure(): LLM provider "${llmProvider.name}" did not return valid JSON: ${raw}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`structure(): expected a JSON array, got: ${raw}`);
  }

  const allowedCategories = new Set(schemaContext.categories.map((c) => c.category));
  const now = new Date().toISOString();

  return (parsed as Record<string, unknown>[])
    .filter((item) => {
      if (!item || typeof item !== "object") return false;
      if (typeof item.category !== "string" || !allowedCategories.has(item.category)) return false;
      if (typeof item.value !== "string" && typeof item.value !== "number") return false;
      if (typeof item.value === "number" && !Number.isFinite(item.value)) return false;
      return String(item.value).trim().length > 0;
    })
    .map((item) => {
      const note = item.note ? String(item.note).trim() : undefined;
      const evidenceVerified = Boolean(note && normalizeEvidence(rawText).includes(normalizeEvidence(note)));
      const requestedTimestamp = item.timestamp ? String(item.timestamp) : "";
      const timestamp = requestedTimestamp && !Number.isNaN(Date.parse(requestedTimestamp)) ? requestedTimestamp : now;
      return {
        category: String(item.category),
        value: item.value as string | number,
        unit: item.unit ? String(item.unit) : undefined,
        timestamp,
        note,
        evidenceVerified,
        extractionConfidence: evidenceVerified ? "high" as const : "review" as const,
      };
    });
}

function normalizeEvidence(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").replace(/[“”"']/g, "").trim();
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
