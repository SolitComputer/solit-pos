// src/hooks/useOvertimeNotify.ts
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { startJitteredPolling } from "@/lib/pollingScheduler";
import { isPrepSilent } from "@/lib/prepAlarm";

export interface PendingOvertimeItem {
  id: string;
  user_name: string;
  user_id: string;
  overtime_minutes: number;
  direction: string;
  request_date: string;
  category: string;
}

const POLL_MS = 60_000;
const SOUND_URL = "/sounds/overtime-alert.mp3";

export function useOvertimeNotify(userRoles: string[], userId?: string) {
  const [pending, setPending] = useState<PendingOvertimeItem[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Ditutup DI DALAM fetchPending setelah data asli dari API diterima —
  // bukan di effect terpisah yang jalan duluan saat `pending` masih [],
  // supaya overtime LAMA yang belum di-approve tidak dianggap "baru" dan
  // bikin alarm salah bunyi saat halaman pertama kali dibuka.
  const isFirstLoadRef = useRef(true);

  const fetchPending = useCallback(async () => {
    if (!userId || userRoles.length === 0) return;
    // Skip fetch saat tab hidden — hemat request
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    try {
      const res = await fetch("/api/attendance/overtime/pending-acc", { signal: AbortSignal.timeout(8000) });
      const d = await res.json();
      if (d.success) {
        const items: PendingOvertimeItem[] = d.data || [];
        const isNew = items.some((p) => !seenIdsRef.current.has(p.id));
        const isSilent = isPrepSilent(null, userRoles);
        if (isNew && items.length > 0 && !isFirstLoadRef.current && !isSilent) {
          if (!audioRef.current) {
            audioRef.current = new Audio(SOUND_URL);
          }
          audioRef.current.play().catch(() => {
            // Browser mungkin blokir autoplay sebelum ada interaksi user sama
            // sekali — ini normal, badge visual tetap muncul walau suara gagal.
          });
        }
        isFirstLoadRef.current = false;
        items.forEach((p) => seenIdsRef.current.add(p.id));
        setPending(items);
      }
    } catch {
      // notifikasi bukan fitur kritis — jangan ganggu UX kalau fetch gagal
    }
  }, [userId, userRoles]);

  useEffect(() => {
    fetchPending();
    // jitter → hindari semua client nembak di detik yang sama
    const stop = startJitteredPolling(fetchPending, POLL_MS);

    // Saat tab kembali visible, langsung fetch (bukan nunggu interval berikutnya)
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchPending();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchPending]);

  return {
    pending,
    count: pending.length,
    refresh: fetchPending,
  };
}