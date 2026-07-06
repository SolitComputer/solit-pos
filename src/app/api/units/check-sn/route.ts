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

    // ── 2) Fallback: accessory_units ──
    // Normalisasi SN → uppercase (kolom disimpan uppercase), pakai .eq exact.
    const snUpper = sn.toUpperCase();

    const { data: accUnit, error: accErr } = await supabaseAdmin
      .from("accessory_units")
      .select("id, serial_number, condition, selling_price, status, notes, accessory_id")
      .eq("serial_number", snUpper)
      .maybeSingle();

    if (accErr) console.error("[check-sn] accessory_units:", accErr);

    if (accUnit) {
      // Ambil master accessory terpisah (hindari ketergantungan FK embed)
      const { data: accMaster, error: masterErr } = await supabaseAdmin
        .from("accessories")
        .select("id, name, category, brand, spec")
        .eq("id", accUnit.accessory_id)
        .maybeSingle();

      if (masterErr) console.error("[check-sn] accessories master:", masterErr);

      return NextResponse.json({
        success: true,
        data: {
          id: accUnit.id,
          serial_number: accUnit.serial_number,
          condition: accUnit.condition,
          selling_price: accUnit.selling_price,
          status: accUnit.status,
          notes: accUnit.notes,
          accessory: accMaster ?? {
            id: accUnit.accessory_id,
            name: "Aksesoris",
            category: "-",
            brand: null,
            spec: null,
          },
          type: "ACCESSORY",
        },
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