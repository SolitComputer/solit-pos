"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Search, X, Check, Ban, RotateCcw, Laptop as LaptopIcon, Wrench, Package, HandHelping } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { getAuthUser } from "@/hooks/useAuthUser";
import { UserRole, hasAnyRole, ITEM_LOAN_APPROVE_ROLES } from "@/lib/permissions";

interface SnResult {
    item_type: "LAPTOP" | "AKSESORIS";
    item_id: string; unit_id: string | null; serial_number: string | null; item_name: string; status: string;
}
interface LoanRow {
    id: string; item_type: "LAPTOP" | "AKSESORIS"; item_id: string;
    unit_id: string | null; serial_number: string | null; item_name: string;
    borrower_id: string; borrower_name: string; notes: string | null;
    status: "PENDING" | "APPROVED" | "REJECTED" | "RETURNED";
    approved_by_name: string | null; approved_at: string | null; returned_at: string | null; created_at: string;
}

const STATUS_META: Record<LoanRow["status"], { label: string; cls: string }> = {
    PENDING:  { label: "Menunggu",     cls: "bg-amber-50 text-amber-700 border-amber-200" },
    APPROVED: { label: "Dipinjam",     cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    REJECTED: { label: "Ditolak",      cls: "bg-rose-50 text-rose-600 border-rose-200" },
    RETURNED: { label: "Dikembalikan", cls: "bg-zinc-100 text-zinc-500 border-zinc-200" },
};

export default function ItemLoansPage() {
    const [userRoles, setUserRoles] = useState<UserRole[]>([]);
    const [userName, setUserName] = useState("");
    const canApprove = hasAnyRole(userRoles, ITEM_LOAN_APPROVE_ROLES);

    const [snQuery, setSnQuery] = useState("");
    const [snResults, setSnResults] = useState<SnResult[]>([]);
    const [snOpen, setSnOpen] = useState(false);
    const [selected, setSelected] = useState<SnResult | null>(null);
    const [notes, setNotes] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const boxRef = useRef<HTMLDivElement>(null);

    const [loans, setLoans] = useState<LoanRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<"PENDING" | "APPROVED" | "HISTORY">("PENDING");
    const [actingId, setActingId] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const u = await getAuthUser();
                const roles: string[] = Array.isArray((u as any)?.roles) && (u as any).roles.length > 0
                    ? (u as any).roles : u?.role ? [u.role] : [];
                setUserRoles(roles as UserRole[]);
                setUserName((u as any)?.name ?? "");
            } catch { setUserRoles([]); }
        })();
    }, []);

    const fetchLoans = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/item-loans");
            const json = await res.json();
            if (json.success) setLoans(json.data as LoanRow[]);
        } catch { /* ignore */ } finally { setLoading(false); }
    }, []);
    useEffect(() => { fetchLoans(); }, [fetchLoans]);

    useEffect(() => {
        if (searchTimer.current) clearTimeout(searchTimer.current);
        if (snQuery.trim().length < 2) { setSnResults([]); return; }
        searchTimer.current = setTimeout(async () => {
            try {
                const res = await fetch(`/api/item-loans/search-sn?q=${encodeURIComponent(snQuery.trim())}`);
                const json = await res.json();
                if (json.success) { setSnResults(json.data as SnResult[]); setSnOpen(true); }
            } catch { /* ignore */ }
        }, 300);
        return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
    }, [snQuery]);

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (boxRef.current && !boxRef.current.contains(e.target as Node)) setSnOpen(false);
        };
        document.addEventListener("mousedown", onClick);
        return () => document.removeEventListener("mousedown", onClick);
    }, []);

    const pickSn = (r: SnResult) => {
        setSelected(r);
        setSnQuery(r.serial_number ? `${r.item_name} — ${r.serial_number}` : r.item_name);
        setSnOpen(false);
    };
    const resetForm = () => { setSelected(null); setSnQuery(""); setNotes(""); setSnResults([]); };

    const submit = async () => {
        if (!selected) { toast.error("Pilih barang & SN dulu"); return; }
        setSubmitting(true);
        try {
            const res = await fetch("/api/item-loans", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    item_type: selected.item_type, item_id: selected.item_id, unit_id: selected.unit_id,
                    serial_number: selected.serial_number, item_name: selected.item_name, notes,
                }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.message || "Gagal mengajukan pinjaman");
            toast.success("Pengajuan pinjaman terkirim");
            resetForm(); fetchLoans();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Gagal mengajukan pinjaman");
        } finally { setSubmitting(false); }
    };

    const act = async (id: string, action: "approve" | "reject" | "return") => {
        setActingId(id);
        try {
            const res = await fetch(`/api/item-loans/${id}`, {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.message || "Gagal memproses");
            toast.success(action === "approve" ? "Pinjaman disetujui" : action === "reject" ? "Pinjaman ditolak" : "Barang dikembalikan");
            fetchLoans();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Gagal memproses");
        } finally { setActingId(null); }
    };

    const visibleLoans = loans.filter(l =>
        tab === "PENDING" ? l.status === "PENDING"
            : tab === "APPROVED" ? l.status === "APPROVED"
                : (l.status === "REJECTED" || l.status === "RETURNED")
    );

    return (
        <DashboardLayout>
            <main className="min-h-screen bg-zinc-50 p-3 sm:p-6 lg:p-8">
                <div className="max-w-5xl mx-auto space-y-4 sm:space-y-5">

                    <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
                        <div className="flex items-center gap-3 px-4 sm:px-6 py-4">
                            <div className="w-10 h-10 bg-gradient-to-br from-zinc-700 to-zinc-900 rounded-[10px] flex items-center justify-center flex-shrink-0 shadow-md shadow-zinc-900/25">
                                <HandHelping className="w-5 h-5 text-white" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h1 className="text-[15px] font-bold text-zinc-900 tracking-tight leading-tight truncate">Peminjaman Barang</h1>
                                <p className="text-[11.5px] text-zinc-400 mt-1 truncate">Ajukan pinjam barang inventaris, lalu disetujui Pengelola Barang</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-4 sm:p-5 space-y-3">
                        <h3 className="text-[13px] font-bold text-zinc-700">Ajukan Peminjaman Barang</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-1.5">Nama Peminjam</label>
                                <input disabled value={userName}
                                    className="w-full h-10 border border-zinc-200 rounded-xl px-3 text-sm bg-zinc-100 text-zinc-600 cursor-not-allowed" />
                            </div>
                            <div className="relative" ref={boxRef}>
                                <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-1.5">Nama Barang — SN</label>
                                <div className="relative">
                                    <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-3 pointer-events-none" />
                                    <input value={snQuery}
                                        onChange={e => { setSnQuery(e.target.value); setSelected(null); }}
                                        onFocus={() => snResults.length > 0 && setSnOpen(true)}
                                        placeholder="Ketik SN / nama barang..."
                                        className="w-full h-10 border border-zinc-200 rounded-xl pl-9 pr-8 text-sm bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/10" />
                                    {snQuery && (
                                        <button onClick={() => { setSnQuery(""); setSelected(null); setSnResults([]); }} className="absolute right-2.5 top-3 text-zinc-400 hover:text-zinc-600">
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                                {snOpen && snResults.length > 0 && (
                                    <div className="absolute z-30 mt-1.5 w-full bg-white border border-zinc-200 rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto">
                                        {snResults.map(r => (
                                            <button key={`${r.item_type}-${r.item_id}-${r.unit_id ?? "parent"}`} onClick={() => pickSn(r)}
                                                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-50 text-left">
                                                {r.item_type === "LAPTOP" ? <LaptopIcon size={13} className="text-zinc-500 flex-shrink-0" /> : <Wrench size={13} className="text-zinc-500 flex-shrink-0" />}
                                                <span className="text-xs text-zinc-700 truncate flex-1">{r.item_name}</span>
                                                {r.serial_number
                                                    ? <span className="text-[11px] font-mono text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded">{r.serial_number}</span>
                                                    : <span className="text-[10px] font-semibold text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded">tanpa SN</span>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div>
                            <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-1.5">Keterangan</label>
                            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
                                placeholder="Tujuan pinjam, estimasi dikembalikan, dll"
                                className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 resize-none" />
                        </div>
                        <div className="flex justify-end">
                            <button onClick={submit} disabled={submitting || !selected}
                                className="h-10 px-5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-zinc-800 to-zinc-900 hover:from-zinc-900 hover:to-black transition disabled:opacity-50 flex items-center gap-2">
                                {submitting && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                Ajukan Pinjaman
                            </button>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
                        <div className="flex gap-1.5 p-2 border-b border-zinc-100">
                            {([
                                { k: "PENDING", l: "Menunggu" },
                                { k: "APPROVED", l: "Sedang Dipinjam" },
                                { k: "HISTORY", l: "Riwayat" },
                            ] as const).map(t => (
                                <button key={t.k} onClick={() => setTab(t.k)}
                                    className={`px-3 h-9 rounded-xl text-xs font-semibold transition ${tab === t.k ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>
                                    {t.l}
                                </button>
                            ))}
                        </div>

                        {loading ? (
                            <p className="py-12 text-center text-sm text-zinc-400">Memuat data...</p>
                        ) : visibleLoans.length === 0 ? (
                            <div className="py-12 text-center">
                                <Package size={28} className="mx-auto text-zinc-300 mb-2" />
                                <p className="text-sm text-zinc-400">Belum ada data</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-zinc-50 border-b border-zinc-100">
                                            {["Peminjam", "Barang", "SN", "Keterangan", "Status", "Aksi"].map(h => (
                                                <th key={h} className="px-3 py-3 text-left text-[10px] font-bold text-zinc-400 uppercase tracking-widest whitespace-nowrap">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {visibleLoans.map(l => {
                                            const s = STATUS_META[l.status];
                                            return (
                                                <tr key={l.id} className="border-b border-zinc-50 hover:bg-zinc-50/60">
                                                    <td className="px-3 py-3 font-semibold text-zinc-800 whitespace-nowrap">{l.borrower_name}</td>
                                                    <td className="px-3 py-3 text-zinc-700">{l.item_name}</td>
                                                    <td className="px-3 py-3">
                                                        {l.serial_number ? <span className="font-mono text-[11px] text-zinc-600 bg-zinc-100 px-1.5 py-0.5 rounded">{l.serial_number}</span> : <span className="text-zinc-300">-</span>}
                                                    </td>
                                                    <td className="px-3 py-3 text-xs text-zinc-500 max-w-[200px] truncate" title={l.notes ?? ""}>{l.notes || <span className="text-zinc-300">-</span>}</td>
                                                    <td className="px-3 py-3">
                                                        <span className={`inline-flex px-2 py-0.5 rounded-lg text-[11px] font-bold border ${s.cls}`}>{s.label}</span>
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        {l.status === "PENDING" && canApprove ? (
                                                            <div className="flex items-center gap-1.5">
                                                                <button onClick={() => act(l.id, "approve")} disabled={actingId === l.id}
                                                                    className="h-7 px-2.5 rounded-lg text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition disabled:opacity-40 flex items-center gap-1">
                                                                    <Check size={12} /> Approve
                                                                </button>
                                                                <button onClick={() => act(l.id, "reject")} disabled={actingId === l.id}
                                                                    className="h-7 px-2.5 rounded-lg text-[11px] font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition disabled:opacity-40 flex items-center gap-1">
                                                                    <Ban size={12} /> Reject
                                                                </button>
                                                            </div>
                                                        ) : l.status === "APPROVED" && canApprove ? (
                                                            <button onClick={() => act(l.id, "return")} disabled={actingId === l.id}
                                                                className="h-7 px-2.5 rounded-lg text-[11px] font-semibold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 transition disabled:opacity-40 flex items-center gap-1">
                                                                <RotateCcw size={12} /> Kembalikan
                                                            </button>
                                                        ) : (
                                                            <span className="text-[11px] text-zinc-400">{l.approved_by_name ? `oleh ${l.approved_by_name}` : "-"}</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </DashboardLayout>
    );
}