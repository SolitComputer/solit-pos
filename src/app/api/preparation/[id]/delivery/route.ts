import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PREPARATION_DELIVERY_ROLES } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

interface Props { params: Promise<{ id: string }>; }

// action: "START" (mulai antar) | "COMPLETE" (terkirim)
async function postHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;
    const { action } = await req.json();

    const { data: order } = await supabase.from("preparation_orders").select("*").eq("id", id).single();
    if (!order) return NextResponse.json({ success: false, message: "Data tidak ditemukan" }, { status: 404 });

    if (order.status !== "DIKIRIM") {
      return NextResponse.json({ success: false, message: `Status bukan dalam pengiriman (status: ${order.status})` }, { status: 400 });
    }

    const now = new Date().toISOString();

    if (action === "START") {
      if (order.delivery_method !== "PENGANTARAN") {
        return NextResponse.json({ success: false, message: "Mulai antar hanya untuk metode pengantaran" }, { status: 400 });
      }
      const { data: updated, error } = await supabase
        .from("preparation_orders")
        .update({ delivery_user_id: user.id, delivery_user_name: user.name, delivery_started_at: now, updated_at: now })
        .eq("id", id).select().single();
      if (error) throw error;

      await logActivity({
        userId: user.id, userName: user.name, userRole: user.role,
        action: "EDIT", entity: "preparation", entityId: id,
        entityLabel: `${order.order_number} — MULAI diantar oleh ${user.name}`,
        beforeData: order, afterData: updated,
      });
      return NextResponse.json({ success: true, data: updated, message: "Pengantaran dimulai" });
    }

    if (action === "COMPLETE") {
      const { data: updated, error } = await supabase
        .from("preparation_orders")
        .update({
          status: "SELESAI", delivered_at: now, updated_at: now,
          ...(order.delivery_method === "PENGANTARAN" && !order.delivery_user_id
            ? { delivery_user_id: user.id, delivery_user_name: user.name } : {}),
        })
        .eq("id", id).select().single();
      if (error) throw error;

      await logActivity({
        userId: user.id, userName: user.name, userRole: user.role,
        action: "EDIT", entity: "preparation", entityId: id,
        entityLabel: `${order.order_number} — TERKIRIM / selesai`,
        beforeData: order, afterData: updated,
      });
      return NextResponse.json({ success: true, data: updated, message: "Barang berhasil terkirim" });
    }

    return NextResponse.json({ success: false, message: "Action tidak valid" }, { status: 400 });
  } catch (err: any) {
    console.error("[POST delivery]", err);
    return NextResponse.json({ success: false, message: err?.message ?? "Gagal update pengiriman" }, { status: 500 });
  }
}

export const POST = withAuth(postHandler, PREPARATION_DELIVERY_ROLES);