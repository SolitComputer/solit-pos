import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const ATTENDANCE_START_HOUR = 7;
const ATTENDANCE_START_MIN = 30;
const ATTENDANCE_END_HOUR = 12;
const ATTENDANCE_END_MIN = 0;

function getMidnightWIB(): Date {
    const nowUTC = new Date();
    const wibMs = nowUTC.getTime() + 7 * 60 * 60 * 1000;
    const nowWIB = new Date(wibMs);
    return new Date(Date.UTC(
        nowWIB.getUTCFullYear(),
        nowWIB.getUTCMonth(),
        nowWIB.getUTCDate() + 1,
        17, 0, 0
    ));
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ success: false, needLogin: true });

    const user = await verifyToken(token);
    if (!user) return NextResponse.json({ success: false, needLogin: true });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const faceVerified  = cookieStore.get("face_verified")?.value;
    const faceAttended  = cookieStore.get("face_attended")?.value;
    const skipCookie    = cookieStore.get("attendance_skipped")?.value;
    const dayOffCookie  = cookieStore.get("day_off_today")?.value;

    const alreadyFromCookie =
      faceVerified  === user.id ||
      faceAttended  === user.id ||
      skipCookie    === user.id ||
      dayOffCookie  === user.id;

    const nowUTC    = new Date();
    const wibMs     = nowUTC.getTime() + 7 * 60 * 60 * 1000;
    const nowWIB    = new Date(wibMs);
    const todayDow  = nowWIB.getUTCDay();
    const todayDate = nowWIB.toISOString().slice(0, 10);

    const [
      { data: weeklyOff },
      { data: specificOff },
      { data: todaySuccess },
      { data: userData },
    ] = await Promise.all([
      supabase.from("user_day_off").select("id").eq("user_id", user.id).eq("day_of_week", todayDow).maybeSingle(),
      supabase.from("user_date_off").select("id").eq("user_id", user.id).eq("off_date", todayDate).maybeSingle(),
      supabase.from("face_verifications").select("id").eq("user_id", user.id).eq("status", "SUCCESS")
        .gte("created_at", `${todayDate}T00:00:00+07:00`)
        .lte("created_at", `${todayDate}T23:59:59+07:00`)
        .maybeSingle(),
      // ── CHANGED: ambil shift sekarang ──
      supabase.from("users").select("face_embedding, shift").eq("id", user.id).single(),
    ]);

    // ── CHANGED: gunakan shift user untuk cek window absen ──
    const userShift      = ((userData as any)?.shift ?? (user as any).shift ?? "PAGI") as "PAGI" | "SORE";
    const isTodayDayOff  = Boolean(weeklyOff) || Boolean(specificOff);
    const alreadyAttendedDB = Boolean(todaySuccess);

    // Hitung isAttendanceTime berdasarkan shift user
    const { SHIFT_CONFIG } = await import("@/lib/auth");
    const cfg   = SHIFT_CONFIG[userShift];
    const total = nowWIB.getUTCHours() * 60 + nowWIB.getUTCMinutes();
    const start = cfg.start.h * 60 + cfg.start.m;
    const end   = cfg.end.h   * 60 + cfg.end.m;
    const isAttendanceTime = total >= start && total <= end;

    const needEnroll      = !(userData as any)?.face_embedding;
    const alreadyAttended = alreadyFromCookie || isTodayDayOff || alreadyAttendedDB;

    const response = NextResponse.json({
      success: true,
      alreadyAttended,
      needEnroll,
      isAttendanceTime,
      isTodayDayOff,
      shift: userShift, // ← kirim shift ke client
    });

    const getMidnightWIB = () => new Date(Date.UTC(
      nowWIB.getUTCFullYear(), nowWIB.getUTCMonth(), nowWIB.getUTCDate() + 1, 17, 0, 0
    ));

    if (isTodayDayOff && dayOffCookie !== user.id) {
      response.cookies.set("day_off_today", user.id, {
        httpOnly: true, secure: process.env.NODE_ENV === "production",
        sameSite: "lax", path: "/", expires: getMidnightWIB(),
      });
    }
    if (alreadyAttendedDB && faceAttended !== user.id) {
      const expiry = getMidnightWIB();
      response.cookies.set("face_attended", user.id, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expiry });
      response.cookies.set("face_verified", user.id, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expiry });
    }

    return response;
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

export async function POST() {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get("token")?.value;
        if (!token) return NextResponse.json({ success: false }, { status: 401 });

        const user = await verifyToken(token);
        if (!user) return NextResponse.json({ success: false }, { status: 401 });

        const nowUTC = new Date();
        const wibMs = nowUTC.getTime() + 7 * 60 * 60 * 1000;
        const nowWIB = new Date(wibMs);
        const midnight = new Date(Date.UTC(
            nowWIB.getUTCFullYear(),
            nowWIB.getUTCMonth(),
            nowWIB.getUTCDate() + 1,
            17, 0, 0
        ));

        const response = NextResponse.json({ success: true });
        response.cookies.set("attendance_skipped", user.id, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            expires: midnight,
        });
        return response;
    } catch {
        return NextResponse.json({ success: false }, { status: 500 });
    }
}