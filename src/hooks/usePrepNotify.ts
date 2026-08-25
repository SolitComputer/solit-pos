"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/services/supabase";
import { hasAnyRole, PREPARATION_DONE_ROLES, PREPARATION_DISPATCH_ROLES } from "@/lib/permissions";
import { ALARM_KEYS, isPrepProvider, isPrepSilent } from "@/lib/prepAlarm";
import { startJitteredPolling } from "@/lib/pollingScheduler";

function readAck(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}

function writeAck(key: string, ids: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify([...ids]));
    window.dispatchEvent(new CustomEvent(`prep-ack-changed:${key}`));
    window.dispatchEvent(new CustomEvent("prep-ack-changed"));
  } catch { }
}

export function usePrepNotify(userRoles: string[], userId?: string | null) {
  // return values lama tetap dipertahankan (dipakai konsumer lain kalau ada)
  const isPenyedia = hasAnyRole(userRoles, PREPARATION_DONE_ROLES);
  const isDispatcher = hasAnyRole(userRoles, PREPARATION_DISPATCH_ROLES);

  // ── Gating khusus ALARM (lebih ketat) ──────────────────────────────────────
  const silent = isPrepSilent(null, userRoles);                 // ADMIN → mute total
  const canHearMenunggu = !silent && isPrepProvider(null, userRoles); // hanya role penyedia barang
  const canHearSiapKirim = !silent && isDispatcher && !!userId;  // sales, tapi difilter pembuat format

  const rolesKey = userRoles.join(",");

  const [menungguIds, setMenungguIds] = useState<string[]>([]);
  const [siapKirimIds, setSiapKirimIds] = useState<string[]>([]);
  const [menungguAck, setMenungguAck] = useState<Set<string>>(() => readAck(ALARM_KEYS.MENUNGGU));
  const [siapKirimAck, setSiapKirimAck] = useState<Set<string>>(() => readAck(ALARM_KEYS.SIAP_KIRIM));
  const inFlightRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (inFlightRef.current) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    inFlightRef.current = true;
    try {
      // MENUNGGU (format baru) → hanya penyedia barang yang bunyi
      if (canHearMenunggu) {
        const res = await fetch("/api/preparation?status=MENUNGGU", { cache: "no-store", signal: AbortSignal.timeout(8000) });
        const r = await res.json();
        setMenungguIds((r.data ?? []).map((o: any) => o.id));
      } else setMenungguIds([]);

      // SIAP_KIRIM (penyedia done) → HANYA order yang dibuat user ini (sales pembuat format)
      if (canHearSiapKirim) {
        const res = await fetch("/api/preparation?status=SIAP_KIRIM", { cache: "no-store", signal: AbortSignal.timeout(8000) });
        const r = await res.json();
        setSiapKirimIds(
          (r.data ?? [])
            .filter((o: any) => o.created_by === userId)  // ← kunci: cuma pembuat format
            .map((o: any) => o.id)
        );
      } else setSiapKirimIds([]);
    } catch { /* ignore */ } finally {
      inFlightRef.current = false;
    }
  }, [canHearMenunggu, canHearSiapKirim, userId]);

  useEffect(() => {
    if (!rolesKey) return;
    fetchData();
    // 60–75s + jitter → client tidak sinkron nembak di detik yang sama (fallback; primary via Realtime)
    const stop = startJitteredPolling(fetchData, 60000);
    return stop;
  }, [rolesKey, fetchData]);

  useEffect(() => {
    // admin / role yang tak berhak dengar → tidak usah subscribe sama sekali
    if (!rolesKey || silent || (!canHearMenunggu && !canHearSiapKirim)) return;
    const ch = supabase
      .channel("prep-notify-global")
      .on("postgres_changes", { event: "*", schema: "public", table: "preparation_orders" }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [rolesKey, silent, canHearMenunggu, canHearSiapKirim, fetchData]);

  // sinkron ack (same-tab event + cross-tab storage + balik fokus) & re-fetch saat tab aktif
  useEffect(() => {
    const reread = () => {
      setMenungguAck(readAck(ALARM_KEYS.MENUNGGU));
      setSiapKirimAck(readAck(ALARM_KEYS.SIAP_KIRIM));
      if (document.visibilityState === "visible") {
        fetchData();
      }
    };
    window.addEventListener("prep-ack-changed", reread);
    window.addEventListener("storage", reread);
    document.addEventListener("visibilitychange", reread);
    return () => {
      window.removeEventListener("prep-ack-changed", reread);
      window.removeEventListener("storage", reread);
      document.removeEventListener("visibilitychange", reread);
    };
  }, [fetchData]);

  const menungguUnacked = useMemo(
    () => menungguIds.filter((id) => !menungguAck.has(id)),
    [menungguIds, menungguAck]
  );
  const siapKirimUnacked = useMemo(
    () => siapKirimIds.filter((id) => !siapKirimAck.has(id)),
    [siapKirimIds, siapKirimAck]
  );

  const ackMenunggu = useCallback((ids: string[]) => {
    const next = new Set(readAck(ALARM_KEYS.MENUNGGU));
    ids.forEach((i) => next.add(i));
    writeAck(ALARM_KEYS.MENUNGGU, next);
    setMenungguAck(next);
  }, []);

  const ackSiapKirim = useCallback((ids: string[]) => {
    const next = new Set(readAck(ALARM_KEYS.SIAP_KIRIM));
    ids.forEach((i) => next.add(i));
    writeAck(ALARM_KEYS.SIAP_KIRIM, next);
    setSiapKirimAck(next);
  }, []);

  return { isPenyedia, isDispatcher, menungguUnacked, siapKirimUnacked, ackMenunggu, ackSiapKirim };
}