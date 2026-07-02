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

    // ── Step 1: Kumpulkan semua sales_id unik dari dailyTrx ─────────
    const allSalesIds = new Set<string>();
    for (const trx of dailyTrx ?? []) {
      if (trx.sales_id) allSalesIds.add(trx.sales_id);
    }

    // ── Step 2: Fetch nama canonical dari public.users ───────────────
    // Pakai nama terbaru dari users table, bukan snapshot sales_name
    const userNameMap = new Map<string, string>(); // sales_id → current name
    if (allSalesIds.size > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id, name")
        .in("id", Array.from(allSalesIds));

      for (const u of users ?? []) {
        if (u.id && u.name) userNameMap.set(u.id, u.name);
      }
    }

    /**
     * Resolve group key & display name per transaksi.
     *
     * Priority:
     * 1. sales_id ada & user ditemukan  → groupKey = "uid:{id}", name = nama terbaru dari DB
     * 2. sales_id ada tapi user deleted → groupKey = "uid:{id}", name = sales_name lama
     * 3. Tidak ada sales_id (transaksi lama) → groupKey = "name:{sales_name}", name = sales_name
     */
    function resolveCanonical(item: any): { groupKey: string; displayName: string } {
      const salesId = item.sales_id as string | null | undefined;
      const rawName = (item.sales_name as string | null | undefined) || "Unknown";

      if (salesId) {
        const currentName = userNameMap.get(salesId);
        return {
          groupKey: `uid:${salesId}`,
          // Selalu pakai nama terbaru dari DB kalau ada
          displayName: currentName ?? rawName,
        };
      }

      // Fallback: transaksi lama tanpa sales_id
      return {
        groupKey: `name:${rawName.toLowerCase().trim()}`,
        displayName: rawName,
      };
    }

    // ── Step 3: Build salesMap dengan dedup by groupKey ─────────────
    const salesMap: Record<string, {
      displayName: string;
      total: number;
      revenue: number;
      profit: number;
    }> = {};

    dailyTrx?.forEach((item) => {
      const { groupKey, displayName } = resolveCanonical(item);

      if (!salesMap[groupKey]) {
        salesMap[groupKey] = { displayName, total: 0, revenue: 0, profit: 0 };
      }

      salesMap[groupKey].total   += 1;
      salesMap[groupKey].revenue += getDealPrice(item);
      salesMap[groupKey].profit  += calcProfit(item);
    });

    // ── Step 4: Daily breakdown dengan groupKey yang sama ───────────
    const dailyDetailMap: Record<string, Record<string, {
      total: number;
      revenue: number;
      profit: number;
    }>> = {};

    dailyTrx?.forEach((item) => {
      const { groupKey } = resolveCanonical(item);
      const date = item.pickup_date as string;

      if (!dailyDetailMap[groupKey]) dailyDetailMap[groupKey] = {};
      if (!dailyDetailMap[groupKey][date]) {
        dailyDetailMap[groupKey][date] = { total: 0, revenue: 0, profit: 0 };
      }

      dailyDetailMap[groupKey][date].total   += 1;
      dailyDetailMap[groupKey][date].revenue += getDealPrice(item);
      dailyDetailMap[groupKey][date].profit  += calcProfit(item);
    });

    // ── Step 5: Format output ────────────────────────────────────────
    const salesPerformance = Object.entries(salesMap)
      .map(([groupKey, data]) => {
        const dailyDetail = dailyDetailMap[groupKey] || {};
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
          name: data.displayName,
          total: data.total,
          revenue: data.revenue,
          profit: data.profit,
          dailyBreakdown,
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    return NextResponse.json({
      success: true,
      data: {
        today: {
          count:   todayTrx?.length || 0,
          revenue: todayTrx?.reduce((acc, item) => acc + getDealPrice(item), 0) || 0,
          profit:  todayTrx?.reduce((acc, item) => acc + calcProfit(item), 0)   || 0,
        },
        monthly: {
          count:   monthTrx?.length || 0,
          revenue: monthTrx?.reduce((acc, item) => acc + getDealPrice(item), 0) || 0,
          profit:  monthTrx?.reduce((acc, item) => acc + calcProfit(item), 0)   || 0,
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