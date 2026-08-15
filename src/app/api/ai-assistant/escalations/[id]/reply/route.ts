import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { AI_CEO_ROLES } from "@/lib/permissions";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function postHandler(req: NextRequest, ctx: { params: Promise<{ id: string }> }, user: AuthUser) {
  const { id } = await ctx.params;
  const body = await req.json();
  const { jawaban } = body;

  if (!jawaban) {
    return NextResponse.json({ success: false, message: "Jawaban tidak boleh kosong." }, { status: 400 });
  }

  // 1. Ambil eskalasi
  const { data: esc, error: escErr } = await supabaseAdmin
    .from("ai_ceo_suggestions")
    .select("id, conversation_id, status")
    .eq("id", id)
    .maybeSingle();

  if (escErr || !esc) return NextResponse.json({ success: false, message: "Eskalasi tidak ditemukan." }, { status: 404 });
  if (esc.status === "reviewed") return NextResponse.json({ success: false, message: "Eskalasi ini sudah dijawab sebelumnya." }, { status: 400 });
  if (!esc.conversation_id) return NextResponse.json({ success: false, message: "Tidak ada percakapan yang terkait dengan eskalasi ini." }, { status: 400 });

  // 2. Insert balasan ke percakapan member
  const { error: msgErr } = await supabaseAdmin.from("ai_ceo_messages").insert({
    conversation_id: esc.conversation_id,
    role: "assistant",
    content: jawaban,
    provider: "system" // Penanda pesan dari admin live chat
  });
  if (msgErr) return NextResponse.json({ success: false, message: `Gagal mengirim pesan: ${msgErr.message}` }, { status: 500 });

  // 3. Update status eskalasi
  const { error: updErr } = await supabaseAdmin
    .from("ai_ceo_suggestions")
    .update({ status: "reviewed" })
    .eq("id", esc.id);
  
  if (updErr) return NextResponse.json({ success: false, message: `Gagal mengupdate status: ${updErr.message}` }, { status: 500 });

  return NextResponse.json({ success: true, message: "Balasan berhasil dikirim ke member." });
}

export const POST = withAuth(postHandler, AI_CEO_ROLES);
