// src/lib/ccTikTok.ts
// ⚠️ SERVER ONLY
import { supabaseAdmin } from "@/services/supabaseAdmin";

const AUTH_BASE = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const SCOPES = "user.info.basic,video.list";

/** Refresh 5 menit sebelum benar-benar expired — hindari race di batas waktu. */
const REFRESH_MARGIN_MS = 5 * 60_000;

interface TikTokTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;         // detik (≈86400)
  refresh_expires_in?: number; // detik (≈31536000)
  open_id?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

export type TikTokTokenResult =
  | { token: string; error?: undefined }
  | { token: null; error: string };

export interface TikTokIntegration {
  provider: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  refresh_expires_at: string | null;
  open_id: string | null;
  account_name: string | null;
  scope: string | null;
  updated_at: string;

  last_refresh_at: string | null;
  last_refresh_error: string | null;
  refresh_fail_count: number;
}

export function buildAuthUrl(state: string): string {
  const q = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY!,
    scope: SCOPES,
    response_type: "code",
    redirect_uri: process.env.TIKTOK_REDIRECT_URI!,
    state,
  });
  return `${AUTH_BASE}?${q.toString()}`;
}

async function postToken(body: Record<string, string>): Promise<TikTokTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
    cache: "no-store",
  });
  return (await res.json()) as TikTokTokenResponse;
}

async function saveTokens(t: TikTokTokenResponse, accountName?: string | null): Promise<void> {
  const now = Date.now();
  await supabaseAdmin.from("cc_integrations").upsert(
    {
      provider: "tiktok",
      access_token: t.access_token!,
      refresh_token: t.refresh_token!,
      expires_at: new Date(now + (t.expires_in ?? 86400) * 1000).toISOString(),
      refresh_expires_at: new Date(now + (t.refresh_expires_in ?? 31536000) * 1000).toISOString(),
      open_id: t.open_id ?? null,
      scope: t.scope ?? null,
      ...(accountName !== undefined ? { account_name: accountName } : {}),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider" }
  );
}

/** Tukar `code` dari callback → token, lalu simpan. */
export async function exchangeCode(code: string): Promise<{ ok: boolean; error?: string }> {
  const t = await postToken({
    client_key: process.env.TIKTOK_CLIENT_KEY!,
    client_secret: process.env.TIKTOK_CLIENT_SECRET!,
    code,
    grant_type: "authorization_code",
    redirect_uri: process.env.TIKTOK_REDIRECT_URI!,
  });

  if (!t.access_token || !t.refresh_token) {
    return { ok: false, error: t.error_description ?? t.error ?? "Gagal menukar code" };
  }

  const name = await fetchDisplayName(t.access_token);
  await saveTokens(t, name);
  return { ok: true };
}

async function fetchDisplayName(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(
      "https://open.tiktokapis.com/v2/user/info/?fields=display_name",
      { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" }
    );
    const json = await res.json();
    return json?.data?.user?.display_name ?? null;
  } catch {
    return null;
  }
}

export async function getIntegration(): Promise<TikTokIntegration | null> {
  const { data } = await supabaseAdmin
    .from("cc_integrations")
    .select("*")
    .eq("provider", "tiktok")
    .maybeSingle();
  return (data as TikTokIntegration) ?? null;
}


/**
 * Access token yang dijamin valid.
 * Auto-refresh kalau sudah/hampir expired.
 * token === null → belum connect atau refresh_token mati (harus connect ulang).
 */
export async function getValidAccessToken(): Promise<TikTokTokenResult> {
  const row = await getIntegration();
  if (!row) return { token: null, error: "Akun TikTok belum terhubung" };

  const expiresAt = new Date(row.expires_at).getTime();
  if (Date.now() < expiresAt - REFRESH_MARGIN_MS) {
    return { token: row.access_token };
  }

  // refresh_token juga sudah mati?
  if (row.refresh_expires_at && Date.now() >= new Date(row.refresh_expires_at).getTime()) {
    return { token: null, error: "Sesi TikTok kedaluwarsa — hubungkan ulang akun" };
  }

  const t = await postToken({
    client_key: process.env.TIKTOK_CLIENT_KEY!,
    client_secret: process.env.TIKTOK_CLIENT_SECRET!,
    grant_type: "refresh_token",
    refresh_token: row.refresh_token,
  });

  if (!t.access_token || !t.refresh_token) {
    const err = t.error_description ?? t.error ?? "Gagal refresh token TikTok — hubungkan ulang akun";
    await markRefresh(false, err);
    return { token: null, error: err };
  }

  await saveTokens(t);
  await markRefresh(true);
  return { token: t.access_token };
}

export async function disconnect(): Promise<void> {
  await supabaseAdmin.from("cc_integrations").delete().eq("provider", "tiktok");
}

/** Catat hasil refresh untuk monitoring kesehatan token. */
async function markRefresh(ok: boolean, error?: string): Promise<void> {
  const row = await getIntegration();
  if (!row) return;

  await supabaseAdmin
    .from("cc_integrations")
    .update({
      last_refresh_at: new Date().toISOString(),
      last_refresh_error: ok ? null : error ?? "Unknown",
      refresh_fail_count: ok ? 0 : (row.refresh_fail_count ?? 0) + 1,
    })
    .eq("provider", "tiktok");
}

/**
 * Keep-alive: dipanggil cron harian.
 * Memaksa refresh walau access_token masih valid — supaya refresh_token
 * ikut diperbarui dan masa 365 hari nya ter-reset terus. Selama ini jalan,
 * token TikTok tidak akan pernah expired.
 */
export async function keepAlive(): Promise<{ ok: boolean; error?: string }> {
  const row = await getIntegration();
  if (!row) return { ok: false, error: "Akun TikTok belum terhubung" };

  const t = await postToken({
    client_key: process.env.TIKTOK_CLIENT_KEY!,
    client_secret: process.env.TIKTOK_CLIENT_SECRET!,
    grant_type: "refresh_token",
    refresh_token: row.refresh_token,
  });

  if (!t.access_token || !t.refresh_token) {
    const err = t.error_description ?? t.error ?? "Gagal refresh";
    await markRefresh(false, err);
    return { ok: false, error: err };
  }

  await saveTokens(t);
  await markRefresh(true);
  return { ok: true };
}

/** Kesehatan token untuk banner di dashboard. */
export interface TikTokHealth {
  connected: boolean;
  accountName: string | null;
  daysLeft: number | null;      // sisa umur refresh_token
  lastRefreshAt: string | null;
  failCount: number;
  error: string | null;
  level: "OK" | "WARN" | "DEAD";
}

export async function getHealth(): Promise<TikTokHealth> {
  const row = await getIntegration();
  if (!row) {
    return {
      connected: false, accountName: null, daysLeft: null,
      lastRefreshAt: null, failCount: 0, error: null, level: "DEAD",
    };
  }

  const daysLeft = row.refresh_expires_at
    ? Math.floor((new Date(row.refresh_expires_at).getTime() - Date.now()) / 86_400_000)
    : null;

  const fails = row.refresh_fail_count ?? 0;

  // DEAD  → sudah tidak bisa dipakai, wajib connect ulang
  // WARN  → masih jalan tapi butuh perhatian
  const level: TikTokHealth["level"] =
    (daysLeft !== null && daysLeft <= 0) || fails >= 3
      ? "DEAD"
      : (daysLeft !== null && daysLeft <= 30) || fails > 0
        ? "WARN"
        : "OK";

  return {
    connected: level !== "DEAD",
    accountName: row.account_name,
    daysLeft,
    lastRefreshAt: row.last_refresh_at ?? null,
    failCount: fails,
    error: row.last_refresh_error ?? null,
    level,
  };
}