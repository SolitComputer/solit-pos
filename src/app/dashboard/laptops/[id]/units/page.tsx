"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Link from "next/link";
import { UserRole, PERMISSIONS, hasPermission } from "@/lib/permissions";
import * as XLSX from "xlsx";
import { Trash2 } from "lucide-react";

interface LaptopUnit {
    id: string;
    laptop_id: string;
    serial_number: string;
    grade: "A" | "B" | "C";
    condition_note: string;
    purchase_price: number;
    selling_price: number;
    status: string;
    notes: string;
    received_at?: string;
    created_at: string;
}

interface Laptop {
    id: string;
    laptop_name: string;
    brand: string;
    cpu: string;
    ram: string;
    storage: string;
    selling_price: number;
}

const fmt = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");

const GRADE_STYLE: Record<string, { badge: string; label: string; desc: string; color: string }> = {
    A: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Grade A", desc: "Sempurna", color: "emerald" },
    B: { badge: "bg-amber-50 text-amber-700 border-amber-200", label: "Grade B", desc: "Minus", color: "amber" },
    C: { badge: "bg-red-50 text-red-700 border-red-200", label: "Grade C", desc: "Banyak minus", color: "red" },
};

const STATUS_STYLE: Record<string, { badge: string; dot: string; label: string }> = {
    SIAP_JUAL: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", label: "Siap Jual" },
    BELUM_SIAP: { badge: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-400", label: "Belum Siap" },
    SERVICE: { badge: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-500", label: "Service" },
    SOLD: { badge: "bg-gray-100 text-gray-500 border-gray-200", dot: "bg-gray-400", label: "Terjual" },
};

const GRADE_ORDER: Record<string, number> = { A: 0, B: 1, C: 2 };

const EMPTY_FORM = {
    serial_number: "",
    grade: "A",
    condition_note: "",
    purchase_price: "",
    selling_price: "",
    status: "SIAP_JUAL",
    notes: "",
    received_at: "",
};

const GRADE_FORM_STYLE: Record<string, { border: string; text: string; sub: string }> = {
    A: { border: "border-emerald-400 bg-emerald-50", text: "text-emerald-700", sub: "text-emerald-500" },
    B: { border: "border-amber-400 bg-amber-50", text: "text-amber-700", sub: "text-amber-500" },
    C: { border: "border-red-400 bg-red-50", text: "text-red-700", sub: "text-red-500" },
};

function sortUnits(units: LaptopUnit[]): LaptopUnit[] {
    return [...units].sort((a, b) => {
        const gradeDiff = GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade];
        if (gradeDiff !== 0) return gradeDiff;
        return b.serial_number.localeCompare(a.serial_number, undefined, { numeric: true });
    });
}

function AlertModal({ message, onClose }: { message: string; onClose: () => void }) {
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-xs p-5 text-center">
                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <p className="text-gray-700 text-sm font-medium mb-4">{message}</p>
                <button
                    onClick={onClose}
                    className="w-full h-9 bg-[#1a1a2e] text-white rounded-lg text-sm font-medium hover:bg-[#16213e] transition"
                >
                    OK
                </button>
            </div>
        </div>
    );
}

function ConfirmModal({
    message, onConfirm, onCancel, confirmLabel = "Hapus", danger = true,
}: {
    message: string; onConfirm: () => void; onCancel: () => void;
    confirmLabel?: string; danger?: boolean;
}) {
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onCancel]);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-5">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3 ${danger ? "bg-red-50" : "bg-amber-50"}`}>
                    <svg className={`w-5 h-5 ${danger ? "text-red-500" : "text-amber-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <p className="text-gray-700 text-sm text-center leading-relaxed mb-4">{message}</p>
                <div className="flex gap-2">
                    <button onClick={onCancel}
                        className="flex-1 h-9 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition">
                        Batal
                    </button>
                    <button onClick={onConfirm}
                        className={`flex-1 h-9 rounded-lg text-sm font-semibold text-white transition ${danger ? "bg-red-500 hover:bg-red-600" : "bg-amber-500 hover:bg-amber-600"}`}>
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

function BulkAddModal({
    laptopId,
    defaultSellingPrice,
    onClose,
    onSuccess,
}: {
    laptopId: string;
    defaultSellingPrice: number;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [tab, setTab] = useState<"range" | "manual" | "excel">("range");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [preview, setPreview] = useState<string[]>([]);

    const [grade, setGrade] = useState("B");
    const [status, setStatus] = useState("SIAP_JUAL");
    const [purchasePrice, setPurchasePrice] = useState("");
    const [sellingPrice, setSellingPrice] = useState(String(defaultSellingPrice || ""));
    const [conditionNote, setConditionNote] = useState("");

    const [snFrom, setSnFrom] = useState("");
    const [snTo, setSnTo] = useState("");
    const [manualText, setManualText] = useState("");
    const [excelRows, setExcelRows] = useState<any[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [receivedAt, setReceivedAt] = useState("");

    function generateRange(from: string, to: string): string[] {
        const fromTrimmed = from.trim();
        const toTrimmed = to.trim();
        if (!fromTrimmed || !toTrimmed) return [];
        const fromNum = parseInt(fromTrimmed, 10);
        const toNum = parseInt(toTrimmed, 10);
        if (!isNaN(fromNum) && !isNaN(toNum) && fromNum <= toNum) {
            const padLen = Math.max(fromTrimmed.length, toTrimmed.length);
            const result: string[] = [];
            for (let i = fromNum; i <= toNum; i++) {
                result.push(String(i).padStart(padLen, "0"));
            }
            return result;
        }
        return fromTrimmed === toTrimmed ? [fromTrimmed] : [fromTrimmed, toTrimmed];
    }

    useEffect(() => {
        if (tab === "range") {
            setPreview(generateRange(snFrom, snTo).slice(0, 5));
        } else if (tab === "manual") {
            const lines = manualText.split(/[\n,；,、]/).map(s => s.trim()).filter(Boolean);
            setPreview(lines.slice(0, 5));
        } else if (tab === "excel") {
            setPreview(excelRows.slice(0, 5).map(r => r.serial_number ?? ""));
        }
    }, [tab, snFrom, snTo, manualText, excelRows]);

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
                const buyKeys = ["purchase_price", "harga_modal", "Harga Modal", "modal", "buy"];
                const sellKeys = ["selling_price", "harga_jual", "Harga Jual", "jual", "sell"];
                const gradeKeys = ["grade", "Grade"];
                const statusKeys = ["status", "Status"];
                const noteKeys = ["condition_note", "kondisi", "Kondisi", "note", "notes"];
                const findKey = (row: any, keys: string[]) => keys.find(k => k in row) ?? null;
                const parsed = raw.map((row: any) => {
                    const snKey = findKey(row, snKeys);
                    const buyKey = findKey(row, buyKeys);
                    const sellKey = findKey(row, sellKeys);
                    const gradeKey = findKey(row, gradeKeys);
                    const statKey = findKey(row, statusKeys);
                    const noteKey = findKey(row, noteKeys);
                    const rawStatus = statKey ? String(row[statKey]) : status;
                    const normalizedStatus = rawStatus === "SIAP_JUAL" ? "SIAP_JUAL" : "BELUM_SIAP";
                    return {
                        serial_number: snKey ? String(row[snKey]).trim() : "",
                        purchase_price: buyKey ? Number(row[buyKey]) : 0,
                        selling_price: sellKey ? Number(row[sellKey]) : Number(sellingPrice) || 0,
                        grade: gradeKey ? String(row[gradeKey]) : grade,
                        status: normalizedStatus,
                        condition_note: noteKey ? String(row[noteKey]) : conditionNote,
                        notes: "",
                    };
                }).filter(r => r.serial_number);
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
            grade,
            status,
            purchase_price: Number(purchasePrice) || 0,
            selling_price: Number(sellingPrice) || 0,
            condition_note: conditionNote,
            notes: "",
            received_at: receivedAt ? new Date(receivedAt).toISOString() : undefined,
        };
        if (tab === "range") {
            const sns = generateRange(snFrom, snTo);
            return sns.map(sn => ({ serial_number: sn, ...defaults }));
        }
        if (tab === "manual") {
            const sns = manualText.split(/[\n,；,、]/).map(s => s.trim()).filter(Boolean);
            return sns.map(sn => ({ serial_number: sn, ...defaults }));
        }
        if (tab === "excel") {
            return excelRows.map(r => ({
                serial_number: r.serial_number,
                grade: r.grade || defaults.grade,
                status: r.status || defaults.status,
                purchase_price: r.purchase_price || defaults.purchase_price,
                selling_price: r.selling_price || defaults.selling_price,
                condition_note: r.condition_note || defaults.condition_note,
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
            const res = await fetch(`/api/laptops/${laptopId}/units/bulk`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ units }),
            });
            const result = await res.json();
            if (!result.success) { setError(result.message || "Gagal menambahkan units"); return; }
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
            ["serial_number", "grade", "purchase_price", "selling_price", "condition_note", "status"],
            ["00018376", "B", 1200000, 1500000, "mulus", "SIAP_JUAL"],
            ["00018377", "A", 1300000, 1600000, "bagus sekali", "SIAP_JUAL"],
        ]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Units");
        XLSX.writeFile(wb, "template_bulk_units.xlsx");
    };

    const TABS = [
        { id: "range", label: "Range SN", icon: "🔢" },
        { id: "manual", label: "Manual", icon: "✏️" },
        { id: "excel", label: "Import Excel", icon: "📊" },
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
                                ? "bg-[#1a1a2e] text-white border-[#1a1a2e]"
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
                                    Contoh: dari <code className="font-mono bg-blue-100 px-1 rounded">00018376</code> ke <code className="font-mono bg-blue-100 px-1 rounded">00018380</code> → 5 unit.
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">SN Awal</label>
                                    <input type="text" placeholder="00018376" value={snFrom} onChange={e => setSnFrom(e.target.value)}
                                        className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">SN Akhir</label>
                                    <input type="text" placeholder="00018380" value={snTo} onChange={e => setSnTo(e.target.value)}
                                        className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition" />
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
                                    placeholder={"00018376\n00018377\n00018378\natau: 00018376, 00018377, 00018378"}
                                    value={manualText} onChange={e => setManualText(e.target.value)} rows={6}
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition resize-none" />
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
                                    Upload file Excel (.xlsx/.xls). Kolom yang dikenali: <code className="bg-blue-100 px-1 rounded font-mono">serial_number</code>, <code className="bg-blue-100 px-1 rounded font-mono">grade</code>, <code className="bg-blue-100 px-1 rounded font-mono">purchase_price</code>, <code className="bg-blue-100 px-1 rounded font-mono">selling_price</code>, <code className="bg-blue-100 px-1 rounded font-mono">condition_note</code>.
                                </p>
                                <button onClick={downloadTemplate} className="text-xs text-blue-600 font-semibold underline underline-offset-2">⬇ Download Template Excel</button>
                            </div>
                            <div onClick={() => fileInputRef.current?.click()}
                                className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer active:bg-gray-50 transition">
                                <div className="text-3xl mb-2">📊</div>
                                <p className="text-sm font-medium text-gray-600">Klik untuk pilih file</p>
                                <p className="text-xs text-gray-400 mt-1">.xlsx atau .xls</p>
                                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="hidden" />
                            </div>
                            {excelRows.length > 0 && (
                                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                                    <p className="text-xs font-semibold text-emerald-700 mb-2">✅ {excelRows.length} baris berhasil dibaca</p>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-[10px]">
                                            <thead>
                                                <tr className="text-gray-500">
                                                    <th className="text-left pb-1">SN</th>
                                                    <th className="text-left pb-1">Grade</th>
                                                    <th className="text-right pb-1">Harga Jual</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {excelRows.slice(0, 5).map((r, i) => (
                                                    <tr key={i} className="border-t border-emerald-100">
                                                        <td className="py-0.5 font-mono text-gray-700">{r.serial_number}</td>
                                                        <td className="py-0.5 text-gray-600">{r.grade}</td>
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

                    {tab !== "excel" && (
                        <div className="border-t border-gray-100 pt-4 space-y-3">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Nilai Default Semua Unit</p>

                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1.5">Status</label>
                                <div className="flex gap-1.5">
                                    {(["SIAP_JUAL", "BELUM_SIAP"] as const).map(s => (
                                        <button
                                            key={s}
                                            type="button"
                                            onClick={() => setStatus(s)}
                                            className={`flex-1 h-9 rounded-lg text-xs font-semibold border transition ${status === s
                                                ? s === "SIAP_JUAL"
                                                    ? "bg-emerald-600 text-white border-emerald-600"
                                                    : "bg-amber-500 text-white border-amber-500"
                                                : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                                                }`}
                                        >
                                            {s === "SIAP_JUAL" ? "✅ Siap Jual" : "⏳ Belum Siap"}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {status === "SIAP_JUAL" ? (
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Grade</label>
                                    <div className="flex gap-1.5">
                                        {(["A", "B", "C"] as const).map(g => (
                                            <button
                                                key={g}
                                                type="button"
                                                onClick={() => setGrade(g)}
                                                className={`flex-1 h-9 rounded-lg text-xs font-bold border transition ${grade === g
                                                    ? "bg-[#1a1a2e] text-white border-[#1a1a2e]"
                                                    : "bg-white text-gray-500 border-gray-200 active:bg-gray-50"
                                                    }`}
                                            >
                                                {g}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                        Keterangan Belum Siap
                                        <span className="text-gray-400 font-normal ml-1">(opsional)</span>
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Contoh: perlu servis, layar retak, belum dicek..."
                                        value={conditionNote}
                                        onChange={e => setConditionNote(e.target.value)}
                                        className="w-full h-9 border border-amber-200 rounded-lg px-3 text-sm bg-amber-50/40 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400 focus:bg-white transition"
                                    />
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Harga Modal</label>
                                    <input type="number" placeholder="0" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)}
                                        className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Harga Jual</label>
                                    <input type="number" placeholder="0" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)}
                                        className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition" />
                                </div>
                            </div>

                            {status === "SIAP_JUAL" && (
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Kondisi <span className="text-gray-400 font-normal">(opsional)</span></label>
                                    <input type="text" placeholder="Contoh: mulus, normal"
                                        value={conditionNote} onChange={e => setConditionNote(e.target.value)}
                                        className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition" />
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                    Tanggal Masuk <span className="text-gray-300 font-normal">(semua unit)</span>
                                </label>
                                <input type="date" value={receivedAt} onChange={e => setReceivedAt(e.target.value)}
                                    max={new Date().toISOString().split("T")[0]}
                                    className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition" />
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
                        className="flex-1 h-11 bg-emerald-600 text-white rounded-xl text-sm font-semibold active:bg-emerald-700 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
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

export default function UnitsPage() {
    const params = useParams();
    const laptopId = params.id as string;

    const [laptop, setLaptop] = useState<Laptop | null>(null);
    const [units, setUnits] = useState<LaptopUnit[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [showForm, setShowForm] = useState(false);
    const [editingUnit, setEditingUnit] = useState<LaptopUnit | null>(null);
    const [formData, setFormData] = useState<Record<string, string>>(EMPTY_FORM);
    const [formLoading, setFormLoading] = useState(false);

    const [filterStatus, setFilterStatus] = useState("ALL");
    const [filterGradeTab, setFilterGradeTab] = useState("ALL");
    const [searchSN, setSearchSN] = useState("");
    const [filterPriceMin, setFilterPriceMin] = useState("");
    const [filterPriceMax, setFilterPriceMax] = useState("");
    const [showAdvancedFilter, setShowAdvancedFilter] = useState(false);

    const [userRole, setUserRole] = useState<UserRole | null>(null);
    const canManageUnits = userRole ? hasPermission(userRole, PERMISSIONS.EDIT_UNITS) : false;
    const canSeePriceInfo = userRole ? hasPermission(userRole, ["ADMIN", "PENGELOLA_BARANG", "ACCOUNTING"] as UserRole[]) : false;
    const [alertModal, setAlertModal] = useState<string | null>(null);
    const [confirmModal, setConfirmModal] = useState<{ message: string; onConfirm: () => void } | null>(null);
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkDeleting, setBulkDeleting] = useState(false);

    useEffect(() => {
        fetch("/api/auth/me")
            .then(r => r.json())
            .then(r => setUserRole(r.user?.role ?? null))
            .catch(() => setUserRole(null));
    }, []);

    const fmtDate = (iso: string) => {
        if (!iso) return "—";
        return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
    };

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [laptopRes, unitsRes] = await Promise.all([
                fetch(`/api/laptops/${laptopId}`),
                fetch(`/api/laptops/${laptopId}/units`),
            ]);
            const laptopData = await laptopRes.json();
            const unitsData = await unitsRes.json();
            if (laptopData.data) {
                setLaptop({ ...laptopData.data, selling_price: Math.round(Number(laptopData.data.selling_price) || 0) });
            }
            if (unitsData.data) {
                const normalized: LaptopUnit[] = (unitsData.data).map((u: LaptopUnit) => ({
                    ...u,
                    purchase_price: Math.round(Number(u.purchase_price) || 0),
                    selling_price: Math.round(Number(u.selling_price) || 0),
                }));
                setUnits(normalized);
            }
        } catch { /* ignore */ } finally {
            setIsLoading(false);
        }
    }, [laptopId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    useEffect(() => { setSelectedIds(new Set()); }, [filterStatus, filterGradeTab, searchSN]);

    const syncLaptopStats = useCallback(async (latestUnits: LaptopUnit[]) => {
        const siapCount = latestUnits.filter(u => u.status === "SIAP_JUAL").length;
        const newStatus = siapCount > 0 ? "SIAP_JUAL" : latestUnits.length === 0 ? "BELUM_SIAP" : "SOLD";
        try {
            await fetch(`/api/laptops/${laptopId}/sync-units`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ qty: siapCount, status: newStatus }),
            });
        } catch { /* non-blocking */ }
    }, [laptopId]);

    const filteredUnits = sortUnits(
        units.filter(u => {
            if (filterStatus !== "ALL" && u.status !== filterStatus) return false;
            if (filterGradeTab !== "ALL" && u.grade !== filterGradeTab) return false;
            if (searchSN && !u.serial_number.toLowerCase().includes(searchSN.toLowerCase())) return false;
            if (filterPriceMin && u.selling_price < Number(filterPriceMin)) return false;
            if (filterPriceMax && u.selling_price > Number(filterPriceMax)) return false;
            return true;
        })
    );

    const hasActiveFilter = searchSN || filterPriceMin || filterPriceMax;
    const isAllSelected = filteredUnits.length > 0 && filteredUnits.every(u => selectedIds.has(u.id));
    const isIndeterminate = filteredUnits.some(u => selectedIds.has(u.id)) && !isAllSelected;

    const toggleSelectAll = () => {
        if (isAllSelected) { setSelectedIds(new Set()); }
        else { setSelectedIds(new Set(filteredUnits.map(u => u.id))); }
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleBulkDelete = () => {
        if (selectedIds.size === 0) return;
        setConfirmModal({
            message: `Hapus ${selectedIds.size} unit yang dipilih? Tindakan ini tidak dapat dibatalkan.`,
            onConfirm: async () => {
                setConfirmModal(null);
                setBulkDeleting(true);
                try {
                    await Promise.all(Array.from(selectedIds).map(id => fetch(`/api/units/${id}`, { method: "DELETE" })));
                    const freshRes = await fetch(`/api/laptops/${laptopId}/units`);
                    const freshData = await freshRes.json();
                    const freshUnits: LaptopUnit[] = freshData.data || [];
                    setUnits(freshUnits);
                    await syncLaptopStats(freshUnits);
                    setSelectedIds(new Set());
                } catch {
                    setAlertModal("Gagal menghapus beberapa unit");
                } finally {
                    setBulkDeleting(false);
                }
            },
        });
    };

    const counts = {
        total: units.length,
        siap: units.filter(u => u.status === "SIAP_JUAL").length,
        sold: units.filter(u => u.status === "SOLD").length,
        service: units.filter(u => u.status === "SERVICE").length,
        belum: units.filter(u => u.status === "BELUM_SIAP").length,
        gradeA: units.filter(u => u.grade === "A").length,
        gradeB: units.filter(u => u.grade === "B").length,
        gradeC: units.filter(u => u.grade === "C").length,
    };

    const openCreate = () => {
        setEditingUnit(null);
        setFormData({ ...EMPTY_FORM, selling_price: laptop ? String(laptop.selling_price || "") : "" });
        setShowForm(true);
    };

    // ── FIX: Semua status bisa diedit — SOLD default ke BELUM_SIAP supaya user aktif memilih ──
    const openEdit = (unit: LaptopUnit) => {
        setEditingUnit(unit);
        // SOLD → default BELUM_SIAP (user harus aktif memilih status baru)
        // SIAP_JUAL, BELUM_SIAP, SERVICE → preserve status asli
        const editableStatus =
            unit.status === "SIAP_JUAL" ? "SIAP_JUAL" :
                unit.status === "SERVICE" ? "SERVICE" :
                    unit.status === "BELUM_SIAP" ? "BELUM_SIAP" :
                        "BELUM_SIAP"; // SOLD → BELUM_SIAP sebagai default
        setFormData({
            serial_number: unit.serial_number,
            grade: unit.grade,
            condition_note: unit.condition_note || "",
            purchase_price: String(unit.purchase_price || ""),
            selling_price: String(unit.selling_price || ""),
            status: editableStatus,
            notes: unit.notes || "",
            received_at: unit.created_at ? new Date(unit.created_at).toISOString().split("T")[0] : "",
        });
        setShowForm(true);
    };

    const closeForm = () => { setShowForm(false); setEditingUnit(null); };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormLoading(true);
        try {
            const payload = {
                ...formData,
                purchase_price: Number(formData.purchase_price),
                selling_price: Number(formData.selling_price),
                ...(formData.received_at
                    ? { received_at: new Date(formData.received_at).toISOString() }
                    : { received_at: undefined }),
            };
            const url = editingUnit ? `/api/units/${editingUnit.id}` : `/api/laptops/${laptopId}/units`;
            const method = editingUnit ? "PUT" : "POST";
            const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            const result = await res.json();
            if (!result.success) { setAlertModal(result.message); return; }
            const freshRes = await fetch(`/api/laptops/${laptopId}/units`);
            const freshData = await freshRes.json();
            const freshUnits: LaptopUnit[] = freshData.data || [];
            setUnits(freshUnits);
            await syncLaptopStats(freshUnits);
            closeForm();
        } catch {
            setAlertModal("Terjadi kesalahan");
        } finally {
            setFormLoading(false);
        }
    };

    const handleDelete = (unit: LaptopUnit) => {
        setConfirmModal({
            message: `Hapus unit SN: ${unit.serial_number}?`,
            onConfirm: async () => {
                setConfirmModal(null);
                try {
                    await fetch(`/api/units/${unit.id}`, { method: "DELETE" });
                    const freshRes = await fetch(`/api/laptops/${laptopId}/units`);
                    const freshData = await freshRes.json();
                    const freshUnits: LaptopUnit[] = freshData.data || [];
                    setUnits(freshUnits);
                    await syncLaptopStats(freshUnits);
                } catch { setAlertModal("Gagal menghapus"); }
            },
        });
    };

    const resetFilters = () => {
        setSearchSN(""); setFilterPriceMin(""); setFilterPriceMax("");
        setFilterStatus("ALL"); setFilterGradeTab("ALL");
    };

    return (
        <DashboardLayout>
            <main className="min-h-screen bg-gradient-to-br from-gray-50 to-white p-4 sm:p-6 lg:p-8">
                <div className="max-w-7xl mx-auto space-y-5">

                    {/* Breadcrumb */}
                    <div className="flex items-center gap-2 text-sm">
                        <Link href="/dashboard/laptops" className="text-gray-400 hover:text-gray-600 transition">Data Laptop</Link>
                        <svg className="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span className="text-gray-600 font-medium truncate">{isLoading ? "Memuat..." : laptop?.laptop_name || "Units"}</span>
                    </div>

                    {/* Header */}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <div className="w-7 h-7 bg-gradient-to-br from-[#1a1a2e] to-[#16213e] rounded-lg flex items-center justify-center">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                        <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
                                    </svg>
                                </div>
                                <h1 className="text-xl font-bold text-[#1a1a2e] tracking-tight">{laptop?.laptop_name || "—"}</h1>
                            </div>
                            <p className="text-xs text-gray-400 ml-9">
                                {[laptop?.brand, laptop?.cpu, laptop?.ram, laptop?.storage].filter(Boolean).join(" · ") || "Detail laptop"}
                            </p>
                        </div>
                        {canManageUnits && (
                            <div className="flex items-center gap-2">
                                <button onClick={openCreate}
                                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#1a1a2e] rounded-lg text-sm font-medium text-white hover:bg-[#16213e] transition shadow-sm">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                    Tambah Unit
                                </button>
                                <button onClick={() => setShowBulkModal(true)}
                                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-600 rounded-lg text-sm font-medium text-white transition shadow-sm">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    Tambah Banyak
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Stats Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        {[
                            { label: "Total Unit", value: counts.total, color: "text-gray-800", icon: "📦" },
                            { label: "Siap Jual", value: counts.siap, color: "text-emerald-600", icon: "✅" },
                            { label: "Belum Siap", value: counts.belum, color: "text-amber-600", icon: "⏳" },
                            { label: "Service", value: counts.service, color: "text-blue-600", icon: "🔧" },
                            { label: "Terjual", value: counts.sold, color: "text-gray-500", icon: "💰" },
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

                    {/* Grade Tabs */}
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-1.5">
                        <div className="flex gap-1.5">
                            {[
                                { value: "ALL", label: "Semua Grade", count: units.length },
                                { value: "A", label: "Grade A", count: counts.gradeA },
                                { value: "B", label: "Grade B", count: counts.gradeB },
                                { value: "C", label: "Grade C", count: counts.gradeC },
                            ].map(opt => {
                                const isActive = filterGradeTab === opt.value;
                                let activeStyle = "bg-[#1a1a2e] text-white";
                                if (opt.value === "A" && isActive) activeStyle = "bg-gray-400 text-white";
                                if (opt.value === "B" && isActive) activeStyle = "bg-amber-400 text-white";
                                if (opt.value === "C" && isActive) activeStyle = "bg-red-500 text-white";
                                return (
                                    <button key={opt.value} onClick={() => setFilterGradeTab(opt.value)}
                                        className={`flex-1 flex flex-col items-center py-2 px-1 rounded-lg text-center transition-all ${isActive ? activeStyle : "text-gray-500 hover:bg-gray-50"}`}>
                                        <span className={`text-[10px] font-medium leading-tight ${isActive ? "opacity-80" : "opacity-60"}`}>{opt.label}</span>
                                        <span className="text-sm font-bold leading-tight mt-0.5">{opt.count}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Status Filter Tabs */}
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-2">
                        <div className="flex flex-wrap gap-1.5">
                            {[
                                { value: "ALL", label: "Semua Status", count: filterGradeTab === "ALL" ? units.length : units.filter(u => u.grade === filterGradeTab).length },
                                { value: "SIAP_JUAL", label: "Siap Jual", count: units.filter(u => (filterGradeTab === "ALL" || u.grade === filterGradeTab) && u.status === "SIAP_JUAL").length },
                                { value: "BELUM_SIAP", label: "Belum Siap", count: units.filter(u => (filterGradeTab === "ALL" || u.grade === filterGradeTab) && u.status === "BELUM_SIAP").length },
                                { value: "SERVICE", label: "Service", count: units.filter(u => (filterGradeTab === "ALL" || u.grade === filterGradeTab) && u.status === "SERVICE").length },
                                { value: "SOLD", label: "Terjual", count: units.filter(u => (filterGradeTab === "ALL" || u.grade === filterGradeTab) && u.status === "SOLD").length },
                            ].map(opt => (
                                <button key={opt.value} onClick={() => setFilterStatus(opt.value)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${filterStatus === opt.value ? "bg-[#1a1a2e] text-white shadow-sm" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
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
                                <input type="text" placeholder="Cari serial number..." value={searchSN} onChange={e => setSearchSN(e.target.value)}
                                    className="w-full h-9 border border-gray-200 rounded-lg pl-9 pr-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition" />
                                {searchSN && (
                                    <button onClick={() => setSearchSN("")} className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 transition">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                            <button onClick={() => setShowAdvancedFilter(v => !v)}
                                className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-medium border transition ${showAdvancedFilter || filterPriceMin || filterPriceMax ? "bg-[#1a1a2e] text-white border-[#1a1a2e]" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                                </svg>
                                Filter
                                {(filterPriceMin || filterPriceMax) && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                            </button>
                            {hasActiveFilter && (
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
                                    <input type="number" placeholder="Contoh: 1000000" value={filterPriceMin} onChange={e => setFilterPriceMin(e.target.value)}
                                        className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Harga Jual Max (Rp)</label>
                                    <input type="number" placeholder="Contoh: 5000000" value={filterPriceMax} onChange={e => setFilterPriceMax(e.target.value)}
                                        className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition" />
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
                                <button onClick={() => setSelectedIds(new Set())} className="text-xs text-red-500 font-medium underline underline-offset-2 active:opacity-60 transition">Batal pilih</button>
                                <button onClick={handleBulkDelete} disabled={bulkDeleting}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-semibold active:bg-red-600 transition disabled:opacity-50">
                                    {bulkDeleting ? (
                                        <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menghapus...</>
                                    ) : (
                                        <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>Hapus {selectedIds.size} Unit</>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Table */}
                    {isLoading ? (
                        <SkeletonUnits />
                    ) : filteredUnits.length === 0 ? (
                        <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-12 text-center">
                            <div className="text-3xl mb-2 opacity-50">📦</div>
                            <p className="text-gray-500 text-sm font-medium">Tidak ada unit ditemukan</p>
                            <p className="text-gray-400 text-xs mt-1">
                                {hasActiveFilter || filterStatus !== "ALL" || filterGradeTab !== "ALL"
                                    ? "Coba ubah filter pencarian"
                                    : canManageUnits ? "Klik 'Tambah Unit' untuk mendaftarkan SN" : "Belum ada unit yang tersedia"}
                            </p>
                            {(hasActiveFilter || filterStatus !== "ALL" || filterGradeTab !== "ALL") && (
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
                                            {canManageUnits && (
                                                <th className="px-4 py-3 w-14">
                                                    <button onClick={toggleSelectAll}
                                                        className={`w-4 h-4 rounded border-2 flex items-center justify-center transition flex-shrink-0 ${isAllSelected ? "bg-[#1a1a2e] border-[#1a1a2e]" : isIndeterminate ? "bg-gray-300 border-gray-300" : "bg-white border-gray-300 hover:border-gray-400"}`}>
                                                        {(isAllSelected || isIndeterminate) && (
                                                            <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d={isIndeterminate ? "M5 12h14" : "M5 13l4 4L19 7"} />
                                                            </svg>
                                                        )}
                                                    </button>
                                                </th>
                                            )}
                                            <Th>Serial Number</Th>
                                            <Th>Grade</Th>
                                            <Th>Kondisi</Th>
                                            <Th>Tgl Masuk</Th>
                                            {canSeePriceInfo && <Th right>Harga Modal</Th>}
                                            <Th right>Harga Jual</Th>
                                            {canSeePriceInfo && <Th right>Margin</Th>}
                                            <Th>Status</Th>
                                            <Th right>Aksi</Th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {filteredUnits.map(unit => {
                                            const s = STATUS_STYLE[unit.status];
                                            const g = GRADE_STYLE[unit.grade];
                                            const margin = (unit.selling_price || 0) - (unit.purchase_price || 0);
                                            const isSelected = selectedIds.has(unit.id);
                                            return (
                                                <tr key={unit.id} className={`transition-colors group ${isSelected ? "bg-red-50/60" : "hover:bg-gray-50/60"}`}>
                                                    {canManageUnits && (
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
                                                    )}
                                                    <td className="px-4 py-3">
                                                        <span className="font-mono text-xs text-gray-700 bg-gray-100 px-2 py-1 rounded">{unit.serial_number}</span>
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        {g && (
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${g.badge}`}>{g.label}</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 max-w-[180px]">
                                                        <span className="text-xs text-gray-600 line-clamp-2" title={unit.condition_note}>
                                                            {unit.condition_note || <span className="text-gray-300">—</span>}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        <span className="text-xs text-gray-500">{fmtDate(unit.created_at)}</span>
                                                    </td>
                                                    {canSeePriceInfo && (
                                                        <td className="px-4 py-3 text-right text-xs text-gray-500 whitespace-nowrap tabular-nums">{fmt(unit.purchase_price)}</td>
                                                    )}
                                                    <td className="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap tabular-nums">{fmt(unit.selling_price)}</td>
                                                    {canSeePriceInfo && (
                                                        <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                                                            <span className={`text-xs font-semibold ${margin >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                                                {margin >= 0 ? "+" : ""}{fmt(Math.abs(margin))}
                                                            </span>
                                                        </td>
                                                    )}
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
                                                            {canManageUnits && (
                                                                <button onClick={() => openEdit(unit)}
                                                                    className="h-8 px-3 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition">
                                                                    Edit
                                                                </button>
                                                            )}
                                                            {canManageUnits && (
                                                                <button onClick={() => handleDelete(unit)}
                                                                    className="h-8 w-8 rounded-lg text-red-500 hover:bg-red-50 transition flex items-center justify-center" title="Hapus Unit">
                                                                    <Trash2 className="w-4 h-4" />
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
                                {(hasActiveFilter || filterStatus !== "ALL" || filterGradeTab !== "ALL") && (
                                    <span className="text-xs text-amber-600 font-medium">Filter aktif</span>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* ═══════════════════════════════════════════════════════
                FORM MODAL
            ═══════════════════════════════════════════════════════ */}
            {showForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeForm} />
                    <div className="relative bg-white w-full max-w-md rounded-xl shadow-xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/50">
                            <div>
                                <h3 className="font-semibold text-gray-800 text-sm">{editingUnit ? "Edit Unit" : "Tambah Unit Baru"}</h3>
                                <p className="text-xs text-gray-400 mt-0.5">{editingUnit ? "Perbarui informasi unit" : "Isi data unit laptop"}</p>
                            </div>
                            <button onClick={closeForm} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="overflow-y-auto flex-1 px-5 py-4">
                            <form onSubmit={handleSubmit} className="space-y-4">

                                {/* Serial Number */}
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                        Serial Number <span className="text-red-400">*</span>
                                    </label>
                                    <div className="flex gap-2">
                                        <input name="serial_number" placeholder="Contoh: SN-2024-001"
                                            value={formData.serial_number} onChange={handleChange} required
                                            className="flex-1 h-9 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition" />
                                        <button type="button"
                                            onClick={() => {
                                                if (!formData.serial_number) { alert("Masukkan serial number dulu"); return; }
                                                window.open(`https://www.google.com/search?q=${encodeURIComponent(formData.serial_number + " laptop")}`, "_blank");
                                            }}
                                            className="px-3 h-9 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 transition whitespace-nowrap">
                                            🔍 Cek
                                        </button>
                                    </div>
                                </div>

                                {/* Harga */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1.5">Harga Modal</label>
                                        <input name="purchase_price" type="number" placeholder="0"
                                            value={formData.purchase_price} onChange={handleChange}
                                            className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                            Harga Jual <span className="text-red-400">*</span>
                                        </label>
                                        <input name="selling_price" type="number" placeholder="0"
                                            value={formData.selling_price} onChange={handleChange} required
                                            className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition" />
                                    </div>
                                </div>

                                {/* Estimasi Margin */}
                                {formData.purchase_price && formData.selling_price && (
                                    <div className="bg-gray-50 rounded-lg px-3 py-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-medium text-gray-500">Estimasi Margin</span>
                                            <span className={`text-xs font-bold tabular-nums ${Number(formData.selling_price) - Number(formData.purchase_price) >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                                {fmt(Number(formData.selling_price) - Number(formData.purchase_price))}
                                            </span>
                                        </div>
                                        <div className="mt-1.5 h-1 bg-gray-200 rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full transition-all ${Number(formData.selling_price) - Number(formData.purchase_price) >= 0 ? "bg-emerald-500" : "bg-red-500"}`}
                                                style={{ width: `${Math.min(100, Math.max(0, (Number(formData.selling_price) - Number(formData.purchase_price)) / Number(formData.selling_price) * 100))}%` }} />
                                        </div>
                                    </div>
                                )}

                                {/* ── Status — 3 pilihan untuk semua unit (termasuk yang sebelumnya SOLD) ── */}
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-2">
                                        Status <span className="text-red-400">*</span>
                                    </label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {/* Siap Jual */}
                                        <button
                                            type="button"
                                            onClick={() => setFormData(prev => ({ ...prev, status: "SIAP_JUAL" }))}
                                            className={`relative py-3 px-2 rounded-xl border-2 transition-all text-left ${formData.status === "SIAP_JUAL"
                                                    ? "border-emerald-500 bg-emerald-50 shadow-sm"
                                                    : "border-gray-200 bg-white hover:border-gray-300"
                                                }`}
                                        >
                                            <div className="flex items-center gap-1.5 mb-0.5">
                                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${formData.status === "SIAP_JUAL" ? "bg-emerald-500" : "bg-gray-300"
                                                    }`} />
                                                <p className={`text-xs font-bold ${formData.status === "SIAP_JUAL" ? "text-emerald-700" : "text-gray-600"
                                                    }`}>Siap Jual</p>
                                            </div>
                                            <p className={`text-[10px] leading-tight ml-3.5 ${formData.status === "SIAP_JUAL" ? "text-emerald-500" : "text-gray-400"
                                                }`}>
                                                Pilih Grade
                                            </p>
                                        </button>

                                        {/* Belum Siap */}
                                        <button
                                            type="button"
                                            onClick={() => setFormData(prev => ({ ...prev, status: "BELUM_SIAP" }))}
                                            className={`relative py-3 px-2 rounded-xl border-2 transition-all text-left ${formData.status === "BELUM_SIAP"
                                                    ? "border-amber-500 bg-amber-50 shadow-sm"
                                                    : "border-gray-200 bg-white hover:border-gray-300"
                                                }`}
                                        >
                                            <div className="flex items-center gap-1.5 mb-0.5">
                                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${formData.status === "BELUM_SIAP" ? "bg-amber-500" : "bg-gray-300"
                                                    }`} />
                                                <p className={`text-xs font-bold ${formData.status === "BELUM_SIAP" ? "text-amber-700" : "text-gray-600"
                                                    }`}>Belum Siap</p>
                                            </div>
                                            <p className={`text-[10px] leading-tight ml-3.5 ${formData.status === "BELUM_SIAP" ? "text-amber-500" : "text-gray-400"
                                                }`}>
                                                Beri keterangan
                                            </p>
                                        </button>

                                        {/* Service */}
                                        <button
                                            type="button"
                                            onClick={() => setFormData(prev => ({ ...prev, status: "SERVICE" }))}
                                            className={`relative py-3 px-2 rounded-xl border-2 transition-all text-left ${formData.status === "SERVICE"
                                                    ? "border-blue-500 bg-blue-50 shadow-sm"
                                                    : "border-gray-200 bg-white hover:border-gray-300"
                                                }`}
                                        >
                                            <div className="flex items-center gap-1.5 mb-0.5">
                                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${formData.status === "SERVICE" ? "bg-blue-500" : "bg-gray-300"
                                                    }`} />
                                                <p className={`text-xs font-bold ${formData.status === "SERVICE" ? "text-blue-700" : "text-gray-600"
                                                    }`}>Service</p>
                                            </div>
                                            <p className={`text-[10px] leading-tight ml-3.5 ${formData.status === "SERVICE" ? "text-blue-500" : "text-gray-400"
                                                }`}>
                                                Sedang servis
                                            </p>
                                        </button>
                                    </div>
                                </div>

                                {/* Conditional field berdasarkan status */}
                                {formData.status === "SIAP_JUAL" ? (
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                            Grade <span className="text-red-400">*</span>
                                        </label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {(["A", "B", "C"] as const).map(g => {
                                                const gs = GRADE_STYLE[g];
                                                const selected = formData.grade === g;
                                                const st = GRADE_FORM_STYLE[g];
                                                return (
                                                    <button
                                                        key={g}
                                                        type="button"
                                                        onClick={() => setFormData(prev => ({ ...prev, grade: g }))}
                                                        className={`py-2.5 px-2 rounded-xl border-2 transition-all text-center ${selected ? `${st.border} shadow-sm` : "border-gray-200 bg-white hover:border-gray-300"
                                                            }`}
                                                    >
                                                        <p className={`text-sm font-black ${selected ? st.text : "text-gray-700"}`}>{gs.label}</p>
                                                        <p className={`text-[10px] mt-0.5 ${selected ? st.sub : "text-gray-400"}`}>{gs.desc}</p>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ) : formData.status === "BELUM_SIAP" ? (
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                            Keterangan Belum Siap
                                            <span className="text-gray-400 font-normal ml-1">(opsional)</span>
                                        </label>
                                        <textarea
                                            name="condition_note"
                                            placeholder="Contoh: perlu ganti baterai, layar retak, belum dicek teknisi..."
                                            value={formData.condition_note}
                                            onChange={handleChange}
                                            rows={3}
                                            className="w-full border border-amber-200 rounded-xl px-3 py-2.5 text-sm bg-amber-50/40 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400 focus:bg-white transition resize-none placeholder:text-gray-400"
                                        />
                                        <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                                            <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            Unit tidak akan muncul di daftar siap jual
                                        </p>
                                    </div>
                                ) : formData.status === "SERVICE" ? (
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                            Keterangan Service
                                            <span className="text-gray-400 font-normal ml-1">(opsional)</span>
                                        </label>
                                        <textarea
                                            name="condition_note"
                                            placeholder="Contoh: ganti layar, keyboard rusak, baterai bocor..."
                                            value={formData.condition_note}
                                            onChange={handleChange}
                                            rows={3}
                                            className="w-full border border-blue-200 rounded-xl px-3 py-2.5 text-sm bg-blue-50/40 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 focus:bg-white transition resize-none placeholder:text-gray-400"
                                        />
                                        <p className="text-[10px] text-blue-600 mt-1 flex items-center gap-1">
                                            <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            Unit sedang dalam proses perbaikan
                                        </p>
                                    </div>
                                ) : null}

                                {/* Catatan Kondisi — hanya tampil untuk Siap Jual */}
                                {formData.status === "SIAP_JUAL" && (
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                            Catatan Kondisi
                                            <span className="text-gray-400 font-normal ml-1">(opsional)</span>
                                        </label>
                                        <input
                                            name="condition_note"
                                            placeholder="Kondisi fisik unit, misal: mulus, ada goresan tipis..."
                                            value={formData.condition_note}
                                            onChange={handleChange}
                                            className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition"
                                        />
                                    </div>
                                )}

                                {/* Tanggal Masuk */}
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                        Tanggal Masuk
                                        <span className="text-gray-300 ml-1 font-normal">(opsional, default hari ini)</span>
                                    </label>
                                    <input name="received_at" type="date" value={formData.received_at} onChange={handleChange}
                                        max={new Date().toISOString().split("T")[0]}
                                        className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition" />
                                    {formData.received_at && (
                                        <p className="text-[10px] text-gray-400 mt-1">Barang masuk: {fmtDate(formData.received_at)}</p>
                                    )}
                                </div>

                                {/* Notes Internal */}
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes Internal</label>
                                    <textarea name="notes" placeholder="Catatan tambahan..." value={formData.notes} onChange={handleChange} rows={2}
                                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition resize-none" />
                                </div>

                                <div className="flex gap-2 pt-2">
                                    <button type="button" onClick={closeForm}
                                        className="flex-1 h-9 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition">
                                        Batal
                                    </button>
                                    <button type="submit" disabled={formLoading}
                                        className="flex-1 h-9 bg-[#1a1a2e] text-white rounded-lg text-sm font-medium hover:bg-[#16213e] transition disabled:opacity-50">
                                        {formLoading ? (
                                            <span className="flex items-center justify-center gap-1.5">
                                                <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                </svg>
                                                Loading
                                            </span>
                                        ) : (editingUnit ? "Simpan" : "Tambah")}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {alertModal && <AlertModal message={alertModal} onClose={() => setAlertModal(null)} />}
            {confirmModal && (
                <ConfirmModal message={confirmModal.message} onConfirm={confirmModal.onConfirm} onCancel={() => setConfirmModal(null)} />
            )}
            {showBulkModal && (
                <BulkAddModal
                    laptopId={laptopId}
                    defaultSellingPrice={laptop?.selling_price ?? 0}
                    onClose={() => setShowBulkModal(false)}
                    onSuccess={async () => {
                        const freshRes = await fetch(`/api/laptops/${laptopId}/units`);
                        const freshData = await freshRes.json();
                        const freshUnits: LaptopUnit[] = freshData.data || [];
                        setUnits(freshUnits);
                        await syncLaptopStats(freshUnits);
                    }}
                />
            )}
        </DashboardLayout>
    );
}

function SkeletonUnits() {
    return (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gray-50/80 border-b border-gray-100">
                            {["Serial Number", "Grade", "Kondisi", "Harga Modal", "Harga Jual", "Margin", "Status", "Aksi"].map(h => (
                                <th key={h} className="px-4 py-3 text-left">
                                    <div className="h-2.5 bg-gray-200 rounded w-16 animate-pulse" />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {[...Array(3)].map((_, i) => (
                            <tr key={i}>
                                {[90, 50, 120, 70, 70, 60, 60, 50].map((w, j) => (
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

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
    return (
        <th className={`px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap ${right ? "text-right" : "text-left"}`}>
            {children}
        </th>
    );
}