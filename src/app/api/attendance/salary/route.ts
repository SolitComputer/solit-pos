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

    let q = supabase
      .from("user_salary")
      .select("id, user_id, salary_type, base_salary, created_at, updated_at");

    if (!FULL_ACCESS_ROLES.includes(user.role)) {
      q = q.eq("user_id", user.id);
    } else if (targetUserId) {
      q = q.eq("user_id", targetUserId);
    }

    const { data, error } = await q;
    if (error) {
      console.error("[salary GET] error:", error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (err: any) {
    console.error("[salary GET] exception:", err);
    return NextResponse.json({ success: false, message: err?.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !FULL_ACCESS_ROLES.includes(user.role)) {
      return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
    }

    const body = await request.json();
    let { user_id, salary_type, base_salary } = body;

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

    base_salary = Math.round(parseFloat(base_salary));
    
    if (base_salary < 0) {
      return NextResponse.json(
        { success: false, message: "base_salary harus positif" },
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

    if (error) {
      console.error("[salary POST] upsert error:", error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("[salary POST] exception:", err);
    return NextResponse.json({ success: false, message: err?.message }, { status: 500 });
  }
}