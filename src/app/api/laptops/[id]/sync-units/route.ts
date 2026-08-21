import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";

interface Props {
  params: Promise<{ id: string }>;
}

async function handler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;

    // ✅ SECURITY FIX: dulu qty/status ditulis mentah dari body client tanpa
    // validasi enum maupun perhitungan ulang dari data unit asli — siapa pun
    // dengan akses EDIT_LAPTOP bisa POST {qty, status} sembarang, memunculkan
    // stok "Siap Jual" palsu tanpa unit fisik di baliknya. Sekarang dihitung
    // ulang di server dari laptop_units, sama seperti /api/laptops/monitoring/reconcile.
    const { data: units, error: unitsErr } = await supabase
      .from("laptop_units")
      .select("status")
      .eq("laptop_id", id);
    if (unitsErr) throw unitsErr;

    const siapCount = (units ?? []).filter((u) => u.status === "SIAP_JUAL").length;
    const newStatus = siapCount > 0 ? "SIAP_JUAL" : (units ?? []).length === 0 ? "BELUM_SIAP" : "SOLD";

    const { data, error } = await supabase
      .from("laptops")
      .update({
        qty:           siapCount,
        status:        newStatus,
        ready_to_sell: siapCount > 0,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { success: false, message: "Gagal sync units" },
      { status: 500 }
    );
  }
}

export const POST = withAuth(handler, PERMISSIONS.EDIT_LAPTOP);