/**
 * Metadata role terpusat.
 *
 * Konstanta ini sebelumnya hidup di dalam `src/app/dashboard/users/page.tsx`.
 * File ini TIDAK mengubah file tersebut — hanya menyediakan sumber tunggal
 * untuk halaman baru (mis. Ulang Tahun Karyawan) supaya tidak copy-paste.
 *
 * Icon (JSX) sengaja TIDAK ditaruh di sini agar file tetap `.ts` murni
 * dan aman di-import dari Server Component maupun Client Component.
 */

export interface CustomRoleRow {
  key: string;
  label: string;
  icon: string;
  badge_bg: string;
  badge_text: string;
  badge_border: string;
  is_pkl: boolean;
}

export interface BadgeStyle {
  bg: string;
  text: string;
  border: string;
}

export const FULL_ACCESS_ROLES = new Set<string>([
  "ADMIN",
  "PROGRAMMER",
  "ASISTEN_CEO",
  "ACCOUNTING",
]);

export const KEPALA_ROLES = new Set<string>([
  "KEPALA_SALES",
  "KEPALA_MARKETING",
  "KEPALA_TEKNISI",
  "KEPALA_ZENITH",
  "KEPALA_ONPOINT",
  "KEPALA_PENYEDIA_BARANG",
  "KEPALA_SOTECH",
  "KEPALA_PENGELOLA_BARANG",
]);

export const PKL_ROLE_SET = new Set<string>([
  "PKL",
  "PKL_MARKETING",
  "PKL_SALES",
  "PKL_PENYEDIA_BARANG",
  "PKL_SOTECH",
  "PKL_ONPOINT",
  "PKL_TEKNISI",
  "PKL_KONTEN",
  "PKL_PENGANTARAN",
  "PKL_CUSTOMER_SERVICE",
  "PKL_PENGELOLA_BARANG",
]);

export const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  PROGRAMMER: "Programmer",
  ASISTEN_CEO: "Asisten CEO",
  KEPALA_SALES: "Kepala Sales",
  KEPALA_ZENITH: "Kepala Zenith",
  KEPALA_MARKETING: "Kepala Marketing",
  KEPALA_TEKNISI: "Kepala Teknisi",
  CREW_SALES: "Crew Sales",
  SOTECH: "Sotech",
  ACCOUNTING: "Accounting",
  PENGELOLA_BARANG: "Pengelola Barang",
  KEPALA_PENGELOLA_BARANG: "Kepala Pengelola Barang",
  TEKNISI: "Teknisi",
  PENGANTARAN: "Pengantaran",
  MARKETING: "Marketing",
  KEBERSIHAN: "Kebersihan",
  PENYEDIA_BARANG: "Penyedia Barang",
  KEPALA_PENYEDIA_BARANG: "Kepala Penyedia Barang",
  KONTEN: "Konten",
  KEPALA_ONPOINT: "Kepala Onpoint",
  ONPOINT: "Onpoint",
  KEPALA_SOTECH: "Kepala Sotech",
  PKL: "PKL",
  PKL_MARKETING: "PKL Marketing",
  PKL_SALES: "PKL Sales",
  PKL_PENYEDIA_BARANG: "PKL Penyedia Barang",
  PKL_SOTECH: "PKL Sotech",
  PKL_ONPOINT: "PKL Onpoint",
  PKL_TEKNISI: "PKL Teknisi",
  PKL_KONTEN: "PKL Content Creator",
  PKL_PENGANTARAN: "PKL Pengantaran",
  CUSTOMER_SERVICE: "Customer Service",
  PKL_CUSTOMER_SERVICE: "PKL Customer Service",
  PKL_PENGELOLA_BARANG: "PKL Pengelola Barang",
  PURCHASING: "Purchasing",
};

const PKL_BADGE: BadgeStyle = { bg: "#fefce8", text: "#854d0e", border: "#fde68a" };

export const ROLE_BADGE_STYLE: Record<string, BadgeStyle> = {
  ADMIN: { bg: "#f3f0ff", text: "#6d28d9", border: "#ddd6fe" },
  PROGRAMMER: { bg: "#eef2ff", text: "#4338ca", border: "#c7d2fe" },
  ASISTEN_CEO: { bg: "#fdf4ff", text: "#7e22ce", border: "#e9d5ff" },
  KEPALA_SALES: { bg: "#ecfdf5", text: "#059669", border: "#a7f3d0" },
  KEPALA_MARKETING: { bg: "#fff1f2", text: "#be123c", border: "#fecdd3" },
  KEPALA_TEKNISI: { bg: "#fff1f2", text: "#b91c1c", border: "#fecaca" },
  CREW_SALES: { bg: "#f0f9ff", text: "#0369a1", border: "#bae6fd" },
  SOTECH: { bg: "#f7fee7", text: "#3f6212", border: "#d9f99d" },
  ACCOUNTING: { bg: "#fffbeb", text: "#92400e", border: "#fde68a" },
  PENGELOLA_BARANG: { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
  KEPALA_PENGELOLA_BARANG: { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
  TEKNISI: { bg: "#fff7ed", text: "#c2410c", border: "#fed7aa" },
  PENGANTARAN: { bg: "#f0fdfa", text: "#0f766e", border: "#99f6e4" },
  MARKETING: { bg: "#fdf2f8", text: "#9d174d", border: "#fbcfe8" },
  KEBERSIHAN: { bg: "#ecfeff", text: "#0e7490", border: "#a5f3fc" },
  PENYEDIA_BARANG: { bg: "#fefce8", text: "#854d0e", border: "#fef08a" },
  KEPALA_PENYEDIA_BARANG: { bg: "#fff7ed", text: "#c2410c", border: "#fed7aa" },
  KONTEN: { bg: "#fdf4ff", text: "#86198f", border: "#f0abfc" },
  KEPALA_ONPOINT: { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0" },
  ONPOINT: { bg: "#ecfdf5", text: "#047857", border: "#a7f3d0" },
  KEPALA_SOTECH: { bg: "#f7fee7", text: "#3f6212", border: "#d9f99d" },
  PKL: { bg: "#f8fafc", text: "#475569", border: "#cbd5e1" },
  PKL_MARKETING: PKL_BADGE,
  PKL_SALES: PKL_BADGE,
  PKL_PENYEDIA_BARANG: PKL_BADGE,
  PKL_SOTECH: PKL_BADGE,
  PKL_ONPOINT: PKL_BADGE,
  PKL_TEKNISI: PKL_BADGE,
  PKL_KONTEN: PKL_BADGE,
  PKL_PENGANTARAN: PKL_BADGE,
  PKL_CUSTOMER_SERVICE: PKL_BADGE,
  PKL_PENGELOLA_BARANG: PKL_BADGE,
  CUSTOMER_SERVICE: { bg: "#f0f9ff", text: "#0369a1", border: "#bae6fd" },
  PURCHASING: { bg: "#fdf4ff", text: "#7e22ce", border: "#e9d5ff" },
  KEPALA_ZENITH: { bg: "#fdf4ff", text: "#7e22ce", border: "#e9d5ff" },
};

export const ROLE_AVATAR_COLOR: Record<string, string> = {
  ADMIN: "#7c3aed",
  PROGRAMMER: "#4f46e5",
  ASISTEN_CEO: "#9333ea",
  KEPALA_SALES: "#059669",
  KEPALA_MARKETING: "#e11d48",
  KEPALA_TEKNISI: "#dc2626",
  CREW_SALES: "#0284c7",
  SOTECH: "#65a30d",
  ACCOUNTING: "#d97706",
  PENGELOLA_BARANG: "#2563eb",
  KEPALA_PENGELOLA_BARANG: "#1d4ed8",
  TEKNISI: "#ea580c",
  PENGANTARAN: "#0d9488",
  KEPALA_ZENITH: "#7c3aed",
  MARKETING: "#db2777",
  KEBERSIHAN: "#0891b2",
  PENYEDIA_BARANG: "#ca8a04",
  KEPALA_PENYEDIA_BARANG: "#c2410c",
  KONTEN: "#a21caf",
  KEPALA_ONPOINT: "#16a34a",
  ONPOINT: "#15803d",
  KEPALA_SOTECH: "#4d7c0f",
  PKL: "#475569",
  PKL_MARKETING: "#b45309",
  PKL_SALES: "#b45309",
  PKL_PENYEDIA_BARANG: "#b45309",
  PKL_SOTECH: "#b45309",
  PKL_ONPOINT: "#b45309",
  PKL_TEKNISI: "#b45309",
  PKL_KONTEN: "#b45309",
  PKL_PENGANTARAN: "#b45309",
  PKL_CUSTOMER_SERVICE: "#b45309",
  PKL_PENGELOLA_BARANG: "#b45309",
  CUSTOMER_SERVICE: "#0369a1",
  PURCHASING: "#9333ea",
};

const DEFAULT_BADGE: BadgeStyle = { bg: "#f8fafc", text: "#475569", border: "#e2e8f0" };

/** Role PKL bawaan sistem (tanpa role custom). */
export function isStaticPKLRole(role: string): boolean {
  return PKL_ROLE_SET.has(role);
}

/**
 * Role PKL termasuk role custom dari tabel `dynamic_roles` (kolom `is_pkl`).
 * Lookup dibuat sekali di caller lalu dipakai ulang supaya tidak O(n²).
 */
export function isPKLRole(
  role: string,
  customLookup?: Map<string, CustomRoleRow>
): boolean {
  const custom = customLookup?.get(role);
  if (custom) return custom.is_pkl;
  return PKL_ROLE_SET.has(role);
}

export function buildCustomRoleLookup(rows: CustomRoleRow[]): Map<string, CustomRoleRow> {
  const map = new Map<string, CustomRoleRow>();
  for (const r of rows) map.set(r.key, r);
  return map;
}

export function getRoleLabel(
  role: string,
  customLookup?: Map<string, CustomRoleRow>
): string {
  return customLookup?.get(role)?.label ?? ROLE_LABEL[role] ?? role;
}

export function getRoleBadge(
  role: string,
  customLookup?: Map<string, CustomRoleRow>
): BadgeStyle {
  const custom = customLookup?.get(role);
  if (custom) {
    return { bg: custom.badge_bg, text: custom.badge_text, border: custom.badge_border };
  }
  return ROLE_BADGE_STYLE[role] ?? DEFAULT_BADGE;
}

export function getAvatarColor(role: string): string {
  return ROLE_AVATAR_COLOR[role] ?? "#6b7280";
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}