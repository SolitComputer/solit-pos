// src/app/api/dashboard/revenue-detail/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, PERMISSIONS } from "@/lib/auth";
import { fetchAllRows } from "@/lib/supabaseFetch";
import { chunkArray } from "@/lib/chunkArray";

function getWIBOffset() { return 7 * 60 * 60 * 1000; }

function wibDateToUTCRange(dateWIB: string): { start: string; end: string } {
    const [y, m, d] = dateWIB.split("-").map(Number);
    const WIB = getWIBOffset();
    const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - WIB);
    const end = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0) - WIB);
    return { start: start.toISOString(), end: end.toISOString() };
}

function getTodayWIB(): string {
    return new Date(Date.now() + getWIBOffset()).toISOString().split("T")[0];
}

function getDealPrice(item: any): number {
    return Number(item.deal_price || item.amount || 0);
}

// GROSS PROFIT = deal_price - live purchase_price dari laptop_units
// (disamakan dengan calcMarginFromMap di stats/route.ts, BUKAN kolom inventory_price)
function calcGrossProfit(item: any, unitMap: Map<string, number>): number {
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

async function handler(req: NextRequest) {
    try {
        const WIB = getWIBOffset();
        const todayWIB = getTodayWIB();
        const [ty, tm, td] = todayWIB.split("-").map(Number);

        // ── Range bulan ini ──────────────────────────────────────────────────
        const monthStart = new Date(Date.UTC(ty, tm - 1, 1, 0, 0, 0) - WIB);
        const monthEnd = new Date(Date.UTC(ty, tm, 1, 0, 0, 0) - WIB);

        // ── Range 30 hari terakhir untuk data harian ─────────────────────────
        const day30Start = new Date(Date.now() + WIB);
        day30Start.setUTCDate(day30Start.getUTCDate() - 29);
        const day30StartStr = day30Start.toISOString().split("T")[0];
        const day30Range = wibDateToUTCRange(day30StartStr);

        // ── Fetch semua transaksi bulan ini ──────────────────────────────────
        // ✅ FIX: dulu tanpa pagination — Supabase membatasi hasil ke 1000 baris
        // default, jadi bulan dengan transaksi >1000 baris tampil revenue lebih
        // kecil dari sebenarnya tanpa pesan error. Sekarang pakai fetchAllRows.
        const monthlyTx = await fetchAllRows((from, to) =>
            supabase
                .from("transactions")
                .select("paid_at, deal_price, amount, unit_id, unit_ids, sales_name")
                .eq("status", "PAID")
                .gte("paid_at", monthStart.toISOString())
                .lt("paid_at", monthEnd.toISOString())
                .order("paid_at", { ascending: false })
                .range(from, to)
        );

        const txList = monthlyTx || [];

        // ── BATCH FETCH purchase_price dari laptop_units ──────────────────────
        const allUnitIds = new Set<string>();
        for (const trx of txList) {
            if (trx.unit_id) allUnitIds.add(trx.unit_id);
            if (Array.isArray(trx.unit_ids)) {
                for (const uid of trx.unit_ids) { if (uid) allUnitIds.add(uid); }
            }
        }

        const unitMap = new Map<string, number>();
        if (allUnitIds.size > 0) {
            const chunks = chunkArray(Array.from(allUnitIds), 150);
            for (const chunk of chunks) {
                const { data: units } = await supabase
                    .from("laptop_units")
                    .select("id, purchase_price")
                    .in("id", chunk);
                for (const unit of units ?? []) {
                    unitMap.set(unit.id, Number(unit.purchase_price ?? 0));
                }
            }
        }
        // ─────────────────────────────────────────────────────────────────────

        // ── Today stats ──────────────────────────────────────────────────────
        const todayRange = wibDateToUTCRange(todayWIB);
        const todayTx = txList.filter(t =>
            t.paid_at >= todayRange.start && t.paid_at < todayRange.end
        );
        const todayRevenue = todayTx.reduce((s, t) => s + getDealPrice(t), 0);
        const todayProfit = todayTx.reduce((s, t) => s + calcGrossProfit(t, unitMap), 0);

        // ── Monthly stats ────────────────────────────────────────────────────
        const monthlyRevenue = txList.reduce((s, t) => s + getDealPrice(t), 0);
        const monthlyProfit = txList.reduce((s, t) => s + calcGrossProfit(t, unitMap), 0);

        // ── Daily breakdown (30 hari) ────────────────────────────────────────
        const dailyMap: Record<string, { revenue: number; profit: number; count: number }> = {};

        // Init 30 hari
        for (let i = 29; i >= 0; i--) {
            const d = new Date(Date.now() + WIB);
            d.setUTCDate(d.getUTCDate() - i);
            const key = d.toISOString().split("T")[0];
            dailyMap[key] = { revenue: 0, profit: 0, count: 0 };
        }

        txList.forEach(t => {
            if (!t.paid_at) return;
            const wibDate = new Date(new Date(t.paid_at).getTime() + WIB)
                .toISOString().split("T")[0];
            if (dailyMap[wibDate]) {
                dailyMap[wibDate].revenue += getDealPrice(t);
                dailyMap[wibDate].profit += calcGrossProfit(t, unitMap);
                dailyMap[wibDate].count += 1;
            }
        });

        const daily = Object.entries(dailyMap)
            .map(([date, data]) => {
                const [y, m, d] = date.split("-").map(Number);
                const label = new Date(y, m - 1, d).toLocaleDateString("id-ID", {
                    weekday: "short", day: "numeric", month: "short",
                });
                return { date, label, ...data };
            })
            .filter(d => d.count > 0) // hanya tampilkan hari yang ada transaksi
            .reverse(); // terbaru dulu

        // ── Weekly breakdown (8 minggu terakhir) ─────────────────────────────
        const weeklyMap: Record<string, { revenue: number; profit: number; count: number; weekStart: string }> = {};

        txList.forEach(t => {
            if (!t.paid_at) return;
            const wibDate = new Date(new Date(t.paid_at).getTime() + WIB);
            // Cari Senin minggu ini
            const dow = wibDate.getDay(); // 0=Minggu
            const diffToMonday = dow === 0 ? -6 : 1 - dow;
            const monday = new Date(wibDate);
            monday.setDate(monday.getDate() + diffToMonday);
            const weekKey = monday.toISOString().split("T")[0];

            if (!weeklyMap[weekKey]) {
                weeklyMap[weekKey] = { revenue: 0, profit: 0, count: 0, weekStart: weekKey };
            }
            weeklyMap[weekKey].revenue += getDealPrice(t);
            weeklyMap[weekKey].profit += calcGrossProfit(t, unitMap);
            weeklyMap[weekKey].count += 1;
        });

        const weekly = Object.entries(weeklyMap)
            .map(([weekStart, data]) => {
                const [y, m, d] = weekStart.split("-").map(Number);
                const startDate = new Date(y, m - 1, d);
                const endDate = new Date(y, m - 1, d + 6);
                const label = `${startDate.toLocaleDateString("id-ID", { day: "numeric", month: "short" })} – ${endDate.toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`;
                return { weekStart, label, revenue: data.revenue, profit: data.profit, count: data.count };
            })
            .sort((a, b) => b.weekStart.localeCompare(a.weekStart)); // terbaru dulu

        return NextResponse.json({
            success: true,
            data: {
                today: { revenue: todayRevenue, profit: todayProfit, count: todayTx.length },
                daily,
                weekly,
                monthly: { revenue: monthlyRevenue, profit: monthlyProfit, count: txList.length },
            },
        });
    } catch (err) {
        console.error("[revenue-detail]", err);
        return NextResponse.json({ success: false }, { status: 500 });
    }
}

export const GET = withAuth(handler, PERMISSIONS.VIEW_FINANCIALS);