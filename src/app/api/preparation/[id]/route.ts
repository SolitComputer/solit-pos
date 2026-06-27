import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PREPARATION_VIEW_ROLES, PREPARATION_CREATE_ROLES } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

interface Props { params: Promise<{ id: string }>; }

async function getHandler(_req: NextRequest, props: Props, _user: AuthUser) {
  try {
    const { id } = await props.params;
    const { data, error } = await supabase
      .from("preparation_orders")
      .select(`*, preparation_items ( * )`)
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json({ success: false, message: "Data penyiapan tidak ditemukan" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[GET /api/preparation/[id]]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

async function patchHandler(req: NextRequest, props: Props, _user: AuthUser) {
  try {
    const { id } = await props.params;
    const { transaction_invoice } = await req.json();

    if (!transaction_invoice) {
      return NextResponse.json({ success: false, message: "transaction_invoice wajib diisi" }, { status: 400 });
    }

    const { data: order } = await supabase
      .from("preparation_orders").select("id").eq("id", id).single();
    if (!order) return NextResponse.json({ success: false, message: "Data tidak ditemukan" }, { status: 404 });

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("preparation_orders")
      .update({ transaction_invoice, transaction_linked_at: now, updated_at: now })
      .eq("id", id).select().single();
    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[PATCH /api/preparation/[id]]", err);
    return NextResponse.json({ success: false, message: "Gagal link transaksi" }, { status: 500 });
  }
}

async function deleteHandler(_req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;
    const { data: order } = await supabase.from("preparation_orders").select("*").eq("id", id).single();
    if (!order) return NextResponse.json({ success: false, message: "Data tidak ditemukan" }, { status: 404 });

    if (order.status !== "MENUNGGU") {
      return NextResponse.json({ success: false, message: `Tidak bisa dihapus, status sudah "${order.status}"` }, { status: 400 });
    }

    const { error } = await supabase.from("preparation_orders").delete().eq("id", id);
    if (error) throw error;

    await logActivity({
      userId: user.id, userName: user.name, userRole: user.role,
      action: "DELETE", entity: "preparation", entityId: id,
      entityLabel: `${order.order_number} — ${order.customer_name}`,
      beforeData: order,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/preparation/[id]]", err);
    return NextResponse.json({ success: false, message: "Gagal menghapus" }, { status: 500 });
  }
}

export const GET = withAuth(getHandler, PREPARATION_VIEW_ROLES);
export const PATCH = withAuth(patchHandler, PREPARATION_VIEW_ROLES);
export const DELETE = withAuth(deleteHandler, PREPARATION_CREATE_ROLES);