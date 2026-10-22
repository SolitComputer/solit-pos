/**
 * Laporan Marketing — logic bersama (server & client).
 *
 * Sumber data: tabel `sales_online_reports` (Laporan Harian Sales), HANYA baris
 * yang `audited = true`. Kata kunci = kolom `interest` (field "Minat" di form).
 * Rekap dihitung ulang setiap request (tidak disimpan ke tabel lain), jadi:
 *   - tidak ada duplikasi saat laporan diperbarui,
 *   - laporan yang baru diaudit otomatis ikut terhitung di request berikutnya.
 *
 * File ini SENGAJA tidak meng-import modul server-only (supabaseAdmin, dll)
 * supaya aman dipakai juga oleh halaman client.
 */

export const WIB_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Jakarta = UTC+7
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Urutan kolom mengikuti screenshot referensi (WA, Shopee, FB, OLX, Carousell,
// IG, TikTok, Mitra, Reseller), lalu sisa channel yang ada di sistem.
// HARUS berisi semua channel yang ada di type `Channel` Laporan Harian Sales.
export const MARKETING_CHANNELS = [
  "WA",
  "SHOPEE",
  "FB",
  "OLX",
  "CAROUSEL",
  "IG",
  "TIKTOK",
  "MITRA",
  "RESELLER",
  "TOKOPEDIA",
  "ECOMMERCE",
  "SOSMED",
  "THREADS",
] as const;

export type MarketingChannel = (typeof MARKETING_CHANNELS)[number];

const MARKETING_CHANNEL_LABELS: Record<string, string> = {
  WA: "WhatsApp",
  SHOPEE: "Shopee",
  FB: "Facebook",
  OLX: "OLX",
  CAROUSEL: "Carousell",
  IG: "Instagram",
  TIKTOK: "TikTok",
  MITRA: "Mitra",
  RESELLER: "Reseller",
  TOKOPEDIA: "Tokopedia",
  ECOMMERCE: "E-commerce",
  SOSMED: "Sosmed",
  THREADS: "Threads",
};

export function channelLabel(channel: string): string {
  return MARKETING_CHANNEL_LABELS[channel] ?? channel;
}

export type MarketingPeriod = "today" | "week" | "month" | "custom";
export const MARKETING_PERIODS: MarketingPeriod[] = ["today", "week", "month", "custom"];

export interface MarketingReportRow {
  key: string; // kata kunci ter-normalisasi (lowercase, spasi rapi) — dipakai sebagai id grup
  keyword: string; // label tampilan (variasi penulisan yang paling sering dipakai sales)
  channels: Record<string, number>; // qty per channel, hanya channel yang > 0
  total: number; // jumlah semua channel
}

export interface MarketingReportData {
  rows: MarketingReportRow[];
  channels: string[]; // urutan kolom tabel
  channelTotals: Record<string, number>;
  grandTotal: number;
  pendingAuditCount: number; // laporan belum diaudit di periode ini (TIDAK dihitung)
}

export interface AuditedReportLite {
  channel: string | null;
  interest: string | null;
}

function cleanKeyword(raw: string): string {
  return raw.normalize("NFKC").replace(/\s+/g, " ").trim();
}

// "Lenovo  Legion Y520 " dan "lenovo legion y520" dianggap kata kunci yang SAMA.
// Sengaja tidak pakai fuzzy match — "Lenovo X270" vs "Lenovo X270 i5" tetap
// dipisah, supaya barang yang beda spesifikasi tidak tergabung salah.
export function normalizeKeyword(raw: string): string {
  return cleanKeyword(raw).toLowerCase();
}

// Pilih variasi penulisan yang paling sering muncul. Kalau seri, ambil yang
// pertama ketemu (data di-query urut terbaru dulu → penulisan terbaru menang).
function pickDisplayLabel(variants: Map<string, number>): string {
  let best = "";
  let bestCount = -1;
  for (const [label, count] of variants) {
    if (count > bestCount) {
      best = label;
      bestCount = count;
    }
  }
  return best;
}

export function aggregateMarketingReport(
  reports: AuditedReportLite[]
): Omit<MarketingReportData, "pendingAuditCount"> {
  const groups = new Map<
    string,
    { channels: Record<string, number>; total: number; variants: Map<string, number> }
  >();
  const channelTotals: Record<string, number> = {};
  const unknownChannels = new Set<string>();
  const knownChannels = MARKETING_CHANNELS as readonly string[];

  for (const report of reports) {
    const original = cleanKeyword(report.interest ?? "");
    if (!original) continue;

    const key = original.toLowerCase();
    const channel = (report.channel ?? "").trim().toUpperCase() || "LAINNYA";
    if (!knownChannels.includes(channel)) unknownChannels.add(channel);

    let group = groups.get(key);
    if (!group) {
      group = { channels: {}, total: 0, variants: new Map() };
      groups.set(key, group);
    }
    group.channels[channel] = (group.channels[channel] ?? 0) + 1;
    group.total += 1;
    group.variants.set(original, (group.variants.get(original) ?? 0) + 1);

    channelTotals[channel] = (channelTotals[channel] ?? 0) + 1;
  }

  const rows: MarketingReportRow[] = Array.from(groups.entries()).map(([key, g]) => ({
    key,
    keyword: pickDisplayLabel(g.variants),
    channels: g.channels,
    total: g.total,
  }));
  rows.sort((a, b) => b.total - a.total || a.keyword.localeCompare(b.keyword, "id"));

  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);

  return {
    rows,
    // Channel yang tidak dikenal (data lama/typo) tetap ditampilkan sebagai
    // kolom tambahan, supaya total baris = jumlah kolom & tidak ada qty yang hilang.
    channels: [...knownChannels, ...Array.from(unknownChannels).sort()],
    channelTotals,
    grandTotal,
  };
}

// ── Rentang tanggal (WIB) ────────────────────────────────────────────────────

type RangeResult =
  | { success: true; value: { startUtc: string; endUtc: string | null } }
  | { success: false; error: string };

function wibMidnightToUtcIso(wibMidnightMs: number): string {
  return new Date(wibMidnightMs - WIB_OFFSET_MS).toISOString();
}

// "2026-10-22" → epoch ms tengah malam (dalam "jam WIB" yang disimpan sbg UTC).
// Return null kalau format/tanggal tidak valid (mis. 2026-02-31).
function parseWibDate(value: string | null | undefined): number | null {
  if (!value || !DATE_RE.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    return null;
  }
  return ms;
}

// Logika today/week/month SAMA dengan getPeriodStartUtc di
// src/app/api/sales-reports/route.ts (sengaja diduplikasi, bukan di-import,
// supaya route Laporan Harian Sales yang sudah jalan tidak perlu diubah).
export function resolvePeriodRangeUtc(
  period: MarketingPeriod,
  from?: string | null,
  to?: string | null
): RangeResult {
  const nowWib = new Date(Date.now() + WIB_OFFSET_MS);
  const startOfTodayWib = Date.UTC(nowWib.getUTCFullYear(), nowWib.getUTCMonth(), nowWib.getUTCDate());

  if (period === "today") {
    return { success: true, value: { startUtc: wibMidnightToUtcIso(startOfTodayWib), endUtc: null } };
  }

  if (period === "week") {
    const day = new Date(startOfTodayWib).getUTCDay(); // 0 = Minggu
    const diffToMonday = day === 0 ? 6 : day - 1;
    return {
      success: true,
      value: { startUtc: wibMidnightToUtcIso(startOfTodayWib - diffToMonday * DAY_MS), endUtc: null },
    };
  }

  if (period === "month") {
    const startOfMonthWib = Date.UTC(nowWib.getUTCFullYear(), nowWib.getUTCMonth(), 1);
    return { success: true, value: { startUtc: wibMidnightToUtcIso(startOfMonthWib), endUtc: null } };
  }

  // custom: from & to inklusif (YYYY-MM-DD, WIB)
  const fromMs = parseWibDate(from);
  const toMs = parseWibDate(to);
  if (fromMs === null || toMs === null) {
    return { success: false, error: "Tanggal tidak valid (format YYYY-MM-DD)" };
  }
  if (fromMs > toMs) {
    return { success: false, error: "Tanggal awal tidak boleh setelah tanggal akhir" };
  }
  return {
    success: true,
    value: { startUtc: wibMidnightToUtcIso(fromMs), endUtc: wibMidnightToUtcIso(toMs + DAY_MS) },
  };
}

// Tanggal hari ini (WIB) format YYYY-MM-DD — untuk default input tanggal.
export function todayWibDate(): string {
  return new Date(Date.now() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}