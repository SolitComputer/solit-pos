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
import { processAttendanceVerification } from "@/lib/attendanceVerification";
import { logActivity } from "@/lib/activityLogger";

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

    const body = await request.json();
    const { embedding, attemptCount = 1, latitude, longitude, accuracy } = body;

    // Validasi embedding: harus array 128 angka valid (finite). Tanpa ini,
    // `embedding: []` bikin euclideanDistance = 0 → dianggap match → bypass
    // verifikasi wajah.
    if (
      !Array.isArray(embedding) ||
      embedding.length !== 128 ||
      !embedding.every((n) => typeof n === "number" && Number.isFinite(n))
    ) {
      return NextResponse.json({ success: false, message: "Data wajah tidak valid" }, { status: 400 });
    }

    const { data: userFullData } = await supabaseAdmin
      .from("users").select("face_embedding, role, roles").eq("id", user.id).single();

    if (!userFullData?.face_embedding) {
      return NextResponse.json({ success: false, message: "Wajah belum terdaftar", needEnroll: true }, { status: 400 });
    }

    const THRESHOLD = 0.5;
    const distance = euclideanDistance(embedding, userFullData.face_embedding);
    const matched = distance < THRESHOLD;

    if (!matched) {
      return NextResponse.json({ success: false, message: "Wajah tidak dikenali", distance }, { status: 400 });
    }

    const ua = request.headers.get("user-agent") ?? "";
    const device = parseDevice(ua);
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "Unknown";

    // ✅ Semua logika arah IN/OUT + deteksi lembur otomatis ada di sini,
    // jadi face-verify, webauthn, dan absen-pulang-manual admin semuanya
    // konsisten (poin 1, 2, 7, 12, 13, 16).
    const result = await processAttendanceVerification({
      supabaseAdmin,
      userId: user.id,
      userRole: (Array.isArray(userFullData.roles) && userFullData.roles[0]) || userFullData.role,
      method: "FACE",
      device,
      ip,
      latitude, longitude, accuracy,
    });

    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.message, code: result.code }, { status: result.status });
    }

    const expiry = getAttendanceExpiry();
    const response = NextResponse.json({
      success: true,
      message: result.message,
      direction: result.direction,
      distance,
      overtimeDetected: !!result.overtimeOptions,
      overtimeOptions: result.overtimeOptions,
    });
    // Cookie "sudah absen hari ini" tetap dipasang setelah OUT juga, supaya
    // halaman lain (middleware, sidebar) tahu sesi absen hari ini sudah selesai.
    await setAttendanceCookies(response, user.id, expiry);
    return response;
  } catch (err: any) {
    console.error("EXCEPTION di face-verify POST:", err);
    return NextResponse.json(
      { success: false, message: `Internal server error: ${err?.message ?? "unknown error"}` },
      { status: 500 }
    );
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

    // ✅ SECURITY FIX: dulu skip absen wajah tidak tercatat sama sekali —
    // jadi tidak ada jejak siapa yang skip dan kapan. Sekarang dicatat ke
    // activity_logs supaya bisa diaudit.
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "Unknown";
    await logActivity({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: "CREATE",
      entity: "attendance",
      entityLabel: "Skip verifikasi wajah",
      reason: `Absen dilanjutkan tanpa verifikasi wajah. IP: ${ip}`,
    });

    return response;
  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}