import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { AI_ASSISTANT_ROLES } from "@/lib/permissions";
import { createClient } from "@supabase/supabase-js";
import { runAiCeoTurn, classifyAiCeoError } from "@/lib/aiCeo";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  const body = await req.json().catch(() => null);
  const message: string = body?.message?.trim();
  const reminderId: string = body?.reminderId;
  const requestedProvider = (body?.provider ?? "auto") as "auto" | "gemini" | "groq" | "deepseek";

  if (!message) return NextResponse.json({ success: false, message: "Pesan tidak boleh kosong." }, { status: 400 });
  if (!reminderId) return NextResponse.json({ success: false, message: "reminderId wajib diisi." }, { status: 400 });

  const { data: reminder } = await supabaseAdmin
    .from("ai_ceo_reminders")
    .select("id, title, message, severity, target_user_id, status")
    .eq("id", reminderId)
    .maybeSingle();

  if (!reminder || reminder.target_user_id !== user.id) {
    return NextResponse.json({ success: false, message: "Pengingat tidak ditemukan atau bukan milikmu." }, { status: 404 });
  }

  const { data: existingConv } = await supabaseAdmin
    .from("ai_ceo_conversations")
    .select("id")
    .eq("reminder_id", reminderId)
    .eq("user_id", user.id)
    .maybeSingle();

  let convId = existingConv?.id as string | undefined;
  if (!convId) {
    const { data: newConv, error: convErr } = await supabaseAdmin
      .from("ai_ceo_conversations")
      .insert({ user_id: user.id, title: reminder.title, mode: "asisten", reminder_id: reminderId })
      .select("id")
      .single();
    if (convErr || !newConv) {
      return NextResponse.json({ success: false, message: "Gagal membuat percakapan baru." }, { status: 500 });
    }
    convId = newConv.id;
  }

  if (reminder.status === "terkirim") {
    await supabaseAdmin.from("ai_ceo_reminders").update({ status: "dibaca", read_at: new Date().toISOString() }).eq("id", reminderId);
  }

  await supabaseAdmin.from("ai_ceo_messages").insert({ conversation_id: convId, role: "user", content: message });

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
          { req, userId: user.id, conversationId: convId!, mode: "asisten", reminder },
          requestedProvider,
          (toolName) => send({ type: "tool", tool: toolName })
        );

        await supabaseAdmin.from("ai_ceo_messages").insert({
          conversation_id: convId,
          role: "assistant",
          content: result.reply,
          provider: result.providerUsed,
          prompt_tokens: result.usage?.prompt_tokens ?? null,
          completion_tokens: result.usage?.completion_tokens ?? null,
          total_tokens: result.usage?.total_tokens ?? null,
        });
        await supabaseAdmin.from("ai_ceo_conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);

        send({ type: "done", conversationId: convId, reply: result.reply, provider: result.providerUsed });
      } catch (err: any) {
        console.error("[ai-assistant/chat] error:", err?.message ?? err);
        const category = classifyAiCeoError(err);
        const friendlyMessage = category === "quota" ? "AI sedang sibuk, coba lagi sebentar." : "Asisten sedang bermasalah, coba lagi sebentar.";
        send({ type: "error", message: friendlyMessage });
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export const POST = withAuth(postHandler, AI_ASSISTANT_ROLES);