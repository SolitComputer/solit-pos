import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { AI_CEO_ROLES } from "@/lib/permissions";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getHandler(_req: NextRequest, _ctx: any, _user: AuthUser) {
  const { data, error } = await supabaseAdmin
    .from("ai_ceo_reminders")
    .select("id, title, message, severity, status, target_user_id, created_at, read_at, resolved_at, whatsapp_sent, whatsapp_error")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  const userIds = Array.from(new Set((data ?? []).map((r) => r.target_user_id).filter(Boolean)));
  const usersMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: users } = await supabaseAdmin.from("users").select("id, name").in("id", userIds);
    for (const u of users ?? []) usersMap.set(u.id, u.name);
  }

  const rows = (data ?? []).map((r) => ({ ...r, target_name: usersMap.get(r.target_user_id) ?? "Unknown" }));
  return NextResponse.json({ success: true, data: rows });
}

export const GET = withAuth(getHandler, AI_CEO_ROLES);