import { NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";

async function handler(req: Request, ctx: any, user: AuthUser) {
  try {
    const { data, error } = await supabase
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
      .in("status", ["SIAP_JUAL", "RESERVED", "HELD"])
      .order("created_at", { ascending: false });

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

export const GET = withAuth(handler, [
  "ADMIN",
  "PENGELOLA_BARANG",
  "KEPALA_SALES",
  "CREW_SALES",
  "ACCOUNTING",
  "PENGANTARAN",
  "MARKETING", 
  "KEPALA_MARKETING"
]);