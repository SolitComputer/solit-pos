"use client";
// src/components/inventory/InventoryTable.tsx
//
// Tabel inventaris reusable — layout mengikuti papan tulis toko:
//   No | Nama Laptop | CPU | RAM | Storage | Harga Modal | Harga Jual |
//   Sumber | Tanggal Masuk | SN | ST | SJ | M
//
// Dipakai di 2 tempat supaya struktur kolomnya identik:
//   1. Data Barang (LaptopsContent) — 1 baris = 1 model laptop
//   2. Halaman Units                — 1 baris = 1 unit
//
// Kolom Harga Modal / Sumber / Tanggal Masuk / SN bersifat per-unit.
// Saat 1 baris mewakili >1 unit, isi `*_note` dengan ringkasan (abu-abu).

import React from "react";

export interface InventoryRow {
    id: string;
    laptop_name: string;
    cpu: string;
    ram: string;
    storage: string;

    /** null bila baris mewakili >1 unit dengan nilai berbeda → pakai harga_modal_note */
    harga_modal: number | null;
    harga_modal_note?: string;

    harga_jual: number;

    sumber: string | null;
    sumber_note?: string;

    /** ISO string. null bila tidak seragam → pakai tanggal_note */
    tanggal_masuk: string | null;
    tanggal_note?: string;

    sn: string | null;
    sn_note?: string;

    stok_tersisa: number;
    siap_jual: number;
    minus: number;
}

interface Props {
    rows: InventoryRow[];
    /** Boleh lihat Harga Modal, Sumber, Tanggal Masuk. Sales = false. */
    canSeePrivate: boolean;
    /** Boleh lihat kolom ST & M (agregat stok internal) */
    canSeeStock: boolean;
    onRowClick?: (row: InventoryRow) => void;
    renderActions?: (row: InventoryRow) => React.ReactNode;
    /** Header sortable — opsional, dipakai Data Barang */
    sortBy?: string;
    onSort?: (asc: string, desc: string) => void;
}

const fmt = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");

const fmtDate = (iso: string | null) =>
    iso
        ? new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
        : null;

const Dash = () => <span className="text-gray-200">—</span>;
const Note = ({ children }: { children: React.ReactNode }) => (
    <span className="text-[11px] text-gray-300 italic">{children}</span>
);

export default function InventoryTable({
    rows, canSeePrivate, canSeeStock, onRowClick, renderActions, sortBy, onSort,
}: Props) {
    return (
        <div className="overflow-x-auto table-scroll">
            <table className="w-full text-sm border-collapse">
                <thead>
                    <tr className="bg-gray-50 border-b-2 border-gray-100">
                        <Th center>No</Th>
                        <Th sortKey="NAMA" activeSort={sortBy} onSort={onSort}>Nama Laptop</Th>
                        <Th sortKey="CPU" activeSort={sortBy} onSort={onSort}>CPU</Th>
                        <Th sortKey="RAM" activeSort={sortBy} onSort={onSort}>RAM</Th>
                        <Th sortKey="STORAGE" activeSort={sortBy} onSort={onSort}>Storage</Th>
                        {canSeePrivate && <Th right>Harga Modal</Th>}
                        <Th right sortKey="PRICE" activeSort={sortBy} onSort={onSort}>Harga Official</Th>
                        {canSeePrivate && <Th>Sumber</Th>}
                        {canSeePrivate && <Th>Tanggal Masuk</Th>}
                        <Th>SN</Th>
                        {canSeeStock && <Th center sortKey="STOK" activeSort={sortBy} onSort={onSort} title="Stok Tersisa">ST</Th>}
                        <Th center sortKey="SIAP" activeSort={sortBy} onSort={onSort} title="Siap Jual">SJ</Th>
                        {canSeeStock && <Th center sortKey="MINUS" activeSort={sortBy} onSort={onSort} title="Minus">M</Th>}
                        {renderActions && <Th right>Aksi</Th>}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, idx) => (
                        <tr
                            key={row.id}
                            onClick={onRowClick ? () => onRowClick(row) : undefined}
                            className={`group data-row border-b border-gray-50 last:border-0 ${onRowClick ? "cursor-pointer" : ""}`}
                        >
                            <td className="px-3 py-3.5 text-center w-10">
                                <span className="text-xs font-semibold text-gray-300 tabular-nums">
                                    {String(idx + 1).padStart(2, "0")}
                                </span>
                            </td>

                            <td className="px-3 py-3.5 max-w-[190px]">
                                <span className="block font-semibold text-gray-800 truncate text-[13px]" title={row.laptop_name}>
                                    {row.laptop_name}
                                </span>
                            </td>

                            <td className="px-3 py-3.5 max-w-[150px]">
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
                                <td className="px-3 py-3.5 text-right whitespace-nowrap">
                                    {row.harga_modal != null ? (
                                        <span className="text-xs font-semibold text-gray-600 tabular-nums">{fmt(row.harga_modal)}</span>
                                    ) : row.harga_modal_note ? (
                                        <Note>{row.harga_modal_note}</Note>
                                    ) : <Dash />}
                                </td>
                            )}

                            <td className="px-3 py-3.5 text-right whitespace-nowrap">
                                <span className="text-[13px] font-bold text-gray-800 tabular-nums">{fmt(row.harga_jual)}</span>
                            </td>

                            {canSeePrivate && (
                                <td className="px-3 py-3.5 max-w-[130px]">
                                    {row.sumber ? (
                                        <span className="block text-xs text-gray-600 truncate" title={row.sumber}>{row.sumber}</span>
                                    ) : row.sumber_note ? <Note>{row.sumber_note}</Note> : <Dash />}
                                </td>
                            )}

                            {canSeePrivate && (
                                <td className="px-3 py-3.5 whitespace-nowrap">
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

function Th({ children, right, center, title, sortKey, activeSort, onSort }: {
    children: React.ReactNode; right?: boolean; center?: boolean; title?: string;
    sortKey?: string; activeSort?: string; onSort?: (asc: string, desc: string) => void;
}) {
    const isSortable = !!sortKey && !!onSort;
    const ascKey = sortKey === "NAMA" ? "AZ" : `${sortKey}_ASC`;
    const descKey = sortKey === "NAMA" ? "ZA" : `${sortKey}_DESC`;

    return (
        <th
            title={title}
            onClick={isSortable ? () => onSort!(ascKey, descKey) : undefined}
            className={`px-3 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap ${right ? "text-right" : center ? "text-center" : "text-left"} ${isSortable ? "cursor-pointer hover:text-gray-700 select-none group/th" : ""}`}
        >
            <div className={`flex items-center gap-1.5 ${right ? "justify-end" : center ? "justify-center" : "justify-start"}`}>
                {children}
                {isSortable && (
                    <div className="flex flex-col -space-y-[3px]">
                        <svg className={`w-2.5 h-2.5 ${activeSort === ascKey ? "text-gray-800" : "text-gray-300 group-hover/th:text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 15l7-7 7 7" /></svg>
                        <svg className={`w-2.5 h-2.5 ${activeSort === descKey ? "text-gray-800" : "text-gray-300 group-hover/th:text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                )}
            </div>
        </th>
    );
}