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

export function playNotifSound() {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    playChime(ctx, 0);
    playChime(ctx, 0.45);
    playChime(ctx, 0.9);

    // Getar HP juga kalau didukung (bonus, terutama mobile penyedia barang)
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.([200, 100, 200, 100, 200]);
    }
  } catch { /* silent fail */ }
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