import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { CONTRACT_EXPIRING_VIEW_ROLES } from "@/lib/permissions";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Jendela peringatan: kontrak yang berakhir dalam 7 hari ke depan (H-7).
const WARNING_WINDOW_DAYS = 7;

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
  const boundaryWIB = new Date(nowWIBms + WARNING_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const { data, error } = await supabase
    .from("users")
    .select("id, name, career_level, contract_valid_until")
    .eq("contract_status", "APPROVED")
    .not("contract_valid_until", "is", null)
    .gte("contract_valid_until", todayWIB)      // dari hari ini (days_left >= 0)
    .lte("contract_valid_until", boundaryWIB)   // sampai H-7 (days_left <= 7)
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
    window_days: WARNING_WINDOW_DAYS,
  });
}

export const GET = withAuth(getHandler);