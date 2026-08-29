import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";

// Helper: pecah serial_number/serial_numbers (array atau string dipisah koma)
// jadi array string bersih — sama persis logicnya dgn /api/transaction/route.ts
function splitSerials(raw: any): string[] {
  if (Array.isArray(raw)) return raw.filter(Boolean).map((s: string) => String(s).trim()).filter(Boolean);
  if (typeof raw === "string" && raw.trim()) {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

async function getHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  try {
    const url = new URL(req.url);
    // Filter opsional lewat query string, misal /api/units?status=SOLD
    // Kalau gak dikirim → behavior lama tetap jalan (ambil semua status),
    // jadi endpoint ini tetap aman dipakai halaman lain yang butuh semua unit.
    const statusFilter = url.searchParams.get("status");

    let query = supabase
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

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }

    const { data, error } = await query;

    if (error) throw error;

        // ── Rekonsiliasi unit "SOLD" yang stale ──────────────────────────────────
    // Kasus nyata (mis. INV-20260726-001): transaksi multi-laptop kadang cuma
    // nge-link SEBAGIAN unit ke transactions.unit_ids, jadi unit yang
    // "ketinggalan" gak pernah di-flip ke status SOLD di laptop_units — padahal
    // SN-nya beneran tercatat lunas di transactions.serial_numbers /
    // transaction_items. Riwayat Transaksi tetap nemuin (full-text search),
    // tapi halaman ini query laptop_units WHERE status='SOLD' doang, jadi unit
    // begini "hilang" dari Barang Terjual walau datanya ada di inventory.
    //
    // Kalau request ini minta status=SOLD, tarik juga unit yang SN-nya muncul
    // di transaksi PAID (non-cancelled) tapi kolom status-nya belum SOLD, lalu
    // paksa status jadi SOLD di RESPONSE (bukan di DB) supaya konsisten sama
    // Riwayat Transaksi.
    let allUnitRows: any[] = data ?? [];

    if (statusFilter === "SOLD") {
      const knownSerials = new Set(
        allUnitRows.map((u: any) => u.serial_number).filter(Boolean)
      );

      const { data: paidTx, error: paidTxErr } = await supabase
        .from("transactions")
        .select("serial_number, serial_numbers, status")
        .eq("status", "PAID");
      if (paidTxErr) console.error("[GET /api/units] paidTx error:", paidTxErr.message);

      const missingSerials = new Set<string>();
      for (const tx of paidTx ?? []) {
        for (const sn of [...splitSerials(tx.serial_numbers), ...splitSerials(tx.serial_number)]) {
          if (sn && sn !== "-" && !knownSerials.has(sn)) missingSerials.add(sn);
        }
      }

      if (missingSerials.size > 0) {
        const { data: strayUnits, error: strayErr } = await supabase
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
          .in("serial_number", Array.from(missingSerials));
        if (strayErr) console.error("[GET /api/units] strayUnits error:", strayErr.message);

        for (const u of strayUnits ?? []) {
          if (allUnitRows.some((r: any) => r.id === u.id)) continue;
          allUnitRows = [...allUnitRows, { ...u, status: "SOLD" }];
        }
      }
    }

    const soldUnits = allUnitRows.filter((u: any) => u.status === "SOLD");
    const soldUnitIds = soldUnits.map((u: any) => u.id);
    const soldUnitIdSet = new Set(soldUnitIds);
    const saleMap = new Map<string, { sold_at: string; sold_price: number }>();

    if (soldUnitIds.length > 0) {
      const [
        { data: allTx, error: allTxErr },
        { data: txItems, error: txItemsErr },
      ] = await Promise.all([
        supabase
          .from("transactions")
          .select("invoice_number, unit_id, unit_ids, serial_number, serial_numbers, created_at, deal_price, amount, status"),
        supabase
          .from("transaction_items")
          .select("unit_id, invoice_number, deal_price")
          .in("unit_id", soldUnitIds),
      ]);

      if (allTxErr) console.error("[GET /api/units] allTx error:", allTxErr.message);
      if (txItemsErr) console.error("[GET /api/units] txItems error:", txItemsErr.message);

      const txByInvoice = new Map((allTx ?? []).map((t: any) => [t.invoice_number, t]));

      // Path A (prioritas utama) — harga per-unit paling akurat dari
      // transaction_items.deal_price (selalu terisi utk transaksi modern).
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

      // Path C (fallback tambahan) — transaksi yang unit_id & unit_ids-nya
      // KOSONG, tapi serial number di transaksinya cocok sama SN unit SOLD.
      // Ini nyamain logic yang dipakai /api/transaction (Riwayat Transaksi).
      const soldSerialToId = new Map<string, string>();
      for (const u of soldUnits) {
        if (u.serial_number) soldSerialToId.set(u.serial_number, u.id);
      }

      if (soldSerialToId.size > 0) {
        for (const tx of allTx ?? []) {
          if (tx.status === "CANCELLED") continue;
          const serials = [...splitSerials(tx.serial_numbers), ...splitSerials(tx.serial_number)];
          if (serials.length === 0) continue;
          const count = serials.length;
          for (const sn of serials) {
            const uid = soldSerialToId.get(sn);
            if (!uid || saleMap.has(uid)) continue;
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