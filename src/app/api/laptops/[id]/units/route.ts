import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";

interface Props {
  params: Promise<{ id: string }>;
}

// GET — semua role yang login boleh lihat units (untuk barcode, transaksi, dll)
async function getHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;

    const { data, error } = await supabase
      .from("laptop_units")
      .select("*")
      .eq("laptop_id", id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { success: false, message: "Gagal mengambil data units" },
      { status: 500 }
    );
  }
}

// POST — hanya ADMIN & PENGELOLA_BARANG
async function postHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;
    const body = await req.json();

    const {
      serial_number,
      grade,
      condition_note,
      purchase_price,
      selling_price,
      status,
      notes,
    } = body;

    const { data, error } = await supabase
      .from("laptop_units")
      .insert({
        laptop_id: id,
        serial_number,
        grade,
        condition_note,
        purchase_price,
        selling_price,
        status,
        notes,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { success: false, message: "Gagal menambahkan unit" },
      { status: 500 }
    );
  }
}

export const GET  = withAuth(getHandler);
export const POST = withAuth(postHandler, PERMISSIONS.CREATE_LAPTOP);