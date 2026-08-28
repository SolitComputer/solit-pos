// src/hooks/useVehiclePendingBadge.ts
"use client";

import { useEffect, useState, useCallback } from "react";
import { startJitteredPolling } from "@/lib/pollingScheduler";

const POLL_MS = 60_000;

// Badge notif SENYAP (tanpa bunyi) buat admin: jumlah pengajuan pinjam kendaraan
// yang masih PENDING. Cuma jalan kalau user punya role ADMIN.
export function useVehiclePendingBadge(userRoles: string[], userId?: string) {
  const [count, setCount] = useState(0);
  const isAdmin = userRoles.includes("ADMIN");

  const fetchCount = useCallback(async () => {
    if (!userId || !isAdmin) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    try {
      const res = await fetch("/api/vehicles/pending-count", { signal: AbortSignal.timeout(8000) });
      const d = await res.json();
      if (d.success) setCount(d.count ?? 0);
    } catch {
      // notifikasi bukan fitur kritis — abaikan kalau fetch gagal
    }
  }, [userId, isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      setCount(0);
      return;
    }
    fetchCount();
    const stop = startJitteredPolling(fetchCount, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchCount();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchCount, isAdmin]);

  return { count, refresh: fetchCount };
}
