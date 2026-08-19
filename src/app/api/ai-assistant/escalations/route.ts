import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { AI_CEO_ROLES } from "@/lib/permissions";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getHandler(_req: NextRequest, _ctx: any, _user: AuthUser) {
  const { data, error } = await supabaseAdmin
    .from("ai_ceo_suggestions")
    .select(`
      id, 
      category, 
      title, 
      description, 
      severity, 
      status, 
      created_at, 
      conversation_id,
      created_by
    `)
    .eq("category", "balasan_member")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  }
  const rows = data ?? [];

  const userIds = [...new Set(rows.map(r => r.created_by).filter(Boolean))];
  let userMap = new Map();
  if (userIds.length > 0) {
    const { data: users } = await supabaseAdmin
      .from("users")
      .select("id, name, role")
      .in("id", userIds);
    if (users) {
      userMap = new Map(users.map(u => [u.id, u]));
    }
  }

  const enrichedData = rows.map(r => ({
    ...r,
    users: userMap.get(r.created_by) ?? null
  }));

  return NextResponse.json(
    { success: true, data: enrichedData },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
  );
}

export const GET = withAuth(getHandler, AI_CEO_ROLES);
