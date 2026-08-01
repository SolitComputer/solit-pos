// src/app/api/attendance/manual-checkout/route.ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { processAttendanceVerification } from "@/lib/attendanceVerification";
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

    // Kalau admin sekalian isi kategori & keterangan, langsung simpan supaya
    // kepala divisi tidak perlu menunggu karyawan mengisi manual.
    if (result.overtime && (category || work_description)) {
      await supabaseAdmin.from("overtime_requests").update({
        category: category ?? null,
        work_description: work_description?.trim() || null,
      }).eq("id", result.overtime.id);
    }

    console.log(`[manual-checkout] Admin ${admin.name} (${admin.id}) buat absen pulang manual untuk ${targetUser.name} (${user_id}) @ ${overrideNowISO}`);

    return NextResponse.json({
      success: true,
      message: `Absen pulang manual untuk ${targetUser.name} berhasil disimpan.`,
      overtime: result.overtime,
    });
  } catch (err: any) {
    console.error("[manual-checkout] error:", err);
    return NextResponse.json(
      { success: false, message: `Terjadi kesalahan internal: ${err?.message ?? "unknown error"}` },
      { status: 500 }
    );
  }
}