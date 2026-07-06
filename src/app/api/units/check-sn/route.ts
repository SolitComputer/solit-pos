import { NextRequest, NextResponse } from "next/server";
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

    // ── 1) Laptop dulu — .eq case-sensitive (perilaku lama, dipertahankan) ──
    // Kolom di-select eksplisit biar buy_price (modal) TIDAK bocor ke client.
    const { data: laptopUnit, error: laptopErr } = await supabaseAdmin
      .from("laptop_units")
      .select(`
        id, serial_number, grade, condition_note, selling_price, status, notes,
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

    // ── 2) Fallback: accessory_units — .ilike biar case-insensitive ──
    const { data: accUnit, error: accErr } = await supabaseAdmin
      .from("accessory_units")
      .select(`
        id, serial_number, condition, selling_price, status, notes,
        accessory:accessories (
          id, name, category, brand, spec
        )
      `)
      .ilike("serial_number", sn)
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