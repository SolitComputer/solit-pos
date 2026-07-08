// src/lib/cashflow.ts

export type CashflowDirection = "IN" | "OUT";

// ── Tanggal mulai cashflow: 08 Jul 2026 ───────────────────────────────────────
export const CASHFLOW_START_DATE = "2026-07-08";
export const CASHFLOW_CUTOFF_ISO = "2026-07-08T00:00:00+07:00";

// ── Modal Awal: aktif 08 Jul → 09 Jul 2026 (2 hari, WIB) ──────────────────────
export const MODAL_AWAL_DEADLINE_ISO = "2026-07-09T23:59:59+07:00";

/** true = masih dalam periode boleh isi modal awal */
export function isModalAwalActive(): boolean {
  return new Date() <= new Date(MODAL_AWAL_DEADLINE_ISO);
}

// ── Kategori Uang Masuk ──────────────────────────────────────────────────────
export const INCOME_CATEGORIES = {
  PENJUALAN_LAPTOP: "Penjualan Laptop",
  SERVICE: "Service",
  AKSESORIS: "Aksesoris",
  UTANG: "Utang",
  SEWA: "Sewa",
  PENJUALAN_ASET: "Penjualan Aset",
} as const;

// ── Kategori Uang Keluar ─────────────────────────────────────────────────────
export const EXPENSE_CATEGORIES = {
  OPERASIONAL_HARIAN: "Operasional Harian",
  OPERASIONAL_BULANAN: "Operasional Bulanan",
  BELANJA_LAPTOP: "Belanja Laptop",
  AKSESORIS: "Aksesoris",
  MODAL_SERVICE: "Modal Service",
  PIUTANG: "Piutang",
  KEUNTUNGAN_MITRA: "Keuntungan Mitra Reseller",
  BIAYA_LAIN: "Biaya Lain-lain",
} as const;

export const AUTO_INCOME_CATEGORIES = ["PENJUALAN_LAPTOP", "SERVICE"];

export type IncomeCategory = keyof typeof INCOME_CATEGORIES;
export type ExpenseCategory = keyof typeof EXPENSE_CATEGORIES;

export function categoryLabel(direction: CashflowDirection, category: string): string {
  if (category === "MODAL_AWAL") return "Modal Awal";
  const map = direction === "IN" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return (map as Record<string, string>)[category] ?? category;
}

export function isValidCategory(direction: CashflowDirection, category: string): boolean {
  const map = direction === "IN" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return Object.prototype.hasOwnProperty.call(map, category);
}

export function isAutoIncomeCategory(category: string): boolean {
  return AUTO_INCOME_CATEGORIES.includes(category);
}

// ── Filter Types ──────────────────────────────────────────────────────────────
export type AuditFilter = "ALL" | "AUDITED" | "NOT_AUDITED";
export type SourceFilter = "ALL" | "MANUAL" | "AUTO";

export interface CashflowFilter {
  dateFrom: string;       // yyyy-mm-dd or ""
  dateTo: string;         // yyyy-mm-dd or ""
  category: string;       // category key or "ALL"
  audit: AuditFilter;
  source: SourceFilter;
  search: string;         // free text search on nama / keterangan
}

export function defaultCashflowFilter(): CashflowFilter {
  return {
    dateFrom: "",
    dateTo: "",
    category: "ALL",
    audit: "ALL",
    source: "ALL",
    search: "",
  };
}

export function isFilterActive(f: CashflowFilter): boolean {
  const d = defaultCashflowFilter();
  return (
    f.dateFrom !== d.dateFrom ||
    f.dateTo !== d.dateTo ||
    f.category !== d.category ||
    f.audit !== d.audit ||
    f.source !== d.source ||
    f.search !== d.search
  );
}

/** Count how many individual filter dimensions are active */
export function activeFilterCount(f: CashflowFilter): number {
  let c = 0;
  if (f.dateFrom || f.dateTo) c++;
  if (f.category !== "ALL") c++;
  if (f.audit !== "ALL") c++;
  if (f.source !== "ALL") c++;
  if (f.search.trim()) c++;
  return c;
}

/**
 * Apply all filters client-side. Each entry must match ALL active filters.
 */
export function applyFilters<T extends {
  tanggal?: string;
  category?: string;
  is_audited?: boolean;
  source_type?: string;
  nama?: string;
  keterangan?: string | null;
}>(entries: T[], filter: CashflowFilter): T[] {
  const q = filter.search.trim().toLowerCase();

  return entries.filter((e) => {
    // Date range
    if (filter.dateFrom && (e.tanggal || "") < filter.dateFrom) return false;
    if (filter.dateTo && (e.tanggal || "") > filter.dateTo) return false;

    // Category
    if (filter.category !== "ALL" && e.category !== filter.category) return false;

    // Audit status
    if (filter.audit === "AUDITED" && !e.is_audited) return false;
    if (filter.audit === "NOT_AUDITED" && e.is_audited) return false;

    // Source type
    if (filter.source === "MANUAL" && e.source_type !== "MANUAL") return false;
    if (filter.source === "AUTO" && e.source_type === "MANUAL") return false;

    // Search text
    if (q) {
      const haystack = `${e.nama || ""} ${e.keterangan || ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    return true;
  });
}