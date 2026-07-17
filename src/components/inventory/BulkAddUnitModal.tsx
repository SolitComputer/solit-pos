"use client";

import { useEffect, useState, useRef } from "react";
import * as XLSX from "xlsx";
import { Inbox, Hash, Pencil, BarChart3, Download, CheckCircle2, Clock } from "lucide-react";

export default function BulkAddUnitModal({
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
    // ── CHANGED: default status hanya 2 pilihan ──
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
                    // Normalisasi status Excel ke 2 status baru
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
        { id: "range", label: "Range SN", icon: Hash },
        { id: "manual", label: "Manual", icon: Pencil },
        { id: "excel", label: "Import Excel", icon: BarChart3 },
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
                    {TABS.map(t => {
                        const Icon = t.icon;
                        return (
                        <button
                            key={t.id}
                            onClick={() => { setTab(t.id); setError(""); }}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition border ${tab === t.id
                                ? "bg-[#1a1a2e] text-white border-[#1a1a2e]"
                                : "bg-white text-gray-500 border-gray-200 active:bg-gray-50"
                                }`}
                        >
                            <Icon className="w-3.5 h-3.5" />
                            {t.label}
                        </button>
                        );
                    })}
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
                                <button onClick={downloadTemplate} className="inline-flex items-center gap-1 text-xs text-blue-600 font-semibold underline underline-offset-2"><Download className="w-3 h-3" />Download Template Excel</button>
                            </div>
                            <div onClick={() => fileInputRef.current?.click()}
                                className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer active:bg-gray-50 transition">
                                <div className="flex justify-center mb-2"><Inbox className="w-8 h-8 opacity-50" /></div>
                                <p className="text-sm font-medium text-gray-600">Klik untuk pilih file</p>
                                <p className="text-xs text-gray-400 mt-1">.xlsx atau .xls</p>
                                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="hidden" />
                            </div>
                            {excelRows.length > 0 && (
                                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                                    <p className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 mb-2"><CheckCircle2 className="w-3.5 h-3.5" />{excelRows.length} baris berhasil dibaca</p>
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

                            {/* ── CHANGED: Status 2 tombol (bukan select dropdown) ── */}
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1.5">Status</label>
                                <div className="flex gap-1.5">
                                    {(["SIAP_JUAL", "BELUM_SIAP"] as const).map(s => (
                                        <button
                                            key={s}
                                            type="button"
                                            onClick={() => setStatus(s)}
                                            className={`flex-1 h-9 flex items-center justify-center gap-1 rounded-lg text-xs font-semibold border transition ${status === s
                                                ? s === "SIAP_JUAL"
                                                    ? "bg-emerald-600 text-white border-emerald-600"
                                                    : "bg-amber-500 text-white border-amber-500"
                                                : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                                                }`}
                                        >
                                            {s === "SIAP_JUAL" ? (
                                                <><CheckCircle2 className="w-3.5 h-3.5" /> Siap Jual</>
                                            ) : (
                                                <><Clock className="w-3.5 h-3.5" /> Belum Siap</>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* ── CHANGED: Grade hanya tampil kalau Siap Jual, Kondisi kalau Belum Siap ── */}
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

                            {/* Kondisi tetap ada kalau Siap Jual (sebagai catatan tambahan) */}
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
