import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { LEADS_CHAT_MANAGE_ROLES } from "@/lib/permissions";
import { supabaseAdmin } from "@/services/supabaseAdmin";

const GRAPH = "https://graph.facebook.com";
const GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v21.0";

async function postHandler(req: NextRequest, ctx: any, user: AuthUser) {
  const { label, pageId, pageAccessToken } = await req.json();
  if (!label?.trim() || !pageId?.trim() || !pageAccessToken?.trim()) {
    return NextResponse.json({ success: false, message: "Semua field wajib diisi" }, { status: 400 });
  }

  // 1) Cari IG account ID yang tertaut ke Page ini (= entry.id di webhook nanti)
  let igUserId: string;
  try {
    const res = await fetch(
      `${GRAPH}/${GRAPH_VERSION}/${pageId}?fields=instagram_business_account{id,username}&access_token=${encodeURIComponent(pageAccessToken)}`
    );
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ success: false, message: data?.error?.message ?? "Page ID / token tidak valid" }, { status: 400 });
    }
    const igId = data?.instagram_business_account?.id;
    if (!igId) {
      return NextResponse.json({ success: false, message: "Page ini belum tertaut ke akun Instagram Professional" }, { status: 400 });
    }
    igUserId = String(igId);
  } catch {
    return NextResponse.json({ success: false, message: "Gagal menghubungi Graph API Meta" }, { status: 502 });
  }

  // 2) Subscribe Page ke app kita untuk field "messages" (biar webhook IG masuk)
  let subscribeWarning: string | null = null;
  try {
    const subRes = await fetch(`${GRAPH}/${GRAPH_VERSION}/${pageId}/subscribed_apps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscribed_fields: ["messages"], access_token: pageAccessToken }),
    });
    const subData = await subRes.json();
    if (!subRes.ok || subData?.success === false) {
      subscribeWarning = subData?.error?.message ?? "Gagal subscribe webhook otomatis — set manual di Meta.";
    }
  } catch {
    subscribeWarning = "Gagal subscribe webhook otomatis — bisa di-set manual di Meta.";
  }

  // 3) Simpan (upsert by ig_user_id → idempotent kalau di-import ulang)
  const { data: account, error } = await supabaseAdmin
    .from("instagram_accounts")
    .upsert(
      {
        label, ig_user_id: igUserId, page_id: pageId, page_access_token: pageAccessToken,
        status: "connected", connected_by: user.id, connected_at: new Date().toISOString(),
      },
      { onConflict: "ig_user_id" }
    )
    .select("id, label, ig_user_id, page_id, status")
    .single();
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  return NextResponse.json({ success: true, account, subscribeWarning });
}

export const POST = withAuth(postHandler, LEADS_CHAT_MANAGE_ROLES);