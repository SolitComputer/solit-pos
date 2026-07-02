import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { playNotifSound } from "@/lib/preparationSound";

export const ALARM_KEYS = {
  MENUNGGU: "prep_alarm_menunggu",
  SIAP_KIRIM: "prep_alarm_siapkirim",
  APPROVAL: "prep_alarm_approval",   // ← tugas antar nunggu persetujuan pengantar
} as const;

function readAck(storageKey: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}

/**
 * Ring alarm every `intervalMs` for items yang belum di-acknowledge.
 * Ack disimpan di localStorage + broadcast event biar sinkron antar komponen.
 */
export function usePrepAlarm(
  items: { id: string }[],
  storageKey: string,
  soundEnabled: boolean,
  intervalMs = 4000
) {
  const [ackedIds, setAckedIds] = useState<Set<string>>(() => readAck(storageKey));

  // sinkron ack antar hook instance (sidebar ↔ page) & antar tab
  useEffect(() => {
    const reread = () => setAckedIds(readAck(storageKey));
    window.addEventListener("prep-ack-changed", reread);
    window.addEventListener("storage", reread);
    return () => {
      window.removeEventListener("prep-ack-changed", reread);
      window.removeEventListener("storage", reread);
    };
  }, [storageKey]);

  const unacked = useMemo(
    () => items.filter((o) => !ackedIds.has(o.id)),
    [items, ackedIds]
  );

  const alarmRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (alarmRef.current) { clearInterval(alarmRef.current); alarmRef.current = null; }
    if (unacked.length === 0 || !soundEnabled) return;
    playNotifSound(); // bunyi langsung
    alarmRef.current = setInterval(playNotifSound, intervalMs);
    return () => { if (alarmRef.current) clearInterval(alarmRef.current); };
  }, [unacked.length, soundEnabled, intervalMs]);

  useEffect(() => () => { if (alarmRef.current) clearInterval(alarmRef.current); }, []);

  const acknowledge = useCallback(
    (id: string) => {
      setAckedIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        try {
          localStorage.setItem(storageKey, JSON.stringify([...next]));
          window.dispatchEvent(new CustomEvent("prep-ack-changed")); // ← broadcast
        } catch { }
        return next;
      });
    },
    [storageKey]
  );

  const unackedIds = useMemo(() => new Set(unacked.map((o) => o.id)), [unacked]);

  return { unackedCount: unacked.length, unackedIds, acknowledge };
}

export const PREP_PROVIDER_ROLES = [
  "PENYEDIA_BARANG",
  "KEPALA_PENYEDIA_BARANG",
  "PKL_PENYEDIA_BARANG",
] as const;

export const PREP_SILENT_ROLES = ["ADMIN"] as const;

function collectRoles(role?: string | null, roles?: string[] | null): string[] {
  const list = roles ? [...roles] : [];
  if (role) list.push(role);
  return list;
}

/** true kalau user termasuk penyedia barang (dengar semua alarm format masuk). */
export function isPrepProvider(role?: string | null, roles?: string[] | null): boolean {
  const list = collectRoles(role, roles);
  return list.some((r) => (PREP_PROVIDER_ROLES as readonly string[]).includes(r));
}

/** true kalau user tidak boleh bunyi alarm sama sekali (mis. admin). */
export function isPrepSilent(role?: string | null, roles?: string[] | null): boolean {
  const list = collectRoles(role, roles);
  return list.some((r) => (PREP_SILENT_ROLES as readonly string[]).includes(r));
}