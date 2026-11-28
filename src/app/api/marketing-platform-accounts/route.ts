import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import {
  hasAnyRole, SALES_REPORT_AUDIT_ROLES, MARKETING_PLATFORM_MANAGE_ROLES,
} from "@/lib/permissions";

export const dynamic = "force-dynamic";

function getUserRoles(user: AuthUser): string[] {
  const anyUser = user as any;
  return Array.isArray(anyUser?.roles) && anyUser.roles.length > 0
    ? anyUser.roles : [anyUser?.role].filter(Boolean);
}

// GET /api/marketing-platform-accounts?brand_platform_id=...
async function getHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  if (!hasAnyRole(getUserRoles(user), SALES_REPORT_AUDIT_ROLES)) {
    return NextResponse.json({ success: false, message: "Tidak punya akses" }, { status: 403 });
  }
  const brandPlatformId = new URL(req.url).searchParams.get("brand_platform_id");
  let query = supabaseAdmin
    .from("marketing_platform_accounts")
    .select("id, name, brand_platform_id, platform:brand_platform_id ( id, name, brand_id, brand:brand_id ( id, name ) )")
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (brandPlatformId) query = query.eq("brand_platform_id", brandPlatformId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data: data ?? [] });
}

// POST { brand_platform_id, name }
async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  if (!hasAnyRole(getUserRoles(user), MARKETING_PLATFORM_MANAGE_ROLES)) {
    return NextResponse.json({ success: false, message: "Hanya Admin & Kepala Marketing" }, { status: 403 });
  }
  const body = await req.json();
  const brand_platform_id = String(body.brand_platform_id ?? "").trim();
  const name = String(body.name ?? "").trim();
  if (!brand_platform_id || !name) {
    return NextResponse.json({ success: false, message: "Platform & nama akun wajib diisi" }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin
    .from("marketing_platform_accounts")
    .insert({ brand_platform_id, name, created_by: (user as any).id })
    .select("id, name, brand_platform_id")
    .single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ success: false, message: "Akun ini sudah ada di platform tsb" }, { status: 409 });
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, data }, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);