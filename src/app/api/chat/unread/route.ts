// src/app/api/chat/unread/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { DEFAULT_GROUP_ID } from "@/lib/chatGroupsShared";

export const runtime = "nodejs";

async function getHandler(_req: NextRequest, _ctx: any, user: AuthUser) {
    // ── Unread DM (messages.is_read) ──
    const { data: dmRows, error: dmErr } = await supabaseAdmin
        .from("messages")
        .select("sender_id")
        .eq("receiver_id", user.id)
        .eq("is_read", false)
        .eq("is_deleted", false);
    if (dmErr) return NextResponse.json({ success: false, message: dmErr.message }, { status: 500 });

    const dmBySender: Record<string, number> = {};
    for (const r of dmRows ?? []) dmBySender[r.sender_id] = (dmBySender[r.sender_id] ?? 0) + 1;
    const dmTotal = (dmRows ?? []).length;

    // ── Daftar grup user (+ All Team) ──
    const { data: memberships, error: memErr } = await supabaseAdmin
        .from("chat_group_members")
        .select("group_id")
        .eq("user_id", user.id);
    if (memErr) return NextResponse.json({ success: false, message: memErr.message }, { status: 500 });

    const groupIdSet = new Set<string>((memberships ?? []).map(m => m.group_id as string));
    groupIdSet.add(DEFAULT_GROUP_ID);
    const groupIds = Array.from(groupIdSet);

    // ── Lazy-seed watermark = now() untuk grup yang BELUM punya baris ──
    // Cegah histori lama kehitung unread buat user baru (badge tidak langsung 99+).
    // ignoreDuplicates → baris yang sudah ada TIDAK ditimpa.
    if (groupIds.length > 0) {
        const nowIso = new Date().toISOString();
        const seed = groupIds.map(gid => ({ user_id: user.id, group_id: gid, last_read_at: nowIso }));
        await supabaseAdmin
            .from("chat_group_last_read")
            .upsert(seed, { onConflict: "user_id,group_id", ignoreDuplicates: true });
    }

    // ── Unread grup via watermark ──
    const { data: grpUnread, error: rpcErr } = await supabaseAdmin
        .rpc("count_group_unread", { p_user_id: user.id, p_group_ids: groupIds });
    if (rpcErr) return NextResponse.json({ success: false, message: rpcErr.message }, { status: 500 });

    const groupById: Record<string, number> = {};
    let groupTotal = 0;
    for (const row of (grpUnread ?? []) as { group_id: string; unread: number }[]) {
        const n = Number(row.unread) || 0;
        if (n > 0) { groupById[row.group_id] = n; groupTotal += n; }
    }

    return NextResponse.json({
        success: true,
        total: dmTotal + groupTotal,
        dm_total: dmTotal,
        group_total: groupTotal,
        dm_by_sender: dmBySender,
        group_by_id: groupById,
    });
}

export const GET = withAuth(getHandler);