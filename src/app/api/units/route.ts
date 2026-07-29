import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";

async function getHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  try {
    const { data, error } = await supabase
      .from("laptop_units")
      .select(`
        *,
        laptops (
          laptop_name,
          brand,
          cpu,
          ram,
          storage
        )
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // ── Enrich unit SOLD dengan tanggal & harga dari Riwayat Transaksi ───────
    // "Tgl Keluar" & "Harga Terjual" harus ngikutin transaksi asli, bukan
    // created_at/selling_price milik unit itu sendiri.
    const soldUnits = (data ?? []).filter((u: any) => u.status === "SOLD");
    const soldUnitIds = soldUnits.map((u: any) => u.id);
    const soldUnitIdSet = new Set(soldUnitIds);

    const saleMap = new Map<string, { sold_at: string; sold_price: number }>();

    if (soldUnitIds.length > 0) {
      // ── Ambil SEMUA baris transactions sekali jalan ──────────────────────
      // Sengaja TIDAK pakai .overlaps()/.contains() di query untuk mencocokkan
      // unit_ids, karena hasilnya tergantung tipe kolom asli di DB (array vs
      // jsonb) dan riskan gagal diam-diam. Pencocokan unit ID dilakukan di JS
      // supaya selalu konsisten, apapun tipe kolomnya — dan juga menghindari
      // limit panjang URL kalau jumlah unit SOLD sudah banyak.
      const { data: allTx, error: allTxErr } = await supabase
        .from("transactions")
        .select("invoice_number, unit_id, unit_ids, created_at, deal_price, amount, status");
      if (allTxErr) console.error("[GET /api/units] allTx error:", allTxErr.message);

      const txByInvoice = new Map((allTx ?? []).map((t: any) => [t.invoice_number, t]));

      // Path A (prioritas utama) — harga per-unit paling akurat dari
      // transaction_items.deal_price (selalu terisi utk transaksi modern).
      const { data: txItems, error: txItemsErr } = await supabase
        .from("transaction_items")
        .select("unit_id, invoice_number, deal_price")
        .in("unit_id", soldUnitIds);
      if (txItemsErr) console.error("[GET /api/units] txItems error:", txItemsErr.message);

      for (const item of txItems ?? []) {
        const tx = txByInvoice.get(item.invoice_number);
        if (!tx || tx.status === "CANCELLED") continue;
        const existing = saleMap.get(item.unit_id);
        const candidatePrice = Number(item.deal_price) || Number(tx.deal_price ?? tx.amount ?? 0);
        if (!existing || new Date(tx.created_at) > new Date(existing.sold_at)) {
          saleMap.set(item.unit_id, { sold_at: tx.created_at, sold_price: candidatePrice });
        }
      }

      // Path B (fallback) — transaksi lama yang belum punya baris
      // transaction_items sama sekali, dicocokkan langsung dari kolom
      // transactions.unit_id (single) & transactions.unit_ids (array/jsonb).
      for (const tx of allTx ?? []) {
        if (tx.status === "CANCELLED") continue;

        // Single-unit lama
        if (tx.unit_id && soldUnitIdSet.has(tx.unit_id) && !saleMap.has(tx.unit_id)) {
          saleMap.set(tx.unit_id, {
            sold_at: tx.created_at,
            sold_price: Number(tx.deal_price ?? tx.amount ?? 0),
          });
        }

        // Multi-unit lama — harga dibagi rata per unit dalam transaksi itu
        const ids: string[] = Array.isArray(tx.unit_ids) ? tx.unit_ids : [];
        if (ids.length > 0) {
          const count = ids.length;
          for (const uid of ids) {
            if (!soldUnitIdSet.has(uid) || saleMap.has(uid)) continue;
            saleMap.set(uid, {
              sold_at: tx.created_at,
              sold_price: Math.round(Number(tx.deal_price ?? tx.amount ?? 0) / count),
            });
          }
        }
      }
    }

    const enriched = (data ?? []).map((u: any) => ({
      ...u,
      sold_at: saleMap.get(u.id)?.sold_at ?? null,
      sold_price: saleMap.get(u.id)?.sold_price ?? null,
    }));

    return NextResponse.json({ success: true, data: enriched });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { success: false, message: "Gagal mengambil data semua unit" },
      { status: 500 }
    );
  }
}

export const GET = withAuth(getHandler, PERMISSIONS.VIEW_ALL_UNITS);