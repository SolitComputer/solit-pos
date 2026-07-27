import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser, isFullAccess } from "@/lib/auth";
import { AI_CEO_ROLES } from "@/lib/permissions";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getHandler(_req: NextRequest, ctx: { params: Promise<{ id: string }> }, user: AuthUser) {
  const { id } = await ctx.params;

  const { data: conv } = await supabaseAdmin
    .from("ai_ceo_conversations")
    .select("id, user_id, title")
    .eq("id", id)
    .maybeSingle();

  if (!conv) return NextResponse.json({ success: false, message: "Percakapan tidak ditemukan." }, { status: 404 });
  if (conv.user_id !== user.id && !isFullAccess(user.role)) {
    return NextResponse.json({ success: false, message: "Tidak punya akses." }, { status: 403 });
  }

  const { data: messages, error } = await supabaseAdmin
    .from("ai_ceo_messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true, conversation: conv, messages: messages ?? [] });
}

async function deleteHandler(_req: NextRequest, ctx: { params: Promise<{ id: string }> }, user: AuthUser) {
  const { id } = await ctx.params;

  const { data: conv } = await supabaseAdmin
    .from("ai_ceo_conversations")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();

  if (!conv) return NextResponse.json({ success: false, message: "Percakapan tidak ditemukan." }, { status: 404 });
  if (conv.user_id !== user.id && !isFullAccess(user.role)) {
    return NextResponse.json({ success: false, message: "Tidak punya akses." }, { status: 403 });
  }

  const { error } = await supabaseAdmin.from("ai_ceo_conversations").delete().eq("id", id);
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

async function patchHandler(req: NextRequest, ctx: { params: Promise<{ id: string }> }, user: AuthUser) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const title = String(body?.title ?? "").trim();

  if (!title) {
    return NextResponse.json({ success: false, message: "Judul tidak boleh kosong." }, { status: 400 });
  }

  const { data: conv } = await supabaseAdmin
    .from("ai_ceo_conversations")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();

  if (!conv) return NextResponse.json({ success: false, message: "Percakapan tidak ditemukan." }, { status: 404 });
  if (conv.user_id !== user.id && !isFullAccess(user.role)) {
    return NextResponse.json({ success: false, message: "Tidak punya akses." }, { status: 403 });
  }

  const { error } = await supabaseAdmin
    .from("ai_ceo_conversations")
    .update({ title: title.slice(0, 80) })
    .eq("id", id);

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler, AI_CEO_ROLES);
export const PATCH = withAuth(patchHandler, AI_CEO_ROLES);
export const DELETE = withAuth(deleteHandler, AI_CEO_ROLES);