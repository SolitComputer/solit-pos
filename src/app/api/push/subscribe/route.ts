// src/app/api/push/subscribe/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";


export const runtime = "nodejs";

// POST — simpan subscription dari browser
async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
    let body: any;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ success: false, message: "Body tidak valid" }, { status: 400 });
    }

    const { endpoint, keys } = body;
    const { p256dh, auth } = keys ?? {};

    if (!endpoint || !p256dh || !auth) {
        return NextResponse.json(
            { success: false, message: "endpoint, p256dh, dan auth wajib" },
            { status: 400 }
        );
    }

    // Upsert — kalau sudah ada (device sama) update saja
    const { error } = await supabaseAdmin
        .from("push_subscriptions")
        .upsert(
            { user_id: user.id, endpoint, p256dh, auth },
            { onConflict: "user_id,endpoint" }
        );

    if (error) {
        console.error("[push/subscribe POST]", error.message);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}

// DELETE — hapus subscription (user unsubscribe / logout)
async function deleteHandler(req: NextRequest, _ctx: any, user: AuthUser) {
    let body: any;
    try {
        body = await req.json();
    } catch {
        body = {};
    }

    const { endpoint } = body;

    if (endpoint) {
        // Hapus subscription spesifik (1 device)
        await supabaseAdmin
            .from("push_subscriptions")
            .delete()
            .eq("user_id", user.id)
            .eq("endpoint", endpoint);
    } else {
        // Hapus semua subscription user ini (logout)
        await supabaseAdmin
            .from("push_subscriptions")
            .delete()
            .eq("user_id", user.id);
    }

    return NextResponse.json({ success: true });
}

export const POST = withAuth(postHandler);
export const DELETE = withAuth(deleteHandler);