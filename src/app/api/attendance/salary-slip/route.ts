// src/app/api/attendance/salary-slip/route.ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FULL_ACCESS_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];

/**
 * GET: Fetch salary slip(s) untuk user(s)
 * Query params:
 * - user_id: (optional) untuk fetch user tertentu
 * - year, month: (optional) untuk fetch per bulan
 * - status: (optional) DRAFT, FINALIZED
 */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("user_id");
    const year = searchParams.get("year");
    const month = searchParams.get("month");
    const status = searchParams.get("status");

    let q = supabase
      .from("salary_slips")
      .select(`
        *,
        users:user_id (id, name, role)
      `)
      .order("year", { ascending: false })
      .order("month", { ascending: false });

    if (!FULL_ACCESS_ROLES.includes(user.role)) {
      q = q.eq("user_id", user.id);
    } else if (targetUserId) {
      q = q.eq("user_id", targetUserId);
    }

    if (year) q = q.eq("year", parseInt(year));
    if (month) q = q.eq("month", parseInt(month));
    if (status) q = q.eq("status", status);

    const { data, error } = await q;
    if (error) {
      console.error("[salary-slip GET] error:", error);
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (err: any) {
    console.error("[salary-slip GET] exception:", err);
    return NextResponse.json(
      { success: false, message: err?.message },
      { status: 500 }
    );
  }
}

/**
 * POST: Generate salary slip untuk user tertentu
 * Body:
 * {
 *   user_id: string,
 *   year: number,
 *   month: number (1-12)
 * }
 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !FULL_ACCESS_ROLES.includes(user.role)) {
      return NextResponse.json(
        { success: false, message: "Akses ditolak" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { user_id, year, month } = body;

    if (!user_id || !year || !month) {
      return NextResponse.json(
        { success: false, message: "user_id, year, month wajib" },
        { status: 400 }
      );
    }

    // Fetch user salary
    const { data: salData, error: salError } = await supabase
      .from("user_salary")
      .select("*")
      .eq("user_id", user_id)
      .single();

    if (salError || !salData) {
      return NextResponse.json(
        { success: false, message: "Gaji belum diatur untuk user ini" },
        { status: 400 }
      );
    }

    // Fetch user allowances
    const { data: allowData } = await supabase
      .from("user_allowances")
      .select("*")
      .eq("user_id", user_id)
      .single();

    // Fetch attendance data untuk hitung kehadiran bulan ini
    const dim = new Date(year, month, 0).getDate();
    const { data: allAtt } = await supabase
      .from("face_verifications")
      .select("*")
      .eq("user_id", user_id)
      .gte("created_at", `${year}-${String(month).padStart(2, "0")}-01T00:00:00Z`)
      .lt(
        "created_at",
        `${year}-${String(month).padStart(2, "0")}-${String(dim).padStart(2, "0")}T23:59:59Z`
      );

    // Fetch manual attendance data
    const { data: manAtt } = await supabase
      .from("attendance_manual")
      .select("*")
      .eq("user_id", user_id)
      .gte("attendance_date", `${year}-${String(month).padStart(2, "0")}-01`)
      .lt("attendance_date", `${year}-${String(month + 1).padStart(2, "0")}-01`);

    // Hitung total hari kerja bulan ini (exclude weekend + day off)
    const { data: dayOffs } = await supabase
      .from("user_day_off")
      .select("day_of_week")
      .eq("user_id", user_id);

    const { data: dateOffs } = await supabase
      .from("user_date_off")
      .select("off_date")
      .eq("user_id", user_id);

    const dayOffSet = new Set(dayOffs?.map(d => d.day_of_week) || []);
    const dateOffSet = new Set(dateOffs?.map(d => d.off_date) || []);

    let totalWorkdays = 0;
    let score = 0;
    const pad2 = (n: number) => String(n).padStart(2, "0");

    for (let d = 1; d <= dim; d++) {
      const dk = `${year}-${pad2(month)}-${pad2(d)}`;
      const dow = new Date(dk + "T12:00:00").getDay();

      // Skip weekend + day off
      if (dayOffSet.has(dow) || dateOffSet.has(dk)) continue;

      totalWorkdays++;

      // Cek auto attendance
      const hasAuto = allAtt?.some(a => {
        const attDate = new Date(a.created_at)
          .toISOString()
          .slice(0, 10);
        return attDate === dk;
      });

      // Cek manual attendance
      const manRecord = manAtt?.find(m => m.attendance_date === dk);

      if (hasAuto) {
        // Hitung late atau present
        const attTime = new Date(allAtt?.find(a =>
          new Date(a.created_at).toISOString().slice(0, 10) === dk
        )?.created_at || "");

        const hours = attTime.getUTCHours() + 7; // Convert to WIB
        const minutes = attTime.getUTCMinutes();
        const totalMins = hours * 60 + minutes;

        if (totalMins > 8 * 60) {
          // Terlambat dari jam 08:00
          score += 0.5;
        } else {
          score += 1;
        }
      } else if (manRecord) {
        // Manual entry
        if (
          manRecord.status === "PRESENT" ||
          manRecord.status === "LATE"
        ) {
          score += manRecord.status === "PRESENT" ? 1 : 0.5;
        }
        // ABSENT, SICK, PERMIT, LEAVE = 0 score
      }
      // Else: tidak hadir = 0
    }

    const attendancePercentage =
      totalWorkdays > 0 ? Math.min(100, (score / totalWorkdays) * 100) : 0;

    // Hitung income
    const baseSalary = salData.base_salary || 0;
    let salaryIncome = 0;

    if (salData.salary_type === "FIXED") {
      salaryIncome = baseSalary;
    } else {
      // PERCENTAGE: dihitung per hari kerja
      salaryIncome =
        totalWorkdays > 0
          ? Math.round((baseSalary / totalWorkdays) * score)
          : 0;
    }

    // Tunjangan (disesuaikan % kehadiran)
    const allowanceWife =
      Math.round((allowData?.allowance_wife || 0) * (attendancePercentage / 100)) || 0;
    const allowanceChild =
      Math.round((allowData?.allowance_child || 0) * (attendancePercentage / 100)) || 0;

    // Potongan (langsung potong, tidak × %)
    const deductionLoan = allowData?.deduction_loan || 0;
    const deductionPension = allowData?.deduction_pension || 0;

    // Fetch overtime data
    const { data: overtimeData } = await supabase
      .from("overtime_requests")
      .select("total_pay")
      .eq("user_id", user_id)
      .eq("year", year)
      .eq("month", month)
      .eq("status", "COMPLETED");

    const overtimeTotal = overtimeData?.reduce(
      (sum, o) => sum + (o.total_pay || 0),
      0
    ) || 0;

    // Hitung total
    const totalIncome =
      salaryIncome + allowanceWife + allowanceChild + overtimeTotal;
    const totalDeduction = deductionLoan + deductionPension;
    const netSalary = totalIncome - totalDeduction;

    // Upsert salary slip
    const { data: slip, error: slipError } = await supabase
      .from("salary_slips")
      .upsert(
        {
          user_id,
          year,
          month,
          salary_type: salData.salary_type,
          base_salary: baseSalary,
          allowance_wife: allowanceWife,
          allowance_child: allowanceChild,
          allowance_transport: 0,
          bonus: 0,
          overtime: overtimeTotal,
          total_income: totalIncome,
          deduction_violation: 0,
          deduction_loan: deductionLoan,
          deduction_pension: deductionPension,
          total_deduction: totalDeduction,
          net_salary: netSalary,
          status: "DRAFT",
          finalized_at: null,
          notes: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,year,month" }
      )
      .select()
      .single();

    if (slipError) {
      console.error("[salary-slip POST] upsert error:", slipError);
      return NextResponse.json(
        { success: false, message: slipError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: slip });
  } catch (err: any) {
    console.error("[salary-slip POST] exception:", err);
    return NextResponse.json(
      { success: false, message: err?.message },
      { status: 500 }
    );
  }
}

/**
 * PATCH: Finalisasi salary slip
 * Body:
 * {
 *   user_id: string,
 *   year: number,
 *   month: number
 * }
 */
export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !FULL_ACCESS_ROLES.includes(user.role)) {
      return NextResponse.json(
        { success: false, message: "Akses ditolak" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { user_id, year, month } = body;

    if (!user_id || !year || !month) {
      return NextResponse.json(
        { success: false, message: "user_id, year, month wajib" },
        { status: 400 }
      );
    }

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
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("[salary-slip PATCH] exception:", err);
    return NextResponse.json(
      { success: false, message: err?.message },
      { status: 500 }
    );
  }
}