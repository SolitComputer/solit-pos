"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { haversineM, bearingDeg } from "@/lib/geo";
import { useWakeLock } from "./useWakeLock";

export type TrackStatus =
  | "ACQUIRING" | "ACTIVE" | "HIDDEN" | "NO_PERMISSION"
  | "NO_SIGNAL" | "OFFLINE" | "STOPPED";

export const TRACK_STATUS_LABEL: Record<TrackStatus, string> = {
  ACQUIRING: "Mencari sinyal GPS…",
  ACTIVE: "Lokasi terkirim normal",
  HIDDEN: "App diminimize / pindah aplikasi — GPS browser dijeda HP",
  NO_PERMISSION: "Izin lokasi dimatikan di HP",
  NO_SIGNAL: "Sinyal GPS hilang (dalam gedung / GPS HP mati)",
  OFFLINE: "Internet putus — lokasi disimpan & dikirim ulang nanti",
  STOPPED: "Tracking dihentikan",
};

export interface TrackerPoint {
  lat: number; lng: number; t: number;
  speed: number | null; phase: "GO" | "RETURN";
}

interface Args {
  orderId: string;
  enabled: boolean;                                  // true hanya kalau user = pengantar & order fase aktif
  phaseRef: React.MutableRefObject<"GO" | "RETURN">; // GO saat antar, RETURN saat pulang
  onPoint?: (p: TrackerPoint) => void;
}

const POST_INTERVAL_MS = 3000;
const HEARTBEAT_MS = 10000;
const STALE_FIX_MS = 20000;
const BUF_KEY = (id: string) => `track_buf_${id}`;

export function useDeliveryTracker({ orderId, enabled, phaseRef, onPoint }: Args) {
  const [status, setStatus] = useState<TrackStatus>("STOPPED");
  const [isTracking, setIsTracking] = useState(false);
  const [bufferedCount, setBufferedCount] = useState(0);

  const wakeLock = useWakeLock();

  const watchIdRef = useRef<number | null>(null);
  const lastPostRef = useRef(0);
  const lastFixRef = useRef(0);
  const lastPtRef = useRef<{ lat: number; lng: number; t: number } | null>(null);
  const statusRef = useRef<TrackStatus>("STOPPED");
  const audioRef = useRef<{ ctx: AudioContext; osc: OscillatorNode } | null>(null);

  // ── kirim status ke server (observer baca ini buat tau KENAPA berhenti) ──
  const pushStatus = useCallback(async (s: TrackStatus) => {
    try {
      await fetch(`/api/preparation/${orderId}/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: s, reason: TRACK_STATUS_LABEL[s] }),
        keepalive: true, // penting: tetap kekirim walau tab mau ditutup
      });
    } catch { /* offline → heartbeat berikutnya yang urus */ }
  }, [orderId]);

  const setStatusAndPush = useCallback((s: TrackStatus) => {
    if (statusRef.current === s) return;
    statusRef.current = s;
    setStatus(s);
    pushStatus(s);
  }, [pushStatus]);

  // ── buffer offline ──
  const buffer = useCallback((p: any) => {
    try {
      const arr = JSON.parse(localStorage.getItem(BUF_KEY(orderId)) || "[]");
      arr.push(p);
      const trimmed = arr.slice(-500);
      localStorage.setItem(BUF_KEY(orderId), JSON.stringify(trimmed));
      setBufferedCount(trimmed.length);
    } catch { /* noop */ }
  }, [orderId]);

  const flushBuffer = useCallback(async () => {
    let arr: any[] = [];
    try { arr = JSON.parse(localStorage.getItem(BUF_KEY(orderId)) || "[]"); } catch { /* noop */ }
    if (!arr.length) return;
    const remain: any[] = [];
    for (const p of arr) {
      try {
        const r = await fetch(`/api/preparation/${orderId}/tracking`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p),
        });
        if (!r.ok) remain.push(p);
      } catch { remain.push(p); }
    }
    localStorage.setItem(BUF_KEY(orderId), JSON.stringify(remain));
    setBufferedCount(remain.length);
    if (remain.length === 0 && statusRef.current === "OFFLINE") setStatusAndPush("ACTIVE");
  }, [orderId, setStatusAndPush]);

  const postPoint = useCallback(async (p: any) => {
    if (!navigator.onLine) { buffer(p); setStatusAndPush("OFFLINE"); return; }
    try {
      const r = await fetch(`/api/preparation/${orderId}/tracking`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p), keepalive: true,
      });
      if (!r.ok) throw new Error("fail");
      if (statusRef.current === "OFFLINE") setStatusAndPush("ACTIVE");
    } catch { buffer(p); setStatusAndPush("OFFLINE"); }
  }, [orderId, buffer, setStatusAndPush]);

  // ── audio keep-alive (inaudible, best-effort biar tab ga dibekuin total) ──
  const startAudioKeepAlive = useCallback(() => {
    if (audioRef.current) return;
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.0001; // -80dB, ga kedengeran
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start();
      audioRef.current = { ctx, osc };
    } catch { /* noop */ }
  }, []);

  const stopAudioKeepAlive = useCallback(() => {
    try { audioRef.current?.osc.stop(); audioRef.current?.ctx.close(); } catch { /* noop */ }
    audioRef.current = null;
  }, []);

  // ── start / stop watchPosition ──
  const startWatch = useCallback(() => {
    if (watchIdRef.current != null || !navigator.geolocation) return;
    setIsTracking(true);
    setStatusAndPush("ACQUIRING");
    watchIdRef.current = navigator.geolocation.watchPosition(
      pos => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude, now = Date.now();
        lastFixRef.current = now;
        let speed: number | null = pos.coords.speed;
        let heading: number | null = pos.coords.heading;
        const prev = lastPtRef.current;
        if ((speed == null || isNaN(speed)) && prev) {
          const dt = (now - prev.t) / 1000, d = haversineM(prev, { lat, lng });
          speed = dt > 0 ? d / dt : 0;
        }
        if ((heading == null || isNaN(heading)) && prev) heading = bearingDeg(prev, { lat, lng });
        lastPtRef.current = { lat, lng, t: now };

        onPoint?.({ lat, lng, t: now, speed, phase: phaseRef.current });

        if (document.visibilityState === "visible") setStatusAndPush("ACTIVE");

        if (now - lastPostRef.current > POST_INTERVAL_MS) {
          lastPostRef.current = now;
          postPoint({ lat, lng, accuracy: pos.coords.accuracy ?? null, speed, heading, phase: phaseRef.current });
        }
      },
      err => {
        if (err.code === err.PERMISSION_DENIED) setStatusAndPush("NO_PERMISSION");
        else setStatusAndPush("NO_SIGNAL"); // POSITION_UNAVAILABLE / TIMEOUT
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );
  }, [onPoint, phaseRef, postPoint, setStatusAndPush]);

  const stopWatch = useCallback(() => {
    if (watchIdRef.current != null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
    setIsTracking(false);
  }, []);

  // ── lifecycle utama ──
  useEffect(() => {
    if (!enabled) return;

    startWatch();
    wakeLock.request();
    startAudioKeepAlive();

    const hb = setInterval(() => pushStatus(statusRef.current), HEARTBEAT_MS);

    // watchdog: GPS macet padahal app kebuka & visible
    const watchdog = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (statusRef.current === "NO_PERMISSION") return;
      const age = Date.now() - lastFixRef.current;
      if (lastFixRef.current > 0 && age > STALE_FIX_MS) setStatusAndPush("NO_SIGNAL");
    }, 5000);

    const onVis = () => {
      if (document.visibilityState === "hidden") {
        setStatusAndPush("HIDDEN"); // ← kunci poin #2: begitu di-minimize, server langsung tau
      } else {
        wakeLock.request();
        audioRef.current?.ctx.resume().catch(() => {});
        if (watchIdRef.current == null) startWatch(); // iOS suka bunuh watch → nyalain lagi
        else setStatusAndPush(navigator.onLine ? "ACQUIRING" : "OFFLINE");
        flushBuffer();
      }
    };
    const onOnline = () => { flushBuffer(); setStatusAndPush("ACQUIRING"); };
    const onOffline = () => setStatusAndPush("OFFLINE");
    const onPageHide = () => pushStatus("HIDDEN"); // app ditutup → status terakhir kekirim

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("pagehide", onPageHide);
      clearInterval(hb);
      clearInterval(watchdog);
      stopWatch();
      stopAudioKeepAlive();
      wakeLock.release();
      setStatusAndPush("STOPPED");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return {
    status,
    statusLabel: TRACK_STATUS_LABEL[status],
    isTracking,
    bufferedCount,
    wakeLockActive: wakeLock.active,
    startWatch,
  };
}