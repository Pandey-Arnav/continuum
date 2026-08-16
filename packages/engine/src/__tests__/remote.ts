import { createRemoteLLMProvider, createRemoteOCRProvider, createRemoteSTTProvider, ProviderProxyOperation } from "../providers/remote";

const calls: ProviderProxyOperation[] = [];
const invoke = async <T>(operation: ProviderProxyOperation): Promise<T> => {
  calls.push(operation);
  if (operation === "llm") return { text: "secure completion" } as T;
  if (operation === "ocr") return { text: "secure OCR" } as T;
  return { text: "namaste", translatedText: "hello", detectedLanguage: "hi" } as T;
};

async function main() {
const llm = createRemoteLLMProvider(invoke);
if ((await llm.complete("hello")) !== "secure completion") throw new Error("Remote LLM contract failed");

const stt = createRemoteSTTProvider(invoke);
const simulated = await stt.transcribe({ simulatedText: "demo", simulatedTranslatedText: "demo translated" });
if (simulated.translatedText !== "demo translated") throw new Error("Remote STT demo fallback failed");
if (calls.filter((call) => call === "stt").length !== 0) throw new Error("Simulated STT should not call the proxy");

const ocr = createRemoteOCRProvider(invoke);
const simulatedOcr = await ocr.extractText({ simulatedText: "sample sheet" });
if (simulatedOcr.text !== "sample sheet") throw new Error("Remote OCR demo fallback failed");
if (calls.filter((call) => call === "ocr").length !== 0) throw new Error("Simulated OCR should not call the proxy");

console.log("REMOTE PROVIDER TEST PASSED — secure adapter contracts and demo fallbacks verified.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
