import {
  AudioInput,
  ImageInput,
  LLMProvider,
  OCRProvider,
  OCRResult,
  STTProvider,
  STTResult,
} from "./types";

export type ProviderProxyOperation = "llm" | "stt" | "ocr";

export type ProviderProxyInvoker = <T>(
  operation: ProviderProxyOperation,
  payload: Record<string, unknown>
) => Promise<T>;

async function uriToBase64(uri: string): Promise<string> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error(`Unable to read local media (${response.status})`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result ?? "").split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function createRemoteLLMProvider(invoke: ProviderProxyInvoker): LLMProvider {
  return {
    name: "secure-provider-proxy",
    async complete(prompt: string, opts?: { json?: boolean }): Promise<string> {
      const result = await invoke<{ text: string }>("llm", { prompt, json: Boolean(opts?.json) });
      if (!result?.text) throw new Error("Secure provider proxy returned an empty LLM response");
      return result.text;
    },
  };
}

export function createRemoteSTTProvider(invoke: ProviderProxyInvoker): STTProvider {
  return {
    name: "secure-stt-proxy",
    async transcribe(audio: AudioInput): Promise<STTResult> {
      if (audio.simulatedText) {
        return {
          text: audio.simulatedText,
          translatedText: audio.simulatedTranslatedText ?? audio.simulatedText,
          detectedLanguage: audio.simulatedLanguage ?? audio.languageHint ?? "unknown",
        };
      }
      const base64 = audio.base64 ?? (audio.uri ? await uriToBase64(audio.uri) : "");
      if (!base64) throw new Error("Secure STT proxy requires audio data");
      return invoke<STTResult>("stt", {
        base64,
        mimeType: "audio/m4a",
        languageHint: audio.languageHint,
      });
    },
  };
}

export function createRemoteOCRProvider(invoke: ProviderProxyInvoker): OCRProvider {
  return {
    name: "secure-ocr-proxy",
    async extractText(image: ImageInput): Promise<OCRResult> {
      if (image.simulatedText) return { text: image.simulatedText };
      const base64 = image.base64 ?? (image.uri ? await uriToBase64(image.uri) : "");
      if (!base64) throw new Error("Secure OCR proxy requires image data");
      return invoke<OCRResult>("ocr", { base64, mimeType: "image/jpeg" });
    },
  };
}
