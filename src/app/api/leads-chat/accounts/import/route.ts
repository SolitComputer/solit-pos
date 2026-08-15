import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { LEADS_CHAT_MANAGE_ROLES } from "@/lib/permissions";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { updateDeviceWebhook, getDeviceQr } from "@/lib/fonnte";

async function postHandler(req: NextRequest, ctx: any, user: AuthUser) {
  const { label, phoneNumber, deviceToken } = await req.json();
  if (!label || !phoneNumber || !deviceToken) {
    return NextResponse.json({ success: false, message: "Label, nomor, dan token wajib diisi" }, { status: 400 });
  }
  const normalizedPhone = String(phoneNumber).replace(/\D/g, "");

 try {
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/whatsapp?key=${process.env.FONNTE_WEBHOOK_SECRET}`;
    await updateDeviceWebhook({ deviceToken, deviceName: label, phoneNumber: normalizedPhone, webhookUrl });

    const { data: account, error } = await supabaseAdmin
      .from("whatsapp_accounts")
      .insert({
        label,
        phone_number: normalizedPhone,
        fonnte_device_token: deviceToken,
        status: "connecting",
        connected_by: user.id,
      })
      .select("id, label, phone_number, status")
      .single();
    if (error) throw error;


    const qr = await getDeviceQr({ deviceToken, phoneNumber: normalizedPhone });

    if (qr.reason === "device already connect") {
      await supabaseAdmin
        .from("whatsapp_accounts")
        .update({ status: "connected", connected_at: new Date().toISOString() })
        .eq("id", account.id);
      return NextResponse.json({ success: true, account, alreadyConnected: true });
    }

    return NextResponse.json({ success: true, account, qrImageBase64: qr.url ?? null });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err?.message ?? "Gagal import device — cek lagi token-nya" }, { status: 500 });
  }
}

export const POST = withAuth(postHandler, LEADS_CHAT_MANAGE_ROLES);