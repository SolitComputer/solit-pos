import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";

interface Props {
  params: Promise<{ id: string }>;
}

async function handler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;
    const { qty, status } = await req.json();

    const { data, error } = await supabase
      .from("laptops")
      .update({
        qty:           Number(qty),
        status:        status,
        ready_to_sell: Number(qty) > 0,
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