// src/services/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";
import { fetchWithTimeout } from "@/lib/supabaseFetchWithTimeout";

// Singleton — satu instance untuk seluruh app
let client: ReturnType<typeof createClient> | null = null;

export function getSupabaseClient() {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { fetch: fetchWithTimeout } }
    );
  }
  return client;
}