import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { findOrCreateConversation, saveIncomingMessage, refreshCustomerName, updateMessageDeliveryStatus } from "@/lib/leadsChat";

// PUBLIC (lihat edit middleware.ts di bawah) karena yang manggil server Fonnte,
// bukan browser user Solit POS — gak ada cookie token JWT. Keamanan dijaga pakai
// secret key di query string yang kita set sendiri saat register webhook URL.
export async function POST(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key || key !== process.env.FONNTE_WEBHOOK_SECRET) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid body" }, { status: 400 });
  }

  if (!body?.sender && (body?.id || body?.stateid)) {
    console.log("[webhook/whatsapp] status update:", body);
    const raw = body.state || body.status;
    if (body.id && raw) await updateMessageDeliveryStatus({ fonnteMessageId: String(body.id), raw: String(raw) });
    return NextResponse.json({ success: true });
  }

  // 🆕 Log MENTAH setiap pesan masuk (bukan cuma status update) — kalau nanti
  // ada laporan "balasan gak kedetect" lagi, cek log ini dulu: kalau baris ini
  // SAMA SEKALI gak muncul pas customer bales, artinya Fonnte gak manggil webhook
  // kita sama sekali (masalah di sisi Fonnte/koneksi device, bukan kode kita).
  console.log("[webhook/whatsapp] incoming payload:", body);

  const { device, sender, message, name, url, filename, member } = body ?? {};
  if (!device || !sender) {
    return NextResponse.json({ success: false, message: "Payload tidak lengkap" }, { status: 400 });
  }

  const { data: account } = await supabaseAdmin
    .from("whatsapp_accounts")
    .select("id")
    .eq("phone_number", String(device).replace(/\D/g, ""))
    .maybeSingle();

  if (!account) {
    console.warn(`[webhook/whatsapp] device tidak dikenal: ${device}`);
    return NextResponse.json({ success: true }); // tetap 200 biar Fonnte gak retry terus
  }

  // 🆕 Pesan grup: Fonnte kirim field "member" (nomor pengirim asli di dalam grup),
  // sementara "sender" jadi ID grupnya sendiri. Pesan personal biasa gak punya "member".
  const isGroup = Boolean(member);

  const conversation = await findOrCreateConversation({
    whatsappAccountId: account.id,
    customerNumberRaw: sender,
    customerName: isGroup ? null : (name ?? null), // nama grup gak dikasih Fonnte di sini, biarin default
    isGroup,
  });
  if (!isGroup) await refreshCustomerName(conversation.id, name);

  await saveIncomingMessage({
    conversationId: conversation.id,
    body: message ?? null,
    mediaUrl: url ?? null,
    mediaType: filename ? "file" : null,
    fromMember: isGroup ? String(member).replace(/\D/g, "") : null,
    fromMemberName: isGroup ? (name ?? null) : null,
  });

  return NextResponse.json({ success: true });
}