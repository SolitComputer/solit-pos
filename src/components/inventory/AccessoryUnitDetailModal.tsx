"use client";
// src/components/inventory/AccessoryUnitDetailModal.tsx

import { useEffect, useState } from "react";
import { useRegisterOverlay } from "@/contexts/OverlayContext";

export interface AccessoryUnitDetailData {
    id: string;
    accessory_id: string;
    serial_number: string;
    condition: "BARU" | "BEKAS";
    buy_price: number;
    selling_price: number;
    status: string;
    notes: string;
    created_at: string;
}

interface Props {
    unit: AccessoryUnitDetailData;
    accessoryName?: string;
    accessoryMeta?: string;
    canEdit: boolean;
    canSeePrivate: boolean;
    onClose: () => void;
    onSaved: (updated: AccessoryUnitDetailData) => void;
    defaultSellingPrice?: number;
    onCreated?: (created: AccessoryUnitDetailData) => void;
}

const STATUS_STYLE: Record<string, { badge: string; dot: string; label: string }> = {
    TERSEDIA: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", label: "Tersedia" },
    RESERVED: { badge: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-400", label: "Reserved" },
    TERJUAL: { badge: "bg-gray-100 text-gray-500 border-gray-200", dot: "bg-gray-400", label: "Terjual" },
};
const CONDITION_STYLE: Record<string, { badge: string }> = {
    BARU: { badge: "bg-sky-50 text-sky-700 border-sky-200" },
    BEKAS: { badge: "bg-amber-50 text-amber-700 border-amber-200" },
};
// ✅ FIX: tambah RESERVED sebagai status ketiga yang bisa dipilih — sebelumnya
// cuma TERSEDIA/TERJUAL, padahal RESERVED sudah dipakai nyata di
// api/accessory-units/[id]/route.ts (PATCH) dan halaman Units aksesori.
const EDITABLE_STATUS = ["TERSEDIA", "RESERVED", "TERJUAL"] as const;

const fmt = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");
const fmtDate = (iso: string) =>
    iso ? new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" }) : "—";

const inputCls =
    "w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-zinc-400/20 focus:border-zinc-400 focus:bg-white transition";

export default function AccessoryUnitDetailModal({
    unit, accessoryName, accessoryMeta, canEdit, canSeePrivate, onClose, onSaved,
    defaultSellingPrice, onCreated,
}: Props) {
    useRegisterOverlay();
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [form, setForm] = useState({
        serial_number: unit.serial_number ?? "",
        condition: unit.condition ?? "BARU",
        buy_price: String(unit.buy_price ?? 0),
        selling_price: String(unit.selling_price ?? 0),
        status: unit.status ?? "TERSEDIA",
        notes: unit.notes ?? "",
    });

    const [isAdding, setIsAdding] = useState(false);
    const [addSaving, setAddSaving] = useState(false);
    const [addError, setAddError] = useState("");
    const emptyAddForm = () => ({
        serial_number: "",
        condition: "BARU",
        buy_price: "0",
        selling_price: String(defaultSellingPrice ?? unit.selling_price ?? 0),
        notes: "",
    });
    const [addForm, setAddForm] = useState(emptyAddForm);

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving && !addSaving) onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose, saving, addSaving]);

    const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));
    const setAdd = (k: keyof typeof addForm, v: string) => setAddForm(p => ({ ...p, [k]: v }));

    const buyNow = isEditing ? Number(form.buy_price) || 0 : (unit.buy_price ?? 0);
    const jualNow = isEditing ? Number(form.selling_price) || 0 : (unit.selling_price ?? 0);
    const margin = jualNow - buyNow;
    const marginPct = buyNow > 0 ? (margin / buyNow) * 100 : 0;

    const handleSave = async () => {
        if (!form.serial_number.trim()) { setError("Serial number wajib diisi"); return; }
        setSaving(true); setError("");
        try {
            // Endpoint asli: PATCH /api/accessory-units/[id]
            const res = await fetch(`/api/accessory-units/${unit.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    serial_number: form.serial_number.trim(),
                    condition: form.condition,
                    buy_price: Number(form.buy_price) || 0,
                    selling_price: Number(form.selling_price) || 0,
                    status: form.status,
                    notes: form.notes,
                }),
            });
            const result = await res.json();
            if (!res.ok || !result.success) throw new Error(result.error || result.message || "Gagal menyimpan");
            onSaved(result.data as AccessoryUnitDetailData);
            setIsEditing(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Terjadi kesalahan");
        } finally {
            setSaving(false);
        }
    };

    const handleCreateUnit = async () => {
        if (!addForm.serial_number.trim()) { setAddError("Serial number wajib diisi"); return; }
        setAddSaving(true); setAddError("");
        try {
            // Endpoint asli: POST /api/accessory-units (bukan nested per-accessory)
            const res = await fetch(`/api/accessory-units`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    accessory_id: unit.accessory_id,
                    serial_number: addForm.serial_number.trim(),
                    condition: addForm.condition,
                    buy_price: Number(addForm.buy_price) || 0,
                    selling_price: Number(addForm.selling_price) || 0,
                    notes: addForm.notes,
                }),
            });
            const result = await res.json();
            if (!res.ok || !result.success) throw new Error(result.error || result.message || "Gagal menambahkan unit");
            onCreated?.(result.data as AccessoryUnitDetailData);
            setIsAdding(false);
            setAddForm(emptyAddForm());
        } catch (e) {
            setAddError(e instanceof Error ? e.message : "Terjadi kesalahan");
        } finally {
            setAddSaving(false);
        }
    };

    const st = STATUS_STYLE[unit.status];
    const cd = CONDITION_STYLE[unit.condition];

    return (
        <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={() => !saving && !addSaving && onClose()} />
            <div className="relative bg-white w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden">
                <div className="h-0.5 w-full bg-gradient-to-r from-zinc-300 via-zinc-600 to-zinc-900 flex-shrink-0" />

                <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
                    <div className="min-w-0">
                        <h2 className="font-bold text-gray-900 text-[15px] tracking-tight truncate">{accessoryName || "Detail Unit"}</h2>
                        <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                            {isAdding ? "Menambahkan unit baru — isi Serial Number & data unit"
                                : isEditing ? "Mode edit aktif — semua field bisa diubah" : (accessoryMeta || "Detail unit")}
                        </p>
                    </div>
                    <button onClick={() => !saving && !addSaving && onClose()}
                        className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition flex-shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
                    {isAdding ? (
                        <div className="space-y-5">
                            <Section title="Data Unit Baru">
                                <div className="space-y-3">
                                    <Field label="Serial Number" required>
                                        <input value={addForm.serial_number} onChange={e => setAdd("serial_number", e.target.value)}
                                            placeholder="Masukkan SN unit baru" className={`${inputCls} font-mono`} autoFocus />
                                    </Field>
                                    <Field label="Kondisi">
                                        <select value={addForm.condition} onChange={e => setAdd("condition", e.target.value)} className={inputCls}>
                                            <option value="BARU">Baru</option>
                                            <option value="BEKAS">Bekas</option>
                                        </select>
                                    </Field>
                                </div>
                            </Section>

                            {canSeePrivate && (
                                <Section title="Keuangan Unit">
                                    <div className="grid grid-cols-2 gap-3">
                                        <Field label="Harga Modal">
                                            <input type="number" min={0} value={addForm.buy_price}
                                                onChange={e => setAdd("buy_price", e.target.value)} className={`${inputCls} tabular-nums`} />
                                        </Field>
                                        <Field label="Harga Jual">
                                            <input type="number" min={0} value={addForm.selling_price}
                                                onChange={e => setAdd("selling_price", e.target.value)} className={`${inputCls} tabular-nums`} />
                                        </Field>
                                    </div>
                                </Section>
                            )}

                            <Section title="Catatan">
                                <textarea rows={2} value={addForm.notes} onChange={e => setAdd("notes", e.target.value)}
                                    className={`${inputCls} h-auto py-2.5 resize-none`} />
                            </Section>

                            {addError && (
                                <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                                    <p className="text-xs text-red-700">{addError}</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Serial Number</p>
                                {isEditing ? (
                                    <input value={form.serial_number} onChange={e => set("serial_number", e.target.value)}
                                        className={`${inputCls} font-mono bg-white`} autoFocus />
                                ) : (
                                    <code className="inline-block font-mono text-sm text-gray-900 bg-white border border-gray-200 px-3 py-1.5 rounded-lg select-all">
                                        {unit.serial_number}
                                    </code>
                                )}
                                {!isEditing && (
                                    <div className="flex flex-wrap items-center gap-2 mt-3">
                                        {st && (
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${st.badge}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{st.label}
                                            </span>
                                        )}
                                        {cd && (
                                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold border ${cd.badge}`}>
                                                {unit.condition === "BARU" ? "Baru" : "Bekas"}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>

                            {isEditing && (
                                <Section title="Status & Kondisi">
                                    <div className="grid grid-cols-2 gap-3">
                                        <Field label="Status">
                                            <select value={form.status} onChange={e => set("status", e.target.value)} className={inputCls}>
                                                {EDITABLE_STATUS.map(s => <option key={s} value={s}>{STATUS_STYLE[s].label}</option>)}
                                            </select>
                                        </Field>
                                        <Field label="Kondisi">
                                            <select value={form.condition} onChange={e => set("condition", e.target.value)} className={inputCls}>
                                                <option value="BARU">Baru</option>
                                                <option value="BEKAS">Bekas</option>
                                            </select>
                                        </Field>
                                    </div>
                                </Section>
                            )}

                            {canSeePrivate ? (
                                <>
                                    <Section title="Tanggal Masuk">
                                        <p className="text-sm text-gray-800 font-medium">{fmtDate(unit.created_at)}</p>
                                    </Section>

                                    <Section title="Keuangan Unit">
                                        <div className="grid grid-cols-2 gap-3">
                                            <Field label="Harga Modal">
                                                {isEditing ? (
                                                    <input type="number" min={0} value={form.buy_price}
                                                        onChange={e => set("buy_price", e.target.value)} className={`${inputCls} tabular-nums`} />
                                                ) : (
                                                    <p className="text-sm font-semibold text-gray-800 tabular-nums">{fmt(buyNow)}</p>
                                                )}
                                            </Field>
                                            <Field label="Harga Jual">
                                                {isEditing ? (
                                                    <input type="number" min={0} value={form.selling_price}
                                                        onChange={e => set("selling_price", e.target.value)} className={`${inputCls} tabular-nums`} />
                                                ) : (
                                                    <p className="text-sm font-semibold text-gray-800 tabular-nums">{fmt(jualNow)}</p>
                                                )}
                                            </Field>
                                        </div>
                                        <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 divide-y divide-gray-200">
                                            <div className="flex items-center justify-between px-3.5 py-2">
                                                <span className="text-xs text-gray-500">Margin</span>
                                                <span className={`text-sm font-black tabular-nums ${margin >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                                    {margin >= 0 ? "+" : "−"}{fmt(Math.abs(margin))}
                                                    {buyNow > 0 && (
                                                        <span className="ml-1.5 text-[11px] font-semibold opacity-70">
                                                            ({marginPct >= 0 ? "+" : ""}{marginPct.toFixed(1)}%)
                                                        </span>
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                    </Section>

                                    <Section title="Catatan">
                                        {isEditing ? (
                                            <textarea rows={2} value={form.notes} onChange={e => set("notes", e.target.value)}
                                                className={`${inputCls} h-auto py-2.5 resize-none`} />
                                        ) : (
                                            <p className="text-sm text-gray-700 leading-relaxed">
                                                {unit.notes || <span className="text-gray-300">Belum diisi</span>}
                                            </p>
                                        )}
                                    </Section>

                                    {!isEditing && (
                                        <p className="text-[10px] text-gray-300 font-mono break-all">ID unit: {unit.id}</p>
                                    )}
                                </>
                            ) : (
                                <p className="text-[11px] text-gray-400 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5">
                                    Harga modal hanya dapat diakses oleh Pengelola Barang.
                                </p>
                            )}

                            {error && (
                                <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                                    <p className="text-xs text-red-700">{error}</p>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="px-5 py-4 border-t border-gray-100 flex gap-2 flex-shrink-0">
                    {isAdding ? (
                        <>
                            <button onClick={() => { setIsAdding(false); setAddError(""); setAddForm(emptyAddForm()); }} disabled={addSaving}
                                className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition disabled:opacity-50">
                                Batal
                            </button>
                            <button onClick={handleCreateUnit} disabled={addSaving}
                                className="flex-1 h-11 bg-zinc-800 text-white rounded-xl text-sm font-semibold hover:bg-zinc-900 transition disabled:opacity-50 flex items-center justify-center gap-2">
                                {addSaving ? (<><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</>) : "Simpan Unit Baru"}
                            </button>
                        </>
                    ) : isEditing ? (
                        <>
                            <button onClick={() => { setIsEditing(false); setError(""); }} disabled={saving}
                                className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition disabled:opacity-50">
                                Batal
                            </button>
                            <button onClick={handleSave} disabled={saving}
                                className="flex-1 h-11 bg-zinc-800 text-white rounded-xl text-sm font-semibold hover:bg-zinc-900 transition disabled:opacity-50 flex items-center justify-center gap-2">
                                {saving ? (<><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</>) : "Simpan Perubahan"}
                            </button>
                        </>
                    ) : (
                        <>
                            <button onClick={onClose} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition">
                                Tutup
                            </button>
                            {canEdit && (
                                <button onClick={() => setIsAdding(true)}
                                    className="h-11 px-4 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition flex items-center justify-center whitespace-nowrap">
                                    + Tambah Unit
                                </button>
                            )}
                            {canEdit && (
                                <button onClick={() => setIsEditing(true)}
                                    className="flex-1 h-11 bg-zinc-800 text-white rounded-xl text-sm font-semibold hover:bg-zinc-900 transition shadow-lg shadow-zinc-800/20">
                                    Edit Data
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">{title}</p>
            {children}
        </div>
    );
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
    return (
        <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                {label}{required && <span className="text-red-400 ml-0.5">*</span>}
            </label>
            {children}
        </div>
    );
}