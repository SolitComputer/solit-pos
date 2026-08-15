import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { AI_CEO_ROLES } from "@/lib/permissions";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getHandler(_req: NextRequest, _ctx: any, _user: AuthUser) {
  const { count, error } = await supabaseAdmin
    .from("ai_ceo_suggestions")
    .select("*", { count: "exact", head: true })
    .eq("category", "balasan_member")
    .eq("status", "pending");

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true, count: count ?? 0 });
}

export const GET = withAuth(getHandler, AI_CEO_ROLES);
