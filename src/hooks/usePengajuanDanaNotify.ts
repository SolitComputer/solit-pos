"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface PengajuanDanaAlert {
  id: string;
  requester_name: string;
  purpose: string;
  amount: number;
  created_at: string;
}

interface FundRequestRow {
  id: string;
  requester_name: string;
  purpose: string;
  amount: number;
  created_at: string;
  is_approved: boolean;
}

const POLL_INTERVAL_MS = 15_000;
// Jeda antar-pengulangan suara SELAMA masih ada alert yang belum di-dismiss —
// admin harus klik notifikasinya (atau "Tutup semua") supaya suara berhenti.
const LOOP_INTERVAL_MS = 4_000;
const SEEN_STORAGE_KEY = "pengajuan_dana_seen_ids";
const PENDING_STORAGE_KEY = "pengajuan_dana_pending_alerts";
const INITIALIZED_STORAGE_KEY = "pengajuan_dana_initialized";
const MAX_SEEN_IDS = 300;
const MAX_PENDING_ALERTS = 20;

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
    localStorage.setItem(
      SEEN_STORAGE_KEY,
      JSON.stringify(Array.from(ids).slice(-MAX_SEEN_IDS))
    );
  } catch {
    // localStorage penuh/diblokir — abaikan, bukan fitur kritikal
  }
}

function loadPendingAlerts(): PengajuanDanaAlert[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PENDING_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PengajuanDanaAlert[]) : [];
  } catch {
    return [];
  }
}

function savePendingAlerts(alerts: PengajuanDanaAlert[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      PENDING_STORAGE_KEY,
      JSON.stringify(alerts.slice(0, MAX_PENDING_ALERTS))
    );
  } catch {
    // ignore
  }
}

// ── Flag "sudah pernah baseline sekali" — SENGAJA di localStorage, bukan
// cuma useRef, karena useRef reset ke initial value setiap komponen
// remount (mis. admin pindah halaman dashboard → DashboardLayout dibuat
// ulang). Kalau flag ini cuma di useRef, tiap remount akan mengulang
// proses "baseline tanpa bunyi" — pengajuan baru yang masuk pas remount
// jadi ikut ke-skip tanpa suara sama sekali. ────────────────────────────
function loadHasInitialized(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(INITIALIZED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function saveHasInitialized() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(INITIALIZED_STORAGE_KEY, "1");
  } catch {
    // ignore
  }
}

// ── Audio: AudioContext dibuat sekali & di-"unlock" saat interaksi pertama,
// supaya tidak diblokir autoplay policy browser ────────────────────────────
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

function playNotifySound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.25, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + duration);
    };

    // Chime 2 nada — "ding-dong"
    playTone(880, 0, 0.18);
    playTone(1175, 0.16, 0.22);
  } catch {
    // suara gagal diputar — jangan ganggu UX utama
  }
}

/**
 * Poll data Pengajuan Dana & deteksi entri baru — HANYA dipanggil dengan
 * enabled=true untuk role ADMIN (dicek di PengajuanDanaNotifier.tsx).
 * Memutar suara + menyimpan alert (persist di localStorage) supaya tidak
 * hilang saat halaman di-refresh sebelum admin sempat dismiss.
 */
export function usePengajuanDanaNotify(enabled: boolean) {
  const [alerts, setAlerts] = useState<PengajuanDanaAlert[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const loopIntervalIdRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    setAlerts(loadPendingAlerts());
  }, [enabled]);

  const dismiss = useCallback((id: string) => {
    setAlerts((prev) => {
      const next = prev.filter((a) => a.id !== id);
      savePendingAlerts(next);
      return next;
    });
  }, []);

  const dismissAll = useCallback(() => {
    setAlerts([]);
    savePendingAlerts([]);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    seenIdsRef.current = loadSeenIds();
    // Dibaca dari localStorage, bukan useRef kosong — supaya remount
    // (navigasi antar halaman dashboard, atau refresh browser) TIDAK
    // dianggap "load pertama kali" lagi kalau browser ini sebenarnya
    // sudah pernah baseline sebelumnya.
    let hasInitialized = loadHasInitialized();
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/pengajuan-dana");
        const json = await res.json();
        if (!json.success || cancelled) return;

        const rows: FundRequestRow[] = json.data ?? [];
        const seen = seenIdsRef.current;

        if (!hasInitialized) {
          // Load pertama kali DI BROWSER INI (bukan cuma pertama sejak
          // komponen mount) — tandai semua data lama sebagai "sudah
          // dilihat" supaya tidak memicu notifikasi untuk data yang
          // sudah ada sebelum fitur ini dipasang.
          rows.forEach((r) => seen.add(r.id));
          saveSeenIds(seen);
          hasInitialized = true;
          saveHasInitialized();
          return;
        }

        const newRows = rows.filter((r) => !seen.has(r.id));
        if (newRows.length > 0) {
          newRows.forEach((r) => seen.add(r.id));
          saveSeenIds(seen);

          const newAlerts: PengajuanDanaAlert[] = newRows.map((r) => ({
            id: r.id,
            requester_name: r.requester_name,
            purpose: r.purpose,
            amount: r.amount,
            created_at: r.created_at,
          }));

          setAlerts((prev) => {
            const merged = [...newAlerts, ...prev].slice(0, MAX_PENDING_ALERTS);
            savePendingAlerts(merged);
            return merged;
          });
          // Suara TIDAK dipanggil di sini lagi — sekarang ditangani oleh efek
          // looping di bawah (lihat useEffect setelah efek poll ini), yang
          // otomatis mulai/berhenti mengikuti panjang array `alerts`.
        }
      } catch {
        // gagal fetch — diamkan, coba lagi di interval berikutnya
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabled]);

  // ── Looping alarm: selama `alerts` masih berisi minimal 1 item, suara
  // diputar berulang tiap LOOP_INTERVAL_MS. Berhenti otomatis begitu admin
  // dismiss satu-satunya alert yang tersisa (alerts.length jadi 0) — jadi
  // "klik notifikasi utk berhenti" murni efek samping dari dismiss()
  // mengosongkan array ini, bukan logic terpisah yang perlu disinkronkan.
  useEffect(() => {
    if (!enabled || alerts.length === 0) {
      if (loopIntervalIdRef.current) {
        clearInterval(loopIntervalIdRef.current);
        loopIntervalIdRef.current = null;
      }
      return;
    }

    // Bunyi langsung begitu ada alert (baru masuk ATAU sisa dari
    // localStorage saat halaman baru dibuka), lalu diulang tiap interval.
    playNotifySound();
    loopIntervalIdRef.current = setInterval(playNotifySound, LOOP_INTERVAL_MS);

    return () => {
      if (loopIntervalIdRef.current) {
        clearInterval(loopIntervalIdRef.current);
        loopIntervalIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, alerts.length]);

  return { alerts, dismiss, dismissAll };
}