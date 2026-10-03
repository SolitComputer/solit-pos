import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { BARANG_FULL_ACCESS_ROLES } from "@/lib/permissions";

interface Props {
    params: Promise<{ id: string }>;
}

// ── PATCH: Toggle "masuk Pricelist Pedagang" untuk SEMUA unit aktif 1 model ──
//  Beda dgn /api/units/[id]/pedagang (per-SN). Endpoint ini meng-ON/OFF-kan
//  seluruh unit non-SOLD milik satu laptop sekaligus — dipakai tombol
//  "Pedagang" di Data Barang supaya laptop multi-unit pun bisa di-list.
async function handler(req: NextRequest, props: Props, user: AuthUser) {
    try {
        const { id: laptopId } = await props.params;
        const body = await req.json();

        if (typeof body.is_pedagang_listed !== "boolean") {
            return NextResponse.json(
                { success: false, message: "is_pedagang_listed harus boolean" },
                { status: 400 }
            );
        }

        const { data, error } = await supabase
            .from("laptop_units")
            .update({ is_pedagang_listed: body.is_pedagang_listed })
            .eq("laptop_id", laptopId)
            .neq("status", "SOLD")
            .select("id, is_pedagang_listed");

        if (error) {
            return NextResponse.json({ success: false, message: error.message }, { status: 400 });
        }

        return NextResponse.json({ success: true, updated: data?.length ?? 0, data });
    } catch (err) {
        console.error("[PATCH /api/laptops/[id]/pedagang]", err);
        return NextResponse.json(
            { success: false, message: "Gagal memperbarui status Pricelist Pedagang" },
            { status: 500 }
        );
    }
}

export const PATCH = withAuth(handler, BARANG_FULL_ACCESS_ROLES);