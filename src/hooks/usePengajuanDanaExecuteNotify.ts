"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface ExecuteAlert {
  id: string;
  requester_name: string;
  purpose: string;
  amount: number;
  approved_at: string | null;
  approved_by_name: string | null;
}

const POLL_INTERVAL_MS = 15_000;
const STORAGE_MUTED = "pengajuan_dana_execute_muted";
const STORAGE_VOLUME = "pengajuan_dana_execute_volume";

// Diisi dari luar (page.tsx) begitu tombol "Eksekusi" diklik → alarm langsung
// mati tanpa harus nunggu polling berikutnya.
const resolvedIds = new Set<string>();
export function notifyPengajuanDanaExecuteResolved(id: string) {
  resolvedIds.add(id);
}

function loadMuted(): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(STORAGE_MUTED) === "1"; } catch { return false; }
}
function saveMuted(v: boolean) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(STORAGE_MUTED, v ? "1" : "0"); } catch {}
}
function loadVolume(): number {
  if (typeof window === "undefined") return 0.7;
  try {
    const raw = localStorage.getItem(STORAGE_VOLUME);
    const n = raw ? Number(raw) : 0.7;
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.7;
  } catch { return 0.7; }
}
function saveVolume(v: number) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(STORAGE_VOLUME, String(v)); } catch {}
}

interface FundRequestRow {
  id: string;
  requester_name: string;
  purpose: string;
  amount: number;
  approved_at: string | null;
  approved_by_name: string | null;
  is_approved: boolean;
  is_executed: boolean;
  is_rejected: boolean;
  is_cancelled: boolean;
}

// Chime 3-nada (nada beda dari notif ACC yang 2-nada) — pakai WebAudio biar
// tidak perlu file asset baru; kalau SOLIT mau ganti ke mp3, tinggal replace
// fungsi playChime pakai new Audio("/sounds/xxx.mp3").
function createAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

function playChime(ctx: AudioContext, volume: number) {
  // 3 nada naik: C5 → E5 → G5 (triad mayor, terdengar "info" bukan "warning")
  const freqs = [523.25, 659.25, 783.99];
  const now = ctx.currentTime;
  freqs.forEach((f, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = f;
    const start = now + i * 0.14;
    const end = start + 0.22;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume * 0.35, start + 0.03);
    gain.gain.linearRampToValueAtTime(0, end);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  });
}

export function usePengajuanDanaExecuteNotify(enabled: boolean) {
  const [alerts, setAlerts] = useState<ExecuteAlert[]>([]);
  const [muted, setMuted] = useState<boolean>(() => loadMuted());
  const [volume, setVolumeState] = useState<number>(() => loadVolume());
  const ctxRef = useRef<AudioContext | null>(null);
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    saveVolume(v);
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      saveMuted(next);
      return next;
    });
  }, []);

   // Polling data — ambil pengajuan yang approved tapi belum dieksekusi.
  useEffect(() => {
    if (!enabled) { setAlerts([]); return; }

    let aborted = false;

    const fetchPendingExec = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/pengajuan-dana", { cache: "no-store" });
        const json = await res.json();
        if (!json.success || aborted) return;

        const rows: FundRequestRow[] = json.data ?? [];

        // ⬅️ REVISI: bersihin resolvedIds dari ID yang sudah benar-benar
        // tereksekusi di server. Tanpa ini, Set resolvedIds terus membesar
        // seumur hidup tab (memory leak kecil) dan kalau ADMIN meng-unexecute
        // sebuah pengajuan (via tombol RotateCcw), alarm tidak akan bunyi lagi
        // karena ID-nya masih tercatat di resolvedIds.
        const serverExecutedIds = new Set(
          rows.filter((r) => r.is_executed || r.is_cancelled || r.is_rejected).map((r) => r.id)
        );
        for (const id of Array.from(resolvedIds)) {
          if (!serverExecutedIds.has(id)) resolvedIds.delete(id);
        }

        const pendingExec = rows
          .filter(
            (r) =>
              r.is_approved &&
              !r.is_executed &&
              !r.is_rejected &&
              !r.is_cancelled &&
              !resolvedIds.has(r.id)
          )
          .map<ExecuteAlert>((r) => ({
            id: r.id,
            requester_name: (r.requester_name || "Tanpa Nama").trim(),
            purpose: r.purpose,
            amount: typeof r.amount === "number" ? r.amount : 0,
            approved_at: r.approved_at,
            approved_by_name: r.approved_by_name,
          }))
          .sort((a, b) => {
            const ta = a.approved_at ? new Date(a.approved_at).getTime() : 0;
            const tb = b.approved_at ? new Date(b.approved_at).getTime() : 0;
            return tb - ta;
          });

        if (!aborted) setAlerts(pendingExec);
      } catch {
        // koneksi jelek — diam, coba lagi di tick berikutnya
      }
    };

    fetchPendingExec();
    const timer = setInterval(fetchPendingExec, POLL_INTERVAL_MS);
    return () => { aborted = true; clearInterval(timer); };
  }, [enabled]);

   // Alarm looping — chime tiap 4 detik selama masih ada alert
  // ⬅️ REVISI: pakai `hasAlerts` (boolean), bukan `alerts.length`, supaya
  // chime TIDAK restart setiap kali jumlah pengajuan berubah (misal 2→3).
  // Dulu: setiap append pengajuan baru, interval dibubarkan & dibangun ulang
  // → terdengar bunyi "double" karena tick() langsung dipanggil tiap mount.
  // Volume juga dipindah ke ref supaya ganti volume tidak restart interval.
  const volumeRef = useRef(volume);
  useEffect(() => { volumeRef.current = volume; }, [volume]);

  const hasAlerts = alerts.length > 0;

  useEffect(() => {
    const stop = () => {
      if (loopRef.current) { clearInterval(loopRef.current); loopRef.current = null; }
    };

    if (!enabled || muted || !hasAlerts) { stop(); return; }

    if (!ctxRef.current) ctxRef.current = createAudioContext();
    const ctx = ctxRef.current;
    if (!ctx) return;

    // Chrome sering suspend AudioContext sampai ada user gesture
    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    const tick = () => { try { playChime(ctx, volumeRef.current); } catch {} };
    tick(); // bunyi langsung begitu alert pertama datang
    loopRef.current = setInterval(tick, 4000);

    return stop;
  }, [enabled, muted, hasAlerts]);

  return { alerts, muted, volume, toggleMute, setVolume };
}