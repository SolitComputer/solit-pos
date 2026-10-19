// src/lib/exportKenaikanJenjang.ts

export interface JenjangRow {
  no: number;
  name: string;
  role: string;         // DIVISI (label role)
  next_level: string;   // SELANJUTNYA
  prev_level: string;   // SEBELUMNYA
  kontrak_prev: string; // KONTRAK SEBELUMNYA
  kontrak_next: string; // KONTRAK SELANJUTNYA
}

const HEADERS = [
  "NO",
  "NAMA KARYAWAN",
  "DIVISI",
  "KONTRAK SEBELUMNYA",
  "JENJANG KARIR SEBELUMNYA",
  "JENJANG KARIR SELANJUTNYA",
  "KONTRAK SELANJUTNYA",
];

const THIN = { style: "thin" as const, color: { argb: "FF000000" } };

export async function exportKenaikanJenjangExcel(
  rows: JenjangRow[],
  fileName = "kenaikan-jenjang.xlsx"
): Promise<void> {
  // Lazy-load: ExcelJS baru di-download saat fungsi ini dipanggil.
  const ExcelJS = (await import("exceljs")).default;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Kenaikan Jenjang");

  // ── Header (baris 1) — kuning + bold + border ──
  const headerRow = ws.addRow(HEADERS);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
    cell.font = { bold: true, color: { argb: "FF000000" }, size: 10 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { top: THIN, left: THIN, bottom: THIN, right: THIN };
  });

  // ── Data ──
  rows.forEach((r) => {
    const row = ws.addRow([
      r.no,
      r.name,
      r.role,
      r.kontrak_prev,
      r.prev_level,
      r.next_level,
      r.kontrak_next,
    ]);
    row.eachCell((cell, col) => {
      cell.border = { top: THIN, left: THIN, bottom: THIN, right: THIN };
      // Kolom NAMA (2) rata kiri, sisanya rata tengah — mirip foto.
      cell.alignment = { horizontal: col === 2 ? "left" : "center", vertical: "middle" };
      cell.font = { size: 10 };
    });
  });

  // ── Lebar kolom ──
  ws.columns = [
    { width: 5 },  // NO
    { width: 28 }, // NAMA KARYAWAN
    { width: 30 }, // DIVISI
    { width: 20 }, // KONTRAK SEBELUMNYA
    { width: 22 }, // JENJANG KARIR SEBELUMNYA
    { width: 22 }, // JENJANG KARIR SELANJUTNYA
    { width: 20 }, // KONTRAK SELANJUTNYA
  ];

  // ── Trigger download di browser ──
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}