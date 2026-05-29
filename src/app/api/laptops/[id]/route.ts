import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";

interface Props {
  params: Promise<{ id: string }>;
}

// GET — semua role yang login boleh lihat detail laptop
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

// PUT — hanya ADMIN & PENGELOLA_BARANG
async function putHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;
    const body = await req.json();

    const { data, error } = await supabase
      .from("laptops")
      .update({
        laptop_name:    body.laptop_name,
        brand:          body.brand,
        cpu:            body.cpu,
        ram:            body.ram,
        storage:        body.storage,
        gpu:            body.gpu,
        display:        body.display,
        condition_note: body.condition_note,
        selling_price:  Number(body.selling_price),
        notes:          body.notes,
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

// DELETE — hanya ADMIN
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
export const PUT    = withAuth(putHandler,    PERMISSIONS.EDIT_LAPTOP);
export const DELETE = withAuth(deleteHandler, ["ADMIN"]);