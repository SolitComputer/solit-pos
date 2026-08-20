// src/app/api/group-chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { isGroupMember } from "@/lib/chatGroups";
import { DEFAULT_GROUP_ID } from "@/lib/chatGroupsShared";

export const runtime = "nodejs";

const MAX_CONTENT_LENGTH = 2000;
const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 100;

const MESSAGE_SELECT = `
  id,
  group_id,
  sender_id,
  sender_name,
  sender_role,
  content,
  reply_to_id,
  is_deleted,
  edited_at,
  created_at,
  attachment_url,
  attachment_type,
  attachment_name,
  attachment_size,
  reply_to:reply_to_id (
    id,
    sender_name,
    content,
    is_deleted,
    attachment_type
  )
` as const;

// ── GET ──────────────────────────────────────────────────────────────────────
async function getHandler(req: NextRequest, _ctx: any, user: AuthUser) {
    const { searchParams } = new URL(req.url);
    const groupId = searchParams.get("group_id") || DEFAULT_GROUP_ID;

    const isMember = await isGroupMember(groupId, user.id);
    if (!isMember) {
        return NextResponse.json({ success: false, message: "Kamu bukan anggota grup ini" }, { status: 403 });
    }

    const singleId = searchParams.get("id");
    if (singleId) {
        const { data, error } = await supabaseAdmin
            .from("group_messages")
            .select(MESSAGE_SELECT)
            .eq("id", singleId)
            .eq("group_id", groupId)
            .maybeSingle();

        if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        if (!data) return NextResponse.json({ success: false, message: "Pesan tidak ditemukan" }, { status: 404 });
        return NextResponse.json({ success: true, message: data });
    }

    const limit = Math.min(parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT)), MAX_LIMIT);
    const before = searchParams.get("before");

    let query = supabaseAdmin
        .from("group_messages")
        .select(MESSAGE_SELECT)
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (before) query = query.lt("created_at", before);

    const { data, error } = await query;
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

    return NextResponse.json({
        success: true,
        messages: (data ?? []).reverse(),
        has_more: (data ?? []).length === limit,
    });
}

// ── POST ─────────────────────────────────────────────────────────────────────
async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
    let body: any;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ success: false, message: "Body tidak valid" }, { status: 400 });
    }

    const {
        group_id,
        content,
        reply_to_id,
        attachment_url,
        attachment_type,
        attachment_name,
        attachment_size,
    } = body;

    const groupId = group_id || DEFAULT_GROUP_ID;
    const isMember = await isGroupMember(groupId, user.id);
    if (!isMember) {
        return NextResponse.json({ success: false, message: "Kamu bukan anggota grup ini" }, { status: 403 });
    }

    // Wajib ada salah satu: teks atau attachment
    if (!content?.trim() && !attachment_url) {
        return NextResponse.json({ success: false, message: "Pesan atau attachment wajib ada" }, { status: 400 });
    }
    if (content?.trim() && content.trim().length > MAX_CONTENT_LENGTH) {
        return NextResponse.json(
            { success: false, message: `Pesan terlalu panjang (max ${MAX_CONTENT_LENGTH} karakter)` },
            { status: 400 }
        );
    }

    if (reply_to_id) {
        const { data: replyMsg } = await supabaseAdmin
            .from("group_messages").select("id").eq("id", reply_to_id).eq("group_id", groupId).maybeSingle();
        if (!replyMsg) {
            return NextResponse.json({ success: false, message: "Pesan yang direply tidak ditemukan" }, { status: 404 });
        }
    }

    const { data, error } = await supabaseAdmin
        .from("group_messages")
        .insert({
            group_id: groupId,
            sender_id: user.id,
            sender_name: user.name,
            sender_role: user.role,
            content: content?.trim() ?? "",
            reply_to_id: reply_to_id ?? null,
            attachment_url: attachment_url ?? null,
            attachment_type: attachment_type ?? null,
            attachment_name: attachment_name ?? null,
            attachment_size: attachment_size ?? null,
        })
        .select(MESSAGE_SELECT)
        .single();

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

    const trimmedContent = content?.trim() ?? "";
    const senderName = user.name;
    const senderId = user.id;

    Promise.resolve().then(async () => {
        try {
            const { sendPushBroadcast, sendPushToUserIds } = await import("@/lib/push-notify");
            const pushBody = attachment_type === "image"
                ? "📷 Mengirim foto"
                : attachment_type === "file"
                    ? `📎 ${attachment_name ?? "File"}`
                    : trimmedContent.length > 80 ? trimmedContent.slice(0, 80) + "..." : trimmedContent;

            if (groupId === DEFAULT_GROUP_ID) {
                // Grup default "All Team" memang untuk semua orang → broadcast benar.
                await sendPushBroadcast(senderId, {
                    title: "All Team Solit",
                    body: `${senderName}: ${pushBody}`,
                    tag: "group-chat",
                    url: "/dashboard/users",
                    requireInteraction: false,
                });
            } else {
                // ✅ SECURITY FIX (kebocoran chat privat): dulu SEMUA grup pakai
                // sendPushBroadcast, jadi isi pesan grup privat ikut ter-push ke
                // notifikasi SEMUA karyawan meski bukan anggota. Sekarang notif
                // hanya dikirim ke anggota grup, dengan judul & deep-link grupnya.
                const [{ data: members }, { data: grp }] = await Promise.all([
                    supabaseAdmin
                        .from("chat_group_members")
                        .select("user_id")
                        .eq("group_id", groupId),
                    supabaseAdmin
                        .from("chat_groups")
                        .select("name")
                        .eq("id", groupId)
                        .maybeSingle(),
                ]);
                const memberIds = (members ?? []).map((m) => m.user_id as string);
                const groupName = grp?.name ?? "Grup";
                await sendPushToUserIds(memberIds, senderId, {
                    title: groupName,
                    body: `${senderName}: ${pushBody}`,
                    tag: `group-chat-${groupId}`,
                    url: `/dashboard/users?group=${groupId}`,
                    requireInteraction: false,
                });
            }
        } catch (err: unknown) {
            console.error("[push group]", err);
        }
    });

    return NextResponse.json({ success: true, message: data });
}

// ── PATCH — edit pesan ────────────────────────────────────────────────────────
async function patchHandler(req: NextRequest, _ctx: any, user: AuthUser) {
    let body: any;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ success: false, message: "Body tidak valid" }, { status: 400 });
    }

    const { id, content } = body;

    if (!id) return NextResponse.json({ success: false, message: "ID pesan wajib" }, { status: 400 });
    if (!content?.trim()) return NextResponse.json({ success: false, message: "Konten tidak boleh kosong" }, { status: 400 });
    if (content.trim().length > MAX_CONTENT_LENGTH) {
        return NextResponse.json({ success: false, message: `Pesan terlalu panjang (max ${MAX_CONTENT_LENGTH} karakter)` }, { status: 400 });
    }

    const { data: msg } = await supabaseAdmin
        .from("group_messages").select("id, sender_id, is_deleted").eq("id", id).maybeSingle();

    if (!msg) return NextResponse.json({ success: false, message: "Pesan tidak ditemukan" }, { status: 404 });
    if (msg.is_deleted) return NextResponse.json({ success: false, message: "Pesan yang dihapus tidak bisa diedit" }, { status: 400 });
    if (msg.sender_id !== user.id) return NextResponse.json({ success: false, message: "Hanya pengirim yang bisa mengedit pesan" }, { status: 403 });

    const { data, error } = await supabaseAdmin
        .from("group_messages")
        .update({ content: content.trim(), edited_at: new Date().toISOString() })
        .eq("id", id)
        .select(MESSAGE_SELECT)
        .single();

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

    return NextResponse.json({ success: true, message: data });
}

// ── DELETE — soft delete ──────────────────────────────────────────────────────
async function deleteHandler(req: NextRequest, _ctx: any, user: AuthUser) {
    const { searchParams } = new URL(req.url);
    const messageId = searchParams.get("id");

    if (!messageId) return NextResponse.json({ success: false, message: "ID pesan wajib" }, { status: 400 });

    const FULL_ACCESS = new Set(["ADMIN", "PROGRAMMER", "ASISTEN_CEO"]);
    const isAdmin = FULL_ACCESS.has(user.role);

    const { data: msg } = await supabaseAdmin
        .from("group_messages").select("id, sender_id").eq("id", messageId).maybeSingle();

    if (!msg) return NextResponse.json({ success: false, message: "Pesan tidak ditemukan" }, { status: 404 });
    if (!isAdmin && msg.sender_id !== user.id) {
        return NextResponse.json({ success: false, message: "Tidak bisa hapus pesan orang lain" }, { status: 403 });
    }

    const { error } = await supabaseAdmin
        .from("group_messages").update({ is_deleted: true }).eq("id", messageId);

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);