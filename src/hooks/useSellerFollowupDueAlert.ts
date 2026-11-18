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

// Cek ke server tiap 30 detik. Setiap pengecekan, kalau masih ada customer
// yang belum di-FU, toast + bunyi muncul lagi (spam sampai FU ditekan).
// Ubah angka ini kalau mau lebih sering / lebih jarang.
const POLL_INTERVAL_MS = 30 * 1000;
// 0 = tanpa jeda tambahan, alert muncul di setiap pengecekan.
const REPEAT_INTERVAL_MS = 0;
const REALTIME_DEBOUNCE_MS = 800;

function seenKey(userId: string) {
  return `solit_due_alert_seen_${userId}`;
}
function lastAlertKey(userId: string) {
  return `solit_due_alert_last_${userId}`;
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
  } catch {}
}

// Waktu alert terakhir disimpan di localStorage supaya pindah halaman
// (DashboardLayout ke-mount ulang) tidak mereset jeda pengulangan,
// dan beberapa tab tidak berbunyi bersamaan.
function loadLastAlert(userId: string): number {
  try {
    return Number(localStorage.getItem(lastAlertKey(userId)) ?? 0) || 0;
  } catch {
    return 0;
  }
}
function saveLastAlert(userId: string, ts: number) {
  try {
    localStorage.setItem(lastAlertKey(userId), String(ts));
  } catch {}
}

/**
 * Notifikasi OTOMATIS untuk PIC.
 * - Data diambil dari server (hanya milik PIC ini, aktif, dan kategori yang sesuai role).
 * - Selama masih ada customer yang belum di-FU, toast + bunyi diulang tiap REPEAT_INTERVAL_MS.
 * - Begitu FU ditekan (next_followup_at maju), item hilang dan pengulangan berhenti.
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
  const isInitialLoadRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchDue = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch("/api/seller-followups/due-alert", { cache: "no-store" });
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

      // Tidak ada yang perlu di-FU → hentikan semua notifikasi
      if (items.length === 0) {
        setNewAlert(null);
        isInitialLoadRef.current = false;
        return;
      }

      const now = Date.now();
      const justBecameDue = newlyDue.length > 0 && !isInitialLoadRef.current;
      const repeatDue = now - loadLastAlert(userId) >= REPEAT_INTERVAL_MS;

      if (justBecameDue) {
        // Ada customer yang BARU jatuh tempo → langsung ingatkan
        setNewAlert({ count: newlyDue.length, sample: newlyDue[0].customer_name });
        saveLastAlert(userId, now);
      } else if (repeatDue) {
        // Masih ada yang belum di-FU → ingatkan lagi (berulang)
        setNewAlert({ count, sample: items[0].customer_name });
        saveLastAlert(userId, now);
      }
      isInitialLoadRef.current = false;
    } catch {
      // silent — polling berikutnya akan mencoba lagi
    }
  }, [userId]);

  // ── Hydrate + polling ──
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

  // ── Sinyal dari halaman Management Seller: FU/arsip/hapus barusan berhasil ──
  // Supaya notifikasi hilang seketika tanpa menunggu realtime / polling.
  useEffect(() => {
    if (!userId) return;
    const onChanged = () => {
      fetchDue();
    };
    window.addEventListener("seller-followup-changed", onChanged);
    return () => window.removeEventListener("seller-followup-changed", onChanged);
  }, [userId, fetchDue]);

  const dismissDueAlert = useCallback(() => setNewAlert(null), []);

  return { dueItems, dueCount, newAlert, dismissDueAlert, forbidden };
}