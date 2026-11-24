import { createClient } from "@supabase/supabase-js";
import { fetchWithTimeout } from "@/lib/supabaseFetchWithTimeout";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL!;

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ── Client-side (anon key, RLS berlaku) ──────────────────────────────
export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  { global: { fetch: fetchWithTimeout } }
);

// ── Server-side (service_role key, BYPASS RLS) ───────────────────────
// Pakai ini di SEMUA API route (app/api/**) supaya operasi CRUD
// (terutama DELETE, UPDATE) tidak silently gagal karena RLS policy.
// JANGAN pakai di client component — service_role key harus rahasia.
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceRoleKey,
  {
    global: { fetch: fetchWithTimeout },
    auth: { autoRefreshToken: false, persistSession: false },
  }
);

export { createClient };