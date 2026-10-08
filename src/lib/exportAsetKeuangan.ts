import ExcelJS from "exceljs";

// ── Tipe data yang dibutuhkan untuk export ──────────────────────────────────
export interface ExportAsset {
  nama_aset: string;
  kategori: string | null;
  nominal: number | string;
  tanggal_beli: string | null;
  keterangan: string | null;
  created_by_name: string | null;
  created_at: string;
  last_audited_at: string | null;
  last_audited_by_name: string | null;
}

export interface ExportEntry {
  nama: string;
  kategori: string | null;
  nominal: number | string;
  tanggal: string | null;
  keterangan: string | null;
  created_by_name: string | null;
  created_at: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function toNum(v: number | string | null): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

// Definisi kolom: key, judul, lebar minimum & maksimum, perataan
interface ColumnDef {
  header: string;
  min: number; // lebar minimum (karakter)
  max: number; // lebar maksimum, biar kolom panjang tetap kebaca tapi nggak kelebaran
  align?: "left" | "center" | "right";
  numFmt?: string; // format angka excel, mis. "#,##0"
  wrap?: boolean; // bungkus teks ke bawah (buat keterangan panjang)
}

// Warna tema (ARGB, tanpa tanda #)
const NAVY = "FF1A1A2E";
const NAVY_TEXT = "FFFFFFFF";
const STRIPE = "FFF6F7F9"; // abu sangat muda buat baris genap
const TOTAL_BG = "FFEFE9DA"; // krem lembut buat baris TOTAL
const BORDER = "FFE2E4E8";

// Bikin satu worksheet rapi dari kolom + baris + baris total
function buildSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  columns: ColumnDef[],
  rows: (string | number)[][],
  totalRow: (string | number)[]
): void {
  const ws = wb.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: 1 }], // header nempel saat di-scroll
  });

  // 1) Header
  const headerRow = ws.addRow(columns.map((c) => c.header));
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: NAVY_TEXT }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: NAVY } },
      bottom: { style: "thin", color: { argb: NAVY } },
      left: { style: "thin", color: { argb: BORDER } },
      right: { style: "thin", color: { argb: BORDER } },
    };
  });

  // 2) Baris data
  rows.forEach((r, idx) => {
    const row = ws.addRow(r);
    const isEven = idx % 2 === 1;
    row.eachCell((cell, colNumber) => {
      const col = columns[colNumber - 1];
      cell.alignment = {
        vertical: "top",
        horizontal: col.align ?? "left",
        wrapText: col.wrap ?? false,
      };
      if (col.numFmt) cell.numFmt = col.numFmt;
      if (isEven) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STRIPE } };
      }
      cell.border = {
        bottom: { style: "hair", color: { argb: BORDER } },
        left: { style: "hair", color: { argb: BORDER } },
        right: { style: "hair", color: { argb: BORDER } },
      };
    });
  });

  // 3) Baris TOTAL
  const total = ws.addRow(totalRow);
  total.eachCell((cell, colNumber) => {
    const col = columns[colNumber - 1];
    cell.font = { bold: true, color: { argb: NAVY }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_BG } };
    cell.alignment = { vertical: "middle", horizontal: col.align ?? "left" };
    if (col.numFmt) cell.numFmt = col.numFmt;
    cell.border = {
      top: { style: "thin", color: { argb: NAVY } },
      bottom: { style: "thin", color: { argb: NAVY } },
    };
  });

  // 4) Lebar kolom otomatis: ukur isi terpanjang, dibatasi min & max per kolom
  columns.forEach((col, i) => {
    let maxLen = col.header.length;
    for (const r of rows) {
      const val = r[i];
      if (val == null) continue;
      // untuk kolom wrap (keterangan), ukur baris terpanjang di dalam sel
      const text = String(val);
      const longestLine = col.wrap
        ? Math.max(...text.split(/\s+/).reduce<number[]>((acc, w) => {
            // perkiraan kasar panjang baris setelah wrap ~ tidak perlu presisi
            return acc;
          }, [text.length]))
        : text.length;
      if (longestLine > maxLen) maxLen = longestLine;
    }
    ws.getColumn(i + 1).width = Math.min(col.max, Math.max(col.min, maxLen + 2));
  });

  // 5) Auto-filter di baris header (biar bisa sortir/filter di Excel)
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };
}

// ── Sheet ASET ──────────────────────────────────────────────────────────────
function addAsetSheet(wb: ExcelJS.Workbook, rows: ExportAsset[]): void {
  const columns: ColumnDef[] = [
    { header: "No", min: 4, max: 6, align: "center" },
    { header: "Nama Aset", min: 18, max: 40 },
    { header: "Kategori", min: 12, max: 20 },
    { header: "Nominal (Rp)", min: 14, max: 20, align: "right", numFmt: "#,##0" },
    { header: "Tanggal Beli", min: 13, max: 16, align: "center" },
    { header: "Keterangan", min: 24, max: 60, wrap: true },
    { header: "Dicatat Oleh", min: 14, max: 22 },
    { header: "Tgl Dicatat", min: 13, max: 16, align: "center" },
    { header: "Terakhir Diaudit", min: 14, max: 18, align: "center" },
    { header: "Diaudit Oleh", min: 14, max: 22 },
  ];

  const body = rows.map((r, i) => [
    i + 1,
    r.nama_aset,
    r.kategori || "",
    toNum(r.nominal),
    fmtDate(r.tanggal_beli),
    r.keterangan || "",
    r.created_by_name || "",
    fmtDate(r.created_at),
    fmtDate(r.last_audited_at),
    r.last_audited_by_name || "",
  ]);

  const total = rows.reduce((s, r) => s + toNum(r.nominal), 0);
  const totalRow: (string | number)[] = ["", "TOTAL", "", total, "", "", "", "", "", ""];

  buildSheet(wb, "Aset", columns, body, totalRow);
}

// ── Sheet UTANG / PIUTANG / MODAL SERVICE ───────────────────────────────────
function addEntrySheet(wb: ExcelJS.Workbook, sheetName: string, rows: ExportEntry[]): void {
  const columns: ColumnDef[] = [
    { header: "No", min: 4, max: 6, align: "center" },
    { header: "Nama", min: 18, max: 40 },
    { header: "Kategori", min: 12, max: 20 },
    { header: "Nominal (Rp)", min: 14, max: 20, align: "right", numFmt: "#,##0" },
    { header: "Tanggal", min: 13, max: 16, align: "center" },
    { header: "Keterangan", min: 24, max: 60, wrap: true },
    { header: "Dicatat Oleh", min: 14, max: 22 },
    { header: "Tgl Dicatat", min: 13, max: 16, align: "center" },
  ];

  const body = rows.map((r, i) => [
    i + 1,
    r.nama,
    r.kategori || "",
    toNum(r.nominal),
    fmtDate(r.tanggal),
    r.keterangan || "",
    r.created_by_name || "",
    fmtDate(r.created_at),
  ]);

  const total = rows.reduce((s, r) => s + toNum(r.nominal), 0);
  const totalRow: (string | number)[] = ["", "TOTAL", "", total, "", "", "", ""];

  buildSheet(wb, sheetName, columns, body, totalRow);
}

// ── Fungsi utama: 4 dataset → 1 file Excel 4 sheet (nama & signature SAMA) ──
export async function exportAsetKeuanganToExcel(params: {
  aset: ExportAsset[];
  utang: ExportEntry[];
  piutang: ExportEntry[];
  modalService: ExportEntry[];
}): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Solit POS";
  wb.created = new Date();

  addAsetSheet(wb, params.aset);
  addEntrySheet(wb, "Utang", params.utang);
  addEntrySheet(wb, "Piutang", params.piutang);
  addEntrySheet(wb, "Modal Service", params.modalService);

  // Tulis ke blob lalu trigger download (ExcelJS tidak punya writeFile di browser)
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const today = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Aset-Keuangan-${today}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}