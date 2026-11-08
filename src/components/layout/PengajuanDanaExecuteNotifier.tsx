"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Volume2, VolumeX, ChevronUp, ChevronDown } from "lucide-react";
import { usePengajuanDanaExecuteNotify } from "@/hooks/usePengajuanDanaExecuteNotify";

function formatRupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

const VISIBLE_LIMIT = 4;
const COLLAPSED_STORAGE_KEY = "pengajuan_dana_execute_notif_collapsed";

function loadCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(COLLAPSED_STORAGE_KEY) === "1"; } catch { return false; }
}
function saveCollapsed(value: boolean) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(COLLAPSED_STORAGE_KEY, value ? "1" : "0"); } catch {}
}

interface PengajuanDanaExecuteNotifierProps {
  /** ID user yang sedang login — dipakai untuk cek apakah dia ada di daftar
   *  eksekutor (meta.executorIds). Bisa null selagi auth user masih loading. */
  userId: string | null;
}

export default function PengajuanDanaExecuteNotifier({ userId }: PengajuanDanaExecuteNotifierProps) {
  const router = useRouter();
  const [executorIds, setExecutorIds] = useState<string[] | null>(null);

  // Ambil daftar eksekutor dari meta API — sumber yang sama dengan modal
  // "Akses Eksekusi" di page.tsx. Refresh tiap 5 menit supaya kalau ADMIN
  // ganti akses di modal, notifier ikut update tanpa reload.
  useEffect(() => {
    if (!userId) return;
    let aborted = false;

    const fetchExecutors = async () => {
      try {
        const res = await fetch("/api/pengajuan-dana", { cache: "no-store" });
        const json = await res.json();
        if (!aborted && json.success && json.meta?.executorIds) {
          setExecutorIds(json.meta.executorIds);
        }
      } catch {}
    };

    fetchExecutors();
    const t = setInterval(fetchExecutors, 5 * 60_000);
    return () => { aborted = true; clearInterval(t); };
  }, [userId]);

  const canExecute = !!userId && !!executorIds && executorIds.includes(userId);
  const { alerts, muted, volume, toggleMute, setVolume } = usePengajuanDanaExecuteNotify(canExecute);

  const [collapsed, setCollapsed] = useState<boolean>(() => loadCollapsed());
  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      saveCollapsed(next);
      return next;
    });
  };

  if (!canExecute || alerts.length === 0) return null;

  const visible = alerts.slice(0, VISIBLE_LIMIT);
  const hiddenCount = alerts.length - visible.length;
  const totalAmount = alerts.reduce((sum, a) => sum + a.amount, 0);
  const compactLabel =
    alerts.length === 1
      ? `${alerts[0].requester_name} · siap dieksekusi`
      : `${alerts.length} pengajuan siap dieksekusi`;

  // Offset top lebih dalam (top-20 di HP, top-24 di desktop) supaya kalau user
  // adalah ADMIN whitelist SEKALIGUS eksekutor, notif ini tidak menimpa
  // <PengajuanDanaNotifier /> yang nangkring di top-3/top-4.
  // z-[99] sengaja 1 tingkat di bawah notif ACC (z-[100]).
  return (
    <div className="fixed top-20 sm:top-24 inset-x-0 z-[99] flex flex-col items-center gap-2 px-16 sm:px-4 pointer-events-none">
      {/* HP: 1 baris ringkas */}
      <div className="sm:hidden pointer-events-auto flex items-center gap-1.5 max-w-full">
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? "Bunyikan lagi" : "Bisukan sementara"}
          className="w-8 h-8 rounded-full bg-white/95 shadow-md border border-slate-200 flex items-center justify-center flex-shrink-0"
        >
          {muted ? <VolumeX className="w-4 h-4 text-slate-400" /> : <Volume2 className="w-4 h-4 text-blue-600" />}
        </button>
        <button
          type="button"
          onClick={() => router.push("/dashboard/pengajuan-dana")}
          className="min-w-0 flex items-center gap-1.5 bg-white/95 backdrop-blur-sm shadow-md border border-blue-100 rounded-full pl-1.5 pr-3 py-1"
        >
          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
            <Banknote className="w-3.5 h-3.5" />
          </span>
          <span className="truncate text-[11px] font-bold text-slate-800">{compactLabel}</span>
          <span className="text-[11px] font-extrabold text-blue-600 whitespace-nowrap">
            {formatRupiah(totalAmount)}
          </span>
        </button>
      </div>

      {/* Desktop: kontrol mute + volume + collapse */}
      <div className="hidden sm:flex pointer-events-auto items-center gap-2 bg-white/95 backdrop-blur-sm shadow-md border border-slate-200 rounded-full px-3 py-1.5">
        <button
          type="button"
          onClick={toggleMute}
          title={muted ? "Bunyikan lagi" : "Bisukan sementara"}
          className="w-6 h-6 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 transition flex-shrink-0"
        >
          {muted ? <VolumeX className="w-4 h-4 text-slate-400" /> : <Volume2 className="w-4 h-4 text-blue-600" />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          disabled={muted}
          onChange={(e) => setVolume(Number(e.target.value))}
          aria-label="Volume notifikasi Eksekusi Pengajuan Dana"
          className="w-20 accent-blue-600 disabled:opacity-40"
        />
        {muted && <span className="text-[10px] font-semibold text-slate-400 whitespace-nowrap">Dibisukan</span>}

        <span className="w-px h-4 bg-slate-200 flex-shrink-0" />
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          title={collapsed ? "Tampilkan detail pengajuan" : "Sembunyikan daftar"}
          className="flex items-center gap-1 h-6 pl-2 pr-1.5 rounded-full text-blue-600 hover:bg-blue-50 transition flex-shrink-0"
        >
          <span className="text-[11px] font-extrabold tabular-nums">{alerts.length}</span>
          {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {!collapsed && visible.map((alert) => (
        <button
          key={alert.id}
          type="button"
          onClick={() => router.push("/dashboard/pengajuan-dana")}
          title="Klik untuk membuka & mengeksekusi pengajuan ini"
          className="hidden sm:block pointer-events-auto w-full max-w-sm text-left overflow-hidden rounded-2xl bg-white shadow-2xl shadow-black/15 border border-blue-100 hover:-translate-y-0.5 transition-transform"
          style={{ animation: "pdeDropIn 0.35s cubic-bezier(0.16,1,0.3,1) both" }}
        >
          <div className="h-1 bg-gradient-to-r from-blue-500 to-sky-500" />
          <div className="p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
              <Banknote className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">
                Sudah Di-ACC · Silakan Dieksekusi
              </p>
              <p className="text-sm font-bold text-slate-800 truncate mt-0.5">
                {alert.requester_name}
              </p>
              <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{alert.purpose}</p>
              <div className="flex items-center justify-between gap-2 mt-1">
                <p className="text-sm font-extrabold text-slate-900">
                  {formatRupiah(alert.amount)}
                </p>
                {alert.approved_by_name && (
                  <span className="text-[10px] text-slate-400 truncate">ACC: {alert.approved_by_name}</span>
                )}
              </div>
            </div>
          </div>
        </button>
      ))}

      {!collapsed && hiddenCount > 0 && (
        <p className="hidden sm:block pointer-events-none text-[11px] font-semibold text-slate-500 bg-white/90 backdrop-blur px-2.5 py-1 rounded-full shadow-sm">
          +{hiddenCount} pengajuan lain siap dieksekusi
        </p>
      )}

      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes pdeDropIn {
          from { opacity: 0; transform: translateY(-16px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}} />
    </div>
  );
}