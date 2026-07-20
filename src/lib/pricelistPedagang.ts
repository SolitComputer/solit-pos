// src/lib/pricelistPedagang.ts
//
// Kalkulasi "Price List Pedagang".
// PENTING: markup dihitung dari HARGA MODAL (purchase_price) tiap UNIT,
// bukan harga jual, dan bukan agregat per tipe laptop.
// Fitur ini murni tampilan/export — TIDAK menyentuh payment/transaksi.

import { UserRole } from "@/lib/permissions";

export interface PedagangPriceTier {
  min: number;
  max: number | null; // null = tidak terbatas ke atas
  percent: number;     // 0.3 = 30%
  label: string;
}

export const PEDAGANG_PRICE_TIERS: PedagangPriceTier[] = [
  { min: 0,         max: 1_000_000, percent: 0.30, label: "< Rp1jt (+30%)" },
  { min: 1_000_000, max: 2_000_000, percent: 0.25, label: "Rp1jt–2jt (+25%)" },
  { min: 2_000_000, max: 3_000_000, percent: 0.20, label: "Rp2jt–3jt (+20%)" },
  { min: 3_000_000, max: 4_000_000, percent: 0.15, label: "Rp3jt–4jt (+15%)" },
  { min: 4_000_000, max: 5_000_000, percent: 0.12, label: "Rp4jt–5jt (+12%)" },
  { min: 5_000_000, max: null,      percent: 0.10, label: "≥ Rp5jt (+10%)" },
];

export function getPedagangTier(modalPrice: number): PedagangPriceTier {
  const tier = PEDAGANG_PRICE_TIERS.find(
    (t) => modalPrice >= t.min && (t.max === null || modalPrice < t.max)
  );
  return tier ?? PEDAGANG_PRICE_TIERS[PEDAGANG_PRICE_TIERS.length - 1];
}

/**
 * Pembulatan ke ATAS ke kelipatan 50.000 terdekat.
 * 1.170.000 -> 1.200.000
 * 1.125.000 -> 1.150.000
 * 1.150.000 -> 1.150.000 (sudah bulat, tidak berubah)
 */
export function roundUpTo50k(value: number): number {
  if (value <= 0) return 0;
  return Math.ceil(value / 50_000) * 50_000;
}

export interface PedagangPriceResult {
  modalPrice: number;
  tier: PedagangPriceTier;
  rawPrice: number;      // sebelum dibulatkan
  pedagangPrice: number; // harga final (sudah dibulatkan)
}

export function calculatePedagangPrice(modalPrice: number): PedagangPriceResult {
  const modal = Math.max(0, Math.round(Number(modalPrice) || 0));
  const tier = getPedagangTier(modal);
  const rawPrice = modal * (1 + tier.percent);
  const pedagangPrice = roundUpTo50k(rawPrice);
  return { modalPrice: modal, tier, rawPrice, pedagangPrice };
}

// ─── Role gating (dipakai API route & halaman) ─────────────────────────────
// Dideklarasikan sebagai UserRole[] MUTABLE (bukan `as const`) agar kompatibel
// langsung dengan signature withAuth(handler, allowedRoles?: UserRole[]) dan
// hasAnyRole(userRoles, allowed: UserRole[]) — keduanya menolak readonly tuple.
export const PRICELIST_PEDAGANG_ROLES: UserRole[] = [
  "ADMIN", "PROGRAMMER", "ASISTEN_CEO", "KEPALA_SALES", "ACCOUNTING",
  "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG", "KEPALA_TEKNISI",
  "MARKETING", "KEPALA_MARKETING",
];

// Role yang boleh lihat harga MODAL di tabel dashboard (bukan di Excel —
// Excel tidak pernah menampilkan harga modal). Disamakan dengan
// `canSeePriceInfo` di halaman Units.
export const PRICELIST_MODAL_VIEW_ROLES: UserRole[] = [
  "ADMIN", "PROGRAMMER", "ASISTEN_CEO", "PENGELOLA_BARANG",
  "KEPALA_PENGELOLA_BARANG", "KEPALA_TEKNISI", "ACCOUNTING",
];