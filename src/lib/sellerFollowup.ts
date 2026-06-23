export type SellerType = "USER" | "PEDAGANG";

// Interval follow-up per kategori (dalam hari)
export const SELLER_FOLLOWUP_DAYS: Record<SellerType, number> = {
  USER: 7,
  PEDAGANG: 3,
};

export function normalizeSellerType(value: unknown): SellerType {
  return value === "PEDAGANG" ? "PEDAGANG" : "USER";
}

/** Hitung tanggal follow-up berikutnya (ISO string) */
export function nextFollowupISO(sellerType: SellerType, from: Date = new Date()): string {
  const days = SELLER_FOLLOWUP_DAYS[sellerType] ?? 7;
  const next = new Date(from);
  next.setDate(next.getDate() + days);
  return next.toISOString();
}

/** Apakah sudah waktunya di-follow-up? (next_followup_at <= sekarang) */
export function isDue(nextFollowupAt: string | Date, now: Date = new Date()): boolean {
  return new Date(nextFollowupAt).getTime() <= now.getTime();
}