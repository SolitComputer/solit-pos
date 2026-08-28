"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";

// ─── SHARED STYLE TOKENS (samain dengan fitur Lembur) ───────────────────────
export const inp =
  "w-full h-10 border border-gray-200 rounded-xl px-3.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all placeholder:text-gray-300";
export const lbl = "text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5";
export const primaryBtn =
  "flex-1 h-10 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-semibold transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-violet-200";
export const secondaryBtn =
  "flex-1 h-10 bg-white border border-gray-200 text-gray-600 rounded-xl text-xs font-semibold hover:bg-gray-50 transition-all active:scale-[0.98] flex items-center justify-center";
export const dangerBtn =
  "flex-1 h-10 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-red-200";

export function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 text-xs px-3.5 py-3 rounded-xl">
      <AlertTriangle size={14} className="flex-shrink-0 mt-px" />
      <span className="font-medium leading-relaxed">{msg}</span>
    </div>
  );
}

export function Spinner() {
  return <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />;
}

// ─── MODAL SHELL ─────────────────────────────────────────────────────────────
export function ModalWrapper({
  children,
  onClose,
  preventClose,
  wide,
}: {
  children: React.ReactNode;
  onClose: () => void;
  preventClose?: boolean;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(6px)" }}
      onClick={preventClose ? undefined : onClose}
    >
      <div
        className={`w-full ${wide ? "sm:max-w-lg" : "sm:max-w-md"} bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden border border-gray-100/80`}
        style={{ animation: "modalUp 0.28s cubic-bezier(0.22,1,0.36,1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-0 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>
        {children}
      </div>
    </div>
  );
}

export function ModalHead({
  icon,
  title,
  sub,
  onClose,
  noClose,
}: {
  icon: string;
  title: string;
  sub?: string;
  onClose: () => void;
  noClose?: boolean;
}) {
  return (
    <div className="px-5 pt-3 pb-4 border-b border-gray-100 flex items-start gap-3">
      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-100 flex items-center justify-center text-base flex-shrink-0 shadow-sm">
        {icon}
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <h2 className="text-sm font-bold text-gray-900 leading-tight">{title}</h2>
        {sub && <p className="text-[10px] text-gray-400 mt-0.5 truncate">{sub}</p>}
      </div>
      <button
        onClick={onClose}
        disabled={noClose}
        className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all mt-0.5 ${
          noClose ? "text-gray-200 cursor-not-allowed" : "text-gray-400 hover:text-gray-700 hover:bg-gray-100 active:scale-95"
        }`}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export function ModalFoot({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/60 flex gap-2.5">{children}</div>;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null || minutes < 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} mnt`;
  if (m === 0) return `${h} jam`;
  return `${h} jam ${m} mnt`;
}

// Durasi live dari waktu mulai sampai sekarang (untuk list "Sedang Berjalan")
export function liveDurationMinutes(startIso: string | null | undefined, nowMs: number): number {
  if (!startIso) return 0;
  return Math.max(0, Math.round((nowMs - new Date(startIso).getTime()) / 60000));
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Badge status kendaraan
export function VehicleStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    TERSEDIA: "bg-emerald-50 text-emerald-700 border-emerald-200",
    DIPAKAI: "bg-violet-50 text-violet-700 border-violet-200",
    MAINTENANCE: "bg-amber-50 text-amber-700 border-amber-200",
  };
  const label: Record<string, string> = { TERSEDIA: "Tersedia", DIPAKAI: "Dipakai", MAINTENANCE: "Maintenance" };
  return (
    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg border ${map[status] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
      {label[status] ?? status}
    </span>
  );
}

// Badge status pengajuan
export function RequestStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING: "bg-amber-50 text-amber-700 border-amber-200",
    APPROVED: "bg-violet-50 text-violet-700 border-violet-200",
    REJECTED: "bg-red-50 text-red-600 border-red-200",
    COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  const label: Record<string, string> = {
    PENDING: "Menunggu ACC",
    APPROVED: "Sedang Dipakai",
    REJECTED: "Ditolak",
    COMPLETED: "Selesai",
  };
  return (
    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg border ${map[status] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
      {label[status] ?? status}
    </span>
  );
}
