import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { AI_CEO_ROLES } from "@/lib/permissions";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getHandler(_req: NextRequest, _ctx: any, user: AuthUser) {
  const { data, error } = await supabaseAdmin
    .from("ai_ceo_conversations")
    .select("id, title, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(30);

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data: data ?? [] });
}

export const GET = withAuth(getHandler, AI_CEO_ROLES);