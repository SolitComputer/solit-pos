"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { CurrencyInput } from "@/components/ui/CurrencyInputField";
import AutocompleteInput from "@/components/ui/AutocompleteInput";
import { toast } from "sonner";

export interface CreatedSnFirstUnit {
    id: string;
    serial_number: string;
    [key: string]: unknown;
}

type Tipe = "LAPTOP" | "AKSESORIS";
type TargetMode = "FOLDER" | "LEPAS";

interface Category {
    id: string;
    name: string;
    type?: string | null;
}

interface FolderOption {
    id: string;
    device_type: string;
    category: string;
    is_empty: boolean;
    laptop_name?: string | null;
    name?: string | null;
    brand?: string | null;
    cpu?: string | null;
    ram?: string | null;
    storage?: string | null;
    gpu?: string | null;
    display?: string | null;
    spec?: string | null;
    selling_price?: number | null;
    sell_price?: number | null;
    grade?: string | null;
}

interface Props {
    categories: Category[];
    onClose: () => void;
    onCreated: (result: {
        unit: CreatedSnFirstUnit;
        parent_id: string | null;
        was_existing_parent: boolean;
        case: "A" | "B" | "C";
        tipe: Tipe;
        message: string;
    }) => void;
}

const GRADE_OPTIONS = ["A", "B", "C"] as const;
const CONDITION_OPTIONS = [
    { value: "BARU", label: "Baru" },
    { value: "BEKAS", label: "Bekas" },
];

function isLaptopCategoryType(type?: string | null, name?: string | null): boolean {
    const t = (type ?? "").trim().toUpperCase();
    if (t === "LAPTOP" || t === "PC") return true;
    return (name ?? "").trim().toUpperCase() === "PC";
}

const EMPTY_LAPTOP_FORM = {
    name: "", brand: "", cpu: "", ram: "", storage: "", gpu: "", display: "",
    grade: "A", serial_number: "", source: "", branch: "",
    purchase_price: "", sparepart_cost: "", selling_price: "",
    condition_note: "", notes: "",
};

const EMPTY_ACC_FORM = {
    name: "", brand: "", spec: "", condition: "BARU", grade: "A",
    serial_number: "", source: "", branch: "",
    buy_price: "", selling_price: "", notes: "",
};

const fmt = (n?: number | null) => n == null ? "—" : "Rp " + n.toLocaleString("id-ID");

export default function AddUnitSnFirstModal({ categories, onClose, onCreated }: Props) {
    const [tipe, setTipe] = useState<Tipe>("LAPTOP");
    const [categoryId, setCategoryId] = useState("");
    const [targetMode, setTargetMode] = useState<TargetMode>("FOLDER");
    const [targetFolderId, setTargetFolderId] = useState<string>("");
    const [folders, setFolders] = useState<FolderOption[]>([]);
    const [loadingFolders, setLoadingFolders] = useState(false);
    const [laptopForm, setLaptopForm] = useState(EMPTY_LAPTOP_FORM);
    const [accForm, setAccForm] = useState(EMPTY_ACC_FORM);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const filteredCategories = useMemo(() => {
        if (tipe === "LAPTOP") return categories.filter(c => isLaptopCategoryType(c.type, c.name));
        return categories.filter(c => !isLaptopCategoryType(c.type, c.name));
    }, [tipe, categories]);

    // Fetch folder saat tipe+kategori terpilih
    const fetchFolders = useCallback(async () => {
        if (!categoryId) { setFolders([]); return; }
        setLoadingFolders(true);
        try {
            const res = await fetch(`/api/data-barang/folder?type=${tipe}&category_id=${categoryId}`);
            const json = await res.json();
            if (json.success) setFolders(json.data ?? []);
        } catch { /* ignore */ } finally { setLoadingFolders(false); }
    }, [tipe, categoryId]);

    useEffect(() => { fetchFolders(); }, [fetchFolders]);

    // Folder yang dipilih (untuk lock field kalau Case A)
    const selectedFolder = useMemo(
        () => folders.find(f => f.id === targetFolderId) ?? null,
        [folders, targetFolderId]
    );
    const isCase_A = targetMode === "FOLDER" && selectedFolder != null && !selectedFolder.is_empty;
    const isCase_B = targetMode === "FOLDER" && selectedFolder != null && selectedFolder.is_empty;

    // Auto-fill locked field dari folder saat Case A
    useEffect(() => {
        if (!isCase_A || !selectedFolder) return;
        if (tipe === "LAPTOP") {
            setLaptopForm(p => ({
                ...p,
                name: selectedFolder.laptop_name ?? "",
                brand: selectedFolder.brand ?? "",
                cpu: selectedFolder.cpu ?? "",
                ram: selectedFolder.ram ?? "",
                storage: selectedFolder.storage ?? "",
                gpu: selectedFolder.gpu ?? "",
                display: selectedFolder.display ?? "",
                selling_price: String(selectedFolder.selling_price ?? ""),
                grade: selectedFolder.grade ?? "A",
            }));
        } else {
            setAccForm(p => ({
                ...p,
                name: selectedFolder.name ?? "",
                brand: selectedFolder.brand ?? "",
                spec: selectedFolder.spec ?? "",
                selling_price: String(selectedFolder.sell_price ?? ""),
                grade: selectedFolder.grade ?? "A",
            }));
        }
    }, [isCase_A, selectedFolder, tipe]);

    const handleTipeChange = (newTipe: Tipe) => {
        setTipe(newTipe);
        setCategoryId("");
        setTargetFolderId("");
        setTargetMode("FOLDER");
        setError("");
    };

    const handleTargetModeChange = (mode: TargetMode) => {
        setTargetMode(mode);
        if (mode === "LEPAS") setTargetFolderId("");
        setError("");
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (!categoryId) { setError("Kategori wajib dipilih"); return; }
        if (targetMode === "FOLDER" && !targetFolderId) {
            setError("Pilih folder tujuan, atau pilih 'Tanpa Folder' (SN Lepas)");
            return;
        }

        const form = tipe === "LAPTOP" ? laptopForm : accForm;
        if (!form.name.trim()) {
            setError(tipe === "LAPTOP" ? "Nama laptop wajib diisi" : "Nama aksesoris wajib diisi");
            return;
        }
        if (!form.serial_number.trim()) { setError("Serial number wajib diisi"); return; }

        setLoading(true);
        try {
            const body = tipe === "LAPTOP" ? {
                tipe: "LAPTOP",
                category_id: categoryId,
                target_folder_id: targetMode === "FOLDER" ? targetFolderId : null,
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
                target_folder_id: targetMode === "FOLDER" ? targetFolderId : null,
                serial_number: accForm.serial_number.trim(),
                name: accForm.name.trim(),
                brand: accForm.brand.trim() || null,
                spec: accForm.spec.trim() || null,
                condition: accForm.condition,
                grade: accForm.grade,
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
                case: result.data.case,
                tipe,
                message: result.message || "Berhasil",
            });
        } catch {
            setError("Terjadi kesalahan koneksi");
        } finally {
            setLoading(false);
        }
    };

    const labelFolder = (f: FolderOption) => {
        if (f.is_empty) return `Folder Kosong · ${f.category}`;
        const n = f.laptop_name ?? f.name ?? "—";
        const parts = [n, f.grade, fmt(f.selling_price ?? f.sell_price)];
        return parts.filter(Boolean).join(" · ");
    };

    const lockedField = isCase_A; // Field locked read-only di Case A

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden animate-popIn max-h-[90dvh] flex flex-col">
                <div className="h-1 w-full bg-gradient-to-r from-indigo-400 via-indigo-600 to-indigo-800 flex-shrink-0" />
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
                    <div>
                        <h2 className="font-bold text-gray-900 text-[15px]">Tambah Unit / SN</h2>
                        <p className="text-xs text-gray-400 mt-0.5">SN-first — pilih target folder atau SN Lepas</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 transition">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
                    {/* Step 1: Tipe */}
                    <Field label="1. Tipe Barang" required>
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

                    {/* Step 2: Kategori */}
                    <Field label="2. Kategori" required>
                        <select className={inputCls} value={categoryId} onChange={e => { setCategoryId(e.target.value); setTargetFolderId(""); }}>
                            <option value="">-- Pilih Kategori --</option>
                            {filteredCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </Field>

                    {/* Step 3: Target Folder */}
                    {categoryId && (
                        <Field label="3. Target" required>
                            <div className="space-y-2">
                                <label className="flex items-start gap-2 cursor-pointer p-2 rounded-lg hover:bg-gray-50 border border-gray-200">
                                    <input type="radio" name="targetMode" checked={targetMode === "FOLDER"}
                                        onChange={() => handleTargetModeChange("FOLDER")} className="mt-0.5" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-800">Masukin ke Folder</p>
                                        {targetMode === "FOLDER" && (
                                            <select className={`${inputCls} mt-1.5`} value={targetFolderId}
                                                onChange={e => setTargetFolderId(e.target.value)}>
                                                <option value="">{loadingFolders ? "Memuat folder..." : "-- Pilih Folder --"}</option>
                                                {folders.map(f => (
                                                    <option key={f.id} value={f.id}>{labelFolder(f)}</option>
                                                ))}
                                            </select>
                                        )}
                                        {targetMode === "FOLDER" && !loadingFolders && folders.length === 0 && (
                                            <p className="text-[10px] text-gray-400 mt-1">Belum ada folder. Bikin folder dulu di tombol "+ Folder".</p>
                                        )}
                                    </div>
                                </label>

                                <label className="flex items-start gap-2 cursor-pointer p-2 rounded-lg hover:bg-gray-50 border border-gray-200">
                                    <input type="radio" name="targetMode" checked={targetMode === "LEPAS"}
                                        onChange={() => handleTargetModeChange("LEPAS")} className="mt-0.5" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-800">Tanpa Folder (SN Lepas)</p>
                                        <p className="text-[11px] text-gray-500 mt-0.5">Unit berdiri sendiri, tidak terikat folder manapun.</p>
                                    </div>
                                </label>
                            </div>
                        </Field>
                    )}

                    {/* Info banner — Case A/B */}
                    {isCase_A && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-[11px] text-amber-800 leading-relaxed">
                            🔒 <b>Folder isi:</b> Nama, spek, harga jual, dan grade <b>terkunci</b> dari folder (nggak bisa diubah).
                            Cuma isi: SN, source, harga modal, kondisi.
                        </div>
                    )}
                    {isCase_B && (
                        <div className="bg-sky-50 border border-sky-200 rounded-xl px-3 py-2 text-[11px] text-sky-800 leading-relaxed">
                            📦 <b>Folder kosong:</b> Identitas folder akan <b>adopt</b> dari SN ini (nama, spek, harga, grade).
                        </div>
                    )}

                    {/* ═══════════════════ FORM LAPTOP ═══════════════════ */}
                    {tipe === "LAPTOP" && categoryId && (
                        <>
                            <Field label="Nama Laptop" required>
                                <input value={laptopForm.name} disabled={lockedField}
                                    onChange={e => setLaptopForm(p => ({ ...p, name: e.target.value }))}
                                    placeholder="Contoh: Acer Aspire 3 A314"
                                    className={`${inputCls} ${lockedField ? "bg-gray-100 text-gray-500" : ""}`} />
                            </Field>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Brand"><input disabled={lockedField} value={laptopForm.brand}
                                    onChange={e => setLaptopForm(p => ({ ...p, brand: e.target.value }))}
                                    placeholder="Acer, Lenovo..." className={`${inputCls} ${lockedField ? "bg-gray-100 text-gray-500" : ""}`} /></Field>
                                <Field label="CPU"><input disabled={lockedField} value={laptopForm.cpu}
                                    onChange={e => setLaptopForm(p => ({ ...p, cpu: e.target.value }))}
                                    placeholder="i5-1135G7" className={`${inputCls} ${lockedField ? "bg-gray-100 text-gray-500" : ""}`} /></Field>
                                <Field label="RAM"><input disabled={lockedField} value={laptopForm.ram}
                                    onChange={e => setLaptopForm(p => ({ ...p, ram: e.target.value }))}
                                    placeholder="8GB DDR4" className={`${inputCls} ${lockedField ? "bg-gray-100 text-gray-500" : ""}`} /></Field>
                                <Field label="Storage"><input disabled={lockedField} value={laptopForm.storage}
                                    onChange={e => setLaptopForm(p => ({ ...p, storage: e.target.value }))}
                                    placeholder="512GB SSD" className={`${inputCls} ${lockedField ? "bg-gray-100 text-gray-500" : ""}`} /></Field>
                                <Field label="GPU"><input disabled={lockedField} value={laptopForm.gpu}
                                    onChange={e => setLaptopForm(p => ({ ...p, gpu: e.target.value }))}
                                    placeholder="Iris Xe / MX450" className={`${inputCls} ${lockedField ? "bg-gray-100 text-gray-500" : ""}`} /></Field>
                                <Field label="Display"><input disabled={lockedField} value={laptopForm.display}
                                    onChange={e => setLaptopForm(p => ({ ...p, display: e.target.value }))}
                                    placeholder='14" FHD IPS' className={`${inputCls} ${lockedField ? "bg-gray-100 text-gray-500" : ""}`} /></Field>
                            </div>

                            <Field label="Grade">
                                <select disabled={lockedField} value={laptopForm.grade}
                                    onChange={e => setLaptopForm(p => ({ ...p, grade: e.target.value }))}
                                    className={`${inputCls} ${lockedField ? "bg-gray-100 text-gray-500" : ""}`}>
                                    {GRADE_OPTIONS.map(g => <option key={g} value={g}>Grade {g}</option>)}
                                </select>
                            </Field>

                            <Field label="Serial Number" required>
                                <input value={laptopForm.serial_number}
                                    onChange={e => setLaptopForm(p => ({ ...p, serial_number: e.target.value }))}
                                    placeholder="Contoh: NXKN3SN00123" className={`${inputCls} font-mono`} />
                            </Field>

                            <Field label="Sumber">
                                <AutocompleteInput field="source" name="source" value={laptopForm.source}
                                    onChange={v => setLaptopForm(p => ({ ...p, source: v }))}
                                    placeholder="Supplier Jakarta, Tukar Tambah..." className={inputCls} />
                            </Field>

                            <Field label="Cabang">
                                <select value={laptopForm.branch}
                                    onChange={e => setLaptopForm(p => ({ ...p, branch: e.target.value }))}
                                    className={inputCls}>
                                    <option value="">— Belum ditentukan —</option>
                                    <option value="UTAMA">🏢 Cabang Utama</option>
                                    <option value="JOGJA">📍 Cabang Jogja</option>
                                </select>
                            </Field>

                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Harga Modal">
                                    <CurrencyInput value={Number(laptopForm.purchase_price) || 0}
                                        onChange={v => setLaptopForm(p => ({ ...p, purchase_price: String(v) }))} className={inputCls} />
                                </Field>
                                <Field label="Modal Sparepart">
                                    <CurrencyInput value={Number(laptopForm.sparepart_cost) || 0}
                                        onChange={v => setLaptopForm(p => ({ ...p, sparepart_cost: String(v) }))} className={inputCls} />
                                </Field>
                            </div>

                            <Field label="Harga Jual">
                                <CurrencyInput value={Number(laptopForm.selling_price) || 0} disabled={lockedField}
                                    onChange={v => setLaptopForm(p => ({ ...p, selling_price: String(v) }))}
                                    className={`${inputCls} ${lockedField ? "bg-gray-100 text-gray-500" : ""}`} />
                            </Field>

                            <Field label="Kondisi Umum">
                                <input value={laptopForm.condition_note}
                                    onChange={e => setLaptopForm(p => ({ ...p, condition_note: e.target.value }))}
                                    className={inputCls} />
                            </Field>

                            <Field label="Catatan">
                                <textarea rows={2} value={laptopForm.notes}
                                    onChange={e => setLaptopForm(p => ({ ...p, notes: e.target.value }))} className={inputCls} />
                            </Field>

                            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-[11px] text-amber-800 leading-snug">
                                Unit baru otomatis masuk <b>Belum Siap Jual</b> dan muncul di <b>Tab Team QC</b>. Status naik ke Siap Jual setelah QC lengkap.
                            </div>
                        </>
                    )}

                    {/* ═══════════════════ FORM AKSESORIS ═══════════════════ */}
                    {tipe === "AKSESORIS" && categoryId && (
                        <>
                            <Field label="Nama Aksesoris" required>
                                <input disabled={lockedField} value={accForm.name}
                                    onChange={e => setAccForm(p => ({ ...p, name: e.target.value }))}
                                    placeholder="Contoh: Charger Acer 65W"
                                    className={`${inputCls} ${lockedField ? "bg-gray-100 text-gray-500" : ""}`} />
                            </Field>
                            <Field label="Brand">
                                <input disabled={lockedField} value={accForm.brand}
                                    onChange={e => setAccForm(p => ({ ...p, brand: e.target.value }))}
                                    placeholder="Acer, Lenovo..."
                                    className={`${inputCls} ${lockedField ? "bg-gray-100 text-gray-500" : ""}`} />
                            </Field>
                            <Field label="Spesifikasi">
                                <input disabled={lockedField} value={accForm.spec}
                                    onChange={e => setAccForm(p => ({ ...p, spec: e.target.value }))}
                                    placeholder="65W 19V 3.42A"
                                    className={`${inputCls} ${lockedField ? "bg-gray-100 text-gray-500" : ""}`} />
                            </Field>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Grade">
                                    <select disabled={lockedField} value={accForm.grade}
                                        onChange={e => setAccForm(p => ({ ...p, grade: e.target.value }))}
                                        className={`${inputCls} ${lockedField ? "bg-gray-100 text-gray-500" : ""}`}>
                                        {GRADE_OPTIONS.map(g => <option key={g} value={g}>Grade {g}</option>)}
                                    </select>
                                </Field>
                                <Field label="Kondisi">
                                    <select value={accForm.condition}
                                        onChange={e => setAccForm(p => ({ ...p, condition: e.target.value }))}
                                        className={inputCls}>
                                        {CONDITION_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                    </select>
                                </Field>
                            </div>

                            <Field label="Serial Number" required>
                                <input value={accForm.serial_number}
                                    onChange={e => setAccForm(p => ({ ...p, serial_number: e.target.value }))}
                                    placeholder="Contoh: CHRG-00123" className={`${inputCls} font-mono`} />
                            </Field>

                            <Field label="Sumber">
                                <AutocompleteInput field="source" name="source" value={accForm.source}
                                    onChange={v => setAccForm(p => ({ ...p, source: v }))}
                                    placeholder="Kosasih, Lelang..." className={inputCls} />
                            </Field>

                            <Field label="Cabang">
                                <select value={accForm.branch}
                                    onChange={e => setAccForm(p => ({ ...p, branch: e.target.value }))}
                                    className={inputCls}>
                                    <option value="">— Belum ditentukan —</option>
                                    <option value="UTAMA">🏢 Cabang Utama</option>
                                    <option value="JOGJA">📍 Cabang Jogja</option>
                                </select>
                            </Field>

                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Harga Modal">
                                    <CurrencyInput value={Number(accForm.buy_price) || 0}
                                        onChange={v => setAccForm(p => ({ ...p, buy_price: String(v) }))} className={inputCls} />
                                </Field>
                                <Field label="Harga Jual">
                                    <CurrencyInput value={Number(accForm.selling_price) || 0} disabled={lockedField}
                                        onChange={v => setAccForm(p => ({ ...p, selling_price: String(v) }))}
                                        className={`${inputCls} ${lockedField ? "bg-gray-100 text-gray-500" : ""}`} />
                                </Field>
                            </div>

                            <Field label="Catatan">
                                <textarea rows={2} value={accForm.notes}
                                    onChange={e => setAccForm(p => ({ ...p, notes: e.target.value }))} className={inputCls} />
                            </Field>
                        </>
                    )}

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
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

const inputCls = "w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 focus:bg-white transition disabled:cursor-not-allowed";

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