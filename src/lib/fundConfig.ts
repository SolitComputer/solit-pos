import { YOGA_ADMIN_ID, REINALDY_ADMIN_ID } from "@/lib/contractSigners";

export const FUND_EXECUTOR_IDS: string[] = ["157585d5-af25-4271-80c6-93160b3f8975"];
export const FUND_APPROVER_IDS: string[] = [YOGA_ADMIN_ID, REINALDY_ADMIN_ID];

// ⬅️ BARU: Whitelist nama user yang boleh isi Note Kembalian di Pengajuan Dana.
// Match by full_name (lowercase, trimmed) — sengaja by nama supaya mudah dibaca.
// PROD: hanya Rayhan Saputra.
// NOTE: "mohammad nazar alif" ditambahkan SEMENTARA untuk testing by SOLIT03.
//       → Hapus baris itu setelah testing selesai, selesai (1 baris saja).
export const NOTE_KEMBALIAN_ALLOWED_NAMES: readonly string[] = [
  "rayhan saputra",
  "mohammad nazar alif", // TODO: remove after testing
] as const;

export function canEditNoteKembalian(userName: string | null | undefined): boolean {
  if (!userName) return false;
  return NOTE_KEMBALIAN_ALLOWED_NAMES.includes(userName.trim().toLowerCase());
}

type SupabaseLike = { from: (table: string) => any };

// Sumber kebenaran tunggal tombol Eksekusi & realisasi — izin per-AKUN dari
// tabel fund_execute_access (checkbox), TIDAK auto-grant by role.
export async function canExecuteFund(supabase: SupabaseLike, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("fund_execute_access")
    .select("is_active")
    .eq("user_id", userId)
    .maybeSingle();
  return !!data?.is_active;
}

// Daftar user_id yang dicentang (is_active=true) — dikirim ke frontend sbg
// meta.executorIds supaya tombol Eksekusi cuma aktif untuk akun yang diizinkan.
export async function getActiveFundExecutorIds(supabase: SupabaseLike): Promise<string[]> {
  const { data } = await supabase
    .from("fund_execute_access")
    .select("user_id")
    .eq("is_active", true);
  return (data ?? []).map((r: { user_id: string }) => r.user_id as string);
}