import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { CONTRACT_EXPIRING_VIEW_ROLES } from "@/lib/permissions";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Jendela badge sidebar (?count=1) — tetap H-7 biar angka notif tetap "urgent".
const WARNING_WINDOW_DAYS = 7;
// Jendela halaman Daftar Kontrak — lebih lebar supaya 3 kelompok terisi.
const LIST_WINDOW_DAYS = 30;

function canView(user: AuthUser): boolean {
  const roles = user.roles?.length ? user.roles : [user.role];
  return roles.some((r) => (CONTRACT_EXPIRING_VIEW_ROLES as string[]).includes(r));
}

async function getHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  if (!canView(user)) {
    return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const countOnly = searchParams.get("count") === "1";

  // Hitung tanggal berbasis WIB (UTC+7) — konsisten dengan /api/contracts/me.
  const nowWIBms = Date.now() + 7 * 60 * 60 * 1000;
  const todayWIB = new Date(nowWIBms).toISOString().slice(0, 10);

  // count=1 (badge) pakai 7 hari; halaman daftar pakai 30 hari.
  const windowDays = countOnly ? WARNING_WINDOW_DAYS : LIST_WINDOW_DAYS;
  const boundaryWIB = new Date(nowWIBms + windowDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const { data, error } = await supabase
    .from("users")
    .select("id, name, role, career_level, contract_valid_until")
    .eq("contract_status", "APPROVED")
    .not("contract_valid_until", "is", null)
    .gte("contract_valid_until", todayWIB)      // dari hari ini (days_left >= 0)
    .lte("contract_valid_until", boundaryWIB)   // sampai batas window (7 atau 30 hari)
    .order("contract_valid_until", { ascending: true });

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  const todayMs = new Date(todayWIB).getTime();
  const rows = (data ?? []).map((u: any) => {
    const diffMs = new Date(u.contract_valid_until).getTime() - todayMs;
    const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return {
      id: u.id,
      name: u.name,
      role: u.role,
      career_level: u.career_level,
      contract_valid_until: u.contract_valid_until,
      days_left: daysLeft,
    };
  });

  // Mode ringan untuk badge sidebar — cuma butuh angka, nggak perlu list penuh.
  if (countOnly) {
    return NextResponse.json({ success: true, count: rows.length });
  }

  return NextResponse.json({
    success: true,
    data: rows,
    count: rows.length,
    window_days: windowDays,
  });
}

export const GET = withAuth(getHandler);