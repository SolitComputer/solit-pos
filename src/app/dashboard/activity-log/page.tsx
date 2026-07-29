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
    CREATE: "bg-emerald-50 text-emerald-700 border-emerald-200",
    EDIT: "bg-blue-50 text-blue-700 border-blue-200",
    DELETE: "bg-red-50 text-red-700 border-red-200",
    RESTORE: "bg-amber-50 text-amber-700 border-amber-200",
};

// Warna hex murni dipakai untuk efek glow pada titik timeline (LED indicator)
const ACTION_HEX: Record<string, string> = {
    CREATE: "#10b981",
    EDIT: "#3b82f6",
    DELETE: "#ef4444",
    RESTORE: "#f59e0b",
};

const ACTION_BORDER_EXPANDED: Record<string, string> = {
    CREATE: "border-emerald-200",
    EDIT: "border-blue-200",
    DELETE: "border-red-200",
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
    CREATE: "Menambahkan",
    EDIT: "Mengubah",
    DELETE: "Menghapus",
    RESTORE: "Memulihkan",
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

const ENTITY_FILTER_OPTIONS = [
    { value: "", label: "Semua Entitas" },
    { value: "laptop", label: "Laptop" },
    { value: "unit", label: "Unit" },
    { value: "transaction", label: "Transaksi" },
    { value: "warranty", label: "Garansi" },
];

const ACTION_FILTER_OPTIONS = [
    { value: "", label: "Semua Aksi" },
    { value: "CREATE", label: "Tambah" },
    { value: "EDIT", label: "Edit" },
    { value: "DELETE", label: "Hapus" },
    { value: "RESTORE", label: "Kembalikan" },
];

// Palet gradient avatar — dipilih berdasarkan hash nama, supaya tiap karyawan
// punya warna yang konsisten setiap kali muncul di log.
const AVATAR_PALETTE: { from: string; to: string }[] = [
    { from: "#8b5cf6", to: "#6d28d9" }, // violet
    { from: "#38bdf8", to: "#0369a1" }, // sky
    { from: "#34d399", to: "#047857" }, // emerald
    { from: "#fbbf24", to: "#b45309" }, // amber
    { from: "#f472b6", to: "#be185d" }, // pink
    { from: "#2dd4bf", to: "#0f766e" }, // teal
];

function getAvatarGradient(name: string) {
    const sum = (name ?? "U").split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return AVATAR_PALETTE[sum % AVATAR_PALETTE.length];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
    return new Intl.DateTimeFormat("id-ID", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    }).format(new Date(iso));
}

function formatRelativeTime(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return "Baru saja";
    if (mins < 60) return `${mins}m lalu`;
    if (hours < 24) return `${hours}j lalu`;
    if (days === 1) return "Kemarin";
    if (days < 7) return `${days}h lalu`;
    return formatDate(iso);
}

function formatDayLabel(iso: string): string {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Hari ini";
    if (d.toDateString() === yesterday.toDateString()) return "Kemarin";
    return new Intl.DateTimeFormat("id-ID", {
        weekday: "long", day: "numeric", month: "long",
    }).format(d);
}

function diffKeys(before: Record<string, any> | null, after: Record<string, any> | null) {
    const skip = ["id", "created_at", "updated_at", "last_edited_at"];
    const keys = Array.from(new Set([
        ...Object.keys(before ?? {}),
        ...Object.keys(after ?? {}),
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
        return <p className="text-xs italic" style={{ color: "#94a3b8" }}>Tidak ada perubahan terdeteksi.</p>;

    return (
        <div className="mt-3 space-y-3">
            {keys.map((k) => (
                <div key={k}>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-2 font-mono" style={{ color: "#94a3b8" }}>{k}</p>
                    <div className="flex flex-col sm:flex-row gap-2">
                        {before?.[k] !== undefined && (
                            <div className="flex-1 flex items-start gap-2 rounded-[9px] px-3 py-2.5"
                                style={{ background: "#fff1f2", border: "1px solid #fecdd3" }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fb7185" strokeWidth="2.5" strokeLinecap="round" className="flex-shrink-0 mt-0.5">
                                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                                <span className="text-xs font-mono break-all line-through opacity-80" style={{ color: "#e11d48" }}>{String(before[k] ?? "—")}</span>
                            </div>
                        )}
                        {after?.[k] !== undefined && (
                            <div className="flex-1 flex items-start gap-2 rounded-[9px] px-3 py-2.5"
                                style={{ background: "#ecfdf5", border: "1px solid #a7f3d0" }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" className="flex-shrink-0 mt-0.5">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                                <span className="text-xs font-mono break-all font-semibold" style={{ color: "#047857" }}>{String(after[k] ?? "—")}</span>
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
            <div className="h-px flex-1" style={{ background: "#e8ecf5" }} />
            <span className="text-[11px] font-bold uppercase tracking-widest whitespace-nowrap font-mono" style={{ color: "#cbd5e1" }}>
                {label}
            </span>
            <div className="h-px flex-1" style={{ background: "#e8ecf5" }} />
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
    const dotColor = ACTION_HEX[log.action] ?? "#94a3b8";
    const avatar = getAvatarGradient(log.user_name);

    return (
        <div className="relative pl-8">
            {/* Timeline dot — gaya lampu indikator, glow sesuai jenis aksi */}
            <span
                className="absolute left-0 top-5 w-3 h-3 rounded-full border-2 border-white z-10"
                style={{
                    background: dotColor,
                    boxShadow: `0 0 0 4px ${dotColor}22, 0 0 10px 1px ${dotColor}66`,
                }}
            />

            <div className={`bg-white rounded-2xl transition-all duration-200 overflow-hidden border ${isExpanded
                ? (ACTION_BORDER_EXPANDED[log.action] ?? "border-gray-200")
                : "hover:shadow-md"
                }`}
                style={!isExpanded ? { borderColor: "#f0f0f8" } : undefined}>
                <div className="p-4 sm:p-5">

                    {/* ── Top row: action badge + user avatar + name + role ── */}
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold font-mono uppercase tracking-wide px-2.5 py-1 rounded-lg border ${ACTION_STYLE[log.action] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
                            {ACTION_ICON[log.action]}
                            {log.action}
                        </span>

                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                                style={{ background: `linear-gradient(135deg, ${avatar.from}, ${avatar.to})` }}>
                                {log.user_name?.charAt(0).toUpperCase() ?? "U"}
                            </div>
                            <span className="text-[13px] font-bold leading-none" style={{ color: "#0f172a" }}>
                                {log.user_name}
                            </span>
                        </div>

                        <span className="text-[11px] px-2 py-0.5 rounded-full"
                            style={{ color: "#94a3b8", background: "#f8fafc", border: "1px solid #f1f5f9" }}>
                            {log.user_role?.replace(/_/g, " ")}
                        </span>
                    </div>

                    {/* ── Description row ── */}
                    <div className="flex flex-wrap items-center gap-1.5 mb-3 text-[13px]" style={{ color: "#64748b" }}>
                        <span>{ACTION_VERB[log.action] ?? log.action}</span>
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-[9px]"
                            style={{ color: "#334155", background: "#f5f7ff", border: "1px solid #e8ecf5" }}>
                            {ENTITY_ICON[log.entity]}
                            {ENTITY_LABEL[log.entity] ?? log.entity}
                        </span>
                        {log.entity_label && (
                            <span className="text-xs font-mono italic break-words max-w-full" style={{ color: "#94a3b8" }}>
                                &quot;{log.entity_label}&quot;
                            </span>
                        )}
                    </div>

                    {/* ── Footer row: timestamp + expand toggle ── */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono min-w-0" style={{ color: "#94a3b8" }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                            </svg>
                            <span className="font-semibold" style={{ color: "#64748b" }}>{formatRelativeTime(log.created_at)}</span>
                            <span className="hidden sm:inline" style={{ color: "#e2e8f0" }}>•</span>
                            <span className="hidden sm:inline">{formatDate(log.created_at)}</span>
                        </div>

                        {hasDiff && (
                            <button
                                onClick={onToggle}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold transition-colors flex-shrink-0"
                                style={{ color: isExpanded ? "#4338ca" : "#94a3b8" }}
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
                        <div className="mt-4 pt-4 animate-slideDown" style={{ borderTop: "1px solid #f1f5f9" }}>
                            <div className="flex items-center gap-2 mb-3">
                                <span className="w-0.5 h-3.5 rounded-full block" style={{ background: "#c7d2fe" }} />
                                <span className="text-[10px] font-bold uppercase tracking-widest font-mono" style={{ color: "#94a3b8" }}>
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
            <span className="absolute left-0 top-5 w-3 h-3 rounded-full border-2 border-white" style={{ background: "#e2e8f0" }} />
            <div className="bg-white rounded-2xl p-4 sm:p-5 animate-pulse space-y-3" style={{ border: "1px solid #f0f0f8" }}>
                <div className="flex items-center gap-2">
                    <div className="w-16 h-6 rounded-lg" style={{ background: "#f1f5f9" }} />
                    <div className="w-6 h-6 rounded-full" style={{ background: "#f1f5f9" }} />
                    <div className="w-28 h-4 rounded" style={{ background: "#f1f5f9" }} />
                    <div className="w-20 h-4 rounded-full" style={{ background: "#f1f5f9" }} />
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-16 h-3 rounded" style={{ background: "#f1f5f9" }} />
                    <div className="w-20 h-6 rounded-[9px]" style={{ background: "#f1f5f9" }} />
                    <div className="w-24 h-3 rounded" style={{ background: "#f1f5f9" }} />
                </div>
                <div className="w-44 h-3 rounded" style={{ background: "#f1f5f9" }} />
            </div>
        </div>
    );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
    return (
        <div className="text-center py-20">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: "#f5f7ff" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#c7d2fe" strokeWidth="1.5">
                    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
                </svg>
            </div>
            <p className="text-sm font-semibold" style={{ color: "#334155" }}>Belum ada log aktivitas</p>
            <p className="text-xs mt-1" style={{ color: "#94a3b8" }}>
                {hasFilters ? "Tidak ada log yang cocok dengan filter ini." : "Setiap perubahan data akan tercatat otomatis di sini."}
            </p>
        </div>
    );
}

// Chip filter generik — dipakai untuk filter entitas & aksi (pengganti <select>)
function FilterChips({
    options,
    value,
    onChange,
}: {
    options: { value: string; label: string }[];
    value: string;
    onChange: (v: string) => void;
}) {
    return (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
            {options.map((opt) => {
                const active = value === opt.value;
                return (
                    <button
                        key={opt.value || "all"}
                        type="button"
                        onClick={() => onChange(opt.value)}
                        className="px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all flex-shrink-0 active:scale-95"
                        style={active
                            ? { background: "linear-gradient(135deg, #0f0c29, #1a1545)", color: "#fff" }
                            : { background: "#f5f7ff", color: "#64748b", border: "1px solid #e8ecf5" }}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ActivityLogPage() {
    const [logs, setLogs] = useState<Log[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [filterEntity, setFilterEntity] = useState("");
    const [filterAction, setFilterAction] = useState("");
    const [filterDateFrom, setFilterDateFrom] = useState("");
    const [filterDateTo, setFilterDateTo] = useState("");
    const [showMobileFilters, setShowMobileFilters] = useState(false);
    const [searchName, setSearchName] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const limit = 20;
    const totalPages = Math.ceil(total / limit);
    const hasFilters = filterEntity !== "" || filterAction !== "" || debouncedSearch !== "" || filterDateFrom !== "" || filterDateTo !== "";
    const activeFilterCount = [filterEntity, filterAction, debouncedSearch, filterDateFrom, filterDateTo].filter(Boolean).length;

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
            page: String(page),
            limit: String(limit),
            ...(filterEntity ? { entity: filterEntity } : {}),
            ...(filterAction ? { action: filterAction } : {}),
            ...(debouncedSearch ? { user_name: debouncedSearch } : {}),
            ...(filterDateFrom ? { date_from: filterDateFrom } : {}),
            ...(filterDateTo ? { date_to: filterDateTo } : {}),
        });
        const res = await fetch(`/api/activity-logs?${params}`);
        const data = await res.json();
        setLogs(data.logs ?? []);
        setTotal(data.total ?? 0);
        setLoading(false);
    };

    useEffect(() => { fetchLogs(); }, [page, filterEntity, filterAction, debouncedSearch, filterDateFrom, filterDateTo]);
    useEffect(() => { setPage(1); }, [filterEntity, filterAction, filterDateFrom, filterDateTo]);

    // ── Group logs by day label ──────────────────────────────────────────────
    const groupedLogs: Array<{ dayLabel: string; items: Log[] }> = [];
    logs.forEach((log) => {
        const label = formatDayLabel(log.created_at);
        const last = groupedLogs[groupedLogs.length - 1];
        if (last && last.dayLabel === label) {
            last.items.push(log);
        } else {
            groupedLogs.push({ dayLabel: label, items: [log] });
        }
    });

    // ── Pagination pages array ───────────────────────────────────────────────
    const pageNumbers: (number | "...")[] = [];
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, page + 2);
    if (start > 1) { pageNumbers.push(1); if (start > 2) pageNumbers.push("..."); }
    for (let i = start; i <= end; i++) pageNumbers.push(i);
    if (end < totalPages) { if (end < totalPages - 1) pageNumbers.push("..."); pageNumbers.push(totalPages); }

    return (
        <DashboardLayout>
            <div className="min-h-screen" style={{ background: "#F7F7F8" }}>
                <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">

                    {/* ── Header ─────────────────────────────────────────────── */}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
                            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
                                style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)", boxShadow: "0 4px 14px rgba(15,12,41,0.3)" }}>
                                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M9 12l2 2 4-4" />
                                    <circle cx="12" cy="12" r="10" />
                                </svg>
                            </div>
                            <div className="min-w-0">
                                <h1 className="text-xl sm:text-2xl font-black tracking-tight truncate" style={{ color: "#0f172a" }}>
                                    Log Aktivitas
                                </h1>
                                <p className="text-xs sm:text-[13px] mt-0.5" style={{ color: "#94a3b8" }}>
                                    Jejak audit setiap perubahan data di sistem
                                </p>
                            </div>
                        </div>

                        {/* Total logs pill */}
                        <div className="flex items-center gap-1.5 bg-white rounded-xl px-3.5 py-2 flex-shrink-0"
                            style={{ border: "1px solid #f0f0f8", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
                                <rect x="3" y="4" width="18" height="18" rx="2" />
                                <line x1="16" y1="2" x2="16" y2="6" />
                                <line x1="8" y1="2" x2="8" y2="6" />
                                <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                            <span className="text-sm font-black tabular-nums font-mono" style={{ color: "#0f172a" }}>{total}</span>
                            <span className="text-xs" style={{ color: "#94a3b8" }}>logs</span>
                        </div>
                    </div>

                    {/* ── Filter Card ────────────────────────────────────────── */}
                    <div className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid #f0f0f8", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>

                        {/* Filter card header (always visible) */}
                        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5" style={{ borderBottom: "1px solid #f5f5fb", background: "#fafbff" }}>
                            <button
                                onClick={() => setShowMobileFilters(!showMobileFilters)}
                                className="sm:hidden flex items-center gap-2 text-sm font-bold"
                                style={{ color: "#334155" }}
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

                            <div className="hidden sm:flex items-center gap-2 text-sm font-bold" style={{ color: "#334155" }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                                </svg>
                                Filter & Pencarian
                            </div>

                            {activeFilterCount > 0 && (
                                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                                    style={{ background: "#f3f0ff", color: "#6d28d9" }}>
                                    {activeFilterCount} aktif
                                </span>
                            )}
                        </div>

                        {/* Filter controls */}
                        <div className={`px-5 sm:px-6 pt-4 pb-5 space-y-4 ${showMobileFilters ? "block" : "hidden sm:block"}`}>

                            {/* Search nama karyawan */}
                            <div className="relative">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#94a3b8" }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                                    </svg>
                                </div>
                                <input
                                    type="text"
                                    value={searchName}
                                    onChange={(e) => setSearchName(e.target.value)}
                                    placeholder="Cari nama karyawan..."
                                    className="w-full pl-9 pr-8 h-10 rounded-xl text-sm font-medium outline-none focus:ring-2 transition-all"
                                    style={{ border: "1px solid #e8ecf5", background: "#f5f7ff", color: "#334155" }}
                                />
                                {searchName && (
                                    <button
                                        onClick={() => setSearchName("")}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors"
                                        style={{ color: "#cbd5e1" }}
                                    >
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                        </svg>
                                    </button>
                                )}
                            </div>

                            {/* Filter entitas */}
                            <div>
                                <p className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "#94a3b8" }}>Entitas</p>
                                <FilterChips options={ENTITY_FILTER_OPTIONS} value={filterEntity} onChange={setFilterEntity} />
                            </div>

                            {/* Filter aksi */}
                            <div>
                                <p className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "#94a3b8" }}>Jenis Aksi</p>
                                <FilterChips options={ACTION_FILTER_OPTIONS} value={filterAction} onChange={setFilterAction} />
                            </div>

                            {/* Filter tanggal */}
                            <div>
                                <p className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "#94a3b8" }}>Tanggal</p>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="date"
                                        value={filterDateFrom}
                                        onChange={(e) => setFilterDateFrom(e.target.value)}
                                        max={filterDateTo || undefined}
                                        className="flex-1 h-10 px-3 rounded-xl text-sm font-medium outline-none focus:ring-2 transition-all"
                                        style={{ border: "1px solid #e8ecf5", background: "#f5f7ff", color: "#334155" }}
                                    />
                                    <span className="text-xs font-semibold flex-shrink-0" style={{ color: "#cbd5e1" }}>s/d</span>
                                    <input
                                        type="date"
                                        value={filterDateTo}
                                        onChange={(e) => setFilterDateTo(e.target.value)}
                                        min={filterDateFrom || undefined}
                                        className="flex-1 h-10 px-3 rounded-xl text-sm font-medium outline-none focus:ring-2 transition-all"
                                        style={{ border: "1px solid #e8ecf5", background: "#f5f7ff", color: "#334155" }}
                                    />
                                </div>
                            </div>

                            {/* Filter footer */}
                            <div className="flex items-center justify-between pt-3" style={{ borderTop: "1px solid #f5f5fb" }}>
                                {hasFilters ? (
                                    <button
                                        onClick={() => { setFilterEntity(""); setFilterAction(""); setSearchName(""); setFilterDateFrom(""); setFilterDateTo(""); }}
                                        className="text-xs font-semibold flex items-center gap-1.5 transition-colors"
                                        style={{ color: "#94a3b8" }}
                                    >
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                        </svg>
                                        Hapus semua filter
                                    </button>
                                ) : <div />}

                                <span className="text-xs font-bold px-3 py-1 rounded-full tabular-nums font-mono"
                                    style={{ background: total > 0 ? "#f5f7ff" : "transparent", color: total > 0 ? "#475569" : "#cbd5e1" }}>
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
                        <div className="bg-white rounded-2xl" style={{ border: "1px solid #f0f0f8", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
                            <EmptyState hasFilters={hasFilters} />
                        </div>
                    ) : (
                        <div className="relative">
                            {/* Vertical timeline line */}
                            <div className="absolute left-[10px] top-3 bottom-3 w-px pointer-events-none" style={{ background: "#e8ecf5" }} />

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

                            {/* ── Penutup gaya "sobekan struk" — hanya tampil di halaman terakhir ── */}
                            {page === totalPages && (
                                <div className="relative pt-6 pb-2">
                                    <div className="flex items-center gap-3">
                                        <div className="flex-1 h-px" style={{ borderTop: "2px dashed #e2e8f0" }} />
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
                                            <line x1="20" y1="4" x2="8.12" y2="15.88" /><line x1="14.47" y1="14.48" x2="20" y2="20" /><line x1="8.12" y1="8.12" x2="12" y2="12" />
                                        </svg>
                                        <span className="text-[10px] font-bold uppercase tracking-widest font-mono whitespace-nowrap" style={{ color: "#cbd5e1" }}>
                                            Akhir log · {total} entri tercatat
                                        </span>
                                        <div className="flex-1 h-px" style={{ borderTop: "2px dashed #e2e8f0" }} />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Pagination ─────────────────────────────────────────── */}
                    {totalPages > 1 && (
                        <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 pt-2 pb-2">
                            <button
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="flex items-center gap-1 px-3.5 py-2 text-sm font-medium rounded-xl bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-all group"
                                style={{ border: "1px solid #e8ecf5", color: "#64748b" }}
                            >
                                <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeLinecap="round">
                                    <polyline points="15 18 9 12 15 6" />
                                </svg>
                                <span className="hidden sm:inline">Sebelumnya</span>
                            </button>

                            <div className="flex flex-wrap items-center justify-center gap-1">
                                {pageNumbers.map((p, idx) =>
                                    p === "..." ? (
                                        <span key={idx} className="text-xs px-1 select-none" style={{ color: "#cbd5e1" }}>···</span>
                                    ) : (
                                        <button
                                            key={idx}
                                            onClick={() => setPage(p as number)}
                                            className="min-w-[34px] h-[34px] text-sm font-bold rounded-xl transition-all"
                                            style={page === p
                                                ? { background: "linear-gradient(135deg, #0f0c29, #1a1545)", color: "#fff", boxShadow: "0 2px 8px rgba(15,12,41,0.25)" }
                                                : { color: "#64748b", border: "1px solid transparent" }}
                                        >
                                            {p}
                                        </button>
                                    )
                                )}
                            </div>

                            <button
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="flex items-center gap-1 px-3.5 py-2 text-sm font-medium rounded-xl bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-all group"
                                style={{ border: "1px solid #e8ecf5", color: "#64748b" }}
                            >
                                <span className="hidden sm:inline">Selanjutnya</span>
                                <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeLinecap="round">
                                    <polyline points="9 18 15 12 9 6" />
                                </svg>
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <style jsx>{`
                @keyframes slideDown {
                    from { opacity: 0; transform: translateY(-6px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                .animate-slideDown {
                    animation: slideDown 0.25s cubic-bezier(0.16, 1, 0.3, 1);
                }
                .scrollbar-hide::-webkit-scrollbar { display: none; }
                .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </DashboardLayout>
    );
}