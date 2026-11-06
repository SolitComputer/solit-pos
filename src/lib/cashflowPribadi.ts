// src/lib/cashflowPribadi.ts
// Types & constants untuk fitur Cashflow Pribadi (private per user).

export type CashflowType = "income" | "expense";

export type PaymentMethod = "cash" | "transfer" | "e-wallet" | "other";

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash",      label: "Cash" },
  { value: "transfer",  label: "Transfer Bank" },
  { value: "e-wallet",  label: "E-Wallet (OVO/DANA/GoPay/dll)" },
  { value: "other",     label: "Lainnya" },
];

export interface PersonalCategory {
  id: string;
  user_id: string | null;     // null = default sistem
  name: string;
  type: CashflowType;
  icon: string | null;
  color: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PersonalTransaction {
  id: string;
  user_id: string;
  category_id: string | null;
  type: CashflowType;
  amount: number;
  description: string | null;
  payment_method: PaymentMethod;
  transaction_date: string;   // YYYY-MM-DD
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  // join
  category?: Pick<PersonalCategory, "id" | "name" | "color" | "icon"> | null;
}

export interface PersonalSummary {
  period: { start: string; end: string };
  total_income: number;
  total_expense: number;
  balance: number;
  by_category: {
    category_id: string | null;
    category_name: string;
    color: string | null;
    type: CashflowType;
    total: number;
    count: number;
  }[];
  daily_trend: { date: string; income: number; expense: number }[];
}

// ── Validation helpers (manual, tanpa zod) ──────────────────────────────────
export function isValidType(v: unknown): v is CashflowType {
  return v === "income" || v === "expense";
}

export function isValidPaymentMethod(v: unknown): v is PaymentMethod {
  return typeof v === "string" && ["cash", "transfer", "e-wallet", "other"].includes(v);
}

export function isValidDateString(v: unknown): v is string {
  if (typeof v !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v);
  return !isNaN(d.getTime());
}

export function todayWIB(): string {
  // Format YYYY-MM-DD di zona WIB (UTC+7)
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

export function monthStartWIB(offsetMonths = 0): string {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offsetMonths, 1));
  return d.toISOString().slice(0, 10);
}

export function formatIDR(n: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}