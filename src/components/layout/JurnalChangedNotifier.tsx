// src/components/layout/JurnalChangedNotifier.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, X, Check, ExternalLink, FileWarning, PlusCircle, RefreshCw } from "lucide-react";
import { useJurnalChangedNotify, JurnalChangedAlert } from "@/hooks/useJurnalChangedNotify";

// Meta visual per trigger type — badge color + icon.
const TRIGGER_META: Record<
  JurnalChangedAlert["trigger_type"],
  { label: string; badgeColor: string; iconBg: string; icon: typeof Bell }
> = {
  NOMINAL_CHANGED: {
    label: "Nominal Berubah",
    badgeColor: "bg-amber-50 text-amber-700 border-amber-200",
    iconBg: "bg-amber-100 text-amber-600 border-amber-200",
    icon: RefreshCw,
  },
  PARTIAL_CANCEL_CORRECTION: {
    label: "Koreksi Partial Cancel",
    badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
    iconBg: "bg-blue-100 text-blue-600 border-blue-200",
    icon: FileWarning,
  },
  EDIT_TRANSACTION_CORRECTION: {
    label: "Koreksi Edit Transaksi",
    badgeColor: "bg-violet-50 text-violet-700 border-violet-200",
    iconBg: "bg-violet-100 text-violet-600 border-violet-200",
    icon: PlusCircle,
  },
};

function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSec < 60) return "baru saja";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} menit lalu`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} jam lalu`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay} hari lalu`;
}

interface Props {
  /** ID user yang sedang login — dari DashboardLayout (useAuthUser).
   *  Hook di-enable kalau userId !== null.
   *  API sendiri yang cek eligibility (via journal_notif_recipients), jadi
   *  kalau user tidak di-whitelist, alerts akan kosong → bubble tidak muncul. */
  userId: string | null;
}

export default function JurnalChangedNotifier({ userId }: Props) {
  const router = useRouter();
  const { alerts, acknowledge } = useJurnalChangedNotify(!!userId);
  const [open, setOpen] = useState(false);

  const count = alerts.length;

  // Auto-close panel kalau semua notif sudah di-ack (count jadi 0).
  useEffect(() => {
    if (count === 0 && open) setOpen(false);
  }, [count, open]);

  // Hidden state: user belum login, user tidak eligible, atau tidak ada notif.
  if (!userId || count === 0) return null;

  const handleGoToJurnal = () => {
    router.push("/dashboard/akutansi");
    setOpen(false);
  };

  return (
    <>
      {/* ── Bubble floating pojok kanan ATAS (biar tidak bentrok dengan
           PatchNoteFab yang di kanan BAWAH & notif lain di top-center) ── */}
      <div className="fixed top-14 right-3 sm:top-16 sm:right-4 z-[95] pointer-events-auto">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={`${count} notif jurnal berubah`}
          title={`${count} perubahan jurnal belum dibaca`}
          className="relative flex items-center gap-1.5 bg-white shadow-xl border border-amber-200 rounded-full pl-1.5 pr-3 py-1 hover:-translate-y-0.5 transition-transform"
        >
          <span className="w-7 h-7 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
            <Bell className="w-4 h-4" />
          </span>
          <span className="text-[11px] font-bold text-slate-700 hidden sm:inline">
            Jurnal
          </span>
          <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-extrabold flex items-center justify-center tabular-nums">
            {count}
          </span>
        </button>
      </div>

      {/* ── Panel popup: backdrop + list notif + tombol OK per notif ── */}
      {open && (
        <div
          className="fixed inset-0 z-[96] bg-black/40 flex items-start justify-end p-3 sm:p-4 pt-14 sm:pt-16"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md max-h-[85vh] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
            style={{ animation: "jcnDropIn 0.25s cubic-bezier(0.16,1,0.3,1) both" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-bold text-slate-800">
                  Notif Jurnal Berubah
                </h3>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 tabular-nums">
                  {count}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500"
                aria-label="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* List notif */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {alerts.map((alert) => {
                const meta = TRIGGER_META[alert.trigger_type];
                const Icon = meta.icon;
                return (
                  <div
                    key={alert.id}
                    className="p-4 bg-white hover:bg-slate-50/60 transition"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border ${meta.iconBg}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide ${meta.badgeColor}`}>
                            {meta.label}
                          </span>
                          {alert.invoice_number && (
                            <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              {alert.invoice_number}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-700 leading-relaxed">
                          {alert.detail_message}
                        </p>
                        <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-400">
                          <span>{formatRelativeTime(alert.created_at)}</span>
                          {alert.created_by_name && (
                            <>
                              <span>·</span>
                              <span>oleh {alert.created_by_name}</span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-3">
                          <button
                            type="button"
                            onClick={handleGoToJurnal}
                            className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 hover:text-amber-700"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Buka Jurnal
                          </button>
                          <div className="flex-1" />
                          <button
                            type="button"
                            onClick={() => acknowledge(alert.id)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500 text-white rounded-full text-[11px] font-bold hover:bg-emerald-600 transition-colors shadow-sm"
                          >
                            <Check className="w-3.5 h-3.5" />
                            OK
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <style dangerouslySetInnerHTML={{
            __html: `
              @keyframes jcnDropIn {
                from { opacity: 0; transform: translateY(-16px) scale(0.97); }
                to { opacity: 1; transform: translateY(0) scale(1); }
              }
            `
          }} />
        </div>
      )}
    </>
  );
}