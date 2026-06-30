import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { playNotifSound } from "@/lib/preparationSound";

export const ALARM_KEYS = {
  MENUNGGU: "prep_alarm_menunggu",
  SIAP_KIRIM: "prep_alarm_siapkirim",
} as const;

/**
 * Ring alarm every `intervalMs` for items that haven't been acknowledged.
 * Acknowledgment is persisted in localStorage so it survives page reloads.
 */
export function usePrepAlarm(
  items: { id: string }[],
  storageKey: string,
  soundEnabled: boolean,
  intervalMs = 4000
) {
  const [ackedIds, setAckedIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch { return new Set(); }
  });

  const unacked = useMemo(
    () => items.filter((o) => !ackedIds.has(o.id)),
    [items, ackedIds]
  );

  const alarmRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (alarmRef.current) { clearInterval(alarmRef.current); alarmRef.current = null; }
    if (unacked.length === 0 || !soundEnabled) return;
    playNotifSound(); // ring immediately
    alarmRef.current = setInterval(playNotifSound, intervalMs);
    return () => { if (alarmRef.current) clearInterval(alarmRef.current); };
  }, [unacked.length, soundEnabled, intervalMs]);

  // cleanup on unmount
  useEffect(() => () => { if (alarmRef.current) clearInterval(alarmRef.current); }, []);

  const acknowledge = useCallback(
    (id: string) => {
      setAckedIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        try { localStorage.setItem(storageKey, JSON.stringify([...next])); } catch {}
        return next;
      });
    },
    [storageKey]
  );

  const unackedIds = useMemo(() => new Set(unacked.map((o) => o.id)), [unacked]);

  return { unackedCount: unacked.length, unackedIds, acknowledge };
}