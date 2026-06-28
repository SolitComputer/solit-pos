import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PREPARATION_DONE_ROLES } from "@/lib/permissions";
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
      .from("preparation_orders").select("*, preparation_items(*)").eq("id", id).single();
    if (!order) return NextResponse.json({ success: false, message: "Data tidak ditemukan" }, { status: 404 });

    if (order.status !== "DIPROSES") {
      return NextResponse.json({ success: false, message: `Tidak bisa diselesaikan, status sekarang "${order.status}"` }, { status: 400 });
    }

    // Semua unit harus sudah dicek
    const items = order.preparation_items ?? [];
    const allChecked = items.length > 0 && items.every((it: any) => it.is_checked);
    if (!allChecked) {
      return NextResponse.json({ success: false, message: "Semua unit harus dicek dulu" }, { status: 400 });
    }

    // Validasi per metode
    if (delivery_method === "PENGANTARAN") {
      if (!delivery_address || !String(delivery_address).trim()) {
        return NextResponse.json({ success: false, message: "Alamat tujuan wajib diisi" }, { status: 400 });
      }
      if (!delivery_user_id) {
        return NextResponse.json({ success: false, message: "Pilih role pengantaran yang bertugas" }, { status: 400 });
      }
    }
    if (delivery_method === "KURIR" && (!courier_service || !String(courier_service).trim())) {
      return NextResponse.json({ success: false, message: "Nama jasa kurir wajib diisi" }, { status: 400 });
    }

    const now = new Date().toISOString();
    // DIAMBIL_CUSTOMER → langsung SELESAI. PENGANTARAN/KURIR → DIKIRIM
    const nextStatus = delivery_method === "DIAMBIL_CUSTOMER" ? "SELESAI" : "DIKIRIM";

    const payload: Record<string, any> = {
      status: nextStatus,
      delivery_method,
      done_by: user.id,
      done_by_name: user.name,
      done_at: now,
      updated_at: now,
    };

    if (delivery_method === "PENGANTARAN") {
      payload.delivery_address = delivery_address?.trim() ?? null;
      payload.dest_lat = dest_lat ?? null;
      payload.dest_lng = dest_lng ?? null;
      payload.delivery_user_id = delivery_user_id ?? null;       // ← assignment
      payload.delivery_user_name = delivery_user_name ?? null;   // ← assignment
    }
    if (delivery_method === "KURIR") {
      payload.courier_service = courier_service?.trim() ?? null;
      payload.courier_tracking_number = courier_tracking_number?.trim() ?? null;
      payload.courier_note = courier_note?.trim() ?? null;
    }
    if (delivery_method === "DIAMBIL_CUSTOMER") {
      payload.delivered_at = now; // diambil customer = langsung sampai
    }

    const { data, error } = await supabase
      .from("preparation_orders").update(payload).eq("id", id).select().single();
    if (error) throw error;

    await logActivity({
      userId: user.id, userName: user.name, userRole: user.role,
      action: "EDIT", entity: "preparation", entityId: id,
      entityLabel: `${order.order_number} — selesai disiapkan (${delivery_method})`,
      beforeData: order, afterData: data,
    });

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[POST /api/preparation/[id]/done]", err);
    return NextResponse.json({ success: false, message: "Gagal menyelesaikan penyiapan" }, { status: 500 });
  }
}

export const POST = withAuth(postHandler, PREPARATION_DONE_ROLES);