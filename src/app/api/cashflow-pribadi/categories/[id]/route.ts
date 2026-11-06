// PATCH  /api/cashflow-pribadi/categories/[id]   (rename / change color)
// DELETE /api/cashflow-pribadi/categories/[id]   (soft delete: set is_active=false)
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

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
  const { data: cat } = await sb
    .from("personal_cashflow_categories")
    .select("id, user_id, is_default")
    .eq("id", id)
    .maybeSingle();

  if (!cat) {
    return NextResponse.json({ success: false, message: "Kategori tidak ditemukan" }, { status: 404 });
  }
  if (cat.is_default || cat.user_id !== userId) {
    return NextResponse.json({ success: false, message: "Kategori default/milik orang lain tidak bisa diedit" }, { status: 403 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    const name = body.name.trim().slice(0, 50);
    if (name.length < 2) {
      return NextResponse.json({ success: false, message: "Nama minimal 2 karakter" }, { status: 400 });
    }
    patch.name = name;
  }
  if (typeof body.color === "string" && /^#[0-9a-fA-F]{6}$/.test(body.color)) {
    patch.color = body.color;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ success: false, message: "Tidak ada perubahan" }, { status: 400 });
  }

  const { data, error } = await sb
    .from("personal_cashflow_categories")
    .update(patch)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ success: false, message: "Nama kategori sudah dipakai" }, { status: 409 });
    }
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
  const { data: cat } = await sb
    .from("personal_cashflow_categories")
    .select("id, user_id, is_default")
    .eq("id", id)
    .maybeSingle();

  if (!cat) {
    return NextResponse.json({ success: false, message: "Kategori tidak ditemukan" }, { status: 404 });
  }
  if (cat.is_default) {
    return NextResponse.json({ success: false, message: "Kategori default tidak bisa dihapus" }, { status: 403 });
  }
  if (cat.user_id !== userId) {
    return NextResponse.json({ success: false, message: "Bukan kategori Anda" }, { status: 403 });
  }

  // Soft delete biar transaksi lama tetap bisa reference kategori (FK ON DELETE SET NULL)
  const { error } = await sb
    .from("personal_cashflow_categories")
    .update({ is_active: false })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}