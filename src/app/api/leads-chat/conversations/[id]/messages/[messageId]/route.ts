import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { LEADS_CHAT_ROLES } from "@/lib/permissions";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { deleteMessage } from "@/lib/fonnte";

async function deleteHandler(req: NextRequest, ctx: any, user: AuthUser) {
  const { messageId } = await ctx.params;
  const { scope } = await req.json().catch(() => ({ scope: "me" as const }));

  const { data: msg } = await supabaseAdmin
    .from("chat_messages")
    .select("id, direction, fonnte_message_id, conversation_id")
    .eq("id", messageId).maybeSingle();
  if (!msg) return NextResponse.json({ success: false, message: "Pesan tidak ditemukan" }, { status: 404 });

  if (scope === "everyone") {
    if (msg.direction !== "OUT" || !msg.fonnte_message_id) {
      return NextResponse.json({ success: false, message: "Cuma pesan balasan kita sendiri yang bisa dicoba ditarik" }, { status: 400 });
    }
    const { data: conv } = await supabaseAdmin
      .from("chat_conversations").select("whatsapp_account_id").eq("id", msg.conversation_id).maybeSingle();
    const { data: account } = await supabaseAdmin
      .from("whatsapp_accounts").select("fonnte_device_token").eq("id", conv?.whatsapp_account_id).maybeSingle();
    if (!account) return NextResponse.json({ success: false, message: "Akun WA sumber tidak ditemukan" }, { status: 404 });

    const result = await deleteMessage({ deviceToken: account.fonnte_device_token, messageId: msg.fonnte_message_id });
    if (!result.status) {
      // Hampir selalu gagal kalau pesannya udah delivered — itu batasan WhatsApp/Fonnte, bukan bug.
      return NextResponse.json(
        { success: false, message: result.reason ?? "Fonnte gagal menarik pesan — kemungkinan sudah terkirim ke customer" },
        { status: 502 }
      );
    }
  }

  await supabaseAdmin.from("chat_messages")
    .update({ deleted_at: new Date().toISOString(), deleted_scope: scope }).eq("id", messageId);
  return NextResponse.json({ success: true });
}

export const DELETE = withAuth(deleteHandler, LEADS_CHAT_ROLES);