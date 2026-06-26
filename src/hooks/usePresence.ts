// src/hooks/usePresence.ts
"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";

const HEARTBEAT_INTERVAL_MS = 15_000; // 15 detik — lebih responsif
const INITIAL_DELAY_MS = 500;

export function usePresence() {
  const pathname = usePathname();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isVisibleRef = useRef(true);

  const sendHeartbeat = useCallback(async (page: string) => {
    if (!isVisibleRef.current) return; // Jangan kirim jika tab hidden
    try {
      await fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page }),
      });
    } catch {
      // Silently fail
    }
  }, []);

  const clearPresence = useCallback(() => {
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/presence",
          new Blob([JSON.stringify({ _clear: true })], { type: "application/json" })
        );
      } else {
        fetch("/api/presence", { method: "DELETE", keepalive: true }).catch(() => { });
      }
    } catch { /* non-critical */ }
  }, []);

  const startInterval = useCallback((page: string) => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      sendHeartbeat(page);
    }, HEARTBEAT_INTERVAL_MS);
  }, [sendHeartbeat]);

  const stopInterval = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // ── Kirim heartbeat & restart interval saat pathname berubah ─────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      sendHeartbeat(pathname);
      startInterval(pathname);
    }, INITIAL_DELAY_MS);

    return () => clearTimeout(timer);
  }, [pathname, sendHeartbeat, startInterval]);

  // ── Handle visibility change (tab focus/blur) ─────────────────────────────
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Tab kembali fokus — langsung kirim heartbeat & restart interval
        isVisibleRef.current = true;
        sendHeartbeat(pathname);
        startInterval(pathname);
      } else {
        // Tab di-hide — stop interval, tandai offline via beacon
        isVisibleRef.current = false;
        stopInterval();
        clearPresence();
      }
    };

    const handleBeforeUnload = () => {
      stopInterval();
      clearPresence();
    };

    // Handle focus/blur window (switch ke app lain)
    const handleFocus = () => {
      if (!isVisibleRef.current) {
        isVisibleRef.current = true;
        sendHeartbeat(pathname);
        startInterval(pathname);
      }
    };

    const handleBlur = () => {
      // Saat window blur (minimized/switch app) — jangan langsung offline,
      // biarkan interval tetap jalan karena user mungkin masih di tab ini
      // (handled by visibilitychange)
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
    };
  }, [pathname, sendHeartbeat, startInterval, stopInterval, clearPresence]);

  // ── Cleanup saat unmount ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopInterval();
    };
  }, [stopInterval]);
}