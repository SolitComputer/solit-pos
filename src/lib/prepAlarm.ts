import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { playSoundByKey } from "@/lib/preparationSound";
import { isSoundMuted } from "@/lib/soundSettings";

export const ALARM_KEYS = {
  MENUNGGU: "prep_alarm_menunggu",
  SIAP_KIRIM: "prep_alarm_siapkirim",
  APPROVAL: "prep_alarm_approval",
  LEADS_CHAT: "prep_alarm_leadschat",
} as const;

function readAck(storageKey: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}

/**
 * Notifikasi suara hanya berbunyi 1x saat ada item BARU YANG BELUM PERNAH TERLIHAT masuk.
 * - Tidak looping tiap 4 detik.
 * - Tidak bunyi saat pertama kali buka halaman / data pertama kali datang dari API.
 * - Tidak bunyi saat banner di-close/disilang (acknowledge).
 */
export function usePrepAlarm(
  items: { id: string }[],
  storageKey: string,
  soundEnabled: boolean,
  intervalMs = 4000,
  soundKey: string = "default",
  customSoundUrl: string | null = null
) {
  const [ackedIds, setAckedIds] = useState<Set<string>>(() => readAck(storageKey));
  const [muted, setMuted] = useState<boolean>(() => isSoundMuted());

  // Set ID yang sudah pernah "terlihat" oleh hook ini (termasuk data pertama dari API).
  const seenIdsRef = useRef<Set<string>>(new Set());
  // Flag apakah inisialisasi awal sudah lewat
  const isInitialBatchRef = useRef<boolean>(true);

  // sinkron ack & mute status antar hook instance & antar tab
  useEffect(() => {
    const reread = () => setAckedIds(readAck(storageKey));
    const onMuteChange = () => setMuted(isSoundMuted());
    const eventName = `prep-ack-changed:${storageKey}`;

    window.addEventListener(eventName, reread);
    window.addEventListener("prep-ack-changed", reread);
    window.addEventListener("solit-sound-mute-changed", onMuteChange);
    window.addEventListener("storage", reread);
    window.addEventListener("storage", onMuteChange);
    return () => {
      window.removeEventListener(eventName, reread);
      window.removeEventListener("prep-ack-changed", reread);
      window.removeEventListener("solit-sound-mute-changed", onMuteChange);
      window.removeEventListener("storage", reread);
      window.removeEventListener("storage", onMuteChange);
    };
  }, [storageKey]);

  const unacked = useMemo(
    () => items.filter((o) => !ackedIds.has(o.id)),
    [items, ackedIds]
  );

  useEffect(() => {
    // Pada load pertama saat komponen mount:
    // Catat item awal yang sudah ada (jika ada) ke seenIdsRef dan akhiri initial batch
    if (isInitialBatchRef.current) {
      unacked.forEach((o) => seenIdsRef.current.add(o.id));
      isInitialBatchRef.current = false;
      return;
    }

    if (!soundEnabled || muted) {
      // Tetap catat semua ID yang ada supaya nanti tidak dianggap "baru"
      unacked.forEach((o) => seenIdsRef.current.add(o.id));
      return;
    }

    if (unacked.length === 0) {
      return;
    }

    // Cari ID yang BENAR-BENAR BARU (belum pernah terlihat oleh hook ini)
    const trulyNewIds = unacked.filter((o) => !seenIdsRef.current.has(o.id));

    // Catat SEMUA id yang sekarang ada sebagai "sudah terlihat"
    unacked.forEach((o) => seenIdsRef.current.add(o.id));

    // Sudah pernah inisialisasi DAN ada ID baru → bunyi 1x
    if (trulyNewIds.length > 0) {
      playSoundByKey(soundKey, customSoundUrl);
    }
  }, [unacked, soundEnabled, soundKey, customSoundUrl, muted]);

  const acknowledge = useCallback(
    (id: string) => {
      // Tandai juga sebagai "sudah terlihat" supaya tidak bunyi lagi
      seenIdsRef.current.add(id);
      setAckedIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        try {
          localStorage.setItem(storageKey, JSON.stringify([...next]));
          window.dispatchEvent(new CustomEvent(`prep-ack-changed:${storageKey}`));
          window.dispatchEvent(new CustomEvent("prep-ack-changed"));
        } catch { }
        return next;
      });
    },
    [storageKey]
  );

  const unackedIds = useMemo(() => new Set(unacked.map((o) => o.id)), [unacked]);

  return { unackedCount: unacked.length, unackedIds, acknowledge };
}

export const PREP_PROVIDER_ROLES = [
  "PENYEDIA_BARANG",
  "KEPALA_PENYEDIA_BARANG",
  "PKL_PENYEDIA_BARANG",
] as const;

export const PREP_SILENT_ROLES = ["ADMIN"] as const;

function collectRoles(role?: string | null, roles?: string[] | null): string[] {
  const list = roles ? [...roles] : [];
  if (role) list.push(role);
  return list;
}

/** true kalau user termasuk penyedia barang (dengar semua alarm format masuk). */
export function isPrepProvider(role?: string | null, roles?: string[] | null): boolean {
  const list = collectRoles(role, roles);
  return list.some((r) => (PREP_PROVIDER_ROLES as readonly string[]).includes(r));
}

/** true kalau user tidak boleh bunyi alarm sama sekali (mis. admin). */
export function isPrepSilent(role?: string | null, roles?: string[] | null): boolean {
  const list = collectRoles(role, roles);
  return list.some((r) => (PREP_SILENT_ROLES as readonly string[]).includes(r));
}