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

export const CC_STATUS_META: Record<CCStatus, { label: string; className: string }> = {
  BELUM_SELESAI: { label: "Belum Selesai", className: "bg-gray-100 text-gray-600" },
  PROSES:        { label: "Proses",        className: "bg-amber-100 text-amber-700" },
  SIAP_POSTING:  { label: "Siap Posting",  className: "bg-blue-100 text-blue-700" },
  POSTED:        { label: "Sudah Posting", className: "bg-emerald-100 text-emerald-700" },
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