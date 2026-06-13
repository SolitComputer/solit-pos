// src/app/api/dashboard/transaction-detail/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";

// ── WIB helpers ───────────────────────────────────────────────────────────────
const WIB_OFFSET = 7 * 60 * 60 * 1000;

function toWIBDateStr(date: Date): string {
  return new Date(date.getTime() + WIB_OFFSET).toISOString().split("T")[0];
}

function wibDayRange(dateStr: string): { start: string; end: string } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - WIB_OFFSET);
  const end = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0) - WIB_OFFSET);
  return { start: start.toISOString(), end: end.toISOString() };
}

function wibMonthRange(year: number, month: number): { start: string; end: string } {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0) - WIB_OFFSET);
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0) - WIB_OFFSET);
  return { start: start.toISOString(), end: end.toISOString() };
}

function wibYearRange(year: number): { start: string; end: string } {
  const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0) - WIB_OFFSET);
  const end = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0) - WIB_OFFSET);
  return { start: start.toISOString(), end: end.toISOString() };
}

const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

// ── Types ─────────────────────────────────────────────────────────────────────
interface TransactionRow {
  id: string;
  invoice_number: string;
  customer_name: string;
  laptop_name: string;
  deal_price?: number;
  amount?: number;
  inventory_price?: number;
  other?: number;
  paid_at?: string;
  created_at: string;
  source_platform?: string;
  sales_name?: string;
  status: string;
  unit_id?: string;
  unit_ids?: string[];
}

interface LaptopEntry {
  laptop_name: string;
  count: number;       // jumlah UNIT terjual (bukan transaksi)
  revenue: number;
  profit: number;
  transactions: {
    id: string;
    invoice_number: string;
    customer_name: string;
    laptop_name: string;
    units_sold: number; // unit yang dibeli customer ini dalam 1 transaksi
    deal_price?: number;
    amount?: number;
    paid_at?: string;
    created_at: string;
    source_platform?: string;
    sales_name?: string;
  }[];
}

interface PeriodData {
  label: string;
  date: string;
  count: number;
  revenue: number;
  profit: number;
  laptops: LaptopEntry[];
}

// ── Helper: hitung unit nyata terjual dalam 1 transaksi ──────────────────────
function countUnitsSold(item: TransactionRow): number {
  // Multi-unit: hitung dari unit_ids array
  if (Array.isArray(item.unit_ids) && item.unit_ids.length > 0) {
    return item.unit_ids.length;
  }
  // Single-unit
  if (item.unit_id) return 1;
  // Fallback untuk transaksi lama
  return 1;
}

// ── Helper: aggregate laptop entries dari rows ────────────────────────────────
function aggregateLaptops(rows: TransactionRow[], unitMap: Map<string, number>): LaptopEntry[] {
  const map: Record<string, LaptopEntry> = {};

  for (const row of rows) {
    const name = row.laptop_name || "—";
    const rev = Number(row.deal_price || row.amount || 0);
    const unitsSold = countUnitsSold(row);

    // Hitung purchase price dari unitMap
    let totalPurchasePrice = 0;
    if (Array.isArray(row.unit_ids) && row.unit_ids.length > 0) {
      for (const uid of row.unit_ids) {
        totalPurchasePrice += unitMap.get(uid) ?? 0;
      }
    } else if (row.unit_id) {
      totalPurchasePrice = unitMap.get(row.unit_id) ?? 0;
    }
    const profit = totalPurchasePrice > 0 ? rev - totalPurchasePrice : 0;

    if (!map[name]) {
      map[name] = { laptop_name: name, count: 0, revenue: 0, profit: 0, transactions: [] };
    }

    // ✅ FIX: tambah unit nyata, bukan +1 per transaksi
    map[name].count += unitsSold;
    map[name].revenue += rev;
    map[name].profit += profit;
    map[name].transactions.push({
      id: row.id,
      invoice_number: row.invoice_number,
      customer_name: row.customer_name,
      laptop_name: name,
      units_sold: unitsSold, // ✅ expose ke frontend
      deal_price: row.deal_price,
      amount: row.amount,
      paid_at: row.paid_at,
      created_at: row.created_at,
      source_platform: row.source_platform,
      sales_name: row.sales_name,
    });
  }

  return Object.values(map).sort((a, b) => b.count - a.count);
}

// ── Batch fetch all unit_ids from transaction list ────────────────────────────
async function buildUnitMap(rows: TransactionRow[]): Promise<Map<string, number>> {
  const allUnitIds = new Set<string>();
  for (const trx of rows) {
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
  return unitMap;
}

// ── Handler ───────────────────────────────────────────────────────────────────
async function handler(req: NextRequest, _ctx: any, _user: AuthUser) {
  try {
    const nowWIB = new Date(Date.now() + WIB_OFFSET);
    const todayStr = toWIBDateStr(new Date());
    const currentYear = parseInt(todayStr.split("-")[0]);
    const currentMonth = parseInt(todayStr.split("-")[1]);

    // ── 1. TODAY ──────────────────────────────────────────────────────────────
    const todayRange = wibDayRange(todayStr);
    const { data: todayRows, error: todayErr } = await supabase
      .from("transactions")
      .select("id, invoice_number, customer_name, laptop_name, deal_price, amount, inventory_price, other, paid_at, created_at, source_platform, sales_name, status, unit_id, unit_ids")
      .eq("status", "PAID")
      .gte("paid_at", todayRange.start)
      .lt("paid_at", todayRange.end)
      .order("paid_at", { ascending: false });

    if (todayErr) throw todayErr;
    const todayData = (todayRows ?? []) as TransactionRow[];

    const todayUnitMap = await buildUnitMap(todayData);

    const todayRevenue = todayData.reduce((s, r) => s + Number(r.deal_price || r.amount || 0), 0);
    const todayProfit = todayData.reduce((s, r) => {
      const rev = Number(r.deal_price || r.amount || 0);
      let pp = 0;
      if (Array.isArray(r.unit_ids) && r.unit_ids.length > 0) {
        for (const uid of r.unit_ids) pp += todayUnitMap.get(uid) ?? 0;
      } else if (r.unit_id) {
        pp = todayUnitMap.get(r.unit_id) ?? 0;
      }
      return s + (pp > 0 ? rev - pp : 0);
    }, 0);

    // ── 2. DAILY — last 30 days ───────────────────────────────────────────────
    const daily: PeriodData[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(nowWIB);
      d.setDate(d.getDate() - i);
      const dateStr = toWIBDateStr(new Date(d.getTime() - WIB_OFFSET));
      const range = wibDayRange(dateStr);

      const { data: rows } = await supabase
        .from("transactions")
        .select("id, invoice_number, customer_name, laptop_name, deal_price, amount, inventory_price, other, paid_at, created_at, source_platform, sales_name, status, unit_id, unit_ids")
        .eq("status", "PAID")
        .gte("paid_at", range.start)
        .lt("paid_at", range.end);

      const rowList = (rows ?? []) as TransactionRow[];
      if (rowList.length === 0 && i > 0) continue;

      const [y, m, dd] = dateStr.split("-").map(Number);
      const dayDate = new Date(Date.UTC(y, m - 1, dd));
      const dayName = DAY_NAMES[dayDate.getUTCDay()];
      const label = i === 0
        ? `Hari Ini (${dayName}, ${dd} ${MONTH_NAMES[m - 1]})`
        : `${dayName}, ${dd} ${MONTH_NAMES[m - 1]}`;

      const unitMap = await buildUnitMap(rowList);

      const revenue = rowList.reduce((s, r) => s + Number(r.deal_price || r.amount || 0), 0);
      const profit = rowList.reduce((s, r) => {
        const rev = Number(r.deal_price || r.amount || 0);
        let pp = 0;
        if (Array.isArray(r.unit_ids) && r.unit_ids.length > 0) {
          for (const uid of r.unit_ids) pp += unitMap.get(uid) ?? 0;
        } else if (r.unit_id) {
          pp = unitMap.get(r.unit_id) ?? 0;
        }
        return s + (pp > 0 ? rev - pp : 0);
      }, 0);

      daily.push({
        label,
        date: dateStr,
        count: rowList.length,
        revenue,
        profit,
        laptops: aggregateLaptops(rowList, unitMap),
      });
    }

    // ── 3. MONTHLY — last 12 months ───────────────────────────────────────────
    const monthly: PeriodData[] = [];
    for (let i = 0; i < 12; i++) {
      let month = currentMonth - i;
      let year = currentYear;
      if (month <= 0) { month += 12; year -= 1; }

      const range = wibMonthRange(year, month);
      const { data: rows } = await supabase
        .from("transactions")
        .select("id, invoice_number, customer_name, laptop_name, deal_price, amount, inventory_price, other, paid_at, created_at, source_platform, sales_name, status, unit_id, unit_ids")
        .eq("status", "PAID")
        .gte("paid_at", range.start)
        .lt("paid_at", range.end);

      const rowList = (rows ?? []) as TransactionRow[];
      const unitMap = await buildUnitMap(rowList);

      const label = i === 0
        ? `Bulan Ini (${MONTH_NAMES[month - 1]} ${year})`
        : `${MONTH_NAMES[month - 1]} ${year}`;
      const revenue = rowList.reduce((s, r) => s + Number(r.deal_price || r.amount || 0), 0);
      const profit = rowList.reduce((s, r) => {
        const rev = Number(r.deal_price || r.amount || 0);
        let pp = 0;
        if (Array.isArray(r.unit_ids) && r.unit_ids.length > 0) {
          for (const uid of r.unit_ids) pp += unitMap.get(uid) ?? 0;
        } else if (r.unit_id) {
          pp = unitMap.get(r.unit_id) ?? 0;
        }
        return s + (pp > 0 ? rev - pp : 0);
      }, 0);

      monthly.push({
        label,
        date: `${year}-${String(month).padStart(2, "0")}`,
        count: rowList.length,
        revenue,
        profit,
        laptops: aggregateLaptops(rowList, unitMap),
      });
    }

    // ── 4. YEARLY — last 3 years ──────────────────────────────────────────────
    const yearly: PeriodData[] = [];
    for (let i = 0; i < 3; i++) {
      const year = currentYear - i;
      const range = wibYearRange(year);
      const { data: rows } = await supabase
        .from("transactions")
        .select("id, invoice_number, customer_name, laptop_name, deal_price, amount, inventory_price, other, paid_at, created_at, source_platform, sales_name, status, unit_id, unit_ids")
        .eq("status", "PAID")
        .gte("paid_at", range.start)
        .lt("paid_at", range.end);

      const rowList = (rows ?? []) as TransactionRow[];
      const unitMap = await buildUnitMap(rowList);

      const revenue = rowList.reduce((s, r) => s + Number(r.deal_price || r.amount || 0), 0);
      const profit = rowList.reduce((s, r) => {
        const rev = Number(r.deal_price || r.amount || 0);
        let pp = 0;
        if (Array.isArray(r.unit_ids) && r.unit_ids.length > 0) {
          for (const uid of r.unit_ids) pp += unitMap.get(uid) ?? 0;
        } else if (r.unit_id) {
          pp = unitMap.get(r.unit_id) ?? 0;
        }
        return s + (pp > 0 ? rev - pp : 0);
      }, 0);

      yearly.push({
        label: i === 0 ? `Tahun Ini (${year})` : String(year),
        date: String(year),
        count: rowList.length,
        revenue,
        profit,
        laptops: aggregateLaptops(rowList, unitMap),
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        today: {
          revenue: todayRevenue,
          profit: todayProfit,
          count: todayData.length,
        },
        daily,
        monthly,
        yearly,
      },
    });
  } catch (err) {
    console.error("[transaction-detail] error:", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(handler, PERMISSIONS.VIEW_DASHBOARD);