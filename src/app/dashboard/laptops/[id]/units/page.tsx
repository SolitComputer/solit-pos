"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Link from "next/link";
import { UserRole, PERMISSIONS, hasAnyRole } from "@/lib/permissions";
import { Trash2, Package, CheckCircle2, Wrench, Wallet } from "lucide-react";
import BulkAddUnitModal from "@/components/inventory/BulkAddUnitModal";
import UnitFormModal from "@/components/inventory/UnitFormModal";
import EditablePriceCell from "@/components/inventory/EditablePriceCell";

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
    received_at?: string;
    created_at: string;
}

interface Laptop {
    id: string;
    laptop_name: string;
    brand: string;
    cpu: string;
    ram: string;
    storage: string;
    selling_price: number;
}

const fmt = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");

const GRADE_STYLE: Record<string, { badge: string; label: string; desc: string; color: string }> = {
    A: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Grade A", desc: "Sempurna", color: "emerald" },
    B: { badge: "bg-amber-50 text-amber-700 border-amber-200", label: "Grade B", desc: "Minus", color: "amber" },
    C: { badge: "bg-red-50 text-red-700 border-red-200", label: "Grade C", desc: "Banyak minus", color: "red" },
};

const STATUS_STYLE: Record<string, { badge: string; dot: string; label: string }> = {
    SIAP_JUAL: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", label: "Siap Jual" },
    BELUM_SIAP: { badge: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-400", label: "Belum Siap" },
    SERVICE: { badge: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-500", label: "Service" },
    SOLD: { badge: "bg-gray-100 text-gray-500 border-gray-200", dot: "bg-gray-400", label: "Terjual" },
};

const GRADE_ORDER: Record<string, number> = { A: 0, B: 1, C: 2 };

function sortUnits(units: LaptopUnit[]): LaptopUnit[] {
    return [...units].sort((a, b) => {
        const gradeDiff = GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade];
        if (gradeDiff !== 0) return gradeDiff;
        return b.serial_number.localeCompare(a.serial_number, undefined, { numeric: true });
    });
}

function AlertModal({ message, onClose }: { message: string; onClose: () => void }) {
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-xs p-5 text-center">
                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <p className="text-gray-700 text-sm font-medium mb-4">{message}</p>
                <button
                    onClick={onClose}
                    className="w-full h-9 bg-[#1a1a2e] text-white rounded-lg text-sm font-medium hover:bg-[#16213e] transition"
                >
                    OK
                </button>
            </div>
        </div>
    );
}

function ConfirmModal({
    message, onConfirm, onCancel, confirmLabel = "Hapus", danger = true,
}: {
    message: string; onConfirm: () => void; onCancel: () => void;
    confirmLabel?: string; danger?: boolean;
}) {
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onCancel]);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-5">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3 ${danger ? "bg-red-50" : "bg-amber-50"}`}>
                    <svg className={`w-5 h-5 ${danger ? "text-red-500" : "text-amber-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <p className="text-gray-700 text-sm text-center leading-relaxed mb-4">{message}</p>
                <div className="flex gap-2">
                    <button onClick={onCancel}
                        className="flex-1 h-9 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition">
                        Batal
                    </button>
                    <button onClick={onConfirm}
                        className={`flex-1 h-9 rounded-lg text-sm font-semibold text-white transition ${danger ? "bg-red-500 hover:bg-red-600" : "bg-amber-500 hover:bg-amber-600"}`}>
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}


// ── Toast notifikasi ringan ─────────────────────────────────────────────────
function Toast({ message, onDone }: { message: string; onDone: () => void }) {
    useEffect(() => {
        const t = setTimeout(onDone, 2500);
        return () => clearTimeout(t);
    }, [onDone]);

    return (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 animate-in slide-in-from-bottom-4">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {message}
        </div>
    );
}

export default function UnitsPage() {
    const params = useParams();
    const laptopId = params.id as string;

    const [laptop, setLaptop] = useState<Laptop | null>(null);
    const [units, setUnits] = useState<LaptopUnit[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [showForm, setShowForm] = useState(false);
    const [editingUnit, setEditingUnit] = useState<LaptopUnit | null>(null);

    const [filterStatus, setFilterStatus] = useState("ALL");
    const [filterGradeTab, setFilterGradeTab] = useState("ALL");
    const [searchSN, setSearchSN] = useState("");
    const [filterPriceMin, setFilterPriceMin] = useState("");
    const [filterPriceMax, setFilterPriceMax] = useState("");
    const [showAdvancedFilter, setShowAdvancedFilter] = useState(false);

    const [userRoles, setUserRoles] = useState<UserRole[]>([]);
    const canManageUnits = hasAnyRole(userRoles, PERMISSIONS.EDIT_UNITS);
    const canSeePriceInfo = hasAnyRole(userRoles, [
        "ADMIN", "PROGRAMMER", "ASISTEN_CEO", "PENGELOLA_BARANG",
        "KEPALA_PENGELOLA_BARANG", "KEPALA_TEKNISI", "ACCOUNTING",
    ] as UserRole[]);
    const [alertModal, setAlertModal] = useState<string | null>(null);
    const [confirmModal, setConfirmModal] = useState<{ message: string; onConfirm: () => void } | null>(null);
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [toast, setToast] = useState("");


    const activeUnits = units.filter(u => u.status !== "SOLD");


    useEffect(() => {
        fetch("/api/auth/me")
            .then(r => r.json())
            .then(r => {
                const roles: string[] =
                    Array.isArray(r.user?.roles) && r.user.roles.length > 0
                        ? r.user.roles
                        : r.user?.role ? [r.user.role] : [];
                setUserRoles(roles as UserRole[]);
            })
            .catch(() => setUserRoles([]));
    }, []);

    const fmtDate = (iso: string) => {
        if (!iso) return "—";
        return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
    };

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [laptopRes, unitsRes] = await Promise.all([
                fetch(`/api/laptops/${laptopId}`),
                fetch(`/api/laptops/${laptopId}/units`),
            ]);
            const laptopData = await laptopRes.json();
            const unitsData = await unitsRes.json();
            if (laptopData.data) {
                setLaptop({ ...laptopData.data, selling_price: Math.round(Number(laptopData.data.selling_price) || 0) });
            }
            if (unitsData.data) {
                const normalized: LaptopUnit[] = (unitsData.data).map((u: LaptopUnit) => ({
                    ...u,
                    purchase_price: Math.round(Number(u.purchase_price) || 0),
                    selling_price: Math.round(Number(u.selling_price) || 0),
                }));
                setUnits(normalized);
            }
        } catch { /* ignore */ } finally {
            setIsLoading(false);
        }
    }, [laptopId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    useEffect(() => { setSelectedIds(new Set()); }, [filterStatus, filterGradeTab, searchSN]);

    const syncLaptopStats = useCallback(async (latestUnits: LaptopUnit[]) => {
        const siapCount = latestUnits.filter(u => u.status === "SIAP_JUAL").length;
        const newStatus = siapCount > 0 ? "SIAP_JUAL" : latestUnits.length === 0 ? "BELUM_SIAP" : "SOLD";
        try {
            await fetch(`/api/laptops/${laptopId}/sync-units`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ qty: siapCount, status: newStatus }),
            });
        } catch { /* non-blocking */ }
    }, [laptopId]);

    const handlePriceSaved = useCallback((unitId: string, newPrice: number) => {
        setUnits(prev => prev.map(u =>
            u.id === unitId ? { ...u, purchase_price: newPrice } : u
        ));
        setToast("Harga modal berhasil diperbarui!");
    }, []);

    const filteredUnits = sortUnits(
        activeUnits.filter(u => {
            if (filterStatus !== "ALL" && u.status !== filterStatus) return false;
            if (filterGradeTab !== "ALL" && u.grade !== filterGradeTab) return false;
            if (searchSN && !u.serial_number.toLowerCase().includes(searchSN.toLowerCase())) return false;
            if (filterPriceMin && u.selling_price < Number(filterPriceMin)) return false;
            if (filterPriceMax && u.selling_price > Number(filterPriceMax)) return false;
            return true;
        })
    );

    const hasActiveFilter = searchSN || filterPriceMin || filterPriceMax;
    const isAllSelected = filteredUnits.length > 0 && filteredUnits.every(u => selectedIds.has(u.id));
    const isIndeterminate = filteredUnits.some(u => selectedIds.has(u.id)) && !isAllSelected;

    const toggleSelectAll = () => {
        if (isAllSelected) { setSelectedIds(new Set()); }
        else { setSelectedIds(new Set(filteredUnits.map(u => u.id))); }
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleBulkDelete = () => {
        if (selectedIds.size === 0) return;
        setConfirmModal({
            message: `Hapus ${selectedIds.size} unit yang dipilih? Tindakan ini tidak dapat dibatalkan.`,
            onConfirm: async () => {
                setConfirmModal(null);
                setBulkDeleting(true);
                try {
                    await Promise.all(Array.from(selectedIds).map(id => fetch(`/api/units/${id}`, { method: "DELETE" })));
                    const freshRes = await fetch(`/api/laptops/${laptopId}/units`);
                    const freshData = await freshRes.json();
                    const freshUnits: LaptopUnit[] = freshData.data || [];
                    setUnits(freshUnits);
                    await syncLaptopStats(freshUnits);
                    setSelectedIds(new Set());
                } catch {
                    setAlertModal("Gagal menghapus beberapa unit");
                } finally {
                    setBulkDeleting(false);
                }
            },
        });
    };

    const counts = {
        total: activeUnits.length,
        siap: activeUnits.filter(u => u.status === "SIAP_JUAL").length,
        sold: units.filter(u => u.status === "SOLD").length,
        service: activeUnits.filter(u => u.status === "SERVICE").length,
        belum: activeUnits.filter(u => u.status === "BELUM_SIAP").length,
        gradeA: activeUnits.filter(u => u.grade === "A").length,
        gradeB: activeUnits.filter(u => u.grade === "B").length,
        gradeC: activeUnits.filter(u => u.grade === "C").length,
    };

    const openCreate = () => {
        setEditingUnit(null);
        setShowForm(true);
    };

    const openEdit = (unit: LaptopUnit) => {
        setEditingUnit(unit);
        setShowForm(true);
    };

    const closeForm = () => { setShowForm(false); setEditingUnit(null); };

    const handleFormSuccess = async () => {
        const freshRes = await fetch(`/api/laptops/${laptopId}/units`);
        const freshData = await freshRes.json();
        const freshUnits: LaptopUnit[] = freshData.data || [];
        setUnits(freshUnits);
        await syncLaptopStats(freshUnits);
    };

    const handleDelete = (unit: LaptopUnit) => {
        setConfirmModal({
            message: `Hapus unit SN: ${unit.serial_number}?`,
            onConfirm: async () => {
                setConfirmModal(null);
                try {
                    await fetch(`/api/units/${unit.id}`, { method: "DELETE" });
                    const freshRes = await fetch(`/api/laptops/${laptopId}/units`);
                    const freshData = await freshRes.json();
                    const freshUnits: LaptopUnit[] = freshData.data || [];
                    setUnits(freshUnits);
                    await syncLaptopStats(freshUnits);
                } catch { setAlertModal("Gagal menghapus"); }
            },
        });
    };

    const resetFilters = () => {
        setSearchSN(""); setFilterPriceMin(""); setFilterPriceMax("");
        setFilterStatus("ALL"); setFilterGradeTab("ALL");
    };

    return (
        <DashboardLayout>
            <main className="min-h-screen bg-gradient-to-br from-gray-50 to-white p-4 sm:p-6 lg:p-8">
                <div className="max-w-7xl mx-auto space-y-5">

                    {/* Breadcrumb */}
                    <div className="flex items-center gap-2 text-sm">
                        <Link href="/dashboard/data-barang?tab=laptops" className="text-gray-400 hover:text-gray-600 transition">Data Laptop</Link>
                        <svg className="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span className="text-gray-600 font-medium truncate">{isLoading ? "Memuat..." : laptop?.laptop_name || "Units"}</span>
                    </div>

                    {/* Header */}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <div className="w-7 h-7 bg-gradient-to-br from-[#1a1a2e] to-[#16213e] rounded-lg flex items-center justify-center">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                        <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
                                    </svg>
                                </div>
                                <h1 className="text-xl font-bold text-[#1a1a2e] tracking-tight">{laptop?.laptop_name || "—"}</h1>
                            </div>
                            <p className="text-xs text-gray-400 ml-9">
                                {[laptop?.brand, laptop?.cpu, laptop?.ram, laptop?.storage].filter(Boolean).join(" · ") || "Detail laptop"}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">

                            {canManageUnits && (
                                <>
                                    <button onClick={openCreate}
                                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#1a1a2e] rounded-lg text-sm font-medium text-white hover:bg-[#16213e] transition shadow-sm">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                        Tambah Unit
                                    </button>
                                    <button onClick={() => setShowBulkModal(true)}
                                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-600 rounded-lg text-sm font-medium text-white transition shadow-sm">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        Tambah Banyak
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Stats Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        {[
                            { label: "Total Unit", value: counts.total, color: "text-gray-800", icon: <Package size={16} /> },
                            { label: "Siap Jual", value: counts.siap, color: "text-emerald-600", icon: <CheckCircle2 size={16} /> },
                            { label: "Belum Siap", value: counts.belum, color: "text-amber-600", icon: null },
                            { label: "Service", value: counts.service, color: "text-blue-600", icon: <Wrench size={16} /> },
                            { label: "Terjual", value: counts.sold, color: "text-gray-500", icon: <Wallet size={16} /> },
                        ].map(stat => (
                            <div key={stat.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs text-gray-400">{stat.label}</p>
                                    <span className="text-sm opacity-50">{stat.icon}</span>
                                </div>
                                <p className={`text-xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
                            </div>
                        ))}
                    </div>

                    {/* Grade Tabs */}
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-1.5">
                        <div className="flex gap-1.5">
                            {[
                                { value: "ALL", label: "Semua Grade", count: units.length },
                                { value: "A", label: "Grade A", count: counts.gradeA },
                                { value: "B", label: "Grade B", count: counts.gradeB },
                                { value: "C", label: "Grade C", count: counts.gradeC },
                            ].map(opt => {
                                const isActive = filterGradeTab === opt.value;
                                let activeStyle = "bg-[#1a1a2e] text-white";
                                if (opt.value === "A" && isActive) activeStyle = "bg-gray-400 text-white";
                                if (opt.value === "B" && isActive) activeStyle = "bg-amber-400 text-white";
                                if (opt.value === "C" && isActive) activeStyle = "bg-red-500 text-white";
                                return (
                                    <button key={opt.value} onClick={() => setFilterGradeTab(opt.value)}
                                        className={`flex-1 flex flex-col items-center py-2 px-1 rounded-lg text-center transition-all ${isActive ? activeStyle : "text-gray-500 hover:bg-gray-50"}`}>
                                        <span className={`text-[10px] font-medium leading-tight ${isActive ? "opacity-80" : "opacity-60"}`}>{opt.label}</span>
                                        <span className="text-sm font-bold leading-tight mt-0.5">{opt.count}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Status Filter Tabs */}
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-2">
                        <div className="flex flex-wrap gap-1.5">
                            {[
                                { value: "ALL", label: "Semua Status", count: filterGradeTab === "ALL" ? units.length : units.filter(u => u.grade === filterGradeTab).length },
                                { value: "SIAP_JUAL", label: "Siap Jual", count: units.filter(u => (filterGradeTab === "ALL" || u.grade === filterGradeTab) && u.status === "SIAP_JUAL").length },
                                { value: "BELUM_SIAP", label: "Belum Siap", count: units.filter(u => (filterGradeTab === "ALL" || u.grade === filterGradeTab) && u.status === "BELUM_SIAP").length },
                                { value: "SERVICE", label: "Service", count: units.filter(u => (filterGradeTab === "ALL" || u.grade === filterGradeTab) && u.status === "SERVICE").length },
                            ].map(opt => (
                                <button key={opt.value} onClick={() => setFilterStatus(opt.value)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${filterStatus === opt.value ? "bg-[#1a1a2e] text-white shadow-sm" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                                    {opt.label}
                                    <span className={`ml-1.5 px-1.5 py-0.5 rounded text-xs ${filterStatus === opt.value ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}>
                                        {opt.count}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Search & Filter */}
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-3">
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input type="text" placeholder="Cari serial number..." value={searchSN} onChange={e => setSearchSN(e.target.value)}
                                    className="w-full h-9 border border-gray-200 rounded-lg pl-9 pr-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition" />
                                {searchSN && (
                                    <button onClick={() => setSearchSN("")} className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 transition">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                            <button onClick={() => setShowAdvancedFilter(v => !v)}
                                className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-medium border transition ${showAdvancedFilter || filterPriceMin || filterPriceMax ? "bg-[#1a1a2e] text-white border-[#1a1a2e]" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                                </svg>
                                Filter
                                {(filterPriceMin || filterPriceMax) && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                            </button>
                            {hasActiveFilter && (
                                <button onClick={resetFilters} className="inline-flex items-center gap-1 px-2.5 h-9 rounded-lg text-xs font-medium text-red-500 border border-red-200 bg-red-50 hover:bg-red-100 transition">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    Reset
                                </button>
                            )}
                        </div>
                        {showAdvancedFilter && (
                            <div className="border-t border-gray-100 pt-3 grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Harga Jual Min (Rp)</label>
                                    <input type="number" placeholder="Contoh: 1000000" value={filterPriceMin} onChange={e => setFilterPriceMin(e.target.value)}
                                        className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Harga Jual Max (Rp)</label>
                                    <input type="number" placeholder="Contoh: 5000000" value={filterPriceMax} onChange={e => setFilterPriceMax(e.target.value)}
                                        className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition" />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Bulk Action Bar */}
                    {selectedIds.size > 0 && (
                        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                            <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded bg-red-500 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                    </svg>
                                </span>
                                <p className="text-sm font-semibold text-red-700">{selectedIds.size} unit dipilih</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setSelectedIds(new Set())} className="text-xs text-red-500 font-medium underline underline-offset-2 active:opacity-60 transition">Batal pilih</button>
                                <button onClick={handleBulkDelete} disabled={bulkDeleting}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-semibold active:bg-red-600 transition disabled:opacity-50">
                                    {bulkDeleting ? (
                                        <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menghapus...</>
                                    ) : (
                                        <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>Hapus {selectedIds.size} Unit</>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Table */}
                    {isLoading ? (
                        <SkeletonUnits />
                    ) : filteredUnits.length === 0 ? (
                        <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-12 text-center">
                            <div className="mb-2 opacity-50"><Package size={30} className="mx-auto text-gray-400" /></div>
                            <p className="text-gray-500 text-sm font-medium">Tidak ada unit ditemukan</p>
                            <p className="text-gray-400 text-xs mt-1">
                                {hasActiveFilter || filterStatus !== "ALL" || filterGradeTab !== "ALL"
                                    ? "Coba ubah filter pencarian"
                                    : canManageUnits ? "Klik 'Tambah Unit' untuk mendaftarkan SN" : "Belum ada unit yang tersedia"}
                            </p>
                            {(hasActiveFilter || filterStatus !== "ALL" || filterGradeTab !== "ALL") && (
                                <button onClick={resetFilters} className="mt-3 px-4 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200 transition">
                                    Reset semua filter
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-gray-50/80 border-b border-gray-100">
                                            {canManageUnits && (
                                                <th className="px-4 py-3 w-14">
                                                    <button onClick={toggleSelectAll}
                                                        className={`w-4 h-4 rounded border-2 flex items-center justify-center transition flex-shrink-0 ${isAllSelected ? "bg-[#1a1a2e] border-[#1a1a2e]" : isIndeterminate ? "bg-gray-300 border-gray-300" : "bg-white border-gray-300 hover:border-gray-400"}`}>
                                                        {(isAllSelected || isIndeterminate) && (
                                                            <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d={isIndeterminate ? "M5 12h14" : "M5 13l4 4L19 7"} />
                                                            </svg>
                                                        )}
                                                    </button>
                                                </th>
                                            )}
                                            <Th>Serial Number</Th>
                                            <Th>Grade</Th>
                                            <Th>Kondisi</Th>
                                            <Th>Tgl Masuk</Th>
                                            {canSeePriceInfo && (
                                                <Th right>
                                                    {canManageUnits ? (
                                                        <span className="flex items-center justify-end gap-1">
                                                            Harga Modal
                                                            <span className="text-violet-400 font-bold normal-case tracking-normal">(editable)</span>
                                                        </span>
                                                    ) : (
                                                        "Harga Modal"
                                                    )}
                                                </Th>
                                            )}
                                            <Th right>Harga Jual</Th>
                                            {canSeePriceInfo && <Th right>Margin</Th>}
                                            <Th>Status</Th>
                                            <Th right>Aksi</Th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {filteredUnits.map(unit => {
                                            const s = STATUS_STYLE[unit.status];
                                            const g = GRADE_STYLE[unit.grade];
                                            const margin = (unit.selling_price || 0) - (unit.purchase_price || 0);
                                            const isSelected = selectedIds.has(unit.id);
                                            return (
                                                <tr key={unit.id} className={`transition-colors group ${isSelected ? "bg-red-50/60" : "hover:bg-gray-50/60"}`}>
                                                    {canManageUnits && (
                                                        <td className="px-4 py-3">
                                                            <button onClick={() => toggleSelect(unit.id)}
                                                                className={`w-4 h-4 rounded border-2 flex items-center justify-center transition flex-shrink-0 ${isSelected ? "bg-red-500 border-red-500" : "bg-white border-gray-300 hover:border-gray-400"}`}>
                                                                {isSelected && (
                                                                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                )}
                                                            </button>
                                                        </td>
                                                    )}
                                                    <td className="px-4 py-3">
                                                        <span className="font-mono text-xs text-gray-700 bg-gray-100 px-2 py-1 rounded">{unit.serial_number}</span>
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        {g && (
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${g.badge}`}>{g.label}</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 max-w-[180px]">
                                                        <span className="text-xs text-gray-600 line-clamp-2" title={unit.condition_note}>
                                                            {unit.condition_note || <span className="text-gray-300">—</span>}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        <span className="text-xs text-gray-500">{fmtDate(unit.created_at)}</span>
                                                    </td>
                                                    {canSeePriceInfo && (
                                                        <td className="px-4 py-3 whitespace-nowrap">
                                                            {canManageUnits ? (
                                                                <EditablePriceCell
                                                                    unitId={unit.id}
                                                                    value={unit.purchase_price}
                                                                    onSaved={handlePriceSaved}
                                                                />
                                                            ) : (
                                                                <div className="text-right text-xs text-gray-500 tabular-nums">
                                                                    {fmt(unit.purchase_price)}
                                                                </div>
                                                            )}
                                                        </td>
                                                    )}
                                                    <td className="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap tabular-nums">{fmt(unit.selling_price)}</td>
                                                    {canSeePriceInfo && (
                                                        <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                                                            <span className={`text-xs font-semibold ${margin >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                                                {margin >= 0 ? "+" : ""}{fmt(Math.abs(margin))}
                                                            </span>
                                                        </td>
                                                    )}
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        {s && (
                                                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${s.badge}`}>
                                                                <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                                                                {s.label}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center justify-end gap-1">
                                                            {canManageUnits && (
                                                                <button onClick={() => openEdit(unit)}
                                                                    className="h-8 px-3 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition">
                                                                    Edit
                                                                </button>
                                                            )}
                                                            {canManageUnits && (
                                                                <button onClick={() => handleDelete(unit)}
                                                                    className="h-8 w-8 rounded-lg text-red-500 hover:bg-red-50 transition flex items-center justify-center" title="Hapus Unit">
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/40 flex items-center justify-between">
                                <span className="text-xs text-gray-400">
                                    Menampilkan <span className="font-medium text-gray-600">{filteredUnits.length}</span> dari <span className="font-medium text-gray-600">{units.length}</span> unit
                                </span>
                                {(hasActiveFilter || filterStatus !== "ALL" || filterGradeTab !== "ALL") && (
                                    <span className="text-xs text-amber-600 font-medium">Filter aktif</span>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {showForm && (
                <UnitFormModal
                    laptopId={laptopId}
                    defaultSellingPrice={laptop?.selling_price ?? 0}
                    editingUnit={editingUnit}
                    onClose={closeForm}
                    onSuccess={handleFormSuccess}
                    onError={(msg) => setAlertModal(msg)}
                />
            )}

            {alertModal && <AlertModal message={alertModal} onClose={() => setAlertModal(null)} />}
            {confirmModal && (
                <ConfirmModal message={confirmModal.message} onConfirm={confirmModal.onConfirm} onCancel={() => setConfirmModal(null)} />
            )}
            {showBulkModal && (
                <BulkAddUnitModal
                    laptopId={laptopId}
                    defaultSellingPrice={laptop?.selling_price ?? 0}
                    onClose={() => setShowBulkModal(false)}
                    onSuccess={handleFormSuccess}
                />
            )}
            {toast && <Toast message={toast} onDone={() => setToast("")} />}
        </DashboardLayout>
    );
}

function SkeletonUnits() {
    return (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gray-50/80 border-b border-gray-100">
                            {["Serial Number", "Grade", "Kondisi", "Harga Modal", "Harga Jual", "Margin", "Status", "Aksi"].map(h => (
                                <th key={h} className="px-4 py-3 text-left">
                                    <div className="h-2.5 bg-gray-200 rounded w-16 animate-pulse" />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {[...Array(3)].map((_, i) => (
                            <tr key={i}>
                                {[90, 50, 120, 70, 70, 60, 60, 50].map((w, j) => (
                                    <td key={j} className="px-4 py-3">
                                        <div className="h-3 bg-gray-100 rounded animate-pulse" style={{ width: w }} />
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
    return (
        <th className={`px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap ${right ? "text-right" : "text-left"}`}>
            {children}
        </th>
    );
}