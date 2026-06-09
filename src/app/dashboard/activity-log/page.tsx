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
    CREATE: "bg-emerald-50 text-emerald-700 border-emerald-200",
    EDIT: "bg-blue-50 text-blue-700 border-blue-200",
    DELETE: "bg-red-50 text-red-700 border-red-200",
    RESTORE: "bg-amber-50 text-amber-700 border-amber-200",
};

const ACTION_ICON: Record<string, React.ReactNode> = {
    CREATE: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14" strokeLinecap="round"/>
        </svg>
    ),
    EDIT: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" strokeLinecap="round"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round"/>
        </svg>
    ),
    DELETE: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinecap="round"/>
        </svg>
    ),
    RESTORE: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
    if (diffMins < 60) return `${diffMins} menit lalu`;
    if (diffHours < 24) return `${diffHours} jam lalu`;
    if (diffDays === 1) return "Kemarin";
    if (diffDays < 7) return `${diffDays} hari lalu`;
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
        <div className="mt-3 space-y-2.5">
            {keys.map((k) => (
                <div key={k} className="text-xs">
                    <span className="font-mono font-semibold text-gray-600 bg-gray-100 px-2 py-1 rounded-lg inline-block mb-1.5">{k}:</span>
                    <div className="flex flex-col sm:flex-row gap-2 mt-1">
                        {before && before[k] !== undefined && (
                            <div className="flex items-center gap-2 bg-red-50 text-red-600 px-3 py-1.5 rounded-xl border border-red-100 text-xs">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <line x1="18" y1="6" x2="6" y2="18" strokeLinecap="round"/>
                                    <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round"/>
                                </svg>
                                <span className="line-through break-all">{String(before[k] ?? "—")}</span>
                            </div>
                        )}
                        {after && after[k] !== undefined && (
                            <div className="flex items-center gap-2 bg-green-50 text-green-700 px-3 py-1.5 rounded-xl border border-green-100 text-xs">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <polyline points="20 6 9 17 4 12" strokeLinecap="round"/>
                                </svg>
                                <span className="break-all">{String(after[k] ?? "—")}</span>
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}

// Loading Skeleton Component
function LogSkeleton() {
    return (
        <div className="px-4 sm:px-5 py-4 animate-pulse">
            <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                <div className="w-20 h-6 bg-gray-200 rounded-lg" />
                <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="h-4 bg-gray-200 rounded w-24" />
                        <div className="h-3 bg-gray-200 rounded w-16" />
                        <div className="h-3 bg-gray-200 rounded w-20" />
                    </div>
                    <div className="h-3 bg-gray-200 rounded w-32" />
                </div>
            </div>
        </div>
    );
}

// Empty State Component
function EmptyState({ hasFilters }: { hasFilters: boolean }) {
    return (
        <div className="text-center py-12 sm:py-16 bg-gradient-to-b from-gray-50 to-white">
            <div className="text-6xl mb-4 animate-float">📋</div>
            <p className="text-gray-500 text-sm font-semibold">Belum ada log aktivitas</p>
            <p className="text-gray-400 text-xs mt-1.5">
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

    // Filter state
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
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-5">
                {/* Header dengan desain modern */}
                <div className="animate-fadeIn">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="w-1 h-8 bg-gradient-to-b from-gray-700 to-gray-900 rounded-full" />
                        <div className="w-8 h-8 bg-gradient-to-br from-gray-700 to-gray-900 rounded-xl flex items-center justify-center shadow-lg">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" strokeLinecap="round"/>
                                <circle cx="12" cy="7" r="4" />
                            </svg>
                        </div>
                        <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-900 bg-clip-text text-transparent">
                            Log Aktivitas
                        </h1>
                    </div>
                    <p className="text-xs sm:text-sm text-gray-500 ml-0 sm:ml-10">
                        Seluruh aktivitas sistem tercatat di sini — <span className="text-gray-600 font-medium">hanya terlihat oleh Admin</span>
                    </p>
                </div>

                {/* Filter Section - Responsive dengan mobile toggle */}
                <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    {/* Mobile filter toggle button */}
                    <div className="sm:hidden p-3 border-b border-gray-100">
                        <button
                            onClick={() => setShowMobileFilters(!showMobileFilters)}
                            className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg text-gray-600 text-sm font-medium"
                        >
                            <div className="flex items-center gap-2">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                                </svg>
                                <span>Filter Log</span>
                                {hasFilters && (
                                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                )}
                            </div>
                            <svg 
                                width="16" 
                                height="16" 
                                viewBox="0 0 24 24" 
                                fill="none" 
                                stroke="currentColor" 
                                strokeWidth="2"
                                className={`transition-transform duration-200 ${showMobileFilters ? "rotate-180" : ""}`}
                            >
                                <polyline points="6 9 12 15 18 9" />
                            </svg>
                        </button>
                    </div>

                    {/* Filter content - responsive */}
                    <div className={`p-3 sm:p-4 space-y-3 transition-all duration-200 ${showMobileFilters ? "block" : "hidden sm:block"}`}>
                        <div className="flex flex-wrap gap-2 sm:gap-3 items-center">
                            <div className="hidden sm:flex items-center gap-2">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                                </svg>
                                <span className="text-sm font-medium text-gray-600">Filter:</span>
                            </div>
                            
                            <div className="flex-1 flex flex-wrap gap-2">
                                <select
                                    value={filterEntity}
                                    onChange={(e) => setFilterEntity(e.target.value)}
                                    className="flex-1 min-w-[120px] text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-700 outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 transition-all duration-200 cursor-pointer"
                                >
                                    <option value="">📦 Semua Entitas</option>
                                    <option value="laptop">💻 Laptop</option>
                                    <option value="unit">🔧 Unit</option>
                                    <option value="transaction">💰 Transaksi</option>
                                    <option value="warranty">🛡️ Garansi</option>
                                </select>

                                <select
                                    value={filterAction}
                                    onChange={(e) => setFilterAction(e.target.value)}
                                    className="flex-1 min-w-[120px] text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-700 outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 transition-all duration-200 cursor-pointer"
                                >
                                    <option value="">⚡ Semua Aksi</option>
                                    <option value="CREATE">✨ CREATE</option>
                                    <option value="EDIT">✏️ EDIT</option>
                                    <option value="RESTORE">🔄 RESTORE</option>
                                    <option value="DELETE">🗑️ DELETE</option>
                                </select>
                            </div>

                            {(hasFilters || total > 0) && (
                                <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto mt-2 sm:mt-0">
                                    {hasFilters && (
                                        <button
                                            onClick={() => { setFilterEntity(""); setFilterAction(""); }}
                                            className="text-xs text-gray-400 hover:text-red-500 transition-colors duration-200 flex items-center gap-1 px-2 py-1"
                                        >
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <line x1="18" y1="6" x2="6" y2="18" strokeLinecap="round"/>
                                                <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round"/>
                                            </svg>
                                            Reset
                                        </button>
                                    )}
                                    <div className="bg-gray-100 px-3 py-1.5 rounded-full">
                                        <span className="text-xs font-semibold text-gray-700">
                                            {total} total log
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Log List dengan desain card-style untuk mobile */}
                <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    {loading ? (
                        <div className="divide-y divide-gray-50">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <LogSkeleton key={i} />
                            ))}
                        </div>
                    ) : logs.length === 0 ? (
                        <EmptyState hasFilters={hasFilters} />
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {logs.map((log, idx) => (
                                <div 
                                    key={log.id} 
                                    className={`p-4 sm:px-5 sm:py-4 transition-all duration-200 hover:bg-gray-50 active:bg-gray-100 ${
                                        idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                                    }`}
                                >
                                    <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                                        {/* Action badge - responsive */}
                                        <div className="flex-shrink-0">
                                            <span className={`inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold px-2.5 py-1.5 rounded-xl border ${ACTION_STYLE[log.action] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                                                {ACTION_ICON[log.action] && (
                                                    <span className="opacity-70">{ACTION_ICON[log.action]}</span>
                                                )}
                                                {log.action}
                                            </span>
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            {/* User info - responsive layout */}
                                            <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                                <span className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                                                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center text-white text-[9px] font-bold shadow-sm">
                                                        {log.user_name?.charAt(0).toUpperCase() || "U"}
                                                    </div>
                                                    <span className="truncate max-w-[120px] sm:max-w-none">{log.user_name}</span>
                                                </span>
                                                <span className="text-[9px] sm:text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                                    {log.user_role?.replace(/_/g, " ")}
                                                </span>
                                                <span className="text-[11px] sm:text-xs text-gray-400">
                                                    {log.action === "CREATE" ? "menambahkan" :
                                                     log.action === "EDIT" ? "mengubah" :
                                                     log.action === "RESTORE" ? "memulihkan" : "menghapus"}
                                                </span>
                                            </div>
                                            
                                            {/* Entity info - responsive */}
                                            <div className="flex flex-wrap items-center gap-2 mb-2">
                                                <span className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-medium text-gray-600 bg-gray-50 px-2.5 py-1 rounded-lg border border-gray-100">
                                                    {ENTITY_ICON[log.entity] && ENTITY_ICON[log.entity]}
                                                    {ENTITY_LABEL[log.entity] ?? log.entity}
                                                </span>
                                                {log.entity_label && (
                                                    <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full">
                                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                            <path d="M20 12H4M12 4v16" strokeLinecap="round"/>
                                                        </svg>
                                                        {log.entity_label}
                                                    </span>
                                                )}
                                            </div>
                                            
                                            {/* Timestamp - responsive */}
                                            <div className="flex flex-wrap items-center gap-2">
                                                <div className="flex items-center gap-1">
                                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                        <circle cx="12" cy="12" r="10" />
                                                        <polyline points="12 6 12 12 16 14" />
                                                    </svg>
                                                    <span className="text-[10px] sm:text-[11px] text-gray-400">
                                                        {formatRelativeTime(log.created_at)}
                                                    </span>
                                                </div>
                                                <span className="text-[9px] sm:text-[10px] text-gray-300">•</span>
                                                <span className="text-[10px] sm:text-[11px] text-gray-400 font-mono">
                                                    {formatDate(log.created_at)}
                                                </span>
                                            </div>

                                            {/* Expand detail button */}
                                            {(log.before_data || log.after_data) && (
                                                <button
                                                    onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                                                    className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] text-gray-500 hover:text-gray-700 mt-2 transition-all duration-200 group"
                                                >
                                                    <svg 
                                                        width="12" 
                                                        height="12" 
                                                        viewBox="0 0 24 24" 
                                                        fill="none" 
                                                        stroke="currentColor" 
                                                        strokeWidth="2.5"
                                                        className={`transition-transform duration-200 ${expanded === log.id ? "rotate-180" : ""}`}
                                                    >
                                                        <polyline points="6 9 12 15 18 9" strokeLinecap="round"/>
                                                    </svg>
                                                    <span className="underline underline-offset-2 group-hover:no-underline">
                                                        {expanded === log.id ? "Sembunyikan detail" : "Lihat detail perubahan"}
                                                    </span>
                                                </button>
                                            )}

                                            {/* Expanded detail dengan animasi */}
                                            {expanded === log.id && (
                                                <div className="mt-3 p-3 sm:p-4 bg-gradient-to-br from-gray-50 to-white rounded-xl border border-gray-100 animate-slideDown">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <div className="w-1 h-5 bg-gradient-to-b from-gray-500 to-gray-700 rounded-full" />
                                                        <span className="text-[11px] sm:text-xs font-semibold text-gray-600 uppercase tracking-wide">Detail Perubahan</span>
                                                    </div>
                                                    <DiffView before={log.before_data} after={log.after_data} />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Pagination - responsive dengan scroll untuk mobile */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 sm:gap-3 pt-2 pb-4 overflow-x-auto">
                        <button
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="flex items-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-2 text-xs sm:text-sm rounded-xl border border-gray-200 bg-white text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 group whitespace-nowrap"
                        >
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <polyline points="15 18 9 12 15 6" strokeLinecap="round"/>
                            </svg>
                            <span className="hidden sm:inline">Sebelumnya</span>
                            <span className="sm:hidden">Prev</span>
                        </button>
                        
                        <div className="flex items-center gap-1.5 sm:gap-2">
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
                                        <span key={idx} className="text-xs sm:text-sm text-gray-400 px-1">...</span>
                                    ) : (
                                        <button
                                            key={idx}
                                            onClick={() => setPage(p as number)}
                                            className={`min-w-[32px] sm:min-w-[40px] h-8 sm:h-9 text-xs sm:text-sm font-semibold rounded-lg transition-all duration-200 ${
                                                page === p
                                                    ? "bg-gradient-to-r from-gray-700 to-gray-900 text-white shadow-md"
                                                    : "text-gray-600 hover:bg-gray-100"
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
                            className="flex items-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-2 text-xs sm:text-sm rounded-xl border border-gray-200 bg-white text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 group whitespace-nowrap"
                        >
                            <span className="hidden sm:inline">Selanjutnya</span>
                            <span className="sm:hidden">Next</span>
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <polyline points="9 18 15 12 9 6" strokeLinecap="round"/>
                            </svg>
                        </button>
                    </div>
                )}
            </div>

            <style jsx>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-12px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes slideDown {
                    from { opacity: 0; transform: translateY(-12px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes float {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-8px); }
                }
                .animate-fadeIn { animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
                .animate-slideDown { animation: slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
                .animate-float { animation: float 2s ease-in-out infinite; }
            `}</style>
        </DashboardLayout>
    );
}