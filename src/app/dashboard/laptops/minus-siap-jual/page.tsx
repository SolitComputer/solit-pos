"use client";

import { useEffect, useState, useMemo } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
    Boxes, Plus, Pencil, Trash2, Search, X, ChevronDown, Package, PackagePlus, Tag,
    Laptop, Wallet, RefreshCw,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");

// Tema brand DISAMAKAN dengan halaman Barang Siap Jual (konsistensi UI).
const BRAND_GRADIENT = "bg-gradient-to-br from-[#1a1545] to-[#0f0c29]";
const BRAND_GRADIENT_H = "bg-gradient-to-r from-[#1a1545] to-[#0f0c29]";

const fieldBase =
    "h-10 w-full rounded-xl border border-gray-200 bg-gray-50/80 text-xs font-medium text-gray-700 " +
    "transition-all duration-200 focus:outline-none focus:border-violet-400 focus:bg-white " +
    "focus:ring-4 focus:ring-violet-400/10 hover:border-gray-300";

// ─── Types ────────────────────────────────────────────────────────────────────
interface MsjGroupItem {
    item_type: "LAPTOP" | "ACCESSORY";
    unit_id: string;
    serial_number: string;
    name: string;
    brand?: string;
    selling_price: number;
    status: string;
}
interface MsjGroup {
    id: string; name: string; status: "OPEN" | "SOLD";
    created_at: string; items: MsjGroupItem[]; item_count: number; total_selling: number;
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon, color, bg, bar, dark = false }: {
    label: string; value: React.ReactNode; icon: React.ReactNode; color: string; bg: string; bar: string; dark?: boolean;
}) {
    return (
        <div className={`${bg} rounded-2xl border ${dark ? "border-white/10" : "border-gray-100"} shadow-sm ring-1 ${dark ? "ring-white/5 shadow-lg shadow-[#1a1545]/25" : "ring-black/[0.02]"} hover:shadow-lg ${dark ? "" : "hover:ring-black/5"} transition-all duration-300 p-3 sm:p-5 relative overflow-hidden group hover:-translate-y-1`}>
            <div className={`absolute -top-8 -right-8 w-24 h-24 rounded-full ${dark ? "bg-white/[0.06]" : "bg-black/[0.015]"} blur-2xl`} />
            <div className={`absolute bottom-0 left-0 right-0 h-1 ${bar} opacity-60 group-hover:opacity-100 transition-opacity`} />
            <div className="relative flex items-start justify-between gap-1.5 sm:gap-3">
                <div className="min-w-0">
                    <p className={`text-[9px] sm:text-[10px] font-bold ${dark ? "text-white/60" : "text-gray-400"} uppercase tracking-wider leading-none mb-1.5 sm:mb-2.5 truncate`}>{label}</p>
                    <p className={`text-xl sm:text-3xl font-black tracking-tight leading-none tabular-nums ${color}`}>{value}</p>
                </div>
                <div className={`w-8 h-8 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl ${dark ? "bg-white/15 ring-1 ring-white/10" : bar} flex items-center justify-center flex-shrink-0 shadow-md opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all`}>
                    <span className="scale-75 sm:scale-100 flex items-center justify-center">{icon}</span>
                </div>
            </div>
        </div>
    );
}

// ─── AddGroupModal — Tambah / Edit kelompok ────────────────────────────────────
function AddGroupModal({ editing, onClose, onSaved }: {
    editing?: MsjGroup | null;        // null = mode TAMBAH, isi = mode EDIT
    onClose: () => void;
    onSaved: () => void;
}) {
    const isEdit = !!editing;
    const [name, setName] = useState(editing?.name ?? "");
    const [snSearch, setSnSearch] = useState("");
    const [results, setResults] = useState<MsjGroupItem[]>([]);
    const [searching, setSearching] = useState(false);
    const [picked, setPicked] = useState<MsjGroupItem[]>(editing?.items ?? []);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const originalIds = useMemo(() => new Set((editing?.items ?? []).map(i => i.unit_id)), [editing]);

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving) onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose, saving]);

    const doSearch = async (q: string) => {
        if (q.trim().length < 2) { setResults([]); return; }
        setSearching(true);
        try {
            const res = await fetch(`/api/msj-groups/search-sn?q=${encodeURIComponent(q.trim())}`);
            const json = await res.json();
            const pickedIds = new Set(picked.map(p => p.unit_id));
            setResults((json.data ?? []).filter((r: MsjGroupItem) => !pickedIds.has(r.unit_id)));
        } catch { setResults([]); }
        finally { setSearching(false); }
    };

    const addItem = (it: MsjGroupItem) => {
        setPicked(prev => [...prev, it]);
        setResults(prev => prev.filter(r => r.unit_id !== it.unit_id));
        setSnSearch("");
    };
    const removeItem = (unitId: string) => setPicked(prev => prev.filter(p => p.unit_id !== unitId));

    const totalJual = picked.reduce((s, p) => s + (p.selling_price || 0), 0);

    const handleSave = async () => {
        if (!name.trim()) { setError("Nama kelompok wajib diisi"); return; }
        if (picked.length === 0) { setError("Pilih minimal 1 SN"); return; }
        setSaving(true); setError("");
        try {
            if (isEdit) {
                const add = picked.filter(p => !originalIds.has(p.unit_id)).map(p => ({ item_type: p.item_type, unit_id: p.unit_id }));
                const remove = (editing!.items ?? []).filter(o => !picked.some(p => p.unit_id === o.unit_id)).map(o => ({ item_type: o.item_type, unit_id: o.unit_id }));
                const res = await fetch(`/api/msj-groups/${editing!.id}`, {
                    method: "PATCH", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: name.trim(), add, remove }),
                });
                const json = await res.json();
                if (!res.ok || !json.success) throw new Error(json.error || "Gagal menyimpan perubahan");
            } else {
                const res = await fetch("/api/msj-groups", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: name.trim(), items: picked.map(p => ({ item_type: p.item_type, unit_id: p.unit_id })) }),
                });
                const json = await res.json();
                if (!res.ok || !json.success) throw new Error(json.error || "Gagal membuat kelompok");
            }
            onSaved();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Terjadi kesalahan");
        } finally { setSaving(false); }
    };

    const TypeChip = ({ type }: { type: "LAPTOP" | "ACCESSORY" }) => (
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border tracking-wide ${type === "LAPTOP" ? "bg-zinc-100 text-zinc-600 border-zinc-200" : "bg-blue-50 text-blue-600 border-blue-200"}`}>
            {type === "LAPTOP" ? "LAPTOP" : "AKSESORIS"}
        </span>
    );

    return (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center animate-fadeIn">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !saving && onClose()} />
            <div className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl ring-1 ring-black/5 flex flex-col max-h-[92dvh] overflow-hidden animate-slideUp">
                {/* Header */}
                <div className={`${BRAND_GRADIENT} px-5 py-5 flex-shrink-0`}>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-white/15 ring-1 ring-white/10 flex items-center justify-center flex-shrink-0">
                            <PackagePlus size={18} className="text-white" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="font-bold text-white text-[15px] leading-tight">{isEdit ? "Edit Kelompok" : "Tambah Kelompok"}</h3>
                            <p className="text-[11px] text-white/60 mt-0.5">Bundel SN Minus Siap Jual untuk dijual borongan</p>
                        </div>
                        <button onClick={() => !saving && onClose()} className="ml-auto w-8 h-8 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/15 transition flex-shrink-0">
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="overflow-y-auto flex-1 px-5 py-5 space-y-5">
                    {/* Nama */}
                    <div>
                        <label className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                            <Tag size={12} /> Nama Kelompok <span className="text-red-400">*</span>
                        </label>
                        <input value={name} onChange={e => setName(e.target.value)} placeholder="Contoh: KELOMPOK HDD-256GB" className={fieldBase + " px-3.5"} autoFocus />
                    </div>

                    {/* Cari SN */}
                    <div>
                        <label className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                            <Search size={12} /> Cari SN (Minus Siap Jual)
                        </label>
                        <div className="relative">
                            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                            <input value={snSearch} onChange={e => { setSnSearch(e.target.value); doSearch(e.target.value); }} placeholder="Ketik SN barang..." className={fieldBase + " pl-10 pr-9 font-mono"} />
                            {searching && <div className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-violet-200 border-t-violet-500 rounded-full animate-spin" />}
                        </div>
                        {results.length > 0 && (
                            <div className="mt-1.5 border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white divide-y divide-gray-100">
                                {results.map(r => (
                                    <button key={r.unit_id} type="button" onClick={() => addItem(r)} className="w-full px-3 py-2.5 text-left hover:bg-violet-50/50 transition flex items-center gap-2.5">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${r.item_type === "LAPTOP" ? "bg-zinc-100 text-zinc-500" : "bg-blue-50 text-blue-500"}`}>
                                            {r.item_type === "LAPTOP" ? <Laptop size={14} /> : <Package size={14} />}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-mono text-sm font-semibold text-gray-800 truncate">{r.serial_number}</span>
                                                <TypeChip type={r.item_type} />
                                            </div>
                                            <p className="text-[11px] text-gray-500 mt-0.5 truncate">{r.name}{r.selling_price ? ` · ${fmt(r.selling_price)}` : ""}</p>
                                        </div>
                                        <Plus size={16} className="text-violet-400 flex-shrink-0" />
                                    </button>
                                ))}
                            </div>
                        )}
                        {snSearch.trim().length >= 2 && results.length === 0 && !searching && (
                            <p className="text-xs text-gray-400 mt-2 px-1">SN tidak ditemukan / sudah dikelompokkan / bukan Minus Siap Jual</p>
                        )}
                    </div>

                    {/* Barang terpilih */}
                    {picked.length > 0 && (
                        <div className="space-y-2.5">
                            <div className="flex items-center justify-between">
                                <label className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                    Barang Terpilih
                                    <span className="w-5 h-5 rounded-full bg-[#1a1545] text-white text-[10px] font-bold flex items-center justify-center">{picked.length}</span>
                                </label>
                                <span className="text-sm font-black text-amber-600 tabular-nums">{fmt(totalJual)}</span>
                            </div>
                            <div className="space-y-1.5">
                                {picked.map((p, i) => (
                                    <div key={p.unit_id} className="flex items-center gap-2.5 bg-gray-50 rounded-xl border border-gray-200 px-3 py-2.5">
                                        <span className="w-5 h-5 rounded-full bg-gradient-to-br from-[#1a1545] to-[#0f0c29] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-mono text-xs font-semibold text-gray-800 truncate">{p.serial_number}</span>
                                                <TypeChip type={p.item_type} />
                                            </div>
                                            <p className="text-[10px] text-gray-500 mt-0.5 truncate">{p.name}</p>
                                        </div>
                                        <span className="text-xs font-bold text-gray-700 tabular-nums flex-shrink-0">{fmt(p.selling_price)}</span>
                                        <button onClick={() => removeItem(p.unit_id)} className="w-7 h-7 flex items-center justify-center rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition flex-shrink-0">
                                            <X size={15} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {error && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5"><p className="text-xs text-red-700">{error}</p></div>}
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0 bg-white">
                    <button onClick={onClose} disabled={saving} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition disabled:opacity-50">Batal</button>
                    <button onClick={handleSave} disabled={saving || !name.trim() || picked.length === 0}
                        className={`flex-1 h-11 ${BRAND_GRADIENT_H} text-white rounded-xl text-sm font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-[#1a1545]/25`}>
                        {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                        {isEdit ? "Simpan Perubahan" : "Simpan Kelompok"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function MinusSiapJualContent() {
    const [groups, setGroups] = useState<MsjGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [editingGroup, setEditingGroup] = useState<MsjGroup | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const [search, setSearch] = useState("");

    const fetchGroups = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/msj-groups?status=OPEN");
            const json = await res.json();
            if (json.success) setGroups(json.data ?? []);
        } catch { setGroups([]); }
        finally { setLoading(false); }
    };
    useEffect(() => { fetchGroups(); }, []);

    const deleteGroup = async (g: MsjGroup) => {
        if (!confirm(`Hapus kelompok "${g.name}"? Barang di dalamnya akan dilepas & kembali ke Data Barang.`)) return;
        setDeletingId(g.id);
        try {
            const res = await fetch(`/api/msj-groups/${g.id}`, { method: "DELETE" });
            const json = await res.json();
            if (json.success) setGroups(prev => prev.filter(x => x.id !== g.id));
        } catch { /* ignore */ }
        finally { setDeletingId(null); }
    };

    // Cari: cocokkan nama kelompok ATAU SN/nama barang di dalamnya.
    const filteredGroups = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return groups;
        return groups.filter(g =>
            g.name.toLowerCase().includes(q) ||
            g.items.some(it => it.serial_number.toLowerCase().includes(q) || it.name.toLowerCase().includes(q))
        );
    }, [groups, search]);

    const totalBarang = groups.reduce((s, g) => s + (g.item_count || 0), 0);
    const totalNilai = groups.reduce((s, g) => s + (g.total_selling || 0), 0);

    return (
        <>
            <style>{`
                @keyframes fadeIn  { from { opacity:0; transform:scale(0.95) }  to { opacity:1; transform:scale(1) } }
                @keyframes slideIn { from { opacity:0; transform:translateX(-24px) } to { opacity:1; transform:translateX(0) } }
                @keyframes fadeUp  { from { opacity:0; transform:translateY(12px) }  to { opacity:1; transform:translateY(0) } }
                @keyframes slideUp { from { opacity:0; transform:translateY(100%) }  to { opacity:1; transform:translateY(0) } }
                .animate-fadeIn  { animation: fadeIn  0.25s ease-out; }
                .animate-slideIn { animation: slideIn 0.35s ease-out; }
                .animate-fadeUp  { animation: fadeUp  0.35s ease-out; }
                .animate-slideUp { animation: slideUp 0.3s  ease-out; }
            `}</style>

            <main className="min-h-screen bg-gradient-to-b from-[#F7F7F8] via-[#F7F7F8] to-[#ECECF0] p-3 sm:p-6 lg:p-8">
                <div className="max-w-full mx-auto space-y-3 sm:space-y-5 lg:space-y-6">

                    {/* ── Header ── */}
                    <div className="flex items-center justify-between gap-2 sm:gap-3 animate-slideIn">
                        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                            <div className={`w-1.5 h-9 sm:h-10 rounded-full ${BRAND_GRADIENT} flex-shrink-0`} />
                            <div className={`w-9 h-9 sm:w-11 sm:h-11 ${BRAND_GRADIENT} rounded-2xl flex items-center justify-center shadow-lg shadow-[#1a1545]/25 flex-shrink-0`}>
                                <Boxes size={18} className="text-white" />
                            </div>
                            <div className="min-w-0">
                                <h1 className="text-lg sm:text-2xl font-black text-gray-900 tracking-tight truncate">Minus Siap Jual</h1>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    {!loading && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />}
                                    <p className="text-[11px] sm:text-xs text-gray-400 font-medium truncate">
                                        {loading ? "Memuat data..." : `${groups.length} kelompok · ${totalBarang} barang`}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                            <button onClick={fetchGroups}
                                className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 border border-gray-200 bg-white hover:bg-gray-50 shadow-sm h-9 px-2.5 sm:px-3.5 rounded-xl transition-all active:scale-[0.97] group">
                                <RefreshCw size={14} className={loading ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"} />
                                <span className="hidden sm:inline">Refresh</span>
                            </button>
                            <button onClick={() => setShowAdd(true)}
                                className={`h-9 px-3.5 ${BRAND_GRADIENT_H} text-white rounded-xl text-xs font-semibold hover:opacity-90 transition active:scale-[0.97] flex items-center gap-1.5 shadow-md shadow-[#1a1545]/20`}>
                                <Plus size={15} /> <span className="hidden sm:inline">Tambah Kelompok</span><span className="sm:hidden">Tambah</span>
                            </button>
                        </div>
                    </div>

                    {/* ── Stat Cards ── */}
                    <div className="grid grid-cols-3 gap-2 sm:gap-3 animate-fadeUp">
                        <StatCard dark label="Total Kelompok" value={groups.length} icon={<Boxes size={18} className="text-white" />} color="text-white" bg={BRAND_GRADIENT} bar="bg-white/25" />
                        <StatCard label="Total Barang" value={totalBarang} icon={<Package size={18} className="text-white" />} color="text-indigo-600" bg="bg-indigo-50" bar="bg-indigo-500" />
                        <StatCard label="Total Nilai" value={<span className="text-base sm:text-2xl">{fmt(totalNilai)}</span>} icon={<Wallet size={18} className="text-white" />} color="text-amber-600" bg="bg-amber-50" bar="bg-amber-500" />
                    </div>

                    {/* ── Search ── */}
                    <div className="relative animate-fadeUp">
                        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Cari nama kelompok atau SN di dalamnya..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full h-11 pl-10 pr-10 rounded-2xl border border-gray-200 bg-white shadow-sm ring-1 ring-black/[0.02] text-sm text-gray-700 focus:outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-400/10 transition"
                        />
                        {search && (
                            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                <X size={16} />
                            </button>
                        )}
                    </div>

                    {/* ── Daftar Kelompok ── */}
                    {loading ? (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm ring-1 ring-black/[0.02] py-16 text-center text-sm text-gray-400">Memuat kelompok...</div>
                    ) : groups.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm ring-1 ring-black/[0.02] flex flex-col items-center justify-center py-16 sm:py-20 gap-3">
                            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gray-100 flex items-center justify-center">
                                <Boxes size={32} className="text-gray-300" />
                            </div>
                            <div className="text-center px-4">
                                <p className="text-gray-700 font-bold text-base">Belum ada kelompok</p>
                                <p className="text-gray-400 text-sm mt-1">Klik "Tambah Kelompok" untuk membuat bundel barang Minus Siap Jual pertama</p>
                            </div>
                            <button onClick={() => setShowAdd(true)}
                                className={`mt-1 h-10 px-4 ${BRAND_GRADIENT_H} text-white rounded-xl text-xs font-semibold hover:opacity-90 transition active:scale-[0.97] flex items-center gap-1.5 shadow-md shadow-[#1a1545]/20`}>
                                <Plus size={15} /> Tambah Kelompok
                            </button>
                        </div>
                    ) : filteredGroups.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm ring-1 ring-black/[0.02] flex flex-col items-center justify-center py-14 gap-2.5">
                            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
                                <Search size={24} className="text-gray-300" />
                            </div>
                            <p className="text-gray-600 font-bold text-sm">Kelompok tidak ditemukan</p>
                            <button onClick={() => setSearch("")} className="h-9 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold transition active:scale-[0.97]">Reset Pencarian</button>
                        </div>
                    ) : (
                        <div className="space-y-2.5 animate-fadeUp">
                            {filteredGroups.map(g => {
                                const open = expandedId === g.id;
                                const isSold = g.status === "SOLD";
                                return (
                                    <div key={g.id} className="group relative bg-white rounded-2xl border border-gray-200 shadow-sm ring-1 ring-black/[0.02] overflow-hidden hover:border-[#1a1545]/25 hover:shadow-md transition-all">
                                        <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${BRAND_GRADIENT}`} />
                                        <div className="flex items-center justify-between gap-2 pl-5 pr-3 sm:pr-4 py-3.5 bg-gray-50/40">
                                            <button onClick={() => setExpandedId(open ? null : g.id)} className="flex items-center gap-3 min-w-0 flex-1 text-left">
                                                <ChevronDown size={18} className={`text-gray-400 transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`} />
                                                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center flex-shrink-0">
                                                    <Boxes size={18} className="text-amber-600" />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-sm sm:text-[15px] font-bold text-gray-800 truncate">{g.name}</p>
                                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border tracking-wide flex-shrink-0 ${isSold ? "bg-gray-100 text-gray-500 border-gray-200" : "bg-emerald-50 text-emerald-600 border-emerald-200"}`}>
                                                            {isSold ? "TERJUAL" : "AKTIF"}
                                                        </span>
                                                    </div>
                                                    <p className="text-[11px] text-gray-400 mt-0.5">
                                                        <span className="font-semibold text-gray-600">{g.item_count} barang</span> · <span className="font-bold text-amber-600">{fmt(g.total_selling)}</span>
                                                    </p>
                                                </div>
                                            </button>
                                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                                <button onClick={() => setEditingGroup(g)} title="Edit kelompok"
                                                    className="h-8 px-2.5 inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-600 bg-zinc-100 rounded-lg hover:bg-zinc-200 transition">
                                                    <Pencil size={12} /> <span className="hidden sm:inline">Edit</span>
                                                </button>
                                                <button onClick={() => deleteGroup(g)} disabled={deletingId === g.id} title="Hapus kelompok"
                                                    className="h-8 px-2.5 inline-flex items-center gap-1 text-[11px] font-semibold text-red-500 bg-red-50 rounded-lg hover:bg-red-100 transition disabled:opacity-40">
                                                    {deletingId === g.id ? <div className="w-3 h-3 border-2 border-red-200 border-t-red-500 rounded-full animate-spin" /> : <><Trash2 size={12} /> <span className="hidden sm:inline">Hapus</span></>}
                                                </button>
                                            </div>
                                        </div>
                                        {open && (
                                            <div className="divide-y divide-gray-100">
                                                {g.items.map((it, i) => (
                                                    <div key={it.unit_id} className="flex items-center gap-2.5 pl-5 pr-4 py-2.5">
                                                        <span className="text-[10px] font-bold text-gray-400 w-4 flex-shrink-0 text-center">{i + 1}</span>
                                                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${it.item_type === "LAPTOP" ? "bg-zinc-100 text-zinc-500" : "bg-blue-50 text-blue-500"}`}>
                                                            {it.item_type === "LAPTOP" ? <Laptop size={12} /> : <Package size={12} />}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="font-mono text-xs font-semibold text-gray-800 truncate">{it.serial_number}</span>
                                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border tracking-wide flex-shrink-0 ${it.item_type === "LAPTOP" ? "bg-zinc-100 text-zinc-600 border-zinc-200" : "bg-blue-50 text-blue-600 border-blue-200"}`}>
                                                                    {it.item_type === "LAPTOP" ? "LAPTOP" : "AKSESORIS"}
                                                                </span>
                                                            </div>
                                                            <p className="text-[10px] text-gray-500 mt-0.5 truncate">{it.name}</p>
                                                        </div>
                                                        <span className="text-xs font-semibold text-gray-700 tabular-nums flex-shrink-0">{fmt(it.selling_price)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            <p className="text-center text-xs text-gray-400 pt-1">
                                <span className="text-gray-700 font-bold">{filteredGroups.length}</span> dari {groups.length} kelompok ditampilkan
                            </p>
                        </div>
                    )}
                </div>
            </main>

            {showAdd && <AddGroupModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); fetchGroups(); }} />}
            {editingGroup && <AddGroupModal editing={editingGroup} onClose={() => setEditingGroup(null)} onSaved={() => { setEditingGroup(null); fetchGroups(); }} />}
        </>
    );
}

export default function MinusSiapJualPage() {
    return (
        <DashboardLayout>
            <MinusSiapJualContent />
        </DashboardLayout>
    );
}