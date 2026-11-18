// src/lib/sellerArchiveAccess.ts

// Daftar ID akun yang SELALU boleh arsip & edit alasan arsip di Management
// Seller, di luar role ADMIN. Dipakai di frontend (gating UI) dan backend
// (enforcement API) supaya satu sumber kebenaran — ubah di sini saja.
export const SELLER_ARCHIVE_MANAGER_IDS: readonly string[] = [
  "20c4df76-db02-4e36-977b-27b76c7fa803",
  "c35db5bc-8f7e-4e96-9015-dc84092bac19",
];

/**
 * True kalau userId ada di whitelist khusus arsip Management Seller.
 * Cek role ADMIN dilakukan terpisah oleh caller (hasAnyRole / roles.includes).
 */
export function isSellerArchiveManager(userId: string | null | undefined): boolean {
  return !!userId && SELLER_ARCHIVE_MANAGER_IDS.includes(userId);
}