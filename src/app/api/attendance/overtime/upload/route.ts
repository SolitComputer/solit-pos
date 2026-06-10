import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

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

    // Validasi tipe file
    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { success: false, message: "Hanya file gambar yang diterima" },
        { status: 400 }
      );
    }

    // Validasi ukuran file (max 5MB)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { success: false, message: "Ukuran file terlalu besar (max 5MB)" },
        { status: 400 }
      );
    }

    // Generate nama file unik
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const ext = file.name.split(".").pop() || "jpg";
    const fileName = `overtime-proof-${timestamp}-${random}.${ext}`;
    const folderPath = `overtime-proofs/${fileName}`;

    console.log("📤 Uploading to Supabase:", {
      bucket: "documents",
      path: folderPath,
      fileSize: file.size,
      contentType: file.type,
    });

    // Upload ke Supabase Storage
    const buffer = await file.arrayBuffer();
    const { data, error } = await supabase.storage
      .from("documents")
      .upload(folderPath, buffer, {
        contentType: file.type,
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