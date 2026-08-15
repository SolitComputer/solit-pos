import { supabaseAdmin } from "@/services/supabaseAdmin";

function normalizeWaNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  return digits;
}

/** Cari conversation yang sudah ada, atau bikin baru kalau customer baru pertama kali chat. */
export async function findOrCreateConversation(params: {
  whatsappAccountId: string;
  customerNumberRaw: string;
  customerName?: string | null;
}) {
  const customerIdentifier = normalizeWaNumber(params.customerNumberRaw);

  const { data: existing, error: findErr } = await supabaseAdmin
    .from("chat_conversations")
    .select("*")
    .eq("whatsapp_account_id", params.whatsappAccountId)
    .eq("customer_identifier", customerIdentifier)
    .maybeSingle();
  if (findErr) throw findErr;
  if (existing) return existing;

  const { data: created, error: createErr } = await supabaseAdmin
    .from("chat_conversations")
    .insert({
      channel_type: "WHATSAPP",
      whatsapp_account_id: params.whatsappAccountId,
      customer_identifier: customerIdentifier,
      customer_name: params.customerName ?? null,
      status: "OPEN",
    })
    .select("*")
    .single();
  if (createErr) throw createErr;
  return created;
}

/** Kalau customer ganti nama profil WA-nya, ikutin di percakapan yang udah ada. */
export async function refreshCustomerName(conversationId: string, newName?: string | null) {
  if (!newName) return;
  await supabaseAdmin
    .from("chat_conversations")
    .update({ customer_name: newName })
    .eq("id", conversationId)
    .neq("customer_name", newName);
}

/** Simpan status pengiriman (dari webhook status Fonnte) ke pesan terkait. */
export async function updateMessageDeliveryStatus(params: { fonnteMessageId: string; raw: string }) {
  await supabaseAdmin
    .from("chat_messages")
    .update({ delivery_status: params.raw })
    .eq("fonnte_message_id", params.fonnteMessageId);
}

/** Simpan pesan masuk (dari webhook Fonnte) + update ringkasan percakapan. */
export async function saveIncomingMessage(params: {
  conversationId: string;
  body?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  fonnteMessageId?: string | null;
}) {
  const { error: msgErr } = await supabaseAdmin.from("chat_messages").insert({
    conversation_id: params.conversationId,
    direction: "IN",
    body: params.body ?? null,
    media_url: params.mediaUrl ?? null,
    media_type: params.mediaType ?? null,
    fonnte_message_id: params.fonnteMessageId ?? null,
  });
  if (msgErr) throw msgErr;

  const { data: current } = await supabaseAdmin
    .from("chat_conversations")
    .select("unread_count")
    .eq("id", params.conversationId)
    .single();

  await supabaseAdmin
    .from("chat_conversations")
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: params.body ?? (params.mediaUrl ? "[Media]" : ""),
      unread_count: (current?.unread_count ?? 0) + 1,
    })
    .eq("id", params.conversationId);
}

/** Simpan pesan keluar (balasan CS) — dipanggil setelah sendMessage() ke Fonnte sukses. */
export async function saveOutgoingMessage(params: {
  conversationId: string;
  body?: string | null;
  mediaUrl?: string | null;
  senderUserId: string;
  fonnteMessageId?: string | null;
}) {
  const { error } = await supabaseAdmin.from("chat_messages").insert({
    conversation_id: params.conversationId,
    direction: "OUT",
    body: params.body ?? null,
    media_url: params.mediaUrl ?? null,
    sender_user_id: params.senderUserId,
    fonnte_message_id: params.fonnteMessageId ?? null,
  });
  if (error) throw error;

  await supabaseAdmin
    .from("chat_conversations")
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: params.body ?? "[Media]",
      unread_count: 0, // CS sudah balas → dianggap sudah dibaca
    })
    .eq("id", params.conversationId);
}