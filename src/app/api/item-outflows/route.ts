import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { logActivity } from "@/lib/activityLogger";
import { ITEM_OUTFLOW_ROLES } from "@/lib/permissions";

const VALID_TYPES = ["SERVICE", "KEBUTUHAN"] as const;
type OutflowType = (typeof VALID_TYPES)[number];

const VALID_KINDS = ["LAPTOP", "ACCESSORY"] as const;
type ItemKind = (typeof VALID_KINDS)[number];

// ── GET ───────────────────────────────────────────────────────────────────
async function getHandler(req: NextRequest, _ctx: unknown, _user: AuthUser) {
    try {
        const { searchParams } = new URL(req.url);
        const type = searchParams.get("type");

        let query = supabase
            .from("item_outflows")
            .select("*")
            .order("created_at", { ascending: false });

        if (type && (VALID_TYPES as readonly string[]).includes(type)) {
            query = query.eq("outflow_type", type);
        }

        const { data, error } = await query;
        if (error) {
            return NextResponse.json(
                { success: false, message: error.message },
                { status: 400 }
            );
        }
        return NextResponse.json({ success: true, data: data ?? [] });
    } catch (err) {
        console.error("[item-outflows][GET]", err);
        return NextResponse.json({ success: false }, { status: 500 });
    }
}

// ── POST ──────────────────────────────────────────────────────────────────
async function postHandler(req: NextRequest, _ctx: unknown, user: AuthUser) {
    try {
        const body = await req.json();

        const outflow_type = String(body.outflow_type ?? "").toUpperCase() as OutflowType;
        const item_kind = String(body.item_kind ?? "").toUpperCase() as ItemKind;
        const item_ref_id = body.item_ref_id || null;
        const item_name = String(body.item_name ?? "").trim();
        const purpose = String(body.purpose ?? "").trim();
        const person_name = user.name; // ← selalu dari akun, bukan body

        // ── Validasi ──────────────────────────────────────────────────────────
        if (!VALID_TYPES.includes(outflow_type)) {
            return NextResponse.json(
                { success: false, message: "Tipe pengambilan tidak valid" },
                { status: 400 }
            );
        }
        if (!VALID_KINDS.includes(item_kind)) {
            return NextResponse.json(
                { success: false, message: "Jenis barang tidak valid" },
                { status: 400 }
            );
        }
        if (!item_name) {
            return NextResponse.json(
                { success: false, message: "Barang wajib dipilih" },
                { status: 400 }
            );
        }
        if (!purpose) {
            return NextResponse.json(
                { success: false, message: "Kebutuhan wajib diisi" },
                { status: 400 }
            );
        }

        let nominal: number | null = null;
        if (outflow_type === "SERVICE") {
            const n = Math.round(Number(body.nominal));
            if (!Number.isFinite(n) || n < 0) {
                return NextResponse.json(
                    { success: false, message: "Nominal biaya tidak valid" },
                    { status: 400 }
                );
            }
            nominal = n;
        }

        // ── Cek stok sebelum insert ───────────────────────────────────────────
        // Pastikan stok tersedia agar tidak jadi negatif.
        if (item_ref_id) {
            if (item_kind === "ACCESSORY") {
                const { data: acc } = await supabaseAdmin
                    .from("accessories")
                    .select("stock")
                    .eq("id", item_ref_id)
                    .single();

                if (!acc || Number(acc.stock) < 1) {
                    return NextResponse.json(
                        { success: false, message: "Stok aksesoris tidak mencukupi" },
                        { status: 400 }
                    );
                }
            } else if (item_kind === "LAPTOP") {
                const { data: lp } = await supabaseAdmin
                    .from("laptops")
                    .select("qty")
                    .eq("id", item_ref_id)
                    .single();

                if (!lp || Number(lp.qty) < 1) {
                    return NextResponse.json(
                        { success: false, message: "Stok laptop tidak mencukupi" },
                        { status: 400 }
                    );
                }
            }
        }

        // ── Insert pengambilan ────────────────────────────────────────────────
        const { data, error } = await supabase
            .from("item_outflows")
            .insert({
                outflow_type,
                person_name,
                item_kind,
                item_ref_id,
                item_name,
                purpose,
                nominal,
                created_by: user.id,
                created_by_name: user.name,
                created_by_role: user.role,
            })
            .select()
            .single();

        if (error) {
            return NextResponse.json(
                { success: false, message: error.message },
                { status: 400 }
            );
        }

        // ── Kurangi stok 1 unit ───────────────────────────────────────────────
        // Dilakukan SETELAH insert berhasil supaya kalau pengurangan gagal
        // kita bisa tahu ada data yang masuk tapi stok belum terkurangi
        // (lebih mudah di-debug vs rollback kompleks).
        if (item_ref_id) {
            if (item_kind === "ACCESSORY") {
                // Pakai RPC yang sudah ada di sistem (decrement_accessory_stock)
                const { error: rpcErr } = await supabaseAdmin.rpc(
                    "decrement_accessory_stock",
                    { p_accessory_id: item_ref_id, p_qty: 1 }
                );
                if (rpcErr) {
                    // Pengambilan sudah tercatat — log warning, jangan fail response
                    console.error("[item-outflows] Gagal kurangi stok aksesoris:", rpcErr.message);
                }
            } else if (item_kind === "LAPTOP") {
                // Kurangi qty laptop langsung (sama seperti sync-units)
                const { error: lpErr } = await supabaseAdmin.rpc(
                    "decrement_laptop_qty",
                    { p_laptop_id: item_ref_id, p_qty: 1 }
                );
                if (lpErr) {
                    // RPC tidak ada → fallback ke UPDATE manual
                    const { data: currentLp } = await supabaseAdmin
                        .from("laptops")
                        .select("qty")
                        .eq("id", item_ref_id)
                        .single();

                    if (currentLp) {
                        await supabaseAdmin
                            .from("laptops")
                            .update({ qty: Math.max(0, Number(currentLp.qty) - 1) })
                            .eq("id", item_ref_id);
                    }
                }
            }
        }

        await logActivity({
            userId: user.id,
            userName: user.name,
            userRole: user.role,
            action: "CREATE",
            entity: "item_outflow",
            entityId: data.id,
            entityLabel: `${data.item_name} — ${data.outflow_type}`,
            afterData: data,
        });

        return NextResponse.json({ success: true, data });
    } catch (err) {
        console.error("[item-outflows][POST]", err);
        return NextResponse.json(
            { success: false, message: "Terjadi kesalahan server" },
            { status: 500 }
        );
    }
}

export const GET = withAuth(getHandler, ITEM_OUTFLOW_ROLES);
export const POST = withAuth(postHandler, ITEM_OUTFLOW_ROLES);