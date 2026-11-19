"use client";

import { useState, useMemo } from "react";
import { CurrencyInput } from "@/components/ui/CurrencyInputField";
import AutocompleteInput from "@/components/ui/AutocompleteInput";

export interface CreatedSnFirstUnit {
    id: string;
    serial_number: string;
    [key: string]: unknown;
}

type Tipe = "LAPTOP" | "AKSESORIS";

interface Category {
    id: string;
    name: string;
    type?: string | null;
}

interface Props {
    categories: Category[]; // semua kategori — di-filter di dalam modal sesuai tipe pilihan user
    onClose: () => void;
    onCreated: (result: {
        unit: CreatedSnFirstUnit;
        parent_id: string;
        was_existing_parent: boolean;
        tipe: Tipe;
        message: string;
    }) => void;
}

const GRADE_OPTIONS = ["A", "B", "C"] as const;
const CONDITION_OPTIONS = [
    { value: "BARU", label: "Baru" },
    { value: "BEKAS", label: "Bekas" },
];

// Helper cek kategori LAPTOP/PC — sama persis dgn yg di UnifiedBarangContent.
// Di-duplicate supaya modal self-contained & nggak perlu import silang.
function isLaptopCategoryType(type?: string | null, name?: string | null): boolean {
    const t = (type ?? "").trim().toUpperCase();
    if (t === "LAPTOP" || t === "PC") return true;
    return (name ?? "").trim().toUpperCase() === "PC";
}

const EMPTY_LAPTOP_FORM = {
    name: "",
    brand: "",
    cpu: "",
    ram: "",
    storage: "",
    gpu: "",
    display: "",
    grade: "A",
    serial_number: "",
    source: "",
    branch: "",
    purchase_price: "",
    sparepart_cost: "",
    selling_price: "",
    condition_note: "",
    notes: "",
};

const EMPTY_ACC_FORM = {
    name: "",
    brand: "",
    spec: "",
    condition: "BARU",
    serial_number: "",
    source: "",
    branch: "",
    buy_price: "",
    selling_price: "",
    notes: "",
};

export default function AddUnitSnFirstModal({ categories, onClose, onCreated }: Props) {
    const [tipe, setTipe] = useState<Tipe>("LAPTOP");
    const [categoryId, setCategoryId] = useState("");
    const [laptopForm, setLaptopForm] = useState(EMPTY_LAPTOP_FORM);
    const [accForm, setAccForm] = useState(EMPTY_ACC_FORM);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // Filter kategori sesuai tipe pilihan
    const filteredCategories = useMemo(() => {
        if (tipe === "LAPTOP") return categories.filter(c => isLaptopCategoryType(c.type, c.name));
        return categories.filter(c => !isLaptopCategoryType(c.type, c.name));
    }, [tipe, categories]);

    // Reset kategori saat tipe berubah (kategori laptop beda dgn aksesoris)
    const handleTipeChange = (newTipe: Tipe) => {
        setTipe(newTipe);
        setCategoryId("");
        setError("");
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        // Validasi dasar
        if (!categoryId) {
            setError("Kategori wajib dipilih");
            return;
        }
        const form = tipe === "LAPTOP" ? laptopForm : accForm;
        if (!form.name.trim()) {
            setError(tipe === "LAPTOP" ? "Nama laptop wajib diisi" : "Nama aksesoris wajib diisi");
            return;
        }
        if (!form.serial_number.trim()) {
            setError("Serial number wajib diisi");
            return;
        }

        setLoading(true);
        try {
            const body = tipe === "LAPTOP" ? {
                tipe: "LAPTOP",
                category_id: categoryId,
                serial_number: laptopForm.serial_number.trim(),
                name: laptopForm.name.trim(),
                brand: laptopForm.brand.trim() || null,
                cpu: laptopForm.cpu.trim() || null,
                ram: laptopForm.ram.trim() || null,
                storage: laptopForm.storage.trim() || null,
                gpu: laptopForm.gpu.trim() || null,
                display: laptopForm.display.trim() || null,
                grade: laptopForm.grade,
                source: laptopForm.source.trim() || null,
                branch: laptopForm.branch || null,
                purchase_price: laptopForm.purchase_price === "" ? null : Number(laptopForm.purchase_price),
                sparepart_cost: laptopForm.sparepart_cost === "" ? null : Number(laptopForm.sparepart_cost),
                selling_price: laptopForm.selling_price === "" ? null : Number(laptopForm.selling_price),
                condition_note: laptopForm.condition_note.trim() || null,
                notes: laptopForm.notes.trim() || null,
            } : {
                tipe: "AKSESORIS",
                category_id: categoryId,
                serial_number: accForm.serial_number.trim(),
                name: accForm.name.trim(),
                brand: accForm.brand.trim() || null,
                spec: accForm.spec.trim() || null,
                condition: accForm.condition,
                source: accForm.source.trim() || null,
                branch: accForm.branch || null,
                buy_price: accForm.buy_price === "" ? 0 : Number(accForm.buy_price),
                selling_price: accForm.selling_price === "" ? 0 : Number(accForm.selling_price),
                notes: accForm.notes.trim() || null,
            };

            const res = await fetch("/api/data-barang/units/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const result = await res.json().catch(() => null);
            if (!res.ok || !result?.success) {
                setError(result?.message || "Gagal menambahkan unit");
                return;
            }
            onCreated({
                unit: result.data.unit,
                parent_id: result.data.parent_id,
                was_existing_parent: result.data.was_existing_parent,
                tipe,
                message: result.message || "Berhasil",
            });
        } catch {
            setError("Terjadi kesalahan koneksi");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden animate-popIn max-h-[90dvh] flex flex-col">
                <div className="h-1 w-full bg-gradient-to-r from-indigo-400 via-indigo-600 to-indigo-800 flex-shrink-0" />
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
                    <div>
                        <h2 className="font-bold text-gray-900 text-[15px]">Tambah Unit / SN</h2>
                        <p className="text-xs text-gray-400 mt-0.5">SN-first — 1 form langsung bikin unit dengan identitas lengkap</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 transition">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
                    {/* Toggle Tipe */}
                    <Field label="Spesies" required>
                        <div className="grid grid-cols-2 gap-2">
                            <button type="button" onClick={() => handleTipeChange("LAPTOP")}
                                className={`h-10 rounded-xl text-sm font-semibold transition ${tipe === "LAPTOP" ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/20" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                                💻 Laptop / PC
                            </button>
                            <button type="button" onClick={() => handleTipeChange("AKSESORIS")}
                                className={`h-10 rounded-xl text-sm font-semibold transition ${tipe === "AKSESORIS" ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/20" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                                🔧 Aksesoris
                            </button>
                        </div>
                    </Field>

                    {/* Kategori (filtered sesuai tipe) */}
                    <Field label="Kategori" required>
                        <select className={inputCls} value={categoryId}
                            onChange={e => setCategoryId(e.target.value)}>
                            <option value="">-- Pilih Kategori --</option>
                            {filteredCategories.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </Field>

                    {/* ═══════════════════ FORM LAPTOP ═══════════════════ */}
                    {tipe === "LAPTOP" && (
                        <>
                            <Field label="Nama Laptop" required>
                                <AutocompleteInput
                                    field="laptop_name" name="name"
                                    value={laptopForm.name}
                                    onChange={v => setLaptopForm(p => ({ ...p, name: v }))}
                                    placeholder="Contoh: Acer Aspire 3 A314"
                                    className={inputCls}
                                />
                            </Field>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Brand">
                                    <AutocompleteInput field="brand" name="brand"
                                        value={laptopForm.brand}
                                        onChange={v => setLaptopForm(p => ({ ...p, brand: v }))}
                                        placeholder="Acer, Lenovo..." className={inputCls} />
                                </Field>
                                <Field label="CPU">
                                    <AutocompleteInput field="cpu" name="cpu"
                                        value={laptopForm.cpu}
                                        onChange={v => setLaptopForm(p => ({ ...p, cpu: v }))}
                                        placeholder="i5-1135G7" className={inputCls} />
                                </Field>
                                <Field label="RAM">
                                    <AutocompleteInput field="ram" name="ram"
                                        value={laptopForm.ram}
                                        onChange={v => setLaptopForm(p => ({ ...p, ram: v }))}
                                        placeholder="8GB DDR4" className={inputCls} />
                                </Field>
                                <Field label="Storage">
                                    <AutocompleteInput field="storage" name="storage"
                                        value={laptopForm.storage}
                                        onChange={v => setLaptopForm(p => ({ ...p, storage: v }))}
                                        placeholder="512GB SSD" className={inputCls} />
                                </Field>
                                <Field label="GPU">
                                    <input name="gpu" value={laptopForm.gpu}
                                        onChange={e => setLaptopForm(p => ({ ...p, gpu: e.target.value }))}
                                        placeholder="Iris Xe / MX450 / —" className={inputCls} />
                                </Field>
                                <Field label="Display">
                                    <input name="display" value={laptopForm.display}
                                        onChange={e => setLaptopForm(p => ({ ...p, display: e.target.value }))}
                                        placeholder='14" FHD IPS' className={inputCls} />
                                </Field>
                            </div>

                            <Field label="Grade">
                                <select name="grade" value={laptopForm.grade}
                                    onChange={e => setLaptopForm(p => ({ ...p, grade: e.target.value }))}
                                    className={inputCls}>
                                    {GRADE_OPTIONS.map(g => <option key={g} value={g}>Grade {g}</option>)}
                                </select>
                            </Field>

                            <Field label="Serial Number" required>
                                <input name="serial_number" value={laptopForm.serial_number}
                                    onChange={e => setLaptopForm(p => ({ ...p, serial_number: e.target.value }))}
                                    placeholder="Contoh: NXKN3SN00123" className={inputCls} />
                            </Field>

                            <Field label="Sumber">
                                <AutocompleteInput field="source" name="source"
                                    value={laptopForm.source}
                                    onChange={v => setLaptopForm(p => ({ ...p, source: v }))}
                                    placeholder="Supplier Jakarta, Tukar Tambah..."
                                    className={inputCls} />
                            </Field>

                            <Field label="Cabang">
                                <select name="branch" value={laptopForm.branch}
                                    onChange={e => setLaptopForm(p => ({ ...p, branch: e.target.value }))}
                                    className={inputCls}>
                                    <option value="">— Belum ditentukan —</option>
                                    <option value="UTAMA">🏢 Cabang Utama</option>
                                    <option value="JOGJA">📍 Cabang Jogja</option>
                                </select>
                            </Field>

                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Harga Modal">
                                    <CurrencyInput name="purchase_price"
                                        value={Number(laptopForm.purchase_price) || 0}
                                        onChange={v => setLaptopForm(p => ({ ...p, purchase_price: String(v) }))}
                                        className={inputCls} />
                                </Field>
                                <Field label="Modal Sparepart">
                                    <CurrencyInput name="sparepart_cost"
                                        value={Number(laptopForm.sparepart_cost) || 0}
                                        onChange={v => setLaptopForm(p => ({ ...p, sparepart_cost: String(v) }))}
                                        className={inputCls} />
                                </Field>
                            </div>

                            <Field label="Harga Jual">
                                <CurrencyInput name="selling_price"
                                    value={Number(laptopForm.selling_price) || 0}
                                    onChange={v => setLaptopForm(p => ({ ...p, selling_price: String(v) }))}
                                    className={inputCls} />
                            </Field>

                            <Field label="Kondisi Umum">
                                <AutocompleteInput field="condition_note" name="condition_note"
                                    value={laptopForm.condition_note}
                                    onChange={v => setLaptopForm(p => ({ ...p, condition_note: v }))}
                                    className={inputCls} />
                            </Field>

                            <Field label="Catatan">
                                <textarea name="notes" rows={2}
                                    value={laptopForm.notes}
                                    onChange={e => setLaptopForm(p => ({ ...p, notes: e.target.value }))}
                                    className={inputCls} />
                            </Field>

                            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-start gap-2">
                                <svg className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <p className="text-[11px] text-amber-800 leading-snug">
                                    Unit baru otomatis masuk <span className="font-bold">Belum Siap Jual</span> dan muncul di <span className="font-bold">Tab Team QC</span>. Status naik ke Siap Jual setelah 12 field QC lengkap.
                                </p>
                            </div>
                        </>
                    )}

                    {/* ═══════════════════ FORM AKSESORIS ═══════════════════ */}
                    {tipe === "AKSESORIS" && (
                        <>
                            <Field label="Nama Aksesoris" required>
                                <input name="name" value={accForm.name}
                                    onChange={e => setAccForm(p => ({ ...p, name: e.target.value }))}
                                    placeholder="Contoh: Charger Acer Original 65W" className={inputCls} />
                            </Field>
                            <Field label="Brand">
                                <AutocompleteInput field="brand" name="brand"
                                    value={accForm.brand}
                                    onChange={v => setAccForm(p => ({ ...p, brand: v }))}
                                    placeholder="Acer, Lenovo..." className={inputCls} />
                            </Field>
                            <Field label="Spesifikasi">
                                <input name="spec" value={accForm.spec}
                                    onChange={e => setAccForm(p => ({ ...p, spec: e.target.value }))}
                                    placeholder="65W 19V 3.42A" className={inputCls} />
                            </Field>

                            <Field label="Kondisi">
                                <select name="condition" value={accForm.condition}
                                    onChange={e => setAccForm(p => ({ ...p, condition: e.target.value }))}
                                    className={inputCls}>
                                    {CONDITION_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                </select>
                            </Field>

                            <Field label="Serial Number" required>
                                <input name="serial_number" value={accForm.serial_number}
                                    onChange={e => setAccForm(p => ({ ...p, serial_number: e.target.value }))}
                                    placeholder="Contoh: CHRG-00123" className={inputCls} />
                            </Field>

                            <Field label="Sumber">
                                <AutocompleteInput field="source" name="source"
                                    value={accForm.source}
                                    onChange={v => setAccForm(p => ({ ...p, source: v }))}
                                    placeholder="Kosasih, Lelang, China..." className={inputCls} />
                            </Field>

                            <Field label="Cabang">
                                <select name="branch" value={accForm.branch}
                                    onChange={e => setAccForm(p => ({ ...p, branch: e.target.value }))}
                                    className={inputCls}>
                                    <option value="">— Belum ditentukan —</option>
                                    <option value="UTAMA">🏢 Cabang Utama</option>
                                    <option value="JOGJA">📍 Cabang Jogja</option>
                                </select>
                            </Field>

                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Harga Modal">
                                    <CurrencyInput name="buy_price"
                                        value={Number(accForm.buy_price) || 0}
                                        onChange={v => setAccForm(p => ({ ...p, buy_price: String(v) }))}
                                        className={inputCls} />
                                </Field>
                                <Field label="Harga Jual">
                                    <CurrencyInput name="selling_price"
                                        value={Number(accForm.selling_price) || 0}
                                        onChange={v => setAccForm(p => ({ ...p, selling_price: String(v) }))}
                                        className={inputCls} />
                                </Field>
                            </div>

                            <Field label="Catatan">
                                <textarea name="notes" rows={2}
                                    value={accForm.notes}
                                    onChange={e => setAccForm(p => ({ ...p, notes: e.target.value }))}
                                    className={inputCls} />
                            </Field>
                        </>
                    )}

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
                            className="flex-1 h-11 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-xl text-sm font-semibold hover:from-indigo-700 hover:to-indigo-800 transition disabled:opacity-50">
                            {loading ? "Menyimpan..." : "Simpan"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

const inputCls = "w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 focus:bg-white transition";

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