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

import React, { useState, useRef, useEffect } from "react";

export interface InventoryRow {
    id: string;
    laptop_name: string;
    cpu: string;
    ram: string;
    storage: string;

    harga_modal: number | null;
    harga_modal_note?: string;

    harga_jual: number;

    sumber: string | null;
    sumber_note?: string;

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

type SortKey = "NAMA" | "CPU" | "RAM" | "STORAGE" | "MODAL" | "PRICE" | "SN" | "STOK" | "SIAP";

export default function InventoryTable({
    rows, canSeePrivate, canSeeStock, onRowClick, renderActions, sortBy, onSort,
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
                case "PRICE": valA = a.harga_jual ?? 0; valB = b.harga_jual ?? 0; break;
                case "SN": valA = a.sn || ""; valB = b.sn || ""; break;
                case "STOK": valA = a.stok_tersisa ?? 0; valB = b.stok_tersisa ?? 0; break;
                case "SIAP": valA = a.siap_jual ?? 0; valB = b.siap_jual ?? 0; break;
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
        <div className="overflow-x-auto table-scroll">
            <table className="w-full text-sm border-collapse">
                <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                        <Th center>No</Th>
                        <Th
                            colKey="NAMA"
                            titleName="Nama Laptop"
                            isNumeric={false}
                            currentSort={localSort}
                            onSelectSort={(dir) => handleSort("NAMA", dir, "AZ", "ZA")}
                            onResetSort={handleResetSort}
                            className="w-full"
                        />
                        <Th
                            colKey="CPU"
                            titleName="CPU"
                            isNumeric={false}
                            currentSort={localSort}
                            onSelectSort={(dir) => handleSort("CPU", dir, "CPU_ASC", "CPU_DESC")}
                            onResetSort={handleResetSort}
                        />
                        <Th
                            colKey="RAM"
                            titleName="RAM"
                            isNumeric={false}
                            currentSort={localSort}
                            onSelectSort={(dir) => handleSort("RAM", dir, "RAM_ASC", "RAM_DESC")}
                            onResetSort={handleResetSort}
                        />
                        <Th
                            colKey="STORAGE"
                            titleName="Storage"
                            isNumeric={false}
                            currentSort={localSort}
                            onSelectSort={(dir) => handleSort("STORAGE", dir, "STORAGE_ASC", "STORAGE_DESC")}
                            onResetSort={handleResetSort}
                        />
                        {canSeePrivate && (
                            <Th
                                right
                                colKey="MODAL"
                                titleName="Harga Modal"
                                isNumeric={true}
                                currentSort={localSort}
                                onSelectSort={(dir) => handleSort("MODAL", dir, "MODAL_ASC", "MODAL_DESC")}
                                onResetSort={handleResetSort}
                            />
                        )}
                        <Th
                            right
                            colKey="PRICE"
                            titleName="Harga Official"
                            isNumeric={true}
                            currentSort={localSort}
                            onSelectSort={(dir) => handleSort("PRICE", dir, "PRICE_ASC", "PRICE_DESC")}
                            onResetSort={handleResetSort}
                        />
                        {canSeePrivate && <Th>Sumber</Th>}
                        {canSeePrivate && <Th>Tanggal Masuk</Th>}
                        <Th
                            colKey="SN"
                            titleName="SN"
                            isNumeric={false}
                            currentSort={localSort}
                            onSelectSort={(dir) => handleSort("SN", dir, "SN_ASC", "SN_DESC")}
                            onResetSort={handleResetSort}
                        />
                        {canSeeStock && (
                            <Th
                                center
                                colKey="STOK"
                                titleName="ST"
                                title="Stok Tersisa"
                                isNumeric={true}
                                currentSort={localSort}
                                onSelectSort={(dir) => handleSort("STOK", dir, "STOK_ASC", "STOK_DESC")}
                                onResetSort={handleResetSort}
                            />
                        )}
                        <Th
                            center
                            colKey="SIAP"
                            titleName="SJ"
                            title="Siap Jual"
                            isNumeric={true}
                            currentSort={localSort}
                            onSelectSort={(dir) => handleSort("SIAP", dir, "SIAP_ASC", "SIAP_DESC")}
                            onResetSort={handleResetSort}
                        />
                        {canSeeStock && <Th center title="Minus">M</Th>}
                        {renderActions && <Th center>Aksi</Th>}
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
                                <span className="block font-semibold text-gray-800 text-[13px]" title={row.laptop_name}>
                                    {row.laptop_name}
                                </span>
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

                            <td className="px-3.5 py-3.5 text-right whitespace-nowrap">
                                <span className="text-[13px] font-bold text-gray-800 tabular-nums">{fmt(row.harga_jual)}</span>
                            </td>

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

                            {renderActions && (
                                <td className="px-4 py-3.5 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                    <div className="flex items-center justify-center gap-1">{renderActions(row)}</div>
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
    children, titleName, right, center, title, colKey, isNumeric, currentSort, onSelectSort, onResetSort, className,
}: {
    children?: React.ReactNode;
    titleName?: string;
    right?: boolean;
    center?: boolean;
    title?: string;
    colKey?: SortKey;
    isNumeric?: boolean;
    currentSort?: { col: SortKey; dir: "asc" | "desc" } | null;
    onSelectSort?: (dir: "asc" | "desc") => void;
    onResetSort?: () => void;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const isCurrent = currentSort?.col === colKey;

    useEffect(() => {
        if (!open) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [open]);

    const isFilterable = !!colKey && !!onSelectSort;
    const label = titleName || (typeof children === "string" ? children : "");

    return (
        <th
            title={title}
            className={`px-3 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap relative ${right ? "text-right" : center ? "text-center" : "text-left"} ${className || ""}`}
        >
            <div className={`flex items-center gap-1 ${right ? "justify-end" : center ? "justify-center" : "justify-start"}`}>
                <span>{children || label}</span>

                {isFilterable && (
                    <div className="relative inline-block text-left" ref={menuRef} onClick={(e) => e.stopPropagation()}>
                        <button
                            type="button"
                            onClick={() => setOpen(!open)}
                            className={`p-0.5 rounded hover:bg-gray-200 transition-colors flex items-center ${isCurrent ? "text-emerald-600 font-bold bg-emerald-50" : "text-gray-400 hover:text-gray-700"}`}
                            title={`Filter / Sort ${label}`}
                        >
                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>

                        {open && (
                            <div className="absolute right-0 mt-1 w-44 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50 text-left normal-case text-xs animate-fadeIn font-normal">
                                <div className="px-3 py-1.5 border-b border-gray-100 font-bold text-gray-700 text-[11px] bg-gray-50 flex items-center justify-between">
                                    <span>Sort {label}</span>
                                    {isCurrent && (
                                        <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                                            {currentSort?.dir.toUpperCase()}
                                        </span>
                                    )}
                                </div>

                                <button
                                    onClick={() => { onSelectSort!("asc"); setOpen(false); }}
                                    className={`w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 transition-colors text-xs ${isCurrent && currentSort?.dir === "asc" ? "font-bold text-emerald-600 bg-emerald-50/50" : "text-gray-700"}`}
                                >
                                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                                    </svg>
                                    {isNumeric ? "Sort Terendah → Tertinggi" : "Sort A → Z"}
                                </button>

                                <button
                                    onClick={() => { onSelectSort!("desc"); setOpen(false); }}
                                    className={`w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 transition-colors text-xs ${isCurrent && currentSort?.dir === "desc" ? "font-bold text-emerald-600 bg-emerald-50/50" : "text-gray-700"}`}
                                >
                                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m-4 0l4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                    {isNumeric ? "Sort Tertinggi → Terendah" : "Sort Z → A"}
                                </button>

                                {isCurrent && onResetSort && (
                                    <div className="border-t border-gray-100 mt-1 pt-1">
                                        <button
                                            onClick={() => { onResetSort(); setOpen(false); }}
                                            className="w-full text-left px-3 py-1.5 hover:bg-red-50 text-red-600 flex items-center gap-2 transition-colors text-[11px] font-semibold"
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                            Reset Urutan
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </th>
    );
}