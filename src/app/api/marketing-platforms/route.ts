import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import {
  hasAnyRole,
  SALES_REPORT_AUDIT_ROLES,
  MARKETING_PLATFORM_MANAGE_ROLES,
} from "@/lib/permissions";

export const dynamic = "force-dynamic";

function getUserRoles(user: AuthUser): string[] {
  const anyUser = user as any;
  return Array.isArray(anyUser?.roles) && anyUser.roles.length > 0
    ? anyUser.roles
    : [anyUser?.role].filter(Boolean);
}

// GET /api/marketing-platforms  → list semua platform aktif
async function getHandler(_req: NextRequest, _ctx: any, user: AuthUser) {
  try {
    if (!hasAnyRole(getUserRoles(user), SALES_REPORT_AUDIT_ROLES)) {
      return NextResponse.json(
        { success: false, message: "Tidak punya akses" },
        { status: 403 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("marketing_platforms")
      .select("id, platform, brand_toko, daftar_akun, created_at")
      .is("deleted_at", null)
      .order("platform", { ascending: true })
      .order("brand_toko", { ascending: true })
      .order("daftar_akun", { ascending: true });

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error: any) {
    console.error("GET /api/marketing-platforms error:", error);
    return NextResponse.json(
      { success: false, message: "Gagal memuat daftar platform" },
      { status: 500 }
    );
  }
}

// POST /api/marketing-platforms  → tambah platform baru (admin/kepala marketing only)
async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  try {
    if (!hasAnyRole(getUserRoles(user), MARKETING_PLATFORM_MANAGE_ROLES)) {
      return NextResponse.json(
        { success: false, message: "Hanya Admin & Kepala Marketing yang boleh tambah platform" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const platform = String(body.platform ?? "").trim();
    const brand_toko = String(body.brand_toko ?? "").trim();
    const daftar_akun = String(body.daftar_akun ?? "").trim();

    if (!platform || !brand_toko || !daftar_akun) {
      return NextResponse.json(
        { success: false, message: "Platform, Brand Toko, dan Daftar Akun wajib diisi" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("marketing_platforms")
      .insert({ platform, brand_toko, daftar_akun, created_by: (user as any).id })
      .select("id, platform, brand_toko, daftar_akun")
      .single();

    if (error) {
      // Unique constraint violation → kombinasi sudah ada
      if (error.code === "23505") {
        return NextResponse.json(
          { success: false, message: "Kombinasi platform + brand + akun ini sudah ada" },
          { status: 409 }
        );
      }
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/marketing-platforms error:", error);
    return NextResponse.json(
      { success: false, message: "Gagal menambah platform" },
      { status: 500 }
    );
  }
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);