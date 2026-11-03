// src/app/api/attendance/salary-slip/backfill-cashflow/route.ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { postSalarySlipToAccounting, SALARY_ACCOUNTING_START } from "@/lib/salaryAccounting";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FULL_ACCESS_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];
const BACKFILL_YEAR = SALARY_ACCOUNTING_START.year;   // 2026
const BACKFILL_MONTH = SALARY_ACCOUNTING_START.month; // 10

// Slip Oktober 2026, FINAL, belum punya cashflow → kandidat backfill
async function getPendingSlips() {
  const { data, error } = await supabase
    .from("salary_slips")
    .select("*")
    .eq("year", BACKFILL_YEAR)
    .eq("month", BACKFILL_MONTH)
    .eq("status", "FINALIZED")
    .is("cashflow_entry_id", null);
  if (error) throw new Error(error.message);
  return data ?? [];
}

// PREVIEW
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !FULL_ACCESS_ROLES.includes(user.role))
    return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
  try {
    const slips = await getPendingSlips();
    const totalNet = slips.reduce((s: number, x: any) => s + Math.round(Number(x.net_salary || 0)), 0);
    return NextResponse.json({ success: true, count: slips.length, total_net: totalNet });
  } catch (e: any) {
    return NextResponse.json({ success: false, message: e?.message }, { status: 500 });
  }
}

// EKSEKUSI
export async function POST() {
  const user = await getCurrentUser();
  if (!user || !FULL_ACCESS_ROLES.includes(user.role))
    return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
  try {
    const slips = await getPendingSlips();
    let created = 0, skipped = 0;
    const failed: { id: string; message: string }[] = [];
    for (const slip of slips) {
      const r = await postSalarySlipToAccounting(supabase, slip, user); // bikin cashflow (net)
      if (!r.ok) failed.push({ id: slip.id as string, message: r.message });
      else if (r.skipped) skipped++;
      else created++;
    }
    return NextResponse.json({ success: true, created, skipped, failed });
  } catch (e: any) {
    return NextResponse.json({ success: false, message: e?.message }, { status: 500 });
  }
}