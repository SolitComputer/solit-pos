// src/lib/ccReports.ts

export type CCStatus = "BELUM_SELESAI" | "PROSES" | "SIAP_POSTING" | "POSTED";

export interface CCPosting {
  id: string;
  report_id: string;
  platform: string;
  post_url: string | null;
  posted_at: string | null;
  views: number;
  likes: number;
  comments: number;
  created_at?: string;
  updated_at?: string;
}

export interface CCReport {
  id: string;
  title: string;

  take_done: boolean;
  videographer: string | null;
  talent: string | null;
  location: string | null;
  equipment: string | null;
  take_start: string | null;
  take_end: string | null;
  take_received_editor: string | null;

  edit_done: boolean;
  editor_name: string | null;
  editor_work: string | null;
  edit_start: string | null;
  edit_end: string | null;
  ready_folder_link: string | null;

  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;

  postings?: CCPosting[];
  status?: CCStatus; // di-attach API
}

export function computeStatus(r: Pick<CCReport, "take_done" | "edit_done"> & { postings?: CCPosting[] }): CCStatus {
  const posted = (r.postings?.length ?? 0) > 0;
  if (posted) return "POSTED";
  if (r.take_done && r.edit_done) return "SIAP_POSTING";
  if (r.take_done || r.edit_done) return "PROSES";
  return "BELUM_SELESAI";
}

export function canStartPosting(r: Pick<CCReport, "take_done" | "edit_done">): boolean {
  return Boolean(r.take_done || r.edit_done);
}

export const CC_STATUS_META: Record<CCStatus, { label: string; className: string }> = {
  BELUM_SELESAI: { label: "Belum Mulai",   className: "bg-gray-100 text-gray-600 ring-1 ring-gray-200" },
  PROSES:        { label: "Bisa Posting",  className: "bg-amber-50 text-amber-700 ring-1 ring-amber-200" },
  SIAP_POSTING:  { label: "Siap Posting",  className: "bg-blue-50 text-blue-700 ring-1 ring-blue-200" },
  POSTED:        { label: "Sudah Posting", className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
};

export const CC_PLATFORMS = [
  "Instagram", "Facebook", "YouTube", "TikTok", "Shopee", "Tokopedia", "Lainnya",
] as const;

export const PLATFORM_COLOR: Record<string, string> = {
  Instagram: "#E1306C",
  Facebook: "#1877F2",
  YouTube: "#FF0000",
  TikTok: "#000000",
  Shopee: "#EE4D2D",
  Tokopedia: "#42B549",
  Lainnya: "#6B7280",
};

// ── datetime-local <-> ISO (browser TZ = WIB untuk user lo) ──
export function isoToLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function localInputToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
export function fmtDateTime(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
export function durationLabel(start?: string | null, end?: string | null): string {
  if (!start || !end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms <= 0) return "—";
  const m = Math.round(ms / 60000);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}j ${m % 60}m` : `${m}m`;
}

// ── Formatter angka ──
export function fmtNum(n: number): string {
  return (n || 0).toLocaleString("id-ID");
}

export function fmtCompact(n: number): string {
  const v = n || 0;
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return (v / 1e9).toFixed(1).replace(".", ",") + "M";
  if (abs >= 1_000_000) return (v / 1e6).toFixed(abs >= 1e7 ? 0 : 1).replace(".", ",") + "jt";
  if (abs >= 1_000) return (v / 1e3).toFixed(abs >= 1e4 ? 0 : 1).replace(".", ",") + "rb";
  return String(v);
}

/** Persentase perubahan vs periode sebelumnya. null = tidak ada baseline. */
export function pctDelta(cur: number, prev: number): number | null {
  if (!prev) return cur > 0 ? null : 0;
  return ((cur - prev) / prev) * 100;
}

// ── Tipe response /api/cc-reports/analytics ──
export type CCRange = "7" | "30" | "90" | "all";

export interface CCTimelinePoint {
  date: string;          // YYYY-MM-DD (WIB)
  views: number;
  likes: number;
  comments: number;
  posts: number;
  cumViews: number;
  cumLikes: number;
  cumComments: number;
}

export interface CCAnalytics {
  success: true;
  range: CCRange;
  timeline: CCTimelinePoint[];
  perContent: {
    report_id: string;
    title: string;
    views: number;
    likes: number;
    comments: number;
    postCount: number;
    platforms: string[];
  }[];
  platformTotals: { platform: string; views: number; likes: number; comments: number; count: number }[];
  topPosts: {
    id: string;
    title: string;
    platform: string;
    post_url: string | null;
    posted_at: string | null;
    views: number;
    likes: number;
    comments: number;
  }[];
  totals: { views: number; likes: number; comments: number; postCount: number; contentCount: number };
  prevTotals: { views: number; likes: number; comments: number; postCount: number };
}