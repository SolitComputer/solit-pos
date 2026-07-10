import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { DELIVERY_LEADERBOARD_VIEW_ROLES } from "@/lib/permissions";

// Rentang 1 bulan penuh berbasis WIB (UTC+7)
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

interface Acc {
  id: string;
  name: string;
  responMs: number[];
  selesaiMs: number[];
}

interface Row {
  id: string;
  name: string;
  count: number;
  avgMs: number;
  fastestMs: number;
}

function buildBoard(
  users: Map<string, Acc>,
  pick: (a: Acc) => number[]
): Row[] {
  const rows: Row[] = [];
  for (const u of users.values()) {
    const arr = pick(u);
    if (arr.length === 0) continue;
    const sum = arr.reduce((a, b) => a + b, 0);
    rows.push({
      id: u.id,
      name: u.name,
      count: arr.length,
      avgMs: Math.round(sum / arr.length),
      fastestMs: Math.min(...arr),
    });
  }
  return rows.sort((a, b) => a.avgMs - b.avgMs);
}

async function getHandler(req: NextRequest, _ctx: any, _user: AuthUser) {
  try {
    const url = new URL(req.url);
    const scope = url.searchParams.get("scope"); // "all" = semua waktu
    const month = url.searchParams.get("month");  // "YYYY-MM"

    let p_from: string | null = null;
    let p_to: string | null = null;
    let label = "Semua Waktu";

    if (scope !== "all") {
      const r = wibMonthRange(month);
      p_from = r.from;
      p_to = r.to;
      label = r.label;
    }

    let query = supabase
      .from("preparation_orders")
      .select(
        "delivery_user_id, delivery_user_name, dispatched_at, delivery_accepted_at, delivery_started_at, delivered_at"
      )
      .eq("delivery_method", "PENGANTARAN")
      .not("delivery_user_id", "is", null);

    // Filter periode berbasis kapan tugas ditugaskan (dispatched_at)
    if (p_from) query = query.gte("dispatched_at", p_from);
    if (p_to) query = query.lt("dispatched_at", p_to);

    const { data, error } = await query.limit(5000);
    if (error) {
      console.error("[delivery-leaderboard] query error:", error);
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }

    const users = new Map<string, Acc>();
    for (const o of data ?? []) {
      const uid = o.delivery_user_id as string | null;
      if (!uid) continue;
      if (!users.has(uid)) {
        users.set(uid, { id: uid, name: o.delivery_user_name ?? "—", responMs: [], selesaiMs: [] });
      }
      const acc = users.get(uid)!;
      if (o.delivery_user_name) acc.name = o.delivery_user_name;

      // Respon: dispatched_at → delivery_accepted_at
      if (o.dispatched_at && o.delivery_accepted_at) {
        const ms = new Date(o.delivery_accepted_at).getTime() - new Date(o.dispatched_at).getTime();
        if (ms > 0) acc.responMs.push(ms);
      }
      // Selesai: delivery_started_at → delivered_at
      if (o.delivery_started_at && o.delivered_at) {
        const ms = new Date(o.delivered_at).getTime() - new Date(o.delivery_started_at).getTime();
        if (ms > 0) acc.selesaiMs.push(ms);
      }
    }

    return NextResponse.json({
      success: true,
      range: { from: p_from, to: p_to, label },
      respon: buildBoard(users, (a) => a.responMs),
      selesai: buildBoard(users, (a) => a.selesaiMs),
    });
  } catch (err) {
    console.error("[GET /api/preparation/delivery-leaderboard]", err);
    return NextResponse.json({ success: false, message: "Gagal mengambil leaderboard" }, { status: 500 });
  }
}

export const GET = withAuth(getHandler, DELIVERY_LEADERBOARD_VIEW_ROLES);
