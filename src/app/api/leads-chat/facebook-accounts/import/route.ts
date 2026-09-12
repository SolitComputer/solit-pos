import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { LEADS_CHAT_MANAGE_ROLES } from "@/lib/permissions";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { subscribePageToWebhook } from "@/lib/facebook";

async function postHandler(req: NextRequest, ctx: any, user: AuthUser) {
  const { label, pageId, pageAccessToken } = await req.json();
  if (!label || !pageId || !pageAccessToken) {
    return NextResponse.json({ success: false, message: "Label, Page ID, dan Page Access Token wajib diisi" }, { status: 400 });
  }

  // Subscribe Page ke webhook biar chat masuk ketarik. Best-effort: kalau gagal,
  // Page tetap disimpan + kasih warning, biar user bisa lihat alasannya.
  let subscribeWarning: string | null = null;
  try {
    await subscribePageToWebhook(pageId, pageAccessToken);
  } catch (err: any) {
    subscribeWarning = err?.message ?? "Gagal subscribe webhook — cek token/izin Page";
  }

  const { data: account, error } = await supabaseAdmin
    .from("facebook_accounts")
    .upsert(
      { label, page_id: pageId, page_access_token: pageAccessToken, status: "connected", connected_at: new Date().toISOString(), connected_by: user.id },
      { onConflict: "page_id" }
    )
    .select("id, label, page_id, status")
    .single();
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  return NextResponse.json({ success: true, account, subscribeWarning });
}

export const POST = withAuth(postHandler, LEADS_CHAT_MANAGE_ROLES);