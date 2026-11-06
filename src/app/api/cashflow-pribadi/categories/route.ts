// GET  /api/cashflow-pribadi/categories           → default sistem + custom user
// POST /api/cashflow-pribadi/categories           → create custom category
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isValidType } from "@/lib/cashflowPribadi";

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function GET(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const sb = admin();
  const { data, error } = await sb
    .from("personal_cashflow_categories")
    .select("*")
    .or(`user_id.eq.${userId},user_id.is.null`)   // default sistem + milik user
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("type")
    .order("name");

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, data });
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ success: false, message: "Body harus JSON" }, { status: 400 }); }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 50) : "";
  if (name.length < 2) {
    return NextResponse.json({ success: false, message: "Nama kategori minimal 2 karakter" }, { status: 400 });
  }
  if (!isValidType(body.type)) {
    return NextResponse.json({ success: false, message: "type harus 'income' atau 'expense'" }, { status: 400 });
  }
  const color = typeof body.color === "string" && /^#[0-9a-fA-F]{6}$/.test(body.color) ? body.color : "#6b7280";
  const icon = typeof body.icon === "string" ? body.icon.slice(0, 32) : null;

  const sb = admin();
  const { data, error } = await sb
    .from("personal_cashflow_categories")
    .insert({ user_id: userId, name, type: body.type, color, icon, is_default: false, is_active: true })
    .select()
    .single();

  if (error) {
    // Kalau unique violation (nama duplikat)
    if (error.code === "23505") {
      return NextResponse.json({ success: false, message: "Nama kategori sudah dipakai" }, { status: 409 });
    }
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, data });
}