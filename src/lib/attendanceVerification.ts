// src/lib/attendanceVerification.ts
import {
  resolveShiftConfigFromDB,
  isAttendanceTimeForSchedule,
  calcAttendanceWeightFromSchedule,
  type DaySchedule,
} from "@/lib/auth";
import { resolveScheduleOverride, toAuthScheduleShape } from "@/lib/shiftSchedule";
import {
  computeBeforeInOvertimeMinutes,
  computeAfterOutOvertimeMinutes,
  computeHolidayOvertimeMinutes,
  type OvertimeDirection,
} from "@/lib/overtimeEngine";

// ✅ NEW — pergantian "hari absensi" jam 04:00 WIB (bukan 00:00 WIB). Jam
// 00:00–03:59 WIB masih dihitung sebagai kelanjutan hari sebelumnya.
function toAttendanceDateKey(iso: string): string {
  return new Date(new Date(iso).getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

interface ProcessAttendanceParams {
  supabaseAdmin: any;
  userId: string;
  userRole: string;
  method: "FACE" | "BIOMETRIC" | "MANUAL_ADMIN";
  device: string;
  ip: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  /** Untuk absen manual admin: paksa waktu tertentu, bukan waktu sekarang */
  overrideNowISO?: string;
  /** Untuk endpoint manual-checkout admin: pastikan hasilnya memang OUT, bukan diam-diam jadi IN */
  forceDirection?: "IN" | "OUT";
}

export type AttendanceOutcome =
  | { ok: false; status: number; message: string; code: string }
  | {
    ok: true;
    direction: "IN" | "OUT";
    message: string;
    overtimeOptions: {
      beforeInMinutes: number;
      afterOutMinutes: number;
      holidayMinutes: number;
      sourceFaceVerificationId: string;
    } | null;
  };

export async function processAttendanceVerification(p: ProcessAttendanceParams): Promise<AttendanceOutcome> {
 const { supabaseAdmin, userId } = p;
  const nowISO = p.overrideNowISO ?? new Date().toISOString();
  // ✅ FIX: "hari ini" sekarang ikut cutoff jam 04:00 WIB, bukan tengah
  // malam — jam 00:00–03:59 WIB masih dianggap kelanjutan hari kemarin
  // (jadi absen pulang jam 2 pagi tetap dicocokkan ke absen masuk kemarin,
  // dan absen jam 4 pagi ke atas otomatis dianggap "absen masuk" baru).
  const todayDate = toAttendanceDateKey(nowISO);
  const todayDow = new Date(`${todayDate}T12:00:00Z`).getUTCDay();
  const attendanceDayStart = `${todayDate}T04:00:00+07:00`;
  const attendanceDayEnd = `${addDaysToDateStr(todayDate, 1)}T03:59:59+07:00`;

  const [
    { data: todayIn },
    { data: todayOut },
    { data: weeklyOff },
    { data: specificOff },
    { data: dateWork },
    { data: monthlyOff },
    { data: manualToday }, // ✅ NEW — absen manual (attendance_manual) hari ini, kalau ada
  ] = await Promise.all([
    supabaseAdmin.from("face_verifications").select("id, created_at")
      .eq("user_id", userId).eq("status", "SUCCESS").eq("direction", "IN")
      .gte("created_at", attendanceDayStart).lte("created_at", attendanceDayEnd)
      .order("created_at", { ascending: false }).limit(1)
      .maybeSingle(),
    supabaseAdmin.from("face_verifications").select("id, created_at")
      .eq("user_id", userId).eq("status", "SUCCESS").eq("direction", "OUT")
      .gte("created_at", attendanceDayStart).lte("created_at", attendanceDayEnd)
      .order("created_at", { ascending: false }).limit(1)
      .maybeSingle(),
    supabaseAdmin.from("user_day_off").select("id").eq("user_id", userId).eq("day_of_week", todayDow).maybeSingle(),
    supabaseAdmin.from("user_date_off").select("id").eq("user_id", userId).eq("off_date", todayDate).maybeSingle(),
    supabaseAdmin.from("user_date_work").select("id").eq("user_id", userId).eq("work_date", todayDate).maybeSingle(),
    supabaseAdmin.from("user_monthly_off").select("id").eq("user_id", userId).eq("off_date", todayDate).maybeSingle(),
    supabaseAdmin.from("attendance_manual").select("id, status, check_in_time")
      .eq("user_id", userId).eq("attendance_date", todayDate).maybeSingle(),
  ]);

  const isDayOff = Boolean(monthlyOff) || ((Boolean(weeklyOff) || Boolean(specificOff)) && !dateWork);

  // ✅ NEW — absen masuk manual (attendance_manual berstatus PRESENT/LATE)
  // dianggap setara "sudah absen masuk" untuk menentukan arah IN/OUT. Tanpa
  // ini, orang yang di-absenkan manual (bukan wajah) tidak akan pernah bisa
  // di-absen-pulangkan — baik oleh dirinya sendiri (face-verify) maupun
  // admin ("Absen Pulang Manual") — karena `todayIn` di face_verifications
  // memang tidak pernah terisi untuk absen manual.
  const manualCheckedIn = Boolean(manualToday) && ["PRESENT", "LATE"].includes((manualToday as any).status);
  const hasCheckedInToday = Boolean(todayIn) || manualCheckedIn;

  const direction: "IN" | "OUT" | null = !hasCheckedInToday ? "IN" : (!todayOut ? "OUT" : null);

  if (direction === null) {
    return { ok: false, status: 400, message: "Kamu sudah absen masuk dan pulang hari ini — tidak bisa absen lagi.", code: "ALREADY_DONE" };
  }

  if (p.forceDirection && p.forceDirection !== direction) {
    return {
      ok: false, status: 400, code: "WRONG_DIRECTION",
      message: p.forceDirection === "OUT"
        ? "User ini belum absen masuk hari ini — tidak bisa dibuatkan absen pulang manual."
        : "User ini sudah absen masuk hari ini.",
    };
  }

  const [baseSchedule, scheduleOverride] = await Promise.all([
    resolveShiftConfigFromDB(userId, supabaseAdmin),
    resolveScheduleOverride(supabaseAdmin, userId, todayDate),
  ]);
  const overrideShape = scheduleOverride ? toAuthScheduleShape(scheduleOverride) : null;
  // ✅ FIX: checkout diisi eksplisit — pakai overrideShape.checkout kalau
  // jadwal tanggal ini nge-custom jam pulang, kalau enggak tetap pakai
  // baseSchedule.checkout (dari Atur Shift akun), bukan default global.
  const schedule: DaySchedule = overrideShape
    ? { ...baseSchedule, ...overrideShape, checkout: overrideShape.checkout ?? baseSchedule.checkout }
    : baseSchedule;

  if (direction === "IN" && !isDayOff) {
    const timeCheck = isAttendanceTimeForSchedule(schedule);
    if (!timeCheck.allowed) {
      return { ok: false, status: 403, code: "TOO_LATE", message: `Waktu absen masuk sudah berakhir. Batas ${timeCheck.closeAt}.` };
    }
  }

  if (direction === "OUT" && !hasCheckedInToday) {
    return { ok: false, status: 400, code: "NO_CHECKIN", message: "Kamu belum absen masuk hari ini, tidak bisa absen pulang." };
  }

  if (direction === "OUT" && !isDayOff && p.method !== "MANUAL_ADMIN") {
    const scheduledCheckoutISO = buildTodayWIBTimestamp(todayDate, schedule.checkout);
    const isEarly = new Date(nowISO).getTime() < new Date(scheduledCheckoutISO).getTime();

    if (isEarly) {
      const { data: approval } = await supabaseAdmin
        .from("early_checkout_requests")
        .select("id")
        .eq("user_id", userId)
        .eq("request_date", todayDate)
        .eq("status", "APPROVED")
        .maybeSingle();

      if (!approval) {
        const pad = (n: number) => String(n).padStart(2, "0");
        const checkoutLabel = `${pad(schedule.checkout.h)}:${pad(schedule.checkout.m)} WIB`;
        return {
          ok: false,
          status: 403,
          code: "EARLY_CHECKOUT_NOT_APPROVED",
          message: `Belum waktunya pulang (jadwal ${checkoutLabel}). Ajukan izin pulang cepat ke admin terlebih dahulu.`,
        };
      }
    }
  }

  const weight = direction === "IN" ? calcAttendanceWeightFromSchedule(nowISO, schedule).weight : null;

  const insertPayload: Record<string, any> = {
    user_id: userId,
    status: "SUCCESS",
    device: p.device,
    ip_address: p.ip,
    direction,
    method: p.method,
    late_weight: weight,
    created_at: nowISO,
  };
  if (p.latitude != null) insertPayload.latitude = p.latitude;
  if (p.longitude != null) insertPayload.longitude = p.longitude;
  if (p.accuracy != null) insertPayload.accuracy = p.accuracy;

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("face_verifications").insert(insertPayload).select("id").single();

  if (insertError || !inserted) {
    return { ok: false, status: 500, code: "INSERT_FAILED", message: `Absen ${direction === "IN" ? "masuk" : "pulang"} gagal disimpan: ${insertError?.message ?? "unknown error"}` };
  }

  let overtimeOptions: {
    beforeInMinutes: number; afterOutMinutes: number; holidayMinutes: number;
    sourceFaceVerificationId: string;
  } | null = null;
  const eligibleForOvertime = true;

  if (eligibleForOvertime) {
    let beforeInMinutes = 0, afterOutMinutes = 0, holidayMinutes = 0;

    if (direction === "IN" && !isDayOff) {
      beforeInMinutes = computeBeforeInOvertimeMinutes(nowISO, schedule);
    }
    if (direction === "OUT") {
      // ✅ FIX: kalau absen masuknya lewat manual (bukan face_verifications),
      // pakai check_in_time dari attendance_manual sebagai referensi jam masuk.
      const inTimestamp = todayIn?.created_at ?? (manualToday as any)?.check_in_time ?? null;
      if (isDayOff && inTimestamp) {
        holidayMinutes = computeHolidayOvertimeMinutes(inTimestamp, nowISO);
      } else if (!isDayOff) {
        afterOutMinutes = computeAfterOutOvertimeMinutes(nowISO, schedule);
      }
    }

    if (beforeInMinutes > 0 || afterOutMinutes > 0 || holidayMinutes > 0) {
      overtimeOptions = { beforeInMinutes, afterOutMinutes, holidayMinutes, sourceFaceVerificationId: inserted.id };
    }
  }

  return {
    ok: true, direction,
    message: direction === "IN" ? "Absen masuk berhasil" : "Absen pulang berhasil",
    overtimeOptions,
  };
}

function buildTodayWIBTimestamp(dateKey: string, time: { h: number; m: number }): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return new Date(`${dateKey}T${pad(time.h)}:${pad(time.m)}:00+07:00`).toISOString();
}

function toWIBTimeString(iso: string): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const wib = new Date(new Date(iso).getTime() + 7 * 3600_000);
  return `${pad(wib.getUTCHours())}:${pad(wib.getUTCMinutes())}:${pad(wib.getUTCSeconds())}`;
}

export async function createOvertimeDraft(
  supabaseAdmin: any,
  args: {
    userId: string; requestDate: string; direction: OvertimeDirection; minutes: number;
    actualStart: string; actualEnd: string; sourceFaceVerificationId: string; isHoliday: boolean;
  }
): Promise<{ id: string; minutes: number; direction: OvertimeDirection } | null> {
  // ✅ FIX: kolom `reason` di tabel overtime_requests itu NOT NULL, tapi
  // insert di sini sebelumnya TIDAK PERNAH mengisi field ini sama sekali.
  // Akibatnya SETIAP draft lembur otomatis (BEFORE_IN/AFTER_OUT/HOLIDAY)
  // selalu gagal disimpan dengan error:
  // "null value in column reason ... violates not-null constraint".
  // Ini akar masalah kenapa lembur tidak pernah kedeteksi walau absen
  // pulang sudah lewat berapa menit pun dari jadwal — bukan logikanya
  // yang salah, tapi insert-nya selalu gagal diam-diam.
  const AUTO_REASON_BY_DIRECTION: Record<OvertimeDirection, string> = {
    BEFORE_IN: "Diajukan karyawan — lembur awal (sebelum jam masuk)",
    AFTER_OUT: "Diajukan karyawan — lembur akhir (sesudah jam pulang)",
    BOTH: "Diajukan karyawan — gabungan lembur awal & akhir",
    HOLIDAY: "Diajukan karyawan — lembur di hari libur",
    MANUAL: "Input manual admin",
  };

  const isLateForHoliday = args.direction === "HOLIDAY" && (() => {
    const wib = new Date(new Date(args.actualStart).getTime() + 7 * 3600_000);
    const totalMin = wib.getUTCHours() * 60 + wib.getUTCMinutes();
    return totalMin >= 8 * 60;
  })();

  const { data, error } = await supabaseAdmin
    .from("overtime_requests")
    .insert({
      user_id: args.userId,
      request_date: args.requestDate,
      direction: args.direction,
      reason: AUTO_REASON_BY_DIRECTION[args.direction],
      requested_start: toWIBTimeString(args.actualStart),
      status: "PENDING",
      duration_minutes: args.minutes,
      actual_start: args.actualStart,
      actual_end: args.actualEnd,
      is_holiday: args.isHoliday,
      is_late: args.direction === "HOLIDAY" ? isLateForHoliday : false, 
      source_face_verification_id: args.sourceFaceVerificationId,
    })
    .select("id").single();

  if (error) {
    console.error("[createOvertimeDraft] gagal membuat draft lembur:", error.message);
    return null;
  }
  return { id: data.id, minutes: args.minutes, direction: args.direction };
}