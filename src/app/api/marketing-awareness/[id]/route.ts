import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { hasAnyRole, SALES_REPORT_AUDIT_ROLES } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function getUserRoles(user: AuthUser): string[] {
  const anyUser = user as any;
  return Array.isArray(anyUser?.roles) && anyUser.roles.length > 0
    ? anyUser.roles
    : [anyUser?.role].filter(Boolean);
}

async function deleteHandler(_req: NextRequest, ctx: any, user: AuthUser) {
  try {
    if (!hasAnyRole(getUserRoles(user), SALES_REPORT_AUDIT_ROLES)) {
      return NextResponse.json(
        { success: false, message: "Tidak punya akses" },
        { status: 403 }
      );
    }

    const { id } = await ctx.params;
    const { error } = await supabaseAdmin
      .from("marketing_awareness_reports")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE awareness error:", error);
    return NextResponse.json(
      { success: false, message: "Gagal menghapus laporan" },
      { status: 500 }
    );
  }
}

export const DELETE = withAuth(deleteHandler);