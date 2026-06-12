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
interface TransactionItem {
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
}

interface LaptopEntry {
  laptop_name: string;
  count: number;
  revenue: number;
  profit: number;
  transactions: TransactionItem[];
}

interface PeriodData {
  label: string;
  date: string; // YYYY-MM-DD or YYYY-MM or YYYY
  count: number;
  revenue: number;
  profit: number;
  laptops: LaptopEntry[];
}

// ── Aggregate helper ──────────────────────────────────────────────────────────
function aggregateLaptops(rows: TransactionItem[]): LaptopEntry[] {
  const map: Record<string, LaptopEntry> = {};
  for (const row of rows) {
    const name = row.laptop_name || "—";
    const rev = Number(row.deal_price || row.amount || 0);
    const inv = Number(row.inventory_price || 0);
    const profit = rev - inv;
    if (!map[name]) {
      map[name] = { laptop_name: name, count: 0, revenue: 0, profit: 0, transactions: [] };
    }
    map[name].count += 1;
    map[name].revenue += rev;
    map[name].profit += profit;
    map[name].transactions.push(row);
  }
  return Object.values(map).sort((a, b) => b.count - a.count);
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
      .select("id, invoice_number, customer_name, laptop_name, deal_price, amount, inventory_price, other, paid_at, created_at, source_platform, sales_name, status")
      .eq("status", "PAID")
      .gte("paid_at", todayRange.start)
      .lt("paid_at", todayRange.end)
      .order("paid_at", { ascending: false });

    if (todayErr) throw todayErr;
    const todayData = todayRows ?? [];

    const todayRevenue = todayData.reduce((s, r) => s + Number(r.deal_price || r.amount || 0), 0);
    const todayProfit = todayData.reduce((s, r) => {
      const rev = Number(r.deal_price || r.amount || 0);
      const inv = Number(r.inventory_price || 0);
      return s + (rev - inv);
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
        .select("id, invoice_number, customer_name, laptop_name, deal_price, amount, inventory_price, other, paid_at, created_at, source_platform, sales_name, status")
        .eq("status", "PAID")
        .gte("paid_at", range.start)
        .lt("paid_at", range.end);

      const rowList = rows ?? [];
      if (rowList.length === 0 && i > 0) continue; // skip empty past days, keep today

      const [y, m, dd] = dateStr.split("-").map(Number);
      const dayDate = new Date(Date.UTC(y, m - 1, dd));
      const dayName = DAY_NAMES[dayDate.getUTCDay()];
      const label = i === 0
        ? `Hari Ini (${dayName}, ${dd} ${MONTH_NAMES[m - 1]})`
        : `${dayName}, ${dd} ${MONTH_NAMES[m - 1]}`;

      const revenue = rowList.reduce((s, r) => s + Number(r.deal_price || r.amount || 0), 0);
      const profit = rowList.reduce((s, r) => {
        const rev = Number(r.deal_price || r.amount || 0);
        return s + (rev - Number(r.inventory_price || 0));
      }, 0);

      daily.push({
        label,
        date: dateStr,
        count: rowList.length,
        revenue,
        profit,
        laptops: aggregateLaptops(rowList),
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
        .select("id, invoice_number, customer_name, laptop_name, deal_price, amount, inventory_price, other, paid_at, created_at, source_platform, sales_name, status")
        .eq("status", "PAID")
        .gte("paid_at", range.start)
        .lt("paid_at", range.end);

      const rowList = rows ?? [];
      const label = i === 0
        ? `Bulan Ini (${MONTH_NAMES[month - 1]} ${year})`
        : `${MONTH_NAMES[month - 1]} ${year}`;
      const revenue = rowList.reduce((s, r) => s + Number(r.deal_price || r.amount || 0), 0);
      const profit = rowList.reduce((s, r) => {
        const rev = Number(r.deal_price || r.amount || 0);
        return s + (rev - Number(r.inventory_price || 0));
      }, 0);

      monthly.push({
        label,
        date: `${year}-${String(month).padStart(2, "0")}`,
        count: rowList.length,
        revenue,
        profit,
        laptops: aggregateLaptops(rowList),
      });
    }

    // ── 4. YEARLY — last 3 years ──────────────────────────────────────────────
    const yearly: PeriodData[] = [];
    for (let i = 0; i < 3; i++) {
      const year = currentYear - i;
      const range = wibYearRange(year);
      const { data: rows } = await supabase
        .from("transactions")
        .select("id, invoice_number, customer_name, laptop_name, deal_price, amount, inventory_price, other, paid_at, created_at, source_platform, sales_name, status")
        .eq("status", "PAID")
        .gte("paid_at", range.start)
        .lt("paid_at", range.end);

      const rowList = rows ?? [];
      const revenue = rowList.reduce((s, r) => s + Number(r.deal_price || r.amount || 0), 0);
      const profit = rowList.reduce((s, r) => {
        const rev = Number(r.deal_price || r.amount || 0);
        return s + (rev - Number(r.inventory_price || 0));
      }, 0);

      yearly.push({
        label: i === 0 ? `Tahun Ini (${year})` : String(year),
        date: String(year),
        count: rowList.length,
        revenue,
        profit,
        laptops: aggregateLaptops(rowList),
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