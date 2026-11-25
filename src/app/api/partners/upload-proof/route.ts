import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ALLOWED_ORIGINS = [
  "https://solit.id",
  "https://www.solit.id",
  "http://localhost:5173",
  "http://localhost:3000",
];

function corsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ success: false, message: "File wajib diupload" }, { status: 400, headers });
    }

    // Validasi tipe & ukuran
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ success: false, message: "Format harus JPG/PNG/WebP" }, { status: 400, headers });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ success: false, message: "Ukuran maks 5MB" }, { status: 400, headers });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // Generate unique filename
    const ext = file.name.split(".").pop() || "jpg";
    const fileName = `follow-proof/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const { error } = await supabase.storage
      .from("partner-uploads")
      .upload(fileName, buffer, { contentType: file.type, upsert: false });

    if (error) {
      console.error("[upload-proof] storage error:", error);
      return NextResponse.json({ success: false, message: "Gagal upload file" }, { status: 500, headers });
    }

    const { data: urlData } = supabase.storage.from("partner-uploads").getPublicUrl(fileName);

    return NextResponse.json({ success: true, url: urlData.publicUrl }, { status: 200, headers });
  } catch (err) {
    console.error("[upload-proof] error:", err);
    return NextResponse.json({ success: false, message: "Terjadi kesalahan server" }, { status: 500, headers });
  }
}