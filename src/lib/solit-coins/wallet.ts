// Logika saldo Solit Coins.
//
// Role admin (FULL_ACCESS: ADMIN, PROGRAMMER, ASISTEN_CEO) punya saldo tak
// terbatas — ditampilkan sebagai 999.999+ dan TIDAK berkurang saat beli border.

import { FULL_ACCESS_ROLES } from "@/lib/auth";

export const ADMIN_COIN_BALANCE = 9_999_999;

/** Apakah role user termasuk admin (saldo unlimited). */
export function isCoinUnlimited(roles: string[]): boolean {
  return roles.some((r) => (FULL_ACCESS_ROLES as readonly string[]).includes(r));
}

/** Saldo yang ditampilkan: admin → unlimited, selain itu saldo asli. */
export function resolveWalletBalance(
  roles: string[],
  realBalance: number
): { balance: number; unlimited: boolean } {
  const unlimited = isCoinUnlimited(roles);
  return { balance: unlimited ? ADMIN_COIN_BALANCE : realBalance, unlimited };
}
