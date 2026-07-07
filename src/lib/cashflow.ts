export type CashflowDirection = "IN" | "OUT";

export const CASHFLOW_START_DATE = "2026-07-06";
export const CASHFLOW_CUTOFF_ISO = "2026-07-06T00:00:00+07:00";

// ── Modal Awal: aktif 07 Jul → 09 Jul 2026 (3 hari, WIB) ──────────────────
export const MODAL_AWAL_DEADLINE_ISO = "2026-07-09T23:59:59+07:00";

/** true = masih dalam periode boleh isi modal awal */
export function isModalAwalActive(): boolean {
  return new Date() <= new Date(MODAL_AWAL_DEADLINE_ISO);
}

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