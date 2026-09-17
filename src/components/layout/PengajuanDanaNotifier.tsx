"use client";

import { useRouter } from "next/navigation";
import { CircleDollarSign, X } from "lucide-react";
import { usePengajuanDanaNotify } from "@/hooks/usePengajuanDanaNotify";

function formatRupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

const VISIBLE_LIMIT = 4;

interface PengajuanDanaNotifierProps {
  /** Role user saat ini — dikirim dari DashboardLayout (sumber: useAuthUser,
   *  supaya tidak fetch /api/auth/me dua kali). Komponen ini SENGAJA tidak
   *  di-gate oleh isSilentAdmin di DashboardLayout, karena target
   *  notifikasinya justru ADMIN — kebalikan dari notifier lain. */
  userRoles: string[];
}

export default function PengajuanDanaNotifier({ userRoles }: PengajuanDanaNotifierProps) {
  const router = useRouter();
  const isAdmin = userRoles.includes("ADMIN");

  // enabled = false kalau bukan ADMIN -> hook tidak polling sama sekali
  const { alerts, dismiss, dismissAll } = usePengajuanDanaNotify(isAdmin);

  if (!isAdmin || alerts.length === 0) return null;

  const visible = alerts.slice(0, VISIBLE_LIMIT);
  const hiddenCount = alerts.length - visible.length;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col items-end gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none">
      {alerts.length > 1 && (
        <button
          onClick={dismissAll}
          className="pointer-events-auto text-[11px] font-semibold text-slate-400 hover:text-slate-600 transition bg-white/80 backdrop-blur px-2.5 py-1 rounded-full shadow-sm"
        >
          Tutup semua ({alerts.length})
        </button>
      )}

      {visible.map((alert) => (
        <div
          key={alert.id}
          className="pointer-events-auto relative w-full overflow-hidden rounded-2xl bg-white shadow-2xl shadow-black/10 border border-indigo-100"
          style={{ animation: "pdnSlideIn 0.35s cubic-bezier(0.16,1,0.3,1) both" }}
        >
          <div className="h-1 bg-gradient-to-r from-indigo-500 to-purple-600" />
          <div className="p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0">
              <CircleDollarSign className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">
                Pengajuan Dana Baru
              </p>
              <p className="text-sm font-bold text-slate-800 truncate mt-0.5">
                {alert.requester_name}
              </p>
              <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{alert.purpose}</p>
              <p className="text-sm font-extrabold text-slate-900 mt-1">
                {formatRupiah(alert.amount)}
              </p>
              <button
                onClick={() => {
                  dismiss(alert.id);
                  router.push("/dashboard/pengajuan-dana");
                }}
                className="mt-2 text-[11px] font-bold text-indigo-600 hover:text-indigo-700"
              >
                Lihat &amp; Setujui →
              </button>
            </div>
            <button
              onClick={() => dismiss(alert.id)}
              className="w-6 h-6 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition flex-shrink-0"
              aria-label="Tutup notifikasi"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}

      {hiddenCount > 0 && (
        <p className="pointer-events-none text-[11px] font-semibold text-slate-400 bg-white/80 backdrop-blur px-2.5 py-1 rounded-full shadow-sm">
          +{hiddenCount} pengajuan lainnya
        </p>
      )}

      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes pdnSlideIn {
          from { opacity: 0; transform: translateX(24px) scale(0.96); }
          to { opacity: 1; transform: translateX(0) scale(1); }
        }
      `}} />
    </div>
  );
}