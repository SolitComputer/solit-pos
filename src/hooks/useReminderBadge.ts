"use client";
import { useEffect, useState } from "react";

export function useReminderBadge(userId?: string | null): number {
    const [count, setCount] = useState(0);

    useEffect(() => {
        if (!userId) return;
        let cancelled = false;

        const load = async () => {
            try {
                const res = await fetch("/api/ai-assistant/reminders", { cache: "no-store" });
                const json = await res.json();
                if (!cancelled && json.success) setCount(json.unread ?? 0);
            } catch { }
        };

        load();
        const interval = setInterval(load, 30000);
        return () => { cancelled = true; clearInterval(interval); };
    }, [userId]);

    return count;
}