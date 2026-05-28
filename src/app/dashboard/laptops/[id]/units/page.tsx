"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Link from "next/link";

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
}

const GRADE_STYLE: Record<string, { badge: string; label: string; desc: string }> = {
    A: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Grade A", desc: "Sempurna, tanpa cacat" },
    B: { badge: "bg-amber-50 text-amber-700 border-amber-200", label: "Grade B", desc: "Minus sedikit" },
    C: { badge: "bg-red-50 text-red-700 border-red-200", label: "Grade C", desc: "Banyak minus" },
};

const STATUS_STYLE: Record<string, { badge: string; dot: string; label: string }> = {
    SIAP_JUAL: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", label: "Siap Jual" },
    BELUM_SIAP: { badge: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-400", label: "Belum Siap" },
    SERVICE: { badge: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-500", label: "Service" },
    SOLD: { badge: "bg-gray-100 text-gray-500 border-gray-200", dot: "bg-gray-400", label: "Terjual" },
};

const fmt = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");

const EMPTY_FORM = {
    serial_number: "",
    grade: "A",
    condition_note: "",
    purchase_price: "",
    selling_price: "",
    status: "SIAP_JUAL",
    notes: "",
};

export default function UnitsPage() {
    const params = useParams();
    const router = useRouter();
    const laptopId = params.id as string;

    const [laptop, setLaptop] = useState<Laptop | null>(null);
    const [units, setUnits] = useState<LaptopUnit[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [showForm, setShowForm] = useState(false);
    const [editingUnit, setEditingUnit] = useState<LaptopUnit | null>(null);
    const [formData, setFormData] = useState<Record<string, string>>(EMPTY_FORM);
    const [formLoading, setFormLoading] = useState(false);
    const [filterStatus, setFilterStatus] = useState("ALL");

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
        } catch {
            // ignore
        } finally {
            setIsLoading(false);
        }
    }, [laptopId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const filteredUnits = filterStatus === "ALL"
        ? units
        : units.filter(u => u.status === filterStatus);

    const openCreate = () => {
        setEditingUnit(null);
        setFormData({ ...EMPTY_FORM });
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

    const closeForm = () => {
        setShowForm(false);
        setEditingUnit(null);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

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
            if (!result.success) { alert(result.message); return; }

            closeForm();
            fetchData();
        } catch {
            alert("Terjadi kesalahan");
        } finally {
            setFormLoading(false);
        }
    };

    const handleDelete = async (unit: LaptopUnit) => {
        if (!confirm(`Hapus unit SN: ${unit.serial_number}?`)) return;
        try {
            await fetch(`/api/units/${unit.id}`, { method: "DELETE" });
            fetchData();
        } catch {
            alert("Gagal menghapus");
        }
    };

    const counts = {
        total: units.length,
        siap: units.filter(u => u.status === "SIAP_JUAL").length,
        sold: units.filter(u => u.status === "SOLD").length,
        service: units.filter(u => u.status === "SERVICE").length,
    };

    return (
        <DashboardLayout>
            <main className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
                <div className="max-w-5xl mx-auto space-y-5">

                    {/* Breadcrumb */}
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                        <Link href="/dashboard/laptops" className="hover:text-gray-600 transition">Data Laptop</Link>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span className="text-gray-600 font-medium truncate">
                            {isLoading ? "Memuat..." : laptop?.laptop_name || "Detail Unit"}
                        </span>
                    </div>

                    {/* Header */}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h1 className="text-xl sm:text-2xl font-semibold text-gray-800 tracking-tight">
                                {laptop?.laptop_name || "—"}
                            </h1>
                            <p className="text-xs text-gray-400 mt-0.5">
                                {laptop?.brand} · {laptop?.cpu} · {laptop?.ram} · {laptop?.storage}
                            </p>
                        </div>
                        <button
                            onClick={openCreate}
                            className="inline-flex items-center gap-1.5 bg-gray-900 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition shadow-sm"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Tambah Unit
                        </button>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                            { label: "Total Unit", value: counts.total, color: "text-gray-800" },
                            { label: "Siap Jual", value: counts.siap, color: "text-emerald-600" },
                            { label: "Terjual", value: counts.sold, color: "text-gray-500" },
                            { label: "Service", value: counts.service, color: "text-blue-600" },
                        ].map(stat => (
                            <div key={stat.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                                <p className="text-xs text-gray-400 mb-1">{stat.label}</p>
                                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                            </div>
                        ))}
                    </div>

                    {/* Filter */}
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                        <div className="flex flex-wrap gap-2">
                            {[
                                { value: "ALL", label: "Semua" },
                                { value: "SIAP_JUAL", label: "Siap Jual" },
                                { value: "BELUM_SIAP", label: "Belum Siap" },
                                { value: "SERVICE", label: "Service" },
                                { value: "SOLD", label: "Terjual" },
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
                                    {opt.value !== "ALL" && (
                                        <span className={`ml-1.5 ${filterStatus === opt.value ? "text-gray-300" : "text-gray-400"}`}>
                                            ({units.filter(u => u.status === opt.value).length})
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Units Table */}
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
                                                    <td className="px-4 py-3.5">
                                                        <span className="font-mono text-xs text-gray-700 bg-gray-100 px-2 py-1 rounded">
                                                            {unit.serial_number}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3.5">
                                                        {g && (
                                                            <div>
                                                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${g.badge}`}>
                                                                    {g.label}
                                                                </span>
                                                                <p className="text-xs text-gray-400 mt-0.5">{g.desc}</p>
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3.5 max-w-[180px]">
                                                        <span className="text-xs text-gray-600 line-clamp-2">
                                                            {unit.condition_note || <span className="text-gray-300">—</span>}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3.5 text-right text-xs text-gray-500 whitespace-nowrap">
                                                        {fmt(unit.purchase_price)}
                                                    </td>
                                                    <td className="px-4 py-3.5 text-right font-semibold text-gray-800 whitespace-nowrap">
                                                        {fmt(unit.selling_price)}
                                                    </td>
                                                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                                                        <span className={`text-xs font-semibold ${margin >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                                            {margin >= 0 ? "+" : ""}{fmt(margin)}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3.5 whitespace-nowrap">
                                                        {s && (
                                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${s.badge}`}>
                                                                <span className={`w-1.5 h-1.5 rounded-full ${s.dot} flex-shrink-0`} />
                                                                {s.label}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3.5 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                                        <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={() => openEdit(unit)}
                                                                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                                                            >
                                                                Edit
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(unit)}
                                                                className="px-3 py-1.5 text-xs font-medium text-red-500 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition"
                                                            >
                                                                Hapus
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/40">
                                <span className="text-xs text-gray-400">
                                    Menampilkan <span className="font-medium text-gray-600">{filteredUnits.length}</span> dari{" "}
                                    <span className="font-medium text-gray-600">{units.length}</span> unit
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* Form Modal */}
            {showForm && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeForm} />
                    <div className="relative bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] sm:max-h-[88vh]">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
                            <h2 className="font-semibold text-gray-800 text-base">
                                {editingUnit ? `Edit Unit — ${editingUnit.serial_number}` : "Tambah Unit Baru"}
                            </h2>
                            <button onClick={closeForm} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="overflow-y-auto flex-1 px-5 py-5">
                            <form onSubmit={handleSubmit} className="space-y-4">

                                {/* Grade selector — visual */}
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
                                                            ? "border-gray-900 bg-gray-900 text-white"
                                                            : "border-gray-200 hover:border-gray-300"
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

                                <FormField label="Serial Number" required>
                                    <div className="flex gap-2">
                                        <Input name="serial_number" placeholder="Contoh: 0006151" value={formData.serial_number} onChange={handleChange} required />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (!formData.serial_number) { alert("Masukkan serial number dulu"); return; }
                                                window.open(`https://www.google.com/search?q=${encodeURIComponent(formData.serial_number + " laptop")}`, "_blank");
                                            }}
                                            className="px-3 h-10 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 transition whitespace-nowrap"
                                        >
                                            Cek SN
                                        </button>
                                    </div>
                                </FormField>

                                <div className="grid grid-cols-2 gap-3">
                                    <FormField label="Harga Modal">
                                        <Input name="purchase_price" type="number" placeholder="0" value={formData.purchase_price} onChange={handleChange} />
                                    </FormField>
                                    <FormField label="Harga Jual" required>
                                        <Input name="selling_price" type="number" placeholder="0" value={formData.selling_price} onChange={handleChange} required />
                                    </FormField>
                                </div>

                                <FormField label="Status">
                                    <select name="status" value={formData.status} onChange={handleChange}
                                        className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 transition">
                                        <option value="SIAP_JUAL">Siap Jual</option>
                                        <option value="BELUM_SIAP">Belum Siap</option>
                                        <option value="SERVICE">Service</option>
                                        <option value="SOLD">Terjual</option>
                                    </select>
                                </FormField>

                                <FormField label="Catatan Kondisi">
                                    <Input name="condition_note" placeholder="Contoh: Ada goresan di body kiri, layar normal" value={formData.condition_note} onChange={handleChange} />
                                </FormField>

                                <FormField label="Notes Internal">
                                    <textarea name="notes" placeholder="Catatan tambahan (opsional)" value={formData.notes} onChange={handleChange} rows={2}
                                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:bg-white transition resize-none" />
                                </FormField>

                                <div className="flex gap-2 pt-1">
                                    <button type="button" onClick={closeForm}
                                        className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition">
                                        Batal
                                    </button>
                                    <button type="submit" disabled={formLoading}
                                        className="flex-1 h-10 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50">
                                        {formLoading ? "Menyimpan..." : editingUnit ? "Simpan Perubahan" : "Tambah Unit"}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
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