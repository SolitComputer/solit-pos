"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Link from "next/link";
import { UserRole, PERMISSIONS, hasAnyRole, BARANG_FULL_ACCESS_ROLES, BARANG_PRIVATE_VIEW_ROLES, SO_ROLES } from "@/lib/permissions";
import UnitDetailModal, { UnitDetailData } from "@/components/inventory/UnitDetailModal";
import InventoryTable, { InventoryRow } from "@/components/inventory/InventoryTable";
import { Trash2, Package, CheckCircle2, Wrench, Wallet } from "lucide-react";
import BulkAddUnitModal from "@/components/inventory/BulkAddUnitModal";
import UnitFormModal from "@/components/inventory/UnitFormModal";
import EditablePriceCell from "@/components/inventory/EditablePriceCell";
import { exportInventoryExcel } from "@/lib/inventoryExport";
import { getAuthUser } from "@/hooks/useAuthUser";

interface LaptopUnit {
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
    received_at?: string;
    created_at: string;
    audited_at?: string | null;
    audited_by?: string | null;
    so_at?: string | null;
    so_by?: string | null;
}

interface Laptop {
    id: string;
    laptop_name: string;
    brand: string;
    cpu: string;
    ram: string;
    storage: string;
    selling_price: number;
}

const fmt = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");

const GRADE_STYLE: Record<string, { badge: string; label: string; desc: string; color: string }> = {
    A: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Grade A", desc: "Sempurna", color: "emerald" },
    B: { badge: "bg-amber-50 text-amber-700 border-amber-200", label: "Grade B", desc: "Minus", color: "amber" },
    C: { badge: "bg-red-50 text-red-700 border-red-200", label: "Grade C", desc: "Banyak minus", color: "red" },
};

const STATUS_STYLE: Record<string, { badge: string; dot: string; label: string }> = {
    SIAP_JUAL: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", label: "Siap Jual" },
    BELUM_SIAP: { badge: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-400", label: "Belum Siap" },
    SERVICE: { badge: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-500", label: "Service" },
    SOLD: { badge: "bg-gray-100 text-gray-500 border-gray-200", dot: "bg-gray-400", label: "Terjual" },
};

const GRADE_ORDER: Record<string, number> = { A: 0, B: 1, C: 2 };

//  Harus sama dengan AUDIT_TTL_MS / SO_TTL_MS di /api/units/[id]/audit & /so
const AUDIT_TTL_DAYS = 2;
const AUDIT_TTL_MS = AUDIT_TTL_DAYS * 24 * 60 * 60 * 1000;
const SO_TTL_DAYS = 1;
const SO_TTL_MS = SO_TTL_DAYS * 24 * 60 * 60 * 1000;

function isUnitAuditActive(u: LaptopUnit): boolean {
    return !!u.audited_at && Date.now() - new Date(u.audited_at).getTime() < AUDIT_TTL_MS;
}
function isUnitSOActive(u: LaptopUnit): boolean {
    return !!u.so_at && Date.now() - new Date(u.so_at).getTime() < SO_TTL_MS;
}

function sortUnits(units: LaptopUnit[]): LaptopUnit[] {
    return [...units].sort((a, b) => {
        const gradeDiff = GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade];
        if (gradeDiff !== 0) return gradeDiff;
        return b.serial_number.localeCompare(a.serial_number, undefined, { numeric: true });
    });
}

function AlertModal({ message, onClose }: { message: string; onClose: () => void }) {
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-xs p-5 text-center">
                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <p className="text-gray-700 text-sm font-medium mb-4">{message}</p>
                <button
                    onClick={onClose}
                    className="w-full h-9 bg-[#1a1a2e] text-white rounded-lg text-sm font-medium hover:bg-[#16213e] transition"
                >
                    OK
                </button>
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-5">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3 ${danger ? "bg-red-50" : "bg-amber-50"}`}>
                    <svg className={`w-5 h-5 ${danger ? "text-red-500" : "text-amber-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <p className="text-gray-700 text-sm text-center leading-relaxed mb-4">{message}</p>
                <div className="flex gap-2">
                    <button onClick={onCancel}
                        className="flex-1 h-9 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition">
                        Batal
                    </button>
                    <button onClick={onConfirm}
                        className={`flex-1 h-9 rounded-lg text-sm font-semibold text-white transition ${danger ? "bg-red-500 hover:bg-red-600" : "bg-amber-500 hover:bg-amber-600"}`}>
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}


// ── Toast notifikasi ringan ─────────────────────────────────────────────────
function Toast({ message, onDone }: { message: string; onDone: () => void }) {
    useEffect(() => {
        const t = setTimeout(onDone, 2500);
        return () => clearTimeout(t);
    }, [onDone]);

    return (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 animate-in slide-in-from-bottom-4">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {message}
        </div>
    );
}

//  4 komponen di bawah ini disalin identik dari LaptopsContent.tsx supaya
//  gaya visual halaman Units 1:1 sama dengan Data Laptop.
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

function TotalPill({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <div className="inline-flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl pl-2.5 pr-3 py-1.5">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">{label}</span>
            <span className={`text-sm font-black tabular-nums ${color}`}>{value}</span>
        </div>
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

export default function UnitsPage() {
    const params = useParams();
    const laptopId = params.id as string;

    const [laptop, setLaptop] = useState<Laptop | null>(null);
    const [units, setUnits] = useState<LaptopUnit[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [showForm, setShowForm] = useState(false);
    const [editingUnit, setEditingUnit] = useState<LaptopUnit | null>(null);

    const [filterStatus, setFilterStatus] = useState("ALL");
    const [filterGradeTab, setFilterGradeTab] = useState("ALL");
    const [searchSN, setSearchSN] = useState("");
    const [filterPriceMin, setFilterPriceMin] = useState("");
    const [filterPriceMax, setFilterPriceMax] = useState("");
    const [showAdvancedFilter, setShowAdvancedFilter] = useState(false);

    const [userRoles, setUserRoles] = useState<UserRole[]>([]);
    const canManageUnits = hasAnyRole(userRoles, PERMISSIONS.EDIT_UNITS);
    const canAuditUnits = hasAnyRole(userRoles, BARANG_PRIVATE_VIEW_ROLES);
    const canSOUnits = hasAnyRole(userRoles, SO_ROLES);
    const canSeePriceInfo = hasAnyRole(userRoles, [
        "ADMIN", "PROGRAMMER", "ASISTEN_CEO", "PENGELOLA_BARANG",
        "KEPALA_PENGELOLA_BARANG", "KEPALA_TEKNISI", "ACCOUNTING",
    ] as UserRole[]);
    //  Daftar role sama persis dgn canExport di Data Barang (LaptopsContent.tsx)
    //  supaya hak akses export Excel konsisten di kedua halaman.
    const canExport = hasAnyRole(userRoles, [
        "ADMIN", "PROGRAMMER", "ASISTEN_CEO", "KEPALA_SALES", "ACCOUNTING", "PENGELOLA_BARANG",
        "KEPALA_PENGELOLA_BARANG", "KEPALA_TEKNISI", "KEPALA_SOTECH",
        "MARKETING", "KEPALA_MARKETING",
    ] as UserRole[]);
    //  Full Access → boleh toggle mode Edit di Pop-up Detail unit
    const canFullAccessBarang = hasAnyRole(userRoles, BARANG_FULL_ACCESS_ROLES);
    //  Unit yang sedang dibuka di Pop-up Detail
    const [detailUnit, setDetailUnit] = useState<LaptopUnit | null>(null);

    const [alertModal, setAlertModal] = useState<string | null>(null);
    const [confirmModal, setConfirmModal] = useState<{ message: string; onConfirm: () => void } | null>(null);
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [toast, setToast] = useState("");
    const [auditingUnitId, setAuditingUnitId] = useState<string | null>(null);
    const [soUnitId, setSoUnitId] = useState<string | null>(null);
    const [filterAudit, setFilterAudit] = useState<"ALL" | "AUDITED" | "UNAUDITED">("ALL");
    const [filterSO, setFilterSO] = useState<"ALL" | "SO" | "BELUM_SO">("ALL");
    //  Riwayat audit/SO per unit — dibuka lewat tombol jam di kolom Audit/SO
    const [historyTarget, setHistoryTarget] = useState<{ id: string; name: string } | null>(null);
    const [soHistoryTarget, setSoHistoryTarget] = useState<{ id: string; name: string } | null>(null);
    //  Bulk edit "Sumber Barang" — set 1x untuk semua unit model ini
    const [showSourceModal, setShowSourceModal] = useState(false);
    const [sourceInput, setSourceInput] = useState("");
    const [sourceSaving, setSourceSaving] = useState(false);

    //  Bulk edit "Harga Store", "Harga Sparepart" & "Harga Official" — set 1x untuk semua unit model ini
    const [showPriceModal, setShowPriceModal] = useState(false);
    const [priceInput, setPriceInput] = useState({ selling_price: "", sparepart_cost: "", official_price: "" });
    const [priceSaving, setPriceSaving] = useState(false);

    //  Sort kolom tabel — pola sama persis dgn LaptopsContent.tsx supaya klik header konsisten
    const [sortBy, setSortBy] = useState("DEFAULT");
    const handleSort = (asc: string, desc: string) => {
        setSortBy(prev => (prev === asc ? desc : asc));
    };

    const activeUnits = units.filter(u => u.status !== "SOLD");


    useEffect(() => {
        getAuthUser().then(u => ({ success: true, user: u }))
            .then(r => {
                const roles: string[] =
                    Array.isArray(r.user?.roles) && r.user.roles.length > 0
                        ? r.user.roles
                        : r.user?.role ? [r.user.role] : [];
                setUserRoles(roles as UserRole[]);
            })
            .catch(() => setUserRoles([]));
    }, []);

    const fmtDate = (iso: string) => {
        if (!iso) return "—";
        return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
    };

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [laptopRes, unitsRes] = await Promise.all([
                fetch(`/api/laptops/${laptopId}`),
                fetch(`/api/laptops/${laptopId}/units`),
            ]);
            const laptopData = await laptopRes.json();
            const unitsData = await unitsRes.json();
            if (laptopData.data) {
                setLaptop({ ...laptopData.data, selling_price: Math.round(Number(laptopData.data.selling_price) || 0) });
            }
            if (unitsData.data) {
                const normalized: LaptopUnit[] = (unitsData.data).map((u: LaptopUnit) => ({
                    ...u,
                    purchase_price: Math.round(Number(u.purchase_price) || 0),
                    sparepart_cost: Math.round(Number(u.sparepart_cost) || 0),
                    selling_price: Math.round(Number(u.selling_price) || 0),
                    official_price: Math.round(Number(u.official_price) || 0),
                }));
                setUnits(normalized);
            }
        } catch { /* ignore */ } finally {
            setIsLoading(false);
        }
    }, [laptopId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    useEffect(() => { setSelectedIds(new Set()); }, [filterStatus, filterGradeTab, searchSN]);

    const syncLaptopStats = useCallback(async (latestUnits: LaptopUnit[]) => {
        const siapCount = latestUnits.filter(u => u.status === "SIAP_JUAL").length;
        const newStatus = siapCount > 0 ? "SIAP_JUAL" : latestUnits.length === 0 ? "BELUM_SIAP" : "SOLD";
        try {
            await fetch(`/api/laptops/${laptopId}/sync-units`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ qty: siapCount, status: newStatus }),
            });
        } catch { /* non-blocking */ }
    }, [laptopId]);

    const handlePriceSaved = useCallback((unitId: string, newPrice: number) => {
        setUnits(prev => prev.map(u =>
            u.id === unitId ? { ...u, purchase_price: newPrice } : u
        ));
        setToast("Harga modal berhasil diperbarui!");
    }, []);

    const toggleUnitAudit = async (unit: LaptopUnit) => {
        setAuditingUnitId(unit.id);
        try {
            const res = await fetch(`/api/units/${unit.id}/audit`, { method: "PATCH" });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.message || "Gagal update audit");
            const wasActive = isUnitAuditActive(unit);
            setUnits(prev => prev.map(u => u.id === unit.id ? { ...u, ...json.data } : u));
            setToast(wasActive ? "Audit unit dibatalkan" : "Unit ditandai sudah diaudit");
        } catch (e) {
            setAlertModal(e instanceof Error ? e.message : "Gagal update audit");
        } finally {
            setAuditingUnitId(null);
        }
    };

    const toggleUnitSO = async (unit: LaptopUnit) => {
        setSoUnitId(unit.id);
        try {
            const res = await fetch(`/api/units/${unit.id}/so`, { method: "PATCH" });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.message || "Gagal update SO");
            const wasActive = isUnitSOActive(unit);
            setUnits(prev => prev.map(u => u.id === unit.id ? { ...u, ...json.data } : u));
            setToast(wasActive ? "SO unit dibatalkan" : "Unit ditandai sudah SO");
        } catch (e) {
            setAlertModal(e instanceof Error ? e.message : "Gagal update SO");
        } finally {
            setSoUnitId(null);
        }
    };

    const filteredUnits = useMemo(() => {
        const list = sortUnits(
            activeUnits.filter(u => {
                if (filterStatus !== "ALL" && u.status !== filterStatus) return false;
                if (filterGradeTab !== "ALL" && u.grade !== filterGradeTab) return false;
                if (searchSN && !u.serial_number.toLowerCase().includes(searchSN.toLowerCase())) return false;
                if (filterPriceMin && u.selling_price < Number(filterPriceMin)) return false;
                if (filterPriceMax && u.selling_price > Number(filterPriceMax)) return false;
                if (filterAudit === "AUDITED" && !isUnitAuditActive(u)) return false;
                if (filterAudit === "UNAUDITED" && isUnitAuditActive(u)) return false;
                if (filterSO === "SO" && !isUnitSOActive(u)) return false;
                if (filterSO === "BELUM_SO" && isUnitSOActive(u)) return false;
                return true;
            })
        );

        //  Sort override — field disesuaikan ke level unit (bukan model laptop kayak di LaptopsContent)
        switch (sortBy) {
            case "PRICE_ASC": list.sort((a, b) => (a.selling_price || 0) - (b.selling_price || 0)); break;
            case "PRICE_DESC": list.sort((a, b) => (b.selling_price || 0) - (a.selling_price || 0)); break;
            case "TOTAL_JUAL_ASC": list.sort((a, b) => (a.selling_price || 0) - (b.selling_price || 0)); break;
            case "TOTAL_JUAL_DESC": list.sort((a, b) => (b.selling_price || 0) - (a.selling_price || 0)); break;
            case "MODAL_ASC": list.sort((a, b) => (a.purchase_price || 0) - (b.purchase_price || 0)); break;
            case "MODAL_DESC": list.sort((a, b) => (b.purchase_price || 0) - (a.purchase_price || 0)); break;
           case "SPAREPART_ASC": list.sort((a, b) => (a.sparepart_cost || 0) - (b.sparepart_cost || 0)); break;
            case "SPAREPART_DESC": list.sort((a, b) => (b.sparepart_cost || 0) - (a.sparepart_cost || 0)); break;
            case "TOTAL_MODAL_ASC": list.sort((a, b) => ((a.purchase_price || 0) + (a.sparepart_cost || 0)) - ((b.purchase_price || 0) + (b.sparepart_cost || 0))); break;
            case "TOTAL_MODAL_DESC": list.sort((a, b) => ((b.purchase_price || 0) + (b.sparepart_cost || 0)) - ((a.purchase_price || 0) + (a.sparepart_cost || 0))); break;
            case "SUMBER_ASC": list.sort((a, b) => (a.source || "").localeCompare(b.source || "", "id")); break;
            case "SUMBER_DESC": list.sort((a, b) => (b.source || "").localeCompare(a.source || "", "id")); break;
            case "TANGGAL_ASC": list.sort((a, b) => (a.created_at || "").localeCompare(b.created_at || "")); break;
            case "TANGGAL_DESC": list.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "")); break;
            case "AUDIT_ASC": list.sort((a, b) => (isUnitAuditActive(a) ? 1 : 0) - (isUnitAuditActive(b) ? 1 : 0)); break;
            case "AUDIT_DESC": list.sort((a, b) => (isUnitAuditActive(b) ? 1 : 0) - (isUnitAuditActive(a) ? 1 : 0)); break;
            case "SN": list.sort((a, b) => a.serial_number.localeCompare(b.serial_number, undefined, { numeric: true })); break;
            default: break; // DEFAULT → tetap urutan sortUnits() (grade lalu SN)
        }
        return list;
    }, [activeUnits, filterStatus, filterGradeTab, searchSN, filterPriceMin, filterPriceMax, filterAudit, filterSO, sortBy]);

    const hasActiveFilter = searchSN || filterPriceMin || filterPriceMax || filterAudit !== "ALL" || filterSO !== "ALL" || sortBy !== "DEFAULT";
    const isAllSelected = filteredUnits.length > 0 && filteredUnits.every(u => selectedIds.has(u.id));
    const isIndeterminate = filteredUnits.some(u => selectedIds.has(u.id)) && !isAllSelected;

    const toggleSelectAll = () => {
        if (isAllSelected) { setSelectedIds(new Set()); }
        else { setSelectedIds(new Set(filteredUnits.map(u => u.id))); }
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleBulkDelete = () => {
        if (selectedIds.size === 0) return;
        setConfirmModal({
            message: `Hapus ${selectedIds.size} unit yang dipilih? Tindakan ini tidak dapat dibatalkan.`,
            onConfirm: async () => {
                setConfirmModal(null);
                setBulkDeleting(true);
                try {
                    await Promise.all(Array.from(selectedIds).map(id => fetch(`/api/units/${id}`, { method: "DELETE" })));
                    const freshRes = await fetch(`/api/laptops/${laptopId}/units`);
                    const freshData = await freshRes.json();
                    const freshUnits: LaptopUnit[] = freshData.data || [];
                    setUnits(freshUnits);
                    await syncLaptopStats(freshUnits);
                    setSelectedIds(new Set());
                } catch {
                    setAlertModal("Gagal menghapus beberapa unit");
                } finally {
                    setBulkDeleting(false);
                }
            },
        });
    };

    const counts = {
        total: activeUnits.length,
        siap: activeUnits.filter(u => u.status === "SIAP_JUAL").length,
        sold: units.filter(u => u.status === "SOLD").length,
        service: activeUnits.filter(u => u.status === "SERVICE").length,
        belum: activeUnits.filter(u => u.status === "BELUM_SIAP").length,
        gradeA: activeUnits.filter(u => u.grade === "A").length,
        gradeB: activeUnits.filter(u => u.grade === "B").length,
        gradeC: activeUnits.filter(u => u.grade === "C").length,
    };

    //  Total Keseluruhan untuk bar ringkasan di atas tabel — dihitung dari
    //  filteredUnits (ikut filter aktif), pola sama dgn LaptopsContent.tsx
   const totalModalLaptop = filteredUnits.reduce((s, u) => s + (u.purchase_price ?? 0), 0);
    const totalModalSparepart = filteredUnits.reduce((s, u) => s + (u.sparepart_cost ?? 0), 0);
    const totalModal = totalModalLaptop + totalModalSparepart;
    const totalGrossProfit = filteredUnits.reduce((s, u) => s + ((u.selling_price || 0) - (u.sparepart_cost || 0) - (u.purchase_price || 0)), 0);
    const totalHargaJual = filteredUnits.reduce((s, u) => s + (u.selling_price || 0), 0);
    const totalNilaiJual = totalHargaJual; //  qty per unit selalu 1, jadi sama dgn Harga Jual

    //  Mapping unit → baris tabel. Struktur kolom identik dgn Data Barang,
    //  bedanya di sini ST/SJ/M bernilai 0 atau 1 karena 1 baris = 1 unit.
    const tableRows: InventoryRow[] = filteredUnits.map(u => ({
        id: u.id,
        laptop_name: laptop?.laptop_name ?? "—",
        cpu: laptop?.cpu ?? "",
        ram: laptop?.ram ?? "",
        storage: laptop?.storage ?? "",
        harga_modal: u.purchase_price ?? 0,
        sparepart_modal: u.sparepart_cost ?? 0,
        total_modal: (u.purchase_price ?? 0) + (u.sparepart_cost ?? 0),
        harga_jual: u.selling_price ?? 0,
        official_price: u.official_price ?? 0,
        gross_profit: (u.selling_price ?? 0) - (u.sparepart_cost ?? 0) - (u.purchase_price ?? 0),
        sumber: u.source ?? null,
        tanggal_masuk: u.created_at ?? null,
        sn: u.serial_number,
        stok_tersisa: u.status !== "SOLD" ? 1 : 0,
        siap_jual: u.status === "SIAP_JUAL" ? 1 : 0,
        minus: (u.status === "SERVICE" || u.status === "BELUM_SIAP") ? 1 : 0,
        is_audited: isUnitAuditActive(u),
        audited_at: u.audited_at ?? null,
        is_so_active: isUnitSOActive(u),
        so_at: u.so_at ?? null,
    }));

    const openCreate = () => {
        setEditingUnit(null);
        setShowForm(true);
    };

    const openEdit = (unit: LaptopUnit) => {
        setEditingUnit(unit);
        setShowForm(true);
    };

    const closeForm = () => { setShowForm(false); setEditingUnit(null); };

    const handleFormSuccess = async () => {
        const freshRes = await fetch(`/api/laptops/${laptopId}/units`);
        const freshData = await freshRes.json();
        const freshUnits: LaptopUnit[] = freshData.data || [];
        setUnits(freshUnits);
        await syncLaptopStats(freshUnits);
    };

    const handleDelete = (unit: LaptopUnit) => {
        setConfirmModal({
            message: `Hapus unit SN: ${unit.serial_number}?`,
            onConfirm: async () => {
                setConfirmModal(null);
                try {
                    await fetch(`/api/units/${unit.id}`, { method: "DELETE" });
                    const freshRes = await fetch(`/api/laptops/${laptopId}/units`);
                    const freshData = await freshRes.json();
                    const freshUnits: LaptopUnit[] = freshData.data || [];
                    setUnits(freshUnits);
                    await syncLaptopStats(freshUnits);
                } catch { setAlertModal("Gagal menghapus"); }
            },
        });
    };

    const resetFilters = () => {
        setSearchSN(""); setFilterPriceMin(""); setFilterPriceMax("");
        setFilterStatus("ALL"); setFilterGradeTab("ALL");
        setFilterAudit("ALL"); setFilterSO("ALL"); setSortBy("DEFAULT");
    };

    // ─── Export Excel ─────────────────────────────────────────────────────────
    //  Struktur sama persis dgn export di Data Barang (2 sheet: "Data Laptop" &
    //  "Detail Unit"), bedanya di sini isinya cuma 1 model laptop dgn semua unit
    //  yang sedang tampil (ikut filter grade/status/SN aktif di halaman ini).
    const exportToExcel = async () => {
        if (!laptop) return;

        const filterLabel = [
            filterGradeTab !== "ALL" && `Grade ${filterGradeTab}`,
            filterStatus !== "ALL" && (STATUS_STYLE[filterStatus]?.label ?? filterStatus),
            searchSN.trim() && `Cari SN "${searchSN.trim()}"`,
        ].filter(Boolean).join(" · ");

        const siapCount = filteredUnits.filter(u => u.status === "SIAP_JUAL").length;
        const minusCount = filteredUnits.filter(u => u.status === "SERVICE" || u.status === "BELUM_SIAP").length;

        await exportInventoryExcel({
            laptops: [{
                id: laptop.id,
                laptop_name: laptop.laptop_name,
                brand: laptop.brand,
                cpu: laptop.cpu,
                ram: laptop.ram,
                storage: laptop.storage,
                selling_price: laptop.selling_price,
                stok_tersedia: siapCount + minusCount,
                siap_jual: siapCount,
                stok_minus: minusCount,
                terjual: filteredUnits.filter(u => u.status === "SOLD").length,
                laptop_units: filteredUnits,
            }],
            canSeePrivate: canSeePriceInfo,
            filterLabel: filterLabel ? `Filter: ${filterLabel}` : "Tanpa filter",
            fileSuffix: `_${(laptop.laptop_name || "unit").replace(/\s+/g, "_").toLowerCase()}`,
        });
    };

    //  Buka modal set-harga. Prefill kalau semua unit harganya sudah sama.
    const openPriceModal = () => {
        const sellPrices = Array.from(new Set(activeUnits.map(u => u.selling_price)));
        const sparePrices = Array.from(new Set(activeUnits.map(u => u.sparepart_cost ?? 0)));
        const officialPrices = Array.from(new Set(activeUnits.map(u => u.official_price ?? 0)));
        setPriceInput({
            selling_price: sellPrices.length === 1 ? String(sellPrices[0]) : "",
            sparepart_cost: sparePrices.length === 1 ? String(sparePrices[0]) : "",
            official_price: officialPrices.length === 1 ? String(officialPrices[0]) : "",
        });
        setShowPriceModal(true);
    };

    //  Update Harga Store, Harga Sparepart & Harga Official SEMUA unit laptop ini
    //  sekaligus. Field yang dikosongkan tidak ikut diubah (bisa update sebagian saja).
    const handleBulkPrice = async () => {
        setPriceSaving(true);
        try {
            const body: Record<string, number> = {};
            if (priceInput.selling_price.trim() !== "") body.selling_price = Number(priceInput.selling_price);
            if (priceInput.sparepart_cost.trim() !== "") body.sparepart_cost = Number(priceInput.sparepart_cost);
            if (priceInput.official_price.trim() !== "") body.official_price = Number(priceInput.official_price);

            const res = await fetch(`/api/laptops/${laptopId}/units/price`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.message || "Gagal memperbarui harga");

            const freshRes = await fetch(`/api/laptops/${laptopId}/units`);
            const freshData = await freshRes.json();
            setUnits(freshData.data || []);

            setShowPriceModal(false);
            setToast(`Harga ${json.updated ?? 0} unit berhasil diperbarui!`);
        } catch (e) {
            setAlertModal(e instanceof Error ? e.message : "Gagal memperbarui harga");
        } finally {
            setPriceSaving(false);
        }
    };

    //  Buka modal set-sumber. Kalau semua unit sumbernya sudah sama, prefill.
    const openSourceModal = () => {
        const sources = Array.from(new Set(activeUnits.map(u => u.source).filter(Boolean)));
        setSourceInput(sources.length === 1 ? String(sources[0]) : "");
        setShowSourceModal(true);
    };

    //  Update source SEMUA unit laptop ini sekaligus (bukan 1-1).
    const handleBulkSource = async () => {
        setSourceSaving(true);
        try {
            const res = await fetch(`/api/laptops/${laptopId}/units/source`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ source: sourceInput.trim() }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.message || "Gagal memperbarui sumber");

            const freshRes = await fetch(`/api/laptops/${laptopId}/units`);
            const freshData = await freshRes.json();
            setUnits(freshData.data || []);

            setShowSourceModal(false);
            setSourceInput("");
            setToast(`Sumber ${json.updated ?? 0} unit berhasil diperbarui!`);
        } catch (e) {
            setAlertModal(e instanceof Error ? e.message : "Gagal memperbarui sumber");
        } finally {
            setSourceSaving(false);
        }
    };

    return (
        <DashboardLayout>
            <style>{`
                @keyframes fadeIn  { from { opacity: 0; } to { opacity: 1; } }
                @keyframes popIn   { from { opacity: 0; transform: scale(0.94) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
                @keyframes slideDown { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes slideUp   { from { opacity: 0; transform: translateY(16px);  } to { opacity: 1; transform: translateY(0); } }
                .animate-fadeIn    { animation: fadeIn    0.2s  ease-out; }
                .animate-popIn     { animation: popIn     0.25s cubic-bezier(0.34,1.56,0.64,1); }
                .animate-slideDown { animation: slideDown 0.3s  ease-out; }
                .animate-slideUp   { animation: slideUp   0.3s  ease-out; }
                .filter-select {
                    appearance: none;
                    background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e");
                    background-position: right 10px center;
                    background-repeat: no-repeat;
                    background-size: 16px;
                    padding-right: 32px !important;
                }
            `}</style>
            <main className="min-h-screen bg-gradient-to-br from-gray-50 to-white p-4 sm:p-6 lg:p-8">
                <div className="max-w-full mx-auto space-y-5">

                    {/* Breadcrumb */}
                    <div className="flex items-center gap-2 text-sm">
                        <Link href="/dashboard/data-barang?tab=laptops" className="text-gray-400 hover:text-gray-600 transition">Data Laptop</Link>
                        <svg className="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span className="text-gray-600 font-medium truncate">{isLoading ? "Memuat..." : laptop?.laptop_name || "Units"}</span>
                    </div>

                    {/* Header */}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <div className="w-7 h-7 bg-gradient-to-br from-[#1a1a2e] to-[#16213e] rounded-lg flex items-center justify-center">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                        <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
                                    </svg>
                                </div>
                                <h1 className="text-xl font-bold text-[#1a1a2e] tracking-tight">{laptop?.laptop_name || "—"}</h1>
                            </div>
                            <p className="text-xs text-gray-400 ml-9">
                                {[laptop?.brand, laptop?.cpu, laptop?.ram, laptop?.storage].filter(Boolean).join(" · ") || "Detail laptop"}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">

                            {canExport && (
                                <button onClick={exportToExcel}
                                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition shadow-sm">
                                    <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                    Export Excel
                                </button>
                            )}

                            {canManageUnits && (
                                <>
                                    <button onClick={openCreate}
                                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#1a1a2e] rounded-lg text-sm font-medium text-white hover:bg-[#16213e] transition shadow-sm">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                        Tambah Unit
                                    </button>
                                    <button onClick={() => setShowBulkModal(true)}
                                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-600 rounded-lg text-sm font-medium text-white transition shadow-sm">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        Tambah Banyak
                                    </button>
                                </>
                            )}

                            {canManageUnits && activeUnits.length > 0 && (
                                <button onClick={openSourceModal}
                                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition shadow-sm">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5a2 2 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
                                    </svg>
                                    Set Sumber
                                </button>
                            )}
                            {canManageUnits && activeUnits.length > 0 && (
                                <button onClick={openPriceModal}
                                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition shadow-sm">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m-6 4h6m-6 4h4M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                    </svg>
                                    Set Harga
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Stats Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 animate-slideDown">
                        <StatCard label="Total Unit" value={`${counts.total} unit`} accent="bg-gray-700"
                            icon={<Package size={16} className="text-gray-600" />} />
                        <StatCard label="Siap Jual" value={`${counts.siap} unit`} accent="bg-green-500"
                            icon={<CheckCircle2 size={16} className="text-green-600" />} />
                        <StatCard label="Belum Siap" value={`${counts.belum} unit`} accent="bg-amber-400"
                            icon={<svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>} />
                        <StatCard label="Service" value={`${counts.service} unit`} accent="bg-blue-500"
                            icon={<Wrench size={16} className="text-blue-600" />} />
                        <StatCard label="Terjual" value={`${counts.sold} unit`} accent="bg-gray-400"
                            icon={<Wallet size={16} className="text-gray-500" />} />
                    </div>

                    {/* Grade Tabs */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-1.5 animate-slideDown">
                        <div className="flex gap-1.5">
                            {[
                                { value: "ALL", label: "Semua Grade", count: units.length },
                                { value: "A", label: "Grade A", count: counts.gradeA },
                                { value: "B", label: "Grade B", count: counts.gradeB },
                                { value: "C", label: "Grade C", count: counts.gradeC },
                            ].map(opt => {
                                const isActive = filterGradeTab === opt.value;
                                let activeStyle = "bg-[#1a1a2e] text-white";
                                if (opt.value === "A" && isActive) activeStyle = "bg-gray-400 text-white";
                                if (opt.value === "B" && isActive) activeStyle = "bg-amber-400 text-white";
                                if (opt.value === "C" && isActive) activeStyle = "bg-red-500 text-white";
                                return (
                                    <button key={opt.value} onClick={() => setFilterGradeTab(opt.value)}
                                        className={`flex-1 flex flex-col items-center py-2 px-1 rounded-lg text-center transition-all ${isActive ? activeStyle : "text-gray-500 hover:bg-gray-50"}`}>
                                        <span className={`text-[10px] font-medium leading-tight ${isActive ? "opacity-80" : "opacity-60"}`}>{opt.label}</span>
                                        <span className="text-sm font-bold leading-tight mt-0.5">{opt.count}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Status Filter Tabs */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-2 animate-slideDown">
                        <div className="flex flex-wrap gap-1.5">
                            {[
                                { value: "ALL", label: "Semua Status", count: filterGradeTab === "ALL" ? units.length : units.filter(u => u.grade === filterGradeTab).length },
                                { value: "SIAP_JUAL", label: "Siap Jual", count: units.filter(u => (filterGradeTab === "ALL" || u.grade === filterGradeTab) && u.status === "SIAP_JUAL").length },
                                { value: "BELUM_SIAP", label: "Belum Siap", count: units.filter(u => (filterGradeTab === "ALL" || u.grade === filterGradeTab) && u.status === "BELUM_SIAP").length },
                                { value: "SERVICE", label: "Service", count: units.filter(u => (filterGradeTab === "ALL" || u.grade === filterGradeTab) && u.status === "SERVICE").length },
                            ].map(opt => (
                                <button key={opt.value} onClick={() => setFilterStatus(opt.value)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${filterStatus === opt.value ? "bg-[#1a1a2e] text-white shadow-sm" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                                    {opt.label}
                                    <span className={`ml-1.5 px-1.5 py-0.5 rounded text-xs ${filterStatus === opt.value ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}>
                                        {opt.count}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Search & Filter */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3.5 animate-slideDown">
                        <div className="flex flex-wrap gap-2">
                            <div className="relative flex-1 min-w-[180px]">
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input type="text" placeholder="Cari serial number..." value={searchSN} onChange={e => setSearchSN(e.target.value)}
                                    className="w-full h-9 border border-gray-200 rounded-xl pl-9 pr-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400/20 focus:border-gray-400 focus:bg-white transition-all duration-150" />
                                {searchSN && (
                                    <button onClick={() => setSearchSN("")} className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 transition">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                            {canAuditUnits && (
                                <FilterSelect value={filterAudit} onChange={e => setFilterAudit(e.target.value as typeof filterAudit)}>
                                    <option value="ALL">Semua Audit</option>
                                    <option value="AUDITED">Sudah Audit</option>
                                    <option value="UNAUDITED">Belum Audit</option>
                                </FilterSelect>
                            )}
                            {canSOUnits && (
                                <FilterSelect value={filterSO} onChange={e => setFilterSO(e.target.value as typeof filterSO)}>
                                    <option value="ALL">Semua SO</option>
                                    <option value="SO">Sudah SO</option>
                                    <option value="BELUM_SO">Belum SO</option>
                                </FilterSelect>
                            )}
                            <FilterSelect value={sortBy} onChange={e => setSortBy(e.target.value)}>
                                <option value="DEFAULT">Urutan Default</option>
                                <option value="PRICE_ASC">Harga Jual: Rendah → Tinggi</option>
                                <option value="PRICE_DESC">Harga Jual: Tinggi → Rendah</option>
                                {canSeePriceInfo && <option value="MODAL_ASC">Harga Modal: Rendah → Tinggi</option>}
                                {canSeePriceInfo && <option value="MODAL_DESC">Harga Modal: Tinggi → Rendah</option>}
                               {canSeePriceInfo && <option value="SPAREPART_ASC">Modal Sparepart: Rendah → Tinggi</option>}
                                {canSeePriceInfo && <option value="SPAREPART_DESC">Modal Sparepart: Tinggi → Rendah</option>}
                                {canSeePriceInfo && <option value="TOTAL_MODAL_ASC">Total Modal: Rendah → Tinggi</option>}
                                {canSeePriceInfo && <option value="TOTAL_MODAL_DESC">Total Modal: Tinggi → Rendah</option>}
                                {canSeePriceInfo && <option value="SUMBER_ASC">Sumber: A → Z</option>}
                                {canSeePriceInfo && <option value="SUMBER_DESC">Sumber: Z → A</option>}
                                {canSeePriceInfo && <option value="TANGGAL_ASC">Tanggal Masuk: Lama → Baru</option>}
                                {canSeePriceInfo && <option value="TANGGAL_DESC">Tanggal Masuk: Baru → Lama</option>}
                                {canAuditUnits && <option value="AUDIT_DESC">Audit: Sudah Diaudit Dulu</option>}
                                {canAuditUnits && <option value="AUDIT_ASC">Audit: Belum Diaudit Dulu</option>}
                                <option value="SN">Urut SN</option>
                            </FilterSelect>
                            <button onClick={() => setShowAdvancedFilter(v => !v)}
                                className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-medium border transition-all duration-150 ${showAdvancedFilter || filterPriceMin || filterPriceMax ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                                </svg>
                                Filter
                                {(filterPriceMin || filterPriceMax) && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                            </button>
                            {hasActiveFilter && (
                                <button onClick={resetFilters} className="inline-flex items-center gap-1 px-2.5 h-9 rounded-xl text-xs font-medium text-red-500 border border-red-200 bg-red-50 hover:bg-red-100 active:scale-[0.97] transition-all duration-150">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    Reset
                                </button>
                            )}
                        </div>
                        {showAdvancedFilter && (
                            <div className="border-t border-gray-100 pt-3 grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Harga Jual Min (Rp)</label>
                                    <input type="number" placeholder="Contoh: 1000000" value={filterPriceMin} onChange={e => setFilterPriceMin(e.target.value)}
                                        className="w-full h-9 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400/20 focus:border-gray-400 focus:bg-white transition-all duration-150" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Harga Jual Max (Rp)</label>
                                    <input type="number" placeholder="Contoh: 5000000" value={filterPriceMax} onChange={e => setFilterPriceMax(e.target.value)}
                                        className="w-full h-9 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400/20 focus:border-gray-400 focus:bg-white transition-all duration-150" />
                                </div>
                            </div>
                        )}
                        {sortBy !== "DEFAULT" && (
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                                <FilterChip label={`Sort: ${sortBy}`} onRemove={() => setSortBy("DEFAULT")} />
                            </div>
                        )}
                    </div>

                    {/* Bulk Action Bar */}
                    {selectedIds.size > 0 && (
                        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                            <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded bg-red-500 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                    </svg>
                                </span>
                                <p className="text-sm font-semibold text-red-700">{selectedIds.size} unit dipilih</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setSelectedIds(new Set())} className="text-xs text-red-500 font-medium underline underline-offset-2 active:opacity-60 transition">Batal pilih</button>
                                <button onClick={handleBulkDelete} disabled={bulkDeleting}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-semibold active:bg-red-600 transition disabled:opacity-50">
                                    {bulkDeleting ? (
                                        <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menghapus...</>
                                    ) : (
                                        <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>Hapus {selectedIds.size} Unit</>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Table */}
                    {isLoading ? (
                        <SkeletonUnits />
                    ) : filteredUnits.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-12 text-center animate-fadeIn">
                            <div className="mb-2 opacity-50"><Package size={30} className="mx-auto text-gray-400" /></div>
                            <p className="text-gray-500 text-sm font-medium">Tidak ada unit ditemukan</p>
                            <p className="text-gray-400 text-xs mt-1">
                                {hasActiveFilter || filterStatus !== "ALL" || filterGradeTab !== "ALL"
                                    ? "Coba ubah filter pencarian"
                                    : canManageUnits ? "Klik 'Tambah Unit' untuk mendaftarkan SN" : "Belum ada unit yang tersedia"}
                            </p>
                            {(hasActiveFilter || filterStatus !== "ALL" || filterGradeTab !== "ALL") && (
                                <button onClick={resetFilters} className="mt-3 px-4 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200 transition">
                                    Reset semua filter
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-slideUp">
                            {/* Total Keseluruhan — ikut filter aktif, sama pola dgn LaptopsContent.tsx */}
                            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex flex-wrap items-center gap-3">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">
                                    Total Keseluruhan
                                </span>
                                <div className="flex flex-wrap items-center gap-2">
                                    {canSeePriceInfo && (
                                        <>
                                            <TotalPill label="Modal Laptop" value={fmt(totalModalLaptop)} color="text-gray-800" />
                                            <TotalPill label="Modal Sparepart" value={fmt(totalModalSparepart)} color="text-gray-800" />
                                            <TotalPill label="Total Modal" value={fmt(totalModal)} color="text-gray-800" />
                                            <TotalPill label="Gross Profit" value={fmt(totalGrossProfit)} color={totalGrossProfit >= 0 ? "text-emerald-700" : "text-red-600"} />
                                        </>
                                    )}
                                    <TotalPill label="Harga Store" value={fmt(totalHargaJual)} color="text-gray-800" />
                                    <TotalPill label="Total Jual" value={fmt(totalNilaiJual)} color="text-emerald-700" />
                                </div>
                            </div>
                            <InventoryTable
                                rows={tableRows}
                                canSeePrivate={canSeePriceInfo}
                                canSeeStock={canSeePriceInfo}
                                showSparepart
                                showTotalJual
                                sortBy={sortBy}
                                onSort={handleSort}
                                onRowClick={(row) => {
                                    const u = filteredUnits.find(x => x.id === row.id);
                                    if (u) setDetailUnit(u);
                                }}
                                renderAudit={canAuditUnits ? (row) => {
                                    const u = filteredUnits.find(x => x.id === row.id);
                                    if (!u) return null;
                                    return (
                                        <div className="flex items-center justify-center gap-1">
                                            <AuditButton
                                                active={isUnitAuditActive(u)}
                                                loading={auditingUnitId === u.id}
                                                auditedBy={u.audited_by}
                                                auditedAt={u.audited_at}
                                                onClick={() => toggleUnitAudit(u)}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setHistoryTarget({ id: u.id, name: `SN: ${u.serial_number}` })}
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
                                renderSo={canSOUnits ? (row) => {
                                    const u = filteredUnits.find(x => x.id === row.id);
                                    if (!u) return null;
                                    return (
                                        <div className="flex items-center justify-center gap-1">
                                            <SoButton
                                                active={isUnitSOActive(u)}
                                                loading={soUnitId === u.id}
                                                soBy={u.so_by}
                                                soAt={u.so_at}
                                                onClick={() => toggleUnitSO(u)}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setSoHistoryTarget({ id: u.id, name: `SN: ${u.serial_number}` })}
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
                                    const u = filteredUnits.find(x => x.id === row.id);
                                    if (!u || !canManageUnits) return null;
                                    return (
                                        <button onClick={() => handleDelete(u)}
                                            className="h-8 w-8 rounded-lg text-red-500 hover:bg-red-50 transition flex items-center justify-center" title="Hapus Unit">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    );
                                }}
                            />
                            <div className="px-5 py-3.5 border-t border-gray-100 bg-gray-50/60 flex flex-wrap items-center justify-between gap-3">
                                <p className="text-xs text-gray-400 font-medium">
                                    Menampilkan <span className="text-gray-700 font-bold">{filteredUnits.length}</span> dari <span className="text-gray-700 font-bold">{units.length}</span> unit
                                </p>
                                <div className="flex items-center gap-2 flex-wrap">
                                    {canAuditUnits && (
                                        <FooterStat label="Teraudit" value={activeUnits.filter(isUnitAuditActive).length} dot="bg-emerald-500" color="text-emerald-700" />
                                    )}
                                    {canSOUnits && (
                                        <FooterStat label="Sudah SO" value={activeUnits.filter(isUnitSOActive).length} dot="bg-sky-500" color="text-sky-700" />
                                    )}
                                    {(hasActiveFilter || filterStatus !== "ALL" || filterGradeTab !== "ALL") && (
                                        <span className="text-xs text-amber-600 font-medium">Filter aktif</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {showForm && (
                <UnitFormModal
                    laptopId={laptopId}
                    defaultSellingPrice={laptop?.selling_price ?? 0}
                    editingUnit={editingUnit}
                    onClose={closeForm}
                    onSuccess={handleFormSuccess}
                    onError={(msg) => setAlertModal(msg)}
                />
            )}

            {/*  Pop-up Detail unit — komponen sama dgn yg dipakai di Data Barang */}
            {detailUnit && (
                <UnitDetailModal
                    unit={detailUnit as UnitDetailData}
                    laptopName={laptop?.laptop_name}
                    laptopMeta={[laptop?.brand, laptop?.cpu, laptop?.ram, laptop?.storage].filter(Boolean).join(" · ")}
                    canEdit={canFullAccessBarang}
                    canSeePrivate={canSeePriceInfo}
                    onClose={() => setDetailUnit(null)}
                    onSaved={(updated) => {
                        setUnits(prev => prev.map(u => u.id === updated.id ? { ...u, ...updated } : u));
                        setDetailUnit(null);
                        setToast("Data unit berhasil diperbarui!");
                    }}
                />
            )}

            {alertModal && <AlertModal message={alertModal} onClose={() => setAlertModal(null)} />}
            {confirmModal && (
                <ConfirmModal message={confirmModal.message} onConfirm={confirmModal.onConfirm} onCancel={() => setConfirmModal(null)} />
            )}
            {historyTarget && (
                <AuditHistoryModal
                    unitId={historyTarget.id}
                    unitLabel={historyTarget.name}
                    onClose={() => setHistoryTarget(null)}
                />
            )}
            {soHistoryTarget && (
                <SoHistoryModal
                    unitId={soHistoryTarget.id}
                    unitLabel={soHistoryTarget.name}
                    onClose={() => setSoHistoryTarget(null)}
                />
            )}
            {showBulkModal && (
                <BulkAddUnitModal
                    laptopId={laptopId}
                    defaultSellingPrice={laptop?.selling_price ?? 0}
                    onClose={() => setShowBulkModal(false)}
                    onSuccess={handleFormSuccess}
                />
            )}
            {toast && <Toast message={toast} onDone={() => setToast("")} />}
            {showSourceModal && (
                <SourceBulkModal
                    value={sourceInput}
                    onChange={setSourceInput}
                    saving={sourceSaving}
                    onCancel={() => setShowSourceModal(false)}
                    onSave={handleBulkSource}
                />
            )}
            {showPriceModal && (
                <PriceBulkModal
                    value={priceInput}
                    onChange={setPriceInput}
                    saving={priceSaving}
                    onCancel={() => setShowPriceModal(false)}
                    onSave={handleBulkPrice}
                />
            )}
        </DashboardLayout>
    );
}

function SkeletonUnits() {
    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gray-50/80 border-b border-gray-100">
                            {["Serial Number", "Grade", "Kondisi", "Harga Modal", "Harga Jual", "Margin", "Status", "Aksi"].map(h => (
                                <th key={h} className="px-4 py-3 text-left">
                                    <div className="h-2.5 bg-gray-200 rounded w-16 animate-pulse" />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {[...Array(3)].map((_, i) => (
                            <tr key={i}>
                                {[90, 50, 120, 70, 70, 60, 60, 50].map((w, j) => (
                                    <td key={j} className="px-4 py-3">
                                        <div className="h-3 bg-gray-100 rounded animate-pulse" style={{ width: w }} />
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
    return (
        <th className={`px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap ${right ? "text-right" : "text-left"}`}>
            {children}
        </th>
    );
}

//  Modal set "Sumber Barang" untuk SEMUA unit satu model sekaligus.
function SourceBulkModal({ value, onChange, saving, onCancel, onSave }: {
    value: string; onChange: (v: string) => void; saving: boolean;
    onCancel: () => void; onSave: () => void;
}) {
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onCancel]);

    const canSave = !saving && value.trim().length > 0;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-5">
                <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-9 h-9 rounded-lg bg-[#1a1a2e] flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5a2 2 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-sm font-bold text-gray-800">Set Sumber Semua Unit</h3>
                        <p className="text-[11px] text-gray-400">Ketik 1x → semua unit model ini ikut terisi</p>
                    </div>
                </div>

                <label className="block text-xs font-medium text-gray-500 mb-1.5">Sumber Barang</label>
                <input
                    type="text"
                    autoFocus
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && canSave) onSave(); }}
                    placeholder="Contoh: Bu Reta, COD Depok, Supplier A..."
                    className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition"
                />

                <div className="flex gap-2 mt-4">
                    <button onClick={onCancel} disabled={saving}
                        className="flex-1 h-9 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition disabled:opacity-50">
                        Batal
                    </button>
                    <button onClick={onSave} disabled={!canSave}
                        className="flex-1 h-9 bg-[#1a1a2e] text-white rounded-lg text-sm font-semibold hover:bg-[#16213e] transition disabled:opacity-50 flex items-center justify-center gap-2">
                        {saving ? (<><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</>) : "Terapkan ke Semua"}
                    </button>
                </div>
            </div>
        </div>
    );
}

//  Modal set "Harga Store", "Harga Sparepart" & "Harga Official" untuk SEMUA unit satu model sekaligus.
function PriceBulkModal({ value, onChange, saving, onCancel, onSave }: {
    value: { selling_price: string; sparepart_cost: string; official_price: string };
    onChange: (v: { selling_price: string; sparepart_cost: string; official_price: string }) => void;
    saving: boolean;
    onCancel: () => void; onSave: () => void;
}) {
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onCancel]);

    const canSave = !saving && (
        value.selling_price.trim() !== "" ||
        value.sparepart_cost.trim() !== "" ||
        value.official_price.trim() !== ""
    );

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-5">
                <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-9 h-9 rounded-lg bg-[#1a1a2e] flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m-6 4h6m-6 4h4M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-sm font-bold text-gray-800">Set Harga Semua Unit</h3>
                        <p className="text-[11px] text-gray-400">Isi salah satu atau keduanya → langsung berlaku ke semua unit model ini</p>
                    </div>
                </div>

                <div className="space-y-3">
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1.5">Harga Store (Rp)</label>
                        <input
                            type="number"
                            min={0}
                            value={value.selling_price}
                            onChange={e => onChange({ ...value, selling_price: e.target.value })}
                            placeholder="Kosongkan kalau tidak diubah"
                            className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1.5">Harga Sparepart (Rp)</label>
                        <input
                            type="number"
                            min={0}
                            value={value.sparepart_cost}
                            onChange={e => onChange({ ...value, sparepart_cost: e.target.value })}
                            placeholder="Kosongkan kalau tidak diubah"
                            className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1.5">Harga Official (Rp)</label>
                        <input
                            type="number"
                            min={0}
                            value={value.official_price}
                            onChange={e => onChange({ ...value, official_price: e.target.value })}
                            placeholder="Kosongkan kalau tidak diubah"
                            className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition"
                        />
                    </div>
                </div>

                <div className="flex gap-2 mt-4">
                    <button onClick={onCancel} disabled={saving}
                        className="flex-1 h-9 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition disabled:opacity-50">
                        Batal
                    </button>
                    <button onClick={onSave} disabled={!canSave}
                        className="flex-1 h-9 bg-[#1a1a2e] text-white rounded-lg text-sm font-semibold hover:bg-[#16213e] transition disabled:opacity-50 flex items-center justify-center gap-2">
                        {saving ? (<><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</>) : "Terapkan ke Semua"}
                    </button>
                </div>
            </div>
        </div>
    );
}

//  Tombol Audit per unit — identik gaya AuditButton di LaptopsContent.tsx.
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

//  Tombol SO per unit — identik gaya SoButton di LaptopsContent.tsx.
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

interface AuditHistoryEntry {
    id: string;
    action: "AUDIT" | "UNAUDIT";
    audited_by: string;
    audited_at: string;
}

function AuditHistoryModal({ unitId, unitLabel, onClose }: {
    unitId: string; unitLabel: string; onClose: () => void;
}) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [history, setHistory] = useState<AuditHistoryEntry[]>([]);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const res = await fetch(`/api/units/${unitId}/audit`);
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
    }, [unitId]);

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    const fmtWhen = (iso: string) =>
        new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden max-h-[80vh] flex flex-col">
                <div className="h-1 w-full bg-gradient-to-r from-gray-400 via-gray-600 to-gray-800 flex-shrink-0" />
                <div className="px-5 py-4 border-b border-gray-100 flex-shrink-0">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Riwayat Audit</p>
                    <h3 className="text-sm font-bold text-gray-900 truncate">{unitLabel}</h3>
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

function SoHistoryModal({ unitId, unitLabel, onClose }: {
    unitId: string; unitLabel: string; onClose: () => void;
}) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [history, setHistory] = useState<SoHistoryEntry[]>([]);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const res = await fetch(`/api/units/${unitId}/so`);
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
    }, [unitId]);

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    const fmtWhen = (iso: string) =>
        new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden max-h-[80vh] flex flex-col">
                <div className="h-1 w-full bg-gradient-to-r from-gray-400 via-gray-600 to-gray-800 flex-shrink-0" />
                <div className="px-5 py-4 border-b border-gray-100 flex-shrink-0">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Riwayat SO (Stock Opname)</p>
                    <h3 className="text-sm font-bold text-gray-900 truncate">{unitLabel}</h3>
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