import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { LAPTOP_READY_VIEW_ROLES } from "@/lib/permissions";

async function handler(req: NextRequest, ctx: any, user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const laptopId = searchParams.get("laptop_id");

    let query = supabase
      .from("laptop_units")
      .select(`
        *,
        laptop:laptops (
          id,
          laptop_name,
          brand,
          cpu,
          ram,
          storage,
          display,
          selling_price
        )
      `)
      .in("status", ["SIAP_JUAL", "RESERVED", "HELD", "PACKING"])
      .order("created_at", { ascending: false });

    // Filter per laptop kalau laptop_id diberikan
    if (laptopId) {
      query = query.eq("laptop_id", laptopId);
    }

   const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    //  Unit status SIAP_JUAL baru dianggap benar-benar "siap jual" kalau
    //  Harga Modal (purchase_price) & Harga Jual (selling_price) sudah
    //  diisi (> 0). Kalau salah satu masih 0/kosong, jangan tampilkan dulu
    //  sampai datanya dilengkapi di Data Laptop.
    //  RESERVED/HELD/PACKING tetap tampil apa adanya — sudah terikat
    //  transaksi, perlu kelihatan untuk proses pelunasan.
    const filtered = (data || []).filter((u: Record<string, any>) => {
      if (u.status !== "SIAP_JUAL") return true;
      const hasPurchasePrice = Number(u.purchase_price) > 0;
      const hasSellingPrice = Number(u.selling_price) > 0;
      return hasPurchasePrice && hasSellingPrice;
    });

    // ── Tandai unit yang SEDANG dipegang Penyiapan Barang yang masih aktif ──
    // (belum SELESAI/DIBATALKAN) — supaya Provider tahu unit ini sudah
    // "dipesan" sales lewat Penyiapan, walau laptop_units.status-nya sendiri
    // TIDAK PERNAH diubah oleh alur Penyiapan (lihat komentar di
    // api/preparation/route.ts — "Preparation TIDAK mengunci/mengubah status
    // unit sama sekali"). Dicocokkan lewat serial_number karena kolom itu
    // SELALU terisi di preparation_items (unit_id belum tentu, kalau SN
    // diketik manual/scan barcode).
    const { data: allOrders, error: ordersErr } = await supabase
      .from("preparation_orders")
      .select("id, order_number, status");

    if (ordersErr) {
      console.error("[ready-units] gagal ambil preparation_orders:", ordersErr.message);
    }

    const activeOrders = (allOrders ?? []).filter(
      (o: any) => o.status !== "SELESAI" && o.status !== "DIBATALKAN"
    );
    const orderIds = activeOrders.map((o: any) => o.id);
    const orderNumberMap = new Map(activeOrders.map((o: any) => [o.id, o.order_number]));

    const preparingSnMap = new Map<string, string>(); // serial_number -> order_number
    if (orderIds.length > 0) {
      const { data: activeItems, error: itemsErr } = await supabase
        .from("preparation_items")
        .select("serial_number, preparation_id")
        .in("preparation_id", orderIds)
        .eq("is_cancelled", false);

      if (itemsErr) {
        console.error("[ready-units] gagal ambil preparation_items aktif:", itemsErr.message);
      }

      (activeItems ?? []).forEach((it: any) => {
        if (it.serial_number && !preparingSnMap.has(it.serial_number)) {
          preparingSnMap.set(it.serial_number, orderNumberMap.get(it.preparation_id) ?? "");
        }
      });
    }

    const withPrepStatus = filtered.map((u: Record<string, any>) => ({
      ...u,
      being_prepared: preparingSnMap.has(u.serial_number),
      preparing_order_number: preparingSnMap.get(u.serial_number) ?? null,
    }));

    return NextResponse.json({ success: true, data: withPrepStatus });
  } catch (err) {
    console.error("[ready-units]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(handler, LAPTOP_READY_VIEW_ROLES);