import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";

const ROLE_MANAGER_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];

function isRoleManager(user: AuthUser): boolean {
  const roles = user.roles ?? [user.role];
  return roles.some((r) => ROLE_MANAGER_ROLES.includes(r));
}

// ── GET — daftar semua halaman yang bisa diberi akses (dikelompokkan) ──────
async function getHandler(_req: NextRequest, _ctx: any, user: AuthUser) {
  if (!isRoleManager(user)) {
    return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
  }
  const { data, error } = await supabaseAdmin
    .from("app_pages")
    .select("key,label,route,group_label,sort_order")
    .order("group_label")
    .order("sort_order");

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true, pages: data ?? [] });
}

export const GET = withAuth(getHandler);