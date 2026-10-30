// src/app/api/seller-followups/due-alert/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";

async function getHandler(_req: NextRequest, _ctx: any, user: AuthUser) {
    const nowISO = new Date().toISOString();

    // ✅ Ambil kategori mana saja yang user ini masih aktif sebagai PIC.
    // Notif hanya relevan untuk kategori yang dia masih boleh follow-up.
    const { data: myPicRows } = await supabaseAdmin
        .from("seller_followup_pics")
        .select("seller_type, is_active")
        .eq("user_id", user.id);

    const activeTypes = (myPicRows ?? [])
        .filter((p: any) => p.is_active)
        .map((p: any) => p.seller_type as string);

    // Kalau user tidak aktif di kategori mana pun → tidak ada notif sama sekali.
    if (activeTypes.length === 0) {
        return NextResponse.json({ success: true, count: 0, items: [] });
    }

    const { data, error, count } = await supabaseAdmin
        .from("seller_followups")
        .select("id, customer_name, seller_type, next_followup_at", { count: "exact" })
        .eq("pic_user_id", user.id)
        .eq("is_active", true)
        // ✅ hanya customer di kategori yang user-nya masih aktif
        .in("seller_type", activeTypes)
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