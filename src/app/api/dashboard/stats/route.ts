import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { PERMISSIONS, withAuth } from "@/lib/auth";

function getTodayWIB(): string {
  const WIB = 7 * 60 * 60 * 1000;
  const nowWIB = new Date(Date.now() + WIB);
  return nowWIB.toISOString().split("T")[0];
}

function getYesterdayWIB(): string {
  const WIB = 7 * 60 * 60 * 1000;
  const nowWIB = new Date(Date.now() + WIB);
  nowWIB.setUTCDate(nowWIB.getUTCDate() - 1);
  return nowWIB.toISOString().split("T")[0];
}

function getLast7DaysWIB(): string {
  const WIB = 7 * 60 * 60 * 1000;
  const nowWIB = new Date(Date.now() + WIB);
  nowWIB.setUTCDate(nowWIB.getUTCDate() - 6);
  return nowWIB.toISOString().split("T")[0];
}

function getDealPrice(item: any): number {
  return Number(item.deal_price || item.amount || 0);
}

function calcGrossProfit(item: any): number {
  const dealPrice = getDealPrice(item);
  const inventoryPrice = Number(item.inventory_price || 0);
  return dealPrice - inventoryPrice;
}

function wibDateToUTCRange(dateWIB: string): { start: string; end: string } {
  const [y, m, d] = dateWIB.split("-").map(Number);
  const startWIB = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - 7 * 60 * 60 * 1000);
  const endWIB   = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0) - 7 * 60 * 60 * 1000);
  return {
    start: startWIB.toISOString(),
    end:   endWIB.toISOString(),
  };
}

async function handler(req: NextRequest) {
  try {
    const today     = getTodayWIB();
    const yesterday = getYesterdayWIB();
    const weekStart = getLast7DaysWIB();

    const todayRange     = wibDateToUTCRange(today);
    const yesterdayRange = wibDateToUTCRange(yesterday);
    const weekStartRange = wibDateToUTCRange(weekStart);
    const weekEndRange   = wibDateToUTCRange(today);

    const [
      { data: todayTransactions },
      { data: laptops },
      { data: weeklyTransactions },
      { data: yesterdayTransactions },
    ] = await Promise.all([
      // ✅ FIX: filter by paid_at (kapan dilunasi), bukan pickup_date
      supabase
        .from("transactions")
        .select("*")
        .eq("status", "PAID")
        .gte("paid_at", todayRange.start)
        .lt("paid_at", todayRange.end),

      supabase
        .from("laptops")
        .select("*")
        .eq("status", "SIAP_JUAL")
        .gt("qty", 0),

      // ✅ FIX: weekly juga pakai paid_at
      supabase
        .from("transactions")
        .select("*")
        .eq("status", "PAID")
        .gte("paid_at", weekStartRange.start)
        .lt("paid_at", weekEndRange.end),

      // ✅ FIX: yesterday juga pakai paid_at
      supabase
        .from("transactions")
        .select("*")
        .eq("status", "PAID")
        .gte("paid_at", yesterdayRange.start)
        .lt("paid_at", yesterdayRange.end),
    ]);

    // ── TODAY STATS ──────────────────────────────────────────────────────────
    const todayRevenue =
      todayTransactions?.reduce((acc, item) => acc + getDealPrice(item), 0) || 0;

    const todayGrossProfit =
      todayTransactions?.reduce((acc, item) => acc + calcGrossProfit(item), 0) || 0;

    // ── YESTERDAY STATS ──────────────────────────────────────────────────────
    const yesterdayRevenue =
      yesterdayTransactions?.reduce((acc, item) => acc + getDealPrice(item), 0) || 0;

    const yesterdayGrossProfit =
      yesterdayTransactions?.reduce((acc, item) => acc + calcGrossProfit(item), 0) || 0;

    const yesterdayTrxCount = yesterdayTransactions?.length || 0;

    // ── % CHANGE ─────────────────────────────────────────────────────────────
    const revenueChange =
      yesterdayRevenue > 0
        ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100)
        : null;

    const profitChange =
      yesterdayGrossProfit > 0
        ? Math.round(((todayGrossProfit - yesterdayGrossProfit) / yesterdayGrossProfit) * 100)
        : null;

    const trxChange =
      yesterdayTrxCount > 0
        ? Math.round((((todayTransactions?.length || 0) - yesterdayTrxCount) / yesterdayTrxCount) * 100)
        : null;

    // ── STOCK ─────────────────────────────────────────────────────────────────
    const stockTotal =
      laptops?.reduce((acc, item) => acc + (item.qty || 0), 0) || 0;

    // ── WEEKLY TREND ─────────────────────────────────────────────────────────
    // Grouping by paid_at date (converted to WIB)
    const trendMap: Record<string, { revenue: number; profit: number; trxCount: number }> = {};

    for (let i = 6; i >= 0; i--) {
      const WIB = 7 * 60 * 60 * 1000;
      const d = new Date(Date.now() + WIB);
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().split("T")[0];
      trendMap[key] = { revenue: 0, profit: 0, trxCount: 0 };
    }

    weeklyTransactions?.forEach((item) => {
      if (!item.paid_at) return;
      // Convert paid_at UTC ke date WIB
      const paidAtWIB = new Date(new Date(item.paid_at).getTime() + 7 * 60 * 60 * 1000);
      const dateKey = paidAtWIB.toISOString().split("T")[0];
      if (trendMap[dateKey]) {
        trendMap[dateKey].revenue  += getDealPrice(item);
        trendMap[dateKey].profit   += calcGrossProfit(item);
        trendMap[dateKey].trxCount += 1;
      }
    });

    const weeklyTrend = Object.entries(trendMap).map(([date, data]) => {
      const [y, m, d] = date.split("-").map(Number);
      const label = new Date(y, m - 1, d).toLocaleDateString("id-ID", {
        weekday: "short",
        day: "numeric",
      });
      return { date, label, ...data };
    });

    // ── TOP SALES ─────────────────────────────────────────────────────────────
    const salesMap: Record<string, { total: number; profit: number }> = {};
    todayTransactions?.forEach((item) => {
      const sales = item.sales_name || "Unknown";
      if (!salesMap[sales]) salesMap[sales] = { total: 0, profit: 0 };
      salesMap[sales].total  += 1;
      salesMap[sales].profit += calcGrossProfit(item);
    });

    const topSales = Object.entries(salesMap)
      .map(([name, data]) => ({ name, total: data.total, profit: data.profit }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    // ── TOP SOURCES (WEEKLY) ──────────────────────────────────────────────────
    const sourceMap: Record<string, number> = {};
    weeklyTransactions?.forEach((item) => {
      const source = item.source_platform || "Unknown";
      sourceMap[source] = (sourceMap[source] || 0) + 1;
    });

    const topSources = Object.entries(sourceMap)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);

    // ── TOP LAPTOP ────────────────────────────────────────────────────────────
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
        todayProfit:        todayGrossProfit,
        todayTransactions:  todayTransactions?.length || 0,
        laptopReady:        laptops?.length || 0,
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