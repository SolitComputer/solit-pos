import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { logActivity } from "@/lib/activityLogger";
import { ITEM_OUTFLOW_ROLES } from "@/lib/permissions";
import { recalcLaptopParentQty } from "@/lib/laptopStock";
import { recalcAccessoryParentStock } from "@/lib/accessoryStock";

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

        // ── Tandai restored DULU (guard is_restored=false) — kalau ini gagal,
        // proses berhenti SEBELUM stok disentuh, jadi gak ada resiko dobel-nambah ──
        const { data, error } = await supabase
            .from("item_outflows")
            .update({
                is_restored: true,
                restored_by: user.name,
                restored_at: new Date().toISOString(),
            })
            .eq("id", id)
            .eq("is_restored", false)
            .select()
            .single();

        if (error || !data) {
            return NextResponse.json(
                { success: false, message: error?.message || "Barang ini sudah dikembalikan ke stok" },
                { status: 400 }
            );
        }

        // ── Kembalikan UNIT ke stok & hitung ulang induk ──────────────────────
        // Kebalikan dari POST: unit "KELUAR" dibalikin ke status tersedia, lalu
        // qty/stock induk disamakan ulang lewat recalc*. Guard .eq("KELUAR")
        // mencegah menimpa unit yang sudah berubah status (mis. benar-benar
        // terjual setelah dikembalikan).
        if (outflow.unit_id) {
            if (outflow.item_kind === "ACCESSORY") {
                await supabaseAdmin
                    .from("accessory_units")
                    .update({ status: "TERSEDIA" })
                    .eq("id", outflow.unit_id)
                    .eq("status", "KELUAR");
                await recalcAccessoryParentStock(supabaseAdmin, outflow.item_ref_id);
            } else if (outflow.item_kind === "LAPTOP") {
                await supabaseAdmin
                    .from("laptop_units")
                    .update({ status: "SIAP_JUAL" })
                    .eq("id", outflow.unit_id)
                    .eq("status", "KELUAR");
                await recalcLaptopParentQty(supabaseAdmin, outflow.item_ref_id);
            }
        } else if (outflow.item_ref_id) {
            // ── Fallback data lama (outflow tanpa unit_id) ────────────────────
            // Tetap pakai compare-and-swap pada qty/stock induk apa adanya.
            if (outflow.item_kind === "ACCESSORY") {
                for (let attempt = 0; attempt < 5; attempt++) {
                    const { data: acc } = await supabaseAdmin
                        .from("accessories").select("stock").eq("id", outflow.item_ref_id).maybeSingle();
                    if (!acc) break;
                    const { data: casRows } = await supabaseAdmin
                        .from("accessories").update({ stock: (Number(acc.stock) || 0) + 1 })
                        .eq("id", outflow.item_ref_id).eq("stock", acc.stock).select("id");
                    if (casRows && casRows.length > 0) break;
                }
            } else if (outflow.item_kind === "LAPTOP") {
                for (let attempt = 0; attempt < 5; attempt++) {
                    const { data: lp } = await supabaseAdmin
                        .from("laptops").select("qty").eq("id", outflow.item_ref_id).maybeSingle();
                    if (!lp) break;
                    const { data: casRows } = await supabaseAdmin
                        .from("laptops").update({ qty: (Number(lp.qty) || 0) + 1 })
                        .eq("id", outflow.item_ref_id).eq("qty", lp.qty).select("id");
                    if (casRows && casRows.length > 0) break;
                }
            }
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
