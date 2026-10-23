import type ExcelJS from "exceljs";
import { channelLabel, type MarketingReportRow } from "@/lib/marketing-report";

/**
 * Export Excel — Laporan Marketing (tab "Laporan Barang").
 *
 * Isi Excel = PERSIS yang sedang tampil di halaman:
 *   - periode dari kalender (from/to),
 *   - 4 kartu ringkasan (Total Qty, Kata Kunci, Channel Teratas, Menunggu Audit),
 *   - tabel per kata kunci dengan kolom channel yang sedang tampil
 *     (ikut toggle "Channel kosong") dan baris yang sedang tampil (ikut pencarian),
 *   - warna header channel & warna sel Qty sama dengan tabel di web.
 *
 * Datanya tidak di-query ulang: yang diekspor adalah data hasil API
 * /api/marketing-report yang sudah tampil (hanya laporan teraudit).
 *
 * exceljs di-import dinamis (sama seperti export Cashflow) supaya library
 * besar ini tidak ikut ke bundle awal halaman.
 */

export interface MarketingExcelInput {
  rows: MarketingReportRow[]; // baris yang tampil (sudah difilter pencarian)
  channels: string[]; // kolom channel yang tampil (urutan sama dgn tabel web)
  footer: { perChannel: Record<string, number>; total: number };
  summary: {
    grandTotal: number;
    keywordCount: number;
    topChannel: { channel: string; qty: number } | null;
    pendingAuditCount: number;
  };
  periodLabel: string; // "1 Okt 2026 — 23 Okt 2026" / "Semua Waktu"
  from: string; // YYYY-MM-DD atau ""
  to: string; // YYYY-MM-DD atau ""
  searchQuery: string;
}

// Warna Tailwind → ARGB. HARUS disamakan dengan `channelHeaderClass`
// di src/app/dashboard/laporan-marketing/page.tsx.
const CHANNEL_HEADER_ARGB: Record<string, string> = {
  WA: "FF15803D", // green-700
  SHOPEE: "FFF97316", // orange-500
  FB: "FF2563EB", // blue-600
  OLX: "FF06B6D4", // cyan-500
  CAROUSEL: "FFDC2626", // red-600
  IG: "FFDB2777", // pink-600
  TIKTOK: "FF000000", // black
  MITRA: "FFB45309", // amber-700
  RESELLER: "FF0D9488", // teal-600
  TOKOPEDIA: "FF22C55E", // green-500
  ECOMMERCE: "FFF43F5E", // rose-500
  SOSMED: "FF6366F1", // indigo-500
  THREADS: "FF262626", // neutral-800
};
const CHANNEL_FALLBACK_ARGB = "FF6B7280"; // gray-500

const C = {
  white: "FFFFFFFF",
  violet50: "FFF5F3FF",
  violet100: "FFEDE9FE",
  violet200: "FFDDD6FE",
  violet300: "FFC4B5FD",
  violet600: "FF7C3AED",
  violet700: "FF6D28D9",
  violet800: "FF5B21B6",
  violet900: "FF4C1D95",
  gray50: "FFF9FAFB",
  gray200: "FFE5E7EB",
  gray300: "FFD1D5DB",
  gray400: "FF9CA3AF",
  gray500: "FF6B7280",
  gray800: "FF1F2937",
  gray900: "FF111827",
};

const FONT = "Arial";

// Ambang warna SAMA dengan qtyCellClass() di page.tsx:
// ≥60% dari Qty tertinggi = ungu pekat, ≥30% = ungu sedang, sisanya ungu muda.
function qtyCellStyle(value: number, max: number): { fill: string | null; font: string; bold: boolean } {
  if (value <= 0) return { fill: null, font: C.gray800, bold: false };
  const ratio = max > 0 ? value / max : 0;
  if (ratio >= 0.6) return { fill: C.violet600, font: C.white, bold: true };
  if (ratio >= 0.3) return { fill: C.violet200, font: C.violet900, bold: true };
  return { fill: C.violet50, font: C.gray800, bold: false };
}

function solidFill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function thinBorder(argb: string): Partial<ExcelJS.Borders> {
  const side = { style: "thin" as const, color: { argb } };
  return { top: side, left: side, bottom: side, right: side };
}

function buildFileName(from: string, to: string): string {
  const range = !from && !to ? "Semua_Waktu" : `${from || "awal"}_sd_${to || "sekarang"}`;
  return `Laporan_Marketing_Solit_${range}.xlsx`;
}

export async function exportMarketingReportExcel(input: MarketingExcelInput): Promise<void> {
  const ExcelJS = await import("exceljs");
  const { rows, channels, footer, summary, periodLabel, from, to, searchQuery } = input;

  const totalCols = channels.length + 2; // Kata Kunci + channel + TOTAL
  const firstChCol = 2;
  const lastChCol = channels.length + 1;
  const totalCol = totalCols;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Solit POS";
  wb.created = new Date();
  wb.modified = new Date();

  const ws = wb.addWorksheet("Laporan Barang");

  // Lebar kolom: Kata Kunci menyesuaikan teks terpanjang (dibatasi 24–50).
  const longestKeyword = rows.reduce((m, r) => Math.max(m, r.keyword.length), 0);
  ws.columns = [
    { width: Math.min(50, Math.max(24, longestKeyword + 4)) },
    ...channels.map((ch) => ({ width: Math.max(11, channelLabel(ch).length + 4) })),
    { width: 11 },
  ];

  const mergeRow = (rowNumber: number, startCol = 1, endCol = totalCols) => {
    if (endCol > startCol) ws.mergeCells(rowNumber, startCol, rowNumber, endCol);
  };

  // ── 1. Judul ────────────────────────────────────────────────────────────
  const titleRow = ws.addRow(["LAPORAN MARKETING SOLIT03 — REKAP PER KATA KUNCI"]);
  mergeRow(titleRow.number);
  titleRow.height = 28;
  const titleCell = titleRow.getCell(1);
  titleCell.font = { name: FONT, size: 14, bold: true, color: { argb: C.white } };
  titleCell.fill = solidFill(C.violet600);
  titleCell.alignment = { vertical: "middle", horizontal: "center" };

  // ── 2. Info periode ─────────────────────────────────────────────────────
  const exportedAt = new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const infoParts = [
    `Periode: ${periodLabel}`,
    "Sumber: Laporan Harian Sales (hanya yang sudah diaudit)",
    `Diekspor: ${exportedAt} WIB`,
  ];
  if (searchQuery.trim()) infoParts.push(`Pencarian: "${searchQuery.trim()}"`);
  const infoRow = ws.addRow([infoParts.join("  ·  ")]);
  mergeRow(infoRow.number);
  infoRow.height = 18;
  const infoCell = infoRow.getCell(1);
  infoCell.font = { name: FONT, size: 9, italic: true, color: { argb: C.gray500 } };
  infoCell.fill = solidFill(C.violet50);
  infoCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

  ws.addRow([]).height = 6;

  // ── 3. Ringkasan (4 kartu di web) ───────────────────────────────────────
  // Kolom A = label, kolom B = angka, kolom C..akhir = keterangan.
  const summaryItems: [string, number, string][] = [
    ["TOTAL QTY", summary.grandTotal, "leads terverifikasi"],
    ["KATA KUNCI", summary.keywordCount, "barang unik"],
    [
      "CHANNEL TERATAS",
      summary.topChannel ? summary.topChannel.qty : 0,
      summary.topChannel ? channelLabel(summary.topChannel.channel) : "—",
    ],
    ["MENUNGGU AUDIT", summary.pendingAuditCount, "belum dihitung"],
  ];
  for (const [label, value, caption] of summaryItems) {
    const row = ws.addRow([label, value, caption]);
    row.height = 20;
    if (totalCols >= 3) mergeRow(row.number, 3, totalCols);

    const labelCell = row.getCell(1);
    labelCell.font = { name: FONT, size: 9, bold: true, color: { argb: C.gray500 } };
    labelCell.fill = solidFill(C.gray50);
    labelCell.alignment = { vertical: "middle", horizontal: "left" };
    labelCell.border = thinBorder(C.gray200);

    const valueCell = row.getCell(2);
    valueCell.font = { name: FONT, size: 12, bold: true, color: { argb: C.gray900 } };
    valueCell.fill = solidFill(C.white);
    valueCell.alignment = { vertical: "middle", horizontal: "center" };
    valueCell.numFmt = "#,##0";
    valueCell.border = thinBorder(C.gray200);

    if (totalCols >= 3) {
      const captionCell = row.getCell(3);
      captionCell.font = { name: FONT, size: 9, color: { argb: C.gray400 } };
      captionCell.fill = solidFill(C.white);
      captionCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      captionCell.border = thinBorder(C.gray200);
    }
  }

  ws.addRow([]).height = 8;

  // ── 4. Header tabel ─────────────────────────────────────────────────────
  const headerRow = ws.addRow(["Model / Kata Kunci", ...channels.map((ch) => channelLabel(ch)), "TOTAL"]);
  headerRow.height = 22;
  headerRow.eachCell((cell, col) => {
    const isKeyword = col === 1;
    const isTotal = col === totalCol;
    const bg = isKeyword || isTotal ? C.violet600 : CHANNEL_HEADER_ARGB[channels[col - 2]] ?? CHANNEL_FALLBACK_ARGB;
    cell.fill = solidFill(bg);
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: C.white } };
    cell.alignment = { vertical: "middle", horizontal: isKeyword ? "left" : "center" };
    cell.border = thinBorder(isKeyword || isTotal ? C.violet700 : C.gray300);
  });

  // ── 5. Baris data ───────────────────────────────────────────────────────
  // Skala warna dihitung dari baris yang tampil — sama dengan maxCellQty /
  // maxRowTotal di page.tsx.
  let maxCellQty = 0;
  let maxRowTotal = 0;
  for (const r of rows) {
    for (const qty of Object.values(r.channels)) if (qty > maxCellQty) maxCellQty = qty;
    if (r.total > maxRowTotal) maxRowTotal = r.total;
  }

  const firstDataRow = headerRow.number + 1;
  const firstChLetter = ws.getColumn(firstChCol).letter;
  const lastChLetter = channels.length > 0 ? ws.getColumn(lastChCol).letter : firstChLetter;

  rows.forEach((r) => {
    const row = ws.addRow([r.keyword]);
    row.height = 18;

    const kwCell = row.getCell(1);
    kwCell.font = { name: FONT, size: 10, color: { argb: C.gray800 } };
    kwCell.fill = solidFill(C.white);
    kwCell.alignment = { vertical: "middle", horizontal: "left" };
    kwCell.border = thinBorder(C.gray200);

    channels.forEach((ch, i) => {
      const qty = r.channels[ch] ?? 0;
      const cell = row.getCell(firstChCol + i);
      // 0 dikosongkan, sama seperti di web.
      cell.value = qty > 0 ? qty : null;
      const s = qtyCellStyle(qty, maxCellQty);
      cell.fill = solidFill(s.fill ?? C.white);
      cell.font = { name: FONT, size: 10, bold: s.bold, color: { argb: s.font } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = thinBorder(C.gray200);
    });

    // TOTAL baris pakai rumus SUM supaya tetap benar kalau angka diedit di Excel.
    // `result` diisi supaya angka langsung tampil di viewer yang tidak menghitung
    // rumus (preview WhatsApp/HP).
    const totalCell = row.getCell(totalCol);
    totalCell.value =
      channels.length > 0
        ? { formula: `SUM(${firstChLetter}${row.number}:${lastChLetter}${row.number})`, result: r.total }
        : r.total;
    const ts = qtyCellStyle(r.total, maxRowTotal);
    totalCell.fill = solidFill(ts.fill ?? C.white);
    totalCell.font = { name: FONT, size: 10, bold: true, color: { argb: ts.font } };
    totalCell.alignment = { vertical: "middle", horizontal: "center" };
    totalCell.border = thinBorder(C.gray200);
  });

  const lastDataRow = firstDataRow + rows.length - 1;

  // ── 6. Baris TOTAL ──────────────────────────────────────────────────────
  if (rows.length > 0) {
    const footRow = ws.addRow(["TOTAL"]);
    footRow.height = 22;

    const labelCell = footRow.getCell(1);
    labelCell.font = { name: FONT, size: 10, bold: true, color: { argb: C.violet800 } };
    labelCell.fill = solidFill(C.violet100);
    labelCell.alignment = { vertical: "middle", horizontal: "left" };
    labelCell.border = thinBorder(C.violet200);

    channels.forEach((ch, i) => {
      const col = firstChCol + i;
      const letter = ws.getColumn(col).letter;
      const cell = footRow.getCell(col);
      cell.value = {
        formula: `SUM(${letter}${firstDataRow}:${letter}${lastDataRow})`,
        result: footer.perChannel[ch] ?? 0,
      };
      cell.font = { name: FONT, size: 10, bold: true, color: { argb: C.violet800 } };
      cell.fill = solidFill(C.violet50);
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = thinBorder(C.violet200);
    });

    const totalLetter = ws.getColumn(totalCol).letter;
    const grandCell = footRow.getCell(totalCol);
    grandCell.value = {
      formula: `SUM(${totalLetter}${firstDataRow}:${totalLetter}${lastDataRow})`,
      result: footer.total,
    };
    grandCell.font = { name: FONT, size: 11, bold: true, color: { argb: C.white } };
    grandCell.fill = solidFill(C.violet600);
    grandCell.alignment = { vertical: "middle", horizontal: "center" };
    grandCell.border = thinBorder(C.violet300);
  } else {
    const emptyRow = ws.addRow(["Belum ada data"]);
    mergeRow(emptyRow.number);
    emptyRow.height = 20;
    const ec = emptyRow.getCell(1);
    ec.font = { name: FONT, italic: true, color: { argb: C.gray400 } };
    ec.alignment = { vertical: "middle", horizontal: "center" };
    ec.border = thinBorder(C.gray200);
  }

  // Kolom Kata Kunci & header tabel dibekukan — mirip kolom sticky di web.
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: headerRow.number }];
  ws.pageSetup = {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: `${headerRow.number}:${headerRow.number}`,
  };

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildFileName(from, to);
  link.click();
  URL.revokeObjectURL(url);
}