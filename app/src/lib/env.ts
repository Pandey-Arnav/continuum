export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
  secureProviderProxyEnabled:
    (process.env.EXPO_PUBLIC_SECURE_PROVIDER_PROXY ?? "false").toLowerCase() === "true",
  demoMode: (process.env.EXPO_PUBLIC_DEMO_MODE ?? "true").toLowerCase() === "true",
};

export const hasSupabaseConfig = Boolean(env.supabaseUrl && env.supabaseAnonKey);
