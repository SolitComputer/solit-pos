import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";

interface Props {
  params: Promise<{ invoice: string }>;
}

async function getHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { invoice } = await props.params;

    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("invoice_number", invoice)
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, message: String(error) },
      { status: 500 }
    );
  }
}

// ADMIN, KEPALA_SALES, ACCOUNTING boleh lihat detail transaksi
export const GET = withAuth(
  getHandler,
  PERMISSIONS.EDIT_TRANSACTION.concat(["ACCOUNTING"])
);