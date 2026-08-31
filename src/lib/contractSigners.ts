// Mapping penandatangan kontrak (admin yang wajib countersign).
// Aturan bisnis saat ini:
// - Semua kontrak karyawan ditandatangani oleh Yoga (ADMIN).
// - Kontrak milik Yoga sendiri ditandatangani oleh Reinaldy.
// - Reinaldy & Herliana tidak menerima kontrak kerja sama sekali.
//
// ID di bawah pakai id user tetap (bukan role), jadi kalau orangnya
// diganti suatu saat, cukup update konstanta ini saja.

export const YOGA_ADMIN_ID = "7b56de81-244e-42af-b2f6-0e29631c4114";
export const REINALDY_ADMIN_ID = "236c08b5-0dd2-4f2f-95d6-286c5b6dd75e";
export const HERLIANA_ADMIN_ID = "97f9396d-50d6-4cbc-9b0b-819a812bde72";

const CONTRACT_EXCLUDED_USER_IDS: readonly string[] = [REINALDY_ADMIN_ID, HERLIANA_ADMIN_ID];

/** Menentukan admin yang wajib menandatangani kontrak milik targetUserId. */
export function getContractSignerId(targetUserId: string): string {
  return targetUserId === YOGA_ADMIN_ID ? REINALDY_ADMIN_ID : YOGA_ADMIN_ID;
}

/** User yang memang tidak pernah menerima kontrak kerja. */
export function isExcludedFromContracts(targetUserId: string): boolean {
  return CONTRACT_EXCLUDED_USER_IDS.includes(targetUserId);
}