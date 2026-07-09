import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PREPARATION_VIEW_ROLES } from "@/lib/permissions";

// Rentang 1 bulan penuh berbasis WIB
function wibMonthRange(month?: string | null): { from: string; to: string; label: string } {
  let y: number, m: number;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [yy, mm] = month.split("-").map(Number);
    y = yy; m = mm - 1;
  } else {
    const nowWIB = new Date(Date.now() + 7 * 3600_000);
    y = nowWIB.getUTCFullYear();
    m = nowWIB.getUTCMonth();
  }
  const from = new Date(Date.UTC(y, m, 1) - 7 * 3600_000);
  const to = new Date(Date.UTC(y, m + 1, 1) - 7 * 3600_000);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    label: `${y}-${String(m + 1).padStart(2, "0")}`,
  };
}

// Format menit → label "X mnt" atau "Xj Ym"
export function fmtDurLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} mnt`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}j ${m}m` : `${h} jam`;
}

async function getHandler(req: NextRequest, _ctx: any, _user: AuthUser) {
  try {
    const url = new URL(req.url);
    const scope = url.searchParams.get("scope");   // "all" = semua waktu
    const month = url.searchParams.get("month");   // "YYYY-MM"
    const from = url.searchParams.get("from");    // ISO custom range
    const to = url.searchParams.get("to");

    let p_from: string | null = null;
    let p_to: string | null = null;
    let label = "Semua Waktu";

    if (scope === "all") {
      p_from = null;
      p_to = null;
    } else if (from || to) {
      p_from = from || null;
      p_to = to || null;
      label = "Custom";
    } else {
      const r = wibMonthRange(month);
      p_from = r.from;
      p_to = r.to;
      label = r.label;
    }

    const { data, error } = await supabase.rpc("get_preparation_dashboard", { p_from, p_to });

    if (error) {
      console.error("[leaderboard] RPC error:", error);
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }

    // Tambahkan label teks ke tiap row speed
    const speed: Array<{ name: string; avg_minutes: number; total: number; label: string }> =
      (data?.speed ?? []).map((r: { name: string; avg_minutes: number; total: number }) => ({
        ...r,
        label: fmtDurLabel(r.avg_minutes),
      }));

    return NextResponse.json({
      success: true,
      range: { from: p_from, to: p_to, label },
      status_counts: data?.status_counts ?? {},
      formats: data?.formats ?? [],
      prepared: data?.prepared ?? [],
      delivered: data?.delivered ?? [],
      speed,                                              // ← baru
      global_avg_minutes: data?.global_avg_minutes ?? null, // ← baru
      avg_wait_minutes: data?.avg_wait_minutes ?? null, // ← baru
    });
  } catch (err) {
    console.error("[GET /api/preparation/leaderboard]", err);
    return NextResponse.json({ success: false, message: "Gagal mengambil dashboard" }, { status: 500 });
  }
}

export const GET = withAuth(getHandler, PREPARATION_VIEW_ROLES);