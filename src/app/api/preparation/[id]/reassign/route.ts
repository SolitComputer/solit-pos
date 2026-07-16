import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

interface Props { params: Promise<{ id: string }>; }

async function postHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;
    const body = await req.json();
    const { delivery_user_id, delivery_user_name } = body as {
      delivery_user_id?: string; delivery_user_name?: string;
    };

    if (!delivery_user_id || !delivery_user_name) {
      return NextResponse.json({ success: false, message: "Pilih pengantar baru dulu" }, { status: 400 });
    }

    const { data: order } = await supabase.from("preparation_orders").select("*").eq("id", id).single();
    if (!order) return NextResponse.json({ success: false, message: "Data tidak ditemukan" }, { status: 404 });

    if (order.delivery_method !== "PENGANTARAN") {
      return NextResponse.json({ success: false, message: "Metode pengiriman bukan pengantaran" }, { status: 400 });
    }
    if (!["MENUNGGU_PENGANTAR", "DIKIRIM"].includes(order.status)) {
      return NextResponse.json(
        { success: false, message: `Tidak bisa pindah pengantar untuk status ${order.status}` },
        { status: 400 }
      );
    }
    if (order.delivery_user_id === delivery_user_id) {
      return NextResponse.json({ success: false, message: "Pengantar tersebut sudah ditugaskan" }, { status: 400 });
    }

    const now = new Date().toISOString();
    // Kalau order belum mulai jalan (belum delivery_started_at), reset ke MENUNGGU_PENGANTAR
    // supaya pengantar baru wajib klik "Setuju" dulu (item 2-step verifikasi tetap berlaku).
    // Kalau sudah DIKIRIM & delivery_started_at terisi (sedang di jalan), pindah driver langsung
    // tanpa reset tracking — dipakai untuk kasus darurat (pengantar lama sakit/HP mati/dll).
    const wasInTransit = order.status === "DIKIRIM" && !!order.delivery_started_at;

    const patch: Record<string, any> = {
      delivery_user_id,
      delivery_user_name,
      updated_at: now,
    };

    if (!wasInTransit) {
      patch.status = "MENUNGGU_PENGANTAR";
      patch.delivery_accepted_at = null;
      patch.delivery_declined_at = null;
      patch.delivery_decline_reason = null;
      patch.delivery_started_at = null;
    }

    const { data: updated, error } = await supabase
      .from("preparation_orders")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    await logActivity({
      userId: user.id, userName: user.name, userRole: user.role,
      action: "EDIT", entity: "preparation", entityId: id,
      entityLabel: `${order.order_number} — pindah pengantar: ${order.delivery_user_name ?? "-"} → ${delivery_user_name}`,
      beforeData: order, afterData: updated,
    });

    return NextResponse.json({ success: true, data: updated, message: "Pengantar berhasil dipindahkan" });
  } catch (err: any) {
    console.error("[POST reassign]", err);
    return NextResponse.json({ success: false, message: err?.message ?? "Gagal memindahkan pengantar" }, { status: 500 });
  }
}

export const POST = withAuth(postHandler, PERMISSIONS.FORCE_COMPLETE_PREPARATION);