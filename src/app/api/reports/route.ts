import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";

async function handler(req: NextRequest, ctx: any, user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const dateFrom  = searchParams.get("from")  || "";
    const dateTo    = searchParams.get("to")    || "";
    const groupBy   = searchParams.get("group") || "day";

    // Validasi tanggal
    if (!dateFrom || !dateTo) {
      return NextResponse.json(
        { success: false, message: "Parameter 'from' dan 'to' wajib diisi" },
        { status: 400 }
      );
    }

    const startDate = new Date(dateFrom);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(dateTo);
    endDate.setHours(23, 59, 59, 999);

    // Fetch semua transaksi PAID dalam rentang tanggal
    const { data: transactions, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("status", "PAID")
      .gte("paid_at", startDate.toISOString())
      .lte("paid_at", endDate.toISOString())
      .order("paid_at", { ascending: true });

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    const txList = transactions || [];

    // ── Summary keseluruhan ──────────────────────────────────────────────
    const totalRevenue   = txList.reduce((s, t) => s + Number(t.deal_price || t.amount || 0), 0);
    const totalProfit    = txList.reduce((s, t) => {
      const deal      = Number(t.deal_price || t.amount || 0);
      const inventory = Number(t.inventory_price || 0);
      return s + (inventory > 0 ? deal - inventory : Number(t.other || 0));
    }, 0);
    const totalTrx       = txList.length;
    const avgDeal        = totalTrx > 0 ? Math.round(totalRevenue / totalTrx) : 0;

    // ── Group by ─────────────────────────────────────────────────────────
    const getGroupKey = (dateStr: string): string => {
      const d = new Date(dateStr);
      if (groupBy === "month") {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      }
      if (groupBy === "week") {
        // ISO week
        const day  = d.getDay() || 7;
        const dt   = new Date(d);
        dt.setDate(dt.getDate() + 4 - day);
        const yearStart = new Date(dt.getFullYear(), 0, 1);
        const weekNo = Math.ceil((((dt.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
        return `${dt.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
      }
      // default: day
      return d.toISOString().split("T")[0];
    };

    const groupMap: Record<string, {
      revenue: number; profit: number; trxCount: number; label: string;
    }> = {};

    txList.forEach(t => {
      const key   = getGroupKey(t.paid_at || t.created_at);
      const deal  = Number(t.deal_price || t.amount || 0);
      const inv   = Number(t.inventory_price || 0);
      const prof  = inv > 0 ? deal - inv : Number(t.other || 0);

      if (!groupMap[key]) {
        const d = new Date(t.paid_at || t.created_at);
        let label = key;
        if (groupBy === "day") {
          label = d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
        } else if (groupBy === "month") {
          label = d.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
        } else {
          label = `Minggu ${key.split("-W")[1]}, ${key.split("-W")[0]}`;
        }
        groupMap[key] = { revenue: 0, profit: 0, trxCount: 0, label };
      }

      groupMap[key].revenue  += deal;
      groupMap[key].profit   += prof;
      groupMap[key].trxCount += 1;
    });

    const trend = Object.entries(groupMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => ({ key, ...val }));

    // ── Top Sales ─────────────────────────────────────────────────────────
    const salesMap: Record<string, { revenue: number; profit: number; count: number }> = {};
    txList.forEach(t => {
      const name = t.sales_name || "Unknown";
      if (!salesMap[name]) salesMap[name] = { revenue: 0, profit: 0, count: 0 };
      const deal = Number(t.deal_price || t.amount || 0);
      const inv  = Number(t.inventory_price || 0);
      salesMap[name].revenue += deal;
      salesMap[name].profit  += inv > 0 ? deal - inv : Number(t.other || 0);
      salesMap[name].count   += 1;
    });

    const topSales = Object.entries(salesMap)
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // ── Top Laptop ────────────────────────────────────────────────────────
    const laptopMap: Record<string, { revenue: number; profit: number; count: number }> = {};
    txList.forEach(t => {
      const name = t.laptop_name || "Unknown";
      if (!laptopMap[name]) laptopMap[name] = { revenue: 0, profit: 0, count: 0 };
      const deal = Number(t.deal_price || t.amount || 0);
      const inv  = Number(t.inventory_price || 0);
      laptopMap[name].revenue += deal;
      laptopMap[name].profit  += inv > 0 ? deal - inv : Number(t.other || 0);
      laptopMap[name].count   += 1;
    });

    const topLaptop = Object.entries(laptopMap)
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // ── Top Source ────────────────────────────────────────────────────────
    const sourceMap: Record<string, { revenue: number; count: number }> = {};
    txList.forEach(t => {
      const src = t.source_platform || "Unknown";
      if (!sourceMap[src]) sourceMap[src] = { revenue: 0, count: 0 };
      sourceMap[src].revenue += Number(t.deal_price || t.amount || 0);
      sourceMap[src].count   += 1;
    });

    const topSource = Object.entries(sourceMap)
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.revenue - a.revenue);

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalRevenue,
          totalProfit,
          totalTrx,
          avgDeal,
          profitMargin: totalRevenue > 0
            ? Math.round((totalProfit / totalRevenue) * 100 * 10) / 10
            : 0,
        },
        trend,
        topSales,
        topLaptop,
        topSource,
        dateFrom,
        dateTo,
      },
    });
  } catch (err) {
    console.error("[REPORTS]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(handler, ["ADMIN", "ACCOUNTING"]);