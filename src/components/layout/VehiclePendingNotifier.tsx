"use client";

import { useRouter } from "next/navigation";
import { Bike, Car, Volume2, VolumeX } from "lucide-react";
import { useVehiclePendingNotify } from "@/hooks/useVehiclePendingNotify";
import { VEHICLE_APPROVAL_ROLES } from "@/lib/permissions";

const VISIBLE_LIMIT = 4;

interface VehiclePendingNotifierProps {
  /** Role user saat ini — dikirim dari DashboardLayout (sumber: useAuthUser). */
  userRoles: string[];
}

export default function VehiclePendingNotifier({ userRoles }: VehiclePendingNotifierProps) {
  const router = useRouter();
  // Notifikasi ACC kendaraan HANYA untuk role approval. Pakai
  // VEHICLE_APPROVAL_ROLES sebagai satu-satunya sumber → otomatis sinkron
  // dengan canApprove di backend kalau daftar role approval berubah.
  const canApprove = userRoles.some((r) =>
    (VEHICLE_APPROVAL_ROLES as readonly string[]).includes(r)
  );
  const { alerts, muted, toggleMute } = useVehiclePendingNotify(canApprove);

  if (!canApprove || alerts.length === 0) return null;

  const visible = alerts.slice(0, VISIBLE_LIMIT);
  const hiddenCount = alerts.length - visible.length;
  const compactLabel =
    alerts.length === 1
      ? `${alerts[0].borrower_name} · ${alerts[0].vehicle_name}`
      : `${alerts.length} pengajuan menunggu ACC`;
  const goToKendaraan = () => router.push("/dashboard/kendaraan");

  return (
    <div className="fixed top-3 sm:top-4 inset-x-0 z-[100] flex flex-col items-center gap-2 px-16 sm:px-4 pointer-events-none">
      {/* Versi ringkas (HP): 1 baris kecil, tidak menutupi konten */}
      <div className="sm:hidden pointer-events-auto flex items-center gap-1.5 max-w-full">
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? "Bunyikan lagi" : "Bisukan"}
          className="w-8 h-8 rounded-full bg-white/95 shadow-md border border-zinc-200 flex items-center justify-center flex-shrink-0"
        >
          {muted ? <VolumeX className="w-4 h-4 text-zinc-400" /> : <Volume2 className="w-4 h-4 text-zinc-700" />}
        </button>
        <button
          type="button"
          onClick={goToKendaraan}
          className="min-w-0 flex items-center gap-1.5 bg-white/95 backdrop-blur-sm shadow-md border border-zinc-200 rounded-full pl-1.5 pr-3 py-1"
        >
          <span className="w-6 h-6 rounded-full bg-zinc-900 text-white flex items-center justify-center flex-shrink-0">
            <Car className="w-3.5 h-3.5" />
          </span>
          <span className="truncate text-[11px] font-bold text-zinc-800">{compactLabel}</span>
        </button>
      </div>

      {/* Kontrol mute (desktop) — card tetap tampil saat di-mute */}
      <div className="hidden sm:flex pointer-events-auto items-center gap-2 bg-white/95 backdrop-blur-sm shadow-md border border-zinc-200 rounded-full px-3 py-1.5">
        <button
          type="button"
          onClick={toggleMute}
          title={muted ? "Bunyikan lagi" : "Bisukan"}
          className="w-6 h-6 rounded-full flex items-center justify-center text-zinc-500 hover:bg-zinc-100 transition flex-shrink-0"
        >
          {muted ? <VolumeX className="w-4 h-4 text-zinc-400" /> : <Volume2 className="w-4 h-4 text-zinc-700" />}
        </button>
        <span className="text-[11px] font-bold text-zinc-700 whitespace-nowrap">{alerts.length} menunggu ACC</span>
        {muted && <span className="text-[10px] font-semibold text-zinc-400">Dibisukan</span>}
      </div>

      {/* Card penuh (desktop) */}
      {visible.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={goToKendaraan}
          title="Klik untuk membuka & meng-ACC pengajuan ini"
          className="hidden sm:block pointer-events-auto w-full max-w-sm text-left overflow-hidden rounded-2xl bg-white shadow-2xl shadow-black/15 border border-zinc-200 hover:-translate-y-0.5 transition-transform"
          style={{ animation: "vpnDropIn 0.35s cubic-bezier(0.16,1,0.3,1) both" }}
        >
          <div className="h-1 bg-gradient-to-r from-zinc-700 to-zinc-900" />
          <div className="p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-2xl bg-zinc-900 text-white flex items-center justify-center flex-shrink-0">
              <Bike className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider">
                Pengajuan Kendaraan Baru · Menunggu ACC
              </p>
              <p className="text-sm font-bold text-zinc-800 truncate mt-0.5">{a.vehicle_name}</p>
              <p className="text-xs text-zinc-500 truncate mt-0.5">
                {a.borrower_name}
                {a.borrower_role ? ` · ${a.borrower_role.replace(/_/g, " ")}` : ""}
              </p>
            </div>
          </div>
        </button>
      ))}

      {hiddenCount > 0 && (
        <p className="hidden sm:block pointer-events-none text-[11px] font-semibold text-zinc-500 bg-white/90 backdrop-blur px-2.5 py-1 rounded-full shadow-sm">
          +{hiddenCount} pengajuan lain menunggu ACC
        </p>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes vpnDropIn {
          from { opacity: 0; transform: translateY(-16px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}} />
    </div>
  );
}