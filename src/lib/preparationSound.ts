let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function playChime(ctx: AudioContext, startOffset: number) {
  const now = ctx.currentTime + startOffset;
  const tones = [
    { freq: 987.77, t: 0, dur: 0.18 },    // B5
    { freq: 1318.51, t: 0.14, dur: 0.32 }, // E6
  ];
  for (const tn of tones) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = tn.freq;
    gain.gain.setValueAtTime(0.0001, now + tn.t);
    gain.gain.exponentialRampToValueAtTime(0.7, now + tn.t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + tn.t + tn.dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + tn.t);
    osc.stop(now + tn.t + tn.dur);
  }
}

function playSiren(ctx: AudioContext, startOffset: number) {
  // Sapuan naik-turun ala sirine — dipakai buat notif "urgent"
  const now = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(600, now);
  osc.frequency.linearRampToValueAtTime(1200, now + 0.25);
  osc.frequency.linearRampToValueAtTime(600, now + 0.5);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.5, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.5);
}

function playBell(ctx: AudioContext, startOffset: number) {
  const now = ctx.currentTime + startOffset;
  const tones = [
    { freq: 523.25, t: 0, dur: 0.4 },
    { freq: 659.25, t: 0.08, dur: 0.5 },
  ];
  for (const tn of tones) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = tn.freq;
    gain.gain.setValueAtTime(0.0001, now + tn.t);
    gain.gain.exponentialRampToValueAtTime(0.6, now + tn.t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + tn.t + tn.dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + tn.t);
    osc.stop(now + tn.t + tn.dur);
  }
}

function playDoubleBeep(ctx: AudioContext, startOffset: number) {
  const now = ctx.currentTime + startOffset;
  [0, 0.16].forEach((t) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 1046.5;
    gain.gain.setValueAtTime(0.0001, now + t);
    gain.gain.exponentialRampToValueAtTime(0.35, now + t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + t);
    osc.stop(now + t + 0.12);
  });
}

export type NotifSoundKey = "default" | "urgent" | "bell" | "double_beep";

export const NOTIF_SOUND_OPTIONS: { key: NotifSoundKey; label: string }[] = [
  { key: "default", label: "Default — Chime Lembut" },
  { key: "urgent", label: "Urgent — Sirine" },
  { key: "bell", label: "Bell Ganda" },
  { key: "double_beep", label: "Beep Cepat" },
];

const SOUND_PLAYERS: Record<NotifSoundKey, (ctx: AudioContext) => void> = {
  default: (ctx) => { playChime(ctx, 0); playChime(ctx, 0.45); playChime(ctx, 0.9); },
  urgent: (ctx) => { playSiren(ctx, 0); playSiren(ctx, 0.55); playSiren(ctx, 1.1); },
  bell: (ctx) => { playBell(ctx, 0); playBell(ctx, 0.5); },
  double_beep: (ctx) => { playDoubleBeep(ctx, 0); playDoubleBeep(ctx, 0.3); },
};

const VIBRATE_PATTERNS: Record<NotifSoundKey, number[]> = {
  default: [200, 100, 200, 100, 200],
  urgent: [300, 100, 300, 100, 300, 100, 300],
  bell: [250, 150, 250],
  double_beep: [100, 80, 100],
};

// Cache <audio> per URL biar nggak bikin elemen baru tiap kali notif bunyi berulang
const customAudioCache = new Map<string, HTMLAudioElement>();

function getCustomAudio(url: string): HTMLAudioElement {
  let audio = customAudioCache.get(url);
  if (!audio) {
    audio = new Audio(url);
    audio.preload = "auto";
    customAudioCache.set(url, audio);
  }
  return audio;
}

import { isSoundMuted } from "@/lib/soundSettings";

export function playSoundByKey(key: string, customUrl?: string | null) {
  try {
    if (isSoundMuted()) return;
    if (key === "custom" && customUrl) {
      const audio = getCustomAudio(customUrl);
      audio.currentTime = 0;
      audio.play().catch(() => { /* browser blokir autoplay tanpa interaksi — abaikan */ });
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate?.(VIBRATE_PATTERNS.default);
      }
      return;
    }
    const ctx = getCtx();
    if (!ctx) return;
    const soundKey = (key in SOUND_PLAYERS ? key : "default") as NotifSoundKey;
    SOUND_PLAYERS[soundKey](ctx);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(VIBRATE_PATTERNS[soundKey]);
    }
  } catch { /* silent fail */ }
}

export function playNotifSound() {
  playSoundByKey("default");
}

export function unlockAudio() {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.01);
  } catch { /* ignore */ }
}