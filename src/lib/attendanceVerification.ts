// src/lib/attendanceVerification.ts
import {
  resolveShiftConfigFromDB,
  isAttendanceTimeForSchedule,
  calcAttendanceWeightFromSchedule,
  type DaySchedule,
} from "@/lib/auth";
import { resolveScheduleOverride, toAuthScheduleShape } from "@/lib/shiftSchedule";
import { isPKLRole } from "@/lib/permissions";
import {
  computeBeforeInOvertimeMinutes,
  computeAfterOutOvertimeMinutes,
  computeHolidayOvertimeMinutes,
  type OvertimeDirection,
} from "@/lib/overtimeEngine";

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
      overtime: { id: string; minutes: number; direction: OvertimeDirection } | null;
    };

export async function processAttendanceVerification(p: ProcessAttendanceParams): Promise<AttendanceOutcome> {
  const { supabaseAdmin, userId, userRole } = p;
  const nowISO = p.overrideNowISO ?? new Date().toISOString();
  const nowWIB = new Date(new Date(nowISO).getTime() + 7 * 3600_000);
  const todayDow = nowWIB.getUTCDay();
  const todayDate = nowWIB.toISOString().slice(0, 10);

  const [
    { data: todayIn },
    { data: todayOut },
    { data: weeklyOff },
    { data: specificOff },
    { data: dateWork },
    { data: monthlyOff },
  ] = await Promise.all([
    supabaseAdmin.from("face_verifications").select("id, created_at")
      .eq("user_id", userId).eq("status", "SUCCESS").eq("direction", "IN")
      .gte("created_at", `${todayDate}T00:00:00+07:00`).lte("created_at", `${todayDate}T23:59:59+07:00`)
      .maybeSingle(),
    supabaseAdmin.from("face_verifications").select("id, created_at")
      .eq("user_id", userId).eq("status", "SUCCESS").eq("direction", "OUT")
      .gte("created_at", `${todayDate}T00:00:00+07:00`).lte("created_at", `${todayDate}T23:59:59+07:00`)
      .maybeSingle(),
    supabaseAdmin.from("user_day_off").select("id").eq("user_id", userId).eq("day_of_week", todayDow).maybeSingle(),
    supabaseAdmin.from("user_date_off").select("id").eq("user_id", userId).eq("off_date", todayDate).maybeSingle(),
    supabaseAdmin.from("user_date_work").select("id").eq("user_id", userId).eq("work_date", todayDate).maybeSingle(),
    supabaseAdmin.from("user_monthly_off").select("id").eq("user_id", userId).eq("off_date", todayDate).maybeSingle(),
  ]);

  const isDayOff = Boolean(monthlyOff) || ((Boolean(weeklyOff) || Boolean(specificOff)) && !dateWork);

  const direction: "IN" | "OUT" | null = !todayIn ? "IN" : (!todayOut ? "OUT" : null);

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

  if (direction === "OUT" && !todayIn) {
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

  // ── Hitung lembur (poin 16: hanya karyawan non-PKL) ──────────────────────
  let overtimeResult: { id: string; minutes: number; direction: OvertimeDirection } | null = null;
  const eligibleForOvertime = !isPKLRole(userRole);

  if (eligibleForOvertime) {
    if (direction === "IN" && !isDayOff) {
      const minutes = computeBeforeInOvertimeMinutes(nowISO, schedule);
      if (minutes > 0) {
        overtimeResult = await createOvertimeDraft(supabaseAdmin, {
          userId, requestDate: todayDate, direction: "BEFORE_IN", minutes,
          actualStart: nowISO, actualEnd: buildTodayWIBTimestamp(todayDate, schedule.start),
          sourceFaceVerificationId: inserted.id, isHoliday: false,
        });
      }
    }
    if (direction === "OUT") {
      if (isDayOff && todayIn) {
        const minutes = computeHolidayOvertimeMinutes(todayIn.created_at, nowISO);
        if (minutes > 0) {
          overtimeResult = await createOvertimeDraft(supabaseAdmin, {
            userId, requestDate: todayDate, direction: "HOLIDAY", minutes,
            actualStart: todayIn.created_at, actualEnd: nowISO,
            sourceFaceVerificationId: inserted.id, isHoliday: true,
          });
        }
      } else if (!isDayOff) {
        const minutes = computeAfterOutOvertimeMinutes(nowISO, schedule);
        if (minutes > 0) {
          overtimeResult = await createOvertimeDraft(supabaseAdmin, {
            userId, requestDate: todayDate, direction: "AFTER_OUT", minutes,
            actualStart: buildTodayWIBTimestamp(todayDate, schedule.checkout), actualEnd: nowISO,
            sourceFaceVerificationId: inserted.id, isHoliday: false,
          });
        }
      }
    }
  }

  return {
    ok: true, direction,
    message: direction === "IN" ? "Absen masuk berhasil" : "Absen pulang berhasil",
    overtime: overtimeResult,
  };
}

function buildTodayWIBTimestamp(dateKey: string, time: { h: number; m: number }): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return new Date(`${dateKey}T${pad(time.h)}:${pad(time.m)}:00+07:00`).toISOString();
}

async function createOvertimeDraft(
  supabaseAdmin: any,
  args: {
    userId: string; requestDate: string; direction: OvertimeDirection; minutes: number;
    actualStart: string; actualEnd: string; sourceFaceVerificationId: string; isHoliday: boolean;
  }
): Promise<{ id: string; minutes: number; direction: OvertimeDirection } | null> {
  const { data, error } = await supabaseAdmin
    .from("overtime_requests")
    .insert({
      user_id: args.userId,
      request_date: args.requestDate,
      direction: args.direction,
      status: "PENDING",
      duration_minutes: args.minutes,
      actual_start: args.actualStart,
      actual_end: args.actualEnd,
      is_holiday: args.isHoliday,
      source_face_verification_id: args.sourceFaceVerificationId,
    })
    .select("id").single();

  if (error) {
    console.error("[createOvertimeDraft] gagal membuat draft lembur:", error.message);
    return null;
  }
  return { id: data.id, minutes: args.minutes, direction: args.direction };
}