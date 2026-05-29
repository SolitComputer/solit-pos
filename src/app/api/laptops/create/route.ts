import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";

async function postHandler(
  req: NextRequest,
  user: AuthUser
) {
  try {
    const body = await req.json();

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
        purchase_price: Number(body.purchase_price),
        selling_price: Number(body.selling_price),
        qty: Number(body.qty),
        status: body.status,
        condition_note: body.condition_note,
        notes: body.notes,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        {
          success: false,
          message: error.message,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.log(error);

    return NextResponse.json(
      {
        success: false,
        message: "Internal server error",
      },
      { status: 500 }
    );
  }
}

export const POST = withAuth(
  postHandler,
  ["ADMIN", "OPERATOR"]
);