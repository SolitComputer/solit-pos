import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { hasAnyRole, SALES_REPORT_AUDIT_ROLES } from "@/lib/permissions";

export const dynamic = "force-dynamic";
const TABLE = "sales_error_members";

// Role yang dianggap "Sales" untuk daftar popup Kesalahan Sales.
const SALES_MEMBER_ROLES = [
  "CREW_SALES", "KEPALA_SALES", "PKL_SALES",
  "SOTECH", "KEPALA_SOTECH", "ONPOINT", "KEPALA_ONPOINT",
];

function getRoles(user: AuthUser): string[] {
  const u = user as any;
  return Array.isArray(u?.roles) && u.roles.length > 0 ? u.roles : u?.role ? [u.role] : [];
}
function canManage(user: AuthUser) {
  return hasAnyRole(getRoles(user), SALES_REPORT_AUDIT_ROLES);
}
function isSalesUser(u: any): boolean {
  const roles = Array.isArray(u?.roles) && u.roles.length > 0 ? u.roles : [u?.role].filter(Boolean);
  return roles.some((r: string) => SALES_MEMBER_ROLES.includes(r));
}

// GET — daftar member (tampil di tabel) + available (sales aktif yg belum jadi member, buat popup)
async function getHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  try {
    if (!canManage(user)) return NextResponse.json({ success: false, message: "Tidak diizinkan" }, { status: 403 });

    const { data: members, error: mErr } = await supabaseAdmin
      .from(TABLE).select("user_id, nama, sort_order")
      .order("sort_order", { ascending: true }).order("created_at", { ascending: true });
    if (mErr) throw new Error(mErr.message);

    const memberIds = new Set((members ?? []).map((m: any) => m.user_id));

    const { data: users, error: uErr } = await supabaseAdmin
      .from("users").select("id, name, role, roles, is_active").is("deleted_at", null);
    if (uErr) throw new Error(uErr.message);

    const available = (users ?? [])
      .filter((u: any) => (u.is_active ?? true) && isSalesUser(u) && !memberIds.has(u.id))
      .map((u: any) => ({ id: u.id, name: u.name }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name, "id"));

    return NextResponse.json({ success: true, data: { members: members ?? [], available } });
  } catch (error: any) {
    console.error("sales-error-members GET:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// POST { user_id } — tambah sales ke daftar (idempotent, anti-dobel)
async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  try {
    if (!canManage(user)) return NextResponse.json({ success: false, message: "Tidak diizinkan" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const user_id = (body?.user_id ?? "").toString().trim();
    if (!user_id) return NextResponse.json({ success: false, message: "user_id wajib" }, { status: 400 });

    const { data: u, error: uErr } = await supabaseAdmin
      .from("users").select("id, name, role, roles, is_active").eq("id", user_id).maybeSingle();
    if (uErr) throw new Error(uErr.message);
    if (!u) return NextResponse.json({ success: false, message: "User tidak ditemukan" }, { status: 404 });
    if (!isSalesUser(u)) return NextResponse.json({ success: false, message: "User ini bukan role Sales" }, { status: 400 });

    const { data: existing } = await supabaseAdmin.from(TABLE).select("user_id").eq("user_id", user_id).maybeSingle();
    if (existing) return NextResponse.json({ success: true, message: "Sudah ada di daftar" });

    const { data: last } = await supabaseAdmin.from(TABLE)
      .select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
    const sort_order = (last?.sort_order ?? 0) + 1;

    const { data, error } = await supabaseAdmin
      .from(TABLE).insert({ user_id, nama: u.name, sort_order }).select().single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("sales-error-members POST:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// DELETE ?user_id= — hapus sales dari daftar
async function deleteHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  try {
    if (!canManage(user)) return NextResponse.json({ success: false, message: "Tidak diizinkan" }, { status: 403 });
    const user_id = new URL(req.url).searchParams.get("user_id");
    if (!user_id) return NextResponse.json({ success: false, message: "user_id wajib" }, { status: 400 });
    const { error } = await supabaseAdmin.from(TABLE).delete().eq("user_id", user_id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("sales-error-members DELETE:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
export const DELETE = withAuth(deleteHandler);