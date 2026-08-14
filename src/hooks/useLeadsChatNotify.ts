"use client";
import { useEffect, useState, useCallback } from "react";
import { LEADS_CHAT_ROLES } from "@/lib/permissions";

interface ConversationSummary { id: string; unread_count: number }

const POLL_INTERVAL_MS = 15000;

export function useLeadsChatNotify(userRoles: string[], userId?: string) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const hasAccess = userRoles.some((r) => (LEADS_CHAT_ROLES as string[]).includes(r));

  const fetchUnread = useCallback(async () => {
    if (!userId || !hasAccess) return;
    try {
      const res = await fetch("/api/leads-chat/conversations");
      const data = await res.json();
      if (data.success) setConversations(data.conversations ?? []);
    } catch { /* badge/alarm cosmetic — diamkan kalau gagal */ }
  }, [userId, hasAccess]);

  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchUnread]);

  const unreadUnacked = conversations.filter((c) => c.unread_count > 0).map((c) => c.id);
  const unreadCount = conversations.reduce((sum, c) => sum + c.unread_count, 0);

  return { unreadUnacked, unreadCount, refresh: fetchUnread };
}