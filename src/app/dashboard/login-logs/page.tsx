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
    ADMIN: "Admin",
    KEPALA_SALES: "Kepala Sales",
    CREW_SALES: "Crew Sales",
    ACCOUNTING: "Accounting",
    PENGELOLA_BARANG: "Pengelola Barang",
    TEKNISI: "Teknisi",
    UNKNOWN: "Unknown",
};

const ROLE_COLOR: Record<string, string> = {
    ADMIN: "bg-gray-100 text-gray-700",
    KEPALA_SALES: "bg-gray-100 text-gray-700",
    CREW_SALES: "bg-gray-100 text-gray-700",
    ACCOUNTING: "bg-gray-100 text-gray-700",
    PENGELOLA_BARANG: "bg-gray-100 text-gray-700",
    TEKNISI: "bg-gray-100 text-gray-700",
    UNKNOWN: "bg-gray-100 text-gray-500",
};

const ROLE_ICON: Record<string, string> = {
    ADMIN: "👑",
    KEPALA_SALES: "📊",
    CREW_SALES: "💼",
    ACCOUNTING: "💰",
    PENGELOLA_BARANG: "📦",
    TEKNISI: "🔧",
    UNKNOWN: "❓",
};

function formatDate(iso: string) {
    return new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    }).format(new Date(iso));
}

function formatRelativeTime(iso: string) {
    const now = new Date();
    const then = new Date(iso);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Baru saja";
    if (diffMins < 60) return `${diffMins} menit lalu`;
    if (diffHours < 24) return `${diffHours} jam lalu`;
    if (diffDays === 1) return "Kemarin";
    if (diffDays < 7) return `${diffDays} hari lalu`;
    return formatDate(iso);
}

function DeviceInfo({ device }: { device: string | null }) {
    if (!device) return <span className="text-gray-300 text-xs">—</span>;
    const [browser, os] = device.split(" — ");
    return (
        <div>
            <div className="flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                <p className="text-xs font-semibold text-gray-700">{browser}</p>
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5">{os}</p>
        </div>
    );
}

// Loading Skeleton Component
function LogSkeleton() {
    return (
        <div className="px-5 py-4 animate-pulse">
            <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 bg-gray-200 rounded w-32" />
                    <div className="h-3 bg-gray-200 rounded w-24" />
                </div>
                <div className="h-3 bg-gray-200 rounded w-28" />
                <div className="h-3 bg-gray-200 rounded w-20" />
                <div className="h-5 bg-gray-200 rounded-full w-16" />
            </div>
        </div>
    );
}

// Empty State Component
function EmptyState({ hasFilters }: { hasFilters: boolean }) {
    return (
        <div className="text-center py-16 bg-gray-50">
            <div className="text-6xl mb-4 animate-bounce">📋</div>
            <p className="text-gray-500 text-sm font-semibold">Belum ada log login</p>
            <p className="text-gray-400 text-xs mt-1">
                {hasFilters ? "Coba ubah filter yang dipilih" : "Log akan muncul saat ada user yang login"}
            </p>
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
            page: String(page),
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
    const hasFilters = filterStatus !== "" || search !== "";

    return (
        <DashboardLayout>
            <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">

                {/* Header dengan animasi */}
                <div className="animate-fadeIn">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <div className="w-1 h-7 bg-gradient-to-b from-gray-600 to-gray-800 rounded-full" />
                                <div className="w-7 h-7 bg-gradient-to-br from-gray-600 to-gray-800 rounded-lg flex items-center justify-center shadow-md">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                        <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" />
                                        <polyline points="10 17 15 12 10 7" />
                                        <line x1="15" y1="12" x2="3" y2="12" />
                                    </svg>
                                </div>
                                <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-900 bg-clip-text text-transparent">
                                    Log Login
                                </h1>
                            </div>
                            <p className="text-sm text-gray-500 ml-10">
                                Riwayat login semua user — <span className="text-gray-600 font-medium">terlihat oleh Admin, Programmer, & Asisten CEO</span>
                            </p>
                        </div>
                        {!loading && total > 0 && (
                            <div className="bg-gray-100 px-3 py-1.5 rounded-full shadow-sm">
                                <span className="text-xs font-semibold text-gray-700">
                                    📊 {total} total log
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Filter Section yang ditingkatkan */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300">
                    <div className="p-4">
                        <div className="flex gap-3 flex-wrap items-center">
                            {/* Search */}
                            <div className="relative flex-1 min-w-[200px] group">
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-gray-600 transition-colors duration-200"
                                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                                </svg>
                                <input
                                    type="text"
                                    placeholder="Cari nama user atau email..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    className="w-full pl-9 pr-3 h-10 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all duration-200"
                                />
                            </div>

                            {/* Filter status */}
                            <select
                                value={filterStatus}
                                onChange={e => setFilterStatus(e.target.value)}
                                className="h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 transition-all duration-200 cursor-pointer hover:bg-gray-100"
                            >
                                <option value="">📋 Semua Status</option>
                                <option value="SUCCESS">✅ Berhasil</option>
                                <option value="FAILED">❌ Gagal</option>
                            </select>

                            {/* Reset */}
                            {hasFilters && (
                                <button
                                    onClick={() => { setSearch(""); setFilterStatus(""); }}
                                    className="h-10 px-4 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 hover:text-gray-700 transition-all duration-200 flex items-center gap-1.5"
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <line x1="18" y1="6" x2="6" y2="18" />
                                        <line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                    Reset
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Tabel dengan desain modern */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    {loading ? (
                        <div className="divide-y divide-gray-50">
                            {Array(6).fill(0).map((_, i) => (
                                <LogSkeleton key={i} />
                            ))}
                        </div>
                    ) : logs.length === 0 ? (
                        <EmptyState hasFilters={hasFilters} />
                    ) : (
                        <>
                            {/* Header tabel - enhanced */}
                            <div className="hidden lg:grid grid-cols-[2fr_2fr_1.2fr_0.8fr] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100">
                                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                                        <circle cx="12" cy="7" r="4" />
                                    </svg>
                                    User
                                </p>
                                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <rect x="2" y="3" width="20" height="14" rx="2" />
                                        <line x1="8" y1="21" x2="16" y2="21" />
                                    </svg>
                                    Device & IP
                                </p>
                                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="12" cy="12" r="10" />
                                        <polyline points="12 6 12 12 16 14" />
                                    </svg>
                                    Waktu
                                </p>
                                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider text-right">
                                    Status
                                </p>
                            </div>

                            <div className="divide-y divide-gray-100">
                                {logs.map((log, idx) => (
                                    <div
                                        key={log.id}
                                        className={`grid grid-cols-1 lg:grid-cols-[2fr_2fr_1.2fr_0.8fr] gap-3 lg:gap-4 px-5 py-4 transition-all duration-200 hover:bg-gray-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                                            }`}
                                    >
                                        {/* User info - enhanced */}
                                        <div className="flex items-center gap-3">
                                            <div className="relative">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-md ${log.status === "SUCCESS"
                                                        ? "bg-gray-600"
                                                        : "bg-gray-400"
                                                    }`}>
                                                    {log.user_name?.charAt(0)?.toUpperCase() ?? "?"}
                                                </div>
                                                <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-white flex items-center justify-center">
                                                    <div className={`w-2 h-2 rounded-full ${log.status === "SUCCESS" ? "bg-green-500" : "bg-red-500"
                                                        } animate-pulse`} />
                                                </div>
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-gray-800 truncate flex items-center gap-1.5">
                                                    {log.status === "FAILED" && log.user_role === "UNKNOWN"
                                                        ? log.user_email
                                                        : log.user_name
                                                    }
                                                </p>
                                                <div className="flex items-center gap-1 mt-1">
                                                    <span className="text-[10px]">{ROLE_ICON[log.user_role] || "👤"}</span>
                                                    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${ROLE_COLOR[log.user_role] ?? "bg-gray-100 text-gray-500"}`}>
                                                        {ROLE_LABEL[log.user_role] ?? log.user_role}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Device & IP - enhanced */}
                                        <div>
                                            <DeviceInfo device={log.device} />
                                            {log.ip_address && log.ip_address !== "Unknown" && (
                                                <div className="flex items-center gap-1 mt-1.5">
                                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                        <circle cx="12" cy="12" r="3" />
                                                        <path d="M19.4 4.6C18.3 3.5 16.8 3 15 3h-6c-1.8 0-3.3.5-4.4 1.6C3.5 5.7 3 7.2 3 9c0 1.8.5 3.3 1.6 4.4" />
                                                        <path d="M21 9c0 1.8-.5 3.3-1.6 4.4" />
                                                    </svg>
                                                    <code className="text-[10px] text-gray-400 font-mono">
                                                        {log.ip_address}
                                                    </code>
                                                </div>
                                            )}
                                        </div>

                                        {/* Waktu - dengan relative time */}
                                        <div>
                                            <div className="flex items-center gap-1.5 mb-1">
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <circle cx="12" cy="12" r="10" />
                                                    <polyline points="12 6 12 12 16 14" />
                                                </svg>
                                                <span className="text-xs font-medium text-gray-600">
                                                    {formatRelativeTime(log.created_at)}
                                                </span>
                                            </div>
                                            <p className="text-[10px] text-gray-400 font-mono">
                                                {formatDate(log.created_at)}
                                            </p>
                                        </div>

                                        {/* Status - enhanced */}
                                        <div className="lg:text-right">
                                            {log.status === "SUCCESS" ? (
                                                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200 shadow-sm">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                                    ✅ Berhasil
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-red-50 text-red-600 border border-red-200 shadow-sm">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                                    ❌ Gagal
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* Enhanced Pagination */}
                {!loading && totalPages > 1 && (
                    <div className="flex items-center justify-between pt-2">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl border border-gray-200 text-sm bg-white text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 font-medium group"
                        >
                            <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <polyline points="15 18 9 12 15 6" />
                            </svg>
                            Sebelumnya
                        </button>

                        <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-700 bg-gray-100 px-3 py-1.5 rounded-lg">
                                {page}
                            </span>
                            <span className="text-sm text-gray-400">/</span>
                            <span className="text-sm text-gray-500">{totalPages}</span>
                        </div>

                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl border border-gray-200 text-sm bg-white text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 font-medium group"
                        >
                            Selanjutnya
                            <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <polyline points="9 18 15 12 9 6" />
                            </svg>
                        </button>
                    </div>
                )}
            </div>

            <style jsx>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes bounce {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-10px); }
                }
                .animate-fadeIn { animation: fadeIn 0.4s ease-out; }
                .animate-bounce { animation: bounce 1s ease-in-out infinite; }
            `}</style>
        </DashboardLayout>
    );
}