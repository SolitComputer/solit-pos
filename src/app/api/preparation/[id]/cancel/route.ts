import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PREPARATION_CANCEL_ROLES } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";
interface Props { params: Promise<{ id: string }>; }
async function postHandler(req: NextRequest, props: Props, user: AuthUser) {
    try {
        const { id } = await props.params;
        const { reason } = await req.json().catch(() => ({}));
        const { data: order } = await supabase.from("preparation_orders").select("*").eq("id", id).single();
        if (!order) return NextResponse.json({ success: false, message: "Data tidak ditemukan" }, { status: 404 });

        if (order.status === "SELESAI" || order.status === "DIBATALKAN") {
            return NextResponse.json({ success: false, message: `Tidak bisa dibatalkan, status "${order.status}"` }, { status: 400 });
        }

        // ── Kembalikan stok "Siap Jual" ──
        // Ambil semua unit dari order ini, lalu kembalikan ke SIAP_JUAL —
        // TAPI hanya unit yang statusnya masih RESERVED. Kalau sudah SOLD
        // (lunas via confirm-payment), JANGAN disentuh (amankan Data Barang).
        const { data: items, error: itemsFetchError } = await supabase
            .from("preparation_items")
            .select("unit_id, is_cancelled")
            .eq("preparation_id", id);
        if (itemsFetchError) throw itemsFetchError;

        const unitIdsToRestore = (items ?? [])
            .filter((it) => !it.is_cancelled && it.unit_id)
            .map((it) => it.unit_id as string);

        if (unitIdsToRestore.length > 0) {
            const { error: restoreError } = await supabase
                .from("laptop_units")
                .update({ status: "SIAP_JUAL" })
                .in("id", unitIdsToRestore)
                .eq("status", "DALAM_PENYIAPAN"); // guard: unit yang sudah SOLD tidak ikut ter-restore
            if (restoreError) throw restoreError;
        }

        const now = new Date().toISOString();
        const { data, error } = await supabase
            .from("preparation_orders")
            .update({
                status: "DIBATALKAN",
                cancelled_at: now, cancelled_by: user.id, cancelled_by_name: user.name,
                cancel_reason: reason?.trim() || null, updated_at: now,
            })
            .eq("id", id).select().single();
        if (error) throw error;

        await logActivity({
            userId: user.id, userName: user.name, userRole: user.role,
            action: "EDIT", entity: "preparation", entityId: id,
            entityLabel: `${order.order_number} — DIBATALKAN oleh ${user.name}${reason ? ` (${reason})` : ""}`,
            beforeData: order, afterData: data,
        });

        return NextResponse.json({ success: true, data, message: "Pesanan dibatalkan" });
    } catch (err: any) {
        console.error("[POST cancel]", err);
        return NextResponse.json({ success: false, message: err?.message ?? "Gagal membatalkan" }, { status: 500 });
    }
}
export const POST = withAuth(postHandler, PREPARATION_CANCEL_ROLES);