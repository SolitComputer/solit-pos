import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { ITEM_OUTFLOW_ROLES } from "@/lib/permissions";

interface Props { params: Promise<{ id: string }> }

async function handler(req: NextRequest, props: Props, user: AuthUser) {
    try {
        const { id } = await props.params;

        // Ambil status audit saat ini
        const { data: current, error: fetchErr } = await supabase
            .from("item_outflows")
            .select("is_audited")
            .eq("id", id)
            .single();

        if (fetchErr || !current) {
            return NextResponse.json(
                { success: false, message: "Data tidak ditemukan" },
                { status: 404 }
            );
        }

        const newAudited = !current.is_audited;

        const { data, error } = await supabase
            .from("item_outflows")
            .update({
                is_audited: newAudited,
                audited_by: newAudited ? user.name : null,
                audited_at: newAudited ? new Date().toISOString() : null,
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

        return NextResponse.json({ success: true, data });
    } catch (err) {
        console.error("[item-outflows/audit][PATCH]", err);
        return NextResponse.json({ success: false }, { status: 500 });
    }
}

export const PATCH = withAuth(handler, ITEM_OUTFLOW_ROLES);