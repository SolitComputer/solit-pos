"use client";
// src/components/inventory/UnitDetailModal.tsx
//
// Pop-up Detail Unit — dipakai 3 tempat supaya UI konsisten:
//   1. Data Barang (LaptopsContent) saat stok = 1
//   2. Data Barang → Pop-up Detail Laptop → klik salah satu unit
//   3. Halaman Units saat user klik salah satu baris unit
//
// Mode view = read-only. Mode edit = semua field jadi input (Full Access only).
// Role non-Full-Access (Sales) hanya melihat SN + Status; sisanya disembunyikan.

import { useEffect, useState } from "react";
import { useRegisterOverlay } from "@/contexts/OverlayContext";

export interface UnitDetailData {
    id: string;
    laptop_id: string;
    serial_number: string;
    grade: "A" | "B" | "C";
    condition_note: string;
    source?: string | null;
    purchase_price: number;
    sparepart_cost?: number;
    selling_price: number;
    official_price?: number;
    status: string;
    notes: string;
    created_at: string;
}

interface Props {
    unit: UnitDetailData;
    laptopName?: string;
    laptopMeta?: string;
    /** Spesifikasi model untuk ditampilkan di dalam modal (CPU, RAM, GPU, dst) */
    laptopSpecs?: { label: string; value?: string | null }[];
    /** Full Access → boleh toggle mode Edit */
    canEdit: boolean;
    /** Boleh lihat Sumber, Harga Modal, Margin, Tanggal Masuk */
    canSeePrivate: boolean;
    onClose: () => void;
    onSaved: (updated: UnitDetailData) => void;
    /** Opsional: tombol "Info Laptop" (nama/CPU/RAM) — hanya dari Data Barang */
    onEditLaptop?: () => void;
    /** Harga jual default untuk mengisi form "Tambah Unit" (biasanya = harga jual model laptop) */
    defaultSellingPrice?: number;
    /** Dipanggil setelah unit BARU berhasil dibuat lewat form "Tambah Unit" di dalam pop-up ini */
    onCreated?: (created: UnitDetailData) => void;
    /** Kalau modal ini dibuka dari Pop-up Detail Laptop, tampilkan tombol "Kembali" di header */
    onBack?: () => void;
}

const GRADE_STYLE: Record<string, { badge: string; desc: string }> = {
    A: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", desc: "Sempurna" },
    B: { badge: "bg-amber-50 text-amber-700 border-amber-200", desc: "Ada minus" },
    C: { badge: "bg-red-50 text-red-700 border-red-200", desc: "Banyak minus" },
};

const STATUS_STYLE: Record<string, { badge: string; dot: string; label: string }> = {
    SIAP_JUAL: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", label: "Siap Jual" },
    BELUM_SIAP: { badge: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-400", label: "Belum Siap" },
    SERVICE: { badge: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-500", label: "Service" },
    RESERVED: { badge: "bg-violet-50 text-violet-700 border-violet-200", dot: "bg-violet-500", label: "Dipesan (DP)" },
    HELD: { badge: "bg-orange-50 text-orange-700 border-orange-200", dot: "bg-orange-500", label: "Diambil Dulu" },
    PACKING: { badge: "bg-sky-50 text-sky-700 border-sky-200", dot: "bg-sky-500", label: "Packing" },
    SOLD: { badge: "bg-gray-100 text-gray-500 border-gray-200", dot: "bg-gray-400", label: "Terjual" },
};

// Status yang boleh dipilih manual. RESERVED/HELD/PACKING/SOLD digerakkan
// oleh alur transaksi, bukan diedit tangan dari sini.
const EDITABLE_STATUS = ["SIAP_JUAL", "BELUM_SIAP", "SERVICE"] as const;

const fmt = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");
const fmtDate = (iso: string) =>
    iso ? new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" }) : "—";
const toDateInput = (iso: string) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");

/** Berapa lama unit ini mengendap di gudang — indikator stok mati. */
function umurStok(iso: string): string {
    if (!iso) return "—";
    const hari = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
    if (hari === 0) return "hari ini";
    if (hari < 30) return `${hari} hari`;
    const bulan = Math.floor(hari / 30);
    return bulan < 12 ? `${bulan} bulan` : `${Math.floor(bulan / 12)} tahun ${bulan % 12} bulan`;
}

const inputCls =
    "w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400/20 focus:border-gray-400 focus:bg-white transition";

// Markup tetap untuk Harga Official = Harga Setor + markup ini.
const OFFICIAL_PRICE_MARKUP = 300_000;

export default function UnitDetailModal({
    unit, laptopName, laptopMeta, laptopSpecs, canEdit, canSeePrivate, onClose, onSaved, onEditLaptop,
    defaultSellingPrice, onCreated, onBack,
}: Props) {
    useRegisterOverlay();
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [form, setForm] = useState({
        serial_number: unit.serial_number ?? "",
        grade: unit.grade ?? "B",
        condition_note: unit.condition_note ?? "",
        source: unit.source ?? "",
        purchase_price: String(unit.purchase_price ?? 0),
        sparepart_cost: String(unit.sparepart_cost ?? 0),
        selling_price: String(unit.selling_price ?? 0),
        official_price: String(unit.official_price ?? 0),
        status: unit.status ?? "SIAP_JUAL",
        notes: unit.notes ?? "",
        received_at: toDateInput(unit.created_at),
    });

    //  Mode "Tambah Unit" — supaya menambah unit baru tetap terjadi DI DALAM
    //  pop-up ini (tidak pindah halaman), khusus untuk kasus stok = 1 yang
    //  sebelumnya tidak punya jalan sama sekali untuk menambah unit.
    const [isAdding, setIsAdding] = useState(false);
    const [addSaving, setAddSaving] = useState(false);
    const [addError, setAddError] = useState("");
    const emptyAddForm = () => ({
        serial_number: "",
        grade: "B",
        condition_note: "",
        source: "",
        purchase_price: "0",
        sparepart_cost: "0",
        selling_price: String(defaultSellingPrice ?? unit.selling_price ?? 0),
        official_price: "0",
        status: "SIAP_JUAL",
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

    // Angka yang ditampilkan ikut berubah live saat mode edit, supaya user
    // langsung lihat dampak perubahan harga ke margin sebelum menyimpan.
    const modalNow = isEditing ? Number(form.purchase_price) || 0 : (unit.purchase_price ?? 0);
    const sparepartNow = isEditing ? Number(form.sparepart_cost) || 0 : (unit.sparepart_cost ?? 0);
    const jualNow = isEditing ? Number(form.selling_price) || 0 : (unit.selling_price ?? 0);
   const officialNow = isEditing ? jualNow + OFFICIAL_PRICE_MARKUP : (unit.official_price ?? 0);
    const totalModal = modalNow + sparepartNow;
    const margin = jualNow - totalModal;
    const marginPct = totalModal > 0 ? (margin / totalModal) * 100 : 0;

    const handleSave = async () => {
        if (!form.serial_number.trim()) { setError("Serial number wajib diisi"); return; }
        setSaving(true); setError("");
        try {
            const res = await fetch(`/api/units/${unit.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    serial_number: form.serial_number.trim(),
                    grade: form.grade,
                    condition_note: form.condition_note,
                    source: form.source.trim() || null,
                    purchase_price: Number(form.purchase_price) || 0,
                    sparepart_cost: Number(form.sparepart_cost) || 0,
                    selling_price: Number(form.selling_price) || 0,
                    official_price: (Number(form.selling_price) || 0) + OFFICIAL_PRICE_MARKUP,
                    status: form.status,
                    notes: form.notes,
                    received_at: form.received_at ? new Date(form.received_at).toISOString() : undefined,
                }),
            });
            const result = await res.json();
            if (!res.ok || !result.success) throw new Error(result.message || "Gagal menyimpan");
            onSaved(result.data as UnitDetailData);
            setIsEditing(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Terjadi kesalahan");
        } finally {
            setSaving(false);
        }
    };

    //  Simpan unit BARU. Asumsi endpoint POST /api/laptops/{laptop_id}/units —
    //  cek dulu, sesuaikan kalau beda dengan yang dipakai UnitFormModal.tsx.
    const handleCreateUnit = async () => {
        if (!addForm.serial_number.trim()) { setAddError("Serial number wajib diisi"); return; }
        setAddSaving(true); setAddError("");
        try {
            const res = await fetch(`/api/laptops/${unit.laptop_id}/units`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    serial_number: addForm.serial_number.trim(),
                    grade: addForm.grade,
                    condition_note: addForm.condition_note,
                    source: addForm.source.trim() || null,
                    purchase_price: Number(addForm.purchase_price) || 0,
                    sparepart_cost: Number(addForm.sparepart_cost) || 0,
                    selling_price: Number(addForm.selling_price) || 0,
                    official_price: (Number(addForm.selling_price) || 0) + OFFICIAL_PRICE_MARKUP,
                    status: addForm.status,
                    notes: addForm.notes,
                }),
            });
            const result = await res.json();
            if (!res.ok || !result.success) throw new Error(result.message || "Gagal menambahkan unit");
            onCreated?.(result.data as UnitDetailData);
            setIsAdding(false);
            setAddForm(emptyAddForm());
        } catch (e) {
            setAddError(e instanceof Error ? e.message : "Terjadi kesalahan");
        } finally {
            setAddSaving(false);
        }
    };

    const st = STATUS_STYLE[unit.status];
    const gr = GRADE_STYLE[unit.grade];
    const specs = (laptopSpecs ?? []).filter(s => s.value);

    return (
       <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={() => !saving && !addSaving && onClose()} />

            <div className="relative bg-white w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden">
                <div className="h-0.5 w-full bg-gradient-to-r from-gray-300 via-gray-700 to-gray-900 flex-shrink-0" />

                {/* ── Header ── */}
                <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
                    <div className="flex items-start gap-2 min-w-0">
                        {onBack && (
                            <button
                                onClick={() => !saving && !addSaving && onBack()}
                                title="Kembali ke Detail Laptop"
                                className="w-8 h-8 mt-0.5 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition flex-shrink-0"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                            </button>
                        )}
                        <div className="min-w-0">
                            <h2 className="font-bold text-gray-900 text-[15px] tracking-tight truncate">
                                {laptopName || "Detail Unit"}
                            </h2>
                            <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                                {isAdding
                                    ? "Menambahkan unit baru — isi Serial Number & data unit"
                                    : isEditing ? "Mode edit aktif — semua field bisa diubah" : (laptopMeta || "Detail unit")}
                            </p>
                        </div>
                    </div>
                    <button onClick={() => !saving && !addSaving && onClose()}
                        className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition flex-shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* ── Body ── */}
                <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
                    {isAdding ? (
                        <div className="space-y-5">
                            <Section title="Data Unit Baru">
                                <div className="space-y-3">
                                    <Field label="Serial Number" required>
                                        <input value={addForm.serial_number} onChange={e => setAdd("serial_number", e.target.value)}
                                            placeholder="Masukkan SN unit baru" className={`${inputCls} font-mono`} autoFocus />
                                    </Field>
                                    <div className="grid grid-cols-2 gap-3">
                                        <Field label="Grade">
                                            <select value={addForm.grade} onChange={e => setAdd("grade", e.target.value)} className={inputCls}>
                                                <option value="A">Grade A — Sempurna</option>
                                                <option value="B">Grade B — Ada minus</option>
                                                <option value="C">Grade C — Banyak minus</option>
                                            </select>
                                        </Field>
                                        <Field label="Status Stok">
                                            <select value={addForm.status} onChange={e => setAdd("status", e.target.value)} className={inputCls}>
                                                {EDITABLE_STATUS.map(s => (
                                                    <option key={s} value={s}>{STATUS_STYLE[s].label}</option>
                                                ))}
                                            </select>
                                        </Field>
                                    </div>
                                    <Field label="Kondisi Fisik">
                                        <textarea rows={2} value={addForm.condition_note} onChange={e => setAdd("condition_note", e.target.value)}
                                            placeholder="Lecet di sudut kiri, baterai 80%, engsel goyang..."
                                            className={`${inputCls} h-auto py-2.5 resize-none`} />
                                    </Field>
                                </div>
                            </Section>

                            {canSeePrivate && (
                                <Section title="Asal & Keuangan Unit">
                                    <div className="space-y-3">
                                        <Field label="Sumber Barang">
                                            <input value={addForm.source} onChange={e => setAdd("source", e.target.value)}
                                                placeholder="Supplier Jakarta, Tukar Tambah, Lelang..." className={inputCls} />
                                        </Field>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                            <Field label="Harga Modal">
                                                <input type="number" min={0} value={addForm.purchase_price}
                                                    onChange={e => setAdd("purchase_price", e.target.value)} className={`${inputCls} tabular-nums`} />
                                            </Field>
                                            <Field label="Biaya Sparepart">
                                                <input type="number" min={0} value={addForm.sparepart_cost}
                                                    onChange={e => setAdd("sparepart_cost", e.target.value)} className={`${inputCls} tabular-nums`} />
                                            </Field>
                                            <Field label="Harga Setor">
                                                <input type="number" min={0} value={addForm.selling_price}
                                                    onChange={e => setAdd("selling_price", e.target.value)} className={`${inputCls} tabular-nums`} />
                                            </Field>
                                            <Field label="Harga Official">
                                                <input type="number" value={(Number(addForm.selling_price) || 0) + OFFICIAL_PRICE_MARKUP} disabled
                                                    className={`${inputCls} tabular-nums bg-gray-100 text-gray-500 cursor-not-allowed`} />
                                                <p className="text-[10px] text-gray-400 mt-1">Otomatis: Harga Setor + Rp 300.000</p>
                                            </Field>
                                        </div>
                                    </div>
                                </Section>
                            )}

                            <Section title="Catatan Tambahan">
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

                            {/* Ringkasan atas — SN + status + grade */}
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
                                        {canSeePrivate && gr && (
                                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold border ${gr.badge}`}>
                                                Grade {unit.grade}
                                                <span className="font-medium opacity-70">· {gr.desc}</span>
                                            </span>
                                        )}
                                        {canSeePrivate && unit.status !== "SOLD" && (
                                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-white border border-gray-200 text-gray-500">
                                                Mengendap {umurStok(unit.created_at)}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Spesifikasi model */}
                            {specs.length > 0 && (
                                <Section title="Spesifikasi Laptop">
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                        {specs.map(s => (
                                            <div key={s.label} className="bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
                                                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{s.label}</p>
                                                <p className="text-xs font-semibold text-gray-800 mt-0.5 break-words leading-snug">{s.value}</p>
                                            </div>
                                        ))}
                                    </div>
                                </Section>
                            )}

                            {/* Status & Grade — hanya muncul sebagai input saat mode edit */}
                            {isEditing && (
                                <Section title="Status & Grade">
                                    <div className="grid grid-cols-2 gap-3">
                                        <Field label="Status Stok">
                                            <select value={form.status} onChange={e => set("status", e.target.value)} className={inputCls}>
                                                {EDITABLE_STATUS.map(s => (
                                                    <option key={s} value={s}>{STATUS_STYLE[s].label}</option>
                                                ))}
                                                {!EDITABLE_STATUS.includes(form.status as typeof EDITABLE_STATUS[number]) && (
                                                    <option value={form.status}>{STATUS_STYLE[form.status]?.label ?? form.status}</option>
                                                )}
                                            </select>
                                        </Field>
                                        {canSeePrivate && (
                                            <Field label="Grade">
                                                <select value={form.grade} onChange={e => set("grade", e.target.value)} className={inputCls}>
                                                    <option value="A">Grade A — Sempurna</option>
                                                    <option value="B">Grade B — Ada minus</option>
                                                    <option value="C">Grade C — Banyak minus</option>
                                                </select>
                                            </Field>
                                        )}
                                    </div>
                                </Section>
                            )}

                            {/* ── Blok sensitif: Sales tidak melihat sama sekali ── */}
                            {canSeePrivate ? (
                                <>
                                    <Section title="Asal & Waktu Masuk">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <Field label="Sumber Barang">
                                                {isEditing ? (
                                                    <input value={form.source} onChange={e => set("source", e.target.value)}
                                                        placeholder="Supplier Jakarta, Tukar Tambah, Lelang..." className={inputCls} />
                                                ) : (
                                                    <p className="text-sm text-gray-800 font-medium">
                                                        {unit.source || <span className="text-gray-300 font-normal">Belum diisi</span>}
                                                    </p>
                                                )}
                                            </Field>
                                            <Field label="Tanggal Masuk">
                                                {isEditing ? (
                                                    <input type="date" value={form.received_at} onChange={e => set("received_at", e.target.value)} className={inputCls} />
                                                ) : (
                                                    <p className="text-sm text-gray-800 font-medium">{fmtDate(unit.created_at)}</p>
                                                )}
                                            </Field>
                                        </div>
                                    </Section>

                                    <Section title="Keuangan Unit">
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                            <Field label="Harga Modal">
                                                {isEditing ? (
                                                    <input type="number" min={0} value={form.purchase_price}
                                                        onChange={e => set("purchase_price", e.target.value)} className={`${inputCls} tabular-nums`} />
                                                ) : (
                                                    <p className="text-sm font-semibold text-gray-800 tabular-nums">{fmt(modalNow)}</p>
                                                )}
                                            </Field>
                                            <Field label="Biaya Sparepart">
                                                {isEditing ? (
                                                    <input type="number" min={0} value={form.sparepart_cost}
                                                        onChange={e => set("sparepart_cost", e.target.value)} className={`${inputCls} tabular-nums`} />
                                                ) : (
                                                    <p className="text-sm font-semibold text-gray-800 tabular-nums">{fmt(sparepartNow)}</p>
                                                )}
                                            </Field>
                                           <Field label="Harga Setor">
                                                {isEditing ? (
                                                    <input type="number" min={0} value={form.selling_price}
                                                        onChange={e => set("selling_price", e.target.value)} className={`${inputCls} tabular-nums`} />
                                                ) : (
                                                    <p className="text-sm font-semibold text-gray-800 tabular-nums">{fmt(jualNow)}</p>
                                                )}
                                            </Field>
                                            <Field label="Harga Official">
                                                <p className="text-sm font-semibold text-gray-800 tabular-nums">{fmt(officialNow)}</p>
                                                {isEditing && (
                                                    <p className="text-[10px] text-gray-400 mt-1">Otomatis: Harga Setor + Rp 300.000</p>
                                                )}
                                            </Field>
                                        </div>

                                        {/* Ringkasan margin — dihitung live, termasuk saat mode edit */}
                                        <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 divide-y divide-gray-200">
                                            <div className="flex items-center justify-between px-3.5 py-2">
                                                <span className="text-xs text-gray-500">Total Modal <span className="text-gray-400">(modal + sparepart)</span></span>
                                                <span className="text-sm font-bold text-gray-800 tabular-nums">{fmt(totalModal)}</span>
                                            </div>
                                            <div className="flex items-center justify-between px-3.5 py-2">
                                                <span className="text-xs text-gray-500">Margin</span>
                                                <span className={`text-sm font-black tabular-nums ${margin >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                                    {margin >= 0 ? "+" : "−"}{fmt(Math.abs(margin))}
                                                    {totalModal > 0 && (
                                                        <span className="ml-1.5 text-[11px] font-semibold opacity-70">
                                                            ({marginPct >= 0 ? "+" : ""}{marginPct.toFixed(1)}%)
                                                        </span>
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                    </Section>

                                    <Section title="Kondisi & Catatan">
                                        <div className="space-y-3">
                                            <Field label="Kondisi Fisik">
                                                {isEditing ? (
                                                    <textarea rows={2} value={form.condition_note} onChange={e => set("condition_note", e.target.value)}
                                                        placeholder="Lecet di sudut kiri, baterai 80%, engsel goyang..."
                                                        className={`${inputCls} h-auto py-2.5 resize-none`} />
                                                ) : (
                                                    <p className="text-sm text-gray-700 leading-relaxed">
                                                        {unit.condition_note || <span className="text-gray-300">Belum diisi</span>}
                                                    </p>
                                                )}
                                            </Field>
                                            <Field label="Catatan Tambahan">
                                                {isEditing ? (
                                                    <textarea rows={2} value={form.notes} onChange={e => set("notes", e.target.value)}
                                                        className={`${inputCls} h-auto py-2.5 resize-none`} />
                                                ) : (
                                                    <p className="text-sm text-gray-700 leading-relaxed">
                                                        {unit.notes || <span className="text-gray-300">Belum diisi</span>}
                                                    </p>
                                                )}
                                            </Field>
                                        </div>
                                    </Section>

                                    {!isEditing && (
                                        <p className="text-[10px] text-gray-300 font-mono break-all">ID unit: {unit.id}</p>
                                    )}
                                </>
                            ) : (
                                <p className="text-[11px] text-gray-400 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5">
                                    Sumber barang, harga modal, dan tanggal masuk hanya dapat diakses oleh Pengelola Barang.
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

                {/* ── Footer ── */}
                <div className="px-5 py-4 border-t border-gray-100 flex gap-2 flex-shrink-0">
                    {isAdding ? (
                        <>
                            <button onClick={() => { setIsAdding(false); setAddError(""); setAddForm(emptyAddForm()); }} disabled={addSaving}
                                className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition disabled:opacity-50">
                                Batal
                            </button>
                            <button onClick={handleCreateUnit} disabled={addSaving}
                                className="flex-1 h-11 bg-gray-800 text-white rounded-xl text-sm font-semibold hover:bg-gray-900 transition disabled:opacity-50 flex items-center justify-center gap-2">
                                {addSaving ? (
                                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</>
                                ) : "Simpan Unit Baru"}
                            </button>
                        </>
                    ) : isEditing ? (
                        <>
                            <button onClick={() => { setIsEditing(false); setError(""); }} disabled={saving}
                                className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition disabled:opacity-50">
                                Batal
                            </button>
                            <button onClick={handleSave} disabled={saving}
                                className="flex-1 h-11 bg-gray-800 text-white rounded-xl text-sm font-semibold hover:bg-gray-900 transition disabled:opacity-50 flex items-center justify-center gap-2">
                                {saving ? (
                                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</>
                                ) : "Simpan Perubahan"}
                            </button>
                        </>
                    ) : (
                        <>
                            <button onClick={onClose}
                                className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition">
                                Tutup
                            </button>
                            {canEdit && onEditLaptop && (
                                <button onClick={onEditLaptop}
                                    className="h-11 px-4 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition">
                                    Info Laptop
                                </button>
                            )}
                            {/*  Tambah unit baru TETAP DI DALAM pop-up ini (bukan navigasi ke
                                halaman Units) — supaya saat stok = 1, popup ini jadi satu-satunya
                                tempat yang dibutuhkan untuk lihat, edit, maupun tambah unit. */}
                            {canEdit && (
                                <button onClick={() => setIsAdding(true)}
                                    className="h-11 px-4 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition flex items-center justify-center whitespace-nowrap">
                                    + Tambah Unit
                                </button>
                            )}
                            {canEdit && (
                                <button onClick={() => setIsEditing(true)}
                                    className="flex-1 h-11 bg-gray-800 text-white rounded-xl text-sm font-semibold hover:bg-gray-900 transition shadow-lg shadow-gray-800/20">
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