// src/app/api/preparation/direct/route.ts
// Sales bikin Pengantaran LANGSUNG — tanpa lewat antrian Penyedia Barang.
// Beda dari POST /api/preparation (order berstatus MENUNGGU, nunggu Penyedia
// Barang cek unit dulu), endpoint ini langsung bikin order di status akhir
// siap-antar (MENUNGGU_PENGANTAR/DIKIRIM/SELESAI) sesuai delivery_method —
// setara "POST /api/preparation lalu POST dispatch" digabung jadi satu.
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PREPARATION_DIRECT_DELIVERY_ROLES } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";
import { generateOrderNumber } from "@/lib/preparationOrderNumber";

async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  try {
    const body = await req.json();
    const {
      customer_name, customer_phone, notes, items,
      delivery_method, delivery_address, dest_lat, dest_lng,
      delivery_user_id, delivery_user_name, scheduled_delivery_date,
      courier_service, courier_tracking_number, courier_note,
    } = body;

    if (!customer_name || !String(customer_name).trim()) {
      return NextResponse.json({ success: false, message: "Nama customer wajib diisi" }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, message: "Minimal 1 serial number harus diisi" }, { status: 400 });
    }
    if (!delivery_method) {
      return NextResponse.json({ success: false, message: "Metode pengiriman wajib dipilih" }, { status: 400 });
    }

    const cleanItems = items
      .map((it: any) => ({
        serial_number: String(it.serial_number ?? "").trim(),
        laptop_name: it.laptop_name ?? null,
        laptop_id: it.laptop_id ?? null,
        unit_id: it.unit_id ?? null,
      }))
      .filter((it) => it.serial_number);

    if (cleanItems.length === 0) {
      return NextResponse.json({ success: false, message: "Serial number tidak boleh kosong" }, { status: 400 });
    }

    // ── Validasi per metode — sama seperti api/preparation/[id]/dispatch/route.ts ──
    if (delivery_method === "PENGANTARAN") {
      if (!delivery_address || !String(delivery_address).trim()) {
        return NextResponse.json({ success: false, message: "Alamat tujuan wajib diisi" }, { status: 400 });
      }
      if (!delivery_user_id) {
        return NextResponse.json({ success: false, message: "Pilih pengantar yang bertugas" }, { status: 400 });
      }
    }
    if (delivery_method === "KURIR" && (!courier_service || !String(courier_service).trim())) {
      return NextResponse.json({ success: false, message: "Nama jasa kurir wajib diisi" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const nextStatus =
      delivery_method === "DIAMBIL_CUSTOMER" ? "SELESAI"
        : delivery_method === "PENGANTARAN" ? "MENUNGGU_PENGANTAR"
          : "DIKIRIM";

    const order_number = await generateOrderNumber();

    const payload: Record<string, any> = {
      order_number,
      customer_name: String(customer_name).trim(),
      customer_phone: customer_phone ?? null,
      notes: notes ?? null,
      status: nextStatus,
      created_by: user.id,
      created_by_name: user.name,
      created_by_role: user.role,
      // ── Ditandai "langsung" — TIDAK PERNAH melalui tahap Penyedia Barang.
      // received_by/received_at/done_by/done_at SENGAJA dibiarkan null,
      // supaya jelas kelihatan di riwayat kalau order ini skip tahap itu.
      is_direct_delivery: true,
      dispatched_by: user.id,
      dispatched_by_name: user.name,
      dispatched_at: now,
    };

    if (delivery_method === "PENGANTARAN") {
      payload.delivery_method = "PENGANTARAN";
      payload.delivery_address = String(delivery_address).trim();
      payload.dest_lat = dest_lat ?? null;
      payload.dest_lng = dest_lng ?? null;
      payload.delivery_user_id = delivery_user_id;
      payload.delivery_user_name = delivery_user_name ?? null;
      payload.scheduled_delivery_date = scheduled_delivery_date ?? null;
    }
    if (delivery_method === "KURIR") {
      payload.delivery_method = "KURIR";
      payload.courier_service = String(courier_service).trim();
      payload.courier_tracking_number = courier_tracking_number?.trim() ?? null;
      payload.courier_note = courier_note?.trim() ?? null;
    }
    if (delivery_method === "DIAMBIL_CUSTOMER") {
      payload.delivery_method = "DIAMBIL_CUSTOMER";
      payload.delivered_at = now;
    }

    const { data: order, error: orderError } = await supabase
      .from("preparation_orders")
      .insert(payload)
      .select()
      .single();

    if (orderError) throw orderError;

    const { error: itemsError } = await supabase
      .from("preparation_items")
      .insert(cleanItems.map((it) => ({ preparation_id: order.id, ...it })));

    if (itemsError) {
      await supabase.from("preparation_orders").delete().eq("id", order.id);
      throw itemsError;
    }

    // ── SENGAJA TIDAK ADA update ke laptop_units di sini ──
    // Sama seperti POST /api/preparation biasa: Pengantaran langsung juga
    // tidak pernah mengunci/mengubah status unit. Stok Siap Jual baru
    // berkurang saat Transaksi (penjualan) benar-benar dibuat.

    await logActivity({
      userId: user.id, userName: user.name, userRole: user.role,
      action: "CREATE", entity: "preparation", entityId: order.id,
      entityLabel: `${order_number} — ${customer_name} (Pengantaran langsung, ${cleanItems.length} SN)`,
      afterData: order,
    });

    return NextResponse.json({
      success: true, data: order,
      message: `Pengantaran ${order_number} dibuat langsung (${cleanItems.length} unit)`,
    });
  } catch (err: any) {
    console.error("[POST /api/preparation/direct]", err);
    return NextResponse.json({ success: false, message: err?.message ?? "Gagal membuat pengantaran" }, { status: 500 });
  }
}

export const POST = withAuth(postHandler, PREPARATION_DIRECT_DELIVERY_ROLES);