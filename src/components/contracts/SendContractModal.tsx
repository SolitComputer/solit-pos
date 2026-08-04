"use client";

import { useState } from "react";
import { X, FileText, Loader2 } from "lucide-react";
import { CONTRACT_TEMPLATES, CONTRACT_TYPE_LABELS, ContractType, CONTRACT_DURATION_OPTIONS, computeValidUntil } from "@/lib/contractTemplates";

export default function SendContractModal({
    user, onClose, onSent,
}: {
    user: { id: string; name: string };
    onClose: () => void;
    onSent: () => void;
}) {
    const [type, setType] = useState<ContractType>("GAJI_FLAT");
    const [title, setTitle] = useState(CONTRACT_TYPE_LABELS.GAJI_FLAT);
    const [content, setContent] = useState(CONTRACT_TEMPLATES.GAJI_FLAT(user.name));
    const [validFrom, setValidFrom] = useState(() => new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10));
    const [durationMonths, setDurationMonths] = useState<number | null | "CUSTOM_DATE">(12);
    const [customValidUntil, setCustomValidUntil] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const handleTypeChange = (t: ContractType) => {
        setType(t);
        setTitle(CONTRACT_TYPE_LABELS[t]);
        if (t !== "CUSTOM") setContent(CONTRACT_TEMPLATES[t](user.name));
    };

    const send = async () => {
        if (!title.trim() || !content.trim()) {
            setError("Judul dan isi kontrak wajib diisi");
            return;
        }
        if (!validFrom) {
            setError("Tanggal mulai wajib diisi");
            return;
        }
        if (durationMonths === "CUSTOM_DATE" && !customValidUntil) {
            setError("Tanggal berakhir wajib diisi untuk durasi custom");
            return;
        }
        setSaving(true);
        setError("");
        try {
            const isCustomDuration = durationMonths === "CUSTOM_DATE";
            const res = await fetch("/api/contracts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_id: user.id,
                    contract_type: type,
                    title,
                    content,
                    valid_from: validFrom,
                    duration_months: isCustomDuration ? null : durationMonths,
                    valid_until: isCustomDuration ? customValidUntil : undefined,
                }),
            });
            const data = await res.json();
            if (!data.success) {
                setError(data.message || "Gagal mengirim kontrak");
                return;
            }
            onSent();
            onClose();
        } catch {
            setError("Terjadi kesalahan");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden">
                <div className="px-6 py-5 flex items-start justify-between flex-shrink-0" style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)" }}>
                    <div className="flex items-center gap-2.5">
                        <FileText className="w-5 h-5 text-white" />
                        <div>
                            <p className="font-bold text-white text-sm">Kirim Kontrak Kerja</p>
                            <p className="text-xs text-white/60 mt-0.5">{user.name}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/15 transition">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
                    {error && <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-3 rounded-xl">{error}</div>}

                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Jenis Kontrak</label>
                        <div className="grid grid-cols-2 gap-2">
                            {(["PENGANTARAN", "GAJI_FLAT", "GAJI_NON_FLAT", "CUSTOM"] as ContractType[]).map((t) => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => handleTypeChange(t)}
                                    className={`h-10 rounded-xl text-xs font-bold border transition ${type === t ? "bg-[#1a1a2e] text-white border-[#1a1a2e]" : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"}`}
                                >
                                    {CONTRACT_TYPE_LABELS[t]}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Judul</label>
                        <input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-400/30"
                        />
                    </div>

                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Isi Perjanjian</label>
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            rows={10}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-400/30 font-mono"
                        />
                        <p className="text-[10px] text-gray-400 mt-1.5">Template terisi otomatis sesuai jenis kontrak — boleh diedit bebas sebelum dikirim.</p>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Masa Berlaku</label>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] text-gray-400 mb-1 block">Mulai Berlaku</label>
                                <input
                                    type="date"
                                    value={validFrom}
                                    onChange={(e) => setValidFrom(e.target.value)}
                                    className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-400/30"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] text-gray-400 mb-1 block">Durasi</label>
                                <select
                                    value={durationMonths === null ? "PERMANENT" : durationMonths === "CUSTOM_DATE" ? "CUSTOM_DATE" : String(durationMonths)}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        if (v === "PERMANENT") setDurationMonths(null);
                                        else if (v === "CUSTOM_DATE") setDurationMonths("CUSTOM_DATE");
                                        else setDurationMonths(parseInt(v));
                                    }}
                                    className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-400/30"
                                >
                                    {CONTRACT_DURATION_OPTIONS.map((opt) => (
                                        <option key={opt.label} value={opt.months === null ? "PERMANENT" : opt.months}>{opt.label}</option>
                                    ))}
                                    <option value="CUSTOM_DATE">Custom (Pilih Tanggal)</option>
                                </select>
                            </div>
                        </div>

                        {durationMonths === "CUSTOM_DATE" && (
                            <div className="mt-3">
                                <label className="text-[10px] text-gray-400 mb-1 block">Berlaku Sampai</label>
                                <input
                                    type="date"
                                    value={customValidUntil}
                                    min={validFrom}
                                    onChange={(e) => setCustomValidUntil(e.target.value)}
                                    className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-400/30"
                                />
                            </div>
                        )}
                        {typeof durationMonths === "number" && validFrom && (
                            <p className="text-[10px] text-gray-400 mt-1.5">
                                Kontrak berlaku sampai <strong>{computeValidUntil(validFrom, durationMonths)}</strong> — akun akan diminta approve ulang setelah tanggal ini.
                            </p>
                        )}
                        {durationMonths === null && (
                            <p className="text-[10px] text-gray-400 mt-1.5">Kontrak tanpa batas waktu — berlaku sampai dicabut/diganti admin.</p>
                        )}
                        {durationMonths === "CUSTOM_DATE" && customValidUntil && (
                            <p className="text-[10px] text-gray-400 mt-1.5">
                                Kontrak berlaku sampai <strong>{customValidUntil}</strong> — akun akan diminta approve ulang setelah tanggal ini.
                            </p>
                        )}
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
                    <button onClick={onClose} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition">
                        Batal
                    </button>
                    <button
                        onClick={send}
                        disabled={saving}
                        className="flex-1 h-11 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
                        style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)" }}
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Kirim Kontrak"}
                    </button>
                </div>
            </div>
        </div>
    );
}