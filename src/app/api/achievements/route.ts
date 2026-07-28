import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { getAttendanceScope } from "@/lib/attendanceScope";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PAYABLE_STATUSES = ["COMPLETED", "NEED_PROOF"];

function wibMonthKey(iso: string): string {
  return new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 7);
}
function wibDayKey(iso: string): string {
  return new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function getHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("userId");
  const targetId = !q || q === "me" ? user.id : q;

  const scope = await getAttendanceScope(supabase, user);
  const thisMonth = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 7);

  // ── Absensi ──────────────────────────────────────────────────────────
  let attQuery = supabase
    .from("face_verifications")
    .select("user_id, created_at, late_weight")
    .eq("status", "SUCCESS");
  if (!scope.all) attQuery = attQuery.in("user_id", scope.visibleIds);
  const { data: attRows, error: attErr } = await attQuery;
  if (attErr) return NextResponse.json({ success: false, message: attErr.message }, { status: 500 });

  const seenDay = new Set<string>();
  const attByUserMonth: Record<string, Record<string, { days: number; onTime: number }>> = {};
  for (const r of attRows ?? []) {
    const dayKey = `${r.user_id}_${wibDayKey(r.created_at)}`;
    if (seenDay.has(dayKey)) continue;
    seenDay.add(dayKey);
    const monthKey = wibMonthKey(r.created_at);
    attByUserMonth[r.user_id] ??= {};
    attByUserMonth[r.user_id][monthKey] ??= { days: 0, onTime: 0 };
    attByUserMonth[r.user_id][monthKey].days += 1;
    if ((r.late_weight ?? 0) === 0) attByUserMonth[r.user_id][monthKey].onTime += 1;
  }

  // ── Lembur ───────────────────────────────────────────────────────────
  let otQuery = supabase
    .from("overtime_requests")
    .select("user_id, request_date, duration_minutes, status");
  if (!scope.all) otQuery = otQuery.in("user_id", scope.visibleIds);
  const { data: otRows, error: otErr } = await otQuery;
  if (otErr) return NextResponse.json({ success: false, message: otErr.message }, { status: 500 });

  const otByUserMonth: Record<string, Record<string, { sessions: number; minutes: number }>> = {};
  for (const r of otRows ?? []) {
    if (!PAYABLE_STATUSES.includes(r.status)) continue;
    const monthKey = r.request_date.slice(0, 7);
    otByUserMonth[r.user_id] ??= {};
    otByUserMonth[r.user_id][monthKey] ??= { sessions: 0, minutes: 0 };
    otByUserMonth[r.user_id][monthKey].sessions += 1;
    otByUserMonth[r.user_id][monthKey].minutes += r.duration_minutes ?? 0;
  }

  // ── Ranking bulan berjalan ───────────────────────────────────────────
  const attRanking = Object.entries(attByUserMonth)
    .map(([uid, months]) => ({ user_id: uid, days: months[thisMonth]?.days ?? 0 }))
    .filter((r) => r.days > 0)
    .sort((a, b) => b.days - a.days);

  const otRanking = Object.entries(otByUserMonth)
    .map(([uid, months]) => ({ user_id: uid, minutes: months[thisMonth]?.minutes ?? 0 }))
    .filter((r) => r.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);

  const attRank = attRanking.findIndex((r) => r.user_id === targetId) + 1;
  const otRank = otRanking.findIndex((r) => r.user_id === targetId) + 1;

  // ── Rekor pribadi & rekor perusahaan (bulan terbaik sepanjang histori) ─
  const userAttMonths = attByUserMonth[targetId] ?? {};
  const bestAttMonth = Object.entries(userAttMonths).sort((a, b) => b[1].days - a[1].days)[0];
  const userOtMonths = otByUserMonth[targetId] ?? {};
  const bestOtMonth = Object.entries(userOtMonths).sort((a, b) => b[1].minutes - a[1].minutes)[0];

  let companyBestAttDays = 0;
  for (const months of Object.values(attByUserMonth)) {
    for (const m of Object.values(months)) companyBestAttDays = Math.max(companyBestAttDays, m.days);
  }
  let companyBestOtMinutes = 0;
  for (const months of Object.values(otByUserMonth)) {
    for (const m of Object.values(months)) companyBestOtMinutes = Math.max(companyBestOtMinutes, m.minutes);
  }

  return NextResponse.json({
    success: true,
    data: {
      month: thisMonth,
      attendance: {
        daysThisMonth: attByUserMonth[targetId]?.[thisMonth]?.days ?? 0,
        onTimeThisMonth: attByUserMonth[targetId]?.[thisMonth]?.onTime ?? 0,
        rankThisMonth: attRank || null,
        totalRanked: attRanking.length,
        isTopThisMonth: attRank === 1,
        personalBest: bestAttMonth ? { month: bestAttMonth[0], days: bestAttMonth[1].days } : null,
        isCompanyRecordHolder: (bestAttMonth?.[1].days ?? 0) > 0 && bestAttMonth![1].days === companyBestAttDays,
      },
      overtime: {
        sessionsThisMonth: otByUserMonth[targetId]?.[thisMonth]?.sessions ?? 0,
        hoursThisMonth: Math.round(((otByUserMonth[targetId]?.[thisMonth]?.minutes ?? 0) / 60) * 10) / 10,
        rankThisMonth: otRank || null,
        totalRanked: otRanking.length,
        isTopThisMonth: otRank === 1,
        personalBest: bestOtMonth
          ? { month: bestOtMonth[0], hours: Math.round((bestOtMonth[1].minutes / 60) * 10) / 10 }
          : null,
        isCompanyRecordHolder: (bestOtMonth?.[1].minutes ?? 0) > 0 && bestOtMonth![1].minutes === companyBestOtMinutes,
      },
    },
  });
}

export const GET = withAuth(getHandler);