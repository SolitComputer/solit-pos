"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/services/supabase";
import { playReminderBeep } from "@/lib/reminderSound";

export interface CeoReminderItem {
  id: string;
  title: string;
  message: string;
  severity: "info" | "warning" | "critical";
  status: "terkirim" | "dibaca" | "dibalas" | "selesai" | "diabaikan";
  created_at: string;
}

export function useCeoReminderNotify(userId?: string | null) {
  const [unreadItems, setUnreadItems] = useState<CeoReminderItem[]>([]);
  const [latestItem, setLatestItem] = useState<CeoReminderItem | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const initialLoadRef = useRef(true);
  const inFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (!userId) return;
    if (inFlightRef.current) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    inFlightRef.current = true;
    try {
      const res = await fetch("/api/ai-assistant/reminders", { cache: "no-store" });
      const json = await res.json();
      if (json.success) {
        const rows: CeoReminderItem[] = json.data ?? [];
        const unreads = rows.filter((r) => r.status === "terkirim");
        setUnreadItems(unreads);

        const newItems = unreads.filter((r) => !seenIdsRef.current.has(r.id));
        if (newItems.length > 0) {
          setLatestItem(newItems[0]);
          if (!initialLoadRef.current) {
            playReminderBeep();
          }
        }
        initialLoadRef.current = false;
        unreads.forEach((r) => seenIdsRef.current.add(r.id));
      }
    } catch {
      // silent
    } finally {
      inFlightRef.current = false;
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    load();
    const interval = setInterval(load, 60_000); // 60s fallback, primary updates come from Realtime

    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);

    const channelId = `user-reminders-${userId}-${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ai_ceo_reminders",
          filter: `target_user_id=eq.${userId}`,
        },
        () => {
          load();
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [userId, load]);

  const dismissLatest = useCallback(() => {
    setLatestItem(null);
  }, []);

  return {
    unreadCount: unreadItems.length,
    unreadItems,
    latestItem,
    dismissLatest,
    refresh: load,
  };
}

export function useReminderBadge(userId?: string | null): number {
  const { unreadCount } = useCeoReminderNotify(userId);
  return unreadCount;
}