import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { LABA_RUGI_GROUP_NORMAL, LabaRugiGroup, labaRugiGroup } from "@/lib/accounting";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const JOURNAL_CHUNK = 500;

// journal_entries/journal_lines/chart_of_accounts/cashflow_entries dibatasi RLS
// untuk role tertentu (sama seperti src/app/api/akutansi/laba-rugi/route.ts) —
// pakai service-role client biar Reports bisa baca datanya, bukan client anon
// biasa yang dipakai buat query "transactions".
function getAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

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

    // paid_at disimpan sebagai UTC ISO string: "2026-06-16T04:30:00.000Z"
    // WIB = UTC+7, jadi:
    // - "2026-06-16T00:00:00 WIB" = "2026-06-15T17:00:00Z" UTC
    // - "2026-06-16T23:59:59 WIB" = "2026-06-16T16:59:59Z" UTC
    const fromUTC = new Date(`${dateFrom}T00:00:00+07:00`).toISOString();
    const toUTC   = new Date(`${dateTo}T23:59:59+07:00`).toISOString();

    const { data: transactions, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("status", "PAID")
      .gte("paid_at", fromUTC)
      .lte("paid_at", toUTC)
      .order("paid_at", { ascending: true });

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    const txList = transactions || [];
    const totalTrx = txList.length;

    // ✅ FIX: paid_at adalah UTC ISO string ("2026-06-16T04:30:00.000Z")
    // Konversi ke tanggal WIB dengan cara: parse UTC → tambah 7 jam → ambil YYYY-MM-DD
    const getDateWIB = (paidAt: string): string => {
      if (!paidAt) return "";
      try {
        // new Date("2026-06-16T04:30:00.000Z") → timestamp UTC
        // + 7 jam → timestamp WIB
        // toISOString().slice(0,10) → "2026-06-16"
        const utcDate = new Date(paidAt);
        const wibMs = utcDate.getTime() + 7 * 60 * 60 * 1000;
        return new Date(wibMs).toISOString().slice(0, 10);
      } catch {
        return "";
      }
    };

    const getGroupKey = (dateStr: string): string => {
      if (!dateStr) return "unknown";

      if (groupBy === "month") {
        return dateStr.slice(0, 7); // "2026-06"
      }
      if (groupBy === "week") {
        const [y, m, d] = dateStr.split("-").map(Number);
        const date = new Date(y, m - 1, d);
        const day  = date.getDay() || 7;
        const dt   = new Date(date);
        dt.setDate(dt.getDate() + 4 - day);
        const yearStart = new Date(dt.getFullYear(), 0, 1);
        const weekNo = Math.ceil((((dt.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
        return `${dt.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
      }
      // day → "2026-06-16"
      return dateStr;
    };

    const getLabel = (key: string, dateStr: string): string => {
      if (groupBy === "day") {
        const [y, m, d] = dateStr.split("-").map(Number);
        return new Date(y, m - 1, d).toLocaleDateString("id-ID", {
          day: "numeric", month: "short",
        });
      }
      if (groupBy === "month") {
        const [y, m] = key.split("-").map(Number);
        return new Date(y, m - 1, 1).toLocaleDateString("id-ID", {
          month: "short", year: "numeric",
        });
      }
      // week
      const [, week] = key.split("-W");
      return `Minggu ${week}`;
    };

    // ── Revenue & Profit — sumber: journal Akutansi (Laba Rugi) ────────────────
    // Reports mengikuti definisi akun yang sama dengan modul Akutansi
    // (src/lib/accounting.ts::labaRugiGroup), supaya angkanya sinkron dengan
    // halaman Laba Rugi. Difilter per tanggal entry journal (bukan per periode
    // penuh) supaya rentang custom (today/this_week/dll) tetap didukung.
    const admin = getAdmin();

    const { data: journalEntries, error: jeError } = await admin
      .from("journal_entries")
      .select("id, tanggal")
      .gte("tanggal", dateFrom)
      .lte("tanggal", dateTo);
    if (jeError) {
      return NextResponse.json({ success: false, message: jeError.message }, { status: 400 });
    }

    const entryDateMap = new Map<string, string>();
    (journalEntries || []).forEach((e) => entryDateMap.set(e.id, e.tanggal));
    const entryIds = Array.from(entryDateMap.keys());

    const { data: accountsData, error: accError } = await admin
      .from("chart_of_accounts")
      .select("code, name, type");
    if (accError) {
      return NextResponse.json({ success: false, message: accError.message }, { status: 400 });
    }

    const groupByCode = new Map<string, LabaRugiGroup>();
    (accountsData || []).forEach((a) => {
      const g = labaRugiGroup(a);
      if (g && g !== "LABA_DITAHAN") groupByCode.set(a.code, g); // laba ditahan tidak relevan utk rentang custom
    });

    const groupTotals: Record<LabaRugiGroup, number> = {
      PENDAPATAN: 0, MODAL_KELUAR: 0, OPERASIONAL: 0, LUAR_OPERASIONAL: 0, LABA_DITAHAN: 0,
    };
    const journalTrendRaw: Record<string, Record<LabaRugiGroup, number>> = {};

    for (let i = 0; i < entryIds.length; i += JOURNAL_CHUNK) {
      const chunk = entryIds.slice(i, i + JOURNAL_CHUNK);
      const { data: lines, error: lineError } = await admin
        .from("journal_lines")
        .select("entry_id, account_code, side, nominal")
        .in("entry_id", chunk);
      if (lineError) {
        return NextResponse.json({ success: false, message: lineError.message }, { status: 400 });
      }

      (lines || []).forEach((l) => {
        const group = groupByCode.get(l.account_code);
        if (!group) return;

        const signed = l.side === "DEBIT" ? Number(l.nominal) : -Number(l.nominal);
        groupTotals[group] += signed;

        const tanggal = entryDateMap.get(l.entry_id);
        if (!tanggal) return;
        const key = getGroupKey(tanggal);
        if (!journalTrendRaw[key]) {
          journalTrendRaw[key] = { PENDAPATAN: 0, MODAL_KELUAR: 0, OPERASIONAL: 0, LUAR_OPERASIONAL: 0, LABA_DITAHAN: 0 };
        }
        journalTrendRaw[key][group] += signed;
      });
    }

    // Saldo bertanda (DEBIT=+/KREDIT=-) -> angka laporan positif, sama seperti
    // src/app/api/akutansi/laba-rugi/route.ts
    const normalizeGroup = (group: LabaRugiGroup, signed: number) =>
      LABA_RUGI_GROUP_NORMAL[group] === "DEBIT" ? signed : -signed;

    const totalRevenue = normalizeGroup("PENDAPATAN", groupTotals.PENDAPATAN);
    const totalProfit =
      totalRevenue
      - normalizeGroup("MODAL_KELUAR", groupTotals.MODAL_KELUAR)
      - normalizeGroup("OPERASIONAL", groupTotals.OPERASIONAL)
      - normalizeGroup("LUAR_OPERASIONAL", groupTotals.LUAR_OPERASIONAL);
    const avgDeal = totalTrx > 0 ? Math.round(totalRevenue / totalTrx) : 0;

    // ── Ringkasan Cashflow (kas masuk/keluar riil) ──────────────────────────────
    const { data: cashflowRows, error: cfError } = await admin
      .from("cashflow_entries")
      .select("direction, nominal")
      .gte("tanggal", dateFrom)
      .lte("tanggal", dateTo);
    if (cfError) {
      return NextResponse.json({ success: false, message: cfError.message }, { status: 400 });
    }

    let cfMasuk = 0, cfKeluar = 0;
    (cashflowRows || []).forEach((r) => {
      const nominal = Number(r.nominal || 0);
      if (r.direction === "IN") cfMasuk += nominal;
      else if (r.direction === "OUT") cfKeluar += nominal;
    });
    const cashflowSummary = {
      totalMasuk: cfMasuk,
      totalKeluar: cfKeluar,
      saldo: cfMasuk - cfKeluar,
    };

    // ── Trend: trxCount dari transactions, revenue/profit dari journal ─────────
    const groupMap: Record<string, {
      revenue: number; profit: number; trxCount: number; label: string;
    }> = {};

    txList.forEach(t => {
      const paidAt  = (t.paid_at as string) || "";
      const dateStr = getDateWIB(paidAt);
      if (!dateStr) return; // skip kalau paid_at null/kosong

      const key = getGroupKey(dateStr);
      if (!groupMap[key]) {
        groupMap[key] = { revenue: 0, profit: 0, trxCount: 0, label: getLabel(key, dateStr) };
      }
      groupMap[key].trxCount += 1;
    });

    Object.entries(journalTrendRaw).forEach(([key, g]) => {
      const revenue = normalizeGroup("PENDAPATAN", g.PENDAPATAN);
      const profit =
        revenue
        - normalizeGroup("MODAL_KELUAR", g.MODAL_KELUAR)
        - normalizeGroup("OPERASIONAL", g.OPERASIONAL)
        - normalizeGroup("LUAR_OPERASIONAL", g.LUAR_OPERASIONAL);

      if (!groupMap[key]) {
        groupMap[key] = { revenue: 0, profit: 0, trxCount: 0, label: getLabel(key, key) };
      }
      groupMap[key].revenue = revenue;
      groupMap[key].profit  = profit;
    });

    const trend = Object.entries(groupMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => ({ key, ...val }));

    // ── Top Sales ────────────────────────────────────────────────────────────
    const salesMap: Record<string, { revenue: number; count: number }> = {};
    txList.forEach(t => {
      const name = t.sales_name || "Unknown";
      if (!salesMap[name]) salesMap[name] = { revenue: 0, count: 0 };
      salesMap[name].revenue += Number(t.deal_price || t.amount || 0);
      salesMap[name].count   += 1;
    });

    const topSales = Object.entries(salesMap)
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // ── Top Laptop ───────────────────────────────────────────────────────────
    const laptopMap: Record<string, { revenue: number; count: number }> = {};
    txList.forEach(t => {
      const name = t.laptop_name || "Unknown";
      if (!laptopMap[name]) laptopMap[name] = { revenue: 0, count: 0 };
      laptopMap[name].revenue += Number(t.deal_price || t.amount || 0);
      laptopMap[name].count   += 1;
    });

    const topLaptop = Object.entries(laptopMap)
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // ── Top Source ───────────────────────────────────────────────────────────
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
        cashflowSummary,
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