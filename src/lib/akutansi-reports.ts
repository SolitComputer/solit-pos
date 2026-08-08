// src/lib/akutansi-reports.ts
//
// Logic hitung Laporan Neraca & Laba Rugi — dipakai bareng oleh
// /api/akutansi/neraca, /api/akutansi/laba-rugi, DAN /api/akutansi/export
// (sheet Excel-nya). Satu sumber logic ini yang bikin nominal di 3 tempat
// itu (tabel Neraca, tabel Laba Rugi, file export) selalu sinkron — kalau
// dulu dihitung ulang terpisah-terpisah di tiap route, gampang ketinggalan
// update dan hasilnya beda-beda (itu yang bikin export gak sesuai tabel).
import { SupabaseClient } from "@supabase/supabase-js";
import {
  ACCOUNTS,
  ACCOUNT_TYPE_NORMAL_SIDE,
  AccountType,
  JournalSide,
  LABA_RUGI_GROUP_NORMAL,
  LabaRugiGroup,
  labaPeriodAccountName,
  labaRugiGroup,
  normalizeAccountName,
} from "@/lib/accounting";

// ─── Neraca ─────────────────────────────────────────────────────────────────

// (Sudah tidak dipakai) Dulu dipakai untuk menyembunyikan akun Pendapatan/
// Beban dari Neraca & melipat labanya ke akun "Laba <periode>". SEKARANG
// TIDAK DIPAKAI LAGI — Neraca menampilkan SEMUA akun apa adanya, persis sama
// dengan saldo akhir masing-masing akun di Buku Besar. Konstanta ini dibiarkan
// (tidak dipakai) untuk jaga-jaga kalau ada file lain yang masih meng-import.
export const NERACA_HIDDEN_CODES = new Set([
  "410", "420", "430", "440", "450", "460", "510", "520", "530", "540",
]);

export interface NeracaRow {
  code: string;
  name: string;
  debit: number;
  kredit: number;
  is_abnormal: boolean;
}

export interface NeracaResult {
  rows: NeracaRow[];
  totals: { debit: number; kredit: number; balanced: boolean; selisih: number };
}

export async function computeNeraca(supabase: SupabaseClient, period: string): Promise<NeracaResult> {
  // Ambil entry + lines s/d & termasuk periode ini, di-page karena bisa
  // lebih dari 1000 baris (cap default Supabase/PostgREST).
  const entriesWithLines: any[] = [];
  {
    const PAGE_SIZE = 1000;
    let from = 0;
    while (true) {
      const { data: page, error: entryErr } = await supabase
        .from("journal_entries")
        .select("id, period, lines:journal_lines(account_code, side, nominal)")
        .lte("period", period)
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (entryErr) throw entryErr;
      if (!page || page.length === 0) break;
      entriesWithLines.push(...page);
      if (page.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }

  // Saldo PER AKUN dihitung persis sama seperti rumus saldo akhir di Buku
  // Besar (opening manual + seluruh mutasi jurnal s/d periode ini) — TIDAK
  // ADA lagi pengelompokan/pelipatan akun 410-540 ke akun Laba. Setiap akun
  // berdiri sendiri, sama seperti tampilannya di tab Buku Besar.
  const balanceMap = new Map<string, number>();

  for (const e of entriesWithLines as any[]) {
    for (const l of (e.lines ?? []) as any[]) {
      const signed = l.side === "DEBIT" ? Number(l.nominal) : -Number(l.nominal);
      balanceMap.set(l.account_code, (balanceMap.get(l.account_code) ?? 0) + signed);
    }
  }

  // Saldo Awal Manual semua akun.
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

  let allCodes = new Set<string>([...ACCOUNTS.map((a) => a.code), ...dbAccountMap.keys()]);

  // Auto-provision akun "Laba <periode>" kalau belum ada — supaya akun ini
  // selalu tersedia untuk diisi Saldo Awal Manual di Buku Besar (dipakai oleh
  // laporan Laba Rugi). Neraca sendiri TIDAK melipat nominal apapun ke akun
  // ini lagi — saldonya di Neraca murni dari Buku Besar akun ini sendiri.
  async function ensureLabaAccount(p: string): Promise<string | null> {
    const targetName = normalizeAccountName(labaPeriodAccountName(p));
    const existingCode = Array.from(allCodes).find((code) => {
      const acc = dbAccountMap.get(code) ?? ACCOUNTS.find((a) => a.code === code);
      return acc?.type === "MODAL" && normalizeAccountName(acc.name) === targetName;
    });
    if (existingCode) return existingCode;

    const [y, m] = p.split("-");
    const autoCode = `3${y.slice(2)}${m}`; // cth "2026-07" -> "32607", unik per bulan
    const { data: created, error: createErr } = await supabase
      .from("chart_of_accounts")
      .insert({ code: autoCode, name: labaPeriodAccountName(p), type: "MODAL", is_builtin: false })
      .select("code, name, type")
      .maybeSingle();

    if (createErr) {
      console.error(`[computeNeraca] auto-create akun Laba ${p}:`, createErr.message);
      return null;
    }
    if (created) {
      dbAccountMap.set(autoCode, created as any);
      allCodes.add(autoCode);
      return autoCode;
    }
    return null;
  }

  // Akun Laba periode yang lagi dibuka selalu disiapkan, walau belum ada
  // transaksi sama sekali — supaya bisa langsung diisi Saldo Awal Manual.
  // tes
  await ensureLabaAccount(period);

  const allAccountsForNeraca = Array.from(allCodes).map((code) => {
    const dbAcc = dbAccountMap.get(code);
    if (dbAcc) return dbAcc;
    const staticAcc = ACCOUNTS.find((a) => a.code === code)!;
    return { code: staticAcc.code, name: staticAcc.name, type: staticAcc.type };
  });

  const staticNormalMap = new Map<string, JournalSide>(ACCOUNTS.map((a) => [a.code, a.normal]));

  const rows = allAccountsForNeraca
    .map((a) => {
      const balance = balanceMap.get(a.code) ?? 0;
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
      if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB) return numA - numB;
      return a.code.localeCompare(b.code);
    });

  // Semua baris ditampilkan apa adanya — nominal & posisi Debit/Kredit tiap
  // akun di sini sama persis dengan saldo akhir akun tsb di tab Buku Besar.
  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalKredit = rows.reduce((s, r) => s + r.kredit, 0);
  const selisih = totalDebit - totalKredit;

  return {
    rows,
    totals: {
      debit: totalDebit,
      kredit: totalKredit,
      balanced: Math.abs(selisih) < 1,
      selisih,
    },
  };
}

// ─── Laba Rugi ──────────────────────────────────────────────────────────────

interface AccountRow {
  code: string;
  name: string;
  type: string;
}
export interface LabaRugiRow {
  code: string;
  name: string;
  nominal: number;
}
export interface LabaRugiSection {
  rows: LabaRugiRow[];
  total: number;
}
export interface LabaRugiResult {
  period: string;
  pendapatan: LabaRugiSection;
  modal_keluar: LabaRugiSection;
  operasional: LabaRugiSection;
  luar_operasional: LabaRugiSection;
  laba_ditahan: LabaRugiSection;
  laba_operasional: number;
  total_laba: number;
  akun_laba_periode: LabaRugiRow | null;
  selisih_verifikasi: number | null;
}

export async function computeLabaRugi(supabase: SupabaseClient, period: string): Promise<LabaRugiResult> {
  const { data: accountsData, error: accErr } = await supabase
    .from("chart_of_accounts")
    .select("code, name, type")
    .order("code", { ascending: true });
  if (accErr) throw accErr;
  const accounts = (accountsData ?? []) as AccountRow[];

  // Line jurnal s/d periode ini, di-page langsung di journal_lines (join ke
  // journal_entries buat filter & baca period-nya) supaya dijamin lengkap
  // berapa pun banyaknya histori (Supabase cap 1000 baris/response).
  const mutasiPeriode = new Map<string, number>();
  const mutasiKumulatif = new Map<string, number>();

  {
    const PAGE_SIZE = 1000;
    let from = 0;
    while (true) {
      const { data: page, error: lineErr } = await supabase
        .from("journal_lines")
        .select("account_code, side, nominal, journal_entries!inner(period)")
        .lte("journal_entries.period", period)
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (lineErr) throw lineErr;
      if (!page || page.length === 0) break;

      for (const l of page as any[]) {
        const signed = l.side === "DEBIT" ? Number(l.nominal) : -Number(l.nominal);
        const code = l.account_code as string;
        mutasiKumulatif.set(code, (mutasiKumulatif.get(code) ?? 0) + signed);
        if (l.journal_entries?.period === period) {
          mutasiPeriode.set(code, (mutasiPeriode.get(code) ?? 0) + signed);
        }
      }

      if (page.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }

  // Saldo awal manual — sumber Total Laba Ditahan, khusus akun "Laba
  // <periode ini>". User input manual 1x per bulan lewat "Set Saldo Awal" di
  // Buku Besar, di akun Laba bulan yang bersangkutan.
  const { data: openings, error: openErr } = await supabase
    .from("journal_opening_balances")
    .select("account_code, side, nominal");
  if (openErr) throw openErr;

  const openingByAccount = new Map<string, number>();
  for (const o of (openings ?? []) as any[]) {
    const signed = o.side === "DEBIT" ? Number(o.nominal) : -Number(o.nominal);
    openingByAccount.set(o.account_code, (openingByAccount.get(o.account_code) ?? 0) + signed);
    mutasiKumulatif.set(o.account_code, (mutasiKumulatif.get(o.account_code) ?? 0) + signed);
  }

  const groups: Record<LabaRugiGroup, LabaRugiRow[]> = {
    PENDAPATAN: [],
    MODAL_KELUAR: [],
    OPERASIONAL: [],
    LUAR_OPERASIONAL: [],
    LABA_DITAHAN: [],
  };

  const currentLabaName = normalizeAccountName(labaPeriodAccountName(period));
  let akunLabaPeriode: LabaRugiRow | null = null;

  for (const acc of accounts) {
    const group = labaRugiGroup(acc);
    if (!group) continue;

    const isLabaGroup = group === "LABA_DITAHAN";

    if (isLabaGroup) {
      // Laba Ditahan HANYA bersumber dari akun "Laba <periode ini>" sendiri —
      // akun Laba bulan-bulan lain diabaikan total. Nominalnya diambil dari
      // Saldo Awal Manual yang user input, BUKAN dari histori jurnal.
      if (normalizeAccountName(acc.name) !== currentLabaName) continue;

      const openingSigned = openingByAccount.get(acc.code) ?? 0;
      const labaDitahanNominal =
        LABA_RUGI_GROUP_NORMAL[group] === "DEBIT" ? openingSigned : -openingSigned;
      if (Math.round(labaDitahanNominal) !== 0) {
        groups.LABA_DITAHAN.push({ code: acc.code, name: acc.name, nominal: labaDitahanNominal });
      }

      // Kotak verifikasi pakai saldo PENUH akun ini (opening + jurnal
      // closing kalau ada), bukan cuma opening.
      const fullSigned = mutasiKumulatif.get(acc.code) ?? 0;
      const fullNominal = LABA_RUGI_GROUP_NORMAL[group] === "DEBIT" ? fullSigned : -fullSigned;
      akunLabaPeriode = { code: acc.code, name: acc.name, nominal: fullNominal };
      continue;
    }

    const signed = mutasiPeriode.get(acc.code) ?? 0;
    const nominal = LABA_RUGI_GROUP_NORMAL[group] === "DEBIT" ? signed : -signed;
    groups[group].push({ code: acc.code, name: acc.name, nominal });
  }

  const byCode = (a: LabaRugiRow, b: LabaRugiRow) => {
    const na = parseInt(a.code, 10);
    const nb = parseInt(b.code, 10);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return a.code.localeCompare(b.code);
  };
  (Object.keys(groups) as LabaRugiGroup[]).forEach((g) => groups[g].sort(byCode));

  const sum = (rows: LabaRugiRow[]) => rows.reduce((s, r) => s + r.nominal, 0);

  const totalPendapatan = sum(groups.PENDAPATAN);
  const totalModalKeluar = sum(groups.MODAL_KELUAR);
  const totalOperasional = sum(groups.OPERASIONAL);
  const totalLuarOperasional = sum(groups.LUAR_OPERASIONAL);
  const totalLabaDitahan = sum(groups.LABA_DITAHAN);

  const labaOperasional = totalPendapatan - totalModalKeluar - totalOperasional - totalLuarOperasional;
  const totalLaba = labaOperasional + totalLabaDitahan;

  // Verifikasi dibandingkan ke LABA DITAHAN saja, bukan Total Laba penuh —
  // karena Laba Periode Berjalan dihitung otomatis tiap request dari jurnal
  // & TIDAK PERNAH dijurnal ke akun Laba, jadi gak relevan dibandingkan ke
  // saldo akun ini.
  const selisihVerifikasi = akunLabaPeriode ? akunLabaPeriode.nominal - totalLabaDitahan : null;

  return {
    period,
    pendapatan: { rows: groups.PENDAPATAN, total: totalPendapatan },
    modal_keluar: { rows: groups.MODAL_KELUAR, total: totalModalKeluar },
    operasional: { rows: groups.OPERASIONAL, total: totalOperasional },
    luar_operasional: { rows: groups.LUAR_OPERASIONAL, total: totalLuarOperasional },
    laba_ditahan: { rows: groups.LABA_DITAHAN, total: totalLabaDitahan },
    laba_operasional: labaOperasional,
    total_laba: totalLaba,
    akun_laba_periode: akunLabaPeriode,
    selisih_verifikasi: selisihVerifikasi,
  };
}
