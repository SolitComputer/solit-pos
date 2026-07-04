import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";

async function handler(req: NextRequest, ctx: any, user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    let query = supabase
      .from("transactions")
      .select(`
        id,
        invoice_number,
        status,
        customer_name,
        customer_phone,
        company_name,
        laptop_name,
        serial_number,
        unit_id,
        laptop_id,
        deal_price,
        dp_amount,
        amount,
        payment_method,
        source_platform,
        notes,
        sales_name,
        created_at,
        paid_at,
        last_edited_by,
        last_edited_at
      `)
      .in("status", status ? [status] : ["RESERVED", "HELD"])
      .order("created_at", { ascending: false });

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (err) {
    console.error("[pending-orders]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(handler, [
  "ADMIN",
  "PROGRAMMER",
  "ASISTEN_CEO",
  "KEPALA_SALES",
  "CREW_SALES",
  "ACCOUNTING",
  "PENGANTARAN",
  "KEPALA_SOTECH", // ✅ ADD
  "SOTECH",        // ✅ ADD
]);