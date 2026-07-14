// src/app/api/dashboard/stats/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { PERMISSIONS, withAuth } from "@/lib/auth";
import { fetchAllRows } from "@/lib/supabaseFetch";

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

function calcMarginFromMap(item: any, unitMap: Map<string, number>): number {
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

/**
 * Hitung jumlah unit laptop yang benar-benar terjual dalam 1 transaksi.
 * - Transaksi multi-unit  → unit_ids.length  (misal: 3 laptop sekaligus = 3)
 * - Transaksi single-unit → 1                (ada unit_id tapi bukan array)
 * - Transaksi lama        → fallback qty/quantity/1
 */
function countUnitsSold(item: any): number {
  if (Array.isArray(item.unit_ids) && item.unit_ids.length > 0) {
    return item.unit_ids.length;
  }
  if (item.unit_id) return 1;
  return Number(item.qty || item.quantity || 1);
}

function wibDateToUTCRange(dateWIB: string): { start: string; end: string } {
  const [y, m, d] = dateWIB.split("-").map(Number);
  const startWIB = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - 7 * 60 * 60 * 1000);
  const endWIB = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0) - 7 * 60 * 60 * 1000);
  return { start: startWIB.toISOString(), end: endWIB.toISOString() };
}

async function handler(req: NextRequest) {
  try {
    const today = getTodayWIB();
    const yesterday = getYesterdayWIB();
    const weekStart = getLast7DaysWIB();

    const todayRange = wibDateToUTCRange(today);
    const yesterdayRange = wibDateToUTCRange(yesterday);
    const weekStartRange = wibDateToUTCRange(weekStart);
    const weekEndRange = wibDateToUTCRange(today);

    // Pakai fetchAllRows agar tidak terpotong di 1000 baris (undercount omzet).
    const [
      todayTransactions,
      laptops,
      weeklyTransactions,
      yesterdayTransactions,
    ] = await Promise.all([
      fetchAllRows((f, t) => supabase.from("transactions").select("*").eq("status", "PAID")
        .gte("paid_at", todayRange.start).lt("paid_at", todayRange.end).range(f, t)),
      fetchAllRows((f, t) => supabase.from("laptops").select("*").eq("status", "SIAP_JUAL").gt("qty", 0).range(f, t)),
      fetchAllRows((f, t) => supabase.from("transactions").select("*").eq("status", "PAID")
        .gte("paid_at", weekStartRange.start).lt("paid_at", weekEndRange.end).range(f, t)),
      fetchAllRows((f, t) => supabase.from("transactions").select("*").eq("status", "PAID")
        .gte("paid_at", yesterdayRange.start).lt("paid_at", yesterdayRange.end).range(f, t)),
    ]);

    // ── BATCH FETCH purchase_price dari laptop_units ──────────────────────
    const allTransactions = [
      ...(todayTransactions ?? []),
      ...(weeklyTransactions ?? []),
      ...(yesterdayTransactions ?? []),
    ];

    const allUnitIds = new Set<string>();
    for (const trx of allTransactions) {
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

    // ── TODAY STATS ──────────────────────────────────────────────────────
    const todayRevenue =
      todayTransactions?.reduce((acc, item) => acc + getDealPrice(item), 0) || 0;

    const todayGrossProfit =
      todayTransactions?.reduce((acc, item) => acc + calcMarginFromMap(item, unitMap), 0) || 0;

    // ── YESTERDAY STATS ──────────────────────────────────────────────────
    const yesterdayRevenue =
      yesterdayTransactions?.reduce((acc, item) => acc + getDealPrice(item), 0) || 0;

    const yesterdayGrossProfit =
      yesterdayTransactions?.reduce((acc, item) => acc + calcMarginFromMap(item, unitMap), 0) || 0;

    const yesterdayTrxCount = yesterdayTransactions?.length || 0;

    // ── % CHANGE ─────────────────────────────────────────────────────────
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

    // ── STOCK ─────────────────────────────────────────────────────────────
    const stockTotal =
      laptops?.reduce((acc, item) => acc + (item.qty || 0), 0) || 0;

    // ── WEEKLY TREND ─────────────────────────────────────────────────────
    const trendMap: Record<string, {
      revenue: number; profit: number; trxCount: number; laptopSold: number;
    }> = {};

    for (let i = 6; i >= 0; i--) {
      const WIB = 7 * 60 * 60 * 1000;
      const d = new Date(Date.now() + WIB);
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().split("T")[0];
      trendMap[key] = { revenue: 0, profit: 0, trxCount: 0, laptopSold: 0 };
    }

    weeklyTransactions?.forEach((item) => {
      if (!item.paid_at) return;
      const paidAtWIB = new Date(new Date(item.paid_at).getTime() + 7 * 60 * 60 * 1000);
      const dateKey = paidAtWIB.toISOString().split("T")[0];
      if (trendMap[dateKey]) {
        trendMap[dateKey].revenue += getDealPrice(item);
        trendMap[dateKey].profit += calcMarginFromMap(item, unitMap);
        trendMap[dateKey].trxCount += 1;
        trendMap[dateKey].laptopSold += countUnitsSold(item); // ✅ FIX: hitung unit nyata
      }
    });

    const weeklyTrend = Object.entries(trendMap).map(([date, data]) => {
      const [y, m, d] = date.split("-").map(Number);
      const label = new Date(y, m - 1, d).toLocaleDateString("id-ID", {
        weekday: "short", day: "numeric",
      });
      return { date, label, ...data };
    });

    // ── TOP SALES ─────────────────────────────────────────────────────────
    const salesMap: Record<string, { total: number; profit: number }> = {};
    todayTransactions?.forEach((item) => {
      const sales = item.sales_name || "Unknown";
      if (!salesMap[sales]) salesMap[sales] = { total: 0, profit: 0 };
      salesMap[sales].total += 1;
      salesMap[sales].profit += calcMarginFromMap(item, unitMap);
    });

    const topSales = Object.entries(salesMap)
      .map(([name, data]) => ({ name, total: data.total, profit: data.profit }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    // ── TOP SOURCES ───────────────────────────────────────────────────────
    const sourceMap: Record<string, number> = {};
    weeklyTransactions?.forEach((item) => {
      const source = item.source_platform || "Unknown";
      sourceMap[source] = (sourceMap[source] || 0) + 1;
    });

    const topSources = Object.entries(sourceMap)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);

    // ── TOP LAPTOP ────────────────────────────────────────────────────────
    // ✅ FIX: hitung per unit nyata, bukan per transaksi
    // Contoh: 1 transaksi dengan unit_ids = [id1, id2] → laptop_name = "Acer X" → +2 unit
    const laptopMap: Record<string, number> = {};
    todayTransactions?.forEach((item) => {
      const laptop = item.laptop_name || "Unknown";
      laptopMap[laptop] = (laptopMap[laptop] || 0) + countUnitsSold(item);
    });

    const topLaptop = Object.entries(laptopMap)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    // ── TOTAL LAPTOP TERJUAL HARI INI ─────────────────────────────────────
    // ✅ FIX: hitung unit nyata dari unit_ids / unit_id
    const todayLaptopSold =
      todayTransactions?.reduce(
        (acc, item) => acc + countUnitsSold(item), 0
      ) || 0;

    return NextResponse.json({
      success: true,
      data: {
        todayRevenue,
        todayProfit: todayGrossProfit,
        todayTransactions: todayTransactions?.length || 0,
        todayLaptopSold,
        laptopReady: laptops?.length || 0,
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