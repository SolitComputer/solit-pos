// src/lib/salaryAccounting.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { periodLabel, type DraftLine } from "@/lib/accounting";

export const SALARY_ACCOUNTS = {
  BEBAN_GAJI: "520",   // Dr — Operasional Bulanan / Beban Gaji
  KAS_SALDO: "110",    // Cr — Saldo (kas keluar = gaji bersih)
  KASBON: "141",       // Cr — potong kasbon
  CICILAN: "142",      // Cr — potong cicilan
  DANA_PENSIUN: "190", // Cr — dana pensiun ditahan
} as const;

// Fitur berlaku mulai Oktober 2026. Slip bulan sebelumnya TIDAK pernah diposting.
export const SALARY_ACCOUNTING_START = { year: 2026, month: 10 } as const;

export function isSalaryAccountingEligible(year: number, month: number): boolean {
  if (year > SALARY_ACCOUNTING_START.year) return true;
  if (year < SALARY_ACCOUNTING_START.year) return false;
  return month >= SALARY_ACCOUNTING_START.month;
}

export function isPKLRole(role?: string | null): boolean {
  if (!role) return false;
  return role === "PKL" || role.startsWith("PKL_") || role.startsWith("PKL-");
}

const pad2 = (n: number) => String(n).padStart(2, "0");

// Tanggal entry = HARI TERAKHIR bulan slip (Okt 2026 → 2026-10-31). DATE murni (UTC).
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

// Rakit baris jurnal 5-baris + VALIDASI balance. Baris potongan 0 di-skip.
// Dipakai DUA tempat: validasi saat finalisasi, DAN pembangun draft (buildSalaryDrafts).
export function buildSalaryJournalLines(
  a: SalarySlipAmounts
): { ok: true; lines: DraftLine[] } | { ok: false; message: string } {
  const bruto = Math.round(Number(a.total_income || 0));
  const net = Math.round(Number(a.net_salary || 0));
  const kasbon = Math.round(Number(a.deduction_loan || 0));
  const cicilan = Math.round(Number(a.deduction_cicilan || 0));
  const pensiun = Math.round(Number(a.deduction_pension || 0));

  if (bruto <= 0) return { ok: false, message: "Penghasilan bruto 0 — slip tidak dijurnal" };
  if (net < 0) return { ok: false, message: "Gaji bersih negatif — slip tidak valid" };

  const totalKredit = net + kasbon + cicilan + pensiun;
  if (totalKredit !== bruto)
    return { ok: false, message: `Jurnal tidak balance: bruto ${bruto} ≠ net+potongan ${totalKredit}.` };

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
 * Dipanggil SEBELUM slip di-set FINALIZED. SEKARANG cuma bikin Cashflow Keluar (net).
 * Jurnalnya TIDAK diinsert di sini — muncul sebagai DRAFT lewat buildSalaryDrafts,
 * di-confirm oleh accounting. Idempotent via cashflow_entry_id. Skip PKL / <Okt 2026.
 */
export async function postSalarySlipToAccounting(
  supabase: SupabaseClient,
  slip: any,
  actor: { id: string; name?: string | null }
): Promise<PostResult> {
  if (slip.cashflow_entry_id) return { ok: true, skipped: true }; // sudah ada cashflow

  const year = Number(slip.year);
  const month = Number(slip.month);
  if (!isSalaryAccountingEligible(year, month)) return { ok: true, skipped: true };

  const { data: emp } = await supabase
    .from("users").select("id, name, role").eq("id", slip.user_id).maybeSingle();
  if (emp && isPKLRole(emp.role)) return { ok: true, skipped: true }; // PKL: finalisasi tanpa akuntansi
  const empName = emp?.name ?? "Karyawan";

  // Validasi balance. bruto 0 → skip akuntansi tapi finalisasi TETAP boleh (slip Rp0 legit).
  const built = buildSalaryJournalLines(slip);
  if (!built.ok) {
    if (Math.round(Number(slip.total_income || 0)) <= 0) return { ok: true, skipped: true };
    return { ok: false, message: built.message }; // tidak balance → tolak finalisasi
  }

  const net = Math.round(Number(slip.net_salary || 0));
  if (net <= 0) return { ok: true, skipped: true }; // tdk ada kas keluar → cukup finalisasi (jurnal tetap muncul via draft)

  // claim-lock anti double-click (jaga cashflow dobel)
  const { data: claimed, error: claimErr } = await supabase
    .from("salary_slips")
    .update({ accounting_claimed_at: new Date().toISOString() })
    .eq("id", slip.id)
    .is("cashflow_entry_id", null)
    .is("accounting_claimed_at", null)
    .select("id");
  if (claimErr) return { ok: false, message: `Gagal klaim posting gaji: ${claimErr.message}` };
  if (!claimed || claimed.length === 0) return { ok: true, skipped: true };

  const tanggal = lastDayOfMonthStr(year, month);
  const keterangan = `Gaji ${periodLabel(`${year}-${pad2(month)}`)} - ${empName}`;

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

  if (cfErr || !cf) {
    await supabase.from("salary_slips").update({ accounting_claimed_at: null }).eq("id", slip.id);
    return { ok: false, message: `Gagal buat cashflow gaji: ${cfErr?.message}` };
  }

  await supabase.from("salary_slips").update({
    cashflow_entry_id: cf.id,
    accounting_posted_at: new Date().toISOString(),
  }).eq("id", slip.id);

  return { ok: true };
}