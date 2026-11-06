// GET  /api/cashflow-pribadi/transactions?start=YYYY-MM-DD&end=YYYY-MM-DD&type=income|expense&category_id=...&limit=50&offset=0
// POST /api/cashflow-pribadi/transactions
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

function getUserId(req: NextRequest): string | null {
  return req.headers.get("x-user-id");
}

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const type = searchParams.get("type");
  const categoryId = searchParams.get("category_id");
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);
  const offset = Math.max(Number(searchParams.get("offset") ?? 0), 0);

  const sb = admin();
  let q = sb
    .from("personal_cashflow_transactions")
    .select(`
      id, user_id, category_id, type, amount, description, payment_method,
      transaction_date, is_deleted, created_at, updated_at,
      category:personal_cashflow_categories ( id, name, color, icon )
    `, { count: "exact" })
    .eq("user_id", userId)                 // 🔒 CRITICAL: filter privacy
    .eq("is_deleted", false)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (start && isValidDateString(start)) q = q.gte("transaction_date", start);
  if (end && isValidDateString(end)) q = q.lte("transaction_date", end);
  if (type && isValidType(type)) q = q.eq("type", type);
  if (categoryId) q = q.eq("category_id", categoryId);

  const { data, error, count } = await q;
  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data, total: count ?? 0 });
}

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "Body harus JSON" }, { status: 400 });
  }

  // ── Validation ─────────────────────────────────────────────────────────────
  if (!isValidType(body.type)) {
    return NextResponse.json({ success: false, message: "type harus 'income' atau 'expense'" }, { status: 400 });
  }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    return NextResponse.json({ success: false, message: "amount harus bilangan bulat positif" }, { status: 400 });
  }
  if (!isValidPaymentMethod(body.payment_method)) {
    return NextResponse.json({ success: false, message: "payment_method tidak valid" }, { status: 400 });
  }
  if (!isValidDateString(body.transaction_date)) {
    return NextResponse.json({ success: false, message: "transaction_date harus format YYYY-MM-DD" }, { status: 400 });
  }
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 500) : null;
  const categoryId = typeof body.category_id === "string" && body.category_id ? body.category_id : null;

  const sb = admin();

  // Jika category_id dikasih, pastikan milik user atau default sistem
  if (categoryId) {
    const { data: cat, error: catErr } = await sb
      .from("personal_cashflow_categories")
      .select("id, user_id, type, is_active")
      .eq("id", categoryId)
      .maybeSingle();

    if (catErr || !cat) {
      return NextResponse.json({ success: false, message: "Kategori tidak ditemukan" }, { status: 400 });
    }
    if (cat.user_id !== null && cat.user_id !== userId) {
      return NextResponse.json({ success: false, message: "Kategori bukan milik Anda" }, { status: 403 });
    }
    if (cat.type !== body.type) {
      return NextResponse.json({ success: false, message: "Tipe kategori tidak cocok dengan tipe transaksi" }, { status: 400 });
    }
    if (!cat.is_active) {
      return NextResponse.json({ success: false, message: "Kategori sudah tidak aktif" }, { status: 400 });
    }
  }

  const { data, error } = await sb
    .from("personal_cashflow_transactions")
    .insert({
      user_id: userId,
      category_id: categoryId,
      type: body.type,
      amount,
      description,
      payment_method: body.payment_method,
      transaction_date: body.transaction_date,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}