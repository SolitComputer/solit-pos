import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken, isManualAllowedDay } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    const faceVerified = cookieStore.get("face_verified")?.value;

    if (!token) {
      return NextResponse.json({ success: false }, { status: 401 });
    }

    const user = await verifyToken(token);
    if (!user) {
      return NextResponse.json({ success: false }, { status: 401 });
    }

    // Kalau sudah ada cookie face_verified hari ini, skip verifikasi
    if (faceVerified === user.id) {
      return NextResponse.json({
        success: true,
        alreadyVerified: true,
        needEnroll: false,
        manualAllowed: false,
      });
    }

    // Cek apakah user sudah enroll wajah
    const { data: userData } = await supabaseAdmin
      .from("users")
      .select("face_embedding, face_enrolled_at")
      .eq("id", user.id)
      .single();

    const needEnroll = !userData?.face_embedding;
    const manualAllowed = isManualAllowedDay();

    return NextResponse.json({
      success: true,
      alreadyVerified: false,
      needEnroll,
      manualAllowed,
      enrolledAt: userData?.face_enrolled_at ?? null,
    });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}