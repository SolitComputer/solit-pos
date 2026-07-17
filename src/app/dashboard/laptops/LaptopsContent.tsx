"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import ExcelJS from "exceljs";
import Link from "next/link";
import BarcodeModal from "@/components/ui/BarcodeModal";
import { UserRole, PERMISSIONS, hasAnyRole } from "@/lib/permissions";

interface LaptopUnit {
    id: string;
    serial_number: string;
    grade: string;
    status: string;
    selling_price: number;
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
    status: string;
    ready_to_sell: boolean;
    notes: string;
    created_at: string;
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
        "KEPALA_PENGELOLA_BARANG", "KEPALA_TEKNISI",
        "MARKETING", "KEPALA_MARKETING",
    ] as UserRole[]);
    const canViewUnits = hasAnyRole(userRoles, PERMISSIONS.VIEW_UNITS);
    const canViewTotalStok = hasAnyRole(userRoles, [
        "ADMIN", "PROGRAMMER", "ASISTEN_CEO", "ACCOUNTING",
        "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG", "KEPALA_TEKNISI",
    ] as UserRole[]);
    const canViewBarcode = hasAnyRole(userRoles, PERMISSIONS.VIEW_BARCODE);

    const [alertModal, setAlertModal] = useState<string | null>(null);
    const [confirmModal, setConfirmModal] = useState<{ message: string; onConfirm: () => void } | null>(null);
    const [deleteConfirmModal, setDeleteConfirmModal] = useState<{ laptop: Laptop; unitCount: number } | null>(null);

    const showAlert = (msg: string) => setAlertModal(msg);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const showConfirm = (msg: string, onConfirm: () => void) => setConfirmModal({ message: msg, onConfirm });

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
                return {
                    ...l,
                    selling_price: Math.round(Number(l.selling_price) || 0),
                    qty: units.length,
                    // ✅ Stok Tersisa = Siap Jual + Minus saja.
                    // Unit RESERVED/HELD/PACKING sengaja TIDAK dihitung sebagai stok tersedia
                    // karena statusnya sudah "diproses" (dipesan/ditahan/dikemas), bukan stok bebas.
                    stok_tersedia: siapJual + stokMinus,
                    siap_jual: siapJual,
                    stok_minus: stokMinus,
                    terjual: units.filter((u: LaptopUnit) => u.status === "SOLD").length,
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
    }, [laptops, search, filterSN, filterStatus, filterBrand, filterProcessor, filterRam, filterPriceRange, sortBy]);

    const uniqueProcessors = useMemo(() => {
        const types = new Set<string>();
        laptops.forEach(x => {
            const cpu = (x.cpu || "").toLowerCase();
            if (cpu.includes("i3")) types.add("Intel i3");
            else if (cpu.includes("i5")) types.add("Intel i5");
            else if (cpu.includes("i7")) types.add("Intel i7");
            else if (cpu.includes("i9")) types.add("Intel i9");
            else if (cpu.includes("ryzen 3")) types.add("AMD Ryzen 3");
            else if (cpu.includes("ryzen 5")) types.add("AMD Ryzen 5");
            else if (cpu.includes("ryzen 7")) types.add("AMD Ryzen 7");
            else if (cpu.includes("ryzen 9")) types.add("AMD Ryzen 9");
            else if (cpu.includes("apple m") || cpu.includes("m1") || cpu.includes("m2") || cpu.includes("m3")) types.add("Apple Silicon");
            else if (cpu.includes("celeron")) types.add("Intel Celeron");
            else if (cpu.includes("pentium")) types.add("Intel Pentium");
        });
        return ["ALL", ...Array.from(types).sort()];
    }, [laptops]);

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
            closeModal(); fetchLaptops(); showAlert("Laptop berhasil ditambahkan ");
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
    //    - ALL     → tampilkan semua kolom (Stock Total, Siap Jual, Minus, Terjual)
    //    - SIAP_JUAL  → hanya kolom "Siap Jual", data hanya unit SIAP_JUAL
    //    - BELUM_SIAP → hanya kolom "Minus", data hanya unit SERVICE/BELUM_SIAP
    const exportToExcel = async () => {
        const wb = new ExcelJS.Workbook();
        wb.creator = "Solit Inventory";
        wb.created = new Date();

        // Tentukan konteks berdasarkan filter status aktif
        // Tentukan konteks berdasarkan filter status aktif
        const isSiapJualOnly = filterStatus === "SIAP_JUAL";
        const isMinusOnly = filterStatus === "BELUM_SIAP";
        const isAllMode = !isSiapJualOnly && !isMinusOnly;

        // Sheet name & file suffix mengikuti filter
        const sheetLabel = isSiapJualOnly
            ? "Laptop Siap Jual"
            : isMinusOnly
                ? "Laptop Minus"
                : "Data Laptop";

        const fileSuffix = isSiapJualOnly
            ? "_siap_jual"
            : isMinusOnly
                ? "_minus"
                : "";

        const ws = wb.addWorksheet(sheetLabel, {
            views: [{ state: "frozen", ySplit: 1 }],
            pageSetup: { fitToPage: true, fitToWidth: 1, orientation: "landscape" },
        });

        const COLOR = {
            headerBg: "FF4B5563",
            headerFg: "FFFFFFFF",
            rowEven: "FFF8FAFC",
            rowOdd: "FFFFFFFF",
            borderColor: "FFE2E8F0",
            subTextFg: "FF64748B",
            siapBg: "FFD1FAE5", // green-100
            siapFg: "FF065F46", // green-900
            minusBg: "FFFEE2E2", // red-100
            minusFg: "FF7F1D1D", // red-900
        };

        //  Definisi kolom dinamis: mode filter menentukan kolom stok yang ditampilkan
        ws.columns = [
            { header: "No", key: "no", width: 6 },
            { header: "Product", key: "product", width: 35 },
            { header: "CPU", key: "cpu", width: 28 },
            { header: "RAM", key: "ram", width: 14 },
            { header: "HDD/SSD", key: "storage", width: 16 },
            // Kolom stok utama — labelnya berubah sesuai konteks filter
            {
                header: isSiapJualOnly ? "Siap Jual" : isMinusOnly ? "Minus" : "Stock Total",
                key: "stock",
                width: 13,
            },
            // Kolom detail stok hanya muncul di mode ALL
            ...(isAllMode ? [
                { header: "Siap Jual", key: "siap_jual", width: 12 },
                { header: "Minus", key: "minus", width: 10 },
            ] : []),
            { header: "Price Store", key: "price_store", width: 18 },
        ];

        // Header row styling
        const headerRow = ws.getRow(1);
        headerRow.height = 32;
        headerRow.eachCell(cell => {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.headerBg } };
            cell.font = { bold: true, size: 11, color: { argb: COLOR.headerFg }, name: "Arial" };
            cell.border = {
                top: { style: "thin", color: { argb: COLOR.borderColor } },
                left: { style: "thin", color: { argb: COLOR.borderColor } },
                bottom: { style: "medium", color: { argb: "FF94A3B8" } },
                right: { style: "thin", color: { argb: COLOR.borderColor } },
            };
            cell.alignment = { horizontal: "center", vertical: "middle" };
        });

        //  Data rows — nilai kolom stok dihitung ulang sesuai filterStatus
        filteredLaptops.forEach((item, idx) => {
            const rowBg = idx % 2 === 0 ? COLOR.rowEven : COLOR.rowOdd;
            const units = item.laptop_units || [];

            // Hitung per-jenis unit dari raw laptop_units (bukan dari field cached)
            const siapJualCount = units.filter((u: LaptopUnit) => u.status === "SIAP_JUAL").length;
            const minusCount = units.filter((u: LaptopUnit) => u.status === "SERVICE" || u.status === "BELUM_SIAP").length;
            const tersediaCount = units.filter((u: LaptopUnit) => u.status !== "SOLD").length;

            //  Nilai kolom "stock" disesuaikan dengan konteks filter
            const stockValue = isSiapJualOnly
                ? siapJualCount
                : isMinusOnly
                    ? minusCount
                    : tersediaCount;

            // Bangun row data — kolom detail hanya di mode ALL
            const rowData: Record<string, string | number> = {
                no: idx + 1,
                product: item.laptop_name || "",
                cpu: item.cpu || "",
                ram: item.ram || "",
                storage: item.storage || "",
                stock: stockValue,
                price_store: item.selling_price || 0,
            };

            if (isAllMode) {
                rowData.siap_jual = siapJualCount;
                rowData.minus = minusCount;
            }

            const row = ws.addRow(rowData);
            row.height = 22;

            row.eachCell((cell, colNum) => {
                const key = ws.getColumn(colNum).key as string;

                // ── Base styling ──────────────────────────────────────────────
                cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };
                cell.border = {
                    top: { style: "hair", color: { argb: COLOR.borderColor } },
                    left: { style: "hair", color: { argb: COLOR.borderColor } },
                    bottom: { style: "hair", color: { argb: COLOR.borderColor } },
                    right: { style: "hair", color: { argb: COLOR.borderColor } },
                };
                cell.font = { size: 10, name: "Arial" };
                cell.alignment = { vertical: "middle" };

                // ── Per-column overrides ──────────────────────────────────────
                if (key === "no") {
                    cell.alignment = { horizontal: "center", vertical: "middle" };
                    cell.font = { size: 10, name: "Arial", color: { argb: COLOR.subTextFg } };

                } else if (key === "product") {
                    cell.font = { size: 10, name: "Arial", bold: true };
                    cell.alignment = { horizontal: "center", vertical: "middle" };

                } else if (["cpu", "ram", "storage"].includes(key)) {
                    cell.alignment = { horizontal: "center", vertical: "middle" };

                } else if (key === "price_store") {
                    cell.numFmt = '"Rp "#,##0';
                    cell.alignment = { horizontal: "center", vertical: "middle" };

                } else if (key === "stock") {
                    //  Warna kolom "stock" mengikuti konteks filter
                    cell.alignment = { horizontal: "center", vertical: "middle" };
                    if (isSiapJualOnly) {
                        if (stockValue > 0) {
                            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.siapBg } };
                            cell.font = { size: 10, name: "Arial", bold: true, color: { argb: COLOR.siapFg } };
                        } else {
                            cell.font = { size: 10, name: "Arial", color: { argb: COLOR.subTextFg } };
                        }
                    } else if (isMinusOnly) {
                        if (stockValue > 0) {
                            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.minusBg } };
                            cell.font = { size: 10, name: "Arial", bold: true, color: { argb: COLOR.minusFg } };
                        } else {
                            cell.font = { size: 10, name: "Arial", color: { argb: COLOR.subTextFg } };
                        }
                    } else {
                        // ALL mode — kolom Stock Total, tidak diberi warna khusus
                        cell.font = { size: 10, name: "Arial" };
                    }

                } else if (key === "siap_jual") {
                    cell.alignment = { horizontal: "center", vertical: "middle" };
                    if (siapJualCount > 0) {
                        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.siapBg } };
                        cell.font = { size: 10, name: "Arial", bold: true, color: { argb: COLOR.siapFg } };
                    } else {
                        cell.font = { size: 10, name: "Arial", color: { argb: COLOR.subTextFg } };
                    }

                } else if (key === "minus") {
                    cell.alignment = { horizontal: "center", vertical: "middle" };
                    if (minusCount > 0) {
                        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.minusBg } };
                        cell.font = { size: 10, name: "Arial", bold: true, color: { argb: COLOR.minusFg } };
                    } else {
                        cell.font = { size: 10, name: "Arial", color: { argb: COLOR.subTextFg } };
                    }
                }
            });
        });

        // Download
        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `data_laptop${fileSuffix}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const totalSisa = filteredLaptops.reduce((s, l) => s + (l.stok_tersedia ?? 0), 0);
    const totalSiapJual = filteredLaptops.reduce((s, l) => s + (l.laptop_units || []).filter((u: LaptopUnit) => u.status === "SIAP_JUAL").length, 0);
    const totalMinus = filteredLaptops.reduce((s, l) => s + (l.stok_minus ?? 0), 0);
    const totalTerjual = filteredLaptops.reduce((s, l) => s + (l.terjual ?? 0), 0);

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
                                <option value="SIAP_JUAL">✅ Siap Jual</option>
                                <option value="BELUM_SIAP">⚠️ Minus</option>
                            </FilterSelect>
                            <FilterSelect value={filterBrand} onChange={e => setFilterBrand(e.target.value)}>
                                {uniqueBrands.map(b => <option key={b} value={b}>{b === "ALL" ? "Semua Brand" : b}</option>)}
                            </FilterSelect>
                            <button
                                onClick={() => { setSearch(""); setFilterSN(""); setFilterStatus("ALL"); setFilterBrand("ALL"); setFilterProcessor("ALL"); setFilterRam("ALL"); setFilterPriceRange("ALL"); setSortBy("DEFAULT"); }}
                                className="h-9 bg-gray-100 text-gray-600 rounded-xl px-3 text-sm font-medium hover:bg-gray-200 active:scale-[0.97] transition-all duration-150 flex items-center justify-center gap-1.5"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Reset
                            </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
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
                                <option value="PRICE_ASC">Harga: Rendah → Tinggi</option>
                                <option value="PRICE_DESC">Harga: Tinggi → Rendah</option>
                                <option value="SN">Urut SN</option>
                            </FilterSelect>
                        </div>

                        {(filterProcessor !== "ALL" || filterRam !== "ALL" || filterPriceRange !== "ALL" || sortBy !== "DEFAULT") && (
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                                {filterProcessor !== "ALL" && <FilterChip label={filterProcessor} onRemove={() => setFilterProcessor("ALL")} />}
                                {filterRam !== "ALL" && <FilterChip label={`RAM ${filterRam}`} onRemove={() => setFilterRam("ALL")} />}
                                {filterPriceRange !== "ALL" && <FilterChip label={filterPriceRange === "4+" ? "≥ Rp 4 jt" : `Rp ${filterPriceRange} jt`} onRemove={() => setFilterPriceRange("ALL")} />}
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
                            <div className="overflow-x-auto table-scroll">
                                <table className="w-full text-sm border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50 border-b-2 border-gray-100">
                                            <Th center sortKey="NO" activeSort={sortBy} onSort={handleSort}>No</Th>
                                            <Th sortKey="NAMA" activeSort={sortBy} onSort={handleSort}>Nama Laptop</Th>
                                            <Th sortKey="CPU" activeSort={sortBy} onSort={handleSort}>CPU</Th>
                                            <Th sortKey="RAM" activeSort={sortBy} onSort={handleSort}>RAM</Th>
                                            <Th sortKey="STORAGE" activeSort={sortBy} onSort={handleSort}>Storage</Th>
                                            <Th right sortKey="PRICE" activeSort={sortBy} onSort={handleSort}>Harga Jual</Th>
                                            {canViewTotalStok && <Th right sortKey="STOK" activeSort={sortBy} onSort={handleSort}>Stok Tersisa</Th>}
                                            <Th right sortKey="SIAP" activeSort={sortBy} onSort={handleSort}>Siap Jual</Th>
                                            {canViewTotalStok && <Th right sortKey="MINUS" activeSort={sortBy} onSort={handleSort}>Minus</Th>}
                                            <Th right>Aksi</Th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredLaptops.map((item, idx) => (
                                            <tr key={item.id} className="group cursor-pointer data-row border-b border-gray-50 last:border-0" onClick={() => openDetail(item)}>
                                                <td className="px-4 py-3.5 text-center w-10">
                                                    <span className="text-xs font-semibold text-gray-300 tabular-nums">{String(idx + 1).padStart(2, "0")}</span>
                                                </td>
                                                <td className="px-4 py-3.5 max-w-[200px]">
                                                    <span className="block font-semibold text-gray-800 truncate text-[13px]" title={item.laptop_name}>{item.laptop_name}</span>
                                                </td>
                                                <td className="px-4 py-3.5 max-w-[160px]">
                                                    <span className="block text-xs text-gray-600 truncate" title={item.cpu}>{item.cpu || <span className="text-gray-200">—</span>}</span>
                                                </td>
                                                <td className="px-4 py-3.5 whitespace-nowrap">
                                                    <span className="text-xs font-medium text-gray-600">{item.ram || <span className="text-gray-200">—</span>}</span>
                                                </td>
                                                <td className="px-4 py-3.5 whitespace-nowrap">
                                                    <span className="text-xs font-medium text-gray-600">{item.storage || <span className="text-gray-200">—</span>}</span>
                                                </td>
                                                <td className="px-4 py-3.5 text-right whitespace-nowrap">
                                                    <span className="text-[13px] font-bold text-gray-800 tabular-nums">{fmt(item.selling_price)}</span>
                                                </td>
                                                {canViewTotalStok && (
                                                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                                                        <span className={`text-sm font-semibold tabular-nums ${(item.stok_tersedia ?? 0) === 0 ? "text-red-400" : "text-gray-700"}`}>
                                                            {item.stok_tersedia ?? 0}
                                                        </span>
                                                    </td>
                                                )}
                                                <td className="px-4 py-3.5 text-right whitespace-nowrap">
                                                    <span className={`inline-flex items-center justify-center min-w-[26px] px-2 py-0.5 rounded-lg text-xs font-bold tabular-nums ${(item.siap_jual ?? 0) === 0 ? "bg-red-50 text-red-500 ring-1 ring-red-200" : "bg-green-50 text-green-700 ring-1 ring-green-200"}`}>
                                                        {item.siap_jual ?? 0}
                                                    </span>
                                                </td>
                                                {canViewTotalStok && (
                                                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                                                        <span className={`text-sm font-semibold tabular-nums ${(item.stok_minus ?? 0) > 0 ? "text-red-500" : "text-gray-200"}`}>
                                                            {(item.stok_minus ?? 0) > 0 ? `-${item.stok_minus}` : "—"}
                                                        </span>
                                                    </td>
                                                )}
                                                <td className="px-4 py-3.5 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                                    <div className="flex items-center justify-end gap-1">
                                                        {canViewBarcode && (
                                                            <button onClick={() => setBarcodeTarget({ id: item.id, name: item.laptop_name })}
                                                                className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all duration-150"
                                                                title="Lihat Barcode">
                                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 9V6a1 1 0 011-1h2M3 15v3a1 1 0 001 1h2m13-13h2a1 1 0 011 1v3m0 6v3a1 1 0 01-1 1h-2M9 5v14M12 5v14M15 5v14" />
                                                                </svg>
                                                            </button>
                                                        )}
                                                        {canViewUnits && (
                                                            <Link href={`/dashboard/laptops/${item.id}/units`} onClick={e => e.stopPropagation()}
                                                                className="h-7 px-2.5 text-[11px] font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-all duration-150 flex items-center">
                                                                Units
                                                            </Link>
                                                        )}
                                                        {canEditLaptop && (
                                                            <>
                                                                <button onClick={() => openEdit(item)}
                                                                    className="h-7 px-2.5 text-[11px] font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-all duration-150">
                                                                    Edit
                                                                </button>
                                                                <button onClick={() => handleDelete(item.id)}
                                                                    className="h-7 px-2.5 text-[11px] font-semibold text-red-500 bg-red-50 rounded-lg hover:bg-red-100 transition-all duration-150">
                                                                    Hapus
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

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
                            Setiap unit laptop memiliki SN, grade, dan harga modal sendiri.
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
                        <FormField label="Harga Jual (Default)" required>
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
                        <FormField label="Harga Jual (Default)" required>
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

            {/* Detail Modal */}
            <Modal open={modalMode === "detail"} onClose={closeModal} title="Detail Laptop" size="lg">
                {detailLoading ? (
                    <ModalDetailSkeleton />
                ) : selectedLaptop ? (
                    <div className="space-y-5">
                        <div className="flex flex-col sm:flex-row gap-4 p-5 bg-gray-50 rounded-2xl border border-gray-100">
                            <div className="w-14 h-14 rounded-2xl bg-white border border-gray-200 shadow-sm flex items-center justify-center text-3xl flex-shrink-0"></div>
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
                                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Harga Jual</p>
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

                        <div className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-xl p-3.5">
                            <svg className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p className="text-xs text-gray-600 leading-relaxed">
                                Stok & harga modal dikelola per-unit. Klik <span className="font-bold text-gray-800">Lihat Units</span> untuk mengelola SN, grade, dan harga modal masing-masing unit.
                            </p>
                        </div>

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

            {barcodeTarget && (
                <BarcodeModal laptopId={barcodeTarget.id} laptopName={barcodeTarget.name} onClose={() => setBarcodeTarget(null)} />
            )}
            {alertModal && <AlertModal message={alertModal} onClose={() => setAlertModal(null)} />}
            {confirmModal && (
                <ConfirmModal message={confirmModal.message} onConfirm={confirmModal.onConfirm} onCancel={() => setConfirmModal(null)} />
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
                            showAlert("Laptop berhasil dihapus ");
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

function SkeletonTable() {
    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gray-50 border-b-2 border-gray-100">
                            {["No", "Nama Laptop", "CPU", "RAM", "Storage", "Harga", "Stok Tersisa", "Siap", "Minus", "Aksi"].map(h => (
                                <th key={h} className="px-4 py-3"><Shimmer h={10} /></th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {[1, 2, 3, 4, 5, 6].map(r => (
                            <tr key={r} className="border-b border-gray-50">
                                <td className="px-4 py-3.5"><Shimmer w={24} h={12} /></td>
                                <td className="px-4 py-3.5"><Shimmer w={140} h={13} /></td>
                                <td className="px-4 py-3.5"><Shimmer w={100} h={12} /></td>
                                <td className="px-4 py-3.5"><Shimmer w={44} h={12} /></td>
                                <td className="px-4 py-3.5"><Shimmer w={60} h={12} /></td>
                                <td className="px-4 py-3.5"><div className="flex justify-end"><Shimmer w={80} h={13} /></div></td>
                                <td className="px-4 py-3.5"><div className="flex justify-end"><Shimmer w={26} h={22} r="8px" /></div></td>
                                <td className="px-4 py-3.5"><div className="flex justify-end"><Shimmer w={20} h={13} /></div></td>
                                <td className="px-4 py-3.5"><div className="flex justify-end"><Shimmer w={20} h={13} /></div></td>
                                <td className="px-4 py-3.5"><div className="flex justify-end gap-1.5"><Shimmer w={44} h={28} r="8px" /><Shimmer w={36} h={28} r="8px" /></div></td>
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

function Th({ children, right, center, sortKey, activeSort, onSort }: {
    children: React.ReactNode; right?: boolean; center?: boolean;
    sortKey?: string; activeSort?: string; onSort?: (asc: string, desc: string) => void;
}) {
    const isSortable = !!sortKey && !!onSort;
    const ascKey = sortKey === 'NAMA' ? 'AZ' : (sortKey === 'NO' ? 'DEFAULT' : `${sortKey}_ASC`);
    const descKey = sortKey === 'NAMA' ? 'ZA' : (sortKey === 'NO' ? 'NO_DESC' : `${sortKey}_DESC`);
    const isActiveAsc = activeSort === ascKey;
    const isActiveDesc = activeSort === descKey;

    return (
        <th
            onClick={isSortable ? () => onSort(ascKey, descKey) : undefined}
            className={`px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap ${right ? "text-right" : center ? "text-center" : "text-left"} ${isSortable ? "cursor-pointer hover:text-gray-700 select-none group/th" : ""}`}
        >
            <div className={`flex items-center gap-1.5 ${right ? "justify-end" : center ? "justify-center" : "justify-start"}`}>
                {children}
                {isSortable && (
                    <div className="flex flex-col -space-y-[3px]">
                        <svg className={`w-2.5 h-2.5 ${isActiveAsc ? "text-gray-800" : "text-gray-300 group-hover/th:text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 15l7-7 7 7" /></svg>
                        <svg className={`w-2.5 h-2.5 ${isActiveDesc ? "text-gray-800" : "text-gray-300 group-hover/th:text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                )}
            </div>
        </th>
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