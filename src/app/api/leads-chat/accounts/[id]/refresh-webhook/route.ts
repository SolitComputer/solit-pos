import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { LEADS_CHAT_MANAGE_ROLES } from "@/lib/permissions";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { updateDeviceWebhook } from "@/lib/fonnte";

async function postHandler(req: NextRequest, ctx: any, user: AuthUser) {
  const { id } = await ctx.params;
  const { data: account } = await supabaseAdmin
    .from("whatsapp_accounts").select("label, phone_number, fonnte_device_token").eq("id", id).maybeSingle();
  if (!account) return NextResponse.json({ success: false, message: "Akun tidak ditemukan" }, { status: 404 });

  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/whatsapp?key=${process.env.FONNTE_WEBHOOK_SECRET}`;
  try {
    await updateDeviceWebhook({
      deviceToken: account.fonnte_device_token, deviceName: account.label,
      phoneNumber: account.phone_number, webhookUrl,
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err?.message ?? "Gagal refresh webhook" }, { status: 500 });
  }
}

export const POST = withAuth(postHandler, LEADS_CHAT_MANAGE_ROLES);