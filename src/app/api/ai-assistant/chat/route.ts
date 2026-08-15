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
  const reminderId: string | undefined = body?.reminderId;
  const bodyConvId: string | undefined = body?.conversationId;
  const requestedProvider = (body?.provider ?? "auto") as "auto" | "gemini" | "groq" | "deepseek";

  if (!message) return NextResponse.json({ success: false, message: "Pesan tidak boleh kosong." }, { status: 400 });

  const userRoles: string[] =
    Array.isArray((user as any).roles) && (user as any).roles.length > 0
      ? (user as any).roles
      : user.role
      ? [user.role]
      : [];
  const primaryRole = userRoles[0] ?? "";

  let convId = bodyConvId;
  let mode: "asisten" | "member_chat" = "member_chat";
  let reminder: any = null;

  if (reminderId) {
    mode = "asisten";
    const { data } = await supabaseAdmin
      .from("ai_ceo_reminders")
      .select("id, title, message, severity, target_user_id, status")
      .eq("id", reminderId)
      .maybeSingle();
      
    if (!data || data.target_user_id !== user.id) {
      return NextResponse.json({ success: false, message: "Pengingat tidak ditemukan atau bukan milikmu." }, { status: 404 });
    }
    reminder = data;

    const { data: existingConv } = await supabaseAdmin
      .from("ai_ceo_conversations")
      .select("id")
      .eq("reminder_id", reminderId)
      .eq("user_id", user.id)
      .maybeSingle();

    convId = existingConv?.id;
    if (!convId) {
      const { data: newConv, error: convErr } = await supabaseAdmin
        .from("ai_ceo_conversations")
        .insert({ user_id: user.id, title: reminder.title, mode: "asisten", reminder_id: reminderId })
        .select("id")
        .single();
      if (convErr || !newConv) return NextResponse.json({ success: false, message: "Gagal membuat percakapan baru." }, { status: 500 });
      convId = newConv.id;
    }

    if (reminder.status === "terkirim") {
      await supabaseAdmin.from("ai_ceo_reminders").update({ status: "dibaca", read_at: new Date().toISOString() }).eq("id", reminderId);
    }
  } else {
    // Mode member_chat (Tanya CEO Bebas)
    mode = "member_chat";
    if (!convId) {
      const { data: newConv, error: convErr } = await supabaseAdmin
        .from("ai_ceo_conversations")
        .insert({ user_id: user.id, title: message.slice(0, 40) || "Chat Bebas", mode: "ceo" })
        .select("id")
        .single();
      if (convErr || !newConv) return NextResponse.json({ success: false, message: "Gagal membuat percakapan baru." }, { status: 500 });
      convId = newConv.id;
    }
  }

  await supabaseAdmin.from("ai_ceo_messages").insert({ conversation_id: convId, role: "user", content: message });

  const { data: historyRows } = await supabaseAdmin
    .from("ai_ceo_messages")
    .select("role, content")
    .eq("conversation_id", convId)
    .order("created_at", { ascending: true })
    .limit(30);

  const history = (historyRows ?? []).map((row) => ({
    role: (row.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
    content: row.content as string,
  }));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: any) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      
      // Cek apakah percakapan sedang di-hijack oleh admin (eskalasi aktif)
      const { data: activeEscalation } = await supabaseAdmin
        .from("ai_ceo_suggestions")
        .select("id, status")
        .eq("conversation_id", convId)
        .eq("category", "balasan_member")
        .in("status", ["pending", "reviewed"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeEscalation) {
        // Jika sudah dijawab (reviewed), kembalikan ke pending agar admin tahu ada pesan baru
        if (activeEscalation.status === "reviewed") {
          await supabaseAdmin.from("ai_ceo_suggestions").update({ status: "pending" }).eq("id", activeEscalation.id);
        }
        // Jangan panggil AI, beritahu member bahwa pesan masuk ke live chat
        send({ type: "done", reply: "*(Pesan langsung diteruskan ke Admin Live Chat)*", conversationId: convId });
        controller.close();
        return;
      }

      try {
        const result = await runAiCeoTurn(
          history,
          { req, userId: user.id, conversationId: convId!, mode, reminder, userName: user.name, userRole: primaryRole },
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