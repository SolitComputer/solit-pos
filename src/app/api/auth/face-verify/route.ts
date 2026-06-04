import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken, getAttendanceExpiry } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ATTENDANCE_START_HOUR = 7;
const ATTENDANCE_START_MIN = 30;
const ATTENDANCE_END_HOUR = 12;
const ATTENDANCE_END_MIN = 0;

function checkAttendanceWindow(): {
  allowed: boolean;
  reason: "TOO_EARLY" | "TOO_LATE" | "OPEN";
  openAt: string;
  closeAt: string;
} {
  const nowUTC = new Date();
  const wibMs = nowUTC.getTime() + 7 * 60 * 60 * 1000;
  const nowWIB = new Date(wibMs);
  const total = nowWIB.getUTCHours() * 60 + nowWIB.getUTCMinutes();
  const start = ATTENDANCE_START_HOUR * 60 + ATTENDANCE_START_MIN;
  const end = ATTENDANCE_END_HOUR * 60 + ATTENDANCE_END_MIN;
  const pad = (n: number) => String(n).padStart(2, "0");
  const openAt = `${pad(ATTENDANCE_START_HOUR)}:${pad(ATTENDANCE_START_MIN)} WIB`;
  const closeAt = `${pad(ATTENDANCE_END_HOUR)}:${pad(ATTENDANCE_END_MIN)} WIB`;
  if (total < start) return { allowed: false, reason: "TOO_EARLY", openAt, closeAt };
  if (total > end) return { allowed: false, reason: "TOO_LATE", openAt, closeAt };
  return { allowed: true, reason: "OPEN", openAt, closeAt };
}

function euclideanDistance(a: number[], b: number[]): number {
  return Math.sqrt(a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0));
}

function parseDevice(ua: string): string {
  if (!ua) return "Unknown Device";
  let os = "Unknown OS";
  let browser = "Unknown Browser";
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

// ✅ Helper: set KEDUA cookie sekaligus agar tidak ada mismatch nama
function setAttendanceCookies(response: NextResponse, userId: string, expiry: Date) {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiry,
  };
  // Set face_verified (dipakai attendance/page.tsx original)
  response.cookies.set("face_verified", userId, cookieOptions);
  // Set face_attended (dipakai versi baru)
  response.cookies.set("face_attended", userId, cookieOptions);
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const user = await verifyToken(token);
    if (!user) return NextResponse.json({ success: false, message: "Token invalid" }, { status: 401 });

    const timeCheck = checkAttendanceWindow();
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

    const ua = request.headers.get("user-agent") ?? "";
    const device = parseDevice(ua);
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "Unknown";

    const { data: userData } = await supabaseAdmin
      .from("users")
      .select("face_embedding")
      .eq("id", user.id)
      .single();

    if (!userData?.face_embedding) {
      return NextResponse.json(
        { success: false, message: "Wajah belum terdaftar", needEnroll: true },
        { status: 400 }
      );
    }

    const THRESHOLD = 0.45;
    const distance = euclideanDistance(embedding, userData.face_embedding);
    const matched = distance < THRESHOLD;

    const insertPayload: Record<string, any> = {
      user_id: user.id,
      status: matched ? "SUCCESS" : "FAILED",
      attempt_count: Number(attemptCount),
      device,
      ip_address: ip,
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
    const response = NextResponse.json({ success: true, message: "Absen wajah berhasil", distance });

    // ✅ Set kedua cookie sekaligus
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

    const timeCheck = checkAttendanceWindow();
    if (!timeCheck.allowed) {
      const msg = timeCheck.reason === "TOO_EARLY"
        ? `Absen belum dibuka. Buka pukul ${timeCheck.openAt}`
        : `Waktu absen sudah berakhir. Batas ${timeCheck.closeAt}`;
      return NextResponse.json(
        { success: false, message: msg, reason: timeCheck.reason, outOfTime: true },
        { status: 403 }
      );
    }

    const ua = request.headers.get("user-agent") ?? "";
    const device = parseDevice(ua);
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "Unknown";

    let body: any = {};
    try { body = await request.json(); } catch { /* body optional */ }
    const { latitude, longitude, accuracy } = body;

    const insertPayload: Record<string, any> = {
      user_id: user.id,
      status: "SKIPPED_MANUAL",
      attempt_count: 0,
      device,
      ip_address: ip,
    };
    if (latitude != null) insertPayload.latitude = latitude;
    if (longitude != null) insertPayload.longitude = longitude;
    if (accuracy != null) insertPayload.accuracy = accuracy;

    await supabaseAdmin.from("face_verifications").insert(insertPayload);

    const expiry = getAttendanceExpiry();
    const response = NextResponse.json({ success: true, message: "Absen manual berhasil" });

    // ✅ Set kedua cookie sekaligus
    setAttendanceCookies(response, user.id, expiry);

    return response;
  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}