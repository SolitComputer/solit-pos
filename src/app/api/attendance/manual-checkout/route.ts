// src/app/api/attendance/manual-checkout/route.ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { processAttendanceVerification, createOvertimeDraft } from "@/lib/attendanceVerification";
import { isValidOvertimeCategory } from "@/lib/overtimeEngine";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FULL_ACCESS_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];

// Poin 8: absen pulang manual — HANYA admin, untuk meminimalisir kesalahan
// sistem yang gagal mencatat absen keluar (misal kamera error / sensor mati).
export async function POST(request: Request) {
  try {
    const admin = await getCurrentUser();
    if (!admin || !FULL_ACCESS_ROLES.includes(admin.role)) {
      return NextResponse.json(
        { success: false, message: "Hanya Admin/Programmer/Asisten CEO yang boleh membuat absen pulang manual." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { user_id, checkout_date, checkout_time, category, work_description } = body;

    if (!user_id || !checkout_date || !checkout_time) {
      return NextResponse.json(
        { success: false, message: "user_id, checkout_date, dan checkout_time wajib diisi." },
        { status: 400 }
      );
    }

    if (category != null && !isValidOvertimeCategory(category)) {
      return NextResponse.json({ success: false, message: `Kategori lembur tidak valid: ${category}` }, { status: 400 });
    }

    const { data: targetUser, error: userError } = await supabaseAdmin
      .from("users").select("id, name, role").eq("id", user_id).maybeSingle();

    if (userError || !targetUser) {
      return NextResponse.json({ success: false, message: "User tidak ditemukan." }, { status: 404 });
    }

    const fmtTime = (t: string) => (t.length === 5 ? `${t}:00` : t);
    const overrideNowISO = new Date(`${checkout_date}T${fmtTime(checkout_time)}+07:00`).toISOString();

    if (Number.isNaN(new Date(overrideNowISO).getTime())) {
      return NextResponse.json({ success: false, message: "Format tanggal/jam tidak valid." }, { status: 400 });
    }

    const result = await processAttendanceVerification({
      supabaseAdmin,
      userId: user_id,
      userRole: targetUser.role,
      method: "MANUAL_ADMIN",
      device: "Manual entry (Admin)",
      ip: "internal",
      overrideNowISO,
      forceDirection: "OUT",
    });

    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.message, code: result.code }, { status: result.status });
    }

    // ✅ REWORK: processAttendanceVerification tidak lagi auto-insert ke
    // overtime_requests — cuma mengembalikan POTENSI menit lembur lewat
    // result.overtimeOptions. Kalau admin sekalian isi kategori & keterangan
    // saat bikin absen pulang manual, kita BUAT baris lemburnya di sini
    // (dulu cuma UPDATE baris yang sudah otomatis ke-insert; sekarang baris
    // itu memang belum ada sampai kita buat sendiri).
    let createdOvertime: { id: string; minutes: number; direction: string } | null = null;
    if (result.overtimeOptions && (category || work_description)) {
      const { afterOutMinutes, holidayMinutes, sourceFaceVerificationId } = result.overtimeOptions;
      const direction: "HOLIDAY" | "AFTER_OUT" | null =
        holidayMinutes > 0 ? "HOLIDAY" : afterOutMinutes > 0 ? "AFTER_OUT" : null;
      const minutes = holidayMinutes > 0 ? holidayMinutes : afterOutMinutes;

      if (direction && minutes > 0) {
        // Aproksimasi actualStart (mundur `minutes` dari waktu checkout) — cuma
        // penanda waktu untuk tampilan, nominal tetap dihitung dari `minutes`.
        const actualStart = new Date(new Date(overrideNowISO).getTime() - minutes * 60000).toISOString();
        createdOvertime = await createOvertimeDraft(supabaseAdmin, {
          userId: user_id,
          requestDate: checkout_date,
          direction,
          minutes,
          actualStart,
          actualEnd: overrideNowISO,
          sourceFaceVerificationId,
          isHoliday: direction === "HOLIDAY",
        });
        if (createdOvertime) {
          await supabaseAdmin.from("overtime_requests").update({
            category: category ?? null,
            work_description: work_description?.trim() || null,
          }).eq("id", createdOvertime.id);
        }
      }
    }

    console.log(`[manual-checkout] Admin ${admin.name} (${admin.id}) buat absen pulang manual untuk ${targetUser.name} (${user_id}) @ ${overrideNowISO}`);

    return NextResponse.json({
      success: true,
      message: `Absen pulang manual untuk ${targetUser.name} berhasil disimpan.`,
      overtimeOptions: result.overtimeOptions,
      overtimeCreated: createdOvertime,
    });
  } catch (err: any) {
    console.error("[manual-checkout] error:", err);
    return NextResponse.json(
      { success: false, message: `Terjadi kesalahan internal: ${err?.message ?? "unknown error"}` },
      { status: 500 }
    );
  }
}