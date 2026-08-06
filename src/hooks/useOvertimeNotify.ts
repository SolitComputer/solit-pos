// src/hooks/useOvertimeNotify.ts
"use client";

import { useEffect, useRef, useState, useCallback } from "react";

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

  const fetchPending = useCallback(async () => {
    if (!userId || userRoles.length === 0) return;
    // Skip fetch saat tab hidden — hemat request
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    try {
      const res = await fetch("/api/attendance/overtime/pending-acc");
      const d = await res.json();
      if (d.success) setPending(d.data || []);
    } catch {
      // notifikasi bukan fitur kritis — jangan ganggu UX kalau fetch gagal
    }
  }, [userId, userRoles]);

  useEffect(() => {
    fetchPending();
    const id = setInterval(fetchPending, POLL_MS);

    // Saat tab kembali visible, langsung fetch (bukan nunggu interval berikutnya)
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchPending();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchPending]);

 useEffect(() => {
    const isNew = pending.some((p) => !seenIdsRef.current.has(p.id));
    if (isNew && pending.length > 0) {
      if (!audioRef.current) {
        audioRef.current = new Audio(SOUND_URL);
      }
      audioRef.current.play().catch(() => {
        // Browser mungkin blokir autoplay sebelum ada interaksi user sama
        // sekali — ini normal, badge visual tetap muncul walau suara gagal.
      });
    }
    pending.forEach((p) => seenIdsRef.current.add(p.id));
  }, [pending]);

  return {
    pending,
    count: pending.length,
    refresh: fetchPending,
  };
}