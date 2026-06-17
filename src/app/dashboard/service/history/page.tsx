"use client";
// src/app/dashboard/service/history/page.tsx

import { useEffect, useState, useCallback } from "react";
import ServiceStatusBadge from "@/components/service/ServiceStatusBadge";
import type { ServiceOrder, ServiceStatus } from "@/types/service";
import { STATUS_LABEL } from "@/types/service";
import DashboardLayout from "@/components/layout/DashboardLayout";

function formatDate(iso?: string): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("id-ID", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: false,
    });
}

function getDuration(masuk: string, selesai?: string): string {
    if (!selesai) return "—";
    const diff = Math.floor((new Date(selesai).getTime() - new Date(masuk).getTime()) / 1000 / 60);
    if (diff < 60) return `${diff} mnt`;
    const h = Math.floor(diff / 60);
    if (h < 24) return `${h} j ${diff % 60} mnt`;
    return `${Math.floor(h / 24)} hr ${h % 24} j`;
}

const HISTORY_STATUSES: ServiceStatus[] = ["SUDAH_DIAMBIL", "TIDAK_JADI"];

export default function HistoryPage() {
    const [orders, setOrders] = useState<ServiceOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [filterStatus, setFilterStatus] = useState<ServiceStatus | "ALL">("ALL");

    const fetchOrders = useCallback(async () => {
        setLoading(true);
        try {
            const params = HISTORY_STATUSES.map(s => `status=${s}`).join("&");
            const res = await fetch(`/api/service?${params}`);
            const json = await res.json();
            if (json.success) setOrders(json.data ?? []);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchOrders(); }, [fetchOrders]);

    const filtered = orders.filter(o => {
        const q = search.toLowerCase();
        const matchSearch =
            !q ||
            o.nama.toLowerCase().includes(q) ||
            o.no_hp.includes(q) ||
            o.type_laptop.toLowerCase().includes(q) ||
            o.keluhan.toLowerCase().includes(q);
        const matchStatus = filterStatus === "ALL" || o.status === filterStatus;
        return matchSearch && matchStatus;
    });

    return (
        <DashboardLayout>
            <div className="min-h-screen bg-gray-50">
                {/* Header */}
                <div className="bg-white border-b border-gray-100 px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-lg font-bold text-[#1a1a2e]">Riwayat Servis</h1>
                            <p className="text-xs text-gray-400 mt-0.5">{orders.length} total riwayat</p>
                        </div>
                        <button
                            onClick={fetchOrders}
                            className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                <polyline points="23 4 23 10 17 10" />
                                <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Filters */}
                <div className="px-6 py-3 bg-white border-b border-gray-50 flex items-center gap-3">
                    <div className="relative flex-1 max-w-sm">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Cari nama, no HP, laptop..."
                            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] transition"
                        />
                    </div>
                    <div className="flex items-center gap-1.5">
                        {(["ALL", ...HISTORY_STATUSES] as const).map(s => (
                            <button
                                key={s}
                                onClick={() => setFilterStatus(s)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                                    filterStatus === s
                                        ? "bg-[#1a1a2e] text-white"
                                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                }`}
                            >
                                {s === "ALL" ? "Semua" : STATUS_LABEL[s]}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div className="p-6">
                    {loading ? (
                        <div className="space-y-3">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-16 bg-white rounded-2xl animate-pulse border border-gray-100" />
                            ))}
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-gray-400">
                                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                </svg>
                            </div>
                            <p className="text-sm font-semibold text-gray-600">Tidak ada riwayat</p>
                            <p className="text-xs text-gray-400 mt-1">
                                {search ? "Coba kata kunci lain" : "Belum ada order yang selesai atau tidak jadi"}
                            </p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-gray-100">
                                            {["No", "Pelanggan", "Laptop", "Keluhan", "Jam Masuk", "Jam Done", "Jam Diambil", "Durasi Servis", "Payment", "Dibuat oleh", "Dikerjakan oleh", "Diambil oleh", "Status", "Ket."].map(h => (
                                                <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtered.map(o => {
                                            // ✅ Deteksi order yang berasal dari GAGAL_DIPERBAIKI
                                            // Cirinya: status SUDAH_DIAMBIL tapi ada alasan_tidak_jadi
                                            const isFromGagal = o.status === "SUDAH_DIAMBIL" && !!o.alasan_tidak_jadi;
                                            const isTidakJadi = o.status === "TIDAK_JADI";

                                            return (
                                                <tr
                                                    key={o.id}
                                                    className={`border-b border-gray-50 transition ${
                                                        isTidakJadi
                                                            ? "bg-red-50/50 hover:bg-red-50"
                                                            : isFromGagal
                                                            ? "bg-rose-50/30 hover:bg-rose-50/50"
                                                            : "hover:bg-gray-50"
                                                    }`}
                                                >
                                                    <td className="px-4 py-3 text-gray-400 text-xs font-mono">{o.no_urut}</td>
                                                    <td className="px-4 py-3">
                                                        <p className="font-semibold text-gray-800">{o.nama}</p>
                                                        <p className="text-xs text-gray-400">{o.no_hp}</p>
                                                        {o.alamat && (
                                                            <p className="text-xs text-gray-400 truncate max-w-[120px]">{o.alamat}</p>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <p className="font-medium text-gray-700">{o.type_laptop}</p>
                                                        <p className="text-xs text-gray-400">
                                                            {[o.cpu, o.ram, o.storage].filter(Boolean).join(" · ") || "—"}
                                                        </p>
                                                    </td>
                                                    <td className="px-4 py-3 max-w-[160px]">
                                                        <p className="text-xs text-gray-600 line-clamp-2">{o.keluhan}</p>
                                                    </td>
                                                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                                                        {formatDate(o.tanggal_masuk)}
                                                    </td>
                                                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                                                        {formatDate(o.tanggal_selesai)}
                                                    </td>
                                                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                                                        {formatDate(o.tanggal_diambil)}
                                                    </td>
                                                    <td className="px-4 py-3 text-xs text-gray-500 font-mono whitespace-nowrap">
                                                        {getDuration(o.tanggal_masuk, o.tanggal_selesai)}
                                                    </td>

                                                    {/* ✅ Kolom Payment */}
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        {o.payment_amount ? (
                                                            <div>
                                                                <p className="text-xs font-semibold text-emerald-700">
                                                                    {new Intl.NumberFormat("id-ID", {
                                                                        style: "currency",
                                                                        currency: "IDR",
                                                                        maximumFractionDigits: 0,
                                                                    }).format(o.payment_amount)}
                                                                </p>
                                                                <p className="text-[10px] text-gray-400">{o.payment_method || "CASH"}</p>
                                                            </div>
                                                        ) : isTidakJadi ? (
                                                            // Tidak jadi — tidak ada transaksi
                                                            <span className="text-xs text-gray-300">—</span>
                                                        ) : isFromGagal ? (
                                                            // Dari GAGAL, diambil tanpa biaya
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 text-[10px] font-medium">
                                                                Gratis
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs text-gray-300">—</span>
                                                        )}
                                                    </td>

                                                    <td className="px-4 py-3 text-xs text-gray-500">
                                                        {o.created_by_user?.name || "—"}
                                                    </td>
                                                    <td className="px-4 py-3 text-xs text-gray-500">
                                                        {o.dikerjakan_by_user?.name || "—"}
                                                    </td>
                                                    <td className="px-4 py-3 text-xs text-gray-500">
                                                        {o.diambil_by_user?.name || "—"}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <ServiceStatusBadge status={o.status} />
                                                    </td>

                                                    {/* ✅ Kolom Ket. — badge + alasan untuk ex-GAGAL */}
                                                    <td className="px-4 py-3 max-w-[160px]">
                                                        {isFromGagal ? (
                                                            <div className="space-y-1">
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 text-rose-700 text-[10px] font-semibold whitespace-nowrap">
                                                                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                                        <circle cx="12" cy="12" r="10" />
                                                                        <line x1="15" y1="9" x2="9" y2="15" />
                                                                        <line x1="9" y1="9" x2="15" y2="15" />
                                                                    </svg>
                                                                    Gagal Diperbaiki
                                                                </span>
                                                                <p className="text-xs text-gray-500 line-clamp-2">
                                                                    {o.alasan_tidak_jadi}
                                                                </p>
                                                            </div>
                                                        ) : isTidakJadi && o.alasan_tidak_jadi ? (
                                                            <p className="text-xs text-red-500 line-clamp-2">
                                                                {o.alasan_tidak_jadi}
                                                            </p>
                                                        ) : (
                                                            <span className="text-xs text-gray-300">—</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="px-4 py-3 border-t border-gray-50 text-xs text-gray-400">
                                Menampilkan {filtered.length} dari {orders.length} riwayat
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}