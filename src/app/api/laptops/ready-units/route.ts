import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { LAPTOP_READY_VIEW_ROLES } from "@/lib/permissions";

async function handler(req: NextRequest, ctx: any, user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const laptopId = searchParams.get("laptop_id");

    let query = supabase
      .from("laptop_units")
      .select(`
        *,
        laptop:laptops (
          id,
          laptop_name,
          brand,
          cpu,
          ram,
          storage,
          display,
          selling_price
        )
      `)
      .in("status", ["SIAP_JUAL", "RESERVED", "HELD", "PACKING"])
      .order("created_at", { ascending: false });

    // Filter per laptop kalau laptop_id diberikan
    if (laptopId) {
      query = query.eq("laptop_id", laptopId);
    }

   const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    //  Unit status SIAP_JUAL baru dianggap benar-benar "siap jual" kalau
    //  Harga Modal (purchase_price) & Harga Jual (selling_price) sudah
    //  diisi (> 0). Kalau salah satu masih 0/kosong, jangan tampilkan dulu
    //  sampai datanya dilengkapi di Data Laptop.
    //  RESERVED/HELD/PACKING tetap tampil apa adanya — sudah terikat
    //  transaksi, perlu kelihatan untuk proses pelunasan.
    const filtered = (data || []).filter((u: Record<string, any>) => {
      if (u.status !== "SIAP_JUAL") return true;
      const hasPurchasePrice = Number(u.purchase_price) > 0;
      const hasSellingPrice = Number(u.selling_price) > 0;
      return hasPurchasePrice && hasSellingPrice;
    });

    return NextResponse.json({ success: true, data: filtered });
  } catch (err) {
    console.error("[ready-units]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(handler, LAPTOP_READY_VIEW_ROLES);