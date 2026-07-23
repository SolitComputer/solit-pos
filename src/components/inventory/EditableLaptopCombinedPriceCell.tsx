"use client";

import { useEffect, useState } from "react";

const fmt = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");

/**
 * Single input cell for combined additional costs (charger & bag total).
 * Allows Pengelola Barang to quickly type 1 total number.
 */
export default function EditableLaptopCombinedPriceCell({
    laptopId,
    chargerPrice,
    bagPrice,
    onSaved,
}: {
    laptopId: string;
    chargerPrice: number;
    bagPrice: number;
    onSaved: () => void;
}) {
    const [editing, setEditing] = useState(false);
    const total = (chargerPrice || 0) + (bagPrice || 0);
    const [inputVal, setInputVal] = useState(String(total));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!editing) {
            setInputVal(String(total));
        }
    }, [total, editing]);

    const handleSave = async () => {
        const parsedTotal = Math.round(Number(inputVal.replace(/\./g, "").replace(/,/g, "")));

        if (!Number.isFinite(parsedTotal) || parsedTotal < 0) {
            setError("Nominal tidak valid");
            return;
        }
        if (parsedTotal === total) {
            setEditing(false);
            return;
        }

        setSaving(true);
        setError("");
        try {
            const res = await fetch(`/api/laptops/${laptopId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    charger_price: parsedTotal,
                    laptop_bag_price: 0,
                }),
            });
            const result = await res.json();
            if (!result.success) {
                setError(result.message || "Gagal menyimpan");
                return;
            }
            onSaved();
            setEditing(false);
        } catch {
            setError("Koneksi gagal");
        } finally {
            setSaving(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") handleSave();
        if (e.key === "Escape") {
            setEditing(false);
            setInputVal(String(total));
            setError("");
        }
    };

    if (editing) {
        return (
            <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-1">
                    <input
                        type="number"
                        value={inputVal}
                        onChange={e => { setInputVal(e.target.value); setError(""); }}
                        onKeyDown={handleKeyDown}
                        autoFocus
                        className="w-28 h-7 border border-violet-400 rounded-lg px-2 text-xs text-right tabular-nums bg-white focus:outline-none focus:ring-2 focus:ring-violet-400/30"
                        min={0}
                        placeholder="Total biaya..."
                    />
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="w-7 h-7 flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition disabled:opacity-60"
                        title="Simpan"
                    >
                        {saving ? (
                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                        ) : (
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                        )}
                    </button>
                    <button
                        onClick={() => {
                            setEditing(false);
                            setInputVal(String(total));
                            setError("");
                        }}
                        className="w-7 h-7 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-lg transition"
                        title="Batal"
                    >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                {error && <p className="text-[10px] text-red-500 font-medium">{error}</p>}
            </div>
        );
    }

    return (
        <div className="flex items-center justify-end gap-2">
            <span className="text-xs text-gray-800 tabular-nums font-semibold">{fmt(total)}</span>
            <button
                onClick={() => { setEditing(true); setInputVal(String(total)); }}
                className="inline-flex items-center gap-1 px-2 py-1 bg-violet-50 hover:bg-violet-100 border border-violet-200 hover:border-violet-300 text-violet-600 hover:text-violet-700 rounded-md text-[10px] font-semibold transition-colors"
                title="Edit biaya charger & tas"
            >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Edit
            </button>
        </div>
    );
}
