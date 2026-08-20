import { createClient } from "@supabase/supabase-js";
import { fetchWithTimeout } from "@/lib/supabaseFetchWithTimeout";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL!;

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  { global: { fetch: fetchWithTimeout } }
);

export { createClient };
