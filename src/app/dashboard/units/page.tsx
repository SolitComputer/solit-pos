"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import ExcelJS from "exceljs";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { UserRole, PERMISSIONS, hasAnyRole } from "@/lib/permissions";
import { Trash2, ArrowUp, ArrowDown, Inbox } from "lucide-react";
import EditablePriceCell from "@/components/inventory/EditablePriceCell";
import UnitFormModal, { LaptopUnit as BaseLaptopUnit } from "@/components/inventory/UnitFormModal";
import BulkAddUnitModal from "@/components/inventory/BulkAddUnitModal";
import LaptopPickerModal, { PickableLaptop } from "@/components/inventory/LaptopPickerModal";
import AddLaptopModal from "@/components/inventory/AddLaptopModal";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GlobalUnit extends BaseLaptopUnit {
    laptop_name: string;
    brand: string;
    cpu: string;
    ram: string;
    storage: string;
    sparepart_cost: number;
}

interface RawGlobalUnit extends BaseLaptopUnit {
    laptops?: { laptop_name: string; brand: string; cpu: string; ram: string; storage: string } | null;
    sparepart_cost?: number;
}

type SortOrder = "asc" | "desc";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");

const GRADE_STYLE: Record<string, { badge: string; label: string }> = {
    A: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Grade A" },
    B: { badge: "bg-amber-50 text-amber-700 border-amber-200", label: "Grade B" },
    C: { badge: "bg-red-50 text-red-700 border-red-200", label: "Grade C" },
};

const STATUS_STYLE: Record<string, { badge: string; dot: string; label: string }> = {
    SIAP_JUAL: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", label: "Siap Jual" },
    BELUM_SIAP: { badge: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-400", label: "Belum Siap" },
    SERVICE: { badge: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-500", label: "Service" },
    SOLD: { badge: "bg-gray-100 text-gray-500 border-gray-200", dot: "bg-gray-400", label: "Terjual" },
};

const GRADE_ORDER: Record<string, number> = { A: 0, B: 1, C: 2 };

function sortUnits(units: GlobalUnit[], snOrder: SortOrder): GlobalUnit[] {
    return [...units].sort((a, b) => {
        const snCmp = a.serial_number.localeCompare(b.serial_number, undefined, { numeric: true });
        if (snCmp !== 0) return snOrder === "asc" ? snCmp : -snCmp;
        return GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade];
    });
}

function fmtDate(iso?: string) {
    if (!iso) return "—";
    return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AlertModal({ message, onClose }: { message: string; onClose: () => void }) {
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-xs p-5 text-center">
                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <p className="text-gray-700 text-sm font-medium mb-4 leading-relaxed">{message}</p>
                <button onClick={onClose}
                    className="w-full h-9 bg-[#1a1a2e] text-white rounded-lg text-sm font-medium hover:bg-[#16213e] transition">
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
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-5">
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

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
    useEffect(() => {
        const t = setTimeout(onDone, 2500);
        return () => clearTimeout(t);
    }, [onDone]);

    return (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 z-50 bg-emerald-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg flex items-center justify-center sm:justify-start gap-2 animate-in slide-in-from-bottom-4">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="flex-shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {message}
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

// Skeleton tabel — dipakai di layar lg ke atas
function SkeletonTable() {
    return (
        <div className="hidden lg:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gray-50/80 border-b border-gray-100">
                            {["Serial Number", "Laptop", "Grade", "Tgl Masuk", "Harga Modal", "Harga Sparepart", "Total Modal", "Harga Jual", "Status", "Aksi"].map(h => (
                                <th key={h} className="px-4 py-3 text-left">
                                    <div className="h-2.5 bg-gray-200 rounded w-16 animate-pulse" />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {[...Array(5)].map((_, i) => (
                            <tr key={i}>
                                {[90, 140, 50, 70, 80, 80, 80, 70, 60, 50].map((w, j) => (
                                    <td key={j} className="px-4 py-3.5">
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

// Skeleton card — dipakai di layar < lg
function SkeletonCards() {
    return (
        <div className="lg:hidden space-y-3">
            {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="h-5 bg-gray-100 rounded w-28 animate-pulse" />
                        <div className="h-5 bg-gray-100 rounded-full w-20 animate-pulse" />
                    </div>
                    <div className="space-y-1.5">
                        <div className="h-3 bg-gray-100 rounded w-3/4 animate-pulse" />
                        <div className="h-2.5 bg-gray-100 rounded w-1/2 animate-pulse" />
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-50">
                        {[...Array(4)].map((_, j) => (
                            <div key={j} className="h-8 bg-gray-50 rounded-lg animate-pulse" />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

// ─── SN Sort Button ───────────────────────────────────────────────────────────

function SnSortButton({ order, onToggle }: { order: SortOrder; onToggle: () => void }) {
    return (
        <button
            onClick={onToggle}
            title={order === "asc" ? "Urutan: SN Terkecil → Terbesar (klik untuk balik)" : "Urutan: SN Terbesar → Terkecil (klik untuk balik)"}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border transition bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:border-gray-300 active:scale-95"
        >
            {order === "asc" ? (
                <><ArrowUp className="w-3 h-3" /> A→Z</>
            ) : (
                <><ArrowDown className="w-3 h-3" /> Z→A</>
            )}
        </button>
    );
}

// ─── Editable Sparepart Cell ──────────────────────────────────────────────────
// Identik dgn EditablePriceCell tapi PATCH field sparepart_cost ke /api/units/[id]
// Dibuat terpisah agar tidak break EditablePriceCell yang dipakai di halaman lain.
// prop `align` ditambahkan agar bisa dipakai ulang di card mobile.

function EditableSparepartCell({
    unitId,
    value,
    onSaved,
    align = "right",
}: {
    unitId: string;
    value: number;
    onSaved: (unitId: string, newValue: number) => void;
    align?: "right" | "left";
}) {
    const [editing, setEditing] = useState(false);
    const [input, setInput] = useState("");
    const [saving, setSaving] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const startEdit = () => {
        setInput(String(value || 0));
        setEditing(true);
    };

    useEffect(() => {
        if (editing) inputRef.current?.select();
    }, [editing]);

    const cancel = () => setEditing(false);

    const save = async () => {
        const newVal = Math.round(Number(input));
        if (!Number.isFinite(newVal) || newVal < 0) { cancel(); return; }
        if (newVal === value) { cancel(); return; }
        setSaving(true);
        try {
            const res = await fetch(`/api/units/${unitId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sparepart_cost: newVal }),
            });
            const result = await res.json();
            if (result.success) {
                onSaved(unitId, newVal);
                setEditing(false);
            }
        } catch {
            // silent fail — nilai kembali ke semula
        } finally {
            setSaving(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") save();
        if (e.key === "Escape") cancel();
    };

    const justify = align === "right" ? "justify-end" : "justify-start";

    if (editing) {
        return (
            <div className={`flex items-center gap-1 ${justify}`}>
                <input
                    ref={inputRef}
                    type="number"
                    inputMode="numeric"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={save}
                    disabled={saving}
                    className="w-full max-w-[7rem] h-8 text-right text-xs border border-violet-400 rounded-md px-2 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400/30 tabular-nums"
                />
                {saving && (
                    <svg className="w-3 h-3 animate-spin text-violet-400 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                )}
            </div>
        );
    }

    return (
        <div className={`flex items-center gap-2 ${justify}`}>
            <span className="text-xs text-gray-800 font-medium tabular-nums">{fmt(value || 0)}</span>
            <button
                onClick={startEdit}
                title="Klik untuk edit harga sparepart"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-violet-600 bg-violet-50 hover:bg-violet-100 border border-violet-200 transition active:scale-95 flex-shrink-0"
            >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Edit
            </button>
        </div>
    );
}

// ─── Editable Modal (Harga Modal) Cell ────────────────────────────────────────
// Self-contained inline editor untuk purchase_price. Sengaja TIDAK pakai
// EditablePriceCell karena komponen itu mengunci diri untuk unit SOLD.
// PATCH purchase_price → route sync otomatis ke transactions.inventory_price & other,
// jadi profit unit terjual tetap bisa dikoreksi & gross profit dashboard akurat.

function EditableModalCell({
    unitId,
    value,
    onSaved,
    align = "right",
}: {
    unitId: string;
    value: number;
    onSaved: (unitId: string, newValue: number) => void;
    align?: "right" | "left";
}) {
    const [editing, setEditing] = useState(false);
    const [input, setInput] = useState("");
    const [saving, setSaving] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const startEdit = () => {
        setInput(String(value || 0));
        setEditing(true);
    };

    useEffect(() => {
        if (editing) inputRef.current?.select();
    }, [editing]);

    const cancel = () => setEditing(false);

    const save = async () => {
        const newVal = Math.round(Number(input));
        if (!Number.isFinite(newVal) || newVal < 0) { cancel(); return; }
        if (newVal === value) { cancel(); return; }
        setSaving(true);
        try {
            const res = await fetch(`/api/units/${unitId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ purchase_price: newVal }),
            });
            const result = await res.json();
            if (result.success) {
                onSaved(unitId, newVal);
                setEditing(false);
            }
        } catch {
            // silent fail — nilai kembali ke semula
        } finally {
            setSaving(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") save();
        if (e.key === "Escape") cancel();
    };

    const justify = align === "right" ? "justify-end" : "justify-start";

    if (editing) {
        return (
            <div className={`flex items-center gap-1 ${justify}`}>
                <input
                    ref={inputRef}
                    type="number"
                    inputMode="numeric"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={save}
                    disabled={saving}
                    className="w-full max-w-[7rem] h-8 text-right text-xs border border-violet-400 rounded-md px-2 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400/30 tabular-nums"
                />
                {saving && (
                    <svg className="w-3 h-3 animate-spin text-violet-400 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                )}
            </div>
        );
    }

    return (
        <div className={`flex items-center gap-2 ${justify}`}>
            <span className="text-xs text-gray-800 font-medium tabular-nums">{fmt(value || 0)}</span>
            <button
                onClick={startEdit}
                title="Klik untuk edit harga modal"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-violet-600 bg-violet-50 hover:bg-violet-100 border border-violet-200 transition active:scale-95 flex-shrink-0"
            >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Edit
            </button>
        </div>
    );
}

// ─── Unit Card (tampilan mobile / tablet) ─────────────────────────────────────
// Menampilkan data & aksi yang identik dengan baris tabel, tapi disusun vertikal
// supaya tidak perlu horizontal scroll di layar kecil.

function UnitCard({
    unit,
    canSeePriceInfo,
    canManageUnits,
    onEdit,
    onDelete,
    onPriceSaved,
    onSparepartSaved,
}: {
    unit: GlobalUnit;
    canSeePriceInfo: boolean;
    canManageUnits: boolean;
    onEdit: (u: GlobalUnit) => void;
    onDelete: (u: GlobalUnit) => void;
    onPriceSaved: (unitId: string, newValue: number) => void;
    onSparepartSaved: (unitId: string, newValue: number) => void;
}) {
    const s = STATUS_STYLE[unit.status];
    const g = GRADE_STYLE[unit.grade];
    const isSold = unit.status === "SOLD";
    const totalUnitModal = (unit.sparepart_cost || 0) + (unit.purchase_price || 0);
    const isLoss = unit.selling_price > 0 && totalUnitModal > unit.selling_price;

    return (
        <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-4 transition ${isSold ? "opacity-60" : ""}`}>
            {/* Baris atas: SN + Status */}
            <div className="flex items-start justify-between gap-2 mb-2.5">
                <span className="font-mono text-xs text-gray-700 bg-gray-100 px-2 py-1 rounded break-all">
                    {unit.serial_number}
                </span>
                {s && (
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap flex-shrink-0 ${s.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                        {s.label}
                    </span>
                )}
            </div>

            {/* Nama laptop + spek */}
            <p className="text-sm font-semibold text-gray-800 leading-snug">{unit.laptop_name}</p>
            <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                {[unit.brand, unit.cpu, unit.ram, unit.storage].filter(Boolean).join(" · ") || "—"}
            </p>

            {/* Grade + tanggal */}
            <div className="flex items-center gap-2 mt-2.5">
                {g && (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${g.badge}`}>
                        {g.label}
                    </span>
                )}
                <span className="text-[11px] text-gray-400">Masuk: {fmtDate(unit.created_at)}</span>
            </div>

            {/* Harga */}
            <div className="mt-3 pt-3 border-t border-gray-100 space-y-2.5">
                {canSeePriceInfo && (
                    <>
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-[11px] text-gray-400 flex-shrink-0">Harga Modal</span>
                            {canManageUnits ? (
                                <EditableModalCell unitId={unit.id} value={unit.purchase_price} onSaved={onPriceSaved} />
                            ) : (
                                <span className="text-xs text-gray-500 tabular-nums">{fmt(unit.purchase_price)}</span>
                            )}
                        </div>

                        <div className="flex items-center justify-between gap-3">
                            <span className="text-[11px] text-gray-400 flex-shrink-0">Harga Sparepart</span>
                            {canManageUnits && !isSold ? (
                                <EditableSparepartCell unitId={unit.id} value={unit.sparepart_cost || 0} onSaved={onSparepartSaved} />
                            ) : (
                                <span className="text-xs text-blue-600 font-medium tabular-nums">{fmt(unit.sparepart_cost || 0)}</span>
                            )}
                        </div>

                        <div className="flex items-center justify-between gap-3">
                            <span className="text-[11px] text-gray-400 flex-shrink-0">Total Modal</span>
                            <div className="text-right">
                                <span className={`text-xs font-semibold tabular-nums ${isLoss ? "text-red-600" : "text-violet-700"}`}>
                                    {fmt(totalUnitModal)}
                                </span>
                                {isLoss && (
                                    <p className="text-[9px] text-red-500 font-semibold leading-tight"> Rugi</p>
                                )}
                            </div>
                        </div>
                    </>
                )}

                <div className="flex items-center justify-between gap-3 pt-2 border-t border-gray-50">
                    <span className="text-[11px] text-gray-400 flex-shrink-0">Harga Jual</span>
                    <span className="text-sm font-bold text-gray-800 tabular-nums">{fmt(unit.selling_price)}</span>
                </div>
            </div>

            {/* Aksi */}
            {canManageUnits && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                    {!isSold && (
                        <button onClick={() => onEdit(unit)}
                            className="flex-1 h-9 rounded-lg text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition active:scale-[0.98]">
                            Edit Unit
                        </button>
                    )}
                    <button onClick={() => onDelete(unit)}
                        className={`h-9 rounded-lg text-red-500 bg-red-50 hover:bg-red-100 border border-red-200 transition flex items-center justify-center gap-1.5 text-xs font-medium active:scale-[0.98] ${isSold ? "flex-1" : "w-11"}`}
                        title="Hapus Unit">
                        <Trash2 className="w-4 h-4" />
                        {isSold && <span>Hapus</span>}
                    </button>
                </div>
            )}
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
// Halaman "Barang Terjual" — khusus menampilkan unit berstatus SOLD saja.
// Tidak ada lagi toggle/tab untuk status Siap Jual, Belum Siap, atau Service.

export default function AllUnitsPage() {
    const [units, setUnits] = useState<GlobalUnit[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);

    // Filter & search state
    const [filterGradeTab, setFilterGradeTab] = useState("ALL");
    const [searchSN, setSearchSN] = useState("");
    const [searchLaptop, setSearchLaptop] = useState("");
    const [filterPriceMin, setFilterPriceMin] = useState("");
    const [filterPriceMax, setFilterPriceMax] = useState("");
    const [showAdvancedFilter, setShowAdvancedFilter] = useState(false);
    const [snSortOrder, setSnSortOrder] = useState<SortOrder>("asc");

    const [userRoles, setUserRoles] = useState<UserRole[]>([]);
    const canManageUnits = hasAnyRole(userRoles, PERMISSIONS.EDIT_UNITS);
    const canSeePriceInfo = hasAnyRole(userRoles, [
        "ADMIN", "PROGRAMMER", "ASISTEN_CEO", "PENGELOLA_BARANG",
        "KEPALA_PENGELOLA_BARANG", "KEPALA_TEKNISI", "ACCOUNTING",
    ] as UserRole[]);

    const [alertModal, setAlertModal] = useState<string | null>(null);
    const [confirmModal, setConfirmModal] = useState<{ message: string; onConfirm: () => void } | null>(null);
    const [toast, setToast] = useState("");

    const [editingUnit, setEditingUnit] = useState<GlobalUnit | null>(null);
    const [newUnitLaptop, setNewUnitLaptop] = useState<PickableLaptop | null>(null);
    const showUnitForm = !!editingUnit || !!newUnitLaptop;

    const [bulkLaptop, setBulkLaptop] = useState<PickableLaptop | null>(null);
    const [pickerMode, setPickerMode] = useState<"unit" | "bulk" | null>(null);
    const [showAddLaptopModal, setShowAddLaptopModal] = useState(false);

    useEffect(() => {
        fetch("/api/auth/me")
            .then(r => r.json())
            .then(r => {
                const roles: string[] =
                    Array.isArray(r.user?.roles) && r.user.roles.length > 0
                        ? r.user.roles
                        : r.user?.role ? [r.user.role] : [];
                setUserRoles(roles as UserRole[]);
            })
            .catch(() => setUserRoles([]));
    }, []);

    const fetchUnits = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch("/api/units");
            const result = await res.json();
            const normalized: GlobalUnit[] = (result.data || []).map((u: RawGlobalUnit) => ({
                ...u,
                purchase_price: Math.round(Number(u.purchase_price) || 0),
                selling_price: Math.round(Number(u.selling_price) || 0),
                sparepart_cost: Math.round(Number(u.sparepart_cost) || 0),
                laptop_name: u.laptops?.laptop_name ?? "—",
                brand: u.laptops?.brand ?? "",
                cpu: u.laptops?.cpu ?? "",
                ram: u.laptops?.ram ?? "",
                storage: u.laptops?.storage ?? "",
            }));
            setUnits(normalized);
        } catch {
            setUnits([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchUnits(); }, [fetchUnits]);

    // ── Callbacks untuk inline edit ───────────────────────────────────────────

    const handlePriceSaved = useCallback((unitId: string, newPrice: number) => {
        setUnits(prev => prev.map(u =>
            u.id === unitId ? { ...u, purchase_price: newPrice } : u
        ));
        setToast("Harga modal berhasil diperbarui!");
    }, []);

    // Callback untuk EditableSparepartCell — update state lokal + trigger recalc Total Modal
    const handleSparepartSaved = useCallback((unitId: string, newValue: number) => {
        setUnits(prev => prev.map(u =>
            u.id === unitId ? { ...u, sparepart_cost: newValue } : u
        ));
        setToast("Harga sparepart berhasil diperbarui!");
    }, []);

    // ── Computed data ─────────────────────────────────────────────────────────
    // Sumber data halaman ini SELALU unit berstatus SOLD — unit Siap Jual,
    // Belum Siap, dan Service tidak pernah masuk ke sini.

    const soldUnits = units.filter(u => u.status === "SOLD");

    const filteredUnits = sortUnits(
        soldUnits.filter(u => {
            if (filterGradeTab !== "ALL" && u.grade !== filterGradeTab) return false;
            if (searchSN && !u.serial_number.toLowerCase().includes(searchSN.toLowerCase())) return false;
            if (searchLaptop && !u.laptop_name.toLowerCase().includes(searchLaptop.toLowerCase())) return false;
            if (filterPriceMin && u.selling_price < Number(filterPriceMin)) return false;
            if (filterPriceMax && u.selling_price > Number(filterPriceMax)) return false;
            return true;
        }),
        snSortOrder
    );

    const hasActiveFilter = searchSN || searchLaptop || filterPriceMin || filterPriceMax;

    const resetFilters = () => {
        setSearchSN(""); setSearchLaptop("");
        setFilterPriceMin(""); setFilterPriceMax("");
        setFilterGradeTab("ALL");
    };

    const counts = {
        gradeA: soldUnits.filter(u => u.grade === "A").length,
        gradeB: soldUnits.filter(u => u.grade === "B").length,
        gradeC: soldUnits.filter(u => u.grade === "C").length,
    };

    // Total summary card — total modal dari unit yang SUDAH TERJUAL
    const totalSparepart = soldUnits.reduce((s, u) => s + (u.sparepart_cost || 0), 0);
    const totalPurchase = soldUnits.reduce((s, u) => s + (u.purchase_price || 0), 0);
    const totalModal = totalSparepart + totalPurchase;

    const openEdit = (unit: GlobalUnit) => { setNewUnitLaptop(null); setEditingUnit(unit); };
    const closeUnitForm = () => { setEditingUnit(null); setNewUnitLaptop(null); };

    const handleDelete = (unit: GlobalUnit) => {
        setConfirmModal({
            message: `Hapus unit SN: ${unit.serial_number}?`,
            onConfirm: async () => {
                setConfirmModal(null);
                try {
                    await fetch(`/api/units/${unit.id}`, { method: "DELETE" });
                    await fetchUnits();
                } catch {
                    setAlertModal("Gagal menghapus");
                }
            },
        });
    };

    // ── Excel Export ──────────────────────────────────────────────────────────

    const handleExportExcel = async () => {
        if (isExporting) return;
        setIsExporting(true);
        try {
            const wb = new ExcelJS.Workbook();
            wb.creator = "Solit POS";
            wb.created = new Date();

            const ws = wb.addWorksheet("Barang Terjual", {
                views: [{ state: "frozen", ySplit: 1 }],
                pageSetup: { fitToPage: true, fitToWidth: 1, orientation: "landscape" },
            });

            // Urutan kolom Excel: SN dulu baru Laptop (konsisten dgn tampilan tabel)
            const COL_DEFS = [
                { header: "Serial Number", key: "sn", width: 22 },
                { header: "Laptop", key: "laptop", width: 30 },
                { header: "Brand", key: "brand", width: 16 },
                { header: "CPU", key: "cpu", width: 22 },
                { header: "RAM", key: "ram", width: 10 },
                { header: "Storage", key: "storage", width: 13 },
                { header: "Grade", key: "grade", width: 10 },
                { header: "Status", key: "status", width: 14 },
                { header: "Tgl Masuk", key: "tanggal", width: 14 },
                { header: "Harga Modal", key: "modal", width: 18 },
                { header: "Harga Sparepart", key: "sparepart", width: 18 },
                { header: "Total Modal", key: "total_modal", width: 18 },
                { header: "Harga Jual", key: "jual", width: 18 },
                { header: "Kondisi", key: "kondisi", width: 28 },
            ];

            ws.columns = COL_DEFS;

            const LEFT_KEYS = new Set(["sn", "laptop", "kondisi", "tanggal"]);
            const CURR_KEYS = new Set(["sparepart", "modal", "total_modal", "jual"]);

            // tableRows — urutan nilai: modal dulu, lalu sparepart
            const tableRows = filteredUnits.map(u => {
                const sparepart = canSeePriceInfo ? (u.sparepart_cost || 0) : 0;
                const modal = canSeePriceInfo ? u.purchase_price : 0;
                const totalMod = canSeePriceInfo ? (sparepart + modal) : 0;
                return [
                    u.serial_number, u.laptop_name, u.brand, u.cpu, u.ram, u.storage,
                    u.grade, STATUS_STYLE[u.status]?.label ?? u.status,
                    fmtDate(u.created_at),
                    modal,
                    sparepart,
                    totalMod, u.selling_price,
                    u.condition_note || "",
                ];
            });

            if (tableRows.length > 0) {
                ws.addTable({
                    name: "TabelBarangTerjual", ref: "A1",
                    headerRow: true, totalsRow: false,
                    style: { theme: "TableStyleMedium7", showRowStripes: true },
                    columns: COL_DEFS.map(c => ({ name: c.header, filterButton: true })),
                    rows: tableRows,
                });
            } else {
                const hRow = ws.getRow(1);
                hRow.height = 30;
                COL_DEFS.forEach((col, ci) => {
                    const cell = hRow.getCell(ci + 1);
                    cell.value = col.header;
                    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" }, name: "Arial" };
                    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF166534" } };
                    cell.alignment = { horizontal: "center", vertical: "middle" };
                });
            }

            const headerRow = ws.getRow(1);
            headerRow.height = 30;
            headerRow.eachCell((cell, colNum) => {
                const key = COL_DEFS[colNum - 1]?.key ?? "";
                cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF166534" } };
                cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" }, name: "Arial" };
                cell.alignment = { horizontal: LEFT_KEYS.has(key) ? "left" : "center", vertical: "middle" };
                cell.border = {
                    top: { style: "thin", color: { argb: "FFCBD5E1" } },
                    left: { style: "thin", color: { argb: "FFCBD5E1" } },
                    bottom: { style: "medium", color: { argb: "FF94A3B8" } },
                    right: { style: "thin", color: { argb: "FFCBD5E1" } },
                };
            });

            tableRows.forEach((_, idx) => {
                const row = ws.getRow(idx + 2);
                row.height = 22;
                row.eachCell((cell, colNum) => {
                    const key = COL_DEFS[colNum - 1]?.key ?? "";
                    cell.font = { size: 10, name: "Arial", color: { argb: "FF111827" } };
                    cell.alignment = { horizontal: LEFT_KEYS.has(key) ? "left" : "center", vertical: "middle", wrapText: false };
                    cell.border = {
                        top: { style: "hair", color: { argb: "FFCBD5E1" } },
                        left: { style: "hair", color: { argb: "FFCBD5E1" } },
                        bottom: { style: "hair", color: { argb: "FFCBD5E1" } },
                        right: { style: "hair", color: { argb: "FFCBD5E1" } },
                    };
                    if (CURR_KEYS.has(key)) cell.numFmt = '"Rp "#,##0';
                });
            });

            COL_DEFS.forEach((col, idx) => { ws.getColumn(idx + 1).width = col.width; });

            const buffer = await wb.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            const dateStr = new Date()
                .toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" })
                .replace(/\//g, "-");
            link.download = `Barang_Terjual_Solit_${dateStr}.xlsx`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
        } catch (err) {
            console.error("Export error:", err);
            const msg = err instanceof Error ? err.message : String(err);
            setAlertModal(`Gagal export Excel: ${msg}`);
        } finally {
            setIsExporting(false);
        }
    };

    const isEmptyState = !isLoading && filteredUnits.length === 0;

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <DashboardLayout>
            <main className="min-h-screen bg-gradient-to-br from-gray-50 to-white p-3 sm:p-6 lg:p-8">
                <div className="max-w-7xl mx-auto space-y-4 sm:space-y-5">

                    {/* ── Header ── */}
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <div className="w-7 h-7 bg-gradient-to-br from-[#1a1a2e] to-[#16213e] rounded-lg flex items-center justify-center flex-shrink-0">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                        <rect x="2" y="3" width="20" height="14" rx="2" />
                                        <line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
                                    </svg>
                                </div>
                                <h1 className="text-lg sm:text-xl font-bold text-[#1a1a2e] tracking-tight">Barang Terjual</h1>
                            </div>
                            <p className="text-[11px] sm:text-xs text-gray-400 ml-9">Daftar semua unit laptop yang sudah terjual</p>
                        </div>

                        {/* Toolbar — grid 2 kolom di HP, sebaris di desktop */}
                        <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-2">
                            {!isLoading && filteredUnits.length > 0 && (
                                <button onClick={handleExportExcel} disabled={isExporting}
                                    className="inline-flex items-center justify-center gap-1.5 px-3 h-10 sm:h-9 bg-white border border-emerald-200 rounded-lg text-xs sm:text-sm font-medium text-emerald-700 hover:bg-emerald-50 transition disabled:opacity-60 active:scale-[0.98]">
                                    {isExporting ? (
                                        <>
                                            <svg className="w-3.5 h-3.5 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                            </svg>
                                            Mengekspor...
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                                                <polyline points="14 2 14 8 20 8" />
                                                <polyline points="8 13 12 17 16 13" />
                                                <line x1="12" y1="17" x2="12" y2="11" />
                                            </svg>
                                            Export Excel
                                        </>
                                    )}
                                </button>
                            )}
                            {canManageUnits && (
                                <>
                                    <button onClick={() => setShowAddLaptopModal(true)}
                                        className="inline-flex items-center justify-center gap-1.5 px-3 h-10 sm:h-9 bg-white border border-gray-200 rounded-lg text-xs sm:text-sm font-medium text-gray-600 hover:bg-gray-50 transition shadow-sm active:scale-[0.98]">
                                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <rect x="2" y="3" width="20" height="14" rx="2" />
                                            <line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
                                        </svg>
                                        Tambah Laptop
                                    </button>
                                    <button onClick={() => setPickerMode("unit")}
                                        className="inline-flex items-center justify-center gap-1.5 px-3 h-10 sm:h-9 bg-[#1a1a2e] rounded-lg text-xs sm:text-sm font-medium text-white hover:bg-[#16213e] transition shadow-sm active:scale-[0.98]">
                                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                        Tambah Unit
                                    </button>
                                    <button onClick={() => setPickerMode("bulk")}
                                        className="inline-flex items-center justify-center gap-1.5 px-3 h-10 sm:h-9 bg-gray-600 rounded-lg text-xs sm:text-sm font-medium text-white transition shadow-sm active:scale-[0.98]">
                                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        Tambah Banyak
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* ── Summary Card: Sparepart + Modal = Total (dari unit terjual) ── */}
                    {canSeePriceInfo && (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                            <div className="grid grid-cols-2 lg:flex lg:items-center gap-3 lg:gap-4">
                                {/* Sparepart */}
                                <div className="flex items-center gap-3 lg:flex-1 lg:min-w-[180px]">
                                    <div className="w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[10px] sm:text-xs text-gray-400 truncate">Total Harga Sparepart</p>
                                        <p className="text-sm sm:text-base font-bold text-gray-800 tabular-nums truncate">{fmt(totalSparepart)}</p>
                                    </div>
                                </div>

                                <div className="hidden lg:flex items-center text-gray-300 font-light text-xl select-none">+</div>

                                {/* Modal */}
                                <div className="flex items-center gap-3 lg:flex-1 lg:min-w-[180px]">
                                    <div className="w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-br from-indigo-400 to-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 7h3M4 11h3M4 15h3" />
                                        </svg>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[10px] sm:text-xs text-gray-400 truncate">Total Harga Modal</p>
                                        <p className="text-sm sm:text-base font-bold text-gray-800 tabular-nums truncate">{fmt(totalPurchase)}</p>
                                    </div>
                                </div>

                                <div className="hidden lg:flex items-center text-gray-300 font-light text-xl select-none">=</div>

                                {/* Total */}
                                <div className="col-span-2 lg:col-span-1 flex items-center gap-3 lg:flex-1 lg:min-w-[200px] pt-3 lg:pt-0 border-t lg:border-t-0 border-gray-100">
                                    <div className="w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[10px] sm:text-xs text-gray-400">Total Harga Modal</p>
                                        <p className="text-base sm:text-lg font-black text-violet-700 tabular-nums">{fmt(totalModal)}</p>
                                        <p className="text-[10px] text-gray-400">Sparepart + Modal</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Grade Filter Tabs ── */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-1.5">
                        <div className="grid grid-cols-4 gap-1.5">
                            {[
                                { value: "ALL", label: "Semua Grade", count: soldUnits.length },
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
                                        className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg text-center transition-all active:scale-[0.97] ${isActive ? activeStyle : "text-gray-500 hover:bg-gray-50"}`}>
                                        <span className={`text-[10px] font-medium leading-tight truncate w-full ${isActive ? "opacity-80" : "opacity-60"}`}>{opt.label}</span>
                                        <span className="text-sm font-bold leading-tight mt-0.5">{opt.count}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── Search & Filter ── */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 space-y-3">
                        <div className="flex flex-col sm:flex-row gap-2">
                            {/* Search SN */}
                            <div className="relative flex-1">
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input type="text" placeholder="Cari serial number..." value={searchSN} onChange={e => setSearchSN(e.target.value)}
                                    className="w-full h-10 sm:h-9 border border-gray-200 rounded-lg pl-9 pr-8 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition" />
                                {searchSN && (
                                    <button onClick={() => setSearchSN("")} className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 transition">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                )}
                            </div>

                            {/* Search nama laptop */}
                            <div className="relative flex-1">
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <rect x="2" y="3" width="20" height="14" rx="2" strokeWidth={2} strokeLinecap="round" />
                                    <line x1="8" y1="21" x2="16" y2="21" strokeWidth={2} />
                                    <line x1="12" y1="17" x2="12" y2="21" strokeWidth={2} />
                                </svg>
                                <input type="text" placeholder="Cari nama laptop..." value={searchLaptop} onChange={e => setSearchLaptop(e.target.value)}
                                    className="w-full h-10 sm:h-9 border border-gray-200 rounded-lg pl-9 pr-8 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition" />
                                {searchLaptop && (
                                    <button onClick={() => setSearchLaptop("")} className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 transition">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                )}
                            </div>

                            {/* Baris tombol filter — sejajar di HP */}
                            <div className="flex gap-2">
                                <button onClick={() => setShowAdvancedFilter(v => !v)}
                                    className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 h-10 sm:h-9 rounded-lg text-xs font-medium border transition active:scale-[0.98] ${showAdvancedFilter || filterPriceMin || filterPriceMax ? "bg-[#1a1a2e] text-white border-[#1a1a2e]" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}>
                                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                                    </svg>
                                    Filter
                                    {(filterPriceMin || filterPriceMax) && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                                </button>

                                {hasActiveFilter && (
                                    <button onClick={resetFilters} className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1 px-2.5 h-10 sm:h-9 rounded-lg text-xs font-medium text-red-500 border border-red-200 bg-red-50 hover:bg-red-100 transition active:scale-[0.98]">
                                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                        Reset
                                    </button>
                                )}
                            </div>
                        </div>

                        {showAdvancedFilter && (
                            <div className="border-t border-gray-100 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Harga Jual Min (Rp)</label>
                                    <input type="number" inputMode="numeric" placeholder="Contoh: 1000000" value={filterPriceMin} onChange={e => setFilterPriceMin(e.target.value)}
                                        className="w-full h-10 sm:h-9 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Harga Jual Max (Rp)</label>
                                    <input type="number" inputMode="numeric" placeholder="Contoh: 5000000" value={filterPriceMax} onChange={e => setFilterPriceMax(e.target.value)}
                                        className="w-full h-10 sm:h-9 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition" />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── Loading ── */}
                    {isLoading && (
                        <>
                            <SkeletonTable />
                            <SkeletonCards />
                        </>
                    )}

                    {/* ── Empty state ── */}
                    {isEmptyState && (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-12 px-4 text-center">
                            <div className="flex justify-center mb-2 opacity-50"><Inbox className="w-8 h-8" /></div>
                            <p className="text-gray-500 text-sm font-medium">Tidak ada unit ditemukan</p>
                            <p className="text-gray-400 text-xs mt-1">
                                {hasActiveFilter || filterGradeTab !== "ALL"
                                    ? "Coba ubah filter pencarian"
                                    : "Belum ada unit yang terjual"}
                            </p>
                            {(hasActiveFilter || filterGradeTab !== "ALL") && (
                                <button onClick={resetFilters} className="mt-3 px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200 transition">
                                    Reset semua filter
                                </button>
                            )}
                        </div>
                    )}

                    {/* ── Data ── */}
                    {!isLoading && filteredUnits.length > 0 && (
                        <>
                            {/* ── Tabel (desktop / laptop, lg ke atas) ── */}
                            <div className="hidden lg:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-gray-50/80 border-b border-gray-100">
                                                {/* SN kolom PERTAMA dengan sort button */}
                                                <th className="px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap text-left">
                                                    <div className="flex items-center gap-2">
                                                        <span>Serial Number</span>
                                                        <SnSortButton
                                                            order={snSortOrder}
                                                            onToggle={() => setSnSortOrder(o => o === "asc" ? "desc" : "asc")}
                                                        />
                                                    </div>
                                                </th>
                                                <Th>Laptop</Th>
                                                <Th>Grade</Th>
                                                <Th>Tgl Masuk</Th>
                                                {canSeePriceInfo && (
                                                    <>
                                                        <Th right>
                                                            {canManageUnits ? (
                                                                <span className="flex items-center justify-end gap-1">
                                                                    Harga Modal
                                                                    <span className="text-violet-400 font-bold normal-case tracking-normal">(editable)</span>
                                                                </span>
                                                            ) : "Harga Modal"}
                                                        </Th>
                                                        <Th right>
                                                            {canManageUnits ? (
                                                                <span className="flex items-center justify-end gap-1">
                                                                    Harga Sparepart
                                                                    <span className="text-blue-400 font-bold normal-case tracking-normal">(editable)</span>
                                                                </span>
                                                            ) : "Harga Sparepart"}
                                                        </Th>
                                                        <Th right>Total Modal</Th>
                                                    </>
                                                )}
                                                <Th right>Harga Jual</Th>
                                                <Th>Status</Th>
                                                <Th right>Aksi</Th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {filteredUnits.map(unit => {
                                                const s = STATUS_STYLE[unit.status];
                                                const g = GRADE_STYLE[unit.grade];
                                                // Total Modal per-row reaktif: update otomatis saat sparepart/modal di-edit
                                                const totalUnitModal = (unit.sparepart_cost || 0) + (unit.purchase_price || 0);
                                                const isSold = unit.status === "SOLD";
                                                const isLoss = unit.selling_price > 0 && totalUnitModal > unit.selling_price;
                                                return (
                                                    <tr key={unit.id} className={`transition-colors group hover:bg-gray-50/60 ${isSold ? "opacity-60" : ""}`}>
                                                        <td className="px-4 py-3.5">
                                                            <span className="font-mono text-xs text-gray-700 bg-gray-100 px-2 py-1 rounded">
                                                                {unit.serial_number}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3.5 max-w-[220px]">
                                                            <p className="text-xs font-semibold text-gray-800 truncate">{unit.laptop_name}</p>
                                                            <p className="text-[10px] text-gray-400 truncate">
                                                                {[unit.brand, unit.cpu, unit.ram, unit.storage].filter(Boolean).join(" · ") || "—"}
                                                            </p>
                                                        </td>
                                                        <td className="px-4 py-3.5 whitespace-nowrap">
                                                            {g && (
                                                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${g.badge}`}>
                                                                    {g.label}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3.5 whitespace-nowrap">
                                                            <span className="text-xs text-gray-500">{fmtDate(unit.created_at)}</span>
                                                        </td>
                                                        {canSeePriceInfo && (
                                                            <>
                                                                {/* Harga Modal — editable (termasuk unit SOLD, biar profit transaksi bisa dikoreksi) */}
                                                                <td className="px-4 py-3.5 whitespace-nowrap">
                                                                    {canManageUnits ? (
                                                                        <EditableModalCell
                                                                            unitId={unit.id}
                                                                            value={unit.purchase_price}
                                                                            onSaved={handlePriceSaved}
                                                                        />
                                                                    ) : (
                                                                        <div className="text-right text-xs text-gray-500 tabular-nums">
                                                                            {fmt(unit.purchase_price)}
                                                                        </div>
                                                                    )}
                                                                </td>
                                                                {/* Harga Sparepart — editable */}
                                                                <td className="px-4 py-3.5 whitespace-nowrap">
                                                                    {canManageUnits && !isSold ? (
                                                                        <EditableSparepartCell
                                                                            unitId={unit.id}
                                                                            value={unit.sparepart_cost || 0}
                                                                            onSaved={handleSparepartSaved}
                                                                        />
                                                                    ) : (
                                                                        <div className="text-right text-xs text-blue-600 font-medium tabular-nums">
                                                                            {fmt(unit.sparepart_cost || 0)}
                                                                        </div>
                                                                    )}
                                                                </td>
                                                                {/* Total Modal = Sparepart + Modal, reaktif — merah kalau melebihi harga jual (potensi rugi) */}
                                                                <td className="px-4 py-3.5 text-right whitespace-nowrap tabular-nums">
                                                                    <span
                                                                        className={`text-xs font-semibold ${isLoss ? "text-red-600" : "text-violet-700"}`}
                                                                        title={isLoss ? "Total modal melebihi harga jual — unit ini berpotensi rugi" : undefined}
                                                                    >
                                                                        {fmt(totalUnitModal)}
                                                                    </span>
                                                                    {isLoss && (
                                                                        <p className="text-[9px] text-red-500 font-semibold leading-tight mt-0.5">
                                                                             Rugi
                                                                        </p>
                                                                    )}
                                                                </td>
                                                            </>
                                                        )}
                                                        <td className="px-4 py-3.5 text-right font-semibold text-gray-800 whitespace-nowrap tabular-nums">
                                                            {fmt(unit.selling_price)}
                                                        </td>
                                                        <td className="px-4 py-3.5 whitespace-nowrap">
                                                            {s && (
                                                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${s.badge}`}>
                                                                    <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                                                                    {s.label}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3.5">
                                                            <div className="flex items-center justify-end gap-1">
                                                                {canManageUnits && !isSold && (
                                                                    <button onClick={() => openEdit(unit)}
                                                                        className="h-8 px-3 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition">
                                                                        Edit
                                                                    </button>
                                                                )}
                                                                {canManageUnits && (
                                                                    <button onClick={() => handleDelete(unit)}
                                                                        className="h-8 w-8 rounded-lg text-red-500 hover:bg-red-50 transition flex items-center justify-center"
                                                                        title="Hapus Unit">
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/40 flex items-center justify-between">
                                    <span className="text-xs text-gray-400">
                                        Menampilkan{" "}
                                        <span className="font-medium text-gray-600">{filteredUnits.length}</span> dari{" "}
                                        <span className="font-medium text-gray-600">{soldUnits.length}</span> unit terjual
                                    </span>
                                    {(hasActiveFilter || filterGradeTab !== "ALL") && (
                                        <span className="text-xs text-amber-600 font-medium">Filter aktif</span>
                                    )}
                                </div>
                            </div>

                            {/* ── Card list (mobile / tablet, di bawah lg) ── */}
                            <div className="lg:hidden space-y-3">
                                {/* Bar sort + jumlah */}
                                <div className="flex items-center justify-between gap-2 px-1">
                                    <span className="text-[11px] text-gray-400">
                                        <span className="font-semibold text-gray-600">{filteredUnits.length}</span> dari{" "}
                                        <span className="font-semibold text-gray-600">{soldUnits.length}</span> unit terjual
                                    </span>
                                    <SnSortButton
                                        order={snSortOrder}
                                        onToggle={() => setSnSortOrder(o => o === "asc" ? "desc" : "asc")}
                                    />
                                </div>

                                {filteredUnits.map(unit => (
                                    <UnitCard
                                        key={unit.id}
                                        unit={unit}
                                        canSeePriceInfo={canSeePriceInfo}
                                        canManageUnits={canManageUnits}
                                        onEdit={openEdit}
                                        onDelete={handleDelete}
                                        onPriceSaved={handlePriceSaved}
                                        onSparepartSaved={handleSparepartSaved}
                                    />
                                ))}

                                {(hasActiveFilter || filterGradeTab !== "ALL") && (
                                    <p className="text-center text-[11px] text-amber-600 font-medium pt-1">Filter aktif</p>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </main>

            {/* ── Modals ── */}
            {pickerMode && (
                <LaptopPickerModal
                    title={pickerMode === "unit" ? "Pilih Laptop untuk Unit Baru" : "Pilih Laptop untuk Tambah Banyak Unit"}
                    onClose={() => setPickerMode(null)}
                    onSelect={laptop => {
                        if (pickerMode === "unit") { setEditingUnit(null); setNewUnitLaptop(laptop); }
                        else { setBulkLaptop(laptop); }
                        setPickerMode(null);
                    }}
                />
            )}

            {showUnitForm && (
                <UnitFormModal
                    laptopId={editingUnit ? editingUnit.laptop_id : newUnitLaptop!.id}
                    defaultSellingPrice={editingUnit ? 0 : newUnitLaptop!.selling_price}
                    editingUnit={editingUnit}
                    onClose={closeUnitForm}
                    onSuccess={fetchUnits}
                    onError={msg => setAlertModal(msg)}
                />
            )}

            {bulkLaptop && (
                <BulkAddUnitModal
                    laptopId={bulkLaptop.id}
                    defaultSellingPrice={bulkLaptop.selling_price}
                    onClose={() => setBulkLaptop(null)}
                    onSuccess={fetchUnits}
                />
            )}

            {showAddLaptopModal && (
                <AddLaptopModal
                    onClose={() => setShowAddLaptopModal(false)}
                    onSuccess={() => setToast("Laptop berhasil ditambahkan")}
                />
            )}

            {alertModal && <AlertModal message={alertModal} onClose={() => setAlertModal(null)} />}
            {confirmModal && <ConfirmModal message={confirmModal.message} onConfirm={confirmModal.onConfirm} onCancel={() => setConfirmModal(null)} />}
            {toast && <Toast message={toast} onDone={() => setToast("")} />}
        </DashboardLayout>
    );
}