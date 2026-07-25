"use client";
// src/components/inventory/LaptopUnitsPreview.tsx
//
// Daftar unit di DALAM Pop-up Detail Laptop.
//
// Sebelumnya Pop-up Detail Laptop cuma menampilkan spesifikasi model — tidak ada
// satu pun data unit, jadi terlihat "kosong" untuk laptop stok 0 atau stok >1.
// Komponen ini menutup celah itu: semua unit (termasuk yang sudah SOLD) tampil
// dengan SN, grade, sumber, harga modal, dan status; klik baris → Pop-up Detail unit.

import { useEffect, useState } from "react";

export interface PreviewUnit {
    id: string;
    laptop_id: string;
    serial_number: string;
    grade: "A" | "B" | "C";
    condition_note: string;
    source?: string | null;
    purchase_price: number;
    sparepart_cost?: number;
    selling_price: number;
    status: string;
    notes: string;
    created_at: string;
}

interface Props {
    laptopId: string;
    /** Boleh lihat Sumber, Harga Modal, Margin */
    canSeePrivate: boolean;
    /** Klik baris unit → buka Pop-up Detail unit */
    onSelectUnit?: (unit: PreviewUnit) => void;
}

const STATUS_STYLE: Record<string, { badge: string; dot: string; label: string }> = {
    SIAP_JUAL: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", label: "Siap Jual" },
    BELUM_SIAP: { badge: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-400", label: "Belum Siap" },
    SERVICE: { badge: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-500", label: "Service" },
    RESERVED: { badge: "bg-violet-50 text-violet-700 border-violet-200", dot: "bg-violet-500", label: "Dipesan (DP)" },
    HELD: { badge: "bg-orange-50 text-orange-700 border-orange-200", dot: "bg-orange-500", label: "Diambil Dulu" },
    PACKING: { badge: "bg-sky-50 text-sky-700 border-sky-200", dot: "bg-sky-500", label: "Packing" },
    SOLD: { badge: "bg-gray-100 text-gray-500 border-gray-200", dot: "bg-gray-400", label: "Terjual" },
};

const GRADE_BADGE: Record<string, string> = {
    A: "bg-emerald-50 text-emerald-700 border-emerald-200",
    B: "bg-amber-50 text-amber-700 border-amber-200",
    C: "bg-red-50 text-red-700 border-red-200",
};

const fmt = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");
const fmtDate = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default function LaptopUnitsPreview({ laptopId, canSeePrivate, onSelectUnit }: Props) {
    const [units, setUnits] = useState<PreviewUnit[] | null>(null);
    const [error, setError] = useState("");
    const [showSold, setShowSold] = useState(false);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const res = await fetch(`/api/laptops/${laptopId}/units`);
                const result = await res.json();
                if (!alive) return;
                if (!res.ok || result.success === false) throw new Error(result.message || "Gagal memuat unit");
                setUnits((result.data ?? []) as PreviewUnit[]);
            } catch (e) {
                if (alive) setError(e instanceof Error ? e.message : "Gagal memuat unit");
            }
        })();
        return () => { alive = false; };
    }, [laptopId]);

    if (error) {
        return (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-xs text-red-700">{error}</p>
            </div>
        );
    }

    if (units === null) {
        return (
            <div className="space-y-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Daftar Unit</p>
                {[1, 2, 3].map(i => (
                    <div key={i} className="h-11 rounded-xl bg-gray-100 animate-pulse" />
                ))}
            </div>
        );
    }

    if (units.length === 0) {
        return (
            <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Daftar Unit</p>
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-4 py-6 text-center">
                    <p className="text-sm text-gray-500 font-medium">Belum ada unit terdaftar</p>
                    <p className="text-xs text-gray-400 mt-1">Tambahkan SN lewat halaman Units.</p>
                </div>
            </div>
        );
    }

    const aktif = units.filter(u => u.status !== "SOLD");
    const sold = units.filter(u => u.status === "SOLD");
    const visible = showSold ? units : aktif;

    const totalModal = aktif.reduce((s, u) => s + (u.purchase_price || 0) + (u.sparepart_cost || 0), 0);
    const totalJual = aktif.reduce((s, u) => s + (u.selling_price || 0), 0);

    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    Daftar Unit
                    <span className="ml-1.5 text-gray-300 normal-case tracking-normal font-medium">
                        {aktif.length} aktif{sold.length > 0 ? ` · ${sold.length} terjual` : ""}
                    </span>
                </p>
                {sold.length > 0 && (
                    <button
                        onClick={() => setShowSold(v => !v)}
                        className="text-[11px] font-semibold text-gray-500 hover:text-gray-800 underline underline-offset-2 transition"
                    >
                        {showSold ? "Sembunyikan terjual" : `Tampilkan ${sold.length} terjual`}
                    </button>
                )}
            </div>

            <div className="rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
                {visible.map(u => {
                    const st = STATUS_STYLE[u.status];
                    const margin = (u.selling_price || 0) - (u.purchase_price || 0) - (u.sparepart_cost || 0);
                    const isSold = u.status === "SOLD";

                    return (
                        <button
                            key={u.id}
                            type="button"
                            onClick={() => onSelectUnit?.(u)}
                            disabled={!onSelectUnit}
                            className={`w-full text-left px-3.5 py-3 transition ${isSold ? "bg-gray-50/60" : "bg-white"} ${onSelectUnit ? "hover:bg-gray-50 cursor-pointer" : "cursor-default"}`}
                        >
                            {/* Baris 1 — SN, grade, status */}
                            <div className="flex items-center gap-2 flex-wrap">
                                <code className={`font-mono text-[11px] px-2 py-1 rounded-lg ${isSold ? "bg-gray-100 text-gray-400 line-through" : "bg-gray-100 text-gray-800"}`}>
                                    {u.serial_number}
                                </code>
                                <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold border ${GRADE_BADGE[u.grade] ?? ""}`}>
                                    {u.grade}
                                </span>
                                {st && (
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${st.badge}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{st.label}
                                    </span>
                                )}
                                <span className="ml-auto text-[13px] font-bold text-gray-800 tabular-nums">
                                    {fmt(u.selling_price)}
                                </span>
                            </div>

                            {/* Baris 2 — detail per-unit */}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-gray-500">
                                {canSeePrivate && (
                                    <span>
                                        Modal <span className="font-semibold text-gray-700 tabular-nums">{fmt(u.purchase_price)}</span>
                                    </span>
                                )}
                                {canSeePrivate && (u.sparepart_cost ?? 0) > 0 && (
                                    <span>
                                        Sparepart <span className="font-semibold text-gray-700 tabular-nums">{fmt(u.sparepart_cost!)}</span>
                                    </span>
                                )}
                                {canSeePrivate && (
                                    <span>
                                        Margin{" "}
                                        <span className={`font-semibold tabular-nums ${margin >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                            {margin >= 0 ? "+" : "−"}{fmt(Math.abs(margin))}
                                        </span>
                                    </span>
                                )}
                                {canSeePrivate && (
                                    <span>
                                        Sumber <span className="font-medium text-gray-700">{u.source || "—"}</span>
                                    </span>
                                )}
                                {canSeePrivate && (
                                    <span>
                                        Masuk <span className="font-medium text-gray-700">{fmtDate(u.created_at)}</span>
                                    </span>
                                )}
                            </div>

                            {u.condition_note && (
                                <p className="mt-1 text-[11px] text-gray-400 line-clamp-2">{u.condition_note}</p>
                            )}
                        </button>
                    );
                })}
            </div>

            {canSeePrivate && aktif.length > 0 && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 px-1 text-[11px] text-gray-400">
                    <span>
                        Total modal aktif <span className="font-bold text-gray-700 tabular-nums">{fmt(totalModal)}</span>
                    </span>
                    <span>
                        Total harga jual <span className="font-bold text-gray-700 tabular-nums">{fmt(totalJual)}</span>
                    </span>
                    <span>
                        Estimasi margin{" "}
                        <span className={`font-bold tabular-nums ${totalJual - totalModal >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                            {fmt(totalJual - totalModal)}
                        </span>
                    </span>
                </div>
            )}

            {onSelectUnit && (
                <p className="mt-2 px-1 text-[11px] text-gray-400">Klik salah satu unit untuk membuka detail lengkap &amp; mode edit.</p>
            )}
        </div>
    );
}