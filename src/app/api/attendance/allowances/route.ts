import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FULL_ACCESS_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];

/**
 * GET: Fetch allowances & deductions untuk user(s)
 */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("user_id");

    const now = new Date();
    const year = parseInt(searchParams.get("year") || String(now.getFullYear()), 10);
    const month = parseInt(searchParams.get("month") || String(now.getMonth() + 1), 10);

    let q = supabase
      .from("user_allowances")
      .select("*")
      .eq("year", year)
      .eq("month", month)
      .order("user_id");

    if (!FULL_ACCESS_ROLES.includes(user.role)) {
      q = q.eq("user_id", user.id);
    } else if (targetUserId) {
      q = q.eq("user_id", targetUserId);
    }

    const { data, error } = await q;
    if (error) {
      console.error("[allowances GET] error:", error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (err: any) {
    console.error("[allowances GET] exception:", err);
    return NextResponse.json({ success: false, message: err?.message }, { status: 500 });
  }
}

/**
 * POST: Upsert allowances & deductions untuk user tertentu
 * ⚠️ ISSUE: user_id HARUS ada di auth.users (FK constraint)
 * 
 * Solution: Validasi ke auth.users bukan public.users table
 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !FULL_ACCESS_ROLES.includes(user.role)) {
      return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
    }

    const body = await request.json();
    const {
      user_id,
      allowance_wife = 0,
      allowance_child = 0,
      deduction_loan = 0,
      deduction_pension = 0,
    } = body;

    const now = new Date();
    const year = parseInt(body.year, 10) || now.getFullYear();
    const month = parseInt(body.month, 10) || (now.getMonth() + 1);

    if (!user_id) {
      return NextResponse.json({ success: false, message: "user_id wajib" }, { status: 400 });
    }

    console.log("[allowances POST] Received user_id:", user_id);

    const { data: targetUser, error: targetErr } = await supabase
      .from("users")
      .select("id")
      .eq("id", user_id)
      .maybeSingle();

    if (targetErr) {
      console.error("[allowances POST] Gagal cek users:", targetErr.message);
      return NextResponse.json(
        { success: false, message: `Error validasi user: ${targetErr.message}` },
        { status: 500 }
      );
    }

    if (!targetUser) {
      return NextResponse.json(
        { success: false, message: `User ID ${user_id} tidak ditemukan di database.` },
        { status: 400 }
      );
    }

    // Validasi field
    const fields = { allowance_wife, allowance_child, deduction_loan, deduction_pension };
    for (const [key, val] of Object.entries(fields)) {
      if (typeof val !== "number" || val < 0) {
        return NextResponse.json(
          { success: false, message: `${key} harus angka non-negatif` },
          { status: 400 }
        );
      }
    }

    const { data, error } = await supabase
      .from("user_allowances")
      .upsert(
        {
          user_id,
          year,
          month,
          allowance_wife: Math.round(allowance_wife),
          allowance_child: Math.round(allowance_child),
          deduction_loan: Math.round(deduction_loan),
          deduction_pension: Math.round(deduction_pension),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,year,month" }
      )
      .select()
      .single();

    if (error) {
      console.error("[allowances POST] Upsert error:", error.code, error.message);

      // Jika masih FK error, berarti user_id benar-benar tidak ada
      if (error.code === "23503") {
        return NextResponse.json(
          {
            success: false,
            message: `FK Error: User ID tidak ada di database. Detail: ${error.message}`,
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { success: false, message: `Gagal menyimpan: ${error.message}` },
        { status: 500 }
      );
    }

    console.log("[allowances POST] ✅ Berhasil disimpan:", data.id);
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("[allowances POST] exception:", err);
    return NextResponse.json({ success: false, message: err?.message }, { status: 500 });
  }
}

/**
 * DELETE: Hapus allowances untuk user tertentu
 */
export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !FULL_ACCESS_ROLES.includes(user.role)) {
      return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id");
    const yearParam = searchParams.get("year");
    const monthParam = searchParams.get("month");

    if (!userId) {
      return NextResponse.json({ success: false, message: "user_id wajib" }, { status: 400 });
    }

    let delQuery = supabase.from("user_allowances").delete().eq("user_id", userId);
    if (yearParam && monthParam) {
      delQuery = delQuery.eq("year", parseInt(yearParam, 10)).eq("month", parseInt(monthParam, 10));
    }
    const { error } = await delQuery;

    if (error) {
      console.error("[allowances DELETE] error:", error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[allowances DELETE] exception:", err);
    return NextResponse.json({ success: false, message: err?.message }, { status: 500 });
  }
}