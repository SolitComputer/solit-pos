import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import { generateInvoice } from "@/lib/invoice";
import { logActivity } from "@/lib/activityLogger";

async function postHandler(req: NextRequest, ctx: any, user: AuthUser) {
  try {
    const body = await req.json();
    const {
      unit_id,
      type,             
      customer_name,
      customer_phone,
      company_name,
      dp_amount,        
      deal_price,       
      payment_method,
      source_platform,
      notes,
      sales_name,
      software_request,
      pickup_method,
      pickup_date,
      pickup_time,
      pickup_location,
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
      .select("*, laptop:laptops(id, laptop_name, selling_price, brand, cpu, ram, storage)")
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

    // Untuk RESERVED: amount = dp_amount (uang DP)
    // Untuk HELD: amount = deal_price (harga deal yang disepakati)
    const txAmount = type === "RESERVED"
      ? (Number(dp_amount) || 0)
      : (Number(deal_price) || 0);

    const txDealPrice = Number(deal_price) || 0;
    const inventoryPrice = Number(unit.purchase_price) || 0;

    // Buat transaksi — SN & unit_id SELALU disimpan untuk kedua tipe
    const { data: transaction, error: txError } = await supabase
      .from("transactions")
      .insert({
        invoice_number,
        sales_id:        user.id,
        sales_name:      sales_name || user.name,
        laptop_id:       unit.laptop?.id,
        unit_id:         unit_id,          // ← SELALU simpan unit_id
        serial_number:   unit.serial_number, // ← SELALU simpan SN
        laptop_name:     unit.laptop?.laptop_name,
        customer_name,
        customer_phone:  customer_phone || null,
        company_name:    company_name || null,
        inventory_price: inventoryPrice,
        deal_price:      txDealPrice,
        amount:          txAmount,
        other:           txDealPrice - inventoryPrice,
        payment_method:  payment_method || "CASH",
        source_platform: source_platform || null,
        notes:           notes || null,
        software_request: software_request || null,
        pickup_method:   pickup_method || null,
        pickup_date:     pickup_date || null,
        pickup_time:     pickup_time || null,
        pickup_location: pickup_location || null,
        status:          txStatus,
        paid_at:         null,
      })
      .select()
      .single();

    if (txError) {
      return NextResponse.json(
        { success: false, message: txError.message },
        { status: 400 }
      );
    }

    // Update status unit — SELALU simpan info reservasi
    await supabase
      .from("laptop_units")
      .update({
        status:           txStatus,
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
      entityLabel: `${invoice_number} — ${customer_name} [${txStatus}] SN:${unit.serial_number}`,
      afterData:   transaction,
    });

    return NextResponse.json({
      success:        true,
      data:           transaction,
      invoice_number,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 });
  }
}

export const POST = withAuth(postHandler, PERMISSIONS.CREATE_TRANSACTION);