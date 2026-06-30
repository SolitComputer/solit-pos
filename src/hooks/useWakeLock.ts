"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export function useWakeLock() {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const wantRef = useRef(false);
  const [active, setActive] = useState(false);

  const request = useCallback(async () => {
    wantRef.current = true;
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return false;
    try {
      sentinelRef.current = await (navigator as any).wakeLock.request("screen");
      setActive(true);
      sentinelRef.current?.addEventListener?.("release", () => setActive(false));
      return true;
    } catch {
      setActive(false);
      return false;
    }
  }, []);

  const release = useCallback(async () => {
    wantRef.current = false;
    try { await sentinelRef.current?.release(); } catch { /* noop */ }
    sentinelRef.current = null;
    setActive(false);
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && wantRef.current && !sentinelRef.current) request();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [request]);

  useEffect(() => () => { release(); }, [release]);

  return { active, request, release };
}