"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import * as XLSX from "xlsx";

// ─── Types ──────────────────────────────────────────────────────────────────
interface AccessoryUnit {
    id: string;
    accessory_id: string;
    serial_number: string;
    condition: "BARU" | "BEKAS";
    status: "TERSEDIA" | "TERJUAL" | "RESERVED";
    buy_price: number;
    selling_price: number;
    notes: string | null;
    created_at: string;
}

interface Accessory {
    id: string;
    name: string;
    category: string;
    brand: string | null;
    spec: string | null;
    sell_price: number;
    notes: string | null;
    created_at: string;
    accessory_units: AccessoryUnit[];
    stock_tersedia: number;
    stock_total: number;
}

type AccessoryForm = {
    name: string;
    category: string;
    brand: string;
    spec: string;
    sell_price: number;
    notes: string;
};

type UnitForm = {
    serial_number: string;
    condition: "BARU" | "BEKAS";
    buy_price: number;
    selling_price: number;
    notes: string;
};

const EMPTY_ACC_FORM: AccessoryForm = {
    name: "", category: "", brand: "", spec: "", sell_price: 0, notes: "",
};

const EMPTY_UNIT_FORM: UnitForm = {
    serial_number: "", condition: "BARU", buy_price: 0, selling_price: 0, notes: "",
};

const CATEGORIES = [
    "HDD", "SSD", "RAM", "CHARGER", "BATERAI",
    "KEYBOARD", "LCD", "CASING", "MOTHERBOARD",
    "PROCESSOR", "VGA", "FAN", "THERMAL PASTE",
    "KABEL", "LAINNYA",
];

const CATEGORY_EMOJI: Record<string, string> = {
    HDD: "💽", SSD: "💾", RAM: "🧠", CHARGER: "🔌", BATERAI: "🔋",
    KEYBOARD: "⌨️", LCD: "🖥️", CASING: "📦", MOTHERBOARD: "🔲",
    PROCESSOR: "🧩", VGA: "🎮", FAN: "🌀", "THERMAL PASTE": "🧴",
    KABEL: "🔗", LAINNYA: "🧰",
};

// ─── Helpers ────────────────────────────────────────────────────────────────
function formatRupiah(val: number): string {
    return new Intl.NumberFormat("id-ID", {
        style: "currency", currency: "IDR", maximumFractionDigits: 0,
    }).format(val || 0);
}
function parseRupiah(val: string): number {
    return parseInt(val.replace(/\D/g, ""), 10) || 0;
}
function fmtInput(val: number): string {
    if (!val) return "";
    return new Intl.NumberFormat("id-ID").format(val);
}
const fmt = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");

// ─── Shimmer ────────────────────────────────────────────────────────────────
const Shimmer = ({ w, h, r = "8px", style = {}, className = "" }: {
    w?: string | number; h: string | number; r?: string;
    style?: React.CSSProperties; className?: string;
}) => (
    <div
        className={className}
        style={{
            width: w ?? "100%", height: h, borderRadius: r,
            background: "linear-gradient(90deg,#ececec 25%,#e0e0e0 50%,#ececec 75%)",
            backgroundSize: "600px 100%", animation: "sk-shimmer 1.4s infinite linear",
            flexShrink: 0, ...style,
        }}
    />
);

// ─── Badges ─────────────────────────────────────────────────────────────────
function CategoryBadge({ cat }: { cat: string }) {
    return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-gray-100 text-gray-600 border border-gray-200">
            {cat}
        </span>
    );
}

function StatusBadge({ status }: { status: string }) {
    const map: Record<string, { badge: string; dot: string; label: string }> = {
        TERSEDIA: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", label: "Tersedia" },
        TERJUAL: { badge: "bg-gray-100 text-gray-500 border-gray-200", dot: "bg-gray-400", label: "Terjual" },
        RESERVED: { badge: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-400", label: "Reserved" },
    };
    const s = map[status] ?? map.TERSEDIA;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${s.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
            {s.label}
        </span>
    );
}

function ConditionBadge({ condition }: { condition: string }) {
    return (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${condition === "BARU" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
            {condition}
        </span>
    );
}

// ─── Reusable Price Input (Rp + thousand separator) ───────────────────────────
function PriceInput({ value, onChange, placeholder }: {
    value: string;
    onChange: (formatted: string) => void;
    placeholder?: string;
}) {
    return (
        <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium pointer-events-none">Rp</span>
            <input
                inputMode="numeric"
                className="w-full h-11 border border-gray-200 rounded-xl pl-9 pr-3.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400/20 focus:border-gray-400 focus:bg-white transition-all duration-150 tabular-nums"
                placeholder={placeholder ?? "0"}
                value={value}
                onChange={e => {
                    const raw = e.target.value.replace(/\D/g, "");
                    onChange(raw ? new Intl.NumberFormat("id-ID").format(parseInt(raw, 10)) : "");
                }}
            />
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: Aksesori (master data)
// buy_price (modal) dikelola per-unit, master cuma simpan sell_price default.
// ═══════════════════════════════════════════════════════════════════════════
function AccessoryModal({ open, onClose, onSave, initial, loading }: {
    open: boolean; onClose: () => void;
    onSave: (data: AccessoryForm) => Promise<void>;
    initial?: Accessory | null; loading: boolean;
}) {
    const [form, setForm] = useState<AccessoryForm>(EMPTY_ACC_FORM);
    const [sellInput, setSellInput] = useState("");

    useEffect(() => {
        if (!open) return;
        if (initial) {
            setForm({
                name: initial.name,
                category: initial.category,
                brand: initial.brand ?? "",
                spec: initial.spec ?? "",
                sell_price: initial.sell_price,
                notes: initial.notes ?? "",
            });
            setSellInput(fmtInput(initial.sell_price));
        } else {
            setForm(EMPTY_ACC_FORM);
            setSellInput("");
        }
    }, [open, initial]);

    useEffect(() => {
        if (!open) return;
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [open, onClose]);

    const set = <K extends keyof AccessoryForm>(k: K, v: AccessoryForm[K]) =>
        setForm(p => ({ ...p, [k]: v }));

    const handleSubmit = async () => {
        if (!form.name.trim()) { toast.error("Nama aksesori wajib diisi"); return; }
        if (!form.category) { toast.error("Kategori wajib dipilih"); return; }
        await onSave({ ...form, sell_price: parseRupiah(sellInput) });
    };

    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-lg shadow-2xl flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden animate-popIn max-h-[92dvh] sm:max-h-[88vh]">
                <div className="h-0.5 w-full bg-gradient-to-r from-gray-300 via-gray-700 to-gray-900 flex-shrink-0" />
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
                    <div>
                        <h2 className="font-bold text-gray-900 text-[15px] tracking-tight">{initial ? "Edit Aksesori" : "Tambah Aksesori"}</h2>
                        <p className="text-[11px] text-gray-400 mt-0.5">Data master — harga modal dikelola per unit/SN</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 active:scale-90 transition-all duration-150">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
                    <div>
                        <label className={labelCls}>Nama Aksesori <span className="text-red-400">*</span></label>
                        <input className={inputCls} placeholder="cth. Samsung 870 EVO" value={form.name} onChange={e => set("name", e.target.value)} />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={labelCls}>Kategori <span className="text-red-400">*</span></label>
                            <select className={`${inputCls} filter-select cursor-pointer`} value={form.category} onChange={e => set("category", e.target.value)}>
                                <option value="">-- Pilih --</option>
                                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className={labelCls}>Merk</label>
                            <input className={inputCls} placeholder="Samsung, Kingston..." value={form.brand} onChange={e => set("brand", e.target.value)} />
                        </div>
                    </div>

                    <div>
                        <label className={labelCls}>Spesifikasi</label>
                        <input className={inputCls} placeholder="500GB, DDR4 8GB, 65W..." value={form.spec} onChange={e => set("spec", e.target.value)} />
                    </div>

                    <div>
                        <label className={labelCls}>
                            Harga Jual Default
                            <span className="ml-1 text-gray-400 normal-case font-normal">(bisa di-override per unit)</span>
                        </label>
                        <PriceInput value={sellInput} onChange={setSellInput} />
                    </div>

                    <div>
                        <label className={labelCls}>Keterangan</label>
                        <textarea rows={2} className={textareaCls} placeholder="Catatan tambahan (opsional)" value={form.notes} onChange={e => set("notes", e.target.value)} />
                    </div>
                </div>

                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex-shrink-0">
                    <button onClick={onClose} disabled={loading} className="px-4 h-11 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 transition disabled:opacity-50">Batal</button>
                    <button onClick={handleSubmit} disabled={loading} className="px-5 h-11 rounded-xl text-sm font-bold bg-gray-800 text-white hover:bg-gray-900 active:scale-[0.98] disabled:opacity-50 transition-all shadow-lg shadow-gray-800/20 flex items-center gap-2">
                        {loading && <Spinner />}
                        {initial ? "Simpan Perubahan" : "Tambah Aksesori"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: Tambah/Edit Unit (SN) — Harga Modal + Harga Jual + Margin
// ═══════════════════════════════════════════════════════════════════════════
function UnitModal({ open, onClose, onSave, accessory, editUnit, loading }: {
    open: boolean; onClose: () => void;
    onSave: (data: UnitForm) => Promise<void>;
    accessory: Accessory | null;
    editUnit?: AccessoryUnit | null;
    loading: boolean;
}) {
    const [form, setForm] = useState<UnitForm>(EMPTY_UNIT_FORM);
    const [buyInput, setBuyInput] = useState("");
    const [sellInput, setSellInput] = useState("");

    useEffect(() => {
        if (!open) return;
        if (editUnit) {
            setForm({
                serial_number: editUnit.serial_number,
                condition: editUnit.condition,
                buy_price: editUnit.buy_price,
                selling_price: editUnit.selling_price,
                notes: editUnit.notes ?? "",
            });
            setBuyInput(fmtInput(editUnit.buy_price));
            setSellInput(fmtInput(editUnit.selling_price));
        } else {
            setForm({ ...EMPTY_UNIT_FORM, selling_price: accessory?.sell_price ?? 0 });
            setBuyInput("");
            setSellInput(fmtInput(accessory?.sell_price ?? 0));
        }
    }, [open, editUnit, accessory]);

    useEffect(() => {
        if (!open) return;
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [open, onClose]);

    const set = <K extends keyof UnitForm>(k: K, v: UnitForm[K]) =>
        setForm(p => ({ ...p, [k]: v }));

    const handleSubmit = async () => {
        if (!form.serial_number.trim()) { toast.error("Serial number wajib diisi"); return; }
        await onSave({ ...form, buy_price: parseRupiah(buyInput), selling_price: parseRupiah(sellInput) });
    };

    const buyVal = parseRupiah(buyInput);
    const sellVal = parseRupiah(sellInput);
    const margin = sellVal - buyVal;

    if (!open) return null;
    return (
        <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-md shadow-2xl flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden animate-popIn max-h-[92dvh] sm:max-h-[88vh]">
                <div className="h-0.5 w-full bg-gradient-to-r from-gray-300 via-gray-700 to-gray-900 flex-shrink-0" />
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
                    <div className="min-w-0">
                        <h2 className="font-bold text-gray-900 text-[15px] tracking-tight">{editUnit ? "Edit Unit" : "Tambah Unit / SN"}</h2>
                        <p className="text-[11px] text-gray-400 mt-0.5 truncate max-w-[240px]">{accessory?.name}</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 active:scale-90 transition-all duration-150">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
                    <div>
                        <label className={labelCls}>Serial Number <span className="text-red-400">*</span></label>
                        <input
                            className={`${inputCls} font-mono uppercase`}
                            placeholder="cth. SN-HDD-001"
                            value={form.serial_number}
                            onChange={e => set("serial_number", e.target.value.toUpperCase())}
                        />
                    </div>

                    <div>
                        <label className={labelCls}>Kondisi</label>
                        <div className="grid grid-cols-2 gap-2">
                            {(["BARU", "BEKAS"] as const).map(c => (
                                <button key={c} type="button" onClick={() => set("condition", c)}
                                    className={`h-10 rounded-xl text-xs font-bold border transition ${form.condition === c ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
                                    {c}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={labelCls}>Harga Modal</label>
                            <PriceInput value={buyInput} onChange={setBuyInput} />
                        </div>
                        <div>
                            <label className={labelCls}>Harga Jual</label>
                            <PriceInput value={sellInput} onChange={setSellInput} placeholder={fmtInput(accessory?.sell_price ?? 0) || "0"} />
                        </div>
                    </div>

                    {/* Margin preview — sama gaya kayak Data Laptop */}
                    {(sellVal > 0 && buyVal > 0) && (
                        <div className="bg-gray-50 rounded-xl px-3.5 py-2.5 border border-gray-100">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Estimasi Margin</span>
                                <span className={`text-sm font-black tabular-nums ${margin >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                    {margin >= 0 ? "+" : ""}{fmt(margin)}
                                    <span className="text-[10px] font-medium ml-1 opacity-70">({Math.round((margin / buyVal) * 100)}%)</span>
                                </span>
                            </div>
                            <div className="mt-1.5 h-1 bg-gray-200 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all ${margin >= 0 ? "bg-emerald-500" : "bg-red-500"}`}
                                    style={{ width: `${Math.min(100, Math.max(0, (margin / sellVal) * 100))}%` }} />
                            </div>
                        </div>
                    )}

                    <div>
                        <label className={labelCls}>Catatan Unit</label>
                        <input className={inputCls} placeholder="Kondisi khusus, dll (opsional)" value={form.notes} onChange={e => set("notes", e.target.value)} />
                    </div>
                </div>

                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex-shrink-0">
                    <button onClick={onClose} disabled={loading} className="px-4 h-11 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 transition disabled:opacity-50">Batal</button>
                    <button onClick={handleSubmit} disabled={loading} className="px-5 h-11 rounded-xl text-sm font-bold bg-gray-800 text-white hover:bg-gray-900 active:scale-[0.98] disabled:opacity-50 transition-all shadow-lg shadow-gray-800/20 flex items-center gap-2">
                        {loading && <Spinner />}
                        {editUnit ? "Simpan" : "Tambah Unit"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: Detail Aksesori (popup saat klik baris) — gaya Data Laptop
// ═══════════════════════════════════════════════════════════════════════════
function AccessoryDetailModal({ accessory, onClose, onManageUnits, onEdit, onDelete }: {
    accessory: Accessory | null;
    onClose: () => void;
    onManageUnits: () => void;
    onEdit: () => void;
    onDelete: () => void;
}) {
    useEffect(() => {
        if (!accessory) return;
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [accessory, onClose]);

    if (!accessory) return null;

    const units = accessory.accessory_units ?? [];
    const tersedia = accessory.stock_tersedia;
    const total = accessory.stock_total;
    const terjual = units.filter(u => u.status === "TERJUAL").length;
    const reserved = units.filter(u => u.status === "RESERVED").length;

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-2xl shadow-2xl flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden animate-popIn max-h-[92dvh] sm:max-h-[88vh]">
                <div className="h-0.5 w-full bg-gradient-to-r from-gray-300 via-gray-700 to-gray-900 flex-shrink-0" />
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
                    <h2 className="font-bold text-gray-900 text-[15px] tracking-tight">Detail Aksesori</h2>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 active:scale-90 transition-all duration-150">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
                    {/* Hero */}
                    <div className="flex flex-col sm:flex-row gap-4 p-5 bg-gray-50 rounded-2xl border border-gray-100">
                        <div className="w-14 h-14 rounded-2xl bg-white border border-gray-200 shadow-sm flex items-center justify-center text-3xl flex-shrink-0">
                            {CATEGORY_EMOJI[accessory.category] ?? "🧰"}
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="font-black text-gray-900 text-lg tracking-tight leading-snug break-words">{accessory.name}</h3>
                            <p className="text-sm text-gray-400 mt-0.5 font-medium">
                                {accessory.brand || "—"}{accessory.spec ? ` · ${accessory.spec}` : ""}
                            </p>
                            <div className="flex flex-wrap gap-2 mt-3">
                                <CategoryBadge cat={accessory.category} />
                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border ${tersedia === 0 ? "bg-red-50 text-red-600 border-red-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                                    {tersedia} unit tersedia
                                </span>
                            </div>
                        </div>
                        <div className="sm:text-right flex-shrink-0">
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Harga Jual Default</p>
                            <p className="text-2xl font-black text-gray-900 mt-0.5 tabular-nums">{accessory.sell_price > 0 ? fmt(accessory.sell_price) : "—"}</p>
                        </div>
                    </div>

                    {/* Mini stats */}
                    <div className="grid grid-cols-4 gap-2.5">
                        {[
                            { label: "Total Unit", value: total, color: "text-gray-800" },
                            { label: "Tersedia", value: tersedia, color: "text-emerald-600" },
                            { label: "Reserved", value: reserved, color: "text-amber-600" },
                            { label: "Terjual", value: terjual, color: "text-gray-400" },
                        ].map(s => (
                            <div key={s.label} className="bg-gray-50 rounded-xl p-3 border border-gray-100 text-center">
                                <p className={`text-xl font-black tabular-nums ${s.color}`}>{s.value}</p>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">{s.label}</p>
                            </div>
                        ))}
                    </div>

                    {/* Info */}
                    <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Informasi</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                            {[
                                { label: "Kategori", value: accessory.category },
                                { label: "Merk", value: accessory.brand },
                                { label: "Spesifikasi", value: accessory.spec },
                            ].map(({ label, value }) => (
                                <div key={label} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{label}</p>
                                    <p className="text-sm font-semibold text-gray-800 break-all leading-tight">{value || <span className="text-gray-300 font-normal">—</span>}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Note */}
                    <div className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-xl p-3.5">
                        <svg className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-xs text-gray-600 leading-relaxed">
                            Stok & harga modal dikelola per-unit. Klik <span className="font-bold text-gray-800">Kelola Unit/SN</span> untuk mengatur serial number, harga modal, harga jual, dan margin tiap unit.
                        </p>
                    </div>

                    {accessory.notes && (
                        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3.5">
                            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-1">Keterangan</p>
                            <p className="text-sm text-amber-900">{accessory.notes}</p>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex-shrink-0 flex-wrap">
                    <p className="text-xs text-gray-400">
                        {new Date(accessory.created_at).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}
                    </p>
                    <div className="flex gap-2">
                        <button onClick={onManageUnits} className="h-9 px-4 text-sm font-semibold text-white bg-gray-800 rounded-xl hover:bg-gray-900 active:scale-[0.97] transition-all duration-150 flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z M8 12h.01M12 12h.01M16 12h.01" />
                            </svg>
                            Kelola Unit/SN
                        </button>
                        <button onClick={onEdit} className="h-9 px-4 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 active:scale-[0.97] transition-all duration-150">Edit</button>
                        <button onClick={onDelete} className="h-9 px-4 text-sm font-semibold text-red-500 bg-red-50 rounded-xl hover:bg-red-100 active:scale-[0.97] transition-all duration-150">Hapus</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// PANEL: Unit/SN (slide-in kanan) — tampil Modal / Jual / Margin per unit
// ═══════════════════════════════════════════════════════════════════════════
function UnitPanel({ accessory, onClose, onAddUnit, onEditUnit, onDeleteUnit }: {
    accessory: Accessory | null;
    onClose: () => void;
    onAddUnit: () => void;
    onEditUnit: (unit: AccessoryUnit) => void;
    onDeleteUnit: (unit: AccessoryUnit) => void;
}) {
    useEffect(() => {
        if (!accessory) return;
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [accessory, onClose]);

    if (!accessory) return null;
    const units = accessory.accessory_units ?? [];
    const fmtDate = (iso: string) => iso
        ? new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso))
        : "—";

    return (
        <div className="fixed inset-0 z-[45] flex animate-fadeIn">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative ml-auto w-full max-w-lg bg-[#F7F7F8] h-full shadow-2xl flex flex-col animate-slideInRight">
                {/* Header (dark) */}
                <div className="bg-gray-800 px-5 py-4 flex items-start justify-between flex-shrink-0">
                    <div className="min-w-0">
                        <h3 className="text-sm font-bold text-white truncate">{accessory.name}</h3>
                        <p className="text-[11px] text-white/50 mt-0.5 truncate">
                            {accessory.brand && `${accessory.brand} · `}{accessory.spec ?? ""}
                        </p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-white/15 text-white border border-white/10">{accessory.category}</span>
                            <span className="text-[11px] text-white/70">{accessory.stock_tersedia} tersedia / {accessory.stock_total} total</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition flex-shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                    {units.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-2">
                            <div className="text-3xl opacity-40">📦</div>
                            <p className="text-sm text-gray-400 font-medium">Belum ada unit/SN</p>
                            <button onClick={onAddUnit} className="text-xs text-gray-700 font-semibold hover:underline mt-1">+ Tambah unit pertama</button>
                        </div>
                    ) : (
                        units.map(unit => {
                            const margin = (unit.selling_price || 0) - (unit.buy_price || 0);
                            const marginPct = unit.buy_price > 0 ? Math.round((margin / unit.buy_price) * 100) : 0;
                            return (
                                <div key={unit.id} className="bg-white border border-gray-100 rounded-xl p-3.5 shadow-sm">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                                            <span className="font-mono text-sm font-bold text-gray-800 bg-gray-100 px-2 py-0.5 rounded">{unit.serial_number}</span>
                                            <StatusBadge status={unit.status} />
                                            <ConditionBadge condition={unit.condition} />
                                        </div>
                                        {unit.status !== "TERJUAL" && (
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                                <button onClick={() => onEditUnit(unit)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition" title="Edit">
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                                                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                                                    </svg>
                                                </button>
                                                <button onClick={() => onDeleteUnit(unit)} className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition" title="Hapus">
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                                                        <polyline points="3 6 5 6 21 6" />
                                                        <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                                                        <path d="M10 11v6M14 11v6M9 6V4h6v2" />
                                                    </svg>
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Modal / Jual / Margin */}
                                    <div className="grid grid-cols-3 gap-2 mt-3">
                                        <div className="bg-gray-50 rounded-lg px-2.5 py-1.5">
                                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Modal</p>
                                            <p className="text-xs font-semibold text-gray-700 tabular-nums">{unit.buy_price > 0 ? fmt(unit.buy_price) : "—"}</p>
                                        </div>
                                        <div className="bg-gray-50 rounded-lg px-2.5 py-1.5">
                                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Jual</p>
                                            <p className="text-xs font-semibold text-gray-800 tabular-nums">{fmt(unit.selling_price)}</p>
                                        </div>
                                        <div className={`rounded-lg px-2.5 py-1.5 ${unit.buy_price > 0 ? (margin >= 0 ? "bg-emerald-50" : "bg-red-50") : "bg-gray-50"}`}>
                                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Margin</p>
                                            <p className={`text-xs font-bold tabular-nums ${unit.buy_price > 0 ? (margin >= 0 ? "text-emerald-600" : "text-red-500") : "text-gray-300"}`}>
                                                {unit.buy_price > 0
                                                    ? <>{margin >= 0 ? "+" : ""}{fmt(margin)}<span className="text-[9px] font-medium ml-1 opacity-70">{marginPct}%</span></>
                                                    : "—"}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between mt-2">
                                        {unit.notes
                                            ? <p className="text-[11px] text-gray-400 truncate flex-1">{unit.notes}</p>
                                            : <span className="flex-1" />}
                                        <p className="text-[10px] text-gray-300 flex-shrink-0 ml-2">{fmtDate(unit.created_at)}</p>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 bg-white flex-shrink-0">
                    <button onClick={onAddUnit} className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-gray-800 text-white text-sm font-bold hover:bg-gray-900 active:scale-[0.98] transition-all shadow-lg shadow-gray-800/20">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        Tambah Unit / SN
                    </button>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: Delete Confirm — gaya Data Laptop (header gelap)
// ═══════════════════════════════════════════════════════════════════════════
function DeleteConfirm({ open, title, name, onClose, onConfirm, loading }: {
    open: boolean; title: string; name: string;
    onClose: () => void; onConfirm: () => void; loading: boolean;
}) {
    useEffect(() => {
        if (!open) return;
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [open, onClose]);

    if (!open) return null;
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-popIn">
                <div className="h-1 w-full bg-gradient-to-r from-gray-400 via-gray-600 to-gray-800" />
                <div className="bg-gray-800 px-6 py-5">
                    <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center ring-1 ring-white/20 flex-shrink-0">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </div>
                        <div>
                            <p className="font-bold text-white text-sm tracking-tight">{title}</p>
                            <p className="text-xs text-white/60 mt-0.5">Tindakan ini tidak dapat dibatalkan</p>
                        </div>
                    </div>
                </div>
                <div className="p-6">
                    <p className="text-sm text-gray-600 text-center mb-6 leading-relaxed">
                        Yakin hapus <span className="font-bold text-gray-800 break-all">{name}</span>?
                    </p>
                    <div className="flex gap-3">
                        <button onClick={onClose} disabled={loading} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 active:scale-[0.98] transition-all disabled:opacity-50">Batal</button>
                        <button onClick={onConfirm} disabled={loading} className="flex-1 h-11 bg-gray-800 text-white rounded-xl text-sm font-semibold hover:bg-gray-900 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg shadow-gray-800/20 flex items-center justify-center gap-2">
                            {loading && <Spinner />}
                            Hapus
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════
export default function AccessoriesPage() {
    const router = useRouter();
    const [items, setItems] = useState<Accessory[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [filterCategory, setFilterCategory] = useState("");
    const [fetching, setFetching] = useState(true);
    const [isExporting, setIsExporting] = useState(false);

    // Accessory CRUD
    const [accModalOpen, setAccModalOpen] = useState(false);
    const [editAcc, setEditAcc] = useState<Accessory | null>(null);
    const [deleteAcc, setDeleteAcc] = useState<Accessory | null>(null);
    const [savingAcc, setSavingAcc] = useState(false);
    const [deletingAcc, setDeletingAcc] = useState(false);

    // Detail + Unit panel
    const [selectedAcc, setSelectedAcc] = useState<Accessory | null>(null);
    const [view, setView] = useState<"detail" | null>(null);

    // Unit CRUD — dikelola di /dashboard/accessories/[id]/units
    // State di bawah tidak digunakan di halaman ini; units punya dedicated page.

    const LIMIT = 20;
    const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Fetch ──
    const fetchItems = useCallback(async (p = 1, q = search, cat = filterCategory) => {
        setFetching(true);
        try {
            const params = new URLSearchParams({
                page: String(p), limit: String(LIMIT),
                ...(q && { search: q }),
                ...(cat && { category: cat }),
            });
            const res = await fetch(`/api/accessories?${params}`);
            const json = await res.json();
            if (json.success) {
                setItems(json.data);
                setTotal(json.total);
                setPage(p);
            }
        } finally { setFetching(false); }
    }, [search, filterCategory]);

    useEffect(() => { fetchItems(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSearch = (val: string) => {
        setSearch(val);
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(() => fetchItems(1, val, filterCategory), 400);
    };

    // Refresh selectedAcc dari items terbaru (biar panel/detail selalu sinkron)
    useEffect(() => {
        if (selectedAcc) {
            const fresh = items.find(i => i.id === selectedAcc.id);
            if (fresh) setSelectedAcc(fresh);
        }
    }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Stats (dari data yang sedang dimuat) ──
    const stats = useMemo(() => ({
        jenis: total,
        tersedia: items.reduce((s, i) => s + i.stock_tersedia, 0),
        totalUnit: items.reduce((s, i) => s + i.stock_total, 0),
        habis: items.filter(i => i.stock_tersedia === 0).length,
    }), [items, total]);

    // ── Accessory CRUD ──
    const handleSaveAcc = async (data: AccessoryForm) => {
        setSavingAcc(true);
        try {
            const isEdit = !!editAcc;
            const url = isEdit ? `/api/accessories/${editAcc!.id}` : "/api/accessories";
            const res = await fetch(url, {
                method: isEdit ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error ?? "Gagal menyimpan");
            toast.success(isEdit ? "Aksesori diperbarui" : "Aksesori ditambahkan");
            setAccModalOpen(false);
            setEditAcc(null);
            fetchItems(page);
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Terjadi kesalahan");
        } finally { setSavingAcc(false); }
    };

    const handleDeleteAcc = async () => {
        if (!deleteAcc) return;
        setDeletingAcc(true);
        try {
            const res = await fetch(`/api/accessories/${deleteAcc.id}`, { method: "DELETE" });
            const json = await res.json();
            if (!json.success) throw new Error(json.error ?? "Gagal menghapus");
            toast.success("Aksesori dihapus");
            if (selectedAcc?.id === deleteAcc.id) { setSelectedAcc(null); setView(null); }
            setDeleteAcc(null);
            fetchItems(page);
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Terjadi kesalahan");
        } finally { setDeletingAcc(false); }
    };

    // ── Export Excel ──
    // Halaman ini pakai server-side pagination (items cuma 20 baris halaman aktif),
    // jadi fetch ulang SEMUA data sesuai filter aktif dulu sebelum bikin file.
    const exportToExcel = async () => {
        setIsExporting(true);
        try {
            const params = new URLSearchParams({
                page: "1",
                limit: String(total > 0 ? total : 9999),
                ...(search && { search }),
                ...(filterCategory && { category: filterCategory }),
            });
            const res = await fetch(`/api/accessories?${params}`);
            const json = await res.json();
            const all: Accessory[] = json.success ? json.data : items;

            if (all.length === 0) {
                toast.error("Tidak ada data untuk di-export");
                return;
            }

            const statusLabel: Record<string, string> = {
                TERSEDIA: "Tersedia", TERJUAL: "Terjual", RESERVED: "Reserved",
            };

            // ── Sheet 1: Master Aksesori ──
            const masterRows = all.map((a, idx) => {
                const units = a.accessory_units ?? [];
                const terjual = units.filter(u => u.status === "TERJUAL").length;
                return {
                    "No": idx + 1,
                    "Nama Aksesori": a.name,
                    "Kategori": a.category,
                    "Merk": a.brand ?? "—",
                    "Spesifikasi": a.spec ?? "—",
                    "Harga Jual Default": a.sell_price || 0,
                    "Stok Tersedia": a.stock_tersedia,
                    "Total Unit": a.stock_total,
                    "Terjual": terjual,
                    "Keterangan": a.notes ?? "—",
                    "Tanggal Input": a.created_at
                        ? new Date(a.created_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
                        : "—",
                };
            });

            // ── Sheet 2: Detail Unit / SN (lengkap dengan margin) ──
            const unitRows: Record<string, string | number>[] = [];
            let no = 1;
            let totalModal = 0, totalJual = 0, totalMargin = 0;
            all.forEach(a => {
                (a.accessory_units ?? []).forEach(u => {
                    const margin = (u.selling_price || 0) - (u.buy_price || 0);
                    const marginPct = u.buy_price > 0 ? Math.round((margin / u.buy_price) * 100) : 0;
                    totalModal += u.buy_price || 0;
                    totalJual += u.selling_price || 0;
                    totalMargin += margin;
                    unitRows.push({
                        "No": no++,
                        "Nama Aksesori": a.name,
                        "Kategori": a.category,
                        "Serial Number": u.serial_number,
                        "Kondisi": u.condition,
                        "Status": statusLabel[u.status] ?? u.status,
                        "Harga Modal": u.buy_price || 0,
                        "Harga Jual": u.selling_price || 0,
                        "Margin": margin,
                        "Margin %": `${marginPct}%`,
                        "Catatan": u.notes ?? "—",
                        "Tanggal Input": u.created_at
                            ? new Date(u.created_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
                            : "—",
                    });
                });
            });

            // Baris TOTAL di bawah sheet unit
            if (unitRows.length > 0) {
                unitRows.push({
                    "No": "", "Nama Aksesori": "TOTAL", "Kategori": "", "Serial Number": "",
                    "Kondisi": "", "Status": "",
                    "Harga Modal": totalModal,
                    "Harga Jual": totalJual,
                    "Margin": totalMargin,
                    "Margin %": "", "Catatan": "", "Tanggal Input": "",
                });
            }

            // ── Build workbook ──
            const wb = XLSX.utils.book_new();

            const wsMaster = XLSX.utils.json_to_sheet(masterRows);
            wsMaster["!cols"] = [
                { wch: 5 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 22 },
                { wch: 18 }, { wch: 13 }, { wch: 11 }, { wch: 10 }, { wch: 26 }, { wch: 16 },
            ];
            XLSX.utils.book_append_sheet(wb, wsMaster, "Aksesori");

            if (unitRows.length > 0) {
                const wsUnit = XLSX.utils.json_to_sheet(unitRows);
                wsUnit["!cols"] = [
                    { wch: 5 }, { wch: 30 }, { wch: 14 }, { wch: 20 }, { wch: 10 },
                    { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 22 }, { wch: 16 },
                ];
                XLSX.utils.book_append_sheet(wb, wsUnit, "Detail Unit");
            }

            const now = new Date();
            const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
            XLSX.writeFile(wb, `Aksesori_${dateStr}.xlsx`);
            toast.success(`Export berhasil — ${all.length} jenis, ${no - 1} unit`);
        } catch (err) {
            console.error("Export Excel gagal:", err);
            toast.error("Gagal export Excel. Coba lagi.");
        } finally {
            setIsExporting(false);
        }
    };

    const totalPages = Math.ceil(total / LIMIT);
    const hasFilter = !!(search || filterCategory);

    return (
        <>
            <style>{`
                @keyframes sk-shimmer { 0% { background-position: -600px 0; } 100% { background-position: 600px 0; } }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes popIn { from { opacity: 0; transform: scale(0.94) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
                @keyframes slideDown { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes slideInRight { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: translateX(0); } }
                .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
                .animate-popIn { animation: popIn 0.25s cubic-bezier(0.34,1.56,0.64,1); }
                .animate-slideDown { animation: slideDown 0.3s ease-out; }
                .animate-slideUp { animation: slideUp 0.3s ease-out; }
                .animate-slideInRight { animation: slideInRight 0.28s cubic-bezier(0.22,1,0.36,1); }
                .table-scroll { scrollbar-width: thin; scrollbar-color: #d1d5db #f9fafb; }
                .table-scroll::-webkit-scrollbar { height: 6px; width: 6px; }
                .table-scroll::-webkit-scrollbar-track { background: #f9fafb; border-radius: 99px; }
                .table-scroll::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 99px; }
                .table-scroll::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
                .data-row { transition: background-color 0.15s ease; }
                .data-row:hover { background-color: #f8fafc; }
                .data-row:hover td:first-child { border-left: 3px solid #374151; }
                .filter-select {
                    appearance: none;
                    background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e");
                    background-position: right 10px center; background-repeat: no-repeat; background-size: 16px; padding-right: 32px !important;
                }
            `}</style>

            <DashboardLayout>
                <main className="min-h-screen bg-[#F7F7F8] p-4 sm:p-6 lg:p-8">
                    <div className="max-w-full mx-auto space-y-5">

                        {/* HEADER */}
                        <div className="flex flex-wrap items-center justify-between gap-4 animate-slideDown">
                            <div className="flex items-center gap-3.5">
                                <div className="w-10 h-10 bg-gray-800 rounded-2xl flex items-center justify-center shadow-lg shadow-gray-800/25 flex-shrink-0">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                        <path d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" />
                                        <path d="M8 12h.01M12 12h.01M16 12h.01" />
                                    </svg>
                                </div>
                                <div>
                                    <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none">Data Aksesori</h1>
                                    <p className="text-xs text-gray-400 mt-0.5 font-medium">Kelola inventaris aksesori Solit 03</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                {/* Export Excel */}
                                <button
                                    onClick={exportToExcel}
                                    disabled={isExporting || fetching || items.length === 0}
                                    title={items.length === 0 ? "Tidak ada data untuk di-export" : "Export semua data ke Excel"}
                                    className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-semibold text-emerald-700 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 rounded-xl active:scale-[0.97] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {isExporting ? (
                                        <>
                                            <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                            </svg>
                                            <span className="hidden sm:inline">Mengexport...</span>
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                            </svg>
                                            <span className="hidden sm:inline">Export Excel</span>
                                            <span className="sm:hidden">Excel</span>
                                        </>
                                    )}
                                </button>

                                {/* Tambah Aksesori */}
                                <button
                                    onClick={() => { setEditAcc(null); setAccModalOpen(true); }}
                                    className="inline-flex items-center gap-2 h-9 px-4 bg-gray-800 rounded-xl text-sm font-semibold text-white hover:bg-gray-900 active:scale-[0.97] transition-all duration-150 shadow-lg shadow-gray-800/25"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                                    </svg>
                                    Tambah Aksesori
                                </button>
                            </div>
                        </div>

                        {/* STAT CARDS */}
                        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 animate-slideDown">
                            <StatCard label="Total Jenis" value={`${stats.jenis} jenis`} accent="bg-gray-700"
                                icon={<svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>} />
                            <StatCard label="Unit Tersedia" value={`${stats.tersedia} unit`} accent="bg-emerald-500"
                                icon={<svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
                            <StatCard label="Total Unit" value={`${stats.totalUnit} unit`} accent="bg-blue-500"
                                icon={<svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>} />
                            <StatCard label="Stok Habis" value={`${stats.habis} jenis`} accent="bg-red-500"
                                icon={<svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>} />
                        </div>

                        {/* FILTER */}
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                                <div className="relative group lg:col-span-2">
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-gray-600 transition-colors">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" /></svg>
                                    </div>
                                    <input
                                        className="w-full h-9 pl-8 pr-3 border border-gray-200 rounded-xl text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400/20 focus:border-gray-400 focus:bg-white transition-all font-medium placeholder:text-gray-400 placeholder:font-normal"
                                        placeholder="Cari nama, merk, spesifikasi..."
                                        value={search} onChange={e => handleSearch(e.target.value)}
                                    />
                                </div>
                                <FilterSelect value={filterCategory} onChange={e => { setFilterCategory(e.target.value); fetchItems(1, search, e.target.value); }}>
                                    <option value="">Semua Kategori</option>
                                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </FilterSelect>
                                <button
                                    onClick={() => { setSearch(""); setFilterCategory(""); fetchItems(1, "", ""); }}
                                    disabled={!hasFilter}
                                    className="h-9 bg-gray-100 text-gray-600 rounded-xl px-3 text-sm font-medium hover:bg-gray-200 active:scale-[0.97] transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                    Reset
                                </button>
                            </div>
                        </div>

                        {/* TABLE */}
                        {fetching ? (
                            <SkeletonTable />
                        ) : items.length === 0 ? (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-24 text-center animate-fadeIn">
                                <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">🧰</div>
                                <p className="text-gray-700 font-bold text-base">Belum ada data aksesori</p>
                                <p className="text-gray-400 text-sm mt-1.5">{hasFilter ? "Coba ubah filter pencarian" : "Klik tombol Tambah Aksesori untuk mulai"}</p>
                            </div>
                        ) : (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-slideUp">
                                <div className="overflow-x-auto table-scroll">
                                    <table className="w-full text-sm border-collapse">
                                        <thead>
                                            <tr className="bg-gray-50 border-b-2 border-gray-100">
                                                <Th center>No</Th>
                                                <Th>Nama Aksesori</Th>
                                                <Th>Kategori</Th>
                                                <Th>Merk</Th>
                                                <Th>Spek</Th>
                                                <Th right>Harga Jual Default</Th>
                                                <Th right>Stok Tersedia</Th>
                                                <Th right>Total Unit</Th>
                                                <Th right>Aksi</Th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {items.map((item, idx) => (
                                                <tr key={item.id}
                                                    className="group cursor-pointer data-row border-b border-gray-50 last:border-0"
                                                    onClick={() => { setSelectedAcc(item); setView("detail"); }}>
                                                    <td className="px-4 py-3.5 text-center w-10">
                                                        <span className="text-xs font-semibold text-gray-300 tabular-nums">{String((page - 1) * LIMIT + idx + 1).padStart(2, "0")}</span>
                                                    </td>
                                                    <td className="px-4 py-3.5 max-w-[220px]">
                                                        <span className="block font-semibold text-gray-800 truncate text-[13px]" title={item.name}>{item.name}</span>
                                                        {item.notes && <span className="block text-[11px] text-gray-400 truncate mt-0.5">{item.notes}</span>}
                                                    </td>
                                                    <td className="px-4 py-3.5 whitespace-nowrap"><CategoryBadge cat={item.category} /></td>
                                                    <td className="px-4 py-3.5 whitespace-nowrap"><span className="text-xs font-medium text-gray-500">{item.brand || <span className="text-gray-200">—</span>}</span></td>
                                                    <td className="px-4 py-3.5 max-w-[160px]"><span className="block text-xs text-gray-600 truncate" title={item.spec ?? ""}>{item.spec || <span className="text-gray-200">—</span>}</span></td>
                                                    <td className="px-4 py-3.5 text-right whitespace-nowrap"><span className="text-[13px] font-bold text-gray-800 tabular-nums">{item.sell_price > 0 ? fmt(item.sell_price) : <span className="text-gray-200 font-medium">—</span>}</span></td>
                                                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                                                        <span className={`inline-flex items-center justify-center min-w-[26px] px-2 py-0.5 rounded-lg text-xs font-bold tabular-nums ${item.stock_tersedia === 0 ? "bg-red-50 text-red-500 ring-1 ring-red-200" : item.stock_tersedia <= 2 ? "bg-amber-50 text-amber-600 ring-1 ring-amber-200" : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"}`}>
                                                            {item.stock_tersedia}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3.5 text-right whitespace-nowrap"><span className="text-sm font-semibold text-gray-600 tabular-nums">{item.stock_total}</span></td>
                                                    <td className="px-4 py-3.5 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                                        <div className="flex items-center justify-end gap-1">
                                                            <button onClick={() => router.push(`/dashboard/accessories/${item.id}/units`)}
                                                                className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition" title="Kelola Unit/SN">
                                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z M8 12h.01M12 12h.01M16 12h.01" /></svg>
                                                            </button>
                                                            <button onClick={() => { setEditAcc(item); setAccModalOpen(true); }}
                                                                className="h-7 px-2.5 text-[11px] font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition">Edit</button>
                                                            <button onClick={() => setDeleteAcc(item)}
                                                                className="h-7 px-2.5 text-[11px] font-semibold text-red-500 bg-red-50 rounded-lg hover:bg-red-100 transition">Hapus</button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Footer / Pagination */}
                                <div className="px-5 py-3.5 border-t border-gray-100 bg-gray-50/60 flex flex-wrap items-center justify-between gap-3">
                                    <p className="text-xs text-gray-400 font-medium">
                                        Menampilkan <span className="text-gray-700 font-bold">{(page - 1) * LIMIT + 1}</span>–<span className="text-gray-700 font-bold">{Math.min(page * LIMIT, total)}</span> dari <span className="text-gray-700 font-bold">{total}</span>
                                    </p>
                                    {totalPages > 1 && (
                                        <div className="flex items-center gap-1.5">
                                            <button disabled={page <= 1} onClick={() => fetchItems(page - 1)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30 transition">
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
                                            </button>
                                            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(p => (
                                                <button key={p} onClick={() => fetchItems(p)} className={`w-7 h-7 rounded-lg text-xs font-bold transition ${p === page ? "bg-gray-800 text-white" : "text-gray-500 hover:bg-gray-100"}`}>{p}</button>
                                            ))}
                                            <button disabled={page >= totalPages} onClick={() => fetchItems(page + 1)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30 transition">
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </main>

                {/* ── Overlays ── */}
                <AccessoryModal
                    open={accModalOpen}
                    onClose={() => { setAccModalOpen(false); setEditAcc(null); }}
                    onSave={handleSaveAcc}
                    initial={editAcc}
                    loading={savingAcc}
                />

                {view === "detail" && (
                    <AccessoryDetailModal
                        accessory={selectedAcc}
                        onClose={() => { setView(null); setSelectedAcc(null); }}
                        onManageUnits={() => { setView(null); router.push(`/dashboard/accessories/${selectedAcc!.id}/units`); }}
                        onEdit={() => { setEditAcc(selectedAcc); setView(null); setAccModalOpen(true); }}
                        onDelete={() => setDeleteAcc(selectedAcc)}
                    />
                )}

                <DeleteConfirm
                    open={!!deleteAcc}
                    title="Hapus Aksesori"
                    name={deleteAcc?.name ?? ""}
                    onClose={() => setDeleteAcc(null)}
                    onConfirm={handleDeleteAcc}
                    loading={deletingAcc}
                />
            </DashboardLayout>
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED STYLE CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════
const inputCls = "w-full h-11 border border-gray-200 rounded-xl px-3.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400/20 focus:border-gray-400 focus:bg-white transition-all duration-150";
const textareaCls = "w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400/20 focus:border-gray-400 focus:bg-white transition-all duration-150 resize-none";
const labelCls = "block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5";

// ═══════════════════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════
function Spinner() {
    return (
        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
    );
}

function StatCard({ label, value, accent, icon }: { label: string; value: string; accent: string; icon: React.ReactNode }) {
    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3.5 hover:shadow-md transition-all duration-200">
            <div className={`w-1 h-10 rounded-full ${accent} flex-shrink-0`} />
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <div className="w-8 h-8 bg-gray-50 rounded-xl flex items-center justify-center flex-shrink-0 border border-gray-100">{icon}</div>
                <div className="min-w-0">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest truncate">{label}</p>
                    <p className="text-sm font-black text-gray-800 tabular-nums truncate">{value}</p>
                </div>
            </div>
        </div>
    );
}

function FilterSelect({ value, onChange, children }: {
    value: string;
    onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    children: React.ReactNode;
}) {
    return (
        <select value={value} onChange={onChange}
            className="filter-select h-9 border border-gray-200 rounded-xl px-3 text-xs bg-gray-50 text-gray-700 font-medium focus:outline-none focus:ring-2 focus:ring-gray-400/20 focus:border-gray-400 focus:bg-white transition-all cursor-pointer hover:bg-gray-100">
            {children}
        </select>
    );
}

function Th({ children, right, center }: { children: React.ReactNode; right?: boolean; center?: boolean }) {
    return (
        <th className={`px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap ${right ? "text-right" : center ? "text-center" : "text-left"}`}>
            {children}
        </th>
    );
}

function SkeletonTable() {
    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gray-50 border-b-2 border-gray-100">
                            {["No", "Nama Aksesori", "Kategori", "Merk", "Spek", "Harga", "Stok", "Total", "Aksi"].map(h => (
                                <th key={h} className="px-4 py-3"><Shimmer h={10} /></th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {[1, 2, 3, 4, 5, 6].map(r => (
                            <tr key={r} className="border-b border-gray-50">
                                <td className="px-4 py-3.5"><Shimmer w={24} h={12} /></td>
                                <td className="px-4 py-3.5"><Shimmer w={150} h={13} /></td>
                                <td className="px-4 py-3.5"><Shimmer w={60} h={18} r="6px" /></td>
                                <td className="px-4 py-3.5"><Shimmer w={60} h={12} /></td>
                                <td className="px-4 py-3.5"><Shimmer w={90} h={12} /></td>
                                <td className="px-4 py-3.5"><div className="flex justify-end"><Shimmer w={90} h={13} /></div></td>
                                <td className="px-4 py-3.5"><div className="flex justify-end"><Shimmer w={26} h={22} r="8px" /></div></td>
                                <td className="px-4 py-3.5"><div className="flex justify-end"><Shimmer w={24} h={13} /></div></td>
                                <td className="px-4 py-3.5"><div className="flex justify-end gap-1.5"><Shimmer w={28} h={28} r="8px" /><Shimmer w={40} h={28} r="8px" /><Shimmer w={44} h={28} r="8px" /></div></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="px-5 py-3.5 border-t border-gray-100 bg-gray-50/60"><Shimmer w={180} h={10} /></div>
        </div>
    );
}