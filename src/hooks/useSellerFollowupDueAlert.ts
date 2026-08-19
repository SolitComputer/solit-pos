// src/hooks/useSellerFollowupDueAlert.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/services/supabase";

export interface DueFollowupItem {
  id: string;
  customer_name: string;
  seller_type: "USER" | "PEDAGANG";
  next_followup_at: string;
}

export interface DueAlert {
  count: number;
  sample: string;
}

const POLL_INTERVAL_MS = 3 * 60 * 1000; // fallback — menangkap jadwal yang lewat murni karena waktu berjalan
const REALTIME_DEBOUNCE_MS = 800;

function seenKey(userId: string) {
  return `solit_due_alert_seen_${userId}`;
}

function loadSeenIds(userId: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(seenKey(userId));
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveSeenIds(userId: string, ids: Set<string>) {
  try {
    sessionStorage.setItem(seenKey(userId), JSON.stringify(Array.from(ids)));
  } catch {
    // tidak fatal — paling toast bisa muncul lagi di tab baru
  }
}

/**
 * Notifikasi OTOMATIS — beda dari reminder manual Admin.
 * Deteksi langsung dari data seller_followups milik user ini yang sudah lewat
 * jadwal, tanpa perlu aksi siapa pun. Realtime menangkap perubahan status
 * (sudah FU / diarsip); polling 3 menit menangkap jadwal yang "baru lewat"
 * murni karena waktu berjalan.
 */
export function useSellerFollowupDueAlert(userId: string | null | undefined) {
  const [dueItems, setDueItems] = useState<DueFollowupItem[]>([]);
  const [dueCount, setDueCount] = useState(0);
  const [newAlert, setNewAlert] = useState<DueAlert | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const seenRef = useRef<Set<string>>(new Set());
  const initedRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const isInitialLoadRef = useRef(true);

  const fetchDue = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch("/api/seller-followups/due-alert");
      if (res.status === 403) {
        if (mountedRef.current) setForbidden(true);
        return;
      }
      const result = await res.json();
      if (!mountedRef.current || !result.success) return;

      const items: DueFollowupItem[] = result.items ?? [];
      const count: number = result.count ?? items.length;
      const currentIds = new Set(items.map((i) => i.id));
      const newlyDue = items.filter((i) => !seenRef.current.has(i.id));

      seenRef.current = currentIds;
      saveSeenIds(userId, currentIds);
      setDueItems(items);
      setDueCount(count);

      // Jangan bunyikan notifikasi / toast saat initial load
      if (newlyDue.length > 0 && !isInitialLoadRef.current) {
        setNewAlert({ count: newlyDue.length, sample: newlyDue[0].customer_name });
      }
      isInitialLoadRef.current = false;
    } catch {
      // silent — polling / realtime berikutnya akan mencoba lagi
    }
  }, [userId]);

  // ── Hydrate + polling fallback ──
  useEffect(() => {
    if (!userId) return;
    if (initedRef.current !== userId) {
      seenRef.current = loadSeenIds(userId);
      initedRef.current = userId;
    }
    fetchDue();
    const interval = setInterval(fetchDue, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [userId, fetchDue]);

  // ── Realtime: refetch begitu ada perubahan followup milik user ini ──
  // Menangkap kasus sales sudah FU (next_followup_at maju) atau di-archive
  // → item hilang dari daftar due tanpa nunggu polling 3 menit.
  useEffect(() => {
    if (!userId || forbidden) return;

    const debouncedFetch = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(fetchDue, REALTIME_DEBOUNCE_MS);
    };

    const channel = supabase
      .channel(`seller-due-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "seller_followups",
          filter: `pic_user_id=eq.${userId}`,
        },
        debouncedFetch
      )
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [userId, forbidden, fetchDue]);

  const dismissDueAlert = useCallback(() => setNewAlert(null), []);

  return { dueItems, dueCount, newAlert, dismissDueAlert, forbidden };
}