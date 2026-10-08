import * as XLSX from "xlsx";

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

// Pasang format angka "#,##0" ke satu kolom (biar nominal rapi & tetap bisa di-SUM di Excel)
function applyRpFormat(ws: XLSX.WorkSheet, colIndex: number): void {
  const ref = ws["!ref"];
  if (!ref) return;
  const range = XLSX.utils.decode_range(ref);
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: colIndex })];
    if (cell && typeof cell.v === "number") cell.z = "#,##0";
  }
}

// ── Builder sheet Aset ──────────────────────────────────────────────────────
function buildAsetSheet(rows: ExportAsset[]): XLSX.WorkSheet {
  const header = [
    "No", "Nama Aset", "Kategori", "Nominal (Rp)", "Tanggal Beli",
    "Keterangan", "Dicatat Oleh", "Tgl Dicatat", "Terakhir Diaudit", "Diaudit Oleh",
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
  const totalRow = ["", "TOTAL", "", total, "", "", "", "", "", ""];

  const ws = XLSX.utils.aoa_to_sheet([header, ...body, totalRow]);
  ws["!cols"] = [
    { wch: 5 }, { wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 14 },
    { wch: 32 }, { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 16 },
  ];
  applyRpFormat(ws, 3); // kolom "Nominal (Rp)"
  return ws;
}

// ── Builder sheet Utang / Piutang / Modal Service (bentuk sama) ──────────────
function buildEntrySheet(rows: ExportEntry[]): XLSX.WorkSheet {
  const header = [
    "No", "Nama", "Kategori", "Nominal (Rp)", "Tanggal",
    "Keterangan", "Dicatat Oleh", "Tgl Dicatat",
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
  const totalRow = ["", "TOTAL", "", total, "", "", "", ""];

  const ws = XLSX.utils.aoa_to_sheet([header, ...body, totalRow]);
  ws["!cols"] = [
    { wch: 5 }, { wch: 28 }, { wch: 16 }, { wch: 16 },
    { wch: 14 }, { wch: 32 }, { wch: 18 }, { wch: 14 },
  ];
  applyRpFormat(ws, 3); // kolom "Nominal (Rp)"
  return ws;
}

// ── Fungsi utama: 4 dataset → 1 file Excel 4 sheet ──────────────────────────
export function exportAsetKeuanganToExcel(params: {
  aset: ExportAsset[];
  utang: ExportEntry[];
  piutang: ExportEntry[];
  modalService: ExportEntry[];
}): void {
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, buildAsetSheet(params.aset), "Aset");
  XLSX.utils.book_append_sheet(wb, buildEntrySheet(params.utang), "Utang");
  XLSX.utils.book_append_sheet(wb, buildEntrySheet(params.piutang), "Piutang");
  XLSX.utils.book_append_sheet(wb, buildEntrySheet(params.modalService), "Modal Service");

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  XLSX.writeFile(wb, `Aset-Keuangan-${today}.xlsx`);
}