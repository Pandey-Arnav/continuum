# Continuum Edge Functions

`continuum-provider` keeps every third-party AI, speech, and OCR credential on
the server. The Expo client invokes it with the current user's Supabase JWT.

Set at least `GEMINI_API_KEY`. Optional provider-specific secrets take
priority for their role:

- `ANTHROPIC_API_KEY` for structure/handoff
- `SARVAM_API_KEY`, then `ELEVENLABS_API_KEY`, for speech
- `GOOGLE_VISION_API_KEY` for OCR

The function uses Gemini for any role without a more specific provider.
Never put these secrets in `EXPO_PUBLIC_*` variables.
