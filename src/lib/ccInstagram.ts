// src/lib/ccInstagram.ts
// ⚠️ SERVER ONLY — jangan di-import dari komponen "use client"
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { CC_BRANDS, DEFAULT_BRAND } from "./ccReports";

const PROVIDER = "instagram";
const DAY_MS = 86_400_000;

/** Refresh kalau sisa umur token < ini */
const REFRESH_BEFORE_DAYS = 10;

export const IG_VERSION = process.env.IG_GRAPH_VERSION || "v25.0";

export type IgAuth =
    | { token: string; igUserId: string; error: null }
    | { token: null; igUserId: null; error: string };

interface IgRow {
    brand: string;
    access_token: string;
    expires_at: string | null;      // null = token tidak kedaluwarsa (page token)
    open_id: string | null;         // IG User ID
    account_name: string | null;
    last_refresh_at: string | null;
    last_refresh_error: string | null;
    refresh_fail_count: number | null;
}

interface FbTokenResponse {
    access_token?: string;
    expires_in?: number; // detik — ABSENT kalau token tidak kedaluwarsa
    error?: { message?: string };
}

async function readRow(brand: string): Promise<IgRow | null> {
    const { data } = await supabaseAdmin
        .from("cc_integrations")
        .select(
            "brand, access_token, expires_at, open_id, account_name, last_refresh_at, last_refresh_error, refresh_fail_count"
        )
        .eq("provider", PROVIDER)
        .eq("brand", brand)
        .maybeSingle();

    return (data as IgRow | null) ?? null;
}

async function writeRow(brand: string, patch: Record<string, unknown>): Promise<void> {
    const { error } = await supabaseAdmin.from("cc_integrations").upsert(
        { provider: PROVIDER, brand, ...patch, updated_at: new Date().toISOString() },
        { onConflict: "provider,brand" }
    );

    if (error) {
        throw new Error(`Gagal menyimpan token IG ke cc_integrations: ${error.message}`);
    }
}

/**
 * Tukar token apa pun (short-lived / long-lived yang masih hidup)
 * menjadi long-lived token baru berumur ~60 hari.
 */
async function exchangeLongLived(
    token: string
): Promise<{ token: string; expiresAt: string | null } | { token: null; error: string }> {
    const appId = process.env.FB_APP_ID;
    const appSecret = process.env.FB_APP_SECRET;

    if (!appId || !appSecret) {
        return { token: null, error: "FB_APP_ID / FB_APP_SECRET belum di-set di env" };
    }

    const url =
        `https://graph.facebook.com/${IG_VERSION}/oauth/access_token` +
        `?grant_type=fb_exchange_token` +
        `&client_id=${encodeURIComponent(appId)}` +
        `&client_secret=${encodeURIComponent(appSecret)}` +
        `&fb_exchange_token=${encodeURIComponent(token)}`;

    try {
        const res = await fetch(url, { cache: "no-store" });
        const json: FbTokenResponse = await res.json();

        if (!res.ok || !json.access_token) {
            return { token: null, error: json.error?.message ?? `IG token HTTP ${res.status}` };
        }

        const expiresAt = json.expires_in
            ? new Date(Date.now() + json.expires_in * 1000).toISOString()
            : null;

        return { token: json.access_token, expiresAt };
    } catch (e) {
        return { token: null, error: e instanceof Error ? e.message : "Gagal tukar token IG" };
    }
}

async function fetchUsername(igUserId: string, token: string): Promise<string | null> {
    try {
        const res = await fetch(
            `https://graph.facebook.com/${IG_VERSION}/${igUserId}?fields=username&access_token=${encodeURIComponent(token)}`,
            { cache: "no-store" }
        );
        if (!res.ok) return null;
        const json = (await res.json()) as { username?: string };
        return json.username ?? null;
    } catch {
        return null;
    }
}

function daysLeftOf(expiresAt: string | null): number | null {
    if (!expiresAt) return null;
    return Math.floor((new Date(expiresAt).getTime() - Date.now()) / DAY_MS);
}

/** Simpan / perbarui token hasil exchange untuk satu brand. */
async function persist(brand: string, token: string, expiresAt: string | null, igUserId: string): Promise<void> {
    const username = await fetchUsername(igUserId, token);
    await writeRow(brand, {
        access_token: token,
        expires_at: expiresAt,
        open_id: igUserId,
        account_name: username,
        scope: "instagram_basic,instagram_manage_insights",
        last_refresh_at: new Date().toISOString(),
        last_refresh_error: null,
        refresh_fail_count: 0,
    });
}

/**
 * Token IG valid & siap pakai untuk SATU brand.
 *  - Brand default (Solit) tanpa row → bootstrap dari env (IG_ACCESS_TOKEN + IG_USER_ID).
 *  - Brand lain tanpa row → error "belum terhubung" (seed dulu lewat form admin).
 *  - IG User ID diambil dari row.open_id (per brand), BUKAN env.
 */
export async function getValidIgToken(brand: string = DEFAULT_BRAND): Promise<IgAuth> {
    const row = await readRow(brand);

    // ── Belum ada row ─────────────────────────────────────────────────────────
    if (!row) {
        // Bootstrap env HANYA untuk brand default (backward-compat Solit lama)
        if (brand === DEFAULT_BRAND) {
            const seed = process.env.IG_ACCESS_TOKEN;
            const envIgUserId = process.env.IG_USER_ID ?? null;
            if (seed && envIgUserId) {
                const out = await exchangeLongLived(seed);
                if (out.token === null) return { token: null, igUserId: null, error: out.error };
                try {
                    await persist(brand, out.token, out.expiresAt, envIgUserId);
                } catch (e) {
                    return { token: null, igUserId: null, error: e instanceof Error ? e.message : "Gagal menyimpan token IG" };
                }
                return { token: out.token, igUserId: envIgUserId, error: null };
            }
        }
        return { token: null, igUserId: null, error: `Instagram brand ${brand} belum terhubung` };
    }

    const igUserId = row.open_id;
    if (!igUserId) {
        return { token: null, igUserId: null, error: `IG User ID brand ${brand} belum tersimpan — hubungkan ulang` };
    }

    // ── Page token permanen ───────────────────────────────────────────────────
    const daysLeft = daysLeftOf(row.expires_at);
    if (daysLeft === null) return { token: row.access_token, igUserId, error: null };

    // ── Masih segar ───────────────────────────────────────────────────────────
    if (daysLeft > REFRESH_BEFORE_DAYS) return { token: row.access_token, igUserId, error: null };

    // ── Refresh ───────────────────────────────────────────────────────────────
    const out = await exchangeLongLived(row.access_token);
    if (out.token === null) {
        await writeRow(brand, {
            last_refresh_at: new Date().toISOString(),
            last_refresh_error: out.error,
            refresh_fail_count: (row.refresh_fail_count ?? 0) + 1,
        });
        if (daysLeft > 0) return { token: row.access_token, igUserId, error: null };
        return { token: null, igUserId: null, error: out.error };
    }

    await persist(brand, out.token, out.expiresAt, igUserId);
    return { token: out.token, igUserId, error: null };
}

/**
 * Seed / perbarui token IG satu brand dari token yang dipaste admin.
 * token mentah → long-lived → simpan bareng IG User ID brand tsb.
 */
export async function seedIgToken(
    brand: string,
    rawToken: string,
    igUserId: string
): Promise<{ ok: boolean; error?: string; accountName?: string | null }> {
    const t = rawToken.trim();
    const uid = igUserId.trim();
    if (!t || !uid) return { ok: false, error: "Token dan IG User ID wajib diisi" };

    const out = await exchangeLongLived(t);
    if (out.token === null) return { ok: false, error: out.error };

    try {
        await persist(brand, out.token, out.expiresAt, uid);
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Gagal menyimpan token IG" };
    }

    const row = await readRow(brand);
    return { ok: true, accountName: row?.account_name ?? null };
}

export async function keepAliveIg(brand: string = DEFAULT_BRAND): Promise<{
    ok: boolean; error: string | null; accountName?: string | null; daysLeft?: number | null;
}> {
    const auth = await getValidIgToken(brand);
    if (auth.token === null) return { ok: false, error: auth.error };

    const username = await fetchUsername(auth.igUserId, auth.token);
    if (!username) return { ok: false, error: "Token tersimpan tapi ditolak Graph API — hubungkan ulang" };

    const row = await readRow(brand);
    return { ok: true, error: null, accountName: username, daysLeft: daysLeftOf(row?.expires_at ?? null) };
}

/** Keep-alive SEMUA brand IG yang terhubung — dipanggil cron harian. */
export async function keepAliveIgAll(): Promise<{ brand: string; ok: boolean; error: string | null }[]> {
    const { data } = await supabaseAdmin
        .from("cc_integrations")
        .select("brand")
        .eq("provider", PROVIDER);

    const out: { brand: string; ok: boolean; error: string | null }[] = [];
    for (const r of data ?? []) {
        const res = await keepAliveIg(r.brand as string);
        out.push({ brand: r.brand as string, ok: res.ok, error: res.error ?? null });
    }
    return out;
}

export interface IgHealth {
    brand: string;
    connected: boolean;
    accountName: string | null;
    daysLeft: number | null;
    level: "OK" | "WARN" | "DEAD";
    error: string | null;
}

export async function getIgHealth(brand: string = DEFAULT_BRAND): Promise<IgHealth> {
    const row = await readRow(brand);

    if (!row) {
        // env-check hanya relevan utk brand default yang belum punya row
        if (brand === DEFAULT_BRAND) {
            const missing: string[] = [];
            if (!process.env.IG_USER_ID) missing.push("IG_USER_ID");
            if (!process.env.FB_APP_ID) missing.push("FB_APP_ID");
            if (!process.env.FB_APP_SECRET) missing.push("FB_APP_SECRET");
            if (!process.env.IG_ACCESS_TOKEN) missing.push("IG_ACCESS_TOKEN");
            return {
                brand, connected: false, accountName: null, daysLeft: null, level: "DEAD",
                error: missing.length ? `Belum terhubung (env: ${missing.join(", ")})` : "Belum terhubung — jalankan keepalive",
            };
        }
        return { brand, connected: false, accountName: null, daysLeft: null, level: "DEAD", error: "belum terhubung" };
    }

    const daysLeft = daysLeftOf(row.expires_at);
    const failing = (row.refresh_fail_count ?? 0) > 0;

    let level: IgHealth["level"] = "OK";
    if (daysLeft !== null && daysLeft <= 0) level = "DEAD";
    else if (failing || (daysLeft !== null && daysLeft <= REFRESH_BEFORE_DAYS)) level = "WARN";

    return {
        brand,
        connected: level !== "DEAD",
        accountName: row.account_name,
        daysLeft,
        level,
        error: row.last_refresh_error,
    };
}

/** Health semua brand IG — dipakai UI connect per-brand (Part 2). */
export async function getIgHealthAll(): Promise<Record<string, IgHealth>> {
    const entries = await Promise.all(
        CC_BRANDS.map(async (b) => [b, await getIgHealth(b)] as const)
    );
    return Object.fromEntries(entries);
}

export async function disconnectIg(brand: string = DEFAULT_BRAND): Promise<void> {
    await supabaseAdmin.from("cc_integrations").delete().eq("provider", PROVIDER).eq("brand", brand);
}