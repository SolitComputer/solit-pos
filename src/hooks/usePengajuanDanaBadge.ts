// src/hooks/usePengajuanDanaBadge.ts
"use client";

import { useEffect, useState, useCallback } from "react";
import { startJitteredPolling } from "@/lib/pollingScheduler";

const POLL_MS = 30_000;

interface FundRequestRow {
  is_approved: boolean;
  is_rejected: boolean;
}

// Badge notif SENYAP (tanpa bunyi) buat admin: jumlah pengajuan dana yang
// masih menunggu approval. Beda dari usePengajuanDanaNotify (alarm + card
// melayang, cuma untuk 2 admin tertentu) — badge ini murni angka di menu
// sidebar, jalan untuk semua ADMIN.
export function usePengajuanDanaBadge(userRoles: string[], userId?: string | null) {
  const [count, setCount] = useState(0);
  const isAdmin = userRoles.includes("ADMIN");

  const fetchCount = useCallback(async () => {
    if (!userId || !isAdmin) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    try {
      const res = await fetch("/api/pengajuan-dana", { signal: AbortSignal.timeout(8000) });
      const json = await res.json();
      if (json.success) {
        const rows: FundRequestRow[] = json.data ?? [];
        setCount(rows.filter((r) => !r.is_approved && !r.is_rejected).length);
      }
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
