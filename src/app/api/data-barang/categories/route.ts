import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { UserRole } from "@/lib/permissions";

// Role yang bisa akses Data Barang (read kategori):
// Admin, Admin Barang, Pengelola Barang, Team QC, dll
const READ_ROLES: UserRole[] = [
  "ADMIN", "KEPALA_ADMIN_BARANG", "ADMIN_BARANG",
  "KEPALA_PENGELOLA_BARANG", "PENGELOLA_BARANG",
  "KEPALA_TEKNISI", "TEKNISI",
  "ACCOUNTING", "ASISTEN_CEO", "PROGRAMMER",
];

async function getHandler(req: NextRequest, _ctx: unknown, _user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type"); // "LAPTOP" | "AKSESORIS" | null (all)

    let query = supabase
      .from("laptop_categories")
      .select("id, name, type, description")
      .order("name");

    if (type === "LAPTOP" || type === "AKSESORIS") {
      query = query.eq("type", type);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 400 });

    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (err) {
    console.error("[categories GET]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(getHandler, READ_ROLES);