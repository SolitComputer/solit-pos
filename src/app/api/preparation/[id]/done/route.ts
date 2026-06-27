import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PREPARATION_DONE_ROLES } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

interface Props { params: Promise<{ id: string }>; }
const VALID_METHODS = ["DIAMBIL_CUSTOMER", "PENGANTARAN", "KURIR"] as const;

async function postHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;
    const body = await req.json();
    const { delivery_method, delivery_address, dest_lat, dest_lng, courier_service, courier_tracking_number, courier_note } = body;

    if (!VALID_METHODS.includes(delivery_method)) {
      return NextResponse.json({ success: false, message: "Metode pengiriman tidak valid" }, { status: 400 });
    }

    const { data: order } = await supabase.from("preparation_orders").select("*").eq("id", id).single();
    if (!order) return NextResponse.json({ success: false, message: "Data tidak ditemukan" }, { status: 404 });

    if (order.status !== "DIPROSES") {
      return NextResponse.json({ success: false, message: `Harus diterima dulu sebelum diselesaikan (status: ${order.status})` }, { status: 400 });
    }
    if (delivery_method === "KURIR" && !courier_service) {
      return NextResponse.json({ success: false, message: "Nama jasa kurir wajib diisi" }, { status: 400 });
    }
    if (delivery_method === "PENGANTARAN" && !delivery_address) {
      return NextResponse.json({ success: false, message: "Alamat tujuan wajib diisi untuk pengantaran" }, { status: 400 });
    }

    const now = new Date().toISOString();
    // Customer ambil sendiri → langsung SELESAI; selain itu → DIKIRIM
    const newStatus = delivery_method === "DIAMBIL_CUSTOMER" ? "SELESAI" : "DIKIRIM";

    const payload: Record<string, any> = {
      status: newStatus, delivery_method,
      done_by: user.id, done_by_name: user.name, done_at: now, updated_at: now,
    };
    if (delivery_method === "DIAMBIL_CUSTOMER") payload.delivered_at = now;
    if (delivery_method === "PENGANTARAN") {
      payload.delivery_address = delivery_address ?? order.delivery_address;
      if (dest_lat != null) payload.dest_lat = Number(dest_lat);
      if (dest_lng != null) payload.dest_lng = Number(dest_lng);
    }
    if (delivery_method === "KURIR") {
      payload.courier_service = courier_service;
      payload.courier_tracking_number = courier_tracking_number ?? null;
      payload.courier_note = courier_note ?? null;
      payload.delivery_address = delivery_address ?? order.delivery_address;
    }

    const { data: updated, error } = await supabase
      .from("preparation_orders").update(payload).eq("id", id).select().single();
    if (error) throw error;

    const methodLabel = delivery_method === "DIAMBIL_CUSTOMER" ? "Diambil Customer"
      : delivery_method === "PENGANTARAN" ? "Pengantaran" : "Kurir";

    await logActivity({
      userId: user.id, userName: user.name, userRole: user.role,
      action: "EDIT", entity: "preparation", entityId: id,
      entityLabel: `${order.order_number} — SELESAI disiapkan → ${methodLabel}`,
      beforeData: order, afterData: updated,
    });

    return NextResponse.json({
      success: true, data: updated,
      message: newStatus === "SELESAI" ? "Selesai, barang diambil customer" : `Selesai, menunggu ${methodLabel.toLowerCase()}`,
    });
  } catch (err: any) {
    console.error("[POST done]", err);
    return NextResponse.json({ success: false, message: err?.message ?? "Gagal menyelesaikan" }, { status: 500 });
  }
}

export const POST = withAuth(postHandler, PREPARATION_DONE_ROLES);