// src/hooks/useVehiclePendingBadge.ts
"use client";

import { useEffect, useState, useCallback } from "react";
import { startJitteredPolling } from "@/lib/pollingScheduler";
import { VEHICLE_APPROVAL_ROLES } from "@/lib/permissions";

const POLL_MS = 60_000;

// Badge notif SENYAP (tanpa bunyi) buat APPROVER (Kepala Sales): jumlah pengajuan
// pinjam kendaraan yang masih PENDING. Gate-nya pakai VEHICLE_APPROVAL_ROLES
// supaya otomatis sinkron dengan canApprove di backend.
export function useVehiclePendingBadge(userRoles: string[], userId?: string) {
  const [count, setCount] = useState(0);
  const canApprove = userRoles.some((r) =>
    (VEHICLE_APPROVAL_ROLES as readonly string[]).includes(r)
  );

  const fetchCount = useCallback(async () => {
    if (!userId || !canApprove) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    try {
      const res = await fetch("/api/vehicles/pending-count", { signal: AbortSignal.timeout(8000) });
      const d = await res.json();
      if (d.success) setCount(d.count ?? 0);
    } catch {
      // notifikasi bukan fitur kritis — abaikan kalau fetch gagal
    }
  }, [userId, canApprove]);

  useEffect(() => {
    if (!canApprove) {
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
  }, [fetchCount, canApprove]);

  return { count, refresh: fetchCount };
}
