// src/hooks/useChatUnread.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/services/supabaseClient";
import { getCurrentUserClient } from "@/lib/auth-client";

const supabase = getSupabaseClient();
const POLL_MS = 30_000;

interface UnreadState {
    total: number;
    dmTotal: number;
    groupTotal: number;
    dmBySender: Record<string, number>;
    groupById: Record<string, number>;
}

const EMPTY: UnreadState = { total: 0, dmTotal: 0, groupTotal: 0, dmBySender: {}, groupById: {} };

export function useChatUnread() {
    const [unread, setUnread] = useState<UnreadState>(EMPTY);
    const inFlight = useRef(false);
    const meId = useRef<string | null>(null);

    const refresh = useCallback(async () => {
        if (inFlight.current) return;
        if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
        inFlight.current = true;
        try {
            const res = await fetch("/api/chat/unread", { signal: AbortSignal.timeout(8000) });
            const data = await res.json();
            if (data.success) {
                setUnread({
                    total: data.total ?? 0,
                    dmTotal: data.dm_total ?? 0,
                    groupTotal: data.group_total ?? 0,
                    dmBySender: data.dm_by_sender ?? {},
                    groupById: data.group_by_id ?? {},
                });
            }
        } catch { /* cosmetic — diamkan kalau gagal */ }
        finally { inFlight.current = false; }
    }, []);

    useEffect(() => {
        let stopped = false;
        (async () => {
            const me = await getCurrentUserClient();
            if (!me || stopped) return;
            meId.current = me.id;
            refresh();
        })();

        const t = setInterval(refresh, POLL_MS);
        const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
        document.addEventListener("visibilitychange", onVisible);

        return () => {
            stopped = true;
            clearInterval(t);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [refresh]);

    // Realtime: pesan grup baru / DM masuk / kita baca pesan → refresh (debounce 800ms)
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        const bump = () => { if (timer) clearTimeout(timer); timer = setTimeout(refresh, 800); };

        const channel = supabase
            .channel(`chat-unread:${Math.random().toString(36).slice(2, 8)}`)
            .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_messages" }, bump)
            .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
                const m = payload.new as { receiver_id?: string };
                if (m?.receiver_id && m.receiver_id === meId.current) bump();
            })
            .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_message_reads" }, (payload) => {
                const r = payload.new as { user_id?: string };
                if (r?.user_id === meId.current) bump(); // kita baca → unread turun
            })
            .subscribe();

        return () => { if (timer) clearTimeout(timer); channel.unsubscribe(); };
    }, [refresh]);

    return { ...unread, refresh };
}