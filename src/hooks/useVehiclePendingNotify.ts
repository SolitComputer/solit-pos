// src/hooks/useVehiclePendingNotify.ts
"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface VehiclePendingAlert {
  id: string;
  vehicle_name: string;
  borrower_name: string;
  borrower_role: string | null;
  requested_at: string;
}

interface QueueRow {
  id: string;
  requested_at: string;
  vehicle?: { name: string | null } | null;
  borrower?: { name: string | null; role: string | null } | null;
}

const POLL_INTERVAL_MS = 15_000;
const SEEN_STORAGE_KEY = "vehicle_pending_seen_ids";
const MUTED_STORAGE_KEY = "vehicle_pending_muted";
const MAX_SEEN_IDS = 300;

function loadSeenIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(SEEN_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}
function saveSeenIds(ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(Array.from(ids).slice(-MAX_SEEN_IDS)));
  } catch {
    /* localStorage diblokir — abaikan, bukan fitur kritikal */
  }
}
function loadMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(MUTED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
function saveMuted(v: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MUTED_STORAGE_KEY, v ? "1" : "0");
  } catch {
    /* ignore */
  }
}

// AudioContext dibuat sekali & di-unlock saat interaksi pertama (autoplay policy).
let sharedCtx: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedCtx) sharedCtx = new AudioCtx();
  return sharedCtx;
}
if (typeof window !== "undefined") {
  const unlock = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    window.removeEventListener("click", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("click", unlock);
  window.addEventListener("keydown", unlock);
}

// Chime lembut 2-nada (C5 → E5), karakter sama dengan notifier Pengajuan Dana.
function playChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const peak = 0.12;
    const now = ctx.currentTime;
    const tone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(peak, now + start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + duration + 0.02);
    };
    tone(523.25, 0, 0.3);
    tone(659.25, 0.14, 0.35);
  } catch {
    /* suara gagal diputar — jangan ganggu UX utama */
  }
}

/**
 * Poll antrian PENDING pinjam kendaraan. HANYA dipanggil enabled=true untuk
 * role approval (Kepala Sales) — dicek di VehiclePendingNotifier.tsx.
 * Endpoint /api/vehicles/borrow?queue=1 sudah ke-gate canApprove di server,
 * jadi role lain tetap aman walau komponen ke-mount.
 */
export function useVehiclePendingNotify(enabled: boolean) {
  const [alerts, setAlerts] = useState<VehiclePendingAlert[]>([]);
  const [muted, setMuted] = useState<boolean>(() => loadMuted());
  const mutedRef = useRef(muted);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      saveMuted(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!enabled) {
      setAlerts([]);
      return;
    }
    const seen = loadSeenIds();
    // Browser yang belum punya catatan sama sekali → baseline SENYAP di poll
    // pertama, biar nggak nge-burst bunyi buat tumpukan pengajuan lama.
    const freshBrowser = seen.size === 0;
    let firstPoll = true;
    let cancelled = false;

    const poll = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/vehicles/borrow?queue=1", {
          cache: "no-store",
          signal: AbortSignal.timeout(8000),
        });
        const json = await res.json();
        if (!json.success || cancelled) return;

        const rows: QueueRow[] = json.requests ?? [];

        // Bunyi kalau ada id PENDING baru yang belum pernah "dilihat" di browser
        // ini — termasuk pengajuan yang masuk selagi Kepala Sales offline.
        let hasNew = false;
        for (const r of rows) {
          if (!seen.has(r.id)) {
            seen.add(r.id);
            if (!(freshBrowser && firstPoll)) hasNew = true;
          }
        }
        saveSeenIds(seen);
        if (hasNew && !mutedRef.current) playChime();
        firstPoll = false;

        setAlerts(
          rows.map((r) => ({
            id: r.id,
            vehicle_name: r.vehicle?.name ?? "Kendaraan",
            borrower_name: r.borrower?.name ?? "—",
            borrower_role: r.borrower?.role ?? null,
            requested_at: r.requested_at,
          }))
        );
      } catch {
        /* gagal fetch — diamkan, coba lagi di interval berikutnya */
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabled]);

  return { alerts, muted, toggleMute };
}