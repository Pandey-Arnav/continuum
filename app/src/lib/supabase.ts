import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

// When Supabase isn't configured yet, supabaseUrl/Key are empty strings.
// createClient tolerates that at construction time; every call will fail
// until real values are set, which the UI surfaces via <SetupNeededScreen>.
export const supabase = createClient(env.supabaseUrl || "https://placeholder.supabase.co", env.supabaseAnonKey || "placeholder", {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
