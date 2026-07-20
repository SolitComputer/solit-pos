import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { calculatePedagangPrice, PRICELIST_PEDAGANG_ROLES } from "@/lib/pricelistPedagang";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handler(req: NextRequest, ctx: any, user: AuthUser) {
  try {
    // Ambil SELURUH unit (bukan agregat per tipe laptop) — exclude yang SOLD.
    const { data, error } = await supabase
      .from("laptop_units")
      .select(`
        id,
        serial_number,
        grade,
        condition_note,
        purchase_price,
        status,
        created_at,
        laptop:laptops (
          id,
          laptop_name,
          brand,
          cpu,
          ram,
          storage,
          gpu,
          display
        )
      `)
      .neq("status", "SOLD")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }

    const result = (data || []).map((unit) => {
      const calc = calculatePedagangPrice(unit.purchase_price);
      return {
        unit_id: unit.id,
        serial_number: unit.serial_number,
        grade: unit.grade,
        condition_note: unit.condition_note,
        status: unit.status,
        laptop: unit.laptop,
        modal_price: calc.modalPrice,
        tier_label: calc.tier.label,
        tier_percent: calc.tier.percent,
        pedagang_price: calc.pedagangPrice,
      };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    console.error("[GET /api/price-list-pedagang]", err);
    return NextResponse.json(
      { success: false, message: "Gagal mengambil data price list pedagang" },
      { status: 500 }
    );
  }
}

export const GET = withAuth(handler, PRICELIST_PEDAGANG_ROLES);