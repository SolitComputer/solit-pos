// src/hooks/usePresence.ts
"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";

const HEARTBEAT_INTERVAL_MS = 30_000; 
const INITIAL_DELAY_MS = 1_000;      


export function usePresence() {
  const pathname = usePathname();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPathnameRef = useRef<string>("");

  const sendHeartbeat = useCallback(async (page: string) => {
    try {
      await fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page }),
        // Tidak perlu await response — fire and forget
      });
    } catch {
      // Silently fail — tidak perlu alert user jika heartbeat gagal
    }
  }, []);

  const clearPresence = useCallback(async () => {
    try {
      // Gunakan sendBeacon untuk pastikan request terkirim saat tab ditutup
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/presence", new Blob(
          [JSON.stringify({ _clear: true })],
          { type: "application/json" }
        ));
      } else {
        await fetch("/api/presence", { method: "DELETE", keepalive: true });
      }
    } catch { /* non-critical */ }
  }, []);

  // ── Kirim heartbeat saat pathname berubah ─────────────────────────────────
  useEffect(() => {
    if (pathname === lastPathnameRef.current) return;
    lastPathnameRef.current = pathname;

    const timer = setTimeout(() => {
      sendHeartbeat(pathname);
    }, INITIAL_DELAY_MS);

    return () => clearTimeout(timer);
  }, [pathname, sendHeartbeat]);

  // ── Interval heartbeat reguler ────────────────────────────────────────────
  useEffect(() => {
    // Kirim langsung pertama kali
    const initialTimer = setTimeout(() => {
      sendHeartbeat(pathname);
    }, INITIAL_DELAY_MS);

    timerRef.current = setInterval(() => {
      sendHeartbeat(pathname);
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimer);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []); 

  useEffect(() => {
    const handleBeforeUnload = () => clearPresence();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        sendHeartbeat(pathname);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [pathname, clearPresence, sendHeartbeat]);
}