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

// ── Kategori Cashflow — Uang Keluar & Uang Masuk pakai daftar yang SAMA ───────
// Sesuai daftar akun dari divisi accounting. Key LAMA (mis. UTANG, MODAL_SERVICE,
// OPERASIONAL_SOTECH) sengaja TIDAK dihapus — lihat LEGACY_CATEGORY_LABEL & alias
// akun di CASHFLOW_ACCOUNT (lib/accounting.ts) — supaya entry lama di database
// tetap tampil & tetap ke-posting ke akun yang benar. Dropdown baru cuma
// menawarkan 16 key di bawah ini.
export const CASHFLOW_CATEGORIES = {
  BELANJA_LAPTOP: "Belanja Laptop",                  // 130
  PIUTANG: "Piutang",                                // 140
  INVEST: "Invest",                                  // 150
  ASET_TETAP: "Beli Aset Tetap",                     // 160
  AKSESORIS: "Belanja Aksesoris",                    // 170
  SPAREPART_SERVICE: "Sparepart Service",            // 171
  DANA_MARKETING: "Dana Marketing",                  // 181
  DOMPET_LAIN_LAIN: "Dompet Lain-lain",              // 190
  HUTANG: "Hutang",                                  // 210
  MODAL_LAPTOP_KELUAR: "Modal Laptop Keluar",        // 440
  BIAYA_PRINTILAN: "Biaya Printilan Barang",         // 450
  MODAL_SERVICE_KELUAR: "Modal Service Keluar",      // 460
  OPERASIONAL_HARIAN: "Operasional Harian/Mingguan", // 510
  OPERASIONAL_BULANAN: "Operasional Bulanan",        // 520
  BIAYA_LAIN: "Biaya Lain-lain",                     // 530
  KEUNTUNGAN_MITRA: "Keuntungan Mitra/Reseller",     // 540
} as const;

// Label kategori AUTO dari sistem (auto-sync dari Transaksi/Service) — tidak
// pernah ditawarkan di dropdown manual, tapi tetap butuh label buat ditampilkan.
const AUTO_CATEGORY_LABEL: Record<string, string> = {
  PENJUALAN_LAPTOP: "Penjualan Laptop",
  SERVICE: "Service",
};

// Label kategori LAMA — cuma dipakai supaya entry lama tampil dengan nama enak
// dibaca (bukan raw key). Tidak ditawarkan di dropdown baru.
const LEGACY_CATEGORY_LABEL: Record<string, string> = {
  OPERASIONAL_SOTECH: "Operasional Sotech",
  OPERASIONAL_ONPOINT: "Operasional Onpoint",
  OPERASIONAL_DAVID: "Operasional David",
  OPERASIONAL_KONTEN_KREATOR: "Operasional Konten Kreator",
  OPERASIONAL_MARKETING: "Dana Marketing",
  MODAL_SERVICE: "Sparepart Service",
  UTANG: "Hutang",
};

// ── Kategori yang OTOMATIS dari sistem — tidak boleh diinput manual ───────────
export const AUTO_INCOME_CATEGORIES = ["PENJUALAN_LAPTOP", "SERVICE"] as const;

/** true = kategori ini boleh diinput manual oleh user (berlaku sama utk Uang Masuk & Uang Keluar) */
export function isManualIncomeCategory(category: string): boolean {
  return (
    Object.prototype.hasOwnProperty.call(CASHFLOW_CATEGORIES, category) ||
    Object.prototype.hasOwnProperty.call(LEGACY_CATEGORY_LABEL, category)
  );
}

// Alias nama lama — dipertahankan supaya file lain yang masih import
// INCOME_CATEGORIES / EXPENSE_CATEGORIES tidak perlu diubah sama sekali.
// Keduanya sekarang menunjuk ke objek yang SAMA (CASHFLOW_CATEGORIES), jadi
// dropdown Uang Keluar & Uang Masuk otomatis menampilkan daftar identik —
// ASALKAN halaman UI-nya me-render dari konstanta ini, bukan hardcode sendiri.
export const INCOME_CATEGORIES = CASHFLOW_CATEGORIES;
export const EXPENSE_CATEGORIES = CASHFLOW_CATEGORIES;

export type IncomeCategory = keyof typeof CASHFLOW_CATEGORIES;
export type ExpenseCategory = keyof typeof CASHFLOW_CATEGORIES;

export function categoryLabel(_direction: CashflowDirection, category: string): string {
  if (category === "MODAL_AWAL") return "Modal Awal";
  return (
    (CASHFLOW_CATEGORIES as Record<string, string>)[category] ??
    AUTO_CATEGORY_LABEL[category] ??
    LEGACY_CATEGORY_LABEL[category] ??
    category
  );
}

export function isValidCategory(_direction: CashflowDirection, category: string): boolean {
  return (
    Object.prototype.hasOwnProperty.call(CASHFLOW_CATEGORIES, category) ||
    Object.prototype.hasOwnProperty.call(LEGACY_CATEGORY_LABEL, category)
  );
}

export function isAutoIncomeCategory(category: string): boolean {
  return (AUTO_INCOME_CATEGORIES as readonly string[]).includes(category);
}

// ── Filter Types ──────────────────────────────────────────────────────────────
export type AuditFilter = "ALL" | "AUDITED" | "NOT_AUDITED";
export type SourceFilter = "ALL" | "MANUAL" | "AUTO";
export type PaymentMethodFilter = "ALL" | "CASH" | "SALDO";
export type StatusFilter = "ALL" | "ACTIVE" | "VOIDED";
export type IncomeMethodFilter = "ALL" | "TUNAI" | "TRANSFER" | "TUNAI_TRANSFER"; // ⬅️ UPDATE: tambah opsi kombinasi Tunai+Transfer

export interface CashflowFilter {
  dateFrom: string;
  dateTo: string;
  category: string;
  audit: AuditFilter;
  source: SourceFilter;
  paymentMethod: PaymentMethodFilter;
  status: StatusFilter;
    incomeMethod: IncomeMethodFilter; // ⬅️ BARU: khusus tab Uang Masuk
  nama: string; // ⬅️ BARU: filter berdasarkan Nama/Teknisi/Customer/Pengisi
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
    status: "ALL", // ⬅️ BARU: filter Batal
        incomeMethod: "ALL", // ⬅️ BARU
    nama: "ALL", // ⬅️ BARU
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
    f.status !== d.status || // ⬅️ BARU
       f.incomeMethod !== d.incomeMethod || // ⬅️ BARU
    f.nama !== d.nama || // ⬅️ BARU
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
  if (f.status !== "ALL") c++; // ⬅️ BARU
   if (f.incomeMethod !== "ALL") c++; // ⬅️ BARU
  if (f.nama !== "ALL") c++; // ⬅️ BARU
   if (f.search.trim()) c++;
  return c;
}

/** Nama yang ditampilkan di tabel & dipakai untuk filter Nama — MANUAL/MODAL_AWAL
 *  pakai nama pengisi (created_by_user), selain itu pakai field `nama` apa adanya
 *  (teknisi utk SERVICE, sales/nama transaksi utk TRANSACTION, dst). */
export function getEntryDisplayNama(e: {
  source_type?: string;
  nama?: string;
  created_by_user?: { name: string } | null;
}): string {
  if ((e.source_type === "MANUAL" || e.source_type === "MODAL_AWAL") && e.created_by_user?.name) {
    return e.created_by_user.name;
  }
  return (e.nama || "").trim();
}

export function applyFilters<T extends {
  tanggal?: string;
  category?: string;
  is_audited?: boolean;
  source_type?: string;
  payment_method?: string | null; // ⬅️ BARU
  is_voided?: boolean; // ⬅️ BARU
   tx_payment_method?: string | null; // ⬅️ BARU: buat filter Tunai/Transfer
  nama?: string;
  keterangan?: string | null;
  created_by_user?: { name: string } | null; // ⬅️ BARU: buat filter Nama
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
    if (filter.status === "ACTIVE" && e.is_voided) return false; // ⬅️ BARU
    if (filter.status === "VOIDED" && !e.is_voided) return false; // ⬅️ BARU
    if (filter.incomeMethod !== "ALL") { // ⬅️ UPDATE: exact-match label — "Tunai" murni gak lagi ikut kebawa yang kombo
      const m = (e.tx_payment_method || "").trim();
      if (filter.incomeMethod === "TUNAI" && m !== "Tunai") return false;
      if (filter.incomeMethod === "TRANSFER" && m !== "Transfer") return false;
           if (filter.incomeMethod === "TUNAI_TRANSFER" && m !== "Tunai+Transfer") return false;
    }
    if (filter.nama !== "ALL" && getEntryDisplayNama(e) !== filter.nama) return false; // ⬅️ BARU
   if (q) {
      const haystack = `${e.nama || ""} ${e.keterangan || ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

// ── Metode Pembayaran Transaksi (disamakan dengan label di Riwayat Transaksi) ─
// PENTING: deteksi kata kunci dilakukan INDEPENDEN (bukan if-else berurutan yang
// langsung return), persis seperti getPaymentStyle() di halaman Riwayat Transaksi.
// Kenapa: field payment_method kadang isinya sudah gabungan teks sendiri
// (mis. "Tunai, Transfer"), jadi kalau dicek berurutan dan langsung return begitu
// ketemu "Tunai", kata "Transfer" di string yang sama tidak akan pernah terbaca.
function hasPaymentKeyword(text: string, keywords: string[]): boolean {
  const m = text.toUpperCase();
  return keywords.some((k) => m.includes(k));
}

/** Gabungkan payment_method + payment_method_2 dari tabel `transactions` jadi label
 *  singkat seperti di Riwayat Transaksi: "Tunai", "Transfer", "QRIS", atau gabungan
 *  "Tunai+Transfer" kalau transaksi dibayar pakai lebih dari satu metode — baik itu
 *  tergabung dalam satu field (payment_method = "Tunai, Transfer") maupun terpisah
 *  di dua field (payment_method + payment_method_2). Tidak bergantung pada
 *  amount_method_1/amount_method_2 — itu field terpisah untuk widget breakdown Rp
 *  per metode (PaymentBreakdown), bukan penentu split di badge Metode utama. */
export function formatTxPaymentMethod(
  method1?: string | null,
  method2?: string | null
): string {
  const combined = `${method1 ?? ""} ${method2 ?? ""}`;
  const hasCash = hasPaymentKeyword(combined, ["TUNAI", "CASH"]);
  const hasTransfer = hasPaymentKeyword(combined, ["TRANSFER", "TF", "BCA", "BRI"]);
  const hasQris = hasPaymentKeyword(combined, ["QRIS", "QR"]);

  const parts: string[] = [];
  if (hasCash) parts.push("Tunai");
  if (hasTransfer) parts.push("Transfer");
  if (hasQris) parts.push("QRIS");
  if (parts.length > 0) return parts.join("+");

  // Metode lain yang tidak masuk kata kunci di atas (mis. "OVO", "Dana") — tampilkan apa adanya
  const raw = (method1 ?? "").trim();
  return raw || "-";
}