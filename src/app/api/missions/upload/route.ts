import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";

const BUCKET = "mission-proofs";
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

// Cache per-instance (Vercel warm) biar tidak cek bucket tiap request.
let bucketReady = false;

async function ensureBucket() {
  if (bucketReady) return;

  // getBucket balikin data=null + error kalau bucket belum ada.
  const { data } = await supabaseAdmin.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await supabaseAdmin.storage.createBucket(BUCKET, {
      public: true,          // biar getPublicUrl bisa diakses langsung
      fileSizeLimit: MAX_SIZE,
    });
    // Abaikan race "already exists" (2 request cold start barengan).
    if (error && !/exists/i.test(error.message)) {
      throw new Error(`Gagal menyiapkan bucket: ${error.message}`);
    }
  }
  bucketReady = true;
}

async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  const form = await req.formData();
  const file = form.get("file") as File | null;

  if (!file) return NextResponse.json({ success: false, message: "File tidak ditemukan" }, { status: 400 });
  if (!file.type.startsWith("image/"))
    return NextResponse.json({ success: false, message: "File harus berupa gambar" }, { status: 400 });
  if (file.size > MAX_SIZE)
    return NextResponse.json({ success: false, message: "Ukuran maksimal 5MB" }, { status: 400 });

  // ✅ Pastikan bucket ada dulu (auto-create kalau belum).
  try {
    await ensureBucket();
  } catch (e: any) {
    console.error("[missions/upload ensureBucket]", e);
    return NextResponse.json({ success: false, message: e?.message ?? "Bucket gagal disiapkan" }, { status: 500 });
  }

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