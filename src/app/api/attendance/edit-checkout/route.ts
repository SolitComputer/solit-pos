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

function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  dateObj.setUTCDate(dateObj.getUTCDate() + days);
  return dateObj.toISOString().slice(0, 10);
}

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
    const { user_id, date, checkout_time, clear } = body; // clear: true → kosongkan jam pulang

    if (!user_id || !date) {
      return NextResponse.json({ success: false, message: "user_id dan date wajib diisi." }, { status: 400 });
    }
    if (!clear && !checkout_time) {
      return NextResponse.json(
        { success: false, message: "checkout_time wajib diisi (atau kirim clear: true untuk mengosongkan)." },
        { status: 400 }
      );
    }

    const dayStart = `${date}T04:00:00+07:00`;
    const dayEnd = `${addDaysToDateStr(date, 1)}T03:59:59+07:00`;

    const { data: targetUser } = await supabaseAdmin
      .from("users").select("role, roles").eq("id", user_id).maybeSingle();
    if (!targetUser) {
      return NextResponse.json({ success: false, message: "User tidak ditemukan." }, { status: 404 });
    }
    const userRole = (Array.isArray(targetUser.roles) && targetUser.roles[0]) || targetUser.role;

    const [{ data: todayIn }, { data: existingOut }, { data: manualToday }] = await Promise.all([
      supabaseAdmin.from("face_verifications").select("id, created_at")
        .eq("user_id", user_id).eq("status", "SUCCESS").eq("direction", "IN")
        .gte("created_at", dayStart).lte("created_at", dayEnd).maybeSingle(),
      supabaseAdmin.from("face_verifications").select("id")
        .eq("user_id", user_id).eq("status", "SUCCESS").eq("direction", "OUT")
        .gte("created_at", dayStart).lte("created_at", dayEnd).maybeSingle(),
      supabaseAdmin.from("attendance_manual").select("id, status, check_in_time")
        .eq("user_id", user_id).eq("attendance_date", date).maybeSingle(),
    ]);

    // Dipakai baik jalur "clear" maupun jalur isi/koreksi jam di bawah.
    const findLinkedDraft = async (faceVerificationId: string) => {
      const { data } = await supabaseAdmin
        .from("overtime_requests")
        .select("id, status, audit_status")
        .eq("source_face_verification_id", faceVerificationId)
        .in("direction", ["AFTER_OUT", "HOLIDAY"])
        .maybeSingle();
      return data;
    };

    // ── Jalur "Kosongkan" — hapus record OUT, kembalikan ke belum-pulang ───
    if (clear) {
      if (!existingOut) {
        return NextResponse.json({ success: true, mode: "already_empty" });
      }

      const linkedDraft = await findLinkedDraft(existingOut.id);
      let overtimeWarning: string | undefined;

      if (linkedDraft) {
        const draftIsLocked = linkedDraft.status !== "PENDING" || linkedDraft.audit_status === "AUDITED";
        if (draftIsLocked) {
          overtimeWarning = "Lemburan untuk tanggal ini sudah di-ACC/diaudit — TIDAK ikut terhapus otomatis. Hapus/sesuaikan manual lewat menu Lembur kalau perlu.";
        } else {
          await supabaseAdmin.from("overtime_requests").delete().eq("id", linkedDraft.id);
        }
      }

      const { error } = await supabaseAdmin.from("face_verifications").delete().eq("id", existingOut.id);
      if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

      console.log(`[edit-checkout] Admin ${admin.name} mengosongkan jam pulang user ${user_id} @ ${date}`);
      return NextResponse.json({ success: true, mode: "cleared", warning: overtimeWarning });
    }

    // ── Jalur isi/koreksi jam pulang ─────────────────────────────────────────
    const fmtTime = (t: string) => (t.length === 5 ? `${t}:00` : t);
    const newCheckoutISO = new Date(`${date}T${fmtTime(checkout_time)}+07:00`).toISOString();
    if (Number.isNaN(new Date(newCheckoutISO).getTime())) {
      return NextResponse.json({ success: false, message: "Format tanggal/jam tidak valid." }, { status: 400 });
    }

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

    if (isPKLRole(userRole)) {
      return NextResponse.json({ success: true, mode });
    }

    const nowWIB = new Date(new Date(newCheckoutISO).getTime() + 7 * 3600_000);
    const todayDow = nowWIB.getUTCDay();

    const [{ data: weeklyOff }, { data: specificOff }, { data: dateWork }, { data: monthlyOff }] = await Promise.all([
      supabaseAdmin.from("user_day_off").select("id").eq("user_id", user_id).eq("day_of_week", todayDow).maybeSingle(),
      supabaseAdmin.from("user_date_off").select("id").eq("user_id", user_id).eq("off_date", date).maybeSingle(),
      supabaseAdmin.from("user_date_work").select("id").eq("user_id", user_id).eq("work_date", date).maybeSingle(),
      supabaseAdmin.from("user_monthly_off").select("id").eq("user_id", user_id).eq("off_date", date).maybeSingle(),
    ]);
    const isDayOff = Boolean(monthlyOff) || ((Boolean(weeklyOff) || Boolean(specificOff)) && !dateWork);

    const [baseSchedule, scheduleOverride] = await Promise.all([
      resolveShiftConfigFromDB(user_id, supabaseAdmin),
      resolveScheduleOverride(supabaseAdmin, user_id, date),
    ]);
    const overrideShape = scheduleOverride ? toAuthScheduleShape(scheduleOverride) : null;
    const schedule = overrideShape
      ? { ...baseSchedule, ...overrideShape, checkout: overrideShape.checkout ?? baseSchedule.checkout }
      : baseSchedule;

    const inTimestamp = todayIn?.created_at ?? (manualToday as any)?.check_in_time ?? null;

    let correctMinutes = 0;
    let correctDirection: OvertimeDirection = "AFTER_OUT";
    let correctActualStart = buildTodayWIBTimestamp(date, schedule.checkout);
    const correctActualEnd = newCheckoutISO;

    if (isDayOff && inTimestamp) {
      correctDirection = "HOLIDAY";
      correctActualStart = inTimestamp;
      correctMinutes = computeHolidayOvertimeMinutes(inTimestamp, newCheckoutISO);
    } else if (!isDayOff) {
      correctMinutes = computeAfterOutOvertimeMinutes(newCheckoutISO, schedule);
    }

    const existingDraft = await findLinkedDraft(outRecordId);
    let overtimeWarning: string | undefined;
    const draftIsLocked = existingDraft && (existingDraft.status !== "PENDING" || existingDraft.audit_status === "AUDITED");

    if (draftIsLocked) {
      overtimeWarning = "Lemburan untuk tanggal ini sudah di-ACC/diaudit sebelumnya — nominalnya TIDAK ikut berubah otomatis. Cek dan sesuaikan manual lewat menu Lembur kalau perlu.";
    } else if (correctMinutes > 0) {
      if (existingDraft) {
        await supabaseAdmin.from("overtime_requests").update({
          direction: correctDirection,
          duration_minutes: correctMinutes,
          actual_start: correctActualStart,
          actual_end: correctActualEnd,
          is_holiday: correctDirection === "HOLIDAY",
          updated_at: new Date().toISOString(),
        }).eq("id", existingDraft.id);
      } else {
        const AUTO_REASON_BY_DIRECTION: Record<string, string> = {
          BEFORE_IN: "Diajukan karyawan — lembur awal (sebelum jam masuk)",
          AFTER_OUT: "Diajukan karyawan — lembur akhir (sesudah jam pulang)",
          BOTH: "Diajukan karyawan — gabungan lembur awal & akhir",
          HOLIDAY: "Diajukan karyawan — lembur di hari libur",
          MANUAL: "Input manual admin",
        };
        const toWIBTimeString = (iso: string) => {
          const pad = (n: number) => String(n).padStart(2, "0");
          const wib = new Date(new Date(iso).getTime() + 7 * 3600_000);
          return `${pad(wib.getUTCHours())}:${pad(wib.getUTCMinutes())}:${pad(wib.getUTCSeconds())}`;
        };

        await supabaseAdmin.from("overtime_requests").insert({
          user_id,
          request_date: date,
          direction: correctDirection,
          reason: AUTO_REASON_BY_DIRECTION[correctDirection] ?? "Koreksi jam pulang admin",
          requested_start: toWIBTimeString(correctActualStart),
          status: "PENDING",
          duration_minutes: correctMinutes,
          actual_start: correctActualStart,
          actual_end: correctActualEnd,
          is_holiday: correctDirection === "HOLIDAY",
          source_face_verification_id: outRecordId,
        });
      }
    } else if (existingDraft) {
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