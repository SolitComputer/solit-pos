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

export default function SoldUnitsPage() {
    const params = useParams();
    const laptopId = params.id as string;

    const [laptop, setLaptop] = useState<Laptop | null>(null);
    const [units, setUnits] = useState<LaptopUnit[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState("");

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
                // Hanya SOLD
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

    const filtered = units.filter(u =>
        !search || u.serial_number.toLowerCase().includes(search.toLowerCase())
    );

    const totalRevenue = units.reduce((s, u) => s + (u.selling_price || 0), 0);
    const totalMargin = units.reduce((s, u) => s + ((u.selling_price || 0) - (u.purchase_price || 0)), 0);

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
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                            <p className="text-xs text-gray-400">Total Terjual</p>
                            <p className="text-xl font-bold text-blue-600 mt-1">{units.length} unit</p>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                            <p className="text-xs text-gray-400">Total Revenue</p>
                            <p className="text-xl font-bold text-gray-800 mt-1">{fmt(totalRevenue)}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 col-span-2 sm:col-span-1">
                            <p className="text-xs text-gray-400">Total Margin</p>
                            <p className={`text-xl font-bold mt-1 ${totalMargin >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                {totalMargin >= 0 ? "+" : ""}{fmt(totalMargin)}
                            </p>
                        </div>
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
                                            <Th right>Harga Modal</Th>
                                            <Th right>Harga Jual</Th>
                                            <Th right>Margin</Th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {filtered.map(unit => {
                                            const g = GRADE_STYLE[unit.grade];
                                            const margin = (unit.selling_price || 0) - (unit.purchase_price || 0);
                                            return (
                                                <tr key={unit.id} className="hover:bg-gray-50/60 transition-colors">
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
                                                    <td className="px-4 py-3 text-right text-xs text-gray-500 whitespace-nowrap tabular-nums">
                                                        {fmt(unit.purchase_price)}
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
        </DashboardLayout>
    );
}