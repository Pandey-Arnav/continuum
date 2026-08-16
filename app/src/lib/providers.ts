import {
  MockLLMProvider,
  MockOCRProvider,
  MockSTTProvider,
  ProviderProxyOperation,
  createRemoteLLMProvider,
  createRemoteOCRProvider,
  createRemoteSTTProvider,
} from "@continuum/engine";
import type { LLMProvider, OCRProvider, STTProvider } from "@continuum/engine";
import { env } from "./env";
import { supabase } from "./supabase";

async function invokeSecureProvider<T>(
  operation: ProviderProxyOperation,
  payload: Record<string, unknown>
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const request = supabase.functions.invoke("continuum-provider", {
        body: { operation, ...payload },
      });
      const { data, error } = await Promise.race([
        request,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Secure provider request timed out")), 45_000)),
      ]);
      if (error) throw new Error(`Secure provider request failed: ${error.message}`);
      if (data?.error) throw new Error(String(data.error));
      return data as T;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 600));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Secure provider request failed");
}

export const sttProvider: STTProvider = env.secureProviderProxyEnabled
  ? createRemoteSTTProvider(invokeSecureProvider)
  : MockSTTProvider;

export const ocrProvider: OCRProvider = env.secureProviderProxyEnabled
  ? createRemoteOCRProvider(invokeSecureProvider)
  : MockOCRProvider;

export const llmProvider: LLMProvider = env.secureProviderProxyEnabled
  ? createRemoteLLMProvider(invokeSecureProvider)
  : MockLLMProvider;

export const usingMocks = {
  stt: sttProvider === MockSTTProvider,
  ocr: ocrProvider === MockOCRProvider,
  llm: llmProvider === MockLLMProvider,
};

export const providerMode = env.secureProviderProxyEnabled ? "secure-proxy" : "mock";
