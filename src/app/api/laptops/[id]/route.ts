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
    const { id } = await props.params;
    const body = await req.json();

    // Ambil data sebelum diubah untuk before_data
    const { data: before } = await supabase
      .from("laptops")
      .select("*")
      .eq("id", id)
      .single();

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
        condition_note: body.condition_note,
        selling_price: Math.round(Number(body.selling_price)),
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

    await logActivity({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: "EDIT",
      entity: "laptop",
      entityId: id,
      entityLabel: before?.laptop_name ?? data.laptop_name,
      beforeData: before,
      afterData: data,
    });

    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

async function deleteHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;

    const { data: laptop } = await supabase
      .from("laptops")
      .select("*")
      .eq("id", id)
      .single();

    const { error: unitsError } = await supabase
      .from("laptop_units")
      .delete()
      .eq("laptop_id", id);

    if (unitsError) {
      return NextResponse.json(
        { success: false, message: "Gagal menghapus units: " + unitsError.message },
        { status: 400 }
      );
    }

    await supabase.from("warranties").delete().eq("laptop_id", id);

    const { error } = await supabase.from("laptops").delete().eq("id", id);

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
      action: "DELETE",
      entity: "laptop",
      entityId: id,
      entityLabel: laptop?.laptop_name,
      beforeData: laptop,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan server" },
      { status: 500 }
    );
  }
}

export const GET = withAuth(getHandler);
export const PUT = withAuth(putHandler, PERMISSIONS.EDIT_LAPTOP);
export const DELETE = withAuth(deleteHandler, ["ADMIN", "PENGELOLA_BARANG"]);