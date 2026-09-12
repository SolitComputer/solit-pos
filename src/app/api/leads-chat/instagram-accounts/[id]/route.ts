import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { LEADS_CHAT_MANAGE_ROLES } from "@/lib/permissions";
import { supabaseAdmin } from "@/services/supabaseAdmin";

const GRAPH = "https://graph.facebook.com";
const GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v21.0";

async function deleteHandler(req: NextRequest, ctx: any, user: AuthUser) {
  const { id } = await ctx.params;
  const { data: account, error: selErr } = await supabaseAdmin
    .from("instagram_accounts").select("page_id, page_access_token").eq("id", id).maybeSingle();
  if (selErr) return NextResponse.json({ success: false, message: selErr.message }, { status: 500 });
  if (!account) return NextResponse.json({ success: false, message: "Akun tidak ditemukan" }, { status: 404 });

  // Lepas subscription webhook (best-effort — jangan blok hapus kalau gagal)
  try {
    await fetch(
      `${GRAPH}/${GRAPH_VERSION}/${account.page_id}/subscribed_apps?access_token=${encodeURIComponent(account.page_access_token)}`,
      { method: "DELETE" }
    );
  } catch (err) {
    console.warn("[instagram-accounts DELETE] gagal unsubscribe:", err);
  }

  const { error } = await supabaseAdmin.from("instagram_accounts").delete().eq("id", id);
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export const DELETE = withAuth(deleteHandler, LEADS_CHAT_MANAGE_ROLES);