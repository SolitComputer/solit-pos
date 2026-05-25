import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";

interface Props {
  params: Promise<{ id: string }>;
}

async function getHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;

    const { data, error } = await supabase
      .from("laptops")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
async function putHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const body = await req.json();
    const { id } = await props.params;

    const qty = Number(body.qty);
    const isReady = qty > 0 && body.status !== "BELUM_SIAP";

    const { data, error } = await supabase
      .from("laptops")
      .update({
        laptop_name: body.laptop_name,
        brand: body.brand,
        cpu: body.cpu,
        ram: body.ram,
        storage: body.storage,
        gpu: body.gpu,
        display: body.display,
        serial_number: body.serial_number,
        condition_note: body.condition_note,
        purchase_price: body.purchase_price,
        selling_price: body.selling_price,
        qty,
        status: qty <= 0 ? "SOLD" : "SIAP_JUAL",
        ready_to_sell: isReady,
        notes: body.notes,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

async function deleteHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;

    const { error } = await supabase
      .from("laptops")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET    = withAuth(getHandler);             
export const PUT    = withAuth(putHandler, ["ADMIN"]);  
export const DELETE = withAuth(deleteHandler, ["ADMIN"]); 