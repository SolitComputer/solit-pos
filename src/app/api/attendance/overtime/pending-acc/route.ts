// src/app/api/attendance/overtime/pending-acc/route.ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";

const FULL_ACCESS = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];

// ⚠️ Samakan dengan DIVISION_HEAD_MAP di api/attendance/overtime/route.ts —
// kalau ubah salah satu, ubah juga yang satunya.
const DIVISION_HEAD_MAP: Record<string, string[]> = {
  KEPALA_SALES: ["CREW_SALES", "SOTECH", "PENGANTARAN", "PKL_SALES", "PKL", "PKL_PENGANTARAN"],
  KEPALA_MARKETING: ["MARKETING", "KONTEN", "PKL_MARKETING", "PKL_KONTEN", "PKL"],
  KEPALA_TEKNISI: ["TEKNISI", "PENGELOLA_BARANG", "CUSTOMER_SERVICE", "PKL_CUSTOMER_SERVICE", "PKL_TEKNISI", "PKL"],
  KEPALA_ONPOINT: ["ONPOINT", "PKL_ONPOINT", "PKL"],
  KEPALA_PENYEDIA_BARANG: ["PENYEDIA_BARANG", "PENGELOLA_BARANG", "PKL_PENYEDIA_BARANG", "PKL"],
  KEPALA_SOTECH: ["SOTECH", "PKL_SOTECH", "PKL"],
  KEPALA_PENGELOLA_BARANG: ["PENGELOLA_BARANG", "PKL_PENGELOLA_BARANG", "PKL"],
};

// Poin 9: dipanggil berkala oleh hooks/useOvertimeNotify.ts untuk badge + suara
// di sidebar kepala divisi (atau Admin, kalau yang lembur adalah kepala divisi).
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const userRoles: string[] = Array.isArray((user as any).roles) && (user as any).roles.length > 0
      ? (user as any).roles
      : [user.role];

    const isFullAccessUser = userRoles.some((r) => FULL_ACCESS.includes(r));

    // ✅ FIX: sebelumnya filter langsung ke kolom tabel JOIN (`users.role`)
    // lewat .in() — ini yang paling mungkin jadi sumber 500. Sekarang
    // resolve ID user dulu secara terpisah, baru filter overtime_requests
    // pakai user_id biasa (gak nyentuh JOIN buat filter-nya sama sekali).
    let allowedUserIds: string[] | null = null; // null = full access, semua boleh

    if (!isFullAccessUser) {
      const subRoles = new Set<string>();
      userRoles.forEach((r) => (DIVISION_HEAD_MAP[r] ?? []).forEach((s) => subRoles.add(s)));
      if (subRoles.size === 0) {
        return NextResponse.json({ success: true, data: [] });
      }

      const { data: subUsers, error: subUsersError } = await supabaseAdmin
        .from("users")
        .select("id")
        .in("role", Array.from(subRoles));

      if (subUsersError) {
        console.error("[pending-acc] gagal ambil daftar bawahan:", subUsersError.message);
        return NextResponse.json(
          { success: false, message: `Gagal memuat daftar bawahan: ${subUsersError.message}` },
          { status: 500 }
        );
      }

      allowedUserIds = (subUsers ?? []).map((u: any) => u.id);
      if (allowedUserIds.length === 0) {
        return NextResponse.json({ success: true, data: [] });
      }
    }

    let query = supabaseAdmin
      .from("overtime_requests")
      .select("id, user_id, duration_minutes, direction, request_date, category, work_description")
      .eq("status", "PENDING")
      .not("category", "is", null) // hanya yang sudah diisi karyawan — siap di-ACC
      .order("created_at", { ascending: false })
      .limit(50);

    if (allowedUserIds) {
      query = query.in("user_id", allowedUserIds);
    }

    const { data, error } = await query.abortSignal(AbortSignal.timeout(8000));
    if (error) {
      console.error("[pending-acc] query overtime_requests error:", error.message);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    const userIds = [...new Set((data ?? []).map((o: any) => o.user_id))];
    const { data: usersData } = userIds.length > 0
      ? await supabaseAdmin.from("users").select("id, name, role").in("id", userIds)
      : { data: [] };
    const usersMap: Record<string, any> = {};
    (usersData ?? []).forEach((u: any) => { usersMap[u.id] = u; });

    const result = (data ?? []).map((o: any) => ({
      id: o.id,
      user_name: usersMap[o.user_id]?.name ?? "Unknown",
      user_id: o.user_id,
      overtime_minutes: o.duration_minutes ?? 0,
      direction: o.direction,
      request_date: o.request_date,
      category: o.category,
    }));

    const res = NextResponse.json({ success: true, data: result });
    // Cache 30 detik — poll interval sudah 60 detik, jadi aman
    res.headers.set("Cache-Control", "private, max-age=30");
    return res;
  } catch (err: any) {
    console.error("[pending-acc] exception:", err);
    return NextResponse.json({ success: false, message: err?.message ?? "Server error" }, { status: 500 });
  }
}