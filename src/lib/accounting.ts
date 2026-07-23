// src/lib/accounting.ts
import { categoryLabel } from "@/lib/cashflow";

export type AccountType = "ASET" | "HUTANG" | "MODAL" | "PEMASUKAN" | "BEBAN";
export type JournalSide = "DEBIT" | "KREDIT";
export type JournalSourceType = "TRANSACTION" | "SERVICE" | "CASHFLOW" | "MANUAL";
export type DerivedSourceType = Exclude<JournalSourceType, "MANUAL">;

export interface Account {
  code: string;
  name: string;
  type: AccountType;
  normal: JournalSide;
}

export const AKUN = {
  KAS_SALDO: "110",
  KAS_CASH: "120",
  HPP: "130",
  PIUTANG: "140",
  INVEST: "150",
  ASET_TETAP: "160",
  AKSESORIS: "170",
  AKSESORIS_SERVICE: "171",
  DOMPET_FINANCE: "180",
  DOMPET_MARKETING: "181",
  DOMPET_CEO: "182",
  DOMPET_LAIN: "190",
  ECOMMERS: "191",

  HUTANG_SUPPLIER: "210",

  MODAL_OWNER: "310",
  MODAL_INVESTOR: "320",

  PENJUALAN_LAPTOP: "410",
  PENJUALAN_AKSESORIS: "420",
  JASA_SERVICE: "430",
  MODAL_KELUAR: "440",
  BIAYA_PRINTILAN: "450",
  MODAL_SERVICE_KELUAR: "460",

  OPS_MINGGUAN: "510",
  OPS_BULANAN: "520",
  BIAYA_LAIN: "530",
  KEUNTUNGAN_MITRA: "540",
} as const;

export const ACCOUNTS: Account[] = [
  // ── Aset ──
  { code: AKUN.KAS_SALDO, name: "Kas Saldo", type: "ASET", normal: "DEBIT" },
  { code: AKUN.KAS_CASH, name: "Kas Cash", type: "ASET", normal: "DEBIT" },
  { code: AKUN.HPP, name: "HPP (Modal)", type: "ASET", normal: "DEBIT" },
  { code: AKUN.PIUTANG, name: "Piutang", type: "ASET", normal: "DEBIT" },
  { code: AKUN.INVEST, name: "Invest", type: "ASET", normal: "DEBIT" },
  { code: AKUN.ASET_TETAP, name: "Aset Tetap", type: "ASET", normal: "DEBIT" },
  { code: AKUN.AKSESORIS, name: "Aksesoris", type: "ASET", normal: "DEBIT" },
  { code: AKUN.AKSESORIS_SERVICE, name: "Aksesoris Service", type: "ASET", normal: "DEBIT" },
  { code: AKUN.DOMPET_FINANCE, name: "Dompet Finance", type: "ASET", normal: "DEBIT" },
  { code: AKUN.DOMPET_MARKETING, name: "Dompet Marketing", type: "ASET", normal: "DEBIT" },
  { code: AKUN.DOMPET_CEO, name: "Dompet CEO", type: "ASET", normal: "DEBIT" },
  { code: AKUN.DOMPET_LAIN, name: "Dompet Lain-lain", type: "ASET", normal: "DEBIT" },
  { code: AKUN.ECOMMERS, name: "Ecommerce", type: "ASET", normal: "DEBIT" },

  // ── Hutang ──
  { code: AKUN.HUTANG_SUPPLIER, name: "Hutang Supplier", type: "HUTANG", normal: "KREDIT" },

  // ── Modal ──
  { code: AKUN.MODAL_OWNER, name: "Modal Owner", type: "MODAL", normal: "KREDIT" },
  { code: AKUN.MODAL_INVESTOR, name: "Modal Investor", type: "MODAL", normal: "KREDIT" },
  { code: "330", name: "Laba November 2025", type: "MODAL", normal: "KREDIT" },
  { code: "340", name: "Laba Desember 2025", type: "MODAL", normal: "KREDIT" },
  { code: "350", name: "Laba Januari 2026", type: "MODAL", normal: "KREDIT" },
  { code: "360", name: "Laba Februari 2026", type: "MODAL", normal: "KREDIT" },
  { code: "370", name: "Laba Maret 2026", type: "MODAL", normal: "KREDIT" },
  { code: "380", name: "Laba April 2026", type: "MODAL", normal: "KREDIT" },
  { code: "390", name: "Laba Mei 2026", type: "MODAL", normal: "KREDIT" },

  // ── Pemasukan ──
  { code: AKUN.PENJUALAN_LAPTOP, name: "Penjualan Laptop", type: "PEMASUKAN", normal: "KREDIT" },
  { code: AKUN.PENJUALAN_AKSESORIS, name: "Penjualan Aksesoris", type: "PEMASUKAN", normal: "KREDIT" },
  { code: AKUN.JASA_SERVICE, name: "Jasa Service", type: "PEMASUKAN", normal: "KREDIT" },
  // 440/450/460 = kontra-pemasukan (HPP terjual). Normal balance DEBIT.
  { code: AKUN.MODAL_KELUAR, name: "Modal Keluar (Sold)", type: "PEMASUKAN", normal: "DEBIT" },
  { code: AKUN.BIAYA_PRINTILAN, name: "Biaya Printilan Barang", type: "PEMASUKAN", normal: "DEBIT" },
  { code: AKUN.MODAL_SERVICE_KELUAR, name: "Modal Service Keluar", type: "PEMASUKAN", normal: "DEBIT" },

  // ── Beban ──
  { code: AKUN.OPS_MINGGUAN, name: "Operasional Mingguan Solit", type: "BEBAN", normal: "DEBIT" },
  { code: AKUN.OPS_BULANAN, name: "Operasional Bulanan", type: "BEBAN", normal: "DEBIT" },
  { code: AKUN.BIAYA_LAIN, name: "Biaya Lain-lain", type: "BEBAN", normal: "DEBIT" },
  { code: AKUN.KEUNTUNGAN_MITRA, name: "Keuntungan Mitra / Reseller", type: "BEBAN", normal: "DEBIT" },
];

export const ACCOUNT_MAP: Record<string, Account> = Object.fromEntries(
  ACCOUNTS.map((a) => [a.code, a])
);

export function accountName(code: string): string {
  return ACCOUNT_MAP[code]?.name ?? code;
}
export function isValidAccount(code: string): boolean {
  return !!ACCOUNT_MAP[code];
}

export const ACCOUNT_TYPE_ORDER: AccountType[] = ["ASET", "HUTANG", "MODAL", "PEMASUKAN", "BEBAN"];
export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  ASET: "Aset",
  HUTANG: "Hutang",
  MODAL: "Modal",
  PEMASUKAN: "Pemasukan",
  BEBAN: "Beban (Pengeluaran)",
};

export const ACCOUNT_TYPE_NORMAL_SIDE: Record<AccountType, JournalSide> = {
  ASET: "DEBIT",
  HUTANG: "KREDIT",
  MODAL: "KREDIT",
  PEMASUKAN: "KREDIT",
  BEBAN: "DEBIT",
};

// ─── Periode ──────────────────────────────────────────────────────────────────
export const MONTH_LABELS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** period = "YYYY-MM" */
export function isValidPeriod(p: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(p);
}

export function periodLabel(period: string): string {
  const [y, m] = period.split("-");
  return `${MONTH_LABELS[Number(m) - 1]} ${y}`;
}

export function periodFromDate(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/** Rentang periode dalam WIB (UTC+7) */
export function periodRange(period: string) {
  const [y, m] = period.split("-").map(Number);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const pad = (n: number) => String(n).padStart(2, "0");

  const startDate = `${y}-${pad(m)}-01`;
  const endDateExclusive = `${nextY}-${pad(nextM)}-01`;

  return {
    startDate,
    endDateExclusive,
    startISO: `${startDate}T00:00:00+07:00`,
    endISO: `${endDateExclusive}T00:00:00+07:00`,
  };
}

/** ISO timestamp → tanggal WIB (YYYY-MM-DD) */
export function jakartaDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

// ─── Mapping Kas ──────────────────────────────────────────────────────────────
/** Metode bayar transaksi/service → akun kas.  Tunai/Cash → 120, sisanya (TF/QRIS) → 110 */
export function kasAccountFromPaymentMethod(method?: string | null): string {
  const m = (method ?? "").toUpperCase();
  if (m.includes("TUNAI") || m.includes("CASH")) return AKUN.KAS_CASH;
  return AKUN.KAS_SALDO;
}

/** Cashflow payment_method hanya "CASH" | "SALDO" */
export function kasAccountFromCashflow(pm?: string | null): string {
  return pm === "CASH" ? AKUN.KAS_CASH : AKUN.KAS_SALDO;
}

/** Kategori uang keluar cashflow → akun debit */
export const CASHFLOW_OUT_ACCOUNT: Record<string, string> = {
  OPERASIONAL_HARIAN: AKUN.OPS_MINGGUAN,
  OPERASIONAL_BULANAN: AKUN.OPS_BULANAN,
  OPERASIONAL_MARKETING: AKUN.OPS_MINGGUAN,
  OPERASIONAL_SOTECH: AKUN.OPS_MINGGUAN,
  OPERASIONAL_ONPOINT: AKUN.OPS_MINGGUAN,
  OPERASIONAL_DAVID: AKUN.OPS_MINGGUAN,
  OPERASIONAL_KONTEN_KREATOR: AKUN.OPS_MINGGUAN,
  BELANJA_LAPTOP: AKUN.HPP,               // beli laptop = nambah aset modal
  AKSESORIS: AKUN.AKSESORIS,
  MODAL_SERVICE: AKUN.AKSESORIS_SERVICE,
  PIUTANG: AKUN.PIUTANG,
  KEUNTUNGAN_MITRA: AKUN.KEUNTUNGAN_MITRA,
  BIAYA_LAIN: AKUN.BIAYA_LAIN,
};

export function expenseAccountForCashflow(category: string): string {
  return CASHFLOW_OUT_ACCOUNT[category] ?? AKUN.BIAYA_LAIN;
}

export function cashflowKeterangan(e: {
  category: string;
  keterangan?: string | null;
  nama?: string | null;
}): string {
  const label = categoryLabel("OUT", e.category);
  const detail = e.keterangan?.trim() || e.nama?.trim() || "—";
  return `${label} · ${detail}`;
}

export interface DraftLine {
  account_code: string;
  side: JournalSide;
  nominal: number;
  keterangan?: string | null; // catatan khusus untuk baris akun ini (opsional)
}

export function sumSide(lines: DraftLine[], side: JournalSide): number {
  return lines.reduce((s, l) => (l.side === side ? s + Math.round(Number(l.nominal || 0)) : s), 0);
}
export function totalOf(lines: DraftLine[]): number {
  return sumSide(lines, "DEBIT");
}
export function isBalanced(lines: DraftLine[]): boolean {
  const d = sumSide(lines, "DEBIT");
  const k = sumSide(lines, "KREDIT");
  return d > 0 && d === k;
}

/** Gabung baris dengan akun + side yang sama supaya jurnal rapi */
export function mergeLines(lines: DraftLine[]): DraftLine[] {
  const map = new Map<string, DraftLine>();
  for (const l of lines) {
    if (l.nominal <= 0) continue;
    const key = `${l.side}:${l.account_code}`;
    const cur = map.get(key);
    if (cur) cur.nominal += l.nominal;
    else map.set(key, { ...l });
  }
  return Array.from(map.values());
}

/** Bersihkan baris jurnal MANUAL tanpa menggabungkan akun+side yang sama.
 *  Beda dengan mergeLines(): di jurnal manual, 2 baris dengan akun & side yang
 *  sama tetap 2 transaksi terpisah — tidak boleh dijumlahkan jadi satu baris. */
export function cleanManualLines(lines: DraftLine[]): DraftLine[] {
  return lines.filter((l) => Number(l.nominal) > 0).map((l) => ({ ...l }));
}

// ─── Template jurnal manual ───────────────────────────────────────────────────
export const MANUAL_TEMPLATES: {
  key: string;
  label: string;
  lines: { account_code: string; side: JournalSide }[];
}[] = [
    {
      key: "PENJUALAN_LAPTOP",
      label: "Penjualan Laptop",
      lines: [
        { account_code: AKUN.KAS_SALDO, side: "DEBIT" },
        { account_code: AKUN.PENJUALAN_LAPTOP, side: "KREDIT" },
      ],
    },
    {
      key: "SERVICE",
      label: "Service Laptop",
      lines: [
        { account_code: AKUN.KAS_CASH, side: "DEBIT" },
        { account_code: AKUN.JASA_SERVICE, side: "KREDIT" },
      ],
    },
    {
      key: "PENJUALAN_AKSESORIS",
      label: "Penjualan Aksesoris",
      lines: [
        { account_code: AKUN.KAS_CASH, side: "DEBIT" },
        { account_code: AKUN.PENJUALAN_AKSESORIS, side: "KREDIT" },
      ],
    },
    {
      key: "BEBAN",
      label: "Beban / Pengeluaran",
      lines: [
        { account_code: AKUN.BIAYA_LAIN, side: "DEBIT" },
        { account_code: AKUN.KAS_CASH, side: "KREDIT" },
      ],
    },
    { key: "CUSTOM", label: "Kosong (custom)", lines: [] },
  ];

export const PROTECTED_ACCOUNT_CODES: string[] = [
  ...Object.values(AKUN),
  ...Object.values(CASHFLOW_OUT_ACCOUNT),
];