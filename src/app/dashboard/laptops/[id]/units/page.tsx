"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Link from "next/link";
import { UserRole, PERMISSIONS, hasPermission } from "@/lib/permissions";

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

const EMPTY_FORM = {
    serial_number: "",
    grade: "A",
    condition_note: "",
    purchase_price: "",
    selling_price: "",
    status: "SIAP_JUAL",
    notes: "",
};

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

export default function UnitsPage() {
    const params = useParams();
    const laptopId = params.id as string;

    const [laptop, setLaptop] = useState<Laptop | null>(null);
    const [units, setUnits] = useState<LaptopUnit[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [showForm, setShowForm] = useState(false);
    const [editingUnit, setEditingUnit] = useState<LaptopUnit | null>(null);
    const [formData, setFormData] = useState<Record<string, string>>(EMPTY_FORM);
    const [formLoading, setFormLoading] = useState(false);
    const [filterStatus, setFilterStatus] = useState("ALL");
    const [userRole, setUserRole] = useState<UserRole | null>(null);
    const canManageUnits = userRole ? hasPermission(userRole, PERMISSIONS.EDIT_UNITS) : false;
    const canSeePriceInfo = userRole ? hasPermission(userRole, ["ADMIN", "PENGELOLA_BARANG", "ACCOUNTING"] as UserRole[]) : false;
    const [alertModal, setAlertModal] = useState<string | null>(null);
    const [confirmModal, setConfirmModal] = useState<{
        message: string; onConfirm: () => void;
    } | null>(null);

    useEffect(() => {
        fetch("/api/auth/me")
            .then(r => r.json())
            .then(r => setUserRole(r.user?.role ?? null))
            .catch(() => setUserRole(null));
    }, []);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [laptopRes, unitsRes] = await Promise.all([
                fetch(`/api/laptops/${laptopId}`),
                fetch(`/api/laptops/${laptopId}/units`),
            ]);
            const laptopData = await laptopRes.json();
            const unitsData = await unitsRes.json();
            if (laptopData.data) setLaptop(laptopData.data);
            if (unitsData.data) setUnits(unitsData.data);
        } catch { /* ignore */ } finally {
            setIsLoading(false);
        }
    }, [laptopId]);

    useEffect(() => { fetchData(); }, [fetchData]);

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

    const filteredUnits = filterStatus === "ALL"
        ? units
        : units.filter(u => u.status === filterStatus);

    const counts = {
        total: units.length,
        siap: units.filter(u => u.status === "SIAP_JUAL").length,
        sold: units.filter(u => u.status === "SOLD").length,
        service: units.filter(u => u.status === "SERVICE").length,
        belum: units.filter(u => u.status === "BELUM_SIAP").length,
    };

    const openCreate = () => {
        setEditingUnit(null);
        setFormData({
            ...EMPTY_FORM,
            selling_price: laptop ? String(laptop.selling_price || "") : "",
        });
        setShowForm(true);
    };

    const openEdit = (unit: LaptopUnit) => {
        setEditingUnit(unit);
        setFormData({
            serial_number: unit.serial_number,
            grade: unit.grade,
            condition_note: unit.condition_note || "",
            purchase_price: String(unit.purchase_price || ""),
            selling_price: String(unit.selling_price || ""),
            status: unit.status,
            notes: unit.notes || "",
        });
        setShowForm(true);
    };

    const closeForm = () => { setShowForm(false); setEditingUnit(null); };

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
    ) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormLoading(true);
        try {
            const payload = {
                ...formData,
                purchase_price: Number(formData.purchase_price),
                selling_price: Number(formData.selling_price),
            };

            const url = editingUnit
                ? `/api/units/${editingUnit.id}`
                : `/api/laptops/${laptopId}/units`;
            const method = editingUnit ? "PUT" : "POST";

            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const result = await res.json();
            if (!result.success) { setAlertModal(result.message); return; }

            const freshRes = await fetch(`/api/laptops/${laptopId}/units`);
            const freshData = await freshRes.json();
            const freshUnits: LaptopUnit[] = freshData.data || [];
            setUnits(freshUnits);
            await syncLaptopStats(freshUnits);

            closeForm();
        } catch {
            setAlertModal("Terjadi kesalahan");
        } finally {
            setFormLoading(false);
        }
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
                } catch {
                    setAlertModal("Gagal menghapus");
                }
            },
        });
    };

    return (
        <DashboardLayout>
            <main className="min-h-screen bg-gradient-to-br from-gray-50 to-white p-4 sm:p-6 lg:p-8">
                <div className="max-w-7xl mx-auto space-y-5">

                    {/* Breadcrumb */}
                    <div className="flex items-center gap-2 text-sm">
                        <Link href="/dashboard/laptops" className="text-gray-400 hover:text-gray-600 transition">
                            Data Laptop
                        </Link>
                        <svg className="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span className="text-gray-600 font-medium truncate">
                            {isLoading ? "Memuat..." : laptop?.laptop_name || "Units"}
                        </span>
                    </div>

                    {/* Header */}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <div className="w-7 h-7 bg-gradient-to-br from-[#1a1a2e] to-[#16213e] rounded-lg flex items-center justify-center">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                        <rect x="2" y="3" width="20" height="14" rx="2" />
                                        <line x1="8" y1="21" x2="16" y2="21" />
                                        <line x1="12" y1="17" x2="12" y2="21" />
                                    </svg>
                                </div>
                                <h1 className="text-xl font-bold text-[#1a1a2e] tracking-tight">
                                    {laptop?.laptop_name || "—"}
                                </h1>
                            </div>
                            <p className="text-xs text-gray-400 ml-9">
                                {[laptop?.brand, laptop?.cpu, laptop?.ram, laptop?.storage]
                                    .filter(Boolean).join(" · ") || "Detail laptop"}
                            </p>
                        </div>
                        {canManageUnits && (
                            <button
                                onClick={openCreate}
                                className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#1a1a2e] rounded-lg text-sm font-medium text-white hover:bg-[#16213e] transition shadow-sm"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                Tambah Unit
                            </button>
                        )}
                    </div>

                    {/* Stats Cards - Compact */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        {[
                            { label: "Total Unit", value: counts.total, color: "text-gray-800", icon: "📦" },
                            { label: "Siap Jual", value: counts.siap, color: "text-emerald-600", icon: "✅" },
                            { label: "Belum Siap", value: counts.belum, color: "text-amber-600", icon: "⏳" },
                            { label: "Service", value: counts.service, color: "text-blue-600", icon: "🔧" },
                            { label: "Terjual", value: counts.sold, color: "text-gray-500", icon: "💰" },
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

                    {/* Filter Tabs - Compact */}
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-2">
                        <div className="flex flex-wrap gap-1.5">
                            {[
                                { value: "ALL", label: "Semua", count: units.length },
                                { value: "SIAP_JUAL", label: "Siap Jual", count: counts.siap },
                                { value: "BELUM_SIAP", label: "Belum Siap", count: counts.belum },
                                { value: "SERVICE", label: "Service", count: counts.service },
                                { value: "SOLD", label: "Terjual", count: counts.sold },
                            ].map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setFilterStatus(opt.value)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${filterStatus === opt.value
                                            ? "bg-[#1a1a2e] text-white shadow-sm"
                                            : "bg-white text-gray-500 hover:bg-gray-50"
                                        }`}
                                >
                                    {opt.label}
                                    <span className={`ml-1.5 px-1.5 py-0.5 rounded text-xs ${filterStatus === opt.value
                                            ? "bg-white/20 text-white"
                                            : "bg-gray-100 text-gray-500"
                                        }`}>
                                        {opt.count}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Table */}
                    {isLoading ? (
                        <SkeletonUnits />
                    ) : filteredUnits.length === 0 ? (
                        <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-12 text-center">
                            <div className="text-3xl mb-2 opacity-50">📦</div>
                            <p className="text-gray-500 text-sm font-medium">Belum ada unit terdaftar</p>
                            <p className="text-gray-400 text-xs mt-1">
                                {canManageUnits ? "Klik 'Tambah Unit' untuk mendaftarkan SN" : "Belum ada unit yang tersedia"}
                            </p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-gray-50/80 border-b border-gray-100">
                                            <Th>Serial Number</Th>
                                            <Th>Grade</Th>
                                            <Th>Kondisi</Th>
                                            {canSeePriceInfo && <Th right>Harga Modal</Th>}
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
                                            return (
                                                <tr key={unit.id} className="hover:bg-gray-50/60 transition-colors group">
                                                    <td className="px-4 py-3">
                                                        <span className="font-mono text-xs text-gray-700 bg-gray-100 px-2 py-1 rounded">
                                                            {unit.serial_number}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        {g && (
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${g.badge}`}>
                                                                {g.label}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 max-w-[180px]">
                                                        <span className="text-xs text-gray-600 line-clamp-2" title={unit.condition_note}>
                                                            {unit.condition_note || <span className="text-gray-300">—</span>}
                                                        </span>
                                                    </td>
                                                    {canSeePriceInfo && (
                                                        <td className="px-4 py-3 text-right text-xs text-gray-500 whitespace-nowrap tabular-nums">
                                                            {fmt(unit.purchase_price)}
                                                        </td>
                                                    )}
                                                    <td className="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap tabular-nums">
                                                        {fmt(unit.selling_price)}
                                                    </td>
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
                                                    <td className="px-4 py-3 text-right whitespace-nowrap">
                                                        {canManageUnits ? (
                                                            <div className="flex items-center justify-end gap-1.5">
                                                                <button
                                                                    onClick={() => openEdit(unit)}
                                                                    className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded hover:bg-gray-50 transition"
                                                                >
                                                                    Edit
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDelete(unit)}
                                                                    className="px-2.5 py-1 text-xs font-medium text-red-500 bg-white border border-red-200 rounded hover:bg-red-50 transition"
                                                                >
                                                                    Hapus
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <span className="text-[10px] text-gray-300">—</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/40">
                                <span className="text-xs text-gray-400">
                                    Menampilkan{" "}
                                    <span className="font-medium text-gray-600">{filteredUnits.length}</span> dari{" "}
                                    <span className="font-medium text-gray-600">{units.length}</span> unit
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* ── FORM MODAL - COMPACT & CLEAN ── */}
            {showForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeForm} />
                    <div className="relative bg-white w-full max-w-md rounded-xl shadow-xl flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in duration-200">
                        {/* Header - Compact */}
                        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/50">
                            <div>
                                <h3 className="font-semibold text-gray-800 text-sm">
                                    {editingUnit ? "Edit Unit" : "Tambah Unit Baru"}
                                </h3>
                                <p className="text-xs text-gray-400 mt-0.5">
                                    {editingUnit ? "Perbarui informasi unit" : "Isi data unit laptop"}
                                </p>
                            </div>
                            <button
                                onClick={closeForm}
                                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Body - Compact Spacing */}
                        <div className="overflow-y-auto flex-1 px-5 py-4">
                            <form onSubmit={handleSubmit} className="space-y-4">
                                {/* Grade Selector - Compact */}
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                        Grade <span className="text-red-400">*</span>
                                    </label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {(["A", "B", "C"] as const).map(g => {
                                            const gs = GRADE_STYLE[g];
                                            const selected = formData.grade === g;
                                            return (
                                                <button
                                                    key={g}
                                                    type="button"
                                                    onClick={() => setFormData(prev => ({ ...prev, grade: g }))}
                                                    className={`relative py-2 px-2 rounded-lg border transition-all text-center ${selected
                                                            ? `border-${gs.color}-500 bg-${gs.color}-50 shadow-sm`
                                                            : "border-gray-200 hover:border-gray-300 bg-white"
                                                        }`}
                                                >
                                                    <p className={`text-sm font-bold ${selected ? `text-${gs.color}-700` : "text-gray-700"}`}>
                                                        {gs.label}
                                                    </p>
                                                    <p className={`text-[10px] mt-0.5 ${selected ? `text-${gs.color}-600` : "text-gray-400"}`}>
                                                        {gs.desc}
                                                    </p>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Serial Number */}
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                        Serial Number <span className="text-red-400">*</span>
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            name="serial_number"
                                            placeholder="Contoh: SN-2024-001"
                                            value={formData.serial_number}
                                            onChange={handleChange}
                                            required
                                            className="flex-1 h-9 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (!formData.serial_number) { alert("Masukkan serial number dulu"); return; }
                                                window.open(`https://www.google.com/search?q=${encodeURIComponent(formData.serial_number + " laptop")}`, "_blank");
                                            }}
                                            className="px-3 h-9 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 transition whitespace-nowrap"
                                        >
                                            🔍 Cek
                                        </button>
                                    </div>
                                </div>

                                {/* Harga Modal + Harga Jual */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                            Harga Modal
                                        </label>
                                        <input
                                            name="purchase_price"
                                            type="number"
                                            placeholder="0"
                                            value={formData.purchase_price}
                                            onChange={handleChange}
                                            className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                            Harga Jual <span className="text-red-400">*</span>
                                        </label>
                                        <input
                                            name="selling_price"
                                            type="number"
                                            placeholder="0"
                                            value={formData.selling_price}
                                            onChange={handleChange}
                                            required
                                            className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition"
                                        />
                                    </div>
                                </div>

                                {/* Preview margin - Compact */}
                                {formData.purchase_price && formData.selling_price && (
                                    <div className="bg-gray-50 rounded-lg px-3 py-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-medium text-gray-500">Estimasi Margin</span>
                                            <span className={`text-xs font-bold tabular-nums ${Number(formData.selling_price) - Number(formData.purchase_price) >= 0
                                                    ? "text-emerald-600" : "text-red-500"
                                                }`}>
                                                {fmt(Number(formData.selling_price) - Number(formData.purchase_price))}
                                            </span>
                                        </div>
                                        <div className="mt-1.5 h-1 bg-gray-200 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all ${Number(formData.selling_price) - Number(formData.purchase_price) >= 0
                                                        ? "bg-emerald-500" : "bg-red-500"
                                                    }`}
                                                style={{
                                                    width: `${Math.min(100, Math.max(0, (Number(formData.selling_price) - Number(formData.purchase_price)) / Number(formData.selling_price) * 100))}%`
                                                }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Status */}
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                        Status
                                    </label>
                                    <select
                                        name="status"
                                        value={formData.status}
                                        onChange={handleChange}
                                        className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition"
                                    >
                                        <option value="SIAP_JUAL">✅ Siap Jual</option>
                                        <option value="BELUM_SIAP">⏳ Belum Siap</option>
                                        <option value="SERVICE">🔧 Service</option>
                                        <option value="SOLD">💰 Terjual</option>
                                    </select>
                                </div>

                                {/* Catatan Kondisi */}
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                        Catatan Kondisi
                                    </label>
                                    <input
                                        name="condition_note"
                                        placeholder="Kondisi fisik unit..."
                                        value={formData.condition_note}
                                        onChange={handleChange}
                                        className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition"
                                    />
                                </div>

                                {/* Notes Internal */}
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                        Notes Internal
                                    </label>
                                    <textarea
                                        name="notes"
                                        placeholder="Catatan tambahan..."
                                        value={formData.notes}
                                        onChange={handleChange}
                                        rows={2}
                                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition resize-none"
                                    />
                                </div>

                                {/* Actions - Compact */}
                                <div className="flex gap-2 pt-2">
                                    <button
                                        type="button"
                                        onClick={closeForm}
                                        className="flex-1 h-9 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition"
                                    >
                                        Batal
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={formLoading}
                                        className="flex-1 h-9 bg-[#1a1a2e] text-white rounded-lg text-sm font-medium hover:bg-[#16213e] transition disabled:opacity-50"
                                    >
                                        {formLoading ? (
                                            <span className="flex items-center justify-center gap-1.5">
                                                <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                Loading
                                            </span>
                                        ) : (
                                            editingUnit ? "Simpan" : "Tambah"
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {alertModal && <AlertModal message={alertModal} onClose={() => setAlertModal(null)} />}
            {confirmModal && (
                <ConfirmModal
                    message={confirmModal.message}
                    onConfirm={confirmModal.onConfirm}
                    onCancel={() => setConfirmModal(null)}
                />
            )}
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