import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const user = await verifyToken(token);
    if (!user) {
      return NextResponse.json({ success: false, message: "Token invalid" }, { status: 401 });
    }

    const body = await request.json();
    const { embedding } = body as { embedding: number[] };

    if (!embedding || !Array.isArray(embedding) || embedding.length !== 128) {
      return NextResponse.json(
        { success: false, message: "Embedding tidak valid (harus 128 dimensi)" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("users")
      .update({
        face_embedding: embedding,
        face_enrolled_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (error) {
      console.error("Face enroll error:", error);
      return NextResponse.json(
        { success: false, message: "Gagal menyimpan data wajah" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: "Wajah berhasil didaftarkan" });
  } catch (err) {
    console.error("Face enroll exception:", err);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ success: false }, { status: 401 });

    const admin = await verifyToken(token);
    if (!admin || admin.role !== "ADMIN") {
      return NextResponse.json({ success: false, message: "Hanya admin" }, { status: 403 });
    }

    const { user_id } = await request.json();
    if (!user_id) {
      return NextResponse.json({ success: false, message: "user_id wajib" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("users")
      .update({ face_embedding: null, face_enrolled_at: null })
      .eq("id", user_id);

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Face enrollment berhasil direset" });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ success: false }, { status: 401 });

    const user = await verifyToken(token);
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const { error } = await supabaseAdmin
      .from("users")
      .update({ face_embedding: null, face_enrolled_at: null })
      .eq("id", user.id);

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Wajah berhasil direset" });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}