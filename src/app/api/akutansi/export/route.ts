// src/app/api/akutansi/export/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { AKUNTANSI_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { isValidPeriod, ACCOUNT_TYPE_LABEL, ACCOUNT_TYPE_ORDER } from "@/lib/accounting";
import ExcelJS from "exceljs";

// Route ini butuh Node runtime (ExcelJS pakai Buffer/stream).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Naikkan kalau akun/data banyak & generate-nya lama (cek limit function
// duration di plan Vercel/Hostinger kamu).
export const maxDuration = 60;

function getAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// Batasi ukuran query .in() supaya nggak lewat limit panjang URL Supabase/PostgREST.
// Query .in() dengan ratusan/ribuan UUID bikin request GET jadi puluhan KB dan
// di-reject duluan oleh gateway (Kong/PostgREST) sebelum sampai ke database —
// makanya errornya generic "Bad Request", bukan pesan spesifik dari kode kita.
const IN_CLAUSE_CHUNK_SIZE = 200;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

// ─── Types ──────────────────────────────────────────────────────────────────
interface AccountRow { code: string; name: string; type: string }
interface OpeningRow { account_code: string; side: "DEBIT" | "KREDIT"; nominal: number }
interface EntryMeta { tanggal: string; keterangan: string; created_at: string }
interface LineRow { id: string; entry_id: string; account_code: string; side: "DEBIT" | "KREDIT"; nominal: number }

interface JournalLineFull {
  id: string;
  account_code: string;
  account_name: string;
  side: "DEBIT" | "KREDIT";
  nominal: number;
  line_order?: number;
}
interface JournalEntryFull {
  id: string;
  tanggal: string;
  keterangan: string;
  ref: string | null;
  source_type: "TRANSACTION" | "SERVICE" | "CASHFLOW" | "MANUAL";
  lines: JournalLineFull[];
}

interface LedgerCtx {
  openingMap: Map<string, { side: "DEBIT" | "KREDIT"; nominal: number }>;
  mutasiSebelumMap: Map<string, number>;
  linesByAccount: Map<string, LineRow[]>;
  entryMap: Map<string, EntryMeta>;
  entryAccountsMap: Map<string, string[]>;
  checkedMap: Map<string, string>;
}

interface AccountLedgerRow {
  tanggal: string;
  keterangan: string;
  ref: string;
  debit: number;
  kredit: number;
  saldoDebit: number;
  saldoKredit: number;
  checked: boolean;
}

interface AccountLedgerResult {
  saldoAwal: number;
  rows: AccountLedgerRow[];
  totalDebit: number;
  totalKredit: number;
  saldoAkhir: number;
}

type NormalSide = "DEBIT" | "KREDIT" | null;

const SOURCE_LABEL: Record<string, string> = {
  TRANSACTION: "Transaksi",
  SERVICE: "Service",
  CASHFLOW: "Cashflow",
  MANUAL: "Manual",
};

// Layout blok horizontal Buku Besar: 8 kolom data per akun + 1 kolom gap.
const BLOCK_COLS = 8;
const BLOCK_COL_WIDTHS = [11, 28, 13, 13, 13, 13, 13, 8];
const GAP_WIDTH = 2;
const STRIDE = BLOCK_COLS + 1; // 8 kolom + 1 pemisah

// Sama persis dengan logic di BukuBesar.tsx.
// TODO: idealnya pindahkan ke @/lib/accounting supaya client & server nggak duplikat.
function getNormalSide(code: string): NormalSide {
  const num = parseInt(code, 10);
  if (Number.isNaN(num)) return null;
  if ((num >= 110 && num <= 191) || (num >= 440 && num <= 540)) return "DEBIT";
  if (num >= 210 && num <= 430) return "KREDIT";
  return null;
}

function sanitizeSheetName(name: string): string {
  // Excel: max 31 char & nggak boleh ada \ / ? * [ ] :
  return name.replace(/[\\/?*[\]:]/g, "").slice(0, 31);
}

// ─── Hitung ledger 1 akun dari data yang sudah di-batch fetch ───────────────
function computeAccountLedger(accountCode: string, ctx: LedgerCtx): AccountLedgerResult {
  const opening = ctx.openingMap.get(accountCode);
  const openingSigned = opening ? (opening.side === "DEBIT" ? opening.nominal : -opening.nominal) : 0;
  const mutasiSebelum = ctx.mutasiSebelumMap.get(accountCode) ?? 0;
  const saldoAwal = openingSigned + mutasiSebelum;

  const ownLines = (ctx.linesByAccount.get(accountCode) ?? [])
    .slice()
    .sort((a, b) => {
      const ea = ctx.entryMap.get(a.entry_id)!;
      const eb = ctx.entryMap.get(b.entry_id)!;
      const t = new Date(ea.tanggal).getTime() - new Date(eb.tanggal).getTime();
      if (t !== 0) return t;
      return new Date(ea.created_at).getTime() - new Date(eb.created_at).getTime();
    });

  let running = saldoAwal;
  let totalDebit = 0;
  let totalKredit = 0;

  const rows: AccountLedgerRow[] = ownLines.map((l) => {
    const entry = ctx.entryMap.get(l.entry_id)!;
    const debit = l.side === "DEBIT" ? Number(l.nominal) : 0;
    const kredit = l.side === "KREDIT" ? Number(l.nominal) : 0;
    running += debit - kredit;
    totalDebit += debit;
    totalKredit += kredit;

    const refCodes = (ctx.entryAccountsMap.get(l.entry_id) ?? []).filter((c) => c !== accountCode);
    const checkedAt = ctx.checkedMap.get(l.id) ?? null;

    return {
      tanggal: entry.tanggal,
      keterangan: entry.keterangan,
      ref: refCodes.join(", "),
      debit,
      kredit,
      saldoDebit: running >= 0 ? running : 0,
      saldoKredit: running < 0 ? Math.abs(running) : 0,
      checked: !!checkedAt,
    };
  });

  return { saldoAwal, rows, totalDebit, totalKredit, saldoAkhir: running };
}

// ─── Sheet 1: Jurnal Umum ───────────────────────────────────────────────────
function buildJurnalUmumSheet(sheet: ExcelJS.Worksheet, entries: JournalEntryFull[], period: string) {
  sheet.columns = [
    { width: 12 }, { width: 12 }, { width: 40 }, { width: 20 }, { width: 28 }, { width: 16 }, { width: 16 },
  ];

  sheet.mergeCells(1, 1, 1, 7);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `JURNAL UMUM — Periode ${period}`;
  titleCell.font = { bold: true, size: 13 };

  const headerRow = sheet.addRow(["Tanggal", "Sumber", "Keterangan", "Ref", "Nama Akun", "Debit", "Kredit"]);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
    cell.border = { bottom: { style: "thin" } };
  });

  let totalDebit = 0;
  let totalKredit = 0;

  entries.forEach((entry) => {
    entry.lines.forEach((line, i) => {
      const debit = line.side === "DEBIT" ? Number(line.nominal) : null;
      const kredit = line.side === "KREDIT" ? Number(line.nominal) : null;
      if (debit) totalDebit += debit;
      if (kredit) totalKredit += kredit;

      const row = sheet.addRow([
        i === 0 ? new Date(`${entry.tanggal}T00:00:00`) : null,
        i === 0 ? (SOURCE_LABEL[entry.source_type] ?? entry.source_type) : null,
        i === 0 ? entry.keterangan : null,
        // Ref = kode akun (post reference); ref asli entry ditempel di baris pertama saja.
        i === 0 && entry.ref ? `${line.account_code} · ${entry.ref}` : line.account_code,
        line.account_name,
        debit,
        kredit,
      ]);
      if (i === 0) row.getCell(1).numFmt = "dd/mm/yy";
      row.getCell(6).numFmt = '"Rp"#,##0';
      row.getCell(7).numFmt = '"Rp"#,##0';
    });
  });

  const totalRow = sheet.addRow(["", "", "TOTAL", "", "", totalDebit, totalKredit]);
  totalRow.font = { bold: true };
  totalRow.getCell(6).numFmt = '"Rp"#,##0';
  totalRow.getCell(7).numFmt = '"Rp"#,##0';
  totalRow.eachCell((cell) => { cell.border = { top: { style: "thin" } }; });
}

// ─── Sheet Buku Besar per kategori — akun disusun KE SAMPING ────────────────
function buildAccountTypeSheetHorizontal(
  sheet: ExcelJS.Worksheet,
  accounts: AccountRow[],
  period: string,
  typeLabel: string,
  ctx: LedgerCtx
) {
  const ledgers = accounts.map((acc) => ({
    acc,
    normalSide: getNormalSide(acc.code),
    ledger: computeAccountLedger(acc.code, ctx),
  }));

  // Baris data disamakan tingginya antar akun supaya baris Total sejajar.
  const maxDataRows = Math.max(1, ...ledgers.map((l) => l.ledger.rows.length));

  accounts.forEach((_, i) => {
    const base = i * STRIDE;
    BLOCK_COL_WIDTHS.forEach((w, j) => { sheet.getColumn(base + j + 1).width = w; });
    sheet.getColumn(base + BLOCK_COLS + 1).width = GAP_WIDTH; // pemisah antar akun
  });

  const totalCols = Math.max(accounts.length * STRIDE - 1, 8);
  sheet.mergeCells(1, 1, 1, totalCols);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `BUKU BESAR — ${typeLabel} — Periode ${period}`;
  titleCell.font = { bold: true, size: 13 };

  const HEADER_ROW = 3;
  const COLUMN_HEADER_ROW = 4;
  const SALDO_AWAL_ROW = 5;
  const DATA_START_ROW = 6;
  const TOTAL_ROW = DATA_START_ROW + maxDataRows;

  ledgers.forEach(({ acc, normalSide, ledger }, i) => {
    const startCol = i * STRIDE + 1;
    const { saldoAwal, rows, totalDebit, totalKredit, saldoAkhir } = ledger;

    // Header akun
    sheet.mergeCells(HEADER_ROW, startCol, HEADER_ROW, startCol + BLOCK_COLS - 1);
    const accCell = sheet.getCell(HEADER_ROW, startCol);
    accCell.value = `${acc.code} · ${acc.name}`;
    accCell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    accCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF374151" } };
    sheet.getRow(HEADER_ROW).height = 20;

    // Header kolom
    ["Tanggal", "Keterangan", "Ref", "Debit", "Kredit", "Saldo D", "Saldo K", "Cek"].forEach((label, j) => {
      const cell = sheet.getCell(COLUMN_HEADER_ROW, startCol + j);
      cell.value = label;
      cell.font = { bold: true, size: 8, color: { argb: "FF4B5563" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
      cell.border = { bottom: { style: "thin", color: { argb: "FFD1D5DB" } } };
    });

    // Saldo awal
    sheet.mergeCells(SALDO_AWAL_ROW, startCol, SALDO_AWAL_ROW, startCol + 2);
    const saldoAwalCell = sheet.getCell(SALDO_AWAL_ROW, startCol);
    saldoAwalCell.value = "Saldo Awal";
    saldoAwalCell.font = { italic: true, size: 9, color: { argb: "FF6B7280" } };
    const saldoAwalCol = saldoAwal >= 0 ? startCol + 5 : startCol + 6;
    const saldoAwalValCell = sheet.getCell(SALDO_AWAL_ROW, saldoAwalCol);
    saldoAwalValCell.value = Math.abs(saldoAwal);
    saldoAwalValCell.numFmt = '"Rp"#,##0';

    // Baris mutasi
    if (rows.length === 0) {
      sheet.mergeCells(DATA_START_ROW, startCol, DATA_START_ROW, startCol + BLOCK_COLS - 1);
      const cell = sheet.getCell(DATA_START_ROW, startCol);
      cell.value = "Tidak ada mutasi";
      cell.font = { italic: true, size: 8, color: { argb: "FF9CA3AF" } };
      cell.alignment = { horizontal: "center" };
    } else {
      rows.forEach((line, idx) => {
        const r = DATA_START_ROW + idx;
        sheet.getCell(r, startCol).value = new Date(`${line.tanggal}T00:00:00`);
        sheet.getCell(r, startCol).numFmt = "dd/mm/yy";
        sheet.getCell(r, startCol + 1).value = line.keterangan;
        sheet.getCell(r, startCol + 2).value = line.ref || "—";
        sheet.getCell(r, startCol + 2).alignment = { horizontal: "center" };
        if (line.debit > 0) {
          sheet.getCell(r, startCol + 3).value = line.debit;
          sheet.getCell(r, startCol + 3).numFmt = '"Rp"#,##0';
        }
        if (line.kredit > 0) {
          sheet.getCell(r, startCol + 4).value = line.kredit;
          sheet.getCell(r, startCol + 4).numFmt = '"Rp"#,##0';
        }
        if (line.saldoDebit > 0) {
          sheet.getCell(r, startCol + 5).value = line.saldoDebit;
          sheet.getCell(r, startCol + 5).numFmt = '"Rp"#,##0';
          sheet.getCell(r, startCol + 5).font = { color: { argb: "FF1D4ED8" } };
        }
        if (line.saldoKredit > 0) {
          sheet.getCell(r, startCol + 6).value = line.saldoKredit;
          sheet.getCell(r, startCol + 6).numFmt = '"Rp"#,##0';
          sheet.getCell(r, startCol + 6).font = { color: { argb: "FF047857" } };
        }
        sheet.getCell(r, startCol + 7).value = line.checked ? "✓" : "-";
        sheet.getCell(r, startCol + 7).alignment = { horizontal: "center" };
      });
    }

    // Total & saldo akhir
    sheet.mergeCells(TOTAL_ROW, startCol, TOTAL_ROW, startCol + 2);
    const labelCell = sheet.getCell(TOTAL_ROW, startCol);
    labelCell.value = "Total & Saldo Akhir";
    labelCell.font = { bold: true, size: 8 };

    const dCell = sheet.getCell(TOTAL_ROW, startCol + 3);
    dCell.value = totalDebit;
    dCell.numFmt = '"Rp"#,##0';
    dCell.font = { bold: true };

    const kCell = sheet.getCell(TOTAL_ROW, startCol + 4);
    kCell.value = totalKredit;
    kCell.numFmt = '"Rp"#,##0';
    kCell.font = { bold: true };

    const actualSide: "DEBIT" | "KREDIT" = saldoAkhir >= 0 ? "DEBIT" : "KREDIT";
    const isAbnormal = !!normalSide && normalSide !== actualSide;
    const finalCol = saldoAkhir >= 0 ? startCol + 5 : startCol + 6;
    const finalCell = sheet.getCell(TOTAL_ROW, finalCol);
    finalCell.value = Math.abs(saldoAkhir);
    finalCell.numFmt = '"Rp"#,##0';
    finalCell.font = { bold: true };
    if (isAbnormal) {
      finalCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
    }

    for (let c = startCol; c <= startCol + BLOCK_COLS - 1; c++) {
      sheet.getCell(TOTAL_ROW, c).border = { top: { style: "double", color: { argb: "FF374151" } } };
    }
  });
}

// ─── Sheet Neraca Saldo (Trial Balance) ─────────────────────────────────────
// Saldo akhir semua akun s/d akhir periode, dipisah kolom Debit/Kredit.
// Kolom dari tanda saldoAkhir (sama seperti saldo_debit/saldo_kredit di buku
// besar): >= 0 → Debit, < 0 → Kredit. Akun saldo 0 di-skip. Total D & K sama.
function buildNeracaSheet(sheet: ExcelJS.Worksheet, accounts: AccountRow[], period: string, ctx: LedgerCtx) {
  sheet.columns = [{ width: 10 }, { width: 42 }, { width: 18 }, { width: 18 }];

  sheet.mergeCells(1, 1, 1, 4);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `NERACA SALDO — Periode ${period}`;
  titleCell.font = { bold: true, size: 13 };

  const headerRow = sheet.getRow(3);
  headerRow.values = ["Kode", "Keterangan", "Debit", "Kredit"];
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 10, color: { argb: "FF4B5563" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FFD1D5DB" } } };
  });

  let r = 4;
  let totalDebit = 0;
  let totalKredit = 0;

  for (const acc of accounts) {
    const { saldoAkhir } = computeAccountLedger(acc.code, ctx);
    if (Math.round(saldoAkhir) === 0) continue; // skip akun bersaldo 0

    const debit = saldoAkhir >= 0 ? saldoAkhir : 0;
    const kredit = saldoAkhir < 0 ? Math.abs(saldoAkhir) : 0;
    totalDebit += debit;
    totalKredit += kredit;

    const row = sheet.getRow(r);
    row.getCell(1).value = acc.code;
    row.getCell(1).font = { bold: true, color: { argb: "FF6B7280" } };
    row.getCell(2).value = acc.name;
    if (debit > 0) {
      row.getCell(3).value = debit;
      row.getCell(3).numFmt = '"Rp"#,##0';
      row.getCell(3).font = { color: { argb: "FF1D4ED8" } };
    }
    if (kredit > 0) {
      row.getCell(4).value = kredit;
      row.getCell(4).numFmt = '"Rp"#,##0';
      row.getCell(4).font = { color: { argb: "FF047857" } };
    }
    r++;
  }

  const totalRow = sheet.getRow(r);
  totalRow.getCell(2).value = "TOTAL";
  totalRow.getCell(2).alignment = { horizontal: "right" };
  totalRow.getCell(3).value = totalDebit;
  totalRow.getCell(3).numFmt = '"Rp"#,##0';
  totalRow.getCell(4).value = totalKredit;
  totalRow.getCell(4).numFmt = '"Rp"#,##0';
  totalRow.eachCell((cell) => {
    cell.font = { bold: true, ...(cell.font ?? {}) };
    cell.border = { top: { style: "double", color: { argb: "FF374151" } } };
  });

  const selisih = totalDebit - totalKredit;
  const balanced = Math.abs(selisih) < 1;
  sheet.mergeCells(r + 2, 1, r + 2, 4);
  const statusCell = sheet.getCell(r + 2, 1);
  statusCell.value = balanced
    ? "✓ Balance — total Debit sama dengan total Kredit"
    : `✕ Tidak balance — selisih Rp${Math.abs(selisih).toLocaleString("id-ID")}`;
  statusCell.font = { bold: true, color: { argb: balanced ? "FF047857" : "FFB91C1C" } };
}

// ─── Handler ────────────────────────────────────────────────────────────────
export const GET = withAuth(async (req) => {
  const url = new URL(req.url);
  const period = url.searchParams.get("period") ?? "";

  if (!isValidPeriod(period))
    return NextResponse.json({ success: false, message: "Periode tidak valid" }, { status: 400 });

  const supabase = getAdmin();

  try {
    // 1) Semua akun (dari DB — selalu sinkron)
    const { data: accountsData, error: accErr } = await supabase
      .from("chart_of_accounts")
      .select("code, name, type")
      .order("code", { ascending: true });
    if (accErr) throw accErr;
    const accounts = (accountsData ?? []) as AccountRow[];

    // 2) Saldo awal manual — semua akun sekaligus
    const { data: openingData, error: openingErr } = await supabase
      .from("journal_opening_balances")
      .select("account_code, side, nominal");
    if (openingErr) throw openingErr;
    const openingMap = new Map<string, { side: "DEBIT" | "KREDIT"; nominal: number }>();
    for (const o of (openingData ?? []) as OpeningRow[]) {
      openingMap.set(o.account_code, { side: o.side, nominal: Number(o.nominal) });
    }
    
    const mutasiSebelumMap = new Map<string, number>();
    {
      const PAGE_SIZE = 1000;
      let from = 0;
      while (true) {
        const { data: page, error: priorLineErr } = await supabase
          .from("journal_lines")
          .select("account_code, side, nominal, journal_entries!inner(period)")
          .lt("journal_entries.period", period)
          .order("id", { ascending: true })
          .range(from, from + PAGE_SIZE - 1);

        if (priorLineErr) throw priorLineErr;
        if (!page || page.length === 0) break;

        for (const l of page as any[]) {
          const signed = l.side === "DEBIT" ? Number(l.nominal) : -Number(l.nominal);
          mutasiSebelumMap.set(l.account_code, (mutasiSebelumMap.get(l.account_code) ?? 0) + signed);
        }

        if (page.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
    }

    // 4) Entry periode berjalan + lines-nya sekalian (dipakai Jurnal Umum & Buku Besar)
    const { data: periodEntriesRaw, error: entryErr } = await supabase
      .from("journal_entries")
      .select("id, tanggal, keterangan, ref, source_type, created_at, lines:journal_lines(*)")
      .eq("period", period)
      .order("tanggal", { ascending: true })
      .order("created_at", { ascending: true });
    if (entryErr) throw entryErr;

    const entryMap = new Map<string, EntryMeta>();
    const entryAccountsMap = new Map<string, string[]>();
    const allLines: LineRow[] = [];
    const journalEntriesFull: JournalEntryFull[] = [];

    for (const e of (periodEntriesRaw ?? []) as any[]) {
      entryMap.set(e.id, { tanggal: e.tanggal, keterangan: e.keterangan, created_at: e.created_at });

      // Urutkan line: DEBIT dulu, lalu line_order — konsisten dgn GET jurnal.
      const sortedLines: JournalLineFull[] = [...(e.lines ?? [])].sort((a: any, b: any) => {
        if (a.side !== b.side) return a.side === "DEBIT" ? -1 : 1;
        return (a.line_order ?? 0) - (b.line_order ?? 0);
      });

      journalEntriesFull.push({
        id: e.id,
        tanggal: e.tanggal,
        keterangan: e.keterangan,
        ref: e.ref,
        source_type: e.source_type,
        lines: sortedLines,
      });

      const accCodes: string[] = [];
      for (const l of sortedLines) {
        allLines.push({
          id: l.id,
          entry_id: e.id,
          account_code: l.account_code,
          side: l.side,
          nominal: Number(l.nominal),
        });
        if (!accCodes.includes(l.account_code)) accCodes.push(l.account_code);
      }
      entryAccountsMap.set(e.id, accCodes);
    }

    const linesByAccount = new Map<string, LineRow[]>();
    for (const l of allLines) {
      const arr = linesByAccount.get(l.account_code) ?? [];
      arr.push(l);
      linesByAccount.set(l.account_code, arr);
    }

    // 5) Status "sudah dicek" — semua baris, di-batch juga (sama alasannya
    //    dengan mutasiSebelumMap di atas).
    const allLineIds = allLines.map((l) => l.id);
    const checkedMap = new Map<string, string>();
    for (const idChunk of chunkArray(allLineIds, IN_CLAUSE_CHUNK_SIZE)) {
      const { data: checksData, error: checksErr } = await supabase
        .from("journal_line_checks")
        .select("line_id, checked_at")
        .in("line_id", idChunk);
      if (checksErr) throw checksErr;
      for (const c of (checksData ?? []) as { line_id: string; checked_at: string }[]) {
        checkedMap.set(c.line_id, c.checked_at);
      }
    }

    const ctx: LedgerCtx = { openingMap, mutasiSebelumMap, linesByAccount, entryMap, entryAccountsMap, checkedMap };

    // ── Bangun workbook ──
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Solit POS";
    workbook.created = new Date();

    // Sheet 1: Jurnal Umum
    const jurnalSheet = workbook.addWorksheet("Jurnal Umum");
    buildJurnalUmumSheet(jurnalSheet, journalEntriesFull, period);

    // Sheet 2..n: Buku Besar per kategori (horizontal)
    for (const type of ACCOUNT_TYPE_ORDER) {
      const accsInType = accounts.filter((a) => a.type === type);
      if (accsInType.length === 0) continue;
      const typeLabel = (ACCOUNT_TYPE_LABEL as Record<string, string>)[type] ?? type;
      const sheet = workbook.addWorksheet(sanitizeSheetName(`BB - ${typeLabel}`));
      buildAccountTypeSheetHorizontal(sheet, accsInType, period, typeLabel, ctx);
    }

    // Sheet terakhir: Neraca Saldo
    const neracaSheet = workbook.addWorksheet("Neraca");
    buildNeracaSheet(neracaSheet, accounts, period, ctx);

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Akuntansi-${period}.xlsx"`,
      },
    });
  } catch (error: any) {
    console.error("[akuntansi export GET]", error);
    return NextResponse.json(
      { success: false, message: error?.message ?? "Gagal export akuntansi" },
      { status: 500 }
    );
  }
}, AKUNTANSI_ROLES);