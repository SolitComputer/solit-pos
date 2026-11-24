"use client";
// src/components/inventory/AccessoryUnitDetailModal.tsx
//
// Pop-up Detail Unit Aksesoris — VIEW-ONLY.
// Tambah unit lewat "+ Unit/SN" di header Data Barang.
// Edit unit lewat halaman Kelola Unit.

import { useEffect } from "react";
import { useRegisterOverlay } from "@/contexts/OverlayContext";

export interface AccessoryUnitDetailData {
    id: string;
    accessory_id: string;
    serial_number: string;
    condition: "BARU" | "BEKAS";
    buy_price: number;
    selling_price: number;
    status: string;
    branch?: "UTAMA" | "JOGJA" | null;
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
    MINUS_SIAP_JUAL: { badge: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500", label: "Minus Siap Jual" },
    TERJUAL: { badge: "bg-gray-100 text-gray-500 border-gray-200", dot: "bg-gray-400", label: "Terjual" },
};
const CONDITION_STYLE: Record<string, { badge: string }> = {
    BARU: { badge: "bg-sky-50 text-sky-700 border-sky-200" },
    BEKAS: { badge: "bg-amber-50 text-amber-700 border-amber-200" },
};

const fmt = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");
const fmtDate = (iso: string) =>
    iso ? new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" }) : "—";

export default function AccessoryUnitDetailModal({
    unit, accessoryName, accessoryMeta, canSeePrivate, onClose,
}: Props) {
    useRegisterOverlay();

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    const buyNow = unit.buy_price ?? 0;
    const jualNow = unit.selling_price ?? 0;
    const margin = jualNow - buyNow;
    const marginPct = buyNow > 0 ? (margin / buyNow) * 100 : 0;

    const st = STATUS_STYLE[unit.status];
    const cd = CONDITION_STYLE[unit.condition];

    return (
        <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden">
                <div className="h-0.5 w-full bg-gradient-to-r from-zinc-300 via-zinc-600 to-zinc-900 flex-shrink-0" />

                <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
                    <div className="min-w-0">
                        <h2 className="font-bold text-gray-900 text-[15px] tracking-tight truncate">{accessoryName || "Detail Unit"}</h2>
                        <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                            {accessoryMeta || "Detail unit"}
                        </p>
                    </div>
                    <button onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition flex-shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
                    {/* Ringkasan atas — SN + status + kondisi */}
                    <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Serial Number</p>
                        <code className="inline-block font-mono text-sm text-gray-900 bg-white border border-gray-200 px-3 py-1.5 rounded-lg select-all">
                            {unit.serial_number}
                        </code>
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
                    </div>

                    {canSeePrivate ? (
                        <>
                            <Section title="Tanggal Masuk">
                                <p className="text-sm text-gray-800 font-medium">{fmtDate(unit.created_at)}</p>
                            </Section>

                            <Section title="Keuangan Unit">
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="Harga Modal">
                                        <p className="text-sm font-semibold text-gray-800 tabular-nums">{fmt(buyNow)}</p>
                                    </Field>
                                    <Field label="Harga Jual">
                                        <p className="text-sm font-semibold text-gray-800 tabular-nums">{fmt(jualNow)}</p>
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
                                <p className="text-sm text-gray-700 leading-relaxed">
                                    {unit.notes || <span className="text-gray-300">Belum diisi</span>}
                                </p>
                            </Section>

                            <p className="text-[10px] text-gray-300 font-mono break-all">ID unit: {unit.id}</p>
                        </>
                    ) : (
                        <p className="text-[11px] text-gray-400 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5">
                            Harga modal hanya dapat diakses oleh Pengelola Barang.
                        </p>
                    )}
                </div>

                {/* Footer — view-only, cuma tombol Tutup */}
                <div className="px-5 py-4 border-t border-gray-100 flex gap-2 flex-shrink-0">
                    <button onClick={onClose} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition">
                        Tutup
                    </button>
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