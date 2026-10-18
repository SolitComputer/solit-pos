import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import {
  findOrCreateInstagramConversation,
  saveIncomingMessage,
  refreshCustomerName,
} from "@/lib/leadsChat";
import { getInstagramUserProfile } from "@/lib/instagram";

// GET → verifikasi webhook (Meta kirim hub.challenge sekali saat setup)
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (
    p.get("hub.mode") === "subscribe" &&
    p.get("hub.verify_token") === process.env.META_WEBHOOK_VERIFY_TOKEN
  ) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

// POST → terima event pesan
export async function POST(req: NextRequest) {
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ received: true });
  }

  console.log("[IG webhook] payload masuk:", JSON.stringify(payload));
  try {
    if (payload.object !== "instagram") {
      console.log("[IG webhook] object bukan instagram:", payload.object);
      return NextResponse.json({ received: true });
    }

    for (const entry of payload.entry ?? []) {
      const igAccountId = String(entry.id); // IG account ID = akun bisnis kita
      const { data: account } = await supabaseAdmin
        .from("instagram_accounts")
        .select("id, page_access_token")
        .eq("ig_user_id", igAccountId)
        .maybeSingle();
           if (!account) {
        console.log("[IG webhook] akun IG tidak match di DB, ig_user_id:", igAccountId);
        continue;
      }

      for (const event of entry.messaging ?? []) {
        // ⛔ Abaikan echo (pesan yang KITA kirim sendiri) supaya tidak dobel
        if (event.message?.is_echo) continue;

        const igsid = String(event.sender?.id ?? "");
        if (!igsid || igsid === igAccountId) continue;

        const text: string | null = event.message?.text ?? null;
        const media = event.message?.attachments?.[0];
        const mediaUrl: string | null = media?.payload?.url ?? null;
        const mediaType: string | null = media?.type ?? null;
        const mid: string | null = event.message?.mid ?? null;

        // skip event non-pesan (reaction / seen / dll)
        if (!text && !mediaUrl) continue;

        const conv = await findOrCreateInstagramConversation({
          instagramAccountId: account.id,
          customerIgsid: igsid,
        });

        // Lengkapi nama profil kalau belum ada (consent terpenuhi karena user DM duluan)
        if (!conv.customer_name) {
          const profile = await getInstagramUserProfile({
            igsid,
            pageAccessToken: account.page_access_token,
          });
          const name = profile.username ? `@${profile.username}` : profile.name;
          if (name) await refreshCustomerName(conv.id, name);
        }

        await saveIncomingMessage({
          conversationId: conv.id,
          body: text,
          mediaUrl,
          mediaType,
          instagramMessageId: mid,
        });
      }
    }
  } catch (err) {
    console.error("[webhooks/instagram] error:", err);
  }

  // Selalu balas 200 cepat, apa pun hasilnya — Meta retry kalau non-200.
  return NextResponse.json({ received: true });
}