// src/lib/ccSync.ts
// ⚠️ SERVER ONLY — jangan di-import dari komponen "use client"
import { getValidAccessToken } from "./ccTikTok";
import { getValidIgToken, IG_VERSION } from "./ccInstagram";
import { parsePostUrl, isInstagramStory, type SyncStatus } from "./ccMetrics";

/**
 * null = API TIDAK mengembalikan metrik ini (bukan berarti nol).
 * Nilai lama di DB tidak boleh ditimpa 0 hanya karena field-nya absent.
 */
export interface SyncOutcome {
  status: SyncStatus;
  views: number | null;
  likes: number | null;
  comments: number | null;
  error: string | null;
  externalId: string | null;
  /** IG media ID asli dari Meta — disimpan supaya sync berikutnya langsung & live */
  providerMediaId: string | null;
  platform: string | null;
}

export interface SyncOptions {
  /** true = tombol sync / cron force → buang cache RAM, tarik ulang dari sumber */
  force?: boolean;
  /** provider_media_id yang sudah tersimpan → skip scan daftar media */
  mediaId?: string | null;
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
  status, views: null, likes: null, comments: null,
  error, externalId: null, providerMediaId: null, platform: null,
});

/** OK = semua metrik didapat. PARTIAL = ada yang tidak dikembalikan API. */
function settle(
  platform: string,
  externalId: string,
  m: Record<MetricKey, number | null>,
  providerMediaId: string | null = null
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
    providerMediaId,
    platform,
  };
}

/**
 * Patch DB dari hasil sync.
 * ✅ Hanya menulis metrik yang benar-benar didapat → angka manual/lama aman.
 */
export function buildPostingPatch(
  out: SyncOutcome,
  prev?: { external_id?: string | null; provider_media_id?: string | null }
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    last_synced_at: new Date().toISOString(),
    sync_status: out.status,
    sync_error: out.error,
    external_id: out.externalId ?? prev?.external_id ?? null,
    provider_media_id: out.providerMediaId ?? prev?.provider_media_id ?? null,
  };

  if (out.status === "OK" || out.status === "PARTIAL") {
    if (out.views !== null) patch.views = out.views;
    if (out.likes !== null) patch.likes = out.likes;
    if (out.comments !== null) patch.comments = out.comments;
  }
  return patch;
}

/**
 * Cache-buster — HANYA untuk YouTube.
 * ⚠️ JANGAN dipakai di Graph API: Meta bukan CDN, param tak dikenal bisa ditolak,
 *    dan staleness IG berasal dari cache agregat di server Meta (bukan HTTP cache)
 *    sehingga query param tidak menyelesaikan apa pun.
 */
function bust(url: string, force?: boolean): string {
  if (!force) return url;
  return `${url}${url.includes("?") ? "&" : "?"}_cb=${Date.now()}`;
}

const NO_CACHE: RequestInit = {
  cache: "no-store",
  headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
};

// ── YouTube ──────────────────────────────────────────────────────────────────
async function syncYouTube(videoId: string, opt: SyncOptions): Promise<SyncOutcome> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return fail("UNSUPPORTED", "YOUTUBE_API_KEY belum di-set di env");

  const url = bust(
    `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(videoId)}&key=${key}`,
    opt.force
  );
  const res = await fetch(url, NO_CACHE);
  const json = await res.json();

  if (!res.ok) {
    return {
      ...fail("ERROR", json?.error?.message ?? `HTTP ${res.status}`),
      platform: "YouTube",
      externalId: videoId,
    };
  }

  const s = json?.items?.[0]?.statistics;
  if (!s) {
    return {
      ...fail("ERROR", "Video tidak ditemukan / private / dihapus"),
      platform: "YouTube",
      externalId: videoId,
    };
  }

  return settle("YouTube", videoId, {
    views: num(s.viewCount),
    likes: num(s.likeCount),       // absent kalau like disembunyikan → null (BUKAN 0)
    comments: num(s.commentCount), // absent kalau komentar dimatikan → null
  });
}

// ── Instagram ────────────────────────────────────────────────────────────────
const IG_TTL = 60_000;
const IG_MAX_PAGES = 15; // ±1500 konten terakhir

const IG_FIELDS = "id,permalink,media_type,like_count,comments_count,views";
/** Field minimum yang dijamin ada di semua media type (IMAGE / CAROUSEL / VIDEO). */
const IG_FIELDS_SAFE = "id,permalink,media_type,like_count,comments_count";

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
interface IgDetailResult {
  media: IgMedia | null;
  error: string | null;
}

/**
 * ⚠️ Cache ini HANYA untuk memetakan shortcode → media ID.
 * Metrik di endpoint /media (list) di-cache Meta dan tertinggal beberapa menit
 * (inilah sebab "like 14 padahal 15"). Angka SELALU diambil ulang lewat
 * endpoint single-media di igMediaDetail(); data list cuma cadangan terakhir.
 */
let igCache: { at: number; map: Map<string, IgMedia> } | null = null;

/** Proses PM2 persisten → cache tidak mati sendiri. Route sync memanggil ini saat force. */
export function clearIgCache(): void {
  igCache = null;
}

function shortcodeOf(permalink: string): string | null {
  return permalink.match(/\/(?:p|reel|reels|tv)\/([\w-]+)/)?.[1] ?? null;
}

async function loadIgMedia(
  token: string,
  igUserId: string,
  force?: boolean
): Promise<Map<string, IgMedia>> {
  // ✅ force → buang cache RAM. Tanpa ini, tombol sync tidak berefek selama 60 detik.
  if (force) igCache = null;
  if (igCache && Date.now() - igCache.at < IG_TTL) return igCache.map;

  const map = new Map<string, IgMedia>();

  let next: string | null =
    `https://graph.facebook.com/${IG_VERSION}/${igUserId}/media` +
    `?fields=${IG_FIELDS}&limit=100&access_token=${encodeURIComponent(token)}`;

  for (let page = 0; page < IG_MAX_PAGES && next !== null; page++) {
    const url: string = next;
    const res: Response = await fetch(url, NO_CACHE);
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

/**
 * ✅ SUMBER KEBENARAN METRIK IG — angka LIVE, persis seperti di app Instagram.
 *
 * Field `views` tidak valid untuk sebagian media type (IMAGE / CAROUSEL). Kalau
 * satu field saja error, Graph API menolak SELURUH request — jadi kita retry
 * dengan field aman, bukan langsung menyerah. Pesan error asli dari Meta
 * diteruskan ke pemanggil, tidak ditelan.
 */
async function igMediaDetail(mediaId: string, token: string): Promise<IgDetailResult> {
  const attempt = async (fields: string): Promise<IgDetailResult> => {
    try {
      const res = await fetch(
        `https://graph.facebook.com/${IG_VERSION}/${mediaId}?fields=${fields}&access_token=${encodeURIComponent(token)}`,
        NO_CACHE
      );
      const json = (await res.json()) as IgMedia & { error?: { message?: string } };

      if (!res.ok) {
        return { media: null, error: json?.error?.message ?? `IG detail HTTP ${res.status}` };
      }
      return { media: json, error: null };
    } catch (e) {
      return {
        media: null,
        error: e instanceof Error ? e.message : "Gagal ambil detail media IG",
      };
    }
  };

  const full = await attempt(IG_FIELDS);
  if (full.media) return full;

  // ✅ kemungkinan besar `views` tidak didukung media type ini → coba field aman
  const safe = await attempt(IG_FIELDS_SAFE);
  if (safe.media) return safe;

  return { media: null, error: full.error ?? safe.error };
}

/** Fallback views lewat /insights (video_views sudah deprecated sejak v21). */
async function igViewsFallback(mediaId: string, token: string): Promise<number | null> {
  for (const metric of ["views", "reach"] as const) {
    try {
      const res = await fetch(
        `https://graph.facebook.com/${IG_VERSION}/${mediaId}/insights?metric=${metric}&access_token=${encodeURIComponent(token)}`,
        NO_CACHE
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

async function syncInstagram(shortcode: string, opt: SyncOptions): Promise<SyncOutcome> {
  const auth = await getValidIgToken();
  if (auth.token === null) {
    return { ...fail("ERROR", auth.error), platform: "Instagram", externalId: shortcode };
  }

  try {
    // ── 1. Media ID ─────────────────────────────────────────────────────────
    let mediaId: string | null = opt.mediaId ?? null;
    let listed: IgMedia | undefined;   // ✅ hasil list disimpan sebagai cadangan

    if (!mediaId) {
      const map = await loadIgMedia(auth.token, auth.igUserId, opt.force);
      listed = map.get(shortcode);
      if (!listed) {
        return {
          ...fail(
            "ERROR",
            "Konten tidak ditemukan di akun IG Solit — metrik IG hanya bisa untuk konten sendiri"
          ),
          platform: "Instagram",
          externalId: shortcode,
        };
      }
      mediaId = listed.id;
    }

    // ── 2. Metrik LIVE dari single-media endpoint ────────────────────────────
    const { media: detail, error: detailErr } = await igMediaDetail(mediaId, auth.token);

    // media ID tersimpan ternyata basi (post dihapus / ganti akun) → resolve ulang
    if (!detail && opt.mediaId) {
      clearIgCache();
      return syncInstagram(shortcode, { ...opt, mediaId: null, force: true });
    }

    // ✅ Detail gagal tapi list punya angkanya → JANGAN dibuang. Pakai, tandai PARTIAL.
    //    Membuang data yang sudah di tangan = regresi; angka basi tetap lebih baik
    //    daripada tidak ada angka sama sekali.
    const src = detail ?? listed ?? null;

    if (!src) {
      return {
        ...fail("ERROR", detailErr ?? "Gagal membaca metrik IG"),
        platform: "Instagram",
        externalId: shortcode,
        providerMediaId: mediaId,   // ✅ tetap disimpan — sync berikutnya tidak perlu scan ulang
      };
    }

    let views = num(src.views);
    const likes = num(src.like_count);
    const comments = num(src.comments_count);

    if (views === null) views = await igViewsFallback(mediaId, auth.token);

    const out = settle("Instagram", shortcode, { views, likes, comments }, mediaId);

    if (!detail) {
      // angka valid, tapi berasal dari list → bisa tertinggal beberapa menit
      return {
        ...out,
        status: "PARTIAL",
        error: `Angka diambil dari daftar (bisa tertinggal beberapa menit). Detail media gagal: ${detailErr ?? "tidak diketahui"}`,
      };
    }

    return out;
  } catch (e) {
    clearIgCache(); // token invalid di tengah jalan → jangan biarkan cache nyangkut
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
        "Cache-Control": "no-cache",
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
export async function syncPosting(
  postUrl: string | null,
  opt: SyncOptions = {}
): Promise<SyncOutcome> {
  if (!postUrl) return fail("PENDING", "Link posting belum diisi");

  let parsed = parsePostUrl(postUrl);
  if (!parsed) return fail("ERROR", "Format link tidak valid");

  if (isInstagramStory(postUrl)) {
    return {
      ...fail(
        "UNSUPPORTED",
        "Instagram Story tidak tersedia di API (konten hilang setelah 24 jam) — isi view/like/komen manual"
      ),
      platform: "Instagram",
    };
  }

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
    case "YouTube":   return syncYouTube(parsed.externalId, opt);
    case "Instagram": return syncInstagram(parsed.externalId, opt);
    case "TikTok":    return syncTikTok(parsed.externalId);
    default:
      return {
        ...fail("UNSUPPORTED", `${parsed.platform} belum didukung auto-sync`),
        platform: parsed.platform,
      };
  }
}