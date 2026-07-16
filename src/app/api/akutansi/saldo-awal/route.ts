// src/app/api/akutansi/saldo-awal/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { AKUNTANSI_MANAGE_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

function getAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function accountExists(supabase: SupabaseClient, code: string): Promise<boolean> {
  const { data } = await supabase
    .from("chart_of_accounts")
    .select("code")
    .eq("code", code)
    .maybeSingle();
  return !!data;
}

// ── GET /api/akutansi/saldo-awal?account_code=110 ────────────────────────────
// Cek apakah akun ini sudah punya saldo awal manual atau belum, plus status
// koreksi: kalau `updated_at` terisi -> sudah pernah dikoreksi minimal 1x.
export const GET = withAuth(async (req) => {
  const accountCode = new URL(req.url).searchParams.get("account_code") ?? "";
  const supabase = getAdmin();

  if (!accountCode || !(await accountExists(supabase, accountCode)))
    return NextResponse.json({ success: false, message: "Akun tidak dikenal" }, { status: 400 });

  const { data, error } = await supabase
    .from("journal_opening_balances")
    // ← tambahan: updated_at, updated_by_user (penanda sudah/belum dikoreksi)
    .select(
      "account_code, side, nominal, created_at, updated_at, created_by_user:users!journal_opening_balances_created_by_fkey(id, name), updated_by_user:users!journal_opening_balances_updated_by_fkey(id, name)"
    )
    .eq("account_code", accountCode)
    .maybeSingle();

  if (error) {
    console.error("[saldo-awal GET]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: data ?? null });
}, AKUNTANSI_MANAGE_ROLES);

// ── POST /api/akutansi/saldo-awal — input saldo awal PERTAMA KALI ───────────
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

  const supabase = getAdmin();

  if (!account_code || !(await accountExists(supabase, account_code)))
    return NextResponse.json({ success: false, message: "Akun tidak dikenal" }, { status: 400 });
  if (side !== "DEBIT" && side !== "KREDIT")
    return NextResponse.json({ success: false, message: "Sisi saldo harus DEBIT/KREDIT" }, { status: 400 });
  if (!Number.isFinite(Number(nominal)) || Number(nominal) <= 0)
    return NextResponse.json({ success: false, message: "Nominal harus lebih dari 0" }, { status: 400 });

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
      { success: false, message: "Saldo awal akun ini sudah pernah diinput. Gunakan tombol Koreksi untuk mengubahnya." },
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
    // ← tambahan: updated_at ikut diselect (akan null saat baru diinput -> "Original")
    .select("account_code, side, nominal, created_at, updated_at")
    .single();

  if (insertErr) {
    const isDuplicate = insertErr.code === "23505";
    console.error("[saldo-awal POST insert]", insertErr);
    return NextResponse.json(
      {
        success: false,
        message: isDuplicate
          ? "Saldo awal akun ini sudah pernah diinput. Gunakan tombol Koreksi untuk mengubahnya."
          : insertErr.message,
      },
      { status: isDuplicate ? 409 : 500 }
    );
  }

  return NextResponse.json({ success: true, data: inserted }, { status: 201 });
}, AKUNTANSI_MANAGE_ROLES);

// ── PUT /api/akutansi/saldo-awal — KOREKSI saldo awal yang sudah ada ────────
// Berbeda dari POST: PUT butuh row yang SUDAH ADA, dan menimpa nilai lama.
// ⚠️ Ini mengubah saldo berjalan di seluruh periode setelahnya — dipakai
// hanya untuk memperbaiki kesalahan input, bukan alur normal.
export const PUT = withAuth(async (req, _ctx, user: any) => {
  const body = await req.json();
  const { account_code, side, nominal } = body as {
    account_code: string;
    side: "DEBIT" | "KREDIT";
    nominal: number;
  };

  const supabase = getAdmin();

  if (!account_code || !(await accountExists(supabase, account_code)))
    return NextResponse.json({ success: false, message: "Akun tidak dikenal" }, { status: 400 });
  if (side !== "DEBIT" && side !== "KREDIT")
    return NextResponse.json({ success: false, message: "Sisi saldo harus DEBIT/KREDIT" }, { status: 400 });
  if (!Number.isFinite(Number(nominal)) || Number(nominal) <= 0)
    return NextResponse.json({ success: false, message: "Nominal harus lebih dari 0" }, { status: 400 });

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
      { success: false, message: "Saldo awal akun ini belum pernah diinput. Gunakan tombol Set Saldo Awal." },
      { status: 404 }
    );
  }

  const before = { side: existing.side, nominal: Number(existing.nominal) };

  const { data: updated, error: updateErr } = await supabase
    .from("journal_opening_balances")
    .update({
      side,
      nominal: Number(nominal),
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("account_code", account_code)
    // ← tambahan: updated_at + updated_by_user diselect balik supaya badge "Dikoreksi" langsung update tanpa reload manual
    .select(
      "account_code, side, nominal, created_at, updated_at, updated_by_user:users!journal_opening_balances_updated_by_fkey(id, name)"
    )
    .single();

  if (updateErr) {
    console.error("[saldo-awal PUT update]", updateErr);
    return NextResponse.json({ success: false, message: updateErr.message }, { status: 500 });
  }

  // Catat koreksi ke audit log supaya ada jejak (siapa, kapan, dari-ke berapa)
  await supabase.from("journal_audit_logs").insert({
    entry_id: null,
    period: null,
    action: "EDIT",
    before_data: { account_code, ...before },
    after_data: { account_code, side, nominal: Number(nominal) },
    changed_by: user.id,
  });

  return NextResponse.json({ success: true, data: updated });
}, AKUNTANSI_MANAGE_ROLES);