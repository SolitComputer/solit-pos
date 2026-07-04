import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { LAPTOP_READY_VIEW_ROLES } from "@/lib/permissions";

async function handler(req: NextRequest, ctx: any, user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const laptopId = searchParams.get("laptop_id");

    let query = supabase
      .from("laptop_units")
      .select(`
        *,
        laptop:laptops (
          id,
          laptop_name,
          brand,
          cpu,
          ram,
          storage,
          selling_price
        )
      `)
      .in("status", ["SIAP_JUAL", "RESERVED", "HELD", "PACKING"])
      .order("created_at", { ascending: false });

    // Filter per laptop kalau laptop_id diberikan
    if (laptopId) {
      query = query.eq("laptop_id", laptopId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (err) {
    console.error("[ready-units]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(handler, LAPTOP_READY_VIEW_ROLES);