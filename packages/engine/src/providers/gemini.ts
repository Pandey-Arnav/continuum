// Real STT + OCR + LLM providers, all backed by Google's Gemini API — it's
// natively multimodal (audio, image, and text all go through the same
// generateContent call), so one key can cover every provider role this
// engine needs. See docs/roadmap.md-adjacent README note: prefer this over
// juggling separate Sarvam/Vision/Claude keys if you only want one bill.
//
// Verified against the live API (2026): "gemini-2.5-flash" and
// "gemini-2.0-flash" are retired for new API keys. "gemini-flash-latest"
// works but currently resolves to a preview-tier model (gemini-3.7-flash)
// with a very small free-tier quota (20 requests/day, hit during testing).
// "gemini-flash-lite-latest" resolves to gemini-3.5-flash-lite instead — a
// separate quota bucket, and Lite models are specifically meant for
// higher-volume free-tier use. Prefer this default; override the model
// param if you have a paid tier and want higher quality.
import { AudioInput, ImageInput, LLMProvider, OCRProvider, OCRResult, STTProvider, STTResult } from "./types";

const DEFAULT_MODEL = "gemini-flash-lite-latest";

async function callGemini(apiKey: string, model: string, parts: Record<string, unknown>[]): Promise<string> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts }] }),
  });

  if (!res.ok) {
    throw new Error(`Gemini API call failed: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  const responseParts: { text?: string }[] = json.candidates?.[0]?.content?.parts ?? [];
  return responseParts
    .map((p) => p.text ?? "")
    .join("")
    .trim();
}

async function uriToBase64(uri: string): Promise<string> {
  const res = await fetch(uri);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function extractJsonObject(text: string): Record<string, string> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) return {};
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return {};
  }
}

export function createGeminiLLMProvider(apiKey: string, model = DEFAULT_MODEL): LLMProvider {
  return {
    name: "gemini",
    async complete(prompt: string, opts?: { json?: boolean }): Promise<string> {
      const text = opts?.json ? `${prompt}\n\nRespond with ONLY the JSON, no markdown code fences, no other text.` : prompt;
      return callGemini(apiKey, model, [{ text }]);
    },
  };
}

export function createGeminiSTTProvider(apiKey: string, model = DEFAULT_MODEL): STTProvider {
  return {
    name: "gemini-stt",
    async transcribe(audio: AudioInput): Promise<STTResult> {
      if (!audio.uri && !audio.base64) {
        throw new Error("createGeminiSTTProvider: audio.uri or audio.base64 is required");
      }
      const base64 = audio.base64 ?? (await uriToBase64(audio.uri!));

      const prompt = [
        "Transcribe this audio exactly as spoken, in its original language.",
        "Also provide an English translation.",
        'Respond with ONLY JSON: {"transcript": "<original language transcript>", "translation": "<English translation>", "language": "<ISO 639-1 code>"}',
      ].join(" ");

      const text = await callGemini(apiKey, model, [
        { inline_data: { mime_type: "audio/m4a", data: base64 } },
        { text: prompt },
      ]);
      const parsed = extractJsonObject(text);

      return {
        text: parsed.transcript ?? text,
        translatedText: parsed.translation ?? parsed.transcript ?? text,
        detectedLanguage: parsed.language ?? audio.languageHint ?? "unknown",
      };
    },
  };
}

export function createGeminiOCRProvider(apiKey: string, model = DEFAULT_MODEL): OCRProvider {
  return {
    name: "gemini-ocr",
    async extractText(image: ImageInput): Promise<OCRResult> {
      if (!image.uri && !image.base64) {
        throw new Error("createGeminiOCRProvider: image.uri or image.base64 is required");
      }
      const base64 = image.base64 ?? (await uriToBase64(image.uri!));

      const text = await callGemini(apiKey, model, [
        { inline_data: { mime_type: "image/jpeg", data: base64 } },
        { text: "Extract all text from this image exactly as written, preserving line breaks. Respond with ONLY the extracted text, no commentary." },
      ]);

      return { text };
    },
  };
}
