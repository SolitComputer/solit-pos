// src/hooks/usePengajuanDanaNotify.ts
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
  requester_id: string;
  requester_name: string;
  purpose: string;
  amount: number;
  created_at: string;
  is_approved: boolean;
  is_rejected: boolean;
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

// ── Filter sumber pengajuan (SIAPA YANG MENGAJUKAN dana).
// Array KOSONG = alarm bunyi untuk SEMUA requester (siapa pun yang
// mengajukan — Udin, dll). Kalau suatu saat mau dibatasi ke requester
// tertentu, tinggal isi UUID-nya lagi di array ini.
// CATATAN: pembatasan SIAPA YANG DENGAR alarm ada di file terpisah
// (ALLOWED_NOTIFY_LISTENER_IDS di PengajuanDanaNotifier.tsx) = Yoga &
// Reinaldy — itu TIDAK diubah, jadi tetap cuma mereka berdua yang bunyi.
const NOTIFY_SOURCE_IDS: string[] = [];

// Sumber dianggap "boleh memicu alarm" kalau daftar filter kosong (semua
// boleh) ATAU requester-nya memang terdaftar di NOTIFY_SOURCE_IDS.
function isNotifiableSource(requesterId: string): boolean {
  return NOTIFY_SOURCE_IDS.length === 0 || NOTIFY_SOURCE_IDS.includes(requesterId);
}

// ── Event lintas-komponen untuk MENGHENTIKAN alarm SEKETIKA (tanpa nunggu
// poll 15 detik). Halaman Pengajuan Dana men-dispatch event ini begitu
// tombol Setujui/Tolak sukses di server; hook di bawah mendengarnya lalu
// langsung membuang id itu dari daftar pending + alerts -> loop suara stop.
const PENGAJUAN_DANA_RESOLVED_EVENT = "pengajuan-dana:resolved";

/** Panggil dari mana pun (mis. halaman Pengajuan Dana) setelah sebuah
 *  pengajuan BERHASIL disetujui/ditolak di server, supaya alarm untuk id
 *  tsb berhenti seketika tanpa menunggu siklus polling berikutnya. */
export function notifyPengajuanDanaResolved(id: string) {
  if (typeof window === "undefined" || !id) return;
  window.dispatchEvent(
    new CustomEvent(PENGAJUAN_DANA_RESOLVED_EVENT, { detail: { id } })
  );
}

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
const MUTED_STORAGE_KEY = "pengajuan_dana_muted";
const VOLUME_STORAGE_KEY = "pengajuan_dana_volume";

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

// ── Preferensi mute & volume — per-browser, TIDAK mempengaruhi apakah alert
// masih muncul atau tidak (itu murni dari status is_approved). Mute cuma
// mematikan suaranya; card notifikasi tetap tampil sebagai reminder visual. ──
function loadMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(MUTED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function saveMuted(value: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MUTED_STORAGE_KEY, value ? "1" : "0");
  } catch {
    // ignore
  }
}

function loadVolume(): number {
  if (typeof window === "undefined") return 1;
  try {
    const raw = localStorage.getItem(VOLUME_STORAGE_KEY);
    if (raw === null) return 1;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;
  } catch {
    return 1;
  }
}

function saveVolume(value: number) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(VOLUME_STORAGE_KEY, String(value));
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

// ── Chime lembut 2-nada (C5 → E5, sine wave) dengan fade-out halus — GANTI
// dari 3-beep square-wave 1046Hz yang terdengar cempreng/menusuk. Karakter
// sine wave + envelope yang landai membuatnya terdengar seperti lonceng
// kecil, tapi tetap jelas terdengar untuk keperluan alarm loop. Dipanggil
// berulang oleh loop di bawah selama masih ada pengajuan yang belum
// di-approve. ────────────────────────────────────────────────────────────
function playNotifySound(volume: number = 1) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    // Puncak gain diturunkan (0.2 -> 0.12) karena sine wave sudah terasa
    // lebih "penuh" secara persepsi dibanding square di gain yang sama.
    const peak = 0.12 * Math.min(1, Math.max(0, volume));
    if (peak <= 0) return;

    const now = ctx.currentTime;

    const tone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine"; // sine -> nada paling bersih, tanpa harmonik tajam
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + start);
      // Attack landai (30ms) -> tidak ada "sentakan" di awal nada
      gain.gain.linearRampToValueAtTime(peak, now + start + 0.03);
      // Decay eksponensial -> ekor nada meluruh halus, bukan dipotong kasar
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + duration + 0.02);
    };

    // 2 nada naik (interval terts mayor) -> kesan "ting-ting" lembut,
    // bukan alarm beruntun senada yang terasa mendesak.
    tone(523.25, 0, 0.3);     // C5
    tone(659.25, 0.14, 0.35); // E5
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
  const [muted, setMuted] = useState<boolean>(() => loadMuted());
  const [volume, setVolumeState] = useState<number>(() => loadVolume());
  // Dibaca oleh interval loop tanpa jadi dependency useEffect-nya — supaya
  // geser slider volume TIDAK me-restart interval/oscillator (yang bisa
  // menyebabkan beep dobel tiap kali slider digeser sedikit).
  const volumeRef = useRef(volume);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const pendingIdsRef = useRef<Set<string>>(new Set());
  const loopIntervalIdRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      saveMuted(next);
      return next;
    });
  }, []);

  const setVolume = useCallback((value: number) => {
    const clamped = Math.min(1, Math.max(0, value));
    setVolumeState(clamped);
    saveVolume(clamped);
  }, []);

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
          // sebagai "sudah dilihat". TAPI pengajuan yang MASIH menunggu
          // approval tetap dimasukkan ke `pending` supaya LANGSUNG bunyi
          // di poll pertama ini. Tanpa ini, pengajuan yang dibuat SEBELUM
          // approver buka halaman (mis. Udin ngajuin jam 09:00, Yoga baru
          // buka jam 10:00) tidak pernah bunyi walaupun belum disetujui.
          for (const r of rows) {
            seen.add(r.id);
            if (!r.is_approved && !r.is_rejected && isNotifiableSource(r.requester_id)) {
              pending.add(r.id);
            }
          }
          saveSeenIds(seen);
          savePendingIds(pending);
          hasInitialized = true;
          saveHasInitialized();
          // TIDAK `return` — lanjut ke re-validasi & setAlerts di bawah.
        }

        // 1) Deteksi pengajuan baru (belum pernah "dilihat") yang masih
        //    menunggu approval DAN requester-nya lolos filter sumber
        //    (isNotifiableSource — sekarang SEMUA requester lolos karena
        //    NOTIFY_SOURCE_IDS kosong) -> masukkan ke daftar pending.
        let seenChanged = false;
        for (const r of rows) {
          if (!seen.has(r.id)) {
            seen.add(r.id);
            seenChanged = true;
            if (!r.is_approved && !r.is_rejected && isNotifiableSource(r.requester_id)) {
              pending.add(r.id);
            }
          }
        }
        if (seenChanged) saveSeenIds(seen);

        // 2) Re-validasi SEMUA id yang sedang pending terhadap data terbaru:
        //    kalau sudah is_approved=true atau is_rejected=true, barisnya
        //    sudah tidak ada lagi (dihapus), ATAU requester_id-nya tidak
        //    lagi lolos filter sumber, keluarkan dari daftar pending.
        //    Inilah yang bikin alarm BERHENTI otomatis begitu Yoga/Reinaldy
        //    menekan Setujui atau Tolak (is_approved / is_rejected jadi true).
        const rowById = new Map(rows.map((r) => [r.id, r]));
        const stillPending: string[] = [];
        for (const id of pending) {
          const row = rowById.get(id);
          if (row && !row.is_approved && !row.is_rejected && isNotifiableSource(row.requester_id)) {
            stillPending.push(id);
          }
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

    // ── Stop alarm SEKETIKA saat approve/reject: dengarkan event yang
  // di-dispatch dari halaman Pengajuan Dana (notifyPengajuanDanaResolved).
  // Begitu sebuah id "resolved", buang dari pending + alerts tanpa nunggu
  // poll berikutnya -> alerts.length turun -> loop suara di bawah berhenti.
  // Poll tetap jadi jaring pengaman: kalau event kelewat (mis. aksi dari
  // device/tab lain), re-validasi 15 detik-an tetap mengoreksi.
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (!id) return;
      pendingIdsRef.current.delete(id);
      savePendingIds(pendingIdsRef.current);
      setAlerts((prev) => {
        const next = prev.filter((a) => a.id !== id);
        savePendingAlerts(next);
        return next;
      });
    };
    window.addEventListener(PENGAJUAN_DANA_RESOLVED_EVENT, handler);
    return () => window.removeEventListener(PENGAJUAN_DANA_RESOLVED_EVENT, handler);
  }, [enabled]);

  // ── Looping alarm: selama `alerts` masih berisi minimal 1 pengajuan yang
  // belum di-approve DAN admin belum mute, alarm diputar berulang tiap
  // LOOP_INTERVAL_MS. Berhenti OTOMATIS begitu poll() di atas mendeteksi
  // semua sudah di-approve (alerts.length jadi 0), ATAU begitu admin
  // menekan tombol mute — dua jalur berhenti yang independen, keduanya sah.
  useEffect(() => {
    if (!enabled || alerts.length === 0 || muted) {
      if (loopIntervalIdRef.current) {
        clearInterval(loopIntervalIdRef.current);
        loopIntervalIdRef.current = null;
      }
      return;
    }

    const fire = () => playNotifySound(volumeRef.current);
    fire();
    loopIntervalIdRef.current = setInterval(fire, LOOP_INTERVAL_MS);

    return () => {
      if (loopIntervalIdRef.current) {
        clearInterval(loopIntervalIdRef.current);
        loopIntervalIdRef.current = null;
      }
    };
    // volume SENGAJA tidak dimasukkan sebagai dependency — dibaca lewat
    // volumeRef di dalam fire() supaya geser slider tidak me-restart loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, alerts.length, muted]);

  return { alerts, muted, volume, toggleMute, setVolume };
}