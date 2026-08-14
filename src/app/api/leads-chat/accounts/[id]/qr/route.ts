import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { LEADS_CHAT_MANAGE_ROLES } from "@/lib/permissions";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { getDeviceQr } from "@/lib/fonnte";

async function getHandler(req: NextRequest, ctx: any, user: AuthUser) {
  const { id } = ctx.params;
  const { data: account } = await supabaseAdmin
    .from("whatsapp_accounts").select("phone_number, fonnte_device_token").eq("id", id).maybeSingle();
  if (!account) return NextResponse.json({ success: false, message: "Akun tidak ditemukan" }, { status: 404 });

  const qr = await getDeviceQr({ deviceToken: account.fonnte_device_token, phoneNumber: account.phone_number });

  if (qr.reason === "device already connect") {
    await supabaseAdmin.from("whatsapp_accounts")
      .update({ status: "connected", connected_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ success: true, alreadyConnected: true });
  }
  return NextResponse.json({ success: true, qrImageBase64: qr.url ?? null });
}

export const GET = withAuth(getHandler, LEADS_CHAT_MANAGE_ROLES);