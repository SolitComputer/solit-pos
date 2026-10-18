import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { verifyWebhookSignature, getUserProfile } from "@/lib/facebook";
import { findOrCreateFacebookConversation, saveIncomingMessage } from "@/lib/leadsChat";

const VERIFY_TOKEN = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN!;
const APP_SECRET = process.env.FACEBOOK_APP_SECRET!;

// Meta manggil ini SEKALI pas kita daftarin webhook URL di dashboard, buat mastiin kita yang punya endpoint ini.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ success: false, message: "Verifikasi gagal" }, { status: 403 });
}

// Meta ngirim ini tiap ada pesan baru masuk ke Page manapun yang subscribe ke App kita.
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  if (!verifyWebhookSignature(rawBody, signature, APP_SECRET)) {
    return NextResponse.json({ success: false, message: "Signature tidak valid" }, { status: 401 });
  }

  const body = JSON.parse(rawBody);
  if (body.object !== "page") return NextResponse.json({ success: true });

  for (const entry of body.entry ?? []) {
    const pageId = entry.id;
    for (const event of entry.messaging ?? []) {
      if (event.message?.is_echo) continue; // pesan yang kita kirim sendiri, kepantul balik
      if (!event.message) continue; // abaikan read-receipt/delivery buat sekarang

      const senderPsid = event.sender?.id;
      if (!senderPsid) continue;

      try {
        const { data: account } = await supabaseAdmin
          .from("facebook_accounts")
          .select("id, page_access_token")
          .eq("page_id", pageId)
          .maybeSingle();
        if (!account) {
          console.warn(`[webhook/facebook] pesan dari Page ${pageId} yang belum terdaftar`);
          continue;
        }

        const profile = await getUserProfile({ pageAccessToken: account.page_access_token, psid: senderPsid });
        const conversation = await findOrCreateFacebookConversation({
          facebookAccountId: account.id,
          customerPsid: senderPsid,
          customerName: profile.name,
        });

        await saveIncomingMessage({
          conversationId: conversation.id,
          body: event.message.text ?? null,
          mediaUrl: event.message.attachments?.[0]?.payload?.url ?? null,
          mediaType: event.message.attachments?.[0]?.type ?? null,
          facebookMessageId: event.message.mid ?? null,
        });
      } catch (err) {
        console.error(`[webhook/facebook] gagal proses pesan dari PSID ${senderPsid}:`, err);
      }
    }
  }

  return NextResponse.json({ success: true });
}