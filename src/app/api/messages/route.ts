// src/app/api/messages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";

export const runtime = "nodejs";

const MESSAGE_SELECT = "id, sender_id, receiver_id, content, is_read, is_deleted, edited_at, created_at";

// ── GET ───────────────────────────────────────────────────────────────────────
async function getHandler(req: NextRequest, ctx: any, user: AuthUser) {
  const { searchParams } = new URL(req.url);
  const receiverId = searchParams.get("with");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);

  if (!receiverId) {
    return NextResponse.json({ success: false, message: "Parameter 'with' wajib" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("messages")
    .select(MESSAGE_SELECT)
    .or(
      `and(sender_id.eq.${user.id},receiver_id.eq.${receiverId}),` +
      `and(sender_id.eq.${receiverId},receiver_id.eq.${user.id})`
    )
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  await supabaseAdmin
    .from("messages")
    .update({ is_read: true })
    .eq("sender_id", receiverId)
    .eq("receiver_id", user.id)
    .eq("is_read", false);

  return NextResponse.json({ success: true, messages: data ?? [] });
}

// ── POST ──────────────────────────────────────────────────────────────────────
async function postHandler(req: NextRequest, ctx: any, user: AuthUser) {
  const body = await req.json();
  const { receiver_id, content } = body;

  if (!receiver_id || !content?.trim()) {
    return NextResponse.json({ success: false, message: "receiver_id dan content wajib" }, { status: 400 });
  }
  if (content.trim().length > 1000) {
    return NextResponse.json({ success: false, message: "Pesan terlalu panjang (max 1000 karakter)" }, { status: 400 });
  }

  const { data: receiver } = await supabaseAdmin
    .from("users")
    .select("id, name")
    .eq("id", receiver_id)
    .maybeSingle();

  if (!receiver) {
    return NextResponse.json({ success: false, message: "User tujuan tidak ditemukan" }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from("messages")
    .insert({ sender_id: user.id, receiver_id, content: content.trim() })
    .select(MESSAGE_SELECT)
    .single();

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  const trimmedContent = content.trim();
  const senderName = user.name;
  const senderId = user.id;

  Promise.resolve().then(async () => {
    try {
      const { sendPushToUser } = await import("@/lib/push-notify");
      await sendPushToUser(receiver_id, {
        title: `💬 ${senderName}`,
        body: trimmedContent.length > 80 ? trimmedContent.slice(0, 80) + "..." : trimmedContent,
        tag: `dm-${senderId}`,
        url: "/dashboard/users",
        requireInteraction: false,
      });
    } catch (err) {
      console.error("[push DM]", err);
    }
  });

  return NextResponse.json({ success: true, message: data });
}

// ── PATCH — edit pesan ────────────────────────────────────────────────────────
async function patchHandler(req: NextRequest, ctx: any, user: AuthUser) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ success: false, message: "Body tidak valid" }, { status: 400 });
  }

  const { id, content } = body;

  if (!id) return NextResponse.json({ success: false, message: "ID pesan wajib" }, { status: 400 });
  if (!content?.trim()) return NextResponse.json({ success: false, message: "Konten tidak boleh kosong" }, { status: 400 });
  if (content.trim().length > 1000) {
    return NextResponse.json({ success: false, message: "Pesan terlalu panjang (max 1000 karakter)" }, { status: 400 });
  }

  // Cek ownership — hanya sender yang boleh edit
  const { data: msg } = await supabaseAdmin
    .from("messages")
    .select("id, sender_id, is_deleted")
    .eq("id", id)
    .maybeSingle();

  if (!msg) return NextResponse.json({ success: false, message: "Pesan tidak ditemukan" }, { status: 404 });
  if (msg.is_deleted) return NextResponse.json({ success: false, message: "Pesan yang dihapus tidak bisa diedit" }, { status: 400 });
  if (msg.sender_id !== user.id) return NextResponse.json({ success: false, message: "Hanya pengirim yang bisa mengedit pesan" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("messages")
    .update({ content: content.trim(), edited_at: new Date().toISOString() })
    .eq("id", id)
    .select(MESSAGE_SELECT)
    .single();

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  return NextResponse.json({ success: true, message: data });
}

// ── DELETE — soft delete ──────────────────────────────────────────────────────
async function deleteHandler(req: NextRequest, ctx: any, user: AuthUser) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ success: false, message: "ID pesan wajib" }, { status: 400 });

  const { data: msg } = await supabaseAdmin
    .from("messages")
    .select("id, sender_id, receiver_id")
    .eq("id", id)
    .maybeSingle();

  if (!msg) return NextResponse.json({ success: false, message: "Pesan tidak ditemukan" }, { status: 404 });

  // Hanya sender atau receiver yang boleh hapus (di chat DM, keduanya bisa hapus di sisi mereka)
  if (msg.sender_id !== user.id && msg.receiver_id !== user.id) {
    return NextResponse.json({ success: false, message: "Tidak bisa hapus pesan ini" }, { status: 403 });
  }

  const { error } = await supabaseAdmin
    .from("messages")
    .update({ is_deleted: true })
    .eq("id", id);

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);