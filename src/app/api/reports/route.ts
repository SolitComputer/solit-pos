import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";

async function handler(req: NextRequest, ctx: any, user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get("from") || "";
    const dateTo   = searchParams.get("to")   || "";
    const groupBy  = searchParams.get("group") || "day";

    if (!dateFrom || !dateTo) {
      return NextResponse.json(
        { success: false, message: "Parameter 'from' dan 'to' wajib diisi" },
        { status: 400 }
      );
    }

    const { data: transactions, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("status", "PAID")
      .gte("pickup_date", dateFrom)  
      .lte("pickup_date", dateTo)    
      .order("pickup_date", { ascending: true });

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    const txList = transactions || [];

    const totalRevenue = txList.reduce((s, t) => s + Number(t.deal_price || t.amount || 0), 0);
    const totalProfit  = txList.reduce((s, t) => {
      const deal = Number(t.deal_price || t.amount || 0);
      const inv  = Number(t.inventory_price || 0);
      return s + (inv > 0 ? deal - inv : Number(t.other || 0));
    }, 0);
    const totalTrx = txList.length;
    const avgDeal  = totalTrx > 0 ? Math.round(totalRevenue / totalTrx) : 0;

    const getGroupKey = (pickupDate: string): string => {
      if (!pickupDate) return "unknown";

      if (groupBy === "month") {
        // "2026-06-07" → "2026-06"
        return pickupDate.slice(0, 7);
      }
      if (groupBy === "week") {
        const [y, m, d] = pickupDate.split("-").map(Number);
        const date = new Date(y, m - 1, d);
        const day  = date.getDay() || 7;
        const dt   = new Date(date);
        dt.setDate(dt.getDate() + 4 - day);
        const yearStart = new Date(dt.getFullYear(), 0, 1);
        const weekNo = Math.ceil((((dt.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
        return `${dt.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
      }
      return pickupDate;
    };

    const getLabel = (key: string, pickupDate: string): string => {
      if (groupBy === "day") {
        // Parse dari "YYYY-MM-DD" tanpa timezone issue
        const [y, m, d] = pickupDate.split("-").map(Number);
        return new Date(y, m - 1, d).toLocaleDateString("id-ID", {
          day: "numeric", month: "short", year: "numeric",
        });
      }
      if (groupBy === "month") {
        const [y, m] = key.split("-").map(Number);
        return new Date(y, m - 1, 1).toLocaleDateString("id-ID", {
          month: "long", year: "numeric",
        });
      }
      // week
      const [year, week] = key.split("-W");
      return `Minggu ${week}, ${year}`;
    };

    const groupMap: Record<string, {
      revenue: number; profit: number; trxCount: number; label: string;
    }> = {};

    txList.forEach(t => {
      const pickupDate = (t.pickup_date as string) || "";
      const key  = getGroupKey(pickupDate);
      const deal = Number(t.deal_price || t.amount || 0);
      const inv  = Number(t.inventory_price || 0);
      const prof = inv > 0 ? deal - inv : Number(t.other || 0);

      if (!groupMap[key]) {
        groupMap[key] = {
          revenue: 0, profit: 0, trxCount: 0,
          label: getLabel(key, pickupDate),
        };
      }

      groupMap[key].revenue  += deal;
      groupMap[key].profit   += prof;
      groupMap[key].trxCount += 1;
    });

    const trend = Object.entries(groupMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => ({ key, ...val }));

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

export const GET = withAuth(handler, ["ADMIN", "ACCOUNTING", "KEPALA_MARKETING", "PROGRAMMER", "ASISTEN_CEO"]);
