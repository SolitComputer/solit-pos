import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FULL_ACCESS_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO", "ACCOUNTING"];
function hasFullAccess(user: any): boolean {
  const roles = Array.isArray(user?.roles) && user.roles.length > 0
    ? user.roles
    : user?.role ? [user.role] : [];
  return roles.some((r: string) => FULL_ACCESS_ROLES.includes(r));
}
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("user_id");
    const includeHistory = searchParams.get("history") === "true";

    // Fetch current salary
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
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    // ✅ Fetch history jika diminta
    let history = [];
    if (includeHistory) {
      const userIds = (data || []).map((s: any) => s.user_id);
      if (userIds.length > 0) {
        const { data: historyData } = await supabase
          .from("salary_history")
          .select("*")
          .in("user_id", userIds)
          .order("changed_at", { ascending: false });

        history = historyData || [];
      }
    }

    const userIds = (history || []).map((h: any) => h.user_id);
    if (userIds.length > 0) {
      const { data: usersData } = await supabase
        .from("users")
        .select("id, name, role")
        .in("id", userIds);

      const usersMap: Record<string, any> = {};
      (usersData || []).forEach((u: any) => { usersMap[u.id] = u; });

      history = (history || []).map((h: any) => ({
        ...h,
        user: usersMap[h.user_id] ?? null,
      }));
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      history: includeHistory ? history : undefined,
    });
  } catch (err: any) {
    console.error("[salary GET] exception:", err);
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
    let { user_id, salary_type, base_salary, notes } = body;

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

    // ✅ Fetch data lama untuk tracking history
    const { data: oldData } = await supabase
      .from("user_salary")
      .select("*")
      .eq("user_id", user_id)
      .maybeSingle();

    // Update salary
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
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    if (oldData && (oldData.salary_type !== salary_type || oldData.base_salary !== base_salary)) {
      const { error: historyError } = await supabase
        .from("salary_history")
        .insert({
          user_id,
          old_salary_type: oldData.salary_type,
          new_salary_type: salary_type,
          old_base_salary: oldData.base_salary,
          new_base_salary: base_salary,
          changed_by: user.id,
          notes: notes || null,
        });

      if (historyError) {
        console.error("[salary POST] history insert error:", historyError);
      }
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("[salary POST] exception:", err);
    return NextResponse.json(
      { success: false, message: err?.message },
      { status: 500 }
    );
  }
}