import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── CONSTANTS (mirror dari /api/attendance/overtime/route.ts) ───────────
const FULL_ACCESS = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];
const DIVISION_HEAD_MAP: Record<string, string[]> = {
  KEPALA_SALES: ["CREW_SALES", "SOTECH", "PENGANTARAN", "KEPALA_SALES", "PKL_SALES", "PKL"],
  KEPALA_MARKETING: ["MARKETING", "KONTEN", "KEPALA_MARKETING", "PKL_MARKETING", "PKL_KONTEN", "PKL"],
  KEPALA_TEKNISI: ["TEKNISI", "PENGELOLA_BARANG", "CUSTOMER_SERVICE", "PKL_CUSTOMER_SERVICE", "KEPALA_TEKNISI", "PKL_TEKNISI", "PKL"],
  KEPALA_ONPOINT: ["ONPOINT", "KEPALA_ONPOINT", "PKL_ONPOINT", "PKL"],
  KEPALA_PENYEDIA_BARANG: ["PENYEDIA_BARANG", "PENGELOLA_BARANG", "KEPALA_PENYEDIA_BARANG", "PKL_PENYEDIA_BARANG", "PKL"],
  KEPALA_SOTECH: ["SOTECH", "KEPALA_SOTECH", "PKL_SOTECH", "PKL"],
  KEPALA_PENGELOLA_BARANG: ["PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG", "PKL_PENGELOLA_BARANG", "PKL"],
};
const PAY_VIEW_ROLES = [
  "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
  "KEPALA_SALES", "KEPALA_MARKETING", "KEPALA_TEKNISI",
  "KEPALA_PENYEDIA_BARANG", "KEPALA_ONPOINT", "KEPALA_SOTECH",
  "KEPALA_PENGELOLA_BARANG",
];
const PAYABLE_STATUSES = ["COMPLETED", "NEED_PROOF"];

function pad2(n: number) { return String(n).padStart(2, "0"); }

// Tanggal hari ini di WIB (UTC+7), format YYYY-MM-DD
function todayWIB(): string {
  const w = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return w.toISOString().slice(0, 10);
}

// Jam (0-23) suatu timestamp dalam WIB — dipakai untuk tren per-jam pada scope "day"
function wibHour(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const w = new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000);
  return w.getUTCHours();
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const scopeParam = searchParams.get("scope");
    const scope: "day" | "month" | "all" =
      scopeParam === "day" ? "day" : scopeParam === "all" ? "all" : "month";

    const year  = searchParams.get("year")  ?? new Date().getFullYear().toString();
    const month = searchParams.get("month") ?? String(new Date().getMonth() + 1);
    const date  = searchParams.get("date")  ?? todayWIB();

    const userRoles: string[] = Array.isArray(user.roles) && user.roles.length > 0 ? user.roles : [user.role];
    const isFullAccess = userRoles.some(r => FULL_ACCESS.includes(r));
    const canSeePay = userRoles.some(r => PAY_VIEW_ROLES.includes(r));

    // ── Visibility scope (sama seperti GET utama) ──────────────────────
    const allSubordinateRoles = new Set<string>();
    for (const r of userRoles) {
      const subs = DIVISION_HEAD_MAP[r];
      if (subs) subs.forEach(s => allSubordinateRoles.add(s));
    }
    const hasDivisionHeadRole = allSubordinateRoles.size > 0;

    let visibleUserIds: string[] | null = null; // null = semua (full access)
    if (!isFullAccess) {
      if (hasDivisionHeadRole) {
        const { data: subordinateUsers } = await supabase
          .from("users").select("id").in("role", Array.from(allSubordinateRoles));
        visibleUserIds = (subordinateUsers ?? []).map((u: any) => u.id as string);
        if (!visibleUserIds.includes(user.id)) visibleUserIds.push(user.id);
      } else {
        visibleUserIds = [user.id];
      }
    }

    // ── Build query ─────────────────────────────────────────────────
    let q = supabase
      .from("overtime_requests")
      .select("id, user_id, request_date, status, duration_minutes, total_pay, actual_start, scheduled_start");

    if (scope === "day") {
      q = q.eq("request_date", date);
    } else if (scope === "month") {
      const paddedMonth = String(month).padStart(2, "0");
      const startDate = `${year}-${paddedMonth}-01`;
      const lastDay = new Date(Number(year), Number(month), 0).getDate();
      const endDate = `${year}-${paddedMonth}-${String(lastDay).padStart(2, "0")}`;
      q = q.gte("request_date", startDate).lte("request_date", endDate);
    }
    // scope === "all" → tanpa filter tanggal

    if (visibleUserIds) q = q.in("user_id", visibleUserIds);

    const { data: rows, error } = await q;
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

    const allRows = rows ?? [];
    const payableRows = allRows.filter(r => PAYABLE_STATUSES.includes(r.status));

    // ── Enrich data user ────────────────────────────────────────────
    const userIds = [...new Set(payableRows.map(r => r.user_id))];
    const { data: usersData } = userIds.length
      ? await supabase.from("users").select("id, name, role").in("id", userIds)
      : { data: [] as any[] };
    const usersMap: Record<string, any> = {};
    (usersData ?? []).forEach((u: any) => { usersMap[u.id] = u; });

    // ── Ranking per user ─────────────────────────────────────────────
    const perUser: Record<string, { sessions: number; minutes: number; pay: number }> = {};
    payableRows.forEach(r => {
      const acc = perUser[r.user_id] ?? { sessions: 0, minutes: 0, pay: 0 };
      acc.sessions += 1;
      acc.minutes += r.duration_minutes ?? 0;
      acc.pay += r.total_pay ?? 0;
      perUser[r.user_id] = acc;
    });

    const ranking = Object.entries(perUser)
      .map(([uid, v]) => ({
        user_id: uid,
        name: usersMap[uid]?.name ?? "—",
        role: usersMap[uid]?.role ?? "—",
        sessions: v.sessions,
        totalMinutes: v.minutes,
        totalHours: Math.round((v.minutes / 60) * 10) / 10,
        totalPay: canSeePay ? v.pay : null,
        avgMinutes: v.sessions ? Math.round(v.minutes / v.sessions) : 0,
      }))
      .sort((a, b) => b.totalMinutes - a.totalMinutes);

    // ── Ringkasan ────────────────────────────────────────────────────
    const totalMinutesAll = payableRows.reduce((s, r) => s + (r.duration_minutes ?? 0), 0);
    const totalPayAll = payableRows.reduce((s, r) => s + (r.total_pay ?? 0), 0);
    const summary = {
      totalSessions: payableRows.length,
      totalMinutes: totalMinutesAll,
      totalPay: canSeePay ? totalPayAll : null,
      activeEmployees: ranking.length,
      avgMinutesPerSession: payableRows.length ? Math.round(totalMinutesAll / payableRows.length) : 0,
      topPerformer: ranking[0] ? { name: ranking[0].name, totalMinutes: ranking[0].totalMinutes } : null,
    };

    // ── Distribusi status (semua request pada periode, bukan cuma payable) ─
    const statusCounts: Record<string, number> = {};
    allRows.forEach(r => { statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1; });
    const statusDistribution = Object.entries(statusCounts).map(([status, count]) => ({ status, count }));

    // ── Tren ───────────────────────────────────────────────────────
    // day   → per jam (00:00 - 23:00), dari actual_start/scheduled_start
    // month → per tanggal (YYYY-MM-DD)
    // all   → per bulan (YYYY-MM)
    const trendMap: Record<string, number> = {};
    if (scope === "day") {
      payableRows.forEach(r => {
        const h = wibHour(r.actual_start ?? r.scheduled_start);
        if (h === null) return;
        const key = `${pad2(h)}:00`;
        trendMap[key] = (trendMap[key] ?? 0) + (r.duration_minutes ?? 0);
      });
    } else {
      payableRows.forEach(r => {
        const key = scope === "month" ? r.request_date : r.request_date.slice(0, 7);
        trendMap[key] = (trendMap[key] ?? 0) + (r.duration_minutes ?? 0);
      });
    }
    const trend = Object.entries(trendMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, minutes]) => ({ key, hours: Math.round((minutes / 60) * 10) / 10 }));

    return NextResponse.json({
      success: true,
      data: { summary, ranking, statusDistribution, trend, canSeePay, scope, date },
    });
  } catch (err: any) {
    console.error("[Leaderboard GET Error]", err);
    return NextResponse.json({ success: false, message: err?.message }, { status: 500 });
  }
}