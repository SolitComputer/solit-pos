import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { PERMISSIONS, withAuth } from "@/lib/auth";

function getWIBDateRange(daysOffset = 0): { start: string; end: string } {
  const WIB = 7 * 60 * 60 * 1000;
  const now = new Date();

  const nowWIB = new Date(now.getTime() + WIB);

  const targetWIB = new Date(nowWIB);
  targetWIB.setUTCDate(targetWIB.getUTCDate() + daysOffset);

  const startWIB = new Date(targetWIB);
  startWIB.setUTCHours(0, 0, 0, 0);

  const endWIB = new Date(targetWIB);
  endWIB.setUTCHours(23, 59, 59, 999);

  return {
    start: new Date(startWIB.getTime() - WIB).toISOString(),
    end:   new Date(endWIB.getTime()   - WIB).toISOString(),
  };
}

function getWIBDateKey(isoString: string): string {
  // Konversi ISO string ke date key "YYYY-MM-DD" dalam WIB
  const WIB = 7 * 60 * 60 * 1000;
  const d = new Date(new Date(isoString).getTime() + WIB);
  return d.toISOString().split("T")[0];
}

function getWIBWeekStart(): string {
  // 7 hari lalu, 00:00 WIB
  return getWIBDateRange(-6).start;
}

async function handler(req: NextRequest) {
  try {
    // ── Range tanggal pakai WIB ───────────────────────────────────────────
    const todayRange     = getWIBDateRange(0);   // hari ini WIB
    const yesterdayRange = getWIBDateRange(-1);  // kemarin WIB
    const weekStart      = getWIBWeekStart();    // 7 hari lalu WIB

    const [
      { data: todayTransactions },
      { data: laptops },
      { data: weeklyTransactions },
      { data: yesterdayTransactions },
    ] = await Promise.all([
      supabase
        .from("transactions")
        .select("*")
        .eq("status", "PAID")
        .gte("paid_at", todayRange.start)
        .lte("paid_at", todayRange.end),

      supabase
        .from("laptops")
        .select("*")
        .eq("status", "SIAP_JUAL")
        .gt("qty", 0),

      supabase
        .from("transactions")
        .select("*")
        .eq("status", "PAID")
        .gte("paid_at", weekStart),

      supabase
        .from("transactions")
        .select("*")
        .eq("status", "PAID")
        .gte("paid_at", yesterdayRange.start)
        .lte("paid_at", yesterdayRange.end),
    ]);

    // ── Helper profit calc ────────────────────────────────────────────────
    const calcProfit = (item: any): number => {
      const dealPrice      = Number(item.deal_price || item.amount || 0);
      const inventoryPrice = Number(item.inventory_price || 0);
      return inventoryPrice > 0
        ? dealPrice - inventoryPrice
        : Number(item.other || 0);
    };

    // ── Today stats ───────────────────────────────────────────────────────
    const todayRevenue =
      todayTransactions?.reduce(
        (acc, item) => acc + Number(item.deal_price || item.amount || 0), 0
      ) || 0;

    const todayProfit =
      todayTransactions?.reduce((acc, item) => acc + calcProfit(item), 0) || 0;

    // ── Yesterday stats ───────────────────────────────────────────────────
    const yesterdayRevenue =
      yesterdayTransactions?.reduce(
        (acc, item) => acc + Number(item.deal_price || item.amount || 0), 0
      ) || 0;

    const yesterdayProfit =
      yesterdayTransactions?.reduce((acc, item) => acc + calcProfit(item), 0) || 0;

    const yesterdayTrxCount = yesterdayTransactions?.length || 0;

    // ── % change ──────────────────────────────────────────────────────────
    const revenueChange =
      yesterdayRevenue > 0
        ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100)
        : null;

    const profitChange =
      yesterdayProfit > 0
        ? Math.round(((todayProfit - yesterdayProfit) / yesterdayProfit) * 100)
        : null;

    const trxChange =
      yesterdayTrxCount > 0
        ? Math.round((((todayTransactions?.length || 0) - yesterdayTrxCount) / yesterdayTrxCount) * 100)
        : null;

    // ── Stock ─────────────────────────────────────────────────────────────
    const stockTotal =
      laptops?.reduce((acc, item) => acc + (item.qty || 0), 0) || 0;

    // ── Weekly trend — pakai getWIBDateKey ────────────────────────────────
    const trendMap: Record<string, { revenue: number; profit: number; trxCount: number }> = {};

    // Inisialisasi 7 hari dengan key WIB
    for (let i = 6; i >= 0; i--) {
      const { start } = getWIBDateRange(-i);
      const key = getWIBDateKey(start); // "YYYY-MM-DD" dalam WIB
      trendMap[key] = { revenue: 0, profit: 0, trxCount: 0 };
    }

    weeklyTransactions?.forEach((item) => {
      // Konversi paid_at ke date key WIB (bukan UTC!)
      const dateKey = getWIBDateKey(item.paid_at || item.created_at || "");
      if (trendMap[dateKey]) {
        trendMap[dateKey].revenue  += Number(item.deal_price || item.amount || 0);
        trendMap[dateKey].profit   += calcProfit(item);
        trendMap[dateKey].trxCount += 1;
      }
    });

    const weeklyTrend = Object.entries(trendMap).map(([date, data]) => {
      // Parse date key dalam WIB untuk label yang benar
      const [y, m, d] = date.split("-").map(Number);
      const label = new Date(y, m - 1, d).toLocaleDateString("id-ID", {
        weekday: "short",
        day: "numeric",
      });
      return { date, label, ...data };
    });

    // ── Top Sales ─────────────────────────────────────────────────────────
    const salesMap: Record<string, { total: number; profit: number }> = {};
    todayTransactions?.forEach((item) => {
      const sales = item.sales_name || "Unknown";
      if (!salesMap[sales]) salesMap[sales] = { total: 0, profit: 0 };
      salesMap[sales].total  += 1;
      salesMap[sales].profit += calcProfit(item);
    });

    const topSales = Object.entries(salesMap)
      .map(([name, data]) => ({ name, total: data.total, profit: data.profit }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    // ── Top Sources (weekly) ──────────────────────────────────────────────
    const sourceMap: Record<string, number> = {};
    weeklyTransactions?.forEach((item) => {
      const source = item.source_platform || "Unknown";
      sourceMap[source] = (sourceMap[source] || 0) + 1;
    });

    const topSources = Object.entries(sourceMap)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);

    // ── Top Laptop ────────────────────────────────────────────────────────
    const laptopMap: Record<string, number> = {};
    todayTransactions?.forEach((item) => {
      const laptop = item.laptop_name || "Unknown";
      laptopMap[laptop] = (laptopMap[laptop] || 0) + 1;
    });

    const topLaptop = Object.entries(laptopMap)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    return NextResponse.json({
      success: true,
      data: {
        todayRevenue,
        todayProfit,
        todayTransactions: todayTransactions?.length || 0,
        laptopReady:       laptops?.length || 0,
        stockTotal,
        revenueChange,
        profitChange,
        trxChange,
        weeklyTrend,
        topSales,
        topSources,
        topLaptop,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(handler, PERMISSIONS.VIEW_DASHBOARD);