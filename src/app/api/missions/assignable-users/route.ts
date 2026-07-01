import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { canAssignToTarget, canAssignMissions } from "@/lib/missions";

async function getHandler(_req: NextRequest, _ctx: any, user: AuthUser) {
  const roles = user.roles ?? [user.role];

  if (!canAssignMissions(roles)) {
    return NextResponse.json({ success: true, data: [] });
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, name, role, roles, shift, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    console.error("[missions/assignable-users]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  const list = (data ?? [])
    .filter(u => u.id !== user.id) 
    .map(u => ({
      ...u,
      roles: Array.isArray(u.roles) && u.roles.length > 0 ? u.roles : [u.role].filter(Boolean),
    }))
    .filter(u => canAssignToTarget(roles, u.roles));

  return NextResponse.json({ success: true, data: list });
}

export const GET = withAuth(getHandler);