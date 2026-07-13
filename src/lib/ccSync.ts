// src/lib/ccSync.ts
// ⚠️ SERVER ONLY — jangan di-import dari komponen "use client"
import { getValidAccessToken } from "./ccTikTok";
import { parsePostUrl, type SyncStatus } from "./ccMetrics";

/**
 * null = API TIDAK mengembalikan metrik ini (bukan berarti nol).
 * Ini kunci fix-nya: nilai lama di DB tidak boleh ditimpa 0 hanya karena
 * field-nya absent di response.
 */
export interface SyncOutcome {
  status: SyncStatus;
  views: number | null;
  likes: number | null;
  comments: number | null;
  error: string | null;
  externalId: string | null;
  platform: string | null;
}

type MetricKey = "views" | "likes" | "comments";

const METRIC_LABEL: Record<MetricKey, string> = {
  views: "view",
  likes: "like",
  comments: "komen",
};

/** angka valid → number; undefined/null/"" → null */
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const fail = (status: SyncStatus, error: string): SyncOutcome => ({
  status, views: null, likes: null, comments: null, error, externalId: null, platform: null,
});

/** OK = semua metrik didapat. PARTIAL = ada yang tidak dikembalikan API. */
function settle(
  platform: string,
  externalId: string,
  m: Record<MetricKey, number | null>
): SyncOutcome {
  const missing = (Object.keys(METRIC_LABEL) as MetricKey[]).filter((k) => m[k] === null);
  return {
    status: missing.length === 0 ? "OK" : "PARTIAL",
    views: m.views,
    likes: m.likes,
    comments: m.comments,
    error:
      missing.length === 0
        ? null
        : `${platform} tidak mengembalikan ${missing.map((k) => METRIC_LABEL[k]).join(", ")} — silakan isi manual.`,
    externalId,
    platform,
  };
}

/**
 * Patch DB dari hasil sync.
 * ✅ Hanya menulis metrik yang benar-benar didapat → angka manual/lama aman.
 */
export function buildPostingPatch(
  out: SyncOutcome,
  prev?: { external_id?: string | null }
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    last_synced_at: new Date().toISOString(),
    sync_status: out.status,
    sync_error: out.error,
    external_id: out.externalId ?? prev?.external_id ?? null,
  };

  if (out.status === "OK" || out.status === "PARTIAL") {
    if (out.views !== null) patch.views = out.views;
    if (out.likes !== null) patch.likes = out.likes;
    if (out.comments !== null) patch.comments = out.comments;
  }
  return patch;
}

// ── YouTube ──────────────────────────────────────────────────────────────────
async function syncYouTube(videoId: string): Promise<SyncOutcome> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return fail("UNSUPPORTED", "YOUTUBE_API_KEY belum di-set di env");

  const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(videoId)}&key=${key}`;
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();

  if (!res.ok) {
    return { ...fail("ERROR", json?.error?.message ?? `HTTP ${res.status}`), platform: "YouTube", externalId: videoId };
  }

  const s = json?.items?.[0]?.statistics;
  if (!s) {
    return { ...fail("ERROR", "Video tidak ditemukan / private / dihapus"), platform: "YouTube", externalId: videoId };
  }

  return settle("YouTube", videoId, {
    views: num(s.viewCount),
    likes: num(s.likeCount),       // absent kalau like disembunyikan → null (BUKAN 0)
    comments: num(s.commentCount), // absent kalau komentar dimatikan → null
  });
}

// ── Instagram ────────────────────────────────────────────────────────────────
const IG_VERSION = process.env.IG_GRAPH_VERSION || "v25.0";
const IG_TTL = 60_000;
const IG_MAX_PAGES = 15; // ±1500 konten terakhir (sebelumnya cuma 500)

interface IgMedia {
  id: string;
  permalink?: string;
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

function shortcodeOf(permalink: string): string | null {
  return permalink.match(/\/(?:p|reel|reels|tv)\/([\w-]+)/)?.[1] ?? null;
}

const IG_FIELDS = "id,permalink,media_type,like_count,comments_count,views";

async function loadIgMedia(): Promise<Map<string, IgMedia>> {
  if (igCache && Date.now() - igCache.at < IG_TTL) return igCache.map;

  const token = process.env.IG_ACCESS_TOKEN!;
  const igUser = process.env.IG_USER_ID!;
  const map = new Map<string, IgMedia>();

  let next: string | null =
    `https://graph.facebook.com/${IG_VERSION}/${igUser}/media` +
    `?fields=${IG_FIELDS}&limit=100&access_token=${token}`;

  for (let page = 0; page < IG_MAX_PAGES && next !== null; page++) {
    const url: string = next;
    const res: Response = await fetch(url, { cache: "no-store" });
    const json: IgMediaResponse = await res.json();

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

/** Tarik ulang 1 media langsung — field kadang absent di listing tapi ada di sini. */
async function igMediaDetail(mediaId: string): Promise<IgMedia | null> {
  const token = process.env.IG_ACCESS_TOKEN!;
  try {
    const res = await fetch(
      `https://graph.facebook.com/${IG_VERSION}/${mediaId}?fields=${IG_FIELDS}&access_token=${token}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    return (await res.json()) as IgMedia;
  } catch {
    return null;
  }
}

/** Fallback views lewat /insights (video_views sudah deprecated sejak v21). */
async function igViewsFallback(mediaId: string): Promise<number | null> {
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
  return null; // ✅ null, bukan 0
}

async function syncInstagram(shortcode: string): Promise<SyncOutcome> {
  if (!process.env.IG_ACCESS_TOKEN || !process.env.IG_USER_ID) {
    return {
      ...fail("UNSUPPORTED", "IG_ACCESS_TOKEN / IG_USER_ID belum di-set"),
      platform: "Instagram",
      externalId: shortcode,
    };
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

    let views = num(media.views);
    let likes = num(media.like_count);
    let comments = num(media.comments_count);

    // ✅ field absent di listing → coba tarik per-media dulu sebelum menyerah
    if (views === null || likes === null || comments === null) {
      const detail = await igMediaDetail(media.id);
      if (detail) {
        views ??= num(detail.views);
        likes ??= num(detail.like_count);
        comments ??= num(detail.comments_count);
      }
    }

    // views masih kosong (foto lama / carousel) → insights
    if (views === null) views = await igViewsFallback(media.id);

    return settle("Instagram", shortcode, { views, likes, comments });
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

  return settle("TikTok", videoId, {
    views: num(v.view_count),
    likes: num(v.like_count),
    comments: num(v.comment_count),
  });
}

/** Shortlink (vt.tiktok.com / instagram.com/share/...) → URL asli. */
async function resolveRedirect(url: string): Promise<string | null> {
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

  // ✅ TikTok shortlink & IG share-link → ikuti redirect dulu
  if (
    (parsed.platform === "TikTok" || parsed.platform === "Instagram") &&
    !parsed.externalId
  ) {
    const resolved = await resolveRedirect(postUrl);
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