import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";

async function handler(req: NextRequest, ctx: any, user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const minSisa = searchParams.get("minSisa");
    const maxSisa = searchParams.get("maxSisa");

    const query = supabase
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
        unit_ids,
        serial_numbers,
        laptop_id,
        deal_price,
        dp_amount,
        amount,
        payment_method,
        source_platform,
        notes,
        sales_id,
        sales_name,
        created_at,
        paid_at,
        last_edited_by,
        last_edited_at
      `)
      .in("status", status ? [status] : ["RESERVED", "HELD", "PENDING"])
      .order("created_at", { ascending: false });

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    // ── Hitung sisa pembayaran + hak FU, filter di JS (bukan kolom asli) ──
    const min = minSisa ? Number(minSisa) : null;
    const max = maxSisa ? Number(maxSisa) : null;

    const enriched = (data || [])
      .map((t: any) => {
        const dealTotal = Number(t.deal_price ?? t.amount ?? 0);
        const paid = Number(t.dp_amount ?? 0);
        const sisa_pembayaran = Math.max(0, dealTotal - paid);
        return {
          ...t,
          sisa_pembayaran,
          can_fu: t.sales_id === user.id,
          pending_type: t.status === "RESERVED" ? "DP" : t.status === "HELD" ? "AMBIL_DULU" : t.status,
        };
      })
      .filter((t) => {
        if (min !== null && t.sisa_pembayaran < min) return false;
        if (max !== null && t.sisa_pembayaran > max) return false;
        return true;
      });

    return NextResponse.json({ success: true, data: enriched });
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
  "KEPALA_SOTECH",
  "SOTECH",
]);