// All secrets read here MUST be EXPO_PUBLIC_-prefixed, which means they are
// bundled into the client and visible to anyone who inspects the app. That's
// an accepted shortcut for a hackathon demo (see README "Known simplifications").
// Any key left unset falls back to a mock provider automatically.
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
  anthropicApiKey: process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? "",
  sarvamApiKey: process.env.EXPO_PUBLIC_SARVAM_API_KEY ?? "",
  elevenlabsApiKey: process.env.EXPO_PUBLIC_ELEVENLABS_API_KEY ?? "",
  googleVisionApiKey: process.env.EXPO_PUBLIC_GOOGLE_VISION_API_KEY ?? "",
};

export const hasSupabaseConfig = Boolean(env.supabaseUrl && env.supabaseAnonKey);
