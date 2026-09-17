"use client";

import { useEffect, useRef, useState } from "react";

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
// Jeda antar-burst alarm SELAMA masih ada pengajuan yang belum di-approve.
// Satu burst playNotifySound() = 3 beep, durasi ~0.45 detik (beep terakhir
// mulai di 0.32s + durasi 0.13s). LOOP_INTERVAL_MS diset SEDIKIT lebih
// panjang dari itu (500ms), bukan pas 450ms, supaya oscillator burst
// berikutnya tidak numpuk dengan burst sebelumnya yang belum sempat
// stop() sempurna (setInterval browser tidak 100% presisi). Jeda 50ms
// ini nyaris tidak kedengaran -> alarm terdengar nonstop "tinuttinuttinut...".
const LOOP_INTERVAL_MS = 500;
const SEEN_STORAGE_KEY = "pengajuan_dana_seen_ids";
// ID pengajuan yang SEDANG aktif menunggu approval — bukan snapshot alert
// siap-tampil seperti versi sebelumnya. Status ini direkonstruksi ulang
// dari data live setiap poll, bukan bergantung pada state yang bisa
// "didismiss" manual oleh admin.
const PENDING_IDS_STORAGE_KEY = "pengajuan_dana_pending_ids";
const PENDING_ALERTS_STORAGE_KEY = "pengajuan_dana_pending_alerts";
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

function loadPendingIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(PENDING_IDS_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function savePendingIds(ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PENDING_IDS_STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // ignore
  }
}

function loadPendingAlerts(): PengajuanDanaAlert[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PENDING_ALERTS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PengajuanDanaAlert[]) : [];
  } catch {
    return [];
  }
}

function savePendingAlerts(alerts: PengajuanDanaAlert[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      PENDING_ALERTS_STORAGE_KEY,
      JSON.stringify(alerts.slice(0, MAX_PENDING_ALERTS))
    );
  } catch {
    // ignore
  }
}

// ── Flag "sudah pernah baseline sekali" — di localStorage supaya remount
// (navigasi antar halaman dashboard) tidak mengulang proses baseline. ──────
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

// ── Bunyi alarm "tinut-tinut-tinut": 3 beep pendek & tajam berturut-turut,
// GANTI dari chime 2-nada "ding-dong" sebelumnya. Dipanggil berulang oleh
// loop di bawah selama masih ada pengajuan yang belum di-approve. ──────────
function playNotifySound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const beep = (start: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square"; // gelombang square -> karakter "tut" tajam, bukan chime lembut
      osc.frequency.value = 1046; // nada tinggi, khas bunyi alarm
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.2, now + start + 0.01);
      gain.gain.setValueAtTime(0.2, now + start + 0.09);
      gain.gain.linearRampToValueAtTime(0, now + start + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + 0.13);
    };

    // 3 beep cepat berturut-turut: "tinut" - "tinut" - "tinut"
    beep(0);
    beep(0.16);
    beep(0.32);
  } catch {
    // suara gagal diputar — jangan ganggu UX utama
  }
}

/**
 * Poll data Pengajuan Dana & jaga daftar alert tetap SINKRON dengan status
 * approval sebenarnya — HANYA dipanggil dengan enabled=true untuk role ADMIN
 * (dicek di PengajuanDanaNotifier.tsx).
 *
 * PENTING — beda dari versi sebelumnya: alert TIDAK BISA di-dismiss manual.
 * Satu-satunya cara sebuah pengajuan hilang dari daftar (dan alarm berhenti
 * kalau itu yang terakhir) adalah kalau pengajuan itu betul-betul sudah
 * di-approve (atau dihapus) di database — dicek ulang tiap poll (maks. delay
 * 15 detik setelah tombol Setujui ditekan di halaman Pengajuan Dana).
 */
export function usePengajuanDanaNotify(enabled: boolean) {
  const [alerts, setAlerts] = useState<PengajuanDanaAlert[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const pendingIdsRef = useRef<Set<string>>(new Set());
  const loopIntervalIdRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    // Tampilan awal (sebelum poll pertama selesai) diambil dari cache
    // localStorage supaya tidak "kedip kosong" sesaat — poll() di bawah
    // langsung mengoreksinya dengan data live begitu selesai fetch.
    setAlerts(loadPendingAlerts());
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    seenIdsRef.current = loadSeenIds();
    pendingIdsRef.current = loadPendingIds();
    let hasInitialized = loadHasInitialized();
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/pengajuan-dana");
        const json = await res.json();
        if (!json.success || cancelled) return;

        const rows: FundRequestRow[] = json.data ?? [];
        const seen = seenIdsRef.current;
        const pending = pendingIdsRef.current;

        if (!hasInitialized) {
          // Load pertama kali DI BROWSER INI — tandai semua data lama
          // sebagai "sudah dilihat" supaya tidak memicu alarm untuk
          // pengajuan yang sudah ada sebelum fitur ini dipasang.
          rows.forEach((r) => seen.add(r.id));
          saveSeenIds(seen);
          hasInitialized = true;
          saveHasInitialized();
          return;
        }

        // 1) Deteksi pengajuan baru (belum pernah "dilihat") yang masih
        //    menunggu approval -> masukkan ke daftar pending.
        let seenChanged = false;
        for (const r of rows) {
          if (!seen.has(r.id)) {
            seen.add(r.id);
            seenChanged = true;
            if (!r.is_approved) pending.add(r.id);
          }
        }
        if (seenChanged) saveSeenIds(seen);

        // 2) Re-validasi SEMUA id yang sedang pending terhadap data terbaru:
        //    kalau sudah is_approved=true ATAU barisnya sudah tidak ada lagi
        //    (dihapus), keluarkan dari daftar pending. INI yang membuat
        //    alert & alarm berhenti otomatis begitu benar-benar di-approve —
        //    bukan karena di-klik atau ditutup.
        const rowById = new Map(rows.map((r) => [r.id, r]));
        const stillPending: string[] = [];
        for (const id of pending) {
          const row = rowById.get(id);
          if (row && !row.is_approved) stillPending.push(id);
        }
        pendingIdsRef.current = new Set(stillPending);
        savePendingIds(pendingIdsRef.current);

        const activeAlerts: PengajuanDanaAlert[] = stillPending
          .map((id) => rowById.get(id))
          .filter((r): r is FundRequestRow => !!r)
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
          .slice(0, MAX_PENDING_ALERTS)
          .map((r) => ({
            id: r.id,
            requester_name: r.requester_name,
            purpose: r.purpose,
            amount: r.amount,
            created_at: r.created_at,
          }));

        setAlerts(activeAlerts);
        savePendingAlerts(activeAlerts);
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

  // ── Looping alarm: selama `alerts` masih berisi minimal 1 pengajuan yang
  // belum di-approve, alarm diputar berulang tiap LOOP_INTERVAL_MS. Berhenti
  // OTOMATIS begitu poll() di atas mendeteksi semua sudah di-approve
  // (alerts.length jadi 0) — bukan lewat aksi klik admin.
  useEffect(() => {
    if (!enabled || alerts.length === 0) {
      if (loopIntervalIdRef.current) {
        clearInterval(loopIntervalIdRef.current);
        loopIntervalIdRef.current = null;
      }
      return;
    }

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

  return { alerts };
}