// C:\solit-pos\src\components\ui\QuickScan.tsx
//
// Komponen Quick Scan untuk penjualan cepat.
// Dipasang di halaman dashboard/laptops/page.tsx (di atas tabel).
//
// Fitur:
// - Input SN manual → tekan Enter atau klik Cari → muncul popup data unit
// - Jika SIAP_JUAL + role SALES/ADMIN → tombol "Jual Sekarang"
// - Jika role lain → hanya "Lihat Detail"
// - Auto-focus saat halaman dibuka (cocok untuk barcode scanner USB/Bluetooth
//   yang mengirim karakter + Enter)

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────
interface UnitResult {
    id: string;
    serial_number: string;
    grade: "A" | "B" | "C";
    condition_note: string;
    selling_price: number;
    status: string;
    laptop: {
        id: string;
        laptop_name: string;
        brand: string;
        cpu: string;
        ram: string;
        storage: string;
    };
}

interface AuthUser {
    id: string;
    name: string;
    role: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");

const GRADE_COLOR = {
    A: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
    B: { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200" },
    C: { bg: "bg-red-50",     text: "text-red-700",     border: "border-red-200" },
};

const STATUS_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
    SIAP_JUAL:  { label: "Siap Jual",  dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    BELUM_SIAP: { label: "Belum Siap", dot: "bg-amber-400",   badge: "bg-amber-50 text-amber-700 border-amber-200" },
    SERVICE:    { label: "Service",    dot: "bg-blue-500",    badge: "bg-blue-50 text-blue-700 border-blue-200" },
    SOLD:       { label: "Terjual",    dot: "bg-gray-400",    badge: "bg-gray-100 text-gray-500 border-gray-200" },
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function QuickScan({ user }: { user: AuthUser | null }) {
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);

    const [sn, setSn] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<UnitResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showResult, setShowResult] = useState(false);

    const canSell = user?.role === "ADMIN" || user?.role === "SALES" || user?.role === "OPERATOR";

    // Auto-focus input (agar scanner USB/BT langsung ketik ke sini)
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") closeResult();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, []);

    const handleSearch = useCallback(async (snValue?: string) => {
        const searchSn = (snValue ?? sn).trim();
        if (!searchSn) return;

        setLoading(true);
        setResult(null);
        setError(null);
        setShowResult(true);

        try {
            const res = await fetch(`/api/units/check-sn?sn=${encodeURIComponent(searchSn)}`);
            const data = await res.json();
            if (!data.success) {
                setError(data.message || "Unit tidak ditemukan");
            } else {
                setResult(data.data);
            }
        } catch {
            setError("Gagal menghubungi server. Coba lagi.");
        } finally {
            setLoading(false);
        }
    }, [sn]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") handleSearch();
    };

    const closeResult = () => {
        setShowResult(false);
        setResult(null);
        setError(null);
        setSn("");
        inputRef.current?.focus();
    };

    const handleSell = () => {
        if (!result) return;
        const params = new URLSearchParams({
            unit_id:   result.id,
            laptop_id: result.laptop.id,
            sn:        result.serial_number,
        });
        router.push(`/payment/create?${params.toString()}`);
    };

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {/* ── Header strip ── */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50/60">
                <div className="w-7 h-7 rounded-lg bg-[#1a1a2e] flex items-center justify-center flex-shrink-0">
                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M3 9V6a1 1 0 011-1h2M3 15v3a1 1 0 001 1h2m13-13h2a1 1 0 011 1v3m0 6v3a1 1 0 01-1 1h-2M9 5v14M12 5v14M15 5v14" />
                    </svg>
                </div>
                <div className="flex-1">
                    <p className="text-xs font-semibold text-gray-700">Quick Scan</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                        Scan barcode atau ketik SN → tekan Enter
                    </p>
                </div>
                {/* Indicator: scanner siap */}
                <div className="flex items-center gap-1.5 text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Siap scan
                </div>
            </div>

            {/* ── Input row ── */}
            <div className="flex gap-2 p-3">
                <div className="flex-1 relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                    </svg>
                    <input
                        ref={inputRef}
                        type="text"
                        value={sn}
                        onChange={e => setSn(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ketik atau scan Serial Number..."
                        className="w-full h-9 pl-8 pr-3 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/10 focus:border-[#1a1a2e] focus:bg-white transition font-mono"
                        autoComplete="off"
                        spellCheck={false}
                    />
                </div>
                <button
                    onClick={() => handleSearch()}
                    disabled={!sn.trim() || loading}
                    className="h-9 px-4 bg-[#1a1a2e] text-white rounded-lg text-xs font-semibold hover:bg-[#16213e] transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 whitespace-nowrap"
                >
                    {loading ? (
                        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                        </svg>
                    )}
                    Cari
                </button>
            </div>

            {/* ── Result popup ── */}
            {showResult && (
                <div className="mx-3 mb-3 rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                    {/* Loading */}
                    {loading && (
                        <div className="flex items-center gap-3 p-4 bg-gray-50">
                            <span className="w-4 h-4 border-2 border-gray-300 border-t-[#1a1a2e] rounded-full animate-spin flex-shrink-0" />
                            <span className="text-sm text-gray-500">Mencari SN <span className="font-mono font-semibold text-gray-700">{sn}</span>...</span>
                        </div>
                    )}

                    {/* Error */}
                    {!loading && error && (
                        <div className="p-4 bg-red-50 border-t border-red-100">
                            <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                    <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-semibold text-red-700">Tidak Ditemukan</p>
                                    <p className="text-xs text-red-500 mt-0.5">{error}</p>
                                </div>
                                <button onClick={closeResult} className="text-red-400 hover:text-red-600 transition p-1">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Success result */}
                    {!loading && result && (() => {
                        const grade  = GRADE_COLOR[result.grade] || GRADE_COLOR.A;
                        const status = STATUS_CONFIG[result.status] || STATUS_CONFIG.BELUM_SIAP;
                        const canSellThisUnit = canSell && result.status === "SIAP_JUAL";

                        return (
                            <div className="bg-white">
                                {/* Unit info */}
                                <div className="p-4">
                                    <div className="flex items-start gap-3 mb-3">
                                        <div className="text-xl flex-shrink-0 mt-0.5">💻</div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-sm text-[#1a1a2e] leading-snug">
                                                {result.laptop.laptop_name}
                                            </p>
                                            <p className="text-xs text-gray-400 mt-0.5">
                                                {[result.laptop.cpu, result.laptop.ram, result.laptop.storage]
                                                    .filter(Boolean).join(" · ")}
                                            </p>
                                        </div>
                                        <button onClick={closeResult} className="text-gray-300 hover:text-gray-500 transition p-1 flex-shrink-0">
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>

                                    {/* SN + Grade + Status row */}
                                    <div className="flex flex-wrap items-center gap-2 mb-3">
                                        <span className="font-mono text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                                            {result.serial_number}
                                        </span>
                                        <span className={`text-xs font-bold px-2 py-1 rounded-full border ${grade.bg} ${grade.text} ${grade.border}`}>
                                            Grade {result.grade}
                                        </span>
                                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border ${status.badge}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                                            {status.label}
                                        </span>
                                    </div>

                                    {/* Condition note */}
                                    {result.condition_note && (
                                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-3">
                                            {result.condition_note}
                                        </p>
                                    )}

                                    {/* Price */}
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-gray-400">Harga Jual</span>
                                        <span className="text-base font-bold text-[#1a1a2e]">
                                            {fmt(result.selling_price)}
                                        </span>
                                    </div>
                                </div>

                                {/* Action buttons */}
                                <div className="flex gap-2 px-4 pb-4">
                                    {canSell && (
                                        canSellThisUnit ? (
                                            <button
                                                onClick={handleSell}
                                                className="flex-1 flex items-center justify-center gap-2 h-9 bg-[#1a1a2e] text-white rounded-lg text-xs font-semibold hover:bg-[#16213e] transition"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                        d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                                                </svg>
                                                Jual Sekarang
                                            </button>
                                        ) : (
                                            <div className="flex-1 flex items-center justify-center gap-2 h-9 bg-gray-100 text-gray-400 rounded-lg text-xs font-medium border border-gray-200 cursor-not-allowed">
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                        d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                                </svg>
                                                Tidak bisa dijual ({status.label})
                                            </div>
                                        )
                                    )}
                                    <Link
                                        href={`/dashboard/laptops/${result.laptop.id}/units`}
                                        className="flex items-center justify-center gap-1.5 h-9 px-3 bg-white text-gray-600 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition whitespace-nowrap"
                                    >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                        Lihat Units
                                    </Link>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}
        </div>
    );
}