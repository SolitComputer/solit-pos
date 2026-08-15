// src/lib/reminderSound.ts
// Bunyi notifikasi ringan "ting-ting" satu kali untuk reminder follow-up.
// Dibangun via Web Audio API supaya tidak butuh file audio tambahan.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

/** Panggil di dalam event handler gesture user (click/touch/keydown) agar audio tidak diblokir browser. */
export function unlockReminderAudio() {
  const c = getCtx();
  if (c && c.state === "suspended") {
    c.resume().catch(() => {});
  }
}

import { isSoundMuted } from "@/lib/soundSettings";

/** Mainkan nada notifikasi satu kali (dua nada pendek naik, seperti "ting-ting"). */
export function playReminderBeep() {
  if (isSoundMuted()) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") {
    c.resume().catch(() => {});
  }

  const playTone = (freq: number, start: number, duration: number) => {
    const osc = c!.createOscillator();
    const gain = c!.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, c!.currentTime + start);
    gain.gain.exponentialRampToValueAtTime(0.18, c!.currentTime + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, c!.currentTime + start + duration);
    osc.connect(gain);
    gain.connect(c!.destination);
    osc.start(c!.currentTime + start);
    osc.stop(c!.currentTime + start + duration + 0.02);
  };

  playTone(880, 0, 0.14);
  playTone(1175, 0.12, 0.18);
}