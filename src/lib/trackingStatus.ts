export interface LiveOrder {
  status: string;
  delivery_method?: string | null;
  delivery_started_at?: string | null;
  return_started_at?: string | null;
  returned_at?: string | null;
  tracking_status?: string | null;
  tracking_reason?: string | null;
  tracking_last_ping?: string | null;
}

export type LiveTone = "ok" | "warn" | "bad" | "idle";

/** Terjemahkan status mentah + umur heartbeat jadi status yang dimengerti pemantau. */
export function deriveLiveStatus(o: LiveOrder, nowTs: number): { code: string; label: string; tone: LiveTone } {
  const goActive = o.status === "DIKIRIM" && o.delivery_method === "PENGANTARAN";
  const retActive = o.status === "SELESAI" && !!o.return_started_at && !o.returned_at;
  if (!goActive && !retActive) return { code: "IDLE", label: "Tidak sedang diantar", tone: "idle" };

  const lastPing = o.tracking_last_ping ? new Date(o.tracking_last_ping).getTime() : 0;
  const age = lastPing ? nowTs - lastPing : Infinity;

  if (lastPing === 0) return { code: "WAITING", label: "Menunggu pengantar mulai kirim lokasi", tone: "warn" };
  // >45 dtk ga ada ping padahal harusnya jalan = app ditutup / HP mati / crash
  if (age > 45000) return { code: "LOST", label: "Sinyal hilang total — app pengantar kemungkinan ditutup / HP mati", tone: "bad" };

  switch (o.tracking_status) {
    case "ACTIVE": return { code: "ACTIVE", label: "Live — lokasi terkirim normal", tone: "ok" };
    case "ACQUIRING": return { code: "ACQUIRING", label: "Mencari sinyal GPS…", tone: "warn" };
    case "HIDDEN": return { code: "HIDDEN", label: "Pengantar minimize app — GPS browser dijeda HP", tone: "warn" };
    case "NO_PERMISSION": return { code: "NO_PERMISSION", label: "Izin lokasi di HP pengantar dimatikan", tone: "bad" };
    case "NO_SIGNAL": return { code: "NO_SIGNAL", label: "GPS pengantar tidak dapat sinyal", tone: "warn" };
    case "OFFLINE": return { code: "OFFLINE", label: "Internet pengantar putus — lokasi tertahan", tone: "warn" };
    case "STOPPED": return { code: "STOPPED", label: "Tracking dihentikan", tone: "warn" };
    default: return { code: "ACTIVE", label: "Live", tone: "ok" };
  }
}