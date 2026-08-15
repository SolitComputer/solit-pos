import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { AI_ASSISTANT_ROLES, AI_CEO_ROLES } from "@/lib/permissions";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getHandler(_req: NextRequest, ctx: { params: Promise<{ id: string }> }, user: AuthUser) {
  const { id } = await ctx.params;

  const userRoles: string[] =
    Array.isArray((user as any).roles) && (user as any).roles.length > 0
      ? (user as any).roles
      : user.role
      ? [user.role]
      : [];
  const isAdmin = userRoles.some((r) => (AI_CEO_ROLES as readonly string[]).includes(r as any));

  let query = supabaseAdmin
    .from("ai_ceo_conversations")
    .select("id, title, user_id")
    .eq("id", id);

  if (!isAdmin) {
    query = query.eq("user_id", user.id);
  }

  const { data: conv } = await query.maybeSingle();

  if (!conv) {
    return NextResponse.json(
      { success: false, message: "Percakapan tidak ditemukan." },
      { status: 404, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  }

  const { data: messages } = await supabaseAdmin
    .from("ai_ceo_messages")
    .select("id, role, content, provider, created_at")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: true });

  return NextResponse.json(
    { success: true, conversation: conv, messages: messages ?? [] },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
  );
}

export const GET = withAuth(getHandler, AI_ASSISTANT_ROLES);
