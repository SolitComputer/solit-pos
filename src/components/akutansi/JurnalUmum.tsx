"use client";
// src/components/akutansi/JurnalUmum.tsx

import { useCallback, useEffect, useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import {
    ACCOUNTS,
    ACCOUNT_TYPE_LABEL,
    ACCOUNT_TYPE_ORDER,
    DraftLine,
    JournalSide,
    MANUAL_TEMPLATES,
    isBalanced,
    sumSide,
} from "@/lib/accounting";

// ─── Types ────────────────────────────────────────────────────────────────────
interface JournalLine {
    id: string;
    account_code: string;
    account_name: string;
    side: JournalSide;
    nominal: number;
    line_order: number;
}

interface JournalEntry {
    id: string;
    period: string;
    tanggal: string;
    keterangan: string;
    ref: string | null;
    source_type: "TRANSACTION" | "SERVICE" | "CASHFLOW" | "MANUAL";
    source_id: string | null;
    total: number;
    is_edited: boolean;
    lines: JournalLine[];
    created_by_user?: { id: string; name: string } | null;
    updated_by_user?: { id: string; name: string } | null;
    updated_at?: string;
}

interface PendingDraft {
    source_type: "TRANSACTION" | "SERVICE" | "CASHFLOW";
    source_id: string;
    tanggal: string;
    sort_ts: string;
    keterangan: string;
    total: number;
    lines: DraftLine[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const rp = (n: number) => `Rp${Math.round(Number(n || 0)).toLocaleString("id-ID")}`;
const fmtTgl = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "2-digit" });
const fmtWaktu = (iso?: string) =>
    iso ? new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

const SOURCE_BADGE: Record<string, { label: string; color: string }> = {
    TRANSACTION: { label: "Transaksi", color: "bg-blue-50 text-blue-700 border-blue-200" },
    SERVICE: { label: "Service", color: "bg-violet-50 text-violet-700 border-violet-200" },
    CASHFLOW: { label: "Cashflow", color: "bg-amber-50 text-amber-700 border-amber-200" },
    MANUAL: { label: "Manual", color: "bg-gray-100 text-gray-600 border-gray-200" },
};

const key = (d: { source_type: string; source_id: string }) => `${d.source_type}:${d.source_id}`;

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function JurnalUmum({ period }: { period: string }) {
    const [entries, setEntries] = useState<JournalEntry[]>([]);
    const [pending, setPending] = useState<PendingDraft[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [showPending, setShowPending] = useState(true);
    const [editEntry, setEditEntry] = useState<JournalEntry | null>(null);
    const [showManual, setShowManual] = useState(false);
    const [logEntry, setLogEntry] = useState<JournalEntry | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [jRes, pRes] = await Promise.all([
                fetch(`/api/akutansi/jurnal?period=${period}`),
                fetch(`/api/akutansi/jurnal/pending?period=${period}`),
            ]);
            const j = await jRes.json();
            const p = await pRes.json();
            setEntries(j.success ? j.data ?? [] : []);

            // Data dari API sudah terurut deterministik (tanggal, lalu sort_ts).
            // Sort ulang di sini cuma jaga-jaga kalau ada penggabungan data di masa depan —
            // pakai sort_ts, BUKAN source_id, supaya urutannya sesuai waktu asli, bukan alfabetis.
            const pendingSorted = (p.success ? p.data ?? [] : []).slice().sort((a: PendingDraft, b: PendingDraft) => {
                if (a.tanggal !== b.tanggal) return a.tanggal.localeCompare(b.tanggal);
                return (a.sort_ts ?? "").localeCompare(b.sort_ts ?? "");
            });
            setPending(pendingSorted);

            setSelected(new Set());
        } finally {
            setLoading(false);
        }
    }, [period]);

    useEffect(() => { load(); }, [load]);

    const confirmItems = async (items: PendingDraft[]) => {
        if (items.length === 0 || busy) return;
        setBusy(true);
        try {
            const res = await fetch("/api/akutansi/jurnal/confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    period,
                    items: items.map((i) => ({ source_type: i.source_type, source_id: i.source_id })),
                }),
            });
            const json = await res.json();
            if (!json.success) { setToast(json.message ?? "Gagal konfirmasi"); return; }
            setToast(`${json.data?.inserted ?? 0} data masuk jurnal umum`);
            await load();
        } catch {
            setToast("Koneksi bermasalah");
        } finally {
            setBusy(false);
        }
    };

    const handleDelete = async (entry: JournalEntry) => {
        if (!confirm(`Hapus jurnal "${entry.keterangan}"?\n\nData ini akan kembali ke daftar pending (jika berasal dari sistem).`)) return;
        setBusy(true);
        try {
            const res = await fetch(`/api/akutansi/jurnal/${entry.id}`, { method: "DELETE" });
            const json = await res.json();
            if (!json.success) { setToast(json.message ?? "Gagal hapus"); return; }
            setToast("Jurnal dihapus");
            await load();
        } finally {
            setBusy(false);
        }
    };

    const handleDragEnd = async (result: DropResult) => {
        if (!result.destination) return;
        const sourceIndex = result.source.index;
        const destinationIndex = result.destination.index;
        if (sourceIndex === destinationIndex) return;

        if (search.trim() !== "") {
            setToast("Harap kosongkan pencarian sebelum mengubah urutan.");
            return;
        }

        const newEntries = Array.from(entries);
        const [removed] = newEntries.splice(sourceIndex, 1);

        const destEntry = newEntries[destinationIndex];
        if (destEntry && destEntry.tanggal !== removed.tanggal) {
            setToast("Hanya bisa mengubah urutan di tanggal yang sama.");
            return;
        }

        newEntries.splice(destinationIndex, 0, removed);
        setEntries(newEntries);

        const targetDate = removed.tanggal;
        const sameDateEntries = newEntries.filter(e => e.tanggal === targetDate);

        try {
            const res = await fetch("/api/akutansi/jurnal/reorder", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    date: targetDate,
                    orderedIds: sameDateEntries.map(e => e.id)
                })
            });
            const json = await res.json();
            if (!json.success) {
                setToast(json.message ?? "Gagal menyimpan urutan.");
                load();
            }
        } catch (e) {
            setToast("Gagal menyimpan urutan.");
            load();
        }
    };

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return entries;
        return entries.filter(
            (e) =>
                e.keterangan.toLowerCase().includes(q) ||
                (e.ref ?? "").toLowerCase().includes(q) ||
                e.lines.some((l) => l.account_code.includes(q) || l.account_name.toLowerCase().includes(q))
        );
    }, [entries, search]);

    const totalDebit = filtered.reduce((s, e) => s + sumSide(e.lines, "DEBIT"), 0);
    const totalKredit = filtered.reduce((s, e) => s + sumSide(e.lines, "KREDIT"), 0);

    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 3000);
        return () => clearTimeout(t);
    }, [toast]);

    return (
        <div className="space-y-4">
            {toast && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] bg-gray-900 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg">
                    {toast}
                </div>
            )}

            {/* ── Summary ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Stat label="Total Entry" value={String(filtered.length)} tone="gray" />
                <Stat label="Total Debit" value={rp(totalDebit)} tone="blue" />
                <Stat label="Total Kredit" value={rp(totalKredit)} tone="emerald" />
                <Stat
                    label="Status"
                    value={totalDebit === totalKredit ? "Balance ✓" : "Tidak Balance"}
                    tone={totalDebit === totalKredit ? "emerald" : "red"}
                />
            </div>

            {/* ── Pending panel ── */}
            {pending.length > 0 && (
                <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
                    <button
                        onClick={() => setShowPending((v) => !v)}
                        className="w-full px-4 py-3 flex items-center justify-between bg-amber-50 hover:bg-amber-100/60 transition"
                    >
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-amber-900">
                                ⏳ {pending.length} data menunggu konfirmasi
                            </span>
                            <span className="text-[10px] text-amber-600 font-semibold">
                                (belum masuk jurnal umum)
                            </span>
                        </div>
                        <span className="text-amber-600 text-xs">{showPending ? "▲" : "▼"}</span>
                    </button>

                    {showPending && (
                        <>
                            <div className="max-h-[320px] overflow-y-auto divide-y divide-gray-100">
                                {pending.map((d) => {
                                    const k = key(d);
                                    const checked = selected.has(k);
                                    const badge = SOURCE_BADGE[d.source_type];
                                    return (
                                        <label
                                            key={k}
                                            className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() =>
                                                    setSelected((prev) => {
                                                        const next = new Set(prev);
                                                        next.has(k) ? next.delete(k) : next.add(k);
                                                        return next;
                                                    })
                                                }
                                                className="w-4 h-4 rounded border-gray-300"
                                            />
                                            <span className="text-[10px] text-gray-400 font-mono w-16 shrink-0">
                                                {fmtTgl(d.tanggal)}
                                            </span>
                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${badge.color}`}>
                                                {badge.label}
                                            </span>
                                            <span className="text-xs text-gray-700 flex-1 truncate">{d.keterangan}</span>
                                            <span className="text-xs font-bold text-gray-900 font-mono shrink-0">{rp(d.total)}</span>
                                        </label>
                                    );
                                })}
                            </div>

                            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
                                <button
                                    onClick={() => confirmItems(pending.filter((d) => selected.has(key(d))))}
                                    disabled={busy || selected.size === 0}
                                    className="w-full h-9 rounded-lg bg-gray-900 text-white text-xs font-bold hover:bg-gray-800 transition disabled:opacity-40"
                                >
                                    Konfirmasi Terpilih ({selected.size})
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ── Toolbar ── */}
            <div className="bg-white rounded-xl border border-gray-200 p-3 flex gap-2">
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari keterangan, akun, ref..."
                    className="flex-1 h-10 border border-gray-200 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition"
                />
                <button
                    onClick={() => setShowManual(true)}
                    className="h-10 px-4 rounded-lg bg-gray-900 text-white text-xs font-bold hover:bg-gray-800 transition whitespace-nowrap"
                >
                    + Jurnal Manual
                </button>
            </div>

            {/* ── Total — di ATAS, di luar tabel (bar ringkasan) ── */}
            {!loading && filtered.length > 0 && (
                <div className="bg-gray-100 border border-gray-300 rounded-xl px-4 py-3 flex flex-wrap items-center justify-end gap-x-6 gap-y-1">
                    <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Total</span>
                    <span className="text-sm font-black text-gray-900 font-mono">
                        Debit&nbsp; {rp(totalDebit)}
                    </span>
                    <span className="text-sm font-black text-gray-900 font-mono">
                        Kredit&nbsp; {rp(totalKredit)}
                    </span>
                </div>
            )}

            {/* ── Tabel Jurnal Umum ── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <DragDropContext onDragEnd={handleDragEnd}>
                        <Droppable droppableId="journal-entries">
                            {(provided) => (
                                <table
                                    className="w-full border-collapse"
                                    style={{ minWidth: "900px" }}
                                    ref={provided.innerRef}
                                    {...provided.droppableProps}
                                >
                                    <thead>
                                        <tr className="border-b-2 border-gray-200 bg-gray-50">
                                            <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-600 uppercase tracking-wider w-[110px]">Tanggal</th>
                                            <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-600 uppercase tracking-wider">Keterangan</th>
                                            <th className="px-4 py-3 text-center text-[11px] font-bold text-gray-600 uppercase tracking-wider w-[80px]">Ref</th>
                                            <th className="px-4 py-3 text-right text-[11px] font-bold text-gray-600 uppercase tracking-wider w-[150px]">Debit</th>
                                            <th className="px-4 py-3 text-right text-[11px] font-bold text-gray-600 uppercase tracking-wider w-[150px]">Kredit</th>
                                            <th className="px-4 py-3 text-center text-[11px] font-bold text-gray-600 uppercase tracking-wider w-[110px]">Aksi</th>
                                        </tr>
                                    </thead>

                                    {loading ? (
                                        <tbody>
                                            {Array.from({ length: 4 }).map((_, i) => (
                                                <tr key={i} className="border-b border-gray-50">
                                                    {Array.from({ length: 6 }).map((__, j) => (
                                                        <td key={j} className="px-4 py-4">
                                                            <div className="h-3 bg-gray-100 rounded animate-pulse" />
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    ) : filtered.length === 0 ? (
                                        <tbody>
                                            <tr>
                                                <td colSpan={6} className="py-16 text-center">
                                                    <div className="flex justify-center mb-3 opacity-40"><Inbox className="w-10 h-10" /></div>
                                                    <p className="text-sm text-gray-500 font-medium">Belum ada jurnal di periode ini</p>
                                                    <p className="text-xs text-gray-400 mt-1">
                                                        Konfirmasi data pending di atas, atau buat jurnal manual.
                                                    </p>
                                                </td>
                                            </tr>
                                        </tbody>
                                    ) : (
                                        filtered.map((entry, index) => {
                                            const badge = SOURCE_BADGE[entry.source_type];
                                            return (
                                                <Draggable key={entry.id} draggableId={entry.id} index={index}>
                                                    {(provided, snapshot) => (
                                                        <tbody
                                                            ref={provided.innerRef}
                                                            {...provided.draggableProps}
                                                            {...provided.dragHandleProps}
                                                            className={snapshot.isDragging ? "bg-white shadow-lg z-50 relative ring-2 ring-blue-400" : ""}
                                                            style={provided.draggableProps.style}
                                                        >
                                                            {entry.lines.map((line, i) => {
                                                                const first = i === 0;
                                                                const isKredit = line.side === "KREDIT";
                                                                return (
                                                                    <tr
                                                                        key={line.id}
                                                                        className={`${first ? "border-t-2 border-gray-200" : ""} hover:bg-blue-50/30 transition`}
                                                                    >
                                                                        {/* Tanggal — hanya di baris pertama */}
                                                                        <td className="px-4 py-2 align-top">
                                                                            {first && (
                                                                                <span className="text-[11px] font-semibold text-gray-700 whitespace-nowrap flex items-center gap-2">
                                                                                    <div className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600">
                                                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>
                                                                                    </div>
                                                                                    {fmtTgl(entry.tanggal)}
                                                                                </span>
                                                                            )}
                                                                        </td>

                                                                        {/* Keterangan — kredit di-indent */}
                                                                        <td className="px-4 py-2 align-top">
                                                                            {first && (
                                                                                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                                                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${badge.color}`}>
                                                                                        {badge.label}
                                                                                    </span>
                                                                                    {entry.is_edited && (
                                                                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 border border-orange-200">
                                                                                            diedit · {entry.updated_by_user?.name ?? "—"}
                                                                                        </span>
                                                                                    )}
                                                                                    <span className="text-[11px] font-bold text-gray-900">{entry.keterangan}</span>
                                                                                </div>
                                                                            )}
                                                                            <div className={`text-[11px] ${isKredit ? "pl-10 text-emerald-800" : "pl-1 text-blue-800"} font-medium`}>
                                                                                {line.account_name}
                                                                            </div>
                                                                        </td>

                                                                        {/* Ref = kode akun (post reference) */}
                                                                        <td className="px-4 py-2 text-center align-bottom">
                                                                            <span className="text-[10px] font-mono font-bold text-gray-400">
                                                                                {line.account_code}
                                                                            </span>
                                                                            {first && entry.ref && (
                                                                                <div className="text-[9px] text-gray-300 font-mono mt-0.5">{entry.ref}</div>
                                                                            )}
                                                                        </td>

                                                                        {/* Debit */}
                                                                        <td className="px-4 py-2 text-right align-bottom">
                                                                            {!isKredit && (
                                                                                <span className="text-[12px] font-bold text-gray-900 font-mono">
                                                                                    {rp(line.nominal)}
                                                                                </span>
                                                                            )}
                                                                        </td>

                                                                        {/* Kredit */}
                                                                        <td className="px-4 py-2 text-right align-bottom">
                                                                            {isKredit && (
                                                                                <span className="text-[12px] font-bold text-gray-900 font-mono">
                                                                                    {rp(line.nominal)}
                                                                                </span>
                                                                            )}
                                                                        </td>

                                                                        {/* Aksi — hanya baris pertama */}
                                                                        <td className="px-4 py-2 align-top">
                                                                            {first && (
                                                                                <div className="flex items-center justify-center gap-1">
                                                                                    <button
                                                                                        onClick={() => setEditEntry(entry)}
                                                                                        className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition"
                                                                                        title="Edit jurnal"
                                                                                    >
                                                                                        ✏️
                                                                                    </button>
                                                                                    <button
                                                                                        onClick={() => setLogEntry(entry)}
                                                                                        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition"
                                                                                        title="Riwayat perubahan"
                                                                                    >
                                                                                        🕐
                                                                                    </button>
                                                                                    <button
                                                                                        onClick={() => handleDelete(entry)}
                                                                                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                                                                                        title="Hapus"
                                                                                    >
                                                                                        🗑️
                                                                                    </button>
                                                                                </div>
                                                                            )}
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    )}
                                                </Draggable>
                                            );
                                        })
                                    )}
                                    {provided.placeholder}
                                </table>
                            )}
                        </Droppable>
                    </DragDropContext>
                </div>
            </div>

            {/* ── Modals ── */}
            {showManual && (
                <EntryFormModal
                    period={period}
                    onClose={() => setShowManual(false)}
                    onSaved={() => { setShowManual(false); setToast("Jurnal manual dibuat"); load(); }}
                />
            )}
            {editEntry && (
                <EntryFormModal
                    period={period}
                    entry={editEntry}
                    onClose={() => setEditEntry(null)}
                    onSaved={() => { setEditEntry(null); setToast("Jurnal diperbarui"); load(); }}
                />
            )}
            {logEntry && <AuditLogModal entry={logEntry} onClose={() => setLogEntry(null)} />}
        </div>
    );
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function Stat({ label, value, tone }: { label: string; value: string; tone: "gray" | "blue" | "emerald" | "red" }) {
    const map = {
        gray: "border-gray-200 text-gray-900",
        blue: "border-blue-200 text-blue-800",
        emerald: "border-emerald-200 text-emerald-800",
        red: "border-red-200 text-red-700",
    };
    return (
        <div className={`bg-white rounded-xl border p-4 ${map[tone]}`}>
            <p className="text-[10px] font-semibold uppercase tracking-wide opacity-50 mb-1">{label}</p>
            <p className="text-base font-black font-mono truncate">{value}</p>
        </div>
    );
}

function EntryFormModal({
    period,
    entry,
    onClose,
    onSaved,
}: {
    period: string;
    entry?: JournalEntry;
    onClose: () => void;
    onSaved: () => void;
}) {
    const isEdit = !!entry;
    const [tanggal, setTanggal] = useState(entry?.tanggal ?? `${period}-01`);
    const [keterangan, setKeterangan] = useState(entry?.keterangan ?? "");
    const [ref, setRef] = useState(entry?.ref ?? "");
    const [template, setTemplate] = useState("CUSTOM");

    const [allAccounts, setAllAccounts] = useState<{ code: string; name: string; type: string }[]>(ACCOUNTS);
    useEffect(() => {
        fetch("/api/akutansi/accounts")
            .then((r) => r.json())
            .then((j) => { if (j.success) setAllAccounts(j.data); })
            .catch(() => { });
    }, []);
    const [lines, setLines] = useState<DraftLine[]>(
        entry?.lines.map((l) => ({ account_code: l.account_code, side: l.side, nominal: Number(l.nominal) })) ?? [
            { account_code: "110", side: "DEBIT", nominal: 0 },
            { account_code: "410", side: "KREDIT", nominal: 0 },
        ]
    );
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const applyTemplate = (key: string) => {
        setTemplate(key);
        const t = MANUAL_TEMPLATES.find((x) => x.key === key);
        if (!t || t.lines.length === 0) return;
        setLines(t.lines.map((l) => ({ ...l, nominal: 0 })));
    };

    const patch = (i: number, p: Partial<DraftLine>) =>
        setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...p } : l)));

    const debit = sumSide(lines, "DEBIT");
    const kredit = sumSide(lines, "KREDIT");
    const balanced = isBalanced(lines);

    const submit = async () => {
        setError("");
        if (!keterangan.trim()) return setError("Keterangan wajib diisi");
        if (!balanced) return setError("Total debit harus sama dengan total kredit");

        setSaving(true);
        try {
            const url = isEdit ? `/api/akutansi/jurnal/${entry!.id}` : "/api/akutansi/jurnal";
            const res = await fetch(url, {
                method: isEdit ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    tanggal,
                    keterangan: keterangan.trim(),
                    ref: ref.trim() || null,
                    source_category: isEdit ? undefined : template,
                    lines: lines.filter((l) => Number(l.nominal) > 0),
                }),
            });
            const json = await res.json();
            if (!json.success) { setError(json.message ?? "Gagal menyimpan"); return; }
            onSaved();
        } catch {
            setError("Koneksi bermasalah");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh]">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <h3 className="font-bold text-gray-900 text-sm">{isEdit ? "Edit Jurnal" : "Jurnal Manual"}</h3>
                        {isEdit && (
                            <p className="text-[11px] text-gray-400 mt-0.5">
                                Perubahan di sini <b>tidak</b> mengubah data transaksi/service/cashflow asli.
                            </p>
                        )}
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full text-gray-400 hover:bg-gray-100">✕</button>
                </div>

                <div className="overflow-y-auto flex-1 p-5 space-y-4">
                    {!isEdit && (
                        <div>
                            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Kategori / Template</label>
                            <div className="flex flex-wrap gap-1.5">
                                {MANUAL_TEMPLATES.map((t) => (
                                    <button
                                        key={t.key}
                                        onClick={() => applyTemplate(t.key)}
                                        className={`h-8 px-3 rounded-lg text-xs font-semibold border transition ${template === t.key
                                            ? "bg-gray-900 text-white border-gray-900"
                                            : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                                            }`}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Tanggal</label>
                            <input
                                type="date"
                                value={tanggal}
                                onChange={(e) => setTanggal(e.target.value)}
                                className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Ref (opsional)</label>
                            <input
                                value={ref}
                                onChange={(e) => setRef(e.target.value)}
                                placeholder="No. bukti"
                                className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Keterangan</label>
                        <input
                            value={keterangan}
                            onChange={(e) => setKeterangan(e.target.value)}
                            placeholder="Tipe laptop - SN - Nama customer"
                            className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm"
                        />
                    </div>

                    {/* Baris debit/kredit */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="text-xs font-semibold text-gray-500">Baris Jurnal</label>
                            <button
                                onClick={() => setLines((p) => [...p, { account_code: "110", side: "DEBIT", nominal: 0 }])}
                                className="text-[11px] font-bold text-blue-600 hover:underline"
                            >
                                + Tambah baris
                            </button>
                        </div>

                        <div className="space-y-2">
                            {lines.map((l, i) => (
                                <div key={i} className="flex gap-2 items-center">
                                    <select
                                        value={l.side}
                                        onChange={(e) => patch(i, { side: e.target.value as JournalSide })}
                                        className={`h-9 w-24 border rounded-lg px-2 text-xs font-bold ${l.side === "DEBIT"
                                            ? "border-blue-200 bg-blue-50 text-blue-700"
                                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                                            }`}
                                    >
                                        <option value="DEBIT">Debit</option>
                                        <option value="KREDIT">Kredit</option>
                                    </select>

                                    <select
                                        value={l.account_code}
                                        onChange={(e) => patch(i, { account_code: e.target.value })}
                                        className="h-9 flex-1 border border-gray-200 rounded-lg px-2 text-xs bg-white"
                                    >
                                        {ACCOUNT_TYPE_ORDER.map((type) => (
                                            <optgroup key={type} label={ACCOUNT_TYPE_LABEL[type]}>
                                                {allAccounts.filter((a) => a.type === type).map((a) => (
                                                    <option key={a.code} value={a.code}>
                                                        {a.code} · {a.name}
                                                    </option>
                                                ))}
                                            </optgroup>
                                        ))}
                                    </select>

                                    <input
                                        type="number"
                                        min={0}
                                        value={l.nominal || ""}
                                        onChange={(e) => patch(i, { nominal: Math.max(0, Number(e.target.value)) })}
                                        placeholder="0"
                                        className="h-9 w-36 border border-gray-200 rounded-lg px-2 text-xs font-mono text-right"
                                    />

                                    <button
                                        onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}
                                        disabled={lines.length <= 2}
                                        className="w-8 h-9 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-30"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Balance indicator */}
                    <div
                        className={`rounded-xl border p-3 flex items-center justify-between ${balanced ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"
                            }`}
                    >
                        <span className={`text-xs font-bold ${balanced ? "text-emerald-700" : "text-red-700"}`}>
                            {balanced ? "✓ Balance" : "✕ Tidak balance"}
                        </span>
                        <span className="text-xs font-mono font-bold text-gray-700">
                            D {rp(debit)} &nbsp;·&nbsp; K {rp(kredit)}
                        </span>
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">{error}</div>
                    )}
                </div>

                <div className="px-5 py-4 border-t border-gray-100 flex gap-3 bg-gray-50">
                    <button onClick={onClose} className="flex-1 h-10 bg-white border border-gray-300 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50">
                        Batal
                    </button>
                    <button
                        onClick={submit}
                        disabled={saving || !balanced}
                        className="flex-1 h-10 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-gray-800 disabled:opacity-40"
                    >
                        {saving ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Simpan Jurnal"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Audit Log Modal ──────────────────────────────────────────────────────────
function AuditLogModal({ entry, onClose }: { entry: JournalEntry; onClose: () => void }) {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`/api/akutansi/jurnal/${entry.id}/logs`)
            .then((r) => r.json())
            .then((j) => setLogs(j.success ? j.data ?? [] : []))
            .finally(() => setLoading(false));
    }, [entry.id]);

    const ACTION_LABEL: Record<string, string> = {
        CONFIRM: "Dikonfirmasi dari sistem",
        CREATE: "Dibuat manual",
        EDIT: "Diedit",
        DELETE: "Dihapus",
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl max-h-[80dvh] flex flex-col">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <h3 className="font-bold text-gray-900 text-sm">Riwayat Perubahan</h3>
                        <p className="text-[11px] text-gray-400 truncate max-w-[280px]">{entry.keterangan}</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full text-gray-400 hover:bg-gray-100">✕</button>
                </div>

                <div className="overflow-y-auto flex-1 p-5 space-y-2">
                    {loading ? (
                        <p className="text-xs text-gray-400">Memuat...</p>
                    ) : logs.length === 0 ? (
                        <p className="text-xs text-gray-400">Belum ada riwayat.</p>
                    ) : (
                        logs.map((l) => (
                            <div key={l.id} className="border border-gray-100 rounded-xl p-3 bg-gray-50">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-gray-800">{ACTION_LABEL[l.action] ?? l.action}</span>
                                    <span className="text-[10px] text-gray-400 font-mono">{fmtWaktu(l.changed_at)}</span>
                                </div>
                                <p className="text-[11px] text-gray-500 mt-1">
                                    oleh <b className="text-gray-700">{l.changed_by_user?.name ?? "—"}</b>
                                </p>
                                {l.action === "EDIT" && l.before_data && (
                                    <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                                        <div className="bg-white border border-red-100 rounded-lg p-2">
                                            <p className="text-red-500 font-bold mb-0.5">Sebelum</p>
                                            <p className="text-gray-600">{l.before_data.keterangan}</p>
                                            <p className="font-mono text-gray-500">{rp(Number(l.before_data.total ?? 0))}</p>
                                        </div>
                                        <div className="bg-white border border-emerald-100 rounded-lg p-2">
                                            <p className="text-emerald-600 font-bold mb-0.5">Sesudah</p>
                                            <p className="text-gray-600">{l.after_data?.keterangan}</p>
                                            <p className="font-mono text-gray-500">{rp(Number(l.after_data?.total ?? 0))}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}