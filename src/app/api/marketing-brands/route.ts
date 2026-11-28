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
    ? anyUser.roles
    : [anyUser?.role].filter(Boolean);
}

// GET: list semua toko aktif
async function getHandler(_req: NextRequest, _ctx: any, user: AuthUser) {
  if (!hasAnyRole(getUserRoles(user), SALES_REPORT_AUDIT_ROLES)) {
    return NextResponse.json({ success: false, message: "Tidak punya akses" }, { status: 403 });
  }
  const { data, error } = await supabaseAdmin
    .from("marketing_brands")
    .select("id, name, created_at")
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data: data ?? [] });
}

// POST: tambah toko baru (hanya Admin/Kepala Marketing)
async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  if (!hasAnyRole(getUserRoles(user), MARKETING_PLATFORM_MANAGE_ROLES)) {
    return NextResponse.json({ success: false, message: "Hanya Admin & Kepala Marketing yang boleh tambah toko" }, { status: 403 });
  }
  const body = await req.json();
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ success: false, message: "Nama toko wajib diisi" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("marketing_brands")
    .insert({ name, created_by: (user as any).id })
    .select("id, name")
    .single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ success: false, message: "Toko dengan nama ini sudah ada" }, { status: 409 });
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, data }, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);