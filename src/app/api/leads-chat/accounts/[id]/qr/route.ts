import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { LEADS_CHAT_MANAGE_ROLES } from "@/lib/permissions";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { getDeviceQr } from "@/lib/fonnte";

async function getHandler(req: NextRequest, ctx: any, user: AuthUser) {
  const { id } = await ctx.params;
  const { data: account, error: selectError } = await supabaseAdmin
    .from("whatsapp_accounts").select("phone_number, fonnte_device_token").eq("id", id).maybeSingle();

  if (selectError) {
    console.error(`[leads-chat/qr] gagal query akun id=${id}:`, selectError);
    return NextResponse.json({ success: false, message: selectError.message }, { status: 500 });
  }
  if (!account) {
    console.warn(`[leads-chat/qr] akun id=${id} tidak ditemukan di database — cek Table Editor Supabase`);
    return NextResponse.json({ success: false, message: "Akun tidak ditemukan" }, { status: 404 });
  }

  let qr;
  try {
    qr = await getDeviceQr({ deviceToken: account.fonnte_device_token, phoneNumber: account.phone_number });
  } catch (err: any) {
    console.error(`[leads-chat/qr] gagal panggil Fonnte untuk id=${id}:`, err);
    return NextResponse.json({ success: false, message: err?.message ?? "Gagal menghubungi Fonnte" }, { status: 502 });
  }

  console.log("[leads-chat/qr] response Fonnte:", qr);

  if (qr.reason === "device already connect") {
    await supabaseAdmin.from("whatsapp_accounts")
      .update({ status: "connected", connected_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ success: true, alreadyConnected: true });
  }

  if (!qr.url) {
    return NextResponse.json(
      { success: false, message: qr.reason ?? "Fonnte belum bisa kasih QR untuk device ini" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true, qrImageBase64: qr.url });
}

export const GET = withAuth(getHandler, LEADS_CHAT_MANAGE_ROLES);