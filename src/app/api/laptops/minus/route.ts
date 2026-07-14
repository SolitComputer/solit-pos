import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { recalcLaptopParentQty } from "@/lib/laptopStock";

async function handler(req: NextRequest, ctx: any, user: AuthUser) {
  try {
    const { data, error } = await supabase
      .from("laptop_units")
      .select(`
        *,
        laptop:laptops (
          id, laptop_name, brand, cpu, ram, storage, selling_price
        )
      `)
      .in("status", ["SERVICE", "BELUM_SIAP"])
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

// PUT — update repair_status, repair_notes, analisa, progress_pengerjaan, status
async function putHandler(req: NextRequest, ctx: any, user: AuthUser) {
  try {
    const body = await req.json();
    const { unit_id, repair_status, repair_notes, status, analisa, progress_pengerjaan } = body;

    if (!unit_id) {
      return NextResponse.json(
        { success: false, message: "unit_id wajib diisi" },
        { status: 400 }
      );
    }

    const updateData: Record<string, any> = {};
    if (repair_status       !== undefined) updateData.repair_status       = repair_status;
    if (repair_notes        !== undefined) updateData.repair_notes        = repair_notes;
    if (status              !== undefined) updateData.status              = status;
    if (analisa             !== undefined) updateData.analisa             = analisa;
    if (progress_pengerjaan !== undefined) updateData.progress_pengerjaan = progress_pengerjaan;

    const { data, error } = await supabase
      .from("laptop_units")
      .update(updateData)
      .eq("id", unit_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    // Status unit berubah → sinkronkan qty parent.
    if (updateData.status !== undefined) {
      await recalcLaptopParentQty(supabase, data?.laptop_id);
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(handler, ["ADMIN", "PROGRAMMER", "ASISTEN_CEO", "ACCOUNTING", "PENGELOLA_BARANG", "TEKNISI", "KEPALA_TEKNISI", "KEPALA_PENGELOLA_BARANG"]);
export const PUT = withAuth(putHandler, ["ADMIN", "PROGRAMMER", "ASISTEN_CEO", "ACCOUNTING", "PENGELOLA_BARANG", "TEKNISI", "KEPALA_TEKNISI", "KEPALA_PENGELOLA_BARANG"]);