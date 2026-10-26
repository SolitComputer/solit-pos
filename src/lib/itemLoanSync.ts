import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Unit terjual (transaksi lunas) → pinjaman aktif untuk unit itu ditutup jadi
 * "SOLD" & pindah ke Riwayat. Termasuk pinjaman "DIPESAN" (nebeng transaksi
 * pending yang akhirnya lunas). Idempoten & best-effort.
 */
export async function markLoansSoldOnSale(
  supabase: SupabaseClient,
  unitIds: string[],
  invoiceNumber: string,
): Promise<void> {
  const ids = Array.from(new Set((unitIds ?? []).filter(Boolean)));
  if (ids.length === 0) return;

  const { error } = await supabase
    .from("item_loans")
    .update({
      status: "SOLD",
      sold_at: new Date().toISOString(),
      sold_invoice: invoiceNumber,
      ordered_invoice: null,
    })
    .in("unit_id", ids)
    .in("status", ["PENDING", "APPROVED", "DIPESAN"]);

  if (error) console.error("[markLoansSoldOnSale]", error.message);
}

/**
 * Sales input transaksi PENDING pakai unit yang LAGI DIPINJAM (APPROVED) →
 * pinjaman jadi "DIPESAN" + dicatat invoice pemesanannya. Hanya APPROVED yang
 * disentuh. Best-effort.
 */
export async function markLoansOrderedOnPending(
  supabase: SupabaseClient,
  unitIds: string[],
  invoiceNumber: string,
): Promise<void> {
  const ids = Array.from(new Set((unitIds ?? []).filter(Boolean)));
  if (ids.length === 0) return;

  const { error } = await supabase
    .from("item_loans")
    .update({ status: "DIPESAN", ordered_invoice: invoiceNumber })
    .in("unit_id", ids)
    .eq("status", "APPROVED");

  if (error) console.error("[markLoansOrderedOnPending]", error.message);
}

/**
 * Transaksi (pending ATAU lunas) dibatalkan/di-restore → pinjaman yang sempat
 * "DIPESAN"/"SOLD" KARENA transaksi ini balik ke "APPROVED" (Dipinjam).
 * Dicocokkan lewat invoice supaya tidak menyentuh pinjaman lain untuk unit yang
 * sama. Kalau `unitIds` diisi (restore/cancel SEBAGIAN), cuma unit itu yang
 * dibalikin. Best-effort.
 */
export async function revertLoansOnCancel(
  supabase: SupabaseClient,
  invoiceNumber: string,
  unitIds?: string[],
): Promise<void> {
  if (!invoiceNumber) return;
  const ids = Array.from(new Set((unitIds ?? []).filter(Boolean)));
  const scoped = ids.length > 0;

  // DIPESAN (dari transaksi pending ini) → APPROVED.
  {
    let q = supabase
      .from("item_loans")
      .update({ status: "APPROVED", ordered_invoice: null })
      .eq("ordered_invoice", invoiceNumber)
      .eq("status", "DIPESAN");
    if (scoped) q = q.in("unit_id", ids);
    const { error } = await q;
    if (error) console.error("[revertLoansOnCancel/dipesan]", error.message);
  }

  // SOLD (dari transaksi ini yang di-restore) → APPROVED + bersihkan.
  {
    let q = supabase
      .from("item_loans")
      .update({ status: "APPROVED", sold_at: null, sold_invoice: null })
      .eq("sold_invoice", invoiceNumber)
      .eq("status", "SOLD");
    if (scoped) q = q.in("unit_id", ids);
    const { error } = await q;
    if (error) console.error("[revertLoansOnCancel/sold]", error.message);
  }
}