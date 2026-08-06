// src/app/api/attendance/overtime/recap/route.ts
import { NextResponse } from "next/server";
import { getCurrentUser, resolveShiftConfigFromDB } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { computeLateMinutes } from "@/lib/overtimeEngine";
import { resolveScheduleOverride, toAuthScheduleShape } from "@/lib/shiftSchedule";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FULL_ACCESS = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];

// ⚠️ Duplikat dari DIVISION_HEAD_MAP di src/app/api/attendance/overtime/route.ts.
// Kalau daftar bawahan berubah di sana, update juga di sini. Idealnya nanti
// dipindah ke satu file shared (misal src/lib/roleHierarchy.ts) biar gak dobel.
const DIVISION_HEAD_MAP: Record<string, string[]> = {
  KEPALA_SALES: ["CREW_SALES", "SOTECH", "PENGANTARAN", "KEPALA_SALES", "PKL_SALES", "PKL", "PKL_PENGANTARAN"],
  KEPALA_MARKETING: ["MARKETING", "KONTEN", "KEPALA_MARKETING", "PKL_MARKETING", "PKL_KONTEN", "PKL"],
  KEPALA_TEKNISI: ["TEKNISI", "PENGELOLA_BARANG", "CUSTOMER_SERVICE", "PKL_CUSTOMER_SERVICE", "KEPALA_TEKNISI", "PKL_TEKNISI", "PKL"],
  KEPALA_ONPOINT: ["ONPOINT", "KEPALA_ONPOINT", "PKL_ONPOINT", "PKL"],
  KEPALA_PENYEDIA_BARANG: ["PENYEDIA_BARANG", "PENGELOLA_BARANG", "KEPALA_PENYEDIA_BARANG", "PKL_PENYEDIA_BARANG", "PKL"],
  KEPALA_SOTECH: ["SOTECH", "KEPALA_SOTECH", "PKL_SOTECH", "PKL"],
  KEPALA_PENGELOLA_BARANG: ["PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG", "PKL_PENGELOLA_BARANG", "PKL"],
};

function canViewTarget(viewerRoles: string[], viewerId: string, targetUserId: string, targetRole: string): boolean {
  if (viewerId === targetUserId) return true;
  if (viewerRoles.some((r) => FULL_ACCESS.includes(r))) return true;
  return viewerRoles.some((r) => DIVISION_HEAD_MAP[r]?.includes(targetRole));
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("user_id") || user.id;
    const year = Number(searchParams.get("year") ?? new Date().getFullYear());
    const month1 = Number(searchParams.get("month") ?? new Date().getMonth() + 1); // 1-12
    const month0 = month1 - 1;

    const { data: targetUser, error: targetErr } = await supabase
      .from("users")
      .select("id, name, role")
      .eq("id", targetUserId)
      .single();
    if (targetErr || !targetUser) {
      return NextResponse.json({ success: false, message: "Karyawan tidak ditemukan" }, { status: 404 });
    }

    const userRoles: string[] = Array.isArray(user.roles) && user.roles.length > 0 ? user.roles : [user.role];
    if (!canViewTarget(userRoles, user.id, targetUserId, targetUser.role)) {
      return NextResponse.json({ success: false, message: "Tidak berwenang melihat rekap karyawan ini" }, { status: 403 });
    }

    const daysInMonth = new Date(year, month0 + 1, 0).getDate();
    const pad = (n: number) => String(n).padStart(2, "0");
    const firstDay = `${year}-${pad(month0 + 1)}-01`;
    const lastDay = `${year}-${pad(month0 + 1)}-${pad(daysInMonth)}`;

    const [
      { data: weeklyOffs },
      { data: monthlyOffs },
      { data: dateOffs },
      { data: dateWorks },
      { data: verificationsIn },
      { data: verificationsOut },
      { data: overtimeRows }, // ✅ NEW — data lembur ASLI (yang beneran diajukan/di-ACC), bukan hasil hitung ulang
    ] = await Promise.all([
      supabase.from("user_day_off").select("day_of_week").eq("user_id", targetUserId),
      supabase.from("user_monthly_off").select("off_date").eq("user_id", targetUserId).eq("year", year).eq("month", month0 + 1),
      supabase.from("user_date_off").select("off_date").eq("user_id", targetUserId).gte("off_date", firstDay).lte("off_date", lastDay),
      supabase.from("user_date_work").select("work_date").eq("user_id", targetUserId).gte("work_date", firstDay).lte("work_date", lastDay),
      supabase.from("face_verifications").select("id, created_at")
        .eq("user_id", targetUserId).eq("status", "SUCCESS").eq("direction", "IN")
        .gte("created_at", `${firstDay}T00:00:00+07:00`).lte("created_at", `${lastDay}T23:59:59+07:00`),
      supabase.from("face_verifications").select("id, created_at")
        .eq("user_id", targetUserId).eq("status", "SUCCESS").eq("direction", "OUT")
        .gte("created_at", `${firstDay}T00:00:00+07:00`).lte("created_at", `${lastDay}T23:59:59+07:00`),
      supabase.from("overtime_requests").select("request_date, direction, duration_minutes, actual_start, actual_end, status, work_description")
        .eq("user_id", targetUserId)
        .gte("request_date", firstDay).lte("request_date", lastDay)
        .not("status", "in", "(REJECTED,CANCELLED)"),
    ]);

    const weeklyOffDows = new Set<number>((weeklyOffs ?? []).map((r: any) => r.day_of_week));
    const monthlyOffDates = new Set<string>((monthlyOffs ?? []).map((r: any) => r.off_date));
    const dateOffDates = new Set<string>((dateOffs ?? []).map((r: any) => r.off_date));
    const workOverrideDates = new Set<string>((dateWorks ?? []).map((r: any) => r.work_date));

    // Grouping absen ke tanggal WIB (bukan UTC) supaya gak geser hari
    const dateKeyOf = (iso: string) => {
      const wib = new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000);
      return `${wib.getUTCFullYear()}-${pad(wib.getUTCMonth() + 1)}-${pad(wib.getUTCDate())}`;
    };

    const inByDate = new Map<string, string>();
    for (const v of verificationsIn ?? []) {
      const key = dateKeyOf(v.created_at);
      const existing = inByDate.get(key);
      if (!existing || new Date(v.created_at) < new Date(existing)) inByDate.set(key, v.created_at);
    }
    const outByDate = new Map<string, string>();
    for (const v of verificationsOut ?? []) {
      const key = dateKeyOf(v.created_at);
      const existing = outByDate.get(key);
      if (!existing || new Date(v.created_at) > new Date(existing)) outByDate.set(key, v.created_at);
    }

    // ✅ NEW — group lembur ASLI per tanggal (bisa >1 baris/hari, misal input manual)
    const requestsByDate = new Map<string, typeof overtimeRows>();
    for (const r of overtimeRows ?? []) {
      const key = r.request_date;
      if (!requestsByDate.has(key)) requestsByDate.set(key, []);
      requestsByDate.get(key)!.push(r);
    }

    const baseSchedule = await resolveShiftConfigFromDB(targetUserId, supabase);

    const days: any[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateKey = `${year}-${pad(month0 + 1)}-${pad(d)}`;
      const dow = new Date(dateKey + "T12:00:00").getDay();
      const isWorkOverride = workOverrideDates.has(dateKey);
      const isDayOff =
        !isWorkOverride &&
        (monthlyOffDates.has(dateKey) || weeklyOffDows.has(dow) || dateOffDates.has(dateKey));

      const inISO = inByDate.get(dateKey) ?? null;
      const outISO = outByDate.get(dateKey) ?? null;

      let masuk: "Hadir" | "Libur" | "Alpha" = "Alpha";
      if (isDayOff) masuk = "Libur";
      else if (inISO) masuk = "Hadir";

     let terlambat = 0, lemburAwal = 0, lemburAkhir = 0, lemburAwalAkhir = 0, totalLembur = 0;
      let inOverride: string | null = null, outOverride: string | null = null; // ✅ NEW

      // ── Terlambat: tetap dihitung ulang dari absen (gak ada "approval" utk telat) ──
      if (!isDayOff && inISO) {
        const scheduleOverride = await resolveScheduleOverride(supabase, targetUserId, dateKey);
        const overrideShape = scheduleOverride ? toAuthScheduleShape(scheduleOverride) : null;
        const schedule = overrideShape
          ? { ...baseSchedule, ...overrideShape, checkout: overrideShape.checkout ?? baseSchedule.checkout }
          : baseSchedule;
        terlambat = computeLateMinutes(inISO, schedule);
      }

      // ── Lembur: diambil dari overtime_requests ASLI. Jam In/Out yang ditampilkan
      // juga di-override dari data lemburan ini (bukan jam absen mentah), karena jam
      // window lemburan yang di-ACC/dikoreksi manual bisa beda dari jam scan absen asli.
      const keteranganParts: string[] = []; // ✅ NEW

      for (const r of requestsByDate.get(dateKey) ?? []) {
        const mins = r.duration_minutes ?? (
          r.actual_start && r.actual_end
            ? Math.round((new Date(r.actual_end).getTime() - new Date(r.actual_start).getTime()) / 60000)
            : 0
        );
        if (mins > 0) {
          if (r.direction === "BEFORE_IN") lemburAwal += mins;
          else if (r.direction === "AFTER_OUT") lemburAkhir += mins;
          else if (r.direction === "BOTH") lemburAwalAkhir += mins;
          // HOLIDAY & MANUAL gak punya kolom sendiri di tabel ini — tetap masuk Total Lembur
          totalLembur += mins;
        }

        // ✅ In/Out prioritas dari data lemburan, bukan jam absen mentah
        if (r.actual_start && ["BEFORE_IN", "BOTH", "MANUAL", "HOLIDAY"].includes(r.direction)) {
          if (!inOverride || new Date(r.actual_start) < new Date(inOverride)) inOverride = r.actual_start;
        }
        if (r.actual_end && ["AFTER_OUT", "BOTH", "MANUAL", "HOLIDAY"].includes(r.direction)) {
          if (!outOverride || new Date(r.actual_end) > new Date(outOverride)) outOverride = r.actual_end;
        }

        // ✅ NEW — kumpulkan keterangan (bisa >1 kalau ada beberapa entri di hari yang sama)
        if (r.work_description && r.work_description.trim()) keteranganParts.push(r.work_description.trim());
      }

      days.push({
        no: d,
        date: dateKey,
        in: inOverride ?? inISO,
        out: outOverride ?? outISO,
        masuk,
        terlambat_minutes: terlambat,
        lembur_awal_minutes: lemburAwal,
        lembur_akhir_minutes: lemburAkhir,
        lembur_awal_akhir_minutes: lemburAwalAkhir,
        total_lembur_minutes: totalLembur,
        keterangan: keteranganParts.length > 0 ? keteranganParts.join(" ; ") : null, // ✅ NEW
      });
    }

    return NextResponse.json({
      success: true,
      data: { user: { id: targetUser.id, name: targetUser.name, role: targetUser.role }, year, month: month1, days },
    });
  } catch (err: any) {
    console.error("[Recap GET Error]", err);
    return NextResponse.json({ success: false, message: err?.message }, { status: 500 });
  }
}