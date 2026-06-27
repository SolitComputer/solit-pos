import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PREPARATION_DONE_ROLES } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

interface Props { params: Promise<{ id: string }>; }

async function postHandler(_req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;
    const { data: order } = await supabase.from("preparation_orders").select("*").eq("id", id).single();
    if (!order) return NextResponse.json({ success: false, message: "Data tidak ditemukan" }, { status: 404 });

    if (order.status !== "MENUNGGU") {
      return NextResponse.json({ success: false, message: `Sudah diterima/diproses (status: ${order.status})` }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { data: updated, error } = await supabase
      .from("preparation_orders")
      .update({ status: "DIPROSES", received_by: user.id, received_by_name: user.name, received_at: now, updated_at: now })
      .eq("id", id).select().single();
    if (error) throw error;

    await logActivity({
      userId: user.id, userName: user.name, userRole: user.role,
      action: "EDIT", entity: "preparation", entityId: id,
      entityLabel: `${order.order_number} — DITERIMA penyedia barang`,
      beforeData: order, afterData: updated,
    });
    return NextResponse.json({ success: true, data: updated, message: "Penyiapan diterima, mulai pengecekan" });
  } catch (err) {
    console.error("[POST receive]", err);
    return NextResponse.json({ success: false, message: "Gagal menerima penyiapan" }, { status: 500 });
  }
}

export const POST = withAuth(postHandler, PREPARATION_DONE_ROLES);