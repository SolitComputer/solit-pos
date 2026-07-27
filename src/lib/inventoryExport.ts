// src/lib/inventoryExport.ts
//
// Export Excel inventaris — kolomnya mengikuti tabel di layar (layout papan tulis),
// jadi hasil export dan tampilan web selalu sinkron.
//
// Menghasilkan 2 sheet:
//   1. "Data Laptop"  → 1 baris = 1 model laptop (sama persis dengan tabel Data Barang)
//   2. "Detail Unit"  → 1 baris = 1 unit fisik (SN, grade, sumber, modal, margin, status)
//
// Sheet ke-2 inilah yang menjawab kebutuhan "harus benar-benar detail":
// semua data per-unit yang di web tersembunyi di balik Pop-up Detail ikut terekspor.

import ExcelJS from "exceljs";

export interface ExportUnit {
    id: string;
    serial_number: string;
    grade?: string;
    status: string;
    condition_note?: string;
    notes?: string;
    source?: string | null;
    purchase_price?: number;
    sparepart_cost?: number;
    selling_price?: number;
    /** Harga Official — harga yang sudah di-mark up, terpisah dari Harga Store (selling_price) */
    official_price?: number;
    created_at?: string;
}

export interface ExportLaptop {
    id: string;
    laptop_name: string;
    brand?: string;
    cpu: string;
    ram: string;
    storage: string;
    gpu?: string;
    display?: string;
    selling_price: number;
    stok_tersedia: number;
    siap_jual: number;
    stok_minus: number;
    terjual: number;
    laptop_units?: ExportUnit[];
}

const STATUS_LABEL: Record<string, string> = {
    SIAP_JUAL: "Siap Jual",
    BELUM_SIAP: "Belum Siap",
    SERVICE: "Service",
    RESERVED: "Dipesan (DP)",
    HELD: "Diambil Dulu",
    PACKING: "Packing",
    SOLD: "Terjual",
};

const C = {
    headerBg: "FF374151",
    headerFg: "FFFFFFFF",
    titleFg: "FF111827",
    subFg: "FF6B7280",
    rowEven: "FFF8FAFC",
    rowOdd: "FFFFFFFF",
    border: "FFE5E7EB",
    siapBg: "FFD1FAE5", siapFg: "FF065F46",
    minusBg: "FFFEE2E2", minusFg: "FF7F1D1D",
    soldBg: "FFF3F4F6", soldFg: "FF6B7280",
    holdBg: "FFFEF3C7", holdFg: "FF92400E",
    moneyFg: "FF1F2937",
};

const RP = '"Rp "#,##0';
const thin = { style: "thin" as const, color: { argb: C.border } };
const hair = { style: "hair" as const, color: { argb: C.border } };

function styleHeader(ws: ExcelJS.Worksheet, rowNumber: number) {
    const row = ws.getRow(rowNumber);
    row.height = 30;
    row.eachCell(cell => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.headerBg } };
        cell.font = { bold: true, size: 10, color: { argb: C.headerFg }, name: "Calibri" };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.border = { top: thin, left: thin, bottom: thin, right: thin };
    });
}

/** Blok judul 3 baris di atas tabel — konteks filter ikut tercatat di file. */
function writeTitle(ws: ExcelJS.Worksheet, title: string, subtitle: string, lastCol: number) {
    ws.mergeCells(1, 1, 1, lastCol);
    ws.mergeCells(2, 1, 2, lastCol);

    const t = ws.getCell(1, 1);
    t.value = title;
    t.font = { bold: true, size: 14, color: { argb: C.titleFg }, name: "Calibri" };
    t.alignment = { horizontal: "left", vertical: "middle" };
    ws.getRow(1).height = 24;

    const s = ws.getCell(2, 1);
    s.value = subtitle;
    s.font = { size: 9, italic: true, color: { argb: C.subFg }, name: "Calibri" };
    s.alignment = { horizontal: "left", vertical: "middle" };
    ws.getRow(2).height = 16;

    ws.getRow(3).height = 6; // spasi
}

function statusFill(status: string): { bg: string; fg: string } | null {
    if (status === "SIAP_JUAL") return { bg: C.siapBg, fg: C.siapFg };
    if (status === "SERVICE" || status === "BELUM_SIAP") return { bg: C.minusBg, fg: C.minusFg };
    if (status === "SOLD") return { bg: C.soldBg, fg: C.soldFg };
    if (status === "RESERVED" || status === "HELD" || status === "PACKING") return { bg: C.holdBg, fg: C.holdFg };
    return null;
}

export async function exportInventoryExcel(opts: {
    laptops: ExportLaptop[];
    /** false → kolom Harga Modal / Sumber / Margin tidak ikut diekspor */
    canSeePrivate: boolean;
    /** Keterangan filter aktif, mis. "Filter: Siap Jual · Brand Asus" */
    filterLabel?: string;
    fileSuffix?: string;
}) {
    const { laptops, canSeePrivate, filterLabel, fileSuffix = "" } = opts;

    const wb = new ExcelJS.Workbook();
    wb.creator = "Solit POS";
    wb.created = new Date();

    const stamp = new Date().toLocaleString("id-ID", {
        day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
    const subtitle = [`Diekspor ${stamp} WIB`, filterLabel].filter(Boolean).join("  ·  ");

    // ══════════════════════════════════════════════════════════════
    // SHEET 1 — Data Laptop (1 baris = 1 model, mengikuti tabel web)
    // ══════════════════════════════════════════════════════════════
    const ws1 = wb.addWorksheet("Data Laptop", {
        pageSetup: { fitToPage: true, fitToWidth: 1, orientation: "landscape" },
    });

   const cols1: Partial<ExcelJS.Column>[] = [
        { header: "No", key: "no", width: 5 },
        { header: "Nama Laptop", key: "nama", width: 34 },
        { header: "CPU", key: "cpu", width: 22 },
        { header: "RAM", key: "ram", width: 9 },
        { header: "Storage", key: "storage", width: 14 },
        ...(canSeePrivate ? [{ header: "Harga Modal", key: "modal", width: 15 }] : []),
        { header: "Harga Store", key: "jual", width: 15 },
        { header: "Harga Official", key: "official", width: 15 },
        ...(canSeePrivate ? [{ header: "Gross Profit", key: "grossProfit", width: 15 }] : []),
        ...(canSeePrivate ? [{ header: "Sumber", key: "sumber", width: 20 }] : []),
        ...(canSeePrivate ? [{ header: "Tanggal Masuk", key: "tanggal", width: 15 }] : []),
        { header: "SN", key: "sn", width: 22 },
        { header: "Stok Tersisa", key: "st", width: 11 },
        { header: "Siap Jual", key: "sj", width: 10 },
        { header: "Minus", key: "m", width: 8 },
    ];
    ws1.columns = cols1;

    // Header asli dari ws.columns ada di baris 1 — geser ke bawah blok judul.
    ws1.spliceRows(1, 0, [], [], []);
    writeTitle(ws1, "Data Laptop — Solit 03", subtitle, cols1.length);
    styleHeader(ws1, 4);
    ws1.views = [{ state: "frozen", ySplit: 4 }];
    ws1.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: cols1.length } };

    laptops.forEach((l, idx) => {
        const aktif = (l.laptop_units ?? []).filter(u => u.status !== "SOLD");
        const one = aktif.length === 1 ? aktif[0] : null;

       const modals = aktif.map(u => u.purchase_price ?? 0).filter(n => n > 0);
        const minM = modals.length ? Math.min(...modals) : 0;
        const maxM = modals.length ? Math.max(...modals) : 0;
        const sumberSet = new Set(aktif.map(u => u.source).filter(Boolean));

        // Harga Official per-unit — pola sama dgn Harga Modal di atas.
        const officials = aktif.map(u => u.official_price ?? 0).filter(n => n > 0);
        const minOf = officials.length ? Math.min(...officials) : 0;
        const maxOf = officials.length ? Math.max(...officials) : 0;

        // Gross Profit per-unit = Harga Store - Harga Sparepart - Harga Modal,
        // dihitung per-unit dulu baru diagregasi biar akurat (bukan rata-rata model).
        const grossProfits = aktif.map(u => (u.selling_price ?? 0) - (u.sparepart_cost ?? 0) - (u.purchase_price ?? 0));
        const minGp = grossProfits.length ? Math.min(...grossProfits) : 0;
        const maxGp = grossProfits.length ? Math.max(...grossProfits) : 0;

        // Kolom per-unit hanya bermakna kalau stok = 1 (sama logikanya dgn di web).
        const modalCell: string | number = one
            ? (one.purchase_price ?? 0)
            : modals.length === 0 ? "—"
                : minM === maxM ? minM
                    : `${minM.toLocaleString("id-ID")} – ${maxM.toLocaleString("id-ID")}`;

        const officialCell: string | number = one
            ? (one.official_price ?? 0)
            : officials.length === 0 ? "—"
                : minOf === maxOf ? minOf
                    : `${minOf.toLocaleString("id-ID")} – ${maxOf.toLocaleString("id-ID")}`;

        const grossProfitCell: string | number = one
            ? ((one.selling_price ?? 0) - (one.sparepart_cost ?? 0) - (one.purchase_price ?? 0))
            : grossProfits.length === 0 ? "—"
                : minGp === maxGp ? minGp
                    : `${minGp.toLocaleString("id-ID")} – ${maxGp.toLocaleString("id-ID")}`;

      const row = ws1.addRow({
            no: idx + 1,
            nama: l.laptop_name || "",
            cpu: l.cpu || "",
            ram: l.ram || "",
            storage: l.storage || "",
            ...(canSeePrivate ? { modal: modalCell } : {}),
            jual: l.selling_price || 0,
            official: officialCell,
            ...(canSeePrivate ? { grossProfit: grossProfitCell } : {}),
            ...(canSeePrivate ? {
                sumber: one ? (one.source || "—")
                    : sumberSet.size === 0 ? "—"
                        : sumberSet.size === 1 ? String([...sumberSet][0])
                            : `${sumberSet.size} sumber`,
            } : {}),
            ...(canSeePrivate ? {
                tanggal: one?.created_at ? new Date(one.created_at) : (aktif.length > 1 ? "beragam" : "—"),
            } : {}),
            sn: one ? one.serial_number : (aktif.length > 1 ? `${aktif.length} SN` : "—"),
            st: l.stok_tersedia ?? 0,
            sj: l.siap_jual ?? 0,
            m: l.stok_minus ?? 0,
        });

        row.height = 20;
        const bg = idx % 2 === 0 ? C.rowEven : C.rowOdd;

        row.eachCell((cell, colNum) => {
            const key = ws1.getColumn(colNum).key as string;
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
            cell.border = { top: hair, left: hair, bottom: hair, right: hair };
            cell.font = { size: 10, name: "Calibri" };
            cell.alignment = { vertical: "middle" };

            if (key === "no") {
                cell.alignment = { horizontal: "center", vertical: "middle" };
                cell.font = { size: 10, name: "Calibri", color: { argb: C.subFg } };
            } else if (key === "nama") {
                cell.font = { size: 10, name: "Calibri", bold: true };
            } else if (key === "modal") {
                cell.alignment = { horizontal: "right", vertical: "middle" };
                if (typeof cell.value === "number") cell.numFmt = RP;
                else cell.font = { size: 9, name: "Calibri", italic: true, color: { argb: C.subFg } };
           } else if (key === "jual") {
                cell.numFmt = RP;
                cell.alignment = { horizontal: "right", vertical: "middle" };
                cell.font = { size: 10, name: "Calibri", bold: true, color: { argb: C.moneyFg } };
            } else if (key === "official") {
                cell.alignment = { horizontal: "right", vertical: "middle" };
                if (typeof cell.value === "number") cell.numFmt = RP;
                else cell.font = { size: 9, name: "Calibri", italic: true, color: { argb: C.subFg } };
            } else if (key === "grossProfit") {
                cell.alignment = { horizontal: "right", vertical: "middle" };
                if (typeof cell.value === "number") {
                    cell.numFmt = RP;
                    const val = Number(cell.value);
                    cell.font = { size: 10, name: "Calibri", bold: true, color: { argb: val >= 0 ? C.siapFg : C.minusFg } };
                } else {
                    cell.font = { size: 9, name: "Calibri", italic: true, color: { argb: C.subFg } };
                }
            } else if (key === "tanggal") {
            } else if (key === "tanggal") {
                cell.alignment = { horizontal: "center", vertical: "middle" };
                if (cell.value instanceof Date) cell.numFmt = "dd mmm yyyy";
                else cell.font = { size: 9, name: "Calibri", italic: true, color: { argb: C.subFg } };
            } else if (key === "sn") {
                cell.alignment = { horizontal: "left", vertical: "middle" };
                cell.font = { size: 9, name: "Consolas" };
            } else if (key === "st") {
                cell.alignment = { horizontal: "center", vertical: "middle" };
                cell.font = { size: 10, name: "Calibri", bold: true };
            } else if (key === "sj") {
                cell.alignment = { horizontal: "center", vertical: "middle" };
                if ((l.siap_jual ?? 0) > 0) {
                    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.siapBg } };
                    cell.font = { size: 10, name: "Calibri", bold: true, color: { argb: C.siapFg } };
                }
            } else if (key === "m") {
                cell.alignment = { horizontal: "center", vertical: "middle" };
                if ((l.stok_minus ?? 0) > 0) {
                    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.minusBg } };
                    cell.font = { size: 10, name: "Calibri", bold: true, color: { argb: C.minusFg } };
                }
            } else if (["cpu", "ram", "storage", "sumber"].includes(key)) {
                cell.alignment = { horizontal: "left", vertical: "middle" };
            }
        });
    });

    // Baris TOTAL
   const totalGrossProfit = laptops.reduce((sum, l) => {
        const aktif = (l.laptop_units ?? []).filter(u => u.status !== "SOLD");
        return sum + aktif.reduce((s, u) => s + ((u.selling_price ?? 0) - (u.sparepart_cost ?? 0) - (u.purchase_price ?? 0)), 0);
    }, 0);

    const totalRow = ws1.addRow({
        nama: "TOTAL",
        jual: laptops.reduce((s, l) => s + (l.selling_price || 0), 0),
        ...(canSeePrivate ? { grossProfit: totalGrossProfit } : {}),
        st: laptops.reduce((s, l) => s + (l.stok_tersedia ?? 0), 0),
        sj: laptops.reduce((s, l) => s + (l.siap_jual ?? 0), 0),
        m: laptops.reduce((s, l) => s + (l.stok_minus ?? 0), 0),
    });
    totalRow.height = 22;
    totalRow.eachCell(cell => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.soldBg } };
        cell.font = { size: 10, name: "Calibri", bold: true };
        cell.border = { top: thin, left: hair, bottom: thin, right: hair };
        cell.alignment = { vertical: "middle" };
    });
    const jualCol = ws1.columns.findIndex(c => c.key === "jual") + 1;
    if (jualCol > 0) {
        totalRow.getCell(jualCol).numFmt = RP;
        totalRow.getCell(jualCol).alignment = { horizontal: "right", vertical: "middle" };
    }
    const gpCol = ws1.columns.findIndex(c => c.key === "grossProfit") + 1;
    if (gpCol > 0) {
        totalRow.getCell(gpCol).numFmt = RP;
        totalRow.getCell(gpCol).alignment = { horizontal: "right", vertical: "middle" };
        totalRow.getCell(gpCol).font = { size: 10, name: "Calibri", bold: true, color: { argb: totalGrossProfit >= 0 ? C.siapFg : C.minusFg } };
    }

    // ══════════════════════════════════════════════════════════════
    // SHEET 2 — Detail Unit (1 baris = 1 unit fisik)
    // ══════════════════════════════════════════════════════════════
    const ws2 = wb.addWorksheet("Detail Unit", {
        pageSetup: { fitToPage: true, fitToWidth: 1, orientation: "landscape" },
    });

   const cols2: Partial<ExcelJS.Column>[] = [
        { header: "No", key: "no", width: 5 },
        { header: "Nama Laptop", key: "nama", width: 32 },
        { header: "Brand", key: "brand", width: 12 },
        { header: "CPU", key: "cpu", width: 22 },
        { header: "RAM", key: "ram", width: 9 },
        { header: "Storage", key: "storage", width: 14 },
        { header: "Serial Number", key: "sn", width: 24 },
        { header: "Grade", key: "grade", width: 8 },
        { header: "Kondisi", key: "kondisi", width: 28 },
        ...(canSeePrivate ? [{ header: "Sumber", key: "sumber", width: 20 }] : []),
        ...(canSeePrivate ? [{ header: "Tanggal Masuk", key: "tanggal", width: 15 }] : []),
        ...(canSeePrivate ? [{ header: "Harga Modal", key: "modal", width: 15 }] : []),
        ...(canSeePrivate ? [{ header: "Sparepart", key: "sparepart", width: 13 }] : []),
        { header: "Harga Store", key: "jual", width: 15 },
        { header: "Harga Official", key: "official", width: 15 },
        ...(canSeePrivate ? [{ header: "Gross Profit", key: "margin", width: 15 }] : []),
        { header: "Status", key: "status", width: 14 },
        { header: "Catatan", key: "catatan", width: 26 },
    ];
    ws2.columns = cols2;

    ws2.spliceRows(1, 0, [], [], []);
    writeTitle(ws2, "Detail Unit per Serial Number", subtitle, cols2.length);
    styleHeader(ws2, 4);
    ws2.views = [{ state: "frozen", ySplit: 4 }];
    ws2.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: cols2.length } };

   let n = 0;
    laptops.forEach(l => {
        (l.laptop_units ?? []).forEach(u => {
            n++;
            const modal = u.purchase_price ?? 0;
            const sparepart = u.sparepart_cost ?? 0;
            const jual = u.selling_price ?? 0;
            const official = u.official_price ?? 0;

            const row = ws2.addRow({
                no: n,
                nama: l.laptop_name || "",
                brand: l.brand || "",
                cpu: l.cpu || "",
                ram: l.ram || "",
                storage: l.storage || "",
                sn: u.serial_number || "",
                grade: u.grade ? `Grade ${u.grade}` : "—",
                kondisi: u.condition_note || "—",
                ...(canSeePrivate ? { sumber: u.source || "—" } : {}),
                ...(canSeePrivate ? { tanggal: u.created_at ? new Date(u.created_at) : "—" } : {}),
                ...(canSeePrivate ? { modal } : {}),
                ...(canSeePrivate ? { sparepart } : {}),
                jual,
                official,
                ...(canSeePrivate ? { margin: jual - modal - sparepart } : {}),
                status: STATUS_LABEL[u.status] ?? u.status,
                catatan: u.notes || "—",
            });

            row.height = 20;
            const bg = n % 2 === 0 ? C.rowEven : C.rowOdd;

            row.eachCell((cell, colNum) => {
                const key = ws2.getColumn(colNum).key as string;
                cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
                cell.border = { top: hair, left: hair, bottom: hair, right: hair };
                cell.font = { size: 10, name: "Calibri" };
                cell.alignment = { vertical: "middle" };

                if (key === "no") {
                    cell.alignment = { horizontal: "center", vertical: "middle" };
                    cell.font = { size: 10, name: "Calibri", color: { argb: C.subFg } };
                } else if (key === "nama") {
                    cell.font = { size: 10, name: "Calibri", bold: true };
                } else if (key === "sn") {
                    cell.font = { size: 9, name: "Consolas" };
                } else if (key === "grade") {
                    cell.alignment = { horizontal: "center", vertical: "middle" };
                } else if (key === "kondisi" || key === "catatan") {
                    cell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
                    cell.font = { size: 9, name: "Calibri", color: { argb: C.subFg } };
                } else if (key === "tanggal") {
                    cell.alignment = { horizontal: "center", vertical: "middle" };
                    if (cell.value instanceof Date) cell.numFmt = "dd mmm yyyy";
              } else if (["modal", "sparepart", "jual", "official"].includes(key)) {
                    cell.numFmt = RP;
                    cell.alignment = { horizontal: "right", vertical: "middle" };
                    if (key === "jual") cell.font = { size: 10, name: "Calibri", bold: true };
                } else if (key === "margin") {
                    cell.numFmt = RP;
                    cell.alignment = { horizontal: "right", vertical: "middle" };
                    const val = Number(cell.value ?? 0);
                    cell.font = {
                        size: 10, name: "Calibri", bold: true,
                        color: { argb: val >= 0 ? C.siapFg : C.minusFg },
                    };
                } else if (key === "status") {
                    cell.alignment = { horizontal: "center", vertical: "middle" };
                    const s = statusFill(u.status);
                    if (s) {
                        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: s.bg } };
                        cell.font = { size: 9, name: "Calibri", bold: true, color: { argb: s.fg } };
                    }
                }
            });
        });
    });

    if (n === 0) {
        const empty = ws2.addRow({ nama: "Tidak ada unit terdaftar pada data yang difilter." });
        empty.getCell(2).font = { size: 10, name: "Calibri", italic: true, color: { argb: C.subFg } };
    }

    // ── Download ───────────────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `data_barang${fileSuffix}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}