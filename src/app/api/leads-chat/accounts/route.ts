import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { LEADS_CHAT_ROLES, LEADS_CHAT_MANAGE_ROLES } from "@/lib/permissions";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { addDevice, updateDeviceWebhook, getDeviceQr } from "@/lib/fonnte";

async function getHandler(req: NextRequest, ctx: any, user: AuthUser) {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_accounts")
    .select("id, label, phone_number, status, connected_at, created_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true, accounts: data });
}

// Tambah nomor WA baru: daftar device di Fonnte, set webhook, balikin QR
// buat discan langsung dari halaman Leads Chat (gak perlu buka dashboard Fonnte).
async function postHandler(req: NextRequest, ctx: any, user: AuthUser) {
  const { label, phoneNumber } = await req.json();
  if (!label || !phoneNumber) {
    return NextResponse.json({ success: false, message: "Nama label dan nomor WA wajib diisi" }, { status: 400 });
  }
  const normalizedPhone = String(phoneNumber).replace(/\D/g, "");

  try {
    const device = await addDevice({ name: label, phoneNumber: normalizedPhone });
    if (!device.token) throw new Error("Fonnte tidak mengembalikan device token");

    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/whatsapp?key=${process.env.FONNTE_WEBHOOK_SECRET}`;
    await updateDeviceWebhook({ deviceToken: device.token, deviceName: label, phoneNumber: normalizedPhone, webhookUrl });

    const { data: account, error } = await supabaseAdmin
      .from("whatsapp_accounts")
      .insert({ label, phone_number: normalizedPhone, fonnte_device_token: device.token, status: "connecting", connected_by: user.id })
      .select("id, label, phone_number, status")
      .single();
    if (error) throw error;

    const qr = await getDeviceQr({ deviceToken: device.token, phoneNumber: normalizedPhone });
    return NextResponse.json({ success: true, account, qrImageBase64: qr.url ?? null });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err?.message ?? "Gagal menyambungkan nomor WA" }, { status: 500 });
  }
}

export const GET = withAuth(getHandler, LEADS_CHAT_ROLES);
export const POST = withAuth(postHandler, LEADS_CHAT_MANAGE_ROLES);