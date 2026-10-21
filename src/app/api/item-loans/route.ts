import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { ITEM_LOAN_VIEW_ROLES } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

async function getHandler(req: NextRequest, _ctx: unknown, _user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    let q = supabaseAdmin.from("item_loans").select("*").order("created_at", { ascending: false });
    if (status) q = q.eq("status", status);

    const { data, error } = await q;
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

async function postHandler(req: NextRequest, _ctx: unknown, user: AuthUser) {
  try {
    const body = await req.json();
    const { item_type, item_id, unit_id, serial_number, item_name, notes } = body ?? {};

    if (!item_type || !["LAPTOP", "AKSESORIS"].includes(item_type))
      return NextResponse.json({ success: false, message: "Tipe barang tidak valid" }, { status: 400 });
    if (!item_id) return NextResponse.json({ success: false, message: "Barang wajib dipilih" }, { status: 400 });
    if (!item_name) return NextResponse.json({ success: false, message: "Nama barang kosong" }, { status: 400 });

    if (unit_id) {
      const { data: existing } = await supabaseAdmin
        .from("item_loans")
        .select("id")
        .eq("unit_id", unit_id)
        .in("status", ["PENDING", "APPROVED"])
        .limit(1);
      if (existing && existing.length > 0) {
        return NextResponse.json(
          { success: false, message: "Unit ini sedang dipinjam atau menunggu persetujuan" },
          { status: 409 }
        );
      }
    }

    const { data, error } = await supabaseAdmin
      .from("item_loans")
      .insert({
        item_type,
        item_id,
        unit_id: unit_id || null,
        serial_number: serial_number || null,
        item_name,
        borrower_id: user.id,
        borrower_name: user.name,
        notes: notes || null,
        status: "PENDING",
      })
      .select()
      .single();

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 400 });

    try {
      await logActivity({
        userId: user.id, userName: user.name, userRole: user.role,
        action: "CREATE", entity: "item_loan", entityId: data.id,
        entityLabel: `Pinjam ${item_name}${serial_number ? ` (${serial_number})` : ""}`,
        afterData: data,
      });
    } catch { /* logging non-blocking */ }

    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(getHandler, ITEM_LOAN_VIEW_ROLES);
export const POST = withAuth(postHandler, ITEM_LOAN_VIEW_ROLES);