// src/hooks/useJurnalChangedNotify.ts
"use client";

import { useCallback, useEffect, useState } from "react";

export interface JurnalChangedAlert {
  id: string;
  entry_id: string;
  trigger_type: "NOMINAL_CHANGED" | "PARTIAL_CANCEL_CORRECTION" | "EDIT_TRANSACTION_CORRECTION";
  detail_message: string;
  invoice_number: string | null;
  created_at: string;
  created_by_name: string | null;
  entry_period: string | null;   // ⬅️ BARU — "YYYY-MM" periode entry (dipakai untuk URL "Buka Jurnal")
  entry_tanggal: string | null;  // ⬅️ BARU — tanggal persis entry (opsional)
}

// Jarak antar-poll (ms). API sudah filter eligible user & ack status jadi
// hasilnya ringan — 15 detik cukup responsif tanpa spam.
const POLL_INTERVAL_MS = 15_000;

/**
 * Polling hook untuk notif perubahan jurnal.
 *
 * - enabled=false → hook tidak polling sama sekali (mis. user belum login,
 *   atau dipakai di halaman yang tidak butuh notif).
 * - enabled=true → fetch /api/akutansi/jurnal/notifications tiap 15 detik.
 * - acknowledge() → POST ack ke endpoint + optimistic remove dari state.
 *
 * API sendiri yang cek eligibility user (via journal_notif_recipients).
 * Kalau user tidak eligible, API return array kosong → hook jadi no-op.
 */
export function useJurnalChangedNotify(enabled: boolean) {
  const [alerts, setAlerts] = useState<JurnalChangedAlert[]>([]);

  useEffect(() => {
    if (!enabled) {
      setAlerts([]); // reset kalau disable mid-session
      return;
    }

    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/akutansi/jurnal/notifications");
        const json = await res.json();
        if (cancelled) return;
        if (json?.success && Array.isArray(json.data)) {
          setAlerts(json.data);
        }
      } catch {
        // Silent fail — poll berikutnya akan retry. Tidak perlu ganggu UX.
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabled]);

  /**
   * Acknowledge 1 notif: user klik "OK" di popup.
   * Optimistic: hapus dari local state DULU, lalu POST ke server.
   * Kalau POST gagal, notif akan muncul lagi di poll berikutnya.
   */
  const acknowledge = useCallback(async (notifId: string) => {
    // Optimistic remove — biar UI langsung responsif
    setAlerts((prev) => prev.filter((a) => a.id !== notifId));

    try {
      await fetch(`/api/akutansi/jurnal/notifications/${notifId}/ack`, {
        method: "POST",
      });
    } catch (err) {
      console.error("[useJurnalChangedNotify] ack failed:", err);
      // Server poll berikutnya akan re-sync kalau ack gagal
    }
  }, []);

  return { alerts, acknowledge };
}