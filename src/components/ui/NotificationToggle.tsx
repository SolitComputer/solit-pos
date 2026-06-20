"use client";

import { usePushNotification } from "@/hooks/usePushNotification";
import { useEffect, useState } from "react";

export function NotificationToggle() {
    const { permission, isSubscribed, isLoading, subscribe, unsubscribe } = usePushNotification();
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);
    if (!mounted) return null;

    if (permission === "unsupported") {
        return (
            <div className="flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-medium text-gray-400 border border-gray-200 bg-gray-50">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                <span>Tidak didukung</span>
            </div>
        );
    }

    if (permission === "denied") {
        return (
            <div className="flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-medium text-red-500 border border-red-200 bg-red-50">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <span>Diblokir browser</span>
            </div>
        );
    }

    // Sudah aktif
    if (isSubscribed) {
        return (
            <button
                onClick={unsubscribe}
                disabled={isLoading}
                title="Matikan notifikasi"
                className="flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-semibold border transition hover:bg-emerald-100 disabled:opacity-50"
                style={{ background: "#ecfdf5", color: "#059669", borderColor: "#a7f3d0" }}
            >
                {isLoading
                    ? <div className="w-3.5 h-3.5 rounded-full animate-spin" style={{ border: "2px solid #a7f3d0", borderTopColor: "#059669" }} />
                    : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                }
                <span>Notif Aktif</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </button>
        );
    }

    // Belum aktif
    return (
        <button
            onClick={subscribe}
            disabled={isLoading}
            title="Aktifkan notifikasi push"
            className="flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-semibold border transition hover:opacity-90 disabled:opacity-50"
            style={{
                background: "linear-gradient(135deg, #f59e0b, #ef4444)",
                color: "#fff",
                borderColor: "transparent",
                boxShadow: "0 2px 8px rgba(245,158,11,0.3)",
            }}
        >
            {isLoading
                ? <div className="w-3.5 h-3.5 rounded-full animate-spin" style={{ border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff" }} />
                : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
            }
            <span>Aktifkan Notif</span>
        </button>
    );
}