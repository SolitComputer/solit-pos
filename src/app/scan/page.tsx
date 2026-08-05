"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QuickScan from "@/components/ui/QuickScan";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { getAuthUser } from "@/hooks/useAuthUser";

interface User {
    id: string;
    name: string;
    role: string;
}

export default function ScanPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchUser();
    }, []);

    const fetchUser = async () => {
        try {
            const res = await getAuthUser().then(u => ({ ok: true, json: () => Promise.resolve({ success: true, user: u }) }));
            const result = await res.json();

            if (result?.user) {
                setUser(result.user);
            } else {
                setUser(null);
            }
        } catch {
            setUser(null);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <main className="min-h-screen bg-[#F7F7F8] flex items-center justify-center p-4">
                <div className="flex flex-col items-center gap-4">
                    <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-[#0f0c29] via-[#150f38] to-[#1a1545] flex items-center justify-center shadow-lg shadow-violet-900/10">
                        <svg className="w-7 h-7 text-violet-300 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        <span className="absolute inset-0 rounded-2xl border-2 border-violet-500/30 animate-ping" />
                    </div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                        Menyiapkan scanner…
                    </p>
                </div>
            </main>
        );
    }

    return (
        <DashboardLayout>

            <main className="min-h-screen bg-[#F7F7F8]">
                <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 space-y-4 sm:space-y-5 lg:space-y-6">

                    {/* ── Top bar ── */}
                    <div className="flex items-center gap-3 animate-fadeIn">
                        <button
                            onClick={() => router.back()}
                            aria-label="Kembali"
                            title="Kembali"
                            className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-900 hover:border-gray-300 active:scale-95 transition-all duration-150 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M19 12H5M12 5l-7 7 7 7" />
                            </svg>
                        </button>
                        <div className="min-w-0">
                            <h1 className="text-lg sm:text-xl font-black text-gray-900 tracking-tight truncate">
                                Pindai Barcode Unit
                            </h1>
                            <p className="text-[11px] sm:text-xs text-gray-400 font-medium truncate">
                                Cari data unit lewat barcode atau nomor serial
                            </p>
                        </div>
                    </div>

                    {/* ── Hero: status banner dengan efek laser-scan ── */}
                    <div
                        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f0c29] via-[#150f38] to-[#1a1545] px-5 py-5 sm:px-7 sm:py-6 shadow-lg shadow-violet-950/10 animate-fadeIn"
                        style={{ animationDelay: "0.05s" }}
                    >
                        {/* garis laser yang menyapu — motif "scan" */}
                        <div className="pointer-events-none absolute inset-x-0 top-0 bottom-0 opacity-70 motion-reduce:hidden">
                            <div className="animate-scanline absolute inset-x-4 sm:inset-x-6 h-px bg-gradient-to-r from-transparent via-emerald-400 to-transparent" />
                        </div>
                        {/* pola titik halus di kanan, samar */}
                        <div
                            className="pointer-events-none absolute -right-6 -top-6 w-40 h-40 opacity-[0.07]"
                            style={{
                                backgroundImage: "radial-gradient(circle, white 1px, transparent 1.5px)",
                                backgroundSize: "10px 10px",
                            }}
                        />

                        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div className="flex items-start gap-3 min-w-0">
                                <div className="w-11 h-11 sm:w-12 sm:h-12 flex-shrink-0 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center backdrop-blur-sm">
                                    <svg className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <rect x="3" y="3" width="18" height="18" rx="3" strokeWidth={2} />
                                        <path strokeLinecap="round" strokeWidth={2} d="M7 8v8M11 8v8M14 8v3M14 14v2M17 8v8" />
                                    </svg>
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[10px] font-bold text-emerald-300/90 uppercase tracking-[0.15em] font-mono">
                                        Solit · Unit Scanner
                                    </p>
                                    <p className="text-sm sm:text-base font-bold text-white mt-0.5 leading-snug">
                                        Arahkan kamera ke barcode
                                    </p>
                                    <p className="text-[11px] sm:text-xs text-white/50 mt-0.5">
                                        Hasil scan otomatis menampilkan data unit
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                                <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-emerald-400/10 border border-emerald-400/20">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                                    <span className="text-[11px] font-bold text-emerald-300">Siap memindai</span>
                                </span>
                                {user && (
                                    <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-white/10 border border-white/10">
                                        <span className="w-5 h-5 rounded-full bg-violet-400/30 flex items-center justify-center text-[9px] font-black text-violet-100 flex-shrink-0">
                                            {(user.name?.[0] || "U").toUpperCase()}
                                        </span>
                                        <span className="text-[11px] font-semibold text-white/80 truncate max-w-[80px]">
                                            {user.name?.split(" ")[0] || "User"}
                                        </span>
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ── Main grid: scanner + sidebar ── */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5 lg:gap-6 items-start">

                        {/* ── Scanner card ── */}
                        <div
                            className="lg:col-span-2 bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden transition-shadow duration-300 hover:shadow-md animate-slideUp"
                            style={{ animationDelay: "0.1s" }}
                        >
                            <div className="p-4 sm:p-5 lg:p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <span className="w-1 h-4 bg-violet-500 rounded-full" />
                                        <p className="text-xs font-bold text-gray-800 uppercase tracking-wide">
                                            Area Scan
                                        </p>
                                    </div>
                                    <span className="text-[10px] font-mono font-semibold text-gray-300 uppercase tracking-wider">
                                        Barcode · QR
                                    </span>
                                </div>

                                {/* Wrapper dengan bracket viewfinder — motif visual kamera scanner */}
                                <div className="relative rounded-2xl bg-gray-50 border border-gray-100 p-3 sm:p-4">
                                    <span className="pointer-events-none absolute left-2 top-2 w-5 h-5 border-l-2 border-t-2 border-violet-400 rounded-tl-lg" />
                                    <span className="pointer-events-none absolute right-2 top-2 w-5 h-5 border-r-2 border-t-2 border-violet-400 rounded-tr-lg" />
                                    <span className="pointer-events-none absolute left-2 bottom-2 w-5 h-5 border-l-2 border-b-2 border-violet-400 rounded-bl-lg" />
                                    <span className="pointer-events-none absolute right-2 bottom-2 w-5 h-5 border-r-2 border-b-2 border-violet-400 rounded-br-lg" />

                                    <QuickScan user={user} />
                                </div>

                                {/* Info footer */}
                                <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                                </div>
                            </div>
                        </div>

                        {/* ── Sidebar ── */}
                        <div className="space-y-3 sm:space-y-4 lg:sticky lg:top-6">
                            {/* Kamera CTA */}
                            <Link
                                href="/scan/camera"
                                className="group flex items-center gap-3 rounded-3xl bg-gradient-to-br from-violet-600 to-violet-700 text-white p-4 sm:p-5 shadow-sm hover:shadow-lg hover:shadow-violet-600/20 active:scale-[0.98] transition-all duration-200 animate-fadeUp"
                                style={{ animationDelay: "0.15s" }}
                            >
                                <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold leading-tight">Buka Kamera Scanner</p>
                                    <p className="text-[11px] text-violet-100/80 mt-0.5">Mode kamera penuh layar</p>
                                </div>
                                <svg className="w-4 h-4 text-violet-200 flex-shrink-0 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                </svg>
                            </Link>
                        </div>
                    </div>
                </div>

                <style jsx>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(16px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes fadeUp {
                    from { opacity: 0; transform: translateY(12px); }
                    to { opacity: 1; transform: translateY(0); }
                    }
                @keyframes scanline {
                    0% { top: 6%; opacity: 0; }
                    15% { opacity: 1; }
                    85% { opacity: 1; }
                    100% { top: 94%; opacity: 0; }
                }
                .animate-fadeIn { animation: fadeIn 0.4s ease-out both; }
                .animate-slideUp { animation: slideUp 0.45s ease-out both; }
                .animate-fadeUp { animation: fadeUp 0.45s ease-out both; }
                .animate-scanline { animation: scanline 2.6s ease-in-out infinite; }

                @media (prefers-reduced-motion: reduce) {
                    .animate-fadeIn,
                    .animate-slideUp,
                    .animate-fadeUp,
                    .animate-scanline {
                        animation: none !important;
                    }
                }
            `}</style>
            </main>
        </DashboardLayout>
    );
}