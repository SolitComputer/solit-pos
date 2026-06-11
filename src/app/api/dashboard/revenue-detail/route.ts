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

function calcProfit(item: any): number {
  const dealPrice = getDealPrice(item);
  const inventoryPrice = Number(item.inventory_price || 0);
  return inventoryPrice > 0 ? dealPrice - inventoryPrice : Number(item.other || 0);
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
    const dailyMap: Record<string, { revenue: number; profit: number; count: number }> = {};
    dailyTrx?.forEach((item) => {
      const date = item.pickup_date as string;
      if (!dailyMap[date]) dailyMap[date] = { revenue: 0, profit: 0, count: 0 };
      dailyMap[date].revenue += getDealPrice(item);
      dailyMap[date].profit += calcProfit(item);
      dailyMap[date].count += 1;
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
    // FIXED: Gunakan konsisten local date parsing, bukan UTC
    const weeklyMap: Record<string, { revenue: number; profit: number; count: number }> = {};
    
    dailyTrx?.forEach((item) => {
      const [y, m, d] = (item.pickup_date as string).split("-").map(Number);
      const date = new Date(y, m - 1, d);
      
      // Calculate week start (Minggu = 0)
      const dayOfWeek = date.getDay();
      const weekStart = new Date(date);
      weekStart.setDate(weekStart.getDate() - dayOfWeek);
      const weekKey = weekStart.toISOString().split("T")[0];

      if (!weeklyMap[weekKey]) {
        weeklyMap[weekKey] = { revenue: 0, profit: 0, count: 0 };
      }

      weeklyMap[weekKey].revenue += getDealPrice(item);
      weeklyMap[weekKey].profit += calcProfit(item);
      weeklyMap[weekKey].count += 1;
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
    const monthProfit = monthTrx?.reduce((acc, item) => acc + calcProfit(item), 0) || 0;

    return NextResponse.json({
      success: true,
      data: {
        today: {
          revenue: todayTrx?.reduce((acc, item) => acc + getDealPrice(item), 0) || 0,
          profit: todayTrx?.reduce((acc, item) => acc + calcProfit(item), 0) || 0,
          count: todayTrx?.length || 0,
        },
        daily: dailyBreakdown,
        weekly: weeklyBreakdown,
        monthly: {
          revenue: monthRevenue,
          profit: monthProfit,
          count: monthTrx?.length || 0,
        },
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(handler, PERMISSIONS.VIEW_DASHBOARD);