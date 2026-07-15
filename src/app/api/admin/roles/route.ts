// src/app/api/admin/roles/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { invalidateDynamicPermissionCache } from "@/lib/dynamicPermissions";

// Hanya 3 role ini yang boleh membuat/mengubah role & hak akses.
const ROLE_MANAGER_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];

function isRoleManager(user: AuthUser): boolean {
  const roles = user.roles ?? [user.role];
  return roles.some((r) => ROLE_MANAGER_ROLES.includes(r));
}

function isValidKey(key: string): boolean {
  // UPPER_SNAKE_CASE, 3-40 char, tidak boleh diawali angka.
  return /^[A-Z][A-Z0-9_]{2,39}$/.test(key);
}

// ── GET — daftar semua dynamic role ────────────────────────────────────────
async function getHandler(_req: NextRequest, _ctx: any, user: AuthUser) {
  if (!isRoleManager(user)) {
    return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
  }
  const { data, error } = await supabaseAdmin
    .from("dynamic_roles")
    .select("id,key,label,icon,badge_bg,badge_text,badge_border,is_pkl,parent_role,created_at")
    .order("label");
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true, roles: data ?? [] });
}

// ── POST — buat role baru ──────────────────────────────────────────────────
async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  if (!isRoleManager(user)) {
    return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
  }
  const body = await req.json();
  const {
    key,
    label,
    icon = "👤",
    badge_bg = "#f8fafc",
    badge_text = "#475569",
    badge_border = "#e2e8f0",
    is_pkl = false,
    parent_role = null,
  } = body;

  if (!key || !label) {
    return NextResponse.json({ success: false, message: "Key dan label wajib diisi" }, { status: 400 });
  }
  const normalizedKey = String(key).trim().toUpperCase().replace(/\s+/g, "_");
  if (!isValidKey(normalizedKey)) {
    return NextResponse.json(
      { success: false, message: "Key harus UPPER_SNAKE_CASE, 3-40 karakter, huruf di depan" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("dynamic_roles")
    .insert({
      key: normalizedKey,
      label: String(label).trim(),
      icon,
      badge_bg,
      badge_text,
      badge_border,
      is_pkl,
      parent_role,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    const msg = error.code === "23505" ? "Key role sudah dipakai" : error.message;
    return NextResponse.json({ success: false, message: msg }, { status: 400 });
  }

  invalidateDynamicPermissionCache();
  return NextResponse.json({ success: true, role: data });
}

// ── PUT — update role ──────────────────────────────────────────────────────
async function putHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  if (!isRoleManager(user)) {
    return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
  }
  const body = await req.json();
  const { id, label, icon, badge_bg, badge_text, badge_border, is_pkl, parent_role } = body;
  if (!id) return NextResponse.json({ success: false, message: "ID wajib" }, { status: 400 });

  const updates: Record<string, any> = {};
  if (label !== undefined) updates.label = String(label).trim();
  if (icon !== undefined) updates.icon = icon;
  if (badge_bg !== undefined) updates.badge_bg = badge_bg;
  if (badge_text !== undefined) updates.badge_text = badge_text;
  if (badge_border !== undefined) updates.badge_border = badge_border;
  if (is_pkl !== undefined) updates.is_pkl = is_pkl;
  if (parent_role !== undefined) updates.parent_role = parent_role;
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("dynamic_roles")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  invalidateDynamicPermissionCache();
  return NextResponse.json({ success: true, role: data });
}

// ── DELETE — hapus role (dan permission-nya via FK cascade di role_page_permissions? ────
// NOTE: role_page_permissions tidak FK ke dynamic_roles (role_key juga dipakai role lama),
// jadi kita hapus manual baris permission-nya juga.
async function deleteHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  if (!isRoleManager(user)) {
    return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ success: false, message: "ID wajib" }, { status: 400 });

  const { data: role } = await supabaseAdmin.from("dynamic_roles").select("key").eq("id", id).maybeSingle();
  if (!role) return NextResponse.json({ success: false, message: "Role tidak ditemukan" }, { status: 404 });

  // Cegah hapus role yang masih dipakai user (biar tidak ada user "hantu" tanpa akses).
  const { data: usersWithRole } = await supabaseAdmin
    .from("users")
    .select("id")
    .contains("roles", [role.key])
    .limit(1);
  if (usersWithRole && usersWithRole.length > 0) {
    return NextResponse.json(
      { success: false, message: "Role masih dipakai oleh user. Pindahkan role user tersebut dulu." },
      { status: 400 }
    );
  }

  await supabaseAdmin.from("role_page_permissions").delete().eq("role_key", role.key);
  const { error } = await supabaseAdmin.from("dynamic_roles").delete().eq("id", id);
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  invalidateDynamicPermissionCache();
  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
export const PUT = withAuth(putHandler);
export const DELETE = withAuth(deleteHandler);