"use client";
// src/app/dashboard/cashflow/page.tsx

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { CASHFLOW_ROLES } from "@/lib/permissions";
import {
    INCOME_CATEGORIES,
    EXPENSE_CATEGORIES,
    categoryLabel,
    type CashflowFilter,
    type AuditFilter,
    type SourceFilter,
    defaultCashflowFilter,
    isFilterActive,
    activeFilterCount,
    applyFilters,
} from "@/lib/cashflow";

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtRupiah = (n: number) => `Rp${Number(n || 0).toLocaleString("id-ID")}`;
const fmtTanggal = (d?: string) =>
    d ? new Date(d + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—";

type Entry = {
    id: string;
    direction: "IN" | "OUT";
    category: string;
    nama: string;
    nominal: number;
    modal: number | null;
    keterangan: string | null;
    source_type: "MANUAL" | "TRANSACTION" | "SERVICE";
    source_id: string | null;
    tanggal: string;
    is_audited: boolean;
    audited_at: string | null;
    created_by_user?: { name: string } | null;
    audited_by_user?: { name: string } | null;
};

type Summary = { total_masuk: number; total_keluar: number; saldo: number; belum_audit: number };

// ── Icons ────────────────────────────────────────────────────────────────────
const IconRefresh = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
    </svg>
);
const IconPlus = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
);
const IconTrash = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
);
const IconCheck = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
    </svg>
);
const IconClock = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><polyline points="12 7 12 12 15 14" />
    </svg>
);
const IconFilter = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
);
const IconSearch = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
);
const IconX = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
);
const IconExternal = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
    </svg>
);

// ── Audit cell (one-way: sekali audit → terkunci) ────────────────────────────
function AuditCell({ entry, onAudit, busy }: { entry: Entry; onAudit: () => void; busy: boolean }) {
    if (entry.is_audited) {
        return (
            <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default"
                title={entry.audited_by_user?.name ? `Diaudit oleh ${entry.audited_by_user.name}` : "Sudah diaudit"}
            >
                <IconCheck /> Sudah Audit
            </span>
        );
    }
    return (
        <button
            onClick={(ev) => { ev.stopPropagation(); onAudit(); }}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition disabled:opacity-50 bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
            title="Klik untuk audit (tidak bisa dibatalkan)"
        >
            <IconClock /> {busy ? "Memproses..." : "Belum Audit"}
        </button>
    );
}

// ── Filter Panel ─────────────────────────────────────────────────────────────
function FilterPanel({
    filter, onChange, onReset, direction,
}: {
    filter: CashflowFilter;
    onChange: (f: CashflowFilter) => void;
    onReset: () => void;
    direction: "IN" | "OUT";
}) {
    const categories = direction === "IN" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    const catEntries = Object.entries(categories) as [string, string][];
    const count = activeFilterCount(filter);

    const selectCls =
        "h-9 border border-gray-200 rounded-lg px-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition appearance-none cursor-pointer";
    const dateCls =
        "h-9 border border-gray-200 rounded-lg px-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition";

    return (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <IconFilter />
                    <span className="text-sm font-bold text-gray-800">Filter</span>
                    {count > 0 && (
                        <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-900 text-white text-[10px] font-bold">
                            {count}
                        </span>
                    )}
                </div>
                {isFilterActive(filter) && (
                    <button
                        onClick={onReset}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-red-500 transition"
                    >
                        <IconX /> Reset
                    </button>
                )}
            </div>

            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {/* Search */}
                <div className="sm:col-span-2 lg:col-span-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Cari</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-gray-400">
                            <IconSearch />
                        </div>
                        <input
                            type="text"
                            value={filter.search}
                            onChange={(e) => onChange({ ...filter, search: e.target.value })}
                            placeholder="Nama / keterangan…"
                            className={`${dateCls} w-full pl-8`}
                        />
                        {filter.search && (
                            <button
                                onClick={() => onChange({ ...filter, search: "" })}
                                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-gray-300 hover:text-gray-500"
                            >
                                <IconX />
                            </button>
                        )}
                    </div>
                </div>

                {/* Kategori */}
                <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Kategori</label>
                    <select
                        value={filter.category}
                        onChange={(e) => onChange({ ...filter, category: e.target.value })}
                        className={`${selectCls} w-full`}
                    >
                        <option value="ALL">Semua Kategori</option>
                        {catEntries.map(([k, label]) => (
                            <option key={k} value={k}>{label}</option>
                        ))}
                    </select>
                </div>

                {/* Status Audit */}
                <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Audit</label>
                    <select
                        value={filter.audit}
                        onChange={(e) => onChange({ ...filter, audit: e.target.value as AuditFilter })}
                        className={`${selectCls} w-full`}
                    >
                        <option value="ALL">Semua Status</option>
                        <option value="AUDITED">✅ Sudah Audit</option>
                        <option value="NOT_AUDITED">⏳ Belum Audit</option>
                    </select>
                </div>

                {/* Sumber */}
                <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Sumber</label>
                    <select
                        value={filter.source}
                        onChange={(e) => onChange({ ...filter, source: e.target.value as SourceFilter })}
                        className={`${selectCls} w-full`}
                    >
                        <option value="ALL">Semua Sumber</option>
                        <option value="MANUAL">📝 Manual</option>
                        <option value="AUTO">⚡ Otomatis</option>
                    </select>
                </div>
            </div>

            {/* Date range row */}
            <div className="px-4 pb-4 -mt-1 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Dari Tanggal</label>
                    <input
                        type="date"
                        value={filter.dateFrom}
                        onChange={(e) => onChange({ ...filter, dateFrom: e.target.value })}
                        className={`${dateCls} w-full`}
                    />
                </div>
                <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Sampai Tanggal</label>
                    <input
                        type="date"
                        value={filter.dateTo}
                        onChange={(e) => onChange({ ...filter, dateTo: e.target.value })}
                        className={`${dateCls} w-full`}
                    />
                </div>
                {/* Quick date presets */}
                <div className="col-span-2 sm:col-span-2 lg:col-span-3 flex items-end gap-1.5 flex-wrap pb-0.5">
                    {([
                        ["Hari Ini", () => {
                            const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
                            onChange({ ...filter, dateFrom: today, dateTo: today });
                        }],
                        ["Minggu Ini", () => {
                            const now = new Date();
                            const day = now.getDay();
                            const start = new Date(now);
                            start.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
                            onChange({
                                ...filter,
                                dateFrom: start.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }),
                                dateTo: now.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }),
                            });
                        }],
                        ["Bulan Ini", () => {
                            const now = new Date();
                            const y = now.getFullYear();
                            const m = String(now.getMonth() + 1).padStart(2, "0");
                            onChange({
                                ...filter,
                                dateFrom: `${y}-${m}-01`,
                                dateTo: now.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }),
                            });
                        }],
                        ["Semua", () => {
                            onChange({ ...filter, dateFrom: "", dateTo: "" });
                        }],
                    ] as [string, () => void][]).map(([label, fn]) => (
                        <button
                            key={label}
                            onClick={fn}
                            className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-gray-200 text-gray-500 bg-white hover:bg-gray-50 hover:border-gray-300 transition"
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ── Expense Modal (input manual — uang keluar saja) ──────────────────────────
function ExpenseModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
    const categories = Object.entries(EXPENSE_CATEGORIES);

    const [category, setCategory] = useState(categories[0]?.[0] ?? "");
    const [nominal, setNominal] = useState("");
    const [keterangan, setKeterangan] = useState("");
    const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    const submit = async () => {
        if (!nominal || Number(nominal) <= 0) return setError("Nominal harus lebih dari 0");
        setSaving(true);
        setError("");
        try {
            const res = await fetch("/api/cashflow", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    direction: "OUT",
                    category,
                    nominal: Number(nominal),
                    keterangan: keterangan.trim() || null,
                    tanggal,
                }),
            });
            const json = await res.json();
            if (!json.success) return setError(json.message || "Gagal menyimpan");
            onSaved();
            onClose();
        } catch {
            setError("Terjadi kesalahan koneksi");
        } finally {
            setSaving(false);
        }
    };

    const inputCls =
        "w-full h-10 border border-gray-200 rounded-lg px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition";

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-md rounded-2xl shadow-2xl overflow-hidden border border-gray-100">
                {/* Header */}
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
                            <IconPlus />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-gray-900 leading-tight">Tambah Uang Keluar</p>
                            <p className="text-[11px] text-gray-400">Nama pengisi tercatat otomatis</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-7 h-7 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center transition">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-3.5">
                    <div>
                        <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Kategori</label>
                        <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
                            {categories.map(([k, label]) => (
                                <option key={k} value={k}>{label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Nominal</label>
                            <input type="number" value={nominal} onChange={(e) => setNominal(e.target.value)} placeholder="0" className={`${inputCls} font-mono`} autoFocus />
                            {nominal && Number(nominal) > 0 && (
                                <p className="text-[11px] text-gray-400 mt-1 font-mono">{fmtRupiah(Number(nominal))}</p>
                            )}
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Tanggal</label>
                            <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className={inputCls} />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Keterangan</label>
                        <textarea value={keterangan} onChange={(e) => setKeterangan(e.target.value)} rows={2} placeholder="Catatan tambahan..." className={`${inputCls.replace("h-10", "")} py-2 resize-none`} />
                    </div>

                    {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">{error}</div>}
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-gray-100 flex gap-3 bg-gray-50/60">
                    <button onClick={onClose} className="flex-1 h-10 bg-white border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                        Batal
                    </button>
                    <button onClick={submit} disabled={saving} className="flex-1 h-10 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-60">
                        {saving ? "Menyimpan..." : "Simpan"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({
    label, value, accent, hint, loading,
}: {
    label: string; value: string; accent: "dark" | "red" | "amber"; hint?: string; loading: boolean;
}) {
    const accentMap = {
        dark: { bar: "bg-gray-900", text: "text-gray-900" },
        red: { bar: "bg-red-500", text: "text-red-600" },
        amber: { bar: "bg-amber-500", text: "text-amber-600" },
    }[accent];

    return (
        <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className={`absolute top-0 left-0 h-full w-1 ${accentMap.bar}`} />
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{label}</p>
            <p className={`text-2xl font-black tracking-tight tabular-nums ${accentMap.text}`}>
                {loading ? <span className="text-gray-300">—</span> : value}
            </p>
            {hint && <p className="text-[11px] text-gray-400 mt-1.5">{hint}</p>}
        </div>
    );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function CashflowPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [masuk, setMasuk] = useState<Entry[]>([]);
    const [keluar, setKeluar] = useState<Entry[]>([]);
    const [summary, setSummary] = useState<Summary>({ total_masuk: 0, total_keluar: 0, saldo: 0, belum_audit: 0 });
    const [tab, setTab] = useState<"IN" | "OUT">("IN");
    const [period, setPeriod] = useState<"today" | "week" | "month" | "custom">("today");
    const [summaryFrom, setSummaryFrom] = useState("");
    const [summaryTo, setSummaryTo] = useState("");
    const [showModal, setShowModal] = useState(false);
    const [showFilter, setShowFilter] = useState(false);
    const [filterIn, setFilterIn] = useState<CashflowFilter>(defaultCashflowFilter());
    const [filterOut, setFilterOut] = useState<CashflowFilter>(defaultCashflowFilter());
    const [auditingId, setAuditingId] = useState<string | null>(null);
    const [allowed, setAllowed] = useState<boolean | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    useEffect(() => {
        fetch("/api/auth/me")
            .then((r) => r.json())
            .then((r) => {
                const roles: string[] = r.user?.roles?.length ? r.user.roles : [r.user?.role].filter(Boolean);
                setAllowed(roles.some((x) => (CASHFLOW_ROLES as string[]).includes(x)));  // ← FIX
            })
            .catch(() => setAllowed(false));
    }, []);

    // silent = refresh background tanpa skeleton (dipakai polling & focus)
    const fetchData = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const res = await fetch("/api/cashflow", { cache: "no-store" }); // ✅ hindari data basi
            const json = await res.json();
            if (json.success) {
                setMasuk(json.data.masuk ?? []);
                setKeluar(json.data.keluar ?? []);
                setSummary(json.summary);
                setLastUpdated(new Date());
            }
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (allowed) fetchData();
    }, [allowed, fetchData]);

    useEffect(() => {
        if (!allowed) return;

        const interval = setInterval(() => {
            if (document.visibilityState === "visible") fetchData(true);
        }, 7000);

        const onFocus = () => fetchData(true);
        const onVisible = () => { if (document.visibilityState === "visible") fetchData(true); };
        window.addEventListener("focus", onFocus);
        document.addEventListener("visibilitychange", onVisible);

        return () => {
            clearInterval(interval);
            window.removeEventListener("focus", onFocus);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [allowed, fetchData]);

    const toggleAudit = async (entry: Entry) => {
        if (entry.is_audited) return; // one-way, guard tambahan
        setAuditingId(entry.id);
        try {
            const res = await fetch(`/api/cashflow/${entry.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "toggle_audit" }),
            });
            const json = await res.json();
            if (json.success) fetchData();
        } finally {
            setAuditingId(null);
        }
    };

    const deleteEntry = async (entry: Entry) => {
        if (!confirm(`Hapus pengeluaran "${entry.keterangan || entry.nama}"?`)) return;
        const res = await fetch(`/api/cashflow/${entry.id}`, { method: "DELETE" });
        const json = await res.json();
        if (json.success) fetchData();
        else alert(json.message || "Gagal menghapus");
    };

    // ── Klik baris uang masuk → nge-link ke sumbernya ──
    const openSource = (e: Entry) => {
        if (e.direction !== "IN") return;
        if (e.source_type === "TRANSACTION" && e.source_id) {
            const q = new URLSearchParams({ highlight: e.source_id, nama: e.nama || "" }).toString();
            router.push(`/dashboard/transactions?${q}`);
        } else if (e.source_type === "SERVICE") {
            router.push("/dashboard/service/history");
        }
    };

    if (allowed === false) {
        return (
            <DashboardLayout>
                <div className="max-w-md mx-auto mt-24 text-center">
                    <div className="text-5xl mb-3">🔒</div>
                    <p className="text-gray-600 font-semibold">Halaman ini hanya untuk Admin & Programmer.</p>
                </div>
            </DashboardLayout>
        );
    }

    const currentFilter = tab === "IN" ? filterIn : filterOut;
    const setCurrentFilter = tab === "IN" ? setFilterIn : setFilterOut;
    const allRows = tab === "IN" ? masuk : keluar;
    const rows = applyFilters(allRows, currentFilter);
    const colCount = 8;
    const filterCount = activeFilterCount(currentFilter);

    // ── Summary per periode (client-side, WIB) ──
    const jakartaToday = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
    const getSummaryRange = (): { from: string; to: string } => {
        if (period === "custom") return { from: summaryFrom, to: summaryTo };
        if (period === "today") return { from: jakartaToday, to: jakartaToday };
        if (period === "week") {
            const now = new Date();
            const day = now.getDay();
            const start = new Date(now);
            start.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
            return { from: start.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }), to: jakartaToday };
        }
        // month
        const monthPrefix = jakartaToday.slice(0, 7);
        return { from: `${monthPrefix}-01`, to: jakartaToday };
    };
    const { from: sFrom, to: sTo } = getSummaryRange();

    const inRange = (tanggal?: string) => {
        if (!tanggal) return false;
        if (sFrom && tanggal < sFrom) return false;
        if (sTo && tanggal > sTo) return false;
        return true;
    };

    const filteredMasuk = masuk.filter((e) => inRange(e.tanggal));
    const filteredKeluar = keluar.filter((e) => inRange(e.tanggal));
    const summaryIncome = filteredMasuk.reduce((s, e) => s + Number(e.nominal || 0), 0);
    const summaryExpense = filteredKeluar.reduce((s, e) => s + Number(e.nominal || 0), 0);
    const summarySaldo = summaryIncome - summaryExpense;
    const summaryUnaudited = [...filteredMasuk, ...filteredKeluar].filter((e) => !e.is_audited).length;

    const periodLabel = period === "today" ? "Hari Ini"
        : period === "week" ? "Minggu Ini"
            : period === "month" ? "Bulan Ini"
                : (sFrom || sTo) ? `${sFrom ? fmtTanggal(sFrom) : "..."} — ${sTo ? fmtTanggal(sTo) : "..."}` : "Custom";

    return (
        <DashboardLayout>
            {showModal && <ExpenseModal onClose={() => setShowModal(false)} onSaved={fetchData} />}

            <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-5">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-1.5 h-8 bg-gray-900 rounded-full" />
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Cashflow</h1>
                            <p className="text-sm text-gray-500">Arus kas uang masuk & keluar · sejak 06 Jul 2026</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Indikator live */}
                        <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] font-semibold text-emerald-700">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                            </span>
                            Live
                        </span>
                        {lastUpdated && (
                            <span className="hidden md:inline text-[11px] text-gray-400 tabular-nums">
                                {lastUpdated.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                            </span>
                        )}
                        <button
                            onClick={() => fetchData()}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 bg-white hover:bg-gray-50 transition"
                            title={lastUpdated ? `Terakhir diperbarui ${lastUpdated.toLocaleTimeString("id-ID")}` : "Refresh"}
                        >
                            <IconRefresh />
                            <span className="hidden sm:inline">Segarkan</span>
                        </button>
                    </div>
                </div>

                {/* Hero: Uang Masuk + Periode Selector */}
                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                                💰 Uang Masuk · {periodLabel}
                            </p>
                            <p className="text-3xl sm:text-4xl font-black text-emerald-600 tracking-tight tabular-nums">
                                {loading ? <span className="text-gray-300">—</span> : fmtRupiah(summaryIncome)}
                            </p>
                            <p className="text-[11px] text-gray-400 mt-1.5">Cashflow masuk otomatis dari transaksi & service</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                            <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
                                {([["today", "Hari Ini"], ["week", "Minggu Ini"], ["month", "Bulan Ini"], ["custom", "Custom"]] as const).map(([val, label]) => (
                                    <button
                                        key={val}
                                        onClick={() => setPeriod(val)}
                                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${period === val ? "bg-gray-900 text-white shadow-sm" : "text-gray-500 hover:bg-gray-50"
                                            }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                            {period === "custom" && (
                                <div className="flex items-center gap-2">
                                    <input
                                        type="date"
                                        value={summaryFrom}
                                        onChange={(e) => setSummaryFrom(e.target.value)}
                                        className="h-8 border border-gray-200 rounded-lg px-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 transition"
                                    />
                                    <span className="text-xs text-gray-400">—</span>
                                    <input
                                        type="date"
                                        value={summaryTo}
                                        onChange={(e) => setSummaryTo(e.target.value)}
                                        className="h-8 border border-gray-200 rounded-lg px-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 transition"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Summary: Keluar | Saldo | Belum Audit — semua ikut periode */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <StatCard label={`Total Uang Keluar`} value={fmtRupiah(summaryExpense)} accent="red" hint={periodLabel} loading={loading} />
                    <StatCard
                        label="Saldo Cashflow"
                        value={fmtRupiah(summarySaldo)}
                        accent="dark"
                        hint={`Masuk − Keluar · ${periodLabel}`}
                        loading={loading}
                    />
                    <StatCard
                        label="Belum Diaudit"
                        value={`${summaryUnaudited} entry`}
                        accent="amber"
                        hint={periodLabel}
                        loading={loading}
                    />
                </div>

                {/* Tabs + Filter + Add */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1">
                            {(["IN", "OUT"] as const).map((t) => (
                                <button
                                    key={t}
                                    onClick={() => setTab(t)}
                                    className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${tab === t ? "bg-gray-900 text-white shadow-sm" : "text-gray-500 hover:bg-gray-50"
                                        }`}
                                >
                                    {t === "IN" ? `Uang Masuk (${masuk.length})` : `Uang Keluar (${keluar.length})`}
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={() => setShowFilter(!showFilter)}
                            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold border transition ${showFilter
                                ? "bg-gray-900 text-white border-gray-900"
                                : filterCount > 0
                                    ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                                }`}
                        >
                            <IconFilter />
                            Filter
                            {filterCount > 0 && (
                                <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${showFilter ? "bg-white text-gray-900" : "bg-amber-600 text-white"
                                    }`}>
                                    {filterCount}
                                </span>
                            )}
                        </button>

                        {filterCount > 0 && (
                            <button
                                onClick={() => { setCurrentFilter(defaultCashflowFilter()); }}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:border-red-300 transition"
                            >
                                <IconX /> Reset Filter
                            </button>
                        )}
                    </div>

                    {tab === "OUT" && (
                        <button
                            onClick={() => setShowModal(true)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 transition"
                        >
                            <IconPlus />
                            Tambah Uang Keluar
                        </button>
                    )}
                </div>

                {/* Filter Panel */}
                {showFilter && (
                    <FilterPanel
                        filter={currentFilter}
                        onChange={setCurrentFilter}
                        onReset={() => setCurrentFilter(defaultCashflowFilter())}
                        direction={tab}
                    />
                )}

                {/* Info uang masuk otomatis */}
                {tab === "IN" && (
                    <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-blue-50/60 border border-blue-100 text-[12px] text-blue-700">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="shrink-0">
                            <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                        </svg>
                        Klik baris untuk membuka sumbernya di <b>Riwayat Transaksi</b> / <b>Service</b>. Uang masuk otomatis, tanpa input manual.
                    </div>
                )}

                {/* Table */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm" style={{ minWidth: 820 }}>
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50/70">
                                    {["Tanggal", "Nama", "Kategori", "Nominal", "Keterangan", "Audit", "Diaudit", ""].map((h, i) => (
                                        <th
                                            key={i}
                                            className={`px-3.5 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap ${h === "Nominal" ? "text-right" : "text-left"
                                                } first:pl-5`}
                                        >
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {loading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <tr key={i}>
                                            {Array.from({ length: colCount }).map((__, j) => (
                                                <td key={j} className="px-3.5 py-3.5">
                                                    <div className="h-3 rounded-full bg-gray-100 animate-pulse" style={{ width: j === 1 ? 120 : 60 }} />
                                                </td>
                                            ))}
                                        </tr>
                                    ))
                                ) : rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={colCount} className="px-3.5 py-16 text-center">
                                            <div className="text-3xl mb-2 opacity-30">{filterCount > 0 ? "🔍" : "📭"}</div>
                                            <p className="text-sm text-gray-400 font-medium">
                                                {filterCount > 0
                                                    ? `Tidak ada data yang cocok dengan filter (${allRows.length} entry tersembunyi).`
                                                    : `Belum ada data ${tab === "IN" ? "uang masuk" : "uang keluar"}.`
                                                }
                                            </p>
                                            {filterCount > 0 && (
                                                <button
                                                    onClick={() => setCurrentFilter(defaultCashflowFilter())}
                                                    className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition"
                                                >
                                                    <IconX /> Reset Filter
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ) : (
                                    rows.map((e) => {
                                        const clickable = e.direction === "IN";
                                        return (
                                            <tr
                                                key={e.id}
                                                onClick={() => clickable && openSource(e)}
                                                className={`transition-colors ${clickable ? "cursor-pointer hover:bg-blue-50/50" : "hover:bg-gray-50/70"}`}
                                            >
                                                <td className="pl-5 pr-3.5 py-3 text-[12px] text-gray-500 whitespace-nowrap">{fmtTanggal(e.tanggal)}</td>
                                                <td className="px-3.5 py-3">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-[13px] font-semibold text-gray-800">{e.nama}</span>
                                                        {e.source_type !== "MANUAL" && (
                                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100 whitespace-nowrap">AUTO</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-3.5 py-3">
                                                    <span className="inline-flex text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600 whitespace-nowrap">
                                                        {categoryLabel(e.direction, e.category)}
                                                    </span>
                                                </td>
                                                <td className={`px-3.5 py-3 text-right font-mono font-bold text-[13px] tabular-nums whitespace-nowrap ${e.direction === "IN" ? "text-emerald-600" : "text-red-600"}`}>
                                                    {e.direction === "IN" ? "+" : "−"}{fmtRupiah(e.nominal)}
                                                </td>
                                                <td className="px-3.5 py-3 text-[12px] text-gray-500 max-w-[240px] truncate">{e.keterangan || "—"}</td>
                                                <td className="px-3.5 py-3" onClick={(ev) => ev.stopPropagation()}>
                                                    <AuditCell entry={e} busy={auditingId === e.id} onAudit={() => toggleAudit(e)} />
                                                </td>
                                                <td className="px-3.5 py-3 text-[11px] whitespace-nowrap">
                                                    {e.audited_by_user?.name
                                                        ? <span className="text-emerald-600" title="Diaudit oleh">🔍 {e.audited_by_user.name}</span>
                                                        : <span className="text-gray-300">—</span>}
                                                </td>
                                                <td className="px-3.5 py-3 text-right" onClick={(ev) => ev.stopPropagation()}>
                                                    {e.direction === "OUT" && e.source_type === "MANUAL" ? (
                                                        <button onClick={() => deleteEntry(e)} className="p-1.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Hapus">
                                                            <IconTrash />
                                                        </button>
                                                    ) : clickable ? (
                                                        <span className="inline-flex text-gray-300" title="Buka sumber"><IconExternal /></span>
                                                    ) : null}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {!loading && (rows.length > 0 || filterCount > 0) && (
                        <div className="px-5 py-2.5 border-t border-gray-50 bg-gray-50/40">
                            <p className="text-[11px] text-gray-400 font-medium">
                                Menampilkan {rows.length} dari {allRows.length} entry {tab === "IN" ? "uang masuk" : "uang keluar"}
                                {filterCount > 0 && ` · ${filterCount} filter aktif`}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}