import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken, resolveShiftConfigFromDB, isAttendanceTimeForSchedule, signAttendanceCookie, verifyAttendanceCookie, type DaySchedule } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { resolveScheduleOverride, toAuthScheduleShape } from "@/lib/shiftSchedule";
import { computeBeforeInOvertimeMinutes, computeAfterOutOvertimeMinutes, computeHolidayOvertimeMinutes } from "@/lib/overtimeEngine";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ATTENDANCE_EXEMPT_ROLES = ["PROGRAMMER"] as const;

function toAttendanceDateKey(iso: string): string {
  return new Date(new Date(iso).getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getAttendanceDayExpiry(attendanceDateKey: string): Date {
  return new Date(`${addDaysToDateStr(attendanceDateKey, 1)}T04:00:00+07:00`);
}

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
    // ✅ FIX: "hari ini" sekarang ikut cutoff jam 04:00 WIB — jam 00:00–03:59
    // WIB masih dihitung tanggal kemarin (bukan lagi berdasarkan tengah malam).
    const todayDate = toAttendanceDateKey(nowUTC.toISOString());
    const todayDow = new Date(`${todayDate}T12:00:00Z`).getUTCDay();

   // ✅ FIX: rentang absen "hari ini" sekarang jam 04:00 → 04:00 hari
    // berikutnya (bukan 00:00–23:59), konsisten dengan pergantian hari
    // absensi jam 4 pagi.
    const attendanceDayStart = `${todayDate}T04:00:00+07:00`;
    const attendanceDayEnd = `${addDaysToDateStr(todayDate, 1)}T03:59:59+07:00`;

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
      supabase.from("attendance_manual").select("id, status, created_by, check_in_time")
        .eq("user_id", user.id).eq("attendance_date", todayDate).maybeSingle(),
      supabase.from("face_verifications").select("id, created_at")
        .eq("user_id", user.id).eq("status", "SUCCESS").eq("direction", "IN")
        .gte("created_at", attendanceDayStart)
        .lte("created_at", attendanceDayEnd)
        .order("created_at", { ascending: false }).limit(1)
        .maybeSingle(),
      supabase.from("users").select("name, role, face_embedding, shift, biometric_enabled").eq("id", user.id).single(),
    ]);

    // ✅ NEW — cek terpisah apakah sudah absen PULANG hari ini
    const { data: todayOutRow } = await supabase
      .from("face_verifications")
      .select("id, created_at")
      .eq("user_id", user.id).eq("status", "SUCCESS").eq("direction", "OUT")
      .gte("created_at", attendanceDayStart)
      .lte("created_at", attendanceDayEnd)
      .order("created_at", { ascending: false }).limit(1)
      .maybeSingle();

    const userShift = ((userData as any)?.shift ?? (user as any).shift ?? "PAGI") as "PAGI" | "SORE";

    // ✅ NEW — absen manual berstatus PRESENT/LATE dianggap "hadir" dan tetap
    // butuh absen pulang; SICK/PERMIT/ABSENT/LEAVE tidak butuh absen pulang
    // sama sekali (perilaku lama, tidak berubah).
    const manualIsAttendanceType = Boolean(manualToday) && ["PRESENT", "LATE"].includes((manualToday as any).status);

    // Check jika ada leave (cuti) hari ini
    const { data: leaveToday } = await supabase
      .from("user_leave_requests")
      .select("id")
      .eq("user_id", user.id)
      .eq("leave_date", todayDate)
      .eq("status", "APPROVED")
      .maybeSingle();

    if (leaveToday) {
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
        sameSite: "lax", path: "/", expires: getAttendanceDayExpiry(todayDate),
      });

      return response;
    }

   if (manualToday && !manualIsAttendanceType) {
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

      const expiry = getAttendanceDayExpiry(todayDate);
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
    // ✅ FIX: absen masuk manual (PRESENT/LATE) sekarang juga dihitung "sudah
    // absen masuk" — sebelumnya cuma face_verifications yang dicek, jadi
    // orang yang di-absenkan manual tidak pernah dianggap perlu absen pulang.
    const alreadyAttendedDB = Boolean(todaySuccess) || manualIsAttendanceType; // ini sekarang khusus status absen MASUK
    const alreadyCheckedOut = Boolean(todayOutRow);  // ✅ NEW — status absen PULANG
    // Referensi jam masuk untuk hitung lembur — dari face_verifications kalau
    // ada, atau dari jam masuk yang diisi admin saat absen manual.
    const inTimestampForOvertime = todaySuccess?.created_at ?? (manualIsAttendanceType ? (manualToday as any).check_in_time : null);
    const isManualCheckIn = !todaySuccess && manualIsAttendanceType;

    // ✅ NEW — nama admin yang meng-absen-masukkan secara manual, dipakai
    // untuk badge "Absen Manual" di kartu status hari ini.
    let manualCheckInByName: string | null = null;
    if (isManualCheckIn && (manualToday as any)?.created_by) {
      const { data: manualCreatorData } = await supabase
        .from("users").select("name").eq("id", (manualToday as any).created_by).maybeSingle();
      manualCheckInByName = manualCreatorData?.name ?? null;
    }

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

    const isAttendanceTimeNow = timeStatus.reason === "OPEN" || timeStatus.reason === "EARLY_OVERTIME";
    const reason = timeStatus.reason;
    const needEnroll = !(userData as any)?.face_embedding;

    const needsCheckoutNow = alreadyAttendedDB && !alreadyCheckedOut;
    let isEarlyCheckout = false;
    let earlyCheckoutStatus: "NONE" | "PENDING" | "APPROVED" | "REJECTED" = "NONE";
    if (needsCheckoutNow && !isTodayDayOff) {
      const scheduledCheckoutISO = new Date(
        `${todayDate}T${pad(schedule.checkout.h)}:${pad(schedule.checkout.m)}:00+07:00`
      ).toISOString();
      isEarlyCheckout = nowUTC.getTime() < new Date(scheduledCheckoutISO).getTime();

      if (isEarlyCheckout) {
        const { data: ecoRow } = await supabase
          .from("early_checkout_requests")
          .select("status")
          .eq("user_id", user.id)
          .eq("request_date", todayDate)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        earlyCheckoutStatus = (ecoRow?.status as typeof earlyCheckoutStatus) ?? "NONE";
      }
    }

   let overtimeOptions: { beforeInMinutes: number; afterOutMinutes: number; holidayMinutes: number } | null = null;
    if (alreadyCheckedOut && inTimestampForOvertime && todayOutRow) {
      // ✅ FIX: beforeIn (lembur sebelum jam masuk) sengaja TIDAK dihitung
      // kalau absen masuknya dari input manual admin — jam masuk manual cuma
      // perkiraan/koreksi, bukan scan real-time, jadi tidak dipakai sebagai
      // dasar klaim lembur awal otomatis.
      const beforeInMinutes = (isTodayDayOff || isManualCheckIn) ? 0 : computeBeforeInOvertimeMinutes(inTimestampForOvertime, schedule);
      const afterOutMinutes = isTodayDayOff ? 0 : computeAfterOutOvertimeMinutes(todayOutRow.created_at, schedule);
      const holidayMinutes = isTodayDayOff ? computeHolidayOvertimeMinutes(inTimestampForOvertime, todayOutRow.created_at) : 0;

      if (beforeInMinutes > 0 || afterOutMinutes > 0 || holidayMinutes > 0) {
        const { data: existingToday } = await supabase
          .from("overtime_requests")
          .select("direction")
          .eq("user_id", user.id)
          .eq("request_date", todayDate)
          .not("status", "in", "(REJECTED,CANCELLED)");
        const submitted = new Set((existingToday ?? []).map((r: any) => r.direction));

        overtimeOptions = {
          beforeInMinutes: submitted.has("BEFORE_IN") || submitted.has("BOTH") ? 0 : beforeInMinutes,
          afterOutMinutes: submitted.has("AFTER_OUT") || submitted.has("BOTH") ? 0 : afterOutMinutes,
          holidayMinutes: submitted.has("HOLIDAY") ? 0 : holidayMinutes,
        };
        if (overtimeOptions.beforeInMinutes <= 0 && overtimeOptions.afterOutMinutes <= 0 && overtimeOptions.holidayMinutes <= 0) {
          overtimeOptions = null;
        }
      }
    }

    // ✅ FIX: `alreadyAttended` sekarang murni dari DB (`alreadyAttendedDB`),
    // tidak lagi di-OR dengan cookie face_verified/face_attended. Cookie bisa
    // masih "valid" (belum expired) walau baris absen hari ini sudah dihapus
    // admin, atau expiry-nya di-set fungsi lain (getAttendanceExpiry di
    // face-verify POST) yang tidak konsisten dengan getAttendanceDayExpiry
    // di file ini — akibatnya user yang SEBENARNYA belum absen tetap dianggap
    // "Sudah Absen". DB selalu fresh karena di-query ulang tiap request, jadi
    // itu satu-satunya sumber kebenaran yang valid.
    const alreadyFromCookie = faceVerified === user.id || faceAttended === user.id;
    const alreadyAttended = alreadyAttendedDB;

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
      isEarlyCheckout, 
      earlyCheckoutStatus,
      overtimeOptions, // ✅ NEW
      userName: (userData as any)?.name ?? user.name ?? "Pengguna",
      userRole: (userData as any)?.role ?? user.role ?? "STAFF",
      isManualCheckIn, // ✅ NEW — badge "Absen Manual" di kartu status hari ini
      manualCheckInByName, // ✅ NEW
    });

    if (isTodayDayOff && dayOffCookie !== user.id) {
      response.cookies.set("day_off_today", await signAttendanceCookie(user.id), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax", path: "/",
        expires: getAttendanceDayExpiry(todayDate),
      });
    }

    if (alreadyAttendedDB && faceAttended !== user.id) {
      const expiry = getAttendanceDayExpiry(todayDate);
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
    // ✅ FIX: expiry cookie "skip absen" ikut cutoff jam 04:00 WIB, konsisten
    // dengan batas hari absensi di endpoint lain.
    const todayDate = toAttendanceDateKey(nowUTC.toISOString());
    const skipExpiry = getAttendanceDayExpiry(todayDate);

    const response = NextResponse.json({ success: true });
    response.cookies.set("attendance_skipped", await signAttendanceCookie(user.id), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax", path: "/",
      expires: skipExpiry,
    });
    return response;
  } catch (err) {
    console.error("[face-status POST]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}