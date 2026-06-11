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

async function handler(req: NextRequest) {
  try {
    const WIB = 7 * 60 * 60 * 1000;
    const today = getTodayWIB();
    
    const nowWIB = new Date(Date.now() + WIB);
    const monthStart = new Date(nowWIB.getUTCFullYear(), nowWIB.getUTCMonth(), 1)
      .toISOString().split("T")[0];

    // Daily top laptop
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

    // Laptop summary
    const laptopMap: Record<string, { total: number; revenue: number }> = {};
    
    dailyTrx?.forEach((item) => {
      const laptop = item.laptop_name || "Unknown";
      if (!laptopMap[laptop]) laptopMap[laptop] = { total: 0, revenue: 0 };
      laptopMap[laptop].total += 1;
      laptopMap[laptop].revenue += getDealPrice(item);
    });

    // Daily breakdown per laptop
    const dailyLaptopMap: Record<string, Record<string, { total: number; revenue: number }>> = {};

    dailyTrx?.forEach((item) => {
      const date = item.pickup_date as string;
      const laptop = item.laptop_name || "Unknown";
      
      if (!dailyLaptopMap[laptop]) dailyLaptopMap[laptop] = {};
      if (!dailyLaptopMap[laptop][date]) {
        dailyLaptopMap[laptop][date] = { total: 0, revenue: 0 };
      }
      
      dailyLaptopMap[laptop][date].total += 1;
      dailyLaptopMap[laptop][date].revenue += getDealPrice(item);
    });

    // Format laptop performance
    const laptopPerformance = Object.entries(laptopMap)
      .map(([name, data]) => {
        const dailyDetail = dailyLaptopMap[name] || {};
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
      .slice(0, 15);

    return NextResponse.json({
      success: true,
      data: {
        today: {
          count: todayTrx?.length || 0,
          topLaptop: laptopPerformance.length > 0 ? laptopPerformance[0] : null,
        },
        monthly: {
          count: monthTrx?.length || 0,
        },
        laptopPerformance,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(handler, PERMISSIONS.VIEW_DASHBOARD);