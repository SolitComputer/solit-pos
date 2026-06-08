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
    const file     = formData.get("file") as File;
    const filename = formData.get("filename") as string;

    if (!file || !filename) {
      return NextResponse.json({ success: false, message: "File dan filename wajib" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer      = Buffer.from(arrayBuffer);

    const { error } = await supabase.storage
      .from("overtime-proofs")
      .upload(filename, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (error) {
      console.error("[overtime upload] error:", error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    const { data: urlData } = supabase.storage
      .from("overtime-proofs")
      .getPublicUrl(filename);

    return NextResponse.json({ success: true, url: urlData.publicUrl });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err?.message }, { status: 500 });
  }
}