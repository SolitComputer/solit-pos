import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FULL_ACCESS_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString());
    const month = parseInt(searchParams.get("month") || (new Date().getMonth() + 1).toString());

    let q = supabase
      .from("salary_slips")
      .select("*")
      .eq("year", year)
      .eq("month", month);

    // Non-admin hanya bisa lihat gaji sendiri
    if (!FULL_ACCESS_ROLES.includes(user.role)) {
      q = q.eq("user_id", user.id);
    }

    const { data, error } = await q.order("created_at", { ascending: false });
    if (error) {
      console.error("[salary-slip GET] error:", error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (err: any) {
    console.error("[salary-slip GET] exception:", err);
    return NextResponse.json({ success: false, message: err?.message }, { status: 500 });
  }
}

// Generate slip gaji (admin only)
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !FULL_ACCESS_ROLES.includes(user.role)) {
      return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
    }

    const body = await request.json();
    const {
      user_id,
      year,
      month,
      base_salary,
      salary_type,
      allowance_wife = 0,
      allowance_child = 0,
      allowance_transport = 0,
      bonus = 0,
      overtime = 0,
      deduction_violation = 0,
      deduction_loan = 0,
      deduction_pension = 0,
    } = body;

    if (!user_id || !year || !month) {
      return NextResponse.json(
        { success: false, message: "user_id, year, month wajib" },
        { status: 400 }
      );
    }

    const total_income =
      base_salary +
      allowance_wife +
      allowance_child +
      allowance_transport +
      bonus +
      overtime;

    const total_deduction = deduction_violation + deduction_loan + deduction_pension;
    const net_salary = total_income - total_deduction;

    const { data, error } = await supabase
      .from("salary_slips")
      .upsert(
        {
          user_id,
          year,
          month,
          salary_type,
          base_salary,
          allowance_wife,
          allowance_child,
          allowance_transport,
          bonus,
          overtime,
          total_income,
          deduction_violation,
          deduction_loan,
          deduction_pension,
          total_deduction,
          net_salary,
          status: "DRAFT",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,year,month" }
      )
      .select()
      .single();

    if (error) {
      console.error("[salary-slip POST] error:", error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("[salary-slip POST] exception:", err);
    return NextResponse.json({ success: false, message: err?.message }, { status: 500 });
  }
}

// Finalize slip gaji (admin only)
export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !FULL_ACCESS_ROLES.includes(user.role)) {
      return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
    }

    const body = await request.json();
    const { user_id, year, month } = body;

    const { data, error } = await supabase
      .from("salary_slips")
      .update({
        status: "FINALIZED",
        finalized_at: new Date().toISOString(),
      })
      .eq("user_id", user_id)
      .eq("year", year)
      .eq("month", month)
      .select()
      .single();

    if (error) {
      console.error("[salary-slip PATCH] error:", error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("[salary-slip PATCH] exception:", err);
    return NextResponse.json({ success: false, message: err?.message }, { status: 500 });
  }
}