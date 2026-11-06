// PATCH  /api/cashflow-pribadi/transactions/[id]
// DELETE /api/cashflow-pribadi/transactions/[id]  (soft delete)
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  isValidType, isValidPaymentMethod, isValidDateString,
} from "@/lib/cashflowPribadi";

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function assertOwnership(sb: ReturnType<typeof admin>, id: string, userId: string) {
  const { data, error } = await sb
    .from("personal_cashflow_transactions")
    .select("id, user_id, is_deleted")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return { ok: false, status: 404, msg: "Transaksi tidak ditemukan" };
  if (data.user_id !== userId) return { ok: false, status: 403, msg: "Bukan transaksi Anda" };
  if (data.is_deleted) return { ok: false, status: 400, msg: "Transaksi sudah dihapus" };
  return { ok: true as const };
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ success: false, message: "Body harus JSON" }, { status: 400 }); }

  const sb = admin();
  const owner = await assertOwnership(sb, id, userId);
  if (!owner.ok) {
    return NextResponse.json({ success: false, message: owner.msg }, { status: owner.status });
  }

  const patch: Record<string, unknown> = {};
  if (body.type !== undefined) {
    if (!isValidType(body.type)) {
      return NextResponse.json({ success: false, message: "type tidak valid" }, { status: 400 });
    }
    patch.type = body.type;
  }
  if (body.amount !== undefined) {
    const amt = Number(body.amount);
    if (!Number.isFinite(amt) || amt <= 0 || !Number.isInteger(amt)) {
      return NextResponse.json({ success: false, message: "amount harus bilangan bulat positif" }, { status: 400 });
    }
    patch.amount = amt;
  }
  if (body.payment_method !== undefined) {
    if (!isValidPaymentMethod(body.payment_method)) {
      return NextResponse.json({ success: false, message: "payment_method tidak valid" }, { status: 400 });
    }
    patch.payment_method = body.payment_method;
  }
  if (body.transaction_date !== undefined) {
    if (!isValidDateString(body.transaction_date)) {
      return NextResponse.json({ success: false, message: "transaction_date tidak valid" }, { status: 400 });
    }
    patch.transaction_date = body.transaction_date;
  }
  if (body.description !== undefined) {
    patch.description = typeof body.description === "string"
      ? body.description.trim().slice(0, 500) : null;
  }
  if (body.category_id !== undefined) {
    patch.category_id = typeof body.category_id === "string" && body.category_id
      ? body.category_id : null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ success: false, message: "Tidak ada perubahan" }, { status: 400 });
  }

  const { data, error } = await sb
    .from("personal_cashflow_transactions")
    .update(patch)
    .eq("id", id)
    .eq("user_id", userId)                 // 🔒 double-check privacy
    .select()
    .single();

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, data });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const sb = admin();
  const owner = await assertOwnership(sb, id, userId);
  if (!owner.ok) {
    return NextResponse.json({ success: false, message: owner.msg }, { status: owner.status });
  }

  const { error } = await sb
    .from("personal_cashflow_transactions")
    .update({ is_deleted: true })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}