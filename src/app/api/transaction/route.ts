import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";

async function handler(req: NextRequest, ctx: any, user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "ALL";

    let query = supabase
      .from("transactions")
      .select("*")
      .order("created_at", { ascending: false });

    if (status !== "ALL") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    const filtered =
      data?.filter((item) => {
        const keyword = search.toLowerCase();
        return (
          item.customer_name?.toLowerCase()?.includes(keyword) ||
          item.invoice_number?.toLowerCase()?.includes(keyword) ||
          item.customer_phone?.toLowerCase()?.includes(keyword) ||
          item.laptop_name?.toLowerCase()?.includes(keyword)
        );
      }) || [];

    return NextResponse.json({ success: true, data: filtered });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

// ADMIN, KEPALA_SALES, ACCOUNTING boleh lihat list transaksi
export const GET = withAuth(handler, PERMISSIONS.EDIT_TRANSACTION.concat(["ACCOUNTING"]));