"use client";

import { useState } from "react";

export interface CreatedAccessoryUnit {
    id: string;
    serial_number: string;
    [key: string]: unknown;
}

const CONDITION_OPTIONS = [
    { value: "BARU", label: "Baru" },
    { value: "BEKAS", label: "Bekas" },
];

export default function AddUnitModalAccessory({
    accessoryId,
    accessoryName,
    defaultSellingPrice,
    onClose,
    onCreated,
}: {
    accessoryId: string;
    accessoryName: string;
    defaultSellingPrice: number;
    onClose: () => void;
    onCreated: (unit: CreatedAccessoryUnit) => void;
}) {
    const [form, setForm] = useState({
        serial_number: "",
        condition: "BARU",
        buy_price: "",
        selling_price: String(defaultSellingPrice || ""),
        notes: "",
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
    ) => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.serial_number.trim()) {
            setError("Serial number wajib diisi");
            return;
        }
        setError("");
        setLoading(true);
        try {
            // Endpoint asli: POST /api/accessory-units (bukan nested per-accessory)
            const res = await fetch(`/api/accessory-units`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    accessory_id: accessoryId,
                    serial_number: form.serial_number.trim(),
                    condition: form.condition,
                    buy_price: Number(form.buy_price) || 0,
                    selling_price: Number(form.selling_price) || 0,
                    notes: form.notes,
                }),
            });
            const result = await res.json().catch(() => null);
            if (!res.ok || !result?.success) {
                setError(result?.error || result?.message || "Gagal menambahkan unit");
                return;
            }
            onCreated(result.data);
        } catch {
            setError("Terjadi kesalahan koneksi");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden animate-popIn max-h-[90dvh] flex flex-col">
                <div className="h-1 w-full bg-gradient-to-r from-zinc-400 via-zinc-600 to-zinc-800 flex-shrink-0" />
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
                    <div>
                        <h2 className="font-bold text-gray-900 text-[15px]">Tambah Unit</h2>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{accessoryName}</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 transition">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
                    <Field label="Serial Number" required>
                        <input name="serial_number" value={form.serial_number} onChange={handleChange}
                            placeholder="Contoh: SN-12345" className={inputCls} autoFocus />
                    </Field>

                    <Field label="Kondisi">
                        <select name="condition" value={form.condition} onChange={handleChange} className={inputCls}>
                            {CONDITION_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                    </Field>

                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Harga Modal">
                            <input type="number" name="buy_price" value={form.buy_price} onChange={handleChange} className={inputCls} />
                        </Field>
                        <Field label="Harga Jual">
                            <input type="number" name="selling_price" value={form.selling_price} onChange={handleChange} className={inputCls} />
                        </Field>
                    </div>

                    <Field label="Catatan">
                        <textarea name="notes" value={form.notes} onChange={handleChange} rows={2} className={inputCls} />
                    </Field>

                    {error && (
                        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                            <p className="text-xs text-red-700">{error}</p>
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} disabled={loading}
                            className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition disabled:opacity-50">
                            Batal
                        </button>
                        <button type="submit" disabled={loading}
                            className="flex-1 h-11 bg-gradient-to-r from-zinc-700 to-zinc-900 text-white rounded-xl text-sm font-semibold hover:from-zinc-800 hover:to-black transition disabled:opacity-50">
                            {loading ? "Menyimpan..." : "Tambah Unit"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

const inputCls = "w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400 focus:bg-white transition";

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
    return (
        <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">
                {label}{required && <span className="text-red-400 ml-0.5">*</span>}
            </label>
            {children}
        </div>
    );
}