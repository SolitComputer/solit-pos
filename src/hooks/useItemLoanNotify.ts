// src/hooks/useItemLoanNotify.ts
"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface ItemLoanAlert {
  id: string;
  borrower_name: string;
  item_name: string;
  serial_number: string | null;
  category: "KEBUTUHAN" | "PESANAN" | null;
  created_at: string;
}

interface ItemLoanRow {
  id: string;
  borrower_id: string;
  borrower_name: string;
  item_name: string;
  serial_number: string | null;
  category: "KEBUTUHAN" | "PESANAN" | null;
  status: string;
  created_at: string;
}

const POLL_INTERVAL_MS = 15_000;
const LOOP_INTERVAL_MS = 500;

// Hentikan alarm SEKETIKA saat approve/reject (tanpa nunggu poll).
const ITEM_LOAN_RESOLVED_EVENT = "item-loan:resolved";
export function notifyItemLoanResolved(id: string) {
  if (typeof window === "undefined" || !id) return;
  window.dispatchEvent(new CustomEvent(ITEM_LOAN_RESOLVED_EVENT, { detail: { id } }));
}

const SEEN_STORAGE_KEY = "item_loan_seen_ids";
const PENDING_IDS_STORAGE_KEY = "item_loan_pending_ids";
const PENDING_ALERTS_STORAGE_KEY = "item_loan_pending_alerts";
const INITIALIZED_STORAGE_KEY = "item_loan_initialized_v1";
const MAX_SEEN_IDS = 300;
const MAX_PENDING_ALERTS = 20;
const MUTED_STORAGE_KEY = "item_loan_muted";
const VOLUME_STORAGE_KEY = "item_loan_volume";

function loadSeenIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try { const raw = localStorage.getItem(SEEN_STORAGE_KEY); return raw ? new Set(JSON.parse(raw) as string[]) : new Set(); } catch { return new Set(); }
}
function saveSeenIds(ids: Set<string>) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(Array.from(ids).slice(-MAX_SEEN_IDS))); } catch {}
}
function loadPendingIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try { const raw = localStorage.getItem(PENDING_IDS_STORAGE_KEY); return raw ? new Set(JSON.parse(raw) as string[]) : new Set(); } catch { return new Set(); }
}
function savePendingIds(ids: Set<string>) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(PENDING_IDS_STORAGE_KEY, JSON.stringify(Array.from(ids))); } catch {}
}
function loadPendingAlerts(): ItemLoanAlert[] {
  if (typeof window === "undefined") return [];
  try { const raw = localStorage.getItem(PENDING_ALERTS_STORAGE_KEY); return raw ? (JSON.parse(raw) as ItemLoanAlert[]) : []; } catch { return []; }
}
function savePendingAlerts(alerts: ItemLoanAlert[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(PENDING_ALERTS_STORAGE_KEY, JSON.stringify(alerts.slice(0, MAX_PENDING_ALERTS))); } catch {}
}
function loadHasInitialized(): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(INITIALIZED_STORAGE_KEY) === "1"; } catch { return false; }
}
function saveHasInitialized() {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(INITIALIZED_STORAGE_KEY, "1"); } catch {}
}
function loadMuted(): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(MUTED_STORAGE_KEY) === "1"; } catch { return false; }
}
function saveMuted(value: boolean) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(MUTED_STORAGE_KEY, value ? "1" : "0"); } catch {}
}
function loadVolume(): number {
  if (typeof window === "undefined") return 1;
  try { const raw = localStorage.getItem(VOLUME_STORAGE_KEY); if (raw === null) return 1; const n = Number(raw); return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1; } catch { return 1; }
}
function saveVolume(value: number) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(VOLUME_STORAGE_KEY, String(value)); } catch {}
}

// ── Audio chime lembut (C5→E5) — pola identik dgn Pengajuan Dana ──
let sharedCtx: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedCtx) sharedCtx = new AudioCtx();
  return sharedCtx;
}
if (typeof window !== "undefined") {
  const unlockAudio = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    window.removeEventListener("click", unlockAudio);
    window.removeEventListener("keydown", unlockAudio);
  };
  window.addEventListener("click", unlockAudio);
  window.addEventListener("keydown", unlockAudio);
}
function playNotifySound(volume: number = 1) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const peak = 0.12 * Math.min(1, Math.max(0, volume));
    if (peak <= 0) return;
    const now = ctx.currentTime;
    const tone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(peak, now + start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now + start); osc.stop(now + start + duration + 0.02);
    };
    tone(523.25, 0, 0.3);
    tone(659.25, 0.14, 0.35);
  } catch {}
}

/** Poll peminjaman PENDING & bunyikan alarm loop sampai semua di-ACC.
 *  enabled=true hanya untuk role approver (dicek di ItemLoanNotifier). */
export function useItemLoanNotify(enabled: boolean) {
  const [alerts, setAlerts] = useState<ItemLoanAlert[]>([]);
  const [muted, setMuted] = useState<boolean>(() => loadMuted());
  const [volume, setVolumeState] = useState<number>(() => loadVolume());
  const volumeRef = useRef(volume);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const pendingIdsRef = useRef<Set<string>>(new Set());
  const loopIntervalIdRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { volumeRef.current = volume; }, [volume]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => { const next = !prev; saveMuted(next); return next; });
  }, []);
  const setVolume = useCallback((value: number) => {
    const clamped = Math.min(1, Math.max(0, value));
    setVolumeState(clamped); saveVolume(clamped);
  }, []);

  useEffect(() => { if (enabled) setAlerts(loadPendingAlerts()); }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    seenIdsRef.current = loadSeenIds();
    pendingIdsRef.current = loadPendingIds();
    let hasInitialized = loadHasInitialized();
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/item-loans?status=PENDING");
        const json = await res.json();
        if (!json.success || cancelled) return;

        const rows: ItemLoanRow[] = json.data ?? [];
        const seen = seenIdsRef.current;
        const pending = pendingIdsRef.current;

        if (!hasInitialized) {
          for (const r of rows) { seen.add(r.id); pending.add(r.id); }
          saveSeenIds(seen); savePendingIds(pending);
          hasInitialized = true; saveHasInitialized();
        }

        let seenChanged = false;
        for (const r of rows) {
          if (!seen.has(r.id)) { seen.add(r.id); seenChanged = true; pending.add(r.id); }
        }
        if (seenChanged) saveSeenIds(seen);

        // Masih PENDING hanya kalau masih muncul di hasil ?status=PENDING.
        const rowById = new Map(rows.map((r) => [r.id, r]));
        const stillPending: string[] = [];
        for (const id of pending) { if (rowById.has(id)) stillPending.push(id); }
        pendingIdsRef.current = new Set(stillPending);
        savePendingIds(pendingIdsRef.current);

        const activeAlerts: ItemLoanAlert[] = stillPending
          .map((id) => rowById.get(id))
          .filter((r): r is ItemLoanRow => !!r)
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
          .slice(0, MAX_PENDING_ALERTS)
          .map((r) => ({
            id: r.id,
            borrower_name: r.borrower_name,
            item_name: r.item_name,
            serial_number: r.serial_number ?? null,
            category: r.category === "PESANAN" ? "PESANAN" : r.category === "KEBUTUHAN" ? "KEBUTUHAN" : null,
            created_at: r.created_at,
          }));

        setAlerts(activeAlerts);
        savePendingAlerts(activeAlerts);
      } catch {}
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (!id) return;
      pendingIdsRef.current.delete(id);
      savePendingIds(pendingIdsRef.current);
      setAlerts((prev) => { const next = prev.filter((a) => a.id !== id); savePendingAlerts(next); return next; });
    };
    window.addEventListener(ITEM_LOAN_RESOLVED_EVENT, handler);
    return () => window.removeEventListener(ITEM_LOAN_RESOLVED_EVENT, handler);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || alerts.length === 0 || muted) {
      if (loopIntervalIdRef.current) { clearInterval(loopIntervalIdRef.current); loopIntervalIdRef.current = null; }
      return;
    }
    const fire = () => playNotifySound(volumeRef.current);
    fire();
    loopIntervalIdRef.current = setInterval(fire, LOOP_INTERVAL_MS);
    return () => { if (loopIntervalIdRef.current) { clearInterval(loopIntervalIdRef.current); loopIntervalIdRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, alerts.length, muted]);

  return { alerts, muted, volume, toggleMute, setVolume };
}