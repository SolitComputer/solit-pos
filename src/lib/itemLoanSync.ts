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
 * AUTO-REKONSILIASI pinjaman. "Di Pesan" (DIPESAN) sudah DIHAPUS — begitu unit
 * dipakai di transaksi (PENDING maupun lunas) / service / pengambilan, pinjaman
 * langsung jadi "Terjual" & pindah ke Riwayat.
 *   0) Pinjaman DIPESAN lama → dikonversi jadi SOLD (sisa data lama).
 *   1) Pinjaman aktif (APPROVED) yang unitnya sudah keluar → SOLD:
 *      - Aksesoris: status TERJUAL/KELUAR, ATAU outflow aktif dari service /
 *        pengambilan / transaksi yang BELUM dibatalkan (pending pun dihitung).
 *      - Laptop: status unit SOLD.
 * Hanya transaksi CANCELLED yang TIDAK menutup pinjaman. Idempoten & best-effort.
 */
export async function reconcileClosedLoans(supabase: SupabaseClient): Promise<number> {
  let closed = 0;

  // 0) Fitur "Di Pesan" dihapus — DIPESAN lama → SOLD. ordered_invoice dipindah
  //    ke sold_invoice supaya kalau transaksi pending-nya dibatalkan, pinjaman
  //    tetap bisa balik "Dipinjam" lewat revertLoansOnCancel.
  const { data: dipesan } = await supabase
    .from("item_loans").select("id, ordered_invoice").eq("status", "DIPESAN");
  if (dipesan && dipesan.length > 0) {
    const ts = new Date().toISOString();
    for (const l of dipesan) {
      const { error } = await supabase.from("item_loans")
        .update({ status: "SOLD", sold_at: ts, sold_invoice: l.ordered_invoice ?? "BACKFILL", ordered_invoice: null })
        .eq("id", l.id).eq("status", "DIPESAN");
      if (!error) closed++;
    }
  }

  // 1) Pinjaman aktif (APPROVED) yang unitnya sudah keluar.
  const { data: loans } = await supabase
    .from("item_loans")
    .select("id, unit_id, serial_number, item_type")
    .eq("status", "APPROVED")
    .not("unit_id", "is", null);
  if (!loans || loans.length === 0) return closed;

  const unitIds = Array.from(new Set(loans.map(l => l.unit_id).filter(Boolean))) as string[];
  const serials = Array.from(new Set(loans.map(l => l.serial_number).filter(Boolean))) as string[];
  if (unitIds.length === 0) return closed;

  const [accRes, lapRes, outRes, txiUnitRes, txiSnRes] = await Promise.all([
    supabase.from("accessory_units").select("id, status").in("id", unitIds),
    supabase.from("laptop_units").select("id, status").in("id", unitIds),
    supabase.from("accessory_outflows")
      .select("unit_id, source_type").eq("status", "active").in("unit_id", unitIds),
    // ✅ NEW: laptop terjual lewat transaksi → transaction_items.unit_id
    supabase.from("transaction_items").select("unit_id, invoice_number").in("unit_id", unitIds),
    // ✅ NEW: aksesoris terjual lewat transaksi → transaction_items.serial_number.
    //    (unit_id di transaction_items SELALU null untuk aksesoris — lihat
    //    transaction/create — makanya outflow-nya pun ber-unit_id null & tak
    //    pernah kecocok. SN inilah jembatan yang andal.)
    serials.length > 0
      ? supabase.from("transaction_items").select("serial_number, invoice_number").in("serial_number", serials)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const accStatus = new Map((accRes.data ?? []).map(u => [u.id, u.status]));
  const lapStatus = new Map((lapRes.data ?? []).map(u => [u.id, u.status]));
  const outflows = outRes.data ?? [];
  const txiByUnit = txiUnitRes.data ?? [];
  const txiBySn = (txiSnRes as any).data ?? [];

  // Ambil status tiap transaksi yang menyentuh pinjaman ini.
  const invoiceSet = new Set<string>();
  for (const ti of txiByUnit) if (ti.invoice_number) invoiceSet.add(ti.invoice_number);
  for (const ti of txiBySn) if (ti.invoice_number) invoiceSet.add(ti.invoice_number);

  const txStatus = new Map<string, string>();
  if (invoiceSet.size > 0) {
    const { data: txs } = await supabase
      .from("transactions").select("invoice_number, status").in("invoice_number", [...invoiceSet]);
    for (const t of txs ?? []) txStatus.set(t.invoice_number, t.status);
  }
  // Pending pun dihitung "terjual"; hanya transaksi CANCELLED yang TIDAK menutup.
  const soldInvoice = (inv?: string | null) =>
    inv && txStatus.get(inv) !== "CANCELLED" ? inv : null;

  const soldByUnit = new Map<string, string>();
  for (const ti of txiByUnit) { const inv = soldInvoice(ti.invoice_number); if (ti.unit_id && inv) soldByUnit.set(ti.unit_id, inv); }
  const soldBySn = new Map<string, string>();
  for (const ti of txiBySn) { const inv = soldInvoice(ti.invoice_number); if (ti.serial_number && ti.serial_number !== "-" && inv) soldBySn.set(ti.serial_number, inv); }

  // Outflow service / pengambilan manual tetap jadi sinyal keluar (aksesoris).
  const goneByOutflow = new Map<string, string>();
  for (const o of outflows) {
    if (!o.unit_id) continue;
    if (o.source_type === "service") goneByOutflow.set(o.unit_id, "SERVICE");
    else if (o.source_type === "manual") goneByOutflow.set(o.unit_id, "PENGAMBILAN");
  }

  const idsByRef = new Map<string, string[]>();
  for (const l of loans) {
    const uid = l.unit_id as string;
    const sn = (l.serial_number as string | null) ?? null;
    let ref: string | null = null;

    // 1) Terjual lewat transaksi (langsung, pending/penyiapan, maupun pelunasan
    //    confirm-payment) — laptop via unit_id, aksesoris via serial_number.
    if (soldByUnit.has(uid)) ref = soldByUnit.get(uid)!;
    else if (sn && soldBySn.has(sn)) ref = soldBySn.get(sn)!;

    // 2) Fallback: status unit + outflow service/manual.
    if (!ref) {
      if (l.item_type === "AKSESORIS") {
        const st = accStatus.get(uid);
        if (st === "TERJUAL" || st === "KELUAR") ref = "BACKFILL";
        else ref = goneByOutflow.get(uid) ?? null;
      } else if (l.item_type === "LAPTOP") {
        if (lapStatus.get(uid) === "SOLD") ref = "BACKFILL";
      }
    }

    if (ref) {
      const arr = idsByRef.get(ref);
      if (arr) arr.push(l.id); else idsByRef.set(ref, [l.id]);
    }
  }

  const nowIso = new Date().toISOString();
  for (const [ref, ids] of idsByRef) {
    const { error } = await supabase
      .from("item_loans")
      .update({ status: "SOLD", sold_at: nowIso, sold_invoice: ref })
      .in("id", ids)
      .eq("status", "APPROVED");
    if (!error) closed += ids.length;
  }
  return closed;
}

