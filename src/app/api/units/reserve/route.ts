import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import { generateInvoice } from "@/lib/invoice";
import { logActivity } from "@/lib/activityLogger";

// POST — buat reservasi (DP atau Ambil Dulu)
async function postHandler(req: NextRequest, ctx: any, user: AuthUser) {
  try {
    const body = await req.json();
    const {
      unit_id,
      type, // "RESERVED" = DP, "HELD" = ambil dulu
      customer_name,
      customer_phone,
      company_name,
      amount,        // jumlah DP atau harga deal
      payment_method,
      source_platform,
      notes,
      sales_name,
    } = body;

    if (!unit_id || !type || !customer_name) {
      return NextResponse.json(
        { success: false, message: "unit_id, type, dan customer_name wajib diisi" },
        { status: 400 }
      );
    }

    // Cek unit tersedia
    const { data: unit } = await supabase
      .from("laptop_units")
      .select("*, laptop:laptops(id, laptop_name, selling_price)")
      .eq("id", unit_id)
      .single();

    if (!unit || unit.status !== "SIAP_JUAL") {
      return NextResponse.json(
        { success: false, message: "Unit tidak tersedia atau sudah dipesan" },
        { status: 400 }
      );
    }

    const invoice_number = await generateInvoice();
    const txStatus = type === "RESERVED" ? "RESERVED" : "HELD";

    // Buat transaksi
    const { data: transaction, error: txError } = await supabase
      .from("transactions")
      .insert({
        invoice_number,
        sales_id:        user.id,
        sales_name:      sales_name || user.name,
        laptop_id:       unit.laptop?.id,
        unit_id:         type === "HELD" ? unit_id : null, // SN kosong untuk DP
        serial_number:   type === "HELD" ? unit.serial_number : null,
        laptop_name:     unit.laptop?.laptop_name,
        customer_name,
        customer_phone:  customer_phone || null,
        company_name:    company_name || null,
        inventory_price: unit.purchase_price || 0,
        deal_price:      amount || 0,
        amount:          amount || 0,
        other:           (amount || 0) - (unit.purchase_price || 0),
        payment_method:  payment_method || "CASH",
        source_platform: source_platform || null,
        notes:           notes || null,
        status:          txStatus,
        paid_at:         null, // belum lunas
      })
      .select()
      .single();

    if (txError) {
      return NextResponse.json(
        { success: false, message: txError.message },
        { status: 400 }
      );
    }

    // Update status unit
    await supabase
      .from("laptop_units")
      .update({
        status:           type === "RESERVED" ? "RESERVED" : "HELD",
        reserved_by:      customer_name,
        reserved_invoice: invoice_number,
      })
      .eq("id", unit_id);

    await logActivity({
      userId:      user.id,
      userName:    user.name,
      userRole:    user.role,
      action:      "CREATE",
      entity:      "transaction",
      entityId:    transaction.id,
      entityLabel: `${invoice_number} — ${customer_name} [${txStatus}]`,
      afterData:   transaction,
    });

    return NextResponse.json({
      success: true,
      data: transaction,
      invoice_number,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 });
  }
}

export const POST = withAuth(postHandler, PERMISSIONS.CREATE_TRANSACTION);