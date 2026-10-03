import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { calculatePedagangPrice, PRICELIST_PEDAGANG_ROLES, PRICELIST_MODAL_VIEW_ROLES } from "@/lib/pricelistPedagang";

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
        pedagang_price_manual,
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
          display,
          charger_price,
          laptop_bag_price
        )
      `)
     .neq("status", "SOLD")
      .eq("is_pedagang_listed", true)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }

    const result = (data || []).map((unit) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lap = unit.laptop as any;
      const chargerPrice = lap?.charger_price ?? 0;
      const bagPrice = lap?.laptop_bag_price ?? 0;
      const calc = calculatePedagangPrice(unit.purchase_price, chargerPrice, bagPrice);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const manual = (unit as any).pedagang_price_manual;
      const hasManual = manual !== null && manual !== undefined;
      const pedagangPrice = hasManual ? Number(manual) : calc.pedagangPrice;
      return {
        unit_id: unit.id,
        serial_number: unit.serial_number,
        grade: unit.grade,
        condition_note: unit.condition_note,
        status: unit.status,
        laptop: unit.laptop,
        charger_price: chargerPrice,
        laptop_bag_price: bagPrice,
        modal_price: calc.modalPrice,
        tier_label: calc.tier.label,
        tier_percent: calc.tier.percent,
        pedagang_price: pedagangPrice,
        is_manual_price: hasManual,
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

// ── PATCH: set/hapus harga Price Store manual untuk 1 model laptop ──────────
// Body: { laptop_id: string, pedagang_price_manual: number | null }
//   number → override manual   |   null → balik ke harga auto-kalkulasi.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function patchHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  try {
    const body = await req.json();
    const laptopId = body.laptop_id;
    if (!laptopId || typeof laptopId !== "string") {
      return NextResponse.json({ success: false, message: "laptop_id wajib diisi" }, { status: 400 });
    }

    let manual: number | null;
    if (body.pedagang_price_manual === null) {
      manual = null;
    } else {
      const n = Math.round(Number(body.pedagang_price_manual));
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ success: false, message: "Harga tidak valid" }, { status: 400 });
      }
      manual = n;
    }

    const { data, error } = await supabase
      .from("laptop_units")
      .update({ pedagang_price_manual: manual })
      .eq("laptop_id", laptopId)
      .neq("status", "SOLD")
      .select("id");

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, updated: data?.length ?? 0, pedagang_price_manual: manual });
  } catch (err) {
    console.error("[PATCH /api/price-list-pedagang]", err);
    return NextResponse.json({ success: false, message: "Gagal menyimpan harga manual" }, { status: 500 });
  }
}

export const GET = withAuth(handler, PRICELIST_PEDAGANG_ROLES);
export const PATCH = withAuth(patchHandler, PRICELIST_MODAL_VIEW_ROLES);