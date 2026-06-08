// src/app/api/attendance/salary/route.ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET — ambil salary semua user (admin) atau milik sendiri
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("user_id");

    let q = supabase
      .from("user_salary")
      .select(`
        id, user_id, salary_type, base_salary, created_at, updated_at,
        users!user_salary_user_id_fkey (id, name, role, shift)
      `);

    if (user.role !== "ADMIN") {
      // Non-admin hanya bisa lihat miliknya sendiri
      q = q.eq("user_id", user.id);
    } else if (targetUserId) {
      q = q.eq("user_id", targetUserId);
    }

    const { data, error } = await q;
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

    return NextResponse.json({ success: true, data: data || [] });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

// POST / PUT — upsert salary untuk satu user
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ success: false, message: "Hanya admin" }, { status: 403 });
    }

    const body = await request.json();
    const { user_id, salary_type, base_salary } = body;

    if (!user_id || !salary_type || base_salary === undefined) {
      return NextResponse.json(
        { success: false, message: "user_id, salary_type, base_salary wajib" },
        { status: 400 }
      );
    }

    if (!["FIXED", "PERCENTAGE"].includes(salary_type)) {
      return NextResponse.json(
        { success: false, message: "salary_type harus FIXED atau PERCENTAGE" },
        { status: 400 }
      );
    }

    if (typeof base_salary !== "number" || base_salary < 0) {
      return NextResponse.json(
        { success: false, message: "base_salary harus angka positif" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("user_salary")
      .upsert(
        {
          user_id,
          salary_type,
          base_salary,
          created_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .select()
      .single();

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}