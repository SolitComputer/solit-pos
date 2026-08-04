"use client";
// src/app/dashboard/data-barang/OutflowsContent.tsx

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuthUser } from "@/hooks/useAuthUser";
import { usePagePermission } from "@/hooks/usePagePermission";
import { ITEM_OUTFLOW_ROLES } from "@/lib/permissions";

type OutflowType = "SERVICE" | "KEBUTUHAN" | "TRANSAKSI";
type ItemKind = "LAPTOP" | "ACCESSORY";

interface ItemOutflow {
    id: string;
    outflow_type: OutflowType;
    person_name: string;
    item_kind: ItemKind;
    item_ref_id: string | null;
    item_name: string;
    purpose: string;
    nominal: number | null;
    is_audited: boolean;
    audited_by: string | null;
    audited_at: string | null;
    is_restored: boolean;
    restored_by: string | null;
    restored_at: string | null;
    created_by_name: string | null;
    created_by_role: string | null;
    created_at: string;
    // ── Khusus row hasil penjualan (sumber: accessory_outflows) ──
    status?: "active" | "cancelled";
    transaction_invoice?: string | null;
}

interface MasterItem {
    kind: ItemKind;
    id: string;
    name: string;
    meta?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────
const rupiah = (n: number | null | undefined) =>
    n == null ? "—" : "Rp " + Math.round(n).toLocaleString("id-ID");

const formatDate = (iso: string) =>
    new Date(iso).toLocaleString("id-ID", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    });

const TYPE_BADGE: Record<OutflowType, string> = {
    SERVICE: "bg-blue-50 text-blue-700 border-blue-200",
    KEBUTUHAN: "bg-amber-50 text-amber-700 border-amber-200",
    TRANSAKSI: "bg-violet-50 text-violet-700 border-violet-200",
};
const TYPE_LABEL: Record<OutflowType, string> = {
    SERVICE: "Service",
    KEBUTUHAN: "Kebutuhan",
    TRANSAKSI: "Penjualan",
};
const KIND_BADGE: Record<ItemKind, string> = {
    LAPTOP: "bg-violet-50 text-violet-700 border-violet-200",
    ACCESSORY: "bg-emerald-50 text-emerald-700 border-emerald-200",
};
const KIND_LABEL: Record<ItemKind, string> = {
    LAPTOP: "Laptop",
    ACCESSORY: "Aksesoris",
};

// ── Filter helpers ─────────────────────────────────────────────────────────
function startOfDay(d: Date) {
    const x = new Date(d); x.setHours(0, 0, 0, 0); return x;
}
function startOfWeek(d: Date) {
    const x = startOfDay(d);
    x.setDate(x.getDate() - x.getDay() + 1); // Senin
    return x;
}
function startOfMonth(d: Date) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
}

export default function OutflowsContent() {
    const [rows, setRows] = useState<ItemOutflow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [auditingId, setAuditingId] = useState<string | null>(null);
    const [restoringId, setRestoringId] = useState<string | null>(null);
    const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);

    // ── Nama akun login ──
    const [currentUserName, setCurrentUserName] = useState("");
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/auth/me");
                const json = await res.json();
                setCurrentUserName(json?.user?.name ?? "");
            } catch { setCurrentUserName(""); }
        })();
    }, []);

    // Additive: tombol muncul kalau role sudah diizinkan lewat array hardcode
    // ATAU matrix "Role & Hak Akses" (halaman data-barang) sudah mengizinkannya.
    const { user } = useAuthUser();
    const userRoles: string[] = user?.roles?.length ? user.roles : user?.role ? [user.role] : [];
    const { can: matrixCan } = usePagePermission("data-barang");
    const canCreateOutflow = userRoles.some(r => (ITEM_OUTFLOW_ROLES as string[]).includes(r)) || matrixCan.create;

    // ── Filter state ──
    const [filterType, setFilterType] = useState<OutflowType | "">("");
    const [filterKind, setFilterKind] = useState<ItemKind | "">("");
    const [filterPeriod, setFilterPeriod] = useState<"today" | "week" | "month" | "">("");
    const [filterAudit, setFilterAudit] = useState<"audited" | "unaudited" | "">("");
    const [searchText, setSearchText] = useState("");

    const loadOutflows = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const res = await fetch("/api/item-outflows");
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.message || "Gagal memuat data");
            setRows(json.data as ItemOutflow[]);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Terjadi kesalahan");
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { loadOutflows(); }, [loadOutflows]);

    // ── Toggle audit ──
    const toggleAudit = async (id: string) => {
        setAuditingId(id);
        try {
            const res = await fetch(`/api/item-outflows/${id}/audit`, { method: "PATCH" });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.message || "Gagal update audit");
            setRows(prev =>
                prev.map(r => r.id === id ? { ...r, ...json.data } : r)
            );
            toast.success(json.data.is_audited ? "Ditandai sudah diaudit " : "Audit dibatalkan");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Gagal update audit");
        } finally { setAuditingId(null); }
    };

    // ── Restore barang ke stok ──
    const restoreOutflow = async (id: string) => {
        setRestoringId(id);
        try {
            const res = await fetch(`/api/item-outflows/${id}/restore`, { method: "POST" });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.message || "Gagal mengembalikan barang");
            setRows(prev =>
                prev.map(r => r.id === id ? { ...r, ...json.data } : r)
            );
            toast.success("Barang berhasil dikembalikan ke stok");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Gagal mengembalikan barang");
        } finally {
            setRestoringId(null);
            setConfirmRestoreId(null);
        }
    };

    // ── Client-side filter ──
    const filtered = useMemo(() => {
        const now = new Date();
        return rows.filter(row => {
            if (filterType && row.outflow_type !== filterType) return false;
            if (filterKind && row.item_kind !== filterKind) return false;
            if (filterAudit === "audited" && !row.is_audited) return false;
            if (filterAudit === "unaudited" && row.is_audited) return false;
            if (filterPeriod) {
                const created = new Date(row.created_at);
                if (filterPeriod === "today" && created < startOfDay(now)) return false;
                if (filterPeriod === "week" && created < startOfWeek(now)) return false;
                if (filterPeriod === "month" && created < startOfMonth(now)) return false;
            }
            if (searchText.trim()) {
                const q = searchText.trim().toLowerCase();
                if (
                    !row.item_name.toLowerCase().includes(q) &&
                    !row.person_name.toLowerCase().includes(q) &&
                    !row.purpose.toLowerCase().includes(q)
                ) return false;
            }
            return true;
        });
    }, [rows, filterType, filterKind, filterPeriod, filterAudit, searchText]);

    const hasFilter = filterType || filterKind || filterPeriod || filterAudit || searchText;
    const resetFilters = () => {
        setFilterType(""); setFilterKind(""); setFilterPeriod("");
        setFilterAudit(""); setSearchText("");
    };

    return (
        <div>
            {/* ── Sub-header ── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 bg-gray-900 rounded-xl flex items-center justify-center shadow-md flex-shrink-0">
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="white"
                            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 leading-tight">Pengambilan Barang</h2>
                        <p className="text-[12px] text-gray-400">Catat komponen &amp; sparepart yang keluar dari stok</p>
                    </div>
                </div>
                {canCreateOutflow && (
                    <button
                        onClick={() => setModalOpen(true)}
                        className="inline-flex items-center gap-2 bg-gray-900 hover:bg-black text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-md transition active:scale-[0.98]"
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        Tambah Pengambilan
                    </button>
                )}
            </div>

            {/* ── Filter bar ── */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4 shadow-sm">
                <div className="flex flex-wrap gap-2">
                    {/* Search */}
                    <div className="relative flex-1 min-w-[160px]">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <input
                            value={searchText}
                            onChange={e => setSearchText(e.target.value)}
                            placeholder="Cari barang, nama, kebutuhan…"
                            className="w-full pl-8 pr-3 py-2 text-[13px] border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-300"
                        />
                    </div>

                    {/* Tipe */}
                    <select
                        value={filterType}
                        onChange={e => setFilterType(e.target.value as OutflowType | "")}
                        className="px-3 py-2 text-[13px] border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-300 text-gray-600"
                    >
                        <option value="">Semua Tipe</option>
                        <option value="SERVICE">Service</option>
                        <option value="KEBUTUHAN">Kebutuhan</option>
                        <option value="TRANSAKSI">Penjualan</option>
                    </select>

                    {/* Jenis Barang */}
                    <select
                        value={filterKind}
                        onChange={e => setFilterKind(e.target.value as ItemKind | "")}
                        className="px-3 py-2 text-[13px] border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-300 text-gray-600"
                    >
                        <option value="">Semua Jenis</option>
                        <option value="LAPTOP">Laptop</option>
                        <option value="ACCESSORY">Aksesoris</option>
                    </select>

                    {/* Periode */}
                    <select
                        value={filterPeriod}
                        onChange={e => setFilterPeriod(e.target.value as typeof filterPeriod)}
                        className="px-3 py-2 text-[13px] border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-300 text-gray-600"
                    >
                        <option value="">Semua Periode</option>
                        <option value="today">Hari Ini</option>
                        <option value="week">Minggu Ini</option>
                        <option value="month">Bulan Ini</option>
                    </select>

                    {/* Status Audit */}
                    <select
                        value={filterAudit}
                        onChange={e => setFilterAudit(e.target.value as typeof filterAudit)}
                        className="px-3 py-2 text-[13px] border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-300 text-gray-600"
                    >
                        <option value="">Semua Audit</option>
                        <option value="audited">Sudah Diaudit</option>
                        <option value="unaudited">Belum Diaudit</option>
                    </select>

                    {/* Reset */}
                    {hasFilter && (
                        <button
                            onClick={resetFilters}
                            className="px-3 py-2 text-[13px] text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition flex items-center gap-1.5"
                        >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                            Reset
                        </button>
                    )}
                </div>

                {/* Summary */}
                <div className="flex items-center gap-3 mt-2.5 text-[12px] text-gray-400">
                    <span>{filtered.length} dari {rows.length} data</span>
                    {rows.length > 0 && (
                        <>
                            <span>·</span>
                            <span className="text-emerald-600 font-medium">
                                {rows.filter(r => r.outflow_type !== "TRANSAKSI" && r.is_audited).length} diaudit
                            </span>
                            <span>·</span>
                            <span className="text-amber-600 font-medium">
                                {rows.filter(r => r.outflow_type !== "TRANSAKSI" && !r.is_audited).length} belum diaudit
                            </span>
                        </>
                    )}
                </div>
            </div>

            {/* ── Konten ── */}
            {loading ? (
                <div className="space-y-2">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />
                    ))}
                </div>
            ) : error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
                    <p className="text-sm text-red-600 font-medium mb-3">{error}</p>
                    <button onClick={loadOutflows} className="text-sm font-semibold text-red-700 underline underline-offset-2">
                        Coba lagi
                    </button>
                </div>
            ) : filtered.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 p-10 text-center">
                    <p className="text-sm text-gray-500 font-medium">
                        {rows.length === 0 ? "Belum ada data pengambilan barang." : "Tidak ada data yang sesuai filter."}
                    </p>
                    {rows.length > 0 && (
                        <button onClick={resetFilters} className="mt-2 text-[12px] text-gray-400 underline underline-offset-2">
                            Reset filter
                        </button>
                    )}
                </div>
            ) : (
                <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                    <div className="overflow-x-auto max-h-[calc(100dvh-220px)] overflow-y-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-200">
                                    <th className="sticky top-0 z-20 bg-gray-50 text-left font-semibold px-4 py-3">No</th>
                                    <th className="sticky top-0 z-20 bg-gray-50 text-left font-semibold px-4 py-3">Tipe</th>
                                    <th className="sticky top-0 z-20 bg-gray-50 text-left font-semibold px-4 py-3">Nama</th>
                                    <th className="sticky top-0 z-20 bg-gray-50 text-left font-semibold px-4 py-3">Barang</th>
                                    <th className="sticky top-0 z-20 bg-gray-50 text-left font-semibold px-4 py-3">Kebutuhan</th>
                                    <th className="sticky top-0 z-20 bg-gray-50 text-right font-semibold px-4 py-3">Nominal</th>
                                    <th className="sticky top-0 z-20 bg-gray-50 text-center font-semibold px-4 py-3">Audit</th>
                                    <th className="sticky top-0 z-20 bg-gray-50 text-left font-semibold px-4 py-3">Tanggal</th>
                                    <th className="sticky top-0 z-20 bg-gray-50 text-center font-semibold px-4 py-3">Stok</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filtered.map((row, i) => (
                                    <tr key={row.id} className="hover:bg-gray-50/60 transition">
                                        <td className="px-4 py-3 text-gray-400 tabular-nums">
                                            {String(i + 1).padStart(2, "0")}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-col gap-1">
                                                <span className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full border w-fit ${TYPE_BADGE[row.outflow_type]}`}>
                                                    {TYPE_LABEL[row.outflow_type]}
                                                </span>
                                                {row.status === "cancelled" && (
                                                    <span className="inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full border bg-red-50 text-red-600 border-red-200 w-fit">
                                                        Batal
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 font-medium text-gray-800">{row.person_name}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <span className={`inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded border ${KIND_BADGE[row.item_kind]}`}>
                                                    {KIND_LABEL[row.item_kind]}
                                                </span>
                                                <span className="text-gray-700">{row.item_name}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate" title={row.purpose}>
                                            {row.purpose}
                                        </td>
                                        <td className="px-4 py-3 text-right tabular-nums text-gray-800 font-medium">
                                            {rupiah(row.nominal)}
                                        </td>

                                        {/* ── Kolom Audit ── */}
                                        <td className="px-4 py-3 text-center">
                                            {row.outflow_type === "TRANSAKSI" ? (
                                                <span className="text-[11px] text-gray-300" title="Tercatat otomatis dari transaksi — tidak ada audit manual di sini">—</span>
                                            ) : (
                                                <button
                                                    onClick={() => toggleAudit(row.id)}
                                                    disabled={auditingId === row.id}
                                                    title={
                                                        row.is_audited
                                                            ? `Diaudit oleh ${row.audited_by ?? "—"} · ${row.audited_at ? formatDate(row.audited_at) : ""}`
                                                            : "Klik untuk tandai sudah diaudit"
                                                    }
                                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition
                              ${auditingId === row.id ? "opacity-50 cursor-wait" : "cursor-pointer active:scale-95"}
                              ${row.is_audited
                                                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                                            : "bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100 hover:text-gray-600"
                                                        }`}
                                                >
                                                    {row.is_audited ? (
                                                        <>
                                                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                                                <polyline points="20 6 9 17 4 12" />
                                                            </svg>
                                                            Teraudit
                                                        </>
                                                    ) : (
                                                        <>
                                                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                                <circle cx="12" cy="12" r="10" />
                                                            </svg>
                                                            Audit
                                                        </>
                                                    )}
                                                </button>
                                            )}
                                        </td>

                                        <td className="px-4 py-3 text-gray-400 whitespace-nowrap tabular-nums">
                                            {formatDate(row.created_at)}
                                        </td>

                                        {/* ── Kolom Restore ── */}
                                        <td className="px-4 py-3 text-center">
                                            {row.is_restored ? (
                                                <span
                                                    title={`Dikembalikan oleh ${row.restored_by ?? "—"} · ${row.restored_at ? formatDate(row.restored_at) : ""}`}
                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border bg-sky-50 text-sky-700 border-sky-200"
                                                >
                                                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                                        <polyline points="20 6 9 17 4 12" />
                                                    </svg>
                                                    Dikembalikan
                                                </span>
                                            ) : (
                                                <button
                                                    onClick={() => setConfirmRestoreId(row.id)}
                                                    disabled={restoringId === row.id}
                                                    title="Kembalikan barang ke stok"
                                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition
                          bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100 hover:text-gray-700
                          ${restoringId === row.id ? "opacity-50 cursor-wait" : "cursor-pointer active:scale-95"}`}
                                                >
                                                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                        <polyline points="1 4 1 10 7 10" />
                                                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                                                    </svg>
                                                    Restore
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {modalOpen && (
                <OutflowFormModal
                    currentUserName={currentUserName}
                    onClose={() => setModalOpen(false)}
                    onSuccess={() => { setModalOpen(false); loadOutflows(); }}
                />
            )}

            {confirmRestoreId && (
                <div
                    className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
                    onClick={() => setConfirmRestoreId(null)}
                >
                    <div
                        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5"
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 className="text-base font-bold text-gray-900 mb-1.5">Kembalikan Barang?</h3>
                        <p className="text-[13px] text-gray-500 mb-5">
                            Stok barang ini akan ditambah kembali 1 unit dan pengambilan ditandai sudah dikembalikan.
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setConfirmRestoreId(null)}
                                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition"
                            >
                                Batal
                            </button>
                            <button
                                onClick={() => restoreOutflow(confirmRestoreId)}
                                disabled={restoringId === confirmRestoreId}
                                className="flex-1 py-2.5 rounded-xl bg-gray-900 hover:bg-black text-white text-sm font-semibold transition disabled:opacity-60 active:scale-[0.98]"
                            >
                                {restoringId === confirmRestoreId ? "Memproses…" : "Ya, Kembalikan"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Modal Form ──────────────────────────────────────────────────────────────
function OutflowFormModal({
    currentUserName, onClose, onSuccess,
}: {
    currentUserName: string;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [type, setType] = useState<OutflowType>("SERVICE");
    const [selected, setSelected] = useState<MasterItem | null>(null);
    const [purpose, setPurpose] = useState("");
    const [nominal, setNominal] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const [options, setOptions] = useState<MasterItem[]>([]);
    const [optLoading, setOptLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [comboOpen, setComboOpen] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/item-outflows/options");
                const json = await res.json();
                if (!res.ok || !json.success) throw new Error(json.message);
                setOptions(json.data as MasterItem[]);
            } catch { toast.error("Gagal memuat daftar barang"); }
            finally { setOptLoading(false); }
        })();
    }, []);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const base = q
            ? options.filter(o =>
                o.name.toLowerCase().includes(q) ||
                (o.meta ?? "").toLowerCase().includes(q)
            )
            : options;
        return base.slice(0, 40);
    }, [search, options]);

    const selectItem = (opt: MasterItem) => {
        setSelected(opt); setSearch(opt.name); setComboOpen(false);
    };

    const handleSubmit = async () => {
        if (!selected) return toast.error("Barang wajib dipilih dari daftar");
        if (!purpose.trim()) return toast.error("Kebutuhan wajib diisi");
        if (type === "SERVICE") {
            const n = Number(nominal);
            if (!Number.isFinite(n) || n < 0) return toast.error("Nominal biaya tidak valid");
        }

        setSubmitting(true);
        try {
            const res = await fetch("/api/item-outflows", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    outflow_type: type,
                    item_kind: selected.kind,
                    item_ref_id: selected.id,
                    item_name: selected.name,
                    purpose: purpose.trim(),
                    nominal: type === "SERVICE" ? Number(nominal) : null,
                }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.message || "Gagal menyimpan");
            toast.success("Pengambilan barang berhasil dicatat");
            onSuccess();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Terjadi kesalahan");
        } finally { setSubmitting(false); }
    };

    return (
        <div
            className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
            onClick={onClose}
        >
            <div
                className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
                    <h3 className="text-base font-bold text-gray-900">Tambah Pengambilan Barang</h3>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {/* Tipe */}
                    <div>
                        <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">Tipe Pengambilan</label>
                        <div className="grid grid-cols-2 gap-2">
                            {(["SERVICE", "KEBUTUHAN"] as OutflowType[]).map(t => (
                                <button key={t} type="button" onClick={() => setType(t)}
                                    className={`py-2.5 rounded-xl text-sm font-semibold border transition
                    ${type === t ? "bg-gray-900 text-white border-gray-900 shadow-sm" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"}`}>
                                    {TYPE_LABEL[t]}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Nama read-only */}
                    <div>
                        <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">Nama</label>
                        <div className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-700 flex items-center justify-between">
                            <span className="font-medium">{currentUserName || "—"}</span>
                            <span className="text-[10px] text-gray-400 font-medium">otomatis dari akun</span>
                        </div>
                    </div>

                    {/* Barang autocomplete */}
                    <div className="relative">
                        <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">Barang</label>
                        <input
                            value={search}
                            onChange={e => { setSearch(e.target.value); setComboOpen(true); setSelected(null); }}
                            onFocus={() => setComboOpen(true)}
                            placeholder={optLoading ? "Memuat daftar barang…" : "Cari laptop / aksesoris…"}
                            disabled={optLoading}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:bg-gray-50"
                        />
                        {comboOpen && !optLoading && (
                            <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
                                {filtered.length === 0 ? (
                                    <div className="px-3.5 py-3 text-sm text-gray-400">Barang tidak ditemukan</div>
                                ) : filtered.map(opt => (
                                    <button key={`${opt.kind}-${opt.id}`} type="button" onClick={() => selectItem(opt)}
                                        className="w-full text-left px-3.5 py-2.5 hover:bg-gray-50 transition flex items-center gap-2">
                                        <span className={`inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded border flex-shrink-0 ${KIND_BADGE[opt.kind]}`}>
                                            {KIND_LABEL[opt.kind]}
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block text-sm text-gray-800 truncate">{opt.name}</span>
                                            {opt.meta && <span className="block text-[11px] text-gray-400 truncate">{opt.meta}</span>}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                        {selected && (
                            <p className="mt-1 text-[11px] text-emerald-600 font-medium">
                                Terpilih: [{KIND_LABEL[selected.kind]}] {selected.name}
                            </p>
                        )}
                    </div>

                    {/* Kebutuhan */}
                    <div>
                        <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">Kebutuhan</label>
                        <textarea value={purpose} onChange={e => setPurpose(e.target.value)} rows={2}
                            placeholder={type === "SERVICE" ? "Keterangan kebutuhan service…" : "Alasan pemakaian internal…"}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-400" />
                    </div>

                    {/* Nominal — SERVICE only */}
                    {type === "SERVICE" && (
                        <div>
                            <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">Nominal (Biaya)</label>
                            <div className="relative">
                                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">Rp</span>
                                <input type="number" min={0} value={nominal} onChange={e => setNominal(e.target.value)}
                                    placeholder="0"
                                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-gray-200 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-gray-400" />
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex gap-2 px-5 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
                    <button onClick={onClose}
                        className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
                        Batal
                    </button>
                    <button onClick={handleSubmit} disabled={submitting}
                        className="flex-1 py-2.5 rounded-xl bg-gray-900 hover:bg-black text-white text-sm font-semibold transition disabled:opacity-60 active:scale-[0.98]">
                        {submitting ? "Menyimpan…" : "Simpan"}
                    </button>
                </div>
            </div>
        </div>
    );
}