"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { LEADS_CHAT_ROLES } from "@/lib/permissions";

interface ConversationSummary { id: string; unread_count: number }

const POLL_INTERVAL_MS = 45000;

export function useLeadsChatNotify(userRoles: string[], userId?: string) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const hasAccess = userRoles.some((r) => (LEADS_CHAT_ROLES as string[]).includes(r));
  const inFlightRef = useRef(false);

  const fetchUnread = useCallback(async () => {
    if (!userId || !hasAccess) return;
    if (inFlightRef.current) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    inFlightRef.current = true;
    try {
      const res = await fetch("/api/leads-chat/conversations?limit=50");
      const data = await res.json();
      if (data.success) setConversations(data.conversations ?? []);
    } catch { /* badge/alarm cosmetic — diamkan kalau gagal */ }
    finally {
      inFlightRef.current = false;
    }
  }, [userId, hasAccess]);

  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, POLL_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") fetchUnread();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchUnread]);

  const unreadUnacked = conversations.filter((c) => c.unread_count > 0).map((c) => c.id);
  const unreadCount = conversations.reduce((sum, c) => sum + c.unread_count, 0);

  return { unreadUnacked, unreadCount, refresh: fetchUnread };
}