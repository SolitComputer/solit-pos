"use client";
// src/components/akutansi/JurnalUmum.tsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Inbox, Pencil, Clock, Trash2, X, Check, Search, GripVertical, ArrowUpDown, AlertTriangle, ChevronDown, Plus, Calendar, Layers, Undo2, Sparkles } from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult, DragStart } from "@hello-pangea/dnd";
import {
    ACCOUNTS,
    ACCOUNT_TYPE_LABEL,
    ACCOUNT_TYPE_ORDER,
    AKUN,
    DraftLine,
    JournalSide,
    MANUAL_TEMPLATES,
    accountName,
    isBalanced,
    jakartaDate,
    sumSide,
} from "@/lib/accounting";

interface JournalLine {
    id: string;
    account_code: string;
    account_name: string;
    side: JournalSide;
    nominal: number;
    keterangan?: string | null;
    line_order: number;
    checked?: boolean;
    checked_at?: string | null;
}

interface WarningLog {
    id: string;
    action: "ACTIVATE" | "DEACTIVATE";
    reason: string | null;
    created_at: string;
    created_by_user?: { id: string; name: string } | null;
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
    trx_meta?: {
        company_name: string | null;
        cpu: string | null;
        ram: string | null;
        storage: string | null;
        modal_missing?: boolean;
    } | null;
    has_warning: boolean;
    warning_logs: WarningLog[];
}

interface PendingDraft {
    source_type: "TRANSACTION" | "SERVICE" | "CASHFLOW";
    source_id: string;
    tanggal: string;
    sort_ts: string;
    keterangan: string;
    total: number;
    lines: DraftLine[];
    meta?: {
        company_name?: string | null;
        cpu?: string | null;
        ram?: string | null;
        storage?: string | null;
        modal_missing?: boolean;
        [key: string]: unknown;
    };
}

interface CustomTemplate {
    id: string;
    name: string;
    lines: DraftLine[];
    created_by_user?: { id: string; name: string } | null;
}

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

const SOURCE_GROUP_RANK: Record<string, number> = {
    MANUAL: 0,
    SERVICE: 1,
    TRANSACTION: 2,
    CASHFLOW: 3,
};

const key = (d: { source_type: string; source_id: string }) => `${d.source_type}:${d.source_id}`;

function getCompanyBadge(company?: string | null): { label: string; color: string } | null {
    if (!company) return null;
    const cn = company.toLowerCase();
    if (cn.includes("sotech")) return { label: "Sotech", color: "bg-orange-50 text-orange-700 border-orange-200" };
    if (cn.includes("solit")) return { label: "Solit 03", color: "bg-blue-50 text-blue-700 border-blue-200" };
    if (cn.includes("on point") || cn.includes("onpoint")) return { label: "On Point", color: "bg-purple-50 text-purple-700 border-purple-200" };
    if (cn.includes("zenit.id")) return { label: "Zenit.id", color: "bg-indigo-50 text-indigo-700 border-indigo-200" };
    if (cn.includes("zenit")) return { label: "Zenit", color: "bg-teal-50 text-teal-700 border-teal-200" };
    return { label: company.trim(), color: "bg-gray-50 text-gray-600 border-gray-200" };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function JurnalUmum({ period }: { period: string }) {
    const [entries, setEntries] = useState<JournalEntry[]>([]);
    const [pending, setPending] = useState<PendingDraft[]>([]);
    const [pendingSummary, setPendingSummary] = useState<{
        transaction: number; service: number; cashflow: number;
    } | null>(null); const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [search, setSearch] = useState("");
    const [searchNominal, setSearchNominal] = useState("");
    const [pendingSearch, setPendingSearch] = useState("");
    const deferredSearch = React.useDeferredValue(search);
    const deferredSearchNominal = React.useDeferredValue(searchNominal);
    const deferredPendingSearch = React.useDeferredValue(pendingSearch);
    const [displayLimit, setDisplayLimit] = useState(50);
    const [accountCodeFilter, setAccountCodeFilter] = useState<Set<string>>(new Set());
    const [allAccounts, setAllAccounts] = useState<{ code: string; name: string; type: string }[]>(ACCOUNTS);
    const [showAccountFilter, setShowAccountFilter] = useState(false);
    const [accountFilterSearch, setAccountFilterSearch] = useState("");
    const accountFilterRef = useRef<HTMLDivElement>(null);
    const accountFilterButtonRef = useRef<HTMLButtonElement>(null);
    const [filterDropdownPos, setFilterDropdownPos] = useState<{ top: number; left: number } | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set());
    const [isDraggingGroup, setIsDraggingGroup] = useState(false);
    const [showBulkWarningInput, setShowBulkWarningInput] = useState(false);
    const [bulkWarningReason, setBulkWarningReason] = useState("");
    const [showBulkMoveModal, setShowBulkMoveModal] = useState(false);
    const [targetMoveDate, setTargetMoveDate] = useState("");
    const [bulkBusy, setBulkBusy] = useState(false);
    const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
    const [showOnlyWarnings, setShowOnlyWarnings] = useState(false);
    const [undoState, setUndoState] = useState<{ previousEntries: JournalEntry[]; batches: { date: string; orderedIds: string[] }[] } | null>(null);
    const [reorderingBusy, setReorderingBusy] = useState(false);
    const [editEntry, setEditEntry] = useState<JournalEntry | null>(null);
    const [showManual, setShowManual] = useState(false);
    const [logEntry, setLogEntry] = useState<JournalEntry | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [showPending, setShowPending] = useState(() => {
        if (typeof window === "undefined") return false;
        return localStorage.getItem("jurnal-show-pending") === "true";
    });

    const load = useCallback(async (showLoader = true) => {
        if (showLoader) setLoading(true);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000); // stop nunggu setelah 25 detik
        try {
            const [jRes, pRes] = await Promise.all([
                fetch(`/api/akutansi/jurnal?period=${period}&sort=${sortOrder}`, { signal: controller.signal }),
                fetch(`/api/akutansi/jurnal/pending?period=${period}`, { signal: controller.signal }),
            ]);
            const j = await jRes.json();
            const p = await pRes.json();
            setEntries(j.success ? j.data ?? [] : []);

            // Data dari API sudah terurut deterministik (tanggal, lalu sort_ts).
            // Sort ulang di sini cuma jaga-jaga kalau ada penggabungan data di masa depan —
            // pakai sort_ts, BUKAN source_id, supaya urutannya sesuai waktu asli, bukan alfabetis.
            const pendingSorted = (p.success ? p.data ?? [] : []).slice().sort((a: PendingDraft, b: PendingDraft) => {
                if (a.tanggal !== b.tanggal) return b.tanggal.localeCompare(a.tanggal);
                return (b.sort_ts ?? "").localeCompare(a.sort_ts ?? "");
            });
            setPending(pendingSorted);
            setPendingSummary(p.success ? p.summary ?? null : null);

            if (showLoader) setSelected(new Set());
        } catch (e: any) {
            setToast(e?.name === "AbortError" ? "Server terlalu lama merespon, coba lagi" : "Gagal memuat data jurnal");
        } finally {
            clearTimeout(timeoutId);
            if (showLoader) setLoading(false);
        }
    }, [period, sortOrder]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        if (typeof window !== "undefined") {
            localStorage.setItem("jurnal-show-pending", String(showPending));
        }
    }, [showPending]);

    // Daftar lengkap akun untuk dropdown filter "Ref" — dimuat sekali saat komponen mount,
    // supaya dropdown menampilkan SEMUA akun yang ada (bukan cuma yang sedang tampil di tabel).
    useEffect(() => {
        fetch("/api/akutansi/accounts")
            .then((r) => r.json())
            .then((j) => { if (j.success) setAllAccounts(j.data); })
            .catch(() => { });
    }, []);

    // Tutup dropdown filter akun kalau user klik di luar area dropdown.
    useEffect(() => {
        if (!showAccountFilter) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (accountFilterRef.current && !accountFilterRef.current.contains(e.target as Node)) {
                setShowAccountFilter(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [showAccountFilter]);

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
            const insertedCount = json.data?.inserted ?? 0;
            const skippedCount = json.data?.skipped ?? 0;
            setToast(
                skippedCount > 0
                    ? `${insertedCount} data masuk jurnal umum (${skippedCount} sudah pernah dikonfirmasi sebelumnya)`
                    : `${insertedCount} data masuk jurnal umum`
            );
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
            setSelectedEntryIds((prev) => {
                if (!prev.has(entry.id)) return prev;
                const next = new Set(prev);
                next.delete(entry.id);
                return next;
            });
            await load(false);
        } finally {
            setBusy(false);
        }
    };

    // Reset display limit when period or filter changes
    useEffect(() => {
        setDisplayLimit(50);
    }, [period, search, searchNominal, accountCodeFilter, showOnlyWarnings, sortOrder]);

    const toggleEntrySelected = useCallback((id: string) => {
        setSelectedEntryIds((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }, []);

    const clearEntrySelection = useCallback(() => setSelectedEntryIds(new Set()), []);

    const handleUpdated = useCallback(() => { load(false); }, [load]);
    const handleToggleWarningState = useCallback((entryId: string, hasWarn: boolean) => {
        setEntries((prev) =>
            prev.map((e) => (e.id === entryId ? { ...e, has_warning: hasWarn } : e))
        );
    }, []);

    // Dipanggil saat drag mulai — kalau entry yang di-drag termasuk yang lagi dipilih
    // (dan ada >1 yang dipilih), tandai supaya baris lain yang ikut pindah bareng dikasih highlight.
    const handleDragStart = (start: DragStart) => {
        setIsDraggingGroup(selectedEntryIds.has(start.draggableId) && selectedEntryIds.size > 1);
    };

    // Hitung posisi sisip untuk grup entry yang digeser bareng: simulasikan dulu
    // pemindahan SATU entry yang di-drag (persis logic lama), lalu cari entry pertama
    // SETELAHNYA yang BUKAN bagian dari grup — itu jadi "jangkar" tempat grup disisipkan.
    const computeGroupInsertIndex = (
        list: JournalEntry[],
        sourceIndex: number,
        destinationIndex: number,
        idsToMoveSet: Set<string>
    ): number => {
        const singleMoved = Array.from(list);
        const [movedEntry] = singleMoved.splice(sourceIndex, 1);
        singleMoved.splice(destinationIndex, 0, movedEntry);

        const pivotPos = singleMoved.findIndex((e) => e.id === movedEntry.id);
        let anchorId: string | null = null;
        for (let i = pivotPos + 1; i < singleMoved.length; i++) {
            if (!idsToMoveSet.has(singleMoved[i].id)) { anchorId = singleMoved[i].id; break; }
        }

        const remaining = list.filter((e) => !idsToMoveSet.has(e.id));
        if (!anchorId) return remaining.length;
        const idx = remaining.findIndex((e) => e.id === anchorId);
        return idx === -1 ? remaining.length : idx;
    };

    const handleDragEnd = async (result: DropResult) => {
        setIsDraggingGroup(false);
        if (!result.destination) return;
        const sourceIndex = result.source.index;
        const destinationIndex = result.destination.index;
        if (sourceIndex === destinationIndex) return;

        if (search.trim() !== "" || searchNominal.trim() !== "" || accountCodeFilter.size > 0 || showOnlyWarnings) {
            setToast("Harap kosongkan pencarian dan filter sebelum mengubah urutan.");
            return;
        }

        const draggedEntry = entries[sourceIndex];
        if (!draggedEntry) return;

        // Kalau entry yang di-drag termasuk yang lagi dipilih (dan ada >1 yang dipilih),
        // pindahkan SEMUA entry terpilih sebagai satu grup — urutan relatifnya dipertahankan.
        const isGroupDrag = selectedEntryIds.has(draggedEntry.id) && selectedEntryIds.size > 1;
        const idsToMoveSet = isGroupDrag
            ? new Set(entries.filter((e) => selectedEntryIds.has(e.id)).map((e) => e.id))
            : new Set([draggedEntry.id]);

        const insertAt = computeGroupInsertIndex(entries, sourceIndex, destinationIndex, idsToMoveSet);
        const remaining = entries.filter((e) => !idsToMoveSet.has(e.id));
        const moving = entries.filter((e) => idsToMoveSet.has(e.id));

        const neighborBefore = remaining[insertAt - 1];
        const neighborAfter = remaining[insertAt];
        const targetDate = neighborAfter?.tanggal || neighborBefore?.tanggal || draggedEntry.tanggal;

        const dateChanged = moving.some((e) => e.tanggal !== targetDate);
        if (dateChanged) {
            try {
                const res = await fetch("/api/akutansi/jurnal/move", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ids: Array.from(idsToMoveSet), targetDate }),
                });
                const json = await res.json();
                if (!json.success) {
                    setToast(json.message ?? "Gagal memindahkan jurnal.");
                    load(false);
                    return;
                }
            } catch {
                setToast("Gagal memindahkan jurnal.");
                load(false);
                return;
            }
        }

        const updatedMoving = moving.map((e) => ({ ...e, tanggal: targetDate }));
        const newEntries = [...remaining.slice(0, insertAt), ...updatedMoving, ...remaining.slice(insertAt)];
        setEntries(newEntries);

        const sameDateEntries = newEntries.filter((e) => e.tanggal === targetDate);

        try {
            const res = await fetch("/api/akutansi/jurnal/reorder", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    date: targetDate,
                    orderedIds: sameDateEntries.map((e) => e.id),
                    sortOrder,
                }),
            });
            const json = await res.json();
            if (!json.success) {
                setToast(json.message ?? "Gagal menyimpan urutan.");
                load(false);
            } else if (isGroupDrag) {
                setToast(`${idsToMoveSet.size} entry dipindahkan ke ${fmtTgl(targetDate)}`);
            } else if (dateChanged) {
                setToast(`1 entry dipindahkan ke ${fmtTgl(targetDate)}`);
            }
        } catch (e) {
            setToast("Gagal menyimpan urutan.");
            load(false);
        }
    };

    // ── Rapikan Urutan Sumber per Tanggal (Manual → Service → Transaksi → Cashflow) ──
    const handleSortBySource = async () => {
        if (entries.length === 0 || reorderingBusy) return;
        setReorderingBusy(true);

        // Kelompokkan entries per tanggal
        const dateGroups = new Map<string, JournalEntry[]>();
        for (const e of entries) {
            if (!dateGroups.has(e.tanggal)) {
                dateGroups.set(e.tanggal, []);
            }
            dateGroups.get(e.tanggal)!.push(e);
        }

        const changedBatches: { date: string; orderedIds: string[] }[] = [];
        const revertBatches: { date: string; orderedIds: string[] }[] = [];
        const newEntries: JournalEntry[] = [];

        for (const [date, list] of dateGroups.entries()) {
            const originalIds = list.map((e) => e.id);
            // Stable sort by SOURCE_GROUP_RANK: MANUAL (0) -> SERVICE (1) -> TRANSACTION (2) -> CASHFLOW (3)
            const sortedList = [...list].sort((a, b) => {
                const rankA = SOURCE_GROUP_RANK[a.source_type] ?? 99;
                const rankB = SOURCE_GROUP_RANK[b.source_type] ?? 99;
                return rankA - rankB;
            });
            const sortedIds = sortedList.map((e) => e.id);

            const isChanged = originalIds.some((id, idx) => id !== sortedIds[idx]);
            if (isChanged) {
                changedBatches.push({ date, orderedIds: sortedIds });
                revertBatches.push({ date, orderedIds: originalIds });
            }
            newEntries.push(...sortedList);
        }

        if (changedBatches.length === 0) {
            setToast("Urutan sumber per tanggal sudah rapi.");
            setReorderingBusy(false);
            return;
        }

        // Simpan snapshot sebelumnya untuk fitur Undo
        const previousEntriesSnapshot = [...entries];
        setUndoState({
            previousEntries: previousEntriesSnapshot,
            batches: revertBatches,
        });

        // Optimistic update state
        setEntries(newEntries);

        try {
            const res = await fetch("/api/akutansi/jurnal/reorder", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    batches: changedBatches,
                    sortOrder,
                }),
            });
            const json = await res.json();
            if (!json.success) {
                setToast(json.message ?? "Gagal menyimpan perapian urutan.");
                setEntries(previousEntriesSnapshot);
                setUndoState(null);
            } else {
                setToast(`Urutan sumber berhasil dirapikan (${changedBatches.length} tanggal diperbarui).`);
            }
        } catch {
            setToast("Koneksi bermasalah saat merapikan urutan.");
            setEntries(previousEntriesSnapshot);
            setUndoState(null);
        } finally {
            setReorderingBusy(false);
        }
    };

    const handleUndoReorder = async () => {
        if (!undoState || reorderingBusy) return;
        setReorderingBusy(true);
        const { previousEntries, batches } = undoState;

        // Optimistic revert state
        setEntries(previousEntries);
        setUndoState(null);

        try {
            const res = await fetch("/api/akutansi/jurnal/reorder", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    batches,
                    sortOrder,
                }),
            });
            const json = await res.json();
            if (!json.success) {
                setToast(json.message ?? "Gagal mengembalikan urutan.");
                load(false);
            } else {
                setToast("Urutan berhasil dikembalikan ke semula.");
            }
        } catch {
            setToast("Gagal mengembalikan urutan.");
            load(false);
        } finally {
            setReorderingBusy(false);
        }
    };

    // Pindahkan semua entry yang terpilih ke tanggal baru
    const handleBulkMove = async () => {
        if (selectedEntryIds.size === 0 || !targetMoveDate || bulkBusy) return;
        setBulkBusy(true);
        try {
            const ids = Array.from(selectedEntryIds);
            const res = await fetch("/api/akutansi/jurnal/move", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids, targetDate: targetMoveDate }),
            });
            const json = await res.json();
            if (!json.success) {
                setToast(json.message ?? "Gagal memindahkan jurnal");
                return;
            }
            setToast(`${json.count ?? ids.length} jurnal dipindahkan ke ${fmtTgl(targetMoveDate)}`);
            setShowBulkMoveModal(false);
            setSelectedEntryIds(new Set());
            await load(false);
        } catch {
            setToast("Koneksi bermasalah saat memindahkan jurnal");
        } finally {
            setBulkBusy(false);
        }
    };

    // Hapus semua entry yang lagi dipilih sekaligus — pakai endpoint DELETE per-id yang sudah ada.
    const handleBulkDelete = async () => {
        if (selectedEntryIds.size === 0 || bulkBusy) return;
        if (!confirm(`Hapus ${selectedEntryIds.size} jurnal terpilih?\n\nData yang berasal dari sistem akan kembali ke daftar pending.`)) return;
        setBulkBusy(true);
        try {
            const ids = Array.from(selectedEntryIds);
            const results = await Promise.all(
                ids.map((id) =>
                    fetch(`/api/akutansi/jurnal/${id}`, { method: "DELETE" })
                        .then((r) => r.json())
                        .catch(() => ({ success: false }))
                )
            );
            const gagal = results.filter((r: any) => !r.success).length;
            setToast(gagal > 0 ? `${ids.length - gagal} dihapus, ${gagal} gagal` : `${ids.length} jurnal dihapus`);
            setSelectedEntryIds(new Set());
            await load(false);
        } finally {
            setBulkBusy(false);
        }
    };

    // Kasih penanda ke semua entry yang lagi dipilih sekaligus — pakai endpoint warning yang sudah ada.
    const handleBulkWarning = async () => {
        if (selectedEntryIds.size === 0 || bulkBusy || !bulkWarningReason.trim()) return;
        setBulkBusy(true);
        try {
            const ids = Array.from(selectedEntryIds);
            const results = await Promise.all(
                ids.map((id) =>
                    fetch(`/api/akutansi/jurnal/${id}/warning`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ reason: bulkWarningReason.trim() }),
                    })
                        .then((r) => r.json())
                        .catch(() => ({ success: false }))
                )
            );
            const gagal = results.filter((r: any) => !r.success).length;
            setToast(gagal > 0 ? `${ids.length - gagal} ditandai, ${gagal} gagal` : `${ids.length} jurnal ditandai`);
            setBulkWarningReason("");
            setShowBulkWarningInput(false);
            await load(false);
        } finally {
            setBulkBusy(false);
        }
    };

    // Toggle status "sudah dicek" untuk SELURUH baris dalam satu entry sekaligus
    const toggleEntryChecked = useCallback(async (entry: JournalEntry, next: boolean) => {
        const validLines = entry.lines.filter((l) => !l.id.endsWith("-missing"));
        if (validLines.length === 0) return;

        const validLineIds = new Set(validLines.map((l) => l.id));

        setEntries((prev) =>
            prev.map((e) =>
                e.id === entry.id
                    ? {
                        ...e,
                        lines: e.lines.map((l) =>
                            validLineIds.has(l.id)
                                ? { ...l, checked: next, checked_at: next ? new Date().toISOString() : null }
                                : l
                        ),
                    }
                    : e
            )
        );

        try {
            await Promise.all(
                validLines.map((l) =>
                    fetch("/api/akutansi/jurnal/check", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ line_id: l.id, checked: next }),
                    })
                )
            );
        } catch {
            load(false);
        }
    }, [load]);

    // Helper & hitung jumlah penanda (khusus entry yang ditandai manual lewat tombol Penanda di kolom AKSI)
    const hasWarning = useCallback((e: JournalEntry) => Boolean(e.has_warning), []);
    const warningCount = useMemo(() => entries.filter(hasWarning).length, [entries, hasWarning]);

    const filtered = useMemo(() => {
        const q = deferredSearch.trim().toLowerCase();
        const qNom = deferredSearchNominal.trim();
        let result = entries;

        if (showOnlyWarnings) {
            result = result.filter(hasWarning);
        }

        if (q || qNom) {
            const qNomDigits = qNom.replace(/[^0-9]/g, "");
            result = result.filter((e) => {
                const matchText = !q || (
                    e.keterangan.toLowerCase().includes(q) ||
                    (e.ref ?? "").toLowerCase().includes(q) ||
                    e.lines.some((l) => l.account_code.includes(q) || l.account_name.toLowerCase().includes(q))
                );
                const matchNominal = !qNomDigits || e.lines.some((l) => String(Math.round(Number(l.nominal))).startsWith(qNomDigits));
                return matchText && matchNominal;
            });
        }

        if (accountCodeFilter.size > 0) {
            result = result.filter((e) => {
                const modalMissing = e.source_type === "TRANSACTION" && e.trx_meta?.modal_missing === true;
                const allCodes = modalMissing
                    ? [...e.lines.map((l) => l.account_code), AKUN.MODAL_KELUAR, AKUN.HPP]
                    : e.lines.map((l) => l.account_code);
                return allCodes.some((code) => accountCodeFilter.has(code));
            });
        }

        return result;
    }, [entries, deferredSearch, deferredSearchNominal, accountCodeFilter, showOnlyWarnings, hasWarning]);

    const visibleEntries = useMemo(() => {
        return filtered.slice(0, displayLimit);
    }, [filtered, displayLimit]);

    // Search untuk daftar PENDING (data yang belum dikonfirmasi ke jurnal umum) —
    // terpisah dari `filtered` di atas karena sumber datanya beda (PendingDraft, bukan JournalEntry).
    const filteredPending = useMemo(() => {
        let pendingResult = pending;
        if (showOnlyWarnings) {
            // Data pending belum masuk ke jurnal umum (belum memiliki penanda manual AKSI)
            pendingResult = [];
        }
        const q = deferredPendingSearch.trim().toLowerCase();
        if (!q) return pendingResult;
        return pendingResult.filter((d) => {
            const badge = SOURCE_BADGE[d.source_type];
            const companyBadge = d.source_type === "TRANSACTION" ? getCompanyBadge(d.meta?.company_name) : null;
            const specParts = [d.meta?.cpu, d.meta?.ram, d.meta?.storage].filter(Boolean) as string[];
            return (
                d.keterangan.toLowerCase().includes(q) ||
                badge.label.toLowerCase().includes(q) ||
                (companyBadge?.label.toLowerCase().includes(q) ?? false) ||
                specParts.some((s) => s.toLowerCase().includes(q))
            );
        });
    }, [pending, deferredPendingSearch, showOnlyWarnings]);

    // Buka/tutup dropdown filter akun. Posisinya dihitung dari posisi tombol "Ref" di layar
    // (pakai position: fixed) supaya dropdown tidak terpotong oleh area scroll tabel.
    const openAccountFilterDropdown = () => {
        const btn = accountFilterButtonRef.current;
        if (btn) {
            const rect = btn.getBoundingClientRect();
            setFilterDropdownPos({ top: rect.bottom + 6, left: Math.max(8, rect.right - 288) });
        }
        setShowAccountFilter((v) => !v);
    };

    // Klik akun di dropdown "Ref": kalau sudah aktif, dihapus dari filter; kalau belum, ditambahkan.
    const toggleAccountCodeFilter = (code: string) => {
        setAccountCodeFilter((prev) => {
            const next = new Set(prev);
            next.has(code) ? next.delete(code) : next.add(code);
            return next;
        });
    };

    // Daftar akun yang ditampilkan di dalam dropdown, disaring oleh kotak pencarian dropdown.
    const accountsForDropdown = useMemo(() => {
        const q = accountFilterSearch.trim().toLowerCase();
        if (!q) return allAccounts;
        return allAccounts.filter((a) => a.code.includes(q) || a.name.toLowerCase().includes(q));
    }, [allAccounts, accountFilterSearch]);

    const totalDebit = useMemo(() => {
        return filtered.reduce((s, e) => {
            const modalMissing = e.source_type === "TRANSACTION" && e.trx_meta?.modal_missing === true;
            const displayLines: JournalLine[] = modalMissing
                ? [
                    ...e.lines,
                    {
                        id: `${e.id}-modal-keluar-missing`,
                        account_code: AKUN.MODAL_KELUAR,
                        account_name: accountName(AKUN.MODAL_KELUAR),
                        side: "DEBIT",
                        nominal: 0,
                        keterangan: "Harga modal belum diinput",
                        line_order: 999,
                    },
                    {
                        id: `${e.id}-hpp-missing`,
                        account_code: AKUN.HPP,
                        account_name: accountName(AKUN.HPP),
                        side: "KREDIT",
                        nominal: 0,
                        keterangan: null,
                        line_order: 1000,
                    },
                ]
                : e.lines;

            const lines = accountCodeFilter.size > 0
                ? displayLines.filter((l) => accountCodeFilter.has(l.account_code))
                : displayLines;

            return s + sumSide(lines, "DEBIT");
        }, 0);
    }, [filtered, accountCodeFilter]);

    const totalKredit = useMemo(() => {
        return filtered.reduce((s, e) => {
            const modalMissing = e.source_type === "TRANSACTION" && e.trx_meta?.modal_missing === true;
            const displayLines: JournalLine[] = modalMissing
                ? [
                    ...e.lines,
                    {
                        id: `${e.id}-modal-keluar-missing`,
                        account_code: AKUN.MODAL_KELUAR,
                        account_name: accountName(AKUN.MODAL_KELUAR),
                        side: "DEBIT",
                        nominal: 0,
                        keterangan: "Harga modal belum diinput",
                        line_order: 999,
                    },
                    {
                        id: `${e.id}-hpp-missing`,
                        account_code: AKUN.HPP,
                        account_name: accountName(AKUN.HPP),
                        side: "KREDIT",
                        nominal: 0,
                        keterangan: null,
                        line_order: 1000,
                    },
                ]
                : e.lines;

            const lines = accountCodeFilter.size > 0
                ? displayLines.filter((l) => accountCodeFilter.has(l.account_code))
                : displayLines;

            return s + sumSide(lines, "KREDIT");
        }, 0);
    }, [filtered, accountCodeFilter]);

    const totalLinesAll = useMemo(() => {
        return entries.reduce((s, e) => {
            const modalMissing = e.source_type === "TRANSACTION" && e.trx_meta?.modal_missing === true;
            return s + (modalMissing ? e.lines.length + 2 : e.lines.length);
        }, 0);
    }, [entries]);

    const totalLinesFiltered = useMemo(() => {
        return filtered.reduce((s, e) => {
            const modalMissing = e.source_type === "TRANSACTION" && e.trx_meta?.modal_missing === true;
            const displayLines = modalMissing
                ? [
                    ...e.lines,
                    { account_code: AKUN.MODAL_KELUAR },
                    { account_code: AKUN.HPP },
                ]
                : e.lines;
            const linesToRender = accountCodeFilter.size > 0
                ? displayLines.filter((l) => accountCodeFilter.has(l.account_code))
                : displayLines;
            return s + linesToRender.length;
        }, 0);
    }, [filtered, accountCodeFilter]);

    const isFiltered = search.trim() !== "" || searchNominal.trim() !== "" || accountCodeFilter.size > 0 || showOnlyWarnings;

    useEffect(() => {
        if (!toast) return;
        const duration = undoState ? 6000 : 3000;
        const t = setTimeout(() => setToast(null), duration);
        return () => clearTimeout(t);
    }, [toast, undoState]);

    return (
        <div className="space-y-4">
            {toast && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] bg-gradient-to-br from-[#0f0c29] to-[#1a1545] text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg toast-in flex items-center gap-3">
                    <span>{toast}</span>
                    {undoState && (
                        <button
                            onClick={handleUndoReorder}
                            disabled={reorderingBusy}
                            className="px-2.5 py-1 rounded-lg bg-amber-400 text-slate-900 font-bold hover:bg-amber-300 active:scale-95 transition text-[11px] flex items-center gap-1 shadow-xs shrink-0"
                        >
                            <Undo2 className="w-3 h-3" />
                            Undo
                        </button>
                    )}
                </div>
            )}


            {/* ── Pending panel ── */}
            {pending.length > 0 && (
                <div className="bg-amber-50/60 rounded-2xl border border-amber-200/80 overflow-hidden transition-all">
                    <button
                        onClick={() => setShowPending((v) => !v)}
                        className="w-full px-4 sm:px-5 py-3 flex items-center justify-between hover:bg-amber-100/40 active:scale-[0.995] transition-all duration-150"
                    >
                        <div className="flex flex-col items-start gap-1">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-amber-900 inline-flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5" /> {pending.length} data menunggu konfirmasi
                                </span>
                                <span className="text-[10px] text-amber-600 font-semibold">
                                    (belum masuk jurnal umum)
                                </span>
                            </div>
                        </div>
                        <span className={`text-amber-600 text-xs transition-transform duration-200 ${showPending ? "" : "-rotate-90"}`}>▲</span>
                    </button>

                    {showPending && (
                        <>
                            <div className="px-3 sm:px-4 py-2.5 border-b border-amber-100 bg-amber-50/40">
                                <div className="relative">
                                    <Search className="w-3.5 h-3.5 text-amber-400/70 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    <input
                                        value={pendingSearch}
                                        onChange={(e) => setPendingSearch(e.target.value)}
                                        placeholder="Cari data pending (keterangan, toko, spek)..."
                                        className="w-full h-9 border border-amber-200 rounded-lg pl-8 pr-3 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition"
                                    />
                                </div>
                                {pendingSearch.trim() !== "" && (
                                    <p className="text-[10px] text-amber-700/70 font-semibold mt-1">
                                        {filteredPending.length} dari {pending.length} data cocok
                                    </p>
                                )}
                            </div>
                            <div className="max-h-[320px] overflow-y-auto divide-y divide-gray-100">
                                {filteredPending.map((d) => {
                                    const k = key(d);
                                    const checked = selected.has(k);
                                    const badge = SOURCE_BADGE[d.source_type];
                                    // Badge toko & spek CUMA relevan untuk data TRANSACTION —
                                    // Service dan Cashflow tidak punya konsep laptop_id/company_name.
                                    const companyBadge = d.source_type === "TRANSACTION" ? getCompanyBadge(d.meta?.company_name) : null;
                                    const specParts = [d.meta?.cpu, d.meta?.ram, d.meta?.storage].filter(Boolean) as string[];
                                    const modalMissing = d.source_type === "TRANSACTION" && d.meta?.modal_missing === true;
                                    return (
                                        <label
                                            key={k}
                                            className={`flex flex-wrap items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 hover:bg-gray-50 cursor-pointer transition-colors ${checked ? "bg-blue-50/40" : ""}`}
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
                                                className="w-4 h-4 rounded border-gray-300 accent-[#1a1545] shrink-0"
                                            />
                                            <span className="text-[10px] text-gray-400 font-mono w-14 sm:w-16 shrink-0">
                                                {fmtTgl(d.tanggal)}
                                            </span>
                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${badge.color}`}>
                                                {badge.label}
                                            </span>
                                            {companyBadge && (
                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${companyBadge.color}`}>
                                                    {companyBadge.label}
                                                </span>
                                            )}
                                            {modalMissing && (
                                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 bg-amber-50 text-amber-700 border-amber-200 inline-flex items-center gap-1" title="Harga modal belum diinput di transaksi ini">
                                                    <AlertTriangle className="w-2.5 h-2.5 text-amber-600" /> Modal Rp0
                                                </span>
                                            )}
                                            <div className="w-full sm:contents">
                                                <div className="flex items-center justify-between gap-3 sm:flex-1 sm:min-w-0">
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs text-gray-700 truncate">{d.keterangan}</p>
                                                        {specParts.length > 0 && (
                                                            <p className="text-[10px] text-gray-400 truncate mt-0.5">{specParts.join(" · ")}</p>
                                                        )}
                                                    </div>
                                                    <span className="text-xs font-bold text-gray-900 font-mono shrink-0">{rp(d.total)}</span>
                                                </div>
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>

                            <div className="px-4 py-3 border-t border-amber-100 bg-amber-50/50">
                                <button
                                    onClick={() => confirmItems(pending.filter((d) => selected.has(key(d))))}
                                    disabled={busy || selected.size === 0}
                                    className="w-full h-9 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 active:scale-[0.98] transition-all duration-150 disabled:opacity-40 disabled:active:scale-100 shadow-xs"
                                >
                                    Konfirmasi Terpilih ({selected.size})
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ── Toolbar ── */}
            <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex-1 flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Cari keterangan, akun, ref..."
                            className="w-full h-10 border border-slate-200 bg-white rounded-xl pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition"
                        />
                    </div>
                    <div className="relative flex-1">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                            value={searchNominal}
                            onChange={(e) => setSearchNominal(e.target.value)}
                            placeholder="Cari nominal..."
                            className="w-full h-10 border border-slate-200 bg-white rounded-xl pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition"
                        />
                    </div>
                </div>

                <div className="flex gap-2">
                    <div className="flex items-center gap-1 border border-slate-200/80 bg-slate-100/80 rounded-xl p-1 shrink-0">
                        <button
                            onClick={() => setSortOrder("desc")}
                            title="Terbaru ke terlama"
                            className={`h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all duration-150 ${sortOrder === "desc"
                                ? "bg-slate-900 text-white shadow-2xs font-bold"
                                : "text-slate-500 hover:text-slate-800 hover:bg-white/50"
                                }`}
                        >
                            <ArrowUpDown className="w-3 h-3" /> Terbaru
                        </button>
                        <button
                            onClick={() => setSortOrder("asc")}
                            title="Terlama ke terbaru"
                            className={`h-8 px-3 rounded-lg text-xs font-semibold active:scale-95 transition-all duration-150 ${sortOrder === "asc"
                                ? "bg-slate-900 text-white shadow-2xs font-bold"
                                : "text-slate-500 hover:text-slate-800 hover:bg-white/50"
                                }`}
                        >
                            Terlama
                        </button>
                        <button
                            onClick={() => setShowOnlyWarnings((v) => !v)}
                            title={showOnlyWarnings ? "Tampilkan semua data" : "Filter hanya data dengan penanda (Modal Rp0 / diedit)"}
                            className={`h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all duration-150 ${showOnlyWarnings
                                ? "bg-red-600 text-white shadow-2xs font-bold ring-2 ring-red-300"
                                : warningCount > 0
                                    ? "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
                                    : "text-slate-500 hover:text-slate-800 hover:bg-white/50"
                                }`}
                        >
                            <AlertTriangle className={`w-3.5 h-3.5 ${showOnlyWarnings ? "text-white" : warningCount > 0 ? "text-red-600" : "text-slate-400"}`} />
                            <span>Penanda</span>
                            {warningCount > 0 && (
                                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${showOnlyWarnings ? "bg-white/20 text-white" : "bg-red-600 text-white"}`}>
                                    {warningCount}
                                </span>
                            )}
                        </button>
                        <button
                            onClick={handleSortBySource}
                            disabled={reorderingBusy || entries.length === 0}
                            title="Rapikan urutan tiap tanggal: Manual → Service → Transaksi → Cashflow"
                            className="h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all duration-150 text-slate-700 hover:text-slate-900 bg-white border border-slate-200/90 hover:bg-slate-50 hover:border-slate-300 shadow-2xs disabled:opacity-50"
                        >
                            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                            <span>{reorderingBusy ? "Merapikan..." : "Rapikan Sumber"}</span>
                        </button>
                        {undoState && (
                            <button
                                onClick={handleUndoReorder}
                                disabled={reorderingBusy}
                                title="Kembalikan urutan sebelum dirapikan"
                                className="h-8 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all duration-150 text-amber-900 bg-amber-100 border border-amber-300 hover:bg-amber-200 shadow-2xs animate-in fade-in zoom-in-95 duration-200"
                            >
                                <Undo2 className="w-3.5 h-3.5 text-amber-700" />
                                <span>Undo Urutan</span>
                            </button>
                        )}
                    </div>
                    <button
                        onClick={() => setShowManual(true)}
                        className="flex-1 sm:flex-none h-10 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs hover:shadow active:scale-[0.97] transition-all whitespace-nowrap"
                    >
                        + Jurnal Manual
                    </button>
                </div>
            </div>

            {selectedEntryIds.size > 0 && (
                <div className="flex flex-wrap items-center gap-2 bg-slate-900 text-white rounded-xl px-4 py-2.5">
                    <span className="text-xs font-bold shrink-0">{selectedEntryIds.size} entry dipilih</span>

                    {showBulkWarningInput ? (
                        <div className="flex items-center gap-1.5 flex-1 min-w-[220px]">
                            <input
                                autoFocus
                                value={bulkWarningReason}
                                onChange={(e) => setBulkWarningReason(e.target.value)}
                                placeholder="Alasan penanda untuk semua yang dipilih..."
                                className="h-8 flex-1 min-w-[140px] rounded-lg px-2.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
                            />
                            <button
                                onClick={handleBulkWarning}
                                disabled={bulkBusy || !bulkWarningReason.trim()}
                                className="h-8 px-3 rounded-lg bg-red-600 hover:bg-red-700 text-xs font-bold disabled:opacity-40 shrink-0"
                            >
                                Terapkan
                            </button>
                            <button
                                onClick={() => { setShowBulkWarningInput(false); setBulkWarningReason(""); }}
                                className="h-8 px-2 text-xs font-semibold text-slate-300 hover:text-white shrink-0"
                            >
                                Batal
                            </button>
                        </div>
                    ) : (
                        <>
                            <button
                                onClick={() => setSelectedEntryIds(new Set(filtered.map((e) => e.id)))}
                                className="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold active:scale-95 transition-all duration-150"
                            >
                                Pilih Semua ({filtered.length})
                            </button>
                            <button
                                onClick={() => {
                                    const firstSelected = entries.find((e) => selectedEntryIds.has(e.id));
                                    setTargetMoveDate(firstSelected?.tanggal ?? `${period}-01`);
                                    setShowBulkMoveModal(true);
                                }}
                                disabled={bulkBusy}
                                className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all duration-150 disabled:opacity-40"
                            >
                                <Calendar className="w-3.5 h-3.5" /> Pindah Tanggal
                            </button>
                            <button
                                onClick={() => setShowBulkWarningInput(true)}
                                disabled={bulkBusy}
                                className="h-8 px-3 rounded-lg bg-amber-500/90 hover:bg-amber-500 text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all duration-150 disabled:opacity-40"
                            >
                                <AlertTriangle className="w-3.5 h-3.5" /> Beri Penanda
                            </button>
                            <button
                                onClick={handleBulkDelete}
                                disabled={bulkBusy}
                                className="h-8 px-3 rounded-lg bg-red-600 hover:bg-red-700 text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all duration-150 disabled:opacity-40"
                            >
                                <Trash2 className="w-3.5 h-3.5" /> Hapus Terpilih
                            </button>
                            <button
                                onClick={clearEntrySelection}
                                className="h-8 px-3 rounded-lg text-xs font-semibold text-slate-300 hover:text-white ml-auto"
                            >
                                Batal Pilih
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* ── Filter akun / warning aktif — muncul kalau ada filter yang diaktifkan ── */}
            {(accountCodeFilter.size > 0 || showOnlyWarnings) && (
                <div className="flex flex-wrap items-center justify-between gap-2 -mt-1 bg-blue-50/50 border border-blue-100 rounded-xl px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-bold text-blue-900/60 uppercase tracking-wider">Filter aktif:</span>
                        {showOnlyWarnings && (
                            <button
                                onClick={() => setShowOnlyWarnings(false)}
                                className="inline-flex items-center gap-1 text-[11px] font-bold bg-red-600 text-white px-2.5 py-0.5 rounded-full hover:bg-red-700 active:scale-95 transition-all duration-150 shadow-sm"
                            >
                                <AlertTriangle className="w-3 h-3 text-white" /> Penanda Only ({warningCount}) <X className="w-3 h-3" />
                            </button>
                        )}
                        {Array.from(accountCodeFilter).map((code) => (
                            <button
                                key={code}
                                onClick={() => toggleAccountCodeFilter(code)}
                                className="inline-flex items-center gap-1 text-[11px] font-mono font-bold bg-blue-600 text-white px-2.5 py-0.5 rounded-full hover:bg-blue-700 active:scale-95 transition-all duration-150 shadow-sm"
                            >
                                {code} <X className="w-3 h-3" />
                            </button>
                        ))}
                        <button
                            onClick={() => { setAccountCodeFilter(new Set()); setShowOnlyWarnings(false); }}
                            className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 underline ml-1"
                        >
                            Hapus semua
                        </button>
                    </div>
                    <span className="text-[11px] font-semibold text-blue-900 bg-white border border-blue-200 rounded-lg px-2.5 py-1 shadow-2xs">
                        Tampil <b>{filtered.length}</b> dari <b>{entries.length}</b> entry ({totalLinesFiltered} baris)
                    </span>
                </div>
            )}

            {/* ── Total — di ATAS, di luar tabel (bar ringkasan) ── */}
            {!loading && filtered.length > 0 && (
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-x-4 sm:gap-x-6 gap-y-2">
                    <span className="text-xs font-semibold text-slate-500">
                        {isFiltered
                            ? `Menampilkan ${visibleEntries.length} dari ${filtered.length} entry (${totalLinesFiltered} / ${totalLinesAll} baris)`
                            : `Menampilkan ${visibleEntries.length} dari ${entries.length} entry (${totalLinesAll} total baris)`}
                    </span>
                    <div className="flex items-center gap-x-4 sm:gap-x-6 flex-wrap gap-y-1">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">TOTAL</span>
                        <span className="text-xs sm:text-sm font-bold text-slate-900 font-mono">
                            Debit&nbsp; <span className="font-extrabold text-slate-900">{rp(totalDebit)}</span>
                        </span>
                        <span className="text-xs sm:text-sm font-bold text-slate-900 font-mono">
                            Kredit&nbsp; <span className="font-extrabold text-slate-900">{rp(totalKredit)}</span>
                        </span>
                        <span
                            className={`text-xs font-bold px-3 py-1 rounded-full inline-flex items-center gap-1.5 shrink-0 ${totalDebit === totalKredit
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200/80"
                                : "bg-red-50 text-red-700 border border-red-200/80"
                                }`}
                        >
                            {totalDebit === totalKredit ? (
                                <>
                                    Balance <Check className="w-3.5 h-3.5 text-emerald-600" />
                                </>
                            ) : (
                                "Tidak Balance"
                            )}
                        </span>
                    </div>
                </div>
            )}

            {/* ── Tabel Jurnal Umum ── */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
                <div className="overflow-auto max-h-[calc(100vh-220px)]">
                    <DragDropContext onDragEnd={handleDragEnd} onDragStart={handleDragStart}>
                        <Droppable droppableId="journal-entries">
                            {(provided) => (
                                <table
                                    className="w-full border-collapse relative"
                                    style={{ minWidth: "760px" }}
                                    ref={provided.innerRef}
                                    {...provided.droppableProps}
                                >
                                    <thead className="sticky top-0 z-30 ring-1 ring-slate-100 shadow-2xs">
                                        <tr className="border-b border-slate-200/80 bg-slate-50/90 backdrop-blur-xs">
                                            <th className="px-2 sm:px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[95px] sm:w-[110px]">Tanggal</th>
                                            <th className="px-2 sm:px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Keterangan</th>
                                            <th className="px-2 sm:px-4 py-3 text-center text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[70px] sm:w-[80px]">
                                                <div ref={accountFilterRef} className="inline-block">
                                                    <button
                                                        ref={accountFilterButtonRef}
                                                        type="button"
                                                        onClick={openAccountFilterDropdown}
                                                        className={`inline-flex items-center gap-0.5 hover:text-gray-900 transition-colors ${accountCodeFilter.size > 0 ? "text-blue-600" : ""}`}
                                                    >
                                                        Ref
                                                        <ChevronDown className="w-3 h-3" />
                                                        {accountCodeFilter.size > 0 && (
                                                            <span className="ml-0.5 inline-flex items-center justify-center min-w-[14px] h-[14px] px-0.5 rounded-full bg-blue-600 text-white text-[9px] font-bold normal-case">
                                                                {accountCodeFilter.size}
                                                            </span>
                                                        )}
                                                    </button>

                                                    {showAccountFilter && filterDropdownPos && (
                                                        <div
                                                            className="fixed z-[90] w-72 bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden text-left normal-case"
                                                            style={{ top: filterDropdownPos.top, left: filterDropdownPos.left }}
                                                        >
                                                            <div className="p-2 border-b border-gray-100">
                                                                <div className="relative">
                                                                    <Search className="w-3.5 h-3.5 text-gray-300 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                                                    <input
                                                                        autoFocus
                                                                        value={accountFilterSearch}
                                                                        onChange={(e) => setAccountFilterSearch(e.target.value)}
                                                                        placeholder="Cari akun..."
                                                                        className="w-full h-8 border border-gray-200 rounded-lg pl-8 pr-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition"
                                                                    />
                                                                </div>
                                                            </div>

                                                            <div className="max-h-64 overflow-y-auto py-1">
                                                                {accountsForDropdown.length === 0 ? (
                                                                    <p className="px-3 py-4 text-xs text-gray-400 text-center">Akun tidak ditemukan</p>
                                                                ) : (
                                                                    ACCOUNT_TYPE_ORDER.map((type) => {
                                                                        const group = accountsForDropdown.filter((a) => a.type === type);
                                                                        if (group.length === 0) return null;
                                                                        return (
                                                                            <div key={type}>
                                                                                <p className="px-3 pt-2 pb-1 text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                                                                                    {ACCOUNT_TYPE_LABEL[type as keyof typeof ACCOUNT_TYPE_LABEL] ?? type}
                                                                                </p>
                                                                                {group.map((a) => {
                                                                                    const checked = accountCodeFilter.has(a.code);
                                                                                    return (
                                                                                        <label
                                                                                            key={a.code}
                                                                                            className={`flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-gray-50 ${checked ? "bg-blue-50/60" : ""}`}
                                                                                        >
                                                                                            <input
                                                                                                type="checkbox"
                                                                                                checked={checked}
                                                                                                onChange={() => toggleAccountCodeFilter(a.code)}
                                                                                                className="w-3.5 h-3.5 rounded border-gray-300 accent-[#1a1545] shrink-0"
                                                                                            />
                                                                                            <span className="font-mono font-bold text-gray-400 shrink-0">{a.code}</span>
                                                                                            <span className="text-gray-700 truncate">{a.name}</span>
                                                                                        </label>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        );
                                                                    })
                                                                )}
                                                            </div>

                                                            <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 bg-gray-50">
                                                                <button
                                                                    onClick={() => setAccountCodeFilter(new Set())}
                                                                    disabled={accountCodeFilter.size === 0}
                                                                    className="text-[11px] font-semibold text-gray-500 hover:text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                                                                >
                                                                    Hapus semua
                                                                </button>
                                                                <button
                                                                    onClick={() => setShowAccountFilter(false)}
                                                                    className="text-[11px] font-bold text-blue-600 hover:underline"
                                                                >
                                                                    Selesai
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </th>
                                            <th className="px-2 sm:px-4 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[120px] sm:w-[150px]">Debit</th>
                                            <th className="px-2 sm:px-4 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[120px] sm:w-[150px]">Kredit</th>
                                            <th className="px-2 sm:px-4 py-3 text-center text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[90px] sm:w-[110px]">Aksi</th>
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

                                        visibleEntries.map((entry, index) => (
                                            <JournalEntryRow
                                                key={entry.id}
                                                entry={entry}
                                                index={index}
                                                isSelected={selectedEntryIds.has(entry.id)}
                                                isDraggingGroup={isDraggingGroup}
                                                accountCodeFilter={accountCodeFilter}
                                                onToggleSelect={toggleEntrySelected}
                                                onEdit={setEditEntry}
                                                onLog={setLogEntry}
                                                onDelete={handleDelete}
                                                onToggleChecked={toggleEntryChecked}
                                                onUpdated={handleUpdated}
                                                onToggleWarningState={handleToggleWarningState}
                                                setToast={setToast}
                                            />
                                        ))
                                    )}
                                    {provided.placeholder}
                                </table>
                            )}
                        </Droppable>
                    </DragDropContext>
               </div>
            </div>

            {!loading && visibleEntries.length < filtered.length && (
                <div className="flex justify-center">
                    <button
                        onClick={() => setDisplayLimit((prev) => prev + 100)}
                        className="h-9 px-5 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 hover:text-slate-900 active:scale-[0.97] transition-all duration-150 shadow-xs"
                    >
                        Tampilkan 100 Lagi ({filtered.length - visibleEntries.length} tersisa)
                    </button>
                </div>
            )}

            {/* ── Modals ── */}
            {showManual && (
                <EntryFormModal
                    period={period}
                    onClose={() => setShowManual(false)}
                    onSaved={() => { setShowManual(false); setToast("Jurnal manual dibuat"); load(false); }}
                />
            )}
            {editEntry && (
                <EntryFormModal
                    period={period}
                    entry={editEntry}
                    onClose={() => setEditEntry(null)}
                    onSaved={() => { setEditEntry(null); setToast("Jurnal diperbarui"); load(false); }}
                />
            )}
            {logEntry && <AuditLogModal entry={logEntry} onClose={() => setLogEntry(null)} />}
            {showBulkMoveModal && (
                <BulkMoveModal
                    count={selectedEntryIds.size}
                    targetDate={targetMoveDate}
                    setTargetDate={setTargetMoveDate}
                    onClose={() => setShowBulkMoveModal(false)}
                    onConfirm={handleBulkMove}
                    busy={bulkBusy}
                />
            )}

            <style jsx global>{`
                @keyframes toastIn {
                    from { opacity: 0; transform: translate(-50%, 8px); }
                    to { opacity: 1; transform: translate(-50%, 0); }
                }
                .toast-in { animation: toastIn 0.25s ease-out backwards; }
                @media (prefers-reduced-motion: reduce) {
                    .toast-in { animation: none !important; }
                }
            `}</style>
        </div>
    );
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function Stat({ label, value, subvalue, tone }: { label: string; value: React.ReactNode; subvalue?: React.ReactNode; tone: "gray" | "blue" | "emerald" | "red" }) {
    const map = {
        gray: "border-gray-200 border-t-[#0f0c29]/70 text-gray-900",
        blue: "border-gray-200 border-t-blue-400 text-blue-800",
        emerald: "border-gray-200 border-t-emerald-400 text-emerald-800",
        red: "border-gray-200 border-t-red-400 text-red-700",
    };
    return (
        <div className={`bg-white rounded-xl border border-t-2 p-3.5 sm:p-4 ${map[tone]}`}>
            <p className="text-[10px] font-semibold uppercase tracking-wide opacity-50 mb-1">{label}</p>
            <p className="text-base font-black font-mono truncate">{value}</p>
            {subvalue && <p className="text-[10.5px] font-semibold text-gray-400 truncate mt-0.5">{subvalue}</p>}
        </div>
    );
}

// ─── Warning toggle — ikon warning + form alasan + riwayat (kolom Aksi) ───────
function WarningToggle({
    entry,
    onUpdated,
    onToggleWarningState,
    setToast,
}: {
    entry: JournalEntry;
    onUpdated: () => void;
    onToggleWarningState?: (entryId: string, hasWarning: boolean) => void;
    setToast: (msg: string) => void;
}) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const btnRef = useRef<HTMLButtonElement>(null);
    const [popPos, setPopPos] = useState<{ top: number; left: number } | null>(null);
    const [showPopover, setShowPopover] = useState(false);
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);

    const computePos = () => {
        const btn = btnRef.current;
        if (!btn) return;
        const rect = btn.getBoundingClientRect();
        setPopPos({ top: rect.bottom + 6, left: Math.max(8, rect.right - 256) });
    };

    useEffect(() => {
        if (!showPopover) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setShowPopover(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [showPopover]);

    const activate = async () => {
        if (!reason.trim() || busy) return;
        setBusy(true);
        // Optimistic update
        onToggleWarningState?.(entry.id, true);
        setShowPopover(false);
        try {
            const res = await fetch(`/api/akutansi/jurnal/${entry.id}/warning`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason: reason.trim() }),
            });
            const json = await res.json();
            if (!json.success) {
                // Revert if error
                onToggleWarningState?.(entry.id, false);
                setToast(json.message ?? "Gagal mengaktifkan warning");
                return;
            }
            setReason("");
            onUpdated();
        } catch {
            onToggleWarningState?.(entry.id, false);
            setToast("Koneksi bermasalah");
        } finally {
            setBusy(false);
        }
    };

    const deactivate = async (e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        if (busy) return;
        setBusy(true);
        // Optimistic update
        onToggleWarningState?.(entry.id, false);
        setShowPopover(false);
        try {
            const res = await fetch(`/api/akutansi/jurnal/${entry.id}/warning`, { method: "DELETE" });
            const json = await res.json();
            if (!json.success) {
                // Revert if error
                onToggleWarningState?.(entry.id, true);
                setToast(json.message ?? "Gagal menonaktifkan warning");
                return;
            }
            onUpdated();
        } catch {
            onToggleWarningState?.(entry.id, true);
            setToast("Koneksi bermasalah");
        } finally {
            setBusy(false);
        }
    };

    if (entry.has_warning) {
        return (
            <div ref={wrapperRef} className="inline-block">
                <button
                    ref={btnRef}
                    onClick={() => { computePos(); setShowPopover((v) => !v); }}
                    disabled={busy}
                    title="Klik untuk hapus atau tandai ulang penanda"
                    className={`p-1.5 rounded-lg border active:scale-90 transition-all duration-150 ${showPopover ? "bg-red-100 text-red-700 border-red-300" : "text-red-600 bg-red-50 border-red-200 hover:bg-red-100"
                        }`}
                >
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                </button>
                {showPopover && popPos && (
                    <div
                        className="fixed z-[95] w-72 bg-white border border-red-200 rounded-xl shadow-xl p-3 text-left"
                        style={{ top: popPos.top, left: popPos.left }}
                    >
                        <div className="flex justify-between items-center mb-2 pb-1.5 border-b border-gray-100">
                            <p className="text-[10.5px] font-bold text-red-700 uppercase tracking-wider flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5" /> Ditandai Bermasalah
                            </p>
                            <button
                                onClick={deactivate}
                                disabled={busy}
                                className="text-[10px] bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded-md font-bold shadow-2xs active:scale-95 transition-all"
                            >
                                Hapus Penanda
                            </button>
                        </div>

                        <div className="mb-3">
                            <p className="text-[10px] font-bold text-slate-500 mb-1">Tandai Ulang / Tambah Catatan Baru:</p>
                            <textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="Alasan / catatan baru..."
                                rows={2}
                                className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-red-400/30 focus:border-red-400 transition resize-none"
                            />
                            {reason.trim() && (
                                <button
                                    onClick={activate}
                                    disabled={busy}
                                    className="w-full mt-1.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold shadow-2xs"
                                >
                                    Simpan Catatan Baru
                                </button>
                            )}
                        </div>

                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Riwayat Penanda</p>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                            {!entry.warning_logs || entry.warning_logs.length === 0 ? (
                                <p className="text-[11px] text-gray-400">Belum ada riwayat.</p>
                            ) : (
                                [...entry.warning_logs].reverse().map((w) => (
                                    <div key={w.id} className="text-[11px] border-b border-gray-50 pb-1.5 last:border-0 last:pb-0">
                                        <p className={`font-bold ${w.action === "ACTIVATE" ? "text-red-700" : "text-gray-400"}`}>
                                            {w.action === "ACTIVATE" ? "Diaktifkan" : "Dinonaktifkan"} · {w.created_by_user?.name ?? "—"}
                                        </p>
                                        {w.reason && <p className="text-gray-600 mt-0.5">{w.reason}</p>}
                                        <p className="text-[9px] text-gray-300 mt-0.5">{fmtWaktu(w.created_at)}</p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div ref={wrapperRef} className="inline-block opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150">
            <button
                ref={btnRef}
                onClick={() => { computePos(); setShowPopover((v) => !v); }}
                title="Beri tanda penanda"
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 active:scale-90 transition-all duration-150"
            >
                <AlertTriangle className="w-4 h-4" />
            </button>
            {showPopover && popPos && (
                <div
                    className="fixed z-[95] w-64 bg-white border border-red-200 rounded-xl shadow-xl p-3"
                    style={{ top: popPos.top, left: popPos.left }}
                >
                    <p className="text-[10px] font-bold text-red-700 uppercase tracking-wider mb-1.5">Alasan Penanda</p>
                    <textarea
                        autoFocus
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Tulis alasan penanda..."
                        rows={2}
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-red-400/30 focus:border-red-400 transition resize-none"
                    />
                    <div className="flex gap-2 mt-2">
                        <button
                            onClick={() => { setShowPopover(false); setReason(""); }}
                            className="flex-1 h-7 text-[11px] font-semibold text-slate-400 hover:text-slate-600"
                        >
                            Batal
                        </button>
                        <button
                            onClick={activate}
                            disabled={busy || !reason.trim()}
                            className="flex-1 h-7 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold disabled:opacity-40 shadow-2xs"
                        >
                            Simpan
                        </button>
                    </div>
                </div>
            )}
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
    // Entry TRANSACTION yang modalnya belum diinput (trx_meta.modal_missing) cuma
    // menampilkan baris Modal Keluar (440) / HPP (130) sebagai baris SINTETIS Rp0 di
    // tabel utama (bukan data journal_lines asli). Supaya baris ini bisa diedit/dihapus
    // nominalnya lewat form, kita ikut sisipkan sebagai baris beneran saat form dibuka.
    const modalMissing =
        isEdit && entry!.source_type === "TRANSACTION" && entry!.trx_meta?.modal_missing === true;

    const [tanggal, setTanggal] = useState(entry?.tanggal ?? `${period}-01`);
    const [keterangan, setKeterangan] = useState(entry?.keterangan ?? "");
    const [ref, setRef] = useState(entry?.ref ?? "");
    const [template, setTemplate] = useState("CUSTOM");

    // Template custom buatan role accounting sendiri (beda dari MANUAL_TEMPLATES yang hardcode di lib/accounting.ts)
    const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([]);
    const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
    const [showSaveTemplateForm, setShowSaveTemplateForm] = useState(false);
    const [newTemplateName, setNewTemplateName] = useState("");
    const [savingTemplate, setSavingTemplate] = useState(false);

    const loadTemplates = useCallback(async () => {
        try {
            const res = await fetch("/api/akutansi/jurnal-templates");
            const json = await res.json();
            setCustomTemplates(json.success ? json.data ?? [] : []);
        } catch {
            setCustomTemplates([]);
        }
    }, []);
    useEffect(() => { loadTemplates(); }, [loadTemplates]);

    const [allAccounts, setAllAccounts] = useState<{ code: string; name: string; type: string }[]>(ACCOUNTS);
    useEffect(() => {
        fetch("/api/akutansi/accounts")
            .then((r) => r.json())
            .then((j) => { if (j.success) setAllAccounts(j.data); })
            .catch(() => { });
    }, []);

    const [lines, setLines] = useState<(DraftLine & { _id: string })[]>(() => {
        const baseLines = entry?.lines.map((l) => ({
            account_code: l.account_code,
            side: l.side,
            nominal: Number(l.nominal),
            keterangan: l.keterangan ?? "",
            _id: crypto.randomUUID(),
        })) ?? [
                { account_code: "110", side: "DEBIT", nominal: 0, keterangan: "", _id: crypto.randomUUID() },
                { account_code: "410", side: "KREDIT", nominal: 0, keterangan: "", _id: crypto.randomUUID() },
            ];

        if (!modalMissing) return baseLines;

        return [
            ...baseLines,
            {
                account_code: AKUN.MODAL_KELUAR,
                side: "DEBIT",
                nominal: 0,
                keterangan: "Harga modal belum diinput",
                _id: crypto.randomUUID(),
            },
            {
                account_code: AKUN.HPP,
                side: "KREDIT",
                nominal: 0,
                keterangan: "",
                _id: crypto.randomUUID(),
            },
        ];
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const applyTemplate = (key: string) => {
        setTemplate(key);
        setEditingTemplateId(null); // pilih template bawaan → keluar dari mode "sedang pakai template custom"
        const t = MANUAL_TEMPLATES.find((x) => x.key === key);
        if (!t || t.lines.length === 0) return;
        setLines(t.lines.map((l) => ({ ...l, nominal: 0, keterangan: "", _id: crypto.randomUUID() })));
    };

    // Terapkan template custom ke form. Beda dengan applyTemplate di atas, nominal &
    // keterangan per baris IKUT ke-copy (tidak direset ke 0) — karena template custom
    // sering dipakai untuk entri berulang dengan nominal sama (mis. sewa bulanan), dan
    // isinya memang yang diisi sendiri oleh role accounting.
    const applyCustomTemplate = (t: CustomTemplate) => {
        setTemplate("CUSTOM");
        setEditingTemplateId(t.id);
        setLines(t.lines.map((l) => ({ ...l, _id: crypto.randomUUID() })));
    };

    // Simpan baris jurnal yang sedang diisi sebagai template custom baru.
    const saveAsTemplate = async () => {
        if (!newTemplateName.trim()) return setError("Nama template wajib diisi");
        setSavingTemplate(true);
        setError("");
        try {
            const res = await fetch("/api/akutansi/jurnal-templates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: newTemplateName.trim(),
                    lines: lines.map(({ _id, ...rest }) => rest),
                }),
            });
            const json = await res.json();
            if (!json.success) { setError(json.message ?? "Gagal menyimpan template"); return; }
            setNewTemplateName("");
            setShowSaveTemplateForm(false);
            await loadTemplates();
        } catch {
            setError("Koneksi bermasalah saat menyimpan template");
        } finally {
            setSavingTemplate(false);
        }
    };

    // Timpa template yang sedang aktif dengan baris jurnal yang sekarang diisi di form.
    const updateTemplate = async () => {
        if (!editingTemplateId) return;
        setSavingTemplate(true);
        setError("");
        try {
            const res = await fetch(`/api/akutansi/jurnal-templates/${editingTemplateId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ lines: lines.map(({ _id, ...rest }) => rest) }),
            });
            const json = await res.json();
            if (!json.success) { setError(json.message ?? "Gagal memperbarui template"); return; }
            await loadTemplates();
        } catch {
            setError("Koneksi bermasalah saat memperbarui template");
        } finally {
            setSavingTemplate(false);
        }
    };

    // Hapus template custom. Tidak mempengaruhi jurnal yang sudah pernah dibuat dari template ini.
    const deleteTemplate = async (t: CustomTemplate) => {
        if (!confirm(`Hapus template "${t.name}"?`)) return;
        try {
            const res = await fetch(`/api/akutansi/jurnal-templates/${t.id}`, { method: "DELETE" });
            const json = await res.json();
            if (!json.success) { setError(json.message ?? "Gagal menghapus template"); return; }
            if (editingTemplateId === t.id) setEditingTemplateId(null);
            await loadTemplates();
        } catch {
            setError("Koneksi bermasalah saat menghapus template");
        }
    };

    const patch = (i: number, p: Partial<DraftLine>) =>
        setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...p } : l)));

    const handleLineDragEnd = (result: DropResult) => {
        if (!result.destination) return;
        const from = result.source.index;
        const to = result.destination.index;
        if (from === to) return;
        setLines((prev) => {
            const next = [...prev];
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            return next;
        });
    };

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
                    lines: lines.map(({ _id, ...rest }) => rest),
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
            <div className="relative bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-[#0f0c29] to-[#1a1545] shrink-0" />
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                    <div>
                        <h3 className="font-bold text-gray-900 text-sm">{isEdit ? "Edit Jurnal" : "Jurnal Manual"}</h3>
                        {isEdit && (
                            <p className="text-[11px] text-gray-400 mt-0.5">
                                Perubahan di sini <b>tidak</b> mengubah data transaksi/service/cashflow asli.
                            </p>
                        )}
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full text-gray-400 hover:bg-gray-100 active:scale-90 transition-all duration-150 flex items-center justify-center"><X className="w-4 h-4" /></button>
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
                                        className={`h-8 px-3 rounded-lg text-xs font-semibold border active:scale-[0.96] transition-all duration-150 ${template === t.key
                                            ? "bg-gradient-to-br from-[#0f0c29] to-[#1a1545] text-white border-transparent"
                                            : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                                            }`}
                                    >
                                        {t.label}
                                    </button>
                                ))}

                                {/* Template custom buatan role accounting sendiri */}
                                {customTemplates.map((t) => (
                                    <div
                                        key={t.id}
                                        className={`group relative h-8 rounded-lg border active:scale-[0.96] transition-all duration-150 flex items-stretch overflow-hidden ${editingTemplateId === t.id
                                            ? "bg-gradient-to-br from-[#0f0c29] to-[#1a1545] border-transparent"
                                            : "bg-white border-gray-200 hover:bg-gray-50"
                                            }`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => applyCustomTemplate(t)}
                                            title={t.created_by_user?.name ? `Dibuat oleh ${t.created_by_user.name}` : undefined}
                                            className={`px-3 text-xs font-semibold whitespace-nowrap ${editingTemplateId === t.id ? "text-white" : "text-gray-500"}`}
                                        >
                                            {t.name}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => deleteTemplate(t)}
                                            title="Hapus template"
                                            className={`px-1.5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity ${editingTemplateId === t.id ? "text-white/70 hover:text-white" : "text-gray-300 hover:text-red-500"}`}
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}

                                <button
                                    type="button"
                                    onClick={() => setShowSaveTemplateForm((v) => !v)}
                                    title="Simpan baris saat ini sebagai template baru"
                                    className="h-8 w-8 rounded-lg border border-dashed border-gray-300 text-gray-400 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 active:scale-[0.96] transition-all duration-150 flex items-center justify-center"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                </button>
                            </div>

                            {/* Form kecil: simpan baris jurnal saat ini sebagai template custom baru */}
                            {showSaveTemplateForm && (
                                <div className="mt-2 flex items-center gap-2">
                                    <input
                                        autoFocus
                                        value={newTemplateName}
                                        onChange={(e) => setNewTemplateName(e.target.value)}
                                        placeholder="Nama template baru (mis. Sewa Gudang Bulanan)"
                                        className="flex-1 h-9 border border-gray-200 rounded-lg px-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition"
                                    />
                                    <button
                                        type="button"
                                        onClick={saveAsTemplate}
                                        disabled={savingTemplate}
                                        className="h-9 px-3 rounded-lg bg-gradient-to-br from-[#0f0c29] to-[#1a1545] text-white text-xs font-bold hover:opacity-90 active:scale-95 transition-all duration-150 disabled:opacity-40 whitespace-nowrap"
                                    >
                                        {savingTemplate ? "Menyimpan..." : "Simpan Template"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setShowSaveTemplateForm(false); setNewTemplateName(""); }}
                                        className="h-9 px-2 text-xs font-semibold text-gray-400 hover:text-gray-600"
                                    >
                                        Batal
                                    </button>
                                </div>
                            )}

                            {/* Muncul kalau sedang pakai template custom — untuk update isi template itu sendiri */}
                            {editingTemplateId && (
                                <button
                                    type="button"
                                    onClick={updateTemplate}
                                    disabled={savingTemplate}
                                    className="mt-2 text-[11px] font-bold text-blue-600 hover:underline disabled:opacity-40"
                                >
                                    {savingTemplate ? "Memperbarui..." : "Update isi template ini dengan baris saat ini"}
                                </button>
                            )}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Tanggal</label>
                            <input
                                type="date"
                                value={tanggal}
                                onChange={(e) => setTanggal(e.target.value)}
                                className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Ref (opsional)</label>
                            <input
                                value={ref}
                                onChange={(e) => setRef(e.target.value)}
                                placeholder="No. bukti"
                                className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Keterangan</label>
                        <input
                            value={keterangan}
                            onChange={(e) => setKeterangan(e.target.value)}
                            placeholder="Tipe laptop - SN - Nama customer"
                            className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition"
                        />
                    </div>

                    {/* Baris debit/kredit */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="text-xs font-semibold text-gray-500">Baris Jurnal</label>
                            <button
                                onClick={() => setLines((p) => [...p, { account_code: "110", side: "DEBIT", nominal: 0, keterangan: "", _id: crypto.randomUUID() }])}
                                className="text-[11px] font-bold text-blue-600 hover:underline"
                            >
                                + Tambah baris
                            </button>
                        </div>

                        <DragDropContext onDragEnd={handleLineDragEnd}>
                            <Droppable droppableId="jurnal-manual-lines">
                                {(dropProvided) => (
                                    <div className="space-y-2.5" ref={dropProvided.innerRef} {...dropProvided.droppableProps}>
                                        {lines.map((l, i) => (
                                            <Draggable key={l._id} draggableId={l._id} index={i}>
                                                {(dragProvided, dragSnapshot) => (
                                                    <div
                                                        ref={dragProvided.innerRef}
                                                        {...dragProvided.draggableProps}
                                                        className={`p-2.5 rounded-lg border space-y-1.5 transition-colors ${dragSnapshot.isDragging
                                                            ? "border-blue-300 bg-white shadow-lg ring-2 ring-blue-200"
                                                            : "border-gray-100 bg-gray-50/50"
                                                            }`}
                                                    >
                                                        <div className="flex flex-wrap gap-2 items-center">
                                                            <div
                                                                {...dragProvided.dragHandleProps}
                                                                title="Tahan & geser untuk pindah urutan"
                                                                className="shrink-0 w-6 h-9 flex items-center justify-center rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 cursor-grab active:cursor-grabbing transition-colors"
                                                            >
                                                                <GripVertical className="w-4 h-4" />
                                                            </div>
                                                            <select
                                                                value={l.side}
                                                                onChange={(e) => patch(i, { side: e.target.value as JournalSide })}
                                                                className={`h-9 w-20 sm:w-24 shrink-0 border rounded-lg px-2 text-xs font-bold ${l.side === "DEBIT"
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
                                                                className="h-9 flex-1 min-w-[140px] border border-gray-200 rounded-lg px-2 text-xs bg-white"
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
                                                                className="h-9 w-28 sm:w-36 shrink-0 border border-gray-200 rounded-lg px-2 text-xs font-mono text-right"
                                                            />

                                                            <button
                                                                onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}
                                                                disabled={lines.length <= 2}
                                                                className="w-8 h-9 shrink-0 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 active:scale-90 transition-all duration-150 disabled:opacity-30 flex items-center justify-center"
                                                            >
                                                                <X className="w-4 h-4" />
                                                            </button>
                                                        </div>

                                                        <input
                                                            value={l.keterangan ?? ""}
                                                            onChange={(e) => patch(i, { keterangan: e.target.value })}
                                                            placeholder="Keterangan khusus baris ini (opsional)"
                                                            className="w-full h-8 border border-gray-200 rounded-lg px-2 text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition placeholder:text-gray-300"
                                                        />
                                                    </div>
                                                )}
                                            </Draggable>
                                        ))}
                                        {dropProvided.placeholder}
                                    </div>
                                )}
                            </Droppable>
                        </DragDropContext>
                    </div>

                    {/* Balance indicator */}
                    <div
                        className={`rounded-xl border p-3 flex flex-wrap items-center justify-between gap-2 ${balanced ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"
                            }`}
                    >
                        <span className={`text-xs font-bold inline-flex items-center gap-1 ${balanced ? "text-emerald-700" : "text-red-700"}`}>
                            {balanced ? <><Check className="w-3.5 h-3.5" /> Balance</> : <><X className="w-3.5 h-3.5" /> Tidak balance</>}
                        </span>
                        <span className="text-xs font-mono font-bold text-gray-700">
                            D {rp(debit)} &nbsp;·&nbsp; K {rp(kredit)}
                        </span>
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">{error}</div>
                    )}
                </div>

                <div className="px-5 py-4 border-t border-gray-100 flex gap-3 bg-gray-50 shrink-0">
                    <button onClick={onClose} className="flex-1 h-10 bg-white border border-gray-300 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 active:scale-[0.97] transition-all duration-150">
                        Batal
                    </button>
                    <button
                        onClick={submit}
                        disabled={saving || !balanced}
                        className="flex-1 h-10 bg-gradient-to-br from-[#0f0c29] to-[#1a1545] text-white rounded-xl text-sm font-bold hover:opacity-90 active:scale-[0.97] transition-all duration-150 disabled:opacity-40 disabled:active:scale-100"
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
        ACTIVATE: "Ditandai Bermasalah",
        DEACTIVATE: "Tanda Bermasalah Dicabut",
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl max-h-[80dvh] flex flex-col overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-[#0f0c29] to-[#1a1545] shrink-0" />
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                    <div>
                        <h3 className="font-bold text-gray-900 text-sm">Riwayat Perubahan</h3>
                        <p className="text-[11px] text-gray-400 truncate max-w-[280px]">{entry.keterangan}</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full text-gray-400 hover:bg-gray-100 active:scale-90 transition-all duration-150 flex items-center justify-center"><X className="w-4 h-4" /></button>
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
                                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
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
                                {l.action === "ACTIVATE" && l.reason && (
                                    <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-2 text-[10px]">
                                        <p className="text-red-700 font-bold mb-0.5">Alasan:</p>
                                        <p className="text-red-600/80">{l.reason}</p>
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

// ─── Bulk Move Modal ─────────────────────────────────────────────────────────
function BulkMoveModal({
    count,
    targetDate,
    setTargetDate,
    onClose,
    onConfirm,
    busy,
}: {
    count: number;
    targetDate: string;
    setTargetDate: (d: string) => void;
    onClose: () => void;
    onConfirm: () => void;
    busy: boolean;
}) {
    return (
        <div className="fixed inset-0 z-[95] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                            <Calendar className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-slate-900 leading-tight">Pindahkan Entry Jurnal</h3>
                            <p className="text-xs text-slate-500">{count} entry jurnal dipilih</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={busy}
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="space-y-3">
                    <label className="block">
                        <span className="text-xs font-bold text-slate-700 block mb-1">Tanggal Tujuan</span>
                        <input
                            type="date"
                            value={targetDate}
                            onChange={(e) => setTargetDate(e.target.value)}
                            className="w-full h-10 border border-slate-200 rounded-xl px-3 text-sm text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition"
                        />
                    </label>
                    <p className="text-[11.5px] text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-100 leading-relaxed">
                        Entry jurnal yang dipilih akan dipindahkan ke tanggal ini. Jika tanggal tujuan berada di periode (bulan) lain, entry akan otomatis disesuaikan ke periode tersebut.
                    </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        className="h-9 px-4 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                        Batal
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={busy || !targetDate}
                        className="h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs active:scale-95 transition-all disabled:opacity-40 flex items-center gap-1.5"
                    >
                        {busy ? "Memindahkan..." : `Pindahkan (${count} Jurnal)`}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Journal Entry Row (Memoized for 60 FPS performance) ────────────────────
interface JournalEntryRowProps {
    entry: JournalEntry;
    index: number;
    isSelected: boolean;
    isDraggingGroup: boolean;
    accountCodeFilter: Set<string>;
    onToggleSelect: (id: string) => void;
    onEdit: (entry: JournalEntry) => void;
    onLog: (entry: JournalEntry) => void;
    onDelete: (entry: JournalEntry) => void;
    onToggleChecked: (entry: JournalEntry, checked: boolean) => void;
    onUpdated: (showLoader?: boolean) => void;
    onToggleWarningState: (entryId: string, hasWarn: boolean) => void;
    setToast: (msg: string) => void;
}

const JournalEntryRow = React.memo(function JournalEntryRow({
    entry,
    index,
    isSelected,
    isDraggingGroup,
    accountCodeFilter,
    onToggleSelect,
    onEdit,
    onLog,
    onDelete,
    onToggleChecked,
    onUpdated,
    onToggleWarningState,
    setToast,
}: JournalEntryRowProps) {
    const badge = SOURCE_BADGE[entry.source_type];
    const companyBadge = entry.source_type === "TRANSACTION" ? getCompanyBadge(entry.trx_meta?.company_name) : null;
    const specParts = [entry.trx_meta?.cpu, entry.trx_meta?.ram, entry.trx_meta?.storage].filter(Boolean) as string[];
    const modalMissing = entry.source_type === "TRANSACTION" && entry.trx_meta?.modal_missing === true;

    const displayLines: JournalLine[] = useMemo(() => {
        if (!modalMissing) return entry.lines;
        return [
            ...entry.lines,
            {
                id: `${entry.id}-modal-keluar-missing`,
                account_code: AKUN.MODAL_KELUAR,
                account_name: accountName(AKUN.MODAL_KELUAR),
                side: "DEBIT",
                nominal: 0,
                keterangan: "Harga modal belum diinput",
                line_order: 999,
            },
            {
                id: `${entry.id}-hpp-missing`,
                account_code: AKUN.HPP,
                account_name: accountName(AKUN.HPP),
                side: "KREDIT",
                nominal: 0,
                keterangan: null,
                line_order: 1000,
            },
        ];
    }, [entry.lines, entry.id, modalMissing]);

    const linesToRender = useMemo(() => {
        if (accountCodeFilter.size === 0) return displayLines;
        return displayLines.filter((l) => accountCodeFilter.has(l.account_code));
    }, [displayLines, accountCodeFilter]);

    const validLinesForCheck = useMemo(
        () => entry.lines.filter((l) => !l.id.endsWith("-missing")),
        [entry.lines]
    );
    const isEntryChecked = useMemo(
        () => validLinesForCheck.length > 0 && validLinesForCheck.every((l) => l.checked),
        [validLinesForCheck]
    );

    return (
        <Draggable draggableId={entry.id} index={index}>
            {(provided, snapshot) => (
                <tbody
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    className={`group ${snapshot.isDragging
                        ? "bg-white shadow-lg z-50 relative ring-2 ring-blue-400"
                        : isDraggingGroup && isSelected
                            ? "opacity-50 ring-2 ring-blue-200"
                            : ""
                        }`}
                    style={provided.draggableProps.style}
                >
                    {linesToRender.map((line, i) => {
                        const first = i === 0;
                        const isKredit = line.side === "KREDIT";
                        return (
                            <tr
                                key={line.id}
                                onClick={(e) => {
                                    // Jangan toggle select kalau yang diklik tombol aksi, checkbox, atau elemen interaktif lain
                                    const target = e.target as HTMLElement;
                                    if (target.closest("button, input, a, select, textarea")) return;
                                    onToggleSelect(entry.id);
                                }}
                                className={`${first ? "border-t-2 border-gray-200" : ""} hover:bg-blue-50/30 cursor-pointer transition ${isSelected ? "bg-blue-50/50" : ""}`}
                            >
                                <td className="px-4 py-2 align-top">
                                    {first && (
                                        <span className="text-[11px] font-semibold text-gray-700 whitespace-nowrap flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => onToggleSelect(entry.id)}
                                                className="w-5 h-5 rounded border-gray-300 accent-[#1a1545] shrink-0 cursor-pointer"
                                                title="Pilih entry ini"
                                            />
                                            <div
                                                className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
                                                title="Tahan & geser dari sini (bukan dari checkbox)"
                                            >
                                                <GripVertical className="w-3 h-3" />
                                            </div>
                                            {fmtTgl(entry.tanggal)}
                                        </span>
                                    )}
                                </td>

                                <td className="px-4 py-2 align-top">
                                    {first && (
                                        <>
                                            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${badge.color}`}>
                                                    {badge.label}
                                                </span>
                                                {companyBadge && (
                                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${companyBadge.color}`}>
                                                        {companyBadge.label}
                                                    </span>
                                                )}
                                                {entry.is_edited && (
                                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 border border-orange-200">
                                                        diedit · {entry.updated_by_user?.name ?? "—"}
                                                    </span>
                                                )}
                                                {entry.has_warning && (
                                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-red-200 bg-red-50 text-red-600 inline-flex items-center gap-1 shrink-0">
                                                        <AlertTriangle className="w-2.5 h-2.5 text-red-600" /> Penanda
                                                    </span>
                                                )}
                                                {modalMissing && (
                                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700 inline-flex items-center gap-1 shrink-0" title="Harga modal belum diinput di transaksi ini">
                                                        <AlertTriangle className="w-2.5 h-2.5 text-amber-600" /> Modal Rp0
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-sm font-bold text-gray-900 mt-1 mb-0.5 leading-snug">
                                                {entry.keterangan}
                                            </div>
                                        </>
                                    )}
                                    {first && specParts.length > 0 && (
                                        <div className="text-[10px] text-gray-400 mb-1.5">{specParts.join(" · ")}</div>
                                    )}
                                    <div className={`text-[11px] ${isKredit ? "pl-10 text-emerald-800" : "pl-1 text-blue-800"} font-medium`}>
                                        {line.account_name}
                                    </div>
                                    {line.keterangan && (
                                        <div className={`text-[10px] italic text-gray-400 mt-0.5 ${isKredit ? "pl-10" : "pl-1"}`}>
                                            {line.keterangan}
                                        </div>
                                    )}
                                </td>

                                <td className="px-4 py-2 text-center align-bottom">
                                    <span
                                        className={`text-[10px] font-mono font-bold rounded px-1 py-0.5 ${accountCodeFilter.has(line.account_code)
                                            ? "bg-blue-50 text-blue-700"
                                            : "text-gray-400"
                                            }`}
                                    >
                                        {line.account_code}
                                    </span>
                                    {first && entry.ref && (
                                        <div className="text-[9px] text-gray-300 font-mono mt-0.5">{entry.ref}</div>
                                    )}
                                </td>

                                <td className="px-4 py-2 text-right align-bottom">
                                    {!isKredit && (
                                        <span className="text-[12px] font-bold text-gray-900 font-mono">
                                            {rp(line.nominal)}
                                        </span>
                                    )}
                                </td>

                                <td className="px-4 py-2 text-right align-bottom">
                                    {isKredit && (
                                        <span className="text-[12px] font-bold text-gray-900 font-mono">
                                            {rp(line.nominal)}
                                        </span>
                                    )}
                                </td>

                                <td className="px-4 py-2 align-top">
                                    {first && (
                                        <div className="flex items-center justify-center gap-1">
                                            <button
                                                onClick={() => onEdit(entry)}
                                                className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 active:scale-90 transition-all duration-150"
                                                title="Edit jurnal"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => onLog(entry)}
                                                className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 active:scale-90 transition-all duration-150"
                                                title="Riwayat perubahan"
                                            >
                                                <Clock className="w-4 h-4" />
                                            </button>
                                            <WarningToggle
                                                entry={entry}
                                                onUpdated={() => onUpdated(false)}
                                                onToggleWarningState={onToggleWarningState}
                                                setToast={setToast}
                                            />
                                            <button
                                                onClick={() => onDelete(entry)}
                                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 active:scale-90 transition-all duration-150"
                                                title="Hapus"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => onToggleChecked(entry, !isEntryChecked)}
                                                title={
                                                    isEntryChecked
                                                        ? "Sudah dicek (Klik untuk batalkan)"
                                                        : "Tandai sudah dicek"
                                                }
                                                className={`w-6 h-6 rounded-md border flex items-center justify-center text-[11px] font-black active:scale-90 transition-all duration-150 ${isEntryChecked
                                                    ? "bg-green-600 border-green-600 text-white shadow-2xs"
                                                    : "bg-white border-gray-300 text-gray-300 hover:border-gray-400 hover:text-gray-400"
                                                    }`}
                                            >
                                                <Check className="w-3.5 h-3.5 mx-auto" />
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
});