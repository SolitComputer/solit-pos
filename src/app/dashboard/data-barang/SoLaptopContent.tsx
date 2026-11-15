"use client";

import { useEffect, useState, useMemo, useCallback, useDeferredValue } from "react";
import { toast } from "sonner";
import {
    Search, X, History as HistoryIcon,
    Package, CheckCircle2, ClipboardCheck, Circle,
    AlertCircle, RotateCcw, Filter as FilterIcon,
} from "lucide-react";
import { getAuthUser } from "@/hooks/useAuthUser";
import {
    UserRole, hasAnyRole,
    SO_ROLES, SO_LIMITED_USER_IDS,
    BARANG_PRIVATE_VIEW_ROLES,
} from "@/lib/permissions";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════
interface SoUnitRow {
    unit_id: string;
    laptop_id: string;
    serial_number: string;
    laptop_name: string;
    brand: string | null;
    status: string;
    so_at: string | null;
    so_by: string | null;
    is_so_active: boolean;
    created_at: string | null;
    audited_at: string | null;
    audited_by: string | null;
    is_audit_active: boolean;
}

interface LaptopUnitLite {
    id: string;
    serial_number: string;
    status: string;
    so_at?: string | null;
    so_by?: string | null;
    created_at?: string | null;
    audited_at?: string | null;
    audited_by?: string | null;
}

interface HistoryEntry {
    id: string;
    action: string;
    by: string;
    at: string;
    notes?: string | null;
}

interface LaptopRaw {
    id: string;
    laptop_name: string;
    brand: string | null;
    archived_at?: string | null;
    laptop_units?: LaptopUnitLite[];
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS & HELPERS
// ═══════════════════════════════════════════════════════════════════════════
const OUT_STATUSES = new Set([
    "SOLD", "TERJUAL", "KELUAR", "RETURNED", "RESERVED", "HELD", "PACKING", "PENDING",
]);

const STATUS_UNIT_LABEL: Record<string, string> = {
    SIAP_JUAL: "Siap Jual",
    TERSEDIA: "Siap Jual",
    READY: "Siap Jual",
    BELUM_SIAP: "Belum Siap Jual",
    MINUS_SIAP_JUAL: "Minus Siap Jual",
    SERVICE: "Service",
    DALAM_PENYIAPAN: "Dalam Penyiapan",
};
const statusUnitLabel = (s: string) => STATUS_UNIT_LABEL[s] ?? s;

const isUnitSoActive = (soAt?: string | null): boolean => {
    if (!soAt) return false;
    return soAt > "2001-01-01";
};

// Audit rolling 2 hari — SAMA dengan AUDIT_TTL_MS di
// /api/units/[id]/audit/route.ts & halaman Kelola Unit.
const AUDIT_TTL_MS = 2 * 24 * 60 * 60 * 1000;
const isUnitAuditActive = (auditedAt?: string | null): boolean =>
    !!auditedAt && Date.now() - new Date(auditedAt).getTime() < AUDIT_TTL_MS;

// Formatter konsisten untuk tanggal pendek (DD MMM, HH:MM) di tabel & card.
const fmtShortDateTime = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString("id-ID", {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    }) : "";

const fmtLongDateTime = (iso: string) =>
    new Date(iso).toLocaleString("id-ID", {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function SoLaptopContent() {
    const [rows, setRows] = useState<SoUnitRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [userRoles, setUserRoles] = useState<UserRole[]>([]);
    const [userId, setUserId] = useState<string | null>(null);

    // SO states
    const [soingUnitId, setSoingUnitId] = useState<string | null>(null);
    const [soPromptTarget, setSoPromptTarget] = useState<SoUnitRow | null>(null);
    const [soNote, setSoNote] = useState("");

    // Filter states
    const [search, setSearch] = useState("");
    const [soStatusFilter, setSoStatusFilter] = useState<"ALL" | "SO" | "BELUM">("ALL");
    const [unitStatusFilter, setUnitStatusFilter] = useState<string>("ALL");

    // History SO
    const [historyTarget, setHistoryTarget] = useState<SoUnitRow | null>(null);
    const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historySearch, setHistorySearch] = useState("");

    // Audit states
    const [auditingUnitId, setAuditingUnitId] = useState<string | null>(null);
    const [auditPromptTarget, setAuditPromptTarget] = useState<SoUnitRow | null>(null);
    const [auditNote, setAuditNote] = useState("");
    const [auditHistoryTarget, setAuditHistoryTarget] = useState<SoUnitRow | null>(null);
    const [auditHistoryEntries, setAuditHistoryEntries] = useState<HistoryEntry[]>([]);
    const [auditHistoryLoading, setAuditHistoryLoading] = useState(false);
    const [auditHistorySearch, setAuditHistorySearch] = useState("");

    const deferredSearch = useDeferredValue(search);

    // Permissions
    const isFullSoRole = useMemo(() => hasAnyRole(userRoles, SO_ROLES), [userRoles]);
    const isLimitedSoUser = useMemo(
        () => SO_LIMITED_USER_IDS.includes(userId ?? ""),
        [userId],
    );
    const canManageSo = isFullSoRole || isLimitedSoUser;
    const canManageAudit = useMemo(
        () => hasAnyRole(userRoles, BARANG_PRIVATE_VIEW_ROLES),
        [userRoles],
    );

    const canSoRow = useCallback((row: SoUnitRow) => {
        if (isFullSoRole) return true;
        if (isLimitedSoUser) return row.status === "SIAP_JUAL";
        return false;
    }, [isFullSoRole, isLimitedSoUser]);

    // ── Fetch laptop + units → flatten per-unit ─────────────────────────────
    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/laptops?_t=${Date.now()}`, { cache: "no-store" });
            const json = await res.json();
            if (!json.success) throw new Error(json.message || "Gagal memuat");

            const list: LaptopRaw[] = (json.data ?? []).filter((l: LaptopRaw) => !l.archived_at);
            const flattened: SoUnitRow[] = [];

            list.forEach(l => {
                (l.laptop_units ?? [])
                    .filter(u => !OUT_STATUSES.has(u.status))
                    .forEach(u => {
                        flattened.push({
                            unit_id: u.id,
                            laptop_id: l.id,
                            serial_number: u.serial_number,
                            laptop_name: l.laptop_name,
                            brand: l.brand,
                            status: u.status,
                            so_at: u.so_at ?? null,
                            so_by: u.so_by ?? null,
                            is_so_active: isUnitSoActive(u.so_at),
                            created_at: u.created_at ?? null,
                            audited_at: u.audited_at ?? null,
                            audited_by: u.audited_by ?? null,
                            is_audit_active: isUnitAuditActive(u.audited_at),
                        });
                    });
            });

            setRows(flattened);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Gagal memuat data unit");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    // Auto-refetch saat tab balik aktif
    useEffect(() => {
        const onFocus = () => fetchAll();
        const onVisibility = () => {
            if (document.visibilityState === "visible") fetchAll();
        };
        window.addEventListener("focus", onFocus);
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            window.removeEventListener("focus", onFocus);
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, [fetchAll]);

    useEffect(() => {
        (async () => {
            try {
                const u = await getAuthUser();
                const roles: string[] = Array.isArray((u as any)?.roles) && (u as any).roles.length > 0
                    ? (u as any).roles : u?.role ? [u.role] : [];
                setUserRoles(roles as UserRole[]);
                setUserId((u as any)?.id ?? null);
            } catch { setUserRoles([]); }
        })();
    }, []);

    // ── Fetch riwayat SO ────────────────────────────────────────────────────
    useEffect(() => {
        if (!historyTarget) return;
        setHistoryLoading(true);
        setHistorySearch("");
        (async () => {
            try {
                const res = await fetch(`/api/units/${historyTarget.unit_id}/so`);
                const json = await res.json();
                const raw = json.data?.history ?? [];
                const mapped: HistoryEntry[] = raw.map((h: any) => ({
                    id: h.id,
                    action: h.action === "SO"
                        ? (typeof h.notes === "string" && h.notes.includes("SO Ulang") ? "SO Ulang" : "Ditandai sudah SO")
                        : "SO dibatalkan",
                    by: h.so_by,
                    at: h.so_at,
                    notes: h.notes ?? null,
                }));
                setHistoryEntries(mapped);
            } catch {
                setHistoryEntries([]);
            } finally {
                setHistoryLoading(false);
            }
        })();
    }, [historyTarget]);

    // ── Fetch riwayat AUDIT ─────────────────────────────────────────────────
    useEffect(() => {
        if (!auditHistoryTarget) return;
        setAuditHistoryLoading(true);
        setAuditHistorySearch("");
        (async () => {
            try {
                const res = await fetch(`/api/units/${auditHistoryTarget.unit_id}/audit`);
                const json = await res.json();
                const raw = json.data?.history ?? [];
                const mapped: HistoryEntry[] = raw.map((h: any) => ({
                    id: h.id,
                    action: h.action === "AUDIT" ? "Ditandai sudah diaudit" : "Audit dibatalkan",
                    by: h.audited_by,
                    at: h.audited_at,
                    notes: h.notes ?? null,
                }));
                setAuditHistoryEntries(mapped);
            } catch {
                setAuditHistoryEntries([]);
            } finally {
                setAuditHistoryLoading(false);
            }
        })();
    }, [auditHistoryTarget]);

    const filteredHistory = useMemo(() => {
        if (!historySearch.trim()) return historyEntries;
        const t = historySearch.toLowerCase();
        return historyEntries.filter(h =>
            h.by.toLowerCase().includes(t) ||
            h.action.toLowerCase().includes(t) ||
            (h.notes?.toLowerCase().includes(t) ?? false)
        );
    }, [historyEntries, historySearch]);

    const filteredAuditHistory = useMemo(() => {
        if (!auditHistorySearch.trim()) return auditHistoryEntries;
        const t = auditHistorySearch.toLowerCase();
        return auditHistoryEntries.filter(h =>
            h.by.toLowerCase().includes(t) ||
            h.action.toLowerCase().includes(t) ||
            (h.notes?.toLowerCase().includes(t) ?? false)
        );
    }, [auditHistoryEntries, auditHistorySearch]);

    const unitStatusOptions = useMemo(() => {
        const set = new Set<string>();
        rows.forEach(r => set.add(r.status));
        return Array.from(set).sort();
    }, [rows]);

    const filteredRows = useMemo(() => {
        let list = rows;

        if (soStatusFilter !== "ALL") {
            list = list.filter(r => soStatusFilter === "SO" ? r.is_so_active : !r.is_so_active);
        }
        if (unitStatusFilter !== "ALL") {
            list = list.filter(r => r.status === unitStatusFilter);
        }
        if (deferredSearch.trim()) {
            const t = deferredSearch.toLowerCase();
            list = list.filter(r =>
                r.serial_number.toLowerCase().includes(t) ||
                r.laptop_name.toLowerCase().includes(t) ||
                (r.brand?.toLowerCase().includes(t) ?? false)
            );
        }

        // Urut SN kecil → besar (numeric-aware).
        return [...list].sort((a, b) =>
            a.serial_number.localeCompare(b.serial_number, "id-ID", { numeric: true })
        );
    }, [rows, soStatusFilter, unitStatusFilter, deferredSearch]);

    // ── Handlers SO ─────────────────────────────────────────────────────────
    const toggleUnitSo = (row: SoUnitRow) => {
        if (!canSoRow(row)) return;
        setSoNote("");
        setSoPromptTarget(row);
    };

    const confirmUnitSo = async (row: SoUnitRow, note: string) => {
        if (!canSoRow(row)) return;
        setSoingUnitId(row.unit_id);
        try {
            const res = await fetch(`/api/units/${row.unit_id}/so`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ notes: note.trim() }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.message || "Gagal update SO");

            setRows(prev => prev.map(r =>
                r.unit_id === row.unit_id
                    ? {
                        ...r,
                        so_at: json.data.so_at,
                        so_by: json.data.so_by,
                        is_so_active: isUnitSoActive(json.data.so_at),
                    }
                    : r
            ));
            toast.success(row.is_so_active ? "Status SO diperbarui (SO Ulang)" : "Unit ditandai Sudah SO");
            setSoPromptTarget(null);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Gagal update SO");
        } finally {
            setSoingUnitId(null);
        }
    };

    // ── Handlers Audit ──────────────────────────────────────────────────────
    const toggleUnitAudit = (row: SoUnitRow) => {
        if (!canManageAudit) return;
        if (row.is_audit_active) {
            confirmUnitAudit(row, "");
        } else {
            setAuditNote("");
            setAuditPromptTarget(row);
        }
    };

    const confirmUnitAudit = async (row: SoUnitRow, note: string) => {
        if (!canManageAudit) return;
        setAuditingUnitId(row.unit_id);
        try {
            const res = await fetch(`/api/units/${row.unit_id}/audit`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ notes: note.trim() }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.message || "Gagal update audit");

            setRows(prev => prev.map(r =>
                r.unit_id === row.unit_id
                    ? {
                        ...r,
                        audited_at: json.data.audited_at,
                        audited_by: json.data.audited_by,
                        is_audit_active: isUnitAuditActive(json.data.audited_at),
                    }
                    : r
            ));
            toast.success(row.is_audit_active ? "Audit unit dibatalkan" : "Unit ditandai sudah diaudit");
            setAuditPromptTarget(null);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Gagal update audit");
        } finally {
            setAuditingUnitId(null);
        }
    };

    // ── Stats ───────────────────────────────────────────────────────────────
    const stats = useMemo(() => {
        const sudah = rows.filter(r => r.is_so_active).length;
        const audited = rows.filter(r => r.is_audit_active).length;
        const total = rows.length;
        const pct = total > 0 ? Math.round((sudah / total) * 100) : 0;
        return { sudah, belum: total - sudah, audited, total, pct };
    }, [rows]);

    const resetFilter = () => {
        setSearch("");
        setSoStatusFilter("ALL");
        setUnitStatusFilter("ALL");
    };

    const hasFilter = search.trim() !== "" || soStatusFilter !== "ALL" || unitStatusFilter !== "ALL";

    return (
        <main className="min-h-screen bg-zinc-50 p-3 sm:p-6 lg:p-8">
            <div className="max-w-full mx-auto space-y-4 sm:space-y-5">

                {/* ═══════════════════════════════════════════════════════
                    HEADER — title, deskripsi, progress bar SO
                    ═══════════════════════════════════════════════════════ */}
                <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-5 sm:px-6 sm:py-6">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center flex-shrink-0 shadow-sm">
                                <ClipboardCheck size={18} className="text-white" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h2 className="text-base sm:text-lg font-bold text-zinc-900 tracking-tight">
                                    SO Laptop <span className="text-zinc-400 font-medium">(Per Unit)</span>
                                </h2>
                                <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                                    Daftar seluruh unit laptop aktif beserta status SO-nya. Urut SN dari yang terkecil ke terbesar.
                                </p>
                            </div>
                        </div>

                        {/* Progress bar SO */}
                        {stats.total > 0 && (
                            <div className="mt-4 sm:mt-5">
                                <div className="flex items-center justify-between mb-1.5">
                                    <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">
                                        Progres SO
                                    </p>
                                    <p className="text-xs font-bold text-zinc-800 tabular-nums">
                                        {stats.sudah} <span className="text-zinc-400 font-medium">/ {stats.total}</span>
                                        <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                            {stats.pct}%
                                        </span>
                                    </p>
                                </div>
                                <div className="h-2 w-full bg-zinc-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all duration-500"
                                        style={{ width: `${stats.pct}%` }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Stat cards strip */}
                    <div className={`grid gap-0 border-t border-zinc-100 ${canManageAudit ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
                        <StatCell
                            label="Sudah SO"
                            value={stats.sudah}
                            tone="emerald"
                            icon={<CheckCircle2 size={14} />}
                        />
                        <StatCell
                            label="Belum SO"
                            value={stats.belum}
                            tone="red"
                            icon={<Circle size={14} />}
                        />
                        {canManageAudit && (
                            <StatCell
                                label="Teraudit"
                                value={stats.audited}
                                tone="blue"
                                icon={<ClipboardCheck size={14} />}
                            />
                        )}
                        <StatCell
                            label="Total Unit"
                            value={stats.total}
                            tone="zinc"
                            icon={<Package size={14} />}
                        />
                    </div>
                </div>

                {/* ═══════════════════════════════════════════════════════
                    FILTER BAR
                    ═══════════════════════════════════════════════════════ */}
                <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-3 sm:p-4">
                    <div className="flex flex-col sm:flex-row gap-2.5">
                        {/* Search */}
                        <div className="relative flex-1 min-w-[180px]">
                            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                                className="w-full h-10 pl-9 pr-9 border border-zinc-200 rounded-xl text-sm bg-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 focus:bg-white transition"
                                placeholder="Cari SN, nama laptop, atau brand..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                            {search && (
                                <button
                                    onClick={() => setSearch("")}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition"
                                    title="Hapus pencarian"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>

                        {/* Selects + reset */}
                        <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                            <FilterSelect
                                value={soStatusFilter}
                                onChange={v => setSoStatusFilter(v as "ALL" | "SO" | "BELUM")}
                            >
                                <option value="ALL">Semua Status SO</option>
                                <option value="BELUM">Belum SO</option>
                                <option value="SO">Sudah SO</option>
                            </FilterSelect>

                            <FilterSelect
                                value={unitStatusFilter}
                                onChange={setUnitStatusFilter}
                            >
                                <option value="ALL">Semua Status Unit</option>
                                {unitStatusOptions.map(s => (
                                    <option key={s} value={s}>{statusUnitLabel(s)}</option>
                                ))}
                            </FilterSelect>

                            {hasFilter && (
                                <button
                                    onClick={resetFilter}
                                    className="h-10 px-3 bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs font-semibold hover:bg-red-100 transition flex items-center gap-1.5 whitespace-nowrap"
                                    title="Reset semua filter"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    <span>Reset</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Filter info chip */}
                    {hasFilter && (
                        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-zinc-100">
                            <FilterIcon className="w-3 h-3 text-zinc-400" />
                            <p className="text-[11px] text-zinc-500">
                                Menampilkan <span className="font-bold text-zinc-800 tabular-nums">{filteredRows.length}</span> dari <span className="font-bold text-zinc-800 tabular-nums">{rows.length}</span> unit (filter aktif)
                            </p>
                        </div>
                    )}
                </div>

                {/* ═══════════════════════════════════════════════════════
                    DAFTAR UNIT — loading / empty / data
                    ═══════════════════════════════════════════════════════ */}
                {loading ? (
                    <SkeletonList />
                ) : filteredRows.length === 0 ? (
                    <EmptyState hasFilter={hasFilter} onReset={resetFilter} />
                ) : (
                    <>
                        {/* ── MOBILE / TABLET ── */}
                        <div className="lg:hidden space-y-2.5">
                            {filteredRows.map((row, idx) => (
                                <MobileCard
                                    key={row.unit_id}
                                    row={row}
                                    idx={idx}
                                    canSo={canSoRow(row)}
                                    canManageSo={canManageSo}
                                    canManageAudit={canManageAudit}
                                    soLoading={soingUnitId === row.unit_id}
                                    auditLoading={auditingUnitId === row.unit_id}
                                    onToggleSo={() => toggleUnitSo(row)}
                                    onOpenSoHistory={() => setHistoryTarget(row)}
                                    onToggleAudit={() => toggleUnitAudit(row)}
                                    onOpenAuditHistory={() => setAuditHistoryTarget(row)}
                                />
                            ))}
                            <p className="text-center text-xs text-zinc-400 pt-1">
                                <span className="text-zinc-700 font-bold">{filteredRows.length}</span> unit ditampilkan
                            </p>
                        </div>

                        {/* ── DESKTOP ── */}
                        <div className="hidden lg:block bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
                            <div className="overflow-auto max-h-[75vh]">
                                <table className="w-full text-sm border-collapse">
                                    <thead>
                                        <tr>
                                            <Th>No</Th>
                                            <Th>SN</Th>
                                            <Th>Nama Laptop</Th>
                                            <Th>Brand</Th>
                                            <Th>Status Unit</Th>
                                            <Th>Status & Pelaksana SO</Th>
                                            {canManageAudit && <Th>Status & Pelaksana Audit</Th>}
                                            <Th>Aksi</Th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredRows.map((row, idx) => {
                                            const zebra = idx % 2 === 1;
                                            return (
                                                <tr key={row.unit_id} className={`border-b border-zinc-50 hover:bg-zinc-100/60 transition-colors ${zebra ? "bg-zinc-50/40" : "bg-white"}`}>
                                                    <td className="px-3 py-3 text-xs text-zinc-400 tabular-nums">{idx + 1}</td>
                                                    <td className="px-3 py-3 text-xs font-bold text-zinc-800 whitespace-nowrap tabular-nums">{row.serial_number}</td>
                                                    <td className="px-3 py-3 text-xs text-zinc-700 max-w-[240px] truncate" title={row.laptop_name}>{row.laptop_name}</td>
                                                    <td className="px-3 py-3 text-xs text-zinc-500">{row.brand || <span className="text-zinc-300">—</span>}</td>
                                                    <td className="px-3 py-3">
                                                        <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-zinc-100 text-zinc-600 border border-zinc-200 whitespace-nowrap">
                                                            {statusUnitLabel(row.status)}
                                                        </span>
                                                    </td>
                                                    {/* Status + User SO digabung jadi 1 kolom */}
                                                    <td className="px-3 py-3">
                                                        <div className="space-y-1.5">
                                                            <SoStatusBadge active={row.is_so_active} />
                                                            {row.so_by ? (
                                                                <div className="text-[11px] leading-tight">
                                                                    <p className="font-semibold text-zinc-700">{row.so_by}</p>
                                                                    {row.so_at && (
                                                                        <p className="text-[10px] text-zinc-400 tabular-nums">{fmtShortDateTime(row.so_at)}</p>
                                                                    )}
                                                                </div>
                                                            ) : <p className="text-[11px] text-zinc-300">Belum ada</p>}
                                                        </div>
                                                    </td>
                                                    {/* Status + User Audit digabung jadi 1 kolom */}
                                                    {canManageAudit && (
                                                        <td className="px-3 py-3">
                                                            <div className="space-y-1.5">
                                                                <AuditStatusBadge active={row.is_audit_active} />
                                                                {row.audited_by ? (
                                                                    <div className="text-[11px] leading-tight">
                                                                        <p className="font-semibold text-zinc-700">{row.audited_by}</p>
                                                                        {row.audited_at && (
                                                                            <p className="text-[10px] text-zinc-400 tabular-nums">{fmtShortDateTime(row.audited_at)}</p>
                                                                        )}
                                                                    </div>
                                                                ) : <p className="text-[11px] text-zinc-300">Belum ada</p>}
                                                            </div>
                                                        </td>
                                                    )}
                                                    {/* Aksi: grup SO & Audit dipisah divider */}
                                                    <td className="px-3 py-3">
                                                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                                                            {/* SO group */}
                                                            {canSoRow(row) && (
                                                                <button
                                                                    onClick={() => toggleUnitSo(row)}
                                                                    disabled={soingUnitId === row.unit_id}
                                                                    title={row.is_so_active ? "SO aktif — klik untuk SO ulang" : "Tandai unit sudah SO"}
                                                                    className={`h-7 px-2.5 rounded-lg text-[11px] font-semibold border transition disabled:opacity-40 ${row.is_so_active ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" : "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"}`}
                                                                >
                                                                    {soingUnitId === row.unit_id ? "..." : row.is_so_active ? "SO Ulang" : "Tandai SO"}
                                                                </button>
                                                            )}
                                                            <IconButton
                                                                onClick={() => setHistoryTarget(row)}
                                                                title="Lihat riwayat SO unit ini"
                                                            >
                                                                <HistoryIcon size={13} />
                                                            </IconButton>

                                                            {/* Audit group — dipisah divider tipis */}
                                                            {canManageAudit && (
                                                                <>
                                                                    <span className="w-px h-5 bg-zinc-200 mx-1" />
                                                                    <button
                                                                        onClick={() => toggleUnitAudit(row)}
                                                                        disabled={auditingUnitId === row.unit_id}
                                                                        title={row.is_audit_active ? "Audit aktif — klik untuk batalkan" : "Tandai unit sudah diaudit"}
                                                                        className={`h-7 px-2.5 rounded-lg text-[11px] font-semibold border transition disabled:opacity-40 ${row.is_audit_active ? "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" : "bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100"}`}
                                                                    >
                                                                        {auditingUnitId === row.unit_id ? "..." : row.is_audit_active ? "Batal Audit" : "Audit"}
                                                                    </button>
                                                                    <IconButton
                                                                        onClick={() => setAuditHistoryTarget(row)}
                                                                        title="Lihat riwayat audit unit ini"
                                                                    >
                                                                        <HistoryIcon size={13} />
                                                                    </IconButton>
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="px-5 py-3 border-t border-zinc-100 bg-zinc-50/60 text-xs text-zinc-500 flex items-center justify-between gap-3">
                                <span>
                                    Menampilkan <span className="text-zinc-800 font-bold tabular-nums">{filteredRows.length}</span> dari <span className="text-zinc-800 font-bold tabular-nums">{rows.length}</span> unit
                                </span>
                                {hasFilter && (
                                    <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                                        <AlertCircle className="w-3 h-3" /> Filter aktif
                                    </span>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* ═══════════════════════════════════════════════════════════════
                MODALS
                ═══════════════════════════════════════════════════════════════ */}
            {soPromptTarget && (
                <SoNotePromptModal
                    unit={soPromptTarget}
                    note={soNote}
                    onNoteChange={setSoNote}
                    loading={soingUnitId === soPromptTarget.unit_id}
                    onCancel={() => { if (soingUnitId !== soPromptTarget.unit_id) setSoPromptTarget(null); }}
                    onConfirm={() => confirmUnitSo(soPromptTarget, soNote)}
                />
            )}

            {historyTarget && (
                <HistorySoModal
                    unit={historyTarget}
                    entries={filteredHistory}
                    totalEntries={historyEntries.length}
                    loading={historyLoading}
                    search={historySearch}
                    onSearchChange={setHistorySearch}
                    onClose={() => setHistoryTarget(null)}
                />
            )}

            {auditPromptTarget && (
                <AuditNotePromptModal
                    unit={auditPromptTarget}
                    note={auditNote}
                    onNoteChange={setAuditNote}
                    loading={auditingUnitId === auditPromptTarget.unit_id}
                    onCancel={() => { if (auditingUnitId !== auditPromptTarget.unit_id) setAuditPromptTarget(null); }}
                    onConfirm={() => confirmUnitAudit(auditPromptTarget, auditNote)}
                />
            )}

            {auditHistoryTarget && (
                <HistoryAuditModal
                    unit={auditHistoryTarget}
                    entries={filteredAuditHistory}
                    totalEntries={auditHistoryEntries.length}
                    loading={auditHistoryLoading}
                    search={auditHistorySearch}
                    onSearchChange={setAuditHistorySearch}
                    onClose={() => setAuditHistoryTarget(null)}
                />
            )}

            <style>{`
                @keyframes fadeIn { from{opacity:0} to{opacity:1} }
                @keyframes popIn  { from{opacity:0;transform:scale(0.94) translateY(8px)} to{opacity:1;transform:scale(1) translateY(0)} }
                @keyframes shimmer { 0%{background-position:-400px 0} 100%{background-position:400px 0} }
                .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
                .animate-popIn  { animation: popIn 0.25s cubic-bezier(0.34,1.56,0.64,1); }
                .animate-shimmer {
                    background: linear-gradient(90deg, #f4f4f5 0px, #e4e4e7 200px, #f4f4f5 400px);
                    background-size: 800px 100%;
                    animation: shimmer 1.4s linear infinite;
                }
            `}</style>
        </main>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function Th({ children }: { children: React.ReactNode }) {
    return (
        <th className="px-3 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-left bg-zinc-50 border-b-2 border-zinc-100 sticky top-0 z-10 whitespace-nowrap">
            {children}
        </th>
    );
}

function IconButton({
    onClick, title, children,
}: {
    onClick: () => void; title: string; children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 transition"
        >
            {children}
        </button>
    );
}

function FilterSelect({
    value, onChange, children,
}: {
    value: string;
    onChange: (v: string) => void;
    children: React.ReactNode;
}) {
    return (
        <select
            value={value}
            onChange={e => onChange(e.target.value)}
            className="h-10 px-3 pr-8 border border-zinc-200 rounded-xl text-xs bg-zinc-50 text-zinc-700 font-medium hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 focus:bg-white transition cursor-pointer appearance-none"
            style={{
                backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 8px center",
                backgroundSize: "16px",
            }}
        >
            {children}
        </select>
    );
}

function StatCell({
    label, value, tone, icon,
}: {
    label: string;
    value: number;
    tone: "emerald" | "red" | "blue" | "zinc";
    icon: React.ReactNode;
}) {
    const toneCls: Record<string, { iconBg: string; iconText: string; valueText: string }> = {
        emerald: { iconBg: "bg-emerald-50 border-emerald-200", iconText: "text-emerald-600", valueText: "text-emerald-700" },
        red: { iconBg: "bg-red-50 border-red-200", iconText: "text-red-500", valueText: "text-red-600" },
        blue: { iconBg: "bg-blue-50 border-blue-200", iconText: "text-blue-600", valueText: "text-blue-700" },
        zinc: { iconBg: "bg-zinc-100 border-zinc-200", iconText: "text-zinc-600", valueText: "text-zinc-800" },
    };
    const t = toneCls[tone];
    return (
        <div className="px-4 py-3.5 flex items-center gap-3 border-r last:border-r-0 border-zinc-100">
            <div className={`w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 ${t.iconBg} ${t.iconText}`}>
                {icon}
            </div>
            <div className="min-w-0">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest truncate">{label}</p>
                <p className={`text-base font-black tabular-nums ${t.valueText}`}>{value}</p>
            </div>
        </div>
    );
}

function SoStatusBadge({ active }: { active: boolean }) {
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border whitespace-nowrap ${active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-600 border-red-200"}`}>
            {active ? <><CheckCircle2 size={10} /> Sudah SO</> : <><Circle size={10} /> Belum SO</>}
        </span>
    );
}

function AuditStatusBadge({ active }: { active: boolean }) {
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border whitespace-nowrap ${active ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-zinc-100 text-zinc-500 border-zinc-200"}`}>
            {active ? <><ClipboardCheck size={10} /> Teraudit</> : <><Circle size={10} /> Belum Audit</>}
        </span>
    );
}

// ── Mobile card ─────────────────────────────────────────────────────────────
function MobileCard({
    row, idx, canSo, canManageSo, canManageAudit,
    soLoading, auditLoading,
    onToggleSo, onOpenSoHistory, onToggleAudit, onOpenAuditHistory,
}: {
    row: SoUnitRow;
    idx: number;
    canSo: boolean;
    canManageSo: boolean;
    canManageAudit: boolean;
    soLoading: boolean;
    auditLoading: boolean;
    onToggleSo: () => void;
    onOpenSoHistory: () => void;
    onToggleAudit: () => void;
    onOpenAuditHistory: () => void;
}) {
    return (
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-3.5 space-y-3">
            {/* Header row: SN + Status badges */}
            <div className="flex items-start justify-between gap-2.5">
                <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">#{idx + 1} · SN</p>
                    <p className="text-sm font-black text-zinc-900 tabular-nums mt-0.5">{row.serial_number}</p>
                    <p className="text-[12px] text-zinc-700 mt-1 line-clamp-2" title={row.laptop_name}>{row.laptop_name}</p>
                    {row.brand && <p className="text-[11px] text-zinc-400 mt-0.5">{row.brand}</p>}
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <SoStatusBadge active={row.is_so_active} />
                    {canManageAudit && <AuditStatusBadge active={row.is_audit_active} />}
                    <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-zinc-100 text-zinc-600 border border-zinc-200 whitespace-nowrap">
                        {statusUnitLabel(row.status)}
                    </span>
                </div>
            </div>

            {/* SO section */}
            <div className="space-y-2 border-t border-zinc-100 pt-3">
                <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-1">
                        <CheckCircle2 size={11} /> Stock Opname
                    </p>
                    {row.so_by && row.so_at && (
                        <p className="text-[11px] text-zinc-500">
                            <span className="font-semibold text-zinc-700">{row.so_by}</span>
                            <span className="text-zinc-400"> · {fmtShortDateTime(row.so_at)}</span>
                        </p>
                    )}
                </div>
                <div className="flex items-stretch gap-2">
                    {canSo && (
                        <button
                            onClick={onToggleSo}
                            disabled={soLoading}
                            className={`flex-1 h-9 rounded-lg text-xs font-semibold border transition disabled:opacity-40 ${row.is_so_active ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" : "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"}`}
                        >
                            {soLoading ? "Memproses..." : row.is_so_active ? "SO Ulang" : "Tandai Sudah SO"}
                        </button>
                    )}
                    <button
                        onClick={onOpenSoHistory}
                        title="Lihat riwayat SO"
                        className={`${canManageSo ? "w-10" : "flex-1"} h-9 flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-800 transition`}
                    >
                        <HistoryIcon size={14} />
                        {!canManageSo && <span className="text-xs font-semibold">Riwayat SO</span>}
                    </button>
                </div>
            </div>

            {/* Audit section — hanya untuk role yang boleh audit */}
            {canManageAudit && (
                <div className="space-y-2 border-t border-zinc-100 pt-3">
                    <div className="flex items-center justify-between">
                        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest flex items-center gap-1">
                            <ClipboardCheck size={11} /> Audit Unit
                        </p>
                        {row.audited_by && row.audited_at && (
                            <p className="text-[11px] text-zinc-500">
                                <span className="font-semibold text-zinc-700">{row.audited_by}</span>
                                <span className="text-zinc-400"> · {fmtShortDateTime(row.audited_at)}</span>
                            </p>
                        )}
                    </div>
                    <div className="flex items-stretch gap-2">
                        <button
                            onClick={onToggleAudit}
                            disabled={auditLoading}
                            className={`flex-1 h-9 rounded-lg text-xs font-semibold border transition disabled:opacity-40 ${row.is_audit_active ? "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" : "bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100"}`}
                        >
                            {auditLoading ? "Memproses..." : row.is_audit_active ? "Batalkan Audit" : "Tandai Sudah Diaudit"}
                        </button>
                        <button
                            onClick={onOpenAuditHistory}
                            title="Lihat riwayat audit"
                            className="w-10 h-9 flex items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-800 transition"
                        >
                            <HistoryIcon size={14} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Empty state ─────────────────────────────────────────────────────────────
function EmptyState({ hasFilter, onReset }: { hasFilter: boolean; onReset: () => void }) {
    return (
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm py-16 text-center px-4">
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-zinc-100 flex items-center justify-center">
                <Package size={24} className="text-zinc-400" />
            </div>
            <p className="text-zinc-800 font-bold text-base">Tidak ada unit ditemukan</p>
            <p className="text-zinc-400 text-sm mt-1 max-w-xs mx-auto">
                {hasFilter
                    ? "Coba ubah kata kunci pencarian atau reset filter yang sedang aktif."
                    : "Belum ada unit laptop aktif di sistem. Tambah unit laptop baru di halaman Data Laptop."}
            </p>
            {hasFilter && (
                <button
                    onClick={onReset}
                    className="mt-4 inline-flex items-center gap-1.5 px-4 h-9 bg-zinc-100 text-zinc-700 rounded-xl text-xs font-semibold hover:bg-zinc-200 transition"
                >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset Filter
                </button>
            )}
        </div>
    );
}

// ── Skeleton loader ─────────────────────────────────────────────────────────
function SkeletonList() {
    return (
        <>
            {/* Mobile skeleton */}
            <div className="lg:hidden space-y-2.5">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-3.5">
                        <div className="flex items-start justify-between gap-2.5">
                            <div className="space-y-2 flex-1">
                                <div className="h-2 w-12 rounded animate-shimmer" />
                                <div className="h-4 w-24 rounded animate-shimmer" />
                                <div className="h-3 w-40 rounded animate-shimmer" />
                            </div>
                            <div className="h-5 w-16 rounded animate-shimmer" />
                        </div>
                        <div className="h-9 w-full rounded-lg animate-shimmer mt-3" />
                    </div>
                ))}
            </div>
            {/* Desktop skeleton */}
            <div className="hidden lg:block bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
                <div className="p-5 space-y-3">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="flex items-center gap-4">
                            <div className="h-4 w-8 rounded animate-shimmer" />
                            <div className="h-4 w-20 rounded animate-shimmer" />
                            <div className="h-4 flex-1 rounded animate-shimmer" />
                            <div className="h-4 w-20 rounded animate-shimmer" />
                            <div className="h-7 w-24 rounded animate-shimmer" />
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODALS
// ═══════════════════════════════════════════════════════════════════════════

function HistorySoModal({
    unit, entries, totalEntries, loading, search, onSearchChange, onClose,
}: {
    unit: SoUnitRow;
    entries: HistoryEntry[];
    totalEntries: number;
    loading: boolean;
    search: string;
    onSearchChange: (v: string) => void;
    onClose: () => void;
}) {
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[85vh] flex flex-col animate-popIn">
                <div className="h-1 w-full bg-gradient-to-r from-emerald-400 via-emerald-600 to-emerald-800 flex-shrink-0" />
                <div className="px-5 py-4 border-b border-zinc-100 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center flex-shrink-0">
                            <HistoryIcon size={14} className="text-emerald-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Riwayat SO</p>
                            <h3 className="text-sm font-bold text-zinc-900 truncate mt-0.5">{unit.laptop_name}</h3>
                        </div>
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-2 tabular-nums">
                        SN: <span className="font-semibold text-zinc-700">{unit.serial_number}</span>
                    </p>
                </div>

                <div className="px-5 py-3 border-b border-zinc-100 flex-shrink-0">
                    <div className="relative">
                        <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                            autoFocus
                            value={search}
                            onChange={e => onSearchChange(e.target.value)}
                            placeholder="Cari nama user, aksi, atau catatan..."
                            className="w-full h-9 pl-8 pr-8 border border-zinc-200 rounded-xl text-xs bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 focus:bg-white transition"
                        />
                        {search && (
                            <button onClick={() => onSearchChange("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                    {search && (
                        <p className="text-[10px] text-zinc-400 mt-1.5 tabular-nums">
                            {entries.length} dari {totalEntries} entri cocok
                        </p>
                    )}
                </div>

                <div className="overflow-y-auto flex-1 px-5 py-4">
                    {loading ? (
                        <div className="space-y-2">
                            {[...Array(3)].map((_, i) => <div key={i} className="h-14 rounded-xl animate-shimmer" />)}
                        </div>
                    ) : entries.length === 0 ? (
                        <p className="text-sm text-zinc-400 text-center py-6">
                            {search ? "Tidak ada entri cocok dengan pencarian" : "Belum ada riwayat SO untuk unit ini"}
                        </p>
                    ) : (
                        <ul className="space-y-2">
                            {entries.map(h => (
                                <li key={h.id} className="bg-zinc-50 border border-zinc-100 rounded-xl px-3 py-2.5">
                                    <p className="text-xs font-semibold text-zinc-700">{h.action}</p>
                                    {h.notes && <p className="text-[11px] text-zinc-600 italic mt-1 bg-white border border-zinc-100 rounded-lg px-2 py-1">&quot;{h.notes}&quot;</p>}
                                    <p className="text-[11px] text-zinc-400 mt-1">
                                        <span className="font-semibold text-zinc-600">{h.by}</span>
                                        {" · "}
                                        {fmtLongDateTime(h.at)}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="px-5 py-4 border-t border-zinc-100 flex-shrink-0">
                    <button onClick={onClose} className="w-full h-10 bg-zinc-100 text-zinc-600 rounded-xl text-sm font-semibold hover:bg-zinc-200 transition">
                        Tutup
                    </button>
                </div>
            </div>
        </div>
    );
}

function SoNotePromptModal({
    unit, note, onNoteChange, onConfirm, onCancel, loading,
}: {
    unit: SoUnitRow; note: string; onNoteChange: (v: string) => void;
    onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape" && !loading) onCancel(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onCancel, loading]);

    const isActive = unit.is_so_active;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={() => !loading && onCancel()} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-popIn">
                <div className={`h-1 w-full bg-gradient-to-r ${isActive ? "from-emerald-400 via-emerald-600 to-emerald-800" : "from-red-400 via-red-600 to-red-800"}`} />
                <div className={`px-5 py-4 ${isActive ? "bg-emerald-600" : "bg-red-600"} flex items-center gap-3`}>
                    <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                        <CheckCircle2 size={16} className="text-white" />
                    </div>
                    <div className="min-w-0">
                        <p className="font-bold text-white text-sm">{isActive ? "Tandai Ulang SO" : "Tandai Sudah SO"}</p>
                        <p className="text-xs text-white/70 mt-0.5 truncate">{unit.laptop_name} · SN {unit.serial_number}</p>
                    </div>
                </div>
                <div className="p-5">
                    <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-1.5">
                        Catatan SO <span className="text-zinc-400 font-normal normal-case">(opsional)</span>
                    </label>
                    <textarea
                        autoFocus
                        rows={3}
                        placeholder="Kondisi barang, lokasi rak, dll"
                        value={note}
                        onChange={e => onNoteChange(e.target.value)}
                        className={`w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-zinc-50 focus:outline-none focus:ring-2 focus:bg-white transition resize-none ${isActive ? "focus:ring-emerald-500/20 focus:border-emerald-400" : "focus:ring-red-500/20 focus:border-red-400"}`}
                    />
                    <div className="flex gap-3 mt-5">
                        <button onClick={onCancel} disabled={loading} className="flex-1 h-10 bg-zinc-100 text-zinc-600 rounded-xl text-sm font-medium hover:bg-zinc-200 transition disabled:opacity-50">Batal</button>
                        <button onClick={onConfirm} disabled={loading}
                            className={`flex-1 h-10 text-white rounded-xl text-sm font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg ${isActive ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/25" : "bg-red-600 hover:bg-red-700 shadow-red-600/25"}`}>
                            {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                            Konfirmasi
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function HistoryAuditModal({
    unit, entries, totalEntries, loading, search, onSearchChange, onClose,
}: {
    unit: SoUnitRow;
    entries: HistoryEntry[];
    totalEntries: number;
    loading: boolean;
    search: string;
    onSearchChange: (v: string) => void;
    onClose: () => void;
}) {
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[85vh] flex flex-col animate-popIn">
                <div className="h-1 w-full bg-gradient-to-r from-blue-400 via-blue-600 to-blue-800 flex-shrink-0" />
                <div className="px-5 py-4 border-b border-zinc-100 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center flex-shrink-0">
                            <HistoryIcon size={14} className="text-blue-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Riwayat Audit</p>
                            <h3 className="text-sm font-bold text-zinc-900 truncate mt-0.5">{unit.laptop_name}</h3>
                        </div>
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-2 tabular-nums">
                        SN: <span className="font-semibold text-zinc-700">{unit.serial_number}</span>
                    </p>
                </div>

                <div className="px-5 py-3 border-b border-zinc-100 flex-shrink-0">
                    <div className="relative">
                        <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                            autoFocus
                            value={search}
                            onChange={e => onSearchChange(e.target.value)}
                            placeholder="Cari nama user, aksi, atau catatan..."
                            className="w-full h-9 pl-8 pr-8 border border-zinc-200 rounded-xl text-xs bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 focus:bg-white transition"
                        />
                        {search && (
                            <button onClick={() => onSearchChange("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                    {search && (
                        <p className="text-[10px] text-zinc-400 mt-1.5 tabular-nums">
                            {entries.length} dari {totalEntries} entri cocok
                        </p>
                    )}
                </div>

                <div className="overflow-y-auto flex-1 px-5 py-4">
                    {loading ? (
                        <div className="space-y-2">
                            {[...Array(3)].map((_, i) => <div key={i} className="h-14 rounded-xl animate-shimmer" />)}
                        </div>
                    ) : entries.length === 0 ? (
                        <p className="text-sm text-zinc-400 text-center py-6">
                            {search ? "Tidak ada entri cocok dengan pencarian" : "Belum ada riwayat audit untuk unit ini"}
                        </p>
                    ) : (
                        <ul className="space-y-2">
                            {entries.map(h => (
                                <li key={h.id} className="bg-zinc-50 border border-zinc-100 rounded-xl px-3 py-2.5">
                                    <p className="text-xs font-semibold text-zinc-700">{h.action}</p>
                                    {h.notes && <p className="text-[11px] text-zinc-600 italic mt-1 bg-white border border-zinc-100 rounded-lg px-2 py-1">&quot;{h.notes}&quot;</p>}
                                    <p className="text-[11px] text-zinc-400 mt-1">
                                        <span className="font-semibold text-zinc-600">{h.by}</span>
                                        {" · "}
                                        {fmtLongDateTime(h.at)}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="px-5 py-4 border-t border-zinc-100 flex-shrink-0">
                    <button onClick={onClose} className="w-full h-10 bg-zinc-100 text-zinc-600 rounded-xl text-sm font-semibold hover:bg-zinc-200 transition">
                        Tutup
                    </button>
                </div>
            </div>
        </div>
    );
}

function AuditNotePromptModal({
    unit, note, onNoteChange, onConfirm, onCancel, loading,
}: {
    unit: SoUnitRow; note: string; onNoteChange: (v: string) => void;
    onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape" && !loading) onCancel(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onCancel, loading]);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={() => !loading && onCancel()} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-popIn">
                <div className="h-1 w-full bg-gradient-to-r from-blue-400 via-blue-600 to-blue-800" />
                <div className="px-5 py-4 bg-blue-600 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                        <ClipboardCheck size={16} className="text-white" />
                    </div>
                    <div className="min-w-0">
                        <p className="font-bold text-white text-sm">Tandai Sudah Diaudit</p>
                        <p className="text-xs text-white/70 mt-0.5 truncate">{unit.laptop_name} · SN {unit.serial_number}</p>
                    </div>
                </div>
                <div className="p-5">
                    <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-1.5">
                        Catatan Audit <span className="text-zinc-400 font-normal normal-case">(opsional)</span>
                    </label>
                    <textarea
                        autoFocus
                        rows={3}
                        placeholder="Kondisi barang, hasil cek, dll"
                        value={note}
                        onChange={e => onNoteChange(e.target.value)}
                        className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 focus:bg-white transition resize-none"
                    />
                    <div className="flex gap-3 mt-5">
                        <button onClick={onCancel} disabled={loading} className="flex-1 h-10 bg-zinc-100 text-zinc-600 rounded-xl text-sm font-medium hover:bg-zinc-200 transition disabled:opacity-50">Batal</button>
                        <button onClick={onConfirm} disabled={loading}
                            className="flex-1 h-10 text-white rounded-xl text-sm font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/25">
                            {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                            Konfirmasi
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}