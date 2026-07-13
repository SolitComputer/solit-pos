// src/lib/ccInstagram.ts
// ⚠️ SERVER ONLY — jangan di-import dari komponen "use client"
import { supabaseAdmin } from "@/services/supabaseAdmin";

const PROVIDER = "instagram";
const DAY_MS = 86_400_000;

/** Refresh kalau sisa umur token < ini */
const REFRESH_BEFORE_DAYS = 10;

export const IG_VERSION = process.env.IG_GRAPH_VERSION || "v25.0";

export type IgAuth =
    | { token: string; igUserId: string; error: null }
    | { token: null; igUserId: null; error: string };

interface IgRow {
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

async function readRow(): Promise<IgRow | null> {
    const { data } = await supabaseAdmin
        .from("cc_integrations")
        .select(
            "access_token, expires_at, open_id, account_name, last_refresh_at, last_refresh_error, refresh_fail_count"
        )
        .eq("provider", PROVIDER)
        .maybeSingle();

    return (data as IgRow | null) ?? null;
}

async function writeRow(patch: Record<string, unknown>): Promise<void> {
    await supabaseAdmin.from("cc_integrations").upsert(
        { provider: PROVIDER, ...patch, updated_at: new Date().toISOString() },
        { onConflict: "provider" }
    );
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

        // expires_in absent → Page Access Token yang tidak pernah expired
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
    if (!expiresAt) return null; // tidak pernah expired
    return Math.floor((new Date(expiresAt).getTime() - Date.now()) / DAY_MS);
}

/** Simpan / perbarui token hasil exchange. */
async function persist(token: string, expiresAt: string | null, igUserId: string): Promise<void> {
    const username = await fetchUsername(igUserId, token);
    await writeRow({
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
 * Token IG yang valid & siap pakai.
 *
 * Alur:
 *  1. Belum ada row → seed dari IG_ACCESS_TOKEN di env, tukar jadi long-lived, simpan.
 *  2. Ada row & masih segar → pakai apa adanya.
 *  3. Ada row & mau habis (<10 hari) → refresh otomatis, simpan yang baru.
 *  4. expires_at = null → Page Token permanen, tidak perlu refresh.
 */
export async function getValidIgToken(): Promise<IgAuth> {
    const igUserId = process.env.IG_USER_ID ?? null;
    if (!igUserId) {
        return { token: null, igUserId: null, error: "IG_USER_ID belum di-set di env" };
    }

    const row = await readRow();

    // ── (1) Bootstrap dari env ────────────────────────────────────────────────
    if (!row) {
        const seed = process.env.IG_ACCESS_TOKEN;
        if (!seed) {
            return {
                token: null,
                igUserId: null,
                error: "IG_ACCESS_TOKEN belum di-set di env",
            };
        }

        const out = await exchangeLongLived(seed);

        if (out.token === null) {
            await writeRow({
                access_token: seed,
                expires_at: new Date().toISOString(), // tandai mati
                open_id: igUserId,
                last_refresh_at: new Date().toISOString(),
                last_refresh_error: out.error,
                refresh_fail_count: 1,
            });
            return { token: null, igUserId: null, error: out.error };
        }

        await persist(out.token, out.expiresAt, igUserId);
        return { token: out.token, igUserId, error: null };
    }

    // ── (4) Page token permanen ───────────────────────────────────────────────
    const daysLeft = daysLeftOf(row.expires_at);
    if (daysLeft === null) {
        return { token: row.access_token, igUserId, error: null };
    }

    // ── (2) Masih segar ───────────────────────────────────────────────────────
    if (daysLeft > REFRESH_BEFORE_DAYS) {
        return { token: row.access_token, igUserId, error: null };
    }

    // ── (3) Refresh ───────────────────────────────────────────────────────────
    const out = await exchangeLongLived(row.access_token);
    if (out.token === null) {
        await writeRow({
            last_refresh_at: new Date().toISOString(),
            last_refresh_error: out.error,
            refresh_fail_count: (row.refresh_fail_count ?? 0) + 1,
        });

        // token lama masih hidup? pakai dulu, jangan matikan sync
        if (daysLeft > 0) return { token: row.access_token, igUserId, error: null };

        return { token: null, igUserId: null, error: out.error };
    }

    await persist(out.token, out.expiresAt, igUserId);
    return { token: out.token, igUserId, error: null };
}

export async function keepAliveIg(): Promise<{
    ok: boolean;
    error: string | null;
    accountName?: string | null;
    daysLeft?: number | null;
}> {
    const auth = await getValidIgToken();
    if (auth.token === null) {
        return { ok: false, error: auth.error };
    }

    const username = await fetchUsername(auth.igUserId, auth.token);
    if (!username) {
        return { ok: false, error: "Token tersimpan tapi ditolak Graph API — hubungkan ulang" };
    }

    const row = await readRow();
    return {
        ok: true,
        error: null,
        accountName: username,
        daysLeft: daysLeftOf(row?.expires_at ?? null),
    };
}

export interface IgHealth {
    connected: boolean;
    accountName: string | null;
    daysLeft: number | null;
    level: "OK" | "WARN" | "DEAD";
    error: string | null;
}

export async function getIgHealth(): Promise<IgHealth> {
    const missing: string[] = [];
    if (!process.env.IG_USER_ID) missing.push("IG_USER_ID");
    if (!process.env.FB_APP_ID) missing.push("FB_APP_ID");
    if (!process.env.FB_APP_SECRET) missing.push("FB_APP_SECRET");

    const row = await readRow();

    if (missing.length > 0 && !row) {
        return {
            connected: false,
            accountName: null,
            daysLeft: null,
            level: "DEAD",
            error: `Env belum lengkap: ${missing.join(", ")}`,
        };
    }

    if (!row) {
        return {
            connected: false,
            accountName: null,
            daysLeft: null,
            level: "DEAD",
            error: "Instagram belum terhubung — jalankan keepalive",
        };
    }

    const daysLeft = daysLeftOf(row.expires_at);
    const failing = (row.refresh_fail_count ?? 0) > 0;

    let level: IgHealth["level"] = "OK";
    if (daysLeft !== null && daysLeft <= 0) level = "DEAD";
    else if (failing || (daysLeft !== null && daysLeft <= REFRESH_BEFORE_DAYS)) level = "WARN";

    return {
        connected: level !== "DEAD",
        accountName: row.account_name,
        daysLeft,
        level,
        error: row.last_refresh_error,
    };
}

export async function disconnectIg(): Promise<void> {
    await supabaseAdmin.from("cc_integrations").delete().eq("provider", PROVIDER);
}