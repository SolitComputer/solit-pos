"use client";
// src/components/inventory/InventoryTable.tsx
//
// Tabel inventaris reusable — layout mengikuti papan tulis toko:
//   No | Nama Laptop | CPU | RAM | Storage | Harga Modal | Harga Official |
//   Sumber | Tanggal Masuk | SN | ST | SJ | M
//
// Dipakai di 2 tempat supaya struktur kolomnya identik:
//   1. Data Barang (LaptopsContent) — 1 baris = 1 model laptop
//   2. Halaman Units                — 1 baris = 1 unit

import React, { useState } from "react";

export interface InventoryRow {
    id: string;
    laptop_name: string;
    cpu: string;
    ram: string;
    storage: string;

    harga_modal: number | null;
    harga_modal_note?: string;

    /** Modal sparepart per-unit (agregat kalau >1 unit) — kolom baru Data Barang */
    sparepart_modal?: number | null;
    sparepart_note?: string;

    harga_jual: number;

    /** Harga Official — harga yang sudah di-mark up, terpisah dari Harga Store */
    official_price?: number | null;
    official_price_note?: string;

    /** Gross Profit = Harga Store - Harga Sparepart - Harga Modal */
    gross_profit?: number | null;
    gross_profit_note?: string;

    sumber: string | null;
    sumber_note?: string;

    tanggal_masuk: string | null;
    tanggal_note?: string;

    sn: string | null;
    sn_note?: string;

    stok_tersisa: number;
    siap_jual: number;
    minus: number;

    is_audited?: boolean;
    audited_at?: string | null;

    /** Status SO (Stock Opname) — independen dari Audit, TTL 1 hari */
    is_so_active?: boolean;
    so_at?: string | null;

    /** Badge "NEW" — true kalau ada unit yang masuk dalam 3 hari terakhir */
    is_new?: boolean;

    /** Jumlah unit yang sudah "terjual" (dikomit ke customer) tapi belum lunas — RESERVED (DP) / HELD (Ambil Dulu) / PACKING (dana marketplace belum cair) */
    belum_lunas?: number;
    /** Rincian breakdown belum lunas, misal "2 DP · 1 Ambil Dulu" */
    belum_lunas_label?: string;
}

interface Props {
    rows: InventoryRow[];
    /** Boleh lihat Harga Modal, Sumber, Tanggal Masuk. Sales = false. */
    canSeePrivate: boolean;
    /** Boleh lihat kolom ST & M (agregat stok internal) */
    canSeeStock: boolean;
    /** Tampilkan kolom Modal Sparepart (opt-in — hanya Data Barang) */
    showSparepart?: boolean;
    /** Tampilkan kolom Total Jual = Harga Jual × Stok Tersisa (opt-in — Data Barang) */
    showTotalJual?: boolean;
    /** Label kolom tanggal — default "Tanggal Masuk", dipakai "Tanggal Terjual" di tab Terjual */
    dateColumnLabel?: string;
    onRowClick?: (row: InventoryRow) => void;
    renderActions?: (row: InventoryRow) => React.ReactNode;
    /** Render kolom Audit di samping Aksi (opt-in — Data Barang) */
    renderAudit?: (row: InventoryRow) => React.ReactNode;
    /** Render kolom SO (Stock Opname) — independen dari Audit (opt-in — Data Barang) */
    renderSo?: (row: InventoryRow) => React.ReactNode;
    /** Header sortable — opsional, dipakai Data Barang */
    sortBy?: string;
    onSort?: (asc: string, desc: string) => void;
}

const fmt = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");

// Harga Official selalu dihitung dari Harga Setor + markup ini,
// TIDAK dibaca dari kolom official_price di DB (biar data lama yang masih 0 tetap benar di layar).
const OFFICIAL_PRICE_MARKUP = 300_000;

const fmtDate = (iso: string | null) =>
    iso
        ? new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
        : null;

const Dash = () => <span className="text-gray-200">—</span>;
const Note = ({ children }: { children: React.ReactNode }) => (
    <span className="text-[11px] text-gray-300 italic">{children}</span>
);

type SortKey = "NAMA" | "CPU" | "RAM" | "STORAGE" | "MODAL" | "SPAREPART" | "PRICE" | "OFFICIAL" | "GROSS_PROFIT" | "TOTAL_JUAL" | "SUMBER" | "TANGGAL" | "SN" | "STOK" | "SIAP" | "MINUS" | "AUDIT" | "SO" | "AKSI";
//  Badge "NEW" — dipakai di kolom Nama Laptop saat row.is_new === true.
//  Nilai is_new sudah dihitung di pemanggil (LaptopsContent.tsx / ready/page.tsx),
//  jadi komponen ini murni presentasional, tidak menghitung TTL sendiri.
const NewBadge = () => (
    <span
        title="Barang baru masuk (≤ 3 hari)"
        className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wide bg-emerald-500 text-white shrink-0 shadow-sm shadow-emerald-500/30"
    >
        New
    </span>
);
//  Badge "Belum Lunas" — dipakai saat model punya unit RESERVED (DP) / HELD
//  (Ambil Dulu) / PACKING (dana marketplace belum cair). Unit yang SUDAH lunas
//  (SOLD) justru hilang dari tabel ini, jadi tidak butuh badge.
const BelumLunasBadge = ({ label }: { label?: string }) => (
    <span
        title={label ? `Terjual, belum lunas: ${label}` : "Ada unit yang sudah terjual tapi belum lunas"}
        className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wide bg-amber-500 text-white shrink-0 shadow-sm shadow-amber-500/30"
    >
        Belum Lunas
    </span>
);



export default function InventoryTable({
    rows, canSeePrivate, canSeeStock, showSparepart, showTotalJual, dateColumnLabel,
    onRowClick, renderActions, renderAudit, renderSo, sortBy, onSort,
}: Props) {
    const [localSort, setLocalSort] = useState<{ col: SortKey; dir: "asc" | "desc" } | null>(null);

    // Apply local column sorting if selected
    const sortedRows = React.useMemo(() => {
        if (!localSort) return rows;
        const list = [...rows];
        const mult = localSort.dir === "asc" ? 1 : -1;

        list.sort((a, b) => {
            let valA: any = "";
            let valB: any = "";

            switch (localSort.col) {
                case "NAMA": valA = a.laptop_name || ""; valB = b.laptop_name || ""; break;
                case "CPU": valA = a.cpu || ""; valB = b.cpu || ""; break;
                case "RAM": valA = a.ram || ""; valB = b.ram || ""; break;
                case "STORAGE": valA = a.storage || ""; valB = b.storage || ""; break;
                case "MODAL": valA = a.harga_modal ?? 0; valB = b.harga_modal ?? 0; break;
                case "SPAREPART": valA = a.sparepart_modal ?? 0; valB = b.sparepart_modal ?? 0; break;
                case "PRICE": valA = a.harga_jual ?? 0; valB = b.harga_jual ?? 0; break;
                case "OFFICIAL": valA = (a.harga_jual ?? 0) + OFFICIAL_PRICE_MARKUP; valB = (b.harga_jual ?? 0) + OFFICIAL_PRICE_MARKUP; break;
                case "GROSS_PROFIT": valA = a.gross_profit ?? 0; valB = b.gross_profit ?? 0; break;
                case "TOTAL_JUAL": valA = (a.harga_jual ?? 0) * (a.stok_tersisa ?? 0); valB = (b.harga_jual ?? 0) * (b.stok_tersisa ?? 0); break;
                case "SUMBER": valA = a.sumber || a.sumber_note || ""; valB = b.sumber || b.sumber_note || ""; break;
                case "TANGGAL": valA = a.tanggal_masuk || a.tanggal_note || ""; valB = b.tanggal_masuk || b.tanggal_note || ""; break;
                case "SN": valA = a.sn || a.sn_note || ""; valB = b.sn || b.sn_note || ""; break;
                case "STOK": valA = a.stok_tersisa ?? 0; valB = b.stok_tersisa ?? 0; break;
                case "SIAP": valA = a.siap_jual ?? 0; valB = b.siap_jual ?? 0; break;
                case "MINUS": valA = a.minus ?? 0; valB = b.minus ?? 0; break;
                case "AUDIT": valA = a.is_audited ? 1 : 0; valB = b.is_audited ? 1 : 0; break;
                case "SO": valA = a.is_so_active ? 1 : 0; valB = b.is_so_active ? 1 : 0; break;
                case "AKSI": valA = a.stok_tersisa ?? 0; valB = b.stok_tersisa ?? 0; break;
            }

            if (typeof valA === "number" && typeof valB === "number") {
                return (valA - valB) * mult;
            }
            return String(valA).localeCompare(String(valB), "id") * mult;
        });

        return list;
    }, [rows, localSort]);

    const handleSort = (colKey: SortKey, dir: "asc" | "desc", ascCode: string, descCode: string) => {
        setLocalSort({ col: colKey, dir });
        if (onSort) {
            onSort(ascCode, descCode);
        }
    };

    const handleResetSort = () => {
        setLocalSort(null);
        if (onSort) {
            onSort("DEFAULT", "DEFAULT");
        }
    };

    return (
        <div className="overflow-x-auto table-scroll max-h-[calc(100dvh-220px)] overflow-y-auto">
            <table className="w-full text-sm border-collapse">
                <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                        <Th center>No</Th>
                        <Th sortKey="NAMA" activeSort={sortBy} onSort={onSort}>Nama Laptop</Th>
                        <Th sortKey="CPU" activeSort={sortBy} onSort={onSort}>CPU</Th>
                        <Th sortKey="RAM" activeSort={sortBy} onSort={onSort}>RAM</Th>
                        <Th sortKey="STORAGE" activeSort={sortBy} onSort={onSort}>Storage</Th>
                        {canSeePrivate && <Th right sortKey="MODAL" activeSort={sortBy} onSort={onSort}>Modal Laptop</Th>}
                        {canSeePrivate && showSparepart && <Th right sortKey="SPAREPART" activeSort={sortBy} onSort={onSort}>Modal Sparepart</Th>}
                        <Th right sortKey="PRICE" activeSort={sortBy} onSort={onSort}>Harga Setor</Th>
                        <Th right sortKey="OFFICIAL" activeSort={sortBy} onSort={onSort}>Harga Official</Th>
                        {canSeePrivate && <Th right sortKey="GROSS_PROFIT" activeSort={sortBy} onSort={onSort}>Gross Profit</Th>}
                        {showTotalJual && canSeeStock && <Th right sortKey="TOTAL_JUAL" activeSort={sortBy} onSort={onSort}>Total Jual</Th>}
                        {canSeePrivate && <Th sortKey="SUMBER" activeSort={sortBy} onSort={onSort}>Sumber</Th>}
                        {canSeePrivate && <Th sortKey="TANGGAL" activeSort={sortBy} onSort={onSort}>{dateColumnLabel ?? "Tanggal Masuk"}</Th>}
                        <Th sortKey="SN" activeSort={sortBy} onSort={onSort}>SN</Th>
                        {canSeeStock && <Th center sortKey="STOK" activeSort={sortBy} onSort={onSort} title="Stok Tersisa">ST</Th>}
                        <Th center sortKey="SIAP" activeSort={sortBy} onSort={onSort} title="Siap Jual">SJ</Th>
                        {canSeeStock && <Th center sortKey="MINUS" activeSort={sortBy} onSort={onSort} title="Minus">M</Th>}
                        {renderSo && <Th center sortKey="SO" activeSort={sortBy} onSort={onSort}>SO</Th>}
                        {renderAudit && <Th center sortKey="AUDIT" activeSort={sortBy} onSort={onSort}>Audit</Th>}
                        {renderActions && <Th right sortKey="AKSI" activeSort={sortBy} onSort={onSort}>Aksi</Th>}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {sortedRows.map((row, idx) => (
                        <tr
                            key={row.id}
                            onClick={onRowClick ? () => onRowClick(row) : undefined}
                            className={`group data-row border-b border-gray-50 last:border-0 hover:bg-gray-50/60 ${onRowClick ? "cursor-pointer" : ""}`}
                        >
                            <td className="px-3 py-3.5 text-center w-10">
                                <span className="text-xs font-semibold text-gray-300 tabular-nums">
                                    {String(idx + 1).padStart(2, "0")}
                                </span>
                            </td>

                            <td className="px-3.5 py-3.5 min-w-[200px]">
                                <div className="flex items-center gap-1.5">
                                    <span className="font-semibold text-gray-800 text-[13px] truncate" title={row.laptop_name}>
                                        {row.laptop_name}
                                    </span>
                                    {row.is_new && <NewBadge />}
                                    {(row.belum_lunas ?? 0) > 0 && <BelumLunasBadge label={row.belum_lunas_label} />}
                                </div>
                            </td>

                            <td className="px-3.5 py-3.5 max-w-[150px]">
                                <span className="block text-xs text-gray-600 truncate" title={row.cpu}>
                                    {row.cpu || <Dash />}
                                </span>
                            </td>

                            <td className="px-3 py-3.5 whitespace-nowrap">
                                <span className="text-xs font-medium text-gray-600">{row.ram || <Dash />}</span>
                            </td>

                            <td className="px-3 py-3.5 whitespace-nowrap">
                                <span className="text-xs font-medium text-gray-600">{row.storage || <Dash />}</span>
                            </td>

                            {canSeePrivate && (
                                <td className="px-3.5 py-3.5 text-right whitespace-nowrap">
                                    {row.harga_modal != null ? (
                                        <span className="text-xs font-semibold text-gray-600 tabular-nums">{fmt(row.harga_modal)}</span>
                                    ) : row.harga_modal_note ? (
                                        <Note>{row.harga_modal_note}</Note>
                                    ) : <Dash />}
                                </td>
                            )}

                            {canSeePrivate && showSparepart && (
                                <td className="px-3 py-3.5 text-right whitespace-nowrap">
                                    {row.sparepart_modal != null ? (
                                        <span className="text-xs font-semibold text-gray-600 tabular-nums">{fmt(row.sparepart_modal)}</span>
                                    ) : row.sparepart_note ? (
                                        <Note>{row.sparepart_note}</Note>
                                    ) : <Dash />}
                                </td>
                            )}

                            <td className="px-3 py-3.5 text-right whitespace-nowrap">
                                <span className="text-[13px] font-bold text-gray-800 tabular-nums">{fmt(row.harga_jual)}</span>
                            </td>

                            <td className="px-3 py-3.5 text-right whitespace-nowrap">
                                <span className="text-xs font-semibold text-gray-600 tabular-nums">
                                    {fmt((row.harga_jual ?? 0) + OFFICIAL_PRICE_MARKUP)}
                                </span>
                            </td>

                            {canSeePrivate && (
                                <td className="px-3 py-3.5 text-right whitespace-nowrap">
                                    {row.gross_profit != null ? (
                                        <span className={`text-xs font-bold tabular-nums ${row.gross_profit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                            {row.gross_profit >= 0 ? "+" : "−"}{fmt(Math.abs(row.gross_profit))}
                                        </span>
                                    ) : row.gross_profit_note ? (
                                        <Note>{row.gross_profit_note}</Note>
                                    ) : <Dash />}
                                </td>
                            )}

                            {showTotalJual && canSeeStock && (
                                <td className="px-3 py-3.5 text-right whitespace-nowrap">
                                    <span className="text-[13px] font-bold text-gray-900 tabular-nums">{fmt(row.harga_jual * row.stok_tersisa)}</span>
                                </td>
                            )}

                            {canSeePrivate && (
                                <td className="px-3.5 py-3.5 max-w-[130px]">
                                    {row.sumber ? (
                                        <span className="block text-xs text-gray-600 truncate" title={row.sumber}>{row.sumber}</span>
                                    ) : row.sumber_note ? <Note>{row.sumber_note}</Note> : <Dash />}
                                </td>
                            )}

                            {canSeePrivate && (
                                <td className="px-3.5 py-3.5 whitespace-nowrap">
                                    {row.tanggal_masuk ? (
                                        <span className="text-xs text-gray-500 tabular-nums">{fmtDate(row.tanggal_masuk)}</span>
                                    ) : row.tanggal_note ? <Note>{row.tanggal_note}</Note> : <Dash />}
                                </td>
                            )}

                            <td className="px-3 py-3.5 whitespace-nowrap">
                                {row.sn ? (
                                    <code className="font-mono text-[11px] text-gray-700 bg-gray-100 px-2 py-1 rounded-lg">{row.sn}</code>
                                ) : row.sn_note ? <Note>{row.sn_note}</Note> : <Dash />}
                            </td>

                            {canSeeStock && (
                                <td className="px-3 py-3.5 text-center whitespace-nowrap">
                                    <span className={`text-sm font-semibold tabular-nums ${row.stok_tersisa === 0 ? "text-red-400" : "text-gray-700"}`}>
                                        {row.stok_tersisa}
                                    </span>
                                </td>
                            )}

                            <td className="px-3 py-3.5 text-center whitespace-nowrap">
                                <span className={`inline-flex items-center justify-center min-w-[26px] px-2 py-0.5 rounded-lg text-xs font-bold tabular-nums ${row.siap_jual === 0 ? "bg-red-50 text-red-500 ring-1 ring-red-200" : "bg-green-50 text-green-700 ring-1 ring-green-200"}`}>
                                    {row.siap_jual}
                                </span>
                            </td>

                            {canSeeStock && (
                                <td className="px-3 py-3.5 text-center whitespace-nowrap">
                                    <span className={`text-sm font-semibold tabular-nums ${row.minus > 0 ? "text-red-500" : "text-gray-200"}`}>
                                        {row.minus > 0 ? `-${row.minus}` : "—"}
                                    </span>
                                </td>
                            )}

                            {renderSo && (
                                <td className="px-3 py-3.5 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                    {renderSo(row)}
                                </td>
                            )}

                            {renderAudit && (
                                <td className="px-3 py-3.5 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                    {renderAudit(row)}
                                </td>
                            )}

                            {renderActions && (
                                <td className="px-3 py-3.5 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                    <div className="flex items-center justify-end gap-1">{renderActions(row)}</div>
                                </td>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function Th({
    children, titleName, right, center, title, sortKey, activeSort, onSort, className,
}: {
    children?: React.ReactNode;
    titleName?: string;
    right?: boolean;
    center?: boolean;
    title?: string;
    sortKey?: SortKey;
    isNumeric?: boolean;
    activeSort?: string;
    onSort?: (asc: string, desc: string) => void;
    className?: string;
}) {
    const ascCode = sortKey ? `${sortKey}_ASC` : "";
    const descCode = sortKey ? `${sortKey}_DESC` : "";

    const isAsc = !!sortKey && (
        activeSort === ascCode ||
        (sortKey === "NAMA" && activeSort === "AZ") ||
        (sortKey === "SN" && activeSort === "SN")
    );
    const isDesc = !!sortKey && (
        activeSort === descCode ||
        (sortKey === "NAMA" && activeSort === "ZA")
    );
    const isActive = isAsc || isDesc;

    const isFilterable = !!sortKey && !!onSort;
    const label = titleName || (typeof children === "string" ? children : "");

    const handleClick = () => {
        if (isFilterable && onSort) {
            onSort(ascCode, descCode);
        }
    };

    return (
        <th
            title={title || (isFilterable ? `Klik 1x untuk mengurutkan ${label}` : undefined)}
            onClick={handleClick}
            className={`sticky top-0 z-20 px-3 py-3 text-[9px] font-black uppercase tracking-widest whitespace-nowrap select-none group transition-colors shadow-2xs ${isFilterable ? "cursor-pointer hover:bg-gray-200" : ""
                } ${isActive ? "text-emerald-800 bg-emerald-50" : "text-gray-400 bg-gray-50"} ${right ? "text-right" : center ? "text-center" : "text-left"
                } ${className || ""}`}
        >
            <div className={`flex items-center gap-1.5 ${right ? "justify-end" : center ? "justify-center" : "justify-start"}`}>
                <span>{children || label}</span>

                {isFilterable && (
                    <span
                        className={`p-1 rounded-md transition-all inline-flex items-center justify-center flex-shrink-0 ${isActive
                            ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300 shadow-2xs"
                            : "bg-gray-100 text-gray-500 group-hover:bg-gray-200 group-hover:text-gray-800"
                            }`}
                    >
                        {isAsc ? (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                            </svg>
                        ) : isDesc ? (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                            </svg>
                        ) : (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                            </svg>
                        )}
                    </span>
                )}
            </div>
        </th>
    );
}