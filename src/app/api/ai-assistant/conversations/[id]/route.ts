import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { AI_ASSISTANT_ROLES } from "@/lib/permissions";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getHandler(_req: NextRequest, ctx: { params: Promise<{ id: string }> }, user: AuthUser) {
  const { id } = await ctx.params;
  
  const { data: conv } = await supabaseAdmin
    .from("ai_ceo_conversations")
    .select("id, title")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!conv) return NextResponse.json({ success: false, message: "Percakapan tidak ditemukan." }, { status: 404 });

  const { data: messages } = await supabaseAdmin
    .from("ai_ceo_messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: true });

  return NextResponse.json({ success: true, conversation: conv, messages: messages ?? [] });
}

export const GET = withAuth(getHandler, AI_ASSISTANT_ROLES);
