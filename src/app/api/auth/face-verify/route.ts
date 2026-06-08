// src/app/api/auth/face-verify/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getAttendanceExpiry,
  verifyToken,
  calcAttendanceWeightFromSchedule,
  resolveShiftConfigFromDB,
  isAttendanceTimeForSchedule,
} from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function euclideanDistance(a: number[], b: number[]): number {
  return Math.sqrt(a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0));
}

function parseDevice(ua: string): string {
  if (!ua) return "Unknown Device";
  let os = "Unknown OS", browser = "Unknown Browser";
  if (/Windows NT 10|Windows NT 11/i.test(ua)) os = "Windows 10/11";
  else if (/Macintosh|Mac OS X/i.test(ua)) os = "macOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone/i.test(ua)) os = "iPhone";
  else if (/Linux/i.test(ua)) os = "Linux";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua)) browser = "Safari";
  return `${browser} — ${os}`;
}

function setAttendanceCookies(response: NextResponse, userId: string, expiry: Date) {
  const opts = {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path:     "/",
    expires:  expiry,
  };
  response.cookies.set("face_verified",  userId, opts);
  response.cookies.set("face_attended",  userId, opts);
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const user = await verifyToken(token);
    if (!user) return NextResponse.json({ success: false, message: "Token invalid" }, { status: 401 });

    // ✅ Resolusi jadwal dari DB — mendukung user_shift_config + per-hari custom
    const schedule  = await resolveShiftConfigFromDB(user.id, supabaseAdmin);
    const timeCheck = isAttendanceTimeForSchedule(schedule);

    if (!timeCheck.allowed) {
      const msg = timeCheck.reason === "TOO_EARLY"
        ? `Absen belum dibuka. Buka pukul ${timeCheck.openAt}`
        : `Waktu absen sudah berakhir. Batas ${timeCheck.closeAt}`;
      return NextResponse.json(
        { success: false, message: msg, reason: timeCheck.reason, outOfTime: true },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { embedding, attemptCount = 1, latitude, longitude, accuracy } = body;

    const ua     = request.headers.get("user-agent") ?? "";
    const device = parseDevice(ua);
    const ip     = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "Unknown";

    const { data: userFullData } = await supabaseAdmin
      .from("users")
      .select("face_embedding, shift")
      .eq("id", user.id)
      .single();

    const userShift = (userFullData?.shift ?? "PAGI") as "PAGI" | "SORE";

    // Hitung weight berdasarkan schedule yang sudah diresolved
    const { weight } = calcAttendanceWeightFromSchedule(
      new Date().toISOString(),
      schedule
    );

    // Cek apakah sudah absen hari ini
    const nowWIB    = new Date(Date.now() + 7 * 3600_000);
    const todayDate = nowWIB.toISOString().slice(0, 10);

    const { data: alreadyToday } = await supabaseAdmin
      .from("face_verifications")
      .select("id, created_at")
      .eq("user_id", user.id)
      .eq("status", "SUCCESS")
      .gte("created_at", `${todayDate}T00:00:00+07:00`)
      .lte("created_at", `${todayDate}T23:59:59+07:00`)
      .maybeSingle();

    if (alreadyToday) {
      const expiry   = getAttendanceExpiry();
      const response = NextResponse.json({
        success: true,
        message: "Sudah absen hari ini",
        alreadyAttended: true,
        firstCheckIn: alreadyToday.created_at,
      });
      setAttendanceCookies(response, user.id, expiry);
      return response;
    }

    if (!userFullData?.face_embedding) {
      return NextResponse.json(
        { success: false, message: "Wajah belum terdaftar", needEnroll: true },
        { status: 400 }
      );
    }

    const THRESHOLD = 0.45;
    const distance  = euclideanDistance(embedding, userFullData.face_embedding);
    const matched   = distance < THRESHOLD;

    const insertPayload: Record<string, any> = {
      user_id:      user.id,
      status:       matched ? "SUCCESS" : "FAILED",
      attempt_count: Number(attemptCount),
      device,
      ip_address:   ip,
      shift:        userShift,
      late_weight:  matched ? weight : null,
    };
    if (latitude  != null) insertPayload.latitude  = latitude;
    if (longitude != null) insertPayload.longitude = longitude;
    if (accuracy  != null) insertPayload.accuracy  = accuracy;

    const { error: insertError } = await supabaseAdmin
      .from("face_verifications")
      .insert(insertPayload);

    if (insertError) console.error("INSERT GAGAL:", insertError.message, insertError);

    if (!matched) {
      return NextResponse.json(
        { success: false, message: "Wajah tidak dikenali", distance },
        { status: 400 }
      );
    }

    const expiry   = getAttendanceExpiry();
    const response = NextResponse.json({
      success: true,
      message: "Absen wajah berhasil",
      distance,
    });
    setAttendanceCookies(response, user.id, expiry);
    return response;
  } catch (err: any) {
    console.error("EXCEPTION di face-verify POST:", err);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ success: false }, { status: 401 });

    const user = await verifyToken(token);
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const expiry   = getAttendanceExpiry();
    const response = NextResponse.json({ success: true, message: "Dilanjutkan tanpa absen" });

    response.cookies.set("attendance_skipped", user.id, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path:     "/",
      expires:  expiry,
    });

    return response;
  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}