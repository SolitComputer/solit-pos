// src/lib/ccMetrics.ts
export type SyncStatus = "OK" | "ERROR" | "UNSUPPORTED" | "PENDING";

export interface ParsedPost {
    platform: string;
    externalId: string | null;
}

/** Platform yang metriknya bisa ditarik otomatis dari link */
export const AUTO_SYNC_PLATFORMS = ["YouTube", "Instagram", "TikTok"] as const;

export function isAutoSyncPlatform(platform: string): boolean {
    return (AUTO_SYNC_PLATFORMS as readonly string[]).includes(platform);
}

function safeUrl(raw: string): URL | null {
    const v = raw.trim();
    if (!v) return null;
    try {
        return new URL(v.startsWith("http") ? v : `https://${v}`);
    } catch {
        return null;
    }
}

/**
 * Deteksi platform + ID konten dari URL posting.
 * externalId = null → platform kedeteksi tapi ID belum bisa diambil
 * (contoh: shortlink vt.tiktok.com yang butuh redirect resolve di server).
 */
export function parsePostUrl(raw: string): ParsedPost | null {
    const url = safeUrl(raw);
    if (!url) return null;

    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const path = url.pathname;

    // ── YouTube ────────────────────────────────────────────────────────────────
    if (host === "youtu.be") {
        const id = path.split("/").filter(Boolean)[0] ?? null;
        return { platform: "YouTube", externalId: id };
    }
    if (host.endsWith("youtube.com")) {
        const v = url.searchParams.get("v");
        if (v) return { platform: "YouTube", externalId: v };
        const m = path.match(/^\/(?:shorts|live|embed|v)\/([\w-]+)/);
        return { platform: "YouTube", externalId: m?.[1] ?? null };
    }

    // ── Instagram (externalId = shortcode) ─────────────────────────────────────
    if (host.endsWith("instagram.com")) {
        const m = path.match(/\/(?:p|reel|reels|tv)\/([\w-]+)/);
        return { platform: "Instagram", externalId: m?.[1] ?? null };
    }

    // ── TikTok (externalId = numeric video id) ─────────────────────────────────
    if (host.endsWith("tiktok.com")) {
        const m = path.match(/\/video\/(\d+)/);
        if (m) return { platform: "TikTok", externalId: m[1] };
        return { platform: "TikTok", externalId: null };
    }

    // ── Manual-only platforms ─────────────────────────────────────────────────
    if (host.endsWith("shopee.co.id") || host.endsWith("shopee.com")) {
        return { platform: "Shopee", externalId: null };
    }
    if (host.endsWith("tokopedia.com")) {
        return { platform: "Tokopedia", externalId: null };
    }
    if (host.endsWith("facebook.com") || host.endsWith("fb.watch")) {
        return { platform: "Facebook", externalId: null };
    }

    return { platform: "Lainnya", externalId: null };
}

export const SYNC_STATUS_META: Record<SyncStatus, { label: string; className: string }> = {
    OK: { label: "Auto ✓", className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
    PENDING: { label: "Belum sync", className: "bg-gray-100 text-gray-500 ring-1 ring-gray-200" },
    ERROR: { label: "Gagal sync", className: "bg-red-50 text-red-600 ring-1 ring-red-200" },
    UNSUPPORTED: { label: "Manual", className: "bg-amber-50 text-amber-700 ring-1 ring-amber-200" },
};