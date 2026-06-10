// src/app/api/attendance/overtime/upload/route.ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { success: false, message: "File wajib diupload" },
        { status: 400 }
      );
    }

    // ✅ AUTO-GENERATE FILENAME jika tidak ada
    let filename = formData.get("filename") as string;
    if (!filename) {
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const ext = file.name.split(".").pop() || "jpg";
      filename = `overtime-proof-${user.id}-${timestamp}-${random}.${ext}`;
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error } = await supabase.storage
      .from("overtime-proofs")
      .upload(filename, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (error) {
      console.error("[overtime upload] error:", error);
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    const { data: urlData } = supabase.storage
      .from("overtime-proofs")
      .getPublicUrl(filename);

    return NextResponse.json({ success: true, url: urlData.publicUrl });
  } catch (err: any) {
    console.error("[overtime upload] catch:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Upload gagal" },
      { status: 500 }
    );
  }
}