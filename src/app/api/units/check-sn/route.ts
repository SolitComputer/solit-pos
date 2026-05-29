import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";

async function handler(req: NextRequest, ctx: any, user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const sn = searchParams.get("sn")?.trim();

    if (!sn) {
      return NextResponse.json(
        { success: false, message: "Parameter 'sn' wajib diisi" },
        { status: 400 }
      );
    }

    const { data: unit, error } = await supabase
      .from("laptop_units")
      .select(`
        *,
        laptop:laptops (
          id, laptop_name, brand, cpu, ram, storage, gpu, display
        )
      `)
      .eq("serial_number", sn)
      .single();

    if (error || !unit) {
      return NextResponse.json(
        { success: false, message: `Serial number "${sn}" tidak ditemukan` },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: unit });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan server" },
      { status: 500 }
    );
  }
}

export const GET = withAuth(handler);