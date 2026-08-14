import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { LEADS_CHAT_MANAGE_ROLES } from "@/lib/permissions";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { updateDeviceWebhook } from "@/lib/fonnte";

// Import device yang SUDAH connect di dashboard Fonnte, pakai device token
// (bukan account token) — gak butuh FONNTE_ACCOUNT_TOKEN sama sekali buat jalur ini.
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
        status: "connected",
        connected_by: user.id,
        connected_at: new Date().toISOString(),
      })
      .select("id, label, phone_number, status")
      .single();
    if (error) throw error;

    return NextResponse.json({ success: true, account });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err?.message ?? "Gagal import device — cek lagi token-nya" }, { status: 500 });
  }
}

export const POST = withAuth(postHandler, LEADS_CHAT_MANAGE_ROLES);