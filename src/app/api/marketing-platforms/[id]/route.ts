import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { hasAnyRole, MARKETING_PLATFORM_MANAGE_ROLES } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function getUserRoles(user: AuthUser): string[] {
  const anyUser = user as any;
  return Array.isArray(anyUser?.roles) && anyUser.roles.length > 0
    ? anyUser.roles
    : [anyUser?.role].filter(Boolean);
}

// DELETE /api/marketing-platforms/[id] → soft delete 1 akun (1 row)
// Dipakai di halaman Kelola Platform untuk hapus single row (per-akun).
// Awareness reports yang pakai platform ini tetap AMAN (soft delete, FK tetap
// resolve karena row belum benar-benar dihapus — cuma ditandai deleted_at).
async function deleteHandler(_req: NextRequest, ctx: any, user: AuthUser) {
  try {
    if (!hasAnyRole(getUserRoles(user), MARKETING_PLATFORM_MANAGE_ROLES)) {
      return NextResponse.json(
        { success: false, message: "Hanya Admin & Kepala Marketing yang boleh hapus platform" },
        { status: 403 }
      );
    }

    const { id } = await ctx.params;
    const { error } = await supabaseAdmin
      .from("marketing_platforms")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null);

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE /api/marketing-platforms/[id] error:", error);
    return NextResponse.json(
      { success: false, message: "Gagal menghapus" },
      { status: 500 }
    );
  }
}

export const DELETE = withAuth(deleteHandler);