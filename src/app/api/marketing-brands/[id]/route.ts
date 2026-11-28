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

// DELETE: soft-delete toko + CASCADE soft-delete semua platform & akun di bawahnya.
// Alasan cascade di app layer (bukan DB ON DELETE CASCADE): awareness_reports
// masih bisa reference account yang ketutup — biar historis tetap bisa di-join.
async function deleteHandler(_req: NextRequest, ctx: any, user: AuthUser) {
  if (!hasAnyRole(getUserRoles(user), MARKETING_PLATFORM_MANAGE_ROLES)) {
    return NextResponse.json({ success: false, message: "Hanya Admin & Kepala Marketing" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const nowIso = new Date().toISOString();

  // 1. Ambil semua platform di bawah toko ini
  const { data: platforms } = await supabaseAdmin
    .from("marketing_brand_platforms")
    .select("id")
    .eq("brand_id", id)
    .is("deleted_at", null);
  const platformIds = (platforms ?? []).map((p) => p.id);

  // 2. Cascade soft-delete accounts di platform-platform tsb
  if (platformIds.length > 0) {
    await supabaseAdmin
      .from("marketing_platform_accounts")
      .update({ deleted_at: nowIso })
      .in("brand_platform_id", platformIds)
      .is("deleted_at", null);
  }

  // 3. Soft-delete platforms
  if (platformIds.length > 0) {
    await supabaseAdmin
      .from("marketing_brand_platforms")
      .update({ deleted_at: nowIso })
      .in("id", platformIds);
  }

  // 4. Soft-delete brand itu sendiri
  const { error } = await supabaseAdmin
    .from("marketing_brands")
    .update({ deleted_at: nowIso })
    .eq("id", id);
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export const DELETE = withAuth(deleteHandler);