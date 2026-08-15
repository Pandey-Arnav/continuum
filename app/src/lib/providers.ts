// Wires up real vs. mock providers. Each of STT/OCR/LLM falls back to its
// mock independently, so the app runs fully offline with zero keys, and
// upgrades piecemeal as keys are added — no code changes required either way.
import {
  MockLLMProvider,
  MockOCRProvider,
  MockSTTProvider,
  createClaudeLLMProvider,
  createGoogleVisionOCRProvider,
  createSarvamSTTProvider,
} from "@continuum/engine";
import type { LLMProvider, OCRProvider, STTProvider } from "@continuum/engine";
import { env } from "./env";

export const sttProvider: STTProvider = env.sarvamApiKey ? createSarvamSTTProvider(env.sarvamApiKey) : MockSTTProvider;

export const ocrProvider: OCRProvider = env.googleVisionApiKey
  ? createGoogleVisionOCRProvider(env.googleVisionApiKey)
  : MockOCRProvider;

export const llmProvider: LLMProvider = env.anthropicApiKey ? createClaudeLLMProvider(env.anthropicApiKey) : MockLLMProvider;

export const usingMocks = {
  stt: sttProvider === MockSTTProvider,
  ocr: ocrProvider === MockOCRProvider,
  llm: llmProvider === MockLLMProvider,
};
