// src/lib/ccReports.ts
import type { SyncStatus } from "./ccMetrics";

export type CCStatus =
  | "BELUM_SELESAI"
  | "PROSES"
  | "SIAP_POSTING"
  | "POSTED"
  | "SELESAI";

export interface CCPosting {
  id: string;
  report_id: string;
  platform: string;
  post_url: string | null;
  posted_at: string | null;
  views: number;
  likes: number;
  comments: number;

  // ── auto-sync ──
  external_id?: string | null;
  auto_sync?: boolean;
  last_synced_at?: string | null;
  sync_status?: SyncStatus | null;
  sync_error?: string | null;

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

  posting_done: boolean;
  posting_done_at: string | null;

  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;

  postings?: CCPosting[];
  status?: CCStatus;
}

export function computeStatus(
  r: Pick<CCReport, "take_done" | "edit_done"> & {
    posting_done?: boolean;
    postings?: CCPosting[];
  }
): CCStatus {
  if (r.posting_done) return "SELESAI";
  if ((r.postings?.length ?? 0) > 0) return "POSTED";
  if (r.edit_done) return "SIAP_POSTING";
  if (r.take_done) return "PROSES";
  return "BELUM_SELESAI";
}

export function canStartPosting(r: Pick<CCReport, "edit_done">): boolean {
  return Boolean(r.edit_done);
}

export function canFinish(r: { postings?: CCPosting[]; posting_done?: boolean }): boolean {
  return (r.postings?.length ?? 0) > 0 && !r.posting_done;
}

// ── ganti CC_STATUS_META ──
export const CC_STATUS_META: Record<CCStatus, { label: string; className: string }> = {
  BELUM_SELESAI: { label: "Belum Mulai",    className: "bg-gray-100 text-gray-600 ring-1 ring-gray-200" },
  PROSES:        { label: "Menunggu Edit",  className: "bg-amber-50 text-amber-700 ring-1 ring-amber-200" },
  SIAP_POSTING:  { label: "Siap Posting",   className: "bg-blue-50 text-blue-700 ring-1 ring-blue-200" },
  POSTED:        { label: "Sudah Posting",  className: "bg-violet-50 text-violet-700 ring-1 ring-violet-200" },
  SELESAI:       { label: "Selesai ✓",      className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
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

// ── Filter grid halaman Analisa ──────────────────────────────────────────────
export const CORE_PLATFORMS = ["YouTube", "TikTok", "Instagram", "Shopee"] as const;

export const ANALISA_FILTERS = [
  { key: "ALL", label: "Semua", color: "#111827" },
  { key: "YouTube", label: "YouTube", color: PLATFORM_COLOR.YouTube },
  { key: "TikTok", label: "TikTok", color: PLATFORM_COLOR.TikTok },
  { key: "Instagram", label: "Instagram", color: PLATFORM_COLOR.Instagram },
  { key: "Shopee", label: "Shopee", color: PLATFORM_COLOR.Shopee },
  { key: "OTHER", label: "Lainnya", color: PLATFORM_COLOR.Lainnya },
] as const;

export type AnalisaFilter = (typeof ANALISA_FILTERS)[number]["key"];

export function matchFilter(platform: string, f: AnalisaFilter): boolean {
  if (f === "ALL") return true;
  if (f === "OTHER") return !(CORE_PLATFORMS as readonly string[]).includes(platform);
  return platform === f;
}

// ── datetime helpers ─────────────────────────────────────────────────────────
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
export function minutesBetween(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.round(ms / 60000);
}
export function fmtMinutes(m?: number | null): string {
  if (m == null || m <= 0) return "—";
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}j ${m % 60}m` : `${m}m`;
}
export function durationLabel(start?: string | null, end?: string | null): string {
  return fmtMinutes(minutesBetween(start, end));
}

// ── Formatter angka ──────────────────────────────────────────────────────────
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
export function pctDelta(cur: number, prev: number): number | null {
  if (!prev) return cur > 0 ? null : 0;
  return ((cur - prev) / prev) * 100;
}

// ── Tipe response /api/cc-reports/analytics ──────────────────────────────────
export type CCRange = "7" | "30" | "90" | "all";
export type CCMetric = "views" | "likes" | "comments";

export interface CCMetricTotals {
  views: number;
  likes: number;
  comments: number;
  postCount: number;
}

export interface CCPlatformStat extends CCMetricTotals {
  platform: string;
  post_url: string | null;
  posted_at: string | null;
}

export interface CCContentRow {
  report_id: string;
  title: string;
  perPlatform: Record<string, CCPlatformStat>;
  platforms: string[];
  totals: CCMetricTotals;
}

export interface CCProcessRow {
  report_id: string;
  title: string;
  takeMinutes: number | null;      // take_start → take_end
  handoffMinutes: number | null;   // take_end → take_received_editor
  editMinutes: number | null;      // edit_start → edit_end
  totalMinutes: number | null;     // take_start → edit_end
  take_done: boolean;
  edit_done: boolean;
}

export interface CCProcessSummary {
  avgTake: number | null;
  avgHandoff: number | null;
  avgEdit: number | null;
  avgTotal: number | null;
  count: number;
}

export interface CCAnalytics {
  success: true;
  range: CCRange;
  contents: CCContentRow[];
  prevByPlatform: Record<string, CCMetricTotals>;
  process: { rows: CCProcessRow[]; summary: CCProcessSummary };
  lastSyncedAt: string | null;
  issues: CCSyncIssueSummary;      
  problems: CCSyncIssue[];         
}

export interface CCSyncIssue {
  report_id: string;
  title: string;
  platform: string;
  post_url: string | null;
  sync_status: SyncStatus;
  sync_error: string | null;
  last_synced_at: string | null;
}

export interface CCSyncIssueSummary {
  ok: number;
  partial: number;
  error: number;
  pending: number;
}