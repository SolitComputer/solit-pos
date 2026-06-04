import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    
    if (!token) {
      return NextResponse.json({ success: false, needLogin: true });
    }

    const user = await verifyToken(token);
    if (!user) {
      return NextResponse.json({ success: false, needLogin: true });
    }

    const faceVerified = cookieStore.get("face_verified")?.value;
    const faceAttended = cookieStore.get("face_attended")?.value;
    const alreadyAttended = faceVerified === user.id || faceAttended === user.id;

    // Cek apakah wajah sudah terdaftar
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    const { data: userData } = await supabase
      .from("users")
      .select("face_embedding")
      .eq("id", user.id)
      .single();

    const needEnroll = !userData?.face_embedding;

    // Cek jam absen
    const ATTENDANCE_START_HOUR = 7;
    const ATTENDANCE_START_MIN = 30;
    const ATTENDANCE_END_HOUR = 12;
    const ATTENDANCE_END_MIN = 0;
    
    const nowUTC = new Date();
    const wibMs = nowUTC.getTime() + 7 * 60 * 60 * 1000;
    const nowWIB = new Date(wibMs);
    const total = nowWIB.getUTCHours() * 60 + nowWIB.getUTCMinutes();
    const start = ATTENDANCE_START_HOUR * 60 + ATTENDANCE_START_MIN;
    const end = ATTENDANCE_END_HOUR * 60 + ATTENDANCE_END_MIN;
    const isAttendanceTime = total >= start && total <= end;

    return NextResponse.json({
      success: true,
      alreadyAttended,
      needEnroll,
      isAttendanceTime,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}