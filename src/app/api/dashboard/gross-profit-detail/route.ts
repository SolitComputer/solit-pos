// src/app/api/dashboard/gross-profit-detail/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { PERMISSIONS, withAuth } from "@/lib/auth";

function getTodayWIB(): string {
  const WIB = 7 * 60 * 60 * 1000;
  const nowWIB = new Date(Date.now() + WIB);
  return nowWIB.toISOString().split("T")[0];
}

function getDealPrice(item: any): number {
  return Number(item.deal_price || item.amount || 0);
}

// GROSS PROFIT = deal_price - live purchase_price dari laptop_units
// (disamakan dengan calcMarginFromMap di stats/route.ts, BUKAN kolom inventory_price)
function calcGrossProfit(item: any, unitMap: Map<string, number>): number {
  const dealPrice = getDealPrice(item);
  let totalPurchasePrice = 0;

  if (Array.isArray(item.unit_ids) && item.unit_ids.length > 0) {
    for (const uid of item.unit_ids) {
      totalPurchasePrice += unitMap.get(uid) ?? 0;
    }
  } else if (item.unit_id) {
    totalPurchasePrice = unitMap.get(item.unit_id) ?? 0;
  }

  return totalPurchasePrice > 0 ? dealPrice - totalPurchasePrice : 0;
}

// WIB day → rentang UTC (sama persis dengan stats/route.ts)
function wibDateToUTCRange(dateWIB: string): { start: string; end: string } {
  const [y, m, d] = dateWIB.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - 7 * 60 * 60 * 1000);
  const end = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0) - 7 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

// paid_at (UTC) → tanggal WIB "YYYY-MM-DD" untuk grouping
function paidAtToWIBDate(paidAt: string): string {
  return new Date(new Date(paidAt).getTime() + 7 * 60 * 60 * 1000)
    .toISOString().split("T")[0];
}

async function handler(req: NextRequest) {
  try {
    const WIB = 7 * 60 * 60 * 1000;
    const today = getTodayWIB();

    const nowWIB = new Date(Date.now() + WIB);
    const monthStartWIB = `${nowWIB.getUTCFullYear()}-${String(nowWIB.getUTCMonth() + 1).padStart(2, "0")}-01`;

    const dayStart = new Date(nowWIB);
    dayStart.setUTCDate(dayStart.getUTCDate() - 29);
    const dayStartWIB = dayStart.toISOString().split("T")[0];

    // Semua rentang berbasis paid_at (kapan dibayar), konsisten dengan dashboard card
    const todayRange = wibDateToUTCRange(today);
    const monthRange = { start: wibDateToUTCRange(monthStartWIB).start, end: wibDateToUTCRange(today).end };
    const dailyRange = { start: wibDateToUTCRange(dayStartWIB).start, end: wibDateToUTCRange(today).end };

    const [
      { data: todayTrx },
      { data: monthTrx },
      { data: dailyTrx },
    ] = await Promise.all([
      supabase.from("transactions").select("*").eq("status", "PAID")
        .gte("paid_at", todayRange.start).lt("paid_at", todayRange.end),
      supabase.from("transactions").select("*").eq("status", "PAID")
        .gte("paid_at", monthRange.start).lt("paid_at", monthRange.end),
      supabase.from("transactions").select("*").eq("status", "PAID")
        .gte("paid_at", dailyRange.start).lt("paid_at", dailyRange.end),
    ]);

    // ── BATCH FETCH purchase_price dari laptop_units (sama seperti stats/route.ts) ──
    const allTrxForUnits = [
      ...(todayTrx ?? []),
      ...(monthTrx ?? []),
      ...(dailyTrx ?? []),
    ];

    const allUnitIds = new Set<string>();
    for (const trx of allTrxForUnits) {
      if (trx.unit_id) allUnitIds.add(trx.unit_id);
      if (Array.isArray(trx.unit_ids)) {
        for (const uid of trx.unit_ids) { if (uid) allUnitIds.add(uid); }
      }
    }

    const unitMap = new Map<string, number>();
    if (allUnitIds.size > 0) {
      const { data: units } = await supabase
        .from("laptop_units")
        .select("id, purchase_price")
        .in("id", Array.from(allUnitIds));
      for (const unit of units ?? []) {
        unitMap.set(unit.id, Number(unit.purchase_price ?? 0));
      }
    }
    // ─────────────────────────────────────────────────────────────────────

    // ── Daily Breakdown ────────────────────────────────────────────────────
    const dailyMap: Record<string, { gross_profit: number; revenue: number; count: number; margin_pct: number }> = {};
    dailyTrx?.forEach((item) => {
      if (!item.paid_at) return;
      const date = paidAtToWIBDate(item.paid_at);
      const dealPrice = getDealPrice(item);
      const grossProfit = calcGrossProfit(item, unitMap);

      if (!dailyMap[date]) dailyMap[date] = { gross_profit: 0, revenue: 0, count: 0, margin_pct: 0 };
      dailyMap[date].gross_profit += grossProfit;
      dailyMap[date].revenue += dealPrice;
      dailyMap[date].count += 1;
    });

    // Calculate margin percentage
    Object.keys(dailyMap).forEach(date => {
      const revenue = dailyMap[date].revenue;
      if (revenue > 0) {
        dailyMap[date].margin_pct = Math.round((dailyMap[date].gross_profit / revenue) * 100);
      }
    });

    const dailyBreakdown = Object.entries(dailyMap)
      .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
      .map(([date, data]) => {
        const [y, m, d] = date.split("-").map(Number);
        const label = new Date(y, m - 1, d).toLocaleDateString("id-ID", {
          weekday: "short",
          day: "numeric",
          month: "short",
        });
        return { date, label, ...data };
      });

    // ── Weekly Breakdown ───────────────────────────────────────────────────
    const weeklyMap: Record<string, { gross_profit: number; revenue: number; count: number; margin_pct: number }> = {};

    dailyTrx?.forEach((item) => {
      if (!item.paid_at) return;
      const [y, m, d] = paidAtToWIBDate(item.paid_at).split("-").map(Number);
      const date = new Date(y, m - 1, d);

      const dayOfWeek = date.getDay();
      const weekStart = new Date(date);
      weekStart.setDate(weekStart.getDate() - dayOfWeek);
      const weekKey = weekStart.toISOString().split("T")[0];

      const dealPrice = getDealPrice(item);
      const grossProfit = calcGrossProfit(item, unitMap);

      if (!weeklyMap[weekKey]) {
        weeklyMap[weekKey] = { gross_profit: 0, revenue: 0, count: 0, margin_pct: 0 };
      }

      weeklyMap[weekKey].gross_profit += grossProfit;
      weeklyMap[weekKey].revenue += dealPrice;
      weeklyMap[weekKey].count += 1;
    });

    // Calculate margin percentage
    Object.keys(weeklyMap).forEach(week => {
      const revenue = weeklyMap[week].revenue;
      if (revenue > 0) {
        weeklyMap[week].margin_pct = Math.round((weeklyMap[week].gross_profit / revenue) * 100);
      }
    });

    const weeklyBreakdown = Object.entries(weeklyMap)
      .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
      .map(([weekStart, data]) => {
        const [y, m, d] = weekStart.split("-").map(Number);
        const start = new Date(y, m - 1, d);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        const label = `${start.toLocaleDateString("id-ID", { day: "numeric", month: "short" })} - ${end.toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`;
        return { weekStart, label, ...data };
      });

    // ── Monthly Summary ────────────────────────────────────────────────────
    const monthRevenue = monthTrx?.reduce((acc, item) => acc + getDealPrice(item), 0) || 0;
    const monthGrossProfit = monthTrx?.reduce((acc, item) => acc + calcGrossProfit(item, unitMap), 0) || 0;
    const monthMarginPct = monthRevenue > 0 ? Math.round((monthGrossProfit / monthRevenue) * 100) : 0;

    // ── Today Summary ────────────────────────────────────────────────────
    const todayGrossProfit = todayTrx?.reduce((acc, item) => acc + calcGrossProfit(item, unitMap), 0) || 0;
    const todayRevenue = todayTrx?.reduce((acc, item) => acc + getDealPrice(item), 0) || 0;

    return NextResponse.json({
      success: true,
      data: {
        today: {
          gross_profit: todayGrossProfit,
          revenue: todayRevenue,
          count: todayTrx?.length || 0,
          margin_pct: todayRevenue > 0 ? Math.round((todayGrossProfit / todayRevenue) * 100) : 0,
        },
        daily: dailyBreakdown,
        weekly: weeklyBreakdown,
        monthly: {
          gross_profit: monthGrossProfit,
          revenue: monthRevenue,
          count: monthTrx?.length || 0,
          margin_pct: monthMarginPct,
        },
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(handler, PERMISSIONS.VIEW_DASHBOARD);