// src/app/api/seller-followups/due-alert/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";

async function getHandler(_req: NextRequest, _ctx: any, user: AuthUser) {
    const nowISO = new Date().toISOString();

    const { data, error, count } = await supabaseAdmin
        .from("seller_followups")
        .select("id, customer_name, seller_type, next_followup_at", { count: "exact" })
        .eq("pic_user_id", user.id)
        .eq("is_active", true)
        .lte("next_followup_at", nowISO)
        .order("next_followup_at", { ascending: true })
        .limit(20);

    if (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({
        success: true,
        count: count ?? 0,
        items: data ?? [],
    });
}

export const GET = withAuth(getHandler, PERMISSIONS.VIEW_SELLER_FOLLOWUP);