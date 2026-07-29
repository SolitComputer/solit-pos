// src/app/dashboard/accessories/AccessoriesContent.tsx
"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx-js-style";
import {
    HardDrive, MemoryStick, Plug, BatteryFull, Keyboard, Monitor,
    Package, CircuitBoard, Cpu, Gamepad2, Fan, Droplet, Cable, Wrench,
    type LucideIcon,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────
interface Accessory {
    id: string;
    name: string;
    category: string;
    brand: string | null;
    spec: string | null;
    buy_price: number;
    sell_price: number;
    stock: number;
    notes: string | null;
    created_at: string;
    stock_tersedia?: number;
    stock_total?: number;
    audited_at?: string | null;
    audited_by?: string | null;
}

type AccessoryForm = {
    name: string; category: string; brand: string; spec: string;
    buy_price: number; sell_price: number; stock: number; notes: string;
};

const EMPTY_ACC_FORM: AccessoryForm = {
    name: "", category: "", brand: "", spec: "",
    buy_price: 0, sell_price: 0, stock: 0, notes: "",
};

const CATEGORIES = [
    "HDD", "SSD", "RAM", "CHARGER", "BATERAI",
    "KEYBOARD", "LCD", "CASING", "MOTHERBOARD",
    "PROCESSOR", "VGA", "FAN", "THERMAL PASTE",
    "KABEL", "LAINNYA",
];

const CATEGORY_ICON: Record<string, LucideIcon> = {
    HDD: HardDrive, SSD: HardDrive, RAM: MemoryStick, CHARGER: Plug, BATERAI: BatteryFull,
    KEYBOARD: Keyboard, LCD: Monitor, CASING: Package, MOTHERBOARD: CircuitBoard,
    PROCESSOR: Cpu, VGA: Gamepad2, FAN: Fan, "THERMAL PASTE": Droplet,
    KABEL: Cable, LAINNYA: Wrench,
};

// ─── Helpers ────────────────────────────────────────────────────────────────
function parseRupiah(val: string): number {
    return parseInt(val.replace(/\D/g, ""), 10) || 0;
}
function fmtInput(val: number): string {
    if (!val) return "";
    return new Intl.NumberFormat("id-ID").format(val);
}
const fmt = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");

// ── Audit ──────────────────────────────────────────────────────────────────
// Harus SAMA dengan AUDIT_TTL_MS di api/accessories/[id]/audit/route.ts.
// Audit auto-reset (dianggap "belum diaudit") setelah 3 hari.
const AUDIT_TTL_MS = 3 * 24 * 60 * 60 * 1000;
function isAuditActive(auditedAt?: string | null): boolean {
    if (!auditedAt) return false;
    return Date.now() - new Date(auditedAt).getTime() < AUDIT_TTL_MS;
}
interface AuditLog { id: string; action: "AUDIT" | "UNAUDIT"; audited_by: string; audited_at: string; }

// ─── Excel Style Helpers ─────────────────────────────────────────────────────
type XlsxCellStyle = {
    font?: { bold?: boolean; color?: { rgb: string }; sz?: number; name?: string };
    fill?: { fgColor: { rgb: string }; patternType?: string };
    alignment?: { horizontal?: string; vertical?: string; wrapText?: boolean };
    border?: {
        top?: { style: string; color: { rgb: string } };
        bottom?: { style: string; color: { rgb: string } };
        left?: { style: string; color: { rgb: string } };
        right?: { style: string; color: { rgb: string } };
    };
    numFmt?: string;
};

const BORDER_THIN = { top: { style: "thin", color: { rgb: "D1D5DB" } }, bottom: { style: "thin", color: { rgb: "D1D5DB" } }, left: { style: "thin", color: { rgb: "D1D5DB" } }, right: { style: "thin", color: { rgb: "D1D5DB" } } };
const BORDER_HEADER = { top: { style: "medium", color: { rgb: "1F2937" } }, bottom: { style: "medium", color: { rgb: "1F2937" } }, left: { style: "thin", color: { rgb: "374151" } }, right: { style: "thin", color: { rgb: "374151" } } };
const BORDER_TOTAL = { top: { style: "medium", color: { rgb: "111827" } }, bottom: { style: "medium", color: { rgb: "111827" } }, left: { style: "thin", color: { rgb: "4B5563" } }, right: { style: "thin", color: { rgb: "4B5563" } } };

function xCell(v: string | number, s: XlsxCellStyle = {}) { return { v, t: typeof v === "number" ? "n" : "s", s }; }
function sHeader(center = false): XlsxCellStyle { return { font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10, name: "Calibri" }, fill: { fgColor: { rgb: "1F2937" }, patternType: "solid" }, alignment: { horizontal: center ? "center" : "left", vertical: "center" }, border: BORDER_HEADER }; }
function sData(right = false, currency = false): XlsxCellStyle { return { font: { sz: 10, name: "Calibri", color: { rgb: "111827" } }, fill: { fgColor: { rgb: "FFFFFF" }, patternType: "solid" }, alignment: { horizontal: right ? "right" : "left", vertical: "center" }, border: BORDER_THIN, ...(currency ? { numFmt: '"Rp "#,##0' } : {}) }; }
function sZebra(right = false, currency = false): XlsxCellStyle { return { font: { sz: 10, name: "Calibri", color: { rgb: "111827" } }, fill: { fgColor: { rgb: "F9FAFB" }, patternType: "solid" }, alignment: { horizontal: right ? "right" : "left", vertical: "center" }, border: BORDER_THIN, ...(currency ? { numFmt: '"Rp "#,##0' } : {}) }; }
function sTotal(right = false, currency = false): XlsxCellStyle { return { font: { bold: true, sz: 10, name: "Calibri", color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "374151" }, patternType: "solid" }, alignment: { horizontal: right ? "right" : "left", vertical: "center" }, border: BORDER_TOTAL, ...(currency ? { numFmt: '"Rp "#,##0' } : {}) }; }
function sMargin(margin: number): XlsxCellStyle { return { font: { bold: true, sz: 10, color: { rgb: margin >= 0 ? "065F46" : "991B1B" } }, fill: { fgColor: { rgb: margin >= 0 ? "ECFDF5" : "FEF2F2" }, patternType: "solid" }, alignment: { horizontal: "right", vertical: "center" }, border: BORDER_THIN, numFmt: '"Rp "#,##0' }; }

// ─── Shimmer ────────────────────────────────────────────────────────────────
const Shimmer = ({ w, h, r = "8px", style = {}, className = "" }: { w?: string | number; h: string | number; r?: string; style?: React.CSSProperties; className?: string; }) => (
    <div className={className} style={{ width: w ?? "100%", height: h, borderRadius: r, background: "linear-gradient(90deg,#ececec 25%,#e0e0e0 50%,#ececec 75%)", backgroundSize: "600px 100%", animation: "sk-shimmer 1.4s infinite linear", flexShrink: 0, ...style }} />
);

function CategoryBadge({ cat }: { cat: string }) {
    return (<span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-gray-100 text-gray-600 border border-gray-200">{cat}</span>);
}

function PriceInput({ value, onChange, placeholder }: { value: string; onChange: (formatted: string) => void; placeholder?: string; }) {
    return (
        <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium pointer-events-none">Rp</span>
            <input inputMode="numeric" className="w-full h-11 border border-gray-200 rounded-xl pl-9 pr-3.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400/20 focus:border-gray-400 focus:bg-white transition-all duration-150 tabular-nums" placeholder={placeholder ?? "0"} value={value}
                onChange={e => { const raw = e.target.value.replace(/\D/g, ""); onChange(raw ? new Intl.NumberFormat("id-ID").format(parseInt(raw, 10)) : ""); }} />
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: Aksesori (create/edit)
// ═══════════════════════════════════════════════════════════════════════════
function AccessoryModal({ open, onClose, onSave, initial, loading }: { open: boolean; onClose: () => void; onSave: (data: AccessoryForm) => Promise<void>; initial?: Accessory | null; loading: boolean; }) {
    const [form, setForm] = useState<AccessoryForm>(EMPTY_ACC_FORM);
    const [sellInput, setSellInput] = useState(""); const [buyInput, setBuyInput] = useState(""); const [stockInput, setStockInput] = useState("");

    useEffect(() => { if (!open) return; if (initial) { setForm({ name: initial.name, category: initial.category, brand: initial.brand ?? "", spec: initial.spec ?? "", buy_price: initial.buy_price, sell_price: initial.sell_price, stock: initial.stock, notes: initial.notes ?? "" }); setSellInput(fmtInput(initial.sell_price)); setBuyInput(fmtInput(initial.buy_price)); setStockInput(String(initial.stock ?? 0)); } else { setForm(EMPTY_ACC_FORM); setSellInput(""); setBuyInput(""); setStockInput(""); } }, [open, initial]);
    useEffect(() => { if (!open) return; const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [open, onClose]);

    const set = <K extends keyof AccessoryForm>(k: K, v: AccessoryForm[K]) => setForm(p => ({ ...p, [k]: v }));

    const handleSubmit = async () => { if (!form.name.trim()) { toast.error("Nama aksesori wajib diisi"); return; } if (!form.category) { toast.error("Kategori wajib dipilih"); return; } await onSave({ ...form, buy_price: parseRupiah(buyInput), sell_price: parseRupiah(sellInput), stock: parseInt(stockInput || "0", 10) }); };

    if (!open) return null;
    const buyVal = parseRupiah(buyInput); const sellVal = parseRupiah(sellInput); const margin = sellVal - buyVal;

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-lg shadow-2xl flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden animate-popIn max-h-[92dvh] sm:max-h-[88vh]">
                <div className="h-0.5 w-full bg-gradient-to-r from-gray-300 via-gray-700 to-gray-900 flex-shrink-0" />
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
                    <div><h2 className="font-bold text-gray-900 text-[15px] tracking-tight">{initial ? "Edit Aksesori" : "Tambah Aksesori"}</h2><p className="text-[11px] text-gray-400 mt-0.5">Stok dikelola sebagai jumlah (tanpa serial number)</p></div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 active:scale-90 transition-all duration-150"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                </div>
                <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
                    <div><label className={labelCls}>Nama Aksesori <span className="text-red-400">*</span></label><input className={inputCls} placeholder="cth. Samsung 870 EVO" value={form.name} onChange={e => set("name", e.target.value)} /></div>
                    <div className="grid grid-cols-2 gap-3">
                        <div><label className={labelCls}>Kategori <span className="text-red-400">*</span></label><select className={`${inputCls} filter-select cursor-pointer`} value={form.category} onChange={e => set("category", e.target.value)}><option value="">-- Pilih --</option>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                        <div><label className={labelCls}>Merk</label><input className={inputCls} placeholder="Samsung, Kingston..." value={form.brand} onChange={e => set("brand", e.target.value)} /></div>
                    </div>
                    <div><label className={labelCls}>Spesifikasi</label><input className={inputCls} placeholder="500GB, DDR4 8GB, 65W..." value={form.spec} onChange={e => set("spec", e.target.value)} /></div>
                    <div className="grid grid-cols-2 gap-3">
                        <div><label className={labelCls}>Harga Modal</label><PriceInput value={buyInput} onChange={setBuyInput} /></div>
                        <div><label className={labelCls}>Harga Jual <span className="text-red-400">*</span></label><PriceInput value={sellInput} onChange={setSellInput} /></div>
                    </div>
                    {(sellVal > 0 && buyVal > 0) && (<div className="bg-gray-50 rounded-xl px-3.5 py-2.5 border border-gray-100"><div className="flex items-center justify-between"><span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Estimasi Margin / unit</span><span className={`text-sm font-black tabular-nums ${margin >= 0 ? "text-emerald-600" : "text-red-500"}`}>{margin >= 0 ? "+" : ""}{fmt(margin)}<span className="text-[10px] font-medium ml-1 opacity-70">({Math.round((margin / buyVal) * 100)}%)</span></span></div></div>)}
                    <div><label className={labelCls}>Stok Tersedia <span className="text-red-400">*</span></label><input inputMode="numeric" className={`${inputCls} tabular-nums`} placeholder="0" value={stockInput} onChange={e => setStockInput(e.target.value.replace(/\D/g, ""))} /><p className="text-[10px] text-gray-400 mt-1">Stok berkurang otomatis saat aksesori terjual / dijadikan bonus di pembayaran.</p></div>
                    <div><label className={labelCls}>Keterangan</label><textarea rows={2} className={textareaCls} placeholder="Catatan tambahan (opsional)" value={form.notes} onChange={e => set("notes", e.target.value)} /></div>
                </div>
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex-shrink-0">
                    <button onClick={onClose} disabled={loading} className="px-4 h-11 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 transition disabled:opacity-50">Batal</button>
                    <button onClick={handleSubmit} disabled={loading} className="px-5 h-11 rounded-xl text-sm font-bold bg-gray-800 text-white hover:bg-gray-900 active:scale-[0.98] disabled:opacity-50 transition-all shadow-lg shadow-gray-800/20 flex items-center gap-2">{loading && <Spinner />}{initial ? "Simpan Perubahan" : "Tambah Aksesori"}</button>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: Detail Aksesori
// ═══════════════════════════════════════════════════════════════════════════
function AccessoryDetailModal({ accessory, onClose, onEdit, onDelete }: { accessory: Accessory | null; onClose: () => void; onEdit: () => void; onDelete: () => void; }) {
    useEffect(() => { if (!accessory) return; const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [accessory, onClose]);
    if (!accessory) return null;
    const stock = accessory.stock ?? 0; const margin = (accessory.sell_price || 0) - (accessory.buy_price || 0); const CatIcon = CATEGORY_ICON[accessory.category] ?? Wrench;

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-2xl shadow-2xl flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden animate-popIn max-h-[92dvh] sm:max-h-[88vh]">
                <div className="h-0.5 w-full bg-gradient-to-r from-gray-300 via-gray-700 to-gray-900 flex-shrink-0" />
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0"><h2 className="font-bold text-gray-900 text-[15px] tracking-tight">Detail Aksesori</h2><button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 active:scale-90 transition-all duration-150"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button></div>
                <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
                    <div className="flex flex-col sm:flex-row gap-4 p-5 bg-gray-50 rounded-2xl border border-gray-100">
                        <div className="w-14 h-14 rounded-2xl bg-white border border-gray-200 shadow-sm flex items-center justify-center text-3xl flex-shrink-0"><CatIcon size={30} className="text-gray-700" /></div>
                        <div className="flex-1 min-w-0"><h3 className="font-black text-gray-900 text-lg tracking-tight leading-snug break-words">{accessory.name}</h3><p className="text-sm text-gray-400 mt-0.5 font-medium">{accessory.brand || "—"}{accessory.spec ? ` · ${accessory.spec}` : ""}</p><div className="flex flex-wrap gap-2 mt-3"><CategoryBadge cat={accessory.category} /><span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border ${stock === 0 ? "bg-red-50 text-red-600 border-red-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>Stok: {stock}</span></div></div>
                        <div className="sm:text-right flex-shrink-0"><p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Harga Jual</p><p className="text-2xl font-black text-gray-900 mt-0.5 tabular-nums">{accessory.sell_price > 0 ? fmt(accessory.sell_price) : "—"}</p></div>
                    </div>
                    <div className="grid grid-cols-3 gap-2.5">
                       {[{ label: "Stok Tersedia", value: String(stock), color: stock === 0 ? "text-red-500" : "text-emerald-600" }, { label: "Harga Modal", value: accessory.buy_price > 0 ? fmt(accessory.buy_price) : "—", color: "text-gray-700" }, { label: "Gross Profit", value: (accessory.buy_price > 0 ? `${margin >= 0 ? "+" : ""}${fmt(margin)}` : "—"), color: margin >= 0 ? "text-emerald-600" : "text-red-500" }].map(s => (<div key={s.label} className="bg-gray-50 rounded-xl p-3 border border-gray-100 text-center"><p className={`text-base font-black tabular-nums ${s.color}`}>{s.value}</p><p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">{s.label}</p></div>))}
                    </div>
                    <div><p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Informasi</p><div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">{[{ label: "Kategori", value: accessory.category }, { label: "Merk", value: accessory.brand }, { label: "Spesifikasi", value: accessory.spec }].map(({ label, value }) => (<div key={label} className="bg-gray-50 rounded-xl p-3 border border-gray-100"><p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{label}</p><p className="text-sm font-semibold text-gray-800 break-all leading-tight">{value || <span className="text-gray-300 font-normal">—</span>}</p></div>))}</div></div>
                    {accessory.notes && (<div className="bg-amber-50 border border-amber-100 rounded-xl p-3.5"><p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-1">Keterangan</p><p className="text-sm text-amber-900">{accessory.notes}</p></div>)}
                </div>
                <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex-shrink-0 flex-wrap"><p className="text-xs text-gray-400">{new Date(accessory.created_at).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}</p><div className="flex gap-2"><button onClick={onEdit} className="h-9 px-4 text-sm font-semibold text-white bg-gray-800 rounded-xl hover:bg-gray-900 active:scale-[0.97] transition-all duration-150">Edit</button><button onClick={onDelete} className="h-9 px-4 text-sm font-semibold text-red-500 bg-red-50 rounded-xl hover:bg-red-100 active:scale-[0.97] transition-all duration-150">Hapus</button></div></div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: Delete Confirm
// ═══════════════════════════════════════════════════════════════════════════
function DeleteConfirm({ open, title, name, onClose, onConfirm, loading }: { open: boolean; title: string; name: string; onClose: () => void; onConfirm: () => void; loading: boolean; }) {
    useEffect(() => { if (!open) return; const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [open, onClose]);
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-popIn">
                <div className="h-1 w-full bg-gradient-to-r from-gray-400 via-gray-600 to-gray-800" />
                <div className="bg-gray-800 px-6 py-5"><div className="flex items-center gap-3.5"><div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center ring-1 ring-white/20 flex-shrink-0"><svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></div><div><p className="font-bold text-white text-sm tracking-tight">{title}</p><p className="text-xs text-white/60 mt-0.5">Tindakan ini tidak dapat dibatalkan</p></div></div></div>
                <div className="p-6"><p className="text-sm text-gray-600 text-center mb-6 leading-relaxed">Yakin hapus <span className="font-bold text-gray-800 break-all">{name}</span>?</p><div className="flex gap-3"><button onClick={onClose} disabled={loading} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 active:scale-[0.98] transition-all disabled:opacity-50">Batal</button><button onClick={onConfirm} disabled={loading} className="flex-1 h-11 bg-gray-800 text-white rounded-xl text-sm font-semibold hover:bg-gray-900 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg shadow-gray-800/20 flex items-center justify-center gap-2">{loading && <Spinner />}Hapus</button></div></div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: Riwayat Audit
// ═══════════════════════════════════════════════════════════════════════════
function AuditHistoryModal({ accessory, onClose }: { accessory: Accessory | null; onClose: () => void }) {
    const [loading, setLoading] = useState(true);
    const [history, setHistory] = useState<AuditLog[]>([]);
    const [current, setCurrent] = useState<{ audited_at: string | null; audited_by: string | null } | null>(null);

    useEffect(() => {
        if (!accessory) return;
        let alive = true; // guard biar nggak setState setelah modal ditutup
        setLoading(true);
        (async () => {
            try {
                const res = await fetch(`/api/accessories/${accessory.id}/audit`);
                const json = await res.json();
                if (alive && json.success) { setHistory(json.data.history ?? []); setCurrent(json.data.current ?? null); }
            } finally { if (alive) setLoading(false); }
        })();
        return () => { alive = false; };
    }, [accessory]);

    useEffect(() => { if (!accessory) return; const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [accessory, onClose]);

    if (!accessory) return null;
    const active = isAuditActive(current?.audited_at);

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-md shadow-2xl flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden animate-popIn max-h-[85dvh]">
                <div className="h-0.5 w-full bg-gradient-to-r from-gray-300 via-gray-700 to-gray-900 flex-shrink-0" />
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
                    <div><h2 className="font-bold text-gray-900 text-[15px] tracking-tight">Riwayat Audit</h2><p className="text-[11px] text-gray-400 mt-0.5 truncate max-w-[260px]">{accessory.name}</p></div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 active:scale-90 transition-all"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                </div>
                <div className="px-6 py-4 border-b border-gray-100 flex-shrink-0">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-500 border-gray-200"}`}>
                        {active ? `Sudah diaudit — ${current?.audited_by ?? "—"}` : "Belum diaudit"}
                    </span>
                    {active && current?.audited_at && (<p className="text-[11px] text-gray-400 mt-1.5">Terakhir: {new Date(current.audited_at).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} · auto-reset 3 hari</p>)}
                </div>
                <div className="overflow-y-auto flex-1 px-6 py-4">
                    {loading ? (
                        <div className="space-y-2">{[1, 2, 3].map(i => <Shimmer key={i} h={44} r="10px" />)}</div>
                    ) : history.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-8">Belum ada riwayat audit</p>
                    ) : (
                        <ol className="space-y-2">
                            {history.map(h => (
                                <li key={h.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${h.action === "AUDIT" ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-500"}`}>
                                        {h.action === "AUDIT"
                                            ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                            : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-800">{h.action === "AUDIT" ? "Ditandai diaudit" : "Audit dibatalkan"}</p>
                                        <p className="text-[11px] text-gray-400">oleh {h.audited_by}</p>
                                    </div>
                                    <p className="text-[11px] text-gray-400 tabular-nums flex-shrink-0 text-right">{new Date(h.audited_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}<br />{new Date(h.audited_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</p>
                                </li>
                            ))}
                        </ol>
                    )}
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN CONTENT
// ═══════════════════════════════════════════════════════════════════════════
function AccessoriesContent() {
    const [items, setItems] = useState<Accessory[]>([]); const [total, setTotal] = useState(0); const [page, setPage] = useState(1);
    const [search, setSearch] = useState(""); const [filterCategory, setFilterCategory] = useState("");
    const [fetching, setFetching] = useState(true); const [isExporting, setIsExporting] = useState(false);
    const [accModalOpen, setAccModalOpen] = useState(false); const [editAcc, setEditAcc] = useState<Accessory | null>(null);
    const [deleteAcc, setDeleteAcc] = useState<Accessory | null>(null); const [savingAcc, setSavingAcc] = useState(false);
    const [deletingAcc, setDeletingAcc] = useState(false); const [selectedAcc, setSelectedAcc] = useState<Accessory | null>(null);
    const [view, setView] = useState<"detail" | null>(null);
    const [auditingId, setAuditingId] = useState<string | null>(null);
    const [historyAcc, setHistoryAcc] = useState<Accessory | null>(null);

    const LIMIT = 9999;
    const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    const fetchItems = useCallback(async (p = 1, q = search, cat = filterCategory) => {
        setFetching(true);
        try { const params = new URLSearchParams({ page: String(p), limit: String(LIMIT), ...(q && { search: q }), ...(cat && { category: cat }) }); const res = await fetch(`/api/accessories?${params}`); const json = await res.json(); if (json.success) { setItems(json.data); setTotal(json.total); setPage(p); } } finally { setFetching(false); }
    }, [search, filterCategory]);

    useEffect(() => { fetchItems(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSearch = (val: string) => { setSearch(val); if (searchTimeout.current) clearTimeout(searchTimeout.current); searchTimeout.current = setTimeout(() => fetchItems(1, val, filterCategory), 400); };

    useEffect(() => { if (selectedAcc) { const fresh = items.find(i => i.id === selectedAcc.id); if (fresh) setSelectedAcc(fresh); } }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

    const stats = useMemo(() => {
        const nilai = items.reduce((s, i) => s + (i.sell_price ?? 0) * (i.stock ?? 0), 0);      // nilai jual stok
        const nilaiModal = items.reduce((s, i) => s + (i.buy_price ?? 0) * (i.stock ?? 0), 0);   // modal tertanam
        const labaKotor = nilai - nilaiModal;                                                    // gross profit (Rp)
        // GP% = laba kotor / nilai jual (gross margin, basis harga jual).
        // Guard bagi-0: kalau belum ada stok/harga jual, nilai = 0 → JANGAN dibagi (NaN/Infinity).
        const gpPersen = nilai > 0 ? (labaKotor / nilai) * 100 : 0;
        return {
            jenis: total,
            tersedia: items.reduce((s, i) => s + (i.stock ?? 0), 0),
            habis: items.filter(i => (i.stock ?? 0) === 0).length,
            nilai,
            nilaiModal,
            labaKotor,
            gpPersen,
        };
    }, [items, total]);

    const handleSaveAcc = async (data: AccessoryForm) => { setSavingAcc(true); try { const isEdit = !!editAcc; const url = isEdit ? `/api/accessories/${editAcc!.id}` : "/api/accessories"; const res = await fetch(url, { method: isEdit ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); const json = await res.json(); if (!json.success) throw new Error(json.error ?? "Gagal menyimpan"); toast.success(isEdit ? "Aksesori diperbarui" : "Aksesori ditambahkan"); setAccModalOpen(false); setEditAcc(null); fetchItems(page); } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Terjadi kesalahan"); } finally { setSavingAcc(false); } };

    const handleDeleteAcc = async () => { if (!deleteAcc) return; setDeletingAcc(true); try { const res = await fetch(`/api/accessories/${deleteAcc.id}`, { method: "DELETE" }); const json = await res.json(); if (!json.success) throw new Error(json.error ?? "Gagal menghapus"); toast.success("Aksesori dihapus"); if (selectedAcc?.id === deleteAcc.id) { setSelectedAcc(null); setView(null); } setDeleteAcc(null); fetchItems(page); } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Terjadi kesalahan"); } finally { setDeletingAcc(false); } };

    const handleToggleAudit = async (acc: Accessory) => {
        const wasActive = isAuditActive(acc.audited_at); // status SEBELUM toggle → nentuin pesan
        setAuditingId(acc.id);
        try {
            const res = await fetch(`/api/accessories/${acc.id}/audit`, { method: "PATCH" });
            const json = await res.json();
            if (!json.success) throw new Error(json.message ?? "Gagal audit");
            // Update lokal aja — nggak perlu refetch seluruh tabel
            setItems(prev => prev.map(i => i.id === acc.id ? { ...i, audited_at: json.data.audited_at, audited_by: json.data.audited_by } : i));
            toast.success(wasActive ? "Audit dibatalkan" : "Aksesori ditandai sudah diaudit");
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Gagal audit");
        } finally {
            setAuditingId(null);
        }
    };

    const exportToExcel = async () => {
        setIsExporting(true);
        try {
            const params = new URLSearchParams({ page: "1", limit: String(total > 0 ? total : 9999), ...(search && { search }), ...(filterCategory && { category: filterCategory }) });
            const res = await fetch(`/api/accessories?${params}`); const json = await res.json(); const all: Accessory[] = json.success ? json.data : items;
            if (all.length === 0) { toast.error("Tidak ada data untuk di-export"); return; }
            const wb = XLSX.utils.book_new();
const COLS = ["No", "Nama Aksesori", "Kategori", "Merk", "Spesifikasi", "Harga Modal", "Harga Jual", "Stok", "Gross Profit", "Nilai Stok", "Keterangan", "Tanggal Input"];            const wsData: ReturnType<typeof xCell>[][] = [COLS.map((h, ci) => xCell(h, sHeader([0, 5, 6, 7, 8, 9].includes(ci))))];
            let totModal = 0, totJual = 0, totStok = 0, totNilai = 0;
            all.forEach((a, idx) => {
                const margin = (a.sell_price || 0) - (a.buy_price || 0); const nilaiStok = (a.sell_price || 0) * (a.stock || 0);
                totModal += a.buy_price || 0; totJual += a.sell_price || 0; totStok += a.stock || 0; totNilai += nilaiStok;
                const isZebra = idx % 2 === 1; const d = (r = false, c = false) => isZebra ? sZebra(r, c) : sData(r, c);
                const stokColor = (a.stock || 0) === 0 ? "DC2626" : (a.stock || 0) <= 2 ? "D97706" : "059669";
                const tanggal = a.created_at ? new Date(a.created_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—";
                wsData.push([xCell(idx + 1, d(true)), xCell(a.name, d()), xCell(a.category, { ...d(true), font: { bold: true, sz: 10, name: "Calibri", color: { rgb: "374151" } } }), xCell(a.brand ?? "—", d()), xCell(a.spec ?? "—", d()), xCell(a.buy_price || 0, d(true, true)), xCell(a.sell_price || 0, d(true, true)), xCell(a.stock || 0, { ...d(true), font: { bold: true, sz: 10, name: "Calibri", color: { rgb: stokColor } } }), xCell(margin, sMargin(margin)), xCell(nilaiStok, d(true, true)), xCell(a.notes ?? "—", d()), xCell(tanggal, d(true))]);
            });
            wsData.push([xCell("", sTotal()), xCell("TOTAL", sTotal()), xCell("", sTotal()), xCell("", sTotal()), xCell("", sTotal()), xCell(totModal, sTotal(true, true)), xCell(totJual, sTotal(true, true)), xCell(totStok, sTotal(true)), xCell("", sTotal()), xCell(totNilai, sTotal(true, true)), xCell("", sTotal()), xCell("", sTotal())]);
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            ws["!cols"] = [{ wch: 5 }, { wch: 32 }, { wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 8 }, { wch: 16 }, { wch: 18 }, { wch: 26 }, { wch: 16 }];
            ws["!rows"] = [{ hpt: 22 }, ...all.map(() => ({ hpt: 18 })), { hpt: 24 }];
            (ws as Record<string, unknown>)["!freeze"] = { xSplit: 0, ySplit: 1 };
            XLSX.utils.book_append_sheet(wb, ws, "Aksesori");
            const now = new Date(); const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
            XLSX.writeFile(wb, `Aksesori_${dateStr}.xlsx`);
            toast.success(`Export berhasil — ${all.length} jenis aksesori`);
        } catch (err) { console.error("Export Excel gagal:", err); toast.error("Gagal export Excel. Coba lagi."); } finally { setIsExporting(false); }
    };

    const totalPages = Math.ceil(total / LIMIT);
    const hasFilter = !!(search || filterCategory);

    return (
        <>
            <style>{`
                @keyframes sk-shimmer   { 0%{background-position:-600px 0}100%{background-position:600px 0} }
                @keyframes fadeIn       { from{opacity:0}to{opacity:1} }
                @keyframes popIn        { from{opacity:0;transform:scale(0.94) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)} }
                @keyframes slideDown    { from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:translateY(0)} }
                @keyframes slideUp      { from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)} }
                .animate-fadeIn      { animation: fadeIn 0.2s ease-out; }
                .animate-popIn       { animation: popIn 0.25s cubic-bezier(0.34,1.56,0.64,1); }
                .animate-slideDown   { animation: slideDown 0.3s ease-out; }
                .animate-slideUp     { animation: slideUp 0.3s ease-out; }
                .table-scroll { scrollbar-width: thin; scrollbar-color: #d1d5db #f9fafb; }
                .table-scroll::-webkit-scrollbar { height: 6px; width: 6px; }
                .table-scroll::-webkit-scrollbar-track { background: #f9fafb; border-radius: 99px; }
                .table-scroll::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 99px; }
                .table-scroll::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
                .data-row { transition: background-color 0.15s ease; }
                .data-row:hover { background-color: #f8fafc; }
                .data-row:hover td:first-child { border-left: 3px solid #374151; }
                .filter-select { appearance: none; background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e"); background-position: right 10px center; background-repeat: no-repeat; background-size: 16px; padding-right: 32px !important; }
            `}</style>

            <main className="min-h-screen bg-[#F7F7F8] p-4 sm:p-6 lg:p-8">
                <div className="max-w-full mx-auto space-y-5">

                    {/* ── ACTION BUTTONS — no sub-header, tab strip already tells which tab ── */}
                    <div className="flex items-center justify-end gap-2 animate-slideDown">
                        <button onClick={exportToExcel} disabled={isExporting || fetching || items.length === 0}
                            title={items.length === 0 ? "Tidak ada data untuk di-export" : "Export semua data ke Excel"}
                            className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-semibold text-emerald-700 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 rounded-xl active:scale-[0.97] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed">
                            {isExporting ? (<><svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg><span className="hidden sm:inline">Mengexport...</span></>) : (<><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg><span className="hidden sm:inline">Export Excel</span><span className="sm:hidden">Excel</span></>)}
                        </button>
                        <button onClick={() => { setEditAcc(null); setAccModalOpen(true); }}
                            className="inline-flex items-center gap-2 h-9 px-4 bg-gray-800 rounded-xl text-sm font-semibold text-white hover:bg-gray-900 active:scale-[0.97] transition-all duration-150 shadow-lg shadow-gray-800/25">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                            Tambah Aksesori
                        </button>
                    </div>

                    {/* STAT CARDS */}
                    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 animate-slideDown">
                        <StatCard label="Total Jenis" value={`${stats.jenis} jenis`} accent="bg-gray-700" icon={<svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>} />
                        <StatCard label="Total Stok" value={`${stats.tersedia} unit`} accent="bg-emerald-500" icon={<svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
                        <StatCard label="Nilai Stok" value={fmt(stats.nilai)} accent="bg-blue-500" icon={<svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>} />
                        {/* ── Kartu baru: Laba Kotor + badge GP% ── */}
                        <StatCard label="Laba Kotor" value={fmt(stats.labaKotor)} accent="bg-violet-500" badge={{ text: `${Math.round(stats.gpPersen)}%`, positive: stats.labaKotor >= 0 }} icon={<svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 17l6-6 4 4 8-8m0 0h-5m5 0v5" /></svg>} />
                        <StatCard label="Stok Habis" value={`${stats.habis} jenis`} accent="bg-red-500" icon={<svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>} />
                    </div>

                    {/* FILTER */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                            <div className="relative group lg:col-span-2"><div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-gray-600 transition-colors"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" /></svg></div><input className="w-full h-9 pl-8 pr-3 border border-gray-200 rounded-xl text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400/20 focus:border-gray-400 focus:bg-white transition-all font-medium placeholder:text-gray-400 placeholder:font-normal" placeholder="Cari nama, merk, spesifikasi..." value={search} onChange={e => handleSearch(e.target.value)} /></div>
                            <FilterSelect value={filterCategory} onChange={e => { setFilterCategory(e.target.value); fetchItems(1, search, e.target.value); }}><option value="">Semua Kategori</option>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</FilterSelect>
                            <button onClick={() => { setSearch(""); setFilterCategory(""); fetchItems(1, "", ""); }} disabled={!hasFilter} className="h-9 bg-gray-100 text-gray-600 rounded-xl px-3 text-sm font-medium hover:bg-gray-200 active:scale-[0.97] transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>Reset</button>
                        </div>
                    </div>

                    {/* TABLE */}
                    {fetching ? <SkeletonTable /> : items.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-24 text-center animate-fadeIn"><div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl"><Wrench size={30} className="text-gray-400" /></div><p className="text-gray-700 font-bold text-base">Belum ada data aksesori</p><p className="text-gray-400 text-sm mt-1.5">{hasFilter ? "Coba ubah filter pencarian" : "Klik tombol Tambah Aksesori untuk mulai"}</p></div>
                    ) : (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-slideUp">
                            <div className="overflow-x-auto table-scroll">
                                <table className="w-full text-sm border-collapse">
                                   <thead><tr className="bg-gray-50 border-b-2 border-gray-100"><Th center>No</Th><Th>Nama Aksesori</Th><Th>Kategori</Th><Th>Merk</Th><Th>Spek</Th><Th right>Harga Modal</Th><Th right>Harga Jual</Th><Th right>Gross Profit</Th><Th right>Stok</Th><Th center>Audit</Th><Th right>Aksi</Th></tr></thead>
                                    <tbody>
                                        {items.map((item, idx) => {
                                            const grossProfit = (item.sell_price || 0) - (item.buy_price || 0);
                                            return (
                                            <tr key={item.id} className="group cursor-pointer data-row border-b border-gray-50 last:border-0" onClick={() => { setSelectedAcc(item); setView("detail"); }}>
                                                <td className="px-4 py-3.5 text-center w-10"><span className="text-xs font-semibold text-gray-300 tabular-nums">{String((page - 1) * LIMIT + idx + 1).padStart(2, "0")}</span></td>
                                                <td className="px-4 py-3.5 max-w-[220px]"><span className="block font-semibold text-gray-800 truncate text-[13px]" title={item.name}>{item.name}</span>{item.notes && <span className="block text-[11px] text-gray-400 truncate mt-0.5">{item.notes}</span>}</td>
                                                <td className="px-4 py-3.5 whitespace-nowrap"><CategoryBadge cat={item.category} /></td>
                                                <td className="px-4 py-3.5 whitespace-nowrap"><span className="text-xs font-medium text-gray-500">{item.brand || <span className="text-gray-200">—</span>}</span></td>
                                                <td className="px-4 py-3.5 max-w-[160px]"><span className="block text-xs text-gray-600 truncate" title={item.spec ?? ""}>{item.spec || <span className="text-gray-200">—</span>}</span></td>
                                                <td className="px-4 py-3.5 text-right whitespace-nowrap"><span className="text-xs text-gray-500 tabular-nums">{item.buy_price > 0 ? fmt(item.buy_price) : <span className="text-gray-200">—</span>}</span></td>
                                                <td className="px-4 py-3.5 text-right whitespace-nowrap"><span className="text-[13px] font-bold text-gray-800 tabular-nums">{item.sell_price > 0 ? fmt(item.sell_price) : <span className="text-gray-200 font-medium">—</span>}</span></td>
                                                <td className="px-4 py-3.5 text-right whitespace-nowrap"><span className={`text-[13px] font-bold tabular-nums ${grossProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>{item.buy_price > 0 ? `${grossProfit >= 0 ? "+" : ""}${fmt(grossProfit)}` : <span className="text-gray-200 font-medium">—</span>}</span></td>
                                                <td className="px-4 py-3.5 text-right whitespace-nowrap"><span className={`inline-flex items-center justify-center min-w-[26px] px-2 py-0.5 rounded-lg text-xs font-bold tabular-nums ${(item.stock ?? 0) === 0 ? "bg-red-50 text-red-500 ring-1 ring-red-200" : (item.stock ?? 0) <= 2 ? "bg-amber-50 text-amber-600 ring-1 ring-amber-200" : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"}`}>{item.stock ?? 0}</span></td>
                                                <td className="px-4 py-3.5 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                                    <div className="flex items-center justify-center gap-1">
                                                        <button onClick={() => handleToggleAudit(item)} disabled={auditingId === item.id}
                                                            title={isAuditActive(item.audited_at) ? `Diaudit oleh ${item.audited_by ?? "—"} · klik untuk batalkan` : "Tandai sudah diaudit"}
                                                            className={`h-7 px-2.5 inline-flex items-center gap-1 text-[11px] font-semibold rounded-lg transition disabled:opacity-40 ${isAuditActive(item.audited_at) ? "text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 hover:bg-emerald-100" : "text-gray-500 bg-gray-100 hover:bg-gray-200"}`}>
                                                            {isAuditActive(item.audited_at) && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                                            {isAuditActive(item.audited_at) ? "Diaudit" : "Audit"}
                                                        </button>
                                                        <button onClick={() => setHistoryAcc(item)} title="Riwayat audit"
                                                            className="w-7 h-7 inline-flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition">
                                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                        </button>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3.5 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}><div className="flex items-center justify-end gap-1"><button onClick={() => { setEditAcc(item); setAccModalOpen(true); }} className="h-7 px-2.5 text-[11px] font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition">Edit</button><button onClick={() => setDeleteAcc(item)} className="h-7 px-2.5 text-[11px] font-semibold text-red-500 bg-red-50 rounded-lg hover:bg-red-100 transition">Hapus</button></div></td>
                                            </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="px-5 py-3.5 border-t border-gray-100 bg-gray-50/60 flex flex-wrap items-center justify-between gap-3">
                                {totalPages > 1 && (<div className="flex items-center gap-1.5"><button disabled={page <= 1} onClick={() => fetchItems(page - 1)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30 transition"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg></button>{Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(p => (<button key={p} onClick={() => fetchItems(p)} className={`w-7 h-7 rounded-lg text-xs font-bold transition ${p === page ? "bg-gray-800 text-white" : "text-gray-500 hover:bg-gray-100"}`}>{p}</button>))}<button disabled={page >= totalPages} onClick={() => fetchItems(page + 1)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30 transition"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg></button></div>)}
                            </div>
                        </div>
                    )}
                </div>
            </main>

            <AccessoryModal open={accModalOpen} onClose={() => { setAccModalOpen(false); setEditAcc(null); }} onSave={handleSaveAcc} initial={editAcc} loading={savingAcc} />
            {view === "detail" && (<AccessoryDetailModal accessory={selectedAcc} onClose={() => { setView(null); setSelectedAcc(null); }} onEdit={() => { setEditAcc(selectedAcc); setView(null); setAccModalOpen(true); }} onDelete={() => setDeleteAcc(selectedAcc)} />)}
            <DeleteConfirm open={!!deleteAcc} title="Hapus Aksesori" name={deleteAcc?.name ?? ""} onClose={() => setDeleteAcc(null)} onConfirm={handleDeleteAcc} loading={deletingAcc} />
            <AuditHistoryModal accessory={historyAcc} onClose={() => setHistoryAcc(null)} />
        </>
    );
}

export default function AccessoriesPage() {
    return (<AccessoriesContent />);
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED
// ═══════════════════════════════════════════════════════════════════════════
const inputCls = "w-full h-11 border border-gray-200 rounded-xl px-3.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400/20 focus:border-gray-400 focus:bg-white transition-all duration-150";
const textareaCls = "w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400/20 focus:border-gray-400 focus:bg-white transition-all duration-150 resize-none";
const labelCls = "block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5";

function Spinner() { return (<svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>); }

function StatCard({ label, value, accent, icon, badge }: { label: string; value: string; accent: string; icon: React.ReactNode; badge?: { text: string; positive: boolean } }) {
    return (<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3.5 hover:shadow-md transition-all duration-200"><div className={`w-1 h-10 rounded-full ${accent} flex-shrink-0`} /><div className="flex items-center gap-2.5 flex-1 min-w-0"><div className="w-8 h-8 bg-gray-50 rounded-xl flex items-center justify-center flex-shrink-0 border border-gray-100">{icon}</div><div className="min-w-0"><p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest truncate">{label}</p><div className="flex items-center gap-1.5"><p className="text-sm font-black text-gray-800 tabular-nums truncate">{value}</p>{badge && (<span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md tabular-nums flex-shrink-0 ${badge.positive ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}>{badge.text}</span>)}</div></div></div></div>);
}

function FilterSelect({ value, onChange, children }: { value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; children: React.ReactNode }) {
    return (<select value={value} onChange={onChange} className="filter-select h-9 border border-gray-200 rounded-xl px-3 text-xs bg-gray-50 text-gray-700 font-medium focus:outline-none focus:ring-2 focus:ring-gray-400/20 focus:border-gray-400 focus:bg-white transition-all cursor-pointer hover:bg-gray-100">{children}</select>);
}

function Th({ children, right, center }: { children: React.ReactNode; right?: boolean; center?: boolean }) {
    return (<th className={`px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap ${right ? "text-right" : center ? "text-center" : "text-left"}`}>{children}</th>);
}

function SkeletonTable() {
    return (<div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50 border-b-2 border-gray-100">{["No", "Nama Aksesori", "Kategori", "Merk", "Spek", "Modal", "Jual", "Gross Profit", "Stok", "Audit", "Aksi"].map(h => (<th key={h} className="px-4 py-3"><Shimmer h={10} /></th>))}</tr></thead><tbody>{[1, 2, 3, 4, 5, 6].map(r => (<tr key={r} className="border-b border-gray-50"><td className="px-4 py-3.5"><Shimmer w={24} h={12} /></td><td className="px-4 py-3.5"><Shimmer w={150} h={13} /></td><td className="px-4 py-3.5"><Shimmer w={60} h={18} r="6px" /></td><td className="px-4 py-3.5"><Shimmer w={60} h={12} /></td><td className="px-4 py-3.5"><Shimmer w={90} h={12} /></td><td className="px-4 py-3.5"><div className="flex justify-end"><Shimmer w={80} h={13} /></div></td><td className="px-4 py-3.5"><div className="flex justify-end"><Shimmer w={80} h={13} /></div></td><td className="px-4 py-3.5"><div className="flex justify-end"><Shimmer w={70} h={13} /></div></td><td className="px-4 py-3.5"><div className="flex justify-end"><Shimmer w={26} h={22} r="8px" /></div></td><td className="px-4 py-3.5"><div className="flex justify-center gap-1.5"><Shimmer w={56} h={28} r="8px" /><Shimmer w={28} h={28} r="8px" /></div></td><td className="px-4 py-3.5"><div className="flex justify-end gap-1.5"><Shimmer w={40} h={28} r="8px" /><Shimmer w={44} h={28} r="8px" /></div></td></tr>))}</tbody></table></div><div className="px-5 py-3.5 border-t border-gray-100 bg-gray-50/60"><Shimmer w={180} h={10} /></div></div>);
}