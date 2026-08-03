import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { resolveShiftConfigFromDB } from "@/lib/auth";
import { resolveScheduleOverride, toAuthScheduleShape } from "@/lib/shiftSchedule";
import { isPKLRole } from "@/lib/permissions";
import {
  computeAfterOutOvertimeMinutes,
  computeHolidayOvertimeMinutes,
  type OvertimeDirection,
} from "@/lib/overtimeEngine";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FULL_ACCESS_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];

function buildTodayWIBTimestamp(dateKey: string, time: { h: number; m: number }): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return new Date(`${dateKey}T${pad(time.h)}:${pad(time.m)}:00+07:00`).toISOString();
}

// ✅ NEW — koreksi jam pulang yang sudah tercatat (bug kamera/sensor, atau
// salah input manual sebelumnya), tanpa perlu hapus lalu buat ulang dari nol.
// Admin-only. Kalau belum ada record OUT untuk user+tanggal ini, akan dibuatkan
// baru (dianggap "isi jam pulang yang kelupaan").
//
// ✅ NEW — setelah jam pulang dikoreksi, draft lemburan AFTER_OUT/HOLIDAY yang
// masih PENDING (belum di-ACC kepala divisi) otomatis dihitung ulang: dibuat
// baru kalau sekarang ternyata lembur, disesuaikan menitnya kalau berubah,
// atau dihapus kalau ternyata sudah tidak lembur lagi. Draft yang sudah di-ACC/
// diaudit TIDAK PERNAH disentuh otomatis — admin akan diberi peringatan untuk
// mengecek/menyesuaikan nominalnya secara manual lewat menu Lembur.
export async function PATCH(request: Request) {
  try {
    const admin = await getCurrentUser();
    if (!admin || !FULL_ACCESS_ROLES.includes(admin.role)) {
      return NextResponse.json(
        { success: false, message: "Hanya Admin/Programmer/Asisten CEO yang boleh mengedit jam pulang." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { user_id, date, checkout_time } = body; // date: YYYY-MM-DD (WIB), checkout_time: HH:MM

    if (!user_id || !date || !checkout_time) {
      return NextResponse.json(
        { success: false, message: "user_id, date, dan checkout_time wajib diisi." },
        { status: 400 }
      );
    }

    const fmtTime = (t: string) => (t.length === 5 ? `${t}:00` : t);
    const newCheckoutISO = new Date(`${date}T${fmtTime(checkout_time)}+07:00`).toISOString();
    if (Number.isNaN(new Date(newCheckoutISO).getTime())) {
      return NextResponse.json({ success: false, message: "Format tanggal/jam tidak valid." }, { status: 400 });
    }

    const dayStart = `${date}T00:00:00+07:00`;
    const dayEnd = `${date}T23:59:59+07:00`;

    const { data: targetUser } = await supabaseAdmin
      .from("users").select("role, roles").eq("id", user_id).maybeSingle();
    if (!targetUser) {
      return NextResponse.json({ success: false, message: "User tidak ditemukan." }, { status: 404 });
    }
    const userRole = (Array.isArray(targetUser.roles) && targetUser.roles[0]) || targetUser.role;

    // ── Cari record IN & OUT existing untuk user+tanggal ini (WIB) ─────────
    const [{ data: todayIn }, { data: existingOut }] = await Promise.all([
      supabaseAdmin.from("face_verifications").select("id, created_at")
        .eq("user_id", user_id).eq("status", "SUCCESS").eq("direction", "IN")
        .gte("created_at", dayStart).lte("created_at", dayEnd).maybeSingle(),
      supabaseAdmin.from("face_verifications").select("id")
        .eq("user_id", user_id).eq("status", "SUCCESS").eq("direction", "OUT")
        .gte("created_at", dayStart).lte("created_at", dayEnd).maybeSingle(),
    ]);

    // ── Simpan/perbarui record OUT-nya dulu ─────────────────────────────────
    let outRecordId: string;
    let mode: "updated" | "created";

    if (existingOut) {
      const { data, error } = await supabaseAdmin
        .from("face_verifications")
        .update({ created_at: newCheckoutISO, method: "MANUAL_ADMIN" })
        .eq("id", existingOut.id)
        .select("id")
        .single();
      if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
      outRecordId = data.id;
      mode = "updated";
    } else {
      const { data, error } = await supabaseAdmin
        .from("face_verifications")
        .insert({
          user_id, status: "SUCCESS", device: "Manual entry (Admin)", ip_address: "internal",
          direction: "OUT", method: "MANUAL_ADMIN", created_at: newCheckoutISO,
        })
        .select("id")
        .single();
      if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
      outRecordId = data.id;
      mode = "created";
    }

    console.log(`[edit-checkout] Admin ${admin.name} ${mode === "updated" ? "mengoreksi" : "menambahkan"} jam pulang user ${user_id} @ ${date} → ${newCheckoutISO}`);

    // ── PKL tidak punya sistem lemburan — selesai di sini ───────────────────
    if (isPKLRole(userRole)) {
      return NextResponse.json({ success: true, mode });
    }

    // ── Tentukan hari libur (sama seperti attendanceVerification.ts) ────────
    const nowWIB = new Date(new Date(newCheckoutISO).getTime() + 7 * 3600_000);
    const todayDow = nowWIB.getUTCDay();

    const [{ data: weeklyOff }, { data: specificOff }, { data: dateWork }, { data: monthlyOff }] = await Promise.all([
      supabaseAdmin.from("user_day_off").select("id").eq("user_id", user_id).eq("day_of_week", todayDow).maybeSingle(),
      supabaseAdmin.from("user_date_off").select("id").eq("user_id", user_id).eq("off_date", date).maybeSingle(),
      supabaseAdmin.from("user_date_work").select("id").eq("user_id", user_id).eq("work_date", date).maybeSingle(),
      supabaseAdmin.from("user_monthly_off").select("id").eq("user_id", user_id).eq("off_date", date).maybeSingle(),
    ]);
    const isDayOff = Boolean(monthlyOff) || ((Boolean(weeklyOff) || Boolean(specificOff)) && !dateWork);

    // ── Hitung ulang menit lembur yang seharusnya berdasarkan jam baru ──────
    const [baseSchedule, scheduleOverride] = await Promise.all([
      resolveShiftConfigFromDB(user_id, supabaseAdmin),
      resolveScheduleOverride(supabaseAdmin, user_id, date),
    ]);
    const overrideShape = scheduleOverride ? toAuthScheduleShape(scheduleOverride) : null;
    const schedule = overrideShape
      ? { ...baseSchedule, ...overrideShape, checkout: overrideShape.checkout ?? baseSchedule.checkout }
      : baseSchedule;

    let correctMinutes = 0;
    let correctDirection: OvertimeDirection = "AFTER_OUT";
    let correctActualStart = buildTodayWIBTimestamp(date, schedule.checkout);
    const correctActualEnd = newCheckoutISO;

    if (isDayOff && todayIn) {
      correctDirection = "HOLIDAY";
      correctActualStart = todayIn.created_at;
      correctMinutes = computeHolidayOvertimeMinutes(todayIn.created_at, newCheckoutISO);
    } else if (!isDayOff) {
      correctMinutes = computeAfterOutOvertimeMinutes(newCheckoutISO, schedule);
    }

    // ── Cari draft lemburan yang sebelumnya tersambung ke record OUT ini ────
    const { data: existingDraft } = await supabaseAdmin
      .from("overtime_requests")
      .select("id, status, audit_status, duration_minutes")
      .eq("source_face_verification_id", outRecordId)
      .in("direction", ["AFTER_OUT", "HOLIDAY"])
      .maybeSingle();

    let overtimeWarning: string | undefined;

    const draftIsLocked = existingDraft && (existingDraft.status !== "PENDING" || existingDraft.audit_status === "AUDITED");

    if (draftIsLocked) {
      // Lemburan sudah di-ACC/diaudit — JANGAN diubah otomatis, cuma peringatan.
      overtimeWarning = "Lemburan untuk tanggal ini sudah di-ACC/diaudit sebelumnya — nominalnya TIDAK ikut berubah otomatis. Cek dan sesuaikan manual lewat menu Lembur kalau perlu.";
    } else if (correctMinutes > 0) {
      if (existingDraft) {
        // Masih PENDING — aman disesuaikan.
        await supabaseAdmin.from("overtime_requests").update({
          direction: correctDirection,
          duration_minutes: correctMinutes,
          actual_start: correctActualStart,
          actual_end: correctActualEnd,
          is_holiday: correctDirection === "HOLIDAY",
          updated_at: new Date().toISOString(),
        }).eq("id", existingDraft.id);
      } else {
        // Belum ada draft — buat baru (misal koreksi bikin jadi lembur padahal sebelumnya tidak).
        await supabaseAdmin.from("overtime_requests").insert({
          user_id, request_date: date, direction: correctDirection, status: "PENDING",
          duration_minutes: correctMinutes, actual_start: correctActualStart, actual_end: correctActualEnd,
          is_holiday: correctDirection === "HOLIDAY", source_face_verification_id: outRecordId,
        });
      }
    } else if (existingDraft) {
      // Koreksi membuat lemburan jadi tidak berlaku lagi & masih PENDING — hapus.
      await supabaseAdmin.from("overtime_requests").delete().eq("id", existingDraft.id);
    }

    return NextResponse.json({ success: true, mode, warning: overtimeWarning });
  } catch (err: any) {
    console.error("[edit-checkout] error:", err);
    return NextResponse.json(
      { success: false, message: `Terjadi kesalahan internal: ${err?.message ?? "unknown error"}` },
      { status: 500 }
    );
  }
}