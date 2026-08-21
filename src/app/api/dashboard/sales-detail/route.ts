import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { PERMISSIONS, withAuth, AuthUser } from "@/lib/auth";
import { fetchAllRows } from "@/lib/supabaseFetch";

function getTodayWIB(): string {
  const WIB = 7 * 60 * 60 * 1000;
  const nowWIB = new Date(Date.now() + WIB);
  return nowWIB.toISOString().split("T")[0];
}

function getDealPrice(item: any): number {
  return Number(item.deal_price || item.amount || 0);
}

// ✅ FIX: dulu profit di sini dihitung dari kolom `inventory_price` yang
// tersimpan di baris transaksi (bisa basi kalau harga modal unit diedit
// belakangan). Endpoint dashboard lain (gross-profit-detail, stats,
// transaction-detail) semuanya pakai purchase_price LIVE dari laptop_units —
// disamakan di sini supaya angka profit konsisten antar dashboard.
async function buildUnitMap(
  transactions: any[]
): Promise<Map<string, number>> {
  const allUnitIds = new Set<string>();
  for (const trx of transactions) {
    if (Array.isArray(trx.unit_ids) && trx.unit_ids.length > 0) {
      for (const uid of trx.unit_ids) if (uid) allUnitIds.add(uid);
    } else if (trx.unit_id) {
      allUnitIds.add(trx.unit_id);
    }
  }
  if (allUnitIds.size === 0) return new Map();

  const { data: units } = await supabase
    .from("laptop_units")
    .select("id, purchase_price")
    .in("id", Array.from(allUnitIds));

  const map = new Map<string, number>();
  for (const u of units ?? []) map.set(u.id, Number(u.purchase_price ?? 0));
  return map;
}

function calcProfit(item: any, unitMap: Map<string, number>): number {
  const dealPrice = getDealPrice(item);
  let totalPurchasePrice = 0;

  if (Array.isArray(item.unit_ids) && item.unit_ids.length > 0) {
    for (const uid of item.unit_ids) totalPurchasePrice += unitMap.get(uid) ?? 0;
  } else if (item.unit_id) {
    totalPurchasePrice = unitMap.get(item.unit_id) ?? 0;
  }

  return totalPurchasePrice > 0 ? dealPrice - totalPurchasePrice : 0;
}

async function handler(req: NextRequest, _ctx: any, user: AuthUser) {
  try {
    const WIB = 7 * 60 * 60 * 1000;
    const today = getTodayWIB();

    const nowWIB = new Date(Date.now() + WIB);
    const monthStart = new Date(nowWIB.getUTCFullYear(), nowWIB.getUTCMonth(), 1)
      .toISOString().split("T")[0];

    const dayStart = new Date(nowWIB);
    dayStart.setUTCDate(dayStart.getUTCDate() - 29);
    const dayStartStr = dayStart.toISOString().split("T")[0];

    // ✅ FIX: dulu .select("*") tanpa pagination — Supabase membatasi hasil ke
    // 1000 baris default, jadi bulan dengan transaksi >1000 baris tampil
    // total/profit lebih kecil dari sebenarnya tanpa pesan error.
    const [todayTrx, monthTrx, dailyTrx] = await Promise.all([
      fetchAllRows((from, to) =>
        supabase
          .from("transactions")
          .select("*")
          .eq("status", "PAID")
          .eq("pickup_date", today)
          .range(from, to)
      ),
      fetchAllRows((from, to) =>
        supabase
          .from("transactions")
          .select("*")
          .eq("status", "PAID")
          .gte("pickup_date", monthStart)
          .lte("pickup_date", today)
          .range(from, to)
      ),
      fetchAllRows((from, to) =>
        supabase
          .from("transactions")
          .select("*")
          .eq("status", "PAID")
          .gte("pickup_date", dayStartStr)
          .lte("pickup_date", today)
          .range(from, to)
      ),
    ]);

    const unitMap = await buildUnitMap([...(todayTrx ?? []), ...(monthTrx ?? []), ...(dailyTrx ?? [])]);

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
      salesMap[groupKey].profit  += calcProfit(item, unitMap);
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
      dailyDetailMap[groupKey][date].profit  += calcProfit(item, unitMap);
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

    // ✅ SECURITY FIX: profit hanya untuk role finance. Untuk role lain, buang
    // `profit` dari today/monthly, tiap salesPerformance, & nested dailyBreakdown.
    const showFin = (user.roles ?? [user.role]).some(
      (r) => (PERMISSIONS.VIEW_FINANCIALS as string[]).includes(r)
    );
    const safeSalesPerformance = showFin
      ? salesPerformance
      : salesPerformance.map(({ profit, dailyBreakdown, ...rest }: any) => ({
          ...rest,
          dailyBreakdown: (dailyBreakdown ?? []).map(
            ({ profit: _p, ...d }: any) => d
          ),
        }));

    return NextResponse.json({
      success: true,
      data: {
        today: {
          count:   todayTrx?.length || 0,
          revenue: todayTrx?.reduce((acc, item) => acc + getDealPrice(item), 0) || 0,
          ...(showFin ? { profit: todayTrx?.reduce((acc, item) => acc + calcProfit(item, unitMap), 0) || 0 } : {}),
        },
        monthly: {
          count:   monthTrx?.length || 0,
          revenue: monthTrx?.reduce((acc, item) => acc + getDealPrice(item), 0) || 0,
          ...(showFin ? { profit: monthTrx?.reduce((acc, item) => acc + calcProfit(item, unitMap), 0) || 0 } : {}),
        },
        salesPerformance: safeSalesPerformance,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(handler, PERMISSIONS.VIEW_DASHBOARD);