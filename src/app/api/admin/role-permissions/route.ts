// src/app/api/admin/role-permissions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { invalidateDynamicPermissionCache } from "@/lib/dynamicPermissions";
import { ALL_STATIC_ROLES, getLegacyPageAccess } from "@/lib/permissions";

const ROLE_MANAGER_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];

function isRoleManager(user: AuthUser): boolean {
  const roles = user.roles ?? [user.role];
  return roles.some((r) => ROLE_MANAGER_ROLES.includes(r));
}

async function getHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  if (!isRoleManager(user)) {
    return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const roleKey = searchParams.get("role_key");
  if (!roleKey) {
    return NextResponse.json({ success: false, message: "role_key wajib" }, { status: 400 });
  }

  const { data: savedRows, error } = await supabaseAdmin
    .from("role_page_permissions")
    .select("page_key,can_view,can_create,can_edit,can_delete")
    .eq("role_key", roleKey);

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  // Sudah pernah disimpan sebelumnya -> pakai itu, jangan timpa dengan auto-detect.
  if (savedRows && savedRows.length > 0) {
    return NextResponse.json({ success: true, permissions: savedRows, autoDetected: false });
  }

  // Belum pernah disimpan. Kalau ini role bawaan (legacy), auto-detect dari
  // ROUTE_PERMISSIONS yang sudah ada di kode supaya admin lihat kondisi saat ini.
  if (ALL_STATIC_ROLES.includes(roleKey)) {
    const { data: pages, error: pagesError } = await supabaseAdmin
      .from("app_pages")
      .select("key,route");
    if (pagesError) {
      return NextResponse.json({ success: false, message: pagesError.message }, { status: 500 });
    }
    const detected = (pages ?? []).map((p: any) => ({
      page_key: p.key,
      can_view: getLegacyPageAccess(roleKey, p.route),
      can_create: false,
      can_edit: false,
      can_delete: false,
    }));
    return NextResponse.json({ success: true, permissions: detected, autoDetected: true });
  }

  // Role custom baru yang belum pernah di-set sama sekali.
  return NextResponse.json({ success: true, permissions: [], autoDetected: false });
}

// ── PUT — simpan seluruh matrix untuk 1 role (replace) ─────────────────────
async function putHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  if (!isRoleManager(user)) {
    return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
  }
  const body = await req.json();
  const { role_key, permissions } = body;

  if (!role_key || !Array.isArray(permissions)) {
    return NextResponse.json({ success: false, message: "role_key dan permissions wajib" }, { status: 400 });
  }

  const rowsToInsert = permissions.map((p: any) => ({
    role_key,
    page_key: p.page_key,
    can_view: !!p.can_view,
    can_create: !!p.can_create,
    can_edit: !!p.can_edit,
    can_delete: !!p.can_delete,
    updated_at: new Date().toISOString(),
  }));

  const { error: delError } = await supabaseAdmin
    .from("role_page_permissions")
    .delete()
    .eq("role_key", role_key);
  if (delError) return NextResponse.json({ success: false, message: delError.message }, { status: 500 });

  if (rowsToInsert.length > 0) {
    const { error: insError } = await supabaseAdmin.from("role_page_permissions").insert(rowsToInsert);
    if (insError) return NextResponse.json({ success: false, message: insError.message }, { status: 500 });
  }

  invalidateDynamicPermissionCache();
  return NextResponse.json({ success: true, saved: rowsToInsert.length });
}

export const GET = withAuth(getHandler);
export const PUT = withAuth(putHandler);