import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { AI_ASSISTANT_ROLES } from "@/lib/permissions";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function loadOwnedReminder(id: string, userId: string) {
  const { data } = await supabaseAdmin
    .from("ai_ceo_reminders")
    .select("id, title, message, severity, status, target_user_id, created_at, read_at, resolved_at")
    .eq("id", id)
    .maybeSingle();
  if (!data || data.target_user_id !== userId) return null;
  return data;
}

async function getHandler(_req: NextRequest, ctx: { params: Promise<{ id: string }> }, user: AuthUser) {
  const { id } = await ctx.params;
  const reminder = await loadOwnedReminder(id, user.id);
  if (!reminder) return NextResponse.json({ success: false, message: "Pengingat tidak ditemukan." }, { status: 404 });

  const { data: conv } = await supabaseAdmin
    .from("ai_ceo_conversations")
    .select("id")
    .eq("reminder_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  let messages: any[] = [];
  if (conv) {
    const { data } = await supabaseAdmin
      .from("ai_ceo_messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true });
    messages = data ?? [];
  }

  return NextResponse.json({ success: true, reminder, conversationId: conv?.id ?? null, messages });
}

async function patchHandler(req: NextRequest, ctx: { params: Promise<{ id: string }> }, user: AuthUser) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const action = body?.action;

  const reminder = await loadOwnedReminder(id, user.id);
  if (!reminder) return NextResponse.json({ success: false, message: "Pengingat tidak ditemukan." }, { status: 404 });

  if (action === "mark_read") {
    if (reminder.status === "terkirim") {
      await supabaseAdmin.from("ai_ceo_reminders").update({ status: "dibaca", read_at: new Date().toISOString() }).eq("id", id);
    }
    return NextResponse.json({ success: true });
  }

  if (action === "selesai") {
    await supabaseAdmin.from("ai_ceo_reminders").update({ status: "selesai", resolved_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: false, message: "Action tidak dikenal." }, { status: 400 });
}

export const GET = withAuth(getHandler, AI_ASSISTANT_ROLES);
export const PATCH = withAuth(patchHandler, AI_ASSISTANT_ROLES);