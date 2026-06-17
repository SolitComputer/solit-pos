// src/components/ui/NotificationBanner.tsx
"use client";

import { useEffect, useState } from "react";
import { usePushNotification } from "@/hooks/usePushNotification";

export function NotificationBanner() {
    const { permission, isSubscribed, isLoading, subscribe } = usePushNotification();
    const [dismissed, setDismissed] = useState(false);
    const [justEnabled, setJustEnabled] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        if (typeof window === "undefined") return;
        // ✅ sessionStorage — reset tiap browser session baru, bukan permanen
        const val = sessionStorage.getItem("notif_banner_dismissed");
        if (val === "true") setDismissed(true);
    }, []);

    const handleEnable = async () => {
        const success = await subscribe();
        if (success) {
            setJustEnabled(true);
            setTimeout(() => setDismissed(true), 2500);
        }
    };

    const handleDismiss = () => {
        setDismissed(true);
        sessionStorage.setItem("notif_banner_dismissed", "true");
    };

    // Hindari hydration mismatch
    if (!mounted) return null;

    // Kondisi tidak perlu tampil
    if (
        dismissed ||
        permission === "unsupported" ||
        permission === "denied" ||
        isSubscribed
    ) return null;

    // Sukses aktifkan
    if (justEnabled) {
        return (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 text-sm font-semibold"
                style={{ animation: "slideUp 0.3s ease-out" }}>
                <span className="text-base">🔔</span>
                Notifikasi berhasil diaktifkan!
            </div>
        );
    }

    return (
        <>
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] w-[calc(100%-2rem)] max-w-md"
                style={{ animation: "slideUp 0.3s ease-out" }}>
                <div className="bg-[#1a1a2e] text-white rounded-2xl shadow-2xl overflow-hidden border border-white/10">
                    <div className="px-4 py-3.5 flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-xl">🔔</span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold leading-tight">Aktifkan Notifikasi Chat</p>
                            <p className="text-xs text-white/60 mt-0.5 leading-relaxed">
                                Terima notifikasi pesan baru langsung di HP/laptop, bahkan saat app ditutup.
                            </p>
                        </div>
                        <button
                            onClick={handleDismiss}
                            className="w-6 h-6 flex items-center justify-center text-white/40 hover:text-white flex-shrink-0 mt-0.5 transition"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    <div className="px-4 pb-4 flex gap-2">
                        <button
                            onClick={handleDismiss}
                            className="flex-1 h-9 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold transition"
                        >
                            Nanti saja
                        </button>
                        <button
                            onClick={handleEnable}
                            disabled={isLoading}
                            className="flex-1 h-9 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl text-xs font-semibold transition disabled:opacity-60 flex items-center justify-center gap-1.5"
                        >
                            {isLoading ? (
                                <>
                                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Memproses...
                                </>
                            ) : (
                                <><span>🔔</span> Aktifkan</>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            <style jsx global>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
        </>
    );
}

// ── Tombol toggle notifikasi (taruh di Sidebar atau settings) ──────────────────
export function NotificationToggleButton() {
    const { permission, isSubscribed, isLoading, subscribe, unsubscribe } = usePushNotification();
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);
    if (!mounted) return null;
    if (permission === "unsupported") return null;

    if (permission === "denied") {
        return (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
                <span>🔕</span>
                <span>Notifikasi diblokir — aktifkan di pengaturan browser</span>
            </div>
        );
    }

    return (
        <button
            onClick={isSubscribed ? unsubscribe : subscribe}
            disabled={isLoading}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition border ${isSubscribed
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                    : "bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200"
                } disabled:opacity-50`}
            title={isSubscribed ? "Nonaktifkan notifikasi" : "Aktifkan notifikasi"}
        >
            {isLoading ? (
                <div className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
            ) : (
                <span>{isSubscribed ? "🔔" : "🔕"}</span>
            )}
            {isSubscribed ? "Notifikasi aktif" : "Aktifkan notifikasi"}
        </button>
    );
}