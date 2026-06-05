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
    CREATE: "bg-gray-100 text-gray-700",
    EDIT: "bg-gray-100 text-gray-700",
    DELETE: "bg-red-50 text-red-600",
    RESTORE: "bg-gray-100 text-gray-700",
};

const ACTION_ICON: Record<string, React.ReactNode> = {
    CREATE: (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14" />
        </svg>
    ),
    EDIT: (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
    ),
    DELETE: (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
        </svg>
    ),
    RESTORE: (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
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
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
    ),
    unit: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <rect x="9" y="9" width="6" height="6" />
        </svg>
    ),
    transaction: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="1" y="4" width="22" height="16" rx="2" />
            <line x1="1" y1="10" x2="23" y2="10" />
        </svg>
    ),
    warranty: (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
        <div className="mt-3 space-y-2">
            {keys.map((k) => (
                <div key={k} className="text-xs">
                    <span className="font-mono text-gray-500 font-semibold bg-gray-100 px-1.5 py-0.5 rounded">{k}:</span>
                    <div className="flex gap-2 flex-wrap mt-1">
                        {before && before[k] !== undefined && (
                            <div className="flex items-center gap-1.5 bg-red-50 text-red-600 px-2 py-1 rounded-lg border border-red-100">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                                <span className="line-through">{String(before[k] ?? "—")}</span>
                            </div>
                        )}
                        {after && after[k] !== undefined && (
                            <div className="flex items-center gap-1.5 bg-green-50 text-green-700 px-2 py-1 rounded-lg border border-green-100">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                                <span>{String(after[k] ?? "—")}</span>
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
        <div className="px-5 py-3.5 animate-pulse">
            <div className="flex items-start gap-3">
                <div className="w-16 h-5 bg-gray-200 rounded-md flex-shrink-0" />
                <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
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
        <div className="text-center py-16 bg-gray-50">
            <div className="text-6xl mb-4 animate-bounce">📋</div>
            <p className="text-gray-500 text-sm font-semibold">Belum ada log aktivitas</p>
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

    // Filter state
    const [filterEntity, setFilterEntity] = useState("");
    const [filterAction, setFilterAction] = useState("");

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
            <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
                {/* Header dengan animasi */}
                <div className="animate-fadeIn">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="w-1 h-7 bg-gradient-to-b from-gray-600 to-gray-800 rounded-full" />
                        <div className="w-7 h-7 bg-gradient-to-br from-gray-600 to-gray-800 rounded-lg flex items-center justify-center shadow-md">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                            </svg>
                        </div>
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-900 bg-clip-text text-transparent">
                            Log Aktivitas
                        </h1>
                    </div>
                    <p className="text-sm text-gray-500 ml-10">
                        Seluruh aktivitas sistem tercatat di sini — <span className="text-gray-600 font-medium">hanya terlihat oleh Admin</span>
                    </p>
                </div>

                {/* Filter Section yang ditingkatkan */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
                    <div className="flex flex-wrap gap-3 items-center">
                        <div className="flex items-center gap-2">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                            </svg>
                            <span className="text-sm font-medium text-gray-600">Filter:</span>
                        </div>
                        
                        <select
                            value={filterEntity}
                            onChange={(e) => setFilterEntity(e.target.value)}
                            className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-700 outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 transition-all duration-200 cursor-pointer"
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
                            className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-700 outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 transition-all duration-200 cursor-pointer"
                        >
                            <option value="">⚡ Semua Aksi</option>
                            <option value="CREATE">✨ CREATE</option>
                            <option value="EDIT">✏️ EDIT</option>
                            <option value="RESTORE">🔄 RESTORE</option>
                            <option value="DELETE">🗑️ DELETE</option>
                        </select>

                        {(hasFilters || total > 0) && (
                            <div className="ml-auto flex items-center gap-2">
                                {hasFilters && (
                                    <button
                                        onClick={() => { setFilterEntity(""); setFilterAction(""); }}
                                        className="text-xs text-gray-400 hover:text-red-500 transition-colors duration-200 flex items-center gap-1"
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <line x1="18" y1="6" x2="6" y2="18" />
                                            <line x1="6" y1="6" x2="18" y2="18" />
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

                {/* Table / List dengan desain modern */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
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
                                    className={`px-5 py-4 transition-all duration-200 hover:bg-gray-50 ${
                                        idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                                    }`}
                                >
                                    <div className="flex items-start gap-3">
                                        {/* Action badge dengan icon */}
                                        <div className="flex-shrink-0">
                                            <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-lg ${ACTION_STYLE[log.action] ?? "bg-gray-100 text-gray-600"}`}>
                                                {ACTION_ICON[log.action] && (
                                                    <span className="opacity-70">{ACTION_ICON[log.action]}</span>
                                                )}
                                                {log.action}
                                            </span>
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            {/* User info */}
                                            <div className="flex items-center gap-2 flex-wrap mb-1">
                                                <span className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                                                    <div className="w-5 h-5 rounded-full bg-gray-600 flex items-center justify-center text-white text-[9px] font-bold">
                                                        {log.user_name?.charAt(0).toUpperCase() || "U"}
                                                    </div>
                                                    {log.user_name}
                                                </span>
                                                <span className="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                                    {log.user_role?.replace(/_/g, " ")}
                                                </span>
                                                <span className="text-xs text-gray-400">
                                                    {log.action === "CREATE" ? "menambahkan" :
                                                     log.action === "EDIT" ? "mengubah" :
                                                     log.action === "RESTORE" ? "memulihkan" : "menghapus"}
                                                </span>
                                                <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600">
                                                    {ENTITY_ICON[log.entity] && ENTITY_ICON[log.entity]}
                                                    {ENTITY_LABEL[log.entity] ?? log.entity}
                                                </span>
                                                {log.entity_label && (
                                                    <span className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
                                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                            <path d="M20 12H4M12 4v16" />
                                                        </svg>
                                                        {log.entity_label}
                                                    </span>
                                                )}
                                            </div>
                                            
                                            {/* Timestamp dengan relative time */}
                                            <div className="flex items-center gap-2 mt-1">
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <circle cx="12" cy="12" r="10" />
                                                    <polyline points="12 6 12 12 16 14" />
                                                </svg>
                                                <span className="text-[11px] text-gray-400">
                                                    {formatRelativeTime(log.created_at)}
                                                </span>
                                                <span className="text-[10px] text-gray-300">•</span>
                                                <span className="text-[11px] text-gray-400 font-mono">
                                                    {formatDate(log.created_at)}
                                                </span>
                                            </div>

                                            {/* Expand detail button */}
                                            {(log.before_data || log.after_data) && (
                                                <button
                                                    onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                                                    className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700 mt-2 transition-all duration-200 group"
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
                                                        <polyline points="6 9 12 15 18 9" />
                                                    </svg>
                                                    <span className="underline underline-offset-2 group-hover:no-underline">
                                                        {expanded === log.id ? "Sembunyikan detail" : "Lihat detail perubahan"}
                                                    </span>
                                                </button>
                                            )}

                                            {/* Expanded detail dengan animasi */}
                                            {expanded === log.id && (
                                                <div className="mt-3 p-4 bg-gray-50 rounded-xl border border-gray-100 animate-slideDown">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <div className="w-1 h-4 bg-gray-400 rounded-full" />
                                                        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Detail Perubahan</span>
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

                {/* Enhanced Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-3 pt-2">
                        <button
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl border border-gray-200 bg-white text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 group"
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
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl border border-gray-200 bg-white text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 group"
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
                @keyframes slideDown {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fadeIn { animation: fadeIn 0.4s ease-out; }
                .animate-slideDown { animation: slideDown 0.3s ease-out; }
                @keyframes bounce {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-10px); }
                }
                .animate-bounce { animation: bounce 1s ease-in-out infinite; }
            `}</style>
        </DashboardLayout>
    );
}