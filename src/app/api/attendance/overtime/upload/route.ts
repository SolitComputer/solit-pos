import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { success: false, message: "File tidak ditemukan" },
        { status: 400 }
      );
    }

    // ✅ FIX: dulu terima semua "image/*" termasuk image/svg+xml — SVG bisa
    // menyisipkan <script> yang jalan kalau dibuka langsung dari bucket
    // publik. Dipersempit ke format raster umum saja.
    const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
    if (!ALLOWED_MIME.includes(file.type)) {
      return NextResponse.json(
        { success: false, message: "Hanya file gambar JPG/PNG/WEBP yang diterima" },
        { status: 400 }
      );
    }

    // Validasi ukuran file (max 10MB)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { success: false, message: "Ukuran file terlalu besar (max 10MB)" },
        { status: 400 }
      );
    }

    // Generate nama file unik
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    // ✅ NEW — output kompresi selalu JPEG, jadi ekstensi file juga
    // dipaksa .jpg (bukan ikut ekstensi asli lagi).
    const fileName = `overtime-proof-${timestamp}-${random}.jpg`;
    const folderPath = `overtime-proofs/${fileName}`;

    // ✅ NEW — kompres & resize foto bukti lembur sebelum diupload biar
    // kecil di storage. rotate() dulu (baca orientasi EXIF dari kamera HP)
    // baru resize max 1280px sisi terpanjang, lalu re-encode ke JPEG
    // quality 65 — dari foto HP 3-8MB biasanya turun jadi ~150-300KB.
    const originalBuffer = Buffer.from(await file.arrayBuffer());
    const compressedBuffer = await sharp(originalBuffer)
      .rotate()
      .resize({
        width: 1280,
        height: 1280,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 65 })
      .toBuffer();

    console.log("📤 Uploading to Supabase:", {
      bucket: "documents",
      path: folderPath,
      originalSize: `${(file.size / 1024).toFixed(1)} KB`,
      compressedSize: `${(compressedBuffer.length / 1024).toFixed(1)} KB`,
      contentType: "image/jpeg",
    });

    // Upload ke Supabase Storage
    const { data, error } = await supabase.storage
      .from("documents")
      .upload(folderPath, compressedBuffer, {
        contentType: "image/jpeg",
        upsert: false,
      });

    if (error) {
      console.error("❌ Supabase upload error:", error);
      return NextResponse.json(
        {
          success: false,
          message: `Upload gagal: ${error.message}`,
          errorCode: error.name,
        },
        { status: 500 }
      );
    }

    console.log("✅ Upload success:", data);

    // Ambil public URL
    const { data: publicUrlData } = supabase.storage
      .from("documents")
      .getPublicUrl(data.path);

    const url = publicUrlData.publicUrl;

    console.log("🔗 Public URL:", url);

    return NextResponse.json({
      success: true,
      url,
      path: data.path,
    });
  } catch (error: any) {
    console.error("❌ Upload error:", error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Gagal upload",
        error: error.toString(),
      },
      { status: 500 }
    );
  }
}