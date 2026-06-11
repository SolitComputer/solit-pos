"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { useEffect, useState } from "react";

type Log = {
    id: string;
    user_name: string;
    user_role: string;
    action: string;
    entity: string;
    entity_label: string | null;
    entity_id: string | null;
    before_data: Record<string, any> | null;
    after_data: Record<string, any> | null;
    created_at: string;
};

const ACTION_STYLE: Record<string, string> = {
    CREATE: "bg-green-50 text-green-700 border-green-200",
    EDIT: "bg-blue-50 text-blue-700 border-blue-200",
    DELETE: "bg-red-50 text-red-700 border-red-200",
    RESTORE: "bg-amber-50 text-amber-700 border-amber-200",
};

const ACTION_ICON: Record<string, React.ReactNode> = {
    CREATE: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14" strokeLinecap="round"/>
        </svg>
    ),
    EDIT: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" strokeLinecap="round"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round"/>
        </svg>
    ),
    DELETE: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinecap="round"/>
        </svg>
    ),
    RESTORE: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" strokeLinecap="round"/>
        </svg>
    ),
};

const ENTITY_LABEL: Record<string, string> = {
    laptop: "Laptop",
    unit: "Unit",
    transaction: "Transaksi",
    warranty: "Garansi",
};

const ENTITY_ICON: Record<string, React.ReactNode> = {
    laptop: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
    ),
    unit: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <rect x="9" y="9" width="6" height="6" />
        </svg>
    ),
    transaction: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="1" y="4" width="22" height="16" rx="2" />
            <line x1="1" y1="10" x2="23" y2="10" />
        </svg>
    ),
    warranty: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
    ),
};

function formatDate(iso: string) {
    return new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
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
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays === 1) return "Kemarin";
    if (diffDays < 7) return `${diffDays}d`;
    return formatDate(iso);
}

function DiffView({ before, after }: { before: any; after: any }) {
    if (!before && !after) return null;

    const keys = Array.from(
        new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])
    ).filter((k) => {
        if (["id", "created_at", "updated_at", "last_edited_at"].includes(k)) return false;
        if (!before) return true;
        return JSON.stringify(before[k]) !== JSON.stringify(after?.[k]);
    });

    if (keys.length === 0) return <p className="text-xs text-gray-400 italic">Tidak ada perubahan terdeteksi.</p>;

    return (
        <div className="mt-4 space-y-3">
            {keys.map((k) => (
                <div key={k} className="text-sm">
                    <div className="font-semibold text-gray-700 text-xs uppercase tracking-wide mb-2.5 block">
                        {k}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                        {before && before[k] !== undefined && (
                            <div className="flex-1 flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg p-3">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-red-500 flex-shrink-0 mt-0.5">
                                    <line x1="18" y1="6" x2="6" y2="18" strokeLinecap="round"/>
                                    <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round"/>
                                </svg>
                                <span className="text-xs text-red-600 break-all line-through opacity-75">{String(before[k] ?? "—")}</span>
                            </div>
                        )}
                        {after && after[k] !== undefined && (
                            <div className="flex-1 flex items-start gap-2 bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-600 flex-shrink-0 mt-0.5">
                                    <polyline points="20 6 9 17 4 12" strokeLinecap="round"/>
                                </svg>
                                <span className="text-xs text-emerald-700 break-all font-medium">{String(after[k] ?? "—")}</span>
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}

function LogSkeleton() {
    return (
        <div className="px-4 sm:px-6 py-4 animate-pulse">
            <div className="flex gap-4">
                <div className="w-20 h-8 bg-gray-200 rounded-lg flex-shrink-0" />
                <div className="flex-1 space-y-3">
                    <div className="flex gap-2 items-center">
                        <div className="w-5 h-5 rounded-full bg-gray-200" />
                        <div className="h-4 bg-gray-200 rounded w-32" />
                        <div className="h-4 bg-gray-200 rounded w-24" />
                    </div>
                    <div className="h-3 bg-gray-200 rounded w-48" />
                    <div className="h-3 bg-gray-200 rounded w-40" />
                </div>
            </div>
        </div>
    );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
    return (
        <div className="text-center py-16 sm:py-20">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400">
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                </svg>
            </div>
            <p className="text-gray-600 text-sm font-medium">Belum ada log aktivitas</p>
            <p className="text-gray-400 text-xs mt-1">
                {hasFilters ? "Coba ubah filter yang dipilih" : "Aktivitas akan muncul di sini"}
            </p>
        </div>
    );
}

export default function ActivityLogPage() {
    const [logs, setLogs] = useState<Log[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<string | null>(null);

    const [filterEntity, setFilterEntity] = useState("");
    const [filterAction, setFilterAction] = useState("");
    const [showMobileFilters, setShowMobileFilters] = useState(false);

    const limit = 20;

    const fetchLogs = async () => {
        setLoading(true);
        const params = new URLSearchParams({
            page: String(page),
            limit: String(limit),
            ...(filterEntity ? { entity: filterEntity } : {}),
            ...(filterAction ? { action: filterAction } : {}),
        });
        const res = await fetch(`/api/activity-logs?${params}`);
        const data = await res.json();
        setLogs(data.logs ?? []);
        setTotal(data.total ?? 0);
        setLoading(false);
    };

    useEffect(() => { fetchLogs(); }, [page, filterEntity, filterAction]);
    useEffect(() => { setPage(1); }, [filterEntity, filterAction]);

    const totalPages = Math.ceil(total / limit);
    const hasFilters = filterEntity !== "" || filterAction !== "";

    return (
        <DashboardLayout>
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-7">
                {/* Header Section - Premium Design */}
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-600">
                                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" strokeLinecap="round"/>
                                <circle cx="12" cy="7" r="4" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Log Aktivitas</h1>
                            <p className="text-sm text-gray-500 mt-0.5">Pantau semua aktivitas sistem secara real-time</p>
                        </div>
                    </div>
                </div>

                {/* Filter Section - Clean & Modern */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden transition-all duration-200">
                    {/* Mobile Filter Toggle */}
                    <div className="sm:hidden p-4 border-b border-gray-100">
                        <button
                            onClick={() => setShowMobileFilters(!showMobileFilters)}
                            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg text-gray-700 text-sm font-medium hover:bg-gray-100 transition-colors"
                        >
                            <div className="flex items-center gap-2.5">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                                </svg>
                                <span>Filter</span>
                                {hasFilters && <span className="w-2 h-2 rounded-full bg-gray-400" />}
                            </div>
                            <svg 
                                width="16" 
                                height="16" 
                                viewBox="0 0 24 24" 
                                fill="none" 
                                stroke="currentColor" 
                                strokeWidth="2"
                                className={`transition-transform duration-300 ${showMobileFilters ? "rotate-180" : ""}`}
                            >
                                <polyline points="6 9 12 15 18 9" />
                            </svg>
                        </button>
                    </div>

                    {/* Filter Content */}
                    <div className={`p-5 sm:p-6 space-y-4 transition-all duration-300 ${showMobileFilters ? "block" : "hidden sm:block"}`}>
                        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                            <div className="hidden sm:flex items-center gap-2 text-sm font-medium text-gray-600">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                                </svg>
                                Filter:
                            </div>
                            
                            <div className="flex-1 flex flex-col sm:flex-row gap-3">
                                <select
                                    value={filterEntity}
                                    onChange={(e) => setFilterEntity(e.target.value)}
                                    className="flex-1 px-4 py-2.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 font-medium outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent transition-all cursor-pointer hover:border-gray-300"
                                >
                                    <option value="">Semua Entitas</option>
                                    <option value="laptop">💻 Laptop</option>
                                    <option value="unit">🔧 Unit</option>
                                    <option value="transaction">💰 Transaksi</option>
                                    <option value="warranty">🛡️ Garansi</option>
                                </select>

                                <select
                                    value={filterAction}
                                    onChange={(e) => setFilterAction(e.target.value)}
                                    className="flex-1 px-4 py-2.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 font-medium outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent transition-all cursor-pointer hover:border-gray-300"
                                >
                                    <option value="">Semua Aksi</option>
                                    <option value="CREATE">✨ Tambah</option>
                                    <option value="EDIT">✏️ Edit</option>
                                    <option value="DELETE">🗑️ Hapus</option>
                                    <option value="RESTORE">🔄 Kembalikan</option>
                                </select>
                            </div>
                        </div>

                        {/* Filter Controls */}
                        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                            {hasFilters && (
                                <button
                                    onClick={() => { setFilterEntity(""); setFilterAction(""); }}
                                    className="text-xs font-medium text-gray-500 hover:text-gray-700 flex items-center gap-1.5 transition-colors"
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <line x1="18" y1="6" x2="6" y2="18" strokeLinecap="round"/>
                                        <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round"/>
                                    </svg>
                                    Reset Filter
                                </button>
                            )}
                            <div className={`text-xs font-semibold px-3 py-1.5 rounded-full ${total > 0 ? 'bg-gray-100 text-gray-700' : 'text-gray-400'}`}>
                                {total} {total === 1 ? 'log' : 'logs'}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Log List - Premium Cards */}
                <div className="space-y-3">
                    {loading ? (
                        <div className="space-y-3">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm">
                                    <LogSkeleton />
                                </div>
                            ))}
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
                            <EmptyState hasFilters={hasFilters} />
                        </div>
                    ) : (
                        logs.map((log, idx) => (
                            <div 
                                key={log.id}
                                className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 hover:border-gray-300 group"
                            >
                                <div className="p-5 sm:p-6">
                                    <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                                        {/* Action Badge - Left Accent */}
                                        <div className="flex-shrink-0">
                                            <span className={`inline-flex items-center gap-2 text-xs font-bold px-3.5 py-2 rounded-lg border ${ACTION_STYLE[log.action] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
                                                {ACTION_ICON[log.action] && ACTION_ICON[log.action]}
                                                {log.action}
                                            </span>
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            {/* User & Action Info */}
                                            <div className="flex flex-wrap items-center gap-2 mb-3">
                                                <span className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[11px] font-bold text-gray-600 flex-shrink-0">
                                                        {log.user_name?.charAt(0).toUpperCase() || "U"}
                                                    </div>
                                                    {log.user_name}
                                                </span>
                                                <span className="text-[11px] text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full font-medium">
                                                    {log.user_role?.replace(/_/g, " ")}
                                                </span>
                                            </div>

                                            {/* Entity & Description */}
                                            <div className="flex flex-wrap items-center gap-2 mb-2.5">
                                                <span className="text-gray-600 text-sm">
                                                    {log.action === "CREATE" ? "Menambahkan" :
                                                     log.action === "EDIT" ? "Mengubah" :
                                                     log.action === "RESTORE" ? "Memulihkan" : "Menghapus"}
                                                </span>
                                                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 bg-gray-100 px-3 py-1.5 rounded-lg border border-gray-200">
                                                    {ENTITY_ICON[log.entity]}
                                                    {ENTITY_LABEL[log.entity] ?? log.entity}
                                                </span>
                                                {log.entity_label && (
                                                    <span className="text-xs text-gray-500 bg-gray-50 px-2.5 py-1 rounded-lg border border-gray-150">
                                                        "{log.entity_label}"
                                                    </span>
                                                )}
                                            </div>

                                            {/* Timestamp */}
                                            <div className="flex items-center gap-2 text-xs text-gray-500 mb-3.5">
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <circle cx="12" cy="12" r="10" />
                                                    <polyline points="12 6 12 12 16 14" />
                                                </svg>
                                                <span className="font-medium">{formatRelativeTime(log.created_at)}</span>
                                                <span className="text-gray-300">•</span>
                                                <span className="text-gray-400">{formatDate(log.created_at)}</span>
                                            </div>

                                            {/* Expand Detail Button */}
                                            {(log.before_data || log.after_data) && (
                                                <button
                                                    onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                                                    className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors group/btn"
                                                >
                                                    <svg 
                                                        width="14" 
                                                        height="14" 
                                                        viewBox="0 0 24 24" 
                                                        fill="none" 
                                                        stroke="currentColor" 
                                                        strokeWidth="2.5"
                                                        className={`transition-transform duration-300 group-hover/btn:text-gray-900 ${expanded === log.id ? "rotate-180" : ""}`}
                                                    >
                                                        <polyline points="6 9 12 15 18 9" strokeLinecap="round"/>
                                                    </svg>
                                                    {expanded === log.id ? "Sembunyikan detail" : "Lihat detail perubahan"}
                                                </button>
                                            )}

                                            {/* Expanded Detail */}
                                            {expanded === log.id && (
                                                <div className="mt-5 pt-5 border-t border-gray-100 animate-slideDown">
                                                    <div className="flex items-center gap-2 mb-4">
                                                        <div className="w-1 h-5 bg-gray-300 rounded-full" />
                                                        <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Detail Perubahan</span>
                                                    </div>
                                                    <DiffView before={log.before_data} after={log.after_data} />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Pagination - Elegant */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 sm:gap-3 pt-6 pb-4">
                        <button
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 group"
                        >
                            <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <polyline points="15 18 9 12 15 6" strokeLinecap="round"/>
                            </svg>
                            <span className="hidden sm:inline">Sebelumnya</span>
                        </button>
                        
                        <div className="flex items-center gap-1.5">
                            {(() => {
                                let pages = [];
                                let start = Math.max(1, page - 2);
                                let end = Math.min(totalPages, page + 2);
                                
                                if (start > 1) {
                                    pages.push(1);
                                    if (start > 2) pages.push('...');
                                }
                                for (let i = start; i <= end; i++) pages.push(i);
                                if (end < totalPages) {
                                    if (end < totalPages - 1) pages.push('...');
                                    pages.push(totalPages);
                                }
                                
                                return pages.map((p, idx) => (
                                    p === '...' ? (
                                        <span key={idx} className="text-xs text-gray-400 px-2">...</span>
                                    ) : (
                                        <button
                                            key={idx}
                                            onClick={() => setPage(p as number)}
                                            className={`min-w-[36px] h-9 text-sm font-medium rounded-lg transition-all duration-200 ${
                                                page === p
                                                    ? "bg-gray-800 text-white shadow-md"
                                                    : "text-gray-600 hover:bg-gray-100 border border-transparent hover:border-gray-200"
                                            }`}
                                        >
                                            {p}
                                        </button>
                                    )
                                ));
                            })()}
                        </div>
                        
                        <button
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 group"
                        >
                            <span className="hidden sm:inline">Selanjutnya</span>
                            <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <polyline points="9 18 15 12 9 6" strokeLinecap="round"/>
                            </svg>
                        </button>
                    </div>
                )}
            </div>

            <style jsx>{`
                @keyframes slideDown {
                    from { opacity: 0; transform: translateY(-8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-slideDown { animation: slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
                .border-gray-150 { border-color: rgba(107, 114, 128, 0.15); }
            `}</style>
        </DashboardLayout>
    );
}