"use client";

import { useEffect, useState, useMemo } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { UserRole, PERMISSIONS, hasPermission } from "@/lib/permissions";
import InventoryTable, { InventoryRow } from "@/components/inventory/InventoryTable";
import ConditionChecklist from "@/components/inventory/ConditionChecklist";
import { ConditionChecks, sanitizeConditionChecks } from "@/lib/conditionChecks";
import { getAuthUser } from "@/hooks/useAuthUser";
import { Trophy, ThumbsUp, AlertTriangle, Wrench, Laptop, ClipboardList } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────
interface LaptopUnit {
    id: string;
    laptop_id: string;
    serial_number: string;
    grade: "A" | "B" | "C";
    condition_note: string;
    purchase_price: number;
    official_price?: number;
    selling_price: number;
    status: string;
    notes: string;
    condition_checks?: ConditionChecks | null;
    condition_checked_by?: string | null;
    condition_checked_at?: string | null;
    created_at: string;
    being_prepared?: boolean;
    preparing_order_number?: string | null;
    laptop?: {
        id: string;
        laptop_name: string;
        brand: string;
        cpu: string;
        ram: string;
        storage: string;
        display?: string;
        selling_price: number;
    };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");

const NEW_BADGE_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const isNewArrival = (createdAt?: string | null) =>
    !!createdAt && Date.now() - new Date(createdAt).getTime() < NEW_BADGE_TTL_MS;

// Tema brand DISAMAKAN dengan halaman Barang Siap Jual (konsistensi UI).
const BRAND_GRADIENT = "bg-gradient-to-br from-[#1a1545] to-[#0f0c29]";
const BRAND_GRADIENT_H = "bg-gradient-to-r from-[#1a1545] to-[#0f0c29]";

const GRADE_BADGE: Record<string, string> = {
    A: "bg-emerald-50 text-emerald-700 border-emerald-200",
    B: "bg-amber-50 text-amber-700 border-amber-200",
    C: "bg-red-50 text-red-700 border-red-200",
};

// Semua unit di halaman ini berstatus MINUS_SIAP_JUAL — warna amber dipakai
// konsisten dengan chip "MSJ" di Data Barang.
const STATUS_CONFIG: Record<string, { badge: string; dot: string; label: string }> = {
    MINUS_SIAP_JUAL: { badge: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500", label: "Minus Siap Jual" },
};

const fieldBase =
    "h-10 w-full rounded-xl border border-gray-200 bg-gray-50/80 text-xs font-medium text-gray-700 " +
    "transition-all duration-200 focus:outline-none focus:border-violet-400 focus:bg-white " +
    "focus:ring-4 focus:ring-violet-400/10 hover:border-gray-300";
const selectCls = `${fieldBase} px-3 pr-8 cursor-pointer appearance-none`;

// ─── AlertModal ───────────────────────────────────────────────────────────────
function AlertModal({ message, onClose }: { message: string; onClose: () => void }) {
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-3xl shadow-2xl ring-1 ring-black/5 w-full max-w-sm p-7 text-center animate-scaleIn">
                <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-5">
                    <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <p className="text-gray-700 text-sm font-medium leading-relaxed mb-6">{message}</p>
                <button onClick={onClose} className={`w-full h-11 ${BRAND_GRADIENT_H} text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-all duration-200 shadow-lg shadow-[#1a1545]/25 active:scale-[0.98]`}>OK</button>
            </div>
        </div>
    );
}

// ─── UnitInfoModal ─────────────────────────────────────────────────────────────
function UnitInfoModal({ unit, onClose }: { unit: LaptopUnit; onClose: () => void }) {
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    const st = STATUS_CONFIG[unit.status];
    const GradeIcon = unit.grade === "A" ? Trophy : unit.grade === "B" ? ThumbsUp : AlertTriangle;

    const rows: { label: string; value: React.ReactNode }[] = [
        { label: "Brand", value: unit.laptop?.brand || "—" },
        { label: "CPU", value: unit.laptop?.cpu || "—" },
        { label: "Display", value: unit.laptop?.display || "—" },
        {
            label: "Grade", value: (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${GRADE_BADGE[unit.grade] || ""}`}>
                    <GradeIcon size={12} /> Grade {unit.grade}
                </span>
            )
        },
        ...(unit.being_prepared ? [{
            label: "Status Penyiapan", value: (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-orange-50 text-orange-700 border-orange-200">
                    <Wrench size={12} /> Sedang Disiapkan{unit.preparing_order_number ? ` (${unit.preparing_order_number})` : ""}
                </span>
            )
        }] : []),
        { label: "Harga Jual", value: <span className="font-bold text-gray-800">{fmt(unit.selling_price)}</span> },
        { label: "Kondisi", value: unit.condition_note || "—" },
        { label: "Catatan", value: unit.notes || "—" },
    ];

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center animate-fadeIn">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl ring-1 ring-black/5 flex flex-col max-h-[92dvh] sm:mx-4 overflow-hidden animate-slideUp">
                <div className={`${BRAND_GRADIENT} px-5 py-5 flex-shrink-0`}>
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <h3 className="font-bold text-white truncate text-[15px]">{unit.laptop?.laptop_name || "—"}</h3>
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                                <code className="font-mono text-[11px] text-gray-100 bg-white/10 ring-1 ring-white/10 px-2 py-0.5 rounded-md">{unit.serial_number}</code>
                                {st && (
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${st.badge}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} /> {st.label}
                                    </span>
                                )}
                            </div>
                        </div>
                        <button onClick={onClose} className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/20 transition active:scale-95">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                </div>

                <div className="overflow-y-auto flex-1 px-5 py-4">
                    <div className="bg-gray-50 rounded-2xl border border-gray-100 divide-y divide-gray-100">
                        {rows.map(row => (
                            <div key={row.label} className="flex items-center justify-between gap-3 px-4 py-3">
                                <span className="text-xs text-gray-400 flex-shrink-0">{row.label}</span>
                                <span className="text-xs font-medium text-gray-700 text-right">{row.value}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0">
                    <button onClick={onClose} className="w-full h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition active:scale-[0.98]">Tutup</button>
                </div>
            </div>
        </div>
    );
}

// ─── ConditionViewModal — "Cek Kondisi" read-only per SN ───────────────────────
function ConditionViewModal({ unit, checks, checkedBy, checkedAt, loading, onClose }: {
    unit: LaptopUnit; checks: ConditionChecks; checkedBy?: string | null; checkedAt?: string | null; loading: boolean; onClose: () => void;
}) {
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center animate-fadeIn">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl ring-1 ring-black/5 flex flex-col max-h-[92dvh] sm:mx-4 overflow-hidden animate-slideUp">
                <div className={`${BRAND_GRADIENT} px-5 py-5 flex-shrink-0`}>
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <h3 className="font-bold text-white truncate flex items-center gap-2">
                                <ClipboardList size={16} className="flex-shrink-0 text-white/80" /> Cek Kondisi
                            </h3>
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                                <span className="text-xs text-gray-200 truncate">{unit.laptop?.laptop_name || "—"}</span>
                                <code className="font-mono text-[11px] text-gray-100 bg-white/10 ring-1 ring-white/10 px-2 py-0.5 rounded-md">{unit.serial_number}</code>
                            </div>
                        </div>
                        <button onClick={onClose} className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/20 transition active:scale-95">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                </div>

                <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-10 gap-3">
                            <div className="w-6 h-6 border-2 border-violet-200 border-t-violet-500 rounded-full animate-spin" />
                            <p className="text-sm text-gray-400">Memuat kondisi...</p>
                        </div>
                    ) : (
                        <>
                            {checkedBy ? (
                                <p className="text-[11px] text-gray-500 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5">
                                    Diisi oleh <span className="font-semibold text-gray-700">{checkedBy}</span>
                                    {checkedAt && <> · {new Date(checkedAt).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</>}
                                </p>
                            ) : (
                                <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                                    Tes kondisi unit ini belum diisi oleh penanggung jawab.
                                </p>
                            )}
                            <ConditionChecklist value={checks} onChange={() => {}} readOnly />
                        </>
                    )}
                </div>

                <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0">
                    <button onClick={onClose} className="w-full h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition active:scale-[0.98]">Tutup</button>
                </div>
            </div>
        </div>
    );
}

// ─── SkeletonRows ─────────────────────────────────────────────────────────────
function SkeletonRows() {
    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm ring-1 ring-black/[0.02] overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                            {["No", "Laptop", "CPU", "RAM", "Storage", "Harga Jual", "SN", "Aksi"].map(h => (
                                <th key={h} className="px-4 py-3.5 text-left">
                                    <div className="h-2.5 bg-gray-200 rounded-full w-16 animate-pulse" />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {[...Array(6)].map((_, i) => (
                            <tr key={i} style={{ opacity: 1 - i * 0.13 }}>
                                {[...Array(8)].map((_, j) => (
                                    <td key={j} className="px-4 py-3.5"><div className="h-3 bg-gray-100 rounded-full w-16 animate-pulse" /></td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon, color, bg, bar, dark = false }: {
    label: string; value: number; icon: React.ReactNode; color: string; bg: string; bar: string; dark?: boolean;
}) {
    return (
        <div className={`${bg} rounded-2xl border ${dark ? "border-white/10" : "border-gray-100"} shadow-sm ring-1 ${dark ? "ring-white/5 shadow-lg shadow-[#1a1545]/25" : "ring-black/[0.02]"} hover:shadow-lg ${dark ? "" : "hover:ring-black/5"} transition-all duration-300 p-3 sm:p-5 relative overflow-hidden group hover:-translate-y-1`}>
            <div className={`absolute -top-8 -right-8 w-24 h-24 rounded-full ${dark ? "bg-white/[0.06]" : "bg-black/[0.015]"} blur-2xl`} />
            <div className={`absolute bottom-0 left-0 right-0 h-1 ${bar} opacity-60 group-hover:opacity-100 transition-opacity`} />
            <div className="relative flex items-start justify-between gap-1.5 sm:gap-3">
                <div className="min-w-0">
                    <p className={`text-[9px] sm:text-[10px] font-bold ${dark ? "text-white/60" : "text-gray-400"} uppercase tracking-wider leading-none mb-1.5 sm:mb-2.5 truncate`}>{label}</p>
                    <p className={`text-2xl sm:text-3xl font-black tracking-tight leading-none tabular-nums ${color}`}>{value}</p>
                </div>
                <div className={`w-8 h-8 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl ${dark ? "bg-white/15 ring-1 ring-white/10" : bar} flex items-center justify-center flex-shrink-0 shadow-md opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all`}>
                    <span className="scale-75 sm:scale-100 flex items-center justify-center">{icon}</span>
                </div>
            </div>
        </div>
    );
}

// ─── TotalBar ─────────────────────────────────────────────────────────────────
function TotalBar({ totalSelling, count }: { totalSelling: number; count: number }) {
    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm ring-1 ring-black/[0.02] px-4 sm:px-6 py-4 sm:py-5 flex divide-x divide-gray-100 animate-fadeUp">
            <div className="flex-1 pr-3 sm:pr-6 flex items-center gap-2.5 sm:gap-3 min-w-0">
                <div className={`w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl ${BRAND_GRADIENT} flex items-center justify-center flex-shrink-0 shadow-md shadow-[#1a1545]/20`}>
                    <Laptop size={16} className="text-white" />
                </div>
                <div className="min-w-0">
                    <p className="text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Total Unit (difilter)</p>
                    <p className="text-xl sm:text-3xl font-black bg-gradient-to-r from-[#1a1545] to-[#0f0c29] bg-clip-text text-transparent tabular-nums">{count}</p>
                </div>
            </div>
            <div className="flex-1 pl-3 sm:pl-6 flex items-center gap-2.5 sm:gap-3 min-w-0">
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
                </div>
                <div className="min-w-0">
                    <p className="text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Total Harga Jual</p>
                    <p className="text-base sm:text-2xl font-black text-amber-600 tabular-nums truncate">{fmt(totalSelling)}</p>
                </div>
            </div>
        </div>
    );
}

// ─── Export helpers ───────────────────────────────────────────────────────────
type ExportColDef = { header: string; width: number; align: "left" | "center" | "right"; numFmt?: string };

async function buildAndDownloadExcel(opts: {
    sheetName: string; tableName: string; fileSuffix: string; colDefs: ExportColDef[]; rows: (string | number)[][];
}) {
    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    wb.creator = "Solit POS";
    wb.created = new Date();

    const ws = wb.addWorksheet(opts.sheetName, { pageSetup: { fitToPage: true, fitToWidth: 1, orientation: "landscape" } });
    ws.addTable({
        name: opts.tableName, ref: "A1", headerRow: true, totalsRow: false,
        style: { theme: "TableStyleMedium7", showRowStripes: true },
        columns: opts.colDefs.map((c) => ({ name: c.header, filterButton: true })),
        rows: opts.rows,
    });
    opts.colDefs.forEach((col, colIdx) => { ws.getColumn(colIdx + 1).width = col.width; });
    ws.eachRow((row, rowNumber) => {
        row.height = rowNumber === 1 ? 28 : 22;
        row.eachCell((cell, colNumber) => {
            const colDef = opts.colDefs[colNumber - 1];
            if (rowNumber > 1 && colDef) {
                cell.alignment = { vertical: "middle", horizontal: colDef.align };
                if (colDef.numFmt) cell.numFmt = colDef.numFmt;
            }
        });
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    a.download = `${opts.fileSuffix}_${dateStr}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function groupUnitsByLaptop(list: LaptopUnit[], getPrice: (u: LaptopUnit) => number) {
    const map = new Map<string, { laptop_name: string; brand: string; cpu: string; ram: string; storage: string; qty: number; priceSum: number; priceCount: number; }>();
    list.forEach(u => {
        const key = u.laptop_id || u.laptop?.laptop_name || "unknown";
        const price = Number(getPrice(u)) || 0;
        const row = map.get(key);
        if (row) {
            row.qty += 1;
            if (price > 0) { row.priceSum += price; row.priceCount += 1; }
        } else {
            map.set(key, {
                laptop_name: u.laptop?.laptop_name ?? "—", brand: u.laptop?.brand ?? "—",
                cpu: u.laptop?.cpu ?? "—", ram: u.laptop?.ram ?? "—", storage: u.laptop?.storage ?? "—",
                qty: 1, priceSum: price > 0 ? price : 0, priceCount: price > 0 ? 1 : 0,
            });
        }
    });
    return Array.from(map.values());
}

function ExportButton({ label, colorClass, loading, disabled, noData, onClick }: {
    label: string; colorClass: string; loading: boolean; disabled: boolean; noData: boolean; onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={noData ? "Tidak ada data untuk di-export" : label}
            className={`flex items-center gap-1.5 text-xs font-semibold h-9 px-2.5 sm:px-3.5 rounded-xl border shadow-sm transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 ${colorClass}`}
        >
            {loading ? (
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
            ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
            )}
            <span className="hidden sm:inline">{loading ? "Mengexport..." : label}</span>
        </button>
    );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
    return (
        <span className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-lg text-[11px] font-semibold bg-violet-50 text-violet-700 border border-violet-100 shadow-sm animate-fadeIn">
            {label}
            <button onClick={onRemove} className="hover:bg-violet-100 rounded p-0.5 transition">
                <svg className="w-3 h-3 text-violet-400 hover:text-violet-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </span>
    );
}

const SORT_LABELS: Record<string, string> = {
    DEFAULT: "Urutan Default", AZ: "Nama: A → Z", ZA: "Nama: Z → A",
    PRICE_ASC: "Harga: Rendah → Tinggi", PRICE_DESC: "Harga: Tinggi → Rendah", SN: "Urut SN",
};

// ─── Main ─────────────────────────────────────────────────────────────────────
function MinusSiapJualContent() {
    const [units, setUnits] = useState<LaptopUnit[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [exportingType, setExportingType] = useState<"sn" | "qty" | null>(null);
    const [userRole, setUserRole] = useState<UserRole | null>(null);

    const [search, setSearch] = useState("");
    const [filterSN, setFilterSN] = useState("");
    const [filterBrand, setFilterBrand] = useState("ALL");
    const [filterRam, setFilterRam] = useState("ALL");
    const [filterPriceRange, setFilterPriceRange] = useState("ALL");
    const [filterPrepared, setFilterPrepared] = useState("ALL"); // ALL | YES | NO
    const [sortBy, setSortBy] = useState("DEFAULT");

    const [alertMsg, setAlertMsg] = useState<string | null>(null);
    const [detailUnit, setDetailUnit] = useState<LaptopUnit | null>(null);

    const canViewUnits = userRole ? hasPermission(userRole, PERMISSIONS.VIEW_UNITS) : false;

    const [conditionUnit, setConditionUnit] = useState<LaptopUnit | null>(null);
    const [conditionData, setConditionData] = useState<{ checks: ConditionChecks; by?: string | null; at?: string | null } | null>(null);
    const [conditionLoading, setConditionLoading] = useState(false);

    const openCondition = async (u: LaptopUnit) => {
        setConditionUnit(u);
        setConditionData(null);
        setConditionLoading(true);
        try {
            const res = await fetch(`/api/laptops/${u.laptop_id}/units`);
            const json = await res.json();
            const found = (json.data ?? []).find((x: { id: string }) => x.id === u.id);
            setConditionData({
                checks: sanitizeConditionChecks(found?.condition_checks),
                by: found?.condition_checked_by ?? null,
                at: found?.condition_checked_at ?? null,
            });
        } catch {
            setConditionData({ checks: {}, by: null, at: null });
        } finally {
            setConditionLoading(false);
        }
    };

    useEffect(() => {
        getAuthUser().then(u => setUserRole(u?.role ?? null)).catch(() => setUserRole(null));
    }, []);

    const fetchUnits = async () => {
        setIsLoading(true);
        try {
            const res = await fetch("/api/laptops/minus-siap-jual-units");
            const result = await res.json();
            if (result.success) {
                setUnits((result.data || []).map((u: LaptopUnit) => ({
                    ...u,
                    purchase_price: Math.round(Number(u.purchase_price) || 0),
                    selling_price: Math.round(Number(u.selling_price) || 0),
                })));
            }
        } catch { setUnits([]); }
        finally { setIsLoading(false); }
    };

    useEffect(() => { fetchUnits(); }, []);

    const uniqueBrands = useMemo(() => {
        const b = new Set(units.map(u => u.laptop?.brand).filter(Boolean) as string[]);
        return ["ALL", ...Array.from(b)];
    }, [units]);

    const uniqueRams = useMemo(() => {
        const r = new Set(units.map(u => u.laptop?.ram).filter(Boolean) as string[]);
        return ["ALL", ...Array.from(r).sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0))];
    }, [units]);

    const handleSort = (asc: string, desc: string) => setSortBy(prev => (prev === asc ? desc : asc));

    const filtered = useMemo(() => {
        let list = [...units];
        if (search.trim()) {
            const t = search.toLowerCase();
            list = list.filter(u =>
                u.laptop?.laptop_name?.toLowerCase().includes(t) ||
                u.laptop?.brand?.toLowerCase().includes(t) ||
                u.laptop?.cpu?.toLowerCase().includes(t) ||
                u.laptop?.ram?.toLowerCase().includes(t) ||
                u.laptop?.storage?.toLowerCase().includes(t)
            );
        }
        if (filterSN.trim()) {
            const snQ = filterSN.trim().toLowerCase();
            const matchedGroupIds = new Set(
                units.filter(u => u.serial_number?.toLowerCase().includes(snQ)).map(u => u.laptop_id).filter(Boolean)
            );
            list = list.filter(u => u.laptop_id && matchedGroupIds.has(u.laptop_id));
        }
        if (filterBrand !== "ALL") list = list.filter(u => u.laptop?.brand === filterBrand);
        if (filterRam !== "ALL") list = list.filter(u => u.laptop?.ram === filterRam);
        if (filterPriceRange !== "ALL") {
            const ranges: Record<string, [number, number]> = {
                "1-2": [1_000_000, 2_000_000], "2-3": [2_000_000, 3_000_000],
                "3-4": [3_000_000, 4_000_000], "4+": [4_000_000, Infinity],
            };
            const [min, max] = ranges[filterPriceRange] ?? [0, Infinity];
            list = list.filter(u => u.selling_price >= min && u.selling_price < max);
        }
        if (filterPrepared === "YES") list = list.filter(u => u.being_prepared);
        else if (filterPrepared === "NO") list = list.filter(u => !u.being_prepared);

        switch (sortBy) {
            case "AZ": list.sort((a, b) => (a.laptop?.laptop_name || "").localeCompare(b.laptop?.laptop_name || "", "id")); break;
            case "ZA": list.sort((a, b) => (b.laptop?.laptop_name || "").localeCompare(a.laptop?.laptop_name || "", "id")); break;
            case "PRICE_ASC": list.sort((a, b) => (a.selling_price || 0) - (b.selling_price || 0)); break;
            case "PRICE_DESC": list.sort((a, b) => (b.selling_price || 0) - (a.selling_price || 0)); break;
            case "SN": list.sort((a, b) => (a.serial_number || "").localeCompare(b.serial_number || "", undefined, { numeric: true })); break;
            default: list.sort((a, b) => (a.laptop?.laptop_name ?? "").localeCompare(b.laptop?.laptop_name ?? "", "id"));
        }
        return list;
    }, [units, search, filterSN, filterBrand, filterRam, filterPriceRange, filterPrepared, sortBy]);

    const counts = {
        all: units.length,
        prepared: units.filter(u => u.being_prepared).length,
        ready: units.filter(u => !u.being_prepared).length,
    };

    const totalSelling = useMemo(() => filtered.reduce((sum, u) => sum + (u.selling_price || 0), 0), [filtered]);

    const exportSN = async () => {
        if (filtered.length === 0) return;
        setExportingType("sn");
        try {
            const colDefs: ExportColDef[] = [
                { header: "No", width: 6, align: "center" },
                { header: "Nama Laptop", width: 36, align: "left" },
                { header: "Brand", width: 14, align: "left" },
                { header: "CPU", width: 22, align: "left" },
                { header: "Display", width: 20, align: "left" },
                { header: "Serial Number", width: 24, align: "center" },
                { header: "Grade", width: 12, align: "center" },
                { header: "Harga Jual", width: 18, align: "right", numFmt: '"Rp "#,##0' },
                { header: "Kondisi", width: 26, align: "left" },
                { header: "Catatan", width: 30, align: "left" },
            ];
            const rows = filtered.map((u, idx) => [
                idx + 1, u.laptop?.laptop_name ?? "—", u.laptop?.brand ?? "—", u.laptop?.cpu ?? "—",
                u.laptop?.display ?? "—", u.serial_number ?? "—", `Grade ${u.grade}`,
                u.selling_price || 0, u.condition_note ?? "—", u.notes ?? "—",
            ]);
            await buildAndDownloadExcel({ sheetName: "Minus Siap Jual - SN", tableName: "TabelMinusSiapJualSN", fileSuffix: "MinusSiapJual_SN", colDefs, rows });
        } catch (err) {
            console.error("Export SN gagal:", err);
            setAlertMsg("Gagal export Excel. Coba lagi.");
        } finally { setExportingType(null); }
    };

    const exportQty = async () => {
        if (filtered.length === 0) return;
        setExportingType("qty");
        try {
            const groups = groupUnitsByLaptop(filtered, u => u.selling_price ?? 0);
            const colDefs: ExportColDef[] = [
                { header: "No", width: 6, align: "center" },
                { header: "Nama Laptop", width: 36, align: "left" },
                { header: "Brand", width: 14, align: "left" },
                { header: "CPU", width: 22, align: "left" },
                { header: "RAM", width: 10, align: "center" },
                { header: "Storage", width: 16, align: "center" },
                { header: "Qty", width: 8, align: "center" },
                { header: "Harga Jual", width: 18, align: "right", numFmt: '"Rp "#,##0' },
                { header: "Total", width: 20, align: "right", numFmt: '"Rp "#,##0' },
            ];
            const rows = groups.map((g, idx) => {
                const avgPrice = g.priceCount > 0 ? Math.round(g.priceSum / g.priceCount) : 0;
                return [idx + 1, g.laptop_name, g.brand, g.cpu, g.ram, g.storage, g.qty, avgPrice, avgPrice * g.qty];
            });
            await buildAndDownloadExcel({ sheetName: "Minus Siap Jual - Qty", tableName: "TabelMinusSiapJualQty", fileSuffix: "MinusSiapJual_Qty", colDefs, rows });
        } catch (err) {
            console.error("Export Qty gagal:", err);
            setAlertMsg("Gagal export Excel. Coba lagi.");
        } finally { setExportingType(null); }
    };

    const hasActiveFilter =
        search.trim() !== "" || filterSN.trim() !== "" || filterBrand !== "ALL" ||
        filterRam !== "ALL" || filterPriceRange !== "ALL" || filterPrepared !== "ALL" || sortBy !== "DEFAULT";

    const resetFilters = () => {
        setSearch(""); setFilterSN(""); setFilterBrand("ALL"); setFilterRam("ALL");
        setFilterPriceRange("ALL"); setFilterPrepared("ALL"); setSortBy("DEFAULT");
    };

    const tableRows: InventoryRow[] = filtered.map(u => ({
        id: u.id,
        laptop_name: u.laptop?.laptop_name ?? "—",
        cpu: u.laptop?.cpu ?? "",
        ram: u.laptop?.ram ?? "",
        storage: u.laptop?.storage ?? "",
        harga_modal: null,
        harga_jual: u.selling_price ?? 0,
        sumber: null,
        tanggal_masuk: null,
        sn: u.serial_number,
        stok_tersisa: 0,
        siap_jual: 1,
        minus: 0,
        is_new: isNewArrival(u.created_at),
    }));

    const SelectArrow = () => (
        <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
    );

    return (
        <>
            <style>{`
                @keyframes fadeIn  { from { opacity:0; transform:scale(0.95) }  to { opacity:1; transform:scale(1) } }
                @keyframes scaleIn { from { opacity:0; transform:scale(0.9) }   to { opacity:1; transform:scale(1) } }
                @keyframes slideIn { from { opacity:0; transform:translateX(-24px) } to { opacity:1; transform:translateX(0) } }
                @keyframes fadeUp  { from { opacity:0; transform:translateY(12px) }  to { opacity:1; transform:translateY(0) } }
                @keyframes slideUp { from { opacity:0; transform:translateY(100%) }  to { opacity:1; transform:translateY(0) } }
                .animate-fadeIn  { animation: fadeIn  0.25s ease-out; }
                .animate-scaleIn { animation: scaleIn 0.2s  ease-out; }
                .animate-slideIn { animation: slideIn 0.35s ease-out; }
                .animate-fadeUp  { animation: fadeUp  0.35s ease-out; }
                .animate-slideUp { animation: slideUp 0.3s  ease-out; }
                .table-scroll { scrollbar-width:thin; scrollbar-color:#cbd5e1 #f1f5f9; }
                .table-scroll::-webkit-scrollbar { height:6px; }
                .table-scroll::-webkit-scrollbar-track { background:#f8fafc; border-radius:10px; }
                .table-scroll::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:10px; }
                .scrollbar-hide::-webkit-scrollbar { display: none; }
                .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>

            <main className="min-h-screen bg-gradient-to-b from-[#F7F7F8] via-[#F7F7F8] to-[#ECECF0] p-3 sm:p-6 lg:p-8">
                <div className="max-w-full mx-auto space-y-3 sm:space-y-5 lg:space-y-6">

                    {/* ── Header ── */}
                    <div className="flex items-center justify-between gap-2 sm:gap-3 animate-slideIn">
                        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                            <div className={`w-1.5 h-9 sm:h-10 rounded-full ${BRAND_GRADIENT} flex-shrink-0`} />
                            <div className={`w-9 h-9 sm:w-11 sm:h-11 ${BRAND_GRADIENT} rounded-2xl flex items-center justify-center shadow-lg shadow-[#1a1545]/25 flex-shrink-0`}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                    <rect x="2" y="3" width="20" height="14" rx="2" />
                                    <line x1="8" y1="21" x2="16" y2="21" />
                                    <line x1="12" y1="17" x2="12" y2="21" />
                                    <line x1="8" y1="10" x2="16" y2="10" />
                                </svg>
                            </div>
                            <div className="min-w-0">
                                <h1 className="text-lg sm:text-2xl font-black text-gray-900 tracking-tight truncate">Minus Siap Jual</h1>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    {!isLoading && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />}
                                    <p className="text-[11px] sm:text-xs text-gray-400 font-medium truncate">
                                        {isLoading ? "Memuat data..." : `${units.length} unit terdaftar`}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 overflow-x-auto scrollbar-hide max-w-[58vw] sm:max-w-none">
                            <ExportButton
                                label="Export SN"
                                colorClass="text-emerald-700 hover:text-emerald-900 border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
                                loading={exportingType === "sn"} disabled={exportingType !== null || filtered.length === 0}
                                noData={filtered.length === 0} onClick={exportSN}
                            />
                            <ExportButton
                                label="Export Qty"
                                colorClass="text-amber-700 hover:text-amber-900 border-amber-200 bg-amber-50 hover:bg-amber-100"
                                loading={exportingType === "qty"} disabled={exportingType !== null || filtered.length === 0}
                                noData={filtered.length === 0} onClick={exportQty}
                            />
                            <button
                                onClick={fetchUnits}
                                className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 border border-gray-200 bg-white hover:bg-gray-50 shadow-sm h-9 px-2.5 sm:px-3.5 rounded-xl transition-all active:scale-[0.97] group flex-shrink-0"
                            >
                                <svg className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                <span className="hidden sm:inline">Refresh</span>
                            </button>
                        </div>
                    </div>

                    {/* ── Stat Cards ── */}
                    <div className="grid grid-cols-3 gap-2 sm:gap-3 animate-fadeUp">
                        <StatCard dark label="Total Unit" value={counts.all} icon={<Laptop size={18} className="text-white" />} color="text-white" bg={BRAND_GRADIENT} bar="bg-white/25" />
                        <StatCard label="Sedang Disiapkan" value={counts.prepared} icon={<Wrench size={18} className="text-white" />} color="text-orange-600" bg="bg-orange-50" bar="bg-orange-500" />
                        <StatCard label="Siap / Belum Disiapkan" value={counts.ready} icon={<AlertTriangle size={18} className="text-white" />} color="text-amber-600" bg="bg-amber-50" bar="bg-amber-500" />
                    </div>

                    {/* ── Filter ── */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm ring-1 ring-black/[0.02] p-3.5 sm:p-4 space-y-3">
                        <div className="flex items-center gap-2">
                            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L14 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 019 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                            </svg>
                            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Filter &amp; Pencarian</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                            <div className="relative col-span-1 sm:col-span-2 lg:col-span-1">
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input type="text" placeholder="Cari nama, brand, CPU, RAM, storage..." value={search} onChange={e => setSearch(e.target.value)} className={`${fieldBase} pl-8 pr-3`} />
                            </div>
                            <div className="relative col-span-1 sm:col-span-2 lg:col-span-1">
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                                </svg>
                                <input type="text" placeholder="Cari Serial Number..." value={filterSN} onChange={e => setFilterSN(e.target.value)} className={`${fieldBase} pl-8 pr-3`} />
                            </div>
                            <div className="relative">
                                <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} className={selectCls}>
                                    {uniqueBrands.map(b => <option key={b} value={b}>{b === "ALL" ? "Semua Brand" : b}</option>)}
                                </select>
                                <SelectArrow />
                            </div>
                            <div className="relative">
                                <select value={filterRam} onChange={e => setFilterRam(e.target.value)} className={selectCls}>
                                    {uniqueRams.map(r => <option key={r} value={r}>{r === "ALL" ? "Semua RAM" : `RAM ${r}`}</option>)}
                                </select>
                                <SelectArrow />
                            </div>
                            <div className="relative">
                                <select value={filterPriceRange} onChange={e => setFilterPriceRange(e.target.value)} className={selectCls}>
                                    <option value="ALL">Semua Harga</option>
                                    <option value="1-2">Rp 1 jt – 2 jt</option>
                                    <option value="2-3">Rp 2 jt – 3 jt</option>
                                    <option value="3-4">Rp 3 jt – 4 jt</option>
                                    <option value="4+">Rp 4 jt ke atas</option>
                                </select>
                                <SelectArrow />
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2.5">
                            <div className="relative">
                                <select value={filterPrepared} onChange={e => setFilterPrepared(e.target.value)} className={`${selectCls} w-auto min-w-[180px]`}>
                                    <option value="ALL">Semua Status Penyiapan</option>
                                    <option value="YES">🔧 Sedang Disiapkan</option>
                                    <option value="NO">Belum/Tidak Disiapkan</option>
                                </select>
                                <SelectArrow />
                            </div>
                            <div className="relative">
                                <select value={sortBy} onChange={e => setSortBy(e.target.value)} className={`${selectCls} w-auto min-w-[180px]`}>
                                    <option value="DEFAULT">Urutan Default</option>
                                    <option value="AZ">Nama: A → Z</option>
                                    <option value="ZA">Nama: Z → A</option>
                                    <option value="PRICE_ASC">Harga: Rendah → Tinggi</option>
                                    <option value="PRICE_DESC">Harga: Tinggi → Rendah</option>
                                    <option value="SN">Urut SN</option>
                                </select>
                                <SelectArrow />
                            </div>
                            {hasActiveFilter && (
                                <button onClick={resetFilters} className="h-10 px-3.5 bg-gray-100 text-gray-600 rounded-xl text-xs font-semibold hover:bg-gray-200 transition flex items-center gap-1.5 active:scale-[0.97] flex-shrink-0">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                    Reset
                                </button>
                            )}
                        </div>

                        {hasActiveFilter && (
                            <div className="flex flex-wrap gap-1.5 pt-2.5 border-t border-gray-50">
                                {search && <FilterChip label={`Cari: "${search}"`} onRemove={() => setSearch("")} />}
                                {filterSN && <FilterChip label={`SN: "${filterSN}"`} onRemove={() => setFilterSN("")} />}
                                {filterBrand !== "ALL" && <FilterChip label={`Brand: ${filterBrand}`} onRemove={() => setFilterBrand("ALL")} />}
                                {filterRam !== "ALL" && <FilterChip label={`RAM: ${filterRam}`} onRemove={() => setFilterRam("ALL")} />}
                                {filterPriceRange !== "ALL" && <FilterChip label={filterPriceRange === "4+" ? "≥ Rp 4 jt" : `Rp ${filterPriceRange} jt`} onRemove={() => setFilterPriceRange("ALL")} />}
                                {filterPrepared !== "ALL" && <FilterChip label={filterPrepared === "YES" ? "Sedang Disiapkan" : "Belum Disiapkan"} onRemove={() => setFilterPrepared("ALL")} />}
                                {sortBy !== "DEFAULT" && <FilterChip label={`Sort: ${SORT_LABELS[sortBy] ?? sortBy}`} onRemove={() => setSortBy("DEFAULT")} />}
                            </div>
                        )}
                    </div>

                    {/* ── Table ── */}
                    {isLoading ? (
                        <SkeletonRows />
                    ) : filtered.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm ring-1 ring-black/[0.02] flex flex-col items-center justify-center py-16 sm:py-20 gap-3">
                            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gray-100 flex items-center justify-center">
                                <Laptop size={32} className="text-gray-300" />
                            </div>
                            <div className="text-center px-4">
                                <p className="text-gray-600 font-bold text-sm">Tidak ada unit ditemukan</p>
                                <p className="text-gray-400 text-xs mt-1">
                                    {hasActiveFilter ? "Coba ubah atau reset filter di atas" : "Belum ada unit berstatus Minus Siap Jual"}
                                </p>
                            </div>
                            {hasActiveFilter && (
                                <button onClick={resetFilters} className="mt-1 h-9 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold transition active:scale-[0.97]">Reset Filter</button>
                            )}
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm ring-1 ring-black/[0.02] overflow-hidden">
                            <div className="overflow-x-auto table-scroll">
                                <InventoryTable
                                    rows={tableRows}
                                    canSeePrivate={false}
                                    canSeeStock={false}
                                    sortBy={sortBy}
                                    onSort={handleSort}
                                    onRowClick={(row) => {
                                        const u = filtered.find(x => x.id === row.id);
                                        if (u) setDetailUnit(u);
                                    }}
                                    renderActions={(row) => {
                                        const u = filtered.find(x => x.id === row.id);
                                        if (!u) return null;
                                        const st = STATUS_CONFIG[u.status];
                                        return (
                                            <div className="flex items-center gap-1.5">
                                                {canViewUnits && (
                                                    <button
                                                        onClick={() => openCondition(u)}
                                                        title="Lihat hasil tes kondisi unit ini"
                                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition active:scale-95 whitespace-nowrap"
                                                    >
                                                        <ClipboardList size={12} /> Cek Kondisi
                                                    </button>
                                                )}
                                                {st && (
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border whitespace-nowrap ${st.badge}`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${st.dot}`} />
                                                        {st.label}
                                                    </span>
                                                )}
                                                {u.being_prepared && (
                                                    <span
                                                        title={u.preparing_order_number ? `Sedang di penyiapan ${u.preparing_order_number}` : undefined}
                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border whitespace-nowrap bg-orange-50 text-orange-700 border-orange-200"
                                                    >
                                                        <Wrench size={10} className="flex-shrink-0" /> Sedang Disiapkan
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    }}
                                />
                            </div>

                            <div className="px-3 sm:px-4 py-3 border-t border-gray-100 bg-gray-50/60 flex flex-wrap items-center justify-between gap-2 sm:gap-3">
                                <p className="text-xs text-gray-400">
                                    Menampilkan <span className="font-bold text-gray-600">{filtered.length}</span> dari <span className="font-bold text-gray-600">{units.length}</span> unit
                                    {hasActiveFilter && <span className="ml-1 text-gray-400">(difilter)</span>}
                                </p>
                            </div>
                        </div>
                    )}

                    {!isLoading && filtered.length > 0 && <TotalBar totalSelling={totalSelling} count={filtered.length} />}
                </div>
            </main>

            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
            {detailUnit && <UnitInfoModal unit={detailUnit} onClose={() => setDetailUnit(null)} />}
            {conditionUnit && (
                <ConditionViewModal
                    unit={conditionUnit}
                    checks={conditionData?.checks ?? {}}
                    checkedBy={conditionData?.by}
                    checkedAt={conditionData?.at}
                    loading={conditionLoading}
                    onClose={() => { setConditionUnit(null); setConditionData(null); }}
                />
            )}
        </>
    );
}

export default function MinusSiapJualPage() {
    return (
        <DashboardLayout>
            <MinusSiapJualContent />
        </DashboardLayout>
    );
}