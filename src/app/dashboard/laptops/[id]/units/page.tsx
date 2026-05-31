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

const GRADE_STYLE: Record<string, { badge: string; label: string; desc: string; ring: string }> = {
    A: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", ring: "border-emerald-500 bg-emerald-500", label: "Grade A", desc: "Sempurna / mulus" },
    B: { badge: "bg-amber-50  text-amber-700  border-amber-200", ring: "border-amber-400  bg-amber-400", label: "Grade B", desc: "Minus sedikit" },
    C: { badge: "bg-red-50    text-red-700    border-red-200", ring: "border-red-500    bg-red-500", label: "Grade C", desc: "Banyak minus" },
};

const STATUS_STYLE: Record<string, { badge: string; dot: string; label: string }> = {
    SIAP_JUAL: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", label: "Siap Jual" },
    BELUM_SIAP: { badge: "bg-amber-50  text-amber-700  border-amber-200", dot: "bg-amber-400", label: "Belum Siap" },
    SERVICE: { badge: "bg-blue-50   text-blue-700   border-blue-200", dot: "bg-blue-500", label: "Service" },
    SOLD: { badge: "bg-gray-100  text-gray-500   border-gray-200", dot: "bg-gray-400", label: "Terjual" },
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

function AlertModal({
    message,
    onClose,
}: {
    message: string;
    onClose: () => void;
}) {
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
                <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <p className="text-gray-700 text-sm font-medium mb-5">{message}</p>
                <button
                    onClick={onClose}
                    className="w-full h-10 bg-[#1a1a2e] text-white rounded-xl text-sm font-medium hover:bg-[#16213e] transition"
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
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-xs p-5">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3 ${danger ? "bg-red-50" : "bg-amber-50"}`}>
                    <svg className={`w-5 h-5 ${danger ? "text-red-500" : "text-amber-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <p className="text-gray-700 text-sm text-center leading-relaxed mb-4">{message}</p>
                <div className="flex gap-2">
                    <button onClick={onCancel}
                        className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium active:bg-gray-200 transition">
                        Batal
                    </button>
                    <button onClick={onConfirm}
                        className={`flex-1 h-10 rounded-xl text-sm font-semibold text-white transition ${danger ? "bg-red-500 active:bg-red-600" : "bg-amber-500 active:bg-amber-600"}`}>
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

    // ── Filter ────────────────────────────────────────────────────────────────
    const filteredUnits = filterStatus === "ALL"
        ? units
        : units.filter(u => u.status === filterStatus);

    // ── Stats ─────────────────────────────────────────────────────────────────
    const counts = {
        total: units.length,
        siap: units.filter(u => u.status === "SIAP_JUAL").length,
        sold: units.filter(u => u.status === "SOLD").length,
        service: units.filter(u => u.status === "SERVICE").length,
        belum: units.filter(u => u.status === "BELUM_SIAP").length,
    };

    // ── Modal form ────────────────────────────────────────────────────────────
    const openCreate = () => {
        setEditingUnit(null);
        setFormData({
            ...EMPTY_FORM,
            // pre-fill harga jual dari parent laptop sebagai default
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

            // Ambil units terbaru lalu sync ke parent
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
            <main className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
                <div className="max-w-5xl mx-auto space-y-5">

                    {/* Breadcrumb */}
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                        <Link href="/dashboard/laptops" className="hover:text-gray-600 transition">
                            Data Laptop
                        </Link>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span className="text-gray-600 font-medium truncate">
                            {isLoading ? "Memuat..." : laptop?.laptop_name || "Units"}
                        </span>
                    </div>

                    {/* Header */}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h1 className="text-xl sm:text-2xl font-semibold text-gray-800 tracking-tight">
                                {laptop?.laptop_name || "—"}
                            </h1>
                            <p className="text-xs text-gray-400 mt-0.5">
                                {[laptop?.brand, laptop?.cpu, laptop?.ram, laptop?.storage]
                                    .filter(Boolean).join(" · ")}
                            </p>
                        </div>
                        {/* GANTI: tampilkan hanya jika canManageUnits */}
                        {canManageUnits && (
                            <button
                                onClick={openCreate}
                                className="inline-flex items-center gap-1.5 bg-gray-900 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition shadow-sm"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                Tambah Unit
                            </button>
                        )}
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        {[
                            { label: "Total Unit", value: counts.total, color: "text-gray-800" },
                            { label: "Siap Jual", value: counts.siap, color: "text-emerald-600" },
                            { label: "Belum Siap", value: counts.belum, color: "text-amber-500" },
                            { label: "Service", value: counts.service, color: "text-blue-600" },
                            { label: "Terjual", value: counts.sold, color: "text-gray-400" },
                        ].map(stat => (
                            <div key={stat.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                                <p className="text-xs text-gray-400 mb-1">{stat.label}</p>
                                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                            </div>
                        ))}
                    </div>

                    {/* Filter tabs */}
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                        <div className="flex flex-wrap gap-2">
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
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border ${filterStatus === opt.value
                                        ? "bg-gray-900 text-white border-gray-900"
                                        : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                                        }`}
                                >
                                    {opt.label}
                                    <span className={`ml-1.5 tabular-nums ${filterStatus === opt.value ? "text-gray-400" : "text-gray-300"}`}>
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
                        <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-16 text-center">
                            <div className="text-3xl mb-3">📦</div>
                            <p className="text-gray-500 text-sm font-medium">Belum ada unit terdaftar</p>
                            <p className="text-gray-400 text-xs mt-1">Klik "Tambah Unit" untuk mendaftarkan SN</p>
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
                                            <Th right>Harga Modal</Th>
                                            <Th right>Harga Jual</Th>
                                            <Th right>Margin</Th>
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
                                                    {/* SN */}
                                                    <td className="px-4 py-3.5">
                                                        <span className="font-mono text-xs text-gray-700 bg-gray-100 px-2 py-1 rounded">
                                                            {unit.serial_number}
                                                        </span>
                                                    </td>
                                                    {/* Grade */}
                                                    <td className="px-4 py-3.5 whitespace-nowrap">
                                                        {g && (
                                                            <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-bold border ${g.badge}`}>
                                                                {g.label}
                                                            </span>
                                                        )}
                                                    </td>
                                                    {/* Kondisi */}
                                                    <td className="px-4 py-3.5 max-w-[180px]">
                                                        <span className="text-xs text-gray-600 line-clamp-2">
                                                            {unit.condition_note || <span className="text-gray-300">—</span>}
                                                        </span>
                                                    </td>
                                                    {/* Harga Modal */}
                                                    <td className="px-4 py-3.5 text-right text-xs text-gray-500 whitespace-nowrap tabular-nums">
                                                        {fmt(unit.purchase_price)}
                                                    </td>
                                                    {/* Harga Jual */}
                                                    <td className="px-4 py-3.5 text-right font-semibold text-gray-800 whitespace-nowrap tabular-nums">
                                                        {fmt(unit.selling_price)}
                                                    </td>
                                                    {/* Margin */}
                                                    <td className="px-4 py-3.5 text-right whitespace-nowrap tabular-nums">
                                                        <span className={`text-xs font-semibold ${margin >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                                            {margin >= 0 ? "+" : ""}{fmt(margin)}
                                                        </span>
                                                    </td>
                                                    {/* Status */}
                                                    <td className="px-4 py-3.5 whitespace-nowrap">
                                                        {s && (
                                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${s.badge}`}>
                                                                <span className={`w-1.5 h-1.5 rounded-full ${s.dot} flex-shrink-0`} />
                                                                {s.label}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                                                        {canManageUnits ? (
                                                            <div className="flex items-center justify-end gap-1.5">
                                                                <button
                                                                    onClick={() => openEdit(unit)}
                                                                    className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg active:bg-gray-50 transition"
                                                                >
                                                                    Edit
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDelete(unit)}
                                                                    className="px-3 py-1.5 text-xs font-medium text-red-500 bg-white border border-red-200 rounded-lg active:bg-red-50 transition"
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
                            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/40">
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

            {/* ────────────────────────────────────────────── FORM MODAL ── */}
            {showForm && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeForm} />
                    <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90dvh] sm:max-h-[85vh] sm:mx-4 overflow-hidden">
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
                            <h2 className="font-semibold text-gray-800 text-base">
                                {editingUnit ? `Edit Unit` : "Tambah Unit Baru"}
                            </h2>
                            <button
                                onClick={closeForm}
                                className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 active:bg-gray-100 transition"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Body */}
                        <div className="overflow-y-auto flex-1 px-5 py-5 overscroll-contain">
                            <form onSubmit={handleSubmit} className="space-y-4">

                                {/* Grade — visual card selector */}
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-2">
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
                                                    className={`p-3 rounded-xl border-2 text-left transition ${selected
                                                        ? "border-gray-900 bg-gray-900"
                                                        : "border-gray-200 hover:border-gray-300 bg-white"
                                                        }`}
                                                >
                                                    <p className={`text-sm font-bold ${selected ? "text-white" : gs.badge.split(" ")[1]}`}>
                                                        {gs.label}
                                                    </p>
                                                    <p className={`text-xs mt-0.5 ${selected ? "text-gray-300" : "text-gray-400"}`}>
                                                        {gs.desc}
                                                    </p>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Serial Number */}
                                <FormField label="Serial Number" required>
                                    <div className="flex gap-2">
                                        <Input
                                            name="serial_number"
                                            placeholder="Contoh: 0006151"
                                            value={formData.serial_number}
                                            onChange={handleChange}
                                            required
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (!formData.serial_number) { alert("Masukkan serial number dulu"); return; }
                                                window.open(`https://www.google.com/search?q=${encodeURIComponent(formData.serial_number + " laptop")}`, "_blank");
                                            }}
                                            className="px-3 h-10 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 transition whitespace-nowrap flex-shrink-0"
                                        >
                                            Cek SN
                                        </button>
                                    </div>
                                </FormField>

                                {/* Harga Modal + Harga Jual */}
                                <div className="grid grid-cols-2 gap-3">
                                    <FormField label="Harga Modal">
                                        <Input name="purchase_price" type="number" placeholder="0" value={formData.purchase_price} onChange={handleChange} />
                                    </FormField>
                                    <FormField label="Harga Jual" required>
                                        <Input name="selling_price" type="number" placeholder="0" value={formData.selling_price} onChange={handleChange} required />
                                    </FormField>
                                </div>

                                {/* Preview margin */}
                                {formData.purchase_price && formData.selling_price && (
                                    <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100">
                                        <span className="text-xs text-gray-400">Margin unit ini</span>
                                        <span className={`text-sm font-semibold tabular-nums ${Number(formData.selling_price) - Number(formData.purchase_price) >= 0
                                            ? "text-emerald-600" : "text-red-500"
                                            }`}>
                                            {fmt(Number(formData.selling_price) - Number(formData.purchase_price))}
                                        </span>
                                    </div>
                                )}

                                {/* Status */}
                                <FormField label="Status">
                                    <select
                                        name="status"
                                        value={formData.status}
                                        onChange={handleChange}
                                        className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 transition"
                                    >
                                        <option value="SIAP_JUAL">Siap Jual</option>
                                        <option value="BELUM_SIAP">Belum Siap</option>
                                        <option value="SERVICE">Service</option>
                                        <option value="SOLD">Terjual</option>
                                    </select>
                                </FormField>

                                {/* Catatan Kondisi */}
                                <FormField label="Catatan Kondisi">
                                    <Input
                                        name="condition_note"
                                        placeholder="Contoh: Ada goresan di body kiri, layar normal"
                                        value={formData.condition_note}
                                        onChange={handleChange}
                                    />
                                </FormField>

                                {/* Notes Internal */}
                                <FormField label="Notes Internal">
                                    <textarea
                                        name="notes"
                                        placeholder="Catatan tambahan (opsional)"
                                        value={formData.notes}
                                        onChange={handleChange}
                                        rows={2}
                                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:bg-white transition resize-none"
                                    />
                                </FormField>

                                <div className="flex gap-2 pt-1">
                                    <button
                                        type="button"
                                        onClick={closeForm}
                                        className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium active:bg-gray-200 transition"
                                    >
                                        Batal
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={formLoading}
                                        className="flex-1 h-11 bg-gray-900 text-white rounded-lg text-sm font-medium active:bg-gray-800 transition disabled:opacity-50"
                                    >
                                        {formLoading ? "Menyimpan..." : editingUnit ? "Simpan Perubahan" : "Tambah Unit"}
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
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden animate-pulse">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gray-50/80 border-b border-gray-100">
                            {["Serial Number", "Grade", "Kondisi", "Harga Modal", "Harga Jual", "Margin", "Status", "Aksi"].map(h => (
                                <th key={h} className="px-4 py-3 text-left">
                                    <div className="h-3 bg-gray-200 rounded w-20" />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {[...Array(4)].map((_, i) => (
                            <tr key={i}>
                                {[100, 60, 140, 80, 80, 70, 70, 60].map((w, j) => (
                                    <td key={j} className="px-4 py-4">
                                        <div className="h-4 bg-gray-100 rounded" style={{ width: w }} />
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

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
    return (
        <th className={`px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap ${right ? "text-right" : "text-left"}`}>
            {children}
        </th>
    );
}
function FormField({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
    return (
        <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
                {label} {required && <span className="text-red-400">*</span>}
            </label>
            {children}
        </div>
    );
}
function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <input {...props}
            className={`w-full h-10 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:bg-white transition ${className}`}
        />
    );
}