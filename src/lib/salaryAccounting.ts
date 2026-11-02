// src/lib/salaryAccounting.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { periodFromDate, periodLabel, formatJournalNo, type DraftLine } from "@/lib/accounting";
import { getMaxJournalSeqByDate } from "@/lib/accountingSource";

export const SALARY_ACCOUNTS = {
  BEBAN_GAJI: "520",   // Dr — Operasional Bulanan / Beban Gaji
  KAS_SALDO: "110",    // Cr — Saldo (kas keluar = gaji bersih)
  KASBON: "141",       // Cr — potong kasbon
  CICILAN: "142",      // Cr — potong cicilan
  DANA_PENSIUN: "190", // Cr — dana pensiun ditahan  ⚠️ cek chart_of_accounts
} as const;

// Fitur berlaku mulai Oktober 2026. Slip bulan sebelumnya TIDAK pernah diposting.
export const SALARY_ACCOUNTING_START = { year: 2026, month: 10 } as const;

export function isSalaryAccountingEligible(year: number, month: number): boolean {
  if (year > SALARY_ACCOUNTING_START.year) return true;
  if (year < SALARY_ACCOUNTING_START.year) return false;
  return month >= SALARY_ACCOUNTING_START.month;
}

function isPKLRole(role?: string | null): boolean {
  if (!role) return false;
  return role === "PKL" || role.startsWith("PKL_") || role.startsWith("PKL-");
}

const pad2 = (n: number) => String(n).padStart(2, "0");

// Tanggal entry = HARI TERAKHIR bulan slip (Okt 2026 → 2026-10-31), BUKAN tanggal klik.
// month = 1..12. DATE murni (UTC) biar tidak kegeser timezone.
export function lastDayOfMonthStr(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export type SalarySlipAmounts = {
  total_income: number;      // bruto  → Dr 520
  net_salary: number;        // keluar → Cr 110
  deduction_loan: number;    // kasbon → Cr 141
  deduction_cicilan: number; // cicilan → Cr 142
  deduction_pension: number; // pensiun → Cr 190
};

// Rakit baris + VALIDASI balance SEBELUM commit. Baris potongan 0 di-skip.
// Kalau net+kasbon+cicilan+pensiun ≠ bruto (mis. deduction_violation>0 / pembulatan)
// → GAGAL, slip tidak diposting (tolak slip aneh).
export function buildSalaryJournalLines(
  a: SalarySlipAmounts
): { ok: true; lines: DraftLine[] } | { ok: false; message: string } {
  const bruto = Math.round(Number(a.total_income || 0));
  const net = Math.round(Number(a.net_salary || 0));
  const kasbon = Math.round(Number(a.deduction_loan || 0));
  const cicilan = Math.round(Number(a.deduction_cicilan || 0));
  const pensiun = Math.round(Number(a.deduction_pension || 0));

  if (bruto <= 0) return { ok: false, message: "Penghasilan bruto 0 — slip tidak diposting" };
  if (net < 0) return { ok: false, message: "Gaji bersih negatif — slip tidak valid" };

  const totalKredit = net + kasbon + cicilan + pensiun;
  if (totalKredit !== bruto) {
    return {
      ok: false,
      message: `Jurnal tidak balance: bruto ${bruto} ≠ net+potongan ${totalKredit}. Cek deduction_violation / pembulatan.`,
    };
  }

  const lines: DraftLine[] = [
    { account_code: SALARY_ACCOUNTS.BEBAN_GAJI, side: "DEBIT", nominal: bruto, keterangan: "" },
  ];
  if (net > 0) lines.push({ account_code: SALARY_ACCOUNTS.KAS_SALDO, side: "KREDIT", nominal: net, keterangan: "" });
  if (kasbon > 0) lines.push({ account_code: SALARY_ACCOUNTS.KASBON, side: "KREDIT", nominal: kasbon, keterangan: "Potong kasbon" });
  if (cicilan > 0) lines.push({ account_code: SALARY_ACCOUNTS.CICILAN, side: "KREDIT", nominal: cicilan, keterangan: "Potong cicilan" });
  if (pensiun > 0) lines.push({ account_code: SALARY_ACCOUNTS.DANA_PENSIUN, side: "KREDIT", nominal: pensiun, keterangan: "Dana pensiun" });

  return { ok: true, lines };
}

type PostResult = { ok: true; skipped?: boolean } | { ok: false; message: string };

/**
 * Posting 1 slip gaji → Cashflow Keluar (net) + Jurnal lengkap. IRREVERSIBLE.
 * Idempotent (skip kalau sudah punya journal_entry_id), skip PKL, skip < Okt 2026.
 * Pakai claim-lock (accounting_claimed_at) utk tahan double-click, + rollback manual.
 * Dipanggil SEBELUM slip di-set FINALIZED (kalau gagal → finalisasi dibatalkan).
 */
export async function postSalarySlipToAccounting(
  supabase: SupabaseClient,
  slip: any,
  actor: { id: string; name?: string | null }
): Promise<PostResult> {
  // 1) Sudah pernah diposting → skip, biar finalisasi lanjut
  if (slip.journal_entry_id) return { ok: true, skipped: true };

  const year = Number(slip.year);
  const month = Number(slip.month); // 1..12
  if (!isSalaryAccountingEligible(year, month)) return { ok: true, skipped: true };

  // 2) Data karyawan (role utk cek PKL + nama utk keterangan)
  const { data: emp } = await supabase
    .from("users").select("id, name, role").eq("id", slip.user_id).maybeSingle();
  if (emp && isPKLRole(emp.role)) return { ok: true, skipped: true }; // PKL: finalisasi tanpa akuntansi
  const empName = emp?.name ?? "Karyawan";

  // 3) Bangun & validasi jurnal DULU (sebelum nyentuh DB)
  const built = buildSalaryJournalLines(slip);
  if (!built.ok) return { ok: false, message: built.message };

  // 4) Ambil nama akun dari chart_of_accounts (sumber kebenaran). Abort kalau ada yg hilang.
  const codes = [...new Set(built.lines.map((l) => l.account_code))];
  const { data: coa, error: coaErr } = await supabase
    .from("chart_of_accounts").select("code, name").in("code", codes);
  if (coaErr) return { ok: false, message: `Gagal baca chart_of_accounts: ${coaErr.message}` };
  const nameMap = new Map<string, string>((coa ?? []).map((a: any) => [String(a.code), a.name as string]));
  const missing = codes.filter((c) => !nameMap.has(c));
  if (missing.length > 0)
    return { ok: false, message: `Akun belum ada di chart_of_accounts: ${missing.join(", ")}` };

  // 5) CLAIM-LOCK (anti double-click). Cuma 1 request yang lolos.
  const { data: claimed } = await supabase
    .from("salary_slips")
    .update({ accounting_claimed_at: new Date().toISOString() })
    .eq("id", slip.id)
    .is("journal_entry_id", null)
    .is("accounting_claimed_at", null)
    .select("id");
  if (!claimed || claimed.length === 0) return { ok: true, skipped: true }; // sedang/sudah diproses request lain

  const releaseLock = async () => {
    await supabase.from("salary_slips").update({ accounting_claimed_at: null }).eq("id", slip.id);
  };

  const tanggal = lastDayOfMonthStr(year, month);
  const period = `${year}-${pad2(month)}`;
  const keterangan = `Gaji ${periodLabel(period)} - ${empName}`;
  const net = Math.round(Number(slip.net_salary || 0));
  const bruto = Math.round(Number(slip.total_income || 0));

  let cashflowId: string | null = null;
  let journalId: string | null = null;

  try {
    // 6) Cashflow Keluar (net) — cuma kalau ada kas beneran keluar. source_type "SALARY"
    //    SENGAJA di luar MANUAL/PENGAJUAN_DANA → ga ikut jadi draft jurnal (anti-dobel).
    if (net > 0) {
      const { data: cf, error: cfErr } = await supabase
        .from("cashflow_entries")
        .insert({
          direction: "OUT",
          category: "OPERASIONAL_BULANAN",
          nama: empName,
          nominal: net,
          modal: null,
          keterangan,
          tanggal,
          source_type: "SALARY",
          source_id: String(slip.id),
          payment_method: "SALDO",
          cash_location: null, // SALDO → 110
          branch: "UTAMA",
          target_user_id: null,
          created_by: actor.id,
          is_audited: false,
        })
        .select("id").single();
      if (cfErr || !cf) throw new Error(`Gagal buat cashflow: ${cfErr?.message}`);
      cashflowId = cf.id as string;
    }

    // 7) Jurnal lengkap (source_type MANUAL → tanpa sync/pending). journal_no urut per tanggal.
    const maxSeq = await getMaxJournalSeqByDate(supabase, [tanggal]);
    const journalNo = formatJournalNo(tanggal, (maxSeq.get(tanggal) ?? 0) + 1);

    const { data: entry, error: entryErr } = await supabase
      .from("journal_entries")
      .insert({
        period,
        tanggal,
        keterangan,
        ref: cashflowId,
        journal_no: journalNo,
        source_type: "MANUAL",
        source_id: null,
        source_category: "SALARY_SLIP",
        branch: "UTAMA",
        total: bruto,
        created_by: actor.id,
      })
      .select("id").single();
    if (entryErr || !entry) throw new Error(`Gagal buat jurnal: ${entryErr?.message}`);
    journalId = entry.id as string;

    const lineRows = built.lines.map((l, i) => ({
      entry_id: journalId,
      account_code: l.account_code,
      account_name: nameMap.get(l.account_code)!,
      side: l.side,
      nominal: Math.round(Number(l.nominal)),
      keterangan: l.keterangan?.trim() ? l.keterangan.trim() : null,
      line_order: i,
    }));
    const { error: lineErr } = await supabase.from("journal_lines").insert(lineRows);
    if (lineErr) throw new Error(`Gagal buat baris jurnal: ${lineErr.message}`);

    await supabase.from("journal_audit_logs").insert({
      entry_id: journalId,
      period,
      action: "CREATE",
      before_data: null,
      after_data: { tanggal, keterangan, ref: cashflowId, lines: built.lines },
      changed_by: actor.id,
    });

    // 8) Tautkan ke slip (journal_entry_id = penanda "sudah diposting")
    const { error: linkErr } = await supabase
      .from("salary_slips")
      .update({
        journal_entry_id: journalId,
        cashflow_entry_id: cashflowId,
        accounting_posted_at: new Date().toISOString(),
      })
      .eq("id", slip.id);
    if (linkErr) throw new Error(`Gagal menautkan slip: ${linkErr.message}`);

    return { ok: true };
  } catch (e: any) {
    // Rollback: buang apa pun yang terlanjur kebuat + lepas lock biar bisa diulang
    if (journalId) await supabase.from("journal_entries").delete().eq("id", journalId);
    if (cashflowId) await supabase.from("cashflow_entries").delete().eq("id", cashflowId);
    await releaseLock();
    return { ok: false, message: e?.message ?? "Gagal posting akuntansi gaji" };
  }
}