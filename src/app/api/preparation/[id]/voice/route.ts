import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { DELIVERY_VOICE_ROLES } from "@/lib/permissions";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

interface Props { params: Promise<{ id: string }>; }

// GET — riwayat voice (lama → baru)
async function getHandler(_req: NextRequest, props: Props, _user: AuthUser) {
  try {
    const { id } = await props.params;
    const { data, error } = await admin
      .from("delivery_voice_notes")
      .select("id, sender_id, sender_name, sender_role, audio_url, duration_ms, created_at")
      .eq("preparation_id", id)
      .order("created_at", { ascending: true })
      .limit(50);
    if (error) throw error;
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (err) {
    console.error("[GET voice]", err);
    return NextResponse.json({ success: false, message: "Gagal ambil suara" }, { status: 500 });
  }
}

// POST — kirim clip suara (multipart)
async function postHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;
    const form = await req.formData();
    const file = form.get("audio") as File | null;
    const durationMs = Number(form.get("duration_ms") ?? 0);
    if (!file) return NextResponse.json({ success: false, message: "Audio kosong" }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    const isMp4 = (file.type || "").includes("mp4");
    const ext = isMp4 ? "mp4" : "webm";
    const ct = file.type || (isMp4 ? "audio/mp4" : "audio/webm");
    const path = `${id}/${Date.now()}_${user.id}.${ext}`;

    const { error: upErr } = await admin.storage
      .from("delivery-voice")
      .upload(path, buf, { contentType: ct, upsert: false });
    if (upErr) throw upErr;

    const { data: pub } = admin.storage.from("delivery-voice").getPublicUrl(path);

    const { data, error } = await admin
      .from("delivery_voice_notes")
      .insert({
        preparation_id: id,
        sender_id: user.id,
        sender_name: user.name,
        sender_role: user.role,
        audio_url: pub.publicUrl,
        duration_ms: durationMs || null,
      })
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("[POST voice]", err);
    return NextResponse.json({ success: false, message: err?.message ?? "Gagal kirim suara" }, { status: 500 });
  }
}

export const GET = withAuth(getHandler, DELIVERY_VOICE_ROLES);
export const POST = withAuth(postHandler, DELIVERY_VOICE_ROLES);