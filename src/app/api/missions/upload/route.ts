import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";

// ⚠️ Pastikan bucket ini ADA & PUBLIC di Supabase Storage.
// (Kalau mau private, ganti getPublicUrl → createSignedUrl.)
const BUCKET = "mission-proofs";
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  const form = await req.formData();
  const file = form.get("file") as File | null;

  if (!file) return NextResponse.json({ success: false, message: "File tidak ditemukan" }, { status: 400 });
  if (!file.type.startsWith("image/"))
    return NextResponse.json({ success: false, message: "File harus berupa gambar" }, { status: 400 });
  if (file.size > MAX_SIZE)
    return NextResponse.json({ success: false, message: "Ukuran maksimal 5MB" }, { status: 400 });

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${user.id}/${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });

  if (upErr) {
    console.error("[missions/upload]", upErr);
    return NextResponse.json({ success: false, message: upErr.message }, { status: 500 });
  }

  const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ success: true, url: pub.publicUrl });
}

export const POST = withAuth(postHandler);