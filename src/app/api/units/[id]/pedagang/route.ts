import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { BARANG_FULL_ACCESS_ROLES } from "@/lib/permissions";

interface Props {
    params: Promise<{ id: string }>;
}

// ── PATCH: Toggle status "masuk Pricelist Pedagang" untuk 1 unit ──────────────
async function handler(req: NextRequest, props: Props, user: AuthUser) {
    try {
        const { id: unitId } = await props.params;
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
            .eq("id", unitId)
            .select("id, is_pedagang_listed")
            .single();

        if (error) {
            return NextResponse.json({ success: false, message: error.message }, { status: 400 });
        }

        if (!data) {
            return NextResponse.json({ success: false, message: "Unit tidak ditemukan" }, { status: 404 });
        }

        return NextResponse.json({ success: true, data });
    } catch (err) {
        console.error("[PATCH /api/units/[id]/pedagang]", err);
        return NextResponse.json(
            { success: false, message: "Gagal memperbarui status pricelist pedagang" },
            { status: 500 }
        );
    }
}

export const PATCH = withAuth(handler, BARANG_FULL_ACCESS_ROLES);