import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PREPARATION_VIEW_ROLES, PREPARATION_CREATE_ROLES } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

// Nomor order: PREP-YYYYMMDD-XXXX
async function generateOrderNumber(): Promise<string> {
  const now = new Date();
  const prefix = `PREP-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

  const { data } = await supabase
    .from("preparation_orders")
    .select("order_number")
    .like("order_number", `${prefix}%`)
    .order("order_number", { ascending: false })
    .limit(1);

  let seq = 1;
  if (data && data.length > 0) {
    const lastNum = parseInt(data[0].order_number.split("-").pop() ?? "0", 10);
    if (!isNaN(lastNum)) seq = lastNum + 1;
  }
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}

async function getHandler(req: NextRequest, _ctx: any, _user: AuthUser) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "ALL";
    const search = url.searchParams.get("search")?.trim() ?? "";

    let query = supabase
      .from("preparation_orders")
      .select(`*, preparation_items ( id, serial_number, laptop_name, is_checked, check_note )`)
      .order("created_at", { ascending: false });

    if (status !== "ALL") query = query.eq("status", status);
    if (search) {
      query = query.or(
        `order_number.ilike.%${search}%,customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%`
      );
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (err) {
    console.error("[GET /api/preparation]", err);
    return NextResponse.json({ success: false, message: "Gagal mengambil data" }, { status: 500 });
  }
}

async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  try {
    const body = await req.json();
    const { customer_name, customer_phone, notes, items, delivery_address } = body;

    if (!customer_name || !String(customer_name).trim()) {
      return NextResponse.json({ success: false, message: "Nama customer wajib diisi" }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, message: "Minimal 1 serial number harus diisi" }, { status: 400 });
    }

    const cleanItems = items
      .map((it: any) => ({
        serial_number: String(it.serial_number ?? "").trim(),
        laptop_name: it.laptop_name ?? null,
        laptop_id: it.laptop_id ?? null,
        unit_id: it.unit_id ?? null,
      }))
      .filter((it) => it.serial_number);

    if (cleanItems.length === 0) {
      return NextResponse.json({ success: false, message: "Serial number tidak boleh kosong" }, { status: 400 });
    }

    const order_number = await generateOrderNumber();

    const { data: order, error: orderError } = await supabase
      .from("preparation_orders")
      .insert({
        order_number,
        customer_name: String(customer_name).trim(),
        customer_phone: customer_phone ?? null,
        delivery_address: delivery_address ?? null,
        notes: notes ?? null,
        status: "MENUNGGU",
        created_by: user.id,
        created_by_name: user.name,
        created_by_role: user.role,
      })
      .select()
      .single();

    if (orderError) throw orderError;

    const { error: itemsError } = await supabase
      .from("preparation_items")
      .insert(cleanItems.map((it) => ({ preparation_id: order.id, ...it })));

    if (itemsError) {
      // rollback header kalau item gagal (hindari order "yatim")
      await supabase.from("preparation_orders").delete().eq("id", order.id);
      throw itemsError;
    }

    await logActivity({
      userId: user.id, userName: user.name, userRole: user.role,
      action: "CREATE", entity: "preparation", entityId: order.id,
      entityLabel: `${order_number} — ${customer_name} (${cleanItems.length} SN)`,
      afterData: order,
    });

    return NextResponse.json({
      success: true, data: order,
      message: `Penyiapan ${order_number} dibuat (${cleanItems.length} unit)`,
    });
  } catch (err: any) {
    console.error("[POST /api/preparation]", err);
    return NextResponse.json({ success: false, message: err?.message ?? "Gagal membuat penyiapan" }, { status: 500 });
  }
}

export const GET = withAuth(getHandler, PREPARATION_VIEW_ROLES);
export const POST = withAuth(postHandler, PREPARATION_CREATE_ROLES);