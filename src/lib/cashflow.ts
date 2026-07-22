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

export const INCOME_CATEGORIES = {
  PENJUALAN_LAPTOP: "Penjualan Laptop",
  SERVICE: "Service",
  PIUTANG: "Piutang",
  AKSESORIS: "Aksesoris",
  BIAYA_LAIN: "Biaya Lain-lain",
} as const;

// ── Kategori yang OTOMATIS dari sistem — tidak boleh diinput manual ───────────
export const AUTO_INCOME_CATEGORIES = ["PENJUALAN_LAPTOP", "SERVICE"] as const;

/** true = kategori ini boleh diinput manual oleh user */
export function isManualIncomeCategory(category: string): boolean {
  return (
    Object.prototype.hasOwnProperty.call(INCOME_CATEGORIES, category) &&
    !(AUTO_INCOME_CATEGORIES as readonly string[]).includes(category)
  );
}

// ── Kategori Uang Keluar ─────────────────────────────────────────────────────
export const EXPENSE_CATEGORIES = {
  OPERASIONAL_HARIAN: "Operasional Harian",
  OPERASIONAL_BULANAN: "Operasional Bulanan",
  OPERASIONAL_MARKETING: "Operasional Marketing",
  OPERASIONAL_SOTECH: "Operasional Sotech",
  OPERASIONAL_ONPOINT: "Operasional Onpoint",
  OPERASIONAL_DAVID: "Operasional David",
  OPERASIONAL_KONTEN_KREATOR: "Operasional Konten Kreator",
  BELANJA_LAPTOP: "Belanja Laptop",
  AKSESORIS: "Aksesoris",
  MODAL_SERVICE: "Modal Service",
  UTANG: "Utang",
  PIUTANG: "Piutang",
  KEUNTUNGAN_MITRA: "Keuntungan Mitra Reseller",
  BIAYA_LAIN: "Biaya Lain-lain",
} as const;

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
  return (AUTO_INCOME_CATEGORIES as readonly string[]).includes(category);
}

// ── Filter Types ──────────────────────────────────────────────────────────────
export type AuditFilter = "ALL" | "AUDITED" | "NOT_AUDITED";
export type SourceFilter = "ALL" | "MANUAL" | "AUTO";
export type PaymentMethodFilter = "ALL" | "CASH" | "SALDO"; // ⬅️ BARU

export interface CashflowFilter {
  dateFrom: string;
  dateTo: string;
  category: string;
  audit: AuditFilter;
  source: SourceFilter;
  paymentMethod: PaymentMethodFilter; // ⬅️ BARU
  search: string;
}

export function defaultCashflowFilter(): CashflowFilter {
  return {
    dateFrom: "",
    dateTo: "",
    category: "ALL",
    audit: "ALL",
    source: "ALL",
    paymentMethod: "ALL", // ⬅️ BARU
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
    f.paymentMethod !== d.paymentMethod || // ⬅️ BARU
    f.search !== d.search
  );
}

export function activeFilterCount(f: CashflowFilter): number {
  let c = 0;
  if (f.dateFrom || f.dateTo) c++;
  if (f.category !== "ALL") c++;
  if (f.audit !== "ALL") c++;
  if (f.source !== "ALL") c++;
  if (f.paymentMethod !== "ALL") c++; // ⬅️ BARU
  if (f.search.trim()) c++;
  return c;
}

export function applyFilters<T extends {
  tanggal?: string;
  category?: string;
  is_audited?: boolean;
  source_type?: string;
  payment_method?: string | null; // ⬅️ BARU
  nama?: string;
  keterangan?: string | null;
}>(entries: T[], filter: CashflowFilter): T[] {
  const q = filter.search.trim().toLowerCase();

  return entries.filter((e) => {
    if (filter.dateFrom && (e.tanggal || "") < filter.dateFrom) return false;
    if (filter.dateTo && (e.tanggal || "") > filter.dateTo) return false;
    if (filter.category !== "ALL" && e.category !== filter.category) return false;
    if (filter.audit === "AUDITED" && !e.is_audited) return false;
    if (filter.audit === "NOT_AUDITED" && e.is_audited) return false;
    if (filter.source === "MANUAL" && e.source_type !== "MANUAL") return false;
    if (filter.source === "AUTO" && e.source_type === "MANUAL") return false;
    if (filter.paymentMethod !== "ALL" && e.payment_method !== filter.paymentMethod) return false; // ⬅️ BARU
    if (q) {
      const haystack = `${e.nama || ""} ${e.keterangan || ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}