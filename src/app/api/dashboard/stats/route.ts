import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { PERMISSIONS, withAuth } from "@/lib/auth";

async function handler(req: NextRequest) {
  try {
    const today = new Date();
    const startToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    ).toISOString();

    // ── 7 hari terakhir untuk weekly trend ────────────────────────────────
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const startYesterday = new Date(
      yesterday.getFullYear(),
      yesterday.getMonth(),
      yesterday.getDate()
    ).toISOString();
    const endYesterday = new Date(
      yesterday.getFullYear(),
      yesterday.getMonth(),
      yesterday.getDate() + 1
    ).toISOString();

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
        .gte("paid_at", startToday),
      supabase
        .from("laptops")
        .select("*")
        .eq("status", "SIAP_JUAL")
        .gt("qty", 0),
      supabase
        .from("transactions")
        .select("*")
        .eq("status", "PAID")
        .gte("paid_at", sevenDaysAgo.toISOString()),
      supabase
        .from("transactions")
        .select("*")
        .eq("status", "PAID")
        .gte("paid_at", startYesterday)
        .lt("paid_at", endYesterday),
    ]);

    // ── Helper profit calc ────────────────────────────────────────────────
    const calcProfit = (item: any): number => {
      const dealPrice = Number(item.deal_price || item.amount || 0);
      const inventoryPrice = Number(item.inventory_price || 0);
      return inventoryPrice > 0
        ? dealPrice - inventoryPrice
        : Number(item.other || 0);
    };

    // ── Today stats ───────────────────────────────────────────────────────
    const todayRevenue =
      todayTransactions?.reduce(
        (acc, item) => acc + Number(item.deal_price || item.amount || 0),
        0
      ) || 0;

    const todayProfit =
      todayTransactions?.reduce((acc, item) => acc + calcProfit(item), 0) || 0;

    // ── Yesterday stats (untuk % change) ─────────────────────────────────
    const yesterdayRevenue =
      yesterdayTransactions?.reduce(
        (acc, item) => acc + Number(item.deal_price || item.amount || 0),
        0
      ) || 0;

    const yesterdayProfit =
      yesterdayTransactions?.reduce(
        (acc, item) => acc + calcProfit(item),
        0
      ) || 0;

    const yesterdayTrxCount = yesterdayTransactions?.length || 0;

    // % change (hindari divide by zero)
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
        ? Math.round(
          (((todayTransactions?.length || 0) - yesterdayTrxCount) /
            yesterdayTrxCount) *
          100
        )
        : null;

    const stockTotal =
      laptops?.reduce((acc, item) => acc + (item.qty || 0), 0) || 0;

    const trendMap: Record<
      string,
      { revenue: number; profit: number; trxCount: number }
    > = {};

    // Inisialisasi 7 hari dengan nilai 0
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0]; // "YYYY-MM-DD"
      trendMap[key] = { revenue: 0, profit: 0, trxCount: 0 };
    }

    weeklyTransactions?.forEach((item) => {
      const dateKey = (item.paid_at || item.created_at || "").split("T")[0];
      if (trendMap[dateKey]) {
        trendMap[dateKey].revenue += Number(item.deal_price || item.amount || 0);
        trendMap[dateKey].profit += calcProfit(item);
        trendMap[dateKey].trxCount += 1;
      }
    });

    const weeklyTrend = Object.entries(trendMap).map(([date, data]) => {
      const d = new Date(date);
      const label = d.toLocaleDateString("id-ID", {
        weekday: "short",
        day: "numeric",
      }); // "Sen 26"
      return { date, label, ...data };
    });

    // ── Top Sales ─────────────────────────────────────────────────────────
    const salesMap: Record<string, { total: number; profit: number }> = {};
    todayTransactions?.forEach((item) => {
      const sales = item.sales_name || "Unknown";
      if (!salesMap[sales]) salesMap[sales] = { total: 0, profit: 0 };
      salesMap[sales].total += 1;
      salesMap[sales].profit += calcProfit(item);
    });

    const topSales = Object.entries(salesMap)
      .map(([name, data]) => ({ name, total: data.total, profit: data.profit }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    // ── Top Sources ───────────────────────────────────────────────────────
    const sourceMap: Record<string, number> = {};
    // Untuk source, ambil dari weekly agar lebih representatif
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
        laptopReady: laptops?.length || 0,
        stockTotal,
        // Perubahan vs kemarin
        revenueChange,
        profitChange,
        trxChange,
        // Tren 7 hari
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