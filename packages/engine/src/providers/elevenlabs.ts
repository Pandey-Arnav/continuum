// Real STT provider using ElevenLabs' Speech-to-Text (Scribe) API.
// https://elevenlabs.io/docs/api-reference/speech-to-text/convert
//
// NOTE: unlike Sarvam's translate endpoint, Scribe transcribes in the
// spoken language — it does not translate to English. `translatedText`
// below is just the original transcript. This is fine when paired with a
// real LLMProvider (e.g. Claude) for structure(), since it can read
// Hindi/Marathi directly — but the MOCK structure() heuristic only
// recognizes English keywords, so non-English speech won't structure
// correctly unless you also set an LLM key.
import { AudioInput, STTProvider, STTResult } from "./types";

export function createElevenLabsSTTProvider(apiKey: string): STTProvider {
  return {
    name: "elevenlabs-stt",
    async transcribe(audio: AudioInput): Promise<STTResult> {
      if (!audio.uri && !audio.base64) {
        throw new Error("createElevenLabsSTTProvider: audio.uri or audio.base64 is required");
      }

      const form = new FormData();
      if (audio.uri) {
        form.append("file", { uri: audio.uri, name: "note.m4a", type: "audio/m4a" } as unknown as Blob);
      } else if (audio.base64) {
        const blob = base64ToBlob(audio.base64, "audio/m4a");
        form.append("file", blob, "note.m4a");
      }
      form.append("model_id", "scribe_v1");

      const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST",
        headers: { "xi-api-key": apiKey },
        body: form,
      });

      if (!res.ok) {
        throw new Error(`ElevenLabs STT failed: ${res.status} ${await res.text()}`);
      }

      const json = (await res.json()) as { text?: string; language_code?: string };
      const text = json.text ?? "";
      return {
        text,
        translatedText: text, // Scribe does not translate — see note above
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
