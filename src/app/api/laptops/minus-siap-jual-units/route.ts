import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { LAPTOP_MINUS_SIAP_JUAL_VIEW_ROLES, BARANG_PRIVATE_VIEW_ROLES, hasAnyRole } from "@/lib/permissions";
// Pola persis sama dengan /api/laptops/ready-units, tapi:
//  - status yang diambil HANYA "MINUS_SIAP_JUAL" (unit minus yg sudah boleh
//    dijual / bisa dibikin payment), bukan "SIAP_JUAL".
//  - RESERVED/HELD/PACKING SENGAJA tidak diikutkan: begitu unit minus di-DP,
//    statusnya pindah ke RESERVED dan kehilangan jejak "asalnya minus".
//    Kalau diambil juga, unit RESERVED akan DOBEL muncul di halaman Barang
//    Siap Jual & halaman ini. Jadi di sini murni MINUS_SIAP_JUAL.
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
      .eq("status", "MINUS_SIAP_JUAL")
      .order("created_at", { ascending: false });

    if (laptopId) query = query.eq("laptop_id", laptopId);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }

    // Unit "Minus Siap Jual" baru dimunculkan kalau Harga Jual (selling_price)
    // sudah terisi (> 0) — tanpa harga jual, unit belum bisa dibikin payment.
    // CATATAN: Harga Modal (purchase_price) SENGAJA tidak ikut digate di sini
    // (beda dgn ready-units yg mewajibkan modal & jual > 0), karena barang minus
    // sering baru dilengkapi modalnya belakangan. Tambahkan
    // `Number(u.purchase_price) > 0 &&` di filter ini kalau mau 100% sama.
    const filtered = (data || []).filter(
      (u: Record<string, any>) => Number(u.selling_price) > 0
    );

    // ── Tandai unit yang SEDANG dipegang Penyiapan Barang aktif ──────────────
    // Sama persis dengan logika di ready-units (dicocokkan lewat serial_number).
    const { data: allOrders, error: ordersErr } = await supabase
      .from("preparation_orders")
      .select("id, order_number, status");

    if (ordersErr) {
      console.error("[minus-siap-jual-units] gagal ambil preparation_orders:", ordersErr.message);
    }

    const activeOrders = (allOrders ?? []).filter(
      (o: any) => o.status !== "SELESAI" && o.status !== "DIBATALKAN"
    );
    const orderIds = activeOrders.map((o: any) => o.id);
    const orderNumberMap = new Map(activeOrders.map((o: any) => [o.id, o.order_number]));

    const preparingSnMap = new Map<string, string>();
    if (orderIds.length > 0) {
      const { data: activeItems, error: itemsErr } = await supabase
        .from("preparation_items")
        .select("serial_number, preparation_id")
        .in("preparation_id", orderIds)
        .eq("is_cancelled", false);

      if (itemsErr) {
        console.error("[minus-siap-jual-units] gagal ambil preparation_items aktif:", itemsErr.message);
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

    // Harga modal/sparepart disaring DI SERVER untuk role non-privat (mis. Sales),
    // supaya tidak bocor lewat Network tab — mengikuti perbaikan keamanan yang
    // sudah ada di /api/laptops/[id]/route.ts.
    const canSeePrivate = hasAnyRole(user.roles ?? [user.role], BARANG_PRIVATE_VIEW_ROLES);
    const safe = canSeePrivate
      ? withPrepStatus
      : withPrepStatus.map((u: Record<string, any>) => {
          const { purchase_price, sparepart_cost, ...rest } = u;
          return rest;
        });

    return NextResponse.json({ success: true, data: safe });
  } catch (err) {
    console.error("[minus-siap-jual-units]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(handler, LAPTOP_MINUS_SIAP_JUAL_VIEW_ROLES);