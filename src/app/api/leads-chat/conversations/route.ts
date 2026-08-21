import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { LEADS_CHAT_ROLES } from "@/lib/permissions";
import { supabaseAdmin } from "@/services/supabaseAdmin";

async function getHandler(req: NextRequest, ctx: any, user: AuthUser) {
  const { searchParams } = req.nextUrl;
  const channelType = searchParams.get("channel");
  const search = searchParams.get("search");

  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "100", 10) || 100));

  let query = supabaseAdmin
    .from("chat_conversations")
    .select("id, channel_type, customer_identifier, customer_name, last_message_preview, last_message_at, unread_count, assigned_to, status, whatsapp_account_id, is_group, whatsapp_accounts(label, phone_number)")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (channelType) query = query.eq("channel_type", channelType);
  if (search) query = query.ilike("customer_name", `%${search}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true, conversations: data });
}

export const GET = withAuth(getHandler, LEADS_CHAT_ROLES);