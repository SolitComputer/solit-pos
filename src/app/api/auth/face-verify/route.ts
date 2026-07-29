// src/app/api/auth/face-verify/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getAttendanceExpiry,
  verifyToken,
  calcAttendanceWeightFromSchedule,
  resolveShiftConfigFromDB,
  isAttendanceTimeForSchedule,
  signAttendanceCookie,
} from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { resolveScheduleOverride, toAuthScheduleShape } from "@/lib/shiftSchedule";

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

async function setAttendanceCookies(response: NextResponse, userId: string, expiry: Date) {
  const opts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiry,
  };
  const signed = await signAttendanceCookie(userId);
  response.cookies.set("face_verified", signed, opts);
  response.cookies.set("face_attended", signed, opts);
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const user = await verifyToken(token);
    if (!user) return NextResponse.json({ success: false, message: "Token invalid" }, { status: 401 });

    const nowWIBCheck = new Date(Date.now() + 7 * 3600_000);
    const todayDowCheck = nowWIBCheck.getUTCDay();
    const todayDateCheck = nowWIBCheck.toISOString().slice(0, 10);

    const [{ data: weeklyOffCheck }, { data: specificOffCheck }, { data: dateWorkCheck }, { data: monthlyOffCheck }] = await Promise.all([
      supabaseAdmin.from("user_day_off").select("id")
        .eq("user_id", user.id).eq("day_of_week", todayDowCheck).maybeSingle(),
      supabaseAdmin.from("user_date_off").select("id")
        .eq("user_id", user.id).eq("off_date", todayDateCheck).maybeSingle(),
      supabaseAdmin.from("user_date_work").select("id")
        .eq("user_id", user.id).eq("work_date", todayDateCheck).maybeSingle(),
      supabaseAdmin.from("user_monthly_off").select("id")
        .eq("user_id", user.id).eq("off_date", todayDateCheck).maybeSingle(),
    ]);

    if (Boolean(monthlyOffCheck) || ((weeklyOffCheck || specificOffCheck) && !dateWorkCheck)) {
      return NextResponse.json(
        {
          success: false,
          message: "Hari ini adalah hari liburmu — tidak perlu absen 🏖️",
          isDayOff: true,
        },
        { status: 403 }
      );
    }

    const [baseSchedule, scheduleOverride] = await Promise.all([
      resolveShiftConfigFromDB(user.id, supabaseAdmin),
      resolveScheduleOverride(supabaseAdmin, user.id, todayDateCheck),
    ]);

    const schedule = scheduleOverride
      ? { ...baseSchedule, ...toAuthScheduleShape(scheduleOverride) }
      : baseSchedule;

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

    // Validasi embedding: harus array 128 angka valid (finite).
    // Tanpa ini, `embedding: []` bikin euclideanDistance = 0 → dianggap match
    // → bypass verifikasi wajah.
    if (
      !Array.isArray(embedding) ||
      embedding.length !== 128 ||
      !embedding.every((n) => typeof n === "number" && Number.isFinite(n))
    ) {
      return NextResponse.json(
        { success: false, message: "Data wajah tidak valid" },
        { status: 400 }
      );
    }

    const ua = request.headers.get("user-agent") ?? "";
    const device = parseDevice(ua);
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "Unknown";

    const nowWIB = new Date(Date.now() + 7 * 3600_000);
    const todayDate = nowWIB.toISOString().slice(0, 10);

    const [{ data: userFullData }, { data: alreadyToday }] = await Promise.all([
      supabaseAdmin
        .from("users")
        .select("face_embedding, shift")
        .eq("id", user.id)
        .single(),
      supabaseAdmin
        .from("face_verifications")
        .select("id, created_at")
        .eq("user_id", user.id)
        .eq("status", "SUCCESS")
        .gte("created_at", `${todayDate}T00:00:00+07:00`)
        .lte("created_at", `${todayDate}T23:59:59+07:00`)
        .maybeSingle(),
    ]);

    const userShift = (scheduleOverride?.shift
      ?? userFullData?.shift
      ?? "PAGI") as "PAGI" | "SORE";

    const { weight } = calcAttendanceWeightFromSchedule(
      new Date().toISOString(),
      schedule
    );

    if (alreadyToday) {
      const expiry = getAttendanceExpiry();
      const response = NextResponse.json({
        success: true,
        message: "Sudah absen hari ini",
        alreadyAttended: true,
        firstCheckIn: alreadyToday.created_at,
      });
      await setAttendanceCookies(response, user.id, expiry);
      return response;
    }

    if (!userFullData?.face_embedding) {
      return NextResponse.json(
        { success: false, message: "Wajah belum terdaftar", needEnroll: true },
        { status: 400 }
      );
    }

    const THRESHOLD = 0.5;
    const distance = euclideanDistance(embedding, userFullData.face_embedding);
    const matched = distance < THRESHOLD;

    const insertPayload: Record<string, any> = {
      user_id: user.id,
      status: matched ? "SUCCESS" : "FAILED",
      attempt_count: Number(attemptCount),
      device,
      ip_address: ip,
      shift: userShift,
      late_weight: matched ? weight : null,
      method: "FACE",
    };
    if (latitude != null) insertPayload.latitude = latitude;
    if (longitude != null) insertPayload.longitude = longitude;
    if (accuracy != null) insertPayload.accuracy = accuracy;

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

    const expiry = getAttendanceExpiry();
    const response = NextResponse.json({
      success: true,
      message: "Absen wajah berhasil",
      distance,
    });
    await setAttendanceCookies(response, user.id, expiry);
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

    const expiry = getAttendanceExpiry();
    const response = NextResponse.json({ success: true, message: "Dilanjutkan tanpa absen" });

    response.cookies.set("attendance_skipped", await signAttendanceCookie(user.id), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      expires: expiry,
    });

    return response;
  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}