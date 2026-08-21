// src/app/api/preparation/[id]/dispatch/route.ts
// Sales/Kepala Sales menentukan metode pengiriman setelah penyedia selesai siapkan

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PREPARATION_CREATE_ROLES } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

interface Props { params: Promise<{ id: string }>; }

async function postHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;
    const body = await req.json();
    const {
      delivery_method,
      delivery_address,
      dest_lat, dest_lng,
      delivery_user_id, delivery_user_name,
      courier_service, courier_tracking_number, courier_note,
    } = body;

    if (!delivery_method) {
      return NextResponse.json({ success: false, message: "Metode pengiriman wajib dipilih" }, { status: 400 });
    }

    const { data: order } = await supabase
      .from("preparation_orders")
      .select("*, preparation_items(*)")
      .eq("id", id)
      .single();

    if (!order) {
      return NextResponse.json({ success: false, message: "Data tidak ditemukan" }, { status: 404 });
    }

    // Hanya bisa dispatch jika status sudah SIAP_KIRIM (penyedia sudah done)
    if (order.status !== "SIAP_KIRIM") {
      return NextResponse.json({
        success: false,
        message: `Belum bisa dikirim. Status sekarang: "${order.status}". Tunggu penyedia barang selesai menyiapkan.`,
      }, { status: 400 });
    }

    // Validasi per metode
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

    const payload: Record<string, any> = {
      status: nextStatus,
      delivery_method,
      dispatched_by: user.id,
      dispatched_by_name: user.name,
      dispatched_at: now,
      updated_at: now,
    };

    if (delivery_method === "PENGANTARAN") {
      payload.delivery_address = delivery_address?.trim() ?? null;
      payload.dest_lat = dest_lat ?? null;
      payload.dest_lng = dest_lng ?? null;
      payload.delivery_user_id = delivery_user_id ?? null;
      payload.delivery_user_name = delivery_user_name ?? null;
      payload.delivery_accepted_at = null;
      payload.delivery_declined_at = null;
      payload.delivery_decline_reason = null;
    }

    if (delivery_method === "KURIR") {
      payload.courier_service = courier_service?.trim() ?? null;
      payload.courier_tracking_number = courier_tracking_number?.trim() ?? null;
      payload.courier_note = courier_note?.trim() ?? null;
    }

    if (delivery_method === "DIAMBIL_CUSTOMER") {
      payload.delivered_at = now;
    }

    // ✅ SECURITY FIX (TOCTOU): status dicek di atas lalu ditulis terpisah —
    // sekarang filter status disertakan di WHERE supaya dua dispatch
    // bersamaan tidak saling menimpa.
    const { data: dataRows, error } = await supabase
      .from("preparation_orders")
      .update(payload)
      .eq("id", id)
      .eq("status", "SIAP_KIRIM")
      .select();

    if (error) throw error;
    if (!dataRows || dataRows.length === 0) {
      return NextResponse.json({ success: false, message: "Status pesanan sudah berubah, silakan refresh" }, { status: 409 });
    }
    const data = dataRows[0];

    await logActivity({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: "EDIT",
      entity: "preparation",
      entityId: id,
      entityLabel: `${order.order_number} — Sales pilih pengiriman: ${delivery_method}`,
      beforeData: order,
      afterData: data,
    });

    return NextResponse.json({ success: true, data, message: `Pengiriman dikonfirmasi: ${delivery_method}` });
  } catch (err: any) {
    console.error("[POST /api/preparation/[id]/dispatch]", err);
    return NextResponse.json({ success: false, message: err?.message ?? "Gagal konfirmasi pengiriman" }, { status: 500 });
  }
}

// Hanya Sales/Kepala Sales/Admin yang boleh dispatch
export const POST = withAuth(postHandler, PREPARATION_CREATE_ROLES);