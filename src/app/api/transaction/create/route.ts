import { NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { generateInvoice } from "@/lib/invoice";

export async function POST(
  request: Request
) {
  try {
    const body =
      await request.json();

    const invoice_number =
      generateInvoice();

    // ==========================
    // GET LAPTOP PRICE
    // ==========================
    const {
      data: laptop,
      error: laptopError,
    } = await supabase
      .from("laptops")
      .select("*")
      .eq(
        "id",
        body.laptop_id
      )
      .single();

    if (laptopError || !laptop) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Laptop tidak ditemukan",
        },
        { status: 404 }
      );
    }

    // ==========================
    // PRICE LOGIC
    // ==========================
    const inventory_price =
      laptop.selling_price || 0;

    const deal_price =
      Number(body.amount) || 0;

    const other =
      deal_price -
      inventory_price;

    // ==========================
    // SAVE TRANSACTION
    // ==========================
    const {
      data,
      error,
    } = await supabase
      .from("transactions")
      .insert({
        invoice_number,

        laptop_id:
          body.laptop_id,

        customer_name:
          body.customer_name,

        company_name:
          body.company_name,

        customer_phone:
          body.customer_phone,

        laptop_name:
          laptop.name ||
          body.laptop_name,

        serial_number:
          body.serial_number,

        software_request:
          body.software_request,

        pickup_method:
          body.pickup_method,

        pickup_date:
          body.pickup_date,

        pickup_time:
          body.pickup_time,

        pickup_location:
          body.pickup_location,

        source_platform:
          body.source_platform,

        // ==========================
        // PRICE DATA
        // ==========================
        inventory_price,
        deal_price,
        other,

        // amount tetap dipakai
        amount:
          deal_price,

        payment_method:
          body.payment_method,

        notes:
          body.notes,

        // MANUAL PAYMENT
        status:
          "PAID",

        paid_at:
          new Date()
            .toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error(error);

      return NextResponse.json(
        {
          success: false,
          message:
            error.message,
        },
        { status: 400 }
      );
    }

    // ==========================
    // UPDATE LAPTOP STATUS
    // ==========================
    await supabase
      .from("laptops")
      .update({
        status: "SOLD",
      })
      .eq(
        "id",
        body.laptop_id
      );

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        message:
          String(error),
      },
      { status: 500 }
    );
  }
}