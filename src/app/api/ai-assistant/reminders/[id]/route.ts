import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { AI_ASSISTANT_ROLES, AI_CEO_ROLES } from "@/lib/permissions";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function loadAccessibleReminder(id: string, user: AuthUser) {
  const userRoles: string[] =
    Array.isArray((user as any).roles) && (user as any).roles.length > 0
      ? (user as any).roles
      : user.role
      ? [user.role]
      : [];
  const isAdmin = userRoles.some((r) => (AI_CEO_ROLES as readonly string[]).includes(r as any));

  const { data } = await supabaseAdmin
    .from("ai_ceo_reminders")
    .select("id, title, message, severity, status, target_user_id, target_role, created_at, read_at, resolved_at")
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;
  if (isAdmin) return data;
  if (data.target_user_id === user.id) return data;
  if (data.target_role && userRoles.includes(data.target_role)) return data;

  return null;
}

async function getHandler(_req: NextRequest, ctx: { params: Promise<{ id: string }> }, user: AuthUser) {
  const { id } = await ctx.params;
  const reminder = await loadAccessibleReminder(id, user);
  if (!reminder) {
    return NextResponse.json(
      { success: false, message: "Pengingat tidak ditemukan." },
      { status: 404, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  }

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
      .select("id, role, content, provider, created_at")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true });
    messages = data ?? [];
  }

  return NextResponse.json(
    { success: true, reminder, conversationId: conv?.id ?? null, messages },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
  );
}

async function patchHandler(req: NextRequest, ctx: { params: Promise<{ id: string }> }, user: AuthUser) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const action = body?.action;

  const reminder = await loadAccessibleReminder(id, user);
  if (!reminder) {
    return NextResponse.json(
      { success: false, message: "Pengingat tidak ditemukan." },
      { status: 404, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  }

  if (action === "mark_read") {
    if (reminder.status === "terkirim") {
      await supabaseAdmin.from("ai_ceo_reminders").update({ status: "dibaca", read_at: new Date().toISOString() }).eq("id", id);
    }
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
  }

  if (action === "selesai") {
    await supabaseAdmin.from("ai_ceo_reminders").update({ status: "selesai", resolved_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
  }

  return NextResponse.json({ success: false, message: "Action tidak dikenal." }, { status: 400, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
}

export const GET = withAuth(getHandler, AI_ASSISTANT_ROLES);
export const PATCH = withAuth(patchHandler, AI_ASSISTANT_ROLES);