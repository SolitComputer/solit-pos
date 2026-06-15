import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";

async function handler(req: NextRequest, ctx: any, user: AuthUser) {
  try {
    const { data, error } = await supabase
      .from("laptops")
      .select(`
        *,
        laptop_units (
          id,
          serial_number,
          grade,
          status,
          selling_price
        )
      `)
      .order("laptop_name", { ascending: true });

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(handler, [
  "ADMIN",
  "PROGRAMMER",
  "ASISTEN_CEO",
  "PENGELOLA_BARANG",
  "KEPALA_SALES",
  "CREW_SALES",
  "SOTECH",
  "KEPALA_SOTECH",
  "ACCOUNTING",
  "PENGANTARAN",
  "MARKETING",
  "KEPALA_MARKETING",
  "PENYEDIA_BARANG",
  "KEPALA_PENYEDIA_BARANG",
  "KONTEN",
  "KEPALA_ONPOINT",   
  "ONPOINT",          
]);