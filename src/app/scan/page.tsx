"use client";

import { useEffect, useState } from "react";
import QuickScan from "@/components/ui/QuickScan";
import Link from "next/link";

interface User {
    id: string;
    name: string;
    role: string;
}

export default function ScanPage() {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchUser();
    }, []);

    const fetchUser = async () => {
        try {
            const res = await fetch("/api/auth/me");
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
            <main className="min-h-screen bg-white flex items-center justify-center p-4">
                <div className="flex flex-col items-center gap-3 animate-pulse">
                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                    </div>
                    <div className="text-sm text-gray-400 font-medium animate-pulse">
                        Memuat scanner...
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-white p-4 sm:p-6 lg:p-8">
            <div className="max-w-2xl mx-auto space-y-4 sm:space-y-6">

                {/* Header */}
                <div className="animate-fadeIn">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-1 h-8 bg-gray-300 rounded-full" />
                        <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center shadow-sm">
                            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">
                                Quick Barcode Scanner
                            </h1>
                            <p className="text-sm text-gray-400 mt-1">
                                Scan barcode atau serial number untuk melihat data unit
                            </p>
                        </div>
                    </div>
                </div>

                {/* Scanner Container */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-all duration-300 hover:shadow-md animate-slideUp">
                    <div className="p-4 sm:p-5">
                        {/* Scanner Header */}
                        <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <rect x="3" y="3" width="18" height="18" rx="2" />
                                        <line x1="3" y1="9" x2="21" y2="9" />
                                        <line x1="3" y1="15" x2="21" y2="15" />
                                        <line x1="9" y1="3" x2="9" y2="21" />
                                        <line x1="15" y1="3" x2="15" y2="21" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Scanner Aktif</p>
                                    <p className="text-[11px] text-gray-300">Arahkan kamera ke barcode</p>
                                </div>
                            </div>
                            {user && (
                                <div className="flex items-center gap-1.5 bg-gray-50 px-2.5 py-1 rounded-full border border-gray-100">
                                    <div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" />
                                    <span className="text-[10px] font-semibold text-gray-500">
                                        {user.name?.split(" ")[0] || "User"}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* QuickScan Component */}
                        <QuickScan user={user} />

                        {/* Info Footer */}
                        <div className="mt-4 pt-3 border-t border-gray-100">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[11px] text-gray-400">
                                <div className="flex items-center gap-2">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <circle cx="12" cy="12" r="10" />
                                        <path d="M12 8v4l3 3" />
                                    </svg>
                                    <span>Hasil scan akan muncul otomatis</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" />
                                        <polyline points="10 17 15 12 10 7" />
                                        <line x1="15" y1="12" x2="3" y2="12" />
                                    </svg>
                                    <span>Support barcode dan QR Code</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Camera Scanner Button */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 animate-fadeUp" style={{ animationDelay: "0.1s" }}>
                    <Link
                        href="/scan/camera"
                        className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-xl bg-gray-800 text-white text-sm font-semibold hover:bg-gray-900 transition-all duration-200 shadow-sm hover:shadow-md active:scale-95 group"
                    >
                        <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Buka Kamera Scanner
                    </Link>

                    {/* Info tambahan */}
                    <div className="flex items-center justify-center sm:justify-end gap-2 text-[11px] text-gray-400">
                    </div>
                </div>


            </div>

            <style jsx>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes fadeUp {
                    from { opacity: 0; transform: translateY(15px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fadeIn { animation: fadeIn 0.4s ease-out; }
                .animate-slideUp { animation: slideUp 0.4s ease-out; }
                .animate-fadeUp { animation: fadeUp 0.4s ease-out; }
            `}</style>
        </main>
    );
}