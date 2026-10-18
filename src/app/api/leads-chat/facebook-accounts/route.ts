import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { LEADS_CHAT_ROLES } from "@/lib/permissions";
import { supabaseAdmin } from "@/services/supabaseAdmin";

async function getHandler(req: NextRequest, ctx: any, user: AuthUser) {
  const { data, error } = await supabaseAdmin
    .from("facebook_accounts")
    .select("id, label, page_id, status, connected_at, created_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true, accounts: data });
}

export const GET = withAuth(getHandler, LEADS_CHAT_ROLES);