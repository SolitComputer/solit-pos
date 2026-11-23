"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import { CurrencyInput } from "@/components/ui/CurrencyInputField";
import AutocompleteInput from "@/components/ui/AutocompleteInput";
import { toast } from "sonner";
import {
    Hash, Pencil, BarChart3, Download, CheckCircle2, Clock, Inbox,
    Package, Layers, ArrowLeft,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────
export interface CreatedSnFirstUnit {
    id: string;
    serial_number: string;
    [key: string]: unknown;
}

type Tipe = "LAPTOP" | "AKSESORIS";
type TargetMode = "FOLDER" | "LEPAS";
type Mode = "SELECT" | "SINGLE" | "BULK"; // ⬅️ BARU: step 0 selector
type BulkMethod = "RANGE" | "MANUAL" | "EXCEL"; // ⬅️ BARU: method untuk bulk

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
        unit?: CreatedSnFirstUnit;
        parent_id?: string | null;
        was_existing_parent?: boolean;
        case?: "A" | "B" | "C";
        tipe: Tipe;
        message: string;
        // ⬅️ BARU: untuk bulk mode
        bulk?: { inserted: number; failed: number };
    }) => void;
}

// ─── Konstanta ──────────────────────────────────────────────────────────────
const GRADE_OPTIONS = ["A", "B", "C"] as const;
const CONDITION_OPTIONS = [
    { value: "BARU", label: "Baru" },
    { value: "BEKAS", label: "Bekas" },
];
const MAX_UNITS_PER_BATCH = 500; // batas /api/accessory-units/bulk

function isLaptopCategoryType(type?: string | null, name?: string | null): boolean {
    const t = (type ?? "").trim().toUpperCase();
    if (t === "LAPTOP" || t === "PC") return true;
    return (name ?? "").trim().toUpperCase() === "PC";
}

// ⬅️ BARU: helper Range SN (disalin dari BulkAddUnitModal.tsx yang lama)
function isInvertedRange(from: string, to: string): boolean {
    const fromTrimmed = from.trim();
    const toTrimmed = to.trim();
    if (!fromTrimmed || !toTrimmed) return false;
    const fromNum = parseInt(fromTrimmed, 10);
    const toNum = parseInt(toTrimmed, 10);
    return !isNaN(fromNum) && !isNaN(toNum) && fromNum > toNum;
}

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

// ⬅️ BARU: batch sender untuk aksesoris (karena endpoint max 500 per batch)
async function postAccessoryUnitsInChunks(
    accessoryId: string,
    units: Record<string, unknown>[],
): Promise<{ inserted: number; failed: number; message?: string }> {
    let inserted = 0;
    for (let i = 0; i < units.length; i += MAX_UNITS_PER_BATCH) {
        const chunk = units.slice(i, i + MAX_UNITS_PER_BATCH);
        try {
            const res = await fetch(`/api/accessory-units/bulk`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accessory_id: accessoryId, units: chunk }),
            });
            const json = await res.json();
            if (!json.success) {
                return { inserted, failed: units.length - inserted, message: json.message };
            }
            inserted += json.count ?? chunk.length;
        } catch {
            return { inserted, failed: units.length - inserted, message: "Koneksi gagal" };
        }
    }
    return { inserted, failed: 0 };
}

// ─── Empty forms ────────────────────────────────────────────────────────────
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

// ⬅️ BARU: Empty state untuk bulk form (gabungan default SEMUA unit di batch)
interface ExcelRow {
    serial_number: string;
    purchase_price: number;
    selling_price: number;
    grade: string;
    status: string;
    condition_note: string;
    notes: string;
}

const EMPTY_BULK_FORM = {
    method: "RANGE" as BulkMethod,
    // Range SN
    snFrom: "", snTo: "",
    // Manual
    manualText: "",
    // Excel
    excelRows: [] as ExcelRow[],
    // Default values (berlaku untuk semua unit di batch ini)
    grade: "B",
    status: "SIAP_JUAL", // untuk laptop: SIAP_JUAL/BELUM_SIAP. Aksesoris: TERSEDIA/BELUM_SIAP
    condition: "BARU", // khusus aksesoris
    purchase_price: "", // laptop: purchase_price. Aksesoris: buy_price
    selling_price: "",
    sparepart_cost: "", // khusus laptop
    source: "",
    // ⬅️ UPDATED: default UTAMA — opsi "Belum" sudah dihapus dari UI.
    // Tipe union tetap include "" biar aman kalau ada cache lama.
    branch: "UTAMA" as "" | "UTAMA" | "JOGJA",
    condition_note: "",
    received_at: "",
    // ⬅️ BARU: Identity fields untuk Case B (folder kosong di bulk).
    // Di-PATCH ke folder dulu sebelum bulk insert, lalu jadi identitas semua unit.
    identity_name: "",
    identity_brand: "",
    identity_cpu: "",
    identity_ram: "",
    identity_storage: "",
    identity_gpu: "",
    identity_display: "",
    identity_spec: "",
};

const fmt = (n?: number | null) => n == null ? "—" : "Rp " + n.toLocaleString("id-ID");

// ⬅️ BARU: dipindah ke module scope supaya bisa dipakai SearchableFolderSelect.
const labelFolder = (f: FolderOption) => {
    if (f.is_empty) return `Folder Kosong · ${f.category}`;
    const n = f.laptop_name ?? f.name ?? "—";
    const parts = [n, f.grade, fmt(f.selling_price ?? f.sell_price)];
    return parts.filter(Boolean).join(" · ");
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function AddUnitSnFirstModal({ categories, onClose, onCreated }: Props) {
    // ⬅️ BARU: mode selector state (step 0)
    const [mode, setMode] = useState<Mode>("SELECT");

    // Shared state (dipakai single & bulk)
    const [tipe, setTipe] = useState<Tipe>("LAPTOP");
    const [categoryId, setCategoryId] = useState("");
    const [targetMode, setTargetMode] = useState<TargetMode>("FOLDER");
    const [targetFolderId, setTargetFolderId] = useState<string>("");
    const [folders, setFolders] = useState<FolderOption[]>([]);
    const [loadingFolders, setLoadingFolders] = useState(false);

    // Single mode state
    const [laptopForm, setLaptopForm] = useState(EMPTY_LAPTOP_FORM);
    const [accForm, setAccForm] = useState(EMPTY_ACC_FORM);

    // ⬅️ BARU: Bulk mode state
    const [bulkForm, setBulkForm] = useState(EMPTY_BULK_FORM);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const filteredCategories = useMemo(() => {
        if (tipe === "LAPTOP") return categories.filter(c => isLaptopCategoryType(c.type, c.name));
        return categories.filter(c => !isLaptopCategoryType(c.type, c.name));
    }, [tipe, categories]);

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

    const selectedFolder = useMemo(
        () => folders.find(f => f.id === targetFolderId) ?? null,
        [folders, targetFolderId]
    );
    const isCase_A = targetMode === "FOLDER" && selectedFolder != null && !selectedFolder.is_empty;
    const isCase_B = targetMode === "FOLDER" && selectedFolder != null && selectedFolder.is_empty;

    // Auto-fill locked field dari folder saat Case A (SINGLE mode only)
    useEffect(() => {
        if (mode !== "SINGLE" || !isCase_A || !selectedFolder) return;
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
    }, [mode, isCase_A, selectedFolder, tipe]);

    // Auto-fill bulk harga jual dari folder saat BULK mode + folder dipilih
    useEffect(() => {
        if (mode !== "BULK" || !selectedFolder) return;
        const price = tipe === "LAPTOP" ? selectedFolder.selling_price : selectedFolder.sell_price;
        if (price && !bulkForm.selling_price) {
            setBulkForm(p => ({
                ...p,
                selling_price: String(price),
                grade: selectedFolder.grade ?? p.grade,
            }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, selectedFolder, tipe]);

    // Reset semua state
    const resetAll = () => {
        setTipe("LAPTOP"); setCategoryId(""); setTargetFolderId("");
        setTargetMode("FOLDER"); setError("");
        setLaptopForm(EMPTY_LAPTOP_FORM);
        setAccForm(EMPTY_ACC_FORM);
        setBulkForm(EMPTY_BULK_FORM);
    };

    const handleModeChange = (newMode: Mode) => {
        resetAll();
        setMode(newMode);
    };

    const handleTipeChange = (newTipe: Tipe) => {
        setTipe(newTipe);
        setCategoryId(""); setTargetFolderId("");
        setTargetMode("FOLDER"); setError("");
        // ⬅️ UPDATED: Laptop auto-force BELUM_SIAP (unit baru masuk antrian Team QC otomatis,
        // field Status disembunyikan di UI). Aksesoris default TERSEDIA, user bisa ubah.
        setBulkForm(p => ({ ...p, status: newTipe === "LAPTOP" ? "BELUM_SIAP" : "TERSEDIA" }));
    };

    const handleTargetModeChange = (m: TargetMode) => {
        setTargetMode(m);
        if (m === "LEPAS") setTargetFolderId("");
        setError("");
    };

    // ⬅️ BARU: Excel upload handler (laptop only — aksesoris Excel belum ada di endpoint)
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setError("");
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const wb = XLSX.read(ev.target?.result, { type: "binary" });
                const ws = wb.Sheets[wb.SheetNames[0]];
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const raw = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
                const snKeys = ["serial_number", "sn", "Serial Number", "SN", "No SN", "no_sn"];
                const buyKeys = ["purchase_price", "harga_modal", "Harga Modal", "modal", "buy", "buy_price"];
                const sellKeys = ["selling_price", "harga_jual", "Harga Jual", "jual", "sell"];
                const gradeKeys = ["grade", "Grade"];
                const statusKeys = ["status", "Status"];
                const noteKeys = ["condition_note", "kondisi", "Kondisi", "note", "notes"];
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const findKey = (row: any, keys: string[]) => keys.find(k => k in row) ?? null;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const parsed: ExcelRow[] = raw.map((row: any) => {
                    const snKey = findKey(row, snKeys);
                    const buyKey = findKey(row, buyKeys);
                    const sellKey = findKey(row, sellKeys);
                    const gradeKey = findKey(row, gradeKeys);
                    const statKey = findKey(row, statusKeys);
                    const noteKey = findKey(row, noteKeys);
                    const rawStatus = statKey ? String(row[statKey]) : bulkForm.status;
                    const normalizedStatus = tipe === "LAPTOP"
                        ? (rawStatus === "SIAP_JUAL" ? "SIAP_JUAL" : "BELUM_SIAP")
                        : (rawStatus === "TERSEDIA" ? "TERSEDIA" : "BELUM_SIAP");
                    return {
                        serial_number: snKey ? String(row[snKey]).trim() : "",
                        purchase_price: buyKey ? Number(row[buyKey]) : 0,
                        selling_price: sellKey ? Number(row[sellKey]) : Number(bulkForm.selling_price) || 0,
                        grade: gradeKey ? String(row[gradeKey]) : bulkForm.grade,
                        status: normalizedStatus,
                        condition_note: noteKey ? String(row[noteKey]) : bulkForm.condition_note,
                        notes: "",
                    };
                }).filter((r: ExcelRow) => r.serial_number);
                if (parsed.length === 0) {
                    setError("Tidak ada data SN valid di file. Pastikan ada kolom 'serial_number' atau 'SN'.");
                    return;
                }
                setBulkForm(p => ({ ...p, excelRows: parsed }));
            } catch {
                setError("Gagal membaca file Excel. Pastikan format file benar.");
            }
        };
        reader.readAsBinaryString(file);
    };

    const downloadTemplate = () => {
        const headers = tipe === "LAPTOP"
            ? ["serial_number", "grade", "purchase_price", "selling_price", "condition_note", "status"]
            : ["serial_number", "buy_price", "selling_price", "condition_note", "status"];
        const sample = tipe === "LAPTOP"
            ? [
                ["00018376", "B", 1200000, 1500000, "mulus", "SIAP_JUAL"],
                ["00018377", "A", 1300000, 1600000, "bagus sekali", "SIAP_JUAL"],
            ]
            : [
                ["CHRG-00001", 50000, 120000, "baru", "TERSEDIA"],
                ["CHRG-00002", 50000, 120000, "baru", "TERSEDIA"],
            ];
        const ws = XLSX.utils.aoa_to_sheet([headers, ...sample]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Units");
        XLSX.writeFile(wb, `template_bulk_units_${tipe.toLowerCase()}.xlsx`);
    };

    // ⬅️ BARU: Build units array dari bulk input (semua 3 methods)
    const buildBulkUnits = () => {
        const base = {
            grade: bulkForm.grade,
            status: bulkForm.status,
            condition_note: bulkForm.condition_note,
            branch: bulkForm.branch || null,
            notes: "",
            ...(bulkForm.received_at ? { received_at: new Date(bulkForm.received_at).toISOString() } : {}),
        };
        // Harga key berbeda antara laptop & aksesoris
        const priceDefaults = tipe === "LAPTOP"
            ? {
                purchase_price: Number(bulkForm.purchase_price) || 0,
                selling_price: Number(bulkForm.selling_price) || 0,
                sparepart_cost: Number(bulkForm.sparepart_cost) || 0,
            }
            : {
                buy_price: Number(bulkForm.purchase_price) || 0, // mapping: purchase_price -> buy_price
                selling_price: Number(bulkForm.selling_price) || 0,
                condition: bulkForm.condition,
                source: bulkForm.source.trim() || null,
            };
        const defaults = { ...base, ...priceDefaults };

        if (bulkForm.method === "RANGE") {
            if (isInvertedRange(bulkForm.snFrom, bulkForm.snTo)) return [];
            const sns = generateRange(bulkForm.snFrom, bulkForm.snTo);
            return sns.map(sn => ({ serial_number: sn, ...defaults }));
        }
        if (bulkForm.method === "MANUAL") {
            const sns = bulkForm.manualText.split(/[\n,；,、]/).map(s => s.trim()).filter(Boolean);
            return sns.map(sn => ({ serial_number: sn, ...defaults }));
        }
        if (bulkForm.method === "EXCEL") {
            return bulkForm.excelRows.map((r: ExcelRow) => {
                const perRowDefaults = tipe === "LAPTOP"
                    ? {
                        purchase_price: r.purchase_price || defaults.purchase_price,
                        selling_price: r.selling_price || defaults.selling_price,
                        sparepart_cost: defaults.sparepart_cost,
                    }
                    : {
                        buy_price: r.purchase_price || defaults.buy_price,
                        selling_price: r.selling_price || defaults.selling_price,
                        condition: defaults.condition,
                        source: defaults.source,
                    };
                return {
                    serial_number: r.serial_number,
                    grade: r.grade || defaults.grade,
                    status: r.status || defaults.status,
                    condition_note: r.condition_note || defaults.condition_note,
                    branch: defaults.branch,
                    notes: r.notes || "",
                    ...perRowDefaults,
                };
            });
        }
        return [];
    };

    const bulkUnitCount = useMemo(() => buildBulkUnits().length,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [bulkForm, tipe]);

    // ─── Submit SINGLE mode ──────────────────────────────────────────────────
    const handleSubmitSingle = async (e: React.FormEvent) => {
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

    // ─── Submit BULK mode ────────────────────────────────────────────────────
    const handleSubmitBulk = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (!categoryId) { setError("Kategori wajib dipilih"); return; }
        if (!targetFolderId) {
            setError("Tambah Banyak WAJIB pilih folder tujuan (SN Lepas belum didukung untuk bulk)");
            return;
        }
        // ⬅️ BARU: Cabang WAJIB diisi (UTAMA atau JOGJA). Opsi "Belum" sudah dihapus.
        if (bulkForm.branch !== "UTAMA" && bulkForm.branch !== "JOGJA") {
            setError("Cabang WAJIB dipilih (Utama atau Jogja)");
            return;
        }
        // ⬅️ UPDATED: Case B (folder kosong) sekarang BOLEH, asal identity_name diisi
        if (isCase_B) {
            if (!bulkForm.identity_name.trim()) {
                setError("Folder kosong — wajib isi 'Nama' di section Identitas Folder");
                return;
            }
            if (tipe === "LAPTOP" && (!bulkForm.identity_cpu.trim() || !bulkForm.identity_ram.trim() || !bulkForm.identity_storage.trim())) {
                setError("Folder laptop kosong — CPU, RAM, dan Storage wajib diisi");
                return;
            }
        }

        const units = buildBulkUnits();
        if (units.length === 0) {
            if (bulkForm.method === "RANGE" && isInvertedRange(bulkForm.snFrom, bulkForm.snTo)) {
                setError("SN Awal lebih besar dari SN Akhir — cek urutannya.");
            } else {
                setError("Tidak ada SN yang di-generate. Isi minimal 1 SN.");
            }
            return;
        }

        setLoading(true);
        try {
            // ⬅️ BARU: Case B (folder kosong) → PATCH folder identity DULU sebelum bulk insert.
            // Kalau gagal, bulk insert di-abort biar tidak ada unit nyangkut di folder kosong.
            if (isCase_B) {
                const identityBody = tipe === "LAPTOP" ? {
                    laptop_name: bulkForm.identity_name.trim(),
                    brand: bulkForm.identity_brand.trim() || null,
                    cpu: bulkForm.identity_cpu.trim() || null,
                    ram: bulkForm.identity_ram.trim() || null,
                    storage: bulkForm.identity_storage.trim() || null,
                    gpu: bulkForm.identity_gpu.trim() || null,
                    display: bulkForm.identity_display.trim() || null,
                    grade: bulkForm.grade,
                    selling_price: Number(bulkForm.selling_price) || 0,
                } : {
                    name: bulkForm.identity_name.trim(),
                    brand: bulkForm.identity_brand.trim() || null,
                    spec: bulkForm.identity_spec.trim() || null,
                    grade: bulkForm.grade,
                    sell_price: Number(bulkForm.selling_price) || 0,
                };
                const patchUrl = tipe === "LAPTOP"
                    ? `/api/laptops/${targetFolderId}`
                    : `/api/accessories/${targetFolderId}`;
                const patchMethod = tipe === "LAPTOP" ? "PUT" : "PATCH";
                const patchRes = await fetch(patchUrl, {
                    method: patchMethod,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(identityBody),
                });
                const patchJson = await patchRes.json().catch(() => null);
                if (!patchRes.ok || !patchJson?.success) {
                    setError(patchJson?.message || "Gagal update identitas folder — bulk insert dibatalkan");
                    setLoading(false);
                    return;
                }
            }

            if (tipe === "LAPTOP") {
                // Endpoint laptop: /api/laptops/[id]/units/bulk
                const res = await fetch(`/api/laptops/${targetFolderId}/units/bulk`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ units }),
                });
                const result = await res.json().catch(() => null);
                if (!res.ok || !result?.success) {
                    setError(result?.message || "Gagal menambahkan units");
                    return;
                }
                onCreated({
                    tipe,
                    message: `${result.inserted ?? units.length} unit laptop berhasil ditambahkan`,
                    bulk: { inserted: result.inserted ?? units.length, failed: 0 },
                });
            } else {
                // Endpoint aksesoris: /api/accessory-units/bulk (max 500 per batch)
                const result = await postAccessoryUnitsInChunks(targetFolderId, units);
                if (result.failed > 0) {
                    setError(
                        result.message
                            ? `${result.inserted} berhasil, ${result.failed} gagal: ${result.message}`
                            : `${result.inserted} berhasil, ${result.failed} unit gagal ditambahkan`
                    );
                    return;
                }
                onCreated({
                    tipe,
                    message: `${result.inserted} unit aksesoris berhasil ditambahkan`,
                    bulk: { inserted: result.inserted, failed: 0 },
                });
            }
        } catch {
            setError("Terjadi kesalahan koneksi");
        } finally {
            setLoading(false);
        }
    };



    const lockedField = isCase_A;
    // ⬅️ UPDATED: Folder kosong SEKARANG BOLEH jadi target bulk.
    // Identitas folder di-PATCH dari form identity sebelum bulk insert.
    const foldersForBulk = folders;

    // ─── RENDER ──────────────────────────────────────────────────────────────
    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden animate-popIn max-h-[90dvh] flex flex-col">
                <div className="h-1 w-full bg-gradient-to-r from-indigo-400 via-indigo-600 to-indigo-800 flex-shrink-0" />

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                        {mode !== "SELECT" && (
                            <button
                                type="button"
                                onClick={() => handleModeChange("SELECT")}
                                className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 transition"
                                title="Kembali ke pilihan mode"
                            >
                                <ArrowLeft className="w-4 h-4" />
                            </button>
                        )}
                        <div className="min-w-0">
                            <h2 className="font-bold text-gray-900 text-[15px] truncate">
                                {mode === "SELECT" && "Tambah Unit / SN"}
                                {mode === "SINGLE" && "Tambah 1 Unit"}
                                {mode === "BULK" && "Tambah Banyak Unit"}
                            </h2>
                            <p className="text-xs text-gray-400 mt-0.5 truncate">
                                {mode === "SELECT" && "Pilih cara tambah unit"}
                                {mode === "SINGLE" && "SN-first — pilih target folder atau SN Lepas"}
                                {mode === "BULK" && "Range SN, Manual, atau Import Excel ke 1 folder"}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 transition">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* ══════════════════ MODE SELECTOR (Step 0) ══════════════════ */}
                {mode === "SELECT" && (
                    <div className="overflow-y-auto flex-1 p-6 space-y-4">
                        <p className="text-sm text-gray-600 text-center">
                            Mau tambah <b>1 unit</b> dengan SN tunggal, atau <b>banyak unit</b> sekaligus?
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => handleModeChange("SINGLE")}
                                className="group relative p-6 bg-white border-2 border-gray-200 rounded-2xl hover:border-indigo-500 hover:shadow-lg transition text-left"
                            >
                                <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center mb-3 group-hover:bg-indigo-100 transition">
                                    <Package className="w-6 h-6 text-indigo-600" />
                                </div>
                                <p className="font-bold text-gray-900 text-sm">1 Unit</p>
                                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                                    SN tunggal dengan identitas lengkap (nama, spek, harga, grade).
                                    Bisa SN Lepas (tanpa folder).
                                </p>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleModeChange("BULK")}
                                className="group relative p-6 bg-white border-2 border-gray-200 rounded-2xl hover:border-indigo-500 hover:shadow-lg transition text-left"
                            >
                                <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center mb-3 group-hover:bg-indigo-100 transition">
                                    <Layers className="w-6 h-6 text-indigo-600" />
                                </div>
                                <p className="font-bold text-gray-900 text-sm">Tambah Banyak</p>
                                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                                    Range SN, Manual, atau Import Excel. Semua unit masuk 1 folder dengan identitas sama.
                                </p>
                            </button>
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button type="button" onClick={onClose}
                                className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition">
                                Batal
                            </button>
                        </div>
                    </div>
                )}

                {/* ══════════════════ SINGLE MODE FORM ══════════════════ */}
                {mode === "SINGLE" && (
                    <form onSubmit={handleSubmitSingle} className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
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
                                                <div className="mt-1.5">
                                                    <SearchableFolderSelect
                                                        folders={folders}
                                                        value={targetFolderId}
                                                        onChange={setTargetFolderId}
                                                        loading={loadingFolders}
                                                        placeholder="Ketik nama folder untuk cari..."
                                                        emptyText="Belum ada folder"
                                                    />
                                                </div>
                                            )}                                            {targetMode === "FOLDER" && !loadingFolders && folders.length === 0 && (
                                                <p className="text-[10px] text-gray-400 mt-1">Belum ada folder. Bikin folder dulu di tombol &quot;+ Folder&quot;.</p>
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
                                        placeholder='14&quot; FHD IPS' className={`${inputCls} ${lockedField ? "bg-gray-100 text-gray-500" : ""}`} /></Field>
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
                            <button type="button" onClick={() => handleModeChange("SELECT")} disabled={loading}
                                className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition disabled:opacity-50">
                                ← Kembali
                            </button>
                            <button type="submit" disabled={loading}
                                className="flex-1 h-11 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-xl text-sm font-semibold hover:from-indigo-700 hover:to-indigo-800 transition disabled:opacity-50">
                                {loading ? "Menyimpan..." : "Simpan"}
                            </button>
                        </div>
                    </form>
                )}

                {/* ══════════════════ BULK MODE FORM ══════════════════ */}
                {mode === "BULK" && (
                    <form onSubmit={handleSubmitBulk} className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
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

                        {/* Step 3: Target Folder — WAJIB, tanpa opsi SN Lepas */}
                        {categoryId && (
                            <Field label="3. Target Folder" required>
                                <SearchableFolderSelect
                                    folders={foldersForBulk}
                                    value={targetFolderId}
                                    onChange={setTargetFolderId}
                                    loading={loadingFolders}
                                    placeholder="Ketik nama folder untuk cari..."
                                    emptyText="Belum ada folder yang bisa jadi target"
                                />
                                <p className="text-[10px] text-gray-400 mt-1.5 leading-relaxed">
                                    💡 <b>Boleh pilih folder berisi ATAU folder kosong</b> (asal kategori sama).
                                    SN Lepas tidak didukung di mode ini. Kalau pilih folder kosong, isi identitas folder di section bawah.
                                </p>
                            </Field>
                        )}

                        {/* ⬅️ BARU: Step 3b — Identity fields untuk Case B (folder kosong).
                            Field ini dipakai untuk PATCH folder identity sebelum bulk insert,
                            sekaligus jadi identitas semua unit di batch. */}
                        {targetFolderId && isCase_B && (
                            <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 space-y-3">
                                <p className="text-[11px] text-sky-800 leading-relaxed">
                                    📦 <b>Folder kosong</b> — isi identitas folder di bawah. Semua SN di batch akan pakai identitas ini,
                                    dan folder akan di-update sekali sebelum bulk insert.
                                </p>

                                {tipe === "LAPTOP" ? (
                                    <>
                                        <Field label="Nama Laptop" required>
                                            <input value={bulkForm.identity_name}
                                                onChange={e => setBulkForm(p => ({ ...p, identity_name: e.target.value }))}
                                                placeholder="Contoh: Acer Aspire 3 A314" className={inputCls} />
                                        </Field>
                                        <div className="grid grid-cols-2 gap-3">
                                            <Field label="Brand">
                                                <input value={bulkForm.identity_brand}
                                                    onChange={e => setBulkForm(p => ({ ...p, identity_brand: e.target.value }))}
                                                    placeholder="Acer, Lenovo..." className={inputCls} />
                                            </Field>
                                            <Field label="CPU" required>
                                                <input value={bulkForm.identity_cpu}
                                                    onChange={e => setBulkForm(p => ({ ...p, identity_cpu: e.target.value }))}
                                                    placeholder="i5-1135G7" className={inputCls} />
                                            </Field>
                                            <Field label="RAM" required>
                                                <input value={bulkForm.identity_ram}
                                                    onChange={e => setBulkForm(p => ({ ...p, identity_ram: e.target.value }))}
                                                    placeholder="8GB DDR4" className={inputCls} />
                                            </Field>
                                            <Field label="Storage" required>
                                                <input value={bulkForm.identity_storage}
                                                    onChange={e => setBulkForm(p => ({ ...p, identity_storage: e.target.value }))}
                                                    placeholder="512GB SSD" className={inputCls} />
                                            </Field>
                                            <Field label="GPU">
                                                <input value={bulkForm.identity_gpu}
                                                    onChange={e => setBulkForm(p => ({ ...p, identity_gpu: e.target.value }))}
                                                    placeholder="Iris Xe / MX450" className={inputCls} />
                                            </Field>
                                            <Field label="Display">
                                                <input value={bulkForm.identity_display}
                                                    onChange={e => setBulkForm(p => ({ ...p, identity_display: e.target.value }))}
                                                    placeholder='14" FHD IPS' className={inputCls} />
                                            </Field>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <Field label="Nama Aksesoris" required>
                                            <input value={bulkForm.identity_name}
                                                onChange={e => setBulkForm(p => ({ ...p, identity_name: e.target.value }))}
                                                placeholder="Contoh: Charger Acer 65W" className={inputCls} />
                                        </Field>
                                        <div className="grid grid-cols-2 gap-3">
                                            <Field label="Brand">
                                                <input value={bulkForm.identity_brand}
                                                    onChange={e => setBulkForm(p => ({ ...p, identity_brand: e.target.value }))}
                                                    placeholder="Acer, Lenovo..." className={inputCls} />
                                            </Field>
                                            <Field label="Spesifikasi">
                                                <input value={bulkForm.identity_spec}
                                                    onChange={e => setBulkForm(p => ({ ...p, identity_spec: e.target.value }))}
                                                    placeholder="65W 19V 3.42A" className={inputCls} />
                                            </Field>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Step 4: Method tabs — Range SN / Manual / Import Excel */}
                        {targetFolderId && (
                            <>
                                <Field label="4. Cara Input SN" required>
                                    <div className="flex gap-2">
                                        {([
                                            { id: "RANGE", label: "Range SN", icon: Hash },
                                            { id: "MANUAL", label: "Manual", icon: Pencil },
                                            { id: "EXCEL", label: "Import Excel", icon: BarChart3 },
                                        ] as const).map(t => {
                                            const Icon = t.icon;
                                            return (
                                                <button key={t.id} type="button"
                                                    onClick={() => { setBulkForm(p => ({ ...p, method: t.id })); setError(""); }}
                                                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition border ${bulkForm.method === t.id ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}>
                                                    <Icon className="w-3.5 h-3.5" />
                                                    {t.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </Field>

                                {/* Range SN */}
                                {bulkForm.method === "RANGE" && (
                                    <div className="space-y-3">
                                        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                                            <p className="text-xs text-blue-700">
                                                Masukkan SN awal dan SN akhir. Sistem auto-generate semua SN di antaranya.
                                                Contoh: <code className="font-mono bg-blue-100 px-1 rounded">00018376</code> ke <code className="font-mono bg-blue-100 px-1 rounded">00018380</code> → 5 unit.
                                            </p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <Field label="SN Awal" required>
                                                <input type="text" placeholder="00018376" value={bulkForm.snFrom}
                                                    onChange={e => setBulkForm(p => ({ ...p, snFrom: e.target.value }))}
                                                    className={`${inputCls} font-mono`} />
                                            </Field>
                                            <Field label="SN Akhir" required>
                                                <input type="text" placeholder="00018380" value={bulkForm.snTo}
                                                    onChange={e => setBulkForm(p => ({ ...p, snTo: e.target.value }))}
                                                    className={`${inputCls} font-mono`} />
                                            </Field>
                                        </div>
                                        {bulkForm.snFrom && bulkForm.snTo && isInvertedRange(bulkForm.snFrom, bulkForm.snTo) && (
                                            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                                                <p className="text-xs text-red-600 font-medium">
                                                    SN Awal lebih besar dari SN Akhir — cek urutannya, mungkin kebalik.
                                                </p>
                                            </div>
                                        )}
                                        {bulkForm.snFrom && bulkForm.snTo && !isInvertedRange(bulkForm.snFrom, bulkForm.snTo) && (
                                            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                                <p className="text-xs text-gray-500 mb-1">
                                                    Total: <span className="font-bold text-gray-800">{generateRange(bulkForm.snFrom, bulkForm.snTo).length} unit</span>
                                                </p>
                                                <p className="text-xs text-gray-400 font-mono">
                                                    {generateRange(bulkForm.snFrom, bulkForm.snTo).slice(0, 5).join(", ")}
                                                    {generateRange(bulkForm.snFrom, bulkForm.snTo).length > 5 && ` ... +${generateRange(bulkForm.snFrom, bulkForm.snTo).length - 5} lagi`}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Manual */}
                                {bulkForm.method === "MANUAL" && (
                                    <div className="space-y-3">
                                        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                                            <p className="text-xs text-blue-700">Ketik atau paste serial number, satu per baris (atau pisahkan dengan koma).</p>
                                        </div>
                                        <Field label="Daftar Serial Number" required>
                                            <textarea
                                                placeholder={"00018376\n00018377\n00018378\natau: 00018376, 00018377, 00018378"}
                                                value={bulkForm.manualText}
                                                onChange={e => setBulkForm(p => ({ ...p, manualText: e.target.value }))}
                                                rows={6}
                                                className={`${inputCls} font-mono resize-none`} />
                                        </Field>
                                        {bulkForm.manualText.trim() && (
                                            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                                <p className="text-xs text-gray-500">Total: <span className="font-bold text-gray-800">
                                                    {bulkForm.manualText.split(/[\n,；,、]/).map(s => s.trim()).filter(Boolean).length} unit
                                                </span></p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Excel */}
                                {bulkForm.method === "EXCEL" && (
                                    <div className="space-y-3">
                                        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                                            <p className="text-xs text-blue-700 mb-2">
                                                Upload file Excel (.xlsx/.xls). Kolom yang dikenali:
                                                <code className="bg-blue-100 px-1 rounded font-mono mx-1">serial_number</code>,
                                                <code className="bg-blue-100 px-1 rounded font-mono mx-1">grade</code>,
                                                <code className="bg-blue-100 px-1 rounded font-mono mx-1">{tipe === "LAPTOP" ? "purchase_price" : "buy_price"}</code>,
                                                <code className="bg-blue-100 px-1 rounded font-mono mx-1">selling_price</code>,
                                                <code className="bg-blue-100 px-1 rounded font-mono mx-1">condition_note</code>.
                                            </p>
                                            <button type="button" onClick={downloadTemplate}
                                                className="inline-flex items-center gap-1 text-xs text-blue-600 font-semibold underline underline-offset-2">
                                                <Download className="w-3 h-3" />Download Template Excel
                                            </button>
                                        </div>
                                        <div onClick={() => fileInputRef.current?.click()}
                                            className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:bg-gray-50 transition">
                                            <div className="flex justify-center mb-2"><Inbox className="w-8 h-8 opacity-50" /></div>
                                            <p className="text-sm font-medium text-gray-600">Klik untuk pilih file</p>
                                            <p className="text-xs text-gray-400 mt-1">.xlsx atau .xls</p>
                                            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="hidden" />
                                        </div>
                                        {bulkForm.excelRows.length > 0 && (
                                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                                                <p className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 mb-2">
                                                    <CheckCircle2 className="w-3.5 h-3.5" />{bulkForm.excelRows.length} baris berhasil dibaca
                                                </p>
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
                                                            {bulkForm.excelRows.slice(0, 5).map((r, i) => (
                                                                <tr key={i} className="border-t border-emerald-100">
                                                                    <td className="py-0.5 font-mono text-gray-700">{r.serial_number}</td>
                                                                    <td className="py-0.5 text-gray-600">{r.grade}</td>
                                                                    <td className="py-0.5 text-right text-gray-600">
                                                                        {r.selling_price ? `Rp${Number(r.selling_price).toLocaleString("id-ID")}` : "—"}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                            {bulkForm.excelRows.length > 5 && (
                                                                <tr><td colSpan={3} className="text-center pt-1 text-gray-400">
                                                                    ... +{bulkForm.excelRows.length - 5} baris lagi
                                                                </td></tr>
                                                            )}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Default values — tidak muncul kalau Excel (nilai per-row diambil dari file) */}
                                {bulkForm.method !== "EXCEL" && (
                                    <div className="border-t border-gray-100 pt-4 space-y-3">
                                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">5. Nilai Default Semua Unit</p>

                                        {/* Status — LAPTOP: hidden & force BELUM_SIAP (auto masuk Team QC).
                                                     AKSESORIS: masih bisa pilih TERSEDIA/BELUM_SIAP.
                                            Requirement Rayhan: unit laptop baru TIDAK bisa pilih status —
                                            auto masuk antrian Team QC dengan status Belum Siap Jual. */}
                                        {tipe === "LAPTOP" ? (
                                            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-[11px] text-amber-800 leading-snug">
                                                🔒 Unit laptop baru otomatis masuk status <b>Belum Siap Jual</b> dan antrian <b>Team QC</b>.
                                                Status naik ke Siap Jual setelah QC lengkap di halaman Team QC.
                                            </div>
                                        ) : (
                                            <Field label="Status">
                                                <div className="flex gap-1.5">
                                                    {([["TERSEDIA", "Siap Jual"], ["BELUM_SIAP", "Belum Siap"]] as const).map(([v, label]) => (
                                                        <button key={v} type="button"
                                                            onClick={() => setBulkForm(p => ({ ...p, status: v }))}
                                                            className={`flex-1 h-9 flex items-center justify-center gap-1 rounded-lg text-xs font-semibold border transition ${bulkForm.status === v
                                                                ? v === "TERSEDIA"
                                                                    ? "bg-emerald-600 text-white border-emerald-600"
                                                                    : "bg-amber-500 text-white border-amber-500"
                                                                : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                                                                }`}>
                                                            {v === "TERSEDIA" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                                                            {label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </Field>
                                        )}

                                        {/* Grade (laptop) atau Kondisi (aksesoris) */}
                                        {tipe === "LAPTOP" ? (
                                            <Field label="Grade">
                                                <div className="flex gap-1.5">
                                                    {GRADE_OPTIONS.map(g => (
                                                        <button key={g} type="button"
                                                            onClick={() => setBulkForm(p => ({ ...p, grade: g }))}
                                                            className={`flex-1 h-9 rounded-lg text-xs font-bold border transition ${bulkForm.grade === g ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}>
                                                            {g}
                                                        </button>
                                                    ))}
                                                </div>
                                            </Field>
                                        ) : (
                                            <div className="grid grid-cols-2 gap-3">
                                                <Field label="Kondisi">
                                                    <select value={bulkForm.condition}
                                                        onChange={e => setBulkForm(p => ({ ...p, condition: e.target.value }))}
                                                        className={inputCls}>
                                                        {CONDITION_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                                    </select>
                                                </Field>
                                                <Field label="Grade">
                                                    <select value={bulkForm.grade}
                                                        onChange={e => setBulkForm(p => ({ ...p, grade: e.target.value }))}
                                                        className={inputCls}>
                                                        {GRADE_OPTIONS.map(g => <option key={g} value={g}>Grade {g}</option>)}
                                                    </select>
                                                </Field>
                                            </div>
                                        )}

                                        {/* Cabang — WAJIB pilih Utama atau Jogja. Opsi "Belum" DIHAPUS
                                            sesuai requirement Rayhan: semua unit baru harus langsung tagged cabang. */}
                                        <Field label="Cabang (semua unit)" required>
                                            <div className="flex gap-1.5">
                                                {([
                                                    { v: "UTAMA", label: "🏢 Utama" },
                                                    { v: "JOGJA", label: "📍 Jogja" },
                                                ] as const).map(o => (
                                                    <button key={o.v} type="button"
                                                        onClick={() => setBulkForm(p => ({ ...p, branch: o.v }))}
                                                        className={`flex-1 h-9 rounded-lg text-xs font-semibold border transition ${bulkForm.branch === o.v
                                                            ? o.v === "JOGJA" ? "bg-violet-600 text-white border-violet-600"
                                                                : "bg-slate-700 text-white border-slate-700"
                                                            : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}>
                                                        {o.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </Field>

                                        {/* Sumber (aksesoris saja, laptop tidak dikirim di payload bulk laptop) */}
                                        {tipe === "AKSESORIS" && (
                                            <Field label="Sumber">
                                                <AutocompleteInput field="source" name="source" value={bulkForm.source}
                                                    onChange={v => setBulkForm(p => ({ ...p, source: v }))}
                                                    placeholder="Kosasih, Lelang..." className={inputCls} />
                                            </Field>
                                        )}

                                        {/* Harga */}
                                        <div className="grid grid-cols-2 gap-3">
                                            <Field label="Harga Modal">
                                                <CurrencyInput value={Number(bulkForm.purchase_price) || 0}
                                                    onChange={v => setBulkForm(p => ({ ...p, purchase_price: String(v) }))} className={inputCls} />
                                            </Field>
                                            <Field label="Harga Jual">
                                                <CurrencyInput value={Number(bulkForm.selling_price) || 0}
                                                    onChange={v => setBulkForm(p => ({ ...p, selling_price: String(v) }))} className={inputCls} />
                                            </Field>
                                        </div>

                                        {/* Sparepart (laptop saja) */}
                                        {tipe === "LAPTOP" && (
                                            <Field label="Modal Sparepart">
                                                <CurrencyInput value={Number(bulkForm.sparepart_cost) || 0}
                                                    onChange={v => setBulkForm(p => ({ ...p, sparepart_cost: String(v) }))} className={inputCls} />
                                            </Field>
                                        )}

                                        {/* Kondisi catatan */}
                                        <Field label="Kondisi Umum (opsional)">
                                            <input type="text" placeholder="Contoh: mulus, normal"
                                                value={bulkForm.condition_note}
                                                onChange={e => setBulkForm(p => ({ ...p, condition_note: e.target.value }))}
                                                className={inputCls} />
                                        </Field>

                                        {/* Tanggal masuk (laptop saja — endpoint aksesoris tidak terima received_at) */}
                                        {tipe === "LAPTOP" && (
                                            <Field label="Tanggal Masuk (semua unit)">
                                                <input type="date" value={bulkForm.received_at}
                                                    onChange={e => setBulkForm(p => ({ ...p, received_at: e.target.value }))}
                                                    max={new Date().toISOString().split("T")[0]}
                                                    className={inputCls} />
                                            </Field>
                                        )}
                                    </div>
                                )}
                            </>
                        )}

                        {error && (
                            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                                <p className="text-xs text-red-700">{error}</p>
                            </div>
                        )}

                        <div className="flex gap-3 pt-2">
                            <button type="button" onClick={() => handleModeChange("SELECT")} disabled={loading}
                                className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition disabled:opacity-50">
                                ← Kembali
                            </button>
                            <button type="submit" disabled={loading || bulkUnitCount === 0}
                                className="flex-1 h-11 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-xl text-sm font-semibold hover:from-indigo-700 hover:to-indigo-800 transition disabled:opacity-40 flex items-center justify-center gap-2">
                                {loading ? "Menyimpan..." : `Tambah ${bulkUnitCount > 0 ? `${bulkUnitCount} Unit` : "Unit"}`}
                            </button>
                        </div>
                    </form>
                )}
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

// ⬅️ BARU: Searchable dropdown untuk folder — ketik untuk filter, klik untuk pilih.
// Ganti <select> native yang susah kalau folder banyak (puluhan+).
function SearchableFolderSelect({
    folders, value, onChange, loading, placeholder, emptyText,
}: {
    folders: FolderOption[];
    value: string;
    onChange: (id: string) => void;
    loading: boolean;
    placeholder?: string;
    emptyText?: string;
}) {
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);

    const selected = folders.find(f => f.id === value);
    const filtered = query.trim() === ""
        ? folders
        : folders.filter(f => labelFolder(f).toLowerCase().includes(query.trim().toLowerCase()));

    const handleSelect = (id: string) => {
        onChange(id);
        setOpen(false);
        setQuery("");
    };

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange("");
        setQuery("");
    };

    return (
        <div className="relative">
            <input
                type="text"
                value={open ? query : (selected ? labelFolder(selected) : "")}
                onChange={e => { setQuery(e.target.value); setOpen(true); }}
                onFocus={() => { if (!open) { setQuery(""); setOpen(true); } }}
                placeholder={loading ? "Memuat folder..." : (placeholder ?? "-- Pilih Folder --")}
                disabled={loading}
                className={inputCls}
            />
            {value && !open && (
                <button type="button" onClick={handleClear}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 text-xs z-10 w-5 h-5 flex items-center justify-center rounded-full hover:bg-red-50 transition"
                    title="Kosongkan pilihan">
                    ✕
                </button>
            )}
            {open && (
                <>
                    {/* Backdrop untuk close-on-outside-click */}
                    <div className="fixed inset-0 z-10" onClick={() => { setOpen(false); setQuery(""); }} />
                    <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl max-h-64 overflow-y-auto shadow-xl">
                        {filtered.length === 0 ? (
                            <p className="p-3 text-xs text-gray-400 text-center">
                                {folders.length === 0
                                    ? (emptyText ?? "Belum ada folder")
                                    : `Tidak ada folder yang cocok dengan "${query}"`}
                            </p>
                        ) : (
                            filtered.map(f => (
                                <button key={f.id} type="button"
                                    onClick={() => handleSelect(f.id)}
                                    className={`w-full text-left px-3 py-2 text-xs hover:bg-indigo-50 transition border-b border-gray-50 last:border-0 ${f.id === value ? "bg-indigo-50 font-semibold text-indigo-700" : "text-gray-700"}`}>
                                    {labelFolder(f)}
                                </button>
                            ))
                        )}
                    </div>
                </>
            )}
        </div>
    );
}