// src/components/ui/NotificationBanner.tsx
"use client";

import { useEffect, useState } from "react";
import { usePushNotification } from "@/hooks/usePushNotification";

export function NotificationBanner() {
  const { permission, isSubscribed, isLoading, subscribe } = usePushNotification();
  const [dismissed, setDismissed] = useState(false);
  const [justEnabled, setJustEnabled] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;
    const dismissedAt = localStorage.getItem("notif_banner_dismissed_at");
    if (dismissedAt) {
      const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
      if (parseInt(dismissedAt) > threeDaysAgo) {
        setDismissed(true);
      } else {
        // Sudah lebih dari 3 hari, tampilkan lagi
        localStorage.removeItem("notif_banner_dismissed_at");
      }
    }
  }, []);

  const handleEnable = async () => {
    const success = await subscribe();
    if (success) {
      setJustEnabled(true);
      setTimeout(() => setDismissed(true), 3000);
    } else {
      setRetryCount(c => c + 1);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("notif_banner_dismissed_at", String(Date.now()));
  };

  if (!mounted) return null;
  if (dismissed || permission === "unsupported" || permission === "denied" || isSubscribed) return null;

  // ✅ Sukses aktifkan — tampilkan konfirmasi lebih lama
  if (justEnabled) {
    return (
      <div
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 bg-emerald-600 text-white px-5 py-3.5 rounded-2xl shadow-2xl"
        style={{ animation: "slideUp 0.3s ease-out" }}
      >
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
          <span className="text-base">✅</span>
        </div>
        <div>
          <p className="text-sm font-bold">Notifikasi aktif!</p>
          <p className="text-xs text-white/80">Kamu akan terima notif chat baru</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] w-[calc(100%-2rem)] max-w-sm"
        style={{ animation: "slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)" }}
      >
        <div className="bg-[#1a1a2e] rounded-2xl shadow-2xl overflow-hidden border border-white/10">

          {/* ✅ Header dengan gradient */}
          <div
            className="px-4 pt-4 pb-3 flex items-start gap-3"
            style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 100%)" }}
          >
            {/* Ikon animasi */}
            <div className="relative flex-shrink-0 mt-0.5">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg">
                <span className="text-xl" style={{ animation: "bellRing 2s ease-in-out infinite" }}>🔔</span>
              </div>
              {/* Pulse ring */}
              <div className="absolute -inset-1 rounded-xl border-2 border-amber-400/30 animate-ping" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white leading-tight">
                Aktifkan Notifikasi Pesan
              </p>
              <p className="text-xs text-white/60 mt-1 leading-relaxed">
                Terima notif chat tim & DM langsung di HP, bahkan saat app ditutup.
              </p>
              {retryCount > 0 && (
                <p className="text-xs text-amber-400 mt-1">
                  ⚠️ Gagal {retryCount}x — pastikan browser mengizinkan notifikasi
                </p>
              )}
            </div>

            <button
              onClick={handleDismiss}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white hover:bg-white/10 flex-shrink-0 transition mt-0.5"
              title="Tutup (muncul lagi dalam 3 hari)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* ✅ Info fitur */}
          <div className="px-4 pb-3 flex items-center gap-4 text-[10px] text-white/40">
            <span className="flex items-center gap-1">
              <span>💬</span> Grup Chat
            </span>
            <span className="flex items-center gap-1">
              <span>📩</span> Pesan Langsung
            </span>
            <span className="flex items-center gap-1">
              <span>📱</span> Background
            </span>
          </div>

          {/* ✅ Tombol aksi */}
          <div className="px-4 pb-4 flex gap-2">
            <button
              onClick={handleDismiss}
              className="flex-1 h-10 bg-white/8 hover:bg-white/15 text-white/70 hover:text-white rounded-xl text-xs font-medium transition border border-white/10"
            >
              Nanti saja
            </button>
            <button
              onClick={handleEnable}
              disabled={isLoading}
              className="flex-[2] h-10 rounded-xl text-xs font-bold transition disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg"
              style={{
                background: "linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)",
                color: "white",
              }}
            >
              {isLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Memproses...</span>
                </>
              ) : (
                <>
                  <span>🔔</span>
                  <span>Aktifkan Sekarang</span>
                </>
              )}
            </button>
          </div>

          {/* ✅ Hide hint */}
          <div className="px-4 pb-3 text-center">
            <p className="text-[9px] text-white/25">
              Klik ✕ untuk sembunyikan • akan muncul kembali dalam 3 hari
            </p>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(24px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes bellRing {
          0%, 100% { transform: rotate(0deg); }
          10%, 30% { transform: rotate(-15deg); }
          20%, 40% { transform: rotate(15deg); }
          50% { transform: rotate(0deg); }
        }
      `}</style>
    </>
  );
}

// ── Toggle Button (untuk Sidebar/Settings) ────────────────────────────────────
export function NotificationToggleButton() {
  const { permission, isSubscribed, isLoading, subscribe, unsubscribe } = usePushNotification();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  if (!mounted || permission === "unsupported") return null;

  if (permission === "denied") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
        <span>🔕</span>
        <span>Notifikasi diblokir — aktifkan di browser</span>
      </div>
    );
  }

  return (
    <button
      onClick={isSubscribed ? unsubscribe : subscribe}
      disabled={isLoading}
      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition border w-full ${
        isSubscribed
          ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
          : "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
      } disabled:opacity-50`}
    >
      {isLoading ? (
        <div className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
      ) : (
        <span>{isSubscribed ? "🔔" : "🔕"}</span>
      )}
      <span className="flex-1 text-left">
        {isSubscribed ? "Notifikasi aktif" : "Aktifkan notifikasi"}
      </span>
      {isSubscribed && (
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
      )}
    </button>
  );
}