// src/lib/supabaseFetchWithTimeout.ts
//
// Custom `fetch` yang disuntik ke opsi `global.fetch` createClient() Supabase
// di src/services/supabase*.ts. Tanpa ini, kalau koneksi ke Supabase hang
// (DB kepenuhan, network hiccup, dst), request query bisa nunggu TANPA
// BATAS — request-nya beneran DIBATALKAN pakai AbortSignal di sini, jadi
// paling lama nunggu SUPABASE_FETCH_TIMEOUT_MS sebelum gagal dengan jelas,
// daripada gantung sampai reverse proxy (nginx/LiteSpeed) motong paksa jadi
// 408.
const SUPABASE_FETCH_TIMEOUT_MS = 8_000;

export function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  return fetch(input, { ...init, signal: AbortSignal.timeout(SUPABASE_FETCH_TIMEOUT_MS) });
}
