import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabase } from "@/services/supabase";

async function handler(req: NextRequest, ctx: any, user: AuthUser) {
  try {
    const { data, error } = await supabase
      .from("laptops")
      .select("*")
      .eq("status", "SIAP_JUAL")
      .gt("qty", 0)
      .order("created_at", { ascending: false });

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
  "ACCOUNTING",
  "PENGANTARAN",
  "MARKETING",
  "KEBERSIHAN",
  "KEPALA_MARKETING",
  "PENYEDIA_BARANG",
  "KEPALA_PENYEDIA_BARANG",
  "KONTEN",
]);