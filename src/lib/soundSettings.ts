// src/lib/soundSettings.ts
"use client";

import { useEffect, useState, useCallback } from "react";

const SOUND_MUTE_KEY = "solit_sound_muted";
const SOUND_MUTE_EVENT = "solit-sound-mute-changed";

export function isSoundMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(SOUND_MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSoundMuted(muted: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SOUND_MUTE_KEY, muted ? "1" : "0");
    window.dispatchEvent(new CustomEvent(SOUND_MUTE_EVENT, { detail: { muted } }));
  } catch { }
}

export function toggleSoundMuted(): boolean {
  const next = !isSoundMuted();
  setSoundMuted(next);
  return next;
}

export function useSoundMuted(): [boolean, (val?: boolean) => void] {
  const [muted, setMuted] = useState<boolean>(() => isSoundMuted());

  useEffect(() => {
    const handleMuteChange = () => {
      setMuted(isSoundMuted());
    };
    window.addEventListener(SOUND_MUTE_EVENT, handleMuteChange);
    window.addEventListener("storage", handleMuteChange);
    return () => {
      window.removeEventListener(SOUND_MUTE_EVENT, handleMuteChange);
      window.removeEventListener("storage", handleMuteChange);
    };
  }, []);

  const toggle = useCallback((val?: boolean) => {
    if (typeof val === "boolean") {
      setSoundMuted(val);
    } else {
      toggleSoundMuted();
    }
  }, []);

  return [muted, toggle];
}
