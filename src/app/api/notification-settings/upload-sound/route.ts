import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withAuth, AuthUser } from "@/lib/auth";
import { NOTIFICATION_SETTINGS_ROLES } from "@/lib/permissions";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const BUCKET = "notification-sounds";
const MAX_BYTES = 3 * 1024 * 1024; // 3MB cukup buat notif pendek (voice note WA biasanya jauh di bawah ini)
const ALLOWED_TYPES = new Set([
  "audio/mpeg", "audio/mp4", "audio/aac", "audio/wav", "audio/ogg", "audio/webm", "audio/x-m4a",
]);

async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const name = ((form.get("name") as string | null)?.trim()) || file?.name || "Suara Custom";

    if (!file) {
      return NextResponse.json({ success: false, message: "File tidak ditemukan" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ success: false, message: "Ukuran file maksimal 3MB" }, { status: 400 });
    }
    if (file.type && !ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ success: false, message: "Format harus file audio (mp3/aac/wav/ogg/m4a)" }, { status: 400 });
    }

    const ext = (file.name.split(".").pop() || "mp3").toLowerCase();
    const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: file.type || "audio/mpeg", upsert: false });
    if (uploadError) throw uploadError;

    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);

    const { data, error } = await admin
      .from("notification_sound_library")
      .insert({ name, file_url: pub.publicUrl, uploaded_by: user.id })
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[POST /api/notification-settings/upload-sound]", err);
    return NextResponse.json({ success: false, message: "Gagal mengunggah suara" }, { status: 500 });
  }
}

export const POST = withAuth(postHandler, NOTIFICATION_SETTINGS_ROLES);