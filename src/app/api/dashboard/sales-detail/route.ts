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

    // Daily sales (30 hari terakhir)
    const dayStart = new Date(nowWIB);
    dayStart.setUTCDate(dayStart.getUTCDate() - 29);
    const dayStartStr = dayStart.toISOString().split("T")[0];

    const [
      { data: todayTrx },
      { data: monthTrx },
      { data: dailyTrx },
    ] = await Promise.all([
      supabase
        .from("transactions")
        .select("*")
        .eq("status", "PAID")
        .eq("pickup_date", today),
      supabase
        .from("transactions")
        .select("*")
        .eq("status", "PAID")
        .gte("pickup_date", monthStart)
        .lte("pickup_date", today),
      supabase
        .from("transactions")
        .select("*")
        .eq("status", "PAID")
        .gte("pickup_date", dayStartStr)
        .lte("pickup_date", today),
    ]);

    // Sales person summary
    const salesMap: Record<string, { total: number; revenue: number; profit: number }> = {};

    dailyTrx?.forEach((item) => {
      const sales = item.sales_name || "Unknown";
      if (!salesMap[sales]) salesMap[sales] = { total: 0, revenue: 0, profit: 0 };
      salesMap[sales].total += 1;
      salesMap[sales].revenue += getDealPrice(item);
      salesMap[sales].profit += calcProfit(item);
    });

    // Daily breakdown per sales
    const dailyDetailMap: Record<string, Record<string, { total: number; revenue: number; profit: number }>> = {};

    dailyTrx?.forEach((item) => {
      const date = item.pickup_date as string;
      const sales = item.sales_name || "Unknown";
      
      if (!dailyDetailMap[sales]) dailyDetailMap[sales] = {};
      if (!dailyDetailMap[sales][date]) {
        dailyDetailMap[sales][date] = { total: 0, revenue: 0, profit: 0 };
      }
      
      dailyDetailMap[sales][date].total += 1;
      dailyDetailMap[sales][date].revenue += getDealPrice(item);
      dailyDetailMap[sales][date].profit += calcProfit(item);
    });

    // Format sales performance
    const salesPerformance = Object.entries(salesMap)
      .map(([name, data]) => {
        const dailyDetail = dailyDetailMap[name] || {};
        const dailyBreakdown = Object.entries(dailyDetail)
          .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
          .map(([date, stats]) => {
            const [y, m, d] = date.split("-").map(Number);
            const label = new Date(y, m - 1, d).toLocaleDateString("id-ID", {
              weekday: "short",
              day: "numeric",
              month: "short",
            });
            return { date, label, ...stats };
          });

        return {
          name,
          ...data,
          dailyBreakdown,
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    return NextResponse.json({
      success: true,
      data: {
        today: {
          count: todayTrx?.length || 0,
          revenue: todayTrx?.reduce((acc, item) => acc + getDealPrice(item), 0) || 0,
          profit: todayTrx?.reduce((acc, item) => acc + calcProfit(item), 0) || 0,
        },
        monthly: {
          count: monthTrx?.length || 0,
          revenue: monthTrx?.reduce((acc, item) => acc + getDealPrice(item), 0) || 0,
          profit: monthTrx?.reduce((acc, item) => acc + calcProfit(item), 0) || 0,
        },
        salesPerformance,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(handler, PERMISSIONS.VIEW_DASHBOARD);