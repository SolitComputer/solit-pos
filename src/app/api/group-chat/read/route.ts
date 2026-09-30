// src/app/api/group-chat/read/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { isGroupMember } from "@/lib/chatGroups";
import { DEFAULT_GROUP_ID } from "@/lib/chatGroupsShared";

export const runtime = "nodejs";

// ── POST: majukan watermark (badge) + catat receipt "dibaca" (#2) ──
async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
    let body: any;
    try { body = await req.json(); }
    catch { return NextResponse.json({ success: false, message: "Body tidak valid" }, { status: 400 }); }

    const groupId = body.group_id || DEFAULT_GROUP_ID;
    const messageIds: string[] = Array.isArray(body.message_ids)
        ? ([...new Set(body.message_ids)].filter(Boolean) as string[])
        : [];

    const isMember = await isGroupMember(groupId, user.id);
    if (!isMember) {
        return NextResponse.json({ success: false, message: "Kamu bukan anggota grup ini" }, { status: 403 });
    }

    // ✅ Selalu majukan watermark saat grup dibuka → badge unread grup ini jadi 0,
    // walau tidak ada receipt baru yang perlu dicatat.
    await supabaseAdmin
        .from("chat_group_last_read")
        .upsert(
            { user_id: user.id, group_id: groupId, last_read_at: new Date().toISOString() },
            { onConflict: "user_id,group_id" }
        );

    if (messageIds.length === 0) return NextResponse.json({ success: true, marked: 0 });

    // Catat receipt hanya untuk pesan grup ini & BUKAN kiriman sendiri
    const { data: msgs, error: msgErr } = await supabaseAdmin
        .from("group_messages")
        .select("id, sender_id")
        .eq("group_id", groupId)
        .in("id", messageIds);
    if (msgErr) return NextResponse.json({ success: false, message: msgErr.message }, { status: 500 });

    const rows = (msgs ?? [])
        .filter(m => m.sender_id !== user.id)
        .map(m => ({ message_id: m.id, user_id: user.id, group_id: groupId }));

    if (rows.length === 0) return NextResponse.json({ success: true, marked: 0 });

    const { error } = await supabaseAdmin
        .from("group_message_reads")
        .upsert(rows, { onConflict: "message_id,user_id", ignoreDuplicates: true });
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

    return NextResponse.json({ success: true, marked: rows.length });
}

// ── GET: daftar siapa saja yang sudah membaca 1 pesan grup (#2) ──
async function getHandler(req: NextRequest, _ctx: any, user: AuthUser) {
    const { searchParams } = new URL(req.url);
    const messageId = searchParams.get("message_id");
    if (!messageId) return NextResponse.json({ success: false, message: "message_id wajib" }, { status: 400 });

    const { data: msg, error: msgErr } = await supabaseAdmin
        .from("group_messages")
        .select("id, group_id")
        .eq("id", messageId)
        .maybeSingle();
    if (msgErr) return NextResponse.json({ success: false, message: msgErr.message }, { status: 500 });
    if (!msg) return NextResponse.json({ success: false, message: "Pesan tidak ditemukan" }, { status: 404 });

    const isMember = await isGroupMember(msg.group_id, user.id);
    if (!isMember) return NextResponse.json({ success: false, message: "Kamu bukan anggota grup ini" }, { status: 403 });

    const { data: reads, error } = await supabaseAdmin
        .from("group_message_reads")
        .select("user_id, read_at, users!group_message_reads_user_id_fkey(id, name, role)")
        .eq("message_id", messageId)
        .order("read_at", { ascending: true });
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

    const readers = (reads ?? []).map((r: any) => ({
        id: r.users.id, name: r.users.name, role: r.users.role, read_at: r.read_at,
    }));

    return NextResponse.json({ success: true, readers });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);