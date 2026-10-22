"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { RotateCcw, Plus, X, Search, Package, Laptop as LaptopIcon, Wrench } from "lucide-react";
import { getAuthUser } from "@/hooks/useAuthUser";
import { UserRole, hasAnyRole, BARANG_FULL_ACCESS_ROLES } from "@/lib/permissions";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════
type ItemType = "LAPTOP" | "AKSESORIS";

interface ReturnRow {
    id: string;
    item_type: ItemType;
    serial_number: string;
    item_name: string | null;
    supplier: string;
    harga: number;
    tanggal: string;
    keterangan: string | null;
    is_restored: boolean;
    restored_at: string | null;
    created_at: string;
    created_by_user?: { id: string; name: string } | null;
    restored_by_user?: { id: string; name: string } | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════
const fmt = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");
const todayStr = () => {
    // Tanggal hari ini WIB (YYYY-MM-DD) untuk default input tanggal.
    const now = new Date();
    const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    return wib.toISOString().slice(0, 10);
};
const fmtTgl = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });

const EMPTY_FORM = {
    item_type: "LAPTOP" as ItemType,
    serial_number: "",
    supplier: "",
    harga: "",
    tanggal: todayStr(),
    keterangan: "",
};

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: Form Tambah Return
// ═══════════════════════════════════════════════════════════════════════════
function ReturnFormModal({
    form, onChange, onClose, onSubmit, saving,
}: {
    form: typeof EMPTY_FORM;
    onChange: (patch: Partial<typeof EMPTY_FORM>) => void;
    onClose: () => void;
    onSubmit: () => void;
    saving: boolean;
}) {
    const hargaNum = Number(form.harga) || 0;
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={() => !saving && onClose()} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[92vh] flex flex-col animate-popIn">
                <div className="h-1 w-full bg-gradient-to-r from-zinc-400 via-zinc-700 to-black flex-shrink-0" />
                <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between flex-shrink-0">
                    <div>
                        <h2 className="font-bold text-zinc-900 text-[15px]">Tambah Barang Return</h2>
                        <p className="text-[11px] text-zinc-400 mt-0.5">SN yang diretur akan mengurangi stok</p>
                    </div>
                    <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700">✕</button>
                </div>

                <div className="overflow-y-auto flex-1 px-5 py-5 space-y-3">
                    {/* Tipe barang */}
                    <div>
                        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Tipe Barang</label>
                        <div className="grid grid-cols-2 gap-2">
                            {(["LAPTOP", "AKSESORIS"] as ItemType[]).map((t) => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => onChange({ item_type: t })}
                                    className={`h-10 rounded-xl text-sm font-semibold border transition flex items-center justify-center gap-1.5 ${form.item_type === t
                                        ? "bg-zinc-900 text-white border-zinc-900"
                                        : "bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100"}`}
                                >
                                    {t === "LAPTOP" ? <LaptopIcon size={14} /> : <Wrench size={14} />}
                                    {t === "LAPTOP" ? "Laptop" : "Aksesoris"}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Nama Supplier */}
                    <div>
                        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Nama Supplier <span className="text-red-400">*</span></label>
                        <input
                            className={inputCls}
                            placeholder="Nama supplier tujuan retur"
                            value={form.supplier}
                            onChange={(e) => onChange({ supplier: e.target.value })}
                        />
                    </div>

                    {/* SN Barang */}
                    <div>
                        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">SN Barang <span className="text-red-400">*</span></label>
                        <input
                            className={inputCls}
                            placeholder="Serial number unit yang diretur"
                            value={form.serial_number}
                            onChange={(e) => onChange({ serial_number: e.target.value })}
                        />
                    </div>

                    {/* Harga */}
                    <div>
                        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Harga Return <span className="text-red-400">*</span></label>
                        <input
                            type="number"
                            inputMode="numeric"
                            className={inputCls}
                            placeholder="0"
                            value={form.harga}
                            onChange={(e) => onChange({ harga: e.target.value })}
                        />
                        {hargaNum > 0 && (
                            <p className="text-[11px] text-emerald-600 font-semibold mt-1">Total: {fmt(hargaNum)}</p>
                        )}
                    </div>

                    {/* Tanggal */}
                    <div>
                        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Tanggal <span className="text-red-400">*</span></label>
                        <input
                            type="date"
                            className={inputCls}
                            value={form.tanggal}
                            onChange={(e) => onChange({ tanggal: e.target.value })}
                        />
                    </div>

                    {/* Keterangan */}
                    <div>
                        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Keterangan</label>
                        <textarea
                            rows={2}
                            className={inputCls}
                            placeholder="Alasan retur, kondisi barang, dll (opsional)"
                            value={form.keterangan}
                            onChange={(e) => onChange({ keterangan: e.target.value })}
                        />
                    </div>
                </div>

                <div className="flex gap-3 px-5 py-4 border-t border-zinc-100 flex-shrink-0">
                    <button onClick={onClose} disabled={saving} className="flex-1 h-11 bg-zinc-100 text-zinc-600 rounded-xl text-sm font-semibold hover:bg-zinc-200 transition disabled:opacity-50">Batal</button>
                    <button onClick={onSubmit} disabled={saving} className="flex-1 h-11 bg-gradient-to-r from-zinc-800 to-zinc-900 text-white rounded-xl text-sm font-semibold hover:from-zinc-900 hover:to-black transition disabled:opacity-50 flex items-center justify-center gap-2">
                        {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                        {saving ? "Menyimpan..." : "Simpan Return"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: Konfirmasi Restore
// ═══════════════════════════════════════════════════════════════════════════
function RestoreConfirm({ row, onClose, onConfirm, loading }: {
    row: ReturnRow | null; onClose: () => void; onConfirm: () => void; loading: boolean;
}) {
    if (!row) return null;
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-popIn">
                <div className="h-1 w-full bg-gradient-to-r from-emerald-400 via-emerald-600 to-emerald-800" />
                <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-6 py-5">
                    <p className="font-bold text-white text-sm">Tarik Balik Return</p>
                    <p className="text-xs text-white/60 mt-0.5">Stok barang akan dikembalikan</p>
                </div>
                <div className="p-6">
                    <p className="text-sm text-zinc-600 text-center mb-4">
                        Tarik balik SN <span className="font-bold text-zinc-800">{row.serial_number}</span> dari return?
                        Status unit dipulihkan & jurnal balik dibuat.
                    </p>
                    <div className="flex gap-3">
                        <button onClick={onClose} disabled={loading} className="flex-1 h-11 bg-zinc-100 text-zinc-600 rounded-xl text-sm font-medium hover:bg-zinc-200 transition disabled:opacity-50">Batal</button>
                        <button onClick={onConfirm} disabled={loading} className="flex-1 h-11 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-50">
                            {loading ? "Memproses..." : "Tarik Balik"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════
export default function ReturnsContent() {
    const [rows, setRows] = useState<ReturnRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [userRoles, setUserRoles] = useState<UserRole[]>([]);
    const [search, setSearch] = useState("");
    const [showRestored, setShowRestored] = useState(false);

    const [formOpen, setFormOpen] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);

    const [restoreTarget, setRestoreTarget] = useState<ReturnRow | null>(null);
    const [restoring, setRestoring] = useState(false);

    const canManage = hasAnyRole(userRoles, BARANG_FULL_ACCESS_ROLES);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/item-returns?include_restored=${showRestored ? "1" : "0"}`);
            const json = await res.json();
            if (json.success) setRows(json.data as ReturnRow[]);
            else toast.error(json.message || "Gagal memuat data return");
        } catch {
            toast.error("Gagal memuat data return");
        } finally {
            setLoading(false);
        }
    }, [showRestored]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    useEffect(() => {
        (async () => {
            try {
                const u = await getAuthUser();
                const roles: string[] = Array.isArray((u as any)?.roles) && (u as any).roles.length > 0
                    ? (u as any).roles : u?.role ? [u.role] : [];
                setUserRoles(roles as UserRole[]);
            } catch { setUserRoles([]); }
        })();
    }, []);

    const openForm = () => { setForm({ ...EMPTY_FORM, tanggal: todayStr() }); setFormOpen(true); };

    const submitForm = async () => {
        if (!form.supplier.trim()) { toast.error("Nama supplier wajib diisi"); return; }
        if (!form.serial_number.trim()) { toast.error("SN barang wajib diisi"); return; }
        if (!(Number(form.harga) > 0)) { toast.error("Harga return wajib diisi"); return; }
        setSaving(true);
        try {
            const res = await fetch("/api/item-returns", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    item_type: form.item_type,
                    serial_number: form.serial_number.trim(),
                    supplier: form.supplier.trim(),
                    harga: Number(form.harga),
                    tanggal: form.tanggal,
                    keterangan: form.keterangan.trim() || null,
                }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.message || "Gagal menyimpan return");
            toast.success(`SN "${form.serial_number.trim()}" berhasil diretur — stok berkurang`);
            setFormOpen(false);
            fetchAll();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Gagal menyimpan return");
        } finally {
            setSaving(false);
        }
    };

    const confirmRestore = async () => {
        if (!restoreTarget) return;
        setRestoring(true);
        try {
            const res = await fetch(`/api/item-returns/${restoreTarget.id}/restore`, { method: "POST" });
            const json = await res.json();
            if (!json.success) throw new Error(json.message || "Gagal restore");
            toast.success("Return ditarik balik — stok dipulihkan");
            setRestoreTarget(null);
            fetchAll();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Gagal restore");
        } finally {
            setRestoring(false);
        }
    };

    const filtered = useMemo(() => {
        const t = search.trim().toLowerCase();
        if (!t) return rows;
        return rows.filter(r =>
            r.serial_number.toLowerCase().includes(t) ||
            (r.item_name || "").toLowerCase().includes(t) ||
            r.supplier.toLowerCase().includes(t)
        );
    }, [rows, search]);

    const totalHarga = useMemo(
        () => filtered.filter(r => !r.is_restored).reduce((s, r) => s + (r.harga || 0), 0),
        [filtered]
    );

    return (
        <>
            <style>{`
                @keyframes fadeIn { from{opacity:0} to{opacity:1} }
                @keyframes popIn  { from{opacity:0;transform:scale(0.94) translateY(8px)} to{opacity:1;transform:scale(1) translateY(0)} }
                .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
                .animate-popIn  { animation: popIn 0.25s cubic-bezier(0.34,1.56,0.64,1); }
            `}</style>

            <div className="space-y-4">
                {/* ── TOOLBAR ── */}
                <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-3 sm:p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                        <div className="relative flex-1">
                            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
                            <input
                                className="w-full h-9 pl-9 pr-8 border border-zinc-200 rounded-xl text-xs bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 transition"
                                placeholder="Cari SN, nama barang, supplier..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                            {search && (
                                <button onClick={() => setSearch("")} className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-600">
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                        <label className="flex items-center gap-2 h-9 px-3 rounded-xl bg-zinc-50 border border-zinc-200 text-xs font-medium text-zinc-600 cursor-pointer select-none">
                            <input type="checkbox" checked={showRestored} onChange={e => setShowRestored(e.target.checked)}
                                className="w-3.5 h-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900/20" />
                            Tampilkan yang sudah ditarik
                        </label>
                        {canManage && (
                            <button onClick={openForm}
                                className="h-9 px-4 rounded-xl text-xs sm:text-sm font-semibold text-white bg-gradient-to-r from-zinc-800 to-zinc-900 hover:from-zinc-900 hover:to-black transition whitespace-nowrap flex items-center gap-1.5">
                                <Plus size={15} /> Tambah Return
                            </button>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-3 mt-3 border-t border-zinc-100/80 text-xs">
                        <span className="text-[11px] font-medium text-zinc-400">Total aktif:</span>
                        <span className="font-bold text-zinc-800 bg-zinc-100 px-2 py-0.5 rounded-lg text-[11px]">{filtered.filter(r => !r.is_restored).length} SN</span>
                        <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg text-[11px]">{fmt(totalHarga)}</span>
                    </div>
                </div>

                {/* ── TABEL / DAFTAR ── */}
                {loading ? (
                    <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm py-16 text-center text-sm text-zinc-400">Memuat data...</div>
                ) : filtered.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm py-16 text-center px-4">
                        <div className="w-12 h-12 bg-zinc-50 text-zinc-400 rounded-full flex items-center justify-center mx-auto mb-3">
                            <Package className="w-6 h-6" />
                        </div>
                        <p className="text-zinc-700 font-bold text-base">Belum ada barang return</p>
                        <p className="text-zinc-400 text-sm mt-1">Klik "Tambah Return" untuk meretur SN ke supplier</p>
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
                        <div className="overflow-auto max-h-[70vh]">
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr className="whitespace-nowrap">
                                        {["No", "Tipe", "Nama Barang", "SN", "Supplier", "Harga", "Tanggal", "Keterangan", "Status", "Aksi"].map((h, hi) => (
                                            <th key={h} className={`px-3 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-left bg-zinc-50 border-b-2 border-zinc-100 sticky top-0 ${hi === 2 ? "left-0 z-20 min-w-[160px]" : "z-10"}`}>
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((row, idx) => {
                                        const zebra = idx % 2 === 1;
                                        const rowBg = zebra ? "bg-zinc-50" : "bg-white";
                                        return (
                                            <tr key={row.id} className={`border-b border-zinc-50 hover:bg-zinc-100 transition-colors ${rowBg} ${row.is_restored ? "opacity-50" : ""}`}>
                                                <td className="px-3 py-3 text-xs text-zinc-400 tabular-nums">{idx + 1}</td>
                                                <td className="px-3 py-3">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${row.item_type === "LAPTOP" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 border border-zinc-200"}`}>
                                                        {row.item_type === "LAPTOP" ? <LaptopIcon size={11} /> : <Wrench size={11} />}
                                                        {row.item_type === "LAPTOP" ? "Laptop" : "Aksesoris"}
                                                    </span>
                                                </td>
                                                <td className={`sticky left-0 z-[1] min-w-[160px] px-3 py-3 font-semibold text-zinc-800 max-w-[200px] truncate border-r border-zinc-100 ${rowBg}`} title={row.item_name || "—"}>{row.item_name || "—"}</td>
                                                <td className="px-3 py-3 text-xs text-zinc-600 font-mono">{row.serial_number}</td>
                                                <td className="px-3 py-3 text-xs text-zinc-600">{row.supplier}</td>
                                                <td className="px-3 py-3 text-xs font-bold text-zinc-800 whitespace-nowrap">{fmt(row.harga)}</td>
                                                <td className="px-3 py-3 text-xs text-zinc-500 whitespace-nowrap">{fmtTgl(row.tanggal)}</td>
                                                <td className="px-3 py-3 text-xs text-zinc-500 max-w-[160px] truncate" title={row.keterangan || ""}>{row.keterangan || <span className="text-zinc-300">-</span>}</td>
                                                <td className="px-3 py-3">
                                                    {row.is_restored ? (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-zinc-100 text-zinc-500 border border-zinc-200">Ditarik balik</span>
                                                    ) : (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-rose-50 text-rose-600 border border-rose-200">Diretur</span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-3">
                                                    {!row.is_restored && canManage && (
                                                        <button onClick={() => setRestoreTarget(row)}
                                                            className="h-7 px-2 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition">
                                                            <RotateCcw size={12} /> Tarik Balik
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div className="px-5 py-3 border-t border-zinc-100 bg-zinc-50/60 text-xs text-zinc-400">
                            <span className="text-zinc-700 font-bold">{filtered.length}</span> baris ditampilkan
                        </div>
                    </div>
                )}
            </div>

            {formOpen && (
                <ReturnFormModal
                    form={form}
                    onChange={(patch) => setForm(prev => ({ ...prev, ...patch }))}
                    onClose={() => setFormOpen(false)}
                    onSubmit={submitForm}
                    saving={saving}
                />
            )}

            <RestoreConfirm row={restoreTarget} onClose={() => setRestoreTarget(null)} onConfirm={confirmRestore} loading={restoring} />
        </>
    );
}

const inputCls = "w-full h-10 border border-zinc-200 rounded-xl px-3 text-sm bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400";