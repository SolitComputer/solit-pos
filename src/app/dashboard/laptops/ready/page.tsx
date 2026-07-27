"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { UserRole, PERMISSIONS, hasPermission } from "@/lib/permissions";
import InventoryTable, { InventoryRow } from "@/components/inventory/InventoryTable";
import { Laptop, CheckCircle2, Lock, Trophy, ThumbsUp, AlertTriangle, Camera } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────
interface LaptopUnit {
    id: string;
    laptop_id: string;
    serial_number: string;
    grade: "A" | "B" | "C";
    condition_note: string;
    purchase_price: number;
    selling_price: number;
    status: string;
    notes: string;
    created_at: string;
    reserved_by?: string;
    reserved_invoice?: string;
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

// ── Badge "NEW" — Barang Baru Masuk ─────────────────────────────────────────
// Sama pola dengan LaptopsContent.tsx (Data Barang) — dihitung read-time dari
// created_at unit, TTL 3 hari, tanpa perlu cron job untuk "matiin" badge-nya.
const NEW_BADGE_TTL_DAYS = 3;
const NEW_BADGE_TTL_MS = NEW_BADGE_TTL_DAYS * 24 * 60 * 60 * 1000;
const isNewArrival = (createdAt?: string | null) =>
    !!createdAt && Date.now() - new Date(createdAt).getTime() < NEW_BADGE_TTL_MS;

const GRADE_BADGE: Record<string, string> = {
    A: "bg-emerald-50 text-emerald-700 border-emerald-200",
    B: "bg-amber-50 text-amber-700 border-amber-200",
    C: "bg-red-50 text-red-700 border-red-200",
};

// Hanya SIAP_JUAL & RESERVED yang tampil di halaman ini — status HELD/PACKING
// dihilangkan karena sudah bisa dilihat lewat halaman Transaksi.
const STATUS_CONFIG: Record<string, { badge: string; dot: string; label: string }> = {
    SIAP_JUAL: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", label: "Siap Jual" },
    RESERVED: { badge: "bg-violet-50 text-violet-700 border-violet-200", dot: "bg-violet-500", label: "Dipesan (DP)" },
};

const selectCls = "h-9 border border-gray-200 rounded-xl px-3 text-xs bg-gray-50 text-gray-700 focus:outline-none focus:border-gray-400 transition cursor-pointer font-medium w-full";

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
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center animate-scaleIn">
                <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-7 h-7 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <p className="text-gray-700 text-sm font-medium mb-5">{message}</p>
                <button onClick={onClose} className="w-full h-11 bg-gray-800 text-white rounded-xl text-sm font-semibold hover:bg-gray-900 transition-all duration-200 shadow-md">OK</button>
            </div>
        </div>
    );
}

// ─── UnitInfoModal — pop-up detail saat item diklik ────────────────────────────
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
        { label: "Harga Jual", value: <span className="font-bold text-gray-800">{fmt(unit.selling_price)}</span> },
        { label: "Kondisi", value: unit.condition_note || "—" },
        { label: "Catatan", value: unit.notes || "—" },
    ];

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center animate-fadeIn">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] sm:mx-4 overflow-hidden animate-slideUp">
                <div className="bg-gray-800 px-5 py-4 flex-shrink-0">
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <h3 className="font-bold text-white truncate">{unit.laptop?.laptop_name || "—"}</h3>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <code className="font-mono text-[11px] text-gray-200 bg-white/10 px-2 py-0.5 rounded-md">{unit.serial_number}</code>
                                {st && (
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${st.badge}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} /> {st.label}
                                    </span>
                                )}
                            </div>
                        </div>
                        <button onClick={onClose} className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/20 transition">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                </div>

                <div className="overflow-y-auto flex-1 px-5 py-4">
                    <div className="bg-gray-50 rounded-xl border border-gray-100 divide-y divide-gray-100">
                        {rows.map(row => (
                            <div key={row.label} className="flex items-center justify-between gap-3 px-4 py-3">
                                <span className="text-xs text-gray-400 flex-shrink-0">{row.label}</span>
                                <span className="text-xs font-medium text-gray-700 text-right">{row.value}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0">
                    <button onClick={onClose} className="w-full h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition">Tutup</button>
                </div>
            </div>
        </div>
    );
}

// ─── SkeletonRows ─────────────────────────────────────────────────────────────
function SkeletonRows() {
    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                            {["No", "Laptop", "CPU", "RAM", "Storage", "Harga Jual", "SN", "SJ", "Aksi"].map(h => (
                                <th key={h} className="px-4 py-3.5 text-left">
                                    <div className="h-2.5 bg-gray-200 rounded-full w-16 animate-pulse" />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {[...Array(6)].map((_, i) => (
                            <tr key={i} style={{ opacity: 1 - i * 0.13 }}>
                                {[...Array(9)].map((_, j) => (
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
// RESPONSIVE FIX: scale down padding, font, icon size di mobile (< sm)
function StatCard({ label, value, icon, color, bg, bar }: {
    label: string; value: number; icon: React.ReactNode;
    color: string; bg: string; bar: string;
}) {
    return (
        <div className={`${bg} rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 p-3 sm:p-5 relative overflow-hidden group hover:-translate-y-0.5`}>
            <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${bar} opacity-50 group-hover:opacity-100 transition-opacity`} />
            <div className="flex items-start justify-between gap-1.5 sm:gap-3">
                <div className="min-w-0">
                    {/* Label lebih kecil di HP agar tidak truncate */}
                    <p className="text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-wider leading-none mb-1.5 sm:mb-2 truncate">{label}</p>
                    {/* Angka scale down: text-xl di HP, text-3xl di desktop */}
                    <p className={`text-xl sm:text-3xl font-black tracking-tight leading-none ${color}`}>{value}</p>
                </div>
                {/* Icon container scale down di HP */}
                <div className={`w-7 h-7 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl ${bar} flex items-center justify-center flex-shrink-0 shadow-sm opacity-80 group-hover:opacity-100 transition-opacity`}>
                    <span className="scale-75 sm:scale-100 flex items-center justify-center">{icon}</span>
                </div>
            </div>
        </div>
    );
}

// ─── TotalBar ─────────────────────────────────────────────────────────────────
// Harga Beli / Margin sengaja tidak ditampilkan di sini.
// RESPONSIVE FIX: hapus flex-wrap + min-w, pakai divide-x konsisten, scale font
function TotalBar({ totalSelling, count }: { totalSelling: number; count: number }) {
    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 sm:px-5 py-3.5 sm:py-4 flex divide-x divide-gray-100 animate-fadeUp">
            <div className="flex-1 pr-4 sm:pr-6">
                <p className="text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Total Unit (difilter)</p>
                <p className="text-xl sm:text-2xl font-black text-gray-900 tabular-nums">{count}</p>
            </div>
            <div className="flex-1 pl-4 sm:pl-6">
                <p className="text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Total Harga Jual</p>
                <p className="text-lg sm:text-xl font-black text-gray-800 tabular-nums">{fmt(totalSelling)}</p>
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const SORT_LABELS: Record<string, string> = {
    DEFAULT: "Urutan Default",
    AZ: "Nama: A → Z",
    ZA: "Nama: Z → A",
    NAMA_ASC: "Nama: A → Z",
    NAMA_DESC: "Nama: Z → A",
    CPU_ASC: "CPU: A → Z",
    CPU_DESC: "CPU: Z → A",
    RAM_ASC: "RAM ↑",
    RAM_DESC: "RAM ↓",
    STORAGE_ASC: "Storage ↑",
    STORAGE_DESC: "Storage ↓",
    PRICE_ASC: "Harga: Rendah → Tinggi",
    PRICE_DESC: "Harga: Tinggi → Rendah",
    SN: "Urut SN",
    SN_ASC: "SN ↑",
    SN_DESC: "SN ↓",
    SIAP_ASC: "Status: Siap Jual Pertama",
    SIAP_DESC: "Status: Dipesan Pertama",
};

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
    return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-gray-100 text-gray-700 border border-gray-200 shadow-sm animate-fadeIn">
            {label}
            <button onClick={onRemove} className="hover:text-gray-900 rounded p-0.5 transition">
                <svg className="w-3 h-3 text-gray-400 hover:text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </span>
    );
}

function ReadyContent() {
    const [units, setUnits] = useState<LaptopUnit[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [userRole, setUserRole] = useState<UserRole | null>(null);

    // ── Filter ────────────────────────────────────────────────────────────────
    const [search, setSearch] = useState("");
    const [filterSN, setFilterSN] = useState("");
    const [filterStatus, setFilterStatus] = useState("ALL");
    const [filterBrand, setFilterBrand] = useState("ALL");
    const [filterRam, setFilterRam] = useState("ALL");
    const [filterPriceRange, setFilterPriceRange] = useState("ALL");
    const [sortBy, setSortBy] = useState("DEFAULT");

    const [alertMsg, setAlertMsg] = useState<string | null>(null);
    const [confirmTarget, setConfirmTarget] = useState<LaptopUnit | null>(null);
    const [confirmedUnitIds, setConfirmedUnitIds] = useState<Set<string>>(new Set());
    const [detailUnit, setDetailUnit] = useState<LaptopUnit | null>(null);

    const isPKL = userRole ? (userRole === "PKL" || userRole.startsWith("PKL_") || userRole.startsWith("PKL-")) : false;
    const canConfirmTx = userRole ? hasPermission(userRole, PERMISSIONS.EDIT_TRANSACTION) && !isPKL : false;

    useEffect(() => {
        fetch("/api/auth/me")
            .then(r => r.json())
            .then(r => setUserRole(r.user?.role ?? null))
            .catch(() => setUserRole(null));
    }, []);

const fetchUnits = async () => {
        setIsLoading(true);
        try {
            const res = await fetch("/api/laptops/ready-units");
            const result = await res.json();
            if (result.success) {
                console.log("DEBUG ready-units raw:", (result.data || []).map((u: LaptopUnit) => ({
                    id: u.id,
                    sn: u.serial_number,
                    created_at: u.created_at,
                    is_new_calc: !!u.created_at && Date.now() - new Date(u.created_at).getTime() < 3 * 24 * 60 * 60 * 1000,
                })));
                const cleaned = (result.data || []).filter((u: LaptopUnit) => u.status === "SIAP_JUAL" || u.status === "RESERVED");
                setUnits(cleaned.map((u: LaptopUnit) => ({
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

    const handleSort = (asc: string, desc: string) => {
        setSortBy(prev => (prev === asc ? desc : asc));
    };

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
            list = list.filter(u => u.serial_number?.toLowerCase().includes(snQ));
        }
        if (filterStatus !== "ALL") {
            list = list.filter(u => u.status === filterStatus);
        }
        if (filterBrand !== "ALL") list = list.filter(u => u.laptop?.brand === filterBrand);
        if (filterRam !== "ALL") list = list.filter(u => u.laptop?.ram === filterRam);
        if (filterPriceRange !== "ALL") {
            const ranges: Record<string, [number, number]> = {
                "1-2": [1_000_000, 2_000_000],
                "2-3": [2_000_000, 3_000_000],
                "3-4": [3_000_000, 4_000_000],
                "4+": [4_000_000, Infinity],
            };
            const [min, max] = ranges[filterPriceRange] ?? [0, Infinity];
            list = list.filter(u => u.selling_price >= min && u.selling_price < max);
        }

        switch (sortBy) {
            case "AZ":
            case "NAMA_ASC":
                list.sort((a, b) => (a.laptop?.laptop_name || "").localeCompare(b.laptop?.laptop_name || "", "id"));
                break;
            case "ZA":
            case "NAMA_DESC":
                list.sort((a, b) => (b.laptop?.laptop_name || "").localeCompare(a.laptop?.laptop_name || "", "id"));
                break;
            case "CPU_ASC":
                list.sort((a, b) => (a.laptop?.cpu || "").localeCompare(b.laptop?.cpu || "", "id"));
                break;
            case "CPU_DESC":
                list.sort((a, b) => (b.laptop?.cpu || "").localeCompare(a.laptop?.cpu || "", "id"));
                break;
            case "RAM_ASC":
                list.sort((a, b) => (a.laptop?.ram || "").localeCompare(b.laptop?.ram || "", "id", { numeric: true }));
                break;
            case "RAM_DESC":
                list.sort((a, b) => (b.laptop?.ram || "").localeCompare(a.laptop?.ram || "", "id", { numeric: true }));
                break;
            case "STORAGE_ASC":
                list.sort((a, b) => (a.laptop?.storage || "").localeCompare(b.laptop?.storage || "", "id", { numeric: true }));
                break;
            case "STORAGE_DESC":
                list.sort((a, b) => (b.laptop?.storage || "").localeCompare(a.laptop?.storage || "", "id", { numeric: true }));
                break;
            case "PRICE_ASC":
                list.sort((a, b) => (a.selling_price || 0) - (b.selling_price || 0));
                break;
            case "PRICE_DESC":
                list.sort((a, b) => (b.selling_price || 0) - (a.selling_price || 0));
                break;
            case "SN":
            case "SN_ASC":
                list.sort((a, b) => (a.serial_number || "").localeCompare(b.serial_number || "", undefined, { numeric: true }));
                break;
            case "SN_DESC":
                list.sort((a, b) => (b.serial_number || "").localeCompare(a.serial_number || "", undefined, { numeric: true }));
                break;
            case "SIAP_ASC":
                list.sort((a, b) => (a.status === "SIAP_JUAL" ? 1 : 0) - (b.status === "SIAP_JUAL" ? 1 : 0));
                break;
            case "SIAP_DESC":
                list.sort((a, b) => (b.status === "SIAP_JUAL" ? 1 : 0) - (a.status === "SIAP_JUAL" ? 1 : 0));
                break;
            default: {
                const order: Record<string, number> = { SIAP_JUAL: 0, RESERVED: 1 };
                list.sort((a, b) => {
                    const d = (order[a.status] ?? 9) - (order[b.status] ?? 9);
                    if (d !== 0) return d;
                    return (a.laptop?.laptop_name ?? "").localeCompare(b.laptop?.laptop_name ?? "", "id");
                });
            }
        }
        return list;
    }, [units, search, filterSN, filterStatus, filterBrand, filterRam, filterPriceRange, sortBy]);

    const counts = {
        all: units.length,
        siap: units.filter(u => u.status === "SIAP_JUAL").length,
        reserved: units.filter(u => u.status === "RESERVED").length,
    };

    const totalSelling = useMemo(() => filtered.reduce((sum, u) => sum + (u.selling_price || 0), 0), [filtered]);

    // ── Export Excel ──────────────────────────────────────────────────────────
    const exportToExcel = async () => {
        if (filtered.length === 0) return;
        setIsExporting(true);
        try {
            const { default: ExcelJS } = await import("exceljs");
            const wb = new ExcelJS.Workbook();
            wb.creator = "Solit POS";
            wb.created = new Date();

            const ws = wb.addWorksheet("Laptop Siap Jual", {
                pageSetup: { fitToPage: true, fitToWidth: 1, orientation: "landscape" },
            });

            const colDefs = [
                { header: "No", width: 6, align: "center" as const },
                { header: "Nama Laptop", width: 36, align: "left" as const },
                { header: "Brand", width: 14, align: "left" as const },
                { header: "CPU", width: 22, align: "left" as const },
                { header: "Display", width: 20, align: "left" as const },
                { header: "Serial Number", width: 24, align: "center" as const },
                { header: "Grade", width: 12, align: "center" as const },
                { header: "Harga Jual", width: 18, align: "right" as const, numFmt: '"Rp "#,##0' },
                { header: "Status", width: 16, align: "center" as const },
                { header: "Kondisi", width: 26, align: "left" as const },
                { header: "Catatan", width: 30, align: "left" as const },
            ];

            const tableRows = filtered.map((u, idx) => [
                idx + 1,
                u.laptop?.laptop_name ?? "—",
                u.laptop?.brand ?? "—",
                u.laptop?.cpu ?? "—",
                u.laptop?.display ?? "—",
                u.serial_number ?? "—",
                `Grade ${u.grade}`,
                u.selling_price || 0,
                STATUS_CONFIG[u.status]?.label ?? u.status,
                u.condition_note ?? "—",
                u.notes ?? "—",
            ]);

            ws.addTable({
                name: "TabelSiapJual",
                ref: "A1",
                headerRow: true,
                totalsRow: false,
                style: { theme: "TableStyleMedium7", showRowStripes: true },
                columns: colDefs.map((c) => ({ name: c.header, filterButton: true })),
                rows: tableRows,
            });

            colDefs.forEach((col, colIdx) => {
                ws.getColumn(colIdx + 1).width = col.width;
            });

            ws.eachRow((row, rowNumber) => {
                row.height = rowNumber === 1 ? 28 : 22;
                row.eachCell((cell, colNumber) => {
                    const colDef = colDefs[colNumber - 1];
                    if (rowNumber > 1 && colDef) {
                        cell.alignment = { vertical: "middle", horizontal: colDef.align };
                        if (colDef.numFmt) cell.numFmt = colDef.numFmt;
                    }
                });
            });

            const buffer = await wb.xlsx.writeBuffer();
            const blob = new Blob([buffer], {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const now = new Date();
            const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
            a.download = `SiapJual_${dateStr}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Export Excel gagal:", err);
            setAlertMsg("Gagal export Excel. Coba lagi.");
        } finally {
            setIsExporting(false);
        }
    };

    const hasActiveFilter =
        search.trim() !== "" ||
        filterSN.trim() !== "" ||
        filterStatus !== "ALL" ||
        filterBrand !== "ALL" ||
        filterRam !== "ALL" ||
        filterPriceRange !== "ALL" ||
        sortBy !== "DEFAULT";

    const resetFilters = () => {
        setSearch("");
        setFilterSN("");
        setFilterStatus("ALL");
        setFilterBrand("ALL");
        setFilterRam("ALL");
        setFilterPriceRange("ALL");
        setSortBy("DEFAULT");
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
        siap_jual: u.status === "SIAP_JUAL" ? 1 : 0,
        minus: 0,
        is_new: isNewArrival(u.created_at),
    }));

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
                .data-row { transition: background 0.15s ease, transform 0.15s ease; }
                .data-row:hover { transform: translateX(1px); }
                .scrollbar-hide::-webkit-scrollbar { display: none; }
                .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>

            {/*
             * RESPONSIVE FIX (main container):
             * - p-3 di HP (naik dari p-4) supaya tabel punya lebih banyak ruang horizontal
             * - space-y-3 di HP (naik dari space-y-5) supaya konten lebih compact
             */}
            <main className="min-h-screen bg-[#F7F7F8] p-3 sm:p-6 lg:p-8">
                <div className="max-w-full mx-auto space-y-3 sm:space-y-5 lg:space-y-6">

                    {/* ── Header ──────────────────────────────────────────────────────────────
                     * RESPONSIVE FIX:
                     * - Hapus flex-wrap dari container utama — biar header selalu 1 baris
                     * - Tombol di HP: ikon saja (teks hidden), h-8 lebih compact
                     * - gap dikurangi di mobile
                     */}
                    <div className="flex items-center justify-between gap-2 sm:gap-3 animate-slideIn">
                        {/* Kiri: ikon + judul */}
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                            <div className="w-1 h-7 sm:h-8 rounded-full bg-gray-800 flex-shrink-0" />
                            <div className="w-8 h-8 sm:w-9 sm:h-9 bg-gray-800 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                    <path d="M9 12l2 2 4-4" />
                                    <rect x="2" y="3" width="20" height="14" rx="2" />
                                    <line x1="8" y1="21" x2="16" y2="21" />
                                    <line x1="12" y1="17" x2="12" y2="21" />
                                </svg>
                            </div>
                            <div className="min-w-0">
                                <h1 className="text-lg sm:text-2xl font-black text-gray-900 tracking-tight truncate">Barang Siap Jual</h1>
                                <p className="text-[11px] sm:text-xs text-gray-400 font-medium mt-0.5">
                                    {isLoading ? "Memuat data..." : `${units.length} unit terdaftar`}
                                </p>
                            </div>
                        </div>

                        {/* Kanan: tombol aksi */}
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                            {/* Export: teks hanya tampil di ≥ sm */}
                            <button
                                onClick={exportToExcel}
                                disabled={isExporting || filtered.length === 0}
                                title={filtered.length === 0 ? "Tidak ada data untuk di-export" : `Export ${filtered.length} unit ke Excel`}
                                className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-900 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 h-8 sm:h-9 px-2.5 sm:px-3.5 rounded-xl transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {isExporting ? (
                                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                ) : (
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                )}
                                <span className="hidden sm:inline">{isExporting ? "Mengexport..." : "Export Excel"}</span>
                            </button>

                            {/* Refresh: teks hanya tampil di ≥ sm */}
                            <button
                                onClick={fetchUnits}
                                className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 border border-gray-200 bg-white hover:bg-gray-50 h-8 sm:h-9 px-2.5 sm:px-3.5 rounded-xl transition-all active:scale-[0.98] group"
                            >
                                <svg
                                    className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"}`}
                                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                <span className="hidden sm:inline">Refresh</span>
                            </button>
                        </div>
                    </div>

                    {/* ── Stat Cards ───────────────────────────────────────────────────────────
                     * RESPONSIVE FIX:
                     * - gap-2 di HP (lebih rapat), gap-3 di ≥ sm
                     * - StatCard sendiri sudah di-scale via komponen di atas
                     */}
                    <div className="grid grid-cols-3 gap-2 sm:gap-3 animate-fadeUp">
                        <StatCard label="Total Unit" value={counts.all} icon={<Laptop size={18} className="text-white" />} color="text-gray-900" bg="bg-white" bar="bg-gray-800" />
                        <StatCard label="Siap Jual" value={counts.siap} icon={<CheckCircle2 size={18} className="text-white" />} color="text-emerald-600" bg="bg-emerald-50" bar="bg-emerald-500" />
                        <StatCard label="Dipesan" value={counts.reserved} icon={<Lock size={18} className="text-white" />} color="text-violet-600" bg="bg-violet-50" bar="bg-violet-500" />
                    </div>

                    {/* ── Filter — disamakan dengan Data Barang ───────────── */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2.5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                            <div className="relative">
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input
                                    type="text"
                                    placeholder="Cari nama, brand, CPU, RAM, storage..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    className="w-full h-9 border border-gray-200 rounded-xl pl-8 pr-3 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400/20 focus:border-gray-400 focus:bg-white transition"
                                />
                            </div>
                            {/* Search SN — full width di mobile (col-span-2) */}
                            <div className="relative col-span-2 sm:col-span-1">
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                                </svg>
                                <input
                                    type="text"
                                    placeholder="Cari Serial Number..."
                                    value={filterSN}
                                    onChange={e => setFilterSN(e.target.value)}
                                    className="w-full h-9 border border-gray-200 rounded-xl pl-8 pr-3 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400/20 focus:border-gray-400 focus:bg-white transition"
                                />
                            </div>
                            <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} className={selectCls}>
                                {uniqueBrands.map(b => <option key={b} value={b}>{b === "ALL" ? "Semua Brand" : b}</option>)}
                            </select>
                            <select value={filterRam} onChange={e => setFilterRam(e.target.value)} className={selectCls}>
                                {uniqueRams.map(r => <option key={r} value={r}>{r === "ALL" ? "Semua RAM" : `RAM ${r}`}</option>)}
                            </select>
                            <select value={filterPriceRange} onChange={e => setFilterPriceRange(e.target.value)} className={selectCls}>
                                <option value="ALL">Semua Harga</option>
                                <option value="1-2">Rp 1 jt – 2 jt</option>
                                <option value="2-3">Rp 2 jt – 3 jt</option>
                                <option value="3-4">Rp 3 jt – 4 jt</option>
                                <option value="4+">Rp 4 jt ke atas</option>
                            </select>
                        </div>
                        <div className="flex flex-wrap items-center gap-2.5">
                            <select value={sortBy} onChange={e => setSortBy(e.target.value)} className={selectCls}>
                                <option value="DEFAULT">Urutan Default</option>
                                <option value="AZ">Nama: A → Z</option>
                                <option value="ZA">Nama: Z → A</option>
                                <option value="PRICE_ASC">Harga: Rendah → Tinggi</option>
                                <option value="PRICE_DESC">Harga: Tinggi → Rendah</option>
                                <option value="SN">Urut SN</option>
                            </select>
                            {hasActiveFilter && (
                                <button
                                    onClick={resetFilters}
                                    className="h-9 px-3 bg-gray-100 text-gray-600 rounded-xl text-xs font-semibold hover:bg-gray-200 transition flex items-center gap-1.5 active:scale-[0.98] flex-shrink-0"
                                >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                    Reset
                                </button>
                            )}
                        </div>

                        {/* Filter Chips */}
                        {hasActiveFilter && (
                            <div className="flex flex-wrap gap-1.5 pt-1 border-t border-gray-50">
                                {search && <FilterChip label={`Cari: "${search}"`} onRemove={() => setSearch("")} />}
                                {filterSN && <FilterChip label={`SN: "${filterSN}"`} onRemove={() => setFilterSN("")} />}
                                {filterStatus !== "ALL" && <FilterChip label={`Status: ${STATUS_CONFIG[filterStatus]?.label ?? filterStatus}`} onRemove={() => setFilterStatus("ALL")} />}
                                {filterBrand !== "ALL" && <FilterChip label={`Brand: ${filterBrand}`} onRemove={() => setFilterBrand("ALL")} />}
                                {filterRam !== "ALL" && <FilterChip label={`RAM: ${filterRam}`} onRemove={() => setFilterRam("ALL")} />}
                                {filterPriceRange !== "ALL" && <FilterChip label={filterPriceRange === "4+" ? "≥ Rp 4 jt" : `Rp ${filterPriceRange} jt`} onRemove={() => setFilterPriceRange("ALL")} />}
                                {sortBy !== "DEFAULT" && <FilterChip label={`Sort: ${SORT_LABELS[sortBy] ?? sortBy}`} onRemove={() => setSortBy("DEFAULT")} />}
                            </div>
                        )}
                    </div>

                    {/* ── Table ────────────────────────────────────────────────────────────── */}
                    {isLoading ? (
                        <SkeletonRows />
                    ) : filtered.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center justify-center py-16 sm:py-20 gap-3">
                            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
                                <Laptop size={28} className="text-gray-300" />
                            </div>
                            <div className="text-center px-4">
                                <p className="text-gray-600 font-bold text-sm">Tidak ada unit ditemukan</p>
                                <p className="text-gray-400 text-xs mt-1">
                                    {hasActiveFilter ? "Coba ubah atau reset filter di atas" : "Belum ada unit yang terdaftar"}
                                </p>
                            </div>
                            {hasActiveFilter && (
                                <button
                                    onClick={resetFilters}
                                    className="mt-1 h-9 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold transition"
                                >
                                    Reset Filter
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
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
                                    const isPending = u.status === "RESERVED";
                                    return (
                                        <div className="flex items-center gap-1.5">
                                            {st && (
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border whitespace-nowrap ${st.badge}`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${st.dot}`} />
                                                    {st.label}
                                                </span>
                                            )}
                                            {isPending && canConfirmTx && !confirmedUnitIds.has(u.id) && (
                                                <button
                                                    onClick={() => setConfirmTarget(u)}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition active:scale-95"
                                                >
                                                    <CheckCircle2 size={12} /> Lunas
                                                </button>
                                            )}
                                            {isPending && confirmedUnitIds.has(u.id) && (
                                                <span className="px-2.5 py-1.5 text-[11px] font-semibold text-gray-400 bg-gray-50 border border-gray-200 rounded-lg flex items-center gap-1">
                                                    <svg className="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                    Lunas
                                                </span>
                                            )}
                                        </div>
                                    );
                                }}
                            />

                            {/*
                             * RESPONSIVE FIX (footer tabel):
                             * - px-3 di HP (dikurangi dari px-4)
                             * - text-xs (naik dari text-[11px]) — lebih mudah dibaca di HP
                             */}
                            <div className="px-3 sm:px-4 py-2.5 border-t border-gray-100 bg-gray-50/60 flex items-center justify-between gap-3">
                                <p className="text-xs text-gray-400">
                                    Menampilkan{" "}
                                    <span className="font-bold text-gray-600">{filtered.length}</span>
                                    {" "}dari{" "}
                                    <span className="font-bold text-gray-600">{units.length}</span>
                                    {" "}unit
                                    {hasActiveFilter && <span className="ml-1 text-gray-400">(difilter)</span>}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* ── Total Nominal ──────────────────────────────────────────────────────── */}
                    {!isLoading && filtered.length > 0 && (
                        <TotalBar totalSelling={totalSelling} count={filtered.length} />
                    )}

                </div>
            </main>

            {/* ── Modals ──────────────────────────────────────────────────────────────── */}
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}

            {detailUnit && <UnitInfoModal unit={detailUnit} onClose={() => setDetailUnit(null)} />}

            {confirmTarget && (
                <ConfirmPaymentModal
                    unit={confirmTarget}
                    onClose={() => setConfirmTarget(null)}
                    onSuccess={() => {
                        setConfirmedUnitIds(prev => new Set([...prev, confirmTarget.id]));
                        setAlertMsg("Pembayaran dikonfirmasi, transaksi PAID");
                        fetchUnits();
                    }}
                />
            )}
        </>
    );
}

export default function ReadyPage() {
    return (
        <DashboardLayout>
            <ReadyContent />
        </DashboardLayout>
    );
}

// ─── ConfirmPaymentModal ──────────────────────────────────────────────────────
function ConfirmPaymentModal({ unit, onClose, onSuccess }: {
    unit: LaptopUnit; onClose: () => void; onSuccess: () => void;
}) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [paymentProof, setPaymentProof] = useState<string | null>(null);
    const [uploadingProof, setUploadingProof] = useState(false);

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    const handleProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingProof(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("invoice", unit.reserved_invoice || "proof");
            const res = await fetch("/api/receipt/upload-image", { method: "POST", body: formData });
            const result = await res.json();
            if (result.url) setPaymentProof(result.url);
            else throw new Error("URL tidak ditemukan");
        } catch { setError("Gagal upload foto"); }
        finally { setUploadingProof(false); }
    };

    const handleConfirm = async () => {
        if (!unit.reserved_invoice) { setError("Invoice tidak ditemukan"); return; }
        if (!unit.serial_number) { setError("Serial number tidak ditemukan"); return; }
        setLoading(true); setError("");
        try {
            const res = await fetch("/api/units/confirm-payment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    invoice_number: unit.reserved_invoice,
                    serial_number: unit.serial_number,
                    payment_photo: paymentProof || null,
                }),
            });
            const result = await res.json();
            if (!result.success) { setError(result.message || "Gagal"); return; }
            onSuccess(); onClose();
        } catch { setError("Terjadi kesalahan koneksi"); }
        finally { setLoading(false); }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center animate-fadeIn">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] sm:mx-4 overflow-hidden animate-slideUp">

                <div className="bg-gray-800 px-5 py-4 flex-shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="font-bold text-white">Konfirmasi Lunas</h3>
                                <p className="text-xs text-gray-300 mt-0.5">Transaksi akan menjadi PAID</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/20 transition">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
                    <div className="bg-gray-50 rounded-xl border border-gray-100 divide-y divide-gray-100">
                        {[
                            {
                                label: "Status",
                                value: (
                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border bg-violet-50 text-violet-700 border-violet-200">
                                        <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
                                        DP
                                    </span>
                                )
                            },
                            { label: "Invoice", value: <span className="text-xs font-mono font-semibold text-gray-700">{unit.reserved_invoice || "—"}</span> },
                            { label: "Dipesan oleh", value: <span className="text-xs font-semibold text-gray-800">{unit.reserved_by || "—"}</span> },
                            { label: "Laptop", value: <span className="text-xs font-semibold text-gray-800">{unit.laptop?.laptop_name || "—"}</span> },
                            { label: "Serial Number", value: <code className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded-md text-gray-800">{unit.serial_number || "—"}</code> },
                            { label: "Harga Jual", value: <span className="text-sm font-bold text-gray-800">Rp {(unit.selling_price || 0).toLocaleString("id-ID")}</span> },
                        ].map(row => (
                            <div key={row.label} className="flex items-center justify-between px-4 py-2.5">
                                <span className="text-xs text-gray-400">{row.label}</span>
                                {row.value}
                            </div>
                        ))}
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1.5">
                            Bukti Pembayaran <span className="text-gray-400 font-normal">(opsional)</span>
                        </label>
                        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleProofUpload} className="hidden" />
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploadingProof}
                            className={`w-full h-10 border-2 border-dashed rounded-xl text-xs font-medium transition flex items-center justify-center gap-2 ${paymentProof
                                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                : "border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300 hover:bg-gray-100"
                                }`}
                        >
                            {uploadingProof ? (
                                <><div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />Mengupload...</>
                            ) : paymentProof ? (
                                <><CheckCircle2 size={14} /> Foto terupload — klik untuk ganti</>
                            ) : (
                                <><Camera size={14} /> Upload foto bukti bayar</>
                            )}
                        </button>
                    </div>

                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex gap-2">
                        <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        </svg>
                        <p className="text-xs text-amber-700">
                            Konfirmasi akan mengubah status menjadi <strong>PAID</strong> dan unit menjadi <strong>SOLD</strong>. Tidak dapat dibatalkan.
                        </p>
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex items-center gap-2">
                            <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
                            </svg>
                            <p className="text-xs text-red-700">{error}</p>
                        </div>
                    )}
                </div>

                <div className="px-5 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
                    <button onClick={onClose} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition">
                        Batal
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={loading || uploadingProof}
                        className="flex-1 h-11 bg-gray-800 text-white rounded-xl text-sm font-semibold hover:bg-gray-900 transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-md"
                    >
                        {loading ? (
                            <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Memproses...</>
                        ) : (
                            <><CheckCircle2 size={16} /> Konfirmasi Lunas</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}