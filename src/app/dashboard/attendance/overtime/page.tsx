"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getCurrentUserClient } from "@/lib/auth-client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Plus, Clock, CalendarDays, FileText, Loader2, CheckCircle2, AlertTriangle, Camera, Inbox, Pencil, Play, Check, X, Ban, ClipboardList, Circle, HelpCircle, Trophy, type LucideIcon } from "lucide-react";
import { OvertimeTable, type OvertimeTableRow } from "@/components/attendance/OvertimeTable"; // ✅ NEW poin 15
import { OvertimeFillDetailModal } from "@/components/attendance/OvertimeFillDetailModal"; // ✅ NEW
import { OvertimeSOPBanner } from "@/components/attendance/OvertimeSOPBanner";
import { useOvertimeNotify } from "@/hooks/useOvertimeNotify"; 
import { OvertimePendingPopup } from "@/components/attendance/OvertimePendingPopup";
import { OvertimeRecapTable } from "@/components/attendance/OvertimeRecapTable"; // ✅ NEW — rekap bulanan

type OvertimeRequest = {
  id: string; user_id: string; request_date: string;
  scheduled_start: string | null; scheduled_end: string | null;
  actual_start: string | null; actual_end: string | null;
  work_description: string | null; proof_photo_url: string | null;
  status: "PENDING" | "APPROVED" | "ONGOING" | "COMPLETED" | "REJECTED" | "CANCELLED" | "NEED_PROOF";
  rate_per_hour: number | null; total_pay: number | null; auto_completed: boolean;
  created_at: string; reason?: string; requested_start?: string;
  completed_at?: string; rejection_note?: string; approved_at?: string;
  is_holiday?: boolean;
  is_late?: boolean;
  users?: { id: string; name: string; role: string };
  approver?: { id: string; name: string; role: string } | null;
};
type User = { id: string; name: string; role: string };

const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const FULL_ACCESS_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"] as const;
const PAYABLE_OVERTIME_STATUSES = ["COMPLETED", "NEED_PROOF"] as const;
const DIVISION_HEAD_ROLES = ["KEPALA_SALES", "KEPALA_MARKETING", "KEPALA_TEKNISI", "KEPALA_ONPOINT", "KEPALA_PENYEDIA_BARANG", "KEPALA_SOTECH", "KEPALA_PENGELOLA_BARANG"] as const;
const PAY_VIEW_ROLES = ["KEPALA_SALES", "KEPALA_MARKETING", "KEPALA_TEKNISI", "KEPALA_PENYEDIA_BARANG", "ADMIN", "PROGRAMMER", "ASISTEN_CEO", "KEPALA_ONPOINT", "KEPALA_SOTECH", "KEPALA_PENGELOLA_BARANG"] as const;

const DIVISION_HEAD_MAP: Record<string, string[]> = {
  KEPALA_SALES: ["CREW_SALES", "SOTECH", "PENGANTARAN", "KEPALA_SALES", "PKL_SALES", "PKL", "PKL_PENGANTARAN"],
  KEPALA_MARKETING: ["MARKETING", "KONTEN", "KEPALA_MARKETING", "PKL_MARKETING", "PKL_KONTEN", "PKL"],
  KEPALA_TEKNISI: ["TEKNISI", "PENGELOLA_BARANG", "CUSTOMER_SERVICE", "KEPALA_TEKNISI", "PKL_TEKNISI", "PKL_CUSTOMER_SERVICE", "PKL"],
  KEPALA_ONPOINT: ["ONPOINT", "KEPALA_ONPOINT", "PKL_ONPOINT", "PKL"],
  KEPALA_PENYEDIA_BARANG: ["PENYEDIA_BARANG", "PENGELOLA_BARANG", "KEPALA_PENYEDIA_BARANG", "PKL_PENYEDIA_BARANG", "PKL"],
  KEPALA_SOTECH: ["SOTECH", "KEPALA_SOTECH", "PKL_SOTECH", "PKL"],
  KEPALA_PENGELOLA_BARANG: ["PENGELOLA_BARANG", "TEKNISI", "CUSTOMER_SERVICE", "KEPALA_PENGELOLA_BARANG", "PKL_PENGELOLA_BARANG", "PKL_TEKNISI", "PKL_CUSTOMER_SERVICE", "PKL"],
};

function canViewPay(roles?: string | string[]): boolean {
  const arr = Array.isArray(roles) ? roles : roles ? [roles] : [];
  return arr.some(r => (PAY_VIEW_ROLES as readonly string[]).includes(r));
}

function isAdminRole(roles?: string | string[]): boolean {
  const arr = Array.isArray(roles) ? roles : roles ? [roles] : [];
  return arr.some(r => (FULL_ACCESS_ROLES as readonly string[]).includes(r));
}

function canSetPay(roles?: string | string[]): boolean {
  const arr = Array.isArray(roles) ? roles : roles ? [roles] : [];
  return arr.some(r => (FULL_ACCESS_ROLES as readonly string[]).includes(r));
}

function canInputManual(roles?: string | string[]): boolean {
  const arr = Array.isArray(roles) ? roles : roles ? [roles] : [];
  if (arr.length === 0) return false;
  if (arr.some(r => (FULL_ACCESS_ROLES as readonly string[]).includes(r))) return true;
  return arr.some(r => Object.keys(DIVISION_HEAD_MAP).includes(r));
}

function isUserPKL(role: string): boolean {
  return role === "PKL" || role.startsWith("PKL_");
}

function getManualAllowedRoles(roles?: string | string[]): string[] | null {
  const arr = Array.isArray(roles) ? roles : roles ? [roles] : [];
  if (arr.length === 0) return [];
  if (arr.some(r => (FULL_ACCESS_ROLES as readonly string[]).includes(r))) return null;
  const merged = new Set<string>();
  for (const role of arr) {
    const subordinates = DIVISION_HEAD_MAP[role];
    if (subordinates) subordinates.forEach(s => merged.add(s));
  }
  return merged.size > 0 ? Array.from(merged) : [];
}

function canApproveTarget(approverRoles?: string | string[], targetRole?: string): boolean {
  const arr = Array.isArray(approverRoles) ? approverRoles : approverRoles ? [approverRoles] : [];
  if (arr.length === 0 || !targetRole) return false;
  if (isAdminRole(arr)) return true;
  return arr.some(r => DIVISION_HEAD_MAP[r]?.includes(targetRole));
}

function formatRupiah(n: number) { return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n); }
function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  if (iso.includes(":") && !iso.includes("T")) return iso.substring(0, 5);
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
}
function toWIBDateKey(iso: string) { return new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10); }
function initials(name: string) { return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase(); }
function pad2(n: number) { return String(n).padStart(2, "0"); }
function addDaysToDateStr(dateStr: string, days: number): string {
  //  FIX: parse manual tanpa Date object biar gak kena masalah timezone.
  // Pakai UTC explicit supaya .toISOString() konsisten dengan input.
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function calcDuration(start: string | null, end: string | null): string {
  if (!start || !end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms <= 0) return "—";
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return m > 0 ? `${h}j ${m}m` : `${h} jam`;
}

function detectLateFromTime(timeStr: string | null | undefined): boolean {
  if (!timeStr) return false;
  const LATE_THRESHOLD = 8 * 60;
  let totalMin: number;
  if (timeStr.includes("T")) {
    const w = new Date(new Date(timeStr).getTime() + 7 * 60 * 60 * 1000);
    totalMin = w.getUTCHours() * 60 + w.getUTCMinutes();
  } else {
    const [h, m] = timeStr.split(":").map(Number);
    if (Number.isNaN(h)) return false;
    totalMin = h * 60 + (m || 0);
  }
  return totalMin >= LATE_THRESHOLD;
}

function addWatermarkToImage(imageDataUrl: string, callback: (blob: Blob, url: string) => void) {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    const txt = `${now.getUTCDate()}-${months[now.getUTCMonth()]}-${now.getUTCFullYear()} (${days[now.getUTCDay()]}) \u2022 ${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")} WIB`;
    const pad = 12, fs = Math.max(16, canvas.width / 40);
    ctx.font = `bold ${fs}px Arial`;
    const tw = ctx.measureText(txt).width;
    const bx = pad, by = canvas.height - fs - pad - 10, bw = tw + pad * 2, bh = fs + pad;
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 2; ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = "white"; ctx.textBaseline = "middle"; ctx.fillText(txt, bx + pad, by + bh / 2);
    canvas.toBlob(blob => { if (blob) callback(blob, URL.createObjectURL(blob)); }, "image/jpeg", 0.95);
  };
  img.onerror = () => console.error("Failed to load image"); img.src = imageDataUrl;
}

// ─── STATUS CONFIG ─────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; icon: LucideIcon; bg: string; text: string; border: string; dot: string }> = {
  PENDING: { label: "Pending", icon: Clock, bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-400" },
  APPROVED: { label: "Disetujui", icon: CheckCircle2, bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200", dot: "bg-violet-500" },
  ONGOING: { label: "Berjalan", icon: Play, bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
  COMPLETED: { label: "Selesai", icon: Check, bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", dot: "bg-blue-500" },
  NEED_PROOF: { label: "Upload Foto", icon: Camera, bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", dot: "bg-orange-500" },
  REJECTED: { label: "Ditolak", icon: X, bg: "bg-red-50", text: "text-red-700", border: "border-red-200", dot: "bg-red-500" },
  CANCELLED: { label: "Dibatalkan", icon: Ban, bg: "bg-gray-50", text: "text-gray-500", border: "border-gray-200", dot: "bg-gray-400" },
};

function StatusBadge({ status }: { status: OvertimeRequest["status"] }) {
  const c = STATUS_CONFIG[status] ?? { label: status, icon: HelpCircle, bg: "bg-gray-50", text: "text-gray-600", border: "border-gray-200", dot: "bg-gray-400" };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md border ${c.bg} ${c.text} ${c.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.dot}`} />{c.label}
    </span>
  );
}

const AV_COLORS = [
  "bg-violet-100 text-violet-700", "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700", "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-700", "bg-cyan-100 text-cyan-700", "bg-purple-100 text-purple-700"
];
function avBg(name: string) { let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff; return AV_COLORS[Math.abs(h) % AV_COLORS.length]; }

// ─── SHARED STYLE TOKENS ───────────────────────────────────────────────────
const inp = "w-full h-10 border border-gray-200 rounded-xl px-3.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all placeholder:text-gray-300";
const lbl = "text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5";
const primaryBtn = "flex-1 h-10 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-semibold transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-violet-200";
const secondaryBtn = "flex-1 h-10 bg-white border border-gray-200 text-gray-600 rounded-xl text-xs font-semibold hover:bg-gray-50 transition-all active:scale-[0.98] flex items-center justify-center";

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 text-xs px-3.5 py-3 rounded-xl">
      <AlertTriangle size={14} className="flex-shrink-0 mt-px" />
      <span className="font-medium leading-relaxed">{msg}</span>
    </div>
  );
}
function Spinner() { return <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />; }

// ─── MODAL SHELL ───────────────────────────────────────────────────────────
function ModalWrapper({ children, onClose, preventClose, wide }: { children: React.ReactNode; onClose: () => void; preventClose?: boolean; wide?: boolean }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(6px)" }}
      onClick={preventClose ? undefined : onClose}
    >
      <div
        className={`w-full ${wide ? "sm:max-w-lg" : "sm:max-w-md"} bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden border border-gray-100/80`}
        style={{ animation: "modalUp 0.28s cubic-bezier(0.22,1,0.36,1)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-0 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalHead({ icon, title, sub, onClose, noClose }: { icon: string; title: string; sub?: string; onClose: () => void; noClose?: boolean }) {
  return (
    <div className="px-5 pt-3 pb-4 border-b border-gray-100 flex items-start gap-3">
      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-100 flex items-center justify-center text-base flex-shrink-0 shadow-sm">{icon}</div>
      <div className="flex-1 min-w-0 pt-0.5">
        <h2 className="text-sm font-bold text-gray-900 leading-tight">{title}</h2>
        {sub && <p className="text-[10px] text-gray-400 mt-0.5 truncate">{sub}</p>}
      </div>
      <button
        onClick={onClose} disabled={noClose}
        className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all mt-0.5 ${noClose ? "text-gray-200 cursor-not-allowed" : "text-gray-400 hover:text-gray-700 hover:bg-gray-100 active:scale-95"}`}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
  );
}
function ModalFoot({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/60 flex gap-2.5">{children}</div>;
}

function OvertimeDetailModal({ overtime: o, onClose, userCanViewPay, currentUser, onApprove, onReject, onComplete, onSetPay, onProofPhoto, onEdit, onDelete }: {
  overtime: OvertimeRequest; onClose: () => void; userCanViewPay: boolean; currentUser: any;
  onApprove: () => void; onReject: () => void; onComplete: () => void; onSetPay: () => void; onProofPhoto: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const dateStr = new Date(o.request_date + "T12:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const duration = calcDuration(o.actual_start ?? o.scheduled_start, o.actual_end ?? o.scheduled_end);
  return (
    <ModalWrapper onClose={onClose} wide>
      <ModalHead icon="" title="Detail Lemburan" sub={`${o.users?.name} · ${dateStr}`} onClose={onClose} />
      <div className="px-5 py-4 space-y-3.5 max-h-[72vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 flex-wrap">
            <StatusBadge status={o.status} />
            {(o.is_late === true || (o.is_late == null && o.is_holiday && detectLateFromTime(o.requested_start ?? o.actual_start ?? o.scheduled_start))) && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md border bg-amber-50 text-amber-700 border-amber-200">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" /> Terlambat
              </span>
            )}
            {o.is_holiday && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md border bg-purple-50 text-purple-700 border-purple-200">
                Hari Libur
              </span>
            )}
          </div>
          <span className="text-[10px] text-gray-400">{new Date(o.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[["Mulai", formatTime(o.actual_start ?? o.scheduled_start)], ["Selesai", formatTime(o.actual_end ?? o.scheduled_end)], ["Durasi", duration]].map(([k, v]) => (
            <div key={k} className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-center">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">{k}</p>
              <p className="font-bold text-gray-800 text-xs font-mono">{v}</p>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3.5">
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Alasan</p>
            <p className="text-xs text-gray-800">{o.reason || "—"}</p>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3.5">
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Rincian Pekerjaan</p>
            <p className="text-xs text-gray-700 leading-relaxed">{o.work_description || "—"}</p>
          </div>
        </div>
        {userCanViewPay && (
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">Total Bayaran</p>
                <p className="text-xl font-bold text-white">{o.total_pay != null ? formatRupiah(o.total_pay) : "—"}</p>
              </div>
              {o.rate_per_hour != null && (
                <p className="text-[10px] text-gray-500 font-mono">{formatRupiah(o.rate_per_hour)}/jam</p>
              )}
            </div>
          </div>
        )}
        {o.proof_photo_url && (
          <div>
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-2">Foto Bukti</p>
            <button onClick={() => { onClose(); setTimeout(onProofPhoto, 100); }} className="w-full overflow-hidden rounded-xl border border-gray-100 hover:opacity-90 transition-opacity shadow-sm">
              <img src={o.proof_photo_url} alt="Bukti" className="w-full h-44 object-cover" />
              <div className="px-3 py-2 bg-gray-50 text-center border-t border-gray-100">
                <p className="text-[9px] text-gray-400 font-medium">Tap untuk lihat penuh</p>
              </div>
            </button>
          </div>
        )}
        {o.status === "REJECTED" && o.rejection_note && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-3.5">
            <p className="text-[9px] font-bold text-red-500 uppercase tracking-wider mb-1.5">Alasan Ditolak</p>
            <p className="text-xs text-red-700">{o.rejection_note}</p>
          </div>
        )}
        {o.approver && (
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3.5">
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
              {o.status === "REJECTED" ? "Ditolak oleh" : "Disetujui oleh"}
            </p>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-gray-800 font-semibold truncate">{o.approver.name}</p>
                <p className="text-[9px] text-gray-400 mt-0.5">{o.approver.role.replace(/_/g, " ")}</p>
              </div>
              {o.approved_at && (
                <p className="text-[9px] text-gray-400 font-mono flex-shrink-0 text-right">
                  {new Date(o.approved_at).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                  <br />{formatTime(o.approved_at)}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
      <ModalFoot>
        <div className="flex-1 flex flex-col gap-2">
          {/* ── Baris 1: aksi utama sesuai status — 1 tombol dominan, full-width ── */}
          {currentUser?.id === o.user_id && o.status === "NEED_PROOF" && (
            <button onClick={() => { onClose(); setTimeout(onComplete, 100); }} className="w-full h-10 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm"> Upload Foto</button>
          )}
          {currentUser?.id === o.user_id && o.status === "ONGOING" && !o.actual_end && (
            <button onClick={() => { onClose(); setTimeout(onComplete, 100); }} className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm"> Selesai</button>
          )}
          {canApproveTarget(currentUser?.roles ?? currentUser?.role, o.users?.role) && o.status === "PENDING" && (
            <div className="flex gap-2 w-full">
              <button onClick={() => { onClose(); setTimeout(onReject, 100); }} className="flex-1 h-10 bg-white border border-red-200 text-red-600 rounded-xl text-xs font-semibold hover:bg-red-50 transition-all flex items-center justify-center gap-1.5"> Tolak</button>
              <button onClick={() => { onClose(); setTimeout(onApprove, 100); }} className="flex-1 h-10 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm"> Setujui</button>
            </div>
          )}
          {/* Bayaran hanya boleh diatur kalau lembur selesai DAN foto bukti sudah ada */}
          {canSetPay(currentUser?.role) && o.status === "COMPLETED" && !!o.proof_photo_url && (
            <button onClick={() => { onClose(); setTimeout(onSetPay, 100); }} className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm"> {o.rate_per_hour ? "Edit Bayaran" : "Set Bayaran"}</button>
          )}
          {/* Placeholder informatif: admin tahu kenapa tombol Set Bayaran belum muncul */}
          {canSetPay(currentUser?.role) && !o.proof_photo_url && (o.status === "NEED_PROOF" || o.status === "COMPLETED") && (
            <div className="w-full h-10 rounded-xl border border-dashed border-gray-200 bg-gray-50 text-gray-400 text-[10px] font-semibold flex items-center justify-center gap-1.5 px-3 text-center">
              <Camera size={13} className="flex-shrink-0" />
              <span>Menunggu foto bukti</span>
            </div>
          )}
          {/* ── Baris 2: aksi sekunder — semua rata kanan (satu sisi) ── */}
          <div className="flex items-center justify-end gap-2">
            {isAdminRole(currentUser?.role) && (
              <>
                <button onClick={() => { onClose(); setTimeout(onEdit, 100); }} className="h-10 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-semibold hover:bg-gray-50 flex items-center gap-1.5 transition-all"> Edit</button>
                <button onClick={() => { onClose(); setTimeout(onDelete, 100); }} className="h-10 px-3.5 bg-white border border-red-100 text-red-500 rounded-xl text-xs font-semibold hover:bg-red-50 flex items-center transition-all"></button>
              </>
            )}
            <button onClick={onClose} className="h-10 px-4 bg-gray-100 text-gray-600 rounded-xl text-xs font-semibold hover:bg-gray-200 transition-all">Tutup</button>
          </div>
        </div>
      </ModalFoot>
    </ModalWrapper>
  );
}

// ─── CAMERA ────────────────────────────────────────────────────────────────
type CCProps = { onCapture: (f: File, url: string) => void; onCancel: () => void; };
function CameraCapture({ onCapture, onCancel }: CCProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [facing, setFacing] = useState<"environment" | "user">("environment");

  const startCamera = useCallback(async (f: "environment" | "user") => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setReady(false); setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: f, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err: any) { setError(err.name === "NotAllowedError" ? "Izin kamera ditolak." : err.name === "NotFoundError" ? "Kamera tidak ditemukan." : `Gagal: ${err.message}`); }
  }, []);

  useEffect(() => { startCamera(facing); return () => { streamRef.current?.getTracks().forEach(t => t.stop()); }; }, [facing, startCamera]);

  const capture = () => {
    if (!videoRef.current || !ready) return;
    const v = videoRef.current;
    const c = document.createElement("canvas"); c.width = v.videoWidth || 1280; c.height = v.videoHeight || 720;
    const ctx = c.getContext("2d"); if (!ctx) return;
    if (facing === "user") { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(v, 0, 0, c.width, c.height);
    if (facing === "user") ctx.setTransform(1, 0, 0, 1, 0, 0);
    setProcessing(true);
    addWatermarkToImage(c.toDataURL("image/jpeg", 0.95), (blob, url) => {
      const file = new File([blob], `overtime-${Date.now()}.jpg`, { type: "image/jpeg" });
      setProcessing(false); streamRef.current?.getTracks().forEach(t => t.stop()); onCapture(file, url);
    });
  };

  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded-xl bg-red-50 border border-red-200 p-5 text-center space-y-3">
          <p className="text-sm font-bold text-red-700">{error}</p>
          <label className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 cursor-pointer hover:bg-gray-50 transition-all shadow-sm">
            Pilih dari Galeri
            <input type="file" accept="image/*" className="hidden" onChange={e => {
              const file = e.target.files?.[0]; if (!file) return;
              const reader = new FileReader();
              reader.onload = ev => { const url = ev.target?.result as string; setProcessing(true); addWatermarkToImage(url, (blob, pu) => { const f = new File([blob], file.name, { type: "image/jpeg" }); setProcessing(false); onCapture(f, pu); }); };
              reader.readAsDataURL(file);
            }} />
          </label>
        </div>
      ) : (
        <div className="relative rounded-xl overflow-hidden bg-black aspect-video border border-gray-100 shadow-sm">
          <video ref={videoRef} autoPlay playsInline muted onCanPlay={() => setReady(true)}
            className={`w-full h-full object-cover transition-opacity duration-300 ${facing === "user" ? "scale-x-[-1]" : ""} ${ready ? "opacity-100" : "opacity-0"}`} />
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          )}
          <button onClick={() => setFacing(p => p === "environment" ? "user" : "environment")}
            className="absolute top-2.5 right-2.5 w-8 h-8 rounded-xl bg-black/50 backdrop-blur-sm flex items-center justify-center text-white text-xs hover:bg-black/70 transition-all"></button>
        </div>
      )}
      {processing && (
        <div className="flex items-center gap-2.5 bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-2.5">
          <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          <p className="text-xs text-gray-500">Menambahkan watermark...</p>
        </div>
      )}
      <div className="flex gap-2.5">
        <button onClick={onCancel} className={secondaryBtn} style={{ flex: "0 0 auto", padding: "0 16px" }}>Batal</button>
        <button onClick={capture} disabled={!ready || processing || !!error} className={primaryBtn}>
          {processing ? <Spinner /> : <><Camera size={16} /><span>Ambil Foto</span></>}
        </button>
      </div>
    </div>
  );
}

// ─── PROOF PHOTO MODAL ─────────────────────────────────────────────────────
function ProofPhotoModal({ overtime: o, onClose, canViewPay: showPay }: { overtime: OvertimeRequest; onClose: () => void; canViewPay?: boolean }) {
  if (!o.proof_photo_url) return null;
  return (
    <ModalWrapper onClose={onClose}>
      <ModalHead icon="" title="Bukti Lemburan" sub={o.users?.name} onClose={onClose} />
      <div className="px-5 py-4 space-y-3 max-h-[75vh] overflow-y-auto">
        <img src={o.proof_photo_url} alt="Bukti" className="w-full h-56 object-cover rounded-xl border border-gray-100 shadow-sm" />
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3.5">
            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1.5">Tanggal</p>
            <p className="font-semibold text-gray-800 text-xs">{new Date(o.request_date).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</p>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3.5">
            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1.5">Waktu</p>
            <p className="font-semibold text-gray-800 text-xs font-mono">{formatTime(o.actual_start ?? o.scheduled_start)} – {formatTime(o.actual_end ?? o.scheduled_end)}</p>
          </div>
        </div>
        {showPay && o.total_pay != null && (
          <div className="rounded-xl p-4 bg-gradient-to-br from-gray-900 to-gray-800 text-white">
            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1.5">Total Bayaran</p>
            <p className="text-xl font-bold">{formatRupiah(o.total_pay)}</p>
          </div>
        )}
      </div>
      <ModalFoot><button onClick={onClose} className={primaryBtn}>Tutup</button></ModalFoot>
    </ModalWrapper>
  );
}

function ApproveModal({ overtime: o, onClose, onSaved }: { overtime: OvertimeRequest; onClose: () => void; onSaved: () => void }) {
  const [scheduledStart, setScheduledStart] = useState(o.requested_start?.substring(0, 5) || "09:00");
  const [scheduledEnd, setScheduledEnd] = useState("17:00");
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState("");
  const [confirmStep, setConfirmStep] = useState(false);

  const isOvernight = useMemo(() => {
    if (!scheduledStart || !scheduledEnd) return false;
    return scheduledEnd <= scheduledStart;
  }, [scheduledStart, scheduledEnd]);

  const endDateResolved = useMemo(
    () => (isOvernight ? addDaysToDateStr(o.request_date, 1) : o.request_date),
    [isOvernight, o.request_date]
  );

  const goToConfirm = () => {
    if (!scheduledStart || !scheduledEnd) { setError("Jam mulai & selesai wajib diisi"); return; }
    if (scheduledStart === scheduledEnd) { setError("Jam mulai dan selesai tidak boleh sama"); return; }
    setError("");
    setConfirmStep(true);
  };

  const approve = async () => {
    setApproving(true); setError("");
    try {
      const fmt = (t: string) => (t.length === 5 ? `${t}:00` : t);
      const res = await fetch("/api/attendance/overtime", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: o.id,
          action: "APPROVE",
          scheduled_start: `${o.request_date}T${fmt(scheduledStart)}+07:00`,
          scheduled_end: `${endDateResolved}T${fmt(scheduledEnd)}+07:00`,
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) { setError(d.message || `Error ${res.status}`); setConfirmStep(false); return; }
      onSaved(); onClose();
    } catch (err: any) { setError(err.message || "Gagal"); setConfirmStep(false); } finally { setApproving(false); }
  };

  // ✅ NEW — langkah ke-2: layar konfirmasi final
  if (confirmStep) {
    return (
      <ModalWrapper onClose={onClose} preventClose={approving}>
        <ModalHead icon="" title="Konfirmasi ACC" sub="Langkah terakhir — pastikan datanya benar" onClose={onClose} noClose={approving} />
        <div className="px-5 py-4 space-y-3.5">
          {error && <ErrorBanner msg={error} />}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5">
            <p className="text-xs font-semibold text-amber-800 mb-1"> Tindakan ini langsung mengunci lemburan</p>
            <p className="text-[11px] text-amber-700">Setelah di-ACC, karyawan wajib upload foto bukti dan pengajuan ini tidak bisa dibatalkan dari sini.</p>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3.5 space-y-2">
            <div className="flex justify-between text-xs"><span className="text-gray-400">Karyawan</span><span className="font-semibold text-gray-800">{o.users?.name}</span></div>
            <div className="flex justify-between text-xs"><span className="text-gray-400">Tanggal</span><span className="font-semibold text-gray-800">{new Date(o.request_date).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</span></div>
            <div className="flex justify-between text-xs"><span className="text-gray-400">Jam Lembur</span><span className="font-mono font-semibold text-gray-800">{scheduledStart} – {scheduledEnd}{isOvernight ? " (+1 hari)" : ""}</span></div>
          </div>
        </div>
        <ModalFoot>
          <button onClick={() => setConfirmStep(false)} disabled={approving} className={secondaryBtn}>← Kembali</button>
          <button onClick={approve} disabled={approving} className={primaryBtn}>{approving ? <Spinner /> : " Ya, ACC Sekarang"}</button>
        </ModalFoot>
      </ModalWrapper>
    );
  }

  return (
    <ModalWrapper onClose={onClose}>
      <ModalHead icon="" title="Setujui Lemburan" sub={o.users?.name} onClose={onClose} />
      <div className="px-5 py-4 space-y-3.5 max-h-[70vh] overflow-y-auto">
        {error && <ErrorBanner msg={error} />}
        <div className="bg-violet-50 border border-violet-100 rounded-xl p-3.5 space-y-2">
          <p className="text-[9px] font-bold text-violet-400 uppercase tracking-wider mb-1">Info Pengajuan</p>
          <div className="flex justify-between text-xs"><span className="text-gray-400">Tanggal</span><span className="font-semibold text-gray-800">{new Date(o.request_date).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</span></div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-gray-400">Jam diminta</span>
            <span className="flex items-center gap-1.5">
              <span className="font-mono font-semibold text-gray-800">{formatTime(o.requested_start)}</span>
              {(o.is_late === true || (o.is_late == null && o.is_holiday && detectLateFromTime(o.requested_start))) && (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 border border-amber-200"> Terlambat</span>
              )}
              {o.is_holiday && (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-purple-100 text-purple-700 border border-purple-200"> Hari Libur</span>
              )}
            </span>
          </div>
          {o.reason && (
            <div className="pt-2 border-t border-violet-200">
              <p className="text-[9px] text-violet-400 font-bold uppercase tracking-wider mb-1">Alasan</p>
              <p className="text-xs text-gray-700">{o.reason}</p>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div><label className={lbl}>Jam Mulai *</label><input type="time" value={scheduledStart} onChange={e => setScheduledStart(e.target.value)} className={inp} /></div>
          <div><label className={lbl}>Jam Selesai *</label><input type="time" value={scheduledEnd} onChange={e => setScheduledEnd(e.target.value)} className={inp} /></div>
        </div>
        {isOvernight && (
          <div className="flex items-center gap-2.5 bg-blue-50 border border-blue-100 rounded-xl px-3.5 py-2.5">
            <span className="text-sm"><CalendarDays className="w-4 h-4 text-violet-600" /></span>
            <span className="text-xs text-blue-700">
              Lewat tengah malam — selesai dicatat{" "}
              <strong>{new Date(endDateResolved + "T12:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "long" })}</strong>
            </span>
          </div>
        )}
      </div>
      <ModalFoot>
        <button onClick={onClose} className={secondaryBtn}>Batal</button>
        <button onClick={goToConfirm} className={primaryBtn}> Lanjut ke Konfirmasi</button>
      </ModalFoot>
    </ModalWrapper>
  );
}

// ─── REJECT MODAL ──────────────────────────────────────────────────────────
// ✅ NEW — penolakan oleh atasan/kepala divisi/admin, juga 2 langkah.
function RejectModal({ overtime: o, onClose, onSaved }: { overtime: OvertimeRequest; onClose: () => void; onSaved: () => void }) {
  const [rejectionNote, setRejectionNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState("");
  const [confirmStep, setConfirmStep] = useState(false);

  const goToConfirm = () => {
    if (!rejectionNote.trim()) { setError("Alasan penolakan wajib diisi"); return; }
    setError("");
    setConfirmStep(true);
  };

  const reject = async () => {
    setRejecting(true); setError("");
    try {
      const res = await fetch("/api/attendance/overtime", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: o.id, action: "REJECT", rejection_note: rejectionNote.trim() }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) { setError(d.message || `Error ${res.status}`); setConfirmStep(false); return; }
      onSaved(); onClose();
    } catch (err: any) { setError(err.message || "Gagal"); setConfirmStep(false); } finally { setRejecting(false); }
  };

  if (confirmStep) {
    return (
      <ModalWrapper onClose={onClose} preventClose={rejecting}>
        <ModalHead icon="" title="Konfirmasi Penolakan" sub={o.users?.name} onClose={onClose} noClose={rejecting} />
        <div className="px-5 py-4 space-y-3.5">
          {error && <ErrorBanner msg={error} />}
          <div className="bg-red-50 border border-red-200 rounded-xl p-3.5">
            <p className="text-xs font-semibold text-red-800 mb-1"> Yakin tolak lemburan ini?</p>
            <p className="text-[11px] text-red-700">Karyawan akan melihat alasannya, dan pengajuan ini tidak dihitung lembur.</p>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3.5">
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Alasan Penolakan</p>
            <p className="text-xs text-gray-800">{rejectionNote}</p>
          </div>
        </div>
        <ModalFoot>
          <button onClick={() => setConfirmStep(false)} disabled={rejecting} className={secondaryBtn}>← Kembali</button>
          <button onClick={reject} disabled={rejecting} className="flex-1 h-10 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 disabled:opacity-40 shadow-sm">
            {rejecting ? <Spinner /> : " Ya, Tolak Sekarang"}
          </button>
        </ModalFoot>
      </ModalWrapper>
    );
  }

  return (
    <ModalWrapper onClose={onClose}>
      <ModalHead icon="" title="Tolak Lemburan" sub={o.users?.name} onClose={onClose} />
      <div className="px-5 py-4 space-y-3.5">
        {error && <ErrorBanner msg={error} />}
        <div>
          <label className={lbl}>Alasan Penolakan *</label>
          <textarea
            value={rejectionNote}
            onChange={e => setRejectionNote(e.target.value)}
            rows={3}
            placeholder="Jelaskan kenapa pengajuan ini ditolak..."
            className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 transition-all resize-none placeholder:text-gray-300"
          />
        </div>
      </div>
      <ModalFoot>
        <button onClick={onClose} className={secondaryBtn}>Batal</button>
        <button onClick={goToConfirm} className="flex-1 h-10 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 disabled:opacity-40 shadow-sm">
          Lanjut ke Konfirmasi
        </button>
      </ModalFoot>
    </ModalWrapper>
  );
}

const REASON_OPTIONS = [
  { value: "Tugas Mendesak", icon: Circle, iconClass: "text-red-500 fill-red-500", desc: "Harus diselesaikan segera" },
  { value: "Pekerjaan Belum Selesai", icon: Circle, iconClass: "text-amber-400 fill-amber-400", desc: "Pekerjaan hari ini belum tuntas" },
  { value: "Permintaan Atasan", icon: Circle, iconClass: "text-blue-500 fill-blue-500", desc: "Diminta langsung oleh atasan" },
  { value: "Lainnya", icon: Pencil, iconClass: "text-gray-500", desc: "Alasan lain" },
] as const;

function ReasonGrid({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {REASON_OPTIONS.map(opt => {
        const sel = value === opt.value;
        const Icon = opt.icon;
        return (
          <button key={opt.value} type="button" onClick={() => onChange(opt.value)}
            className={`flex items-start gap-2.5 px-3 py-3 rounded-xl border text-left transition-all active:scale-[0.98] ${sel ? "bg-violet-600 border-violet-600 shadow-sm shadow-violet-200" : "bg-white border-gray-200 hover:border-violet-300 hover:bg-violet-50/50"}`}>
            <span className="flex-shrink-0 mt-px"><Icon size={14} className={opt.iconClass} /></span>
            <div>
              <p className={`text-[11px] font-semibold leading-tight ${sel ? "text-white" : "text-gray-800"}`}>{opt.value}</p>
              <p className={`text-[9px] mt-0.5 ${sel ? "text-violet-200" : "text-gray-400"}`}>{opt.desc}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── REQUEST MODAL ─────────────────────────────────────────────────────────
function RequestOvertimeModal({ onClose, onSaved, currentUser }: { onClose: () => void; onSaved: () => void; currentUser: any }) {
  const today = new Date().toISOString().split("T")[0];
  const [requestDate, setRequestDate] = useState(today), [startTime, setStartTime] = useState("09:00");
  const [reasonType, setReasonType] = useState(""), [reasonCustom, setReasonCustom] = useState("");
  const [workDescription, setWorkDescription] = useState(""), [submitting, setSubmitting] = useState(false), [error, setError] = useState("");
  const [isHolidayOvertime, setIsHolidayOvertime] = useState(false);
  const isLainnya = reasonType === "Lainnya";

  const getNowWIB = useCallback(() => {
    const w = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const hh = String(w.getUTCHours()).padStart(2, "0");
    const mm = String(w.getUTCMinutes()).padStart(2, "0");
    const dateKey = w.toISOString().slice(0, 10);
    const totalMin = w.getUTCHours() * 60 + w.getUTCMinutes();
    return { time: `${hh}:${mm}`, dateKey, isLate: totalMin >= 8 * 60 };
  }, []);

  const [nowWIB, setNowWIB] = useState(() => getNowWIB());
  useEffect(() => { setNowWIB(getNowWIB()); }, [isHolidayOvertime, getNowWIB]);

  const submit = async () => {
    if (!isHolidayOvertime) {
      if (!requestDate) { setError("Pilih tanggal"); return; }
    }
    if (!reasonType) { setError("Pilih alasan"); return; }
    if (isLainnya && !reasonCustom.trim()) { setError("Jelaskan alasan"); return; }
    if (!workDescription.trim()) { setError("Rincian pekerjaan wajib diisi"); return; }
    setSubmitting(true); setError("");
    try {
      const freshNow = getNowWIB();
      const finalDate = isHolidayOvertime ? freshNow.dateKey : requestDate;
      const finalStart = isHolidayOvertime ? `${freshNow.time}:00` : `${startTime}:00`;
      const res = await fetch("/api/attendance/overtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_date: finalDate,
          requested_start: finalStart,
          reason: isLainnya ? reasonCustom.trim() : reasonType,
          work_description: workDescription.trim(),
          is_holiday: isHolidayOvertime,
          is_late: isHolidayOvertime ? freshNow.isLate : false,
        }),
      });
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal mengajukan"); return; }
      onSaved(); onClose();
    } catch { setError("Gagal mengajukan"); } finally { setSubmitting(false); }
  };

  return (
    <ModalWrapper onClose={onClose}>
      <ModalHead icon="" title="Ajukan Lemburan" sub={currentUser?.name || "Karyawan"} onClose={onClose} />
      <div className="px-5 py-4 space-y-4 max-h-[78vh] overflow-y-auto">
        {error && <ErrorBanner msg={error} />}
        {!isHolidayOvertime && (
          <div className="grid grid-cols-2 gap-2.5">
            <div><label className={lbl}>Tanggal *</label><input type="date" min={today} value={requestDate} onChange={e => setRequestDate(e.target.value)} className={inp} /></div>
            <div><label className={lbl}>Jam Mulai *</label><input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={inp} /></div>
          </div>
        )}
        <div><label className={lbl}>Alasan Lembur *</label><ReasonGrid value={reasonType} onChange={v => { setReasonType(v); if (v !== "Lainnya") setReasonCustom(""); }} /></div>
        {isLainnya && <div><label className={lbl}>Jelaskan Alasan *</label><input type="text" value={reasonCustom} onChange={e => setReasonCustom(e.target.value)} placeholder="Tuliskan alasan spesifik..." className={inp} autoFocus /></div>}
        <button
          type="button"
          onClick={() => setIsHolidayOvertime(v => !v)}
          className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border text-left transition-all active:scale-[0.99] ${isHolidayOvertime ? "bg-violet-600 border-violet-600 shadow-sm shadow-violet-200" : "bg-white border-gray-200 hover:border-violet-300 hover:bg-violet-50/50"}`}
        >
          <span className={`w-9 h-5 rounded-full flex-shrink-0 relative transition-colors ${isHolidayOvertime ? "bg-white/30" : "bg-gray-200"}`}>
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${isHolidayOvertime ? "left-[18px]" : "left-0.5"}`} />
          </span>
          <div className="flex-1">
            <p className={`text-[11px] font-semibold leading-tight ${isHolidayOvertime ? "text-white" : "text-gray-800"}`}> Lembur di hari libur</p>
            <p className={`text-[9px] mt-0.5 ${isHolidayOvertime ? "text-violet-200" : "text-gray-400"}`}>Tanggal & jam dideteksi otomatis saat pengajuan</p>
          </div>
        </button>
        {isHolidayOvertime && (
          <div className={`flex items-center gap-2.5 border rounded-xl px-3.5 py-2.5 ${nowWIB.isLate ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-100"}`}>
            <span className="text-sm">{nowWIB.isLate ? "" : ""}</span>
            <div className="text-xs">
              <p className={`font-semibold ${nowWIB.isLate ? "text-amber-700" : "text-emerald-700"}`}>
                Terdeteksi jam {nowWIB.time} WIB {nowWIB.isLate ? "· Terlambat" : "· Tepat waktu"}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {nowWIB.isLate
                  ? "Kamu terlambat (lewat 07:59), tapi tetap bisa mengajukan — status dicatat sebagai Terlambat."
                  : "Lewat 07:59 dihitung terlambat (sama seperti absensi), tapi pengajuan tetap bisa dilakukan."}
              </p>
            </div>
          </div>
        )}
        <div>
          <label className={lbl}>Rincian Pekerjaan *</label>
          <textarea value={workDescription} onChange={e => setWorkDescription(e.target.value)} placeholder="Pekerjaan yang akan dikerjakan saat lembur..." rows={3} className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all resize-none placeholder:text-gray-300" />
        </div>
      </div>
      <ModalFoot>
        <button onClick={onClose} className={secondaryBtn}>Batal</button>
        <button
          onClick={submit}
          disabled={submitting || (!isHolidayOvertime && !requestDate) || !reasonType || (isLainnya && !reasonCustom.trim()) || !workDescription.trim()}
          className={primaryBtn}
        >
          {submitting ? <><Spinner /><span>Mengirim...</span></> : " Ajukan"}
        </button>
      </ModalFoot>
    </ModalWrapper>
  );
}

// ─── SET PAY MODAL ─────────────────────────────────────────────────────────
function SetPayModal({ overtime: o, onClose, onSaved }: { overtime: OvertimeRequest; onClose: () => void; onSaved: () => void }) {
  const start = o.actual_start ?? o.scheduled_start, end = o.actual_end ?? o.scheduled_end;
  const hours = (!start || !end) ? 0 : Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 3600000);
  const isFlatPay = o.is_holiday === true || (!o.rate_per_hour && (o.total_pay ?? 0) > 0);
  const [payMode, setPayMode] = useState<"PER_JAM" | "TETAP">(isFlatPay ? "TETAP" : "PER_JAM");
  const [rate, setRate] = useState(o.rate_per_hour || 100000);
  const [fixedPay, setFixedPay] = useState(o.total_pay ?? 0);
  const [saving, setSaving] = useState(false), [error, setError] = useState("");

  const totalPay = payMode === "PER_JAM" ? rate * hours : fixedPay;

  const save = async () => {
    if (payMode === "PER_JAM" && rate < 0) { setError("Tarif harus >= 0"); return; }
    if (payMode === "TETAP" && fixedPay < 0) { setError("Nominal harus >= 0"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/attendance/overtime", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: o.id,
          action: "SET_PAY",
          rate_per_hour: payMode === "PER_JAM" ? Math.round(rate) : 0,
          total_pay: Math.round(totalPay),
        }),
      });
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal mengajukan"); return; }
      onSaved(); onClose();
    } catch (err: any) { setError(err?.message || "Gagal"); } finally { setSaving(false); }
  };

  return (
    <ModalWrapper onClose={onClose}>
      <ModalHead icon="" title="Atur Bayaran" sub={o.users?.name} onClose={onClose} />
      <div className="px-5 py-4 space-y-3.5 max-h-[65vh] overflow-y-auto">
        {error && <ErrorBanner msg={error} />}
        <div className="grid grid-cols-2 gap-2">
          {(["PER_JAM", "TETAP"] as const).map(m => (
            <button key={m} type="button" onClick={() => setPayMode(m)}
              className={`py-3 rounded-xl text-xs font-bold border transition-all ${payMode === m ? "bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-200" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}>
              {m === "PER_JAM" ? "Per Jam" : "Tetap"}
            </button>
          ))}
        </div>
        <div className="rounded-xl p-4 bg-gradient-to-br from-gray-900 to-gray-800 text-white">
          <div className="flex items-end justify-between mb-4">
            <div>
              <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">Durasi Aktual</p>
              <p className="text-4xl font-bold">{hours}<span className="text-sm font-normal text-gray-400 ml-1.5">jam</span></p>
            </div>
            <div className="text-right text-xs">
              <p className="text-gray-500 text-[9px] mb-0.5">Mulai</p><p className="font-mono">{formatTime(o.actual_start)}</p>
              <p className="text-gray-500 text-[9px] mt-1.5 mb-0.5">Selesai</p><p className="font-mono">{formatTime(o.actual_end)}</p>
            </div>
          </div>
          <div className="border-t border-white/10 pt-3.5">
            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">Total Bayaran</p>
            <p className="text-xl font-bold text-emerald-400">{formatRupiah(Math.round(totalPay))}</p>
            {payMode === "PER_JAM"
              ? <p className="text-[9px] text-gray-500 mt-0.5">{hours} jam × {formatRupiah(Math.round(rate))}</p>
              : <p className="text-[9px] text-gray-500 mt-0.5">Nominal tetap · tidak dikali jam</p>}
          </div>
        </div>
        {payMode === "PER_JAM" ? (
          <div>
            <label className={lbl}>Tarif Per Jam (Rp)</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-medium">Rp</span>
              <input type="number" min={0} value={rate} onChange={e => setRate(parseFloat(e.target.value) || 0)} className="w-full h-10 border border-gray-200 rounded-xl pl-9 pr-3.5 text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all" />
            </div>
          </div>
        ) : (
          <div>
            <label className={lbl}>Nominal Tetap (Rp)</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-medium">Rp</span>
              <input type="number" min={0} value={fixedPay} onChange={e => setFixedPay(parseFloat(e.target.value) || 0)} placeholder="Bebas, contoh: 150000" className="w-full h-10 border border-gray-200 rounded-xl pl-9 pr-3.5 text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all" />
            </div>
            <p className="text-[9px] text-gray-400 mt-1">Bebas isi berapa saja, tidak mengikuti tarif per jam.</p>
          </div>
        )}
      </div>
      <ModalFoot>
        <button onClick={onClose} className={secondaryBtn}>Batal</button>
        <button onClick={save} disabled={saving} className={primaryBtn}>{saving ? <Spinner /> : " Simpan"}</button>
      </ModalFoot>
    </ModalWrapper>
  );
}

// ─── COMPLETE MODAL ─────────────────────────────────────────────────────────
function CompleteModal({ overtime: o, onClose, onSaved, isAutoCompleted }: { overtime: OvertimeRequest; onClose: () => void; onSaved: () => void; isAutoCompleted?: boolean }) {
  const isNeedProof = o.status === "NEED_PROOF";
  const mustUpload = isAutoCompleted || isNeedProof;
  const [photoFile, setPhotoFile] = useState<File | null>(null), [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false), [error, setError] = useState("");
  const [photoStep, setPhotoStep] = useState<"idle" | "camera" | "preview">("idle");

  const handleClose = () => { if (mustUpload) { setError(" Wajib upload foto bukti dulu."); return; } onClose(); };

  const upload = async () => {
    if (mustUpload && !photoFile) { setError(" Foto bukti wajib diupload."); return; }
    setUploading(true); setError("");
    try {
      let photoUrl: string | null = null;
      if (photoFile) {
        const fd = new FormData(); fd.append("file", photoFile);
        const ur = await fetch("/api/attendance/overtime/upload", { method: "POST", body: fd });
        if (!ur.ok) { const e = await ur.json(); throw new Error(e.message || "Upload gagal"); }
        const { url } = await ur.json(); photoUrl = url;
      }
      const res = await fetch("/api/attendance/overtime", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: o.id, action: "COMPLETE", proof_photo_url: photoUrl }) });
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal"); return; }
      onSaved(); onClose();
    } catch (err: any) { setError(err.message || "Gagal"); } finally { setUploading(false); }
  };

  return (
    <ModalWrapper onClose={handleClose} preventClose={mustUpload}>
      <ModalHead icon={isNeedProof ? "" : ""} title={isNeedProof ? "Upload Bukti Lemburan" : "Selesaikan Lemburan"} sub={o.users?.name} onClose={handleClose} noClose={mustUpload} />
      <div className="px-5 py-4 space-y-3.5 max-h-[75vh] overflow-y-auto">
        {isNeedProof && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3.5">
            <p className="font-semibold text-orange-800 text-xs mb-0.5"> Foto Bukti Wajib</p>
            <p className="text-[10px] text-orange-700">Upload foto bukti sebelum menutup halaman ini.</p>
          </div>
        )}
        {isAutoCompleted && !isNeedProof && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5">
            <p className="font-semibold text-amber-800 text-xs mb-0.5"> Waktu Lembur Habis</p>
            <p className="text-[10px] text-amber-700">Lemburanmu selesai otomatis. Wajib upload foto bukti.</p>
          </div>
        )}
        {error && <ErrorBanner msg={error} />}
        {photoStep === "preview" && photoPreview && (
          <div>
            <img src={photoPreview} alt="Preview" className="w-full h-48 object-cover rounded-xl border border-gray-100 mb-2.5 shadow-sm" />
            <button onClick={() => { setPhotoFile(null); setPhotoPreview(null); setPhotoStep("idle"); }} className="text-[10px] font-semibold text-gray-400 hover:text-gray-700 transition-colors">↺ Ambil Ulang</button>
          </div>
        )}
        {photoStep === "camera" && (
          <CameraCapture onCapture={(f, url) => { setPhotoFile(f); setPhotoPreview(url); setPhotoStep("preview"); setError(""); }} onCancel={() => setPhotoStep("idle")} />
        )}
        {photoStep === "idle" && (
          <button onClick={() => setPhotoStep("camera")}
            className={`w-full flex items-center justify-center gap-3 border-2 border-dashed rounded-xl p-7 text-center transition-all group ${mustUpload ? "border-orange-300 bg-orange-50/40 hover:border-orange-400 hover:bg-orange-50/70" : "border-gray-200 hover:border-violet-300 hover:bg-violet-50/20"}`}>
            <Camera size={24} className="text-gray-400" />
            <div className="text-left">
              <p className={`text-xs font-semibold ${mustUpload ? "text-orange-700" : "text-gray-700"}`}>Buka Kamera</p>
              <p className={`text-[10px] mt-0.5 ${mustUpload ? "text-orange-500" : "text-gray-400"}`}>{mustUpload ? "Wajib ambil foto bukti" : "Ambil foto bukti lemburan"}</p>
            </div>
          </button>
        )}
      </div>
      {photoStep !== "camera" && (
        <ModalFoot>
          {!mustUpload && <button onClick={onClose} className={secondaryBtn}>Batal</button>}
          <button onClick={upload} disabled={uploading || (mustUpload && !photoFile)} className={primaryBtn}>
            {uploading ? <Spinner /> : photoFile ? " Upload & Selesai" : mustUpload ? " Ambil Foto Dulu" : " Selesai"}
          </button>
        </ModalFoot>
      )}
    </ModalWrapper>
  );
}

function ManualOvertimeModal({ onClose, onSaved, allUsers, currentUser }: { onClose: () => void; onSaved: () => void; allUsers: User[]; currentUser: any }) {
  const [targetUserId, setTargetUserId] = useState(""), [requestDate, setRequestDate] = useState(new Date().toISOString().split("T")[0]);
  const [startTime, setStartTime] = useState("09:00"), [endTime, setEndTime] = useState("17:00");
  const [reasonType, setReasonType] = useState(""), [reasonCustom, setReasonCustom] = useState("");
  const [workDescription, setWorkDescription] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null), [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoStep, setPhotoStep] = useState<"idle" | "camera" | "preview">("idle");
  const [submitting, setSubmitting] = useState(false), [error, setError] = useState("");
  const [isHolidayOvertime, setIsHolidayOvertime] = useState(false);
  const [manualPay, setManualPay] = useState<string>("");

  const userRoles = useMemo<string[]>(
    () => Array.isArray(currentUser?.roles) && currentUser.roles.length > 0
      ? (currentUser.roles as string[])
      : currentUser?.role ? [currentUser.role as string] : [],
    [currentUser]
  );

  const allowedRoles = useMemo(() => getManualAllowedRoles(userRoles), [userRoles]);
  const isFullAdmin = allowedRoles === null;

  const filteredUsers = useMemo(() =>
    allUsers
      .filter(u => isFullAdmin || allowedRoles!.includes(u.role))
      .sort((a, b) => a.name.localeCompare(b.name, "id-ID")),
    [allUsers, allowedRoles, isFullAdmin]
  );

  //  FIX: kalau endTime <= startTime, anggap overnight, tambah 24 jam
  const isOvernight = useMemo(() => {
    if (!startTime || !endTime) return false;
    return endTime <= startTime;
  }, [startTime, endTime]);

  const endDateResolved = useMemo(
    () => isOvernight ? addDaysToDateStr(requestDate, 1) : requestDate,
    [isOvernight, requestDate]
  );

  const previewHours = useMemo(() => {
    if (!startTime || !endTime) return null;
    let diffMs = new Date(`1970-01-01T${endTime}:00`).getTime() - new Date(`1970-01-01T${startTime}:00`).getTime();
    if (isOvernight) diffMs += 24 * 3600000; //  tambah 1 hari kalau lewat tengah malam
    const d = diffMs / 3600000;
    return d > 0 ? Math.floor(d) : null;
  }, [startTime, endTime, isOvernight]);

  const holidayIsLate = useMemo(
    () => isHolidayOvertime && detectLateFromTime(startTime),
    [isHolidayOvertime, startTime]
  );

  const submit = async () => {
    if (!targetUserId || !requestDate || !startTime || !endTime || !reasonType || !workDescription.trim()) { setError("Semua field wajib diisi"); return; }
    //  FIX: cuma tolak kalau jam mulai & selesai SAMA PERSIS (durasi 0), bukan karena beda hari
    if (startTime === endTime) { setError("Jam mulai dan selesai tidak boleh sama"); return; }
    if (reasonType === "Lainnya" && !reasonCustom.trim()) { setError("Jelaskan alasan"); return; }
    setSubmitting(true); setError("");
    try {
      let photoUrl: string | null = null;
      if (photoFile) { const fd = new FormData(); fd.append("file", photoFile); const ur = await fetch("/api/attendance/overtime/upload", { method: "POST", body: fd }); if (!ur.ok) throw new Error((await ur.json()).message || "Upload gagal"); photoUrl = (await ur.json()).url; }
      const res = await fetch("/api/attendance/overtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_manual: true,
          target_user_id: targetUserId,
          request_date: requestDate,
          actual_start_time: startTime,
          actual_end_time: endTime,
          actual_end_date: endDateResolved, //  FIX: kirim tanggal selesai yang sudah dihitung (beda hari kalau overnight)
          work_description: workDescription.trim(),
          reason: reasonType === "Lainnya" ? reasonCustom.trim() : reasonType,
          proof_photo_url: photoUrl,
          is_holiday: isHolidayOvertime,
          is_late: isHolidayOvertime ? holidayIsLate : false,

          total_pay: manualPay.trim() ? Math.round(Number(manualPay)) : undefined,
        }),
      });
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal"); return; }
      onSaved(); onClose();
    } catch (err: any) { setError(err.message || "Gagal"); } finally { setSubmitting(false); }
  };

  return (
    <ModalWrapper onClose={onClose} wide>
      <ModalHead
        icon=""
        title="Input Lembur Manual"
        sub={
          userRoles.some(r => (FULL_ACCESS_ROLES as readonly string[]).includes(r))
            ? "Admin · Asisten CEO · Programmer"
            : `${userRoles.map(r => r.replace(/_/g, " ")).join(" & ")} · Bawahan divisimu`
        }
        onClose={onClose}
      />
      <div className="px-5 py-4 space-y-3.5 max-h-[75vh] overflow-y-auto">
        {error && <ErrorBanner msg={error} />}
        <div>
          <label className={lbl}>Nama Karyawan *</label>
          <select value={targetUserId} onChange={e => setTargetUserId(e.target.value)} className={inp + " cursor-pointer"}>
            <option value="">— Pilih karyawan —</option>
            {filteredUsers.map(u => (
              <option key={u.id} value={u.id}>{u.name} ({u.role.replace(/_/g, " ")})</option>
            ))}
          </select>
          {!isFullAdmin && allowedRoles && allowedRoles.length > 0 && (
            <p className="text-[9px] text-gray-400 mt-1.5">
              Hanya menampilkan bawahanmu: {allowedRoles.map(r => r.replace(/_/g, " ")).join(", ")}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setIsHolidayOvertime(v => !v)}
          className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border text-left transition-all active:scale-[0.99] ${isHolidayOvertime ? "bg-purple-600 border-purple-600 shadow-sm shadow-purple-200" : "bg-white border-gray-200 hover:border-purple-300 hover:bg-purple-50/50"}`}
        >
          <span className={`w-9 h-5 rounded-full flex-shrink-0 relative transition-colors ${isHolidayOvertime ? "bg-white/30" : "bg-gray-200"}`}>
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${isHolidayOvertime ? "left-[18px]" : "left-0.5"}`} />
          </span>
          <div className="flex-1">
            <p className={`text-[11px] font-semibold leading-tight ${isHolidayOvertime ? "text-white" : "text-gray-800"}`}> Lembur hari libur</p>
            <p className={`text-[9px] mt-0.5 ${isHolidayOvertime ? "text-purple-200" : "text-gray-400"}`}>Batas masuk 08:00 · bayaran diatur lewat Set Bayaran</p>
          </div>
        </button>
        {/*  Mode normal: grid tanggal/jam selalu tampil seperti sebelumnya */}
        {!isHolidayOvertime && (
          <div className="grid grid-cols-3 gap-2">
            <div><label className={lbl}>Tanggal *</label><input type="date" value={requestDate} onChange={e => setRequestDate(e.target.value)} className={inp} /></div>
            <div><label className={lbl}>Jam Mulai *</label><input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={inp} /></div>
            <div><label className={lbl}>Jam Selesai *</label><input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={inp} /></div>
          </div>
        )}

        {/*  Mode hari libur: kotak khusus muncul di bawah toggle saat diaktifkan */}
        {isHolidayOvertime && (
          <div className="bg-purple-50 border border-purple-100 rounded-xl p-3.5 space-y-3">
            <p className="text-[9px] font-bold text-purple-400 uppercase tracking-widest">Jam Lembur Hari Libur</p>
            <div className="grid grid-cols-3 gap-2">
              <div><label className={lbl}>Tanggal *</label><input type="date" value={requestDate} onChange={e => setRequestDate(e.target.value)} className={inp} /></div>
              <div><label className={lbl}>Jam Masuk *</label><input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={inp} /></div>
              <div><label className={lbl}>Jam Selesai *</label><input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={inp} /></div>
            </div>
            <div className={`flex items-center gap-2.5 border rounded-xl px-3.5 py-2.5 ${holidayIsLate ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-100"}`}>
              <span className="text-sm">{holidayIsLate ? "" : ""}</span>
              <div className="text-xs">
                <p className={`font-semibold ${holidayIsLate ? "text-amber-700" : "text-emerald-700"}`}>
                  Jam masuk {startTime} WIB {holidayIsLate ? "· Terlambat" : "· Tepat waktu"}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {holidayIsLate ? "Mulai 08:00 ke atas dihitung terlambat di hari libur." : "Masuk sebelum 08:00 dihitung tepat waktu di hari libur."}
                </p>
              </div>
            </div>
          </div>
        )}
        {previewHours !== null && (
          <div className="flex items-center gap-2.5 bg-violet-50 border border-violet-100 rounded-xl px-3.5 py-2.5">
            <Clock className="w-4 h-4 text-violet-600" />
            <span className="text-xs text-violet-700">Durasi: <strong>{previewHours} jam</strong>{isHolidayOvertime ? " · hanya catatan, bayaran diatur manual" : ""}</span>
          </div>
        )}
        {/*  FIX: input nominal langsung — nominal tetap tersimpan walau belum upload foto */}
        <div>
          <label className={lbl}>
            Nominal Bayaran <span className="normal-case font-normal text-gray-400">(opsional)</span>
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-medium">Rp</span>
            <input
              type="number"
              min={0}
              value={manualPay}
              onChange={e => setManualPay(e.target.value)}
              placeholder={isHolidayOvertime ? "Isi nominal lembur libur di sini" : "Kosongkan = otomatis dari tarif/jam"}
              className="w-full h-10 border border-gray-200 rounded-xl pl-9 pr-3.5 text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all"
            />
          </div>
          <p className="text-[9px] text-gray-400 mt-1">
            {isHolidayOvertime
              ? "Lembur hari libur tidak punya tarif otomatis — isi nominal di sini, atau atur nanti via tombol Set Bayaran."
              : "Kosong → dihitung dari tarif per jam × durasi. Diisi → pakai nominal ini (tetap), tidak dikali jam."}
          </p>
        </div>
        <div><label className={lbl}>Alasan Lembur *</label><ReasonGrid value={reasonType} onChange={v => { setReasonType(v); if (v !== "Lainnya") setReasonCustom(""); }} /></div>
        {reasonType === "Lainnya" && <div><label className={lbl}>Jelaskan Alasan *</label><input type="text" value={reasonCustom} onChange={e => setReasonCustom(e.target.value)} placeholder="Alasan spesifik..." className={inp} autoFocus /></div>}
        <div>
          <label className={lbl}>Rincian Pekerjaan *</label>
          <textarea value={workDescription} onChange={e => setWorkDescription(e.target.value)} placeholder="Pekerjaan yang dikerjakan saat lembur..." rows={2} className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all resize-none placeholder:text-gray-300" />
        </div>
        <div>
          <label className={lbl}>Foto Bukti <span className="normal-case font-normal text-gray-400">(opsional)</span></label>
          {photoStep === "preview" && photoPreview
            ? <div><img src={photoPreview} alt="Preview" className="w-full h-36 object-cover rounded-xl border border-gray-100 mb-2 shadow-sm" /><button onClick={() => { setPhotoFile(null); setPhotoPreview(null); setPhotoStep("idle"); }} className="text-[10px] font-semibold text-gray-400 hover:text-gray-700 transition-colors">↺ Ambil Ulang</button></div>
            : photoStep === "camera"
              ? <CameraCapture onCapture={(f, url) => { setPhotoFile(f); setPhotoPreview(url); setPhotoStep("preview"); setError(""); }} onCancel={() => setPhotoStep("idle")} />
              : <button onClick={() => setPhotoStep("camera")} className="w-full flex items-center justify-center gap-2.5 border-2 border-dashed border-gray-200 rounded-xl p-5 hover:border-violet-300 hover:bg-violet-50/20 transition-all"><Camera size={20} className="text-gray-400" /><span className="text-xs font-semibold text-gray-600">Buka Kamera</span></button>}
        </div>
      </div>
      {photoStep !== "camera" && (
        <ModalFoot>
          <button onClick={onClose} className={secondaryBtn}>Batal</button>
          <button onClick={submit} disabled={submitting || !targetUserId || !requestDate || !reasonType || !workDescription.trim()} className={primaryBtn}>
            {submitting ? <><Spinner /><span>Menyimpan...</span></> : " Simpan Lembur"}
          </button>
        </ModalFoot>
      )}
    </ModalWrapper>
  );
}

// ─── EDIT MODAL ─────────────────────────────────────────────────────────────
function EditOvertimeModal({ overtime: o, onClose, onSaved }: { overtime: OvertimeRequest; onClose: () => void; onSaved: () => void }) {
  const toTS = (iso: string | null | undefined): string => { if (!iso) return ""; if (!iso.includes("T")) return iso.substring(0, 5); const d = new Date(iso); if (isNaN(d.getTime())) return ""; const w = new Date(d.getTime() + 7 * 3600000); return `${String(w.getUTCHours()).padStart(2, "0")}:${String(w.getUTCMinutes()).padStart(2, "0")}`; };
  const savedReason = o.reason ?? ""; const knownOpts = REASON_OPTIONS.map(x => x.value) as string[]; const isKnown = knownOpts.includes(savedReason);
  const [requestDate, setRequestDate] = useState(o.request_date?.slice(0, 10) ?? "");
  const [startTime, setStartTime] = useState(toTS(o.actual_start ?? o.scheduled_start));
  const [endTime, setEndTime] = useState(toTS(o.actual_end ?? o.scheduled_end));
  const [reasonType, setReasonType] = useState(isKnown ? savedReason : "Lainnya");
  const [reasonCustom, setReasonCustom] = useState(isKnown ? "" : savedReason);
  const [workDesc, setWorkDesc] = useState(o.work_description ?? "");
  const [status, setStatus] = useState(o.status);
  const [photoFile, setPhotoFile] = useState<File | null>(null), [photoPreview, setPhotoPreview] = useState<string | null>(o.proof_photo_url ?? null);
  const [photoStep, setPhotoStep] = useState<"idle" | "camera" | "preview">(o.proof_photo_url ? "preview" : "idle");
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  const isLainnya = reasonType === "Lainnya";

  //  FIX: deteksi overnight (jam selesai <= jam mulai → lembur lewat tengah malam)
  const isOvernight = useMemo(() => {
    if (!startTime || !endTime) return false;
    return endTime <= startTime;
  }, [startTime, endTime]);

  const endDateResolved = useMemo(
    () => isOvernight ? addDaysToDateStr(requestDate, 1) : requestDate,
    [isOvernight, requestDate]
  );

  const prevDur = useMemo(() => {
    if (!startTime || !endTime) return null;
    let diffMs = new Date(`1970-01-01T${endTime}:00`).getTime() - new Date(`1970-01-01T${startTime}:00`).getTime();
    if (isOvernight) diffMs += 24 * 3600000;
    const d = diffMs / 3600000;
    return d > 0 ? Math.floor(d) : null;
  }, [startTime, endTime, isOvernight]);

  const fmt = (t: string) => t.length === 5 ? `${t}:00` : t;

  const save = async () => {
    if (!requestDate || !startTime || !endTime || !reasonType) { setError("Semua field wajib diisi"); return; }
    if (isLainnya && !reasonCustom.trim()) { setError("Jelaskan alasan lembur"); return; }
    //  FIX: hanya tolak kalau jam mulai & selesai SAMA PERSIS, bukan karena beda hari (overnight)
    if (startTime === endTime) { setError("Jam mulai dan selesai tidak boleh sama"); return; }
    setSaving(true); setError("");
    try {
      let proofUrl: string | null | undefined = undefined;
      if (photoFile) { const fd = new FormData(); fd.append("file", photoFile); const ur = await fetch("/api/attendance/overtime/upload", { method: "POST", body: fd }); if (!ur.ok) throw new Error((await ur.json()).message || "Upload foto gagal"); proofUrl = (await ur.json()).url; }
      else if (photoPreview === null && o.proof_photo_url) proofUrl = null;
      //  FIX: isoE pakai endDateResolved (tanggal+1 kalau overnight), bukan requestDate yang sama
      const isoS = `${requestDate}T${fmt(startTime)}+07:00`, isoE = `${endDateResolved}T${fmt(endTime)}+07:00`;
      const payload: Record<string, any> = { id: o.id, action: "UPDATE", request_date: requestDate, scheduled_start: isoS, scheduled_end: isoE, actual_start: isoS, actual_end: isoE, reason: isLainnya ? reasonCustom.trim() : reasonType, work_description: workDesc.trim(), status };
      if (proofUrl !== undefined) payload.proof_photo_url = proofUrl;
      const res = await fetch("/api/attendance/overtime", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.message || `Error ${res.status}`); return; }
      const d = await res.json(); if (!d.success) { setError(d.message || "Gagal menyimpan"); return; }
      onSaved(); onClose();
    } catch (err: any) { setError(err.message || "Terjadi kesalahan"); } finally { setSaving(false); }
  };

  const STATUS_OPTIONS: OvertimeRequest["status"][] = ["PENDING", "APPROVED", "ONGOING", "NEED_PROOF", "COMPLETED", "REJECTED", "CANCELLED"];

  return (
    <ModalWrapper onClose={onClose} wide>
      <ModalHead icon="" title="Edit Lembur" sub={o.users?.name ?? "Karyawan"} onClose={onClose} />
      <div className="px-5 py-4 space-y-3.5 max-h-[78vh] overflow-y-auto">
        {error && <ErrorBanner msg={error} />}
        <div className="grid grid-cols-2 gap-2.5">
          <div><label className={lbl}>Tanggal *</label><input type="date" value={requestDate} onChange={e => setRequestDate(e.target.value)} className={inp} /></div>
          <div><label className={lbl}>Status</label><select value={status} onChange={e => setStatus(e.target.value as OvertimeRequest["status"])} className={inp + " cursor-pointer"}>{STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_CONFIG[s]?.label ?? s}</option>)}</select></div>
        </div>
        <div>
          <label className={lbl}>Jam Lembur *</label>
          <div className="grid grid-cols-2 gap-2.5">
            <div><p className="text-[9px] text-gray-400 font-medium mb-1.5">Mulai</p><input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={inp} /></div>
            <div><p className="text-[9px] text-gray-400 font-medium mb-1.5">Selesai</p><input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={inp} /></div>
          </div>
          {prevDur !== null && (
            <div className="mt-2 inline-flex items-center gap-1.5 bg-violet-50 border border-violet-100 rounded-lg px-3 py-1.5">
              <Clock className="w-3.5 h-3.5 text-violet-600" />
              <span className="text-[10px] text-violet-700 font-medium">{prevDur} jam</span>
            </div>
          )}
          {isOvernight && (
            <div className="mt-2 flex items-center gap-2.5 bg-blue-50 border border-blue-100 rounded-xl px-3.5 py-2.5">
              <span className="text-sm"><CalendarDays className="w-4 h-4 text-violet-600" /></span>
              <span className="text-xs text-blue-700">
                Lewat tengah malam — selesai dicatat{" "}
                <strong>{new Date(endDateResolved + "T12:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "long" })}</strong>
              </span>
            </div>
          )}
        </div>
        <div><label className={lbl}>Alasan Lembur *</label><ReasonGrid value={reasonType} onChange={v => { setReasonType(v); if (v !== "Lainnya") setReasonCustom(""); }} /></div>
        {isLainnya && <div><label className={lbl}>Jelaskan Alasan *</label><input type="text" value={reasonCustom} onChange={e => setReasonCustom(e.target.value)} placeholder="Tuliskan alasan spesifik..." className={inp} autoFocus /></div>}
        <div>
          <label className={lbl}>Rincian Pekerjaan</label>
          <textarea value={workDesc} onChange={e => setWorkDesc(e.target.value)} rows={2} placeholder="Pekerjaan yang dikerjakan saat lembur..." className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all resize-none placeholder:text-gray-300" />
        </div>
        <div>
          <label className={lbl}>Foto Bukti <span className="normal-case font-normal text-gray-400">(opsional)</span></label>
          {photoStep === "preview" && photoPreview
            ? <div><img src={photoPreview} alt="Preview" className="w-full h-36 object-cover rounded-xl border border-gray-100 mb-2 shadow-sm" /><button onClick={() => { setPhotoFile(null); setPhotoPreview(null); setPhotoStep("idle"); }} className="text-[10px] font-semibold text-gray-400 hover:text-gray-700 transition-colors">↺ Hapus Foto</button></div>
            : photoStep === "camera"
              ? <CameraCapture onCapture={(f, url) => { setPhotoFile(f); setPhotoPreview(url); setPhotoStep("preview"); setError(""); }} onCancel={() => setPhotoStep("idle")} />
              : <button onClick={() => setPhotoStep("camera")} className="w-full flex items-center justify-center gap-2.5 border-2 border-dashed border-gray-200 rounded-xl p-5 hover:border-violet-300 hover:bg-violet-50/20 transition-all"><Camera size={20} className="text-gray-400" /><span className="text-xs font-semibold text-gray-600">Buka Kamera</span></button>}
        </div>
      </div>
      {photoStep !== "camera" && (
        <ModalFoot>
          <button onClick={onClose} className={secondaryBtn}>Batal</button>
          <button onClick={save} disabled={saving || !requestDate || !startTime || !endTime || !reasonType || (isLainnya && !reasonCustom.trim())} className={primaryBtn}>
            {saving ? <><Spinner /><span>Menyimpan...</span></> : " Simpan Perubahan"}
          </button>
        </ModalFoot>
      )}
    </ModalWrapper>
  );
}

// ─── DELETE MODAL ──────────────────────────────────────────────────────────
function DeleteConfirmModal({ overtime: o, onClose, onDeleted, canViewPay: showPay }: { overtime: OvertimeRequest; onClose: () => void; onDeleted: () => void; canViewPay?: boolean }) {
  const [deleting, setDeleting] = useState(false), [error, setError] = useState("");

  const handleDelete = async () => {
    setDeleting(true); setError("");
    try {
      const res = await fetch(`/api/attendance/overtime?id=${o.id}`, { method: "DELETE" });
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal menghapus"); return; }
      onDeleted(); onClose();
    } catch (err: any) { setError(err.message || "Gagal"); } finally { setDeleting(false); }
  };

  return (
    <ModalWrapper onClose={onClose}>
      <ModalHead icon="" title="Hapus Lembur" sub={o.users?.name} onClose={onClose} />
      <div className="px-5 py-4 space-y-3.5">
        {error && <ErrorBanner msg={error} />}
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 space-y-2.5">
          {[
            ["Karyawan", o.users?.name ?? "—"],
            ["Tanggal", new Date(o.request_date).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })],
            ["Waktu", `${formatTime(o.scheduled_start)} – ${formatTime(o.scheduled_end)}`],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between text-xs">
              <span className="text-red-400 font-medium">{k}</span>
              <span className="font-semibold text-red-800">{v}</span>
            </div>
          ))}
          <div className="flex justify-between items-center text-xs pt-1.5 border-t border-red-100">
            <span className="text-red-400 font-medium">Status</span>
            <StatusBadge status={o.status} />
          </div>
          {showPay && o.total_pay != null && (
            <div className="flex justify-between text-xs">
              <span className="text-red-400 font-medium">Total Bayaran</span>
              <span className="font-semibold text-red-800">{formatRupiah(o.total_pay)}</span>
            </div>
          )}
        </div>
        <p className="text-[10px] text-gray-400 text-center">Tindakan ini tidak dapat dibatalkan.</p>
      </div>
      <ModalFoot>
        <button onClick={onClose} className={secondaryBtn}>Batal</button>
        <button onClick={handleDelete} disabled={deleting} className="flex-1 h-10 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 shadow-sm">
          {deleting ? <Spinner /> : " Hapus Permanen"}
        </button>
      </ModalFoot>
    </ModalWrapper>
  );
}

// ─── EMPLOYEE DETAIL VIEW ──────────────────────────────────────────────────
function EmployeeDetailView({ userId, name, role, overtimes, userCanViewPay, currentUser, onBack, onDetailOpen }: {
  userId: string; name: string; role: string; overtimes: OvertimeRequest[];
  userCanViewPay: boolean; currentUser: any; onBack: () => void; onDetailOpen: (o: OvertimeRequest) => void;
}) {
  const [filterStatus, setFilterStatus] = useState("Semua");
  const bg = avBg(name);
  const sorted = useMemo(() => [...overtimes].sort((a, b) => new Date(b.request_date).getTime() - new Date(a.request_date).getTime()), [overtimes]);
  const filtered = useMemo(() => filterStatus === "Semua" ? sorted : sorted.filter(o => o.status === filterStatus), [sorted, filterStatus]);
  const statuses = useMemo(() => [...new Set(overtimes.map(o => o.status))], [overtimes]);
  const totalPay = useMemo(
    () => overtimes
      .filter(o => (PAYABLE_OVERTIME_STATUSES as readonly string[]).includes(o.status))
      .reduce((s, o) => s + (o.total_pay ?? 0), 0),
    [overtimes]
  );
  const counts = {
    total: overtimes.length,
    pending: overtimes.filter(o => o.status === "PENDING").length,
    ongoing: overtimes.filter(o => o.status === "ONGOING").length,
    selesai: overtimes.filter(o => o.status === "COMPLETED").length,
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
        <button onClick={onBack} className="w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-all flex-shrink-0 active:scale-95">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${bg}`}>{initials(name)}</div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-sm leading-tight">{name}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{role.replace(/_/g, " ")} · {overtimes.length} lemburan</p>
        </div>
      </div>
      <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/60">
        <div className="grid grid-cols-4 divide-x divide-gray-200">
          {[
            ["Total", counts.total, "text-gray-800"],
            ["Pending", counts.pending, "text-amber-600"],
            ["Berjalan", counts.ongoing, "text-emerald-600"],
            ["Selesai", counts.selesai, "text-blue-600"],
          ].map(([l, v, c]) => (
            <div key={String(l)} className="text-center px-2 first:pl-0 last:pr-0">
              <p className={`text-2xl font-black ${c}`}>{v}</p>
              <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">{l}</p>
            </div>
          ))}
        </div>
        {userCanViewPay && totalPay > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between">
            <p className="text-[10px] text-gray-400">Total bayaran lemburan selesai</p>
            <p className="text-sm font-bold text-gray-800">{formatRupiah(totalPay)}</p>
          </div>
        )}
      </div>
      {statuses.length > 1 && (
        <div className="px-5 py-2.5 border-b border-gray-100 flex gap-1.5 overflow-x-auto scrollbar-hide">
          {["Semua", ...statuses].map(s => {
            const c = s !== "Semua" ? STATUS_CONFIG[s] : null;
            const active = filterStatus === s;
            const Icon = c?.icon;
            return (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`flex-shrink-0 h-7 px-3 rounded-lg text-[10px] font-semibold transition-all border ${active ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"}`}>
                {c && Icon ? <span className="inline-flex items-center gap-1"><Icon size={12} />{c.label}</span> : "Semua"}
              </button>
            );
          })}
        </div>
      )}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <Inbox size={30} className="text-gray-300" />
          <p className="text-xs text-gray-400 font-medium">Tidak ada data</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {filtered.map(o => {
            const isMyUrgent = currentUser?.id === userId && (o.status === "NEED_PROOF" || (o.status === "ONGOING" && !o.actual_end));
            const duration = calcDuration(o.actual_start ?? o.scheduled_start, o.actual_end ?? o.scheduled_end);
            const dateObj = new Date(o.request_date + "T12:00:00");
            return (
              <button key={o.id} onClick={() => onDetailOpen(o)}
                className={`w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-gray-50/80 transition-colors group ${isMyUrgent ? "bg-orange-50/30" : ""}`}>
                <div className="w-10 flex-shrink-0 text-center">
                  <p className="text-base font-black text-gray-800 leading-none">{dateObj.getDate()}</p>
                  <p className="text-[9px] text-gray-400 font-bold uppercase mt-0.5">{MONTH_NAMES[dateObj.getMonth()].substring(0, 3)}</p>
                </div>
                <div className="w-px h-8 bg-gray-100 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                    <StatusBadge status={o.status} />
                    {(o.is_late === true || (o.is_late == null && o.is_holiday && detectLateFromTime(o.requested_start ?? o.actual_start ?? o.scheduled_start))) && (
                      <span className="text-[8px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md"> Telat</span>
                    )}
                    {o.is_holiday && (
                      <span className="text-[8px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded-md"> Libur</span>
                    )}
                    {isMyUrgent && <span className="text-[8px] font-bold text-orange-600 bg-orange-50 border border-orange-100 px-1.5 py-0.5 rounded-md">{o.status === "NEED_PROOF" ? "Upload foto" : "Selesaikan"}</span>}
                    {canApproveTarget(currentUser?.role, o.users?.role ?? userId) && o.status === "PENDING" && <span className="text-[8px] font-semibold text-violet-600 bg-violet-50 border border-violet-100 px-1.5 py-0.5 rounded-md">Perlu acc</span>}
                    {o.approver && (
                      <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-md border ${o.status === "REJECTED" ? "text-red-600 bg-red-50 border-red-100" : "text-emerald-600 bg-emerald-50 border-emerald-100"}`}>
                        {o.status === "REJECTED" ? "Ditolak" : "Diacc"}: {o.approver.name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                    <span className="font-mono">{formatTime(o.scheduled_start)} – {formatTime(o.scheduled_end)}</span>
                    {duration !== "—" && <><span className="text-gray-200">·</span><span className="text-gray-400">{duration}</span></>}
                  </div>
                  {o.reason && <p className="text-[10px] text-gray-400 truncate mt-0.5">{o.reason}</p>}
                </div>
                <div className="flex-shrink-0 flex items-center gap-2.5">
                  {userCanViewPay && o.total_pay != null && (
                    <p className="text-xs font-bold text-gray-700 font-mono hidden sm:block">{formatRupiah(o.total_pay)}</p>
                  )}
                  <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── EMPLOYEE LIST PANEL ───────────────────────────────────────────────────
function EmployeeListPanel({ groupedByUser, loading, userCanViewPay, currentUser, searchQuery, setSearchQuery, filterStatus, setFilterStatus, statuses, onSelectUser }: {
  groupedByUser: Array<{ user: { id: string; name: string; role: string }; items: OvertimeRequest[] }>;
  loading: boolean; userCanViewPay: boolean; currentUser: any;
  searchQuery: string; setSearchQuery: (v: string) => void;
  filterStatus: string; setFilterStatus: (v: string) => void;
  statuses: string[]; onSelectUser: (uid: string) => void;
}) {
  // ── Urutan daftar karyawan (default A–Z). Sort lokal di panel biar
  //    nggak ganggu sort punya parent. Wajib salin array dulu ([...]) karena
  //    .sort() itu mutasi — nyort prop langsung = efek samping ke data parent.
  const [sortBy, setSortBy] = useState<"NAMA_ASC" | "NAMA_DESC" | "LEMBUR_DESC" | "LEMBUR_ASC">("NAMA_ASC");
  const sortedGroups = useMemo(() => {
    const arr = [...groupedByUser];
    switch (sortBy) {
      case "NAMA_DESC": return arr.sort((a, b) => b.user.name.localeCompare(a.user.name, "id-ID"));
      case "LEMBUR_DESC": return arr.sort((a, b) => b.items.length - a.items.length);
      case "LEMBUR_ASC": return arr.sort((a, b) => a.items.length - b.items.length);
      default: return arr.sort((a, b) => a.user.name.localeCompare(b.user.name, "id-ID"));
    }
  }, [groupedByUser, sortBy]);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-bold text-gray-900 text-sm">Daftar Karyawan</p>
          <span className="text-[10px] text-gray-500 bg-gray-100 font-semibold px-2.5 py-1 rounded-full tabular-nums">{groupedByUser.length} karyawan</span>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
            <input type="text" placeholder="Cari nama karyawan..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-3.5 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all placeholder:text-gray-300" />
          </div>
          {/* ── Urutan / sort daftar karyawan ── */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as typeof sortBy)}
            className="h-9 px-3 border border-gray-200 rounded-xl text-[10px] font-semibold text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all cursor-pointer flex-shrink-0"
          >
            <option value="NAMA_ASC">Nama A–Z</option>
            <option value="NAMA_DESC">Nama Z–A</option>
            <option value="LEMBUR_DESC">Lembur terbanyak</option>
            <option value="LEMBUR_ASC">Lembur tersedikit</option>
          </select>
          {statuses.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
              {["Semua", ...statuses].map(s => {
                const c = s !== "Semua" ? STATUS_CONFIG[s] : null;
                const active = filterStatus === s;
                const Icon = c?.icon;
                return (
                  <button key={s} onClick={() => setFilterStatus(s)}
                    className={`flex-shrink-0 h-9 px-3 rounded-xl text-[10px] font-semibold transition-all border ${active ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"}`}>
                    {c && Icon ? <span className="inline-flex items-center gap-1"><Icon size={12} />{c.label}</span> : "Semua"}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {loading ? (
        <div className="divide-y divide-gray-50">
          {Array(5).fill(0).map((_, i) => (
            <div key={i} className="px-5 py-4 flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-gray-100 animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-gray-100 rounded-lg animate-pulse w-36" />
                <div className="h-2.5 bg-gray-100 rounded-lg animate-pulse w-24" />
              </div>
              <div className="w-12 h-7 bg-gray-100 rounded-lg animate-pulse" />
            </div>
          ))}
        </div>
      ) : groupedByUser.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2.5">
          <Inbox size={30} className="text-gray-300" />
          <p className="text-xs font-semibold text-gray-400">Tidak ada data lemburan</p>
          <p className="text-[10px] text-gray-300">Coba ubah filter atau hapus pencarian</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {sortedGroups.map(({ user, items }) => {
            const bg = avBg(user.name);
            const hasUrgent = items.some(o => o.status === "NEED_PROOF" || (o.status === "PENDING" && canApproveTarget(currentUser?.roles ?? currentUser?.role, user.role)));
            const hasOngoing = items.some(o => o.status === "ONGOING");
            const totalPay = items.reduce((s, o) => s + (o.total_pay ?? 0), 0);
            const statusCounts: Record<string, number> = {};
            items.forEach(o => { statusCounts[o.status] = (statusCounts[o.status] || 0) + 1; });
            return (
              <button key={user.id} onClick={() => onSelectUser(user.id)}
                className="w-full px-5 py-4 flex items-center gap-3.5 hover:bg-gray-50/80 transition-colors text-left group">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 ${bg}`}>{initials(user.name)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-semibold text-gray-900 text-sm leading-tight">{user.name}</p>
                    {hasUrgent && <span className="text-[8px] font-bold text-orange-600 bg-orange-50 border border-orange-100 px-1.5 py-0.5 rounded-md">Perlu tindakan</span>}
                    {hasOngoing && !hasUrgent && <span className="text-[8px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-md">Berjalan</span>}
                  </div>
                  <p className="text-[10px] text-gray-400">{user.role.replace(/_/g, " ")}</p>
                </div>
                <div className="flex items-center gap-2.5 flex-shrink-0">
                  <div className="hidden sm:flex items-center gap-1.5">
                    {Object.entries(statusCounts).slice(0, 2).map(([s, c]) => {
                      const cfg = STATUS_CONFIG[s]; if (!cfg) return null;
                      return <span key={s} className={`text-[8px] font-semibold px-1.5 py-0.5 rounded border ${cfg.bg} ${cfg.text} ${cfg.border}`}>{c} {cfg.label}</span>;
                    })}
                    {items.some(o => o.is_holiday) && (
                      <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded border bg-purple-50 text-purple-700 border-purple-200"> Libur</span>
                    )}
                  </div>
                  {userCanViewPay && totalPay > 0 && (
                    <p className="hidden lg:block text-[10px] font-semibold text-gray-600 font-mono">{formatRupiah(totalPay)}</p>
                  )}
                  <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-600">{items.length}</div>
                  <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── MAIN PAGE ──────────────────────────────────────────────────────────────
export default function OvertimePage() {
  const [overtimes, setOvertimes] = useState<OvertimeRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState("Semua");
  const [searchQuery, setSearchQuery] = useState("");
  const [calendarMonth, setCalendarMonth] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [showRecap, setShowRecap] = useState(false); // ✅ NEW — toggle rekap bulanan
  const [recapUserId, setRecapUserId] = useState<string>(""); // ✅ NEW
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedUserId = searchParams.get("user");

  const setSelectedUserId = useCallback(
    (uid: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (uid) params.set("user", uid);
      else params.delete("user");
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [router, searchParams]
  );
  const [detailData, setDetailData] = useState<OvertimeRequest | null>(null);
  const [setPayData, setSetPayData] = useState<OvertimeRequest | null>(null);
  const [completeData, setCompleteData] = useState<OvertimeRequest | null>(null);
  const [approveData, setApproveData] = useState<OvertimeRequest | null>(null);
  const [rejectData, setRejectData] = useState<OvertimeRequest | null>(null);
  const [proofPhotoData, setProofPhotoData] = useState<OvertimeRequest | null>(null);
  const [editData, setEditData] = useState<OvertimeRequest | null>(null);
  const [deleteData, setDeleteData] = useState<OvertimeRequest | null>(null);
  const [activeTab, setActiveTab] = useState<"KARYAWAN" | "PKL">("KARYAWAN"); // sudah tidak dipakai di UI baru — boleh dihapus nanti

  // ✅ NEW — dibuka otomatis kalau datang dari redirect /face-verify?fillDetail=<id>
  const fillDetailIdFromUrl = searchParams.get("fillDetail");
  const [fillDetailOvertime, setFillDetailOvertime] = useState<{ id: string; minutes: number; direction: string } | null>(null);
  const autoCompletingIds = useRef<Set<string>>(new Set());
  const listScrollPositionRef = useRef<number>(0);
  const lastOvertimeRefreshRef = useRef<number>(Date.now());

  useEffect(() => { getCurrentUserClient().then(u => setCurrentUser(u)); }, []);

  useEffect(() => {
    if (selectedUserId) return; // lagi buka detail, jangan diapa-apain
    const raf = requestAnimationFrame(() => {
      window.scrollTo({ top: listScrollPositionRef.current, behavior: "auto" });
    });
    return () => cancelAnimationFrame(raf);
  }, [selectedUserId]);

  //  FIX: fetchOvertimes sekarang terima year & month sebagai param
  // Sebelumnya selalu fetch bulan ini saja, jadi input manual bulan lalu tidak muncul
  const fetchOvertimes = useCallback(async (year?: number, month?: number) => {
    const y = year ?? new Date().getFullYear();
    const m = month ?? (new Date().getMonth() + 1);
    const r = await fetch(`/api/attendance/overtime?year=${y}&month=${m}`);
    const d = await r.json();
    if (d.success) setOvertimes(d.data || []);
  }, []);

  const fetchAllUsers = useCallback(async () => {
    const r = await fetch("/api/users");
    const d = await r.json();
    if (d.success) setAllUsers(d.users || []);
  }, []);

  //  FIX: Helper refetch selalu pakai calendarMonth yang aktif saat itu
  // Dipakai di semua modal onSaved/onDeleted supaya setelah aksi, data yang
  // ditampilkan tetap sesuai bulan yang sedang dilihat user (bukan reset ke bulan ini)
  const refetch = useCallback(() => {
    fetchOvertimes(calendarMonth.year, calendarMonth.month + 1);
  }, [fetchOvertimes, calendarMonth]);

  //  FIX: useEffect fetch data ikut calendarMonth sebagai dependency
  // Setiap kali user navigasi ke bulan lain di kalender, data di-fetch ulang
  useEffect(() => {
    if (currentUser === null) return;
    setLoading(true);
    Promise.all([
      fetchOvertimes(calendarMonth.year, calendarMonth.month + 1),
      fetchAllUsers(),
    ]).finally(() => setLoading(false));
  }, [fetchOvertimes, fetchAllUsers, currentUser?.role, calendarMonth]);


  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) return;
      const now = Date.now();
      if (now - lastOvertimeRefreshRef.current < 15_000) return; // throttle 15 detik
      lastOvertimeRefreshRef.current = now;
      refetch();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleVisibilityChange);
    };
  }, [refetch]);

  useEffect(() => {
    if (!fillDetailIdFromUrl) return;
    const found = overtimes.find((o) => o.id === fillDetailIdFromUrl);
    if (!found) return;

    const alreadySubmitted = !!(found as any).category && !!found.work_description;
    if (alreadySubmitted) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("fillDetail");
      router.replace(params.toString() ? `?${params.toString()}` : "?", { scroll: false });
      return;
    }

    setFillDetailOvertime({ id: found.id, minutes: (found as any).duration_minutes ?? 0, direction: (found as any).direction ?? "MANUAL" });
  }, [fillDetailIdFromUrl, overtimes, searchParams, router]);

  useEffect(() => {
    if (!currentUser) return;
    const parse = (iso: string | null) => { if (!iso) return 0; try { const t = new Date(iso).getTime(); return isNaN(t) ? 0 : t; } catch { return 0; } };
    const id = setInterval(() => {
      const now = Date.now();
      overtimes.forEach(o => {
        if (o.user_id !== currentUser.id || o.status !== "ONGOING" || o.actual_end || autoCompletingIds.current.has(o.id)) return;
        const t = parse(o.scheduled_end); if (t === 0 || t > now) return;
        handleAutoComplete(o);
      });
    }, 5000);
    return () => clearInterval(id);
  }, [overtimes, currentUser]);

  //  FIX: handleAutoComplete pakai refetch() bukan fetchOvertimes() tanpa param
  const handleAutoComplete = async (overtime: OvertimeRequest) => {
    if (autoCompletingIds.current.has(overtime.id)) return;
    autoCompletingIds.current.add(overtime.id);
    try {
      const res = await fetch("/api/attendance/overtime", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: overtime.id, action: "COMPLETE", proof_photo_url: null, auto_completed: true }) });
      const d = await res.json();
      if (d.success) {
        refetch();
        setCompleteData({ ...overtime, ...d.data, auto_completed: true });
        setTimeout(() => { autoCompletingIds.current.delete(overtime.id); }, 5000);
      } else {
        autoCompletingIds.current.delete(overtime.id);
      }
    } catch { autoCompletingIds.current.delete(overtime.id); }
  };

  const filtered = useMemo(() => {
    let list = overtimes;
    if (filterStatus !== "Semua") list = list.filter(o => o.status === filterStatus);
    if (selectedDate) list = list.filter(o => o.request_date === selectedDate);
    return list;
  }, [overtimes, filterStatus, selectedDate]);

  const groupedByUser = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const map = new Map<string, { user: { id: string; name: string; role: string }; items: OvertimeRequest[] }>();

    if (!selectedDate && filterStatus === "Semua") {
      allUsers.forEach(u => { if (!q || u.name.toLowerCase().includes(q)) map.set(u.id, { user: u, items: [] }); });
    }
    filtered.forEach(o => {
      if (!o.users) return;
      const uid = o.user_id;
      if (map.has(uid)) { map.get(uid)!.items.push(o); }
      else if (!q || o.users.name.toLowerCase().includes(q)) { map.set(uid, { user: o.users, items: [o] }); }
    });
    const hasFilter = filterStatus !== "Semua" || !!selectedDate;
    const result = Array.from(map.values()).filter(g => !hasFilter || g.items.length > 0);
    return result.sort((a, b) => a.user.name.localeCompare(b.user.name, "id-ID"));
  }, [filtered, allUsers, filterStatus, searchQuery, selectedDate]);

  const tableRows: OvertimeTableRow[] = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return filtered
      .filter((o) => o.users)
      .filter((o) => !q || o.users!.name.toLowerCase().includes(q))
      .sort((a, b) => new Date(b.request_date).getTime() - new Date(a.request_date).getTime()) as unknown as OvertimeTableRow[];
  }, [filtered, searchQuery]);

  const groupedKaryawan = useMemo(
    () => groupedByUser.filter(g => !isUserPKL(g.user.role)),
    [groupedByUser]
  );

  const groupedPKL = useMemo(
    () => groupedByUser.filter(g => isUserPKL(g.user.role)),
    [groupedByUser]
  );

  const activeGroupedByUser = activeTab === "KARYAWAN" ? groupedKaryawan : groupedPKL;

  const selectedUserData = useMemo(() => {
    if (!selectedUserId) return null;
    const allUserOTs = overtimes.filter(o => o.user_id === selectedUserId);
    const user = allUserOTs[0]?.users ?? allUsers.find(u => u.id === selectedUserId) ?? null;
    return user ? { user, items: allUserOTs } : null;
  }, [selectedUserId, overtimes, allUsers]);

  const statuses = useMemo(() => [...new Set(overtimes.map(o => o.status))], [overtimes]);

  const thisMonthOvertimes = overtimes.filter(o => toWIBDateKey(o.request_date).startsWith(`${calendarMonth.year}-${pad2(calendarMonth.month + 1)}`));
  const byDate = useMemo(() => { const m: Record<string, OvertimeRequest[]> = {}; thisMonthOvertimes.forEach(o => { const k = toWIBDateKey(o.request_date); if (!m[k]) m[k] = []; m[k].push(o); }); return m; }, [thisMonthOvertimes]);
  const calDays = useMemo(() => {
    const fd = new Date(calendarMonth.year, calendarMonth.month, 1).getDay(), dim = new Date(calendarMonth.year, calendarMonth.month + 1, 0).getDate();
    const c: (number | null)[] = []; for (let i = 0; i < fd; i++) c.push(null); for (let d = 1; d <= dim; d++) c.push(d); return c;
  }, [calendarMonth.year, calendarMonth.month]);

  const handleDateSelect = (dk: string) => {
    if (selectedDate === dk) { setSelectedDate(null); return; }
    setSelectedDate(dk); setSelectedUserId(null); setFilterStatus("Semua"); setSearchQuery("");
  };

  const statCards = [
    { label: "Total", value: overtimes.length, icon: <FileText className="w-5 h-5 text-gray-500" />, color: "text-gray-800", accent: "from-gray-50 to-gray-100/50" },
    { label: "Pending", value: overtimes.filter(o => o.status === "PENDING").length, icon: <Clock className="w-5 h-5 text-amber-500" />, color: "text-amber-600", accent: "from-amber-50 to-amber-100/30" },
    { label: "Berjalan", value: overtimes.filter(o => o.status === "ONGOING").length, icon: <Loader2 className="w-5 h-5 text-emerald-500" />, color: "text-emerald-600", accent: "from-emerald-50 to-emerald-100/30" },
    { label: "Selesai", value: overtimes.filter(o => o.status === "COMPLETED").length, icon: <CheckCircle2 className="w-5 h-5 text-blue-500" />, color: "text-blue-600", accent: "from-blue-50 to-blue-100/30" },
  ];

  const userCanViewPay = canViewPay(currentUser?.roles ?? currentUser?.role);

  const notifyRoles = useMemo<string[]>(
    () => Array.isArray(currentUser?.roles) && currentUser.roles.length > 0 ? currentUser.roles : currentUser?.role ? [currentUser.role] : [],
    [currentUser]
  );
  const { pending: pendingAccOvertimes } = useOvertimeNotify(notifyRoles, currentUser?.id);

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-[#F7F7F8]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-5">

          {/* ── Page Header ── */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <div className="w-1 h-6 rounded-full bg-violet-600 flex-shrink-0" />
                <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">Lembur Karyawan</h1>
              </div>
              <p className="text-xs text-gray-400 pl-4">
                {loading ? "Memuat data..." : `${overtimes.length} lemburan · ${groupedByUser.length} karyawan`}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
             <button onClick={() => router.push("/dashboard/attendance/overtime/leaderboard")}
                className="h-9 px-4 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap shadow-sm hover:shadow">
                <Trophy size={16} /><span className="hidden sm:inline">Leaderboard</span>
              </button>
              <button onClick={() => { setShowRecap(v => !v); if (!recapUserId && currentUser?.id) setRecapUserId(currentUser.id); }}
                className={`h-9 px-4 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap shadow-sm hover:shadow border ${showRecap ? "bg-gray-900 text-white border-gray-900" : "bg-white border-gray-200 hover:border-gray-300 text-gray-700"}`}>
                <CalendarDays size={16} /><span className="hidden sm:inline">Rekap Bulanan</span>
              </button>
              {canInputManual(currentUser?.roles ?? (currentUser?.role ? [currentUser.role] : [])) && (
                <button onClick={() => setShowManualModal(true)}
                  className="h-9 px-4 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap shadow-sm hover:shadow">
                  <Pencil size={16} /><span className="hidden sm:inline">Input Manual</span>
                </button>
              )}
              {/* ✅ REMOVED (poin 2): pengajuan mandiri sudah tidak relevan —
                  lembur sekarang otomatis dari absen masuk lebih awal / pulang lebih larut */}
            </div>
          </div>

          {/* ── Stat Cards ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {statCards.map(c => (
              <div key={c.label} className={`bg-gradient-to-br ${c.accent} rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3`}>
                <div className="w-9 h-9 rounded-xl bg-white/80 border border-white shadow-sm flex items-center justify-center text-sm flex-shrink-0">{c.icon}</div>
                <div className="min-w-0">
                  <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest leading-none mb-1.5">{c.label}</p>
                  <p className={`text-2xl font-black leading-none ${c.color}`}>
                    {loading ? <span className="inline-block w-7 h-5 bg-white/60 rounded-lg animate-pulse" /> : c.value}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Calendar ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-sm flex-shrink-0 shadow-sm"><Clock className="w-4 h-4 text-gray-500" /></div>
                <div>
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-0.5">Kalender Lembur</p>
                  <p className="font-bold text-gray-900 text-sm">{MONTH_NAMES[calendarMonth.month]} {calendarMonth.year}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setCalendarMonth(m => ({ month: m.month === 0 ? 11 : m.month - 1, year: m.month === 0 ? m.year - 1 : m.year }))}
                  className="w-8 h-8 rounded-xl hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-800 transition-all font-bold text-base">‹</button>
                <button onClick={() => setCalendarMonth({ year: new Date().getFullYear(), month: new Date().getMonth() })}
                  className="h-8 px-3 rounded-xl hover:bg-gray-100 text-[10px] font-semibold text-gray-500 hover:text-gray-800 transition-all">Hari ini</button>
                <button onClick={() => setCalendarMonth(m => ({ month: m.month === 11 ? 0 : m.month + 1, year: m.month === 11 ? m.year + 1 : m.year }))}
                  className="w-8 h-8 rounded-xl hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-800 transition-all font-bold text-base">›</button>
              </div>
            </div>
            <div className="p-4 overflow-x-auto">
              <div className="grid grid-cols-7 gap-1 mb-2 min-w-[280px]">
                {DAY_NAMES.map((d, i) => (
                  <div key={d} className={`text-center text-[9px] font-bold py-1 uppercase tracking-wider ${i === 0 ? "text-red-400" : "text-gray-400"}`}>{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1 min-w-[280px]">
                {calDays.map((day, idx) => {
                  if (!day) return <div key={`e-${idx}`} />;
                  const dk = `${calendarMonth.year}-${pad2(calendarMonth.month + 1)}-${pad2(day)}`;
                  const total = (byDate[dk] || []).length;
                  const isSel = dk === selectedDate;
                  const isToday = dk === new Date().toISOString().slice(0, 10);
                  const isSun = new Date(dk + "T12:00:00").getDay() === 0;
                  return (
                    <button key={day} onClick={() => handleDateSelect(dk)}
                      className={`relative flex flex-col items-center justify-start pt-2 pb-1.5 rounded-xl min-h-[52px] sm:min-h-[64px] transition-all border active:scale-95 ${isSel ? "bg-gray-900 border-gray-900 shadow-md" : total > 0 ? "bg-violet-50 border-violet-100 hover:bg-violet-100 hover:border-violet-200" : "bg-transparent border-gray-100 hover:bg-gray-50"}`}>
                      <span className={`font-bold text-sm leading-none mb-1.5 ${isSel ? "text-white" : isToday ? "text-violet-600" : isSun ? "text-red-400" : "text-gray-700"}`}>{day}</span>
                      {isToday && !isSel && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-violet-500" />}
                      {total > 0 && (
                        <span className={`text-[9px] font-bold rounded-full px-1.5 py-0.5 leading-none ${isSel ? "bg-white/20 text-white" : "bg-violet-500 text-white"}`}>{total}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            {selectedDate && (
              <div className="px-4 pb-4">
                <div className="flex items-center gap-3 bg-violet-50 border border-violet-100 rounded-xl px-4 py-2.5">
                  <span className="text-sm"><CalendarDays className="w-4 h-4 text-violet-600" /></span>
                  <p className="text-xs text-gray-700 flex-1">
                    <span className="font-semibold">{new Date(selectedDate + "T12:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" })}</span>
                    <span className="text-gray-400 ml-1.5">· {(byDate[selectedDate] || []).length} lemburan</span>
                  </p>
                  <button onClick={() => setSelectedDate(null)} className="text-[10px] text-violet-500 hover:text-violet-700 font-semibold transition-colors"> Hapus</button>
                </div>
              </div>
            )}
          </div>

          {/* ── Tab Karyawan / PKL ── */}
          {!selectedUserId && (
            <div className="flex gap-1 p-1 bg-white rounded-2xl border border-gray-100 shadow-sm">
              {(["KARYAWAN", "PKL"] as const).map(tab => {
                const count = tab === "KARYAWAN" ? groupedKaryawan.length : groupedPKL.length;
                const active = activeTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => { setActiveTab(tab); setSearchQuery(""); setFilterStatus("Semua"); setSelectedUserId(null); }}
                    className={`flex-1 flex items-center justify-center gap-2 h-11 rounded-xl text-xs font-bold transition-all active:scale-[0.98] ${active
                      ? "bg-[#0f0c29] text-white shadow-md"
                      : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                      }`}
                  >
                    <span className="text-sm">{tab === "KARYAWAN" ? "" : ""}</span>
                    <span>{tab === "KARYAWAN" ? "Karyawan" : "PKL"}</span>
                    <span className={`min-w-[22px] h-[22px] px-1.5 rounded-full flex items-center justify-center text-[10px] font-black tabular-nums transition-colors ${active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
                      }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

        {/* ── Poin 14: SOP wajib tampil di halaman lembur ── */}
          <OvertimeSOPBanner />

          {/* ✅ NEW — Rekap Bulanan per karyawan (dihitung ulang dari face_verifications) */}
          {showRecap && (
            <div className="space-y-3">
              {(isAdminRole(currentUser?.roles ?? currentUser?.role) || canInputManual(currentUser?.roles ?? (currentUser?.role ? [currentUser.role] : []))) && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                  <label className={lbl}>Pilih Karyawan</label>
                  <select value={recapUserId} onChange={e => setRecapUserId(e.target.value)} className={inp + " cursor-pointer"}>
                    <option value="">— Pilih karyawan —</option>
                    <option value="ALL">— Semua Karyawan —</option>
                    {[...allUsers].sort((a, b) => a.name.localeCompare(b.name, "id-ID")).map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.role.replace(/_/g, " ")})</option>
                    ))}
                  </select>
                </div>
              )}
              {recapUserId === "ALL" && (
                <div className="space-y-4">
                  {[...allUsers].sort((a, b) => a.name.localeCompare(b.name, "id-ID")).map(u => (
                    <OvertimeRecapTable key={u.id} userId={u.id} />
                  ))}
                </div>
              )}
              {recapUserId && recapUserId !== "ALL" && <OvertimeRecapTable userId={recapUserId} />}
            </div>
          )}

          {/* ── Search + Status filter — khusus tab Karyawan; tab PKL punya filter sendiri di EmployeeListPanel ── */}
          {activeTab === "KARYAWAN" && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
                <input
                  type="text"
                  placeholder="Cari nama karyawan..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full h-9 pl-9 pr-3.5 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all placeholder:text-gray-300"
                />
              </div>
              {statuses.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
                  {["Semua", ...statuses].map(s => {
                    const c = s !== "Semua" ? STATUS_CONFIG[s] : null;
                    const active = filterStatus === s;
                    const Icon = c?.icon;
                    return (
                      <button key={s} onClick={() => setFilterStatus(s)}
                        className={`flex-shrink-0 h-9 px-3 rounded-xl text-[10px] font-semibold transition-all border ${active ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"}`}>
                        {c && Icon ? <span className="inline-flex items-center gap-1"><Icon size={12} />{c.label}</span> : "Semua"}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Karyawan: sistem otomatis IN/OUT — PKL: sistem manual + ACC atasan ── */}
          {activeTab === "KARYAWAN" ? (
            <OvertimeTable
              rows={tableRows}
              loading={loading}
              canApprove={(targetRole) => canApproveTarget(currentUser?.roles ?? currentUser?.role, targetRole)}
              canAudit={isAdminRole(currentUser?.roles ?? currentUser?.role)}
              currentUserId={currentUser?.id}
              onRefresh={refetch}
            />
          ) : (
            selectedUserId && selectedUserData ? (
              <EmployeeDetailView
                userId={selectedUserId}
                name={selectedUserData.user.name}
                role={selectedUserData.user.role}
                overtimes={selectedUserData.items}
                userCanViewPay={userCanViewPay}
                currentUser={currentUser}
                onBack={() => setSelectedUserId(null)}
                onDetailOpen={(o) => setDetailData(o)}
              />
            ) : (
              <EmployeeListPanel
                groupedByUser={groupedPKL}
                loading={loading}
                userCanViewPay={userCanViewPay}
                currentUser={currentUser}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                filterStatus={filterStatus}
                setFilterStatus={setFilterStatus}
                statuses={statuses}
                onSelectUser={(uid) => setSelectedUserId(uid)}
              />
            )
          )}

        </div>
      </div>

      {/* ── Modals ── */}
      {/*  FIX: Semua onSaved/onDeleted pakai refetch() bukan fetchOvertimes() */}
      {showRequestModal && <RequestOvertimeModal onClose={() => setShowRequestModal(false)} onSaved={() => { refetch(); setShowRequestModal(false); }} currentUser={currentUser} />}
      {showManualModal && <ManualOvertimeModal onClose={() => setShowManualModal(false)} onSaved={() => { refetch(); setShowManualModal(false); }} allUsers={allUsers} currentUser={currentUser} />}
      {approveData && <ApproveModal overtime={approveData} onClose={() => setApproveData(null)} onSaved={() => { refetch(); setApproveData(null); }} />}
      {rejectData && <RejectModal overtime={rejectData} onClose={() => setRejectData(null)} onSaved={() => { refetch(); setRejectData(null); }} />}
      {setPayData && <SetPayModal overtime={setPayData} onClose={() => setSetPayData(null)} onSaved={() => { refetch(); setSetPayData(null); }} />}
      {completeData && <CompleteModal overtime={completeData} onClose={() => setCompleteData(null)} onSaved={() => { refetch(); setCompleteData(null); }} isAutoCompleted={completeData.auto_completed} />}
      {proofPhotoData && <ProofPhotoModal overtime={proofPhotoData} onClose={() => setProofPhotoData(null)} canViewPay={userCanViewPay} />}
      {editData && <EditOvertimeModal overtime={editData} onClose={() => setEditData(null)} onSaved={() => { refetch(); setEditData(null); }} />}
      {deleteData && <DeleteConfirmModal overtime={deleteData} onClose={() => setDeleteData(null)} onDeleted={() => { refetch(); setDeleteData(null); }} canViewPay={userCanViewPay} />}
      {fillDetailOvertime && (
        <OvertimeFillDetailModal
          overtimeId={fillDetailOvertime.id}
          minutes={fillDetailOvertime.minutes}
          direction={fillDetailOvertime.direction}
          onClose={() => {
            setFillDetailOvertime(null);
            const params = new URLSearchParams(searchParams.toString());
            params.delete("fillDetail");
            router.replace(params.toString() ? `?${params.toString()}` : "?", { scroll: false });
          }}
          onSaved={refetch}
        />
      )}
      {
        detailData && (
          <OvertimeDetailModal
            overtime={detailData} onClose={() => setDetailData(null)} userCanViewPay={userCanViewPay} currentUser={currentUser}
            onApprove={() => setApproveData(detailData)} onReject={() => setRejectData(detailData)} onComplete={() => setCompleteData(detailData)}
            onSetPay={() => setSetPayData(detailData)} onProofPhoto={() => setProofPhotoData(detailData)}
            onEdit={() => setEditData(detailData)} onDelete={() => setDeleteData(detailData)}
          />
        )
      }

      <OvertimePendingPopup pending={pendingAccOvertimes} />

      <style jsx global>{`
          @keyframes modalUp {
            from { opacity: 0; transform: translateY(16px) scale(0.97); }
            to   { opacity: 1; transform: translateY(0)    scale(1);    }
          }
          .scrollbar-hide::-webkit-scrollbar { display: none; }
          .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        `}</style>
    </DashboardLayout >
  );
}