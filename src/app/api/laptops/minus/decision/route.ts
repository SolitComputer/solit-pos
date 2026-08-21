import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { recalcLaptopParentQty } from "@/lib/laptopStock";
import { MINUS_REVIEW_ROLES } from "@/lib/permissions";

// POST — keputusan akhir untuk unit minus yang sudah "Sudah Diatasi":
// OKE     → status jadi SIAP_JUAL (kembali normal ke Data Barang)
// NO_OKE  → keluar dari Data Barang, dicatat ke tabel dead_assets (Aset Matot)
async function decisionHandler(req: NextRequest, ctx: any, user: AuthUser) {
  try {
    const body = await req.json();
    const { unit_id, decision, keterangan } = body;

    if (!unit_id || !["OKE", "NO_OKE"].includes(decision)) {
      return NextResponse.json(
        { success: false, message: "unit_id dan decision (OKE/NO_OKE) wajib diisi" },
        { status: 400 }
      );
    }

    const { data: unit, error: fetchError } = await supabase
      .from("laptop_units")
      .select(`*, laptop:laptops ( laptop_name )`)
      .eq("id", unit_id)
      .single();

    if (fetchError || !unit) {
      return NextResponse.json({ success: false, message: "Unit tidak ditemukan" }, { status: 404 });
    }

    if (decision === "OKE") {
      const { data, error } = await supabase
        .from("laptop_units")
        .update({ status: "SIAP_JUAL", minus_status: "BELUM_DIATASI" })
        .eq("id", unit_id)
        .select()
        .single();

      if (error) return NextResponse.json({ success: false, message: error.message }, { status: 400 });

      await recalcLaptopParentQty(supabase, unit.laptop_id);
      return NextResponse.json({ success: true, data, moved_to: "SIAP_JUAL" });
    }

    // decision === "NO_OKE"
    const { error: insertError } = await supabase.from("dead_assets").insert({
      nama_barang: unit.laptop?.laptop_name || "Tidak diketahui",
      keterangan: (keterangan && String(keterangan).trim()) || unit.analisa || unit.repair_notes || null,
      kondisi: unit.condition_note || null,
      asal_serial_number: unit.serial_number,
      asal_laptop_name: unit.laptop?.laptop_name || null,
      created_by: user?.id || null,
      created_by_name: user?.name || null,
    });

    if (insertError) return NextResponse.json({ success: false, message: insertError.message }, { status: 400 });

    const { error: deleteError } = await supabase.from("laptop_units").delete().eq("id", unit_id);
    if (deleteError) return NextResponse.json({ success: false, message: deleteError.message }, { status: 400 });

    await recalcLaptopParentQty(supabase, unit.laptop_id);
    return NextResponse.json({ success: true, moved_to: "ASET_MATOT" });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const POST = withAuth(decisionHandler, MINUS_REVIEW_ROLES);