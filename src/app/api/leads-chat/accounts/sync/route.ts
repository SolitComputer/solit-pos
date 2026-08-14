import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { LEADS_CHAT_MANAGE_ROLES } from "@/lib/permissions";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { getAllDevices, updateDeviceWebhook } from "@/lib/fonnte";

// Tarik SEMUA device yang sudah ada/connect di akun Fonnte (dibuat manual dari
// dashboard mereka SEBELUM fitur Leads Chat ada) — supaya gak perlu discan ulang
// satu-satu. Device yang sudah ada di whatsapp_accounts (dicocokkan by nomor)
// dilewati, gak di-duplikat.
async function postHandler(req: NextRequest, ctx: any, user: AuthUser) {
  const result = await getAllDevices();
  if (!result.status) {
    return NextResponse.json({ success: false, message: result.reason ?? "Gagal ambil daftar device dari Fonnte" }, { status: 500 });
  }

  const { data: existingAccounts } = await supabaseAdmin.from("whatsapp_accounts").select("phone_number");
  const existingNumbers = new Set((existingAccounts ?? []).map((a) => a.phone_number));

  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/whatsapp?key=${process.env.FONNTE_WEBHOOK_SECRET}`;
  const imported: string[] = [];
  const skipped: string[] = [];

  for (const device of result.data ?? []) {
    const phoneNumber = device.device.replace(/\D/g, "");
    if (existingNumbers.has(phoneNumber)) { skipped.push(phoneNumber); continue; }

    try {
      await updateDeviceWebhook({ deviceToken: device.token, deviceName: device.name, phoneNumber, webhookUrl });
      await supabaseAdmin.from("whatsapp_accounts").insert({
        label: device.name,
        phone_number: phoneNumber,
        fonnte_device_token: device.token,
        status: device.status === "connect" ? "connected" : "disconnected",
        connected_by: user.id,
        connected_at: device.status === "connect" ? new Date().toISOString() : null,
      });
      imported.push(phoneNumber);
    } catch (err) {
      console.warn(`[accounts/sync] gagal import device ${phoneNumber}:`, err);
    }
  }

  return NextResponse.json({ success: true, imported, skipped });
}

export const POST = withAuth(postHandler, LEADS_CHAT_MANAGE_ROLES);