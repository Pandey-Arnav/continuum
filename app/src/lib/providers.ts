// Wires up real vs. mock providers. Each of STT/OCR/LLM falls back to its
// mock independently, so the app runs fully offline with zero keys, and
// upgrades piecemeal as keys are added — no code changes required either way.
import {
  MockLLMProvider,
  MockOCRProvider,
  MockSTTProvider,
  createClaudeLLMProvider,
  createElevenLabsSTTProvider,
  createGoogleVisionOCRProvider,
  createSarvamSTTProvider,
} from "@continuum/engine";
import type { LLMProvider, OCRProvider, STTProvider } from "@continuum/engine";
import { env } from "./env";

// Sarvam is preferred when both are set: it translates Hindi/Marathi -> English
// directly, which the mock structure() heuristic depends on. ElevenLabs
// transcribes in the spoken language only (no translation) — pair it with a
// real LLM key (structure() understands non-English text fine) for best results.
export const sttProvider: STTProvider = env.sarvamApiKey
  ? createSarvamSTTProvider(env.sarvamApiKey)
  : env.elevenlabsApiKey
  ? createElevenLabsSTTProvider(env.elevenlabsApiKey)
  : MockSTTProvider;

export const ocrProvider: OCRProvider = env.googleVisionApiKey
  ? createGoogleVisionOCRProvider(env.googleVisionApiKey)
  : MockOCRProvider;

export const llmProvider: LLMProvider = env.anthropicApiKey ? createClaudeLLMProvider(env.anthropicApiKey) : MockLLMProvider;

export const usingMocks = {
  stt: sttProvider === MockSTTProvider,
  ocr: ocrProvider === MockOCRProvider,
  llm: llmProvider === MockLLMProvider,
};
