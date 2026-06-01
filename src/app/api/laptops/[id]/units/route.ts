import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import { logActivity } from "@/lib/activityLogger";

interface Props {
  params: Promise<{ id: string }>;
}

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

async function postHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;
    const body = await req.json();

    const {
      serial_number, grade, condition_note,
      purchase_price, selling_price, status, notes,
      received_at, // ← tambah ini
    } = body;

    const { data, error } = await supabase
      .from("laptop_units")
      .insert({
        laptop_id: id,
        serial_number,
        grade,
        condition_note,
        purchase_price: purchase_price != null ? Math.round(Number(purchase_price)) : 0,
        selling_price: selling_price != null ? Math.round(Number(selling_price)) : 0,
        status,
        notes,
        ...(received_at ? { created_at: received_at } : {}),
      })
      .select()
      .single();

    if (error) throw error;

    const { data: laptop } = await supabase
      .from("laptops")
      .select("laptop_name")
      .eq("id", id)
      .single();

    await logActivity({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: "CREATE",
      entity: "unit",
      entityId: data.id,
      entityLabel: `SN: ${data.serial_number}${laptop ? ` (${laptop.laptop_name})` : ""}`,
      afterData: data,
    });

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { success: false, message: "Gagal menambahkan unit" },
      { status: 500 }
    );
  }
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler, PERMISSIONS.CREATE_LAPTOP);