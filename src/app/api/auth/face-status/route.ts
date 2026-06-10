import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken, resolveShiftConfigFromDB, isAttendanceTimeForSchedule } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ATTENDANCE_EXEMPT_ROLES = ["PROGRAMMER"] as const;

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return NextResponse.json({ success: false, needLogin: true });

    const user = await verifyToken(token);
    if (!user) return NextResponse.json({ success: false, needLogin: true });

    const isExempt = ATTENDANCE_EXEMPT_ROLES.includes(user.role as any);
    if (isExempt) {
      return NextResponse.json({
        success: true,
        alreadyAttended: true,
        needEnroll: false,
        isAttendanceTime: false,
        isDayOff: false,
        isTodayDayOff: false,
        shift: (user as any).shift ?? "PAGI",
        reason: "EXEMPT",
        openAt: "—",
        closeAt: "—",
        lateAt: "—",
        isExempt: true,
      });
    }

    const faceVerified = cookieStore.get("face_verified")?.value;
    const faceAttended = cookieStore.get("face_attended")?.value;
    const dayOffCookie = cookieStore.get("day_off_today")?.value;

    const nowUTC = new Date();
    const wibMs = nowUTC.getTime() + 7 * 60 * 60 * 1000;
    const nowWIB = new Date(wibMs);
    const todayDow = nowWIB.getUTCDay();
    const todayDate = nowWIB.toISOString().slice(0, 10);

    const [
      { data: weeklyOff },
      { data: specificOff },
      { data: manualToday },
      { data: todaySuccess },
      { data: userData },
    ] = await Promise.all([
      supabase.from("user_day_off").select("id").eq("user_id", user.id).eq("day_of_week", todayDow).maybeSingle(),
      supabase.from("user_date_off").select("id").eq("user_id", user.id).eq("off_date", todayDate).maybeSingle(),
      supabase.from("attendance_manual").select("id, status").eq("user_id", user.id).eq("attendance_date", todayDate).maybeSingle(),
      supabase.from("face_verifications").select("id, created_at")
        .eq("user_id", user.id).eq("status", "SUCCESS")
        .gte("created_at", `${todayDate}T00:00:00+07:00`)
        .lte("created_at", `${todayDate}T23:59:59+07:00`)
        .maybeSingle(),
      supabase.from("users").select("face_embedding, shift").eq("id", user.id).single(),
    ]);

    const userShift = ((userData as any)?.shift ?? (user as any).shift ?? "PAGI") as "PAGI" | "SORE";

    // ✅ NEW: Check jika ada leave (cuti) hari ini
    const { data: leaveToday } = await supabase
      .from("leave_requests")
      .select("id")
      .eq("user_id", user.id)
      .eq("leave_date", todayDate)
      .eq("status", "APPROVED")
      .maybeSingle();

    if (leaveToday) {
      const getMidnightWIB = () => new Date(Date.UTC(
        nowWIB.getUTCFullYear(), nowWIB.getUTCMonth(),
        nowWIB.getUTCDate() + 1, 17, 0, 0
      ));

      const response = NextResponse.json({
        success: true,
        alreadyAttended: true,
        needEnroll: false,
        isAttendanceTime: false,
        isTodayDayOff: true,
        isDayOff: true,
        shift: userShift,
        reason: "LEAVE",
        openAt: "—",
        closeAt: "—",
        isExempt: false,
      });

      response.cookies.set("day_off_today", user.id, {
        httpOnly: true, secure: process.env.NODE_ENV === "production",
        sameSite: "lax", path: "/", expires: getMidnightWIB(),
      });

      return response;
    }

    if (manualToday) {
      const getMidnightWIB = () => new Date(Date.UTC(
        nowWIB.getUTCFullYear(), nowWIB.getUTCMonth(),
        nowWIB.getUTCDate() + 1, 17, 0, 0
      ));

      const response = NextResponse.json({
        success: true,
        alreadyAttended: true,
        needEnroll: false,
        isAttendanceTime: false,
        isTodayDayOff: false,
        isDayOff: false,
        shift: ((userData as any)?.shift ?? (user as any).shift ?? "PAGI") as "PAGI" | "SORE",
        reason: "MANUAL_ATTENDANCE",
        openAt: "—",
        closeAt: "—",
        lateAt: "—",
        isExempt: false,
        manualAlreadyExists: true,
        manualStatus: (manualToday as any).status,
      });

      // Set cookie untuk tracking
      const expiry = getMidnightWIB();
      response.cookies.set("face_attended", user.id, {
        httpOnly: true, secure: process.env.NODE_ENV === "production",
        sameSite: "lax", path: "/", expires: expiry,
      });

      return response;
    }

    const isTodayDayOff = Boolean(weeklyOff) || Boolean(specificOff);
    const alreadyAttendedDB = Boolean(todaySuccess);

    // Resolusi jadwal dari DB
    const schedule = await resolveShiftConfigFromDB(user.id, supabase);
    const timeStatus = isAttendanceTimeForSchedule(schedule);

    const pad = (n: number) => String(n).padStart(2, "0");
    const openAt = `${pad(schedule.start.h)}:${pad(schedule.start.m)} WIB`;
    const closeAt = `${pad(schedule.end.h)}:${pad(schedule.end.m)} WIB`;
    const lateAt = `${pad(schedule.lateFrom.h)}:${pad(schedule.lateFrom.m)} WIB`;

    const isAttendanceTimeNow = timeStatus.reason === "OPEN";
    const reason = timeStatus.reason;
    const needEnroll = !(userData as any)?.face_embedding;

    const alreadyFromCookie = faceVerified === user.id || faceAttended === user.id;
    const alreadyAttended = alreadyFromCookie || alreadyAttendedDB;

    const getMidnightWIB = () => new Date(Date.UTC(
      nowWIB.getUTCFullYear(), nowWIB.getUTCMonth(),
      nowWIB.getUTCDate() + 1, 17, 0, 0
    ));

    const response = NextResponse.json({
      success: true,
      alreadyAttended,
      needEnroll,
      isAttendanceTime: isAttendanceTimeNow,
      isTodayDayOff,
      isDayOff: isTodayDayOff,
      shift: userShift,
      reason,
      openAt,
      closeAt,
      lateAt,
      isExempt: false,
      scheduleSource: schedule.source,
      scheduleToday: {
        openAt: `${pad(schedule.start.h)}:${pad(schedule.start.m)}`,
        closeAt: `${pad(schedule.end.h)}:${pad(schedule.end.m)}`,
        lateAt: `${pad(schedule.lateFrom.h)}:${pad(schedule.lateFrom.m)}`,
        source: schedule.source,
      },
      manualAlreadyExists: false,
    });

    if (isTodayDayOff && dayOffCookie !== user.id) {
      response.cookies.set("day_off_today", user.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax", path: "/",
        expires: getMidnightWIB(),
      });
    }

    if (alreadyAttendedDB && faceAttended !== user.id) {
      const expiry = getMidnightWIB();
      response.cookies.set("face_attended", user.id, {
        httpOnly: true, secure: process.env.NODE_ENV === "production",
        sameSite: "lax", path: "/", expires: expiry,
      });
      response.cookies.set("face_verified", user.id, {
        httpOnly: true, secure: process.env.NODE_ENV === "production",
        sameSite: "lax", path: "/", expires: expiry,
      });
    }

    return response;
  } catch (error) {
    console.error("[face-status GET]", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
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
      nowWIB.getUTCFullYear(), nowWIB.getUTCMonth(),
      nowWIB.getUTCDate() + 1, 17, 0, 0
    ));

    const response = NextResponse.json({ success: true });
    response.cookies.set("attendance_skipped", user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax", path: "/",
      expires: midnight,
    });
    return response;
  } catch (err) {
    console.error("[face-status POST]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}