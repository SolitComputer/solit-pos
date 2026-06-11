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

// GROSS PROFIT = deal_price - inventory_price (BUKAN other field)
function calcGrossProfit(item: any): number {
  const dealPrice = getDealPrice(item);
  const inventoryPrice = Number(item.inventory_price || 0);
  return dealPrice - inventoryPrice;
}

async function handler(req: NextRequest) {
  try {
    const WIB = 7 * 60 * 60 * 1000;
    const today = getTodayWIB();
    
    const nowWIB = new Date(Date.now() + WIB);
    const monthStart = new Date(nowWIB.getUTCFullYear(), nowWIB.getUTCMonth(), 1)
      .toISOString().split("T")[0];

    const dayStart = new Date(nowWIB);
    dayStart.setUTCDate(dayStart.getUTCDate() - 29);
    const dayStartStr = dayStart.toISOString().split("T")[0];

    const [
      { data: todayTrx },
      { data: monthTrx },
      { data: dailyTrx },
    ] = await Promise.all([
      supabase.from("transactions").select("*").eq("status", "PAID").eq("pickup_date", today),
      supabase.from("transactions").select("*").eq("status", "PAID").gte("pickup_date", monthStart).lte("pickup_date", today),
      supabase.from("transactions").select("*").eq("status", "PAID").gte("pickup_date", dayStartStr).lte("pickup_date", today),
    ]);

    // ── Daily Breakdown ────────────────────────────────────────────────────
    const dailyMap: Record<string, { gross_profit: number; revenue: number; count: number; margin_pct: number }> = {};
    dailyTrx?.forEach((item) => {
      const date = item.pickup_date as string;
      const dealPrice = getDealPrice(item);
      const grossProfit = calcGrossProfit(item);
      
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
      const [y, m, d] = (item.pickup_date as string).split("-").map(Number);
      const date = new Date(y, m - 1, d);
      
      const dayOfWeek = date.getDay();
      const weekStart = new Date(date);
      weekStart.setDate(weekStart.getDate() - dayOfWeek);
      const weekKey = weekStart.toISOString().split("T")[0];

      const dealPrice = getDealPrice(item);
      const grossProfit = calcGrossProfit(item);

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
    const monthGrossProfit = monthTrx?.reduce((acc, item) => acc + calcGrossProfit(item), 0) || 0;
    const monthMarginPct = monthRevenue > 0 ? Math.round((monthGrossProfit / monthRevenue) * 100) : 0;

    return NextResponse.json({
      success: true,
      data: {
        today: {
          gross_profit: todayTrx?.reduce((acc, item) => acc + calcGrossProfit(item), 0) || 0,
          revenue: todayTrx?.reduce((acc, item) => acc + getDealPrice(item), 0) || 0,
          count: todayTrx?.length || 0,
          margin_pct: todayTrx && todayTrx.length > 0
            ? Math.round((todayTrx.reduce((acc, item) => acc + calcGrossProfit(item), 0) / todayTrx.reduce((acc, item) => acc + getDealPrice(item), 0)) * 100)
            : 0,
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