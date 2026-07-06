// src/lib/cashflow.ts
export type CashflowDirection = "IN" | "OUT";

export const CASHFLOW_START_DATE = "2026-07-06";
export const CASHFLOW_CUTOFF_ISO = "2026-07-06T00:00:00+07:00";

// ── Kategori Uang Masuk ──
export const INCOME_CATEGORIES = {
  PENJUALAN_LAPTOP: "Penjualan Laptop",
  SERVICE: "Service",
  AKSESORIS: "Aksesoris",
  UTANG: "Utang",
  SEWA: "Sewa",
  PENJUALAN_ASET: "Penjualan Aset",
} as const;

// ── Kategori Uang Keluar ──
export const EXPENSE_CATEGORIES = {
  OPERASIONAL_HARIAN: "Operasional Harian",
  OPERASIONAL_BULANAN: "Operasional Bulanan",
  BELANJA_LAPTOP: "Belanja Laptop",
  AKSESORIS: "Aksesoris",
  MODAL_SERVICE: "Modal Service",
  PIUTANG: "Piutang",
} as const;

/** Kategori yang otomatis dari sistem (dilarang input manual → cegah double count) */
export const AUTO_INCOME_CATEGORIES = ["PENJUALAN_LAPTOP", "SERVICE"];

export type IncomeCategory = keyof typeof INCOME_CATEGORIES;
export type ExpenseCategory = keyof typeof EXPENSE_CATEGORIES;

export function categoryLabel(direction: CashflowDirection, category: string): string {
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