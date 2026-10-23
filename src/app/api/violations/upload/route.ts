// src/app/api/violations/upload/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { VIOLATION_MANAGE_ROLES } from "@/lib/permissions";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

const BUCKET = "documents";              // bucket yg sudah dipakai overtime-proofs
const FOLDER = "violation-proofs";
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB (sebelum kompres)

export const POST = withAuth(async (req, _ctx, _user) => {
  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, message: "File wajib diupload" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ success: false, message: "Format file harus JPG, PNG, atau WEBP" }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ success: false, message: "Ukuran file maksimal 10MB" }, { status: 400 });
  }

  // Kompres + resize (pola sama dgn upload bukti lembur).
  const originalBuffer = Buffer.from(await file.arrayBuffer());
  const compressed = await sharp(originalBuffer)
    .rotate()
    .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 65 })
    .toBuffer();

  const fileName = `violation-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
  const path = `${FOLDER}/${fileName}`;

  const supabase = getAdmin();
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, compressed, { contentType: "image/jpeg", upsert: false });

  if (uploadErr) {
    const isMissingBucket = uploadErr.message?.toLowerCase().includes("bucket not found");
    return NextResponse.json(
      {
        success: false,
        message: isMissingBucket
          ? `Storage bucket "${BUCKET}" belum ada di Supabase. Hubungi admin untuk setup bucket.`
          : uploadErr.message,
      },
      { status: 500 }
    );
  }

  const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ success: true, url: publicUrlData.publicUrl, path }, { status: 201 });
}, VIOLATION_MANAGE_ROLES);