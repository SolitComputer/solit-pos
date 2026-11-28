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

// GET /api/marketing-brand-platforms?brand_id=...  → list platform di bawah toko
async function getHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  if (!hasAnyRole(getUserRoles(user), SALES_REPORT_AUDIT_ROLES)) {
    return NextResponse.json({ success: false, message: "Tidak punya akses" }, { status: 403 });
  }
  const brandId = new URL(req.url).searchParams.get("brand_id");
  let query = supabaseAdmin
    .from("marketing_brand_platforms")
    .select("id, name, brand_id, brand:brand_id ( id, name )")
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (brandId) query = query.eq("brand_id", brandId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data: data ?? [] });
}

// POST { brand_id, name } → tambah platform di bawah toko tertentu
async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  if (!hasAnyRole(getUserRoles(user), MARKETING_PLATFORM_MANAGE_ROLES)) {
    return NextResponse.json({ success: false, message: "Hanya Admin & Kepala Marketing" }, { status: 403 });
  }
  const body = await req.json();
  const brand_id = String(body.brand_id ?? "").trim();
  const name = String(body.name ?? "").trim();
  if (!brand_id || !name) {
    return NextResponse.json({ success: false, message: "Toko & nama platform wajib diisi" }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin
    .from("marketing_brand_platforms")
    .insert({ brand_id, name, created_by: (user as any).id })
    .select("id, name, brand_id")
    .single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ success: false, message: "Platform ini sudah ada di toko tsb" }, { status: 409 });
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, data }, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);