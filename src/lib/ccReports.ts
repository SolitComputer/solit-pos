// src/lib/ccReports.ts
import type { SyncStatus } from "./ccMetrics";

/* ── Brand / Divisi ──────────────────────────────────────────────────────── */

export const CC_BRANDS = ["Solit", "OnPoint", "Sotech", "Zenit"] as const;
export type CCBrand = (typeof CC_BRANDS)[number];
export type BrandFilter = "ALL" | CCBrand;

export const DEFAULT_BRAND: CCBrand = "Solit";

export const BRAND_META: Record<CCBrand, { label: string; color: string; className: string }> = {
  Solit: { label: "Solit 03", color: "#7c3aed", className: "bg-violet-50 text-violet-700 ring-1 ring-violet-200" },
  OnPoint: { label: "OnPoint", color: "#0ea5e9", className: "bg-sky-50 text-sky-700 ring-1 ring-sky-200" },
  Sotech: { label: "Sotech", color: "#10b981", className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
  Zenit: { label: "Zenit", color: "#f59e0b", className: "bg-amber-50 text-amber-700 ring-1 ring-amber-200" },
};

export const BRAND_TABS: { key: BrandFilter; label: string; color: string }[] = [
  { key: "ALL", label: "Semua", color: "#111827" },
  ...CC_BRANDS.map((b) => ({ key: b as BrandFilter, label: BRAND_META[b].label, color: BRAND_META[b].color })),
];

export function isCCBrand(v: unknown): v is CCBrand {
  return typeof v === "string" && (CC_BRANDS as readonly string[]).includes(v);
}

/** Normalisasi input brand dari body/query — fallback ke default, bukan throw. */
export function normalizeBrand(v: unknown): CCBrand {
  return isCCBrand(v) ? v : DEFAULT_BRAND;
}

/* ── Status ──────────────────────────────────────────────────────────────── */

export type CCStatus =
  | "BELUM_SELESAI"
  | "PROSES"
  | "REVISI"
  | "SIAP_POSTING"
  | "POSTED"
  | "SELESAI"
  | "BATAL";

export interface CCPosting {
  id: string;
  report_id: string;
  platform: string;
  post_url: string | null;
  posted_at: string | null;
  views: number;
  likes: number;
  comments: number;

  external_id?: string | null;
  provider_media_id?: string | null;
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
  brand: CCBrand;
  posting_count?: number;

  take_done: boolean;
  videographer: string | null;
  talent: string | null;
  location: string | null;
  equipment: string | null;
  take_start: string | null;
  take_end: string | null;
  take_received_editor: string | null;
  device: string | null;

  edit_done: boolean;
  needs_revision?: boolean;
  editor_name: string | null;
  editor_work: string | null;
  edit_start: string | null;
  edit_end: string | null;
  ready_folder_link: string | null;

  posting_done: boolean;
  posting_done_at: string | null;
  is_cancelled?: boolean;

  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;

  postings?: CCPosting[];
  status?: CCStatus;
}

/**
 * Sumber kebenaran status. Urutan cek WAJIB sama dengan filter SQL
 * di /api/cc-reports (posting_done → posting_count → edit_done → take_done).
 */
export function computeStatus(
  r: Pick<CCReport, "take_done" | "edit_done"> & {
    posting_done?: boolean;
    posting_count?: number;
    postings?: CCPosting[];
    needs_revision?: boolean;
    is_cancelled?: boolean;
  }
): CCStatus {
  if (r.is_cancelled) return "BATAL"; // ✅ prioritas tertinggi — override semua status lain
  if (r.posting_done) return "SELESAI";
  if (r.needs_revision) return "REVISI"; // ✅ dicek duluan, sebelum posts>0
  const posts = r.posting_count ?? r.postings?.length ?? 0;
  if (posts > 0) return "POSTED";
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

export const CC_STATUS_META: Record<CCStatus, { label: string; className: string }> = {
  BELUM_SELESAI: { label: "Belum Mulai", className: "bg-gray-100 text-gray-600 ring-1 ring-gray-200" },
  PROSES: { label: "Menunggu Edit", className: "bg-amber-50 text-amber-700 ring-1 ring-amber-200" },
  REVISI: { label: "Revisi", className: "bg-red-50 text-red-700 ring-1 ring-red-200" },
  SIAP_POSTING: { label: "Siap Posting", className: "bg-blue-50 text-blue-700 ring-1 ring-blue-200" },
  POSTED: { label: "Sudah Posting", className: "bg-violet-50 text-violet-700 ring-1 ring-violet-200" },
  SELESAI: { label: "Selesai ✓", className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
  BATAL: { label: "Batal", className: "bg-gray-200 text-gray-500 ring-1 ring-gray-300" },
};

/* ── Platform ────────────────────────────────────────────────────────────── */

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

/* ── Rentang waktu (WIB) ─────────────────────────────────────────────────── */
// ⚠️ Semua batas hari dihitung di WIB (UTC+7). Kalau pakai UTC, konten yang
//    diposting jam 06:00 WIB akan masuk hitungan "kemarin".

export const WIB_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;

export type CCRange = "today" | "7" | "30" | "90" | "all" | "custom";

export const CC_RANGES: { key: CCRange; label: string }[] = [
  { key: "today", label: "Hari Ini" },
  { key: "7", label: "7 Hari" },
  { key: "30", label: "30 Hari" },
  { key: "90", label: "90 Hari" },
  { key: "all", label: "Semua" },
  { key: "custom", label: "📅 Pilih Tanggal" },
];

/** "YYYY-MM-DD" menurut kalender WIB. */
export function wibDateStr(d: Date = new Date()): string {
  return new Date(d.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}
export function wibStartMs(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00.000+07:00`).getTime();
}
export function wibEndMs(dateStr: string): number {
  return new Date(`${dateStr}T23:59:59.999+07:00`).getTime();
}
export function shiftDateStr(dateStr: string, days: number): string {
  return wibDateStr(new Date(wibStartMs(dateStr) + days * DAY_MS));
}
export function isDateStr(v?: string | null): v is string {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
}
export function fmtDay(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00+07:00`).toLocaleDateString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

export interface ResolvedRange {
  key: CCRange;
  /** null = tanpa batas bawah (range "all") */
  startCur: number | null;
  endCur: number;
  /** null = tidak ada periode pembanding */
  startPrev: number | null;
  endPrev: number | null;
  label: string;
  from: string | null;
  to: string | null;
}

/** Dipakai SERVER & CLIENT — satu sumber kebenaran batas periode. */
export function resolveRange(
  key: string | null | undefined,
  from?: string | null,
  to?: string | null
): ResolvedRange {
  const now = Date.now();
  const k = (key ?? "30") as CCRange;

  if (k === "custom" && isDateStr(from)) {
    const rawEnd = isDateStr(to) ? to : from;
    const [a, b] = wibStartMs(from) <= wibStartMs(rawEnd) ? [from, rawEnd] : [rawEnd, from];
    const startCur = wibStartMs(a);
    const endCur = wibEndMs(b);
    const span = endCur - startCur;
    return {
      key: "custom",
      startCur,
      endCur,
      startPrev: startCur - span - 1,
      endPrev: startCur - 1,
      label: a === b ? fmtDay(a) : `${fmtDay(a)} – ${fmtDay(b)}`,
      from: a,
      to: b,
    };
  }

  if (k === "today") {
    const d = wibDateStr();
    const y = shiftDateStr(d, -1);
    return {
      key: "today",
      startCur: wibStartMs(d),
      endCur: now,
      startPrev: wibStartMs(y),
      endPrev: wibEndMs(y),
      label: `Hari ini · ${fmtDay(d)}`,
      from: d,
      to: d,
    };
  }

  if (k === "all") {
    return {
      key: "all",
      startCur: null,
      endCur: now,
      startPrev: null,
      endPrev: null,
      label: "Seluruh periode",
      from: null,
      to: null,
    };
  }

  const days = Math.max(1, Number(k) || 30);
  const startCur = now - days * DAY_MS;
  return {
    key: String(days) as CCRange,
    startCur,
    endCur: now,
    startPrev: now - 2 * days * DAY_MS,
    endPrev: startCur - 1,
    label: `${days} hari terakhir`,
    from: wibDateStr(new Date(startCur)),
    to: wibDateStr(new Date(now)),
  };
}

/* ── datetime helpers ────────────────────────────────────────────────────── */

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

/* ── Formatter angka ─────────────────────────────────────────────────────── */

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

/* ── Tipe response API ───────────────────────────────────────────────────── */

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
  brand: CCBrand;
  perPlatform: Record<string, CCPlatformStat>;
  platforms: string[];
  totals: CCMetricTotals;
}

export interface CCProcessRow {
  report_id: string;
  title: string;
  brand: CCBrand;
  takeMinutes: number | null;
  handoffMinutes: number | null;
  editMinutes: number | null;
  totalMinutes: number | null;
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

export interface CCAnalytics {
  success: true;
  range: CCRange;
  rangeLabel: string;
  period: { from: string | null; to: string | null };
  brand: BrandFilter;
  contents: CCContentRow[];
  byBrand: Record<string, CCMetricTotals>;
  prevByPlatform: Record<string, CCMetricTotals>;
  process: { rows: CCProcessRow[]; summary: CCProcessSummary };
  lastSyncedAt: string | null;
  issues: CCSyncIssueSummary;
  problems: CCSyncIssue[];
}

/* ── Response list report (paginated) ────────────────────────────────────── */

export interface CCReportListResponse {
  success: true;
  reports: CCReport[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}