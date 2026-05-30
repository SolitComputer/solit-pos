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

    const { data: todayTransactions } = await supabase
      .from("transactions")
      .select("*")
      .eq("status", "PAID")
      .gte("paid_at", startToday);

    const { data: laptops } = await supabase
      .from("laptops")
      .select("*")
      .eq("status", "SIAP_JUAL")
      .gt("qty", 0);

    const todayRevenue =
      todayTransactions?.reduce((acc, item) => acc + (item.deal_price || item.amount || 0), 0) || 0;

    // ✅ FIX: Hitung profit = deal_price - inventory_price per transaksi
    // Kalau inventory_price = 0 (data lama), fallback ke field "other" yang tersimpan
    const todayProfit =
      todayTransactions?.reduce((acc, item) => {
        const dealPrice = Number(item.deal_price || item.amount || 0);
        const inventoryPrice = Number(item.inventory_price || 0);

        // Kalau inventory_price ada dan > 0, hitung dari sumber data
        // Kalau tidak ada (data lama), pakai field "other" yang sudah tersimpan
        const profit = inventoryPrice > 0
          ? dealPrice - inventoryPrice
          : Number(item.other || 0);

        return acc + profit;
      }, 0) || 0;

    const stockTotal =
      laptops?.reduce((acc, item) => acc + (item.qty || 0), 0) || 0;

    // ── Top Sales ─────────────────────────────────────────────────────────
    const salesMap: Record<string, { total: number; profit: number }> = {};
    todayTransactions?.forEach((item) => {
      const sales = item.sales_name || "Unknown";
      if (!salesMap[sales]) salesMap[sales] = { total: 0, profit: 0 };
      salesMap[sales].total += 1;

      const dealPrice = Number(item.deal_price || item.amount || 0);
      const inventoryPrice = Number(item.inventory_price || 0);
      const profit = inventoryPrice > 0
        ? dealPrice - inventoryPrice
        : Number(item.other || 0);

      salesMap[sales].profit += profit;
    });

    const topSales = Object.entries(salesMap)
      .map(([name, data]) => ({ name, total: data.total, profit: data.profit }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    // ── Top Sources ───────────────────────────────────────────────────────
    const sourceMap: Record<string, number> = {};
    todayTransactions?.forEach((item) => {
      const source = item.source_platform || "Unknown";
      sourceMap[source] = (sourceMap[source] || 0) + 1;
    });

    const topSources = Object.entries(sourceMap)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

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

    // ── Debug log (hapus di production kalau tidak perlu) ─────────────────
    console.log("[STATS] Today transactions:", todayTransactions?.length);
    console.log("[STATS] Revenue:", todayRevenue, "| Profit:", todayProfit);
    todayTransactions?.forEach(t => {
      console.log(
        `  - ${t.invoice_number}: deal=${t.deal_price || t.amount}, modal=${t.inventory_price}, profit=${(t.deal_price || t.amount) - (t.inventory_price || 0)}`
      );
    });

    return NextResponse.json({
      success: true,
      data: {
        todayRevenue,
        todayProfit,
        todayTransactions: todayTransactions?.length || 0,
        laptopReady: laptops?.length || 0,
        stockTotal,
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