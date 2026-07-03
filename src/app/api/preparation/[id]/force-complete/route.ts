import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PREPARATION_FORCE_COMPLETE_ROLES } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

interface Props { params: Promise<{ id: string }>; }

const FORCE_COMPLETABLE = ["MENUNGGU_PENGANTAR", "DIKIRIM"];

async function postHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;

    let reason: string | null = null;
    try { const body = await req.json(); reason = body?.reason?.trim?.() || null; } catch { /* body opsional */ }

    const { data: order, error: fErr } = await supabase
      .from("preparation_orders").select("*").eq("id", id).single();
    if (fErr || !order)
      return NextResponse.json({ success: false, message: "Data tidak ditemukan" }, { status: 404 });

    if (!FORCE_COMPLETABLE.includes(order.status)) {
      return NextResponse.json({
        success: false,
        message: `Tidak bisa diselesaikan paksa dari status ${order.status}.`,
      }, { status: 400 });
    }

    const now = new Date().toISOString();
    const patch: Record<string, any> = {
      status: "SELESAI",
      delivered_at: order.delivered_at ?? now,
      updated_at: now,
      ...(order.delivery_method === "PENGANTARAN" && !order.delivery_user_id
        ? { delivery_user_id: user.id, delivery_user_name: user.name }
        : {}),
    };

    const { data: updated, error } = await supabase
      .from("preparation_orders").update(patch).eq("id", id).select().single();
    if (error) throw error;

    await logActivity({
      userId: user.id, userName: user.name, userRole: user.role,
      action: "EDIT", entity: "preparation", entityId: id,
      entityLabel: `${order.order_number} — DISELESAIKAN PAKSA oleh ${user.name}${reason ? ` (alasan: ${reason})` : ""}`,
      beforeData: order, afterData: updated,
    });

    return NextResponse.json({ success: true, data: updated, message: "Pengantaran ditandai selesai (override)" });
  } catch (err: any) {
    console.error("[POST force-complete]", err);
    return NextResponse.json({ success: false, message: err?.message ?? "Gagal menyelesaikan pengantaran" }, { status: 500 });
  }
}

export const POST = withAuth(postHandler, PREPARATION_FORCE_COMPLETE_ROLES);