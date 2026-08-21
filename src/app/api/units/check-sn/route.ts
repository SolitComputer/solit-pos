import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { BARANG_PRIVATE_VIEW_ROLES, hasAnyRole } from "@/lib/permissions";

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

    // ✅ SECURITY FIX: komentar di bawah ini dulu mengklaim "purchase_price
    // TIDAK bocor ke client" — padahal kolomnya di-select dan ikut dikirim
    // mentah ke SEMUA role login (withAuth tanpa daftar role). Sekarang
    // benar-benar disaring server-side untuk role non-privat.
    const canSeePrivate = hasAnyRole(user.roles ?? [user.role], BARANG_PRIVATE_VIEW_ROLES);

    // ── 1) Laptop dulu — .eq case-sensitive (perilaku lama, dipertahankan) ──
    const { data: laptopUnit, error: laptopErr } = await supabaseAdmin
      .from("laptop_units")
      .select(`
        id, serial_number, grade, condition_note, selling_price, purchase_price, status, notes,
        laptop:laptops (
          id, laptop_name, brand, cpu, ram, storage, gpu, display
        )
      `)
      .eq("serial_number", sn)
      .maybeSingle();

    if (laptopErr) console.error("[check-sn] laptop_units:", laptopErr);

    if (laptopUnit) {
      const safeUnit: Record<string, any> = { ...laptopUnit };
      if (!canSeePrivate) delete safeUnit.purchase_price;
      return NextResponse.json({
        success: true,
        data: { ...safeUnit, type: "LAPTOP" },
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

    // ── 3) Fallback: partial match di laptop_units (grup/kelompok) ──
    // Kalau SN yang dicari cuma SEBAGIAN dari serial number satu/lebih unit
    // (bukan exact match), kembalikan semua unit yang cocok, dikelompokkan
    // per model laptop — biar frontend bisa nampilin daftar unit ASLI,
    // bukan cuma "ketemu 1" atau "tidak ditemukan".
    // Guard length >= 3 biar nggak nge-scan seisi tabel kalau SN yang
    // diketik/discan cuma 1-2 karakter.
    if (sn.length >= 3) {
      const { data: partialUnits, error: partialErr } = await supabaseAdmin
        .from("laptop_units")
        .select(`
          id, serial_number, grade, condition_note, selling_price, status, notes,
          laptop:laptops (
            id, laptop_name, brand, cpu, ram, storage, gpu, display
          )
        `)
        .ilike("serial_number", `%${sn}%`)
        .order("serial_number", { ascending: true })
        .limit(50);

      if (partialErr) console.error("[check-sn] partial laptop_units:", partialErr);

      if (partialUnits && partialUnits.length > 0) {
        // Cuma 1 unit ketemu → perlakukan sama seperti exact match biasa
        if (partialUnits.length === 1) {
          return NextResponse.json({
            success: true,
            data: { ...partialUnits[0], type: "LAPTOP" },
          });
        }

        // >1 unit ketemu → kelompokkan per model laptop
        const groupMap = new Map<string, { laptop: any; units: any[] }>();
        for (const u of partialUnits) {
          const lap = Array.isArray(u.laptop) ? u.laptop[0] : u.laptop;
          const key = lap?.id ?? "unknown";
          if (!groupMap.has(key)) groupMap.set(key, { laptop: lap, units: [] });
          groupMap.get(key)!.units.push({
            id: u.id,
            serial_number: u.serial_number,
            grade: u.grade,
            condition_note: u.condition_note,
            selling_price: u.selling_price,
            status: u.status,
            notes: u.notes,
          });
        }

        return NextResponse.json({
          success: true,
          data: { type: "LAPTOP_GROUP", query: sn, groups: Array.from(groupMap.values()) },
        });
      }
    }

    // ── 4) Nggak ketemu di mana pun ──
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