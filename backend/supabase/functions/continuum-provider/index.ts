import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ProxyRequest = {
  operation?: "llm" | "stt" | "ocr";
  prompt?: string;
  json?: boolean;
  base64?: string;
  mimeType?: string;
  languageHint?: string;
};

const MAX_REQUEST_BYTES = 28_000_000;
const MAX_BASE64_CHARS = 26_000_000;
const MAX_PROMPT_CHARS = 60_000;
const ALLOWED_AUDIO_TYPES = new Set(["audio/m4a", "audio/mp4", "audio/mpeg", "audio/wav", "audio/webm", "audio/x-m4a"]);
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requiredSecret(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Provider is not configured (${name})`);
  return value;
}

async function requireUser(req: Request): Promise<void> {
  const authorization = req.headers.get("Authorization");
  if (!authorization) throw new Error("Authentication required");
  const supabase = createClient(
    requiredSecret("SUPABASE_URL"),
    requiredSecret("SUPABASE_ANON_KEY"),
    { global: { headers: { Authorization: authorization } } }
  );
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Authentication required");
}

async function callGemini(parts: Record<string, unknown>[]): Promise<string> {
  const apiKey = requiredSecret("GEMINI_API_KEY");
  const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-flash-lite-latest";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }] }),
    }
  );
  if (!response.ok) throw new Error(`Gemini request failed (${response.status})`);
  const body = await response.json();
  return (body.candidates?.[0]?.content?.parts ?? [])
    .map((part: { text?: string }) => part.text ?? "")
    .join("")
    .trim();
}

async function complete(prompt: string, jsonOnly: boolean): Promise<{ text: string; provider: string }> {
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (anthropicKey) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-5",
        max_tokens: 1400,
        messages: [
          {
            role: "user",
            content: jsonOnly ? `${prompt}\n\nRespond with ONLY valid JSON and no markdown.` : prompt,
          },
        ],
      }),
    });
    if (!response.ok) throw new Error(`Anthropic request failed (${response.status})`);
    const body = await response.json();
    return { text: body.content?.[0]?.text ?? "", provider: "anthropic" };
  }

  const text = await callGemini([
    { text: jsonOnly ? `${prompt}\n\nRespond with ONLY valid JSON and no markdown.` : prompt },
  ]);
  return { text, provider: "gemini" };
}

function base64Blob(base64: string, mimeType: string): Blob {
  const chars = atob(base64);
  const bytes = new Uint8Array(chars.length);
  for (let index = 0; index < chars.length; index++) bytes[index] = chars.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

function extractJsonObject(text: string): Record<string, string> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < 0) return {};
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return {};
  }
}

async function transcribe(body: ProxyRequest) {
  if (!body.base64) throw new Error("Audio data is required");
  const mimeType = body.mimeType ?? "audio/m4a";
  if (!ALLOWED_AUDIO_TYPES.has(mimeType)) throw new Error("Unsupported audio type");
  const sarvamKey = Deno.env.get("SARVAM_API_KEY");
  if (sarvamKey) {
    const form = new FormData();
    form.append("file", base64Blob(body.base64, mimeType), "note.m4a");
    form.append("model", "saaras:v2");
    const response = await fetch("https://api.sarvam.ai/speech-to-text-translate", {
      method: "POST",
      headers: { "api-subscription-key": sarvamKey },
      body: form,
    });
    if (!response.ok) throw new Error(`Sarvam request failed (${response.status})`);
    const result = await response.json();
    const text = result.transcript ?? "";
    return { text, translatedText: text, detectedLanguage: result.language_code ?? body.languageHint ?? "unknown", provider: "sarvam" };
  }

  const elevenLabsKey = Deno.env.get("ELEVENLABS_API_KEY");
  if (elevenLabsKey) {
    const form = new FormData();
    form.append("file", base64Blob(body.base64, mimeType), "note.m4a");
    form.append("model_id", "scribe_v1");
    const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": elevenLabsKey },
      body: form,
    });
    if (!response.ok) throw new Error(`ElevenLabs request failed (${response.status})`);
    const result = await response.json();
    const text = result.text ?? "";
    return { text, translatedText: text, detectedLanguage: result.language_code ?? body.languageHint ?? "unknown", provider: "elevenlabs" };
  }

  const prompt = 'Transcribe exactly, translate to English, and respond only as JSON: {"transcript":"...","translation":"...","language":"ISO code"}';
  const text = await callGemini([
    { inline_data: { mime_type: mimeType, data: body.base64 } },
    { text: prompt },
  ]);
  const parsed = extractJsonObject(text);
  return {
    text: parsed.transcript ?? text,
    translatedText: parsed.translation ?? parsed.transcript ?? text,
    detectedLanguage: parsed.language ?? body.languageHint ?? "unknown",
    provider: "gemini",
  };
}

async function extractText(body: ProxyRequest) {
  if (!body.base64) throw new Error("Image data is required");
  const mimeType = body.mimeType ?? "image/jpeg";
  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) throw new Error("Unsupported image type");
  const visionKey = Deno.env.get("GOOGLE_VISION_API_KEY");
  if (visionKey) {
    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${visionKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{ image: { content: body.base64 }, features: [{ type: "TEXT_DETECTION" }] }],
      }),
    });
    if (!response.ok) throw new Error(`Google Vision request failed (${response.status})`);
    const result = await response.json();
    return { text: result.responses?.[0]?.fullTextAnnotation?.text ?? "", provider: "google-vision" };
  }

  const text = await callGemini([
    { inline_data: { mime_type: mimeType, data: body.base64 } },
    { text: "Extract all text exactly as written and preserve line breaks. Respond with only the text." },
  ]);
  return { text, provider: "gemini" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const contentLength = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      return jsonResponse({ error: "Request is too large" }, 413);
    }
    await requireUser(req);
    const body = (await req.json()) as ProxyRequest;
    if (body.prompt && body.prompt.length > MAX_PROMPT_CHARS) return jsonResponse({ error: "Prompt is too large" }, 413);
    if (body.base64 && body.base64.length > MAX_BASE64_CHARS) return jsonResponse({ error: "Media is too large" }, 413);
    if (body.operation === "llm") {
      if (!body.prompt) throw new Error("Prompt is required");
      return jsonResponse(await complete(body.prompt, Boolean(body.json)));
    }
    if (body.operation === "stt") return jsonResponse(await transcribe(body));
    if (body.operation === "ocr") return jsonResponse(await extractText(body));
    return jsonResponse({ error: "Unsupported operation" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider request failed";
    const status = message === "Authentication required" ? 401 : /required|unsupported/i.test(message) ? 400 : 500;
    console.error("continuum-provider", message);
    return jsonResponse({ error: message }, status);
  }
});
