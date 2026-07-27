// src/app/api/akutansi/buku-besar/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { AKUNTANSI_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { AKUN, isValidPeriod } from "@/lib/accounting";
import { getTransactionMetaByInvoices } from "@/lib/accountingSource";

function getAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

interface LineRow {
  id: string;
  entry_id: string;
  account_code: string;
  side: "DEBIT" | "KREDIT";
  nominal: number;
}

interface EntryRow {
  id: string;
  tanggal: string;
  keterangan: string;
  ref: string | null;
  source_type: "TRANSACTION" | "SERVICE" | "CASHFLOW" | "MANUAL";
  source_id: string | null;
}

export const GET = withAuth(async (req) => {
  const url = new URL(req.url);
  const period = url.searchParams.get("period") ?? "";
  const accountCode = url.searchParams.get("account_code") ?? "";

  if (!isValidPeriod(period))
    return NextResponse.json({ success: false, message: "Periode tidak valid" }, { status: 400 });

  const supabase = getAdmin();

  const { data: accRow } = await supabase
    .from("chart_of_accounts")
    .select("name")
    .eq("code", accountCode)
    .maybeSingle();

  if (!accountCode || !accRow)
    return NextResponse.json({ success: false, message: "Akun tidak dikenal" }, { status: 400 });

  try {
    // ── 0) Saldo awal MANUAL (one-time input, bisa dikoreksi) — nilai dasar sebelum periode manapun ──
    // Rumus normal balance: DEBIT = +nominal, KREDIT = -nominal.
    const { data: openingRow, error: openingErr } = await supabase
      .from("journal_opening_balances")
      .select("side, nominal")
      .eq("account_code", accountCode)
      .maybeSingle();

    if (openingErr) throw openingErr;

    const openingSigned = openingRow
      ? openingRow.side === "DEBIT"
        ? Number(openingRow.nominal)
        : -Number(openingRow.nominal)
      : 0;

    const { data: priorLines, error: priorLineErr } = await supabase
      .from("journal_lines")
      .select("side, nominal, journal_entries!inner(period)")
      .eq("account_code", accountCode)
      .lt("journal_entries.period", period);

    if (priorLineErr) throw priorLineErr;

    const mutasiSebelumPeriode = (priorLines ?? []).reduce((s: number, l: any) => {
      return s + (l.side === "DEBIT" ? Number(l.nominal) : -Number(l.nominal));
    }, 0);

    const saldoAwal = openingSigned + mutasiSebelumPeriode;

    // ── 2) Semua entry di periode berjalan ──
    const { data: periodEntries, error: entryErr } = await supabase
      .from("journal_entries")
      .select("id, tanggal, keterangan, ref, source_type, source_id, created_at")
      .eq("period", period)
      .order("tanggal", { ascending: true });

    if (entryErr) throw entryErr;

    const entryMap = new Map<string, EntryRow & { created_at: string }>();
    for (const e of (periodEntries ?? []) as (EntryRow & { created_at: string })[]) entryMap.set(e.id, e);
    const periodEntryIds = Array.from(entryMap.keys());

    // ── 2.5) Company_name & spek laptop untuk entry TRANSACTION — enrichment
    // yang sama seperti di /api/akutansi/jurnal, biar Buku Besar juga bisa
    // menampilkan badge toko + spek di baris mutasinya.
    const trxInvoiceNumbers = Array.from(entryMap.values())
      .filter((e) => e.source_type === "TRANSACTION" && e.source_id)
      .map((e) => e.source_id as string);

    const trxMetaMap = await getTransactionMetaByInvoices(supabase, trxInvoiceNumbers);

    // ── 3) Semua baris jurnal di entry-entry tsb (untuk hitung Ref lawan akun) ──
    let allLines: LineRow[] = [];
    if (periodEntryIds.length > 0) {
      const { data: linesData, error: lineErr } = await supabase
        .from("journal_lines")
        .select("id, entry_id, account_code, side, nominal")
        .in("entry_id", periodEntryIds);

      if (lineErr) throw lineErr;
      allLines = (linesData ?? []) as LineRow[];
    }

    const counterMap = new Map<string, string[]>();
    for (const l of allLines) {
      if (l.account_code === accountCode) continue;
      const arr = counterMap.get(l.entry_id) ?? [];
      if (!arr.includes(l.account_code)) arr.push(l.account_code);
      counterMap.set(l.entry_id, arr);
    }

    const syntheticIds = new Set<string>();
    const syntheticLines: LineRow[] = [];
    if (accountCode === AKUN.HPP || accountCode === AKUN.MODAL_KELUAR) {
      for (const entry of entryMap.values()) {
        if (entry.source_type !== "TRANSACTION" || !entry.source_id) continue;
        const hasHppLine = allLines.some((l) => l.entry_id === entry.id && l.account_code === AKUN.HPP);
        if (hasHppLine) continue; // modal sudah diinput normal — tidak perlu baris sintetis
        const syntheticId = `${entry.id}-${accountCode === AKUN.HPP ? "hpp" : "modal-keluar"}-missing`;
        syntheticIds.add(syntheticId);
        syntheticLines.push({
          id: syntheticId,
          entry_id: entry.id,
          account_code: accountCode,
          side: accountCode === AKUN.HPP ? "KREDIT" : "DEBIT",
          nominal: 0,
        });
      }
    }

    const ownLines = [...allLines.filter((l) => l.account_code === accountCode), ...syntheticLines]
      .sort((a, b) => {
        const ea = entryMap.get(a.entry_id)!;
        const eb = entryMap.get(b.entry_id)!;
        const t = new Date(ea.tanggal).getTime() - new Date(eb.tanggal).getTime();
        if (t !== 0) return t;
        return new Date(ea.created_at).getTime() - new Date(eb.created_at).getTime();
      });

    const ownLineIds = ownLines.filter((l) => !syntheticIds.has(l.id)).map((l) => l.id);

    const checkedMap = new Map<string, string>(); // line_id -> checked_at
    if (ownLineIds.length > 0) {
      const { data: checksData, error: checksErr } = await supabase
        .from("journal_line_checks")
        .select("line_id, checked_at")
        .in("line_id", ownLineIds);

      if (checksErr) throw checksErr;

      for (const c of (checksData ?? []) as { line_id: string; checked_at: string }[]) {
        checkedMap.set(c.line_id, c.checked_at);
      }
    }

    let running = saldoAwal;
    const lines = ownLines.map((l) => {
      const entry = entryMap.get(l.entry_id)!;
      const debit = l.side === "DEBIT" ? Number(l.nominal) : 0;
      const kredit = l.side === "KREDIT" ? Number(l.nominal) : 0;
      running += debit - kredit;
      const ref = (counterMap.get(l.entry_id) ?? []).join(", ");
      const checkedAt = checkedMap.get(l.id) ?? null; // (baru)
      const trxMeta =
        entry.source_type === "TRANSACTION" && entry.source_id
          ? trxMetaMap.get(entry.source_id) ?? null
          : null; // (baru) — badge toko & spek, null kalau bukan entry TRANSACTION
      return {
        id: l.id,
        tanggal: entry.tanggal,
        keterangan: entry.keterangan,
        ref,
        side: l.side, // (baru) — dipakai frontend buat nentuin baris sintetis nominal 0 harus tampil di kolom Debit atau Kredit
        debit,
        kredit,
        saldo_debit: running >= 0 ? running : 0,
        saldo_kredit: running < 0 ? Math.abs(running) : 0,
        checked: !!checkedAt,
        checked_at: checkedAt,
        trx_meta: trxMeta,
        is_synthetic: syntheticIds.has(l.id),
      };
    });

    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalKredit = lines.reduce((s, l) => s + l.kredit, 0);

    return NextResponse.json({
      success: true,
      data: {
        account: { code: accountCode, name: accRow.name },
        saldo_awal: saldoAwal,
        opening_balance: openingRow
          ? { side: openingRow.side, nominal: Number(openingRow.nominal) }
          : null,
        lines,
        totals: { debit: totalDebit, kredit: totalKredit, saldo_akhir: running },
      },
    });
  } catch (error: any) {
    console.error("[buku-besar GET]", error);
    return NextResponse.json(
      { success: false, message: error?.message ?? "Gagal memuat buku besar" },
      { status: 500 }
    );
  }
}, AKUNTANSI_ROLES);