import { NextResponse } from "next/server";
import { getCurrentUser, isFullAccess } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET — ambil riwayat cuti per karyawan dalam 1 tahun
// Return per-user struct: { user: {id,name,role}, leaveDates: ["2026-10-15", ...] }
// Semua karyawan aktif tampil, yang belum pernah cuti leaveDates = []
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !isFullAccess(user.role)) {
      return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));

    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    // STEP 1: Ambil semua user AKTIF (skip user arsip)
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id, name, role")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (usersError) {
      console.error("[leave/history GET] users error:", usersError);
      return NextResponse.json({ success: false, message: usersError.message }, { status: 500 });
    }

    // STEP 2: Ambil semua leave requests setahun
    const { data: requests, error: reqError } = await supabase
      .from("user_leave_requests")
      .select("id, user_id, leave_date, status")
      .gte("leave_date", startDate)
      .lte("leave_date", endDate)
      .order("leave_date", { ascending: true });

    if (reqError) {
      console.error("[leave/history GET] requests error:", reqError);
      return NextResponse.json({ success: false, message: reqError.message }, { status: 500 });
    }

    // STEP 3: Group leave dates by user_id
    const leaveDatesByUser: Record<string, string[]> = {};
    (requests || []).forEach((r: any) => {
      if (!leaveDatesByUser[r.user_id]) leaveDatesByUser[r.user_id] = [];
      leaveDatesByUser[r.user_id].push(r.leave_date);
    });

    // STEP 4: Build result — per-user, termasuk yang belum pernah cuti
    const result = (users || []).map((u: any) => ({
      user: {
        id: u.id,
        name: u.name,
        role: u.role,
      },
      leaveDates: leaveDatesByUser[u.id] || [],
    }));

    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    console.error("[leave/history GET] Exception:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}