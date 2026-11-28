import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { hasAnyRole, MARKETING_PLATFORM_MANAGE_ROLES } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function getUserRoles(user: AuthUser): string[] {
  const anyUser = user as any;
  return Array.isArray(anyUser?.roles) && anyUser.roles.length > 0
    ? anyUser.roles : [anyUser?.role].filter(Boolean);
}

async function deleteHandler(_req: NextRequest, ctx: any, user: AuthUser) {
  if (!hasAnyRole(getUserRoles(user), MARKETING_PLATFORM_MANAGE_ROLES)) {
    return NextResponse.json({ success: false, message: "Hanya Admin & Kepala Marketing" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const { error } = await supabaseAdmin
    .from("marketing_platform_accounts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export const DELETE = withAuth(deleteHandler);