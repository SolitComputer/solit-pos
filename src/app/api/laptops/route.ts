import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";

async function handler(req: NextRequest, ctx: any, user: AuthUser) {
  try {
    const { data, error } = await supabase
      .from("laptops")
      .select("*")
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
  "PENGELOLA_BARANG",
  "KEPALA_SALES",
  "CREW_SALES",
  "ACCOUNTING",
  "PENGANTARAN",
  "MARKETING", 
  "KEPALA_MARKETING"
]);