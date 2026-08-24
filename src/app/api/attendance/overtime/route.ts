import { NextResponse } from "next/server";
import { getCurrentUser, resolveShiftConfigFromDB } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { isPKLRole } from "@/lib/permissions";
import {
  isValidOvertimeCategory,
  computeOvertimeNominal,
  countEffectiveWorkdaysInMonth,
  computeBeforeInOvertimeMinutes,
  computeAfterOutOvertimeMinutes,
  computeHolidayOvertimeMinutes,
  computeCombinedOvertimeMinutes,
  type OvertimeDirection,
} from "@/lib/overtimeEngine";
import { resolveScheduleOverride, toAuthScheduleShape } from "@/lib/shiftSchedule";
import { createOvertimeDraft } from "@/lib/attendanceVerification";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ✅ NEW — pergantian "hari absensi" jam 04:00 WIB (lihat penjelasan sama
// di api/attendance/route.ts).
function toAttendanceDateKey(iso: string): string {
  return new Date(new Date(iso).getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// ─── CONSTANTS ─────────────────────────────────────────────────────────────
const FULL_ACCESS = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];
const DIVISION_HEAD_MAP: Record<string, string[]> = {
  KEPALA_SALES: [
    "CREW_SALES", "SOTECH", "PENGANTARAN",
    "KEPALA_SALES", "PKL_SALES", "PKL", "PKL_PENGANTARAN",
  ],
  KEPALA_MARKETING: [
    "MARKETING", "KONTEN",
    "KEPALA_MARKETING", "PKL_MARKETING", "PKL_KONTEN", "PKL",
  ],
  KEPALA_TEKNISI: [
    "TEKNISI", "PENGELOLA_BARANG",
    "CUSTOMER_SERVICE", "PKL_CUSTOMER_SERVICE",
    "KEPALA_TEKNISI", "PKL_TEKNISI", "PKL",
  ],
  KEPALA_ONPOINT: [
    "ONPOINT",
    "KEPALA_ONPOINT", "PKL_ONPOINT", "PKL",
  ],
  KEPALA_PENYEDIA_BARANG: [
    "PENYEDIA_BARANG", "PENGELOLA_BARANG",
    "KEPALA_PENYEDIA_BARANG", "PKL_PENYEDIA_BARANG", "PKL",
  ],
  KEPALA_SOTECH: [
    "SOTECH",
    "KEPALA_SOTECH", "PKL_SOTECH", "PKL",
  ],
  KEPALA_PENGELOLA_BARANG: [
    "PENGELOLA_BARANG",
    "KEPALA_PENGELOLA_BARANG", "PKL_PENGELOLA_BARANG", "PKL",
  ],
};

const PAY_VIEW_ROLES = [
  "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
  "KEPALA_SALES", "KEPALA_MARKETING", "KEPALA_TEKNISI",
  "KEPALA_PENYEDIA_BARANG", "KEPALA_ONPOINT", "KEPALA_SOTECH",
  "KEPALA_PENGELOLA_BARANG",
];

function isHolidayOvertimeLate(overtime: { is_late?: boolean | null; requested_start?: string | null }): boolean {
  if (overtime.is_late === true) return true;
  if (overtime.is_late === false) return false;
  const requestedStart = overtime.requested_start;
  if (!requestedStart) return false;
  const [h, m] = String(requestedStart).split(":").map(Number);
  if (Number.isNaN(h)) return false;
  return h * 60 + (m || 0) >= 8 * 60;
}

const HOLIDAY_OVERTIME_PAY = { LATE: 50000, ON_TIME: 100000 } as const;

// ─── HELPER: apakah approver (single role) bisa approve target ─────────────
function canApprove(
  approverRole: string,
  targetRole: string,
  approverId?: string,
  targetUserId?: string
): boolean {
  // Tidak boleh approve diri sendiri (kecuali admin)
  if (
    approverId && targetUserId &&
    approverId === targetUserId &&
    !FULL_ACCESS.includes(approverRole)
  ) return false;
  if (FULL_ACCESS.includes(approverRole)) return true;
  return DIVISION_HEAD_MAP[approverRole]?.includes(targetRole) ?? false;
}

// ─── HELPER: apakah user (multi-role) bisa approve target ─────────────────
function canApproveMulti(
  approverRoles: string[],
  targetRole: string,
  approverId?: string,
  targetUserId?: string
): boolean {
  return approverRoles.some(r => canApprove(r, targetRole, approverId, targetUserId));
}

// ─── GET ───────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const year = searchParams.get("year") ?? new Date().getFullYear().toString();
    const month = searchParams.get("month") ?? String(new Date().getMonth() + 1);
    const status = searchParams.get("status");

    const paddedMonth = String(month).padStart(2, "0");
    const startDate = `${year}-${paddedMonth}-01`;
    const lastDay = new Date(Number(year), Number(month), 0).getDate();
    const endDate = `${year}-${paddedMonth}-${String(lastDay).padStart(2, "0")}`;

    // ── Legacy correction: COMPLETED tanpa foto → NEED_PROOF ──────────────
    await supabase
      .from("overtime_requests")
      .update({ status: "NEED_PROOF", updated_at: new Date().toISOString() })
      .eq("status", "COMPLETED")
      .is("proof_photo_url", null)
      .abortSignal(AbortSignal.timeout(8000));

    // ── Server-side auto-complete overtime yang melewati scheduled_end ─────
    const now = new Date().toISOString();
    const { data: expiredOvertimes } = await supabase
      .from("overtime_requests")
      .select("id, user_id, actual_start, scheduled_end, rate_per_hour")
      .eq("status", "ONGOING")
      .not("scheduled_end", "is", null)
      .lt("scheduled_end", now)
      .abortSignal(AbortSignal.timeout(8000));

    if (expiredOvertimes && expiredOvertimes.length > 0) {
      for (const expired of expiredOvertimes) {
        const actualEnd = expired.scheduled_end;
        const startMs = expired.actual_start ? new Date(expired.actual_start).getTime() : NaN;
        const endMs = new Date(actualEnd).getTime();
       const durationMins = Number.isNaN(startMs) ? 0 : Math.round((endMs - startMs) / 60000);
        const ratePerHour = expired.rate_per_hour ?? 0;
        // ✅ FIX: lembur dihitung proporsional per menit, bukan dibulatkan
        // ke bawah per jam penuh — sebelumnya 1j45m cuma dibayar 1 jam.
        const calculatedPay = Math.round((durationMins / 60) * ratePerHour);

        await supabase
          .from("overtime_requests")
          .update({
            status: "NEED_PROOF",
            actual_end: actualEnd,
            completed_at: actualEnd,
            duration_minutes: durationMins,
            total_pay: calculatedPay,
            auto_completed: true,
            updated_at: now,
          })
          .eq("id", expired.id)
          .abortSignal(AbortSignal.timeout(8000));

        console.log(`[SERVER AUTO-COMPLETE] ${expired.id} → NEED_PROOF, actual_end: ${actualEnd}`);
      }
    }

    // ── Build query ────────────────────────────────────────────────────────
    let q = supabase
      .from("overtime_requests")
      .select(`
        id, user_id, request_date, reason, requested_start,
        status, approved_by, approved_at,
        scheduled_start, scheduled_end, actual_start, rate_per_hour,
        rejection_note, actual_end, proof_photo_url,
        completed_at, duration_minutes, total_pay,
        work_description, auto_completed,
        is_holiday, is_late,
        category, direction, audit_status, audited_by, audited_at,
        base_salary_snapshot, effective_workdays_snapshot, per_minute_rate,
        created_at, updated_at
      `)
      .gte("request_date", startDate)
      .lte("request_date", endDate)
      .order("created_at", { ascending: false });

    if (status) {
      const statusList = status.split(",").map(s => s.trim()).filter(Boolean);
      q = statusList.length > 1
        ? q.in("status", statusList)
        : q.eq("status", statusList[0]);
    }

    // ── Visibility filter berdasarkan role ─────────────────────────────────
    const userRoles: string[] = Array.isArray(user.roles) && user.roles.length > 0
      ? user.roles
      : [user.role];

    const isFullAccess = userRoles.some(r => FULL_ACCESS.includes(r));

    // Kumpulkan semua subordinate roles dari semua kepala role yang dimiliki user
    const allSubordinateRoles = new Set<string>();
    for (const r of userRoles) {
      const subs = DIVISION_HEAD_MAP[r];
      if (subs) subs.forEach(s => allSubordinateRoles.add(s));
    }
    const hasDivisionHeadRole = allSubordinateRoles.size > 0;

    if (isFullAccess) {
      // Admin/Programmer/Asisten CEO → lihat semua tanpa filter
    } else if (hasDivisionHeadRole) {
      // Kepala divisi → lihat dirinya sendiri + semua bawahannya
      const subordinateRoles = Array.from(allSubordinateRoles);

      const { data: subordinateUsers } = await supabase
        .from("users")
        .select("id")
        .in("role", subordinateRoles);

      const subordinateIds = (subordinateUsers ?? []).map((u: any) => u.id as string);

      // Selalu sertakan diri sendiri
      if (!subordinateIds.includes(user.id)) subordinateIds.push(user.id);

      q = subordinateIds.length > 0
        ? q.in("user_id", subordinateIds)
        : q.eq("user_id", user.id);
    } else {
      // Role biasa (non-kepala, non-admin) → hanya lihat lemburan sendiri
      q = q.eq("user_id", user.id);
    }

    const { data: overtimes, error } = await q.abortSignal(AbortSignal.timeout(8000));
    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    if (!overtimes || overtimes.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // ── Enrich dengan data user ────────────────────────────────────────────
    const userIds = [
      ...new Set([
        ...overtimes.map((o: any) => o.user_id),
        ...overtimes.filter((o: any) => o.approved_by).map((o: any) => o.approved_by),
        ...overtimes.filter((o: any) => o.audited_by).map((o: any) => o.audited_by), // ✅ NEW
      ]),
    ].filter(Boolean);

    const { data: usersData } = await supabase
      .from("users")
      .select("id, name, role, shift")
      .in("id", userIds);

    const usersMap: Record<string, any> = {};
    (usersData ?? []).forEach((u: any) => { usersMap[u.id] = u; });

    // ✅ FIX: PKL sekarang punya sistem lemburan sendiri (lihat tab Gaji PKL
    // & Input Manual) — filter yang dulu menyaring keluar data PKL dihapus.
    const result = overtimes.map((o: any) => ({
      ...o,
      users: usersMap[o.user_id] ?? null,
      approver: o.approved_by ? usersMap[o.approved_by] ?? null : null,
      auditor: o.audited_by ? usersMap[o.audited_by] ?? null : null, // ✅ NEW
    }));

    // ── Strip bayaran untuk role yang tidak berwenang ──────────────────────
    const canSeePay = userRoles.some(r => PAY_VIEW_ROLES.includes(r));
    const finalResult = canSeePay
      ? result
      : result.map(({ rate_per_hour, total_pay, per_minute_rate, base_salary_snapshot, ...rest }: any) => ({
        ...rest,
        rate_per_hour: null,
        total_pay: null,
        per_minute_rate: null,
        base_salary_snapshot: null,
      }));

    return NextResponse.json({ success: true, data: finalResult });
  } catch (err: any) {
    console.error("[GET Error]", err);
    return NextResponse.json({ success: false, message: err?.message }, { status: 500 });
  }
}

// ─── POST ──────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const body = await request.json();
    const {
      request_date,
      reason,
      requested_start,
      work_description: reqWorkDesc,
      is_manual,
      is_self_declare, // ✅ NEW — karyawan mengajukan lemburnya sendiri
      declare_direction, // ✅ NEW — "BEFORE_IN" | "AFTER_OUT" | "BOTH" | "HOLIDAY"
      target_user_id,
      actual_start_time,
      actual_end_time,
      work_description,
      proof_photo_url,
      rate_per_hour,
      total_pay: manualTotalPay,
      is_holiday = false,
    } = body;

    if (is_self_declare === true) {
      const validDirections: OvertimeDirection[] = ["BEFORE_IN", "AFTER_OUT", "BOTH", "HOLIDAY"];
      if (!validDirections.includes(declare_direction)) {
        return NextResponse.json({ success: false, message: "Kategori lembur tidak valid." }, { status: 400 });
      }

     // ✅ FIX: "hari ini" untuk pengajuan lembur ikut pergantian hari
      // absensi jam 04:00 WIB (bukan jam 00:00).
      const todayWIBDate = toAttendanceDateKey(new Date().toISOString());

      const targetDate: string = (request_date && String(request_date).trim()) || todayWIBDate;
      if (targetDate > todayWIBDate) {
        return NextResponse.json({ success: false, message: "Tidak bisa mengajukan lembur untuk tanggal yang belum terjadi." }, { status: 400 });
      }

      const todayDate = targetDate;
      const todayDow = new Date(todayDate + "T12:00:00").getDay();

      // Cegah pengajuan dobel untuk tanggal + arah yang sama
      const { data: existingReq } = await supabase
        .from("overtime_requests")
        .select("id")
        .eq("user_id", user.id)
        .eq("request_date", todayDate)
        .eq("direction", declare_direction)
        .not("status", "in", "(REJECTED,CANCELLED)")
        .maybeSingle();
      if (existingReq) {
        return NextResponse.json({ success: false, message: "Kamu sudah pernah mengajukan lembur ini untuk hari ini." }, { status: 400 });
      }

      // Ambil absen masuk & pulang HARI INI milik user sendiri — jangan pernah
      // percaya menit dari client, selalu hitung ulang dari data absen asli.
      // ✅ FIX: rentang absen "hari ini" sekarang jam 04:00 → 04:00 hari
      // berikutnya (bukan 00:00–23:59).
      const todayRangeStart = `${todayDate}T04:00:00+07:00`;
      const todayRangeEnd = `${addDaysToDateStr(todayDate, 1)}T03:59:59+07:00`;
      const [{ data: todayIn }, { data: todayOut }, { data: weeklyOff }, { data: specificOff }, { data: dateWork }, { data: monthlyOff }] = await Promise.all([
        supabase.from("face_verifications").select("id, created_at").eq("user_id", user.id).eq("status", "SUCCESS").eq("direction", "IN")
          .gte("created_at", todayRangeStart).lte("created_at", todayRangeEnd)
          .order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("face_verifications").select("id, created_at").eq("user_id", user.id).eq("status", "SUCCESS").eq("direction", "OUT")
          .gte("created_at", todayRangeStart).lte("created_at", todayRangeEnd)
          .order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("user_day_off").select("id").eq("user_id", user.id).eq("day_of_week", todayDow).maybeSingle(),
        supabase.from("user_date_off").select("id").eq("user_id", user.id).eq("off_date", todayDate).maybeSingle(),
        supabase.from("user_date_work").select("id").eq("user_id", user.id).eq("work_date", todayDate).maybeSingle(),
        supabase.from("user_monthly_off").select("id").eq("user_id", user.id).eq("off_date", todayDate).maybeSingle(),
      ]);

      let effectiveTodayIn: { id: string | null; created_at: string } | null = todayIn;

      if (!effectiveTodayIn) {
        const { data: manualToday, error: manualError } = await supabase
          .from("attendance_manual")
          .select("check_in_time")
          .eq("user_id", user.id)
          .eq("attendance_date", todayDate)
          .in("status", ["PRESENT", "LATE"])
          .maybeSingle();

        if (manualError) {
          console.error("[POST /api/attendance/overtime] Query attendance_manual gagal:", manualError.message);
        }

        if (manualToday?.check_in_time) {
          effectiveTodayIn = { id: null, created_at: manualToday.check_in_time };
        }
      }

      if (!effectiveTodayIn) {
        return NextResponse.json({ success: false, message: "Belum ada absen masuk hari ini." }, { status: 400 });
      }
      const isDayOffToday = Boolean(monthlyOff) || ((Boolean(weeklyOff) || Boolean(specificOff)) && !dateWork);

      const baseSchedule = await resolveShiftConfigFromDB(user.id, supabase);
      const scheduleOverride = await resolveScheduleOverride(supabase, user.id, todayDate);
      const overrideShape = scheduleOverride ? toAuthScheduleShape(scheduleOverride) : null;

      const schedule = overrideShape
        ? { ...baseSchedule, ...overrideShape, checkout: overrideShape.checkout ?? baseSchedule.checkout }
        : baseSchedule;

      if (!schedule?.lateFrom || !schedule?.checkout) {
        console.error("[POST /api/attendance/overtime] Jadwal shift tidak lengkap:", { userId: user.id, baseSchedule, overrideShape });
        return NextResponse.json({ success: false, message: "Jadwal shift kamu belum lengkap — hubungi admin untuk mengatur jadwal shift dulu." }, { status: 400 });
      }

      const pad = (n: number) => String(n).padStart(2, "0");
      const buildTS = (time: { h: number; m: number }) => new Date(`${todayDate}T${pad(time.h)}:${pad(time.m)}:00+07:00`).toISOString();

      let minutes = 0, actualStart = "", actualEnd = "";

      if (declare_direction === "HOLIDAY") {
        if (!isDayOffToday) return NextResponse.json({ success: false, message: "Hari ini bukan hari libur kamu." }, { status: 400 });
        if (!todayOut) return NextResponse.json({ success: false, message: "Belum ada absen pulang hari ini." }, { status: 400 });
        minutes = computeHolidayOvertimeMinutes(effectiveTodayIn.created_at, todayOut.created_at);
        actualStart = effectiveTodayIn.created_at; actualEnd = todayOut.created_at;
      } else {
        if (isDayOffToday) return NextResponse.json({ success: false, message: "Hari ini hari libur — ajukan sebagai kategori Hari Libur." }, { status: 400 });
        const beforeIn = computeBeforeInOvertimeMinutes(effectiveTodayIn.created_at, schedule);
        const afterOut = todayOut ? computeAfterOutOvertimeMinutes(todayOut.created_at, schedule) : 0;

        if (declare_direction === "BEFORE_IN") {
          minutes = beforeIn;
          actualStart = effectiveTodayIn.created_at; actualEnd = buildTS(schedule.lateFrom);
        } else if (declare_direction === "AFTER_OUT") {
          if (!todayOut) return NextResponse.json({ success: false, message: "Belum ada absen pulang hari ini." }, { status: 400 });
          minutes = afterOut;
          actualStart = buildTS(schedule.checkout); actualEnd = todayOut.created_at;
        } else if (declare_direction === "BOTH") {
          if (!todayOut) return NextResponse.json({ success: false, message: "Belum ada absen pulang hari ini." }, { status: 400 });
          minutes = computeCombinedOvertimeMinutes(beforeIn, afterOut);
          actualStart = effectiveTodayIn.created_at; actualEnd = todayOut.created_at;
        }
      }

      if (minutes <= 0) {
        return NextResponse.json({ success: false, message: "Tidak ada potensi lembur untuk kategori ini." }, { status: 400 });
      }

      const created = await createOvertimeDraft(supabase, {
        userId: user.id, requestDate: todayDate, direction: declare_direction, minutes,
        actualStart, actualEnd,
        sourceFaceVerificationId: todayOut?.id ?? todayIn?.id ?? null,
        isHoliday: declare_direction === "HOLIDAY",
      });
      
      if (!created) {
        return NextResponse.json({ success: false, message: "Gagal menyimpan pengajuan lembur." }, { status: 500 });
      }

      return NextResponse.json({ success: true, data: created });
    }

    if (is_manual === true) {
      const userRoles: string[] = Array.isArray(user.roles) && user.roles.length > 0
        ? user.roles
        : [user.role];
      const isFullAccessUser = userRoles.some(r => FULL_ACCESS.includes(r));

      // Kumpulkan semua subordinate roles yang boleh diinput manual
      const allAllowedRoles = new Set<string>();
      for (const r of userRoles) {
        const subs = DIVISION_HEAD_MAP[r];
        if (subs) subs.forEach(s => allAllowedRoles.add(s));
      }

      const isAllowedManual = isFullAccessUser || allAllowedRoles.size > 0;
      if (!isAllowedManual) {
        return NextResponse.json(
          { success: false, message: "Tidak berwenang input lembur manual" },
          { status: 403 }
        );
      }

      // Kepala divisi hanya boleh input untuk bawahannya
      if (!isFullAccessUser) {
        const allowedRoles = Array.from(allAllowedRoles);
        const { data: targetUserCheck } = await supabase
          .from("users")
          .select("role")
          .eq("id", target_user_id)
          .single();

        if (!targetUserCheck || !allowedRoles.includes(targetUserCheck.role)) {
          return NextResponse.json(
            { success: false, message: "Kamu hanya bisa input lembur untuk bawahanmu" },
            { status: 403 }
          );
        }
      }

      if (!target_user_id || !request_date || !actual_start_time || !actual_end_time) {
        return NextResponse.json(
          { success: false, message: "target_user_id, request_date, actual_start_time, actual_end_time wajib" },
          { status: 400 }
        );
      }

      // // ✅ NEW — poin 16: lembur cuma untuk karyawan non-PKL
      // const { data: targetUserForOT } = await supabase.from("users").select("role").eq("id", target_user_id).maybeSingle();
      // if (targetUserForOT && isPKLRole(targetUserForOT.role)) {
      //   return NextResponse.json({ success: false, message: "PKL tidak memiliki sistem lemburan." }, { status: 400 });
      // }

      const { category: manualCategory } = body;
      if (manualCategory && !isValidOvertimeCategory(manualCategory)) {
        return NextResponse.json({ success: false, message: `Kategori tidak valid: ${manualCategory}` }, { status: 400 });
      }

      const fmt = (t: string) => (t.length === 5 ? `${t}:00` : t);
      const actualStart = `${request_date}T${fmt(actual_start_time)}+07:00`;

      let resolvedEndDate = body.actual_end_date || request_date;
      let actualEnd = `${resolvedEndDate}T${fmt(actual_end_time)}+07:00`;

      if (!body.actual_end_date && new Date(actualEnd).getTime() <= new Date(actualStart).getTime()) {
        const nextDay = new Date(`${request_date}T00:00:00`);
        nextDay.setDate(nextDay.getDate() + 1);
        resolvedEndDate = nextDay.toISOString().slice(0, 10);
        actualEnd = `${resolvedEndDate}T${fmt(actual_end_time)}+07:00`;
      }

      if (new Date(actualEnd).getTime() <= new Date(actualStart).getTime()) {
        return NextResponse.json(
          { success: false, message: "Jam selesai harus lebih besar dari jam mulai" },
          { status: 400 }
        );
      }

     const durationMins = Math.round(
        (new Date(actualEnd).getTime() - new Date(actualStart).getTime()) / 60000
      );

      let finalRate: number;
      let totalPay: number;

      const hasManualPay =
        manualTotalPay !== undefined &&
        manualTotalPay !== null &&
        Number(manualTotalPay) > 0;

      if (hasManualPay) {
        finalRate = rate_per_hour ? Math.round(Number(rate_per_hour)) : 0;
        totalPay = Math.round(Number(manualTotalPay));
      } else if (is_holiday === true) {
        finalRate = 0;
        totalPay = 0;
      } else {
        finalRate = rate_per_hour ?? 0;
        if (!finalRate) {
          const { data: targetUserData } = await supabase
            .from("users")
            .select("role")
            .eq("id", target_user_id)
            .single();

          if (targetUserData?.role) {
            const { data: rateData } = await supabase
              .from("overtime_rates")
              .select("rate_per_hour")
              .eq("role", targetUserData.role)
              .maybeSingle();
          finalRate = rateData?.rate_per_hour ?? 0;
          }
        }
        // ✅ FIX: proporsional per menit, bukan dibulatkan ke bawah per jam.
        totalPay = Math.round((durationMins / 60) * finalRate);
      }

      let manualIsLate = false;
      if (is_holiday === true) {
        const [lh, lm] = String(actual_start_time).split(":").map(Number);
        manualIsLate = !Number.isNaN(lh) && (lh * 60 + (lm || 0)) >= 8 * 60;
      }

      const insertStatus = proof_photo_url ? "COMPLETED" : "NEED_PROOF";

      const { data, error } = await supabase
        .from("overtime_requests")
        .insert({
          user_id: target_user_id,
          request_date,
          reason: reason?.trim() || "Input manual oleh admin",
          requested_start: actual_start_time,
          status: insertStatus,
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          actual_start: actualStart,
          actual_end: actualEnd,
          direction: "MANUAL", // ✅ NEW
          category: manualCategory ?? null, // ✅ NEW
          work_description: work_description?.trim() || null,
          proof_photo_url: proof_photo_url || null,
          duration_minutes: durationMins,
          completed_at: proof_photo_url ? new Date().toISOString() : null,
          auto_completed: false,
          is_holiday: is_holiday === true,
          is_late: manualIsLate,
          // ✅ rate_per_hour/total_pay TIDAK diisi manual lagi — nominal
          // selalu dihitung otomatis lewat action AUDIT (poin 4).
        })
        .select()
        .single();

      if (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, data });
    }

    // ── NORMAL REQUEST — SUDAH TIDAK DIPAKAI (poin 2) ───────────────────────
    // Lembur sekarang murni otomatis dari absen masuk lebih awal / pulang
    // lebih larut (lihat lib/attendanceVerification.ts). Karyawan tidak lagi
    // mengajukan lembur manual lewat form ini.
    return NextResponse.json({
      success: false,
      message: "Pengajuan lembur manual sudah tidak digunakan. Lembur otomatis terdeteksi saat kamu absen masuk lebih awal atau absen pulang lebih larut dari jadwal.",
    }, { status: 410 });

  } catch (err: any) {
    console.error("[POST /api/attendance/overtime Error]", err);
    return NextResponse.json({ success: false, message: err?.message || "Terjadi kesalahan server." }, { status: 500 });
  }
}

// ─── PATCH ─────────────────────────────────────────────────────────────────
export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const body = await request.json();
    const {
      id,
      action,
      scheduled_start,
      scheduled_end,
      rate_per_hour,
      rejection_note,
      proof_photo_url,
      total_pay,
      auto_completed,
    } = body;

    if (!id || !action) {
      return NextResponse.json({ success: false, message: "id dan action wajib" }, { status: 400 });
    }

    const { data: overtime, error: findError } = await supabase
      .from("overtime_requests")
      .select("*")
      .eq("id", id)
      .single();

    if (findError || !overtime) {
      return NextResponse.json({ success: false, message: "Request tidak ditemukan" }, { status: 404 });
    }

    const { data: targetUser } = await supabase
      .from("users")
      .select("role")
      .eq("id", overtime.user_id)
      .single();

    // Multi-role support untuk approver
    const userRoles: string[] = Array.isArray(user.roles) && user.roles.length > 0
      ? user.roles
      : [user.role];

    console.log("[PATCH] Action:", action, "User:", user.id, "UserRoles:", userRoles);
    console.log("[PATCH] Overtime user_id:", overtime.user_id, "Status:", overtime.status);

    // ── SUBMIT_DETAIL — karyawan (pemilik) isi kategori + keterangan ───────
    // dipanggil otomatis dari halaman face-verify setelah lembur kedeteksi
    if (action === "SUBMIT_DETAIL") {
      const isOwner = overtime.user_id === user.id;
      const isFullAccessUser = userRoles.some(r => FULL_ACCESS.includes(r));
      if (!isOwner && !isFullAccessUser) {
        return NextResponse.json({ success: false, message: "Hanya pemilik lembur atau Admin yang bisa mengisi detail ini." }, { status: 403 });
      }
      if (overtime.status !== "PENDING") {
        return NextResponse.json({ success: false, message: "Detail lembur hanya bisa diisi selama masih berstatus PENDING (belum di-ACC kepala divisi)." }, { status: 400 });
      }
      const { category: cat, work_description: desc } = body;
      if (!cat || !isValidOvertimeCategory(cat)) {
        return NextResponse.json({
          success: false,
          message: "Kategori wajib salah satu dari: Permintaan Atasan, Pengajuan yang di ACC, atau Mendesak.",
        }, { status: 400 });
      }
      if (!desc?.trim()) {
        return NextResponse.json({ success: false, message: "Keterangan lembur wajib diisi." }, { status: 400 });
      }
      const { data, error } = await supabase.from("overtime_requests").update({
        category: cat, work_description: desc.trim(), updated_at: new Date().toISOString(),
      }).eq("id", id).select().single();
      if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data });
    }

    // ── APPROVE (= ACC kepala divisi) ────────────────────────────────────────
    // ✅ REWORK TOTAL: tidak ada lagi scheduled_start/scheduled_end manual —
    // waktu lembur sudah otomatis dari absen In/Out. ACC cuma perlu
    // memastikan kategori & keterangan sudah lengkap, lalu menyetujui.
    if (action === "APPROVE" || action === "ACC") {
      const approved = canApproveMulti(userRoles, targetUser?.role ?? "", user.id, overtime.user_id);
      if (!approved) {
        return NextResponse.json({ success: false, message: "Kamu tidak berwenang meng-ACC lembur ini — hanya kepala divisi terkait atau Admin yang bisa." }, { status: 403 });
      }
      if (overtime.status !== "PENDING") {
        return NextResponse.json({ success: false, message: `Lembur ini berstatus ${overtime.status}, hanya lembur berstatus PENDING yang bisa di-ACC.` }, { status: 400 });
      }

      const { category: bodyCategory, work_description: bodyDesc } = body;
      const updatePayload: Record<string, any> = {
        status: "NEED_PROOF", // langsung minta bukti foto — sesuai poin 6
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const finalCategory = bodyCategory ?? overtime.category;
      if (!finalCategory || !isValidOvertimeCategory(finalCategory)) {
        return NextResponse.json({ success: false, message: "Kategori lembur wajib diisi (Permintaan Atasan / Pengajuan yang di ACC / Mendesak) sebelum bisa di-ACC." }, { status: 400 });
      }
      if (bodyCategory) updatePayload.category = bodyCategory;

      const finalDesc = bodyDesc !== undefined ? bodyDesc?.trim() : overtime.work_description;
      if (!finalDesc) {
        return NextResponse.json({ success: false, message: "Keterangan lembur wajib diisi sebelum bisa di-ACC." }, { status: 400 });
      }
      if (bodyDesc !== undefined) updatePayload.work_description = finalDesc || null;

      const { data, error } = await supabase.from("overtime_requests").update(updatePayload).eq("id", id).select().single();
      if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data });
    }

    // ── ATTACH_PROOF — upload bukti foto (poin 6, wajib sebelum audit) ─────
    if (action === "ATTACH_PROOF") {
      const isOwner = overtime.user_id === user.id;
      const isFullAccessUser = userRoles.some(r => FULL_ACCESS.includes(r));
      if (!isOwner && !isFullAccessUser) {
        return NextResponse.json({ success: false, message: "Hanya pemilik lembur atau Admin yang bisa upload bukti." }, { status: 403 });
      }
      if (overtime.status !== "NEED_PROOF") {
        return NextResponse.json({
          success: false,
          message: overtime.status === "PENDING"
            ? "Lembur ini belum di-ACC oleh kepala divisi — belum bisa upload bukti foto."
            : `Status lembur saat ini (${overtime.status}) tidak memerlukan/mengizinkan upload bukti lagi.`,
        }, { status: 400 });
      }
      const { proof_photo_url: proofUrl } = body;
      if (!proofUrl) {
        return NextResponse.json({ success: false, message: "proof_photo_url wajib diisi — upload dulu lewat /api/attendance/overtime/upload." }, { status: 400 });
      }
      const { data, error } = await supabase.from("overtime_requests").update({
        proof_photo_url: proofUrl, status: "COMPLETED",
        completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", id).select().single();
      if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data });
    }

    // ── AUDIT — Admin menghitung & mengunci nominal lemburan (poin 3, 4) ───
    if (action === "AUDIT") {
      const isFullAccessUser = userRoles.some(r => FULL_ACCESS.includes(r));
      if (!isFullAccessUser) {
        return NextResponse.json({ success: false, message: "Hanya Admin/Programmer/Asisten CEO yang boleh melakukan Audit lembur." }, { status: 403 });
      }
      if (overtime.audit_status === "AUDITED") {
        return NextResponse.json({ success: false, message: "Lembur ini sudah pernah diaudit sebelumnya." }, { status: 400 });
      }

      const { decision, note: auditNote } = body as { decision?: "APPROVE" | "REJECT"; note?: string };

      if (decision === "REJECT") {
        const { data, error } = await supabase.from("overtime_requests").update({
          audit_status: "REJECTED", audited_by: user.id, audited_at: new Date().toISOString(),
          rejection_note: auditNote ?? overtime.rejection_note ?? null,
          updated_at: new Date().toISOString(),
        }).eq("id", id).select().single();
        if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        return NextResponse.json({ success: true, data });
      }

      if (overtime.status !== "COMPLETED") {
        return NextResponse.json({
          success: false,
          message: overtime.status === "NEED_PROOF"
            ? "Karyawan belum upload foto bukti lembur — tidak bisa diaudit dulu."
            : overtime.status === "PENDING"
              ? "Lembur ini belum di-ACC oleh kepala divisi — tidak bisa diaudit."
              : `Status lembur saat ini (${overtime.status}) tidak bisa diaudit.`,
        }, { status: 400 });
      }

      if (overtime.is_holiday === true) {
        const late = isHolidayOvertimeLate(overtime);
        const holidayPay = late ? HOLIDAY_OVERTIME_PAY.LATE : HOLIDAY_OVERTIME_PAY.ON_TIME;

        const { data, error } = await supabase.from("overtime_requests").update({
          audit_status: "AUDITED", audited_by: user.id, audited_at: new Date().toISOString(),
          total_pay: holidayPay,
          rate_per_hour: null,
          per_minute_rate: null,
          base_salary_snapshot: null,
          effective_workdays_snapshot: null,
          is_late: late,
          updated_at: new Date().toISOString(),
        }).eq("id", id).select().single();

        if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        return NextResponse.json({ success: true, data });
      }

      const [yearStr, monthStr] = overtime.request_date.split("-");
      const year = parseInt(yearStr, 10);
      const month0 = parseInt(monthStr, 10) - 1;
      const firstDay = `${year}-${String(month0 + 1).padStart(2, "0")}-01`;
      const lastDay = `${year}-${String(month0 + 1).padStart(2, "0")}-${String(new Date(year, month0 + 1, 0).getDate()).padStart(2, "0")}`;

      const [{ data: salaryRow }, { data: weeklyOffs }, { data: monthlyOffs }, { data: dateOffs }, { data: dateWorks }] = await Promise.all([
        supabase.from("user_salary").select("salary_type, base_salary").eq("user_id", overtime.user_id).maybeSingle(),
        supabase.from("user_day_off").select("day_of_week").eq("user_id", overtime.user_id),
        supabase.from("user_monthly_off").select("off_date").eq("user_id", overtime.user_id).eq("year", year).eq("month", month0 + 1),
        supabase.from("user_date_off").select("off_date").eq("user_id", overtime.user_id).gte("off_date", firstDay).lte("off_date", lastDay),
        supabase.from("user_date_work").select("work_date").eq("user_id", overtime.user_id).gte("work_date", firstDay).lte("work_date", lastDay),
      ]);

      if (!salaryRow) {
        return NextResponse.json({
          success: false,
          message: "Karyawan ini belum punya data gaji (menu Rekap Gaji) — atur gaji dulu sebelum audit lembur.",
        }, { status: 400 });
      }

      const weeklyOffDows = new Set<number>((weeklyOffs ?? []).map((r: any) => r.day_of_week));
      const offDates = new Set<string>([
        ...(monthlyOffs ?? []).map((r: any) => r.off_date),
        ...(dateOffs ?? []).map((r: any) => r.off_date),
      ]);
      const workOverrideDates = new Set<string>((dateWorks ?? []).map((r: any) => r.work_date));
      const effectiveWorkdays = countEffectiveWorkdaysInMonth(year, month0, weeklyOffDows, offDates, workOverrideDates);

      const { nominal, perMinuteRate, eligible } = computeOvertimeNominal({
        baseSalary: salaryRow.base_salary,
        effectiveWorkdays,
        overtimeMinutes: overtime.duration_minutes ?? 0,
        salaryType: salaryRow.salary_type,
      });

      const { data, error } = await supabase.from("overtime_requests").update({
        audit_status: "AUDITED", audited_by: user.id, audited_at: new Date().toISOString(),
        base_salary_snapshot: salaryRow.base_salary,
        effective_workdays_snapshot: effectiveWorkdays,
        per_minute_rate: perMinuteRate,
        total_pay: nominal,
        updated_at: new Date().toISOString(),
      }).eq("id", id).select().single();

      if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

      return NextResponse.json({
        success: true, data,
        warning: !eligible ? "Karyawan ini bergaji FLAT (Tetap) — sesuai kebijakan, nominal lemburan otomatis Rp0." : undefined,
      });
    }

    // ── Action lama yang sudah tidak dipakai di sistem baru ─────────────────
    if (action === "COMPLETE" || action === "SET_PAY") {
      return NextResponse.json({
        success: false,
        message: `Action "${action}" sudah tidak digunakan di sistem lembur baru. Gunakan ATTACH_PROOF (upload bukti) dan AUDIT (hitung nominal oleh Admin).`,
      }, { status: 410 });
    }

    // ── REJECT ─────────────────────────────────────────────────────────────
    if (action === "REJECT") {
      const approved = canApproveMulti(userRoles, targetUser?.role ?? "", user.id, overtime.user_id);
      if (!approved) {
        return NextResponse.json({ success: false, message: "Tidak berwenang menolak" }, { status: 403 });
      }

      const { data, error } = await supabase
        .from("overtime_requests")
        .update({
          status: "REJECTED",
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          rejection_note: rejection_note ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data });
    }

    // ── COMPLETE ───────────────────────────────────────────────────────────
    if (action === "COMPLETE") {
      if (overtime.user_id !== user.id) {
        return NextResponse.json({ success: false, message: "Bukan request milikmu" }, { status: 403 });
      }

      // Kasus 1: sudah selesai (COMPLETED / NEED_PROOF) → mode update foto
      if (overtime.status === "COMPLETED" || overtime.status === "NEED_PROOF") {
        const finalProof = proof_photo_url ?? overtime.proof_photo_url ?? null;

        const updatePayload: Record<string, any> = {
          proof_photo_url: finalProof,
          status: finalProof ? "COMPLETED" : "NEED_PROOF",
          updated_at: new Date().toISOString(),
        };

      if (!overtime.actual_end && overtime.scheduled_end && overtime.actual_start) {
          const lockedEnd = overtime.scheduled_end;
          const startMs = new Date(overtime.actual_start).getTime();
          const endMs = new Date(lockedEnd).getTime();
          if (endMs > startMs) {
            const durationMins = Math.round((endMs - startMs) / 60000);
            const ratePerHour = overtime.rate_per_hour ?? 0;
            updatePayload.actual_end = lockedEnd;
            updatePayload.completed_at = lockedEnd;
            updatePayload.duration_minutes = durationMins;
            // ✅ FIX: proporsional per menit, bukan dibulatkan ke bawah per jam.
            updatePayload.total_pay = Math.round((durationMins / 60) * ratePerHour);
          }
        }

        const { data, error } = await supabase
          .from("overtime_requests")
          .update(updatePayload)
          .eq("id", id)
          .select()
          .single();

        if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        return NextResponse.json({ success: true, data });
      }

      // Kasus 2: masih ONGOING/APPROVED → selesaikan sekarang
      if (!["APPROVED", "ONGOING"].includes(overtime.status)) {
        return NextResponse.json({ success: false, message: "Status tidak valid untuk complete" }, { status: 400 });
      }

      const startReference = overtime.actual_start;
      if (!startReference) {
        return NextResponse.json({ success: false, message: "actual_start tidak ditemukan." }, { status: 400 });
      }

      const nowIso = new Date().toISOString();
      const scheduledEndIso = overtime.scheduled_end;

      let actualEnd: string;
      if (auto_completed === true) {
        actualEnd = scheduledEndIso ?? nowIso;
      } else if (scheduledEndIso && new Date(nowIso).getTime() > new Date(scheduledEndIso).getTime()) {
        actualEnd = scheduledEndIso;
      } else {
        actualEnd = nowIso;
      }

      const startMs = new Date(startReference).getTime();
      const endMs = new Date(actualEnd).getTime();

      if (endMs <= startMs) {
        return NextResponse.json({ success: false, message: "Waktu selesai tidak valid" }, { status: 400 });
      }

     const durationMins = Math.round((endMs - startMs) / 60000);
      const ratePerHour = overtime.rate_per_hour ?? 0;
      // ✅ FIX: proporsional per menit, bukan dibulatkan ke bawah per jam.
      const calculatedPay = Math.round((durationMins / 60) * ratePerHour);
      const finalProof = proof_photo_url ?? null;

      const updates: any = {
        actual_end: actualEnd,
        status: finalProof ? "COMPLETED" : "NEED_PROOF",
        proof_photo_url: finalProof,
        completed_at: actualEnd,
        duration_minutes: durationMins,
        total_pay: calculatedPay,
        updated_at: new Date().toISOString(),
      };

      if (auto_completed === true) updates.auto_completed = true;

      const { data, error } = await supabase
        .from("overtime_requests")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data });
    }

    // ── SET_PAY ────────────────────────────────────────────────────────────
    if (action === "SET_PAY") {
      // Hanya FULL_ACCESS (ADMIN/PROGRAMMER/ASISTEN_CEO) yang boleh set gaji
      // Kepala divisi TIDAK bisa set gaji — sesuai requirement point 2
      const isFullAccessUser = userRoles.some(r => FULL_ACCESS.includes(r));
      if (!isFullAccessUser) {
        return NextResponse.json(
          { success: false, message: "Tidak berwenang mengubah total bayar" },
          { status: 403 }
        );
      }

      if (overtime.status !== "COMPLETED") {
        return NextResponse.json(
          { success: false, message: "Bayaran hanya bisa diatur setelah lembur selesai" },
          { status: 400 }
        );
      }

      // Wajib ada foto bukti sebelum bayaran boleh diatur.
      // NEED_PROOF = sudah selesai tapi foto belum diupload → tetap ditolak di sini.
      if (!overtime.proof_photo_url) {
        return NextResponse.json(
          {
            success: false,
            message: "Bayaran belum bisa diatur — karyawan belum upload foto bukti lembur",
          },
          { status: 400 }
        );
      }

      if (rate_per_hour === undefined || rate_per_hour === null || rate_per_hour < 0) {
        return NextResponse.json(
          { success: false, message: "rate_per_hour wajib diisi (0 untuk nominal tetap)" },
          { status: 400 }
        );
      }

      const { data, error } = await supabase
        .from("overtime_requests")
        .update({
          rate_per_hour: Math.round(rate_per_hour),
          total_pay: Math.round(total_pay),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data });
    }

    // ── CANCEL ─────────────────────────────────────────────────────────────
    if (action === "CANCEL") {
      const isOwner = overtime.user_id === user.id;
      const isAdmin = canApproveMulti(userRoles, targetUser?.role ?? "");
      if (!isOwner && !isAdmin) {
        return NextResponse.json({ success: false, message: "Tidak berwenang" }, { status: 403 });
      }

      const { data, error } = await supabase
        .from("overtime_requests")
        .update({ status: "CANCELLED", updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data });
    }

    // ── UPDATE ─────────────────────────────────────────────────────────────
    if (action === "UPDATE") {
      const isFullAccessUser = userRoles.some(r => FULL_ACCESS.includes(r));
      if (!isFullAccessUser) {
        return NextResponse.json(
          { success: false, message: "Tidak berwenang mengubah data lembur" },
          { status: 403 }
        );
      }

      const {
        request_date: newDate,
        scheduled_start: newSchedStart,
        scheduled_end: newSchedEnd,
        actual_start: newActualStart,
        actual_end: newActualEnd,
        reason: newReason,
        work_description: newWorkDesc,
        proof_photo_url: newProofUrl,
        rate_per_hour: newRate,
        status: newStatus,
      } = body;

      const resolvedStart = newActualStart ?? overtime.actual_start;
      const resolvedEnd = newActualEnd ?? overtime.actual_end;
      const resolvedRate = newRate ?? overtime.rate_per_hour ?? 0;

      let durationMins: number | undefined;
      let computedPay: number | undefined;

      if (resolvedStart && resolvedEnd) {
        const startMs = new Date(resolvedStart).getTime();
        const endMs = new Date(resolvedEnd).getTime();
        if (endMs > startMs) {
          durationMins = Math.round((endMs - startMs) / 60000);
          // ✅ FIX: proporsional per menit, bukan dibulatkan ke bawah per
          // jam penuh — konsisten dengan action lain (GET auto-complete,
          // is_manual, COMPLETE) yang sudah dibenerin sebelumnya.
          computedPay = Math.round((durationMins / 60) * resolvedRate);
        }
      }

      const updatePayload: Record<string, any> = { updated_at: new Date().toISOString() };
      if (newDate !== undefined) updatePayload.request_date = newDate;
      if (newSchedStart !== undefined) updatePayload.scheduled_start = newSchedStart;
      if (newSchedEnd !== undefined) updatePayload.scheduled_end = newSchedEnd;
      if (newActualStart !== undefined) updatePayload.actual_start = newActualStart;
      if (newActualEnd !== undefined) updatePayload.actual_end = newActualEnd;
      if (newReason !== undefined) updatePayload.reason = newReason;
      if (newWorkDesc !== undefined) updatePayload.work_description = newWorkDesc;
      if (newProofUrl !== undefined) updatePayload.proof_photo_url = newProofUrl;
      if (newRate !== undefined) updatePayload.rate_per_hour = Math.round(newRate);
      if (newStatus !== undefined) updatePayload.status = newStatus;
      if (durationMins !== undefined) updatePayload.duration_minutes = durationMins;
      if (computedPay !== undefined) updatePayload.total_pay = Math.round(computedPay);

      const { data, error } = await supabase
        .from("overtime_requests")
        .update(updatePayload)
        .eq("id", id)
        .select()
        .single();

      if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data });
    }

    return NextResponse.json(
      { success: false, message: `Action tidak dikenal: ${action}` },
      { status: 400 }
    );
  } catch (err: any) {
    console.error("[PATCH Error]", err);
    return NextResponse.json({ success: false, message: err?.message }, { status: 500 });
  }
}

// ─── DELETE ────────────────────────────────────────────────────────────────
export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    // Hanya FULL_ACCESS yang bisa hapus
    const userRoles: string[] = Array.isArray(user.roles) && user.roles.length > 0
      ? user.roles
      : [user.role];
    const isFullAccessUser = userRoles.some(r => FULL_ACCESS.includes(r));

    if (!isFullAccessUser) {
      return NextResponse.json(
        { success: false, message: "Tidak berwenang menghapus data lembur" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, message: "id wajib disertakan" }, { status: 400 });
    }

    const { data: existing, error: findError } = await supabase
      .from("overtime_requests")
      .select("id, proof_photo_url")
      .eq("id", id)
      .single();

    if (findError || !existing) {
      return NextResponse.json({ success: false, message: "Data lembur tidak ditemukan" }, { status: 404 });
    }

    if (existing.proof_photo_url) {
      const urlParts = existing.proof_photo_url.split("/documents/");
      if (urlParts.length > 1) {
        const storagePath = urlParts[1];
        await supabase.storage.from("documents").remove([storagePath]);
        console.log(`[DELETE] Removed storage file: ${storagePath}`);
      }
    }

    const { error } = await supabase
      .from("overtime_requests")
      .delete()
      .eq("id", id);

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

    console.log(`[DELETE] Overtime ${id} deleted by ${user.id}`);
    return NextResponse.json({ success: true, message: "Data lembur berhasil dihapus" });
  } catch (err: any) {
    console.error("[DELETE Error]", err);
    return NextResponse.json({ success: false, message: err?.message }, { status: 500 });
  }
}