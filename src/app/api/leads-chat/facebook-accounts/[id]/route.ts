import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { LEADS_CHAT_MANAGE_ROLES } from "@/lib/permissions";
import { supabaseAdmin } from "@/services/supabaseAdmin";

async function deleteHandler(req: NextRequest, ctx: any, user: AuthUser) {
  const { id } = await ctx.params;
  const { data: account } = await supabaseAdmin
    .from("facebook_accounts").select("page_id, page_access_token").eq("id", id).maybeSingle();
  if (!account) return NextResponse.json({ success: false, message: "Page tidak ditemukan" }, { status: 404 });

  // Best-effort: lepas subscribe webhook di Meta biar Page ini berhenti kirim pesan ke kita.
  // Kalau gagal (token expired dll) tetap lanjut hapus dari DB — bukan blocker.
  try {
    await fetch(
      `https://graph.facebook.com/v21.0/${account.page_id}/subscribed_apps?access_token=${account.page_access_token}`,
      { method: "DELETE" }
    );
  } catch (err) {
    console.warn("[fb-accounts DELETE] gagal unsubscribe di Meta:", err);
  }

  const { error } = await supabaseAdmin.from("facebook_accounts").delete().eq("id", id);
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export const DELETE = withAuth(deleteHandler, LEADS_CHAT_MANAGE_ROLES);