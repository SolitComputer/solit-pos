"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/services/supabase";

// Hanya role pengantaran yang bisa ditugaskan mengantar → yang butuh badge
// ✅ FIX: PKL_PENGANTARAN juga bisa jadi driver, dulu tidak masuk daftar ini
// jadi driver PKL tidak dapat badge notifikasi tugas baru.
const ELIGIBLE_ROLES = new Set<string>(["PENGANTARAN", "PKL_PENGANTARAN"]);

/**
 * Jumlah tugas pengantaran aktif (status DIKIRIM, metode PENGANTARAN)
 * yang ditugaskan ke user saat ini. Live via Supabase Realtime.
 */
export function useDeliveryBadge(userId?: string | null, role?: string | null): number {
  const [count, setCount] = useState(0);
  const eligible = !!userId && !!role && ELIGIBLE_ROLES.has(role);

  const refresh = useCallback(async () => {
    if (!eligible) { setCount(0); return; }
    try {
      const res = await fetch("/api/preparation/my-deliveries?count=1", { cache: "no-store" });
      const r = await res.json();
      if (r?.success) setCount(r.count ?? 0);
    } catch { /* biarkan nilai lama */ }
  }, [eligible]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!eligible || !userId) return;
    const channel = supabase
      .channel(`delivery-badge-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "preparation_orders", filter: `delivery_user_id=eq.${userId}` },
        () => refresh()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [eligible, userId, refresh]);

  return count;
}