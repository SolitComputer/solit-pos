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

/**
 * Kebalikan dari service-consume: saat sparepart service DIBATALKAN (unit balik
 * ke stok), pinjaman yang sempat jadi "Terjual" KARENA service itu dikembalikan
 * ke "APPROVED" (Dipinjam). Hanya menyentuh loan dengan sold_invoice "SERVICE-%"
 * supaya penjualan via transaksi (INV-...) tidak ikut ter-revert. Best-effort.
 */
export async function revertLoansOnServiceCancel(
  supabase: SupabaseClient,
  unitIds: string[],
): Promise<void> {
  const ids = Array.from(new Set((unitIds ?? []).filter(Boolean)));
  if (ids.length === 0) return;

  const { error } = await supabase
    .from("item_loans")
    .update({ status: "APPROVED", sold_at: null, sold_invoice: null })
    .in("unit_id", ids)
    .eq("status", "SOLD")
    .like("sold_invoice", "SERVICE-%");

  if (error) console.error("[revertLoansOnServiceCancel]", error.message);
} 
/**
 * AUTO-REKONSILIASI pinjaman. Pinjaman aktif (APPROVED/DIPESAN) yang unitnya
 * SUDAH keluar permanen → ditutup "SOLD" & pindah ke Riwayat Peminjaman.
 *   - Aksesoris: status unit TERJUAL/KELUAR, ATAU outflow aktif dari service /
 *     pengambilan / transaksi yang SUDAH FINAL (bukan pending, bukan cancelled).
 *   - Laptop: status unit SOLD.
 * Transaksi pending (RESERVED/HELD/PACKING/PENDING) & CANCELLED TIDAK menutup
 * pinjaman. Idempoten & best-effort. Return: jumlah pinjaman yang ditutup.
 */
export async function reconcileClosedLoans(supabase: SupabaseClient): Promise<number> {
  const { data: loans } = await supabase
    .from("item_loans")
    .select("id, unit_id, item_type")
    .in("status", ["APPROVED", "DIPESAN"])
    .not("unit_id", "is", null);
  if (!loans || loans.length === 0) return 0;

  const unitIds = Array.from(new Set(loans.map(l => l.unit_id).filter(Boolean))) as string[];
  if (unitIds.length === 0) return 0;

  const [accRes, lapRes, outRes] = await Promise.all([
    supabase.from("accessory_units").select("id, status").in("id", unitIds),
    supabase.from("laptop_units").select("id, status").in("id", unitIds),
    supabase.from("accessory_outflows")
      .select("unit_id, source_type, transaction_invoice")
      .eq("status", "active").in("unit_id", unitIds),
  ]);

  const accStatus = new Map((accRes.data ?? []).map(u => [u.id, u.status]));
  const lapStatus = new Map((lapRes.data ?? []).map(u => [u.id, u.status]));
  const outflows = outRes.data ?? [];

  const invoices = Array.from(new Set(
    outflows.filter(o => o.source_type === "transaction" && o.transaction_invoice)
            .map(o => o.transaction_invoice as string),
  ));
  const txStatus = new Map<string, string>();
  if (invoices.length > 0) {
    const { data: txs } = await supabase
      .from("transactions").select("invoice_number, status").in("invoice_number", invoices);
    for (const t of txs ?? []) txStatus.set(t.invoice_number, t.status);
  }

  const NOT_FINAL = new Set(["CANCELLED", "RESERVED", "HELD", "PACKING", "PENDING"]);

  const goneByOutflow = new Map<string, string>(); // unit_id -> ref sold_invoice
  for (const o of outflows) {
    if (!o.unit_id) continue;
    if (o.source_type === "service") goneByOutflow.set(o.unit_id, "SERVICE");
    else if (o.source_type === "manual") goneByOutflow.set(o.unit_id, "PENGAMBILAN");
    else if (o.source_type === "transaction" && o.transaction_invoice) {
      const st = txStatus.get(o.transaction_invoice);
      if (st && !NOT_FINAL.has(st)) goneByOutflow.set(o.unit_id, o.transaction_invoice);
    }
  }

  const idsByRef = new Map<string, string[]>();
  for (const l of loans) {
    const uid = l.unit_id as string;
    let ref: string | null = null;
    if (l.item_type === "AKSESORIS") {
      const st = accStatus.get(uid);
      if (st === "TERJUAL" || st === "KELUAR") ref = "BACKFILL";
      else ref = goneByOutflow.get(uid) ?? null;
    } else if (l.item_type === "LAPTOP") {
      if (lapStatus.get(uid) === "SOLD") ref = "BACKFILL";
    }
    if (ref) {
      const arr = idsByRef.get(ref);
      if (arr) arr.push(l.id); else idsByRef.set(ref, [l.id]);
    }
  }

  const nowIso = new Date().toISOString();
  let closed = 0;
  for (const [ref, ids] of idsByRef) {
    const { error } = await supabase
      .from("item_loans")
      .update({ status: "SOLD", sold_at: nowIso, sold_invoice: ref })
      .in("id", ids)
      .in("status", ["APPROVED", "DIPESAN"]);
    if (!error) closed += ids.length;
  }
  return closed;
}

