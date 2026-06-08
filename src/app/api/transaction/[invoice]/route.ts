import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import { logActivity } from "@/lib/activityLogger";

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

async function putHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { invoice } = await props.params;
    const body = await req.json();

    const { data: before } = await supabase
      .from("transactions")
      .select("*")
      .eq("invoice_number", invoice)
      .single();

    const allowedFields: Record<string, any> = {};
    if (body.amount !== undefined) allowedFields.amount = Number(body.amount);
    if (body.deal_price !== undefined) allowedFields.deal_price = Number(body.deal_price);
    if (body.payment_method !== undefined) allowedFields.payment_method = body.payment_method;
    if (body.customer_name !== undefined) allowedFields.customer_name = body.customer_name;
    if (body.customer_phone !== undefined) allowedFields.customer_phone = body.customer_phone;
    if (body.company_name !== undefined) allowedFields.company_name = body.company_name;
    if (body.laptop_name !== undefined) allowedFields.laptop_name = body.laptop_name;
    if (body.serial_number !== undefined) allowedFields.serial_number = body.serial_number;
    if (body.pickup_method !== undefined) allowedFields.pickup_method = body.pickup_method;
    if (body.pickup_date !== undefined) allowedFields.pickup_date = body.pickup_date;
    if (body.pickup_time !== undefined) allowedFields.pickup_time = body.pickup_time;
    if (body.pickup_location !== undefined) allowedFields.pickup_location = body.pickup_location;
    if (body.software_request !== undefined) allowedFields.software_request = body.software_request;
    if (body.source_platform !== undefined) allowedFields.source_platform = body.source_platform;
    if (body.status !== undefined) allowedFields.status = body.status;
    if (body.notes !== undefined) allowedFields.notes = body.notes;
    if (body.customer_type !== undefined) allowedFields.customer_type = body.customer_type;
    if (body.payment_method_2 !== undefined)
      allowedFields.payment_method_2 = body.payment_method_2;
    if (body.amount_method_1 !== undefined)
      allowedFields.amount_method_1 = Number(body.amount_method_1);
    if (body.amount_method_2 !== undefined)
      allowedFields.amount_method_2 = Number(body.amount_method_2);
    if (body.is_trade_in !== undefined)
      allowedFields.is_trade_in = Boolean(body.is_trade_in);
    if (body.trade_in_item !== undefined)
      allowedFields.trade_in_item = body.trade_in_item;
    if (body.trade_in_value !== undefined)
      allowedFields.trade_in_value = Number(body.trade_in_value);
    if (body.trade_in_cash !== undefined)
      allowedFields.trade_in_cash = Number(body.trade_in_cash);

    if (body.deal_price !== undefined || body.amount !== undefined) {
      const inventoryPrice = before?.inventory_price ?? 0;
      const dealPrice = body.deal_price ?? body.amount ?? 0;
      allowedFields.other = Number(dealPrice) - Number(inventoryPrice);
    }

    allowedFields.last_edited_by = user.name;
    allowedFields.last_edited_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("transactions")
      .update(allowedFields)
      .eq("invoice_number", invoice)
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
      entity: "transaction",
      entityId: before?.id,
      entityLabel: `${invoice} — ${before?.customer_name ?? "—"}`,
      beforeData: before,
      afterData: data,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("PUT transaction error:", error);
    return NextResponse.json(
      { success: false, message: String(error) },
      { status: 500 }
    );
  }
}

export const GET = withAuth(
  getHandler,
  PERMISSIONS.EDIT_TRANSACTION.concat(["ACCOUNTING"])
);
export const PUT = withAuth(putHandler, PERMISSIONS.EDIT_TRANSACTION);