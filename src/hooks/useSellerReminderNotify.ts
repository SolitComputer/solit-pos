// src/hooks/useSellerReminderNotify.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/services/supabase";

export interface SellerReminder {
  id: string;
  target_user_id: string;
  sent_by: string;
  sent_by_name: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export function useSellerReminderNotify(userId: string | null | undefined) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [latest, setLatest] = useState<SellerReminder | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ── Hydrate unread count (kalau reminder masuk saat user offline) ──
  useEffect(() => {
    if (!userId) return;
    fetch("/api/seller-followup-reminders")
      .then((r) => r.json())
      .then((res) => {
        if (!mountedRef.current || !res.success) return;
        setUnreadCount((res.data ?? []).length);
      })
      .catch(() => {});
  }, [userId]);

  // ── Realtime: reminder baru masuk saat user online ──
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`seller-reminder-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "seller_followup_reminders",
          filter: `target_user_id=eq.${userId}`,
        },
        (payload: any) => {
          if (!mountedRef.current) return;
          const row = payload.new as SellerReminder;
          setUnreadCount((c) => c + 1);
          setLatest(row);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const markAllRead = useCallback(async () => {
    setUnreadCount(0);
    setLatest(null);
    try {
      await fetch("/api/seller-followup-reminders/read-all", { method: "PATCH" });
    } catch {
      // silent — badge sudah 0 secara optimistic, tidak fatal kalau gagal sync
    }
  }, []);

  const dismissLatest = useCallback(() => {
    setLatest(null);
  }, []);

  return { unreadCount, latest, markAllRead, dismissLatest };
}