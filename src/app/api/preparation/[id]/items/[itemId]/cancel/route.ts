import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PREPARATION_CANCEL_ROLES } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

interface Props { params: Promise<{ id: string; itemId: string }>; }

// Batalkan 1 SN/unit di dalam sebuah penyiapan (order tetap jalan, cuma unit ini yang batal)
async function postHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id, itemId } = await props.params;
    const { reason } = await req.json().catch(() => ({ reason: null }));

    const { data: order } = await supabase
      .from("preparation_orders")
      .select("*, preparation_items(*)")
      .eq("id", id)
      .single();

    if (!order) {
      return NextResponse.json({ success: false, message: "Data penyiapan tidak ditemukan" }, { status: 404 });
    }
    if (order.status === "DIBATALKAN") {
      return NextResponse.json({ success: false, message: "Penyiapan ini sudah dibatalkan" }, { status: 400 });
    }
    if (order.transaction_invoice) {
      return NextResponse.json({ success: false, message: "Tidak bisa dibatalkan, sudah ada transaksi pembayaran" }, { status: 400 });
    }

    const items: any[] = order.preparation_items ?? [];
    const target = items.find((it) => it.id === itemId);
    if (!target) {
      return NextResponse.json({ success: false, message: "Unit tidak ditemukan" }, { status: 404 });
    }
    if (target.is_cancelled) {
      return NextResponse.json({ success: false, message: "Unit ini sudah dibatalkan sebelumnya" }, { status: 400 });
    }

    const activeCount = items.filter((it) => !it.is_cancelled).length;
    if (activeCount <= 1) {
      return NextResponse.json({
        success: false,
        message: "Ini unit terakhir yang aktif. Kalau memang semua unit batal, pakai tombol 'Batalkan' untuk batalkan seluruh penyiapan.",
      }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { data: updatedItem, error } = await supabase
      .from("preparation_items")
      .update({
        is_cancelled: true,
        cancelled_at: now,
        cancelled_by: user.id,
        cancelled_by_name: user.name,
        cancel_reason: reason?.trim() || null,
      })
      .eq("id", itemId)
      .select()
      .single();

    if (error) throw error;

    // ── Kembalikan stok "Siap Jual" untuk unit ini saja ──
    // Order tetap jalan (unit lain masih RESERVED), cuma unit yang dibatalkan
    // ini yang dikembalikan ke SIAP_JUAL. Guard status RESERVED mencegah unit
    // yang sudah SOLD (race dengan pembayaran) ikut ter-restore.
    if (target.unit_id) {
      const { error: restoreError } = await supabase
        .from("laptop_units")
        .update({ status: "SIAP_JUAL" })
        .eq("id", target.unit_id)
        .eq("status", "DALAM_PENYIAPAN");
      if (restoreError) throw restoreError;
    }

    await logActivity({
      userId: user.id, userName: user.name, userRole: user.role,
      action: "EDIT", entity: "preparation", entityId: id,
      entityLabel: `${order.order_number} — SN ${target.serial_number} dibatalkan oleh ${user.name}${reason ? ` (${reason})` : ""}`,
      beforeData: target, afterData: updatedItem,
    });

    return NextResponse.json({ success: true, data: updatedItem, message: `SN ${target.serial_number} dibatalkan` });
  } catch (err: any) {
    console.error("[POST /api/preparation/[id]/items/[itemId]/cancel]", err);
    return NextResponse.json({ success: false, message: err?.message ?? "Gagal membatalkan unit" }, { status: 500 });
  }
}

export const POST = withAuth(postHandler, PREPARATION_CANCEL_ROLES);