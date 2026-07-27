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
  const requestedProvider = (body?.provider ?? "auto") as "auto" | "gemini" | "groq";

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
  const convId = conversationId;

  await supabaseAdmin.from("ai_ceo_messages").insert({
    conversation_id: convId,
    role: "user",
    content: message,
  });

  const { data: historyRows } = await supabaseAdmin
    .from("ai_ceo_messages")
    .select("role, content")
    .eq("conversation_id", convId)
    .order("created_at", { ascending: true })
    .limit(20);

  const history = (historyRows ?? []).map((row) => ({
    role: (row.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
    content: row.content as string,
  }));

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: any) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        const result = await runAiCeoTurn(
          history,
          { req, userId: user.id, conversationId: convId },
          requestedProvider,
          (toolName) => send({ type: "tool", tool: toolName })
        );

        await supabaseAdmin.from("ai_ceo_messages").insert({
          conversation_id: convId,
          role: "assistant",
          content: result.reply,
          provider: result.providerUsed,
        });

        await supabaseAdmin
          .from("ai_ceo_conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", convId);

        send({ type: "done", conversationId: convId, reply: result.reply, provider: result.providerUsed });
      } catch (err: any) {
        console.error("[ai-ceo/chat] error:", err);
        const isQuotaError = /429|quota|rate.?limit/i.test(String(err?.message ?? ""));
        const friendlyMessage = isQuotaError
          ? "Kuota AI hari ini sudah habis untuk provider yang dipilih. Coba pilih provider lain di dropdown kanan atas (misal 'Groq saja'), atau tunggu beberapa saat sebelum coba lagi."
          : "AI CEO sedang bermasalah menghubungi provider AI. Coba lagi sebentar lagi.";
        send({ type: "error", message: friendlyMessage });
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export const POST = withAuth(postHandler, AI_CEO_ROLES);