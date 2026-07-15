// src/app/api/admin/role-permissions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { invalidateDynamicPermissionCache } from "@/lib/dynamicPermissions";

const ROLE_MANAGER_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];

function isRoleManager(user: AuthUser): boolean {
  const roles = user.roles ?? [user.role];
  return roles.some((r) => ROLE_MANAGER_ROLES.includes(r));
}

// ── GET ?role_key=XXX — ambil matrix permission untuk 1 role ───────────────
async function getHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  if (!isRoleManager(user)) {
    return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const roleKey = searchParams.get("role_key");
  if (!roleKey) {
    return NextResponse.json({ success: false, message: "role_key wajib" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("role_page_permissions")
    .select("page_key,can_view,can_create,can_edit,can_delete")
    .eq("role_key", roleKey);

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true, permissions: data ?? [] });
}

// ── PUT — simpan seluruh matrix untuk 1 role (replace) ─────────────────────
// Body: { role_key: string, permissions: { page_key, can_view, can_create, can_edit, can_delete }[] }
async function putHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  if (!isRoleManager(user)) {
    return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
  }
  const body = await req.json();
  const { role_key, permissions } = body;

  if (!role_key || !Array.isArray(permissions)) {
    return NextResponse.json({ success: false, message: "role_key dan permissions wajib" }, { status: 400 });
  }

  // Strategi: hapus baris lama untuk role ini, insert ulang baris yang punya
  // minimal 1 akses true (biar tidak nyimpen baris "kosong" percuma).
  const rowsToInsert = permissions
    .filter((p: any) => p.can_view || p.can_create || p.can_edit || p.can_delete)
    .map((p: any) => ({
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