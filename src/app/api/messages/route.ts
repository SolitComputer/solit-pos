import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { after } from "next/server";

export const runtime = "nodejs";

const MESSAGE_SELECT = "id, sender_id, receiver_id, content, is_read, is_deleted, edited_at, created_at, attachment_url, attachment_type, attachment_name, attachment_size";

// ── GET ───────────────────────────────────────────────────────────────────────
async function getHandler(req: NextRequest, ctx: any, user: AuthUser) {
  const { searchParams } = new URL(req.url);
  const receiverId = searchParams.get("with");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);

  if (!receiverId) {
    return NextResponse.json({ success: false, message: "Parameter 'with' wajib" }, { status: 400 });
  }
  // ✅ SECURITY FIX: dulu receiverId dari query string ditaruh mentah di
  // string filter .or() — karakter koma/kurung bisa menyisipkan kondisi
  // filter tambahan (filter injection). ID user harus UUID, divalidasi dulu.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(receiverId)) {
    return NextResponse.json({ success: false, message: "Parameter 'with' tidak valid" }, { status: 400 });
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
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "Body tidak valid" }, { status: 400 });
  }

  const { receiver_id, content, attachment_url, attachment_type, attachment_name, attachment_size } = body;

  // Wajib ada salah satu: teks atau attachment
  if (!receiver_id) {
    return NextResponse.json({ success: false, message: "receiver_id wajib" }, { status: 400 });
  }
  if (!content?.trim() && !attachment_url) {
    return NextResponse.json({ success: false, message: "Pesan atau attachment wajib ada" }, { status: 400 });
  }
  if (content?.trim() && content.trim().length > 1000) {
    return NextResponse.json({ success: false, message: "Pesan terlalu panjang (max 1000 karakter)" }, { status: 400 });
  }

  const { data: receiver } = await supabaseAdmin
    .from("users").select("id, name").eq("id", receiver_id).maybeSingle();

  if (!receiver) {
    return NextResponse.json({ success: false, message: "User tujuan tidak ditemukan" }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from("messages")
    .insert({
      sender_id: user.id,
      receiver_id,
      content: content?.trim() ?? "",
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

  after(async () => {
    try {
      const { sendPushToUser } = await import("@/lib/push-notify");
      const pushBody = attachment_type === "image"
        ? "📷 Mengirim foto"
        : attachment_type === "file"
          ? `📎 ${attachment_name ?? "File"}`
          : trimmedContent.length > 80 ? trimmedContent.slice(0, 80) + "..." : trimmedContent;

      const isBirthdayWish = trimmedContent.startsWith("🎂");

      await sendPushToUser(receiver_id, {
        title: senderName,
        body: pushBody,
        tag: `dm-${senderId}`,
        url: `/dashboard?dm=${senderId}`,
        requireInteraction: false,
        silent: isBirthdayWish,
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

  const { data: msg } = await supabaseAdmin
    .from("messages").select("id, sender_id, is_deleted").eq("id", id).maybeSingle();

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
    .from("messages").select("id, sender_id, receiver_id").eq("id", id).maybeSingle();

  if (!msg) return NextResponse.json({ success: false, message: "Pesan tidak ditemukan" }, { status: 404 });

  if (msg.sender_id !== user.id && msg.receiver_id !== user.id) {
    return NextResponse.json({ success: false, message: "Tidak bisa hapus pesan ini" }, { status: 403 });
  }

  const { error } = await supabaseAdmin
    .from("messages").update({ is_deleted: true }).eq("id", id);

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);