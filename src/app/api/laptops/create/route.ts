import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import { logActivity } from "@/lib/activityLogger";

async function handler(req: NextRequest, _ctx: any, user: AuthUser) {
  try {
    const body = await req.json();

    const { data: laptop, error } = await supabase
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
        purchase_price: Math.round(Number(body.purchase_price) || 0),
        selling_price: Math.round(Number(body.selling_price) || 0),
        qty: 0,           
        status: "BELUM_SIAP",
        condition_note: body.condition_note,
        notes: body.notes,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    await logActivity({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: "CREATE",
      entity: "laptop",
      entityId: laptop.id,
      entityLabel: laptop.laptop_name,
      afterData: laptop,
    });

    return NextResponse.json({ success: true, data: laptop });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

export const POST = withAuth(handler, PERMISSIONS.CREATE_LAPTOP);