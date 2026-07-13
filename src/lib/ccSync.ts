// src/lib/ccSync.ts
// ⚠️ SERVER ONLY — jangan di-import dari komponen "use client"
import { getValidAccessToken } from "./ccTikTok";
import { parsePostUrl, type SyncStatus } from "./ccMetrics";

export interface SyncOutcome {
  status: SyncStatus;
  views: number;
  likes: number;
  comments: number;
  error: string | null;
  externalId: string | null;
  platform: string | null;
}

const fail = (status: SyncStatus, error: string): SyncOutcome => ({
  status, views: 0, likes: 0, comments: 0, error, externalId: null, platform: null,
});

// ── YouTube ──────────────────────────────────────────────────────────────────
async function syncYouTube(videoId: string): Promise<SyncOutcome> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return fail("UNSUPPORTED", "YOUTUBE_API_KEY belum di-set di env");

  const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(videoId)}&key=${key}`;
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();

  if (!res.ok) return fail("ERROR", json?.error?.message ?? `HTTP ${res.status}`);

  const s = json?.items?.[0]?.statistics;
  if (!s) return fail("ERROR", "Video tidak ditemukan / private / dihapus");

  return {
    status: "OK",
    views: Number(s.viewCount ?? 0),
    likes: Number(s.likeCount ?? 0),          // bisa 0 kalau like disembunyikan
    comments: Number(s.commentCount ?? 0),
    error: null,
    externalId: videoId,
    platform: "YouTube",
  };
}

// ── Instagram ────────────────────────────────────────────────────────────────
// ✅ v25.0 — metrik agregat (views/likes/comments) sudah tersedia langsung di
//    Media endpoint, jadi tidak perlu call /insights per post. Hemat kuota
//    (rate limit IG = 200 request/jam/akun).
const IG_VERSION = process.env.IG_GRAPH_VERSION || "v25.0";

interface IgMedia {
  id: string;
  permalink: string;
  media_type?: string;
  like_count?: number;
  comments_count?: number;
  views?: number;
}

interface IgMediaResponse {
  data?: IgMedia[];
  paging?: { next?: string };
  error?: { message?: string };
}

interface IgInsightsResponse {
  data?: { name?: string; values?: { value?: number }[] }[];
  error?: { message?: string };
}

let igCache: { at: number; map: Map<string, IgMedia> } | null = null;
const IG_TTL = 60_000;

function shortcodeOf(permalink: string): string | null {
  return permalink.match(/\/(?:p|reel|reels|tv)\/([\w-]+)/)?.[1] ?? null;
}

async function loadIgMedia(): Promise<Map<string, IgMedia>> {
  if (igCache && Date.now() - igCache.at < IG_TTL) return igCache.map;

  const token = process.env.IG_ACCESS_TOKEN!;
  const igUser = process.env.IG_USER_ID!;

  const fields = "id,permalink,media_type,like_count,comments_count,views";

  const map = new Map<string, IgMedia>();

  let next: string | null =
    `https://graph.facebook.com/${IG_VERSION}/${igUser}/media` +
    `?fields=${fields}&limit=100&access_token=${token}`;

  // Maks 5 halaman (±500 konten terakhir)
  for (let page = 0; page < 5 && next !== null; page++) {
    const url: string = next;                       // putus siklus inferensi TS
    const res: Response = await fetch(url, { cache: "no-store" });
    const json: IgMediaResponse = await res.json(); // tipe konkret, bukan any

    if (!res.ok) throw new Error(json.error?.message ?? `IG HTTP ${res.status}`);

    for (const m of json.data ?? []) {
      const code = shortcodeOf(m.permalink ?? "");
      if (code) map.set(code, m);
    }

    next = json.paging?.next ?? null;
  }

  igCache = { at: Date.now(), map };
  return map;
}

/**
 * Fallback views lewat /insights — hanya dipakai kalau Media endpoint tidak
 * mengembalikan `views` (mis. foto lama / carousel).
 * Catatan: `video_views` sudah deprecated sejak v21, jangan dipakai lagi.
 */
async function igViewsFallback(mediaId: string): Promise<number> {
  const token = process.env.IG_ACCESS_TOKEN!;

  for (const metric of ["views", "reach"] as const) {
    try {
      const res = await fetch(
        `https://graph.facebook.com/${IG_VERSION}/${mediaId}/insights?metric=${metric}&access_token=${token}`,
        { cache: "no-store" }
      );
      const json: IgInsightsResponse = await res.json();
      if (!res.ok) continue;
      const v = json.data?.[0]?.values?.[0]?.value;
      if (typeof v === "number") return v;
    } catch {
      /* coba metrik berikutnya */
    }
  }
  return 0;
}

async function syncInstagram(shortcode: string): Promise<SyncOutcome> {
  if (!process.env.IG_ACCESS_TOKEN || !process.env.IG_USER_ID) {
    return fail("UNSUPPORTED", "IG_ACCESS_TOKEN / IG_USER_ID belum di-set");
  }

  try {
    const map = await loadIgMedia();
    const media = map.get(shortcode);

    if (!media) {
      return {
        ...fail(
          "ERROR",
          "Konten tidak ditemukan di akun IG Solit — metrik IG hanya bisa untuk konten sendiri"
        ),
        platform: "Instagram",
        externalId: shortcode,
      };
    }

    const views =
      typeof media.views === "number" ? media.views : await igViewsFallback(media.id);

    return {
      status: "OK",
      views,
      likes: Number(media.like_count ?? 0),
      comments: Number(media.comments_count ?? 0),
      error: null,
      externalId: shortcode,
      platform: "Instagram",
    };
  } catch (e) {
    return {
      ...fail("ERROR", e instanceof Error ? e.message : "Gagal ambil data IG"),
      platform: "Instagram",
      externalId: shortcode,
    };
  }
}

// ── TikTok ───────────────────────────────────────────────────────────────────
interface TikTokVideo {
  id?: string;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
}
interface TikTokQueryResponse {
  data?: { videos?: TikTokVideo[] };
  error?: { code?: string; message?: string };
}

async function syncTikTok(videoId: string): Promise<SyncOutcome> {
  const auth = await getValidAccessToken();
  if (auth.token === null) {
    return { ...fail("ERROR", auth.error), platform: "TikTok", externalId: videoId };
  }

  const res = await fetch(
    "https://open.tiktokapis.com/v2/video/query/?fields=id,view_count,like_count,comment_count",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ filters: { video_ids: [videoId] } }),
      cache: "no-store",
    }
  );

  const json: TikTokQueryResponse = await res.json();

  if (!res.ok || (json.error?.code && json.error.code !== "ok")) {
    return {
      ...fail("ERROR", json.error?.message ?? `TikTok HTTP ${res.status}`),
      platform: "TikTok",
      externalId: videoId,
    };
  }

  const v = json.data?.videos?.[0];
  if (!v) {
    return {
      ...fail(
        "ERROR",
        "Video tidak ditemukan di akun TikTok yang terhubung (metrik hanya bisa untuk konten sendiri)"
      ),
      platform: "TikTok",
      externalId: videoId,
    };
  }

  return {
    status: "OK",
    views: Number(v.view_count ?? 0),
    likes: Number(v.like_count ?? 0),
    comments: Number(v.comment_count ?? 0),
    error: null,
    externalId: videoId,
    platform: "TikTok",
  };
}

/** Shortlink TikTok (vt./vm.) → URL asli yang mengandung video ID. */
async function resolveTikTokShortlink(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { redirect: "follow", cache: "no-store" });
    return res.url || null;
  } catch {
    return null;
  }
}

// ── Entry point ──────────────────────────────────────────────────────────────
export async function syncPosting(postUrl: string | null): Promise<SyncOutcome> {
  if (!postUrl) return fail("PENDING", "Link posting belum diisi");

  let parsed = parsePostUrl(postUrl);
  if (!parsed) return fail("ERROR", "Format link tidak valid");

  // TikTok shortlink → ikuti redirect dulu untuk dapat video ID
  if (parsed.platform === "TikTok" && !parsed.externalId) {
    const resolved = await resolveTikTokShortlink(postUrl);
    if (resolved) {
      const again = parsePostUrl(resolved);
      if (again?.externalId) parsed = again;
    }
  }

  if (!parsed.externalId) {
    return {
      ...fail("UNSUPPORTED", `Metrik ${parsed.platform} tidak bisa ditarik otomatis — isi manual`),
      platform: parsed.platform,
    };
  }

  switch (parsed.platform) {
    case "YouTube":   return syncYouTube(parsed.externalId);
    case "Instagram": return syncInstagram(parsed.externalId);
    case "TikTok":    return syncTikTok(parsed.externalId);
    default:
      return { ...fail("UNSUPPORTED", `${parsed.platform} belum didukung auto-sync`), platform: parsed.platform };
  }
}