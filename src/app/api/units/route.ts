import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";

async function getHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  try {
    const { data, error } = await supabase
      .from("laptop_units")
      .select(`
        *,
        laptops (
          laptop_name,
          brand,
          cpu,
          ram,
          storage
        )
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { success: false, message: "Gagal mengambil data semua unit" },
      { status: 500 }
    );
  }
}

export const GET = withAuth(getHandler, PERMISSIONS.VIEW_ALL_UNITS);
