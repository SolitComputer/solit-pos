"use client";

import React from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

// ─── SHARED STYLE TOKENS (samain dengan fitur Lembur) ───────────────────────
export const inp =
  "w-full h-11 border border-gray-200 rounded-xl px-4 text-[13px] text-gray-900 bg-white focus:outline-none focus:ring-[3px] focus:ring-zinc-900/[0.06] focus:border-zinc-400 transition-all duration-150 placeholder:text-gray-300 shadow-[0_1px_2px_rgba(0,0,0,0.03)]";
export const lbl = "text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2";
export const primaryBtn =
  "flex-1 h-11 bg-gradient-to-b from-zinc-800 to-zinc-950 hover:from-zinc-700 hover:to-zinc-900 text-white rounded-xl text-[12.5px] font-semibold transition-all duration-150 active:scale-[0.97] flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 shadow-lg shadow-zinc-900/25 ring-1 ring-inset ring-white/10 hover:shadow-xl hover:shadow-zinc-900/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2";
export const secondaryBtn =
  "flex-1 h-11 bg-white border border-gray-200 text-gray-600 rounded-xl text-[12.5px] font-semibold hover:bg-gray-50 hover:border-gray-300 hover:text-gray-800 transition-all duration-150 active:scale-[0.97] flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2";
export const dangerBtn =
  "flex-1 h-11 bg-gradient-to-b from-red-500 to-red-600 hover:from-red-500 hover:to-red-700 text-white rounded-xl text-[12.5px] font-semibold transition-all duration-150 active:scale-[0.97] flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 shadow-lg shadow-red-500/25 ring-1 ring-inset ring-white/10 hover:shadow-xl hover:shadow-red-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2";

export function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-3 bg-red-50/80 border border-red-100 text-red-700 text-[12.5px] px-4 py-3 rounded-2xl">
      <span className="w-6 h-6 rounded-lg bg-red-100 text-red-500 flex items-center justify-center shrink-0">
        <AlertTriangle size={13} />
      </span>
      <span className="font-medium leading-relaxed pt-0.5">{msg}</span>
    </div>
  );
}

export function Spinner() {
  return <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />;
}

// Pill statistik kecil untuk hero (jumlah kendaraan per status).
// `icon` opsional & backward-compatible — pemanggilan lama tanpa icon tetap jalan (fallback ke dot).
export function StatPill({
  label,
  count,
  tone,
  icon,
}: {
  label: string;
  count: number;
  tone: "emerald" | "zinc" | "amber";
  icon?: React.ReactNode;
}) {
  const dot: Record<string, string> = {
    emerald: "bg-emerald-400",
    zinc: "bg-zinc-400",
    amber: "bg-amber-400",
  };
  const iconTone: Record<string, string> = {
    emerald: "text-emerald-300",
    zinc: "text-zinc-300",
    amber: "text-amber-300",
  };
  return (
    <span className="inline-flex items-center gap-1.5 bg-white/[0.06] border border-white/10 rounded-full pl-2 pr-3 py-1.5 text-[11px] font-semibold text-zinc-200 backdrop-blur-sm transition-colors hover:bg-white/10">
      {icon ? (
        <span className={iconTone[tone]}>{icon}</span>
      ) : (
        <span className={`w-1.5 h-1.5 rounded-full ${dot[tone]}`} />
      )}
      <span className="tabular-nums text-white">{count}</span>
      <span className="text-zinc-400 font-medium">{label}</span>
    </span>
  );
}

// Info kecil "disetujui oleh admin X" — dipakai di kartu kendaraan
export function ApprovedByNote({ name }: { name?: string | null }) {
  if (!name) return null;
  return (
    <div className="text-[10.5px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5 font-semibold flex items-center gap-1.5">
      <CheckCircle2 size={13} className="text-emerald-500 shrink-0" /> Disetujui oleh: {name}
    </div>
  );
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
      style={{ background: "rgba(9,9,11,0.5)", backdropFilter: "blur(8px)" }}
      onClick={preventClose ? undefined : onClose}
    >
      <div
        className={`w-full ${wide ? "sm:max-w-lg" : "sm:max-w-md"} max-h-[92vh] sm:max-h-[85vh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl shadow-black/30 border border-gray-100/80`}
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
  icon: React.ReactNode;
  title: string;
  sub?: string;
  onClose: () => void;
  noClose?: boolean;
}) {
  return (
    <div className="px-5 pt-4 pb-4 border-b border-gray-100 flex items-start gap-3">
      <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-100 flex items-center justify-center text-gray-600 flex-shrink-0 shadow-sm">
        {icon}
      </div>
      <div className="flex-1 min-w-0 pt-1">
        <h2 className="text-[13.5px] font-bold text-gray-900 leading-tight tracking-tight">{title}</h2>
        {sub && <p className="text-[10.5px] text-gray-400 mt-0.5 truncate">{sub}</p>}
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
  return (
    <div
      className="px-5 py-4 border-t border-gray-100 bg-gray-50/60 flex gap-2.5"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      {children}
    </div>
  );
}

// ─── CONFIRM MODAL (baru) ─────────────────────────────────────────────────────
// Modal konfirmasi generik "Ya / Tidak" — dipakai untuk aksi cepat yang tidak
// butuh form, mis. tolak pengajuan kendaraan tanpa alasan wajib.
export function ConfirmModal({
  icon,
  title,
  message,
  confirmLabel = "Ya",
  cancelLabel = "Tidak",
  tone = "default",
  busy,
  onConfirm,
  onCancel,
}: {
  icon?: React.ReactNode;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isDanger = tone === "danger";
  return (
    <ModalWrapper onClose={onCancel} preventClose={busy}>
      <div className="px-6 pt-7 pb-5 flex flex-col items-center text-center">
        <div
          className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ring-8 ${
            isDanger
              ? "bg-red-50 text-red-500 ring-red-50/60"
              : "bg-zinc-100 text-zinc-700 ring-zinc-50"
          }`}
        >
          {icon ?? <AlertTriangle size={22} />}
        </div>
        <h2 className="text-[15px] font-black text-gray-900 tracking-tight">{title}</h2>
        <div className="text-[12.5px] text-gray-500 leading-relaxed mt-2 max-w-xs">{message}</div>
      </div>
      <ModalFoot>
        <button onClick={onCancel} disabled={busy} className={secondaryBtn}>
          {cancelLabel}
        </button>
        <button onClick={onConfirm} disabled={busy} className={isDanger ? dangerBtn : primaryBtn}>
          {busy ? <Spinner /> : confirmLabel}
        </button>
      </ModalFoot>
    </ModalWrapper>
  );
}

// Empty state konsisten: ikon lembut + teks
export function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <span className="w-12 h-12 rounded-2xl bg-gray-50 border border-gray-100 text-gray-300 flex items-center justify-center">
        {icon}
      </span>
      <p className="text-[11.5px] text-gray-400 max-w-[220px] leading-relaxed">{text}</p>
    </div>
  );
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
    TERSEDIA: "bg-emerald-50 text-emerald-700 border-emerald-100",
    DIPAKAI: "bg-zinc-100 text-zinc-600 border-zinc-200",
    MAINTENANCE: "bg-amber-50 text-amber-700 border-amber-100",
  };
  const dot: Record<string, string> = {
    TERSEDIA: "bg-emerald-500",
    DIPAKAI: "bg-zinc-400",
    MAINTENANCE: "bg-amber-500",
  };
  const label: Record<string, string> = { TERSEDIA: "Tersedia", DIPAKAI: "Dipakai", MAINTENANCE: "Maintenance" };
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-lg border ${
        map[status] ?? "bg-gray-50 text-gray-600 border-gray-200"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot[status] ?? "bg-gray-400"}`} />
      {label[status] ?? status}
    </span>
  );
}

// Badge status pengajuan
export function RequestStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING: "bg-amber-50 text-amber-700 border-amber-100",
    APPROVED: "bg-zinc-100 text-zinc-600 border-zinc-200",
    REJECTED: "bg-red-50 text-red-600 border-red-100",
    COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-100",
  };
  const label: Record<string, string> = {
    PENDING: "Menunggu ACC",
    APPROVED: "Sedang Dipakai",
    REJECTED: "Ditolak",
    COMPLETED: "Selesai",
  };
  return (
    <span className={`text-[9px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-lg border ${map[status] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
      {label[status] ?? status}
    </span>
  );
}