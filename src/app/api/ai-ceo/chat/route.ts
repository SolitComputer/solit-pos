import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { AI_CEO_ROLES } from "@/lib/permissions";
import { createClient } from "@supabase/supabase-js";
import { runAiCeoTurn } from "@/lib/aiCeo";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  const body = await req.json().catch(() => null);
  const message: string = body?.message?.trim();
  let conversationId: string | null = body?.conversationId ?? null;

  if (!message) {
    return NextResponse.json({ success: false, message: "Pesan tidak boleh kosong." }, { status: 400 });
  }

  if (!conversationId) {
    const { data: conv, error: convErr } = await supabaseAdmin
      .from("ai_ceo_conversations")
      .insert({ user_id: user.id, title: message.slice(0, 60) })
      .select("id")
      .single();
    if (convErr || !conv) {
      return NextResponse.json({ success: false, message: "Gagal membuat percakapan baru." }, { status: 500 });
    }
    conversationId = conv.id;
  }

  await supabaseAdmin.from("ai_ceo_messages").insert({
    conversation_id: conversationId,
    role: "user",
    content: message,
  });

 const { data: historyRows } = await supabaseAdmin
    .from("ai_ceo_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(20);

  const history = (historyRows ?? []).map((row) => ({
    role: (row.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
    content: row.content as string,
  }));

  const requestedProvider = (body?.provider ?? "auto") as "auto" | "gemini" | "groq";

  let reply: string;
  let providerUsed: string;
  try {
    const result = await runAiCeoTurn(history, { req, userId: user.id, conversationId }, requestedProvider);
    reply = result.reply;
    providerUsed = result.providerUsed;
  } catch (err: any) {
    console.error("[ai-ceo/chat] error:", err);
    return NextResponse.json(
      { success: false, message: err?.message ?? "AI CEO sedang bermasalah, coba lagi sebentar." },
      { status: 500 }
    );
  }

  await supabaseAdmin.from("ai_ceo_messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    content: reply,
  });

  await supabaseAdmin
    .from("ai_ceo_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  return NextResponse.json({ success: true, conversationId, reply, provider: providerUsed });
}

export const POST = withAuth(postHandler, AI_CEO_ROLES);