"use client";
// src/app/dashboard/cashflow/page.tsx

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { CASHFLOW_ROLES } from "@/lib/permissions";
import type ExcelJS from "exceljs";
import {
    INCOME_CATEGORIES,
    EXPENSE_CATEGORIES,
    AUTO_INCOME_CATEGORIES,
    categoryLabel,
    type CashflowFilter,
    type AuditFilter,
    type SourceFilter,
    defaultCashflowFilter,
    isFilterActive,
    activeFilterCount,
    applyFilters,
    CASHFLOW_START_DATE,
} from "@/lib/cashflow";

const fmtRupiah = (n: number) => `Rp${Number(n || 0).toLocaleString("id-ID")}`;

const fmtTanggal = (d?: string) =>
    d ? new Date(d + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const fmtTanggalShort = (d?: string) =>
    d ? new Date(d + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short" }) : "—";

const compareEntries = (a: Entry, b: Entry): number => {
    if (a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? 1 : -1;
    const ca = a.created_at ?? "";
    const cb = b.created_at ?? "";
    if (ca !== cb) return ca < cb ? 1 : -1;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
};

const sortEntries = (list: Entry[]): Entry[] => [...list].sort(compareEntries);

// ── Types ─────────────────────────────────────────────────────────────────────
type Entry = {
    id: string;
    direction: "IN" | "OUT";
    category: string;
    nama: string;
    nominal: number;
    modal: number | null;
    keterangan: string | null;
    source_type: "MANUAL" | "TRANSACTION" | "SERVICE" | "MODAL_AWAL";
    source_id: string | null;
    tanggal: string;
    payment_method: "CASH" | "SALDO" | null;
    photo_url: string | null;
    is_audited: boolean;
    audited_at: string | null;
    created_at?: string;
    is_voided?: boolean;
    is_stale?: boolean;
    source_nominal?: number | null;
    created_by_user?: { name: string } | null;
    audited_by_user?: { name: string } | null;
};

type Summary = {
    total_masuk: number;
    total_keluar: number;
    saldo: number;
    belum_audit: number;
    stale?: number;
    modal_awal_entry: Entry | null;
};

// ── Icons ────────────────────────────────────────────────────────────────────
const IconRefresh = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
    </svg>
);
const IconPlus = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
);
const IconEdit = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
);
const IconTrash = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
);
const IconCheck = () => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
    </svg>
);
const IconClock = () => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><polyline points="12 7 12 12 15 14" />
    </svg>
);
const IconFilter = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
);
const IconSearch = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
);
const IconX = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
);
const IconExternal = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
    </svg>
);
const IconEye = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    </svg>
);
const IconChevronLeft = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="15 18 9 12 15 6" />
    </svg>
);
const IconChevronRight = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 6 15 12 9 18" />
    </svg>
);
const IconChevronsLeft = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="11 17 6 12 11 7" /><polyline points="18 17 13 12 18 7" />
    </svg>
);
const IconChevronsRight = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="13 17 18 12 13 7" /><polyline points="6 17 11 12 6 7" />
    </svg>
);
const IconInfo = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="shrink-0">
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
);
const IconTrendUp = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
    </svg>
);
const IconTrendDown = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /><polyline points="17 18 23 18 23 12" />
    </svg>
);
const IconWallet = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 12V22H4a2 2 0 01-2-2V6a2 2 0 012-2h16v4" /><path d="M22 12a2 2 0 01-2 2h-2a2 2 0 010-4h2a2 2 0 012 2z" />
    </svg>
);
const IconAlertTriangle = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
);
const IconDownload = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
);

// ── Export Excel ──────────────────────────────────────────────────────────────
async function exportCashflowExcel(masuk: Entry[], keluar: Entry[]) {
    const ExcelJS = await import("exceljs");

    const fmtDateExcel = (d?: string) =>
        d ? new Date(d + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—";
    const sourceLabel = (s: Entry["source_type"]) =>
        ({ TRANSACTION: "Transaksi", SERVICE: "Service", MODAL_AWAL: "Modal Awal", MANUAL: "Manual" }[s] ?? s);
    const methodLabel = (m: Entry["payment_method"]) =>
        m === "CASH" ? "Cash" : m === "SALDO" ? "Saldo" : "—";
    const auditLabel = (e: Entry) =>
        e.is_audited ? `Sudah Audit${e.audited_by_user?.name ? ` (${e.audited_by_user.name})` : ""}` : "Belum Audit";

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

    const borderThin: Partial<ExcelJS.Borders> = {
        top: { style: "thin", color: { argb: "FFD1D5DB" } },
        left: { style: "thin", color: { argb: "FFD1D5DB" } },
        bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
        right: { style: "thin", color: { argb: "FFD1D5DB" } },
    };
    const applyBorder = (cell: ExcelJS.Cell) => { cell.border = borderThin; };
    const applyHeaderStyle = (cell: ExcelJS.Cell, bgArgb: string) => {
        cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" }, name: "Arial" };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgArgb } };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: false };
        cell.border = {
            top: { style: "medium", color: { argb: "FF1F2937" } },
            left: { style: "thin", color: { argb: "FF374151" } },
            bottom: { style: "medium", color: { argb: "FF1F2937" } },
            right: { style: "thin", color: { argb: "FF374151" } },
        };
    };
    const applyDataCell = (cell: ExcelJS.Cell, rowIdx: number, isNumber = false) => {
        const isEven = rowIdx % 2 === 0;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isEven ? "FFF9FAFB" : "FFFFFFFF" } };
        cell.font = { size: 9.5, name: "Arial" };
        cell.alignment = { vertical: "middle", horizontal: isNumber ? "right" : "left", wrapText: false };
        applyBorder(cell);
    };
    const applyTotalStyle = (cell: ExcelJS.Cell, isNumber = false) => {
        cell.font = { bold: true, size: 10, name: "Arial", color: { argb: "FF1F2937" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
        cell.alignment = { vertical: "middle", horizontal: isNumber ? "right" : "center" };
        cell.border = {
            top: { style: "medium", color: { argb: "FF374151" } },
            left: { style: "thin", color: { argb: "FFD1D5DB" } },
            bottom: { style: "medium", color: { argb: "FF374151" } },
            right: { style: "thin", color: { argb: "FFD1D5DB" } },
        };
    };

    const buildSheet = (wb: ExcelJS.Workbook, sheetName: string, direction: "IN" | "OUT", entries: Entry[]) => {
        const ws = wb.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 4 }] });
        const isMasuk = direction === "IN";
        type ColDef = { header: string; key: string; width: number; numFmt?: string };
        const masukCols: ColDef[] = [
            { header: "No", key: "no", width: 5 },
            { header: "Tanggal", key: "tanggal", width: 14 },
            { header: "Sumber", key: "sumber", width: 13 },
            { header: "Nama / Customer", key: "nama", width: 26 },
            { header: "Kategori", key: "kategori", width: 22 },
            { header: "Nominal (Rp)", key: "nominal", width: 20, numFmt: "#,##0" },
            { header: "Keterangan", key: "ket", width: 55 },
            { header: "Status Audit", key: "audit", width: 26 },
        ];
        const keluarCols: ColDef[] = [
            { header: "No", key: "no", width: 5 },
            { header: "Tanggal", key: "tanggal", width: 14 },
            { header: "Sumber", key: "sumber", width: 13 },
            { header: "Pengisi", key: "nama", width: 22 },
            { header: "Kategori", key: "kategori", width: 22 },
            { header: "Metode Bayar", key: "metode", width: 14 },
            { header: "Nominal (Rp)", key: "nominal", width: 20, numFmt: "#,##0" },
            { header: "Keterangan", key: "ket", width: 55 },
            { header: "Status Audit", key: "audit", width: 26 },
        ];
        const cols = isMasuk ? masukCols : keluarCols;
        const totalCols = cols.length;
        const nominalColIdx = cols.findIndex((c) => c.key === "nominal") + 1;
        ws.columns = cols.map((c) => ({ width: c.width }));

        const titleColor = isMasuk ? "FF059669" : "FFDC2626";
        const titleRow = ws.addRow([`CASHFLOW SOLIT03 — ${isMasuk ? "UANG MASUK" : "UANG KELUAR"}`]);
        ws.mergeCells(1, 1, 1, totalCols);
        const titleCell = titleRow.getCell(1);
        titleCell.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" }, name: "Arial" };
        titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: titleColor } };
        titleCell.alignment = { vertical: "middle", horizontal: "center" };
        titleRow.height = 28;

        const infoRow = ws.addRow([]);
        ws.mergeCells(2, 1, 2, totalCols);
        const infoCell = infoRow.getCell(1);
        infoCell.font = { size: 9, italic: true, color: { argb: "FF6B7280" }, name: "Arial" };
        infoCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
        infoCell.alignment = { vertical: "middle", horizontal: "center" };
        infoRow.height = 16;

        const spacerRow = ws.addRow([""]);
        ws.mergeCells(3, 1, 3, totalCols);
        spacerRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
        spacerRow.height = 6;

        const headerBg = isMasuk ? "FF065F46" : "FF991B1B";
        const headerRow = ws.addRow(cols.map((c) => c.header));
        headerRow.height = 22;
        headerRow.eachCell((cell) => applyHeaderStyle(cell, headerBg));

        if (entries.length === 0) {
            const emptyRow = ws.addRow(["Belum ada data"]);
            ws.mergeCells(5, 1, 5, totalCols);
            const ec = emptyRow.getCell(1);
            ec.font = { italic: true, color: { argb: "FF9CA3AF" }, name: "Arial" };
            ec.alignment = { horizontal: "center", vertical: "middle" };
            ec.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
            applyBorder(ec);
            emptyRow.height = 20;
        } else {
            entries.forEach((e, i) => {
                const rowValues = isMasuk
                    ? [i + 1, fmtDateExcel(e.tanggal), sourceLabel(e.source_type),
                    e.source_type === "MANUAL" || e.source_type === "MODAL_AWAL" ? (e.created_by_user?.name ?? e.nama) : e.nama,
                    e.source_type === "MODAL_AWAL" ? "Modal Awal" : categoryLabel("IN", e.category),
                    Number(e.nominal || 0), e.keterangan ?? "", auditLabel(e)]
                    : [i + 1, fmtDateExcel(e.tanggal), sourceLabel(e.source_type),
                    e.created_by_user?.name ?? e.nama, categoryLabel("OUT", e.category),
                    methodLabel(e.payment_method), Number(e.nominal || 0), e.keterangan ?? "", auditLabel(e)];

                const row = ws.addRow(rowValues);
                row.height = 18;
                row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                    const isNum = colNumber === nominalColIdx;
                    applyDataCell(cell, i, isNum);
                    if (isNum && cols[colNumber - 1]?.numFmt) cell.numFmt = cols[colNumber - 1].numFmt!;
                });
                const auditColIdx = cols.findIndex((c) => c.key === "audit") + 1;
                const auditCell = row.getCell(auditColIdx);
                auditCell.font = { bold: e.is_audited, size: 9.5, name: "Arial", color: { argb: e.is_audited ? "FF065F46" : "FFB45309" } };
            });

            const totalRow = ws.addRow([]);
            totalRow.height = 22;
            for (let c = 1; c <= totalCols; c++) {
                const cell = totalRow.getCell(c);
                const isNum = c === nominalColIdx;
                applyTotalStyle(cell, isNum);
                if (c === nominalColIdx - 1) { cell.value = "TOTAL"; }
                else if (isNum) {
                    const colLetter = ws.getColumn(nominalColIdx).letter;
                    cell.value = { formula: `SUM(${colLetter}5:${colLetter}${4 + entries.length})` };
                    cell.numFmt = "#,##0";
                } else { cell.value = ""; }
            }
        }

        ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: totalCols } };
        ws.pageSetup = { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "4:4" };
    };

    const wb = new ExcelJS.Workbook();
    wb.creator = "Solit POS";
    wb.created = new Date();
    wb.modified = new Date();
    buildSheet(wb, "Uang Masuk", "IN", masuk);
    buildSheet(wb, "Uang Keluar", "OUT", keluar);

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Cashflow_Solit_${today}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
}

// ── Source Badge ──────────────────────────────────────────────────────────────
function SourceBadge({ sourceType }: { sourceType: Entry["source_type"] }) {
    if (sourceType === "TRANSACTION") return (
        <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100 whitespace-nowrap">🛒 TRX</span>
    );
    if (sourceType === "SERVICE") return (
        <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 border border-orange-100 whitespace-nowrap">🔧 SVC</span>
    );
    if (sourceType === "MODAL_AWAL") return (
        <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 border border-violet-100 whitespace-nowrap">💰 MODAL</span>
    );
    return (
        <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200 whitespace-nowrap">✏️ MANUAL</span>
    );
}

// ── Audit Cell ────────────────────────────────────────────────────────────────
function AuditCell({ entry, onAudit, busy }: { entry: Entry; onAudit: () => void; busy: boolean }) {
    if (entry.is_voided) return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed whitespace-nowrap"
            title="Transaksi sumber sudah di-restore/dibatalkan — tidak bisa diaudit">
            🚫 Dibatalkan
        </span>
    );
    if (entry.is_audited) return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default whitespace-nowrap"
            title={entry.audited_by_user?.name ? `Diaudit oleh ${entry.audited_by_user.name}` : "Sudah diaudit"}>
            <IconCheck /> Sudah Audit
        </span>
    );
    return (
        <button onClick={(ev) => { ev.stopPropagation(); onAudit(); }} disabled={busy}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold border transition disabled:opacity-50 bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 whitespace-nowrap"
            title="Klik untuk audit (tidak bisa dibatalkan)">
            <IconClock /> {busy ? "..." : "Belum Audit"}
        </button>
    );
}

// ── Modal Awal Modal ──────────────────────────────────────────────────────────
function ModalAwalModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
    const [nominal, setNominal] = useState("");
    const [keterangan, setKeterangan] = useState("");
    const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [confirmed, setConfirmed] = useState(false);

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    const submit = async () => {
        if (!confirmed) return setError("Centang pernyataan di bawah untuk melanjutkan");
        if (!nominal || Number(nominal) <= 0) return setError("Nominal harus lebih dari 0");
        setSaving(true); setError("");
        try {
            const res = await fetch("/api/cashflow", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ direction: "IN", category: "MODAL_AWAL", nominal: Number(nominal), keterangan: keterangan.trim() || null, tanggal }),
            });
            const json = await res.json();
            if (!json.success) return setError(json.message || "Gagal menyimpan");
            onSaved(); onClose();
        } catch { setError("Terjadi kesalahan koneksi"); }
        finally { setSaving(false); }
    };

    const inputCls = "w-full h-10 border border-gray-200 rounded-lg px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-400 transition";

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <div className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-md rounded-2xl shadow-2xl overflow-hidden border border-gray-100">
                <div className="h-1 bg-gradient-to-r from-violet-500 to-violet-700" />
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center text-base">💰</div>
                        <div>
                            <p className="text-sm font-bold text-gray-900">Atur Modal Awal</p>
                            <p className="text-[11px] text-amber-600 font-semibold">⚠️ Hanya bisa diisi satu kali</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-7 h-7 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center transition"><IconX /></button>
                </div>
                <div className="p-5 space-y-3.5">
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-700 space-y-1.5">
                        <p className="font-bold text-amber-800">⚠️ Baca sebelum mengisi:</p>
                        <ul className="space-y-1">
                            <li className="flex items-start gap-1.5"><span className="shrink-0 mt-0.5">•</span>Modal awal <strong>tidak dapat diubah atau dihapus</strong> setelah disimpan</li>
                            <li className="flex items-start gap-1.5"><span className="shrink-0 mt-0.5">•</span>Akun Anda akan tercatat sebagai yang mengisi</li>
                            <li className="flex items-start gap-1.5"><span className="shrink-0 mt-0.5">•</span>Periode input aktif sampai <strong>09 Jul 2026</strong></li>
                        </ul>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Nominal Modal Awal <span className="text-red-500">*</span></label>
                        <input type="number" value={nominal} onChange={(e) => setNominal(e.target.value)} placeholder="0" className={`${inputCls} font-mono`} autoFocus />
                        {nominal && Number(nominal) > 0 && <p className="text-[11px] text-violet-600 mt-1 font-mono font-semibold">{fmtRupiah(Number(nominal))}</p>}
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Tanggal</label>
                        <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Keterangan <span className="text-gray-400 font-normal">(opsional)</span></label>
                        <textarea value={keterangan} onChange={(e) => setKeterangan(e.target.value)} rows={2} placeholder="Sumber modal awal, catatan, dll..." className={`${inputCls.replace("h-10", "")} py-2 resize-none`} />
                    </div>
                    <label className="flex items-start gap-2.5 cursor-pointer p-3 rounded-lg bg-gray-50 border border-gray-200 hover:bg-gray-100 transition">
                        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 accent-violet-600 shrink-0" />
                        <span className="text-xs text-gray-700">Saya mengerti bahwa modal awal ini <strong className="text-gray-900">tidak dapat diubah atau dihapus</strong> setelah disimpan.</span>
                    </label>
                    {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">{error}</div>}
                </div>
                <div className="px-5 py-4 border-t border-gray-100 flex gap-3 bg-gray-50/60">
                    <button onClick={onClose} className="flex-1 h-10 bg-white border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition">Batal</button>
                    <button onClick={submit} disabled={saving || !confirmed} className="flex-1 h-10 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 transition disabled:opacity-60">
                        {saving ? "Menyimpan..." : "Simpan Modal Awal"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Modal Awal Banner ─────────────────────────────────────────────────────────
function ModalAwalBanner({ entry, onSet, isWindowActive }: { entry: Entry | null; onSet: () => void; isWindowActive: boolean }) {
    if (entry) return (
        <div className="border-t border-violet-100 bg-gradient-to-r from-violet-50 to-purple-50 overflow-hidden">
            <div className="h-0.5 bg-gradient-to-r from-violet-400 to-purple-500" />
            <div className="px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-100 border border-violet-200 flex items-center justify-center shrink-0 text-xl">💰</div>
                    <div>
                        <p className="text-[10px] font-bold text-violet-400 uppercase tracking-widest mb-0.5">Modal Awal Cashflow</p>
                        <p className="text-xl font-black tabular-nums text-violet-800">{fmtRupiah(entry.nominal)}</p>
                        <p className="text-[11px] text-violet-500 mt-0.5">
                            Diisi oleh <span className="font-semibold text-violet-700">{entry.created_by_user?.name ?? entry.nama}</span>
                            {entry.tanggal ? ` · ${fmtTanggal(entry.tanggal)}` : ""}
                        </p>
                    </div>
                </div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-100 text-violet-700 text-[11px] font-bold border border-violet-200 shrink-0">🔒 Terkunci</span>
            </div>
        </div>
    );
    if (!isWindowActive) return (
        <div className="border-t border-amber-200 bg-amber-50 px-5 py-3 flex items-start gap-2.5">
            <IconInfo />
            <p className="text-xs text-amber-700"><span className="font-bold">Modal awal belum diatur.</span> Periode input sudah berakhir. Saldo tidak termasuk modal awal.</p>
        </div>
    );
    return (
        <div className="border-t border-gray-100">
            <div className="h-0.5 bg-gradient-to-r from-violet-400 to-violet-600" />
            <div className="px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center shrink-0 text-xl mt-0.5">💰</div>
                    <div>
                        <p className="text-sm font-bold text-gray-900">Modal Awal Cashflow</p>
                        <p className="text-xs text-gray-500 mt-0.5">Uang yang sudah ada sebelum cashflow dimulai. <span className="font-semibold text-amber-600">Hanya bisa diisi sekali.</span></p>
                        <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1"><IconClock /> Batas waktu: <span className="font-semibold text-gray-600 ml-0.5">09 Jul 2026</span></p>
                    </div>
                </div>
                <button onClick={onSet} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 transition shadow-sm active:scale-95 shrink-0">
                    <IconPlus /> Atur Sekarang
                </button>
            </div>
        </div>
    );
}

// ── Filter Panel ──────────────────────────────────────────────────────────────
function FilterPanel({ filter, onChange, onReset, direction }: {
    filter: CashflowFilter; onChange: (f: CashflowFilter) => void; onReset: () => void; direction: "IN" | "OUT";
}) {
    const categories = direction === "IN" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    const catEntries = Object.entries(categories) as [string, string][];
    const count = activeFilterCount(filter);
    const selectCls = "h-9 border border-gray-200 rounded-lg px-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition";
    const dateCls = "h-9 border border-gray-200 rounded-lg px-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition";

    return (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <IconFilter />
                    <span className="text-sm font-bold text-gray-800">Filter</span>
                    {count > 0 && <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-900 text-white text-[10px] font-bold">{count}</span>}
                </div>
                {isFilterActive(filter) && (
                    <button onClick={onReset} className="inline-flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-red-500 transition"><IconX /> Reset</button>
                )}
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="sm:col-span-2 lg:col-span-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Cari</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-gray-400"><IconSearch /></div>
                        <input type="text" value={filter.search} onChange={(e) => onChange({ ...filter, search: e.target.value })} placeholder="Nama / keterangan…" className={`${dateCls} w-full pl-8`} />
                        {filter.search && <button onClick={() => onChange({ ...filter, search: "" })} className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-gray-300 hover:text-gray-500"><IconX /></button>}
                    </div>
                </div>
                <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Kategori</label>
                    <select value={filter.category} onChange={(e) => onChange({ ...filter, category: e.target.value })} className={`${selectCls} w-full`}>
                        <option value="ALL">Semua Kategori</option>
                        {catEntries.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                    </select>
                </div>
                <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Audit</label>
                    <select value={filter.audit} onChange={(e) => onChange({ ...filter, audit: e.target.value as AuditFilter })} className={`${selectCls} w-full`}>
                        <option value="ALL">Semua Status</option>
                        <option value="AUDITED">✅ Sudah Audit</option>
                        <option value="NOT_AUDITED">⏳ Belum Audit</option>
                    </select>
                </div>
                <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Sumber</label>
                    <select value={filter.source} onChange={(e) => onChange({ ...filter, source: e.target.value as SourceFilter })} className={`${selectCls} w-full`}>
                        <option value="ALL">Semua Sumber</option>
                        <option value="MANUAL">✏️ Manual</option>
                        <option value="AUTO">⚡ Otomatis</option>
                    </select>
                </div>
            </div>
            <div className="px-4 pb-4 -mt-1 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Dari Tanggal</label>
                    <input type="date" value={filter.dateFrom} onChange={(e) => onChange({ ...filter, dateFrom: e.target.value })} className={`${dateCls} w-full`} />
                </div>
                <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Sampai Tanggal</label>
                    <input type="date" value={filter.dateTo} onChange={(e) => onChange({ ...filter, dateTo: e.target.value })} className={`${dateCls} w-full`} />
                </div>
                <div className="col-span-2 sm:col-span-2 lg:col-span-3 flex items-end gap-1.5 flex-wrap pb-0.5">
                    {([
                        ["Hari Ini", () => { const t = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }); onChange({ ...filter, dateFrom: t, dateTo: t }); }],
                        ["Minggu Ini", () => { const now = new Date(); const d = now.getDay(); const s = new Date(now); s.setDate(now.getDate() - (d === 0 ? 6 : d - 1)); onChange({ ...filter, dateFrom: s.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }), dateTo: now.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }) }); }],
                        ["Bulan Ini", () => { const now = new Date(); const y = now.getFullYear(); const m = String(now.getMonth() + 1).padStart(2, "0"); onChange({ ...filter, dateFrom: `${y}-${m}-01`, dateTo: now.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }) }); }],
                        ["Semua", () => { onChange({ ...filter, dateFrom: "", dateTo: "" }); }],
                    ] as [string, () => void][]).map(([label, fn]) => (
                        <button key={label} onClick={fn} className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-gray-200 text-gray-500 bg-white hover:bg-gray-50 hover:border-gray-300 transition">{label}</button>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ── Photo Picker ──────────────────────────────────────────────────────────────
function PhotoPicker({ value, onChange }: { value: File | null; onChange: (f: File | null) => void }) {
    const fileRef = useRef<HTMLInputElement>(null);
    const cameraRef = useRef<HTMLInputElement>(null);
    const [preview, setPreview] = useState<string | null>(null);

    const handleFile = (f: File | null) => { onChange(f); setPreview(f ? URL.createObjectURL(f) : null); };
    const remove = () => {
        handleFile(null);
        if (fileRef.current) fileRef.current.value = "";
        if (cameraRef.current) cameraRef.current.value = "";
    };

    return (
        <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Foto Bukti <span className="text-gray-400 font-normal">(opsional)</span></label>
            {preview ? (
                <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                    <img src={preview} alt="Preview" className="w-full max-h-48 object-cover" />
                    <button type="button" onClick={remove} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md hover:bg-red-600 transition"><IconX /></button>
                    <div className="px-3 py-1.5 bg-white/90 border-t border-gray-100"><p className="text-[10px] text-gray-500 truncate">{value?.name}</p></div>
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-2">
                    {[{ ref: cameraRef, icon: "📷", label: "Kamera" }, { ref: fileRef, icon: "🖼️", label: "Galeri" }].map(({ ref, icon, label }) => (
                        <button key={label} type="button" onClick={() => (ref as React.RefObject<HTMLInputElement>).current?.click()} className="flex flex-col items-center justify-center gap-1.5 h-20 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-gray-400 hover:border-gray-300 hover:bg-gray-100 hover:text-gray-600 transition">
                            <span className="text-2xl">{icon}</span>
                            <span className="text-[11px] font-semibold">{label}</span>
                        </button>
                    ))}
                </div>
            )}
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(ev) => handleFile(ev.target.files?.[0] ?? null)} />
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(ev) => handleFile(ev.target.files?.[0] ?? null)} />
        </div>
    );
}

// ── Detail Row ────────────────────────────────────────────────────────────────
function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-start justify-between gap-3 py-2.5 border-b border-gray-50 last:border-0">
            <span className="text-xs font-semibold text-gray-400 shrink-0">{label}</span>
            <div className="text-right text-sm text-gray-800 font-medium min-w-0 break-words">{children}</div>
        </div>
    );
}

// ── Detail Modal ──────────────────────────────────────────────────────────────
function DetailModal({ entry, onClose, onDelete, onEdit }: {
    entry: Entry; onClose: () => void; onDelete: (e: Entry) => void; onEdit: (e: Entry) => void;
}) {
    const [zoom, setZoom] = useState(false);

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") { if (zoom) setZoom(false); else onClose(); } };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose, zoom]);

    const isOut = entry.direction === "OUT";
    const gradient = isOut ? "from-red-400 to-rose-500" : "from-emerald-400 to-green-500";
    const nominalColor = isOut ? "text-red-600" : "text-emerald-600";
    const pengisi = entry.created_by_user?.name ?? entry.nama;

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <div className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-md rounded-2xl shadow-2xl overflow-hidden border border-gray-100">
                <div className={`h-1 bg-gradient-to-r ${gradient}`} />
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-base ${isOut ? "bg-red-50" : "bg-emerald-50"}`}>{isOut ? "💸" : "💰"}</div>
                        <div>
                            <p className="text-sm font-bold text-gray-900">Detail {isOut ? "Uang Keluar" : "Uang Masuk"}</p>
                            <p className="text-[11px] text-gray-400">{fmtTanggal(entry.tanggal)}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-7 h-7 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center transition"><IconX /></button>
                </div>
                <div className="p-5 space-y-1 max-h-[75vh] overflow-y-auto">
                    <div className="text-center py-3 mb-1">
                        <p className={`text-3xl font-black tabular-nums ${nominalColor}`}>{isOut ? "−" : "+"}{fmtRupiah(entry.nominal)}</p>
                    </div>
                    <DetailRow label="Kategori">
                        <span className="inline-flex text-[11px] font-medium px-2 py-0.5 rounded-md bg-gray-100 text-gray-700">{categoryLabel(entry.direction, entry.category)}</span>
                    </DetailRow>
                    {isOut && entry.source_type === "MANUAL" && (
                        <DetailRow label="Metode">
                            {entry.payment_method === "SALDO"
                                ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">🏦 Saldo</span>
                                : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-green-50 text-green-700 border border-green-100">💵 Cash</span>}
                        </DetailRow>
                    )}
                    <DetailRow label="Diinput oleh">{pengisi}</DetailRow>
                    <DetailRow label="Status Audit">
                        {entry.is_audited
                            ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"><IconCheck /> Sudah Audit</span>
                            : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200"><IconClock /> Belum Audit</span>}
                    </DetailRow>
                    {entry.is_audited && entry.audited_by_user?.name && (
                        <DetailRow label="Diaudit oleh"><span className="text-emerald-600 font-semibold">✓ {entry.audited_by_user.name}</span></DetailRow>
                    )}
                    <div className="pt-3">
                        <p className="text-xs font-semibold text-gray-400 mb-1.5">Keterangan</p>
                        <div className="text-sm text-gray-700 whitespace-pre-wrap break-words bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-3 min-h-[44px] leading-relaxed">
                            {entry.keterangan?.trim() || <span className="text-gray-300 italic">Tidak ada keterangan</span>}
                        </div>
                    </div>
                    {entry.photo_url && (
                        <div className="pt-3">
                            <p className="text-xs font-semibold text-gray-400 mb-1.5">Foto Bukti</p>
                            <button type="button" onClick={() => setZoom(true)} className="block w-full rounded-xl overflow-hidden border border-gray-200 bg-gray-50 group" title="Ketuk untuk perbesar">
                                <img src={entry.photo_url} alt="Bukti" className="w-full max-h-72 object-contain bg-gray-900/5 group-hover:opacity-90 transition" />
                            </button>
                            <p className="text-[10px] text-gray-400 mt-1 text-center">Ketuk gambar untuk memperbesar</p>
                        </div>
                    )}
                </div>
                <div className="px-5 py-4 border-t border-gray-100 flex gap-3 bg-gray-50/60">
                    {entry.source_type === "MANUAL" && entry.direction === "OUT" && (
                        <button onClick={() => { onClose(); onEdit(entry); }} className="inline-flex items-center gap-1.5 h-10 px-4 bg-white border border-amber-200 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-50 transition">
                            <IconEdit /> Edit
                        </button>
                    )}
                    {entry.source_type === "MANUAL" && entry.direction === "IN" && (
                        <button onClick={() => { onClose(); onDelete(entry); }} className="inline-flex items-center gap-1.5 h-10 px-4 bg-white border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition">
                            <IconTrash /> Hapus
                        </button>
                    )}
                    <button onClick={onClose} className="flex-1 h-10 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">Tutup</button>
                </div>
            </div>
            {zoom && entry.photo_url && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4" onClick={() => setZoom(false)}>
                    <img src={entry.photo_url} alt="Bukti" className="max-w-full max-h-full object-contain" />
                    <button onClick={() => setZoom(false)} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition"><IconX /></button>
                </div>
            )}
        </div>
    );
}

// ── Expense Modal ─────────────────────────────────────────────────────────────
function ExpenseModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
    const categories = Object.entries(EXPENSE_CATEGORIES);
    const [category, setCategory] = useState(categories[0]?.[0] ?? "");
    const [nominal, setNominal] = useState("");
    const [keterangan, setKeterangan] = useState("");
    const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10));
    const [paymentMethod, setPaymentMethod] = useState<"CASH" | "SALDO">("CASH");
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [saving, setSaving] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<"idle" | "uploading" | "done">("idle");
    const [error, setError] = useState("");

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    const submit = async () => {
        if (!nominal || Number(nominal) <= 0) return setError("Nominal harus lebih dari 0");
        setSaving(true); setError("");
        try {
            let photoUrl: string | null = null;
            if (photoFile) {
                setUploadProgress("uploading");
                const fd = new FormData();
                fd.append("file", photoFile);
                const upRes = await fetch("/api/cashflow/upload", { method: "POST", body: fd });
                const upJson = await upRes.json();
                if (!upJson.success) { setError(upJson.message || "Gagal upload foto"); setSaving(false); setUploadProgress("idle"); return; }
                photoUrl = upJson.url;
                setUploadProgress("done");
            }
            const res = await fetch("/api/cashflow", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ direction: "OUT", category, nominal: Number(nominal), keterangan: keterangan.trim() || null, tanggal, payment_method: paymentMethod, photo_url: photoUrl }),
            });
            const json = await res.json();
            if (!json.success) return setError(json.message || "Gagal menyimpan");
            onSaved(); onClose();
        } catch { setError("Terjadi kesalahan koneksi"); }
        finally { setSaving(false); setUploadProgress("idle"); }
    };

    const inputCls = "w-full h-10 border border-gray-200 rounded-lg px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition";
    const savingLabel = uploadProgress === "uploading" ? "Mengupload foto..." : saving ? "Menyimpan..." : "Simpan Pengeluaran";

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <div className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-md rounded-2xl shadow-2xl overflow-hidden border border-gray-100">
                <div className="h-1 bg-gradient-to-r from-red-400 to-rose-500" />
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center text-base">💸</div>
                        <div>
                            <p className="text-sm font-bold text-gray-900">Tambah Uang Keluar</p>
                            <p className="text-[11px] text-gray-400">Nama pengisi tercatat otomatis</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-7 h-7 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center transition"><IconX /></button>
                </div>
                <div className="p-5 space-y-3.5 max-h-[75vh] overflow-y-auto">
                    <div>
                        <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Metode Pembayaran <span className="text-red-500">*</span></label>
                        <div className="inline-flex w-full rounded-xl border border-gray-200 bg-gray-50 p-1 gap-1">
                            {(["CASH", "SALDO"] as const).map((m) => (
                                <button key={m} type="button" onClick={() => setPaymentMethod(m)} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition ${paymentMethod === m ? "bg-white text-gray-900 shadow-sm border border-gray-200" : "text-gray-400 hover:text-gray-600"}`}>
                                    <span>{m === "CASH" ? "💵" : "🏦"}</span> {m === "CASH" ? "Cash" : "Saldo"}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Kategori</label>
                        <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
                            {categories.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Nominal <span className="text-red-500">*</span></label>
                            <input type="number" value={nominal} onChange={(e) => setNominal(e.target.value)} placeholder="0" className={`${inputCls} font-mono`} autoFocus />
                            {nominal && Number(nominal) > 0 && <p className="text-[11px] text-gray-400 mt-1 font-mono">{fmtRupiah(Number(nominal))}</p>}
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Tanggal</label>
                            <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className={inputCls} />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Keterangan</label>
                        <textarea value={keterangan} onChange={(e) => setKeterangan(e.target.value)} rows={2} placeholder="Catatan tambahan..." className={`${inputCls.replace("h-10", "")} py-2 resize-none`} />
                    </div>
                    <PhotoPicker value={photoFile} onChange={setPhotoFile} />
                    {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">{error}</div>}
                </div>
                <div className="px-5 py-4 border-t border-gray-100 flex gap-3 bg-gray-50/60">
                    <button onClick={onClose} disabled={saving} className="flex-1 h-10 bg-white border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50">Batal</button>
                    <button onClick={submit} disabled={saving} className="flex-1 h-10 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-60">{savingLabel}</button>
                </div>
            </div>
        </div>
    );
}

// ── Edit Expense Modal ────────────────────────────────────────────────────────
function EditExpenseModal({ entry, onClose, onSaved }: { entry: Entry; onClose: () => void; onSaved: () => void }) {
    const categories = Object.entries(EXPENSE_CATEGORIES);
    const [category, setCategory] = useState(entry.category);
    const [nominal, setNominal] = useState(String(entry.nominal ?? ""));
    const [keterangan, setKeterangan] = useState(entry.keterangan ?? "");
    const [tanggal, setTanggal] = useState(entry.tanggal);
    const [paymentMethod, setPaymentMethod] = useState<"CASH" | "SALDO">(entry.payment_method ?? "CASH");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    // ✅ FIX: satu kondisi validasi, tidak ada return ganda yang memblokir fetch
    const submit = async () => {
        if (nominal === "" || !Number.isFinite(Number(nominal)) || Number(nominal) <= 0)
            return setError("Nominal harus lebih dari 0");
        setSaving(true);
        setError("");
        try {
            const res = await fetch(`/api/cashflow/${entry.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    category,
                    nominal: Number(nominal),
                    keterangan: keterangan.trim() || null,
                    tanggal,
                    payment_method: paymentMethod,
                }),
            });
            const json = await res.json();
            if (!json.success) return setError(json.message || "Gagal menyimpan perubahan");
            onSaved();
            onClose();
        } catch {
            setError("Terjadi kesalahan koneksi");
        } finally {
            setSaving(false);
        }
    };

    const inputCls = "w-full h-10 border border-gray-200 rounded-lg px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition";

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <div className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-md rounded-2xl shadow-2xl overflow-hidden border border-gray-100">
                <div className="h-1 bg-gradient-to-r from-amber-400 to-orange-500" />
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center text-base">✏️</div>
                        <div>
                            <p className="text-sm font-bold text-gray-900">Edit Uang Keluar</p>
                            <p className="text-[11px] text-gray-400">{fmtTanggal(entry.tanggal)}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-7 h-7 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center transition"><IconX /></button>
                </div>
                <div className="p-5 space-y-3.5 max-h-[75vh] overflow-y-auto">
                    <div>
                        <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Metode Pembayaran <span className="text-red-500">*</span></label>
                        <div className="inline-flex w-full rounded-xl border border-gray-200 bg-gray-50 p-1 gap-1">
                            {(["CASH", "SALDO"] as const).map((m) => (
                                <button key={m} type="button" onClick={() => setPaymentMethod(m)} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition ${paymentMethod === m ? "bg-white text-gray-900 shadow-sm border border-gray-200" : "text-gray-400 hover:text-gray-600"}`}>
                                    <span>{m === "CASH" ? "💵" : "🏦"}</span> {m === "CASH" ? "Cash" : "Saldo"}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Kategori</label>
                        <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
                            {categories.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Nominal <span className="text-red-500">*</span></label>
                            <input type="number" value={nominal} onChange={(e) => setNominal(e.target.value)} placeholder="0" className={`${inputCls} font-mono`} autoFocus />
                            {nominal && Number(nominal) > 0 && <p className="text-[11px] text-gray-400 mt-1 font-mono">{fmtRupiah(Number(nominal))}</p>}
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Tanggal</label>
                            <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className={inputCls} />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Keterangan</label>
                        <textarea value={keterangan} onChange={(e) => setKeterangan(e.target.value)} rows={2} placeholder="Catatan tambahan..." className={`${inputCls.replace("h-10", "")} py-2 resize-none`} />
                    </div>
                    {entry.photo_url && (
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Foto Bukti <span className="text-gray-400 font-normal">(tidak bisa diubah di sini)</span></label>
                            <img src={entry.photo_url} alt="Bukti" className="w-full max-h-40 object-cover rounded-xl border border-gray-200" />
                        </div>
                    )}
                    {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">{error}</div>}
                </div>
                <div className="px-5 py-4 border-t border-gray-100 flex gap-3 bg-gray-50/60">
                    <button onClick={onClose} disabled={saving} className="flex-1 h-10 bg-white border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50">Batal</button>
                    <button onClick={submit} disabled={saving} className="flex-1 h-10 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition disabled:opacity-60">{saving ? "Menyimpan..." : "Simpan Perubahan"}</button>
                </div>
            </div>
        </div>
    );
}

// ── Income Modal ──────────────────────────────────────────────────────────────
function IncomeModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
    const MANUAL_INCOME_CATS = Object.entries(INCOME_CATEGORIES).filter(
        ([key]) => !(AUTO_INCOME_CATEGORIES as readonly string[]).includes(key)
    );

    const [category, setCategory] = useState(MANUAL_INCOME_CATS[0]?.[0] ?? "UTANG");
    const [nominal, setNominal] = useState("");
    const [keterangan, setKeterangan] = useState("");
    const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    const submit = async () => {
        if (nominal === "" || !Number.isFinite(Number(nominal)) || Number(nominal) <= 0)
            return setError("Nominal harus lebih dari 0");
        setSaving(true); setError("");
        try {
            const res = await fetch("/api/cashflow", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    direction: "IN",
                    category,
                    nominal: Number(nominal),
                    keterangan: keterangan.trim() || null,
                    tanggal,
                }),
            });
            const json = await res.json();
            if (!json.success) return setError(json.message || "Gagal menyimpan");
            onSaved(); onClose();
        } catch { setError("Terjadi kesalahan koneksi"); }
        finally { setSaving(false); }
    };

    const inputCls = "w-full h-10 border border-gray-200 rounded-lg px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400/30 focus:border-emerald-400 transition";

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <div className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-md rounded-2xl shadow-2xl overflow-hidden border border-gray-100">
                <div className="h-1 bg-gradient-to-r from-emerald-400 to-green-500" />
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center text-base">💰</div>
                        <div>
                            <p className="text-sm font-bold text-gray-900">Tambah Uang Masuk</p>
                            <p className="text-[11px] text-gray-400">Nama pengisi tercatat otomatis</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-7 h-7 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center transition"><IconX /></button>
                </div>
                <div className="p-5 space-y-3.5 max-h-[75vh] overflow-y-auto">
                    <div>
                        <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Kategori</label>
                        <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
                            {MANUAL_INCOME_CATS.map(([key, label]) => (
                                <option key={key} value={key}>{label}</option>
                            ))}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Nominal <span className="text-red-500">*</span></label>
                            <input type="number" value={nominal} onChange={(e) => setNominal(e.target.value)} placeholder="0" className={`${inputCls} font-mono`} autoFocus />
                            {nominal && Number(nominal) > 0 && (
                                <p className="text-[11px] text-emerald-600 mt-1 font-mono font-semibold">{fmtRupiah(Number(nominal))}</p>
                            )}
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Tanggal</label>
                            <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className={inputCls} />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Keterangan</label>
                        <textarea value={keterangan} onChange={(e) => setKeterangan(e.target.value)} rows={2} placeholder="Catatan tambahan..." className={`${inputCls.replace("h-10", "")} py-2 resize-none`} />
                    </div>
                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">{error}</div>
                    )}
                </div>
                <div className="px-5 py-4 border-t border-gray-100 flex gap-3 bg-gray-50/60">
                    <button onClick={onClose} disabled={saving} className="flex-1 h-10 bg-white border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50">Batal</button>
                    <button onClick={submit} disabled={saving} className="flex-1 h-10 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition disabled:opacity-60">
                        {saving ? "Menyimpan..." : "Simpan"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Summary Card ──────────────────────────────────────────────────────────────
function SummaryCard({ label, value, sublabel, color, icon, loading }: {
    label: string; value: string; sublabel?: string;
    color: "emerald" | "red" | "blue" | "violet"; icon: React.ReactNode; loading: boolean;
}) {
    const colorMap = {
        emerald: { bar: "bg-emerald-500", icon: "bg-emerald-50 text-emerald-600", value: "text-emerald-700", sub: "text-emerald-500" },
        red: { bar: "bg-red-500", icon: "bg-red-50 text-red-600", value: "text-red-700", sub: "text-red-400" },
        blue: { bar: "bg-blue-500", icon: "bg-blue-50 text-blue-600", value: "text-blue-700", sub: "text-blue-400" },
        violet: { bar: "bg-violet-500", icon: "bg-violet-50 text-violet-600", value: "text-violet-700", sub: "text-violet-400" },
    };
    const c = colorMap[color];
    return (
        <div className="relative bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className={`absolute top-0 left-0 h-full w-1 ${c.bar}`} />
            <div className="pl-5 pr-4 py-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${c.icon}`}>{icon}</div>
                <div className="min-w-0">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
                    {loading ? <div className="h-6 w-28 bg-gray-100 rounded animate-pulse mt-1" /> : <p className={`text-lg font-black tabular-nums tracking-tight ${c.value}`}>{value}</p>}
                    {sublabel && !loading && <p className={`text-[10px] ${c.sub} mt-0.5 font-medium`}>{sublabel}</p>}
                </div>
            </div>
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CashflowPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [masuk, setMasuk] = useState<Entry[]>([]);
    const [keluar, setKeluar] = useState<Entry[]>([]);
    const [summary, setSummary] = useState<Summary>({ total_masuk: 0, total_keluar: 0, saldo: 0, belum_audit: 0, modal_awal_entry: null });
    const [tab, setTab] = useState<"IN" | "OUT">("IN");
    const [period, setPeriod] = useState<"today" | "week" | "month" | "custom">("today");
    const [customFrom, setCustomFrom] = useState("");
    const [customTo, setCustomTo] = useState("");
    const [showModal, setShowModal] = useState(false);
    const [showModalAwal, setShowModalAwal] = useState(false);
    const [showIncomeModal, setShowIncomeModal] = useState(false);
    const [detailEntry, setDetailEntry] = useState<Entry | null>(null);
    const [editEntry, setEditEntry] = useState<Entry | null>(null);
    const [showFilter, setShowFilter] = useState(false);
    const [filterIn, setFilterIn] = useState<CashflowFilter>(defaultCashflowFilter());
    const [filterOut, setFilterOut] = useState<CashflowFilter>(defaultCashflowFilter());
    const [auditingId, setAuditingId] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [exporting, setExporting] = useState(false);
    const [allowed, setAllowed] = useState<boolean | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const ITEMS_PER_PAGE = 70;

    useEffect(() => {
        fetch("/api/auth/me").then((r) => r.json()).then((r) => {
            const roles: string[] = r.user?.roles?.length ? r.user.roles : [r.user?.role].filter(Boolean);
            setAllowed(roles.some((x) => (CASHFLOW_ROLES as string[]).includes(x)));
        }).catch(() => setAllowed(false));
    }, []);

    const fetchData = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const res = await fetch("/api/cashflow", { cache: "no-store" });
            const json = await res.json();
            if (json.success) {
                setMasuk(sortEntries(json.data.masuk ?? []));
                setKeluar(sortEntries(json.data.keluar ?? []));
                setSummary(json.summary);
                setLastUpdated(new Date());
            }
        } finally { if (!silent) setLoading(false); }
    }, []);

    useEffect(() => { if (allowed) fetchData(); }, [allowed, fetchData]);

    useEffect(() => {
        if (!allowed) return;
        const interval = setInterval(() => { if (document.visibilityState === "visible") fetchData(true); }, 10000);
        const onFocus = () => fetchData(true);
        const onVisible = () => { if (document.visibilityState === "visible") fetchData(true); };
        window.addEventListener("focus", onFocus);
        document.addEventListener("visibilitychange", onVisible);
        return () => { clearInterval(interval); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVisible); };
    }, [allowed, fetchData]);

    useEffect(() => { setCurrentPage(1); }, [tab, filterIn, filterOut]);

    const handleExport = async () => {
        setExporting(true);
        try { await exportCashflowExcel(masuk.filter((e) => !e.is_voided), keluar.filter((e) => !e.is_voided)); }
        finally { setExporting(false); }
    };

    const toggleAudit = async (entry: Entry) => {
        if (entry.is_audited) return;
        setAuditingId(entry.id);
        try {
            const res = await fetch(`/api/cashflow/${entry.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "toggle_audit" }) });
            const json = await res.json();
            if (json.success) fetchData(true);
            else alert(json.message || "Gagal mengaudit");
        } finally { setAuditingId(null); }
    };

    const deleteEntry = async (entry: Entry) => {
        if (!confirm(`Hapus entry "${entry.keterangan || entry.nama}"?`)) return;
        const res = await fetch(`/api/cashflow/${entry.id}`, { method: "DELETE" });
        const json = await res.json();
        if (json.success) fetchData(true);
        else alert(json.message || "Gagal menghapus");
    };

    const isDetailRow = (e: Entry) => e.direction === "OUT" || (e.direction === "IN" && e.source_type === "MANUAL");

    const handleRowClick = (e: Entry) => {
        if (e.source_type === "MODAL_AWAL") return;
        if (isDetailRow(e)) { setDetailEntry(e); return; }
        if (e.source_type === "TRANSACTION" && e.source_id) router.push(`/dashboard/transactions?invoice=${encodeURIComponent(e.source_id)}`);
        else if (e.source_type === "SERVICE") router.push("/dashboard/service/history");
    };

    if (allowed === false) return (
        <DashboardLayout>
            <div className="max-w-md mx-auto mt-24 text-center">
                <div className="text-5xl mb-3">🔒</div>
                <p className="text-gray-600 font-semibold">Halaman ini hanya untuk Admin & Programmer.</p>
            </div>
        </DashboardLayout>
    );

    const currentFilter = tab === "IN" ? filterIn : filterOut;
    const setCurrentFilter = tab === "IN" ? setFilterIn : setFilterOut;
    const allRows = tab === "IN" ? masuk : keluar;
    const rows = applyFilters(allRows, currentFilter);
    const filterCount = activeFilterCount(currentFilter);
    const voidedCount = allRows.filter((e) => e.is_voided).length;
    const totalPages = Math.max(1, Math.ceil(rows.length / ITEMS_PER_PAGE));
    const safePage = Math.min(currentPage, totalPages);
    const paginatedRows = rows.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

    const jakartaToday = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
    const jakartaNow = new Date();
    const weekDay = jakartaNow.getDay();
    const weekStart = new Date(jakartaNow);
    weekStart.setDate(jakartaNow.getDate() - (weekDay === 0 ? 6 : weekDay - 1));
    const weekStartStr = weekStart.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
    const monthPrefix = jakartaToday.slice(0, 7);

    const inPeriod = (tanggal: string) => {
        if (period === "today") return tanggal === jakartaToday;
        if (period === "week") return tanggal >= weekStartStr && tanggal <= jakartaToday;
        if (period === "month") return (tanggal || "").slice(0, 7) === monthPrefix;
        if (customFrom && tanggal < customFrom) return false;
        if (customTo && tanggal > customTo) return false;
        return !!(customFrom || customTo);
    };

    const incomeValue = masuk.reduce((s, e) => e.source_type !== "MODAL_AWAL" && !e.is_voided && inPeriod(e.tanggal) ? s + Number(e.nominal || 0) : s, 0);
    const expenseValue = keluar.reduce((s, e) => inPeriod(e.tanggal) ? s + Number(e.nominal || 0) : s, 0);
    const periodLabel = period === "today" ? "Hari Ini" : period === "week" ? "Minggu Ini" : period === "month" ? "Bulan Ini"
        : (customFrom || customTo) ? `${customFrom ? fmtTanggalShort(customFrom) : "..."} — ${customTo ? fmtTanggalShort(customTo) : "..."}` : "Custom";

    const startDateFormatted = new Date(CASHFLOW_START_DATE + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
    const clickable = (e: Entry) => e.source_type !== "MODAL_AWAL";

    return (
        <DashboardLayout>
            {showModal && <ExpenseModal onClose={() => setShowModal(false)} onSaved={() => fetchData(true)} />}
            {showModalAwal && <ModalAwalModal onClose={() => setShowModalAwal(false)} onSaved={() => fetchData(true)} />}
            {showIncomeModal && <IncomeModal onClose={() => setShowIncomeModal(false)} onSaved={() => fetchData(true)} />}
            {detailEntry && <DetailModal entry={detailEntry} onClose={() => setDetailEntry(null)} onDelete={deleteEntry} onEdit={(e) => setEditEntry(e)} />}
            {editEntry && <EditExpenseModal entry={editEntry} onClose={() => setEditEntry(null)} onSaved={() => fetchData(true)} />}

            <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-5">

                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-1.5 h-9 bg-gradient-to-b from-gray-700 to-gray-900 rounded-full" />
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Cashflow</h1>
                            <p className="text-sm text-gray-400 mt-0.5">Arus kas masuk & keluar · sejak {startDateFormatted}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] font-semibold text-emerald-700">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                            </span>
                            Live
                        </span>
                        {lastUpdated && (
                            <span className="hidden md:inline text-[11px] text-gray-400 tabular-nums">
                                {lastUpdated.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                            </span>
                        )}
                        <button onClick={handleExport} disabled={loading || exporting}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-200 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Export semua data cashflow ke Excel (2 sheet)">
                            <IconDownload />
                            <span className="hidden sm:inline text-sm">{exporting ? "Mengekspor..." : "Export Excel"}</span>
                        </button>
                        <button onClick={() => fetchData()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 bg-white hover:bg-gray-50 active:scale-95 transition">
                            <IconRefresh />
                            <span className="hidden sm:inline text-sm">Segarkan</span>
                        </button>
                    </div>
                </div>

                {/* Saldo Utama */}
                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                    <div className="h-1 bg-gradient-to-r from-gray-700 via-gray-800 to-gray-900" />
                    <div className="p-5 sm:p-6">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center"><IconWallet /></div>
                                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Saldo Cashflow · Semua Waktu</span>
                                </div>
                                {loading ? <div className="h-10 w-48 bg-gray-100 rounded-xl animate-pulse" /> : <p className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight tabular-nums">{fmtRupiah(summary.saldo)}</p>}
                                <p className="text-[11px] text-gray-400 mt-1.5">Total masuk dikurangi keluar · akumulasi semua waktu</p>
                                {!loading && summary.modal_awal_entry && (
                                    <p className="text-[11px] text-violet-500 mt-1 font-medium">💰 Termasuk modal awal <span className="font-bold">{fmtRupiah(summary.modal_awal_entry.nominal)}</span></p>
                                )}
                                {!loading && summary.belum_audit > 0 && (
                                    <div className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200">
                                        <IconAlertTriangle />
                                        <p className="text-[11px] text-amber-700 font-semibold">{summary.belum_audit} entry belum diaudit</p>
                                    </div>
                                )}
                                {!loading && (summary.stale ?? 0) > 0 && (
                                    <div className="inline-flex items-center gap-1.5 mt-2 ml-2 px-2.5 py-1 rounded-lg bg-orange-50 border border-orange-200">
                                        <IconAlertTriangle />
                                        <p className="text-[11px] text-orange-700 font-semibold">{summary.stale} entry sudah diaudit tapi harga transaksinya berubah</p>
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-col items-end gap-2">
                                <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1 gap-0.5">
                                    {([["today", "Hari Ini"], ["week", "Minggu"], ["month", "Bulan"], ["custom", "Kustom"]] as [typeof period, string][]).map(([val, label]) => (
                                        <button key={val} onClick={() => setPeriod(val)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${period === val ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:bg-white/60"}`}>{label}</button>
                                    ))}
                                </div>
                                {period === "custom" && (
                                    <div className="flex items-center gap-1.5">
                                        <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-8 border border-gray-200 rounded-lg px-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 transition" />
                                        <span className="text-xs text-gray-400">—</span>
                                        <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-8 border border-gray-200 rounded-lg px-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 transition" />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <SummaryCard label={`Masuk · ${periodLabel}`} value={fmtRupiah(incomeValue)} color="emerald" icon={<IconTrendUp />} loading={loading} />
                    <SummaryCard label={`Keluar · ${periodLabel}`} value={fmtRupiah(expenseValue)} color="red" icon={<IconTrendDown />} loading={loading} />
                </div>

                {/* Tab + Filter + CTA */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 gap-0.5">
                            {(["IN", "OUT"] as const).map((t) => (
                                <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${tab === t ? t === "IN" ? "bg-emerald-600 text-white shadow-sm" : "bg-red-600 text-white shadow-sm" : "text-gray-500 hover:bg-gray-50"}`}>
                                    {t === "IN" ? `↑ Masuk ${!loading ? `(${masuk.length})` : ""}` : `↓ Keluar ${!loading ? `(${keluar.length})` : ""}`}
                                </button>
                            ))}
                        </div>
                        <button onClick={() => setShowFilter(!showFilter)} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border transition ${showFilter ? "bg-gray-900 text-white border-gray-900" : filterCount > 0 ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
                            <IconFilter /> Filter
                            {filterCount > 0 && <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${showFilter ? "bg-white text-gray-900" : "bg-amber-600 text-white"}`}>{filterCount}</span>}
                        </button>
                    </div>
                    {tab === "IN" && (
                        <button onClick={() => setShowIncomeModal(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition shadow-sm">
                            <IconPlus /> Tambah Uang Masuk
                        </button>
                    )}
                    {tab === "OUT" && (
                        <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 active:scale-95 transition shadow-sm">
                            <IconPlus /> Tambah Pengeluaran
                        </button>
                    )}
                </div>

                {showFilter && <FilterPanel filter={currentFilter} onChange={setCurrentFilter} onReset={() => setCurrentFilter(defaultCashflowFilter())} direction={tab} />}

                {!loading && voidedCount > 0 && (
                    <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[12px] text-gray-600">
                        <IconInfo />
                        <span>Ada <b>{voidedCount} entry dibatalkan</b> di tab ini — ditandai abu-abu &amp; nominalnya dicoret. Entry ini <b>tidak dihitung</b> ke saldo maupun total periode, dan tidak bisa diaudit.</span>
                    </div>
                )}

                {tab === "IN" && (
                    <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-blue-50/80 border border-blue-100 text-[12px] text-blue-700">
                        <IconInfo />
                        <span>Klik baris untuk membuka sumbernya di <b>Riwayat Transaksi</b> atau <b>Service</b>. Uang masuk otomatis sync dari transaksi PAID & service DONE sejak <b>{startDateFormatted}</b>.</span>
                    </div>
                )}

                {/* Table */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm" style={{ minWidth: 860 }}>
                            <thead>
                                <tr className="bg-gray-50/80 border-b border-gray-100">
                                    {[
                                        { label: "Tanggal", align: "left" },
                                        { label: "Sumber", align: "left" },
                                        { label: "Metode", align: "left" },
                                        { label: tab === "IN" ? "Nama / Teknisi" : "Pengisi", align: "left" },
                                        { label: "Kategori", align: "left" },
                                        { label: "Nominal", align: "right" },
                                        { label: "Keterangan", align: "left" },
                                        { label: "Audit", align: "left" },
                                        { label: "Diaudit oleh", align: "left" },
                                        { label: "", align: "center" },
                                    ].map((h, i) => (
                                        <th key={i} className={`px-3.5 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap text-${h.align} first:pl-5 last:pr-5`}>{h.label}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {loading ? (
                                    Array.from({ length: 6 }).map((_, i) => (
                                        <tr key={i} className="animate-pulse">
                                            {Array.from({ length: 10 }).map((__, j) => (
                                                <td key={j} className="px-3.5 py-3.5"><div className="h-3 rounded-full bg-gray-100" style={{ width: j === 3 ? 100 : j === 5 ? 80 : 56 }} /></td>
                                            ))}
                                        </tr>
                                    ))
                                ) : rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={10} className="px-3.5 py-16 text-center">
                                            <div className="text-4xl mb-2.5 opacity-25">{filterCount > 0 ? "🔍" : "📭"}</div>
                                            <p className="text-sm text-gray-400 font-medium">
                                                {filterCount > 0 ? `Tidak ada data yang cocok (${allRows.length} entry tersembunyi).` : `Belum ada data ${tab === "IN" ? "uang masuk" : "uang keluar"}.`}
                                            </p>
                                            {filterCount > 0 && (
                                                <button onClick={() => setCurrentFilter(defaultCashflowFilter())} className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition">
                                                    <IconX /> Reset Filter
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedRows.map((e) => {
                                        const isClickable = clickable(e);
                                        return (
                                            <tr key={e.id} onClick={() => isClickable && handleRowClick(e)}
                                                className={`transition-colors group ${e.is_voided ? "opacity-50 grayscale bg-gray-50/60" : ""} ${isClickable ? "cursor-pointer hover:bg-blue-50/60" : "hover:bg-gray-50/50"}`}>
                                                <td className="pl-5 pr-3 py-3 whitespace-nowrap">
                                                    <span className="text-[11px] font-semibold text-gray-600">{fmtTanggalShort(e.tanggal)}</span>
                                                    <p className="text-[9px] text-gray-300 font-mono mt-0.5">{e.tanggal}</p>
                                                </td>
                                                <td className="px-3 py-3 whitespace-nowrap"><SourceBadge sourceType={e.source_type} /></td>
                                                <td className="px-3 py-3 whitespace-nowrap" onClick={(ev) => ev.stopPropagation()}>
                                                    {e.direction === "OUT" && e.source_type === "MANUAL" ? (
                                                        e.payment_method === "SALDO"
                                                            ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">🏦 Saldo</span>
                                                            : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-green-50 text-green-700 border border-green-100">💵 Cash</span>
                                                    ) : <span className="text-gray-300 text-[11px]">—</span>}
                                                </td>
                                                <td className="px-3 py-3 max-w-[140px]">
                                                    <p className="text-[12px] font-semibold text-gray-800 truncate">
                                                        {e.source_type === "MANUAL" || e.source_type === "MODAL_AWAL" ? (e.created_by_user?.name ?? e.nama) : e.nama}
                                                    </p>
                                                    {e.source_type === "SERVICE" && <p className="text-[9px] text-orange-500 font-semibold mt-0.5">Teknisi</p>}
                                                    {e.source_type === "TRANSACTION" && <p className="text-[9px] text-blue-500 font-semibold mt-0.5">Customer</p>}
                                                    {e.source_type === "MODAL_AWAL" && <p className="text-[9px] text-violet-500 font-semibold mt-0.5">Modal Awal</p>}
                                                </td>
                                                <td className="px-3 py-3 whitespace-nowrap">
                                                    {e.source_type === "MODAL_AWAL" ? (
                                                        <span className="inline-flex text-[10px] font-medium px-2 py-0.5 rounded-md bg-violet-50 text-violet-600 border border-violet-100">💰 Modal Awal</span>
                                                    ) : (
                                                        <span className="inline-flex text-[10px] font-medium px-2 py-0.5 rounded-md bg-gray-100 text-gray-600">{categoryLabel(e.direction, e.category)}</span>
                                                    )}
                                                </td>
                                                <td className={`px-3 py-3 text-right font-mono font-bold text-[13px] tabular-nums whitespace-nowrap ${e.is_voided ? "text-gray-400 line-through decoration-gray-400" : e.direction === "IN" ? "text-emerald-600" : "text-red-600"}`}>
                                                    {e.direction === "IN" ? "+" : "−"}{fmtRupiah(e.nominal)}
                                                    {e.is_stale && e.source_nominal != null && (
                                                        <p className="text-[9px] font-sans font-bold text-amber-600 mt-0.5"
                                                            title={`Harga deal di transaksi sudah berubah jadi ${fmtRupiah(e.source_nominal)}, tapi entry ini sudah diaudit sehingga nominalnya dikunci.`}>
                                                            ⚠️ Kini {fmtRupiah(e.source_nominal)}
                                                        </p>
                                                    )}
                                                </td>
                                                <td className="px-3 py-3 max-w-[200px]">
                                                    <span className="truncate block text-[11px] text-gray-500">{e.keterangan || "—"}</span>
                                                    {e.photo_url && (
                                                        <button type="button" onClick={(ev) => { ev.stopPropagation(); setDetailEntry(e); }} className="inline-flex items-center gap-1 mt-0.5 text-[10px] font-semibold text-blue-600 hover:underline">
                                                            📷 Foto
                                                        </button>
                                                    )}
                                                </td>
                                                <td className="px-3 py-3 whitespace-nowrap" onClick={(ev) => ev.stopPropagation()}>
                                                    <AuditCell entry={e} busy={auditingId === e.id} onAudit={() => toggleAudit(e)} />
                                                </td>
                                                <td className="px-3 py-3 whitespace-nowrap">
                                                    {e.audited_by_user?.name
                                                        ? <span className="text-[11px] text-emerald-600 font-semibold">✓ {e.audited_by_user.name}</span>
                                                        : <span className="text-gray-300 text-[11px]">—</span>}
                                                </td>
                                                <td className="px-3 pr-5 py-3 text-right whitespace-nowrap" onClick={(ev) => ev.stopPropagation()}>
                                                    <div className="flex items-center justify-end gap-1">
                                                        {e.source_type === "MANUAL" && e.direction === "OUT" && (
                                                            <button onClick={() => setEditEntry(e)} className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition" title="Edit"><IconEdit /></button>
                                                        )}
                                                        {e.source_type === "MANUAL" && e.direction === "IN" && (
                                                            <button onClick={() => deleteEntry(e)} className="p-1.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition opacity-0 group-hover:opacity-100" title="Hapus"><IconTrash /></button>
                                                        )}
                                                        {isClickable && (
                                                            <span className="p-1.5 text-gray-300 group-hover:text-blue-400 rounded-lg transition" title={isDetailRow(e) ? "Lihat detail" : "Buka sumber"}>
                                                                {isDetailRow(e) ? <IconEye /> : <IconExternal />}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {!loading && rows.length > 0 && (
                        <div className="px-5 py-3.5 border-t border-gray-100 bg-gray-50/40 flex items-center justify-between flex-wrap gap-3">
                            <p className="text-[11px] text-gray-400 font-medium">
                                Menampilkan <span className="font-bold text-gray-600">{(safePage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(safePage * ITEMS_PER_PAGE, rows.length)}</span> dari <span className="font-bold text-gray-600">{rows.length}</span> entry
                                {rows.length !== allRows.length && <span className="text-gray-300"> (total {allRows.length})</span>}
                                {filterCount > 0 && <span className="text-amber-500"> · {filterCount} filter aktif</span>}
                            </p>
                            {totalPages > 1 && (
                                <div className="flex items-center gap-1">
                                    <button onClick={() => setCurrentPage(1)} disabled={safePage === 1} className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 bg-white hover:bg-gray-50 disabled:opacity-30 transition"><IconChevronsLeft /></button>
                                    <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={safePage === 1} className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 bg-white hover:bg-gray-50 disabled:opacity-30 transition"><IconChevronLeft /></button>
                                    {(() => {
                                        const pages: (number | "...")[] = [];
                                        if (totalPages <= 7) { for (let i = 1; i <= totalPages; i++) pages.push(i); }
                                        else {
                                            pages.push(1);
                                            if (safePage > 3) pages.push("...");
                                            const start = Math.max(2, safePage - 1);
                                            const end = Math.min(totalPages - 1, safePage + 1);
                                            for (let i = start; i <= end; i++) pages.push(i);
                                            if (safePage < totalPages - 2) pages.push("...");
                                            pages.push(totalPages);
                                        }
                                        return pages.map((p, i) =>
                                            p === "..." ? <span key={`d-${i}`} className="w-7 h-7 flex items-center justify-center text-[11px] text-gray-400">…</span>
                                                : <button key={p} onClick={() => setCurrentPage(p as number)} className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs font-semibold transition ${p === safePage ? "bg-gray-900 text-white shadow-sm" : "border border-gray-200 text-gray-600 bg-white hover:bg-gray-50"}`}>{p}</button>
                                        );
                                    })()}
                                    <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 bg-white hover:bg-gray-50 disabled:opacity-30 transition"><IconChevronRight /></button>
                                    <button onClick={() => setCurrentPage(totalPages)} disabled={safePage === totalPages} className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 bg-white hover:bg-gray-50 disabled:opacity-30 transition"><IconChevronsRight /></button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Modal Awal Banner */}
                    {!loading && (
                        <ModalAwalBanner
                            entry={summary.modal_awal_entry}
                            onSet={() => setShowModalAwal(true)}
                            isWindowActive={new Date() <= new Date("2026-07-09T23:59:59+07:00")}
                        />
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}