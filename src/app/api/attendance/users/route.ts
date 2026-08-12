import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { getAttendanceScope } from "@/lib/attendanceScope";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getHandler(req: NextRequest, ctx: any, user: AuthUser) {
  const scope = await getAttendanceScope(supabase, user);

  // ADMIN / PROGRAMMER / ASISTEN_CEO → semua user aktif
  if (scope.all) {
    const { data, error } = await supabase
      .from("users")
      .select("id, name, role, shift, created_at, contract_status, contract_valid_until, career_level")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      console.error("[attendance/users GET] full-access error:", error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: data ?? [] });
  }

  const { data, error } = await supabase
    .from("users")
    .select("id, name, role, shift, created_at, contract_status, contract_valid_until, career_level")
    .in("id", scope.visibleIds)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    console.error("[attendance/users GET] scoped error:", error);
    // Fallback: kembalikan user sendiri saja
    return NextResponse.json({
      success: true,
      data: [{
        id: user.id,
        name: (user as any).name ?? "Unknown",
        role: user.role,
        shift: (user as any).shift ?? "PAGI",
        created_at: null,
      }],
    });
  }

  return NextResponse.json({ success: true, data: data ?? [] });
}

export const GET = withAuth(getHandler);