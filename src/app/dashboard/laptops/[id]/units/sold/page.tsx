"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
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

const fmt = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");

const GRADE_STYLE: Record<string, { badge: string; label: string }> = {
    A: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Grade A" },
    B: { badge: "bg-amber-50 text-amber-700 border-amber-200", label: "Grade B" },
    C: { badge: "bg-red-50 text-red-700 border-red-200", label: "Grade C" },
};

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
    return (
        <th className={`px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap ${right ? "text-right" : "text-left"}`}>
            {children}
        </th>
    );
}

// ── Inline Edit Cell ──────────────────────────────────────────────────────────
function EditablePriceCell({
    unitId,
    value,
    onSaved,
}: {
    unitId: string;
    value: number;
    onSaved: (unitId: string, newPrice: number) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [inputVal, setInputVal] = useState(String(value));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    // Sync jika value berubah dari luar
    useEffect(() => {
        if (!editing) setInputVal(String(value));
    }, [value, editing]);

    const handleSave = async () => {
        const parsed = Math.round(Number(inputVal.replace(/\./g, "").replace(/,/g, "")));
        if (!Number.isFinite(parsed) || parsed < 0) {
            setError("Nominal tidak valid");
            return;
        }
        if (parsed === value) {
            setEditing(false);
            return;
        }

        setSaving(true);
        setError("");
        try {
            const res = await fetch(`/api/units/${unitId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ purchase_price: parsed }),
            });
            const result = await res.json();
            if (!result.success) {
                setError(result.message || "Gagal menyimpan");
                return;
            }
            onSaved(unitId, parsed);
            setEditing(false);
        } catch {
            setError("Koneksi gagal");
        } finally {
            setSaving(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") handleSave();
        if (e.key === "Escape") {
            setEditing(false);
            setInputVal(String(value));
            setError("");
        }
    };

    if (editing) {
        return (
            <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-1">
                    <input
                        type="number"
                        value={inputVal}
                        onChange={e => { setInputVal(e.target.value); setError(""); }}
                        onKeyDown={handleKeyDown}
                        autoFocus
                        className="w-36 h-7 border border-violet-400 rounded-lg px-2 text-xs text-right tabular-nums bg-white focus:outline-none focus:ring-2 focus:ring-violet-400/30"
                        min={0}
                    />
                    {/* Simpan */}
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="w-7 h-7 flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition disabled:opacity-60"
                        title="Simpan"
                    >
                        {saving ? (
                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                        ) : (
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                        )}
                    </button>
                    {/* Batal */}
                    <button
                        onClick={() => { setEditing(false); setInputVal(String(value)); setError(""); }}
                        className="w-7 h-7 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-lg transition"
                        title="Batal"
                    >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                {error && <p className="text-[10px] text-red-500 font-medium">{error}</p>}
            </div>
        );
    }

    return (
        <div className="flex items-center justify-end gap-1.5 group/cell">
            <span className="text-xs text-gray-500 tabular-nums">{fmt(value)}</span>
            <button
                onClick={() => { setEditing(true); setInputVal(String(value)); }}
                className="opacity-0 group-hover/cell:opacity-100 w-5 h-5 flex items-center justify-center bg-violet-100 hover:bg-violet-200 text-violet-600 rounded transition"
                title="Edit harga modal"
            >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
            </button>
        </div>
    );
}

// ── Toast notifikasi ringan ───────────────────────────────────────────────────
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

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SoldUnitsPage() {
    const params = useParams();
    const laptopId = params.id as string;

    const [laptop, setLaptop] = useState<Laptop | null>(null);
    const [units, setUnits] = useState<LaptopUnit[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [toast, setToast] = useState("");

    const fmtDate = (iso: string) => {
        if (!iso) return "—";
        return new Intl.DateTimeFormat("id-ID", {
            day: "2-digit", month: "short", year: "numeric"
        }).format(new Date(iso));
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

            if (laptopData.data) setLaptop(laptopData.data);
            if (unitsData.data) {
                const sold = (unitsData.data as LaptopUnit[])
                    .filter(u => u.status === "SOLD")
                    .map(u => ({
                        ...u,
                        purchase_price: Math.round(Number(u.purchase_price) || 0),
                        selling_price: Math.round(Number(u.selling_price) || 0),
                    }));
                setUnits(sold);
            }
        } catch { /* ignore */ } finally {
            setIsLoading(false);
        }
    }, [laptopId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Callback setelah save berhasil — update local state tanpa refetch
    const handlePriceSaved = useCallback((unitId: string, newPrice: number) => {
        setUnits(prev => prev.map(u =>
            u.id === unitId ? { ...u, purchase_price: newPrice } : u
        ));
        setToast("Harga modal berhasil diperbarui!");
    }, []);

    const filtered = units.filter(u =>
        !search || u.serial_number.toLowerCase().includes(search.toLowerCase())
    );

    const totalRevenue = units.reduce((s, u) => s + (u.selling_price || 0), 0);
    const totalModal = units.reduce((s, u) => s + (u.purchase_price || 0), 0);
    const totalMargin = totalRevenue - totalModal;

    return (
        <DashboardLayout>
            <main className="min-h-screen bg-gradient-to-br from-gray-50 to-white p-4 sm:p-6 lg:p-8">
                <div className="max-w-7xl mx-auto space-y-5">

                    {/* Breadcrumb */}
                    <div className="flex items-center gap-2 text-sm flex-wrap">
                        <Link href="/dashboard/laptops" className="text-gray-400 hover:text-gray-600 transition">Data Laptop</Link>
                        <svg className="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <Link href={`/dashboard/laptops/${laptopId}/units`} className="text-gray-400 hover:text-gray-600 transition truncate max-w-[160px]">
                            {laptop?.laptop_name || "Units"}
                        </Link>
                        <svg className="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span className="text-gray-600 font-medium">Unit Terjual</span>
                    </div>

                    {/* Header */}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <div className="w-7 h-7 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                                    </svg>
                                </div>
                                <h1 className="text-xl font-bold text-[#1a1a2e] tracking-tight">
                                    Unit Terjual — {laptop?.laptop_name || "—"}
                                </h1>
                            </div>
                            <p className="text-xs text-gray-400 ml-9">
                                {[laptop?.brand, laptop?.cpu, laptop?.ram, laptop?.storage].filter(Boolean).join(" · ")}
                            </p>
                        </div>
                        <Link
                            href={`/dashboard/laptops/${laptopId}/units`}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-200 transition"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                            Kembali ke Units
                        </Link>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                            <p className="text-xs text-gray-400">Total Terjual</p>
                            <p className="text-xl font-bold text-blue-600 mt-1">{units.length} unit</p>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                            <p className="text-xs text-gray-400">Total Revenue</p>
                            <p className="text-xl font-bold text-gray-800 mt-1">{fmt(totalRevenue)}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                            <p className="text-xs text-gray-400">Total Modal</p>
                            <p className="text-xl font-bold text-gray-600 mt-1">{fmt(totalModal)}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                            <p className="text-xs text-gray-400">Total Margin</p>
                            <p className={`text-xl font-bold mt-1 ${totalMargin >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                {totalMargin >= 0 ? "+" : ""}{fmt(totalMargin)}
                            </p>
                        </div>
                    </div>

                    {/* Info edit hint */}
                    <div className="flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-xl px-4 py-2.5">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        <p className="text-xs text-violet-700 font-medium">
                            Hover kolom <span className="font-bold">Harga Modal</span> lalu klik ikon pensil untuk mengedit. Perubahan akan otomatis sync ke riwayat transaksi &amp; dashboard profit.
                        </p>
                    </div>

                    {/* Search */}
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                        <div className="relative">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input
                                type="text"
                                placeholder="Cari serial number..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full h-9 border border-gray-200 rounded-lg pl-9 pr-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition"
                            />
                        </div>
                    </div>

                    {/* Table */}
                    {isLoading ? (
                        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
                            <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin mx-auto" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-12 text-center">
                            <div className="text-3xl mb-2 opacity-50">💰</div>
                            <p className="text-gray-500 text-sm font-medium">
                                {search ? "Tidak ada unit yang cocok" : "Belum ada unit yang terjual"}
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
                                            <Th>Tgl Masuk</Th>
                                            <Th right>
                                                <span className="flex items-center justify-end gap-1">
                                                    Harga Modal
                                                    <span className="text-violet-400 font-bold normal-case tracking-normal">(editable)</span>
                                                </span>
                                            </Th>
                                            <Th right>Harga Jual</Th>
                                            <Th right>Margin</Th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {filtered.map(unit => {
                                            const g = GRADE_STYLE[unit.grade];
                                            const margin = (unit.selling_price || 0) - (unit.purchase_price || 0);
                                            return (
                                                <tr key={unit.id} className="hover:bg-gray-50/60 transition-colors group">
                                                    <td className="px-4 py-3">
                                                        <span className="font-mono text-xs text-gray-700 bg-gray-100 px-2 py-1 rounded">
                                                            {unit.serial_number}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {g && (
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${g.badge}`}>
                                                                {g.label}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 max-w-[180px]">
                                                        <span className="text-xs text-gray-600 line-clamp-2">
                                                            {unit.condition_note || <span className="text-gray-300">—</span>}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        <span className="text-xs text-gray-500">{fmtDate(unit.created_at)}</span>
                                                    </td>
                                                    {/* ── Editable purchase_price ── */}
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        <EditablePriceCell
                                                            unitId={unit.id}
                                                            value={unit.purchase_price}
                                                            onSaved={handlePriceSaved}
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap tabular-nums">
                                                        {fmt(unit.selling_price)}
                                                    </td>
                                                    <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                                                        <span className={`text-xs font-semibold ${margin >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                                            {margin >= 0 ? "+" : ""}{fmt(Math.abs(margin))}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/40">
                                <span className="text-xs text-gray-400">
                                    <span className="font-medium text-gray-600">{filtered.length}</span> unit terjual
                                    {search && units.length !== filtered.length && ` dari ${units.length}`}
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* Toast */}
            {toast && <Toast message={toast} onDone={() => setToast("")} />}
        </DashboardLayout>
    );
}