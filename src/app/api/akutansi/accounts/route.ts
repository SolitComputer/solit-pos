import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { AKUNTANSI_ROLES, AKUNTANSI_MANAGE_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { ACCOUNT_TYPE_ORDER } from "@/lib/accounting";

function getAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// ── GET — semua akun sekarang murni dari DB (bawaan + custom) ──────────────
export const GET = withAuth(async () => {
  const supabase = getAdmin();

  const { data, error } = await supabase
    .from("chart_of_accounts")
    .select("code, name, type, is_builtin, created_at, updated_at")
    .order("code", { ascending: true });

  if (error) {
    console.error("[accounts GET]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: data ?? [] });
}, AKUNTANSI_ROLES);

// ── POST — buat akun baru (selalu is_builtin = false) ───────────────────────
export const POST = withAuth(async (req, _ctx, user: any) => {
  const body = await req.json();
  const { code, name, type } = body as { code: string; name: string; type: string };

  if (!code?.trim() || !/^\d{2,6}$/.test(code.trim()))
    return NextResponse.json({ success: false, message: "Kode akun harus berupa angka (2-6 digit)" }, { status: 400 });
  if (!name?.trim())
    return NextResponse.json({ success: false, message: "Nama akun wajib diisi" }, { status: 400 });
  if (!ACCOUNT_TYPE_ORDER.includes(type as any))
    return NextResponse.json({ success: false, message: "Tipe akun tidak dikenal" }, { status: 400 });

  const trimmedCode = code.trim();
  const supabase = getAdmin();

  const { data: existing } = await supabase
    .from("chart_of_accounts")
    .select("code")
    .eq("code", trimmedCode)
    .maybeSingle();

  if (existing)
    return NextResponse.json({ success: false, message: `Kode ${trimmedCode} sudah digunakan` }, { status: 409 });

  const { data: inserted, error } = await supabase
    .from("chart_of_accounts")
    .insert({ code: trimmedCode, name: name.trim(), type, is_builtin: false, created_by: user.id })
    .select("code, name, type, is_builtin, created_at")
    .single();

  if (error) {
    console.error("[accounts POST]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: inserted }, { status: 201 });
}, AKUNTANSI_MANAGE_ROLES);