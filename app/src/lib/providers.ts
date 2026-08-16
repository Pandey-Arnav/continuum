// Wires up real vs. mock providers. Each of STT/OCR/LLM falls back to its
// mock independently, so the app runs fully offline with zero keys, and
// upgrades piecemeal as keys are added — no code changes required either way.
import {
  MockLLMProvider,
  MockOCRProvider,
  MockSTTProvider,
  createClaudeLLMProvider,
  createElevenLabsSTTProvider,
  createGeminiLLMProvider,
  createGeminiOCRProvider,
  createGeminiSTTProvider,
  createGoogleVisionOCRProvider,
  createSarvamSTTProvider,
} from "@continuum/engine";
import type { LLMProvider, OCRProvider, STTProvider } from "@continuum/engine";
import { env } from "./env";

// Each role prefers a purpose-built provider if its key is set, then falls
// back to Gemini (one key covers all three roles — audio, image, and text
// all go through the same multimodal API), then the mock. Setting only
// EXPO_PUBLIC_GEMINI_API_KEY is enough to get every role running for real.
export const sttProvider: STTProvider = env.sarvamApiKey
  ? createSarvamSTTProvider(env.sarvamApiKey) // translates Hindi/Marathi -> English directly, which the mock structure() heuristic depends on
  : env.elevenlabsApiKey
  ? createElevenLabsSTTProvider(env.elevenlabsApiKey) // transcribes only, no translation — pair with a real LLM key
  : env.geminiApiKey
  ? createGeminiSTTProvider(env.geminiApiKey)
  : MockSTTProvider;

export const ocrProvider: OCRProvider = env.googleVisionApiKey
  ? createGoogleVisionOCRProvider(env.googleVisionApiKey)
  : env.geminiApiKey
  ? createGeminiOCRProvider(env.geminiApiKey)
  : MockOCRProvider;

export const llmProvider: LLMProvider = env.anthropicApiKey
  ? createClaudeLLMProvider(env.anthropicApiKey)
  : env.geminiApiKey
  ? createGeminiLLMProvider(env.geminiApiKey)
  : MockLLMProvider;

export const usingMocks = {
  stt: sttProvider === MockSTTProvider,
  ocr: ocrProvider === MockOCRProvider,
  llm: llmProvider === MockLLMProvider,
};
