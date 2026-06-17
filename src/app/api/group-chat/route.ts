// src/app/api/group-chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";

export const runtime = "nodejs";

const MAX_CONTENT_LENGTH = 2000;
const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 100;

async function getHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT)), MAX_LIMIT);
  const before = searchParams.get("before");

  let query = supabaseAdmin
    .from("group_messages")
    .select(`
      id,
      sender_id,
      sender_name,
      sender_role,
      content,
      reply_to_id,
      is_deleted,
      created_at,
      reply_to:reply_to_id (
        id,
        sender_name,
        content,
        is_deleted
      )
    `)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (before) {
    query = query.lt("created_at", before);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[group-chat GET]", error.message);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  const messages = (data ?? []).reverse();

  return NextResponse.json({
    success: true,
    messages,
    has_more: (data ?? []).length === limit,
  });
}

async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "Body tidak valid" }, { status: 400 });
  }

  const { content, reply_to_id } = body;

  if (!content?.trim()) {
    return NextResponse.json({ success: false, message: "Pesan tidak boleh kosong" }, { status: 400 });
  }
  if (content.trim().length > MAX_CONTENT_LENGTH) {
    return NextResponse.json(
      { success: false, message: `Pesan terlalu panjang (max ${MAX_CONTENT_LENGTH} karakter)` },
      { status: 400 }
    );
  }

  if (reply_to_id) {
    const { data: replyMsg } = await supabaseAdmin
      .from("group_messages")
      .select("id")
      .eq("id", reply_to_id)
      .maybeSingle();
    if (!replyMsg) {
      return NextResponse.json({ success: false, message: "Pesan yang direply tidak ditemukan" }, { status: 404 });
    }
  }

  const { data, error } = await supabaseAdmin
    .from("group_messages")
    .insert({
      sender_id: user.id,
      sender_name: user.name,
      sender_role: user.role,
      content: content.trim(),
      reply_to_id: reply_to_id ?? null,
    })
    .select(`
      id,
      sender_id,
      sender_name,
      sender_role,
      content,
      reply_to_id,
      is_deleted,
      created_at,
      reply_to:reply_to_id (
        id,
        sender_name,
        content,
        is_deleted
      )
    `)
    .single();

  if (error) {
    console.error("[group-chat POST]", error.message);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  // ✅ Dynamic import — push berjalan SETELAH response, tidak memblokir/crash handler
  const trimmedContent = content.trim();
  const senderName = user.name;
  const senderId = user.id;

  Promise.resolve().then(async () => {
    try {
      const { sendPushBroadcast } = await import("@/lib/push-notify");
      await sendPushBroadcast(senderId, {
        title: `👥 All Team Solit — ${senderName}`,
        body: trimmedContent.length > 80 ? trimmedContent.slice(0, 80) + "..." : trimmedContent,
        tag: "group-chat",
        url: "/dashboard/users",
        requireInteraction: false,
      });
    } catch (err: unknown) {
      console.error("[push group]", err);
    }
  });

  return NextResponse.json({ success: true, message: data });
}

async function deleteHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  const { searchParams } = new URL(req.url);
  const messageId = searchParams.get("id");

  if (!messageId) {
    return NextResponse.json({ success: false, message: "ID pesan wajib" }, { status: 400 });
  }

  const FULL_ACCESS = new Set(["ADMIN", "PROGRAMMER", "ASISTEN_CEO"]);
  const isAdmin = FULL_ACCESS.has(user.role);

  const { data: msg } = await supabaseAdmin
    .from("group_messages")
    .select("id, sender_id")
    .eq("id", messageId)
    .maybeSingle();

  if (!msg) {
    return NextResponse.json({ success: false, message: "Pesan tidak ditemukan" }, { status: 404 });
  }

  if (!isAdmin && msg.sender_id !== user.id) {
    return NextResponse.json({ success: false, message: "Tidak bisa hapus pesan orang lain" }, { status: 403 });
  }

  const { error } = await supabaseAdmin
    .from("group_messages")
    .update({ is_deleted: true })
    .eq("id", messageId);

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export const GET    = withAuth(getHandler);
export const POST   = withAuth(postHandler);
export const DELETE = withAuth(deleteHandler);