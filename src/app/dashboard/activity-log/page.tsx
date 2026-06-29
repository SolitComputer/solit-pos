"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { useEffect, useRef, useState } from "react";

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

// ─── Constants ───────────────────────────────────────────────────────────────

const ACTION_STYLE: Record<string, string> = {
    CREATE:  "bg-emerald-50 text-emerald-700 border-emerald-200",
    EDIT:    "bg-blue-50 text-blue-700 border-blue-200",
    DELETE:  "bg-red-50 text-red-700 border-red-200",
    RESTORE: "bg-amber-50 text-amber-700 border-amber-200",
};

const ACTION_DOT: Record<string, string> = {
    CREATE:  "bg-emerald-500",
    EDIT:    "bg-blue-500",
    DELETE:  "bg-red-500",
    RESTORE: "bg-amber-500",
};

const ACTION_BORDER_EXPANDED: Record<string, string> = {
    CREATE:  "border-emerald-200",
    EDIT:    "border-blue-200",
    DELETE:  "border-red-200",
    RESTORE: "border-amber-200",
};

const ACTION_ICON: Record<string, React.ReactNode> = {
    CREATE: (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
        </svg>
    ),
    EDIT: (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
    ),
    DELETE: (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
        </svg>
    ),
    RESTORE: (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
        </svg>
    ),
};

const ACTION_VERB: Record<string, string> = {
    CREATE:  "Menambahkan",
    EDIT:    "Mengubah",
    DELETE:  "Menghapus",
    RESTORE: "Memulihkan",
};

const ENTITY_LABEL: Record<string, string> = {
    laptop:      "Laptop",
    unit:        "Unit",
    transaction: "Transaksi",
    warranty:    "Garansi",
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
    return new Intl.DateTimeFormat("id-ID", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    }).format(new Date(iso));
}

function formatRelativeTime(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (mins < 1)   return "Baru saja";
    if (mins < 60)  return `${mins}m lalu`;
    if (hours < 24) return `${hours}j lalu`;
    if (days === 1) return "Kemarin";
    if (days < 7)   return `${days}h lalu`;
    return formatDate(iso);
}

function formatDayLabel(iso: string): string {
    const d         = new Date(iso);
    const today     = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString())     return "Hari ini";
    if (d.toDateString() === yesterday.toDateString()) return "Kemarin";
    return new Intl.DateTimeFormat("id-ID", {
        weekday: "long", day: "numeric", month: "long",
    }).format(d);
}

function diffKeys(before: Record<string, any> | null, after: Record<string, any> | null) {
    const skip = ["id", "created_at", "updated_at", "last_edited_at"];
    const keys = Array.from(new Set([
        ...Object.keys(before ?? {}),
        ...Object.keys(after  ?? {}),
    ]));
    return keys.filter((k) => {
        if (skip.includes(k)) return false;
        if (!before) return true;
        return JSON.stringify(before[k]) !== JSON.stringify((after ?? {})[k]);
    });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DiffView({ before, after }: { before: any; after: any }) {
    if (!before && !after) return null;
    const keys = diffKeys(before, after);
    if (keys.length === 0)
        return <p className="text-xs text-gray-400 italic">Tidak ada perubahan terdeteksi.</p>;

    return (
        <div className="mt-3 space-y-3">
            {keys.map((k) => (
                <div key={k}>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">{k}</p>
                    <div className="flex flex-col sm:flex-row gap-2">
                        {before?.[k] !== undefined && (
                            <div className="flex-1 flex items-start gap-2 bg-red-50 border border-red-100 rounded-[9px] px-3 py-2.5">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-red-400 flex-shrink-0 mt-0.5">
                                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                                <span className="text-xs text-red-500 break-all line-through opacity-80">{String(before[k] ?? "—")}</span>
                            </div>
                        )}
                        {after?.[k] !== undefined && (
                            <div className="flex-1 flex items-start gap-2 bg-emerald-50 border border-emerald-100 rounded-[9px] px-3 py-2.5">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-emerald-500 flex-shrink-0 mt-0.5">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                                <span className="text-xs text-emerald-700 break-all font-semibold">{String(after[k] ?? "—")}</span>
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}

function DateDivider({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-3 py-1 mb-2">
            <div className="h-px flex-1 bg-gray-100" />
            <span className="text-[11px] font-bold text-gray-300 uppercase tracking-widest whitespace-nowrap">
                {label}
            </span>
            <div className="h-px flex-1 bg-gray-100" />
        </div>
    );
}

function LogCard({
    log,
    isExpanded,
    onToggle,
}: {
    log: Log;
    isExpanded: boolean;
    onToggle: () => void;
}) {
    const hasDiff = !!(log.before_data || log.after_data);

    return (
        <div className="relative pl-8">
            {/* Timeline dot */}
            <span
                className={`absolute left-0 top-5 w-3 h-3 rounded-full border-2 border-white ring-[1.5px] ring-gray-200 z-10 ${ACTION_DOT[log.action] ?? "bg-gray-400"}`}
            />

            <div className={`bg-white rounded-2xl transition-all duration-200 overflow-hidden border ${
                isExpanded
                    ? (ACTION_BORDER_EXPANDED[log.action] ?? "border-gray-200")
                    : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
            }`}>
                <div className="p-4 sm:p-5">

                    {/* ── Top row: action badge + user avatar + name + role ── */}
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-lg border ${ACTION_STYLE[log.action] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
                            {ACTION_ICON[log.action]}
                            {log.action}
                        </span>

                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-500 flex-shrink-0">
                                {log.user_name?.charAt(0).toUpperCase() ?? "U"}
                            </div>
                            <span className="text-[13px] font-bold text-gray-900 leading-none">
                                {log.user_name}
                            </span>
                        </div>

                        <span className="text-[11px] text-gray-400 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-full">
                            {log.user_role?.replace(/_/g, " ")}
                        </span>
                    </div>

                    {/* ── Description row ── */}
                    <div className="flex flex-wrap items-center gap-1.5 mb-3 text-[13px] text-gray-500">
                        <span>{ACTION_VERB[log.action] ?? log.action}</span>
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-[9px]">
                            {ENTITY_ICON[log.entity]}
                            {ENTITY_LABEL[log.entity] ?? log.entity}
                        </span>
                        {log.entity_label && (
                            <span className="text-xs text-gray-400 italic">
                                &quot;{log.entity_label}&quot;
                            </span>
                        )}
                    </div>

                    {/* ── Footer row: timestamp + expand toggle ── */}
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                            </svg>
                            <span className="font-semibold text-gray-500">{formatRelativeTime(log.created_at)}</span>
                            <span className="text-gray-200">•</span>
                            <span>{formatDate(log.created_at)}</span>
                        </div>

                        {hasDiff && (
                            <button
                                onClick={onToggle}
                                className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-700 transition-colors flex-shrink-0"
                            >
                                <svg
                                    width="13" height="13" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                                    className={`transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}
                                >
                                    <polyline points="6 9 12 15 18 9" />
                                </svg>
                                {isExpanded ? "Sembunyikan detail" : "Lihat detail"}
                            </button>
                        )}
                    </div>

                    {/* ── Diff panel ── */}
                    {isExpanded && (
                        <div className="mt-4 pt-4 border-t border-gray-100 animate-slideDown">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="w-0.5 h-3.5 bg-gray-200 rounded-full block" />
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                    Detail perubahan
                                </span>
                            </div>
                            <DiffView before={log.before_data} after={log.after_data} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function LogSkeleton() {
    return (
        <div className="relative pl-8 mb-3">
            <span className="absolute left-0 top-5 w-3 h-3 rounded-full border-2 border-white ring-[1.5px] ring-gray-200 bg-gray-200" />
            <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 animate-pulse space-y-3">
                <div className="flex items-center gap-2">
                    <div className="w-16 h-6 bg-gray-100 rounded-lg" />
                    <div className="w-6 h-6 bg-gray-100 rounded-full" />
                    <div className="w-28 h-4 bg-gray-100 rounded" />
                    <div className="w-20 h-4 bg-gray-100 rounded-full" />
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-16 h-3 bg-gray-100 rounded" />
                    <div className="w-20 h-6 bg-gray-100 rounded-[9px]" />
                    <div className="w-24 h-3 bg-gray-100 rounded" />
                </div>
                <div className="w-44 h-3 bg-gray-100 rounded" />
            </div>
        </div>
    );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
    return (
        <div className="text-center py-20">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-300">
                    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
                </svg>
            </div>
            <p className="text-sm font-semibold text-gray-500">Belum ada log aktivitas</p>
            <p className="text-xs text-gray-400 mt-1">
                {hasFilters ? "Coba ubah filter yang dipilih" : "Aktivitas akan muncul di sini"}
            </p>
        </div>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ActivityLogPage() {
    const [logs, setLogs]                       = useState<Log[]>([]);
    const [total, setTotal]                     = useState(0);
    const [page, setPage]                       = useState(1);
    const [loading, setLoading]                 = useState(true);
    const [expanded, setExpanded]               = useState<string | null>(null);
    const [filterEntity, setFilterEntity]       = useState("");
    const [filterAction, setFilterAction]       = useState("");
    const [showMobileFilters, setShowMobileFilters] = useState(false);
    const [searchName, setSearchName]           = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const limit      = 20;
    const totalPages = Math.ceil(total / limit);
    const hasFilters = filterEntity !== "" || filterAction !== "" || debouncedSearch !== "";
    const activeFilterCount = [filterEntity, filterAction, debouncedSearch].filter(Boolean).length;

    // Debounce search 400ms
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setDebouncedSearch(searchName);
            setPage(1);
        }, 400);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [searchName]);

    const fetchLogs = async () => {
        setLoading(true);
        const params = new URLSearchParams({
            page:  String(page),
            limit: String(limit),
            ...(filterEntity    ? { entity:    filterEntity    } : {}),
            ...(filterAction    ? { action:    filterAction    } : {}),
            ...(debouncedSearch ? { user_name: debouncedSearch } : {}),
        });
        const res  = await fetch(`/api/activity-logs?${params}`);
        const data = await res.json();
        setLogs(data.logs ?? []);
        setTotal(data.total ?? 0);
        setLoading(false);
    };

    useEffect(() => { fetchLogs(); }, [page, filterEntity, filterAction, debouncedSearch]);
    useEffect(() => { setPage(1); }, [filterEntity, filterAction]);

    // ── Group logs by day label ──────────────────────────────────────────────
    const groupedLogs: Array<{ dayLabel: string; items: Log[] }> = [];
    logs.forEach((log) => {
        const label = formatDayLabel(log.created_at);
        const last  = groupedLogs[groupedLogs.length - 1];
        if (last && last.dayLabel === label) {
            last.items.push(log);
        } else {
            groupedLogs.push({ dayLabel: label, items: [log] });
        }
    });

    // ── Pagination pages array ───────────────────────────────────────────────
    const pageNumbers: (number | "...")[] = [];
    const start = Math.max(1, page - 2);
    const end   = Math.min(totalPages, page + 2);
    if (start > 1) { pageNumbers.push(1); if (start > 2) pageNumbers.push("..."); }
    for (let i = start; i <= end; i++) pageNumbers.push(i);
    if (end < totalPages) { if (end < totalPages - 1) pageNumbers.push("..."); pageNumbers.push(totalPages); }

    return (
        <DashboardLayout>
            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">

                {/* ── Header ─────────────────────────────────────────────── */}
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3.5">
                        <div className="w-11 h-11 rounded-[14px] bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 12l2 2 4-4" />
                                <circle cx="12" cy="12" r="10" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 leading-tight tracking-tight">
                                Log Aktivitas
                            </h1>
                            <p className="text-sm text-gray-400 mt-0.5">Pantau semua aktivitas sistem secara real-time</p>
                        </div>
                    </div>

                    {/* Total logs pill */}
                    <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl px-3.5 py-2 flex-shrink-0 shadow-sm">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2">
                            <rect x="3" y="4" width="18" height="18" rx="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8"  y1="2" x2="8"  y2="6" />
                            <line x1="3"  y1="10" x2="21" y2="10" />
                        </svg>
                        <span className="text-sm font-bold text-gray-900 tabular-nums">{total}</span>
                        <span className="text-xs text-gray-400">logs</span>
                    </div>
                </div>

                {/* ── Filter Card ────────────────────────────────────────── */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

                    {/* Filter card header (always visible) */}
                    <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 border-b border-gray-100">
                        <button
                            onClick={() => setShowMobileFilters(!showMobileFilters)}
                            className="sm:hidden flex items-center gap-2 text-sm font-semibold text-gray-600"
                        >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                            </svg>
                            Filter & Pencarian
                            <svg
                                width="13" height="13" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2"
                                className={`transition-transform duration-300 ${showMobileFilters ? "rotate-180" : ""}`}
                            >
                                <polyline points="6 9 12 15 18 9" />
                            </svg>
                        </button>

                        <div className="hidden sm:flex items-center gap-2 text-sm font-semibold text-gray-600">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                            </svg>
                            Filter & Pencarian
                        </div>

                        {activeFilterCount > 0 && (
                            <span className="text-[11px] font-semibold bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full">
                                {activeFilterCount} aktif
                            </span>
                        )}
                    </div>

                    {/* Filter controls */}
                    <div className={`px-5 sm:px-6 pt-4 pb-5 space-y-4 ${showMobileFilters ? "block" : "hidden sm:block"}`}>
                        <div className="flex flex-col sm:flex-row gap-2.5">
                            {/* Search nama karyawan */}
                            <div className="relative flex-1">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                                    </svg>
                                </div>
                                <input
                                    type="text"
                                    value={searchName}
                                    onChange={(e) => setSearchName(e.target.value)}
                                    placeholder="Cari nama karyawan..."
                                    className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 text-gray-700 font-medium outline-none focus:ring-2 focus:ring-gray-200 focus:border-transparent transition-all hover:border-gray-300 placeholder:text-gray-400 placeholder:font-normal"
                                />
                                {searchName && (
                                    <button
                                        onClick={() => setSearchName("")}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors"
                                    >
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                        </svg>
                                    </button>
                                )}
                            </div>

                            <select
                                value={filterEntity}
                                onChange={(e) => setFilterEntity(e.target.value)}
                                className="flex-1 px-3.5 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 text-gray-700 font-medium outline-none focus:ring-2 focus:ring-gray-200 focus:border-transparent transition-all cursor-pointer hover:border-gray-300 appearance-none"
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
                                className="flex-1 px-3.5 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 text-gray-700 font-medium outline-none focus:ring-2 focus:ring-gray-200 focus:border-transparent transition-all cursor-pointer hover:border-gray-300 appearance-none"
                            >
                                <option value="">Semua Aksi</option>
                                <option value="CREATE">✨ Tambah</option>
                                <option value="EDIT">✏️ Edit</option>
                                <option value="DELETE">🗑️ Hapus</option>
                                <option value="RESTORE">🔄 Kembalikan</option>
                            </select>
                        </div>

                        {/* Filter footer */}
                        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                            {hasFilters ? (
                                <button
                                    onClick={() => { setFilterEntity(""); setFilterAction(""); setSearchName(""); }}
                                    className="text-xs font-medium text-gray-400 hover:text-gray-700 flex items-center gap-1.5 transition-colors"
                                >
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                    Reset filter
                                </button>
                            ) : <div />}

                            <span className={`text-xs font-bold px-3 py-1 rounded-full tabular-nums ${total > 0 ? "bg-gray-100 text-gray-600" : "text-gray-300"}`}>
                                {total} {total === 1 ? "log" : "logs"}
                            </span>
                        </div>
                    </div>
                </div>

                {/* ── Log List (Timeline) ────────────────────────────────── */}
                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3, 4, 5].map((i) => <LogSkeleton key={i} />)}
                    </div>
                ) : logs.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
                        <EmptyState hasFilters={hasFilters} />
                    </div>
                ) : (
                    <div className="relative">
                        {/* Vertical timeline line */}
                        <div className="absolute left-[10px] top-3 bottom-3 w-px bg-gray-100 pointer-events-none" />

                        <div className="space-y-1">
                            {groupedLogs.map((group) => (
                                <div key={group.dayLabel}>
                                    {/* Day divider */}
                                    <div className="pl-8 mb-2 mt-6 first:mt-0">
                                        <DateDivider label={group.dayLabel} />
                                    </div>

                                    {/* Logs within this day */}
                                    <div className="space-y-2">
                                        {group.items.map((log) => (
                                            <LogCard
                                                key={log.id}
                                                log={log}
                                                isExpanded={expanded === log.id}
                                                onToggle={() => setExpanded(expanded === log.id ? null : log.id)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Pagination ─────────────────────────────────────────── */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-1.5 sm:gap-2 pt-4 pb-2">
                        <button
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="flex items-center gap-1 px-3.5 py-2 text-sm font-medium rounded-xl border border-gray-200 bg-white text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 hover:border-gray-300 transition-all group"
                        >
                            <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeLinecap="round">
                                <polyline points="15 18 9 12 15 6" />
                            </svg>
                            <span className="hidden sm:inline">Sebelumnya</span>
                        </button>

                        <div className="flex items-center gap-1">
                            {pageNumbers.map((p, idx) =>
                                p === "..." ? (
                                    <span key={idx} className="text-xs text-gray-300 px-1 select-none">···</span>
                                ) : (
                                    <button
                                        key={idx}
                                        onClick={() => setPage(p as number)}
                                        className={`min-w-[34px] h-[34px] text-sm font-medium rounded-xl transition-all ${
                                            page === p
                                                ? "bg-gray-900 text-white shadow-sm"
                                                : "text-gray-500 hover:bg-gray-100 border border-transparent hover:border-gray-200"
                                        }`}
                                    >
                                        {p}
                                    </button>
                                )
                            )}
                        </div>

                        <button
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="flex items-center gap-1 px-3.5 py-2 text-sm font-medium rounded-xl border border-gray-200 bg-white text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 hover:border-gray-300 transition-all group"
                        >
                            <span className="hidden sm:inline">Selanjutnya</span>
                            <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeLinecap="round">
                                <polyline points="9 18 15 12 9 6" />
                            </svg>
                        </button>
                    </div>
                )}
            </div>

            <style jsx>{`
                @keyframes slideDown {
                    from { opacity: 0; transform: translateY(-6px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                .animate-slideDown {
                    animation: slideDown 0.25s cubic-bezier(0.16, 1, 0.3, 1);
                }
                select {
                    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
                    background-repeat: no-repeat;
                    background-position: right 12px center;
                    padding-right: 32px;
                }
            `}</style>
        </DashboardLayout>
    );
}