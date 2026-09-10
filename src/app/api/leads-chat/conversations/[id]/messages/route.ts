import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { LEADS_CHAT_ROLES } from "@/lib/permissions";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { sendMessage } from "@/lib/fonnte";
import { sendInstagramMessage } from "@/lib/instagram";
import { saveOutgoingMessage } from "@/lib/leadsChat";

async function getHandler(req: NextRequest, ctx: any, user: AuthUser) {
  const { id } = await ctx.params; // Next.js 15+: params sekarang Promise, wajib di-await
  const { data, error } = await supabaseAdmin
    .from("chat_messages")
   .select("id, direction, body, media_url, media_type, sender_user_id, delivery_status, deleted_at, deleted_scope, from_member_name, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  await supabaseAdmin.from("chat_conversations").update({ unread_count: 0 }).eq("id", id);
  return NextResponse.json({ success: true, messages: data });
}

async function postHandler(req: NextRequest, ctx: any, user: AuthUser) {
  const { id } = await ctx.params;
  const { message, mediaUrl } = await req.json();
  if (!message && !mediaUrl) return NextResponse.json({ success: false, message: "Pesan kosong" }, { status: 400 });

  const { data: conversation } = await supabaseAdmin
    .from("chat_conversations")
    .select("channel_type, customer_identifier, whatsapp_account_id, instagram_account_id")
    .eq("id", id)
    .maybeSingle();
  if (!conversation) return NextResponse.json({ success: false, message: "Percakapan tidak ditemukan" }, { status: 404 });

  // ── Cabang Instagram DM ──────────────────────────────────────────────────
  if (conversation.channel_type === "INSTAGRAM") {
    const { data: igAcc } = await supabaseAdmin
      .from("instagram_accounts")
      .select("page_access_token")
      .eq("id", conversation.instagram_account_id)
      .maybeSingle();
    if (!igAcc) return NextResponse.json({ success: false, message: "Akun Instagram sumber tidak ditemukan" }, { status: 404 });

    try {
      const { messageId } = await sendInstagramMessage({
        pageAccessToken: igAcc.page_access_token,
        recipientIgsid: conversation.customer_identifier, // IGSID customer
        text: message ?? null,
        imageUrl: mediaUrl ?? null,
      });
      await saveOutgoingMessage({
        conversationId: id, body: message ?? null, mediaUrl: mediaUrl ?? null,
        senderUserId: user.id, instagramMessageId: messageId,
      });
      return NextResponse.json({ success: true });
    } catch (err: any) {
      return NextResponse.json({ success: false, message: err?.message ?? "Gagal kirim ke Instagram" }, { status: 502 });
    }
  }

  // ── Cabang WhatsApp (default — perilaku lama TIDAK berubah) ───────────────
  const { data: account } = await supabaseAdmin
    .from("whatsapp_accounts").select("fonnte_device_token").eq("id", conversation.whatsapp_account_id).maybeSingle();
  if (!account) return NextResponse.json({ success: false, message: "Akun WA sumber tidak ditemukan" }, { status: 404 });

  const sendResult = await sendMessage({
    deviceToken: account.fonnte_device_token,
    target: conversation.customer_identifier,
    message, mediaUrl,
  });
  if (!sendResult.status) {
    return NextResponse.json({ success: false, message: sendResult.reason ?? "Gagal kirim ke Fonnte" }, { status: 502 });
  }

  await saveOutgoingMessage({
    conversationId: id, body: message ?? null, mediaUrl: mediaUrl ?? null,
    senderUserId: user.id, fonnteMessageId: sendResult.id?.[0] ?? null,
  });
  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler, LEADS_CHAT_ROLES);
export const POST = withAuth(postHandler, LEADS_CHAT_ROLES);