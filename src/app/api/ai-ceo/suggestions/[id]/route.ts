import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { AI_CEO_ROLES } from "@/lib/permissions";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function patchHandler(req: NextRequest, ctx: { params: Promise<{ id: string }> }, user: AuthUser) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const status = body?.status;

  if (!["reviewed", "dismissed", "pending"].includes(status)) {
    return NextResponse.json({ success: false, message: "Status tidak valid." }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("ai_ceo_suggestions")
    .update({ status, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export const PATCH = withAuth(patchHandler, AI_CEO_ROLES);