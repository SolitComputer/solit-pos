// src/app/api/akutansi/neraca/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { AKUNTANSI_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { ACCOUNTS, isValidPeriod } from "@/lib/accounting";

function getAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// ── GET /api/akutansi/neraca?period=2026-07 ──────────────────────────────────
// Neraca Saldo: saldo akhir SEMUA akun sampai & termasuk periode ini,
// ditaruh di kolom Debit (kalau saldo positif) atau Kredit (kalau negatif).
// Total Debit HARUS sama dengan Total Kredit (properti dasar double-entry).
export const GET = withAuth(async (req) => {
  const period = new URL(req.url).searchParams.get("period") ?? "";
  if (!isValidPeriod(period))
    return NextResponse.json({ success: false, message: "Periode tidak valid" }, { status: 400 });

  const supabase = getAdmin();

  try {
    // ── 1) Semua entry sampai & termasuk periode ini ──
    const { data: entries, error: entryErr } = await supabase
      .from("journal_entries")
      .select("id")
      .lte("period", period);

    if (entryErr) throw entryErr;

    const entryIds = (entries ?? []).map((e: any) => e.id as string);

    // ── 2) Agregasi mutasi journal_lines per akun (bertanda: DEBIT=+, KREDIT=-) ──
    const balanceMap = new Map<string, number>();

    if (entryIds.length > 0) {
      const { data: lines, error: lineErr } = await supabase
        .from("journal_lines")
        .select("account_code, side, nominal")
        .in("entry_id", entryIds);

      if (lineErr) throw lineErr;

      for (const l of (lines ?? []) as any[]) {
        const signed = l.side === "DEBIT" ? Number(l.nominal) : -Number(l.nominal);
        balanceMap.set(l.account_code, (balanceMap.get(l.account_code) ?? 0) + signed);
      }
    }

    // ── 3) Tambahkan Saldo Awal Manual semua akun ──
    const { data: openings, error: openingErr } = await supabase
      .from("journal_opening_balances")
      .select("account_code, side, nominal");

    if (openingErr) throw openingErr;

    for (const o of (openings ?? []) as any[]) {
      const signed = o.side === "DEBIT" ? Number(o.nominal) : -Number(o.nominal);
      balanceMap.set(o.account_code, (balanceMap.get(o.account_code) ?? 0) + signed);
    }

    // ── 4) Susun baris sesuai urutan akun yang sudah didefinisikan, skip saldo 0 ──
    const rows = ACCOUNTS.map((a) => {
      const balance = balanceMap.get(a.code) ?? 0;
      return {
        code: a.code,
        name: a.name,
        debit: balance > 0 ? balance : 0,
        kredit: balance < 0 ? Math.abs(balance) : 0,
      };
    }).filter((r) => r.debit !== 0 || r.kredit !== 0);

    const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
    const totalKredit = rows.reduce((s, r) => s + r.kredit, 0);
    const selisih = totalDebit - totalKredit;

    return NextResponse.json({
      success: true,
      data: {
        rows,
        totals: {
          debit: totalDebit,
          kredit: totalKredit,
          // toleransi < 1 rupiah untuk jaga-jaga pembulatan angka desimal
          balanced: Math.abs(selisih) < 1,
          selisih,
        },
      },
    });
  } catch (error: any) {
    console.error("[neraca GET]", error);
    return NextResponse.json(
      { success: false, message: error?.message ?? "Gagal memuat neraca" },
      { status: 500 }
    );
  }
}, AKUNTANSI_ROLES);