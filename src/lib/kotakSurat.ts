import {
  UserRole,
  ALL_STATIC_ROLES,
  isPKLRole,
} from "@/lib/permissions";

// ── Siapa boleh LIHAT SEMUA masukan + HAPUS (halaman admin) ──────────────────
// FULL_ACCESS: Admin, Programmer, Asisten CEO (keputusan 2026-10-31).
export const KOTAK_SURAT_ADMIN_ROLES: UserRole[] = [
  "ADMIN",
  "PROGRAMMER",
  "ASISTEN_CEO",
];

// ── Siapa boleh KIRIM masukan ────────────────────────────────────────────────
// Semua role KECUALI PKL (PKL polos + semua PKL_*). Dibangun dari ALL_STATIC_ROLES
// biar otomatis ikut kalau nanti ada role non-PKL baru.
export const KOTAK_SURAT_SUBMIT_ROLES: UserRole[] = (ALL_STATIC_ROLES as UserRole[])
  .filter((r) => !isPKLRole(r));

// Helper kecil — dipakai di route & UI, konsisten satu sumber.
export function canSubmitKotakSurat(userRoles: string[]): boolean {
  return userRoles.some(
    (r) => !isPKLRole(r) && (KOTAK_SURAT_SUBMIT_ROLES as string[]).includes(r)
  );
}

export function canAdminKotakSurat(userRoles: string[]): boolean {
  return userRoles.some((r) => (KOTAK_SURAT_ADMIN_ROLES as string[]).includes(r));
}