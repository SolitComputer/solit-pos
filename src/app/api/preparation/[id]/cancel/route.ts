    import { NextRequest, NextResponse } from "next/server";
    import { supabase } from "@/services/supabase";
    import { withAuth, AuthUser } from "@/lib/auth";
    import { PREPARATION_CANCEL_ROLES } from "@/lib/permissions";
    import { logActivity } from "@/lib/activityLogger";
    import { supabaseAdmin } from "@/services/supabaseAdmin";
    import { recalcLaptopParentQty } from "@/lib/laptopStock";
    interface Props { params: Promise<{ id: string }>; }
    async function postHandler(req: NextRequest, props: Props, user: AuthUser) {
        try {
            const { id } = await props.params;
            const { reason } = await req.json().catch(() => ({}));
            const { data: order } = await supabase.from("preparation_orders").select("*").eq("id", id).single();
            if (!order) return NextResponse.json({ success: false, message: "Data tidak ditemukan" }, { status: 404 });

            // Disamakan persis dengan canShowCancel di frontend
            // ([id]/page.tsx): SELESAI boleh dibatalkan (customer bisa batal
            // beli setelah barang sampai), yang diblokir cuma order yang
            // sudah pernah DIBATALKAN atau sudah terhubung ke transaksi.
            if (order.status === "DIBATALKAN" || order.transaction_invoice) {
                const message = order.transaction_invoice
                    ? "Tidak bisa dibatalkan, pesanan sudah terhubung ke transaksi"
                    : `Tidak bisa dibatalkan, status "${order.status}"`;
                return NextResponse.json({ success: false, message }, { status: 400 });
            }

            // ── RESTORE UNIT YANG NYANGKUT DI DALAM_PENYIAPAN ──
            // Order baru memang sudah tidak pernah bikin unit jadi DALAM_PENYIAPAN,
            // tapi order LAMA yang terlanjur dibuat dengan sistem lama unitnya 
            // masih nyangkut di DALAM_PENYIAPAN. Saat dibatalkan, kita harus 
            // kembalikan unit-unit lama ini ke SIAP_JUAL biar nggak hilang selamanya.
            const { data: items } = await supabaseAdmin.from("preparation_items").select("unit_id").eq("preparation_id", id);
            const unitIds = items?.map((it: any) => it.unit_id).filter(Boolean) || [];
            
            if (unitIds.length > 0) {
                const { data: updatedUnits } = await supabaseAdmin
                    .from("laptop_units")
                    .update({ status: "SIAP_JUAL" })
                    .in("id", unitIds)
                    .eq("status", "DALAM_PENYIAPAN")
                    .select("laptop_id");

                if (updatedUnits && updatedUnits.length > 0) {
                    const affectedLaptopIds = [...new Set(updatedUnits.map((u: any) => u.laptop_id).filter(Boolean))] as string[];
                    await Promise.allSettled(affectedLaptopIds.map(lid => recalcLaptopParentQty(supabaseAdmin, lid)));
                }
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