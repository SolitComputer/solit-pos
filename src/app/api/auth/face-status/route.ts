// src/app/api/auth/face-status/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken, resolveShiftConfigFromDB, isAttendanceTimeForSchedule, signAttendanceCookie, verifyAttendanceCookie, type DaySchedule } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { resolveScheduleOverride, toAuthScheduleShape } from "@/lib/shiftSchedule";

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

    const faceVerified = (await verifyAttendanceCookie(
      cookieStore.get("face_verified")?.value, user.id
    )) ? user.id : undefined;
    const faceAttended = (await verifyAttendanceCookie(
      cookieStore.get("face_attended")?.value, user.id
    )) ? user.id : undefined;
    const dayOffCookie = (await verifyAttendanceCookie(
      cookieStore.get("day_off_today")?.value, user.id
    )) ? user.id : undefined;

    const nowUTC = new Date();
    const wibMs = nowUTC.getTime() + 7 * 60 * 60 * 1000;
    const nowWIB = new Date(wibMs);
    const todayDow = nowWIB.getUTCDay();
    const todayDate = nowWIB.toISOString().slice(0, 10);

    const [
      { data: weeklyOff },
      { data: specificOff },
      { data: dateWork },
      { data: monthlyOff },
      { data: manualToday },
      { data: todaySuccess },
      { data: userData },
    ] = await Promise.all([
      supabase.from("user_day_off").select("id").eq("user_id", user.id).eq("day_of_week", todayDow).maybeSingle(),
      supabase.from("user_date_off").select("id").eq("user_id", user.id).eq("off_date", todayDate).maybeSingle(),
      supabase.from("user_date_work").select("id").eq("user_id", user.id).eq("work_date", todayDate).maybeSingle(),
      supabase.from("user_monthly_off").select("id").eq("user_id", user.id).eq("off_date", todayDate).maybeSingle(),
      supabase.from("attendance_manual").select("id, status, created_by")
        .eq("user_id", user.id).eq("attendance_date", todayDate).maybeSingle(),
     supabase.from("face_verifications").select("id, created_at")
        .eq("user_id", user.id).eq("status", "SUCCESS").eq("direction", "IN")
        .gte("created_at", `${todayDate}T00:00:00+07:00`)
        .lte("created_at", `${todayDate}T23:59:59+07:00`)
        .maybeSingle(),
      supabase.from("users").select("face_embedding, shift, biometric_enabled").eq("id", user.id).single(),
    ]);

    // ✅ NEW — cek terpisah apakah sudah absen PULANG hari ini
    const { data: todayOutRow } = await supabase
      .from("face_verifications")
      .select("id, created_at")
      .eq("user_id", user.id).eq("status", "SUCCESS").eq("direction", "OUT")
      .gte("created_at", `${todayDate}T00:00:00+07:00`)
      .lte("created_at", `${todayDate}T23:59:59+07:00`)
      .maybeSingle();

    const userShift = ((userData as any)?.shift ?? (user as any).shift ?? "PAGI") as "PAGI" | "SORE";

    // Check jika ada leave (cuti) hari ini
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

      response.cookies.set("day_off_today", await signAttendanceCookie(user.id), {
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

      // ✅ FIX: Ambil nama admin yang mengabsenkan
      let createdByName: string | null = null;
      const createdById = (manualToday as any).created_by;
      if (createdById) {
        const { data: creatorData } = await supabase
          .from("users")
          .select("name")
          .eq("id", createdById)
          .maybeSingle();
        createdByName = creatorData?.name ?? null;
      }

      const expiry = getMidnightWIB();
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
        manualCreatedByName: createdByName,  // ✅ TAMBAH
      });

      response.cookies.set("face_attended", await signAttendanceCookie(user.id), {
        httpOnly: true, secure: process.env.NODE_ENV === "production",
        sameSite: "lax", path: "/", expires: expiry,
      });

      return response;
    }

   const isTodayDayOff = Boolean(monthlyOff) || ((Boolean(weeklyOff) || Boolean(specificOff)) && !Boolean(dateWork));
    const alreadyAttendedDB = Boolean(todaySuccess); // ini sekarang khusus status absen MASUK
    const alreadyCheckedOut = Boolean(todayOutRow);  // ✅ NEW — status absen PULANG

   const baseSchedule = await resolveShiftConfigFromDB(user.id, supabase);
    const override = await resolveScheduleOverride(supabase, user.id, todayDate);

    const overrideShape = override ? toAuthScheduleShape(override) : null;
    // ✅ FIX: checkout eksplisit — pakai overrideShape.checkout kalau jadwal
    // tanggal ini nge-custom jam pulang, kalau enggak tetap pakai
    // baseSchedule.checkout (dari Atur Shift akun), bukan default global.
    const schedule: DaySchedule = overrideShape
      ? { ...baseSchedule, ...overrideShape, checkout: overrideShape.checkout ?? baseSchedule.checkout }
      : baseSchedule;

    const effectiveShift = override ? override.shift : userShift;

    const timeStatus = isAttendanceTimeForSchedule(schedule);

    const pad = (n: number) => String(n).padStart(2, "0");
    const openAt = `${pad(schedule.start.h)}:${pad(schedule.start.m)} WIB`;
    const closeAt = `${pad(schedule.end.h)}:${pad(schedule.end.m)} WIB`;
    const lateAt = `${pad(schedule.lateFrom.h)}:${pad(schedule.lateFrom.m)} WIB`;

    // ✅ FIX: EARLY_OVERTIME sekarang juga dianggap "waktu absen terbuka"
    // (cuma informasinya beda — akan dihitung lembur, bukan diblokir)
    const isAttendanceTimeNow = timeStatus.reason === "OPEN" || timeStatus.reason === "EARLY_OVERTIME";
    const reason = timeStatus.reason;
    const needEnroll = !(userData as any)?.face_embedding;

    const alreadyFromCookie = faceVerified === user.id || faceAttended === user.id;
    const alreadyAttended = alreadyFromCookie || alreadyAttendedDB;

    const getMidnightWIB = () => new Date(Date.UTC(
      nowWIB.getUTCFullYear(), nowWIB.getUTCMonth(),
      nowWIB.getUTCDate() + 1, 17, 0, 0
    ));

    const { count: biometricCredCount } = await supabase
      .from("user_webauthn_credentials")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

   const response = NextResponse.json({
      success: true,
      alreadyAttended,
      needEnroll,
      isAttendanceTime: isAttendanceTimeNow,
      isTodayDayOff,
      isDayOff: isTodayDayOff,
      shift: effectiveShift,
      reason,
      openAt,
      closeAt,
      lateAt,
      checkoutAt: `${pad(schedule.checkout.h)}:${pad(schedule.checkout.m)} WIB`, // ✅ NEW
      isExempt: false,
      // ✅ NEW — dipakai halaman absen untuk menampilkan tombol "Absen Masuk" vs "Absen Pulang"
      checkedIn: alreadyAttendedDB,
      checkedOut: alreadyCheckedOut,
      needsCheckout: alreadyAttendedDB && !alreadyCheckedOut,
      scheduleSource: override ? "SHIFT_SCHEDULE" : schedule.source,
      scheduleToday: {
        openAt: `${pad(schedule.start.h)}:${pad(schedule.start.m)}`,
        closeAt: `${pad(schedule.end.h)}:${pad(schedule.end.m)}`,
        lateAt: `${pad(schedule.lateFrom.h)}:${pad(schedule.lateFrom.m)}`,
        checkoutAt: `${pad(schedule.checkout.h)}:${pad(schedule.checkout.m)}`, // ✅ NEW
        source: override ? "SHIFT_SCHEDULE" : schedule.source,
      },
      manualAlreadyExists: false,
      biometricEligible: (userData as any)?.biometric_enabled ?? false,
      biometricEnrolled: (biometricCredCount ?? 0) > 0,
    });

    if (isTodayDayOff && dayOffCookie !== user.id) {
      response.cookies.set("day_off_today", await signAttendanceCookie(user.id), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax", path: "/",
        expires: getMidnightWIB(),
      });
    }

    if (alreadyAttendedDB && faceAttended !== user.id) {
      const expiry = getMidnightWIB();
      response.cookies.set("face_attended", await signAttendanceCookie(user.id), {
        httpOnly: true, secure: process.env.NODE_ENV === "production",
        sameSite: "lax", path: "/", expires: expiry,
      });
      response.cookies.set("face_verified", await signAttendanceCookie(user.id), {
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
    response.cookies.set("attendance_skipped", await signAttendanceCookie(user.id), {
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