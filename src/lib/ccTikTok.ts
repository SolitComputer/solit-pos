// src/lib/ccTikTok.ts
// ⚠️ SERVER ONLY
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { CC_BRANDS, DEFAULT_BRAND } from "./ccReports";

const AUTH_BASE = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const SCOPES = "user.info.basic,video.list";

/** Refresh 5 menit sebelum benar-benar expired — hindari race di batas waktu. */
const REFRESH_MARGIN_MS = 5 * 60_000;

interface TikTokTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
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
  brand: string;
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

async function saveTokens(brand: string, t: TikTokTokenResponse, accountName?: string | null): Promise<void> {
  const now = Date.now();
  const { error } = await supabaseAdmin.from("cc_integrations").upsert(
    {
      provider: "tiktok",
      brand,
      access_token: t.access_token!,
      refresh_token: t.refresh_token!,
      expires_at: new Date(now + (t.expires_in ?? 86400) * 1000).toISOString(),
      refresh_expires_at: new Date(now + (t.refresh_expires_in ?? 31536000) * 1000).toISOString(),
      open_id: t.open_id ?? null,
      scope: t.scope ?? null,
      ...(accountName !== undefined ? { account_name: accountName } : {}),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider,brand" }
  );

  if (error) throw new Error(`Gagal simpan token: ${error.message}`);
}

/** Tukar `code` dari callback → token, lalu simpan untuk brand tsb. */
export async function exchangeCode(code: string, brand: string): Promise<{ ok: boolean; error?: string }> {
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
  await saveTokens(brand, t, name);
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

export async function getIntegration(brand: string = DEFAULT_BRAND): Promise<TikTokIntegration | null> {
  const { data } = await supabaseAdmin
    .from("cc_integrations")
    .select("*")
    .eq("provider", "tiktok")
    .eq("brand", brand)
    .maybeSingle();
  return (data as TikTokIntegration) ?? null;
}

/**
 * Access token yang dijamin valid untuk SATU brand.
 * token === null → brand itu belum connect atau refresh_token mati.
 */
export async function getValidAccessToken(brand: string = DEFAULT_BRAND): Promise<TikTokTokenResult> {
  const row = await getIntegration(brand);
  if (!row) return { token: null, error: `Akun TikTok brand ${brand} belum terhubung` };

  const expiresAt = new Date(row.expires_at).getTime();
  if (Date.now() < expiresAt - REFRESH_MARGIN_MS) {
    return { token: row.access_token };
  }

  if (row.refresh_expires_at && Date.now() >= new Date(row.refresh_expires_at).getTime()) {
    return { token: null, error: `Sesi TikTok brand ${brand} kedaluwarsa — hubungkan ulang akun` };
  }

  const t = await postToken({
    client_key: process.env.TIKTOK_CLIENT_KEY!,
    client_secret: process.env.TIKTOK_CLIENT_SECRET!,
    grant_type: "refresh_token",
    refresh_token: row.refresh_token,
  });

  if (!t.access_token || !t.refresh_token) {
    const err = t.error_description ?? t.error ?? "Gagal refresh token TikTok — hubungkan ulang akun";
    await markRefresh(brand, false, err);
    return { token: null, error: err };
  }

  await saveTokens(brand, t);
  await markRefresh(brand, true);
  return { token: t.access_token };
}

export async function disconnect(brand: string = DEFAULT_BRAND): Promise<void> {
  await supabaseAdmin.from("cc_integrations").delete().eq("provider", "tiktok").eq("brand", brand);
}

/** Catat hasil refresh untuk monitoring kesehatan token (per brand). */
async function markRefresh(brand: string, ok: boolean, error?: string): Promise<void> {
  const row = await getIntegration(brand);
  if (!row) return;

  await supabaseAdmin
    .from("cc_integrations")
    .update({
      last_refresh_at: new Date().toISOString(),
      last_refresh_error: ok ? null : error ?? "Unknown",
      refresh_fail_count: ok ? 0 : (row.refresh_fail_count ?? 0) + 1,
    })
    .eq("provider", "tiktok")
    .eq("brand", brand);
}

/** Keep-alive satu brand: paksa refresh supaya masa 365 hari refresh_token ter-reset. */
export async function keepAlive(brand: string = DEFAULT_BRAND): Promise<{ ok: boolean; error?: string }> {
  const row = await getIntegration(brand);
  if (!row) return { ok: false, error: `Akun TikTok brand ${brand} belum terhubung` };

  const t = await postToken({
    client_key: process.env.TIKTOK_CLIENT_KEY!,
    client_secret: process.env.TIKTOK_CLIENT_SECRET!,
    grant_type: "refresh_token",
    refresh_token: row.refresh_token,
  });

  if (!t.access_token || !t.refresh_token) {
    const err = t.error_description ?? t.error ?? "Gagal refresh";
    await markRefresh(brand, false, err);
    return { ok: false, error: err };
  }

  await saveTokens(brand, t);
  await markRefresh(brand, true);
  return { ok: true };
}

/** Keep-alive SEMUA brand TikTok yang terhubung — dipanggil cron harian. */
export async function keepAliveAll(): Promise<{ brand: string; ok: boolean; error: string | null }[]> {
  const { data } = await supabaseAdmin
    .from("cc_integrations")
    .select("brand")
    .eq("provider", "tiktok");

  const out: { brand: string; ok: boolean; error: string | null }[] = [];
  for (const r of data ?? []) {
    const res = await keepAlive(r.brand as string);
    out.push({ brand: r.brand as string, ok: res.ok, error: res.error ?? null });
  }
  return out;
}

export interface TikTokHealth {
  brand: string;
  connected: boolean;
  accountName: string | null;
  daysLeft: number | null;
  lastRefreshAt: string | null;
  failCount: number;
  error: string | null;
  level: "OK" | "WARN" | "DEAD";
}

export async function getHealth(brand: string = DEFAULT_BRAND): Promise<TikTokHealth> {
  const row = await getIntegration(brand);
  if (!row) {
    return {
      brand, connected: false, accountName: null, daysLeft: null,
      lastRefreshAt: null, failCount: 0, error: null, level: "DEAD",
    };
  }

  const daysLeft = row.refresh_expires_at
    ? Math.floor((new Date(row.refresh_expires_at).getTime() - Date.now()) / 86_400_000)
    : null;

  const fails = row.refresh_fail_count ?? 0;

  const level: TikTokHealth["level"] =
    (daysLeft !== null && daysLeft <= 0) || fails >= 3
      ? "DEAD"
      : (daysLeft !== null && daysLeft <= 30) || fails > 0
        ? "WARN"
        : "OK";

  return {
    brand,
    connected: level !== "DEAD",
    accountName: row.account_name,
    daysLeft,
    lastRefreshAt: row.last_refresh_at ?? null,
    failCount: fails,
    error: row.last_refresh_error ?? null,
    level,
  };
}

/** Health semua brand sekaligus — dipakai UI connect per-brand (Part 2). */
export async function getHealthAll(): Promise<Record<string, TikTokHealth>> {
  const entries = await Promise.all(
    CC_BRANDS.map(async (b) => [b, await getHealth(b)] as const)
  );
  return Object.fromEntries(entries);
}