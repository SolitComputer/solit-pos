"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import ExcelJS from "exceljs";
import Link from "next/link";
import BarcodeModal from "@/components/ui/BarcodeModal";
import { UserRole, PERMISSIONS, hasAnyRole, BARANG_FULL_ACCESS_ROLES, BARANG_PRIVATE_VIEW_ROLES, SO_ROLES } from "@/lib/permissions";
import { Laptop } from "lucide-react";
import UnitDetailModal, { UnitDetailData } from "@/components/inventory/UnitDetailModal";
import InventoryTable, { InventoryRow } from "@/components/inventory/InventoryTable";
import LaptopUnitsPreview, { PreviewUnit } from "@/components/inventory/LaptopUnitsPreview";
import { exportInventoryExcel } from "@/lib/inventoryExport";

interface LaptopUnit {
    id: string;
    serial_number: string;
    grade: string;
    status: string;
    selling_price: number;
    sparepart_cost?: number;
    official_price?: number;
    laptop_id?: string;
    condition_note?: string;
    source?: string | null;
    purchase_price?: number;
    notes?: string;
    created_at?: string;
}

interface Laptop {
    id: string;
    laptop_name: string;
    brand: string;
    cpu: string;
    ram: string;
    storage: string;
    gpu: string;
    display: string;
    condition_note: string;
    selling_price: number;
    qty: number;
    stok_tersedia: number;
    siap_jual: number;
    stok_minus: number;
    terjual: number;
    belum_lunas?: number;
    status: string;
    ready_to_sell: boolean;
    notes: string;
    created_at: string;
    audited_at?: string | null;
    audited_by?: string | null;
    so_at?: string | null;
    so_by?: string | null;
    laptop_units?: LaptopUnit[];
}

type ModalMode = "detail" | "create" | "edit" | null;

const EMPTY_FORM = {
    laptop_name: "",
    brand: "",
    cpu: "",
    ram: "",
    storage: "",
    gpu: "",
    display: "",
    selling_price: "",
    condition_note: "",
    notes: "",
};

const fmt = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");

// ── Audit Data Barang ──────────────────────────────────────────────────────
// Meeting 25/07 sempat menyebut 3 hari; instruksi terbaru = 2 hari.
// Ganti angka ini saja kalau nanti balik ke 3 hari.
const AUDIT_TTL_DAYS = 2;
const AUDIT_TTL_MS = AUDIT_TTL_DAYS * 24 * 60 * 60 * 1000;
// Auto-reset via read-time: audit dianggap "aktif" hanya jika belum lewat TTL.
const isAuditActive = (auditedAt?: string | null) =>
    !!auditedAt && Date.now() - new Date(auditedAt).getTime() < AUDIT_TTL_MS;

// ── SO (Stock Opname) ────────────────────────────────────────────────────────
// State terpisah total dari Audit — TTL 1 hari (bukan 2 hari seperti Audit).
const SO_TTL_DAYS = 1;
const SO_TTL_MS = SO_TTL_DAYS * 24 * 60 * 60 * 1000;
const isSoActive = (soAt?: string | null) =>
    !!soAt && Date.now() - new Date(soAt).getTime() < SO_TTL_MS;

const STATUS_STYLE: Record<string, { badge: string; dot: string; label: string }> = {
    SIAP_JUAL: { badge: "bg-gray-100 text-gray-700 border-gray-300", dot: "bg-green-500", label: "Siap Jual" },
    BELUM_SIAP: { badge: "bg-gray-100 text-gray-700 border-gray-300", dot: "bg-yellow-400", label: "Belum Siap" },
    SERVICE: { badge: "bg-gray-100 text-gray-700 border-gray-300", dot: "bg-blue-500", label: "Service" },
    SOLD: { badge: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-500", label: "Sold" },
};

const SORT_LABELS: Record<string, string> = {
    DEFAULT: "Urutan Default",
    AZ: "Nama: A → Z",
    ZA: "Nama: Z → A",
    NO_DESC: "No ↓",
    BRAND_ASC: "Brand ↑",
    BRAND_DESC: "Brand ↓",
    CPU_ASC: "CPU ↑",
    CPU_DESC: "CPU ↓",
    RAM_ASC: "RAM ↑",
    RAM_DESC: "RAM ↓",
    STORAGE_ASC: "Storage ↑",
    STORAGE_DESC: "Storage ↓",
    PRICE_ASC: "Harga: Rendah → Tinggi",
    PRICE_DESC: "Harga: Tinggi → Rendah",
    MODAL_ASC: "Modal Laptop: Rendah → Tinggi",
    MODAL_DESC: "Modal Laptop: Tinggi → Rendah",
    SPAREPART_ASC: "Modal Sparepart: Rendah → Tinggi",
    SPAREPART_DESC: "Modal Sparepart: Tinggi → Rendah",
    TOTAL_JUAL_ASC: "Total Jual: Rendah → Tinggi",
    TOTAL_JUAL_DESC: "Total Jual: Tinggi → Rendah",
    SUMBER_ASC: "Sumber: A → Z",
    SUMBER_DESC: "Sumber: Z → A",
    TANGGAL_ASC: "Tanggal: Lama → Baru",
    TANGGAL_DESC: "Tanggal: Baru → Lama",
    AUDIT_ASC: "Audit: Belum → Sudah",
    AUDIT_DESC: "Audit: Sudah → Belum",
    AKSI_ASC: "Aksi: Sedikit → Banyak",
    AKSI_DESC: "Aksi: Banyak → Sedikit",
    STOK_ASC: "Stok ↑",
    STOK_DESC: "Stok ↓",
    SIAP_ASC: "Siap ↑",
    SIAP_DESC: "Siap ↓",
    MINUS_ASC: "Minus ↑",
    MINUS_DESC: "Minus ↓",
    TERJUAL_ASC: "Terjual ↑",
    TERJUAL_DESC: "Terjual ↓",
    SN: "Urut SN",
};

const Shimmer = ({
    w, h, r = "8px", style = {}, className = "",
}: {
    w?: string | number; h: string | number; r?: string;
    style?: React.CSSProperties; className?: string;
}) => (
    <div
        className={className}
        style={{
            width: w ?? "100%", height: h, borderRadius: r,
            background: "linear-gradient(90deg,#ececec 25%,#e0e0e0 50%,#ececec 75%)",
            backgroundSize: "600px 100%", animation: "sk-shimmer 1.4s infinite linear",
            flexShrink: 0, ...style,
        }}
    />
);

// ─── Alert Modal ─────────────────────────────────────────────────────────────
function AlertModal({ message, onClose }: { message: string; onClose: () => void }) {
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-popIn">
                <div className="h-1 w-full bg-gradient-to-r from-gray-400 via-gray-600 to-gray-800" />
                <div className="p-7 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-5 shadow-inner">
                        <svg className="w-7 h-7 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <p className="text-gray-700 text-sm font-medium mb-6 leading-relaxed">{message}</p>
                    <button onClick={onClose}
                        className="w-full h-11 bg-gray-800 text-white rounded-xl text-sm font-semibold hover:bg-gray-900 active:scale-[0.98] transition-all duration-150 shadow-lg shadow-gray-800/20">
                        OK
                    </button>
                </div>
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={onCancel} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-popIn">
                <div className="h-1 w-full bg-gradient-to-r from-gray-400 via-gray-600 to-gray-800" />
                <div className={`px-6 py-5 ${danger ? "bg-gray-800" : "bg-gray-700"}`}>
                    <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center ring-1 ring-white/20">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <div>
                            <p className="font-bold text-white text-sm tracking-tight">Konfirmasi {danger ? "Penghapusan" : "Tindakan"}</p>
                            <p className="text-xs text-white/60 mt-0.5">Tindakan ini tidak dapat dibatalkan</p>
                        </div>
                    </div>
                </div>
                <div className="p-6">
                    <p className="text-gray-700 text-sm font-medium text-center mb-6 leading-relaxed">{message}</p>
                    <div className="flex gap-3">
                        <button onClick={onCancel}
                            className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 active:scale-[0.98] transition-all duration-150">
                            Batal
                        </button>
                        <button onClick={onConfirm}
                            className={`flex-1 h-11 rounded-xl text-sm font-semibold text-white active:scale-[0.98] transition-all duration-150 shadow-lg ${danger ? "bg-gray-800 hover:bg-gray-900 shadow-gray-800/20" : "bg-gray-700 hover:bg-gray-800 shadow-gray-700/20"}`}>
                            {confirmLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────
function DeleteConfirmModal({
    laptop, unitCount, onConfirm, onCancel,
}: {
    laptop: Laptop; unitCount: number; onConfirm: () => void; onCancel: () => void;
}) {
    const [inputName, setInputName] = useState("");
    const isMatch = inputName.trim() === laptop.laptop_name.trim();

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onCancel]);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onCancel} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-popIn">
                <div className="h-1 w-full bg-gradient-to-r from-gray-400 via-gray-700 to-gray-900" />
                <div className="bg-gray-800 px-6 py-5">
                    <div className="flex items-center gap-3.5">
                        <div className="w-11 h-11 bg-white/15 rounded-xl flex items-center justify-center ring-1 ring-white/20 flex-shrink-0">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-white font-bold text-base tracking-tight">Hapus Laptop</h3>
                            <p className="text-xs text-white/60 mt-0.5">Tindakan ini tidak dapat dibatalkan</p>
                        </div>
                    </div>
                </div>

                <div className="p-6 space-y-4">
                    <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-200">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Laptop yang akan dihapus</p>
                        <p className="text-sm font-bold text-gray-800 truncate">{laptop.laptop_name}</p>
                    </div>

                    {unitCount > 0 && (
                        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                            <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                            </svg>
                            <div>
                                <p className="text-xs font-semibold text-amber-700">Terdapat {unitCount} unit terdaftar</p>
                                <p className="text-xs text-amber-600 mt-0.5">Semua unit dan garansi terkait akan ikut terhapus</p>
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2 block">
                            Ketik nama laptop untuk konfirmasi
                        </label>
                        <div className="bg-gray-100 rounded-lg px-3.5 py-2 mb-2.5 border border-gray-200">
                            <code className="text-xs font-mono text-gray-700 select-all">{laptop.laptop_name}</code>
                        </div>
                        <input
                            type="text"
                            value={inputName}
                            onChange={e => setInputName(e.target.value)}
                            placeholder="Ketik nama laptop di atas..."
                            className={`w-full h-11 border rounded-xl px-3.5 text-sm bg-white focus:outline-none focus:ring-2 transition-all duration-200 ${inputName.length > 0
                                ? isMatch
                                    ? "border-green-400 focus:ring-green-200 bg-green-50/30"
                                    : "border-red-300 focus:ring-red-200"
                                : "border-gray-200 focus:ring-gray-200"
                                }`}
                            autoFocus
                        />
                        {inputName.length > 0 && !isMatch && (
                            <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1.5">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                Nama tidak cocok
                            </p>
                        )}
                        {isMatch && inputName.length > 0 && (
                            <p className="text-xs text-green-600 mt-1.5 flex items-center gap-1.5">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Nama cocok — siap dihapus
                            </p>
                        )}
                    </div>

                    <div className="flex gap-3 pt-1">
                        <button onClick={onCancel}
                            className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 active:scale-[0.98] transition-all duration-150">
                            Batal
                        </button>
                        <button
                            onClick={onConfirm}
                            disabled={!isMatch}
                            className="flex-1 h-11 bg-gray-800 text-white rounded-xl text-sm font-semibold hover:bg-gray-900 active:scale-[0.98] transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-gray-800/20"
                        >
                            Hapus Permanen
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function LaptopsContent() {
    const [laptops, setLaptops] = useState<Laptop[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [filterStatus, setFilterStatus] = useState("ALL");
    const [filterBrand, setFilterBrand] = useState("ALL");
    const [filterProcessor, setFilterProcessor] = useState("ALL");
    const [filterRam, setFilterRam] = useState("ALL");
    const [filterPriceRange, setFilterPriceRange] = useState("ALL");
    const [sortBy, setSortBy] = useState("DEFAULT");
    const [filterSN, setFilterSN] = useState("");
    // ── Filter stok: default TERSEDIA supaya laptop stok 0 otomatis "hilang" ──
    const [filterStock, setFilterStock] = useState<"ALL" | "TERSEDIA" | "HABIS">("TERSEDIA");
    // ── Filter status audit (pakai isAuditActive supaya konsisten dgn badge tabel) ──
    const [filterAudit, setFilterAudit] = useState<"" | "audited" | "unaudited">("");

    const handleSort = (asc: string, desc: string) => {
        setSortBy(prev => prev === asc ? desc : asc);
    };

    const [modalMode, setModalMode] = useState<ModalMode>(null);
    const [selectedLaptop, setSelectedLaptop] = useState<Laptop | null>(null);
    const [formData, setFormData] = useState<Record<string, string>>(EMPTY_FORM);
    const [formLoading, setFormLoading] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
    const [barcodeTarget, setBarcodeTarget] = useState<{ id: string; name: string } | null>(null);

    //  Multi-role: simpan SEMUA roles user (bukan cuma 1 primary role)
    const [userRoles, setUserRoles] = useState<UserRole[]>([]);

    //  Semua permission check sekarang pakai hasAnyRole(userRoles, ...)
    const canEditLaptop = hasAnyRole(userRoles, PERMISSIONS.EDIT_LAPTOP);
    const canCreateLaptop = hasAnyRole(userRoles, PERMISSIONS.CREATE_LAPTOP);
    const canExport = hasAnyRole(userRoles, [
        "ADMIN", "PROGRAMMER", "ASISTEN_CEO", "KEPALA_SALES", "ACCOUNTING", "PENGELOLA_BARANG",
        "KEPALA_PENGELOLA_BARANG", "KEPALA_TEKNISI", "KEPALA_SOTECH",
        "MARKETING", "KEPALA_MARKETING",
    ] as UserRole[]);
    const canViewUnits = hasAnyRole(userRoles, PERMISSIONS.VIEW_UNITS);
    const canViewBarcode = hasAnyRole(userRoles, PERMISSIONS.VIEW_BARCODE);

    //  Full Access barang → boleh Edit semua field unit lewat Pop-up Detail
    const canFullAccessBarang = hasAnyRole(userRoles, BARANG_FULL_ACCESS_ROLES);
    //  Boleh lihat Harga Modal / Sumber / Tgl Masuk + kolom ST & M. Sales = false.
    //  Satu konstanta dipakai untuk semuanya supaya tidak ada 3 daftar role
    //  terpisah yang harus diedit bersamaan tiap ada perubahan.
    const canSeePrivateBarang = hasAnyRole(userRoles, BARANG_PRIVATE_VIEW_ROLES);
    const canViewTotalStok = canSeePrivateBarang;
    //  SO (Stock Opname) pakai whitelist sendiri, lebih sempit dari
    //  canSeePrivateBarang — khusus tim Pengelola Barang saja.
    const canManageSo = hasAnyRole(userRoles, SO_ROLES);

    //  Pop-up Detail unit — dipakai saat stok = 1 (tanpa perlu masuk halaman Units)
    const [unitDetail, setUnitDetail] = useState<{ unit: UnitDetailData; laptop: Laptop } | null>(null);
    const [unitDetailLoading, setUnitDetailLoading] = useState(false);
    //  True kalau Pop-up Unit dibuka DARI Pop-up Detail Laptop — dipakai supaya
    //  tombol "Kembali" tahu harus reopen Detail Laptop, bukan cuma close.
    const [unitDetailFromLaptopDetail, setUnitDetailFromLaptopDetail] = useState(false);

    const [alertModal, setAlertModal] = useState<string | null>(null);
    const [confirmModal, setConfirmModal] = useState<{ message: string; onConfirm: () => void } | null>(null);
    const [deleteConfirmModal, setDeleteConfirmModal] = useState<{ laptop: Laptop; unitCount: number } | null>(null);
    //  Audit: id laptop yang lagi diproses (biar tombolnya loading & tidak dobel klik)
    const [auditingId, setAuditingId] = useState<string | null>(null);
    //  Riwayat audit — laptop yang sedang dibuka riwayatnya di AuditHistoryModal
    const [historyTarget, setHistoryTarget] = useState<{ id: string; name: string } | null>(null);

    //  SO (Stock Opname): id laptop yang lagi diproses — state terpisah dari Audit
    const [soingId, setSoingId] = useState<string | null>(null);
    //  Riwayat SO — laptop yang sedang dibuka riwayatnya di SoHistoryModal
    const [soHistoryTarget, setSoHistoryTarget] = useState<{ id: string; name: string } | null>(null);

    const showAlert = (msg: string) => setAlertModal(msg);

    //  Toggle audit 1 model laptop. Server yang menentukan set/clear-nya,
    //  hasilnya (audited_at, audited_by) langsung update state lokal.
    const toggleAudit = async (id: string) => {
        setAuditingId(id);
        try {
            const res = await fetch(`/api/laptops/${id}/audit`, { method: "PATCH" });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.message || "Gagal memperbarui audit");
            setLaptops(prev => prev.map(l =>
                l.id === id
                    ? { ...l, audited_at: json.data.audited_at, audited_by: json.data.audited_by }
                    : l
            ));
        } catch (e) {
            showAlert(e instanceof Error ? e.message : "Gagal memperbarui audit");
        } finally {
            setAuditingId(null);
        }
    };

    //  Toggle SO 1 model laptop — server yang menentukan set/clear, sama pola dgn toggleAudit
    const toggleSo = async (id: string) => {
        setSoingId(id);
        try {
            const res = await fetch(`/api/laptops/${id}/so`, { method: "PATCH" });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.message || "Gagal memperbarui SO");
            setLaptops(prev => prev.map(l =>
                l.id === id
                    ? { ...l, so_at: json.data.so_at, so_by: json.data.so_by }
                    : l
            ));
        } catch (e) {
            showAlert(e instanceof Error ? e.message : "Gagal memperbarui SO");
        } finally {
            setSoingId(null);
        }
    };

    useEffect(() => { fetchLaptops(); }, []);

    //  Multi-role: ambil array roles dari /api/auth/me, fallback ke role tunggal
    useEffect(() => {
        fetch("/api/auth/me")
            .then(r => r.json())
            .then(r => {
                const roles: string[] =
                    Array.isArray(r.user?.roles) && r.user.roles.length > 0
                        ? r.user.roles
                        : r.user?.role
                            ? [r.user.role]
                            : [];
                setUserRoles(roles as UserRole[]);
            })
            .catch(() => setUserRoles([]));
    }, []);

    useEffect(() => {
        document.body.style.overflow = modalMode ? "hidden" : "";
        return () => { document.body.style.overflow = ""; };
    }, [modalMode]);

    const fetchLaptops = async () => {
        setIsLoading(true);
        try {
            const res = await fetch("/api/laptops");
            const result = await res.json();
            const normalized = (result.data || []).map((l: Laptop) => {
                const units = l.laptop_units || [];
                const siapJual = units.filter((u: LaptopUnit) => u.status === "SIAP_JUAL").length;
                const stokMinus = units.filter((u: LaptopUnit) => u.status === "SERVICE" || u.status === "BELUM_SIAP").length;
                // Unit yang sedang di antrian penyiapan (belum lunas, dipindah oleh
                // sales ke penyedia barang) TETAP dihitung sebagai stok Data Barang.
                // Hanya "Siap Jual" yang berkurang di tahap ini — lihat
                // api/preparation/route.ts (POST) untuk transisi SIAP_JUAL → DALAM_PENYIAPAN.
                const dalamPenyiapan = units.filter((u: LaptopUnit) => u.status === "DALAM_PENYIAPAN").length;
                // Unit "terjual tapi belum lunas": RESERVED (DP), HELD (Ambil Dulu),
                // PACKING (ecommerce, dana belum cair). Beda dari SOLD (transaksi
                // "PAID" — benar-benar lunas). Dipakai buat badge "Belum Lunas" di
                // tabel, dan supaya model ini TIDAK ikut hilang dari filter TERSEDIA.
                const belumLunas = units.filter((u: LaptopUnit) =>
                    u.status === "RESERVED" || u.status === "HELD" || u.status === "PACKING"
                ).length;
                return {
                    ...l,
                    selling_price: Math.round(Number(l.selling_price) || 0),
                    qty: units.length,
                    // Stok Tersisa = Siap Jual + Minus + Dalam Penyiapan.
                    // Unit RESERVED/HELD/PACKING (dipesan via DP transaksi customer) sengaja
                    // TIDAK dihitung — statusnya sudah "diproses" via jalur transaksi.
                    // Unit DALAM_PENYIAPAN (antrian penyiapan internal, BELUM lunas) beda
                    // dari RESERVED — sengaja TETAP dihitung supaya Data Barang tidak
                    // berkurang saat order baru masuk antrian penyiapan (business rule).
                    stok_tersedia: siapJual + stokMinus + dalamPenyiapan,
                    siap_jual: siapJual,
                    stok_minus: stokMinus,
                    terjual: units.filter((u: LaptopUnit) => u.status === "SOLD").length,
                    belum_lunas: belumLunas,
                };
            });
            setLaptops(normalized);
        } catch {
            setLaptops([]);
        } finally {
            setIsLoading(false);
        }
    };

    const filteredLaptops = useMemo(() => {
        let list = [...laptops];
        if (search.trim()) {
            const t = search.toLowerCase();
            list = list.filter(x =>
                x.laptop_name?.toLowerCase().includes(t) ||
                x.brand?.toLowerCase().includes(t) ||
                x.cpu?.toLowerCase().includes(t) ||
                x.ram?.toLowerCase().includes(t) ||
                x.storage?.toLowerCase().includes(t)
            );
        }
        if (filterStatus === "SIAP_JUAL") {
            list = list.filter(x => (x.siap_jual ?? 0) > 0);
        } else if (filterStatus === "BELUM_SIAP") {
            list = list.filter(x => (x.stok_minus ?? 0) > 0);
        }
        if (filterBrand !== "ALL") list = list.filter(x => x.brand === filterBrand);
        if (filterProcessor !== "ALL") {
            list = list.filter(x => x.cpu?.toLowerCase().includes(filterProcessor.toLowerCase()));
        }
        if (filterRam !== "ALL") list = list.filter(x => x.ram === filterRam);
        if (filterPriceRange !== "ALL") {
            const ranges: Record<string, [number, number]> = {
                "1-2": [1_000_000, 2_000_000],
                "2-3": [2_000_000, 3_000_000],
                "3-4": [3_000_000, 4_000_000],
                "4+": [4_000_000, Infinity],
            };
            const [min, max] = ranges[filterPriceRange] ?? [0, Infinity];
            list = list.filter(x => x.selling_price >= min && x.selling_price < max);
        }
        if (filterSN.trim()) {
            const snQ = filterSN.trim().toLowerCase();
            list = list.filter(x => x.laptop_units?.some(u => u.serial_number.toLowerCase().includes(snQ)));
        }

        // ── Filter stok tersisa ──────────────────────────────────────────────
        // Model yang punya unit RESERVED/HELD/PACKING (terjual belum lunas) HARUS
        // tetap tampil di sini walau stok_tersedia = 0 (rule "Terjual tapi Belum
        // Lunas tetap tampil di Data Barang").
        if (filterStock === "TERSEDIA") {
            list = list.filter(x => (x.laptop_units?.length ?? 0) === 0 || (x.stok_tersedia ?? 0) > 0 || (x.belum_lunas ?? 0) > 0);
        } else if (filterStock === "HABIS") {
            list = list.filter(x => (x.stok_tersedia ?? 0) === 0 && (x.belum_lunas ?? 0) === 0);
        }

        // ── Filter status audit ───────────────────────────────────────────────
        if (filterAudit === "audited") {
            list = list.filter(x => isAuditActive(x.audited_at));
        } else if (filterAudit === "unaudited") {
            list = list.filter(x => !isAuditActive(x.audited_at));
        }

        switch (sortBy) {
            case "AZ": list.sort((a, b) => (a.laptop_name || "").localeCompare(b.laptop_name || "")); break;
            case "ZA": list.sort((a, b) => (b.laptop_name || "").localeCompare(a.laptop_name || "")); break;
            case "NO_DESC": list.reverse(); break;
            case "BRAND_ASC": list.sort((a, b) => (a.brand || "").localeCompare(b.brand || "")); break;
            case "BRAND_DESC": list.sort((a, b) => (b.brand || "").localeCompare(a.brand || "")); break;
            case "CPU_ASC": list.sort((a, b) => (a.cpu || "").localeCompare(b.cpu || "")); break;
            case "CPU_DESC": list.sort((a, b) => (b.cpu || "").localeCompare(a.cpu || "")); break;
            case "RAM_ASC": list.sort((a, b) => (a.ram || "").localeCompare(b.ram || "")); break;
            case "RAM_DESC": list.sort((a, b) => (b.ram || "").localeCompare(a.ram || "")); break;
            case "STORAGE_ASC": list.sort((a, b) => (a.storage || "").localeCompare(b.storage || "")); break;
            case "STORAGE_DESC": list.sort((a, b) => (b.storage || "").localeCompare(a.storage || "")); break;
            case "PRICE_ASC": list.sort((a, b) => (a.selling_price || 0) - (b.selling_price || 0)); break;
            case "PRICE_DESC": list.sort((a, b) => (b.selling_price || 0) - (a.selling_price || 0)); break;
            case "MODAL_ASC": list.sort((a, b) => (a.laptop_units?.find(u => u.status !== "SOLD")?.purchase_price ?? 0) - (b.laptop_units?.find(u => u.status !== "SOLD")?.purchase_price ?? 0)); break;
            case "MODAL_DESC": list.sort((a, b) => (b.laptop_units?.find(u => u.status !== "SOLD")?.purchase_price ?? 0) - (a.laptop_units?.find(u => u.status !== "SOLD")?.purchase_price ?? 0)); break;
            case "SPAREPART_ASC": list.sort((a, b) => (a.laptop_units?.find(u => u.status !== "SOLD")?.sparepart_cost ?? 0) - (b.laptop_units?.find(u => u.status !== "SOLD")?.sparepart_cost ?? 0)); break;
            case "SPAREPART_DESC": list.sort((a, b) => (b.laptop_units?.find(u => u.status !== "SOLD")?.sparepart_cost ?? 0) - (a.laptop_units?.find(u => u.status !== "SOLD")?.sparepart_cost ?? 0)); break;
            case "TOTAL_JUAL_ASC": list.sort((a, b) => ((a.selling_price || 0) * (a.stok_tersedia || 0)) - ((b.selling_price || 0) * (b.stok_tersedia || 0))); break;
            case "TOTAL_JUAL_DESC": list.sort((a, b) => ((b.selling_price || 0) * (b.stok_tersedia || 0)) - ((a.selling_price || 0) * (a.stok_tersedia || 0))); break;
            case "SUMBER_ASC": list.sort((a, b) => (a.laptop_units?.find(u => u.status !== "SOLD")?.source || "").localeCompare(b.laptop_units?.find(u => u.status !== "SOLD")?.source || "", "id")); break;
            case "SUMBER_DESC": list.sort((a, b) => (b.laptop_units?.find(u => u.status !== "SOLD")?.source || "").localeCompare(a.laptop_units?.find(u => u.status !== "SOLD")?.source || "", "id")); break;
            case "TANGGAL_ASC": list.sort((a, b) => (a.laptop_units?.find(u => u.status !== "SOLD")?.created_at || a.created_at || "").localeCompare(b.laptop_units?.find(u => u.status !== "SOLD")?.created_at || b.created_at || "")); break;
            case "TANGGAL_DESC": list.sort((a, b) => (b.laptop_units?.find(u => u.status !== "SOLD")?.created_at || b.created_at || "").localeCompare(a.laptop_units?.find(u => u.status !== "SOLD")?.created_at || a.created_at || "")); break;
            case "AUDIT_ASC": list.sort((a, b) => (isAuditActive(a.audited_at) ? 1 : 0) - (isAuditActive(b.audited_at) ? 1 : 0)); break;
            case "AUDIT_DESC": list.sort((a, b) => (isAuditActive(b.audited_at) ? 1 : 0) - (isAuditActive(a.audited_at) ? 1 : 0)); break;
            case "AKSI_ASC": list.sort((a, b) => (a.stok_tersedia ?? 0) - (b.stok_tersedia ?? 0)); break;
            case "AKSI_DESC": list.sort((a, b) => (b.stok_tersedia ?? 0) - (a.stok_tersedia ?? 0)); break;
            case "STOK_ASC": list.sort((a, b) => (a.stok_tersedia ?? 0) - (b.stok_tersedia ?? 0)); break;
            case "STOK_DESC": list.sort((a, b) => (b.stok_tersedia ?? 0) - (a.stok_tersedia ?? 0)); break;
            case "SIAP_ASC": list.sort((a, b) => (a.siap_jual ?? 0) - (b.siap_jual ?? 0)); break;
            case "SIAP_DESC": list.sort((a, b) => (b.siap_jual ?? 0) - (a.siap_jual ?? 0)); break;
            case "MINUS_ASC": list.sort((a, b) => (a.stok_minus ?? 0) - (b.stok_minus ?? 0)); break;
            case "MINUS_DESC": list.sort((a, b) => (b.stok_minus ?? 0) - (a.stok_minus ?? 0)); break;
            case "TERJUAL_ASC": list.sort((a, b) => (a.terjual ?? 0) - (b.terjual ?? 0)); break;
            case "TERJUAL_DESC": list.sort((a, b) => (b.terjual ?? 0) - (a.terjual ?? 0)); break;
            case "SN": list.sort((a, b) => a.id.localeCompare(b.id)); break;
        }
        return list;
    }, [laptops, search, filterSN, filterStatus, filterBrand, filterProcessor, filterRam, filterPriceRange, filterStock, filterAudit, sortBy]);

    const uniqueRams = useMemo(() => {
        const r = new Set(laptops.map(x => x.ram).filter(Boolean));
        return ["ALL", ...Array.from(r).sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0))];
    }, [laptops]);

    const uniqueBrands = useMemo(() => {
        const b = new Set(laptops.map(x => x.brand).filter(Boolean));
        return ["ALL", ...Array.from(b)];
    }, [laptops]);

    const openCreate = () => { setFormData({ ...EMPTY_FORM }); setModalMode("create"); };

    const openDetail = async (laptop: Laptop) => {
        setSelectedLaptop(laptop);
        setModalMode("detail");
        setDetailLoading(true);
        try {
            const res = await fetch(`/api/laptops/${laptop.id}`);
            const result = await res.json();
            if (result.data) setSelectedLaptop(result.data);
        } catch { /* use cached */ } finally {
            setDetailLoading(false);
        }
    };

    //  Router aksi klik baris berdasarkan jumlah stok:
    //    stok = 1  → langsung buka Pop-up Detail unit (editable)
    //    stok ≠ 1  → buka Detail Laptop (untuk stok > 1, breakdown via tombol Units)
    const handleRowClick = async (item: Laptop) => {
        const activeUnits = (item.laptop_units || []).filter(u => u.status !== "SOLD");

        if (activeUnits.length !== 1) { openDetail(item); return; }

        setUnitDetailLoading(true);
        try {
            // Detail lengkap (condition_note, notes, dsb) diambil dari endpoint units
            // supaya modal tidak menampilkan field kosong.
            const res = await fetch(`/api/laptops/${item.id}/units`);
            const result = await res.json();
            const full = (result.data || []).find((u: UnitDetailData) => u.id === activeUnits[0].id);
            setUnitDetailFromLaptopDetail(false); //  entry langsung dari baris tabel, bukan dari Detail Laptop
            if (full) setUnitDetail({ unit: full, laptop: item });
            else openDetail(item);
        } catch {
            openDetail(item);
        } finally {
            setUnitDetailLoading(false);
        }
    };

    const openEdit = (laptop: Laptop) => {
        setSelectedLaptop(laptop);
        setFormData({
            laptop_name: laptop.laptop_name || "",
            brand: laptop.brand || "",
            cpu: laptop.cpu || "",
            ram: laptop.ram || "",
            storage: laptop.storage || "",
            gpu: laptop.gpu || "",
            display: laptop.display || "",
            selling_price: String(laptop.selling_price || ""),
            condition_note: laptop.condition_note || "",
            notes: laptop.notes || "",
        });
        setModalMode("edit");
    };

    const closeModal = () => { setModalMode(null); setSelectedLaptop(null); };

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormLoading(true);
        try {
            const res = await fetch("/api/laptops/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...formData, selling_price: Number(formData.selling_price) }),
            });
            const result = await res.json();
            if (!result.success) { showAlert(result.message || "Gagal menambahkan laptop"); return; }
            closeModal(); fetchLaptops(); showAlert("Laptop berhasil ditambahkan");
        } catch {
            showAlert("Terjadi kesalahan saat menyimpan");
        } finally {
            setFormLoading(false);
        }
    };

    const handleEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedLaptop) return;
        setFormLoading(true);
        try {
            const res = await fetch(`/api/laptops/${selectedLaptop.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...formData, selling_price: Number(formData.selling_price) }),
            });
            const result = await res.json();
            if (!result.success) { showAlert(result.message); return; }
            closeModal(); fetchLaptops();
        } catch {
            showAlert("Terjadi kesalahan");
        } finally {
            setFormLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        const laptop = laptops.find(l => l.id === id);
        if (!laptop) return;
        try {
            const res = await fetch(`/api/laptops/${id}/units`);
            const result = await res.json();
            setDeleteConfirmModal({ laptop, unitCount: result.data?.length ?? 0 });
        } catch {
            setDeleteConfirmModal({ laptop, unitCount: laptop.qty ?? 0 });
        }
    };

    // ─── Export Excel ─────────────────────────────────────────────────────────
    //  Export disesuaikan dengan filterStatus yang aktif:
    //    - ALL        → tampilkan semua kolom (Stock Total, Siap Jual, Minus)
    //    - SIAP_JUAL  → hanya kolom "Siap Jual", data hanya unit SIAP_JUAL
    //    - BELUM_SIAP → hanya kolom "Minus", data hanya unit SERVICE/BELUM_SIAP
    //  Export dipindah ke lib/inventoryExport.ts supaya kolomnya selalu
    //  sinkron dengan tabel di layar, dan bisa dipakai ulang di halaman lain.
    const exportToExcel = async () => {
        const filterLabel = [
            filterStatus !== "ALL" && (filterStatus === "SIAP_JUAL" ? "Siap Jual" : "Minus"),
            filterBrand !== "ALL" && `Brand ${filterBrand}`,
            filterRam !== "ALL" && `RAM ${filterRam}`,
            search.trim() && `Cari "${search.trim()}"`,
        ].filter(Boolean).join(" · ");

        await exportInventoryExcel({
            laptops: filteredLaptops,
            canSeePrivate: canSeePrivateBarang,
            filterLabel: filterLabel ? `Filter: ${filterLabel}` : "Tanpa filter",
            fileSuffix: filterStatus === "SIAP_JUAL" ? "_siap_jual"
                : filterStatus === "BELUM_SIAP" ? "_minus" : "",
        });
    };

    //  Mapping model laptop → baris tabel (layout papan tulis).
    //  Kolom per-unit (Harga Modal / Sumber / Tgl Masuk / SN) hanya punya nilai
    //  tunggal kalau stok = 1. Kalau >1, diisi ringkasan abu-abu + arahkan ke Units.
   const tableRows: InventoryRow[] = useMemo(() => filteredLaptops.map(l => {
        const aktif = (l.laptop_units || []).filter(u => u.status !== "SOLD");
        const one = aktif.length === 1 ? aktif[0] : null;

        // Breakdown "terjual belum lunas" per model, buat tooltip badge.
        const reservedCount = aktif.filter(u => u.status === "RESERVED").length;
        const heldCount = aktif.filter(u => u.status === "HELD").length;
        const packingCount = aktif.filter(u => u.status === "PACKING").length;
        const belumLunasLabel = [
            reservedCount > 0 && `${reservedCount} DP`,
            heldCount > 0 && `${heldCount} Ambil Dulu`,
            packingCount > 0 && `${packingCount} Packing`,
        ].filter(Boolean).join(" · ") || undefined;

        const modals = aktif.map(u => u.purchase_price).filter((n): n is number => n != null && n > 0);
        const min = modals.length ? Math.min(...modals) : 0;
        const max = modals.length ? Math.max(...modals) : 0;
        const jt = (n: number) => (n / 1_000_000).toFixed(1).replace(".", ",");

        //  Modal Sparepart per-unit — 1 unit: nilai pas; >1 unit: rentang min–max
        //  (pakai fmt penuh, bukan "jt", karena nominal sparepart biasanya kecil).
        const spareparts = aktif.map(u => u.sparepart_cost).filter((n): n is number => n != null && n > 0);
        const spMin = spareparts.length ? Math.min(...spareparts) : 0;
        const spMax = spareparts.length ? Math.max(...spareparts) : 0;

        //  Harga Official per-unit — pola sama dengan Modal Sparepart di atas.
        const officials = aktif.map(u => u.official_price).filter((n): n is number => n != null && n > 0);
        const ofMin = officials.length ? Math.min(...officials) : 0;
        const ofMax = officials.length ? Math.max(...officials) : 0;

        //  Gross Profit per-unit = Harga Store - Harga Sparepart - Harga Modal,
        //  dihitung per-unit dulu baru diagregasi biar akurat.
        const grossProfits = aktif.map(u => (u.selling_price || 0) - (u.sparepart_cost || 0) - (u.purchase_price || 0));
        const gpMin = grossProfits.length ? Math.min(...grossProfits) : 0;
        const gpMax = grossProfits.length ? Math.max(...grossProfits) : 0;

        const sumberSet = new Set(aktif.map(u => u.source).filter(Boolean));

        return {
            id: l.id,
            laptop_name: l.laptop_name,
            cpu: l.cpu,
            ram: l.ram,
            storage: l.storage,

            harga_modal: one ? (one.purchase_price ?? 0) : null,
            harga_modal_note: one ? undefined
                : modals.length === 0 ? undefined
                    : min === max ? `Rp ${jt(min)} jt` : `Rp ${jt(min)}–${jt(max)} jt`,

            sparepart_modal: one ? (one.sparepart_cost ?? 0) : null,
            sparepart_note: one ? undefined
                : spareparts.length === 0 ? undefined
                    : spMin === spMax ? fmt(spMin) : `${fmt(spMin)} – ${fmt(spMax)}`,

            harga_jual: l.selling_price,

            official_price: one ? (one.official_price ?? 0) : null,
            official_price_note: one ? undefined
                : officials.length === 0 ? undefined
                    : ofMin === ofMax ? fmt(ofMin) : `${fmt(ofMin)} – ${fmt(ofMax)}`,

            gross_profit: one ? ((one.selling_price || 0) - (one.sparepart_cost || 0) - (one.purchase_price || 0)) : null,
            gross_profit_note: one ? undefined
                : grossProfits.length === 0 ? undefined
                    : gpMin === gpMax ? fmt(gpMin) : `${fmt(gpMin)} – ${fmt(gpMax)}`,

            sumber: one ? (one.source ?? null) : null,
            sumber_note: one ? undefined
                : sumberSet.size === 0 ? undefined
                    : sumberSet.size === 1 ? String([...sumberSet][0]) : `${sumberSet.size} sumber`,

            tanggal_masuk: one ? (one.created_at ?? null) : null,
            tanggal_note: one ? undefined : aktif.length > 1 ? "beragam" : undefined,

            sn: one ? one.serial_number : null,
            sn_note: one ? undefined : aktif.length > 1 ? `${aktif.length} SN` : undefined,

            stok_tersisa: l.stok_tersedia ?? 0,
            siap_jual: l.siap_jual ?? 0,
            minus: l.stok_minus ?? 0,
            is_audited: isAuditActive(l.audited_at),
            audited_at: l.audited_at ?? null,
            is_so_active: isSoActive(l.so_at),
            so_at: l.so_at ?? null,
            belum_lunas: l.belum_lunas ?? 0,
            belum_lunas_label: belumLunasLabel,
        };
    }), [filteredLaptops]);

    const totalSisa = filteredLaptops.reduce((s, l) => s + (l.stok_tersedia ?? 0), 0);
    const totalSiapJual = filteredLaptops.reduce((s, l) => s + (l.siap_jual ?? 0), 0);
    const totalMinus = filteredLaptops.reduce((s, l) => s + (l.stok_minus ?? 0), 0);

    //  Total Keseluruhan (grand total) untuk 4 kolom finansial di tabel:
    //  Modal Laptop, Modal Sparepart, Harga Jual, dan Total Jual — dijumlah dari
    //  filteredLaptops yang sedang tampil (ikut filter aktif), bukan dari seluruh data.
    const totalModalLaptop = filteredLaptops.reduce((sum, l) => {
        const aktif = (l.laptop_units || []).filter(u => u.status !== "SOLD");
        return sum + aktif.reduce((s, u) => s + (u.purchase_price ?? 0), 0);
    }, 0);
    const totalModalSparepart = filteredLaptops.reduce((sum, l) => {
        const aktif = (l.laptop_units || []).filter(u => u.status !== "SOLD");
        return sum + aktif.reduce((s, u) => s + (u.sparepart_cost ?? 0), 0);
    }, 0);
    const totalHargaJual = filteredLaptops.reduce((s, l) => s + (l.selling_price || 0), 0);
    const totalNilaiJual = filteredLaptops.reduce((s, l) => s + (l.selling_price || 0) * (l.stok_tersedia ?? 0), 0);
    const totalGrossProfit = filteredLaptops.reduce((sum, l) => {
        const aktif = (l.laptop_units || []).filter(u => u.status !== "SOLD");
        return sum + aktif.reduce((s, u) => s + ((u.selling_price || 0) - (u.sparepart_cost || 0) - (u.purchase_price || 0)), 0);
    }, 0);

    return (
        <>
            <style>{`
                @keyframes sk-shimmer {
                    0%   { background-position: -600px 0; }
                    100% { background-position:  600px 0; }
                }
                @keyframes fadeIn  { from { opacity: 0; } to { opacity: 1; } }
                @keyframes popIn   { from { opacity: 0; transform: scale(0.94) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
                @keyframes slideDown { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes slideUp   { from { opacity: 0; transform: translateY(16px);  } to { opacity: 1; transform: translateY(0); } }
                .animate-fadeIn    { animation: fadeIn    0.2s  ease-out; }
                .animate-popIn     { animation: popIn     0.25s cubic-bezier(0.34,1.56,0.64,1); }
                .animate-slideDown { animation: slideDown 0.3s  ease-out; }
                .animate-slideUp   { animation: slideUp   0.3s  ease-out; }
                .table-scroll { scrollbar-width: thin; scrollbar-color: #d1d5db #f9fafb; }
                .table-scroll::-webkit-scrollbar        { height: 6px; width: 6px; }
                .table-scroll::-webkit-scrollbar-track  { background: #f9fafb; border-radius: 99px; }
                .table-scroll::-webkit-scrollbar-thumb  { background: #d1d5db; border-radius: 99px; }
                .table-scroll::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
                .data-row { transition: background-color 0.15s ease; }
                .data-row:hover { background-color: #f8fafc; }
                .data-row:hover td:first-child { border-left: 3px solid #374151; }
                .filter-select {
                    appearance: none;
                    background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e");
                    background-position: right 10px center;
                    background-repeat: no-repeat;
                    background-size: 16px;
                    padding-right: 32px !important;
                }
    `}</style>

            <main className="min-h-screen bg-[#F7F7F8] p-4 sm:p-6 lg:p-8">
                <div className="max-w-full mx-auto space-y-5">

                    {/* ── HEADER ───────────────────────────────────────── */}
                    <div className="flex flex-wrap items-center justify-between gap-4 animate-slideDown">
                        <div className="flex items-center gap-3.5">
                            <div className="w-10 h-10 bg-gray-800 rounded-2xl flex items-center justify-center shadow-lg shadow-gray-800/25 flex-shrink-0">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                    <rect x="2" y="3" width="20" height="14" rx="2" />
                                    <line x1="8" y1="21" x2="16" y2="21" />
                                    <line x1="12" y1="17" x2="12" y2="21" />
                                </svg>
                            </div>
                            <div>
                                <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none">Data Laptop</h1>
                                <p className="text-xs text-gray-400 mt-0.5 font-medium">Kelola inventaris laptop Solit 03</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {canExport && (
                                <button onClick={exportToExcel}
                                    className="inline-flex items-center gap-2 h-9 px-4 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm active:scale-[0.97] transition-all duration-150">
                                    <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                    Export Excel
                                </button>
                            )}
                            {canCreateLaptop && (
                                <button onClick={openCreate}
                                    className="inline-flex items-center gap-2 h-9 px-4 bg-gray-800 rounded-xl text-sm font-semibold text-white hover:bg-gray-900 active:scale-[0.97] transition-all duration-150 shadow-lg shadow-gray-800/25">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                                    </svg>
                                    Tambah Laptop
                                </button>
                            )}
                        </div>
                    </div>

                    {/* ── STAT CARDS ───────────────────────────────────── */}
                    <div className={`grid gap-3 animate-slideDown ${canViewTotalStok ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1"}`}>
                        {canViewTotalStok && (
                            <StatCard label="Stok Tersisa" value={`${totalSisa} unit`} accent="bg-gray-700"
                                icon={<svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
                            />
                        )}
                        <StatCard label="Siap Jual" value={`${totalSiapJual} unit`} accent="bg-green-500"
                            icon={<svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                        />
                        {canViewTotalStok && (
                            <StatCard label="Minus" value={`${totalMinus} unit`} accent="bg-red-500"
                                icon={<svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>}
                            />
                        )}
                    </div>

                    {/* ── FILTER PANEL ─────────────────────────────────── */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3.5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                            <SearchInput placeholder="Cari nama, brand, CPU..." value={search} onChange={e => setSearch(e.target.value)} icon="search" />
                            <SearchInput placeholder="Cari Serial Number..." value={filterSN} onChange={e => setFilterSN(e.target.value)} icon="sn" />
                            <FilterSelect value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                                <option value="ALL">Semua Status</option>
                                <option value="SIAP_JUAL">Siap Jual</option>
                                <option value="BELUM_SIAP">Minus</option>
                            </FilterSelect>
                            <FilterSelect value={filterBrand} onChange={e => setFilterBrand(e.target.value)}>
                                {uniqueBrands.map(b => <option key={b} value={b}>{b === "ALL" ? "Semua Brand" : b}</option>)}
                            </FilterSelect>
                            <button
                                onClick={() => { setSearch(""); setFilterSN(""); setFilterStatus("ALL"); setFilterBrand("ALL"); setFilterProcessor("ALL"); setFilterRam("ALL"); setFilterPriceRange("ALL"); setFilterStock("TERSEDIA"); setFilterAudit(""); setSortBy("DEFAULT"); }}
                                className="h-9 bg-gray-100 text-gray-600 rounded-xl px-3 text-sm font-medium hover:bg-gray-200 active:scale-[0.97] transition-all duration-150 flex items-center justify-center gap-1.5"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Reset
                            </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                            <FilterSelect value={filterRam} onChange={e => setFilterRam(e.target.value)}>
                                {uniqueRams.map(r => <option key={r} value={r}>{r === "ALL" ? "Semua RAM" : `RAM ${r}`}</option>)}
                            </FilterSelect>
                            <FilterSelect value={filterPriceRange} onChange={e => setFilterPriceRange(e.target.value)}>
                                <option value="ALL">Semua Harga</option>
                                <option value="1-2">Rp 1 jt – 2 jt</option>
                                <option value="2-3">Rp 2 jt – 3 jt</option>
                                <option value="3-4">Rp 3 jt – 4 jt</option>
                                <option value="4+">Rp 4 jt ke atas</option>
                            </FilterSelect>

                            <FilterSelect value={sortBy} onChange={e => setSortBy(e.target.value)}>
                                <option value="DEFAULT">Urutan Default</option>
                                <option value="AZ">Nama: A → Z</option>
                                <option value="ZA">Nama: Z → A</option>
                                <option value="PRICE_ASC">Harga Jual: Rendah → Tinggi</option>
                                <option value="PRICE_DESC">Harga Jual: Tinggi → Rendah</option>
                                {canSeePrivateBarang && <option value="MODAL_ASC">Modal Laptop: Rendah → Tinggi</option>}
                                {canSeePrivateBarang && <option value="MODAL_DESC">Modal Laptop: Tinggi → Rendah</option>}
                                {canSeePrivateBarang && <option value="SPAREPART_ASC">Modal Sparepart: Rendah → Tinggi</option>}
                                {canSeePrivateBarang && <option value="SPAREPART_DESC">Modal Sparepart: Tinggi → Rendah</option>}
                                <option value="TOTAL_JUAL_ASC">Total Jual: Rendah → Tinggi</option>
                                <option value="TOTAL_JUAL_DESC">Total Jual: Tinggi → Rendah</option>
                                {canSeePrivateBarang && <option value="SUMBER_ASC">Sumber: A → Z</option>}
                                {canSeePrivateBarang && <option value="SUMBER_DESC">Sumber: Z → A</option>}
                                {canSeePrivateBarang && <option value="TANGGAL_ASC">Tanggal Masuk: Lama → Baru</option>}
                                {canSeePrivateBarang && <option value="TANGGAL_DESC">Tanggal Masuk: Baru → Lama</option>}
                                {canSeePrivateBarang && <option value="AUDIT_DESC">Audit: Sudah Diaudit Dulu</option>}
                                {canSeePrivateBarang && <option value="AUDIT_ASC">Audit: Belum Diaudit Dulu</option>}
                                <option value="AKSI_DESC">Aksi/Stok: Banyak Dulu</option>
                                <option value="AKSI_ASC">Aksi/Stok: Sedikit Dulu</option>
                                <option value="SN">Urut SN</option>
                            </FilterSelect>

                            {canSeePrivateBarang && (
                                <FilterSelect value={filterAudit} onChange={e => setFilterAudit(e.target.value as typeof filterAudit)}>
                                    <option value="">Semua Audit</option>
                                    <option value="audited">Sudah Diaudit</option>
                                    <option value="unaudited">Belum Diaudit</option>
                                </FilterSelect>
                            )}
                        </div>

                        {(filterProcessor !== "ALL" || filterRam !== "ALL" || filterPriceRange !== "ALL" || filterStock !== "TERSEDIA" || filterAudit !== "" || sortBy !== "DEFAULT") && (
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                                {filterProcessor !== "ALL" && <FilterChip label={filterProcessor} onRemove={() => setFilterProcessor("ALL")} />}
                                {filterRam !== "ALL" && <FilterChip label={`RAM ${filterRam}`} onRemove={() => setFilterRam("ALL")} />}
                                {filterPriceRange !== "ALL" && <FilterChip label={filterPriceRange === "4+" ? "≥ Rp 4 jt" : `Rp ${filterPriceRange} jt`} onRemove={() => setFilterPriceRange("ALL")} />}
                                {filterStock !== "TERSEDIA" && <FilterChip label={filterStock === "ALL" ? "Semua Stok" : "Stok Habis"} onRemove={() => setFilterStock("TERSEDIA")} />}
                                {filterAudit !== "" && <FilterChip label={filterAudit === "audited" ? "Sudah Diaudit" : "Belum Diaudit"} onRemove={() => setFilterAudit("")} />}
                                {sortBy !== "DEFAULT" && <FilterChip label={`Sort: ${SORT_LABELS[sortBy] ?? sortBy}`} onRemove={() => setSortBy("DEFAULT")} />}
                            </div>
                        )}
                    </div>

                    {/* ── TABLE ────────────────────────────────────────── */}
                    {isLoading ? (
                        <SkeletonTable />
                    ) : filteredLaptops.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-24 text-center animate-fadeIn">
                            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <p className="text-gray-700 font-bold text-base">Tidak ada laptop ditemukan</p>
                            <p className="text-gray-400 text-sm mt-1.5">Coba ubah filter atau tambah laptop baru</p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-slideUp">

                            {/* ── TOTAL KESELURUHAN — nempel langsung di atas tabel ── */}
                            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex flex-wrap items-center gap-3">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">
                                    Total Keseluruhan
                                </span>
                                <div className="flex flex-wrap items-center gap-2">
                                    {canSeePrivateBarang && (
                                        <>
                                            <TotalPill label="Modal Laptop" value={fmt(totalModalLaptop)} color="text-gray-800" />
                                            <TotalPill label="Modal Sparepart" value={fmt(totalModalSparepart)} color="text-gray-800" />
                                            <TotalPill label="Gross Profit" value={fmt(totalGrossProfit)} color={totalGrossProfit >= 0 ? "text-emerald-700" : "text-red-600"} />
                                        </>
                                    )}
                                    <TotalPill label="Harga Store" value={fmt(totalHargaJual)} color="text-gray-800" />
                                    <TotalPill label="Total Jual" value={fmt(totalNilaiJual)} color="text-emerald-700" />
                                </div>
                            </div>

                            {/*  Tabel reusable — struktur kolom sama persis dengan halaman Units:
                                No | Nama Laptop | CPU | RAM | Storage | Harga Modal | Harga Jual |
                                Sumber | Tanggal Masuk | SN | ST | SJ | M | Aksi              */}
                            <InventoryTable
                                rows={tableRows}
                                canSeePrivate={canSeePrivateBarang}
                                canSeeStock={canViewTotalStok}
                                showSparepart
                                showTotalJual
                                sortBy={sortBy}
                                onSort={handleSort}
                                onRowClick={(row) => {
                                    const l = filteredLaptops.find(x => x.id === row.id);
                                    if (l) handleRowClick(l);
                                }}
                                renderAudit={canSeePrivateBarang ? (row) => {
                                    const l = filteredLaptops.find(x => x.id === row.id);
                                    if (!l) return null;
                                    return (
                                        <div className="flex items-center justify-center gap-1">
                                            <AuditButton
                                                active={isAuditActive(l.audited_at)}
                                                loading={auditingId === l.id}
                                                auditedBy={l.audited_by}
                                                auditedAt={l.audited_at}
                                                onClick={() => toggleAudit(l.id)}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setHistoryTarget({ id: l.id, name: l.laptop_name })}
                                                title="Lihat riwayat audit"
                                                className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </button>
                                        </div>
                                    );
                                } : undefined}
                                renderSo={canManageSo ? (row) => {
                                    const l = filteredLaptops.find(x => x.id === row.id);
                                    if (!l) return null;
                                    return (
                                        <div className="flex items-center justify-center gap-1">
                                            <SoButton
                                                active={isSoActive(l.so_at)}
                                                loading={soingId === l.id}
                                                soBy={l.so_by}
                                                soAt={l.so_at}
                                                onClick={() => toggleSo(l.id)}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setSoHistoryTarget({ id: l.id, name: l.laptop_name })}
                                                title="Lihat riwayat SO"
                                                className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </button>
                                        </div>
                                    );
                                } : undefined}
                                renderActions={(row) => {
                                    const l = filteredLaptops.find(x => x.id === row.id);
                                    if (!l) return null;
                                    return (
                                        <>
                                            {canViewBarcode && (
                                                <button onClick={() => setBarcodeTarget({ id: l.id, name: l.laptop_name })}
                                                    className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all duration-150"
                                                    title="Lihat Barcode">
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 9V6a1 1 0 011-1h2M3 15v3a1 1 0 001 1h2m13-13h2a1 1 0 011 1v3m0 6v3a1 1 0 01-1 1h-2M9 5v14M12 5v14M15 5v14" />
                                                    </svg>
                                                </button>
                                            )}
                                            {/*  Stok > 1 → arahkan ke halaman Units untuk kelola banyak SN sekaligus.
                                                Stok = 1 → TIDAK diarahkan ke halaman Units sama sekali. Klik baris
                                                membuka Pop-up Detail, dan "Tambah Unit" untuk kasus ini sudah ada
                                                LANGSUNG di dalam pop-up itu (lihat UnitDetailModal → tombol
                                                "+ Tambah Unit", buka form tambah unit tanpa pindah halaman). */}
                                            {canViewUnits && row.stok_tersisa > 1 && (
                                                <Link href={`/dashboard/laptops/${l.id}/units`}
                                                    className="h-7 px-2.5 text-[11px] font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-all duration-150 flex items-center gap-1">
                                                    Units
                                                    <span className="text-[10px] font-bold text-gray-400 tabular-nums">{row.stok_tersisa}</span>
                                                </Link>
                                            )}
                                            {row.stok_tersisa === 1 && (
                                                <span className="h-7 px-2.5 text-[11px] font-semibold text-gray-400 bg-gray-50 border border-gray-100 rounded-lg flex items-center">
                                                    Detail
                                                </span>
                                            )}
                                        </>
                                    );
                                }}
                            />

                            {/* Table Footer */}
                            <div className="px-5 py-3.5 border-t border-gray-100 bg-gray-50/60 flex flex-wrap items-center justify-between gap-3">
                                <p className="text-xs text-gray-400 font-medium">
                                    <span className="text-gray-700 font-bold">{filteredLaptops.length}</span> laptop
                                    {laptops.length !== filteredLaptops.length && (
                                        <span className="text-gray-400 ml-1">dari {laptops.length}</span>
                                    )}
                                </p>
                                <div className="flex items-center gap-2 flex-wrap">
                                    {canViewTotalStok && <FooterStat label="Stok Tersisa" value={totalSisa} dot="bg-gray-400" color="text-gray-800" />}
                                    <FooterStat label="Siap Jual" value={totalSiapJual} dot="bg-green-500" color="text-green-700" />
                                    {canViewTotalStok && (
                                        <FooterStat label="Minus" value={totalMinus} dot="bg-red-500" color="text-red-500" />
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* ── MODALS ───────────────────────────────────────────── */}

            {/* Create Modal */}
            <Modal open={modalMode === "create"} onClose={closeModal} title="Tambah Laptop Baru" size="lg">
                <form onSubmit={handleCreate} className="space-y-5">
                    <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl p-3.5">
                        <svg className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-xs text-blue-700 leading-relaxed">
                            Setiap unit laptop memiliki SN, grade, sumber, dan harga modal sendiri.
                            Data unit ditambahkan setelah laptop berhasil dibuat.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField label="Nama Laptop" required>
                            <input name="laptop_name" placeholder="Contoh: MacBook Air M2 2023" value={formData.laptop_name} onChange={handleFormChange} required className={inputCls} />
                        </FormField>
                        <FormField label="Brand">
                            <input name="brand" placeholder="Apple, Lenovo, Dell, ASUS..." value={formData.brand} onChange={handleFormChange} className={inputCls} />
                        </FormField>
                        <FormField label="CPU / Processor">
                            <input name="cpu" placeholder="Intel Core i7-13700H, Apple M2..." value={formData.cpu} onChange={handleFormChange} className={inputCls} />
                        </FormField>
                        <FormField label="RAM">
                            <input name="ram" placeholder="8GB, 16GB, 32GB" value={formData.ram} onChange={handleFormChange} className={inputCls} />
                        </FormField>
                        <FormField label="Storage">
                            <input name="storage" placeholder="256GB SSD, 512GB NVMe" value={formData.storage} onChange={handleFormChange} className={inputCls} />
                        </FormField>
                        <FormField label="GPU / VGA">
                            <input name="gpu" placeholder="NVIDIA RTX 4060, Intel Iris Xe" value={formData.gpu} onChange={handleFormChange} className={inputCls} />
                        </FormField>
                        <FormField label="Display / Layar">
                            <input name="display" placeholder='14" FHD IPS, 120Hz' value={formData.display} onChange={handleFormChange} className={inputCls} />
                        </FormField>
                        <FormField label="Harga Store" required>
                            <input name="selling_price" type="number" placeholder="0" value={formData.selling_price} onChange={handleFormChange} required className={inputCls} />
                        </FormField>
                    </div>
                    <FormField label="Kondisi Umum">
                        <input name="condition_note" placeholder="Mulus, bekas pemakaian normal, ada goresan tipis..." value={formData.condition_note} onChange={handleFormChange} className={inputCls} />
                    </FormField>
                    <FormField label="Catatan Tambahan">
                        <textarea name="notes" placeholder="Informasi tambahan tentang laptop ini..." value={formData.notes} onChange={handleFormChange} rows={3} className={textareaCls} />
                    </FormField>
                    <ModalActions onCancel={closeModal} loading={formLoading} submitLabel="Buat Laptop" />
                </form>
            </Modal>

            {/* Edit Modal */}
            <Modal open={modalMode === "edit"} onClose={closeModal} title="Edit Laptop" size="lg">
                <form onSubmit={handleEdit} className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField label="Nama Laptop" required>
                            <input name="laptop_name" value={formData.laptop_name} onChange={handleFormChange} required className={inputCls} />
                        </FormField>
                        <FormField label="Brand">
                            <input name="brand" value={formData.brand} onChange={handleFormChange} className={inputCls} />
                        </FormField>
                        <FormField label="CPU / Processor">
                            <input name="cpu" value={formData.cpu} onChange={handleFormChange} className={inputCls} />
                        </FormField>
                        <FormField label="RAM">
                            <input name="ram" value={formData.ram} onChange={handleFormChange} className={inputCls} />
                        </FormField>
                        <FormField label="Storage">
                            <input name="storage" value={formData.storage} onChange={handleFormChange} className={inputCls} />
                        </FormField>
                        <FormField label="GPU / VGA">
                            <input name="gpu" value={formData.gpu} onChange={handleFormChange} className={inputCls} />
                        </FormField>
                        <FormField label="Display / Layar">
                            <input name="display" value={formData.display} onChange={handleFormChange} className={inputCls} />
                        </FormField>
                        <FormField label="Harga Store" required>
                            <input name="selling_price" type="number" value={formData.selling_price} onChange={handleFormChange} required className={inputCls} />
                        </FormField>
                    </div>
                    <FormField label="Kondisi Umum">
                        <input name="condition_note" value={formData.condition_note} onChange={handleFormChange} className={inputCls} />
                    </FormField>
                    <FormField label="Catatan Tambahan">
                        <textarea name="notes" value={formData.notes} onChange={handleFormChange} rows={3} className={textareaCls} />
                    </FormField>
                    <ModalActions onCancel={closeModal} loading={formLoading} submitLabel="Simpan Perubahan" />
                </form>
            </Modal>

            {/* Detail Modal — dipakai saat stok ≠ 1 (0 atau >1) */}
            <Modal open={modalMode === "detail"} onClose={closeModal} title="Detail Laptop" size="lg">
                {detailLoading ? (
                    <ModalDetailSkeleton />
                ) : selectedLaptop ? (
                    <div className="space-y-5">
                        <div className="flex flex-col sm:flex-row gap-4 p-5 bg-gray-50 rounded-2xl border border-gray-100">
                            <div className="w-14 h-14 rounded-2xl bg-white border border-gray-200 shadow-sm flex items-center justify-center text-3xl flex-shrink-0"><Laptop size={30} className="text-gray-700" /></div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-black text-gray-900 text-lg tracking-tight leading-snug">{selectedLaptop.laptop_name}</h3>
                                <p className="text-sm text-gray-400 mt-0.5 font-medium">{selectedLaptop.brand || "—"}</p>
                                <div className="flex flex-wrap gap-2 mt-3">
                                    {(() => {
                                        const s = STATUS_STYLE[selectedLaptop.status]; return s ? (
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${s.badge}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />{s.label}
                                            </span>
                                        ) : null;
                                    })()}
                                    {selectedLaptop.ready_to_sell && (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                                            Ready to Sell
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="sm:text-right flex-shrink-0">
                                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Harga Store</p>
                                <p className="text-2xl font-black text-gray-900 mt-0.5 tabular-nums">{fmt(selectedLaptop.selling_price)}</p>
                                <p className="text-xs text-gray-400 mt-1.5">Stok:{" "}
                                    <span className={`font-bold ${(selectedLaptop.qty ?? 0) === 0 ? "text-red-500" : "text-gray-700"}`}>{selectedLaptop.qty ?? 0}</span>
                                </p>
                            </div>
                        </div>

                        <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Spesifikasi Teknis</p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                                {[
                                    { label: "CPU", value: selectedLaptop.cpu },
                                    { label: "RAM", value: selectedLaptop.ram },
                                    { label: "Storage", value: selectedLaptop.storage },
                                    { label: "GPU", value: selectedLaptop.gpu },
                                    { label: "Display", value: selectedLaptop.display },
                                ].map(({ label, value }) => (
                                    <div key={label} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{label}</p>
                                        <p className="text-sm font-semibold text-gray-800 break-all leading-tight">
                                            {value || <span className="text-gray-300 font-normal">—</span>}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/*  Daftar unit langsung di dalam pop-up — sebelumnya modal ini
                            hanya menampilkan spesifikasi model, jadi terlihat kosong. */}
                        <LaptopUnitsPreview
                            laptopId={selectedLaptop.id}
                            canSeePrivate={canSeePrivateBarang}
                            onSelectUnit={(u: PreviewUnit) => {
                                const l = selectedLaptop;
                                setModalMode(null); //  sembunyikan modal Detail tanpa reset selectedLaptop, biar tombol "Kembali" bisa buka lagi
                                setUnitDetailFromLaptopDetail(true);
                                setTimeout(() => setUnitDetail({ unit: u as UnitDetailData, laptop: l }), 60);
                            }}
                        />

                        {(selectedLaptop.condition_note || selectedLaptop.notes) && (
                            <div className="space-y-2.5">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Catatan</p>
                                {selectedLaptop.condition_note && (
                                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-3.5">
                                        <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-1">Kondisi Umum</p>
                                        <p className="text-sm text-amber-900">{selectedLaptop.condition_note}</p>
                                    </div>
                                )}
                                {selectedLaptop.notes && (
                                    <div className="bg-gray-50 border border-gray-100 rounded-xl p-3.5">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Catatan Tambahan</p>
                                        <p className="text-sm text-gray-700">{selectedLaptop.notes}</p>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                            <p className="text-xs text-gray-400">
                                {new Date(selectedLaptop.created_at).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}
                            </p>
                            <div className="flex gap-2">
                                {canViewUnits && (
                                    <Link href={`/dashboard/laptops/${selectedLaptop.id}/units`}
                                        className="h-9 px-4 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 active:scale-[0.97] transition-all duration-150 flex items-center">
                                        Lihat Units
                                    </Link>
                                )}
                                {canEditLaptop && (
                                    <>
                                        <button onClick={() => { closeModal(); setTimeout(() => openEdit(selectedLaptop!), 60); }}
                                            className="h-9 px-4 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 active:scale-[0.97] transition-all duration-150">
                                            Edit
                                        </button>
                                        <button onClick={() => handleDelete(selectedLaptop.id)}
                                            className="h-9 px-4 text-sm font-semibold text-red-500 bg-red-50 rounded-xl hover:bg-red-100 active:scale-[0.97] transition-all duration-150">
                                            Hapus
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                ) : null}
            </Modal>

            {/*  Loader singkat saat menarik detail unit (stok = 1) */}
            {unitDetailLoading && (
                <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
                    <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin" />
                </div>
            )}

            {/*  Pop-up Detail unit — stok = 1 */}
            {unitDetail && (
                <UnitDetailModal
                    unit={unitDetail.unit}
                    laptopName={unitDetail.laptop.laptop_name}
                    laptopMeta={[unitDetail.laptop.brand, unitDetail.laptop.cpu, unitDetail.laptop.ram, unitDetail.laptop.storage].filter(Boolean).join(" · ")}
                    laptopSpecs={[
                        { label: "Brand", value: unitDetail.laptop.brand },
                        { label: "CPU", value: unitDetail.laptop.cpu },
                        { label: "RAM", value: unitDetail.laptop.ram },
                        { label: "Storage", value: unitDetail.laptop.storage },
                        { label: "GPU", value: unitDetail.laptop.gpu },
                        { label: "Display", value: unitDetail.laptop.display },
                    ]} canEdit={canFullAccessBarang}
                    canSeePrivate={canSeePrivateBarang}
                    defaultSellingPrice={unitDetail.laptop.selling_price}
                    onClose={() => { setUnitDetail(null); setUnitDetailFromLaptopDetail(false); }}
                    onSaved={() => { setUnitDetail(null); setUnitDetailFromLaptopDetail(false); fetchLaptops(); }}
                    onCreated={() => { setUnitDetail(null); setUnitDetailFromLaptopDetail(false); fetchLaptops(); }}
                    onEditLaptop={() => { const l = unitDetail.laptop; setUnitDetail(null); setUnitDetailFromLaptopDetail(false); setTimeout(() => openEdit(l), 60); }}
                    onBack={unitDetailFromLaptopDetail ? () => {
                        const l = unitDetail.laptop;
                        setUnitDetail(null);
                        setUnitDetailFromLaptopDetail(false);
                        setTimeout(() => { setSelectedLaptop(l); setModalMode("detail"); }, 60);
                    } : undefined}
                />
            )}

            {barcodeTarget && (
                <BarcodeModal laptopId={barcodeTarget.id} laptopName={barcodeTarget.name} onClose={() => setBarcodeTarget(null)} />
            )}
            {alertModal && <AlertModal message={alertModal} onClose={() => setAlertModal(null)} />}
            {confirmModal && (
                <ConfirmModal message={confirmModal.message} onConfirm={confirmModal.onConfirm} onCancel={() => setConfirmModal(null)} />
            )}
            {historyTarget && (
                <AuditHistoryModal
                    laptopId={historyTarget.id}
                    laptopName={historyTarget.name}
                    onClose={() => setHistoryTarget(null)}
                />
            )}
            {soHistoryTarget && (
                <SoHistoryModal
                    laptopId={soHistoryTarget.id}
                    laptopName={soHistoryTarget.name}
                    onClose={() => setSoHistoryTarget(null)}
                />
            )}
            {deleteConfirmModal && (
                <DeleteConfirmModal
                    laptop={deleteConfirmModal.laptop}
                    unitCount={deleteConfirmModal.unitCount}
                    onCancel={() => setDeleteConfirmModal(null)}
                    onConfirm={async () => {
                        const id = deleteConfirmModal.laptop.id;
                        setDeleteConfirmModal(null);
                        try {
                            const res = await fetch(`/api/laptops/${id}`, { method: "DELETE" });
                            const result = await res.json();
                            if (!result.success) { showAlert(`Gagal menghapus: ${result.message || "Terjadi kesalahan"}`); return; }
                            if (modalMode === "detail") closeModal();
                            fetchLaptops();
                            showAlert("Laptop berhasil dihapus");
                        } catch {
                            showAlert("Gagal menghapus laptop. Periksa koneksi dan coba lagi.");
                        }
                    }}
                />
            )}
        </>
    );
}

// Default export removed — page wrapper lives in page.tsx

// ═══════════════════════════════════════════════════════
// SHARED STYLE CONSTANTS
// ═══════════════════════════════════════════════════════
const inputCls = "w-full h-11 border border-gray-200 rounded-xl px-3.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400/20 focus:border-gray-400 focus:bg-white transition-all duration-150";
const textareaCls = "w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400/20 focus:border-gray-400 focus:bg-white transition-all duration-150 resize-none";

// ═══════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════

function StatCard({ label, value, accent, icon }: { label: string; value: string; accent: string; icon: React.ReactNode }) {
    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3.5 hover:shadow-md transition-all duration-200">
            <div className={`w-1 h-10 rounded-full ${accent} flex-shrink-0`} />
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <div className="w-8 h-8 bg-gray-50 rounded-xl flex items-center justify-center flex-shrink-0 border border-gray-100">{icon}</div>
                <div className="min-w-0">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest truncate">{label}</p>
                    <p className="text-sm font-black text-gray-800 tabular-nums truncate">{value}</p>
                </div>
            </div>
        </div>
    );
}

function SearchInput({ placeholder, value, onChange, icon }: {
    placeholder: string; value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; icon: "search" | "sn";
}) {
    return (
        <div className="relative group">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-gray-600 transition-colors duration-150">
                {icon === "search" ? (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                    </svg>
                ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                )}
            </div>
            <input type="text" placeholder={placeholder} value={value} onChange={onChange}
                className="w-full h-9 pl-8 pr-3 border border-gray-200 rounded-xl text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400/20 focus:border-gray-400 focus:bg-white transition-all duration-150 font-medium placeholder:text-gray-400 placeholder:font-normal" />
        </div>
    );
}

function FilterSelect({ value, onChange, children }: {
    value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; children: React.ReactNode;
}) {
    return (
        <select value={value} onChange={onChange}
            className="filter-select h-9 border border-gray-200 rounded-xl px-3 text-xs bg-gray-50 text-gray-700 font-medium focus:outline-none focus:ring-2 focus:ring-gray-400/20 focus:border-gray-400 focus:bg-white transition-all duration-150 cursor-pointer hover:bg-gray-100">
            {children}
        </select>
    );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
    return (
        <span className="inline-flex items-center gap-1.5 h-6 px-2.5 bg-gray-800 text-white text-[10px] font-semibold rounded-lg">
            {label}
            <button onClick={onRemove} className="hover:text-gray-300 transition-colors ml-0.5">
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </span>
    );
}

function FooterStat({ label, value, dot, color }: { label: string; value: number; dot: string; color: string }) {
    return (
        <div className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-xl pl-2.5 pr-3 py-1.5 shadow-sm">
            <span className={`w-1.5 h-1.5 rounded-full ${dot} flex-shrink-0`} />
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">{label}</span>
            <span className={`text-sm font-black tabular-nums ${color}`}>{value}</span>
            <span className="text-[10px] font-medium text-gray-300">unit</span>
        </div>
    );
}

//  Pill nominal Rupiah untuk baris "Total Keseluruhan" di atas tabel Data Barang.
function TotalPill({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <div className="inline-flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl pl-2.5 pr-3 py-1.5">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">{label}</span>
            <span className={`text-sm font-black tabular-nums ${color}`}>{value}</span>
        </div>
    );
}

//  Tombol Audit per baris Data Barang.
//  Hijau = sudah diaudit & masih dalam masa berlaku; abu = belum / sudah auto-reset.
//  Tooltip menampilkan siapa yang audit (history).
function AuditButton({ active, loading, auditedBy, auditedAt, onClick }: {
    active: boolean; loading: boolean;
    auditedBy?: string | null; auditedAt?: string | null;
    onClick: () => void;
}) {
    const expiredButOnceAudited = !active && !!auditedAt;

    const title = active
        ? `Diaudit oleh ${auditedBy ?? "—"}${auditedAt ? " · " + new Date(auditedAt).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}\nKlik untuk batalkan audit`
        : expiredButOnceAudited
            ? `Terakhir diaudit oleh ${auditedBy ?? "—"} · ${new Date(auditedAt as string).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} (sudah lewat ${AUDIT_TTL_DAYS} hari)\nKlik untuk tandai sudah diaudit lagi`
            : "Klik untuk tandai sudah diaudit";

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={loading}
            title={title}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition
                ${loading ? "opacity-50 cursor-wait" : "cursor-pointer active:scale-95"}
                ${active
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                    : expiredButOnceAudited
                        ? "bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100"
                        : "bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100 hover:text-gray-600"}`}
        >
            {active ? (
                <>
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Teraudit
                </>
            ) : (
                <>
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10" />
                    </svg>
                    {expiredButOnceAudited ? "Audit Ulang" : "Audit"}
                </>
            )}
        </button>
    );
}

//  Tombol SO (Stock Opname) — independen dari Audit. Biru = baru di-SO &
//  masih dalam masa berlaku (1 hari); abu = belum / sudah auto-reset.
function SoButton({ active, loading, soBy, soAt, onClick }: {
    active: boolean; loading: boolean;
    soBy?: string | null; soAt?: string | null;
    onClick: () => void;
}) {
    const expiredButOnceSo = !active && !!soAt;

    const title = active
        ? `SO oleh ${soBy ?? "—"}${soAt ? " · " + new Date(soAt).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}\nKlik untuk batalkan SO`
        : expiredButOnceSo
            ? `Terakhir SO oleh ${soBy ?? "—"} · ${new Date(soAt as string).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} (sudah lewat ${SO_TTL_DAYS} hari)\nKlik untuk SO lagi`
            : "Klik untuk tandai sudah SO";

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={loading}
            title={title}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition
                ${loading ? "opacity-50 cursor-wait" : "cursor-pointer active:scale-95"}
                ${active
                    ? "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                    : expiredButOnceSo
                        ? "bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100"
                        : "bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100 hover:text-gray-600"}`}
        >
            {active ? (
                <>
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                    SO
                </>
            ) : (
                <>
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10" />
                    </svg>
                    {expiredButOnceSo ? "SO Ulang" : "SO"}
                </>
            )}
        </button>
    );
}

//  Riwayat semua audit sebuah model laptop — dibaca dari tabel laptop_audit_logs
//  lewat GET /api/laptops/[id]/audit, supaya histori tetap ada walau status
//  "aktif"-nya sudah auto-reset lewat 2 hari.
interface AuditHistoryEntry {
    id: string;
    action: "AUDIT" | "UNAUDIT";
    audited_by: string;
    audited_at: string;
}

function AuditHistoryModal({ laptopId, laptopName, onClose }: {
    laptopId: string; laptopName: string; onClose: () => void;
}) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [history, setHistory] = useState<AuditHistoryEntry[]>([]);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const res = await fetch(`/api/laptops/${laptopId}/audit`);
                const json = await res.json();
                if (!res.ok || !json.success) throw new Error(json.message || "Gagal memuat riwayat");
                if (active) setHistory(json.data?.history ?? []);
            } catch (e) {
                if (active) setError(e instanceof Error ? e.message : "Terjadi kesalahan");
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => { active = false; };
    }, [laptopId]);

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    const fmtWhen = (iso: string) =>
        new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-popIn max-h-[80vh] flex flex-col">
                <div className="h-1 w-full bg-gradient-to-r from-gray-400 via-gray-600 to-gray-800 flex-shrink-0" />
                <div className="px-5 py-4 border-b border-gray-100 flex-shrink-0">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Riwayat Audit</p>
                    <h3 className="text-sm font-bold text-gray-900 truncate">{laptopName}</h3>
                </div>
                <div className="overflow-y-auto flex-1 px-5 py-4">
                    {loading ? (
                        <div className="space-y-2">
                            {[...Array(3)].map((_, i) => <div key={i} className="h-10 rounded-xl bg-gray-100 animate-pulse" />)}
                        </div>
                    ) : error ? (
                        <p className="text-sm text-red-600">{error}</p>
                    ) : history.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-6">Belum pernah diaudit</p>
                    ) : (
                        <ul className="space-y-2">
                            {history.map(h => (
                                <li key={h.id} className="flex items-start gap-2.5 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5">
                                    <span className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${h.action === "AUDIT" ? "bg-emerald-500" : "bg-gray-300"}`} />
                                    <div className="min-w-0">
                                        <p className="text-xs font-semibold text-gray-700">
                                            {h.action === "AUDIT" ? "Ditandai sudah diaudit" : "Audit dibatalkan"}
                                        </p>
                                        <p className="text-[11px] text-gray-400 mt-0.5">
                                            {h.audited_by} · {fmtWhen(h.audited_at)}
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0">
                    <button onClick={onClose}
                        className="w-full h-10 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition">
                        Tutup
                    </button>
                </div>
            </div>
        </div>
    );
}

interface SoHistoryEntry {
    id: string;
    action: "SO" | "UNSO";
    so_by: string;
    so_at: string;
}

//  Riwayat SO — dibaca dari tabel laptop_so_logs lewat GET /api/laptops/[id]/so
function SoHistoryModal({ laptopId, laptopName, onClose }: {
    laptopId: string; laptopName: string; onClose: () => void;
}) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [history, setHistory] = useState<SoHistoryEntry[]>([]);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const res = await fetch(`/api/laptops/${laptopId}/so`);
                const json = await res.json();
                if (!res.ok || !json.success) throw new Error(json.message || "Gagal memuat riwayat");
                if (active) setHistory(json.data?.history ?? []);
            } catch (e) {
                if (active) setError(e instanceof Error ? e.message : "Terjadi kesalahan");
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => { active = false; };
    }, [laptopId]);

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    const fmtWhen = (iso: string) =>
        new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-popIn max-h-[80vh] flex flex-col">
                <div className="h-1 w-full bg-gradient-to-r from-gray-400 via-gray-600 to-gray-800 flex-shrink-0" />
                <div className="px-5 py-4 border-b border-gray-100 flex-shrink-0">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Riwayat SO (Stock Opname)</p>
                    <h3 className="text-sm font-bold text-gray-900 truncate">{laptopName}</h3>
                </div>
                <div className="overflow-y-auto flex-1 px-5 py-4">
                    {loading ? (
                        <div className="space-y-2">
                            {[...Array(3)].map((_, i) => <div key={i} className="h-10 rounded-xl bg-gray-100 animate-pulse" />)}
                        </div>
                    ) : error ? (
                        <p className="text-sm text-red-600">{error}</p>
                    ) : history.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-6">Belum pernah di-SO</p>
                    ) : (
                        <ul className="space-y-2">
                            {history.map(h => (
                                <li key={h.id} className="flex items-start gap-2.5 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5">
                                    <span className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${h.action === "SO" ? "bg-blue-500" : "bg-gray-300"}`} />
                                    <div className="min-w-0">
                                        <p className="text-xs font-semibold text-gray-700">
                                            {h.action === "SO" ? "Ditandai sudah SO" : "SO dibatalkan"}
                                        </p>
                                        <p className="text-[11px] text-gray-400 mt-0.5">
                                            {h.so_by} · {fmtWhen(h.so_at)}
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0">
                    <button onClick={onClose}
                        className="w-full h-10 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition">
                        Tutup
                    </button>
                </div>
            </div>
        </div>
    );
}

function ModalActions({ onCancel, loading, submitLabel }: { onCancel: () => void; loading: boolean; submitLabel: string }) {
    return (
        <div className="flex gap-3 pt-4 border-t border-gray-100">
            <button type="button" onClick={onCancel}
                className="flex-1 h-11 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-200 active:scale-[0.98] transition-all duration-150">
                Batal
            </button>
            <button type="submit" disabled={loading}
                className="flex-1 h-11 bg-gray-800 text-white rounded-xl text-sm font-semibold hover:bg-gray-900 active:scale-[0.98] transition-all duration-150 disabled:opacity-40 shadow-lg shadow-gray-800/20">
                {loading ? (
                    <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Menyimpan...
                    </span>
                ) : submitLabel}
            </button>
        </div>
    );
}

//  Skeleton disesuaikan dengan kolom baru (13 kolom + Aksi)
function SkeletonTable() {
    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gray-50 border-b-2 border-gray-100">
                            {["No", "Nama Laptop", "CPU", "RAM", "Storage", "Modal Laptop", "Modal Sparepart", "Harga Jual", "Total Jual", "Sumber", "Tanggal Masuk", "SN", "ST", "SJ", "M", "SO", "Audit", "Aksi"].map(h => (
                                <th key={h} className="px-3 py-3"><Shimmer h={10} /></th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {[1, 2, 3, 4, 5, 6].map(r => (
                            <tr key={r} className="border-b border-gray-50">
                                <td className="px-3 py-3.5"><Shimmer w={20} h={12} /></td>
                                <td className="px-3 py-3.5"><Shimmer w={130} h={13} /></td>
                                <td className="px-3 py-3.5"><Shimmer w={90} h={12} /></td>
                                <td className="px-3 py-3.5"><Shimmer w={40} h={12} /></td>
                                <td className="px-3 py-3.5"><Shimmer w={60} h={12} /></td>
                                <td className="px-3 py-3.5"><div className="flex justify-end"><Shimmer w={70} h={12} /></div></td>
                                <td className="px-3 py-3.5"><div className="flex justify-end"><Shimmer w={80} h={13} /></div></td>
                                <td className="px-3 py-3.5"><Shimmer w={70} h={12} /></td>
                                <td className="px-3 py-3.5"><Shimmer w={70} h={12} /></td>
                                <td className="px-3 py-3.5"><Shimmer w={80} h={20} r="8px" /></td>
                                <td className="px-3 py-3.5"><div className="flex justify-center"><Shimmer w={16} h={13} /></div></td>
                                <td className="px-3 py-3.5"><div className="flex justify-center"><Shimmer w={26} h={22} r="8px" /></div></td>
                                <td className="px-3 py-3.5"><div className="flex justify-center"><Shimmer w={16} h={13} /></div></td>
                                <td className="px-3 py-3.5"><div className="flex justify-end gap-1.5"><Shimmer w={28} h={28} r="8px" /><Shimmer w={52} h={28} r="8px" /></div></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="px-5 py-3.5 border-t border-gray-100 bg-gray-50/60">
                <Shimmer w={160} h={10} />
            </div>
        </div>
    );
}

function ModalDetailSkeleton() {
    return (
        <div className="space-y-5 animate-pulse">
            <div className="flex gap-4 p-5 bg-gray-50 rounded-2xl border border-gray-100">
                <Shimmer w={56} h={56} r="14px" />
                <div className="flex-1 space-y-2">
                    <Shimmer w="70%" h={18} />
                    <Shimmer w="40%" h={13} />
                    <div className="flex gap-2 mt-2"><Shimmer w={80} h={24} r="8px" /></div>
                </div>
                <div className="text-right space-y-1">
                    <Shimmer w={50} h={9} />
                    <Shimmer w={100} h={24} />
                </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                        <Shimmer w={40} h={9} className="mb-1.5" />
                        <Shimmer w="80%" h={13} />
                    </div>
                ))}
            </div>
            <div className="flex justify-between pt-4 border-t border-gray-100">
                <Shimmer w={90} h={11} />
                <div className="flex gap-2"><Shimmer w={88} h={36} r="10px" /><Shimmer w={60} h={36} r="10px" /></div>
            </div>
        </div>
    );
}

function Modal({ open, onClose, title, children, size = "md" }: {
    open: boolean; onClose: () => void; title: string; children: React.ReactNode; size?: "md" | "lg";
}) {
    const overlayRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [open, onClose]);
    if (!open) return null;
    return (
        <div ref={overlayRef} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn"
            onClick={e => { if (e.target === overlayRef.current) onClose(); }}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-md" />
            <div className={`relative bg-white w-full shadow-2xl flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden animate-popIn ${size === "lg" ? "sm:max-w-3xl" : "sm:max-w-lg"} max-h-[92dvh] sm:max-h-[88vh]`}>
                <div className="h-0.5 w-full bg-gradient-to-r from-gray-300 via-gray-700 to-gray-900 flex-shrink-0" />
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
                    <h2 className="font-bold text-gray-900 text-[15px] tracking-tight">{title}</h2>
                    <button onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 active:scale-90 transition-all duration-150">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="overflow-y-auto flex-1 px-6 py-5">{children}</div>
            </div>
        </div>
    );
}

function FormField({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
    return (
        <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">
                {label}{required && <span className="text-red-400 ml-0.5 normal-case">*</span>}
            </label>
            {children}
        </div>
    );
}