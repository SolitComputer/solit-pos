// src/app/api/attendance/salary-slip/route.ts
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
    const targetUserId = searchParams.get("user_id");
    const year = searchParams.get("year");
    const month = searchParams.get("month");
    const status = searchParams.get("status");

    // ✅ FIX: Query salary_slips dulu tanpa JOIN
    // JOIN via Supabase FK bisa error kalau relasi tidak terdaftar di schema
    let q = supabase
      .from("salary_slips")
      .select("*")
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

    const { data: slips, error: slipsError } = await q;

    if (slipsError) {
      console.error("[salary-slip GET] slips error:", slipsError);
      return NextResponse.json(
        { success: false, message: slipsError.message },
        { status: 500 }
      );
    }

    if (!slips || slips.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // ✅ FIX: Fetch user info secara terpisah — lebih aman dari FK join
    const userIds = [...new Set(slips.map((s: any) => s.user_id))];
    const { data: usersData, error: usersError } = await supabase
      .from("users")
      .select("id, name, role")
      .in("id", userIds);

    if (usersError) {
      console.error("[salary-slip GET] users error:", usersError);
      // Jangan return error — tetap return slips tanpa user info
    }

    const usersMap: Record<string, any> = {};
    (usersData || []).forEach((u: any) => { usersMap[u.id] = u; });

    // Gabungkan data
    const result = slips.map((s: any) => ({
      ...s,
      users: usersMap[s.user_id] ?? null,
    }));

    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    console.error("[salary-slip GET] exception:", err);
    return NextResponse.json(
      { success: false, message: err?.message },
      { status: 500 }
    );
  }
}

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

    // ✅ Pastikan year dan month adalah integer
    const yearInt = parseInt(String(year));
    const monthInt = parseInt(String(month));

    const { data: salData, error: salError } = await supabase
      .from("user_salary")
      .select("*")
      .eq("user_id", user_id)
      .maybeSingle(); // ✅ FIX: pakai maybeSingle() bukan single() — tidak throw error kalau kosong

    if (salError) {
      console.error("[salary-slip POST] salary error:", salError);
      return NextResponse.json(
        { success: false, message: salError.message },
        { status: 500 }
      );
    }

    if (!salData) {
      return NextResponse.json(
        { success: false, message: "Gaji belum diatur untuk user ini" },
        { status: 400 }
      );
    }

    const { data: allowData } = await supabase
      .from("user_allowances")
      .select("*")
      .eq("user_id", user_id)
      .maybeSingle(); // ✅ FIX: maybeSingle() — allowances mungkin belum ada

    const dim = new Date(yearInt, monthInt, 0).getDate();
    const paddedMonth = String(monthInt).padStart(2, "0");

    const { data: allAtt } = await supabase
      .from("face_verifications")
      .select("id, user_id, created_at, status")
      .eq("user_id", user_id)
      .eq("status", "SUCCESS")
      .gte("created_at", `${yearInt}-${paddedMonth}-01T00:00:00+07:00`)
      .lte("created_at", `${yearInt}-${paddedMonth}-${String(dim).padStart(2, "0")}T23:59:59+07:00`);

    const { data: manAtt } = await supabase
      .from("attendance_manual")
      .select("attendance_date, status, check_in_time")
      .eq("user_id", user_id)
      .gte("attendance_date", `${yearInt}-${paddedMonth}-01`)
      .lte("attendance_date", `${yearInt}-${paddedMonth}-${String(dim).padStart(2, "0")}`);

    const { data: dayOffs } = await supabase
      .from("user_day_off")
      .select("day_of_week")
      .eq("user_id", user_id);

    const { data: dateOffs } = await supabase
      .from("user_date_off")
      .select("off_date")
      .eq("user_id", user_id);

    const dayOffSet = new Set((dayOffs || []).map((d: any) => d.day_of_week));
    const dateOffSet = new Set((dateOffs || []).map((d: any) => d.off_date));

    const pad2 = (n: number) => String(n).padStart(2, "0");
    let totalWorkdays = 0;
    let score = 0;

    for (let d = 1; d <= dim; d++) {
      const dk = `${yearInt}-${paddedMonth}-${pad2(d)}`;
      const dow = new Date(dk + "T12:00:00").getDay();
      if (dayOffSet.has(dow) || dateOffSet.has(dk)) continue;

      totalWorkdays++;

      // Cek manual attendance dulu (override)
      const manRecord = (manAtt || []).find((m: any) => m.attendance_date === dk);
      if (manRecord) {
        if (manRecord.status === "PRESENT") score += 1;
        else if (manRecord.status === "LATE") score += 0.5;
        // ABSENT, SICK, PERMIT, LEAVE = 0
        continue;
      }

      // Cek auto attendance
      const attRecord = (allAtt || []).find((a: any) => {
        // Konversi ke WIB date
        const wibDate = new Date(new Date(a.created_at).getTime() + 7 * 60 * 60 * 1000)
          .toISOString().slice(0, 10);
        return wibDate === dk;
      });

      if (attRecord) {
        // ✅ FIX: Cek jam dalam WIB
        const wibTime = new Date(new Date(attRecord.created_at).getTime() + 7 * 60 * 60 * 1000);
        const totalMins = wibTime.getUTCHours() * 60 + wibTime.getUTCMinutes();
        score += totalMins > 8 * 60 ? 0.5 : 1;
      }
    }

    const attendancePercentage = totalWorkdays > 0
      ? Math.min(100, (score / totalWorkdays) * 100)
      : 0;

    const baseSalary = salData.base_salary || 0;
    const salaryIncome = salData.salary_type === "FIXED"
      ? baseSalary
      : totalWorkdays > 0
        ? Math.round((baseSalary / totalWorkdays) * score)
        : 0;

    const allowanceWife = Math.round((allowData?.allowance_wife || 0) * (attendancePercentage / 100)) || 0;
    const allowanceChild = Math.round((allowData?.allowance_child || 0) * (attendancePercentage / 100)) || 0;
    const deductionLoan = allowData?.deduction_loan || 0;
    const deductionPension = allowData?.deduction_pension || 0;

    // ✅ FIX: Query overtime dengan filter yang benar
    // overtime_requests mungkin tidak punya kolom year/month — filter by date range
    const { data: overtimeData } = await supabase
      .from("overtime_requests")
      .select("total_pay, overtime_date")
      .eq("user_id", user_id)
      .eq("status", "COMPLETED")
      .gte("overtime_date", `${yearInt}-${paddedMonth}-01`)
      .lte("overtime_date", `${yearInt}-${paddedMonth}-${String(dim).padStart(2, "0")}`);

    const overtimeTotal = (overtimeData || []).reduce(
      (sum: number, o: any) => sum + (o.total_pay || 0), 0
    );

    const totalIncome = salaryIncome + allowanceWife + allowanceChild + overtimeTotal;
    const totalDeduction = deductionLoan + deductionPension;
    const netSalary = totalIncome - totalDeduction;

    const { data: slip, error: slipError } = await supabase
      .from("salary_slips")
      .upsert(
        {
          user_id,
          year: yearInt,
          month: monthInt,
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
      .eq("year", parseInt(String(year)))
      .eq("month", parseInt(String(month)))
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