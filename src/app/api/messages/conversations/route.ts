// src/app/api/messages/conversations/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";

export const runtime = "nodejs";

const ADMIN_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO", "ACCOUNTING"];

const MESSAGE_SELECT =
    "id, sender_id, receiver_id, content, is_read, is_deleted, edited_at, created_at, attachment_url, attachment_type, attachment_name, attachment_size";

// ── GET /api/messages/conversations ──────────────────────────────────────────
// Untuk admin: list semua conversation pairs yang unik
// Untuk non-admin: 403
async function getHandler(req: NextRequest, _ctx: any, user: AuthUser) {
    if (!ADMIN_ROLES.includes(user.role)) {
        return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
    }

    // Ambil semua pesan unik berdasarkan pasangan sender+receiver
    // Gunakan raw query untuk efisiensi
    const { data: messages, error } = await supabaseAdmin
        .from("messages")
        .select(`${MESSAGE_SELECT}, sender:users!messages_sender_id_fkey(id, name, role), receiver:users!messages_receiver_id_fkey(id, name, role)`)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(500);

    if (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    // Group by conversation pair (sorted IDs as key)
    const convMap = new Map<string, {
        key: string;
        userA: { id: string; name: string; role: string };
        userB: { id: string; name: string; role: string };
        lastMessage: typeof messages[0];
        unreadCount: number;
    }>();

    for (const msg of messages ?? []) {
        const ids = [msg.sender_id, msg.receiver_id].sort();
        const key = ids.join(":");
        if (!convMap.has(key)) {
            convMap.set(key, {
                key,
                userA: (msg as any).sender ?? { id: msg.sender_id, name: "Unknown", role: "" },
                userB: (msg as any).receiver ?? { id: msg.receiver_id, name: "Unknown", role: "" },
                lastMessage: msg,
                unreadCount: 0,
            });
        }
        const conv = convMap.get(key)!;
        if (!msg.is_read) conv.unreadCount++;
    }

    return NextResponse.json({
        success: true,
        conversations: Array.from(convMap.values()),
    });
}

// ── GET /api/messages/conversations?between=userId1,userId2 ──────────────────
// Admin bisa lihat semua pesan antara 2 user spesifik
async function getMessagesHandler(req: NextRequest, _ctx: any, user: AuthUser) {
    if (!ADMIN_ROLES.includes(user.role)) {
        return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const between = searchParams.get("between");
    if (!between) return NextResponse.json({ success: false, message: "Parameter 'between' wajib" }, { status: 400 });

    const [userA, userB] = between.split(",");
    if (!userA || !userB) return NextResponse.json({ success: false, message: "Format: between=idA,idB" }, { status: 400 });

    const { data, error } = await supabaseAdmin
        .from("messages")
        .select(MESSAGE_SELECT)
        .or(
            `and(sender_id.eq.${userA},receiver_id.eq.${userB}),` +
            `and(sender_id.eq.${userB},receiver_id.eq.${userA})`
        )
        .order("created_at", { ascending: true })
        .limit(200);

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

    return NextResponse.json({ success: true, messages: data ?? [] });
}

export const GET = withAuth(async (req, ctx, user) => {
    const { searchParams } = new URL(req.url);
    if (searchParams.has("between")) {
        return getMessagesHandler(req, ctx, user);
    }
    return getHandler(req, ctx, user);
});