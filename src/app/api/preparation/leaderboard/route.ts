import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PREPARATION_VIEW_ROLES } from "@/lib/permissions";

// Rentang 1 bulan penuh berbasis WIB. month = "YYYY-MM".
function wibMonthRange(month?: string | null): { from: string; to: string; label: string } {
  let y: number, m: number; // m: 0-indexed
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [yy, mm] = month.split("-").map(Number);
    y = yy; m = mm - 1;
  } else {
    const nowWIB = new Date(Date.now() + 7 * 3600_000);
    y = nowWIB.getUTCFullYear();
    m = nowWIB.getUTCMonth();
  }
  // midnight WIB = midnight UTC - 7 jam
  const from = new Date(Date.UTC(y, m, 1) - 7 * 3600_000);
  const to = new Date(Date.UTC(y, m + 1, 1) - 7 * 3600_000);
  return { from: from.toISOString(), to: to.toISOString(), label: `${y}-${String(m + 1).padStart(2, "0")}` };
}

async function getHandler(req: NextRequest, _ctx: any, _user: AuthUser) {
  try {
    const url = new URL(req.url);
    const scope = url.searchParams.get("scope");     // "all" = semua waktu
    const month = url.searchParams.get("month");     // "YYYY-MM"
    const from = url.searchParams.get("from");       // ISO custom range
    const to = url.searchParams.get("to");

    let p_from: string | null = null;
    let p_to: string | null = null;
    let label = "Semua Waktu";

    if (scope === "all") {
      p_from = null; p_to = null;
    } else if (from || to) {
      p_from = from || null; p_to = to || null; label = "Custom";
    } else {
      const r = wibMonthRange(month);
      p_from = r.from; p_to = r.to; label = r.label;
    }

    const { data, error } = await supabase.rpc("get_preparation_dashboard", { p_from, p_to });
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 400 });

    // data = { status_counts, formats, prepared, delivered }
    return NextResponse.json({ success: true, range: { from: p_from, to: p_to, label }, ...data });
  } catch (err) {
    console.error("[GET /api/preparation/leaderboard]", err);
    return NextResponse.json({ success: false, message: "Gagal mengambil dashboard" }, { status: 500 });
  }
}

export const GET = withAuth(getHandler, PREPARATION_VIEW_ROLES);