import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic"; 

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

    let q = supabase
      .from("salary_slips")
      .select("*")
      .order("year", { ascending: false })
      .order("month", { ascending: false });

    if (!FULL_ACCESS_ROLES.includes(user.role)) {
      q = q.eq("user_id", user.id).not("sent_at", "is", null);
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
    const {
      user_id,
      year,
      month,
      // ✅ NEW: Accept pre-calculated data dari rekapan gaji
      salary_type,
      base_salary,
      salary_income,
      allowance_wife,
      allowance_child,
      overtime,
      total_income,
      deduction_loan,
      deduction_pension,
      total_deduction,
      net_salary,
    } = body;

    if (!user_id || !year || !month) {
      return NextResponse.json(
        { success: false, message: "user_id, year, month wajib" },
        { status: 400 }
      );
    }

    const yearInt = parseInt(String(year));
    const monthInt = parseInt(String(month));

    // ✅ NEW: Jika ada data pre-calculated, langsung simpan tanpa re-calculate
    if (typeof salary_income === "number") {
      console.log("[salary-slip POST] Menggunakan pre-calculated data dari rekapan gaji");

      const { data: slip, error: slipError } = await supabase
        .from("salary_slips")
        .upsert(
          {
            user_id,
            year: yearInt,
            month: monthInt,
            salary_type,
            base_salary,
            salary_income,
            allowance_wife: allowance_wife || 0,
            allowance_child: allowance_child || 0,
            allowance_transport: 0,
            bonus: 0,
            overtime: overtime || 0,
            total_income,
            deduction_violation: 0,
            deduction_loan: deduction_loan || 0,
            deduction_pension: deduction_pension || 0,
            total_deduction,
            net_salary,
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
    }

    // ⚠️ FALLBACK: Jika tidak ada pre-calculated data, return error
    return NextResponse.json(
      {
        success: false,
        message:
          "Data gaji harus dikirim dari halaman Rekap Gaji. Gunakan tombol Generate Slip dari sana.",
      },
      { status: 400 }
    );
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