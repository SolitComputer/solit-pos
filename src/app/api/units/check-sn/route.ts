import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { supabaseAdmin } from "@/services/supabaseAdmin";
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

    // ── 1) Cari di laptop_units dulu (perilaku lama, dipertahankan) ──
    const { data: laptopUnit, error: laptopErr } = await supabase
      .from("laptop_units")
      .select(`
        *,
        laptop:laptops (
          id, laptop_name, brand, cpu, ram, storage, gpu, display
        )
      `)
      .eq("serial_number", sn)
      .maybeSingle();

    if (laptopErr) console.error("[check-sn] laptop_units:", laptopErr);

    if (laptopUnit) {
      return NextResponse.json({
        success: true,
        data: { ...laptopUnit, type: "LAPTOP" },
      });
    }

    // ── 2) Fallback: cari di accessory_units ──
    // Pakai supabaseAdmin biar konsisten dgn route accessories lain
    // & aman dari RLS. SN aksesoris disimpan UPPERCASE → ilike biar
    // tetap ketemu walau scanner ngirim lowercase.
    const { data: accUnit, error: accErr } = await supabaseAdmin
      .from("accessory_units")
      .select(`
        *,
        accessory:accessories (
          id, name, category, brand, spec
        )
      `)
      .eq("serial_number", sn.toUpperCase())
      .maybeSingle();

    if (accErr) console.error("[check-sn] accessory_units:", accErr);

    if (accUnit) {
      return NextResponse.json({
        success: true,
        data: { ...accUnit, type: "ACCESSORY" },
      });
    }

    // ── 3) Nggak ketemu di dua-duanya ──
    return NextResponse.json(
      { success: false, message: `Serial number "${sn}" tidak ditemukan` },
      { status: 404 }
    );
  } catch (err) {
    console.error("[check-sn] fatal:", err);
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan server" },
      { status: 500 }
    );
  }
}

export const GET = withAuth(handler);