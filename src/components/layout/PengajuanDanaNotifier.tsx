"use client";

import { useRouter } from "next/navigation";
import { CircleDollarSign } from "lucide-react";
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
  const { alerts } = usePengajuanDanaNotify(isAdmin);

  if (!isAdmin || alerts.length === 0) return null;

  const visible = alerts.slice(0, VISIBLE_LIMIT);
  const hiddenCount = alerts.length - visible.length;

  return (
    <div className="fixed top-4 inset-x-0 z-[100] flex flex-col items-center gap-2 px-4 pointer-events-none">
      {visible.map((alert) => (
        <button
          key={alert.id}
          type="button"
          onClick={() => router.push("/dashboard/pengajuan-dana")}
          title="Klik untuk membuka & menyetujui pengajuan ini"
          className="pointer-events-auto w-full max-w-sm text-left overflow-hidden rounded-2xl bg-white shadow-2xl shadow-black/15 border border-indigo-100 hover:-translate-y-0.5 transition-transform"
          style={{ animation: "pdnDropIn 0.35s cubic-bezier(0.16,1,0.3,1) both" }}
        >
          <div className="h-1 bg-gradient-to-r from-indigo-500 to-purple-600" />
          <div className="p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0">
              <CircleDollarSign className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">
                Pengajuan Dana Baru · Menunggu Persetujuan
              </p>
              <p className="text-sm font-bold text-slate-800 truncate mt-0.5">
                {alert.requester_name}
              </p>
              <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{alert.purpose}</p>
              <p className="text-sm font-extrabold text-slate-900 mt-1">
                {formatRupiah(alert.amount)}
              </p>
            </div>
          </div>
        </button>
      ))}

      {hiddenCount > 0 && (
        <p className="pointer-events-none text-[11px] font-semibold text-slate-500 bg-white/90 backdrop-blur px-2.5 py-1 rounded-full shadow-sm">
          +{hiddenCount} pengajuan lain menunggu persetujuan
        </p>
      )}

      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes pdnDropIn {
          from { opacity: 0; transform: translateY(-16px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}} />
    </div>
  );
}