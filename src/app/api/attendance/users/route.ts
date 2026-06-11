// src/app/api/attendance/users/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FULL_ACCESS_ROLES = new Set(["ADMIN", "PROGRAMMER", "ASISTEN_CEO"]);

async function getHandler(req: NextRequest, ctx: any, user: AuthUser) {
  // ✅ Admin & full access → return semua user aktif
  if (FULL_ACCESS_ROLES.has(user.role)) {
    const { data, error } = await supabase
      .from("users")
      .select("id, name, role, shift")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      console.error("[attendance/users GET] admin error:", error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  }

  // ✅ FIX: Non-admin → return data diri sendiri sebagai array 1 element
  // Sebelumnya kemungkinan return 403 → allUsers = [] → nama tidak resolve di kalender
  const { data, error } = await supabase
    .from("users")
    .select("id, name, role, shift")
    .eq("id", user.id)
    .single();

  if (error) {
    console.error("[attendance/users GET] non-admin error:", error);
    // Fallback dari token kalau query DB gagal
    return NextResponse.json({
      success: true,
      data: [{
        id: user.id,
        name: (user as any).name ?? "Unknown",
        role: user.role,
        shift: (user as any).shift ?? "PAGI",
      }],
    });
  }

  return NextResponse.json({
    success: true,
    data: data ? [data] : [],
  });
}

export const GET = withAuth(getHandler);