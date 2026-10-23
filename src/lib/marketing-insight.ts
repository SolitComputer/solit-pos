// Tipe & helper bersama untuk fitur "Laporan Insight" (sheet bulanan ala Excel).
// Dipakai di API route maupun komponen client → JANGAN import modul server-only.

export type InsightAlign = "left" | "center" | "right";

export interface InsightColumn {
  id: string;
  name: string;
  align?: InsightAlign; // perataan isi kolom (default: left). null/undefined = kiri.
}

// Map align → class Tailwind (ditulis literal supaya tidak ke-purge).
export const INSIGHT_ALIGN_CLASS: Record<InsightAlign, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

export interface InsightRow {
  id: string; // mode harian: "YYYY-MM-DD" (tanggal penuh). Sparse: hanya tanggal terisi.
  cells: Record<string, string>; // colId -> nilai (teks/angka)
  colors?: Record<string, string>; // colId -> key warna (lihat INSIGHT_COLORS)
}

export type InsightRowMode = "daily" | "manual";

export interface InsightSheet {
  id: string;
  name: string;
  period: string | null; // "YYYY-MM" (bulan tabel, utk mode harian). null = bulan berjalan.
  row_mode: InsightRowMode; // "daily" = baris auto per tanggal; "manual" = baris bebas
  columns: InsightColumn[];
  rows: InsightRow[];
  sort_order: number;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

// Id lokal untuk kolom (dibuat di client, jadi key tiap cell).
export function makeLocalId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Jakarta = UTC+7

// Bulan berjalan (WIB) format "YYYY-MM" — default period tabel baru.
export function currentPeriodWib(): string {
  return new Date(Date.now() + WIB_OFFSET_MS).toISOString().slice(0, 7);
}

export interface MonthDate {
  id: string; // "YYYY-MM-DD"
  day: number; // 1..31
  weekday: string; // "Min".."Sab"
  isWeekend: boolean;
  isSunday: boolean;
}

// Daftar tanggal 1..akhir-bulan untuk sebuah period ("YYYY-MM").
export function monthDates(period: string): MonthDate[] {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return [];
  const total = new Date(y, m, 0).getDate(); // hari 0 bulan berikutnya = tgl terakhir bulan ini
  const wd = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  const out: MonthDate[] = [];
  for (let d = 1; d <= total; d++) {
    const dow = new Date(y, m - 1, d).getDay();
    out.push({
      id: `${period}-${String(d).padStart(2, "0")}`,
      day: d,
      weekday: wd[dow],
      isWeekend: dow === 0 || dow === 6,
      isSunday: dow === 0,
    });
  }
  return out;
}

// Ambil angka dari sel untuk baris TOTAL (buang "Rp", titik, spasi, dll).
export function parseInsightNumber(v: string | undefined | null): number {
  if (!v) return 0;
  const n = parseFloat(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// Palet penanda warna sel (ditulis literal supaya tidak ke-purge Tailwind).
export const INSIGHT_COLORS: { key: string; label: string; bg: string; dot: string }[] = [
  { key: "red", label: "Merah", bg: "bg-red-100", dot: "bg-red-400" },
  { key: "amber", label: "Kuning", bg: "bg-amber-100", dot: "bg-amber-400" },
  { key: "green", label: "Hijau", bg: "bg-green-100", dot: "bg-green-400" },
  { key: "blue", label: "Biru", bg: "bg-blue-100", dot: "bg-blue-400" },
  { key: "violet", label: "Ungu", bg: "bg-violet-100", dot: "bg-violet-400" },
];

export const INSIGHT_COLOR_BG: Record<string, string> = Object.fromEntries(
  INSIGHT_COLORS.map((c) => [c.key, c.bg])
);