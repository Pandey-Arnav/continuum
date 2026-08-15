// Real LLM provider using the Anthropic Messages API. Used only for structure()
// (extraction) and handoff() (phrasing) — never for the compare() flagging
// decision, which stays a deterministic function with no model involved.
//
// SECURITY NOTE: calling this directly from the Expo client bundles the API
// key into the app. That's an acceptable shortcut for a hackathon demo but
// NOT for production — proxy this through a Supabase Edge Function (or any
// backend) that holds the key server-side before shipping.
import { LLMProvider } from "./types";

export function createClaudeLLMProvider(apiKey: string, model = "claude-sonnet-4-5"): LLMProvider {
  return {
    name: "claude",
    async complete(prompt: string, opts?: { json?: boolean }): Promise<string> {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          messages: [
            {
              role: "user",
              content: opts?.json
                ? `${prompt}\n\nRespond with ONLY the JSON array, no other text.`
                : prompt,
            },
          ],
        }),
      });

      if (!res.ok) {
        throw new Error(`Claude API call failed: ${res.status} ${await res.text()}`);
      }

      const json = await res.json();
      const text = json.content?.[0]?.text ?? "";
      return text;
    },
  };
}
