import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { logActivity } from "@/lib/activityLogger";
import { ITEM_OUTFLOW_ROLES } from "@/lib/permissions";

interface Props { params: Promise<{ id: string }> }

async function handler(req: NextRequest, props: Props, user: AuthUser) {
    try {
        const { id } = await props.params;

        const { data: outflow, error: fetchErr } = await supabase
            .from("item_outflows")
            .select("*")
            .eq("id", id)
            .single();

        if (fetchErr || !outflow) {
            return NextResponse.json(
                { success: false, message: "Data tidak ditemukan" },
                { status: 404 }
            );
        }

        if (outflow.is_restored) {
            return NextResponse.json(
                { success: false, message: "Barang ini sudah dikembalikan ke stok" },
                { status: 400 }
            );
        }

        // ── Kembalikan stok sesuai jenis barang ─────────────────────────────
        if (outflow.item_ref_id) {
            if (outflow.item_kind === "ACCESSORY") {
                const { data: acc } = await supabaseAdmin
                    .from("accessories")
                    .select("stock")
                    .eq("id", outflow.item_ref_id)
                    .maybeSingle();

                if (acc) {
                    await supabaseAdmin
                        .from("accessories")
                        .update({ stock: (Number(acc.stock) || 0) + 1 })
                        .eq("id", outflow.item_ref_id);
                }
            } else if (outflow.item_kind === "LAPTOP") {
                const { data: lp } = await supabaseAdmin
                    .from("laptops")
                    .select("qty")
                    .eq("id", outflow.item_ref_id)
                    .maybeSingle();

                if (lp) {
                    await supabaseAdmin
                        .from("laptops")
                        .update({ qty: (Number(lp.qty) || 0) + 1 })
                        .eq("id", outflow.item_ref_id);
                }
            }
        }

        const { data, error } = await supabase
            .from("item_outflows")
            .update({
                is_restored: true,
                restored_by: user.name,
                restored_at: new Date().toISOString(),
            })
            .eq("id", id)
            .select()
            .single();

        if (error) {
            return NextResponse.json(
                { success: false, message: error.message },
                { status: 400 }
            );
        }

        await logActivity({
            userId: user.id,
            userName: user.name,
            userRole: user.role,
            action: "RESTORE",
            entity: "item_outflow",
            entityId: id,
            entityLabel: `${outflow.item_name} — ${outflow.outflow_type}`,
            beforeData: outflow,
            afterData: data,
        });

        return NextResponse.json({ success: true, data });
    } catch (err) {
        console.error("[item-outflows/restore][POST]", err);
        return NextResponse.json(
            { success: false, message: "Terjadi kesalahan server" },
            { status: 500 }
        );
    }
}

export const POST = withAuth(handler, ITEM_OUTFLOW_ROLES);
