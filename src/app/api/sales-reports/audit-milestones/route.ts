import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";

export const dynamic = "force-dynamic";

// Milestone kumulatif poin audit (0,5 poin per laporan yang diaudit),
// all-time & TIDAK dibatasi Top 3 — pola sama seperti milestone
// Sales/Teknisi/Konten Kreator di /dashboard/lencana.
const AUDIT_MILESTONES = [5, 10, 25, 50, 100, 150, 200, 300, 500];
const POINTS_PER_AUDIT = 0.5;

function highestMilestone(total: number): number {
  let m = 0;
  for (const step of AUDIT_MILESTONES) {
    if (total >= step) m = step;
  }
  return m;
}

async function getHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  const { searchParams } = new URL(req.url);

  const { data: rows, error } = await supabaseAdmin
    .from("sales_online_reports")
    .select("audited_by, audited_by_name")
    .eq("audited", true)
    .not("audited_by", "is", null);

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  const countByUser = new Map<string, { name: string; count: number }>();
  (rows ?? []).forEach((r) => {
    const key = r.audited_by as string;
    const cur = countByUser.get(key) ?? { name: r.audited_by_name ?? "Unknown", count: 0 };
    cur.count += 1;
    countByUser.set(key, cur);
  });

  const ranked = Array.from(countByUser.entries())
    .map(([user_id, v]) => {
      const total = Math.round(v.count * POINTS_PER_AUDIT * 10) / 10;
      return { user_id, name: v.name, total, milestone: highestMilestone(total) };
    })
    .sort((a, b) => b.total - a.total)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  if (searchParams.get("list") === "true") {
    const ids = ranked.map((r) => r.user_id);
    let roleMap = new Map<string, string>();
    if (ids.length > 0) {
      const { data: usersData } = await supabaseAdmin.from("users").select("id, role").in("id", ids);
      roleMap = new Map((usersData ?? []).map((u) => [u.id, u.role]));
    }
    return NextResponse.json({
      success: true,
      data: ranked.map((r) => ({ ...r, role: roleMap.get(r.user_id) ?? "" })),
    });
  }

  const targetUserId = searchParams.get("userId") || user.id;
  const mine = ranked.find((r) => r.user_id === targetUserId);

  return NextResponse.json({
    success: true,
    data: {
      total: mine?.total ?? 0,
      rank: mine?.rank ?? 0,
      totalRanked: ranked.length,
      milestone: mine?.milestone ?? 0,
      hasBadge: Boolean(mine && mine.milestone > 0),
    },
  });
}

export const GET = withAuth(getHandler);