"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type OutflowType = "SERVICE" | "KEBUTUHAN" | "TRANSAKSI";
type ItemKind = "LAPTOP" | "ACCESSORY";
type OutflowSource = "manual" | "transaksi";

interface ItemOutflow {
    id: string;
    outflow_type: OutflowType;
    person_name: string;
    item_kind: ItemKind;
    item_name: string;
    purpose: string;
    nominal: number | null;
    is_audited: boolean;
    audited_by: string | null;
    audited_at: string | null;
    audit_cancel_reason: string | null;
    audit_cancelled_by: string | null;
    audit_cancelled_at: string | null;
    created_at: string;
    status?: "active" | "cancelled";
    transaction_invoice?: string | null;
    serial_number?: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────
const rupiah = (n: number | null | undefined) =>
    n == null ? "—" : "Rp " + Math.round(n).toLocaleString("id-ID");

const formatDate = (iso: string) =>
    new Date(iso).toLocaleString("id-ID", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    });

const getOutflowSource = (row: ItemOutflow): OutflowSource =>
    row.outflow_type === "TRANSAKSI" ? "transaksi" : "manual";

const SOURCE_LABEL: Record<OutflowSource, string> = {
    manual: "Pengambilan Barang",
    transaksi: "Riwayat Transaksi",
};
const SOURCE_BADGE: Record<OutflowSource, string> = {
    manual: "bg-slate-50 text-slate-600 border-slate-200",
    transaksi: "bg-violet-50 text-violet-700 border-violet-200",
};

// Samain dengan `entity` yang dipakai backend saat logActivity() di
// /api/item-outflows/[id]/audit — dipakai buat query riwayat ke /api/activity-logs.
type LogEntityKind = "item_outflow" | "accessory_outflow" | "transaction";
const getLogEntity = (row: ItemOutflow): LogEntityKind => {
    const source = getOutflowSource(row);
    if (source === "manual") return "item_outflow";
    return row.item_kind === "ACCESSORY" ? "accessory_outflow" : "transaction";
};
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
const KIND_LABEL: Record<ItemKind, string> = {
    LAPTOP: "Laptop",
    ACCESSORY: "Aksesoris",
};

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function startOfWeek(d: Date) { const x = startOfDay(d); x.setDate(x.getDate() - x.getDay() + 1); return x; }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }

// ── Modal Riwayat Audit — ambil dari activity_logs lewat entity + entity_id ──
function AuditHistoryModal({ row, entity, onClose }: { row: ItemOutflow; entity: LogEntityKind; onClose: () => void }) {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        setLoading(true);
        fetch(`/api/activity-logs?entity=${entity}&entity_id=${row.id}&limit=50`)
            .then(res => res.json())
            .then(res => { if (active) setLogs(res.logs ?? []); })
            .catch(() => { if (active) setLogs([]); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [row.id, entity]);

    // Entity "transaction" juga dipakai buat log edit/restore transaksi biasa,
    // jadi filter khusus AUDIT/UNAUDIT saja di sini.
    const auditLogs = logs.filter((l: any) => l.action === "AUDIT" || l.action === "UNAUDIT");

    return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between flex-shrink-0">
                    <div className="min-w-0">
                        <h3 className="text-sm font-bold text-gray-900">Riwayat Audit</h3>
                        <p className="text-[11px] text-gray-400 mt-0.5 truncate">{row.item_name}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition flex-shrink-0">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
                <div className="overflow-y-auto p-4 space-y-2">
                    {loading ? (
                        <p className="text-xs text-gray-400 text-center py-6">Memuat riwayat…</p>
                    ) : auditLogs.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-6">Belum ada riwayat audit.</p>
                    ) : (
                        auditLogs.map((log: any) => (
                            <div key={log.id} className={`rounded-xl border px-3.5 py-2.5 text-xs ${log.action === "AUDIT" ? "bg-emerald-50 border-emerald-100" : "bg-red-50 border-red-100"}`}>
                                <div className="flex items-center justify-between gap-2">
                                    <span className={`font-bold ${log.action === "AUDIT" ? "text-emerald-700" : "text-red-600"}`}>
                                        {log.action === "AUDIT" ? "Diaudit" : "Audit dibatalkan"} — {log.user_name}
                                    </span>
                                    <span className="text-gray-400 flex-shrink-0 text-[10px] whitespace-nowrap">{formatDate(log.created_at)}</span>
                                </div>
                                {log.reason && (
                                    <p className="mt-1 text-gray-600">Alasan: &quot;{log.reason}&quot;</p>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

export default function AuditBarangKeluarContent() {
    const [rows, setRows] = useState<ItemOutflow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [auditingId, setAuditingId] = useState<string | null>(null);

    const [cancelAuditTarget, setCancelAuditTarget] = useState<ItemOutflow | null>(null);
    const [cancelReason, setCancelReason] = useState("");
    const [submittingCancel, setSubmittingCancel] = useState(false);
    const [historyTarget, setHistoryTarget] = useState<ItemOutflow | null>(null);

    // ── Filter state ──
    const [filterType, setFilterType] = useState<OutflowType | "">("");
    const [filterKind, setFilterKind] = useState<ItemKind | "">("");
    const [filterSource, setFilterSource] = useState<OutflowSource | "">("");
    const [filterPeriod, setFilterPeriod] = useState<"today" | "week" | "month" | "">("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
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

    // ── Audit: langsung jalan kalau belum diaudit, minta alasan kalau membatalkan ──
    const runAudit = async (row: ItemOutflow, reason?: string) => {
        setAuditingId(row.id);
        try {
            const source = getOutflowSource(row);
            const kindParam = source === "transaksi" ? `&kind=${row.item_kind}` : "";
            const res = await fetch(`/api/item-outflows/${row.id}/audit?source=${source}${kindParam}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(reason ? { reason } : {}),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.message || "Gagal update audit");
            setRows(prev => prev.map(r => r.id === row.id ? { ...r, ...json.data } : r));
            toast.success(json.data.is_audited ? "Ditandai sudah diaudit" : "Audit dibatalkan");
            return true;
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Gagal update audit");
            return false;
        } finally { setAuditingId(null); }
    };

    const toggleAudit = (row: ItemOutflow) => {
        if (!row.is_audited) { runAudit(row); return; }
        setCancelReason("");
        setCancelAuditTarget(row);
    };

    const confirmCancelAudit = async () => {
        if (!cancelAuditTarget) return;
        const reason = cancelReason.trim();
        if (!reason) { toast.error("Alasan pembatalan wajib diisi"); return; }
        setSubmittingCancel(true);
        const ok = await runAudit(cancelAuditTarget, reason);
        setSubmittingCancel(false);
        if (ok) { setCancelAuditTarget(null); setCancelReason(""); }
    };

    // ── Filter ──
    const filtered = useMemo(() => {
        const now = new Date();
        const fromDate = dateFrom ? startOfDay(new Date(dateFrom)) : null;
        const toDate = dateTo ? new Date(new Date(dateTo).setHours(23, 59, 59, 999)) : null;

        return rows.filter(row => {
            if (filterType && row.outflow_type !== filterType) return false;
            if (filterKind && row.item_kind !== filterKind) return false;
            if (filterSource && getOutflowSource(row) !== filterSource) return false;
            if (filterAudit === "audited" && !row.is_audited) return false;
            if (filterAudit === "unaudited" && row.is_audited) return false;

            const created = new Date(row.created_at);
            if (fromDate || toDate) {
                if (fromDate && created < fromDate) return false;
                if (toDate && created > toDate) return false;
            } else if (filterPeriod) {
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
    }, [rows, filterType, filterKind, filterSource, filterPeriod, dateFrom, dateTo, filterAudit, searchText]);

    const hasFilter = filterType || filterKind || filterSource || filterPeriod || dateFrom || dateTo || filterAudit || searchText;
    const resetFilters = () => {
        setFilterType(""); setFilterKind(""); setFilterSource("");
        setFilterPeriod(""); setDateFrom(""); setDateTo("");
        setFilterAudit(""); setSearchText("");
    };

    return (
        <div>
            {/* ── Filter bar ── */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4 shadow-sm">
                <div className="flex flex-wrap gap-2">
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

                    <select value={filterType} onChange={e => setFilterType(e.target.value as OutflowType | "")}
                        className="px-3 py-2 text-[13px] border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-300 text-gray-600">
                        <option value="">Semua Tipe</option>
                        <option value="SERVICE">Service</option>
                        <option value="KEBUTUHAN">Kebutuhan</option>
                        <option value="TRANSAKSI">Penjualan</option>
                    </select>

                    <select value={filterSource} onChange={e => setFilterSource(e.target.value as OutflowSource | "")}
                        className="px-3 py-2 text-[13px] border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-300 text-gray-600">
                        <option value="">Semua Sumber</option>
                        <option value="manual">{SOURCE_LABEL.manual}</option>
                        <option value="transaksi">{SOURCE_LABEL.transaksi}</option>
                    </select>

                    <select value={filterKind} onChange={e => setFilterKind(e.target.value as ItemKind | "")}
                        className="px-3 py-2 text-[13px] border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-300 text-gray-600">
                        <option value="">Semua Jenis</option>
                        <option value="LAPTOP">Laptop</option>
                        <option value="ACCESSORY">Aksesoris</option>
                    </select>

                    <select value={filterPeriod} onChange={e => setFilterPeriod(e.target.value as typeof filterPeriod)}
                        className="px-3 py-2 text-[13px] border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-300 text-gray-600">
                        <option value="">Semua Periode</option>
                        <option value="today">Hari Ini</option>
                        <option value="week">Minggu Ini</option>
                        <option value="month">Bulan Ini</option>
                    </select>

                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="Dari tanggal"
                        className="px-3 py-2 text-[13px] border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-300 text-gray-600" />
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} title="Sampai tanggal"
                        className="px-3 py-2 text-[13px] border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-300 text-gray-600" />

                    <select value={filterAudit} onChange={e => setFilterAudit(e.target.value as typeof filterAudit)}
                        className="px-3 py-2 text-[13px] border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-300 text-gray-600">
                        <option value="">Semua Audit</option>
                        <option value="audited">Sudah Diaudit</option>
                        <option value="unaudited">Belum Diaudit</option>
                    </select>

                    {hasFilter && (
                        <button onClick={resetFilters}
                            className="px-3 py-2 text-[13px] text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                            Reset
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-3 mt-2.5 text-[12px] text-gray-400">
                    <span>{filtered.length} dari {rows.length} data</span>
                    {rows.length > 0 && (
                        <>
                            <span>·</span>
                            <span className="text-emerald-600 font-medium">{rows.filter(r => r.is_audited).length} diaudit</span>
                            <span>·</span>
                            <span className="text-amber-600 font-medium">{rows.filter(r => !r.is_audited).length} belum diaudit</span>
                        </>
                    )}
                </div>
            </div>

            {/* ── Konten ── */}
            {loading ? (
                <div className="space-y-2">
                    {[...Array(4)].map((_, i) => <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />)}
                </div>
            ) : error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
                    <p className="text-sm text-red-600 font-medium mb-3">{error}</p>
                    <button onClick={loadOutflows} className="text-sm font-semibold text-red-700 underline underline-offset-2">Coba lagi</button>
                </div>
            ) : filtered.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 p-10 text-center">
                    <p className="text-sm text-gray-500 font-medium">
                        {rows.length === 0 ? "Belum ada data barang keluar." : "Tidak ada data yang sesuai filter."}
                    </p>
                    {rows.length > 0 && (
                        <button onClick={resetFilters} className="mt-2 text-[12px] text-gray-400 underline underline-offset-2">Reset filter</button>
                    )}
                </div>
            ) : (
                <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                    <div className="overflow-x-auto max-h-[calc(100dvh-260px)] overflow-y-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-200">
                                    <th className="sticky top-0 z-20 bg-gray-50 text-left font-semibold px-4 py-3">No</th>
                                    <th className="sticky top-0 z-20 bg-gray-50 text-left font-semibold px-4 py-3">Sumber</th>
                                    <th className="sticky top-0 z-20 bg-gray-50 text-left font-semibold px-4 py-3">Tipe</th>
                                    <th className="sticky top-0 z-20 bg-gray-50 text-left font-semibold px-4 py-3">Nama</th>
                                    <th className="sticky top-0 z-20 bg-gray-50 text-left font-semibold px-4 py-3">Barang</th>
                                    <th className="sticky top-0 z-20 bg-gray-50 text-left font-semibold px-4 py-3">Kebutuhan</th>
                                    <th className="sticky top-0 z-20 bg-gray-50 text-right font-semibold px-4 py-3">Nominal</th>
                                    <th className="sticky top-0 z-20 bg-gray-50 text-left font-semibold px-4 py-3">Tanggal</th>
                                    <th className="sticky top-0 z-20 bg-gray-50 text-center font-semibold px-4 py-3">Audit</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filtered.map((row, i) => {
                                    const source = getOutflowSource(row);
                                    return (
                                        <tr key={row.id} className="hover:bg-gray-50/60 transition align-top">
                                            <td className="px-4 py-3 text-gray-400 tabular-nums">{String(i + 1).padStart(2, "0")}</td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full border w-fit ${SOURCE_BADGE[source]}`}>
                                                    {SOURCE_LABEL[source]}
                                                </span>
                                                {row.status === "cancelled" && (
                                                    <span className="block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full border bg-red-50 text-red-600 border-red-200 w-fit">
                                                        Batal
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full border ${TYPE_BADGE[row.outflow_type]}`}>
                                                    {TYPE_LABEL[row.outflow_type]}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 font-medium text-gray-800">{row.person_name}</td>
                                            <td className="px-4 py-3">
                                                <div>
                                                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-gray-50 text-gray-500 border-gray-200 mr-1.5">
                                                        {KIND_LABEL[row.item_kind]}
                                                    </span>
                                                    <span className="text-gray-700">{row.item_name}</span>
                                                </div>
                                                {row.serial_number && (
                                                    <span className="mt-1 inline-block text-[10px] font-mono font-bold text-gray-500 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5">
                                                        {row.serial_number}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate" title={row.purpose}>{row.purpose}</td>
                                            <td className="px-4 py-3 text-right tabular-nums text-gray-800 font-medium">{rupiah(row.nominal)}</td>
                                            <td className="px-4 py-3 text-gray-400 whitespace-nowrap tabular-nums">{formatDate(row.created_at)}</td>

                                            <td className="px-4 py-3 text-center">
                                                <button
                                                    onClick={() => toggleAudit(row)}
                                                    disabled={auditingId === row.id}
                                                    title={
                                                        row.is_audited
                                                            ? `Diaudit oleh ${row.audited_by ?? "—"} · ${row.audited_at ? formatDate(row.audited_at) : ""} — klik untuk batalkan`
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

                                                <button
                                                    onClick={() => setHistoryTarget(row)}
                                                    className="mt-1 block mx-auto text-[10px] text-gray-400 hover:text-gray-600 underline underline-offset-2"
                                                >
                                                    Riwayat
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {cancelAuditTarget && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
                    onClick={() => { setCancelAuditTarget(null); setCancelReason(""); }}>
                    <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5" onClick={e => e.stopPropagation()}>
                        <h3 className="text-base font-bold text-gray-900 mb-1.5">Batalkan Audit?</h3>
                        <p className="text-[13px] text-gray-500 mb-3">
                            &quot;{cancelAuditTarget.item_name}&quot; akan ditandai belum diaudit. Alasan pembatalan wajib diisi.
                        </p>
                        <textarea
                            value={cancelReason}
                            onChange={e => setCancelReason(e.target.value)}
                            rows={3}
                            placeholder="Contoh: salah audit, data ternyata belum lengkap, dll."
                            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-400 mb-4"
                        />
                        <div className="flex gap-2">
                            <button onClick={() => { setCancelAuditTarget(null); setCancelReason(""); }}
                                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
                                Batal
                            </button>
                            <button onClick={confirmCancelAudit} disabled={submittingCancel || !cancelReason.trim()}
                                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition disabled:opacity-60 active:scale-[0.98]">
                                {submittingCancel ? "Memproses…" : "Ya, Batalkan Audit"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {historyTarget && (
                <AuditHistoryModal
                    row={historyTarget}
                    entity={getLogEntity(historyTarget)}
                    onClose={() => setHistoryTarget(null)}
                />
            )}
        </div>
    );
}