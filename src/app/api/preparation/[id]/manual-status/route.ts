import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

interface Props { params: Promise<{ id: string }>; }

const VALID_TARGETS = [
  "MENUNGGU_PENGANTAR",
  "DIKIRIM",
  "SELESAI",
  "RETURN_IN_PROGRESS",
  "RETURN_DONE",
] as const;
type Target = typeof VALID_TARGETS[number];

async function postHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;
    const body = await req.json();
    const { target, reason } = body as { target: Target; reason?: string };

    if (!VALID_TARGETS.includes(target)) {
      return NextResponse.json({ success: false, message: "Target status tidak valid" }, { status: 400 });
    }

    const { data: order } = await supabase.from("preparation_orders").select("*").eq("id", id).single();
    if (!order) return NextResponse.json({ success: false, message: "Data tidak ditemukan" }, { status: 404 });

    if (order.delivery_method !== "PENGANTARAN") {
      return NextResponse.json({ success: false, message: "Override manual hanya untuk metode pengantaran" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const patch: Record<string, any> = { updated_at: now };
    let label = "";

    switch (target) {
      case "MENUNGGU_PENGANTAR":
        patch.status = "MENUNGGU_PENGANTAR";
        patch.delivery_accepted_at = null;
        patch.delivery_started_at = null;
        patch.delivered_at = null;
        label = "diset ulang manual ke MENUNGGU PENGANTAR";
        break;

      case "DIKIRIM":
        patch.status = "DIKIRIM";
        if (!order.delivery_accepted_at) patch.delivery_accepted_at = now;
        if (!order.delivery_started_at) patch.delivery_started_at = now;
        patch.delivered_at = null;
        label = "diset manual ke SEDANG DIANTAR";
        break;

      case "SELESAI":
        patch.status = "SELESAI";
        if (!order.delivered_at) patch.delivered_at = now;
        label = "diset manual ke SELESAI (terkirim)";
        break;

      case "RETURN_IN_PROGRESS":
        if (order.status !== "SELESAI") {
          return NextResponse.json(
            { success: false, message: "Order harus berstatus SELESAI dulu sebelum set perjalanan pulang" },
            { status: 400 }
          );
        }
        patch.return_started_at = now;
        patch.returned_at = null;
        label = "diset manual: mulai perjalanan pulang";
        break;

      case "RETURN_DONE":
        if (!order.return_started_at) {
          return NextResponse.json({ success: false, message: "Perjalanan pulang belum dimulai" }, { status: 400 });
        }
        patch.returned_at = now;
        label = "diset manual: pengantar sudah kembali ke toko";
        break;
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
      entityLabel: `${order.order_number} — ${label} oleh ${user.name}${reason ? ` (alasan: ${reason})` : ""}`,
      beforeData: order, afterData: updated,
    });

    return NextResponse.json({ success: true, data: updated, message: "Status berhasil diubah manual" });
  } catch (err: any) {
    console.error("[POST manual-status]", err);
    return NextResponse.json({ success: false, message: err?.message ?? "Gagal mengubah status" }, { status: 500 });
  }
}

export const POST = withAuth(postHandler, PERMISSIONS.FORCE_COMPLETE_PREPARATION);