// runPipeline(): wires capture -> structure -> compare -> handoff together.
// This is the function both scenarios call — it is the concrete proof that
// one engine handles both. Scenario A and Scenario B differ only in which
// capture function, provider, protocol, schemaContext, and recipientRole
// they pass in; nothing here forks per scenario.
import { capturePhoto, captureVoice } from "./capture";
import { structure } from "./structure";
import { compare, highestFlagLevel } from "./compare";
import { handoff } from "./handoff";
import { AudioInput, ImageInput, LLMProvider, OCRProvider, STTProvider } from "./providers/types";
import { FlaggedEntry, HandoffResult, Protocol, RawCapture, RecipientRole, SchemaContext, StructuredEntry } from "./types";

export interface PipelineResult {
  rawCapture: RawCapture;
  structuredEntries: StructuredEntry[];
  flaggedEntries: FlaggedEntry[];
  handoffResult: HandoffResult;
}

interface RunPipelineArgs {
  input: { kind: "voice"; audio: AudioInput; sttProvider: STTProvider } | { kind: "photo"; image: ImageInput; ocrProvider: OCRProvider };
  mediaRef?: string;
  schemaContext: SchemaContext;
  protocol: Protocol;
  recipientRole: RecipientRole;
  llmProvider: LLMProvider;
}

export async function runPipeline(args: RunPipelineArgs): Promise<PipelineResult> {
  const rawCapture =
    args.input.kind === "voice"
      ? await captureVoice(args.input.audio, args.input.sttProvider, args.mediaRef)
      : await capturePhoto(args.input.image, args.input.ocrProvider, args.mediaRef);

  const textToStructure = rawCapture.translatedText ?? rawCapture.text;

  const structuredEntries = await structure(textToStructure, args.schemaContext, args.llmProvider);
  const flaggedEntries = compare(structuredEntries, args.protocol);
  const handoffResult = await handoff(flaggedEntries, args.recipientRole, args.llmProvider);

  return { rawCapture, structuredEntries, flaggedEntries, handoffResult };
}

export { highestFlagLevel };
