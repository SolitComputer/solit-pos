// src/app/api/akutansi/neraca/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { AKUNTANSI_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  ACCOUNTS,
  ACCOUNT_TYPE_NORMAL_SIDE,
  AccountType,
  JournalSide,
  isValidPeriod,
  labaPeriodAccountName,
  normalizeAccountName,
} from "@/lib/accounting";
import { createClient as createClientForAccounts } from "@supabase/supabase-js";

// Akun Pendapatan (410-430), Modal Keluar (440-460), dan Operasional/Beban
// (510-540) sudah tercakup di tab Laba Rugi — jadi disembunyikan dari tabel
// Neraca. Efek periode berjalannya (Laba Periode Berjalan) dilipat ke akun
// "Laba <periode ini>" (mis. kode 311 Laba Juli 2026), dan Total di bawah
// tabel dihitung dari baris yang TAMPIL saja (bukan semua akun lagi).
const NERACA_HIDDEN_CODES = new Set([
  "410", "420", "430", "440", "450", "460", "510", "520", "530", "540",
]);

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
   // ── 1 & 2) Ambil entry + lines dalam SATU query via JOIN — supaya tidak ada
    // celah waktu antara "ambil daftar entry_id" dan "ambil lines-nya". Celah itu
    // sebelumnya bisa membuat Neraca menangkap kondisi transisi kalau ada proses
    // confirm/delete journal_lines yang sedang berjalan bersamaan (race condition),
    // menyebabkan salah satu sisi Debit/Kredit dari sebuah entry hilang sesaat.
    const { data: entriesWithLines, error: entryErr } = await supabase
      .from("journal_entries")
      .select("id, period, lines:journal_lines(account_code, side, nominal)")
      .lte("period", period);

    if (entryErr) throw entryErr;

    const balanceMap = new Map<string, number>();
    const currentPeriodBalanceMap = new Map<string, number>();

    for (const e of (entriesWithLines ?? []) as any[]) {
      const isCurrentPeriod = e.period === period;
      for (const l of (e.lines ?? []) as any[]) {
        const signed = l.side === "DEBIT" ? Number(l.nominal) : -Number(l.nominal);
        balanceMap.set(l.account_code, (balanceMap.get(l.account_code) ?? 0) + signed);
        if (isCurrentPeriod) {
          currentPeriodBalanceMap.set(
            l.account_code,
            (currentPeriodBalanceMap.get(l.account_code) ?? 0) + signed
          );
        }
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

    const { data: dbAccounts, error: dbErr } = await supabase
      .from("chart_of_accounts")
      .select("code, name, type");

    if (dbErr) throw dbErr;

    const dbAccountMap = new Map<string, { code: string; name: string; type: string }>(
      (dbAccounts ?? []).map((a: any) => [a.code as string, a])
    );

    let allCodes = new Set<string>([
      ...ACCOUNTS.map((a) => a.code),
      ...dbAccountMap.keys(),
    ]);

    // Auto-provision akun "Laba <periode ini>" kalau belum ada — supaya efek
    // Pendapatan/Beban bulan berjalan SELALU punya tempat dilipat, tidak pernah
    // "hilang" diam-diam dan bikin Neraca selisih (lihat kasus akun Laba Juli
    // 2026 yang belum dibuat manual sebelumnya).
    const currentLabaNameCheck = normalizeAccountName(labaPeriodAccountName(period));
    const labaExists = Array.from(allCodes).some((code) => {
      const acc = dbAccountMap.get(code) ?? ACCOUNTS.find((a) => a.code === code);
      return acc?.type === "MODAL" && normalizeAccountName(acc.name) === currentLabaNameCheck;
    });

    if (!labaExists) {
      const [y, m] = period.split("-");
      const autoLabaCode = `3${y.slice(2)}${m}`; // cth "2026-07" -> "32607", unik per bulan
      const { data: createdLaba, error: createLabaErr } = await supabase
        .from("chart_of_accounts")
        .insert({
          code: autoLabaCode,
          name: labaPeriodAccountName(period),
          type: "MODAL",
          is_builtin: false,
        })
        .select("code, name, type")
        .maybeSingle();

      if (!createLabaErr && createdLaba) {
        dbAccountMap.set(autoLabaCode, createdLaba as any);
        allCodes = new Set<string>([...allCodes, autoLabaCode]);
      } else if (createLabaErr) {
        console.error("[neraca GET] auto-create akun Laba:", createLabaErr.message);
      }
    }

    const allAccountsForNeraca = Array.from(allCodes).map((code) => {
      const dbAcc = dbAccountMap.get(code);
      if (dbAcc) return dbAcc;
      const staticAcc = ACCOUNTS.find((a) => a.code === code)!;
      return { code: staticAcc.code, name: staticAcc.name, type: staticAcc.type };
    });

    const staticNormalMap = new Map<string, JournalSide>(
      ACCOUNTS.map((a) => [a.code, a.normal])
    );

    // ── Laba Periode Berjalan — net akun 410-540 KHUSUS periode ini, rumus
    // sama persis dengan tab Laba Rugi. Nilainya dilipat (ditambahkan) ke
    // saldo akun "Laba <periode ini>" di bawah, supaya Neraca tetap
    // menunjukkan laba terkini walau akun 410-540 sendiri disembunyikan.
    let labaPeriodeBerjalanSigned = 0;
    for (const code of NERACA_HIDDEN_CODES) {
      labaPeriodeBerjalanSigned += currentPeriodBalanceMap.get(code) ?? 0;
    }

    const currentLabaName = normalizeAccountName(labaPeriodAccountName(period));
    const labaPeriodeAccount = allAccountsForNeraca.find(
      (a) => a.type === "MODAL" && normalizeAccountName(a.name) === currentLabaName
    );

    const rows = allAccountsForNeraca
      .map((a) => {
        let balance = balanceMap.get(a.code) ?? 0;
        if (labaPeriodeAccount && a.code === labaPeriodeAccount.code) {
          balance += labaPeriodeBerjalanSigned;
        }
        const debit = balance > 0 ? balance : 0;
        const kredit = balance < 0 ? Math.abs(balance) : 0;

        const normalSide: JournalSide =
          staticNormalMap.get(a.code) ?? ACCOUNT_TYPE_NORMAL_SIDE[a.type as AccountType] ?? "DEBIT";
        const actualSide: JournalSide = balance >= 0 ? "DEBIT" : "KREDIT";
        const isAbnormal = (debit !== 0 || kredit !== 0) && normalSide !== actualSide;

        return { code: a.code, name: a.name, debit, kredit, is_abnormal: isAbnormal };
      })
      .filter((r) => r.debit !== 0 || r.kredit !== 0)

      .sort((a, b) => {
        const numA = parseInt(a.code, 10);
        const numB = parseInt(b.code, 10);
        if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB) {
          return numA - numB;
        }
        return a.code.localeCompare(b.code);
      });

    // Baris yang dikirim ke tabel — akun 410/420/430/440/450/460/510/520/
    // 530/540 disembunyikan (efeknya sudah dilipat ke akun Laba periode ini
    // di atas, dan lengkapnya sudah ada di tab Laba Rugi).
    const displayRows = rows.filter((r) => !NERACA_HIDDEN_CODES.has(r.code));

    // Total sekarang dihitung dari baris yang DITAMPILKAN saja — jadi ikut
    // berkurang dibanding sebelum akun 410-540 disembunyikan.
    const totalDebit = displayRows.reduce((s, r) => s + r.debit, 0);
    const totalKredit = displayRows.reduce((s, r) => s + r.kredit, 0);
    const selisih = totalDebit - totalKredit;

    return NextResponse.json({
      success: true,
      data: {
        rows: displayRows,
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