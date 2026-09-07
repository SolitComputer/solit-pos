import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { computeKerjaScores } from "@/lib/kerja-scoring";
import { computeBadgeLevel, HistRow } from "@/lib/badge-level";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getWIBNow() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000);
}

// GET ?userId=X                 -> level + rank + isOngoingMonth (untuk badge di Profil)
// GET ?year=Y&month=M&list=true -> leaderboard lengkap + level tiap orang (untuk tab Pekerjaan di Lencana)
async function getHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  const { searchParams } = new URL(req.url);
  const now = getWIBNow();
  const nowYear = now.getUTCFullYear();
  const nowMonth = now.getUTCMonth() + 1;
  const year = parseInt(searchParams.get("year") || String(nowYear), 10);
  const month = parseInt(searchParams.get("month") || String(nowMonth), 10);

  if (searchParams.get("list") === "true") {
    const { data: rows, error } = await supabase
      .from("leaderboard_kerja_scores")
      .select("user_id, score, metrics, rank")
      .eq("year", year)
      .eq("month", month)
      .order("rank", { ascending: true });

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    const userIds = (rows ?? []).map((r) => r.user_id);
    const safeIds = userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"];

    const { data: usersData } = await supabase
      .from("users")
      .select("id, name, role")
      .in("id", safeIds);
    const userMap = new Map((usersData ?? []).map((u) => [u.id, u]));

    const { data: historyRows } = await supabase
      .from("leaderboard_kerja_scores")
      .select("user_id, year, month, rank")
      .in("user_id", safeIds)
      .order("year", { ascending: true })
      .order("month", { ascending: true });

    const historyByUser = new Map<string, HistRow[]>();
    (historyRows ?? []).forEach((r) => {
      if (!historyByUser.has(r.user_id)) historyByUser.set(r.user_id, []);
      historyByUser.get(r.user_id)!.push({ year: r.year, month: r.month, rank: r.rank });
    });

    const list = (rows ?? []).map((r) => {
      const levelInfo = computeBadgeLevel(historyByUser.get(r.user_id) ?? []);
      return {
        user_id: r.user_id,
        score: Number(r.score),
        metrics: r.metrics ?? [],
        rank: r.rank,
        name: userMap.get(r.user_id)?.name ?? "Unknown",
        role: userMap.get(r.user_id)?.role ?? "",
        level: levelInfo.displayLevel,
        isPermanent: levelInfo.isPermanent,
        isTemporary: levelInfo.isTemporary,
        streakMonths: levelInfo.currentStreak,
      };
    });

    return NextResponse.json({
      success: true,
      data: list,
      isOngoingMonth: year === nowYear && month === nowMonth,
    });
  }

  const targetUserId = searchParams.get("userId") || user.id;

  const { data: historyRows, error: histErr } = await supabase
    .from("leaderboard_kerja_scores")
    .select("year, month, rank, score")
    .eq("user_id", targetUserId)
    .order("year", { ascending: true })
    .order("month", { ascending: true });

  if (histErr) {
    return NextResponse.json({ success: false, message: histErr.message }, { status: 500 });
  }

  if (!historyRows || historyRows.length === 0) {
    return NextResponse.json({ success: true, data: null });
  }

  const levelInfo = computeBadgeLevel(historyRows.map((r) => ({ year: r.year, month: r.month, rank: r.rank })));
  const currentMonthRow = historyRows.find((r) => r.year === year && r.month === month) ?? null;
  const latestRow = historyRows[historyRows.length - 1];
  const isOngoingMonth = latestRow.year === nowYear && latestRow.month === nowMonth;

  const { count: totalRanked } = await supabase
    .from("leaderboard_kerja_scores")
    .select("id", { count: "exact", head: true })
    .eq("year", year)
    .eq("month", month);

  return NextResponse.json({
    success: true,
    data: {
      rankThisMonth: currentMonthRow?.rank ?? null,
      totalRanked: totalRanked ?? 0,
      score: currentMonthRow ? Number(currentMonthRow.score) : null,
      level: levelInfo.displayLevel,
      isPermanent: levelInfo.isPermanent,
      isTemporary: levelInfo.isTemporary,
      streakMonths: levelInfo.currentStreak,
      bestStreakEver: levelInfo.bestStreakEver,
      isOngoingMonth,
    },
  });
}

// POST { year, month } — hitung skor Pekerjaan 1 bulan penuh (server-side,
// via computeKerjaScores), lalu upsert snapshot + rank ke
// leaderboard_kerja_scores. Beda dengan attendance/quality-rank yang
// menerima skor dari client — di sini semua dihitung sendiri di server
// karena sumber datanya bukan input manual.
async function postHandler(req: NextRequest, _ctx: any, _user: AuthUser) {
  const body = await req.json();
  const year: number = body.year;
  const month: number = body.month;

  if (!year || !month) {
    return NextResponse.json({ success: false, message: "Tahun/bulan tidak lengkap" }, { status: 400 });
  }

  // Rentang 1 bulan penuh untuk tahun-bulan yang diminta — BUKAN relatif ke
  // hari ini, supaya bisa generate snapshot bulan lalu juga.
  const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  const scores = await computeKerjaScores(startDate, endDate);

  const ranked = scores
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    return NextResponse.json({ success: false, message: "Belum ada aktivitas untuk bulan ini" }, { status: 400 });
  }

  const rows = ranked.map((s, i) => ({
    user_id: s.id,
    year,
    month,
    score: Math.round(s.score * 10000) / 10000,
    metrics: s.metrics,
    rank: i + 1,
    computed_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("leaderboard_kerja_scores")
    .upsert(rows, { onConflict: "user_id,year,month" });

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: { count: rows.length } });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);