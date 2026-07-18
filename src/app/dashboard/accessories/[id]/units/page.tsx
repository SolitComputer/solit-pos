"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Link from "next/link";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
    HardDrive, MemoryStick, Plug, BatteryFull, Keyboard, Monitor,
    Package, CircuitBoard, Cpu, Gamepad2, Fan, Droplet, Cable, Wrench,
    Hash, Pencil, BarChart3, Download, CheckCircle2, Sparkles, RefreshCw, Lock, Wallet,
    type LucideIcon,
} from "lucide-react";

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
}

const fmt = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");

function fmtInput(val: number): string {
    if (!val) return "";
    return new Intl.NumberFormat("id-ID").format(val);
}
function parseRupiah(val: string): number {
    return parseInt(val.replace(/\D/g, ""), 10) || 0;
}

const CONDITION_STYLE: Record<string, { badge: string; label: string }> = {
    BARU: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Baru" },
    BEKAS: { badge: "bg-amber-50 text-amber-700 border-amber-200", label: "Bekas" },
};

const STATUS_STYLE: Record<string, { badge: string; dot: string; label: string }> = {
    TERSEDIA: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", label: "Tersedia" },
    RESERVED: { badge: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-400", label: "Reserved" },
    TERJUAL: { badge: "bg-gray-100 text-gray-500 border-gray-200", dot: "bg-gray-400", label: "Terjual" },
};

const CATEGORY_ICON: Record<string, LucideIcon> = {
    HDD: HardDrive, SSD: HardDrive, RAM: MemoryStick, CHARGER: Plug, BATERAI: BatteryFull,
    KEYBOARD: Keyboard, LCD: Monitor, CASING: Package, MOTHERBOARD: CircuitBoard,
    PROCESSOR: Cpu, VGA: Gamepad2, FAN: Fan, "THERMAL PASTE": Droplet,
    KABEL: Cable, LAINNYA: Wrench,
};

const EMPTY_UNIT_FORM = {
    serial_number: "",
    condition: "BARU" as "BARU" | "BEKAS",
    status: "TERSEDIA" as "TERSEDIA" | "TERJUAL" | "RESERVED",
    buy_price: "",
    selling_price: "",
    notes: "",
};

// ─── Price Input ─────────────────────────────────────────────────────────────
function PriceInput({ label, value, onChange, required }: {
    label: string; value: string;
    onChange: (v: string) => void; required?: boolean;
}) {
    return (
        <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
                {label}{required && <span className="text-red-400 ml-1">*</span>}
            </label>
            <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium pointer-events-none">Rp</span>
                <input
                    inputMode="numeric"
                    className="w-full h-9 border border-gray-200 rounded-lg pl-8 pr-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400/20 focus:border-gray-700 focus:bg-white transition tabular-nums"
                    placeholder="0"
                    value={value}
                    onChange={e => {
                        const raw = e.target.value.replace(/\D/g, "");
                        onChange(raw ? new Intl.NumberFormat("id-ID").format(parseInt(raw, 10)) : "");
                    }}
                />
            </div>
        </div>
    );
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────
function ConfirmModal({ message, onConfirm, onCancel }: {
    message: string; onConfirm: () => void; onCancel: () => void;
}) {
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onCancel]);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
                <div className="h-1 w-full bg-gradient-to-r from-gray-400 via-gray-600 to-gray-800" />
                <div className="bg-gray-800 px-5 py-4 flex items-center gap-3">
                    <div className="w-9 h-9 bg-white/15 rounded-xl flex items-center justify-center ring-1 ring-white/20 flex-shrink-0">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <div>
                        <p className="text-sm font-bold text-white">Konfirmasi Hapus</p>
                        <p className="text-[11px] text-white/60 mt-0.5">Tindakan ini tidak dapat dibatalkan</p>
                    </div>
                </div>
                <div className="p-5">
                    <p className="text-sm text-gray-600 text-center leading-relaxed mb-5">{message}</p>
                    <div className="flex gap-2">
                        <button onClick={onCancel} className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition">Batal</button>
                        <button onClick={onConfirm} className="flex-1 h-10 bg-gray-800 text-white rounded-xl text-sm font-semibold hover:bg-gray-900 transition shadow-lg shadow-gray-800/20">Hapus</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Th ──────────────────────────────────────────────────────────────────────
function Th({ children, right, center }: { children: React.ReactNode; right?: boolean; center?: boolean }) {
    return (
        <th className={`px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap ${right ? "text-right" : center ? "text-center" : "text-left"}`}>
            {children}
        </th>
    );
}

// ─── SkeletonUnits ────────────────────────────────────────────────────────────
function SkeletonUnits() {
    return (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gray-50/80 border-b border-gray-100">
                            {["SN", "Kondisi", "Tgl Masuk", "Harga Modal", "Harga Jual", "Margin", "Status", "Aksi"].map(h => (
                                <th key={h} className="px-4 py-3 text-left">
                                    <div className="h-2.5 bg-gray-200 rounded w-16 animate-pulse" />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {[...Array(4)].map((_, i) => (
                            <tr key={i}>
                                {[90, 60, 70, 80, 80, 70, 70, 60].map((w, j) => (
                                    <td key={j} className="px-4 py-3">
                                        <div className="h-3 bg-gray-100 rounded animate-pulse" style={{ width: w }} />
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// BULK ADD MODAL — Adaptasi dari laptop units untuk aksesori
// ═══════════════════════════════════════════════════════════════════════════
function BulkAddModal({
    accessoryId,
    defaultSellingPrice,
    onClose,
    onSuccess,
}: {
    accessoryId: string;
    defaultSellingPrice: number;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [tab, setTab] = useState<"range" | "manual" | "excel">("range");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const [condition, setCondition] = useState<"BARU" | "BEKAS">("BARU");
    const [status, setStatus] = useState<"TERSEDIA" | "RESERVED">("TERSEDIA");
    const [buyPrice, setBuyPrice] = useState("");
    const [sellPrice, setSellPrice] = useState(fmtInput(defaultSellingPrice || 0));
    const [notes, setNotes] = useState("");

    // Range
    const [snFrom, setSnFrom] = useState("");
    const [snTo, setSnTo] = useState("");

    // Manual
    const [manualText, setManualText] = useState("");

    // Excel
    const [excelRows, setExcelRows] = useState<any[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    function generateRange(from: string, to: string): string[] {
        const f = from.trim();
        const t = to.trim();
        if (!f || !t) return [];
        const fNum = parseInt(f, 10);
        const tNum = parseInt(t, 10);
        if (!isNaN(fNum) && !isNaN(tNum) && fNum <= tNum) {
            const padLen = Math.max(f.length, t.length);
            const result: string[] = [];
            for (let i = fNum; i <= tNum; i++) {
                result.push(String(i).padStart(padLen, "0"));
            }
            return result;
        }
        return f === t ? [f] : [f, t];
    }

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setError("");
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const wb = XLSX.read(ev.target?.result, { type: "binary" });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const raw = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
                const snKeys = ["serial_number", "sn", "Serial Number", "SN", "No SN", "no_sn"];
                const buyKeys = ["buy_price", "harga_modal", "Harga Modal", "modal", "buy"];
                const sellKeys = ["selling_price", "harga_jual", "Harga Jual", "jual", "sell"];
                const condKeys = ["condition", "kondisi", "Kondisi"];
                const noteKeys = ["notes", "note", "catatan", "Catatan"];
                const findKey = (row: any, keys: string[]) => keys.find(k => k in row) ?? null;
                const parsed = raw.map((row: any) => {
                    const snKey = findKey(row, snKeys);
                    const buyKey = findKey(row, buyKeys);
                    const sellKey = findKey(row, sellKeys);
                    const condKey = findKey(row, condKeys);
                    const noteKey = findKey(row, noteKeys);
                    const rawCond = condKey ? String(row[condKey]).toUpperCase().trim() : condition;
                    const normalizedCond = rawCond === "BEKAS" ? "BEKAS" : "BARU";
                    return {
                        serial_number: snKey ? String(row[snKey]).trim().toUpperCase() : "",
                        buy_price: buyKey ? Number(row[buyKey]) : 0,
                        selling_price: sellKey ? Number(row[sellKey]) : parseRupiah(sellPrice) || 0,
                        condition: normalizedCond,
                        notes: noteKey ? String(row[noteKey]) : "",
                    };
                }).filter((r: any) => r.serial_number);
                if (parsed.length === 0) {
                    setError("Tidak ada data SN valid di file. Pastikan ada kolom 'serial_number' atau 'SN'.");
                    return;
                }
                setExcelRows(parsed);
            } catch {
                setError("Gagal membaca file Excel. Pastikan format file benar.");
            }
        };
        reader.readAsBinaryString(file);
    };

    function buildUnits() {
        const defaults = {
            condition,
            status,
            buy_price: parseRupiah(buyPrice) || 0,
            selling_price: parseRupiah(sellPrice) || 0,
            notes: notes || "",
        };
        if (tab === "range") {
            const sns = generateRange(snFrom, snTo);
            return sns.map(sn => ({ serial_number: sn, ...defaults }));
        }
        if (tab === "manual") {
            const sns = manualText.split(/[\n,；,、]/).map(s => s.trim().toUpperCase()).filter(Boolean);
            return sns.map(sn => ({ serial_number: sn, ...defaults }));
        }
        if (tab === "excel") {
            return excelRows.map(r => ({
                serial_number: r.serial_number,
                condition: r.condition || defaults.condition,
                status: defaults.status,
                buy_price: r.buy_price || defaults.buy_price,
                selling_price: r.selling_price || defaults.selling_price,
                notes: r.notes || "",
            }));
        }
        return [];
    }

    const units = buildUnits();
    const unitCount = units.length;
    const canSubmit = unitCount > 0 && !loading;

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setLoading(true);
        setError("");
        try {
            const res = await fetch(`/api/accessory-units/bulk`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accessory_id: accessoryId, units }),
            });
            const result = await res.json();
            if (!result.success) {
                setError(result.message || "Gagal menambahkan units");
                return;
            }
            toast.success(`${result.count} unit berhasil ditambahkan`);
            onSuccess();
            onClose();
        } catch {
            setError("Terjadi kesalahan koneksi");
        } finally {
            setLoading(false);
        }
    };

    const downloadTemplate = () => {
        const ws = XLSX.utils.aoa_to_sheet([
            ["serial_number", "condition", "buy_price", "selling_price", "notes"],
            ["SN-HDD-001", "BARU", 150000, 250000, "mulus"],
            ["SN-HDD-002", "BEKAS", 100000, 200000, "bekas pakai"],
        ]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Units");
        XLSX.writeFile(wb, "template_bulk_accessory_units.xlsx");
    };

    const TABS = [
        { id: "range", label: "Range SN", icon: <Hash size={14} /> },
        { id: "manual", label: "Manual", icon: <Pencil size={14} /> },
        { id: "excel", label: "Import Excel", icon: <BarChart3 size={14} /> },
    ] as const;

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] sm:max-h-[88vh] sm:mx-4 overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
                    <div>
                        <h2 className="font-bold text-gray-800 text-base">Tambah Banyak Unit</h2>
                        <p className="text-xs text-gray-400 mt-0.5">Pilih cara input serial number</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 active:bg-gray-100 transition">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Tab selector */}
                <div className="flex px-5 pt-4 gap-2 flex-shrink-0">
                    {TABS.map(t => (
                        <button
                            key={t.id}
                            onClick={() => { setTab(t.id); setError(""); }}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition border ${tab === t.id
                                ? "bg-gray-800 text-white border-gray-800"
                                : "bg-white text-gray-500 border-gray-200 active:bg-gray-50"
                                }`}
                        >
                            <span>{t.icon}</span>
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Body */}
                <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4 overscroll-contain">

                    {tab === "range" && (
                        <div className="space-y-3">
                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                                <p className="text-xs text-blue-700">
                                    Masukkan SN awal dan SN akhir. Sistem akan otomatis generate semua SN di antaranya.
                                    Contoh: dari <code className="font-mono bg-blue-100 px-1 rounded">001</code> ke <code className="font-mono bg-blue-100 px-1 rounded">005</code> → 5 unit.
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">SN Awal</label>
                                    <input type="text" placeholder="001" value={snFrom} onChange={e => setSnFrom(e.target.value)}
                                        className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-700/20 focus:border-gray-700 focus:bg-white transition" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">SN Akhir</label>
                                    <input type="text" placeholder="005" value={snTo} onChange={e => setSnTo(e.target.value)}
                                        className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-700/20 focus:border-gray-700 focus:bg-white transition" />
                                </div>
                            </div>
                            {snFrom && snTo && (
                                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                    <p className="text-xs text-gray-500 mb-1">Total: <span className="font-bold text-gray-800">{generateRange(snFrom, snTo).length} unit</span></p>
                                    <p className="text-xs text-gray-400 font-mono">
                                        {generateRange(snFrom, snTo).slice(0, 5).join(", ")}
                                        {generateRange(snFrom, snTo).length > 5 && ` ... +${generateRange(snFrom, snTo).length - 5} lagi`}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {tab === "manual" && (
                        <div className="space-y-3">
                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                                <p className="text-xs text-blue-700">Ketik atau paste serial number, satu per baris (atau pisahkan dengan koma).</p>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1.5">Daftar Serial Number</label>
                                <textarea
                                    placeholder={"SN-HDD-001\nSN-HDD-002\nSN-HDD-003\natau: SN-HDD-001, SN-HDD-002"}
                                    value={manualText} onChange={e => setManualText(e.target.value)} rows={6}
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-700/20 focus:border-gray-700 focus:bg-white transition resize-none" />
                            </div>
                            {manualText.trim() && (
                                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                    <p className="text-xs text-gray-500">Total: <span className="font-bold text-gray-800">
                                        {manualText.split(/[\n,；,、]/).map(s => s.trim()).filter(Boolean).length} unit
                                    </span></p>
                                </div>
                            )}
                        </div>
                    )}

                    {tab === "excel" && (
                        <div className="space-y-3">
                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                                <p className="text-xs text-blue-700 mb-2">
                                    Upload file Excel (.xlsx/.xls). Kolom yang dikenali: <code className="bg-blue-100 px-1 rounded font-mono">serial_number</code>, <code className="bg-blue-100 px-1 rounded font-mono">condition</code>, <code className="bg-blue-100 px-1 rounded font-mono">buy_price</code>, <code className="bg-blue-100 px-1 rounded font-mono">selling_price</code>, <code className="bg-blue-100 px-1 rounded font-mono">notes</code>.
                                </p>
                                <button onClick={downloadTemplate} className="inline-flex items-center gap-1 text-xs text-blue-600 font-semibold underline underline-offset-2"><Download size={13} /> Download Template Excel</button>
                            </div>
                            <div onClick={() => fileInputRef.current?.click()}
                                className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer active:bg-gray-50 transition">
                                <div className="mb-2 flex justify-center"><BarChart3 size={30} className="text-gray-400" /></div>
                                <p className="text-sm font-medium text-gray-600">Klik untuk pilih file</p>
                                <p className="text-xs text-gray-400 mt-1">.xlsx atau .xls</p>
                                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="hidden" />
                            </div>
                            {excelRows.length > 0 && (
                                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                                    <p className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 mb-2"><CheckCircle2 size={14} /> {excelRows.length} baris berhasil dibaca</p>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-[10px]">
                                            <thead>
                                                <tr className="text-gray-500">
                                                    <th className="text-left pb-1">SN</th>
                                                    <th className="text-left pb-1">Kondisi</th>
                                                    <th className="text-right pb-1">Harga Jual</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {excelRows.slice(0, 5).map((r: any, i: number) => (
                                                    <tr key={i} className="border-t border-emerald-100">
                                                        <td className="py-0.5 font-mono text-gray-700">{r.serial_number}</td>
                                                        <td className="py-0.5 text-gray-600">{r.condition}</td>
                                                        <td className="py-0.5 text-right text-gray-600">
                                                            {r.selling_price ? `Rp${Number(r.selling_price).toLocaleString("id-ID")}` : "—"}
                                                        </td>
                                                    </tr>
                                                ))}
                                                {excelRows.length > 5 && (
                                                    <tr><td colSpan={3} className="text-center pt-1 text-gray-400">... +{excelRows.length - 5} baris lagi</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Default values section (for range & manual tabs) */}
                    {tab !== "excel" && (
                        <div className="border-t border-gray-100 pt-4 space-y-3">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Nilai Default Semua Unit</p>

                            {/* Kondisi: BARU / BEKAS */}
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1.5">Kondisi</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {(["BARU", "BEKAS"] as const).map(c => (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => setCondition(c)}
                                            className={`inline-flex items-center justify-center gap-1 h-9 rounded-lg text-xs font-bold border transition ${condition === c
                                                ? c === "BARU"
                                                    ? "bg-emerald-600 text-white border-emerald-600"
                                                    : "bg-amber-500 text-white border-amber-500"
                                                : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                                                }`}
                                        >
                                            {c === "BARU" ? <><Sparkles size={13} /> Baru</> : <><RefreshCw size={13} /> Bekas</>}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Status: TERSEDIA / RESERVED */}
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1.5">Status</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {(["TERSEDIA", "RESERVED"] as const).map(s => (
                                        <button
                                            key={s}
                                            type="button"
                                            onClick={() => setStatus(s)}
                                            className={`inline-flex items-center justify-center gap-1 h-9 rounded-lg text-xs font-semibold border transition ${status === s
                                                ? s === "TERSEDIA"
                                                    ? "bg-emerald-600 text-white border-emerald-600"
                                                    : "bg-amber-500 text-white border-amber-500"
                                                : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                                                }`}
                                        >
                                            {s === "TERSEDIA" ? <><CheckCircle2 size={13} /> Tersedia</> : <><Lock size={13} /> Reserved</>}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Harga */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Harga Modal</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium pointer-events-none">Rp</span>
                                        <input
                                            inputMode="numeric"
                                            placeholder="0"
                                            value={buyPrice}
                                            onChange={e => {
                                                const raw = e.target.value.replace(/\D/g, "");
                                                setBuyPrice(raw ? new Intl.NumberFormat("id-ID").format(parseInt(raw, 10)) : "");
                                            }}
                                            className="w-full h-9 border border-gray-200 rounded-lg pl-8 pr-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-700/20 focus:border-gray-700 focus:bg-white transition tabular-nums"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Harga Jual</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium pointer-events-none">Rp</span>
                                        <input
                                            inputMode="numeric"
                                            placeholder="0"
                                            value={sellPrice}
                                            onChange={e => {
                                                const raw = e.target.value.replace(/\D/g, "");
                                                setSellPrice(raw ? new Intl.NumberFormat("id-ID").format(parseInt(raw, 10)) : "");
                                            }}
                                            className="w-full h-9 border border-gray-200 rounded-lg pl-8 pr-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-700/20 focus:border-gray-700 focus:bg-white transition tabular-nums"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Catatan */}
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                    Catatan <span className="text-gray-400 font-normal">(opsional)</span>
                                </label>
                                <input
                                    type="text"
                                    placeholder="Kondisi khusus, dll"
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                    className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-700/20 focus:border-gray-700 focus:bg-white transition"
                                />
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                            <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                            </svg>
                            <p className="text-xs text-red-700">{error}</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
                    <button onClick={onClose} disabled={loading}
                        className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium active:bg-gray-200 transition disabled:opacity-50">
                        Batal
                    </button>
                    <button onClick={handleSubmit} disabled={!canSubmit}
                        className="flex-1 h-11 bg-gray-800 text-white rounded-xl text-sm font-semibold active:bg-gray-900 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-gray-800/20">
                        {loading ? (
                            <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</>
                        ) : (
                            <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>Tambah {unitCount > 0 ? `${unitCount} Unit` : "Unit"}</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════
export default function AccessoryUnitsPage() {
    const params = useParams();
    const accessoryId = params.id as string;

    const [accessory, setAccessory] = useState<Accessory | null>(null);
    const [units, setUnits] = useState<AccessoryUnit[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Form
    const [showForm, setShowForm] = useState(false);
    const [editingUnit, setEditingUnit] = useState<AccessoryUnit | null>(null);
    const [formData, setFormData] = useState<typeof EMPTY_UNIT_FORM>({ ...EMPTY_UNIT_FORM });
    const [buyInput, setBuyInput] = useState("");
    const [sellInput, setSellInput] = useState("");
    const [formLoading, setFormLoading] = useState(false);

    // Filters
    const [filterStatus, setFilterStatus] = useState("ALL");
    const [filterCondition, setFilterCondition] = useState("ALL");
    const [searchSN, setSearchSN] = useState("");
    const [showAdvancedFilter, setShowAdvancedFilter] = useState(false);
    const [filterPriceMin, setFilterPriceMin] = useState("");
    const [filterPriceMax, setFilterPriceMax] = useState("");

    // Bulk
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [showBulkModal, setShowBulkModal] = useState(false);

    // Confirm
    const [confirmModal, setConfirmModal] = useState<{ message: string; onConfirm: () => void } | null>(null);

    useEffect(() => { setSelectedIds(new Set()); }, [filterStatus, filterCondition, searchSN]);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [accRes, unitsRes] = await Promise.all([
                fetch(`/api/accessories/${accessoryId}`),
                fetch(`/api/accessory-units?accessory_id=${accessoryId}`),
            ]);
            const accData = await accRes.json();
            const unitsData = await unitsRes.json();
            if (accData.data) setAccessory(accData.data);
            if (unitsData.data) {
                const normalized: AccessoryUnit[] = (unitsData.data as AccessoryUnit[]).map(u => ({
                    ...u,
                    buy_price: Math.round(Number(u.buy_price) || 0),
                    selling_price: Math.round(Number(u.selling_price) || 0),
                }));
                setUnits(normalized);
            }
        } catch { /* ignore */ } finally { setIsLoading(false); }
    }, [accessoryId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const fmtDate = (iso: string) => {
        if (!iso) return "—";
        return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
    };

    // ── Stats ──
    const activeUnits = units.filter(u => u.status !== "TERJUAL");
    const counts = {
        total: activeUnits.length,
        tersedia: activeUnits.filter(u => u.status === "TERSEDIA").length,
        reserved: activeUnits.filter(u => u.status === "RESERVED").length,
        terjual: units.filter(u => u.status === "TERJUAL").length,
        baru: activeUnits.filter(u => u.condition === "BARU").length,
        bekas: activeUnits.filter(u => u.condition === "BEKAS").length,
    };

    // ── Filter ──
    const filteredUnits = units.filter(u => {
        if (filterStatus !== "ALL" && u.status !== filterStatus) return false;
        if (filterCondition !== "ALL" && u.condition !== filterCondition) return false;
        if (searchSN && !u.serial_number.toLowerCase().includes(searchSN.toLowerCase())) return false;
        if (filterPriceMin && u.selling_price < Number(filterPriceMin)) return false;
        if (filterPriceMax && u.selling_price > Number(filterPriceMax)) return false;
        return true;
    });

    const hasActiveFilter = searchSN || filterPriceMin || filterPriceMax;
    const isAllSelected = filteredUnits.length > 0 && filteredUnits.every(u => selectedIds.has(u.id));
    const isIndeterminate = filteredUnits.some(u => selectedIds.has(u.id)) && !isAllSelected;

    const toggleSelectAll = () => {
        if (isAllSelected) setSelectedIds(new Set());
        else setSelectedIds(new Set(filteredUnits.map(u => u.id)));
    };
    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const resetFilters = () => {
        setSearchSN(""); setFilterPriceMin(""); setFilterPriceMax("");
        setFilterStatus("ALL"); setFilterCondition("ALL");
    };

    // ── Form open ──
    const openCreate = () => {
        setEditingUnit(null);
        setFormData({ ...EMPTY_UNIT_FORM, selling_price: fmtInput(accessory?.sell_price ?? 0) });
        setBuyInput("");
        setSellInput(fmtInput(accessory?.sell_price ?? 0));
        setShowForm(true);
    };

    const openEdit = (unit: AccessoryUnit) => {
        setEditingUnit(unit);
        setFormData({
            serial_number: unit.serial_number,
            condition: unit.condition,
            status: unit.status,
            buy_price: fmtInput(unit.buy_price),
            selling_price: fmtInput(unit.selling_price),
            notes: unit.notes ?? "",
        });
        setBuyInput(fmtInput(unit.buy_price));
        setSellInput(fmtInput(unit.selling_price));
        setShowForm(true);
    };

    const closeForm = () => { setShowForm(false); setEditingUnit(null); };

    // ── Submit form ──
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.serial_number.trim()) { toast.error("Serial number wajib diisi"); return; }
        setFormLoading(true);
        try {
            const payload = {
                serial_number: formData.serial_number.trim().toUpperCase(),
                condition: formData.condition,
                status: formData.status,
                buy_price: parseRupiah(buyInput),
                selling_price: parseRupiah(sellInput),
                notes: formData.notes || null,
                ...(!editingUnit ? { accessory_id: accessoryId } : {}),
            };
            const url = editingUnit
                ? `/api/accessory-units/${editingUnit.id}`
                : `/api/accessory-units`;
            const method = editingUnit ? "PATCH" : "POST";
            const res = await fetch(url, {
                method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
            });
            const result = await res.json();
            if (!result.success) { toast.error(result.error ?? result.message ?? "Gagal menyimpan"); return; }
            toast.success(editingUnit ? "Unit diperbarui" : "Unit ditambahkan");
            closeForm();
            fetchData();
        } catch { toast.error("Terjadi kesalahan"); }
        finally { setFormLoading(false); }
    };

    // ── Delete single ──
    const handleDelete = (unit: AccessoryUnit) => {
        setConfirmModal({
            message: `Hapus unit SN: ${unit.serial_number}?`,
            onConfirm: async () => {
                setConfirmModal(null);
                try {
                    const res = await fetch(`/api/accessory-units/${unit.id}`, { method: "DELETE" });
                    const json = await res.json();
                    if (!json.success) { toast.error(json.error ?? "Gagal menghapus"); return; }
                    toast.success("Unit dihapus");
                    fetchData();
                } catch { toast.error("Gagal menghapus"); }
            },
        });
    };

    // ── Bulk delete ──
    const handleBulkDelete = () => {
        if (selectedIds.size === 0) return;
        setConfirmModal({
            message: `Hapus ${selectedIds.size} unit yang dipilih? Tindakan ini tidak dapat dibatalkan.`,
            onConfirm: async () => {
                setConfirmModal(null);
                setBulkDeleting(true);
                try {
                    await Promise.all(Array.from(selectedIds).map(id =>
                        fetch(`/api/accessory-units/${id}`, { method: "DELETE" })
                    ));
                    toast.success(`${selectedIds.size} unit dihapus`);
                    setSelectedIds(new Set());
                    fetchData();
                } catch { toast.error("Gagal menghapus beberapa unit"); }
                finally { setBulkDeleting(false); }
            },
        });
    };

    const buyVal = parseRupiah(buyInput);
    const sellVal = parseRupiah(sellInput);
    const marginPreview = sellVal - buyVal;
    const CatIcon = (accessory && CATEGORY_ICON[accessory.category]) || Wrench;

    return (
        <DashboardLayout>
            <main className="min-h-screen bg-gradient-to-br from-gray-50 to-white p-4 sm:p-6 lg:p-8">
                <div className="max-w-7xl mx-auto space-y-5">

                    {/* Breadcrumb */}
                    <div className="flex items-center gap-2 text-sm">
                        <Link href="/dashboard/accessories" className="text-gray-400 hover:text-gray-600 transition">
                            Data Aksesori
                        </Link>
                        <svg className="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span className="text-gray-600 font-medium truncate">
                            {isLoading ? "Memuat..." : accessory?.name || "Units"}
                        </span>
                    </div>

                    {/* Header */}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <div className="flex items-center gap-2.5 mb-1">
                                <div className="w-8 h-8 bg-gray-800 rounded-xl flex items-center justify-center text-lg flex-shrink-0">
                                    <CatIcon size={18} className="text-white" />
                                </div>
                                <h1 className="text-xl font-bold text-gray-900 tracking-tight">{accessory?.name || "—"}</h1>
                            </div>
                            <p className="text-xs text-gray-400 ml-10">
                                {[accessory?.brand, accessory?.spec, accessory?.category]
                                    .filter(Boolean).join(" · ") || "Detail aksesori"}
                            </p>
                        </div>
                        {/* ── CHANGED: 2 buttons — Tambah Unit + Tambah Banyak ── */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={openCreate}
                                className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-800 rounded-lg text-sm font-medium text-white hover:bg-gray-900 transition shadow-sm"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                Tambah Unit
                            </button>
                            <button
                                onClick={() => setShowBulkModal(true)}
                                className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-600 rounded-lg text-sm font-medium text-white hover:bg-gray-700 transition shadow-sm"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                Tambah Banyak
                            </button>
                        </div>
                    </div>

                    {/* Stats Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                            { label: "Total Unit", value: counts.total, color: "text-gray-800", icon: <Package size={16} /> },
                            { label: "Tersedia", value: counts.tersedia, color: "text-emerald-600", icon: <CheckCircle2 size={16} /> },
                            { label: "Reserved", value: counts.reserved, color: "text-amber-600", icon: <Lock size={16} /> },
                            { label: "Terjual", value: counts.terjual, color: "text-gray-500", icon: <Wallet size={16} /> },
                        ].map(stat => (
                            <div key={stat.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs text-gray-400">{stat.label}</p>
                                    <span className="text-sm opacity-50">{stat.icon}</span>
                                </div>
                                <p className={`text-xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
                            </div>
                        ))}
                    </div>

                    {/* Condition Tabs */}
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-1.5">
                        <div className="flex gap-1.5">
                            {[
                                { value: "ALL", label: "Semua Kondisi", count: units.length },
                                { value: "BARU", label: "Baru", count: counts.baru },
                                { value: "BEKAS", label: "Bekas", count: counts.bekas },
                            ].map(opt => {
                                const isActive = filterCondition === opt.value;
                                let activeStyle = "bg-gray-800 text-white";
                                if (opt.value === "BARU" && isActive) activeStyle = "bg-emerald-600 text-white";
                                if (opt.value === "BEKAS" && isActive) activeStyle = "bg-amber-500 text-white";
                                return (
                                    <button key={opt.value} onClick={() => setFilterCondition(opt.value)}
                                        className={`flex-1 flex flex-col items-center py-2 px-1 rounded-lg text-center transition-all ${isActive ? activeStyle : "text-gray-500 hover:bg-gray-50"}`}>
                                        <span className={`text-[10px] font-medium leading-tight ${isActive ? "opacity-80" : "opacity-60"}`}>{opt.label}</span>
                                        <span className="text-sm font-bold leading-tight mt-0.5">{opt.count}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Status Tabs */}
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-2">
                        <div className="flex flex-wrap gap-1.5">
                            {[
                                { value: "ALL", label: "Semua Status", count: units.length },
                                { value: "TERSEDIA", label: "Tersedia", count: counts.tersedia },
                                { value: "RESERVED", label: "Reserved", count: counts.reserved },
                                { value: "TERJUAL", label: "Terjual", count: counts.terjual },
                            ].map(opt => (
                                <button key={opt.value} onClick={() => setFilterStatus(opt.value)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${filterStatus === opt.value ? "bg-gray-800 text-white shadow-sm" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                                    {opt.label}
                                    <span className={`ml-1.5 px-1.5 py-0.5 rounded text-xs ${filterStatus === opt.value ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}>
                                        {opt.count}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Search & Filter */}
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-3">
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input type="text" placeholder="Cari serial number..."
                                    value={searchSN} onChange={e => setSearchSN(e.target.value)}
                                    className="w-full h-9 border border-gray-200 rounded-lg pl-9 pr-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-700/20 focus:border-gray-700 focus:bg-white transition" />
                                {searchSN && (
                                    <button onClick={() => setSearchSN("")} className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 transition">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                            <button onClick={() => setShowAdvancedFilter(v => !v)}
                                className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-medium border transition ${showAdvancedFilter || filterPriceMin || filterPriceMax ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                                </svg>
                                Filter
                                {(filterPriceMin || filterPriceMax) && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                            </button>
                            {(hasActiveFilter || filterStatus !== "ALL" || filterCondition !== "ALL") && (
                                <button onClick={resetFilters} className="inline-flex items-center gap-1 px-2.5 h-9 rounded-lg text-xs font-medium text-red-500 border border-red-200 bg-red-50 hover:bg-red-100 transition">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    Reset
                                </button>
                            )}
                        </div>
                        {showAdvancedFilter && (
                            <div className="border-t border-gray-100 pt-3 grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Harga Jual Min (Rp)</label>
                                    <input type="number" placeholder="Contoh: 100000" value={filterPriceMin} onChange={e => setFilterPriceMin(e.target.value)}
                                        className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-700/20 focus:border-gray-700 focus:bg-white transition" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Harga Jual Max (Rp)</label>
                                    <input type="number" placeholder="Contoh: 5000000" value={filterPriceMax} onChange={e => setFilterPriceMax(e.target.value)}
                                        className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-700/20 focus:border-gray-700 focus:bg-white transition" />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Bulk Action Bar */}
                    {selectedIds.size > 0 && (
                        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                            <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded bg-red-500 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                    </svg>
                                </span>
                                <p className="text-sm font-semibold text-red-700">{selectedIds.size} unit dipilih</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setSelectedIds(new Set())} className="text-xs text-red-500 font-medium underline underline-offset-2 transition">Batal pilih</button>
                                <button onClick={handleBulkDelete} disabled={bulkDeleting}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-semibold transition disabled:opacity-50">
                                    {bulkDeleting
                                        ? <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menghapus...</>
                                        : <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>Hapus {selectedIds.size} Unit</>
                                    }
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Table */}
                    {isLoading ? (
                        <SkeletonUnits />
                    ) : filteredUnits.length === 0 ? (
                        <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-12 text-center">
                            <div className="mb-2 opacity-50 flex justify-center"><Package size={30} className="text-gray-400" /></div>
                            <p className="text-gray-500 text-sm font-medium">Tidak ada unit ditemukan</p>
                            <p className="text-gray-400 text-xs mt-1">
                                {hasActiveFilter || filterStatus !== "ALL" || filterCondition !== "ALL"
                                    ? "Coba ubah filter pencarian"
                                    : "Klik 'Tambah Unit' untuk mendaftarkan SN"}
                            </p>
                            {(hasActiveFilter || filterStatus !== "ALL" || filterCondition !== "ALL") && (
                                <button onClick={resetFilters} className="mt-3 px-4 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200 transition">
                                    Reset semua filter
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-gray-50/80 border-b border-gray-100">
                                            <th className="px-4 py-3 w-14">
                                                <button onClick={toggleSelectAll}
                                                    className={`w-4 h-4 rounded border-2 flex items-center justify-center transition flex-shrink-0 ${isAllSelected ? "bg-gray-800 border-gray-800" : isIndeterminate ? "bg-gray-300 border-gray-300" : "bg-white border-gray-300 hover:border-gray-400"}`}>
                                                    {(isAllSelected || isIndeterminate) && (
                                                        <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d={isIndeterminate ? "M5 12h14" : "M5 13l4 4L19 7"} />
                                                        </svg>
                                                    )}
                                                </button>
                                            </th>
                                            <Th>Serial Number</Th>
                                            <Th>Kondisi</Th>
                                            <Th>Tgl Masuk</Th>
                                            <Th right>Harga Modal</Th>
                                            <Th right>Harga Jual</Th>
                                            <Th right>Margin</Th>
                                            <Th>Status</Th>
                                            <Th right>Aksi</Th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {filteredUnits.map(unit => {
                                            const s = STATUS_STYLE[unit.status];
                                            const c = CONDITION_STYLE[unit.condition];
                                            const margin = (unit.selling_price || 0) - (unit.buy_price || 0);
                                            const isSelected = selectedIds.has(unit.id);
                                            return (
                                                <tr key={unit.id} className={`transition-colors group ${isSelected ? "bg-red-50/60" : "hover:bg-gray-50/60"}`}>
                                                    <td className="px-4 py-3">
                                                        <button onClick={() => toggleSelect(unit.id)}
                                                            className={`w-4 h-4 rounded border-2 flex items-center justify-center transition flex-shrink-0 ${isSelected ? "bg-red-500 border-red-500" : "bg-white border-gray-300 hover:border-gray-400"}`}>
                                                            {isSelected && (
                                                                <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                                </svg>
                                                            )}
                                                        </button>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className="font-mono text-xs text-gray-700 bg-gray-100 px-2 py-1 rounded">{unit.serial_number}</span>
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        {c && <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${c.badge}`}>{c.label}</span>}
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        <span className="text-xs text-gray-500">{fmtDate(unit.created_at)}</span>
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-xs text-gray-500 whitespace-nowrap tabular-nums">
                                                        {unit.buy_price > 0 ? fmt(unit.buy_price) : <span className="text-gray-300">—</span>}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap tabular-nums">
                                                        {fmt(unit.selling_price)}
                                                    </td>
                                                    <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                                                        {unit.buy_price > 0
                                                            ? <span className={`text-xs font-semibold ${margin >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                                                {margin >= 0 ? "+" : ""}{fmt(Math.abs(margin))}
                                                            </span>
                                                            : <span className="text-gray-300 text-xs">—</span>
                                                        }
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        {s && (
                                                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${s.badge}`}>
                                                                <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                                                                {s.label}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center justify-end gap-1">
                                                            {unit.status !== "TERJUAL" && (
                                                                <button onClick={() => openEdit(unit)}
                                                                    className="h-8 px-3 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition">
                                                                    Edit
                                                                </button>
                                                            )}
                                                            {unit.status !== "TERJUAL" && (
                                                                <button onClick={() => handleDelete(unit)}
                                                                    className="h-8 w-8 rounded-lg text-red-500 hover:bg-red-50 transition flex items-center justify-center" title="Hapus Unit">
                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                    </svg>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/40 flex items-center justify-between">
                                <span className="text-xs text-gray-400">
                                    Menampilkan <span className="font-medium text-gray-600">{filteredUnits.length}</span> dari <span className="font-medium text-gray-600">{units.length}</span> unit
                                </span>
                                {(hasActiveFilter || filterStatus !== "ALL" || filterCondition !== "ALL") && (
                                    <span className="text-xs text-amber-600 font-medium">Filter aktif</span>
                                )}
                            </div>
                        </div>
                    )}

                </div>
            </main>

            {/* ── Form Modal ── */}
            {showForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeForm} />
                    <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
                        {/* Header */}
                        <div className="h-0.5 w-full bg-gradient-to-r from-gray-300 via-gray-700 to-gray-900 flex-shrink-0" />
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
                            <div>
                                <h3 className="font-bold text-gray-900 text-[15px] tracking-tight">
                                    {editingUnit ? "Edit Unit" : "Tambah Unit Baru"}
                                </h3>
                                <p className="text-[11px] text-gray-400 mt-0.5 truncate max-w-[260px]">{accessory?.name}</p>
                            </div>
                            <button onClick={closeForm} className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 active:scale-90 transition-all">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="overflow-y-auto flex-1 px-6 py-5">
                            <form onSubmit={handleSubmit} className="space-y-4">

                                {/* Serial Number */}
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                        Serial Number <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                        placeholder="cth. SN-HDD-001"
                                        value={formData.serial_number}
                                        onChange={e => setFormData(p => ({ ...p, serial_number: e.target.value.toUpperCase() }))}
                                        required
                                        className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm font-mono uppercase bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-700/20 focus:border-gray-700 focus:bg-white transition"
                                    />
                                </div>

                                {/* Kondisi */}
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Kondisi</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {(["BARU", "BEKAS"] as const).map(c => (
                                            <button key={c} type="button"
                                                onClick={() => setFormData(p => ({ ...p, condition: c }))}
                                                className={`inline-flex items-center justify-center gap-1 h-10 rounded-xl text-xs font-bold border transition ${formData.condition === c ? (c === "BARU" ? "bg-emerald-600 text-white border-emerald-600" : "bg-amber-500 text-white border-amber-500") : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
                                                {c === "BARU" ? <><Sparkles size={13} /> Baru</> : <><RefreshCw size={13} /> Bekas</>}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Status (edit only untuk TERSEDIA/RESERVED) */}
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Status</label>
                                    {formData.status === "TERJUAL" ? (
                                        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border-2 border-gray-200 bg-gray-50">
                                            <span className="w-2.5 h-2.5 rounded-full bg-gray-400 flex-shrink-0" />
                                            <div>
                                                <p className="text-sm font-bold text-gray-600">Terjual</p>
                                                <p className="text-[10px] text-gray-400 mt-0.5">Status ini tidak dapat diubah melalui form edit.</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-2">
                                            {(["TERSEDIA", "RESERVED"] as const).map(s => (
                                                <button key={s} type="button"
                                                    onClick={() => setFormData(p => ({ ...p, status: s }))}
                                                    className={`py-2.5 px-3 rounded-xl text-left border-2 transition-all ${formData.status === s
                                                        ? s === "TERSEDIA" ? "border-emerald-500 bg-emerald-50" : "border-amber-500 bg-amber-50"
                                                        : "border-gray-200 bg-white hover:border-gray-300"
                                                        }`}>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${formData.status === s ? (s === "TERSEDIA" ? "bg-emerald-500" : "bg-amber-400") : "bg-gray-300"}`} />
                                                        <p className={`text-xs font-bold ${formData.status === s ? (s === "TERSEDIA" ? "text-emerald-700" : "text-amber-700") : "text-gray-600"}`}>
                                                            {s === "TERSEDIA" ? "Tersedia" : "Reserved"}
                                                        </p>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Harga */}
                                <div className="grid grid-cols-2 gap-3">
                                    <PriceInput label="Harga Modal" value={buyInput} onChange={setBuyInput} />
                                    <PriceInput label="Harga Jual" value={sellInput} onChange={setSellInput} required />
                                </div>

                                {/* Margin Preview */}
                                {buyVal > 0 && sellVal > 0 && (
                                    <div className="bg-gray-50 rounded-xl px-3.5 py-2.5 border border-gray-100">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Estimasi Margin</span>
                                            <span className={`text-sm font-black tabular-nums ${marginPreview >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                                {marginPreview >= 0 ? "+" : ""}{fmt(marginPreview)}
                                                <span className="text-[10px] font-medium ml-1 opacity-70">
                                                    ({Math.round((marginPreview / buyVal) * 100)}%)
                                                </span>
                                            </span>
                                        </div>
                                        <div className="mt-1.5 h-1 bg-gray-200 rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full transition-all ${marginPreview >= 0 ? "bg-emerald-500" : "bg-red-500"}`}
                                                style={{ width: `${Math.min(100, Math.max(0, (marginPreview / sellVal) * 100))}%` }} />
                                        </div>
                                    </div>
                                )}

                                {/* Notes */}
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                        Catatan <span className="text-gray-400 font-normal">(opsional)</span>
                                    </label>
                                    <input
                                        placeholder="Kondisi khusus, dll"
                                        value={formData.notes}
                                        onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
                                        className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-700/20 focus:border-gray-700 focus:bg-white transition"
                                    />
                                </div>

                                <div className="flex gap-2 pt-2">
                                    <button type="button" onClick={closeForm}
                                        className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition">
                                        Batal
                                    </button>
                                    <button type="submit" disabled={formLoading}
                                        className="flex-1 h-10 bg-gray-800 text-white rounded-xl text-sm font-semibold hover:bg-gray-900 transition disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-lg shadow-gray-800/20">
                                        {formLoading && (
                                            <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                            </svg>
                                        )}
                                        {editingUnit ? "Simpan" : "Tambah Unit"}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Bulk Add Modal ── */}
            {showBulkModal && (
                <BulkAddModal
                    accessoryId={accessoryId}
                    defaultSellingPrice={accessory?.sell_price ?? 0}
                    onClose={() => setShowBulkModal(false)}
                    onSuccess={fetchData}
                />
            )}

            {confirmModal && (
                <ConfirmModal
                    message={confirmModal.message}
                    onConfirm={confirmModal.onConfirm}
                    onCancel={() => setConfirmModal(null)}
                />
            )}
        </DashboardLayout>
    );
}