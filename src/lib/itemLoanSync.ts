import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Saat unit terjual (status jadi SOLD/TERJUAL di confirm-payment), pinjaman
 * yang masih aktif (PENDING/APPROVED) untuk unit itu otomatis ditutup jadi
 * status "SOLD" dan pindah ke Riwayat Peminjaman. Data lama TIDAK dihapus —
 * cuma ganti status (arsip). Idempoten: unit yang sudah SOLD/RETURNED/REJECTED
 * tidak disentuh lagi, jadi aman walau dipanggil berkali-kali.
 *
 * Dibuat non-blocking di pemanggil (dibungkus try/catch) supaya kegagalan sinkron
 * TIDAK membatalkan transaksi penjualan yang sudah sukses.
 */
export async function markLoansSoldOnSale(
  supabase: SupabaseClient,
  unitIds: string[],
  invoiceNumber: string,
): Promise<void> {
  const ids = Array.from(new Set((unitIds ?? []).filter(Boolean)));
  if (ids.length === 0) return;

  // Hanya pinjaman yang MASIH aktif (PENDING/APPROVED) yang ditutup.
  // REJECTED/RETURNED/SOLD dibiarkan — mencegah dobel-proses & menjaga arsip.
  const { error } = await supabase
    .from("item_loans")
    .update({
      status: "SOLD",
      sold_at: new Date().toISOString(),
      sold_invoice: invoiceNumber,
    })
    .in("unit_id", ids)
    .in("status", ["PENDING", "APPROVED"]);

  if (error) {
    // Jangan throw — pemanggil memperlakukan ini sebagai best-effort.
    console.error("[markLoansSoldOnSale]", error.message);
  }
}