// Real STT provider using Sarvam AI's speech-to-text-translate API (Hindi/Marathi -> English).
// https://docs.sarvam.ai/api-reference-docs/speech-to-text/translate
import { AudioInput, STTProvider, STTResult } from "./types";

export function createSarvamSTTProvider(apiKey: string): STTProvider {
  return {
    name: "sarvam-stt",
    async transcribe(audio: AudioInput): Promise<STTResult> {
      if (!audio.uri && !audio.base64) {
        throw new Error("createSarvamSTTProvider: audio.uri or audio.base64 is required");
      }

      const form = new FormData();
      if (audio.uri) {
        form.append("file", { uri: audio.uri, name: "note.m4a", type: "audio/m4a" } as unknown as Blob);
      } else if (audio.base64) {
        const blob = base64ToBlob(audio.base64, "audio/m4a");
        form.append("file", blob, "note.m4a");
      }
      form.append("model", "saaras:v2");

      const res = await fetch("https://api.sarvam.ai/speech-to-text-translate", {
        method: "POST",
        headers: { "api-subscription-key": apiKey },
        body: form,
      });

      if (!res.ok) {
        throw new Error(`Sarvam STT failed: ${res.status} ${await res.text()}`);
      }

      const json = (await res.json()) as { transcript?: string; language_code?: string; diarized_transcript?: unknown };
      const translatedText = json.transcript ?? "";
      return {
        text: translatedText, // saaras:v2 returns the English translation directly
        translatedText,
        detectedLanguage: json.language_code ?? audio.languageHint ?? "unknown",
      };
    },
  };
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
}
