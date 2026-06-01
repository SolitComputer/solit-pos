"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { useEffect, useState } from "react";

type LoginLog = {
    id: string;
    user_name: string;
    user_role: string;
    user_email: string;
    device: string | null;
    ip_address: string | null;
    status: "SUCCESS" | "FAILED";
    created_at: string;
};

const ROLE_LABEL: Record<string, string> = {
    ADMIN:            "Admin",
    KEPALA_SALES:     "Kepala Sales",
    CREW_SALES:       "Crew Sales",
    ACCOUNTING:       "Accounting",
    PENGELOLA_BARANG: "Pengelola Barang",
    TEKNISI:          "Teknisi",
    UNKNOWN:          "Unknown",
};

const ROLE_COLOR: Record<string, string> = {
    ADMIN:            "bg-violet-50 text-violet-700",
    KEPALA_SALES:     "bg-emerald-50 text-emerald-700",
    CREW_SALES:       "bg-sky-50 text-sky-700",
    ACCOUNTING:       "bg-amber-50 text-amber-700",
    PENGELOLA_BARANG: "bg-blue-50 text-blue-700",
    TEKNISI:          "bg-orange-50 text-orange-700",
    UNKNOWN:          "bg-gray-100 text-gray-500",
};

function formatDate(iso: string) {
    return new Intl.DateTimeFormat("id-ID", {
        day:    "2-digit",
        month:  "short",
        year:   "numeric",
        hour:   "2-digit",
        minute: "2-digit",
        second: "2-digit",
    }).format(new Date(iso));
}

// Pisah browser dan OS dari string "Chrome — Windows 10/11"
function DeviceInfo({ device }: { device: string | null }) {
    if (!device) return <span className="text-gray-300 text-xs">—</span>;
    const [browser, os] = device.split(" — ");
    return (
        <div>
            <p className="text-xs font-medium text-gray-700">{browser}</p>
            <p className="text-[11px] text-gray-400">{os}</p>
        </div>
    );
}

export default function LoginLogsPage() {
    const [logs, setLogs] = useState<LoginLog[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [filterStatus, setFilterStatus] = useState("");
    const limit = 25;

    const fetchLogs = async () => {
        setLoading(true);
        const params = new URLSearchParams({
            page:  String(page),
            limit: String(limit),
            ...(filterStatus ? { status: filterStatus } : {}),
            ...(search.trim() ? { search: search.trim() } : {}),
        });
        try {
            const res = await fetch(`/api/login-logs?${params}`);
            const data = await res.json();
            setLogs(data.logs ?? []);
            setTotal(data.total ?? 0);
        } catch {
            setLogs([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchLogs(); }, [page, filterStatus, search]);
    useEffect(() => { setPage(1); }, [filterStatus, search]);

    const totalPages = Math.ceil(total / limit);

    return (
        <DashboardLayout>
            <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

                {/* Header */}
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <div className="w-7 h-7 bg-[#1a1a2e] rounded-lg flex items-center justify-center">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                    <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" />
                                    <polyline points="10 17 15 12 10 7" />
                                    <line x1="15" y1="12" x2="3" y2="12" />
                                </svg>
                            </div>
                            <h1 className="text-xl font-bold text-[#1a1a2e]">Log Login</h1>
                        </div>
                        <p className="text-sm text-gray-500 ml-9">
                            Riwayat login semua user — hanya terlihat oleh Admin.
                        </p>
                    </div>
                    {!loading && (
                        <span className="text-xs text-gray-400 font-medium bg-gray-100 px-2.5 py-1 rounded-full self-start mt-1">
                            {total} log
                        </span>
                    )}
                </div>

                {/* Filter */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    <div className="flex gap-3 flex-wrap">
                        {/* Search */}
                        <div className="relative flex-1 min-w-[200px]">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                            </svg>
                            <input
                                type="text"
                                placeholder="Cari nama user..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full pl-9 pr-3 h-10 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition"
                            />
                        </div>

                        {/* Filter status */}
                        <select
                            value={filterStatus}
                            onChange={e => setFilterStatus(e.target.value)}
                            className="h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition"
                        >
                            <option value="">Semua Status</option>
                            <option value="SUCCESS">✅ Berhasil</option>
                            <option value="FAILED">❌ Gagal</option>
                        </select>

                        {/* Reset */}
                        {(search || filterStatus) && (
                            <button
                                onClick={() => { setSearch(""); setFilterStatus(""); }}
                                className="h-10 px-4 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium active:bg-gray-200 transition"
                            >
                                Reset
                            </button>
                        )}
                    </div>
                </div>

                {/* Tabel */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    {loading ? (
                        // Skeleton
                        <div className="divide-y divide-gray-50">
                            {Array(6).fill(0).map((_, i) => (
                                <div key={i} className="px-5 py-4 flex items-center gap-4 animate-pulse">
                                    <div className="w-8 h-8 rounded-full bg-gray-100 flex-shrink-0" />
                                    <div className="flex-1 space-y-1.5">
                                        <div className="h-3.5 bg-gray-100 rounded w-32" />
                                        <div className="h-3 bg-gray-100 rounded w-24" />
                                    </div>
                                    <div className="h-3 bg-gray-100 rounded w-28" />
                                    <div className="h-3 bg-gray-100 rounded w-20" />
                                    <div className="h-5 bg-gray-100 rounded-full w-16" />
                                </div>
                            ))}
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="py-16 text-center">
                            <p className="text-3xl mb-2">📋</p>
                            <p className="text-gray-500 text-sm font-medium">Belum ada log login</p>
                            <p className="text-gray-400 text-xs mt-1">Log akan muncul saat ada user yang login</p>
                        </div>
                    ) : (
                        <>
                            {/* Header tabel */}
                            <div className="hidden sm:grid grid-cols-[2fr_2fr_1fr_1fr] gap-4 px-5 py-2.5 bg-gray-50/80 border-b border-gray-100">
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">User</p>
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Device</p>
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Waktu</p>
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Status</p>
                            </div>

                            <div className="divide-y divide-gray-50">
                                {logs.map((log) => (
                                    <div key={log.id}
                                        className="grid grid-cols-1 sm:grid-cols-[2fr_2fr_1fr_1fr] gap-3 sm:gap-4 px-5 py-3.5 items-center">

                                        {/* User info */}
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-[#1a1a2e] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                                {log.user_name?.charAt(0)?.toUpperCase() ?? "?"}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-gray-800 truncate">
                                                    {log.status === "FAILED" && log.user_role === "UNKNOWN"
                                                        ? log.user_email  // login gagal — tampilkan email yang dicoba
                                                        : log.user_name
                                                    }
                                                </p>
                                                <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded mt-0.5 ${ROLE_COLOR[log.user_role] ?? "bg-gray-100 text-gray-500"}`}>
                                                    {ROLE_LABEL[log.user_role] ?? log.user_role}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Device */}
                                        <div>
                                            <DeviceInfo device={log.device} />
                                            {log.ip_address && log.ip_address !== "Unknown" && (
                                                <p className="text-[10px] text-gray-300 font-mono mt-0.5">
                                                    {log.ip_address}
                                                </p>
                                            )}
                                        </div>

                                        {/* Waktu */}
                                        <p className="text-xs text-gray-500">
                                            {formatDate(log.created_at)}
                                        </p>

                                        {/* Status */}
                                        <div className="sm:text-right">
                                            {log.status === "SUCCESS" ? (
                                                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                    Berhasil
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-red-50 text-red-600 border border-red-200">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                                    Gagal
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* Pagination */}
                {!loading && totalPages > 1 && (
                    <div className="flex items-center justify-between">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 text-sm bg-white text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed active:bg-gray-50 transition font-medium"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="15 18 9 12 15 6" />
                            </svg>
                            Sebelumnya
                        </button>
                        <span className="text-sm text-gray-500 font-medium">
                            {page} / {totalPages}
                        </span>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 text-sm bg-white text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed active:bg-gray-50 transition font-medium"
                        >
                            Selanjutnya
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="9 18 15 12 9 6" />
                            </svg>
                        </button>
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}