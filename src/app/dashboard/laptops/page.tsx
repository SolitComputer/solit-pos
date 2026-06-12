"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import ExcelJS from "exceljs";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Link from "next/link";
import BarcodeModal from "@/components/ui/BarcodeModal";
import { UserRole, PERMISSIONS, hasPermission } from "@/lib/permissions";

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

const Shimmer = ({
    w,
    h,
    r = "8px",
    style = {},
    className = "",
}: {
    w?: string | number;
    h: string | number;
    r?: string;
    style?: React.CSSProperties;
    className?: string;
}) => (
    <div
        className={className}
        style={{
            width: w ?? "100%",
            height: h,
            borderRadius: r,
            background: "linear-gradient(90deg,#e5e5e5 25%,#d4d4d4 50%,#e5e5e5 75%)",
            backgroundSize: "600px 100%",
            animation: "sk-shimmer 1.4s infinite linear",
            flexShrink: 0,
            ...style,
        }}
    />
);

// ─── Alert Modal (enhanced) ─────────────────────────────────────────────
function AlertModal({
    message,
    onClose,
}: {
    message: string;
    onClose: () => void;
}) {
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center animate-scaleIn">
                <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-7 h-7 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <p className="text-gray-700 text-sm font-medium mb-5">{message}</p>
                <button
                    onClick={onClose}
                    className="w-full h-11 bg-gray-700 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-all duration-200 shadow-md"
                >
                    OK
                </button>
            </div>
        </div>
    );
}

function ConfirmModal({
    message,
    onConfirm,
    onCancel,
    confirmLabel = "Hapus",
    danger = true,
}: {
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
    confirmLabel?: string;
    danger?: boolean;
}) {
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onCancel]);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-scaleIn">
                <div className={`${danger ? "bg-gray-700" : "bg-gray-600"} px-5 py-4`}>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <div>
                            <p className="font-bold text-white text-sm">Konfirmasi {danger ? "Penghapusan" : "Tindakan"}</p>
                            <p className="text-xs text-white/70 mt-0.5">Tindakan ini tidak dapat dibatalkan</p>
                        </div>
                    </div>
                </div>
                <div className="p-5">
                    <p className="text-gray-700 text-sm font-medium text-center mb-6">{message}</p>
                    <div className="flex gap-3">
                        <button
                            onClick={onCancel}
                            className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-all duration-200"
                        >
                            Batal
                        </button>
                        <button
                            onClick={onConfirm}
                            className={`flex-1 h-11 rounded-xl text-sm font-medium text-white transition-all duration-200 shadow-md ${danger ? "bg-gray-700 hover:bg-gray-800" : "bg-gray-600 hover:bg-gray-700"
                                }`}
                        >
                            {confirmLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Delete Confirm Modal - Enhanced ───────────────────────────────────
function DeleteConfirmModal({
    laptop,
    unitCount,
    onConfirm,
    onCancel,
}: {
    laptop: Laptop;
    unitCount: number;
    onConfirm: () => void;
    onCancel: () => void;
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
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-scaleIn">
                {/* Header dengan gradien abu-abu */}
                <div className="bg-gray-700 px-5 py-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-white font-bold text-lg">Hapus Laptop</h3>
                            <p className="text-xs text-gray-300 mt-0.5">Tindakan ini tidak dapat dibatalkan</p>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="p-5">
                    {/* Nama Laptop */}
                    <div className="bg-gray-50 rounded-xl p-3 mb-4 border border-gray-200">
                        <p className="text-xs text-gray-400 mb-1">Laptop yang akan dihapus</p>
                        <p className="text-sm font-bold text-gray-800 truncate">{laptop.laptop_name}</p>
                    </div>

                    {/* Warning banner */}
                    {unitCount > 0 && (
                        <div className="flex items-start gap-2 bg-yellow-50 border-l-4 border-l-yellow-500 rounded-xl px-3 py-2.5 mb-4">
                            <svg className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                            </svg>
                            <div>
                                <p className="text-xs font-semibold text-yellow-700">
                                    Terdapat {unitCount} unit terdaftar
                                </p>
                                <p className="text-xs text-yellow-600 mt-0.5">
                                    Semua unit dan garansi terkait akan ikut terhapus
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Konfirmasi input */}
                    <div className="mb-5">
                        <label className="text-xs font-medium text-gray-600 mb-1.5 block">
                            Konfirmasi dengan mengetik nama laptop
                        </label>
                        <div className="bg-gray-100 rounded-lg px-3 py-1.5 mb-2">
                            <code className="text-xs font-mono text-gray-700">{laptop.laptop_name}</code>
                        </div>
                        <input
                            type="text"
                            value={inputName}
                            onChange={e => setInputName(e.target.value)}
                            placeholder="Ketik nama laptop di atas..."
                            className={`w-full h-11 border rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 transition-all duration-200 ${inputName.length > 0
                                ? isMatch
                                    ? "border-green-400 focus:ring-green-200"
                                    : "border-red-300 focus:ring-red-200"
                                : "border-gray-200 focus:ring-gray-200"
                                }`}
                            autoFocus
                        />
                        {inputName.length > 0 && !isMatch && (
                            <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                Nama tidak cocok
                            </p>
                        )}
                        {isMatch && inputName.length > 0 && (
                            <p className="text-xs text-green-600 mt-1.5 flex items-center gap-1">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                                Nama cocok, siap dihapus
                            </p>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button
                            onClick={onCancel}
                            className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-all duration-200"
                        >
                            Batal
                        </button>
                        <button
                            onClick={onConfirm}
                            disabled={!isMatch}
                            className="flex-1 h-11 bg-gray-700 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
                        >
                            Hapus Permanen
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function Page() {
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

    const [modalMode, setModalMode] = useState<ModalMode>(null);
    const [selectedLaptop, setSelectedLaptop] = useState<Laptop | null>(null);
    const [formData, setFormData] = useState<Record<string, string>>(EMPTY_FORM);
    const [formLoading, setFormLoading] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
    const [barcodeTarget, setBarcodeTarget] = useState<{ id: string; name: string } | null>(null);
    const [userRole, setUserRole] = useState<UserRole | null>(null);

    const canEditLaptop = userRole ? hasPermission(userRole, PERMISSIONS.EDIT_LAPTOP) : false;
    const canCreateLaptop = userRole ? hasPermission(userRole, PERMISSIONS.CREATE_LAPTOP) : false;
    const canExport = userRole ? hasPermission(userRole, [
        "ADMIN", "KEPALA_SALES", "ACCOUNTING", "PENGELOLA_BARANG",
        "MARKETING", "KEPALA_MARKETING"
    ] as UserRole[]) : false;
    const canViewUnits = userRole ? hasPermission(userRole, PERMISSIONS.VIEW_UNITS) : false;
    const canViewBarcode = userRole ? hasPermission(userRole, PERMISSIONS.VIEW_BARCODE) : false;


    const [alertModal, setAlertModal] = useState<string | null>(null);
    const [confirmModal, setConfirmModal] = useState<{
        message: string;
        onConfirm: () => void;
    } | null>(null);
    const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
        laptop: Laptop;
        unitCount: number;
    } | null>(null);

    const showAlert = (msg: string) => setAlertModal(msg);
    const showConfirm = (msg: string, onConfirm: () => void) =>
        setConfirmModal({ message: msg, onConfirm });

    useEffect(() => { fetchLaptops(); }, []);

    useEffect(() => {
        fetch("/api/auth/me")
            .then(r => r.json())
            .then(r => setUserRole(r.user?.role ?? null))
            .catch(() => setUserRole(null));
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
            const normalized = (result.data || []).map((l: Laptop) => ({
                ...l,
                selling_price: Math.round(Number(l.selling_price) || 0),
                qty: Number(l.qty) || 0,
            }));
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
        if (filterStatus !== "ALL") list = list.filter(x => x.status === filterStatus);
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
            list = list.filter(x =>
                x.laptop_units?.some(u =>
                    u.serial_number.toLowerCase().includes(snQ)
                )
            );
        }
        switch (sortBy) {
            case "AZ": list.sort((a, b) => (a.laptop_name || "").localeCompare(b.laptop_name || "")); break;
            case "ZA": list.sort((a, b) => (b.laptop_name || "").localeCompare(a.laptop_name || "")); break;
            case "PRICE_ASC": list.sort((a, b) => (a.selling_price || 0) - (b.selling_price || 0)); break;
            case "PRICE_DESC": list.sort((a, b) => (b.selling_price || 0) - (a.selling_price || 0)); break;
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
        return ["ALL", ...Array.from(r).sort((a, b) => {
            const numA = parseInt(a) || 0;
            const numB = parseInt(b) || 0;
            return numA - numB;
        })];
    }, [laptops]);

    const uniqueBrands = useMemo(() => {
        const b = new Set(laptops.map(x => x.brand).filter(Boolean));
        return ["ALL", ...Array.from(b)];
    }, [laptops]);

    const openCreate = () => {
        setFormData({ ...EMPTY_FORM });
        setModalMode("create");
    };

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

    const handleFormChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
    ) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

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
            if (!result.success) {
                showAlert(result.message || "Gagal menambahkan laptop");
                return;
            }
            closeModal();
            fetchLaptops();
            showAlert("Laptop berhasil ditambahkan ✅");
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
            if (!result.success) {
                showAlert(result.message);
                return;
            }
            closeModal();
            fetchLaptops();
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
            const unitCount = result.data?.length ?? 0;
            setDeleteConfirmModal({ laptop, unitCount });
        } catch {
            setDeleteConfirmModal({ laptop, unitCount: laptop.qty ?? 0 });
        }
    };

    const exportToExcel = async () => {
        const wb = new ExcelJS.Workbook();
        wb.creator = "Solit Inventory";
        wb.created = new Date();

        const ws = wb.addWorksheet("Data Laptop", {
            views: [{ state: "frozen", ySplit: 1 }],
            pageSetup: { fitToPage: true, fitToWidth: 1, orientation: "landscape" },
        });

        const COLOR = {
            headerBg: "FF4B5563", headerFg: "FFFFFFFF",
            siapBg: "FFD1FAE5", siapFg: "FF065F46",
            belumBg: "FFFEF3C7", belumFg: "FF78350F",
            serviceBg: "FFDBEAFE", serviceFg: "FF1E3A5F",
            rowEven: "FFF8FAFC", rowOdd: "FFFFFFFF",
            totalBg: "FFF3F4F6", totalFg: "FF374151",
            borderColor: "FFE2E8F0", subTextFg: "FF64748B",
        };
        ws.columns = [
            { header: "No", key: "no", width: 6 },
            { header: "Product", key: "product", width: 35 },
            { header: "CPU", key: "cpu", width: 28 },
            { header: "RAM", key: "ram", width: 20 },
            { header: "HDD/SSD", key: "storage", width: 16 },
            { header: "Stock", key: "stock", width: 8 },
            { header: "Price Store", key: "price_store", width: 18 },
        ];

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

        filteredLaptops.forEach((item, idx) => {
            const isEven = idx % 2 === 0;
            const rowBg = isEven ? COLOR.rowEven : COLOR.rowOdd;

            const row = ws.addRow({
                no: idx + 1,
                product: item.laptop_name || "",
                cpu: item.cpu || "",
                ram: item.ram || "",
                storage: item.storage || "",
                stock: item.qty ?? 0,
                price_store: item.selling_price || 0,
            });

            row.height = 22;
            row.eachCell((cell, colNum) => {
                const key = ws.getColumn(colNum).key as string;

                cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };
                cell.border = {
                    top: { style: "hair", color: { argb: COLOR.borderColor } },
                    left: { style: "hair", color: { argb: COLOR.borderColor } },
                    bottom: { style: "hair", color: { argb: COLOR.borderColor } },
                    right: { style: "hair", color: { argb: COLOR.borderColor } },
                };
                cell.font = { size: 10, name: "Arial" };
                cell.alignment = { vertical: "middle" };

                if (key === "no") {
                    cell.alignment = { horizontal: "center", vertical: "middle" };
                    cell.font = { size: 10, name: "Arial", color: { argb: COLOR.subTextFg } };
                } else if (key === "product") {
                    cell.font = { size: 10, name: "Arial", bold: true };
                    cell.alignment = { horizontal: "center", vertical: "middle" };
                } else if (key === "cpu" || key === "ram" || key === "storage") {
                    cell.alignment = { horizontal: "center", vertical: "middle" };
                } else if (key === "stock") {
                    cell.alignment = { horizontal: "center", vertical: "middle" };
                    if ((item.qty ?? 0) === 0) {
                        cell.font = { size: 10, name: "Arial", bold: true, color: { argb: "FF991B1B" } };
                    }
                } else if (key === "price_store") {
                    cell.numFmt = '"Rp "#,##0';
                    cell.alignment = { horizontal: "center", vertical: "middle" };
                }
            });
        });
        

        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `data_laptop_${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <>
            <style>{`
                @keyframes sk-shimmer {
                    0%   { background-position: -600px 0; }
                    100% { background-position:  600px 0; }
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
                @keyframes scaleIn {
                    from { opacity: 0; transform: scale(0.9); }
                    to { opacity: 1; transform: scale(1); }
                }
                @keyframes slideIn {
                    from { opacity: 0; transform: translateX(30px); }
                    to { opacity: 1; transform: translateX(0); }
                }
                .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
                .animate-scaleIn { animation: scaleIn 0.25s ease-out; }
                .animate-slideIn { animation: slideIn 0.3s ease-out; }
                
                .table-scroll {
                    scrollbar-width: thin;
                    scrollbar-color: #cbd5e1 #f1f5f9;
                }
                
                .table-scroll::-webkit-scrollbar {
                    height: 8px;
                    width: 8px;
                }
                
                .table-scroll::-webkit-scrollbar-track {
                    background: #f1f5f9;
                    border-radius: 10px;
                }
                
                .table-scroll::-webkit-scrollbar-thumb {
                    background: #cbd5e1;
                    border-radius: 10px;
                    transition: background 0.2s;
                }
                
                .table-scroll::-webkit-scrollbar-thumb:hover {
                    background: #94a3b8;
                }
                
                .data-row {
                    transition: all 0.2s ease;
                }
                
                .data-row:hover {
                    background-color: #fafafa;
                    transform: translateX(2px);
                }
            `}</style>

            <DashboardLayout>
                <main className="min-h-screen bg-gradient-to-br from-gray-50 to-white p-4 sm:p-6 lg:p-8">
                    <div className="max-w-full mx-auto space-y-6">

                        {/* Header dengan desain premium */}
                        <div className="flex flex-wrap items-end justify-between gap-4 animate-slideIn">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <div className="w-1 h-7 bg-gradient-to-b from-gray-600 to-gray-800 rounded-full" />
                                    <div className="w-8 h-8 bg-gradient-to-br from-gray-600 to-gray-800 rounded-xl flex items-center justify-center shadow-md">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                            <rect x="2" y="3" width="20" height="14" rx="2" />
                                            <line x1="8" y1="21" x2="16" y2="21" />
                                            <line x1="12" y1="17" x2="12" y2="21" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-900 bg-clip-text text-transparent">
                                            Data Laptop
                                        </h1>
                                        <p className="text-xs text-gray-400 mt-0.5">Kelola inventaris laptop dengan mudah</p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                {canExport && (
                                    <button
                                        onClick={exportToExcel}
                                        className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 hover:shadow-md transition-all duration-200 group"
                                    >
                                        <svg className="w-4 h-4 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                        </svg>
                                        Export Excel
                                    </button>
                                )}
                                {canCreateLaptop && (
                                    <button
                                        onClick={openCreate}
                                        className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 rounded-xl text-sm font-medium text-white hover:bg-gray-800 hover:shadow-lg transition-all duration-200 shadow-md group"
                                    >
                                        <svg className="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                        Tambah Laptop
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Filter Bar dengan desain modern */}
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 p-5 space-y-4">
                            {/* Search dan filter utama */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                                <div className="relative group">
                                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-gray-600 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                                    </svg>
                                    <input
                                        type="text"
                                        placeholder="Cari nama, brand, CPU..."
                                        className="w-full pl-9 pr-3 h-10 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all duration-200"
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                    />
                                </div>
                                {/* Search SN */}
                                <div className="relative group">
                                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-gray-600 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                    </svg>
                                    <input
                                        type="text"
                                        placeholder="Cari Serial Number..."
                                        className="w-full pl-9 pr-3 h-10 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all duration-200"
                                        value={filterSN}
                                        onChange={e => setFilterSN(e.target.value)}
                                    />
                                </div>
                                <select
                                    className="h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 ..."
                                    value={filterStatus}
                                    onChange={e => setFilterStatus(e.target.value)}
                                >
                                    <option value="ALL">📋 Semua Status</option>
                                    <option value="SIAP_JUAL">✅ Siap Jual</option>
                                    <option value="BELUM_SIAP">⏳ Belum Siap</option>
                                    <option value="SERVICE">🔧 Service</option>
                                    <option value="SOLD">💸 Sold</option>
                                </select>
                                <select
                                    className="h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all duration-200 cursor-pointer hover:bg-gray-100"
                                    value={filterBrand}
                                    onChange={e => setFilterBrand(e.target.value)}
                                >
                                    {uniqueBrands.map(b => (
                                        <option key={b} value={b}>{b === "ALL" ? "🏷️ Semua Brand" : b}</option>
                                    ))}
                                </select>
                                <button
                                    onClick={() => {
                                        setSearch("");
                                        setFilterSN("");
                                        setFilterStatus("ALL");
                                        setFilterBrand("ALL");
                                        setFilterProcessor("ALL");
                                        setFilterRam("ALL");
                                        setFilterPriceRange("ALL");
                                        setSortBy("DEFAULT");
                                    }}
                                    className="h-10 bg-gray-100 text-gray-600 rounded-xl px-3 text-sm font-medium hover:bg-gray-200 hover:text-gray-700 transition-all duration-200 flex items-center justify-center gap-1.5 group"
                                >
                                    <svg className="w-3.5 h-3.5 group-hover:rotate-180 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    Reset Filter
                                </button>
                            </div>

                            {/* Filter tambahan */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                <select
                                    className="h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all duration-200 cursor-pointer hover:bg-gray-100"
                                    value={filterProcessor}
                                    onChange={e => setFilterProcessor(e.target.value)}
                                >
                                    {uniqueProcessors.map(p => (
                                        <option key={p} value={p}>{p === "ALL" ? "💻 Semua Processor" : `🖥️ ${p}`}</option>
                                    ))}
                                </select>

                                <select
                                    className="h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all duration-200 cursor-pointer hover:bg-gray-100"
                                    value={filterRam}
                                    onChange={e => setFilterRam(e.target.value)}
                                >
                                    {uniqueRams.map(r => (
                                        <option key={r} value={r}>{r === "ALL" ? "💾 Semua RAM" : `💾 RAM ${r}`}</option>
                                    ))}
                                </select>

                                <select
                                    className="h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all duration-200 cursor-pointer hover:bg-gray-100"
                                    value={filterPriceRange}
                                    onChange={e => setFilterPriceRange(e.target.value)}
                                >
                                    <option value="ALL">💰 Semua Harga</option>
                                    <option value="1-2">💰 Rp 1 jt – 2 jt</option>
                                    <option value="2-3">💰 Rp 2 jt – 3 jt</option>
                                    <option value="3-4">💰 Rp 3 jt – 4 jt</option>
                                    <option value="4+">💰 Rp 4 jt ke atas</option>
                                </select>

                                <select
                                    className="h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all duration-200 cursor-pointer hover:bg-gray-100"
                                    value={sortBy}
                                    onChange={e => setSortBy(e.target.value)}
                                >
                                    <option value="DEFAULT">🔄 Urutan Default</option>
                                    <option value="AZ">📈 Nama: A → Z</option>
                                    <option value="ZA">📉 Nama: Z → A</option>
                                    <option value="PRICE_ASC">💰 Harga: Rendah → Tinggi</option>
                                    <option value="PRICE_DESC">💰 Harga: Tinggi → Rendah</option>
                                    <option value="SN">🔢 Urut SN</option>
                                </select>
                            </div>

                            {/* Active Filters */}
                            {(filterProcessor !== "ALL" || filterRam !== "ALL" || filterPriceRange !== "ALL" || sortBy !== "DEFAULT") && (
                                <div className="flex flex-wrap gap-2 pt-1">
                                    {filterProcessor !== "ALL" && (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 text-gray-700 text-xs font-medium rounded-full border border-gray-200">
                                            <span>🖥️</span> {filterProcessor}
                                            <button onClick={() => setFilterProcessor("ALL")} className="hover:text-red-500 transition ml-0.5">×</button>
                                        </span>
                                    )}
                                    {filterRam !== "ALL" && (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 text-gray-700 text-xs font-medium rounded-full border border-gray-200">
                                            <span>💾</span> RAM {filterRam}
                                            <button onClick={() => setFilterRam("ALL")} className="hover:text-red-500 transition ml-0.5">×</button>
                                        </span>
                                    )}
                                    {filterPriceRange !== "ALL" && (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 text-gray-700 text-xs font-medium rounded-full border border-gray-200">
                                            <span>💰</span> {filterPriceRange === "4+" ? "≥ Rp 4 jt" : `Rp ${filterPriceRange} jt`}
                                            <button onClick={() => setFilterPriceRange("ALL")} className="hover:text-red-500 transition ml-0.5">×</button>
                                        </span>
                                    )}
                                    {sortBy !== "DEFAULT" && (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 text-gray-700 text-xs font-medium rounded-full border border-gray-200">
                                            <span>📊</span> {sortBy === "AZ" ? "A→Z" : sortBy === "ZA" ? "Z→A" : sortBy === "PRICE_ASC" ? "Harga ↑" : sortBy === "PRICE_DESC" ? "Harga ↓" : "SN"}
                                            <button onClick={() => setSortBy("DEFAULT")} className="hover:text-red-500 transition ml-0.5">×</button>
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Table dengan desain modern */}
                        {isLoading ? (
                            <SkeletonTable />
                        ) : filteredLaptops.length === 0 ? (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-20 text-center animate-fadeIn">
                                <div className="text-6xl mb-4 animate-bounce">💻</div>
                                <p className="text-gray-500 font-semibold text-base">Tidak ada laptop ditemukan</p>
                                <p className="text-gray-400 text-sm mt-2">Coba ubah filter atau tambah laptop baru</p>
                            </div>
                        ) : (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                <div className="overflow-x-auto table-scroll">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-gray-50 border-b border-gray-100">
                                                <Th>No</Th>
                                                <Th>Nama Laptop</Th>
                                                <Th>Brand</Th>
                                                <Th>CPU</Th>
                                                <Th>RAM</Th>
                                                <Th>GPU</Th>
                                                <Th>Storage</Th>
                                                <Th right>Harga Jual</Th>
                                                <Th right>Stok</Th>
                                                <Th>Status</Th>
                                                <Th right>Aksi</Th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {filteredLaptops.map((item, idx) => {
                                                const s = STATUS_STYLE[item.status];
                                                return (
                                                    <tr
                                                        key={item.id}
                                                        className="group cursor-pointer data-row"
                                                        onClick={() => openDetail(item)}
                                                    >
                                                        <td className="px-4 py-3.5 text-center whitespace-nowrap w-10">
                                                            <span className="text-xs font-medium text-gray-400">{idx + 1}</span>
                                                        </td>
                                                        <td className="px-4 py-3.5 max-w-[200px]">
                                                            <span className="block font-semibold text-gray-800 truncate group-hover:text-gray-600 transition-colors" title={item.laptop_name}>
                                                                {item.laptop_name}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3.5 text-gray-500 whitespace-nowrap">
                                                            {item.brand || <span className="text-gray-300">—</span>}
                                                        </td>
                                                        <td className="px-4 py-3.5 max-w-[160px]">
                                                            <span className="block text-xs text-gray-700 font-medium truncate" title={item.cpu}>
                                                                {item.cpu || <span className="text-gray-300">—</span>}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3.5 whitespace-nowrap">
                                                            <span className="text-xs font-medium text-gray-700">
                                                                {item.ram || <span className="text-gray-300">—</span>}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3.5 max-w-[140px]">
                                                            <span className="block text-xs text-gray-600 truncate" title={item.gpu}>
                                                                {item.gpu || <span className="text-gray-300">—</span>}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3.5 whitespace-nowrap">
                                                            <span className="text-xs font-medium text-gray-700">
                                                                {item.storage || <span className="text-gray-300">—</span>}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3.5 text-right font-semibold text-gray-800 whitespace-nowrap">
                                                            {fmt(item.selling_price)}
                                                        </td>
                                                        <td className="px-4 py-3.5 text-right">
                                                            <span className={`font-medium ${(item.qty ?? 0) === 0 ? "text-red-500" : "text-gray-700"}`}>
                                                                {item.qty ?? 0}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3.5 whitespace-nowrap">
                                                            {s ? (
                                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${s.badge}`}>
                                                                    <span className={`w-1.5 h-1.5 rounded-full ${s.dot} animate-pulse`} />
                                                                    {s.label}
                                                                </span>
                                                            ) : (
                                                                <span className="text-gray-400 text-xs">{item.status}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3.5 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                                            <div className="flex items-center justify-end gap-1.5">
                                                                {userRole && hasPermission(userRole, PERMISSIONS.VIEW_BARCODE) && (
                                                                    <button
                                                                        onClick={() => setBarcodeTarget({ id: item.id, name: item.laptop_name })}
                                                                        className="p-1.5 text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 group/btn"
                                                                        title="Lihat Barcode"
                                                                    >
                                                                        <svg className="w-3.5 h-3.5 group-hover/btn:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                                                                                d="M3 9V6a1 1 0 011-1h2M3 15v3a1 1 0 001 1h2m13-13h2a1 1 0 011 1v3m0 6v3a1 1 0 01-1 1h-2M9 5v14M12 5v14M15 5v14" />
                                                                        </svg>
                                                                    </button>
                                                                )}
                                                                {canViewUnits && (
                                                                    <Link
                                                                        href={`/dashboard/laptops/${item.id}/units`}
                                                                        onClick={(e) => e.stopPropagation()}
                                                                        className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 hover:shadow-sm transition-all duration-200"
                                                                    >
                                                                        Units
                                                                    </Link>
                                                                )}
                                                                {canEditLaptop && (
                                                                    <>
                                                                        <button
                                                                            onClick={() => openEdit(item)}
                                                                            className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 hover:shadow-sm transition-all duration-200"
                                                                        >
                                                                            Edit
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleDelete(item.id)}
                                                                            className="px-3 py-1.5 text-xs font-medium text-red-500 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 hover:shadow-sm transition-all duration-200"
                                                                        >
                                                                            Hapus
                                                                        </button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/40">
                                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                                        <p className="text-xs text-gray-500">
                                            Menampilkan{" "}
                                            <span className="font-semibold text-gray-700">{filteredLaptops.length}</span>
                                            {" "}laptop
                                            {laptops.length !== filteredLaptops.length && (
                                                <span className="text-gray-400 ml-1">(difilter dari {laptops.length})</span>
                                            )}
                                        </p>
                                        <div className="flex items-center gap-4">
                                            <div className="text-right">
                                                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Total Stok</p>
                                                <p className="text-sm font-bold text-gray-700">
                                                    {filteredLaptops.reduce((s, l) => s + (l.qty ?? 0), 0)} unit
                                                </p>
                                            </div>
                                            <div className="w-px h-8 bg-gray-200" />
                                            <div className="text-right">
                                                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Total Nilai Jual</p>
                                                <p className="text-sm font-bold text-gray-900">
                                                    {fmt(filteredLaptops.reduce((s, l) => s + (l.selling_price ?? 0) * (l.qty ?? 0), 0))}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </main>

                {/* Modals dengan desain premium - tetap menggunakan struktur yang sama */}
                <Modal open={modalMode === "create"} onClose={closeModal} title="Tambah Laptop Baru" size="lg">
                    <form onSubmit={handleCreate} className="space-y-6">
                        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                            <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-gray-800">Informasi Penting</p>
                                    <p className="text-xs text-gray-600 mt-0.5">
                                        Setiap unit laptop memiliki SN, grade, dan harga modal sendiri.
                                        Data unit akan ditambahkan setelah laptop berhasil dibuat.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField label="Nama Laptop" required>
                                <input
                                    name="laptop_name"
                                    placeholder="Contoh: MacBook Air M2 2023"
                                    value={formData.laptop_name}
                                    onChange={handleFormChange}
                                    required
                                    className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all duration-200"
                                />
                            </FormField>

                            <FormField label="Brand">
                                <input
                                    name="brand"
                                    placeholder="Apple, Lenovo, Dell, ASUS..."
                                    value={formData.brand}
                                    onChange={handleFormChange}
                                    className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all duration-200"
                                />
                            </FormField>

                            <FormField label="CPU / Processor">
                                <input
                                    name="cpu"
                                    placeholder="Intel Core i7-13700H, Apple M2..."
                                    value={formData.cpu}
                                    onChange={handleFormChange}
                                    className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all duration-200"
                                />
                            </FormField>

                            <FormField label="RAM">
                                <input
                                    name="ram"
                                    placeholder="8GB, 16GB, 32GB"
                                    value={formData.ram}
                                    onChange={handleFormChange}
                                    className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all duration-200"
                                />
                            </FormField>

                            <FormField label="Storage">
                                <input
                                    name="storage"
                                    placeholder="256GB SSD, 512GB NVMe"
                                    value={formData.storage}
                                    onChange={handleFormChange}
                                    className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all duration-200"
                                />
                            </FormField>

                            <FormField label="GPU / VGA">
                                <input
                                    name="gpu"
                                    placeholder="NVIDIA RTX 4060, Intel Iris Xe"
                                    value={formData.gpu}
                                    onChange={handleFormChange}
                                    className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all duration-200"
                                />
                            </FormField>

                            <FormField label="Display / Layar">
                                <input
                                    name="display"
                                    placeholder='14" FHD IPS, 120Hz'
                                    value={formData.display}
                                    onChange={handleFormChange}
                                    className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all duration-200"
                                />
                            </FormField>

                            <FormField label="Harga Jual (Default)" required>
                                <input
                                    name="selling_price"
                                    type="number"
                                    placeholder="0"
                                    value={formData.selling_price}
                                    onChange={handleFormChange}
                                    required
                                    className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all duration-200"
                                />
                            </FormField>
                        </div>

                        <FormField label="Kondisi Umum">
                            <input
                                name="condition_note"
                                placeholder="Mulus, bekas pemakaian normal, ada goresan tipis..."
                                value={formData.condition_note}
                                onChange={handleFormChange}
                                className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all duration-200"
                            />
                        </FormField>

                        <FormField label="Catatan Tambahan">
                            <textarea
                                name="notes"
                                placeholder="Informasi tambahan tentang laptop ini..."
                                value={formData.notes}
                                onChange={handleFormChange}
                                rows={3}
                                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all duration-200 resize-none"
                            />
                        </FormField>

                        <div className="flex gap-3 pt-4 border-t border-gray-100">
                            <button
                                type="button"
                                onClick={closeModal}
                                className="flex-1 h-11 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-all duration-200"
                            >
                                Batal
                            </button>
                            <button
                                type="submit"
                                disabled={formLoading}
                                className="flex-1 h-11 bg-gray-700 text-white rounded-xl text-sm font-medium hover:bg-gray-800 hover:shadow-md transition-all duration-200 disabled:opacity-50"
                            >
                                {formLoading ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Menyimpan...
                                    </span>
                                ) : (
                                    "Buat Laptop"
                                )}
                            </button>
                        </div>
                    </form>
                </Modal>

                <Modal open={modalMode === "edit"} onClose={closeModal} title="Edit Laptop" size="lg">
                    <form onSubmit={handleEdit} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField label="Nama Laptop" required>
                                <input
                                    name="laptop_name"
                                    value={formData.laptop_name}
                                    onChange={handleFormChange}
                                    required
                                    className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all duration-200"
                                />
                            </FormField>

                            <FormField label="Brand">
                                <input
                                    name="brand"
                                    value={formData.brand}
                                    onChange={handleFormChange}
                                    className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all duration-200"
                                />
                            </FormField>

                            <FormField label="CPU / Processor">
                                <input
                                    name="cpu"
                                    value={formData.cpu}
                                    onChange={handleFormChange}
                                    className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all duration-200"
                                />
                            </FormField>

                            <FormField label="RAM">
                                <input
                                    name="ram"
                                    value={formData.ram}
                                    onChange={handleFormChange}
                                    className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all duration-200"
                                />
                            </FormField>

                            <FormField label="Storage">
                                <input
                                    name="storage"
                                    value={formData.storage}
                                    onChange={handleFormChange}
                                    className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all duration-200"
                                />
                            </FormField>

                            <FormField label="GPU / VGA">
                                <input
                                    name="gpu"
                                    value={formData.gpu}
                                    onChange={handleFormChange}
                                    className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all duration-200"
                                />
                            </FormField>

                            <FormField label="Display / Layar">
                                <input
                                    name="display"
                                    value={formData.display}
                                    onChange={handleFormChange}
                                    className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all duration-200"
                                />
                            </FormField>

                            <FormField label="Harga Jual (Default)" required>
                                <input
                                    name="selling_price"
                                    type="number"
                                    value={formData.selling_price}
                                    onChange={handleFormChange}
                                    required
                                    className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all duration-200"
                                />
                            </FormField>
                        </div>

                        <FormField label="Kondisi Umum">
                            <input
                                name="condition_note"
                                value={formData.condition_note}
                                onChange={handleFormChange}
                                className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all duration-200"
                            />
                        </FormField>

                        <FormField label="Catatan Tambahan">
                            <textarea
                                name="notes"
                                value={formData.notes}
                                onChange={handleFormChange}
                                rows={3}
                                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all duration-200 resize-none"
                            />
                        </FormField>

                        <div className="flex gap-3 pt-4 border-t border-gray-100">
                            <button
                                type="button"
                                onClick={closeModal}
                                className="flex-1 h-11 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-all duration-200"
                            >
                                Batal
                            </button>
                            <button
                                type="submit"
                                disabled={formLoading}
                                className="flex-1 h-11 bg-gray-700 text-white rounded-xl text-sm font-medium hover:bg-gray-800 hover:shadow-md transition-all duration-200 disabled:opacity-50"
                            >
                                {formLoading ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Menyimpan...
                                    </span>
                                ) : (
                                    "Simpan Perubahan"
                                )}
                            </button>
                        </div>
                    </form>
                </Modal>

                {/* Modal Detail dengan desain premium */}
                <Modal open={modalMode === "detail"} onClose={closeModal} title="Detail Laptop" size="lg">
                    {detailLoading ? (
                        <ModalDetailSkeleton />
                    ) : selectedLaptop ? (
                        <div className="space-y-6">
                            <div className="flex flex-col sm:flex-row sm:items-start gap-5 p-5 bg-gray-50 rounded-xl border border-gray-100">
                                <div className="w-14 h-14 rounded-xl bg-white border border-gray-200 shadow-sm flex items-center justify-center text-3xl">
                                    💻
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-gray-900 text-lg">{selectedLaptop.laptop_name}</h3>
                                    <p className="text-sm text-gray-500 mt-0.5">{selectedLaptop.brand || "—"}</p>
                                    <div className="flex flex-wrap gap-2 mt-3">
                                        {(() => {
                                            const s = STATUS_STYLE[selectedLaptop.status];
                                            return s ? (
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${s.badge}`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${s.dot} animate-pulse`} />
                                                    {s.label}
                                                </span>
                                            ) : null;
                                        })()}
                                        {selectedLaptop.ready_to_sell && (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                                                ✓ Ready to Sell
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="sm:text-right flex-shrink-0">
                                    <p className="text-xs text-gray-400">Harga Jual</p>
                                    <p className="text-xl font-bold text-gray-900 mt-0.5">{fmt(selectedLaptop.selling_price)}</p>
                                    <p className="text-xs text-gray-400 mt-1.5">
                                        Stok:{" "}
                                        <span className={`font-semibold ${(selectedLaptop.qty ?? 0) === 0 ? "text-red-500" : "text-gray-700"}`}>
                                            {selectedLaptop.qty ?? 0}
                                        </span>
                                        <span className="text-gray-300 ml-1">(dari units)</span>
                                    </p>
                                </div>
                            </div>

                            <div>
                                <SectionLabel>Spesifikasi Teknis</SectionLabel>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    {[
                                        { label: "CPU", value: selectedLaptop.cpu },
                                        { label: "RAM", value: selectedLaptop.ram },
                                        { label: "Storage", value: selectedLaptop.storage },
                                        { label: "GPU", value: selectedLaptop.gpu },
                                        { label: "Display", value: selectedLaptop.display },
                                    ].map(({ label, value }) => (
                                        <div key={label} className="bg-gray-50 rounded-xl p-3 border border-gray-100 hover:shadow-sm transition-all duration-200">
                                            <p className="text-xs text-gray-400 mb-1">{label}</p>
                                            <p className="text-sm font-medium text-gray-800 break-all">
                                                {value || <span className="text-gray-300 font-normal">—</span>}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-xl p-4">
                                <svg className="w-5 h-5 text-gray-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <div>
                                    <p className="text-sm font-semibold text-gray-700">Stok & harga modal dikelola per-unit</p>
                                    <p className="text-xs text-gray-600 mt-0.5">
                                        Setiap unit punya SN, grade, dan harga modal sendiri. Klik <span className="font-semibold">Lihat Units</span> untuk mengelolanya.
                                    </p>
                                </div>
                            </div>

                            {(selectedLaptop.condition_note || selectedLaptop.notes) && (
                                <div>
                                    <SectionLabel>Catatan</SectionLabel>
                                    <div className="space-y-3">
                                        {selectedLaptop.condition_note && (
                                            <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4">
                                                <p className="text-xs font-semibold text-yellow-600 mb-1">Kondisi Umum</p>
                                                <p className="text-sm text-yellow-900">{selectedLaptop.condition_note}</p>
                                            </div>
                                        )}
                                        {selectedLaptop.notes && (
                                            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                                                <p className="text-xs font-semibold text-gray-400 mb-1">Catatan Tambahan</p>
                                                <p className="text-sm text-gray-700">{selectedLaptop.notes}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                                <p className="text-xs text-gray-400">
                                    Ditambahkan {new Date(selectedLaptop.created_at).toLocaleDateString("id-ID", {
                                        day: "2-digit", month: "long", year: "numeric",
                                    })}
                                </p>
                                <div className="flex gap-2">
                                    {canViewUnits && (
                                        <Link
                                            href={`/dashboard/laptops/${selectedLaptop.id}/units`}
                                            className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 hover:shadow-sm transition-all duration-200"
                                        >
                                            Lihat Units
                                        </Link>
                                    )}
                                    {canEditLaptop && (
                                        <button
                                            onClick={() => { closeModal(); setTimeout(() => openEdit(selectedLaptop!), 60); }}
                                            className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 hover:shadow-sm transition-all duration-200"
                                        >
                                            Edit
                                        </button>
                                    )}
                                    {canEditLaptop && (
                                        <button
                                            onClick={() => handleDelete(selectedLaptop.id)}
                                            className="px-4 py-2 text-sm font-medium text-red-500 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 hover:shadow-sm transition-all duration-200"
                                        >
                                            Hapus
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : null}
                </Modal>

                {barcodeTarget && (
                    <BarcodeModal
                        laptopId={barcodeTarget.id}
                        laptopName={barcodeTarget.name}
                        onClose={() => setBarcodeTarget(null)}
                    />
                )}

                {alertModal && (
                    <AlertModal message={alertModal} onClose={() => setAlertModal(null)} />
                )}

                {confirmModal && (
                    <ConfirmModal
                        message={confirmModal.message}
                        onConfirm={confirmModal.onConfirm}
                        onCancel={() => setConfirmModal(null)}
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
                                if (!result.success) {
                                    showAlert(`Gagal menghapus: ${result.message || "Terjadi kesalahan"}`);
                                    return;
                                }
                                if (modalMode === "detail") closeModal();
                                fetchLaptops();
                                showAlert("Laptop berhasil dihapus ✅");
                            } catch {
                                showAlert("Gagal menghapus laptop. Periksa koneksi dan coba lagi.");
                            }
                        }}
                    />
                )}
            </DashboardLayout>
        </>
    );
}

// Helper Components (dengan desain yang ditingkatkan)
function SkeletonTable() {
    const rowVariants = [130, 155, 120, 140, 165, 125];
    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                            {["Nama Laptop", "Brand", "CPU", "RAM", "GPU", "Storage", "Harga Jual", "Stok", "Status", "Aksi"].map(h => (
                                <th key={h} className="px-4 py-3 text-left">
                                    <Shimmer w={80} h={11} />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {rowVariants.map((w, r) => (
                            <tr key={r}>
                                <td className="px-4 py-3.5"><Shimmer w={w} h={14} /></td>
                                <td className="px-4 py-3.5"><Shimmer w={55} h={13} /></td>
                                <td className="px-4 py-3.5"><Shimmer w={100} h={13} /></td>
                                <td className="px-4 py-3.5"><Shimmer w={40} h={13} /></td>
                                <td className="px-4 py-3.5"><Shimmer w={80} h={13} /></td>
                                <td className="px-4 py-3.5"><Shimmer w={55} h={13} /></td>
                                <td className="px-4 py-3.5"><div className="flex justify-end"><Shimmer w={90} h={14} /></div></td>
                                <td className="px-4 py-3.5"><div className="flex justify-end"><Shimmer w={20} h={14} /></div></td>
                                <td className="px-4 py-3.5"><Shimmer w={70} h={24} r="99px" /></td>
                                <td className="px-4 py-3.5"><div className="flex justify-end gap-2"><Shimmer w={44} h={28} r="8px" /><Shimmer w={36} h={28} r="8px" /></div></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/40">
                <Shimmer w={200} h={11} />
            </div>
        </div>
    );
}

function ModalDetailSkeleton() {
    return (
        <div className="space-y-6 animate-pulse">
            <div className="flex gap-5 p-5 bg-gray-50 rounded-xl border border-gray-100">
                <Shimmer w={56} h={56} r="12px" />
                <div className="flex-1 space-y-2"><Shimmer w="70%" h={18} /><Shimmer w="40%" h={14} /><div className="flex gap-2 mt-2"><Shimmer w={80} h={24} r="99px" /><Shimmer w={90} h={24} r="99px" /></div></div>
                <div className="text-right space-y-1"><Shimmer w={60} h={10} /><Shimmer w={100} h={24} /></div>
            </div>
            <div><Shimmer w={120} h={11} className="mb-2" /><div className="grid grid-cols-3 gap-3"><div className="bg-gray-50 p-3 rounded-xl border"><Shimmer w={40} h={10} className="mb-1" /><Shimmer w="80%" h={14} /></div><div className="bg-gray-50 p-3 rounded-xl border"><Shimmer w={40} h={10} className="mb-1" /><Shimmer w="70%" h={14} /></div><div className="bg-gray-50 p-3 rounded-xl border"><Shimmer w={50} h={10} className="mb-1" /><Shimmer w="90%" h={14} /></div></div></div>
            <div className="flex justify-between pt-3 border-t"><Shimmer w={100} h={11} /><div className="flex gap-2"><Shimmer w={80} h={32} r="10px" /><Shimmer w={60} h={32} r="10px" /></div></div>
        </div>
    );
}

function Modal({ open, onClose, title, children, size = "md" }: {
    open: boolean; onClose: () => void; title: string; children: React.ReactNode; size?: "md" | "lg";
}) {
    const overlayRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [open, onClose]);
    if (!open) return null;
    return (
        <div ref={overlayRef} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={e => { if (e.target === overlayRef.current) onClose(); }}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-all" />
            <div className={`relative bg-white w-full shadow-2xl flex flex-col rounded-t-2xl sm:rounded-2xl ${size === "lg" ? "sm:max-w-3xl" : "sm:max-w-lg"} max-h-[92dvh] sm:max-h-[88vh] overflow-hidden animate-slideUp`}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0 bg-white/95 backdrop-blur-sm">
                    <h2 className="font-semibold text-gray-800 text-base">{title}</h2>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all duration-200 hover:scale-110">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="overflow-y-auto flex-1 px-6 py-6">{children}</div>
            </div>
        </div>
    );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
    return (
        <th className={`px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap ${right ? "text-right" : "text-left"}`}>
            {children}
        </th>
    );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2.5">{children}</p>;
}

function FormField({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
    return (
        <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}{required && <span className="text-red-400 ml-0.5">*</span>}</label>
            {children}
        </div>
    );
}