// src/hooks/useMissionSound.ts
"use client";
import { useCallback, useEffect, useRef } from "react";

const NOTES = [
    { freq: 523.25, start: 0, dur: 0.12 },
    { freq: 659.25, start: 0.14, dur: 0.12 },
    { freq: 783.99, start: 0.28, dur: 0.18 },
    { freq: 1046.5, start: 0.47, dur: 0.25 },
];

import { isSoundMuted } from "@/lib/soundSettings";

export function useMissionSound() {
    const ctxRef = useRef<AudioContext | null>(null);
    const unlocked = useRef(false);
    const pending = useRef(false);

    const getCtx = useCallback((): AudioContext | null => {
        if (typeof window === "undefined") return null;
        if (!ctxRef.current) {
            try {
                ctxRef.current = new (
                    window.AudioContext || (window as any).webkitAudioContext
                )();
            } catch {
                return null;
            }
        }
        return ctxRef.current;
    }, []);

    const _playTones = useCallback((ctx: AudioContext) => {
        if (isSoundMuted()) return;
        const now = ctx.currentTime;
        const master = ctx.createGain();
        master.gain.setValueAtTime(0.45, now);
        master.connect(ctx.destination);

        for (const n of NOTES) {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(n.freq, now + n.start);
            g.gain.setValueAtTime(0, now + n.start);
            g.gain.linearRampToValueAtTime(1, now + n.start + 0.025);
            g.gain.exponentialRampToValueAtTime(0.001, now + n.start + n.dur);
            osc.connect(g);
            g.connect(master);
            osc.start(now + n.start);
            osc.stop(now + n.start + n.dur + 0.06);
        }
    }, []);

    /**
     * Dipanggil saat ada user interaction (click / keydown / touchstart).
     * Membuka kunci AudioContext dan memutar pending notification jika ada.
     */
    const unlockAudio = useCallback(async () => {
        const ctx = getCtx();
        if (!ctx) return;

        // Resume dulu — wajib sebelum apapun
        if (ctx.state === "suspended") {
            try { await ctx.resume(); } catch { return; }
        }

        if (ctx.state !== "running") return;

        // Tandai unlocked
        unlocked.current = true;

        // Silent buffer — paksa browser benar-benar buka kunci autoplay
        try {
            const buf = ctx.createBuffer(1, 1, 22050);
            const src = ctx.createBufferSource();
            src.buffer = buf;
            src.connect(ctx.destination);
            src.start(0);
        } catch { /* non-fatal */ }

        // Ada notif yang pending saat audio masih terkunci? Putar sekarang.
        if (pending.current) {
            pending.current = false;
            _playTones(ctx);
        }
    }, [getCtx, _playTones]);

    /**
     * Dipanggil saat misi baru masuk via Supabase Realtime.
     * Kalau AudioContext belum siap, simpan sebagai pending —
     * akan diputar otomatis saat user berinteraksi berikutnya.
     */
    const playMissionSound = useCallback(async () => {
        const ctx = getCtx();
        if (!ctx) return;

        // Coba resume paksa — berhasil kalau sudah pernah ada interaksi sebelumnya
        if (ctx.state === "suspended") {
            try { await ctx.resume(); } catch { /* ignore */ }
        }

        if (ctx.state === "running") {
            unlocked.current = true;
            pending.current = false;
            _playTones(ctx);
            return;
        }

        // Context masih blocked → simpan pending
        pending.current = true;
    }, [getCtx, _playTones]);

    useEffect(() => {
        return () => { ctxRef.current?.close().catch(() => { }); };
    }, []);

    return { playMissionSound, unlockAudio };
}