// src/app/api/messages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";

// ✅ Wajib Node.js runtime agar web-push bisa jalan
export const runtime = "nodejs";

async function getHandler(req: NextRequest, ctx: any, user: AuthUser) {
  const { searchParams } = new URL(req.url);
  const receiverId = searchParams.get("with");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);

  if (!receiverId) {
    return NextResponse.json({ success: false, message: "Parameter 'with' wajib" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("messages")
    .select("id, sender_id, receiver_id, content, is_read, created_at")
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
    .insert({
      sender_id: user.id,
      receiver_id,
      content: content.trim(),
    })
    .select("id, sender_id, receiver_id, content, is_read, created_at")
    .single();

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  // ✅ Push SETELAH response berhasil — import dinamis agar tidak crash saat web-push gagal load
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

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);