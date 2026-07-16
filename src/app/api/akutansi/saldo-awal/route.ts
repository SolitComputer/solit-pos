// src/app/api/akutansi/saldo-awal/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { AKUNTANSI_MANAGE_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { isValidAccount } from "@/lib/accounting";

function getAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// ── GET /api/akutansi/saldo-awal?account_code=110 ────────────────────────────
// Cek apakah akun ini sudah punya saldo awal manual atau belum.
export const GET = withAuth(async (req) => {
  const accountCode = new URL(req.url).searchParams.get("account_code") ?? "";
  if (!accountCode || !isValidAccount(accountCode))
    return NextResponse.json({ success: false, message: "Akun tidak dikenal" }, { status: 400 });

  const supabase = getAdmin();
  const { data, error } = await supabase
    .from("journal_opening_balances")
    .select("account_code, side, nominal, created_at, created_by_user:users(id, name)")
    .eq("account_code", accountCode)
    .maybeSingle();

  if (error) {
    console.error("[saldo-awal GET]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: data ?? null });
}, AKUNTANSI_MANAGE_ROLES);

// ── POST /api/akutansi/saldo-awal — input saldo awal, HANYA BOLEH SEKALI ────
// Rumus normal balance:
//   sisi DEBIT ketemu baris DEBIT  -> +   |  sisi DEBIT ketemu baris KREDIT -> -
//   sisi KREDIT ketemu baris DEBIT -> -   |  sisi KREDIT ketemu baris KREDIT -> +
// Diwujudkan sebagai nilai bertanda: DEBIT = +nominal, KREDIT = -nominal,
// lalu dipakai sebagai basis running balance di Buku Besar.
export const POST = withAuth(async (req, _ctx, user: any) => {
  const body = await req.json();
  const { account_code, side, nominal } = body as {
    account_code: string;
    side: "DEBIT" | "KREDIT";
    nominal: number;
  };

  if (!account_code || !isValidAccount(account_code))
    return NextResponse.json({ success: false, message: "Akun tidak dikenal" }, { status: 400 });
  if (side !== "DEBIT" && side !== "KREDIT")
    return NextResponse.json({ success: false, message: "Sisi saldo harus DEBIT/KREDIT" }, { status: 400 });
  if (!Number.isFinite(Number(nominal)) || Number(nominal) <= 0)
    return NextResponse.json({ success: false, message: "Nominal harus lebih dari 0" }, { status: 400 });

  const supabase = getAdmin();

  const { data: existing, error: checkErr } = await supabase
    .from("journal_opening_balances")
    .select("id")
    .eq("account_code", account_code)
    .maybeSingle();

  if (checkErr) {
    console.error("[saldo-awal POST check]", checkErr);
    return NextResponse.json({ success: false, message: checkErr.message }, { status: 500 });
  }

  if (existing) {
    return NextResponse.json(
      { success: false, message: "Saldo awal akun ini sudah pernah diinput dan tidak bisa diubah lagi" },
      { status: 409 }
    );
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("journal_opening_balances")
    .insert({
      account_code,
      side,
      nominal: Number(nominal),
      created_by: user.id,
    })
    .select("account_code, side, nominal, created_at")
    .single();

  if (insertErr) {
    const isDuplicate = insertErr.code === "23505";
    console.error("[saldo-awal POST insert]", insertErr);
    return NextResponse.json(
      {
        success: false,
        message: isDuplicate
          ? "Saldo awal akun ini sudah pernah diinput dan tidak bisa diubah lagi"
          : insertErr.message,
      },
      { status: isDuplicate ? 409 : 500 }
    );
  }

  return NextResponse.json({ success: true, data: inserted }, { status: 201 });
}, AKUNTANSI_MANAGE_ROLES);

export const PUT = withAuth(async (req, _ctx, user: any) => {
  const body = await req.json();
  const { account_code, side, nominal } = body as {
    account_code: string;
    side: "DEBIT" | "KREDIT";
    nominal: number;
  };

  if (!account_code || !isValidAccount(account_code))
    return NextResponse.json({ success: false, message: "Akun tidak dikenal" }, { status: 400 });
  if (side !== "DEBIT" && side !== "KREDIT")
    return NextResponse.json({ success: false, message: "Sisi saldo harus DEBIT/KREDIT" }, { status: 400 });
  if (!Number.isFinite(Number(nominal)) || Number(nominal) <= 0)
    return NextResponse.json({ success: false, message: "Nominal harus lebih dari 0" }, { status: 400 });

  const supabase = getAdmin();

  const { data: existing, error: checkErr } = await supabase
    .from("journal_opening_balances")
    .select("id, side, nominal")
    .eq("account_code", account_code)
    .maybeSingle();

  if (checkErr) {
    console.error("[saldo-awal PUT check]", checkErr);
    return NextResponse.json({ success: false, message: checkErr.message }, { status: 500 });
  }

  if (!existing) {
    return NextResponse.json(
      { success: false, message: "Akun ini belum punya saldo awal — gunakan input pertama, bukan edit" },
      { status: 404 }
    );
  }

  const { data: updated, error: updateErr } = await supabase
    .from("journal_opening_balances")
    .update({
      side,
      nominal: Number(nominal),
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("account_code", account_code)
    .select("account_code, side, nominal, created_at, updated_at")
    .single();

  if (updateErr) {
    console.error("[saldo-awal PUT update]", updateErr);
    return NextResponse.json({ success: false, message: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: updated });
}, AKUNTANSI_MANAGE_ROLES);