// src/lib/sop.ts
// ── SOP Divisi: constants, mapping role→divisi, helpers ──────────────────────
import type { UserRole } from "@/lib/auth";

// ── Daftar divisi SOP ────────────────────────────────────────────────────────
export const SOP_DIVISIONS = [
  "marketing",
  "sales",
  "pengelola_barang",
  "penyedia_barang",
  "hrd",
  "purchasing",
  "accounting",
  "programmer",
] as const;

export type SopDivision = (typeof SOP_DIVISIONS)[number];

export const SOP_DIVISION_LABELS: Record<SopDivision, string> = {
  marketing: "Marketing",
  sales: "Sales",
  pengelola_barang: "Pengelola Barang",
  penyedia_barang: "Penyedia Barang",
  hrd: "HRD",
  purchasing: "Purchasing",
  accounting: "Accounting",
  programmer: "Programmer",
};

// ── Mapping: role → divisi SOP yang bisa dilihat ─────────────────────────────
// Role yang TIDAK ada di sini tidak melihat SOP apapun (kecuali admin).
export const ROLE_TO_SOP_DIVISION: Partial<Record<UserRole, SopDivision>> = {
  // Marketing
  KEPALA_MARKETING: "marketing",
  MARKETING: "marketing",
  KONTEN: "marketing",
  PKL_MARKETING: "marketing",
  PKL_KONTEN: "marketing",

  // Sales (termasuk semua varian: sotech, onpoint, zenith, pengantaran)
  KEPALA_SALES: "sales",
  CREW_SALES: "sales",
  SOTECH: "sales",
  KEPALA_SOTECH: "sales",
  ONPOINT: "sales",
  KEPALA_ONPOINT: "sales",
  KEPALA_ZENITH: "sales",
  PENGANTARAN: "sales",
  PKL_SALES: "sales",
  PKL_ZENITH: "sales",
  PKL_SOTECH: "sales",
  PKL_ONPOINT: "sales",
  PKL_PENGANTARAN: "sales",

  // Pengelola Barang
  KEPALA_PENGELOLA_BARANG: "pengelola_barang",
  PENGELOLA_BARANG: "pengelola_barang",
  PKL_PENGELOLA_BARANG: "pengelola_barang",

  // Penyedia Barang
  KEPALA_PENYEDIA_BARANG: "penyedia_barang",
  PENYEDIA_BARANG: "penyedia_barang",
  PKL_PENYEDIA_BARANG: "penyedia_barang",

  // HRD
  KEBERSIHAN: "hrd",

  // Purchasing
  PURCHASING: "purchasing",

  // Accounting
  ACCOUNTING: "accounting",
  PKL_ACCOUNTING: "accounting",

  // Programmer
  PROGRAMMER: "programmer",
};

// ── Role yang bisa lihat SEMUA divisi (tidak difilter) ───────────────────────
export const SOP_VIEW_ALL_ROLES: UserRole[] = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];

// ── Role yang bisa input/edit/delete SOP (hanya Admin) ───────────────────────
export const SOP_MANAGE_ROLES: UserRole[] = ["ADMIN"];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Ambil divisi SOP yang boleh dilihat user. Return "all" untuk admin. */
export function getUserSopDivisions(userRoles: string[]): SopDivision[] | "all" {
  if (userRoles.some((r) => (SOP_VIEW_ALL_ROLES as string[]).includes(r))) {
    return "all";
  }
  const divisions = new Set<SopDivision>();
  for (const role of userRoles) {
    const div = ROLE_TO_SOP_DIVISION[role as UserRole];
    if (div) divisions.add(div);
  }
  return Array.from(divisions);
}

/** Cek apakah user bisa manage (create/edit/delete) SOP */
export function canManageSop(userRoles: string[]): boolean {
  return userRoles.some((r) => (SOP_MANAGE_ROLES as string[]).includes(r));
}

/** Cek apakah user punya akses ke halaman SOP sama sekali */
export function hasSopAccess(userRoles: string[]): boolean {
  if (userRoles.some((r) => (SOP_VIEW_ALL_ROLES as string[]).includes(r))) return true;
  return userRoles.some((r) => ROLE_TO_SOP_DIVISION[r as UserRole] !== undefined);
}