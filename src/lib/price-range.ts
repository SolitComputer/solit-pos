// Sumber kebenaran tunggal opsi Range Harga — dipakai di form Laporan Harian
// Sales, validasi API /api/sales-reports, dan tampilan Audit Marketing.
// `value` = kode yang disimpan ke DB (HARUS sama dengan CHECK constraint
// sales_online_reports_price_range_check). `label` = teks tampilan.
export const PRICE_RANGE_OPTIONS = [
  { value: "LT_1", label: "< 1 Juta" },
  { value: "1_2", label: "1 - 2 Juta" },
  { value: "2_3", label: "2 - 3 Juta" },
  { value: "3_4", label: "3 - 4 Juta" },
  { value: "4_5", label: "4 - 5 Juta" },
  { value: "5_7", label: "5 - 7 Juta" },
  { value: "7_10", label: "7 - 10 Juta" },
  { value: "GT_10", label: "> 10 Juta" },
] as const;

export type PriceRange = (typeof PRICE_RANGE_OPTIONS)[number]["value"];

const PRICE_RANGE_LABELS: Record<string, string> = Object.fromEntries(
  PRICE_RANGE_OPTIONS.map((o) => [o.value, o.label])
);

export function isPriceRange(value: unknown): value is PriceRange {
  return typeof value === "string" && value in PRICE_RANGE_LABELS;
}

// Laporan lama (price_range NULL) atau nilai tidak dikenal → null,
// biar UI bisa jatuh ke "—" tanpa error.
export function getPriceRangeLabel(value: string | null | undefined): string | null {
  return isPriceRange(value) ? PRICE_RANGE_LABELS[value] : null;
}