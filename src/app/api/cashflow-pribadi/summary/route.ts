// GET /api/cashflow-pribadi/summary?start=YYYY-MM-DD&end=YYYY-MM-DD
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isValidDateString, monthStartWIB, todayWIB } from "@/lib/cashflowPribadi";
import type { PersonalSummary } from "@/lib/cashflowPribadi";

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function GET(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const periodStart = start && isValidDateString(start) ? start : monthStartWIB();
  const periodEnd = end && isValidDateString(end) ? end : todayWIB();

  const sb = admin();
  const { data: rows, error } = await sb
    .from("personal_cashflow_transactions")
    .select(`
      id, type, amount, transaction_date, category_id,
      category:personal_cashflow_categories ( id, name, color )
    `)
    .eq("user_id", userId)                 // 🔒 privacy
    .eq("is_deleted", false)
    .gte("transaction_date", periodStart)
    .lte("transaction_date", periodEnd);

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  let totalIncome = 0;
  let totalExpense = 0;
  const catMap = new Map<string, PersonalSummary["by_category"][number]>();
  const dayMap = new Map<string, { income: number; expense: number }>();

  for (const r of rows ?? []) {
    const amt = Number(r.amount);
    if (r.type === "income") totalIncome += amt;
    else totalExpense += amt;

    const cat = Array.isArray(r.category) ? r.category[0] : r.category;
    const catKey = `${r.category_id ?? "_none"}|${r.type}`;
    const existing = catMap.get(catKey);
    if (existing) {
      existing.total += amt;
      existing.count += 1;
    } else {
      catMap.set(catKey, {
        category_id: r.category_id ?? null,
        category_name: cat?.name ?? "Tanpa Kategori",
        color: cat?.color ?? "#6b7280",
        type: r.type,
        total: amt,
        count: 1,
      });
    }

    const d = dayMap.get(r.transaction_date) ?? { income: 0, expense: 0 };
    if (r.type === "income") d.income += amt;
    else d.expense += amt;
    dayMap.set(r.transaction_date, d);
  }

  const summary: PersonalSummary = {
    period: { start: periodStart, end: periodEnd },
    total_income: totalIncome,
    total_expense: totalExpense,
    balance: totalIncome - totalExpense,
    by_category: Array.from(catMap.values()).sort((a, b) => b.total - a.total),
    daily_trend: Array.from(dayMap.entries())
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => (a.date < b.date ? -1 : 1)),
  };

  return NextResponse.json({ success: true, data: summary });
}