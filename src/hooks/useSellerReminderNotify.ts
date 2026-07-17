// src/hooks/useSellerReminderNotify.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/services/supabase";

export interface SellerReminder {
  id: string;
  target_user_id: string;
  sent_by: string;
  sent_by_name: string;
  sent_by_role: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export function useSellerReminderNotify(userId: string | null | undefined) {
  const [reminders, setReminders] = useState<SellerReminder[]>([]);
  const [latest, setLatest] = useState<SellerReminder | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchReminders = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch("/api/seller-followup-reminders");
      if (res.status === 403) {
        if (mountedRef.current) setForbidden(true);
        return;
      }
      const result = await res.json();
      if (!mountedRef.current || !result.success) return;
      setReminders(result.data ?? []);
    } catch {
      // silent — realtime tetap jalan, coba lagi di render berikutnya
    }
  }, [userId]);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  // ── Realtime: reminder MANUAL baru dari Admin ──
  useEffect(() => {
    if (!userId || forbidden) return;

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
          setReminders((prev) => [row, ...prev]);
          setLatest(row);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, forbidden]);

  const markAllRead = useCallback(async () => {
    setReminders([]);
    setLatest(null);
    try {
      await fetch("/api/seller-followup-reminders/read-all", { method: "PATCH" });
    } catch {
      // silent — badge sudah 0 secara optimistic
    }
  }, []);

  const dismissLatest = useCallback(() => setLatest(null), []);

  return {
    reminders,
    unreadCount: reminders.length,
    latest,
    markAllRead,
    dismissLatest,
    forbidden,
  };
}