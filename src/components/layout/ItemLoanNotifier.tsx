// src/components/layout/ItemLoanNotifier.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HandHelping, Volume2, VolumeX, ChevronUp, ChevronDown } from "lucide-react";
import { useItemLoanNotify } from "@/hooks/useItemLoanNotify";
import { hasAnyRole, UserRole } from "@/lib/permissions";

const VISIBLE_LIMIT = 4;

// Hanya role ini yang DENGAR/LIHAT notif peminjaman — ADMIN & PROGRAMMER sengaja TIDAK.
// Hak ACC tetap pakai ITEM_LOAN_APPROVE_ROLES di halaman & API; ini khusus notif.
const NOTIFY_ROLES: UserRole[] = ["KEPALA_ADMIN_BARANG", "ADMIN_BARANG"];
const COLLAPSED_STORAGE_KEY = "item_loan_notif_collapsed";

function loadCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(COLLAPSED_STORAGE_KEY) === "1"; } catch { return false; }
}
function saveCollapsed(value: boolean) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(COLLAPSED_STORAGE_KEY, value ? "1" : "0"); } catch {}
}

interface ItemLoanNotifierProps {
  userRoles: string[];
  userId: string | null;
}

export default function ItemLoanNotifier({ userRoles }: ItemLoanNotifierProps) {
  const router = useRouter();
  // Target notif = role yang boleh ACC peminjaman (ITEM_LOAN_APPROVE_ROLES).
  const canReceiveNotif = hasAnyRole(userRoles as UserRole[], NOTIFY_ROLES);
  const { alerts, muted, volume, toggleMute, setVolume } = useItemLoanNotify(canReceiveNotif);

  const [collapsed, setCollapsed] = useState<boolean>(() => loadCollapsed());
  const toggleCollapsed = () => {
    setCollapsed((prev) => { const next = !prev; saveCollapsed(next); return next; });
  };

  if (!canReceiveNotif || alerts.length === 0) return null;

  const visible = alerts.slice(0, VISIBLE_LIMIT);
  const hiddenCount = alerts.length - visible.length;
  const compactLabel =
    alerts.length === 1
      ? `${alerts[0].borrower_name} · ${alerts[0].item_name}`
      : `${alerts.length} pinjaman menunggu`;

  return (
    <div className="fixed top-20 sm:top-24 inset-x-0 z-[99] flex flex-col items-center gap-2 px-16 sm:px-4 pointer-events-none">
      {/* Versi ringkas HP */}
      <div className="sm:hidden pointer-events-auto flex items-center gap-1.5 max-w-full">
        <button type="button" onClick={toggleMute} aria-label={muted ? "Bunyikan lagi" : "Bisukan sementara"}
          className="w-8 h-8 rounded-full bg-white/95 shadow-md border border-slate-200 flex items-center justify-center flex-shrink-0">
          {muted ? <VolumeX className="w-4 h-4 text-slate-400" /> : <Volume2 className="w-4 h-4 text-amber-600" />}
        </button>
        <button type="button" onClick={() => router.push("/dashboard/item-loans")}
          className="min-w-0 flex items-center gap-1.5 bg-white/95 backdrop-blur-sm shadow-md border border-amber-100 rounded-full pl-1.5 pr-3 py-1">
          <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0">
            <HandHelping className="w-3.5 h-3.5" />
          </span>
          <span className="truncate text-[11px] font-bold text-slate-800">{compactLabel}</span>
        </button>
      </div>

      {/* Kontrol mute & volume */}
      <div className="hidden sm:flex pointer-events-auto items-center gap-2 bg-white/95 backdrop-blur-sm shadow-md border border-slate-200 rounded-full px-3 py-1.5">
        <button type="button" onClick={toggleMute} title={muted ? "Bunyikan lagi" : "Bisukan sementara"}
          className="w-6 h-6 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 transition flex-shrink-0">
          {muted ? <VolumeX className="w-4 h-4 text-slate-400" /> : <Volume2 className="w-4 h-4 text-amber-600" />}
        </button>
        <input type="range" min={0} max={1} step={0.05} value={volume} disabled={muted}
          onChange={(e) => setVolume(Number(e.target.value))} aria-label="Volume notifikasi Peminjaman"
          className="w-20 accent-amber-600 disabled:opacity-40" />
        {muted && <span className="text-[10px] font-semibold text-slate-400 whitespace-nowrap">Dibisukan</span>}
        <span className="w-px h-4 bg-slate-200 flex-shrink-0" />
        <button type="button" onClick={toggleCollapsed} aria-expanded={!collapsed}
          title={collapsed ? "Tampilkan detail pinjaman" : "Sembunyikan daftar"}
          className="flex items-center gap-1 h-6 pl-2 pr-1.5 rounded-full text-amber-600 hover:bg-amber-50 transition flex-shrink-0">
          <span className="text-[11px] font-extrabold tabular-nums">{alerts.length}</span>
          {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {!collapsed && visible.map((alert) => (
        <button key={alert.id} type="button" onClick={() => router.push("/dashboard/item-loans")}
          title="Klik untuk membuka & menyetujui pinjaman ini"
          className="hidden sm:block pointer-events-auto w-full max-w-sm text-left overflow-hidden rounded-2xl bg-white shadow-2xl shadow-black/15 border border-amber-100 hover:-translate-y-0.5 transition-transform"
          style={{ animation: "ilnDropIn 0.35s cubic-bezier(0.16,1,0.3,1) both" }}>
          <div className="h-1 bg-gradient-to-r from-amber-500 to-orange-600" />
          <div className="p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0">
              <HandHelping className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">Peminjaman Baru · Menunggu Persetujuan</p>
              <p className="text-sm font-bold text-slate-800 truncate mt-0.5">{alert.borrower_name}</p>
              <p className="text-xs text-slate-500 truncate mt-0.5">
                {alert.item_name}{alert.serial_number ? ` · ${alert.serial_number}` : ""}
              </p>
              <span className={`inline-flex mt-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold border ${alert.category === "PESANAN" ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-sky-50 text-sky-700 border-sky-200"}`}>
                {alert.category === "PESANAN" ? "Pesanan" : "Kebutuhan"}
              </span>
            </div>
          </div>
        </button>
      ))}

      {!collapsed && hiddenCount > 0 && (
        <p className="hidden sm:block pointer-events-none text-[11px] font-semibold text-slate-500 bg-white/90 backdrop-blur px-2.5 py-1 rounded-full shadow-sm">
          +{hiddenCount} pinjaman lain menunggu persetujuan
        </p>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes ilnDropIn {
          from { opacity: 0; transform: translateY(-16px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}} />
    </div>
  );
}