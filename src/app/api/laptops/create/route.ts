import { NextResponse } from "next/server";
import { supabase } from "@/services/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Cek apakah serial_number sudah ada
    if (body.serial_number) {
      const { data: existing } = await supabase
        .from("laptops")
        .select("id")
        .eq("serial_number", body.serial_number)
        .single();

      if (existing) {
        return NextResponse.json({
          success: false,
          message: "Serial Number ini sudah terdaftar. Tidak boleh duplikat.",
        }, { status: 409 });
      }
    }

    const { data, error } = await supabase
      .from("laptops")
      .insert({
        laptop_name: body.laptop_name,
        brand: body.brand,
        cpu: body.cpu,
        ram: body.ram,
        storage: body.storage,
        gpu: body.gpu,
        display: body.display,
        serial_number: body.serial_number,
        purchase_price: body.purchase_price,
        selling_price: body.selling_price,
        qty: body.qty,
        status: body.status,
        condition_note: body.condition_note,
        notes: body.notes,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({
        success: false,
        message: error.message,
      }, { status: 400 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error(error);
    return NextResponse.json({
      success: false,
      message: "Terjadi kesalahan server",
    }, { status: 500 });
  }
}