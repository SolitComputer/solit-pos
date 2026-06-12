"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { getCurrentUserClient } from "@/lib/auth-client";
import DashboardLayout from "@/components/layout/DashboardLayout";

type OvertimeRequest = {
  id: string;
  user_id: string;
  request_date: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  work_description: string | null;
  proof_photo_url: string | null;
  status: "PENDING" | "APPROVED" | "ONGOING" | "COMPLETED" | "REJECTED" | "CANCELLED";
  rate_per_hour: number | null;
  total_pay: number | null;
  auto_completed: boolean;
  created_at: string;
  reason?: string;
  requested_start?: string;
  completed_at?: string;
  rejection_note?: string;
  users?: { id: string; name: string; role: string };
  approver?: { id: string; name: string; role: string } | null;
};

type User = { id: string; name: string; role: string };

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

const FULL_ACCESS_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"] as const;
const DIVISION_HEAD_ROLES = ["KEPALA_SALES", "KEPALA_MARKETING", "KEPALA_TEKNISI"] as const;

function isAdminRole(role?: string): boolean {
  return !!role && (FULL_ACCESS_ROLES as readonly string[]).includes(role);
}
function canApproveRole(role?: string): boolean {
  return isAdminRole(role) || (!!role && (DIVISION_HEAD_ROLES as readonly string[]).includes(role));
}
function canSetPay(role?: string): boolean {
  return !!role && (FULL_ACCESS_ROLES as readonly string[]).includes(role);
}

function formatRupiah(n: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  if (iso.includes(":") && !iso.includes("T")) return iso.substring(0, 5);
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
}
function toWIBDateKey(iso: string): string {
  return new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function initials(name: string): string {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}
function pad2(n: number) { return String(n).padStart(2, "0"); }

function addWatermarkToImage(
  imageDataUrl: string,
  callback: (watermarkedBlob: Blob, previewUrl: string) => void
) {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    const watermarkText = `${now.getUTCDate()}-${months[now.getUTCMonth()]}-${now.getUTCFullYear()} (${days[now.getUTCDay()]}) • ${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")} WIB`;
    const padding = 12;
    const fontSize = Math.max(16, canvas.width / 40);
    ctx.font = `bold ${fontSize}px Arial`;
    const textWidth = ctx.measureText(watermarkText).width;
    const bgX = padding, bgY = canvas.height - fontSize - padding - 10;
    const bgWidth = textWidth + padding * 2, bgHeight = fontSize + padding;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(bgX, bgY, bgWidth, bgHeight);
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 2;
    ctx.strokeRect(bgX, bgY, bgWidth, bgHeight);
    ctx.fillStyle = "white";
    ctx.textBaseline = "middle";
    ctx.fillText(watermarkText, bgX + padding, bgY + bgHeight / 2);
    canvas.toBlob(
      (blob) => { if (blob) callback(blob, URL.createObjectURL(blob)); },
      "image/jpeg",
      0.95
    );
  };
  img.onerror = () => console.error("Failed to load image for watermark");
  img.src = imageDataUrl;
}

const STATUS_CONFIG: Record<string, {
  label: string; icon: string; bg: string; text: string; border: string; dot: string;
}> = {
  PENDING: { label: "Pending", icon: "⏳", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-400" },
  APPROVED: { label: "Disetujui", icon: "✅", bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200", dot: "bg-violet-500" },
  ONGOING: { label: "Berjalan", icon: "🟢", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
  COMPLETED: { label: "Selesai", icon: "🏁", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", dot: "bg-blue-500" },
  REJECTED: { label: "Ditolak", icon: "✕", bg: "bg-red-50", text: "text-red-700", border: "border-red-200", dot: "bg-red-500" },
  CANCELLED: { label: "Dibatalkan", icon: "⊘", bg: "bg-gray-100", text: "text-gray-500", border: "border-gray-200", dot: "bg-gray-400" },
};

function StatusBadge({ status }: { status: OvertimeRequest["status"] }) {
  const cfg = STATUS_CONFIG[status] ?? {
    label: status, icon: "?", bg: "bg-gray-100", text: "text-gray-600",
    border: "border-gray-200", dot: "bg-gray-400",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] sm:text-xs font-bold px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} flex-shrink-0`} />
      {cfg.label}
    </span>
  );
}

const AVATAR_COLORS = [
  "from-violet-500 to-violet-700", "from-blue-500 to-blue-700", "from-emerald-500 to-emerald-700",
  "from-rose-500 to-rose-700", "from-amber-500 to-amber-600", "from-cyan-500 to-cyan-700", "from-fuchsia-500 to-fuchsia-700",
];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

// ── Shared UI primitives ────────────────────────────────────────────────────
function ModalWrapper({
  children, onClose, preventClose,
}: {
  children: React.ReactNode; onClose: () => void; preventClose?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
      onClick={preventClose ? undefined : onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-[2rem] sm:rounded-2xl shadow-2xl overflow-hidden"
        style={{ animation: "modalUp 0.32s cubic-bezier(0.22,1,0.36,1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function ModalHeader({
  icon, title, subtitle, onClose, disableClose,
}: {
  icon: string; title: string; subtitle?: string; onClose: () => void; disableClose?: boolean;
}) {
  return (
    <div className="px-6 pt-6 pb-5 border-b border-gray-100">
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-gray-900 to-gray-700 flex items-center justify-center text-xl flex-shrink-0 shadow-lg">
          {icon}
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          <h2 className="text-base font-black text-gray-900 tracking-tight">{title}</h2>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5 truncate">{subtitle}</p>}
        </div>
        <button
          onClick={onClose}
          disabled={disableClose}
          className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all flex-shrink-0 ${disableClose
            ? "text-gray-200 cursor-not-allowed"
            : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
            }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/60 flex gap-3">
      {children}
    </div>
  );
}

const inputCls =
  "w-full h-11 border border-gray-200 rounded-xl px-4 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all placeholder:text-gray-300";
const labelCls =
  "text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-2";
const primaryBtn =
  "flex-1 h-11 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed";
const secondaryBtn =
  "flex-1 h-11 bg-white border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50 hover:border-gray-300 transition-all active:scale-[0.98]";

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-3 rounded-xl">
      <span className="text-base flex-shrink-0">⚠️</span>
      <span className="font-medium leading-relaxed">{msg}</span>
    </div>
  );
}

function Spinner() {
  return <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />;
}

// ── ProofPhotoModal ──────────────────────────────────────────────────────────
function ProofPhotoModal({
  overtime, onClose,
}: {
  overtime: OvertimeRequest; onClose: () => void;
}) {
  if (!overtime.proof_photo_url) return null;
  return (
    <ModalWrapper onClose={onClose}>
      <ModalHeader icon="📷" title="Bukti Lemburan" subtitle={overtime.users?.name} onClose={onClose} />
      <div className="px-6 py-5 space-y-4 max-h-[80vh] overflow-y-auto">
        <img
          src={overtime.proof_photo_url}
          alt="Bukti Lemburan"
          className="w-full h-64 object-cover rounded-2xl border border-gray-100 shadow-md"
        />
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3.5">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Tanggal</p>
            <p className="font-bold text-gray-800 text-sm">
              {new Date(overtime.request_date).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3.5">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Durasi</p>
            <p className="font-bold text-gray-800 text-sm font-mono">
              {formatTime(overtime.actual_start ?? overtime.scheduled_start)} – {formatTime(overtime.actual_end ?? overtime.scheduled_end)}
            </p>
          </div>
        </div>
        {overtime.total_pay != null && (
          <div className="rounded-2xl p-4 bg-gradient-to-br from-gray-900 to-gray-800 text-white">
            <p className="text-xs text-gray-400 font-medium mb-1">Total Bayaran</p>
            <p className="text-2xl font-black tracking-tight">{formatRupiah(overtime.total_pay)}</p>
          </div>
        )}
      </div>
      <ModalFooter>
        <button onClick={onClose} className={primaryBtn}>Tutup</button>
      </ModalFooter>
    </ModalWrapper>
  );
}

// ── ApproveModal ─────────────────────────────────────────────────────────────
function ApproveModal({
  overtime, onClose, onSaved,
}: {
  overtime: OvertimeRequest; onClose: () => void; onSaved: () => void;
}) {
  const [scheduledStart, setScheduledStart] = useState(
    overtime.requested_start?.substring(0, 5) || "09:00"
  );
  const [scheduledEnd, setScheduledEnd] = useState("17:00");
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState("");

  const approve = async () => {
    if (!scheduledStart.trim()) { setError("Jam mulai wajib diisi"); return; }
    if (!scheduledEnd.trim()) { setError("Jam selesai wajib diisi"); return; }
    const startMs = new Date(`1970-01-01T${scheduledStart}:00`).getTime();
    const endMs = new Date(`1970-01-01T${scheduledEnd}:00`).getTime();
    if (endMs <= startMs) { setError("Jam selesai harus lebih besar dari jam mulai"); return; }
    setApproving(true); setError("");
    try {
      const fmt = (t: string) => (t.length === 5 ? `${t}:00` : t);
      const res = await fetch("/api/attendance/overtime", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: overtime.id,
          action: "APPROVE",
          scheduled_start: `${overtime.request_date}T${fmt(scheduledStart)}+07:00`,
          scheduled_end: `${overtime.request_date}T${fmt(scheduledEnd)}+07:00`,
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) { setError(d.message || `Error ${res.status}`); return; }
      onSaved(); onClose();
    } catch (err: any) { setError(err.message || "Gagal disetujui"); }
    finally { setApproving(false); }
  };

  return (
    <ModalWrapper onClose={onClose}>
      <ModalHeader icon="✅" title="Setujui Lemburan" subtitle={overtime.users?.name} onClose={onClose} />
      <div className="px-6 py-5 space-y-4 max-h-[75vh] overflow-y-auto">
        {error && <ErrorBanner msg={error} />}

        {/* Info pengajuan */}
        <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4 space-y-2.5">
          <p className="text-xs font-black text-violet-800 uppercase tracking-wider">Info Pengajuan</p>
          <div className="space-y-2 text-sm text-gray-700">
            <div className="flex justify-between">
              <span className="text-gray-400">Tanggal</span>
              <span className="font-bold">
                {new Date(overtime.request_date).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Jam diminta</span>
              <span className="font-bold font-mono">{formatTime(overtime.requested_start)}</span>
            </div>
            {overtime.reason && (
              <div className="pt-1.5 border-t border-violet-100">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Alasan</p>
                <p className="text-xs text-gray-700 font-semibold">{overtime.reason}</p>
              </div>
            )}
            {overtime.work_description && (
              <div className="pt-1.5 border-t border-violet-100">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Rincian Pekerjaan</p>
                <p className="text-xs text-gray-700 leading-relaxed">{overtime.work_description}</p>
              </div>
            )}
          </div>
        </div>

        {/* Info otomatis mulai */}
        <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
          <span className="text-base flex-shrink-0">⚡</span>
          <p className="text-xs text-emerald-700 font-medium leading-relaxed">
            Setelah disetujui, lembur akan <strong>langsung berjalan otomatis</strong> — karyawan tidak perlu menekan tombol Mulai.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>
              Jam Mulai <span className="text-red-400 normal-case tracking-normal">*</span>
            </label>
            <input
              type="time"
              value={scheduledStart}
              onChange={(e) => setScheduledStart(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>
              Jam Selesai <span className="text-red-400 normal-case tracking-normal">*</span>
            </label>
            <input
              type="time"
              value={scheduledEnd}
              onChange={(e) => setScheduledEnd(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>
      </div>
      <ModalFooter>
        <button onClick={onClose} className={secondaryBtn}>Batal</button>
        <button
          onClick={approve}
          disabled={approving || !scheduledStart || !scheduledEnd}
          className={primaryBtn}
        >
          {approving ? <Spinner /> : "✅ Setujui & Mulai"}
        </button>
      </ModalFooter>
    </ModalWrapper>
  );
}

// ── RequestOvertimeModal ─────────────────────────────────────────────────────
const REASON_OPTIONS = [
  { value: "Tugas Mendesak", icon: "🔴", desc: "Ada tugas yang harus diselesaikan segera" },
  { value: "Pekerjaan Belum Selesai", icon: "🟡", desc: "Pekerjaan hari ini belum tuntas" },
  { value: "Permintaan Atasan", icon: "🔵", desc: "Diminta langsung oleh atasan" },
  { value: "Lainnya", icon: "✏️", desc: "Alasan lain di luar opsi di atas" },
] as const;

function RequestOvertimeModal({
  onClose, onSaved, currentUser,
}: {
  onClose: () => void; onSaved: () => void; currentUser: any;
}) {
  const [requestDate, setRequestDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [reasonType, setReasonType] = useState("");
  const [reasonCustom, setReasonCustom] = useState("");
  const [workDescription, setWorkDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const today = new Date().toISOString().split("T")[0];

  const isLainnya = reasonType === "Lainnya";
  const finalReason = isLainnya ? reasonCustom.trim() : reasonType;

  const canSubmit =
    !!requestDate &&
    !!startTime &&
    !!reasonType &&
    (!isLainnya || !!reasonCustom.trim()) &&
    !!workDescription.trim();

  const submit = async () => {
    if (!requestDate.trim()) { setError("Pilih tanggal terlebih dahulu"); return; }
    if (!startTime.trim()) { setError("Masukkan jam mulai"); return; }
    if (!reasonType) { setError("Pilih alasan lembur"); return; }
    if (isLainnya && !reasonCustom.trim()) { setError("Jelaskan alasan lembur kamu"); return; }
    if (!workDescription.trim()) { setError("Rincian pekerjaan wajib diisi"); return; }

    setSubmitting(true); setError("");
    try {
      const res = await fetch("/api/attendance/overtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_date: requestDate,
          requested_start: `${startTime}:00`,
          reason: finalReason,
          work_description: workDescription.trim(),
        }),
      });
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal mengajukan"); return; }
      onSaved(); onClose();
    } catch { setError("Gagal mengajukan"); }
    finally { setSubmitting(false); }
  };

  return (
    <ModalWrapper onClose={onClose}>
      <ModalHeader
        icon="📝"
        title="Ajukan Lemburan"
        subtitle={currentUser?.name || "Karyawan"}
        onClose={onClose}
      />
      <div className="px-6 py-5 space-y-5 max-h-[78vh] overflow-y-auto">
        {error && <ErrorBanner msg={error} />}

        {/* Tanggal */}
        <div>
          <label className={labelCls}>
            Tanggal Lembur <span className="text-red-400 normal-case tracking-normal">*</span>
          </label>
          <input
            type="date"
            min={today}
            value={requestDate}
            onChange={(e) => setRequestDate(e.target.value)}
            className={inputCls}
          />
        </div>

        {/* Jam Mulai */}
        <div>
          <label className={labelCls}>
            Jam Mulai <span className="text-red-400 normal-case tracking-normal">*</span>
          </label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className={inputCls}
          />
        </div>

        {/* Alasan — pill options */}
        <div>
          <label className={labelCls}>
            Alasan Lembur <span className="text-red-400 normal-case tracking-normal">*</span>
          </label>
          <div className="space-y-2">
            {REASON_OPTIONS.map((opt) => {
              const isSelected = reasonType === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setReasonType(opt.value);
                    if (opt.value !== "Lainnya") setReasonCustom("");
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all active:scale-[0.99]
                    ${isSelected
                      ? "bg-gray-900 border-gray-900 shadow-sm"
                      : "bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                >
                  <span className="text-lg flex-shrink-0">{opt.icon}</span>
                  <div className="min-w-0">
                    <p className={`text-sm font-bold leading-tight ${isSelected ? "text-white" : "text-gray-800"}`}>
                      {opt.value}
                    </p>
                    <p className={`text-[10px] mt-0.5 leading-tight ${isSelected ? "text-gray-300" : "text-gray-400"}`}>
                      {opt.desc}
                    </p>
                  </div>
                  {isSelected && (
                    <span className="ml-auto flex-shrink-0 w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-black">
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Lainnya — custom input */}
        {isLainnya && (
          <div>
            <label className={labelCls}>
              Jelaskan Alasan <span className="text-red-400 normal-case tracking-normal">*</span>
            </label>
            <input
              type="text"
              value={reasonCustom}
              onChange={(e) => setReasonCustom(e.target.value)}
              placeholder="Tuliskan alasan spesifik kamu..."
              className={inputCls}
              autoFocus
            />
          </div>
        )}

        {/* Rincian pekerjaan */}
        <div>
          <label className={labelCls}>
            Rincian Pekerjaan <span className="text-red-400 normal-case tracking-normal">*</span>
          </label>
          <textarea
            value={workDescription}
            onChange={(e) => setWorkDescription(e.target.value)}
            placeholder="Jelaskan pekerjaan yang akan dikerjakan saat lembur..."
            rows={4}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all resize-none placeholder:text-gray-300"
          />
          <p className="text-[10px] text-gray-400 mt-1.5 font-medium">
            Contoh: Menyelesaikan desain konten Shopee promo weekend, input stok laptop baru, dll.
          </p>
        </div>
      </div>
      <ModalFooter>
        <button onClick={onClose} className={secondaryBtn}>Batal</button>
        <button
          onClick={submit}
          disabled={submitting || !canSubmit}
          className={primaryBtn}
        >
          {submitting ? <><Spinner /><span>Mengirim...</span></> : "📝 Ajukan"}
        </button>
      </ModalFooter>
    </ModalWrapper>
  );
}

// ── SetPayModal ──────────────────────────────────────────────────────────────
function SetPayModal({
  overtime, onClose, onSaved,
}: {
  overtime: OvertimeRequest; onClose: () => void; onSaved: () => void;
}) {
  const calcDurationHours = (): number => {
    const start = overtime.actual_start ?? overtime.scheduled_start;
    const end = overtime.actual_end ?? overtime.scheduled_end;
    if (!start || !end) return 0;
    return Math.floor((new Date(end).getTime() - new Date(start).getTime()) / (60 * 60 * 1000));
  };
  const hours = calcDurationHours();
  const [rate, setRate] = useState(overtime.rate_per_hour ?? 100000);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const totalPay = rate * hours;

  const save = async () => {
    if (rate < 0) { setError("Tarif harus >= 0"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/attendance/overtime", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: overtime.id,
          action: "SET_PAY",
          rate_per_hour: Math.round(rate),
          total_pay: Math.round(totalPay),
        }),
      });
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal"); return; }
      onSaved(); onClose();
    } catch { setError("Gagal"); }
    finally { setSaving(false); }
  };

  return (
    <ModalWrapper onClose={onClose}>
      <ModalHeader icon="💰" title="Atur Bayaran" subtitle={overtime.users?.name} onClose={onClose} />
      <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
        {error && <ErrorBanner msg={error} />}
        <div className="rounded-2xl bg-gradient-to-br from-gray-900 to-gray-800 p-5 text-white">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs text-gray-400 font-medium">Durasi aktual</p>
              <p className="text-3xl font-black mt-0.5">
                {hours} <span className="text-lg font-bold text-gray-300">jam</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">Mulai</p>
              <p className="text-sm font-bold font-mono">{formatTime(overtime.actual_start)}</p>
              <p className="text-xs text-gray-400 mt-1">Selesai</p>
              <p className="text-sm font-bold font-mono">{formatTime(overtime.actual_end)}</p>
            </div>
          </div>
          <div className="border-t border-white/10 pt-4">
            <p className="text-xs text-gray-400 mb-1">Total Bayaran</p>
            <p className="text-2xl font-black text-emerald-400">{formatRupiah(Math.round(totalPay))}</p>
            <p className="text-xs text-gray-500 mt-1">{hours} jam × {formatRupiah(Math.round(rate))}</p>
          </div>
        </div>
        <div>
          <label className={labelCls}>Tarif Per Jam (Rp)</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-bold">Rp</span>
            <input
              type="number"
              min={0}
              value={rate}
              onChange={(e) => setRate(parseFloat(e.target.value) || 0)}
              className="w-full h-11 border border-gray-200 rounded-xl pl-11 pr-4 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all"
            />
          </div>
        </div>
      </div>
      <ModalFooter>
        <button onClick={onClose} className={secondaryBtn}>Batal</button>
        <button onClick={save} disabled={saving} className={primaryBtn}>
          {saving ? <Spinner /> : "💾 Simpan"}
        </button>
      </ModalFooter>
    </ModalWrapper>
  );
}

// ── CompleteModal ────────────────────────────────────────────────────────────
function CompleteModal({
  overtime, onClose, onSaved, isAutoCompleted,
}: {
  overtime: OvertimeRequest; onClose: () => void; onSaved: () => void; isAutoCompleted?: boolean;
}) {
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const handleClose = () => {
    if (isAutoCompleted) { setError("⚠️ Kamu wajib upload foto bukti lemburan sebelum menutup."); return; }
    onClose();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Hanya file gambar yang diterima"); return; }
    const reader = new FileReader();
    reader.onload = (event) => {
      const imageDataUrl = event.target?.result as string;
      setIsProcessing(true);
      addWatermarkToImage(imageDataUrl, (watermarkedBlob, previewUrl) => {
        setPhotoPreview(previewUrl);
        setIsProcessing(false);
        setPhotoFile(new File([watermarkedBlob], file.name, { type: "image/jpeg" }));
      });
      setError("");
    };
    reader.readAsDataURL(file);
  };

  const upload = async () => {
    setUploading(true); setError("");
    try {
      let photoUrl: string | null = null;
      if (photoFile) {
        const formData = new FormData();
        formData.append("file", photoFile);
        const uploadRes = await fetch("/api/attendance/overtime/upload", {
          method: "POST", body: formData,
        });
        if (!uploadRes.ok) {
          const errData = await uploadRes.json();
          throw new Error(errData.message || "Upload gagal");
        }
        const { url } = await uploadRes.json();
        photoUrl = url;
      }
      const res = await fetch("/api/attendance/overtime", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: overtime.id, action: "COMPLETE", proof_photo_url: photoUrl }),
      });
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal menyimpan"); return; }
      onSaved(); onClose();
    } catch (err: any) { setError(err.message || "Gagal upload"); }
    finally { setUploading(false); }
  };

  return (
    <ModalWrapper onClose={handleClose} preventClose={isAutoCompleted}>
      <ModalHeader
        icon="🏁"
        title="Selesaikan Lemburan"
        subtitle={overtime.users?.name}
        onClose={handleClose}
        disableClose={isAutoCompleted}
      />
      <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
        {isAutoCompleted && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="font-black text-amber-800 text-sm mb-1">⚡ Waktu Lembur Habis!</p>
            <p className="text-xs text-amber-700 leading-relaxed">
              Lemburanmu selesai otomatis. Kamu <strong>wajib</strong> upload foto bukti sebelum menutup halaman ini.
            </p>
          </div>
        )}
        {error && <ErrorBanner msg={error} />}
        {isProcessing && (
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            <p className="text-xs font-semibold text-gray-500">Menambahkan watermark pada foto...</p>
          </div>
        )}
        {photoPreview ? (
          <div>
            <label className={labelCls}>Foto Bukti</label>
            <img
              src={photoPreview}
              alt="Preview"
              className="w-full h-52 object-cover rounded-2xl border border-gray-100 shadow-md mb-3"
            />
            <button
              onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
              className="text-xs font-bold text-gray-400 hover:text-gray-700 transition-colors"
            >
              ↺ Ganti Foto
            </button>
          </div>
        ) : (
          <div>
            <label className={labelCls}>
              Foto Bukti{" "}
              <span className="normal-case tracking-normal text-gray-400 font-normal">(opsional)</span>
            </label>
            <div className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center hover:border-violet-300 hover:bg-violet-50/30 transition-all">
              <input
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
                id="photoInput"
                disabled={isProcessing}
              />
              <label htmlFor="photoInput" className="block cursor-pointer">
                <div className="text-4xl mb-3 opacity-60">📸</div>
                <p className="text-sm font-bold text-gray-600">Klik untuk upload foto</p>
                <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP · maks 5MB</p>
              </label>
            </div>
          </div>
        )}
      </div>
      <ModalFooter>
        {!isAutoCompleted && (
          <button onClick={onClose} className={secondaryBtn}>Batal</button>
        )}
        <button onClick={upload} disabled={uploading || isProcessing} className={primaryBtn}>
          {uploading ? <Spinner /> : photoFile ? "📸 Upload & Selesai" : "🏁 Selesai"}
        </button>
      </ModalFooter>
    </ModalWrapper>
  );
}

// ── ManualOvertimeModal ──────────────────────────────────────────────────────
function ManualOvertimeModal({
  onClose, onSaved, allUsers,
}: {
  onClose: () => void; onSaved: () => void; allUsers: User[];
}) {
  const [targetUserId, setTargetUserId] = useState("");
  const [requestDate, setRequestDate] = useState(new Date().toISOString().split("T")[0]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [reasonType, setReasonType] = useState("");
  const [reasonCustom, setReasonCustom] = useState("");
  const [workDescription, setWorkDescription] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const calcPreview = () => {
    if (!startTime || !endTime) return null;
    const startMs = new Date(`1970-01-01T${startTime}:00`).getTime();
    const endMs = new Date(`1970-01-01T${endTime}:00`).getTime();
    if (endMs <= startMs) return null;
    return Math.floor((endMs - startMs) / (60 * 60 * 1000));
  };
  const previewHours = calcPreview();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Hanya file gambar yang diterima"); return; }
    const reader = new FileReader();
    reader.onload = (event) => {
      const imageDataUrl = event.target?.result as string;
      setIsProcessing(true);
      addWatermarkToImage(imageDataUrl, (watermarkedBlob, previewUrl) => {
        setPhotoPreview(previewUrl);
        setIsProcessing(false);
        setPhotoFile(new File([watermarkedBlob], file.name, { type: "image/jpeg" }));
      });
      setError("");
    };
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    if (!targetUserId) { setError("Pilih nama karyawan"); return; }
    if (!requestDate) { setError("Pilih tanggal"); return; }
    if (!startTime) { setError("Masukkan jam mulai"); return; }
    if (!endTime) { setError("Masukkan jam selesai"); return; }
    const startMs = new Date(`1970-01-01T${startTime}:00`).getTime();
    const endMs = new Date(`1970-01-01T${endTime}:00`).getTime();
    if (endMs <= startMs) { setError("Jam selesai harus lebih besar dari jam mulai"); return; }
    if (!reasonType) { setError("Pilih alasan lembur"); return; }
    if (reasonType === "Lainnya" && !reasonCustom.trim()) { setError("Jelaskan alasan lembur kamu"); return; }
    if (!workDescription.trim()) { setError("Rincian pekerjaan wajib diisi"); return; }
    setSubmitting(true); setError("");
    try {
      let photoUrl: string | null = null;
      if (photoFile) {
        const formData = new FormData();
        formData.append("file", photoFile);
        const uploadRes = await fetch("/api/attendance/overtime/upload", {
          method: "POST", body: formData,
        });
        if (!uploadRes.ok) {
          const errData = await uploadRes.json();
          throw new Error(errData.message || "Upload foto gagal");
        }
        const { url } = await uploadRes.json();
        photoUrl = url;
      }
      const res = await fetch("/api/attendance/overtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_manual: true,
          target_user_id: targetUserId,
          request_date: requestDate,
          actual_start_time: startTime,
          actual_end_time: endTime,
          work_description: workDescription.trim(),
          reason: reasonType === "Lainnya" ? reasonCustom.trim() : reasonType,
          proof_photo_url: photoUrl,
        }),
      });
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal menyimpan"); return; }
      onSaved(); onClose();
    } catch (err: any) { setError(err.message || "Gagal"); }
    finally { setSubmitting(false); }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="w-full sm:max-w-lg bg-white rounded-t-[2rem] sm:rounded-2xl shadow-2xl overflow-hidden"
        style={{ animation: "modalUp 0.32s cubic-bezier(0.22,1,0.36,1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <ModalHeader
          icon="✏️"
          title="Input Lembur Manual"
          subtitle="Admin · Asisten CEO · Programmer"
          onClose={onClose}
        />
        <div className="px-6 py-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {error && <ErrorBanner msg={error} />}
          <div>
            <label className={labelCls}>
              Nama Karyawan <span className="text-red-400 normal-case tracking-normal">*</span>
            </label>
            <select
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              className={inputCls + " cursor-pointer"}
            >
              <option value="">— Pilih karyawan —</option>
              {allUsers
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name, "id-ID"))
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role.replace(/_/g, " ")})
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>
              Tanggal Lembur <span className="text-red-400 normal-case tracking-normal">*</span>
            </label>
            <input
              type="date"
              value={requestDate}
              onChange={(e) => setRequestDate(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>
                Jam Mulai <span className="text-red-400 normal-case tracking-normal">*</span>
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>
                Jam Selesai <span className="text-red-400 normal-case tracking-normal">*</span>
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          {previewHours !== null && (
            <div className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
              <span className="text-lg">⏱️</span>
              <p className="text-sm text-gray-600">
                Durasi:{" "}
                <span className="font-black text-gray-900">{previewHours} jam</span>
                {previewHours === 0 && (
                  <span className="text-amber-500 ml-2 text-xs font-bold">(kurang dari 1 jam)</span>
                )}
              </p>
            </div>
          )}
          <div>
            <label className={labelCls}>
              Alasan Lembur <span className="text-red-400 normal-case tracking-normal">*</span>
            </label>
            <div className="space-y-2">
              {REASON_OPTIONS.map((opt) => {
                const isSelected = reasonType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setReasonType(opt.value);
                      if (opt.value !== "Lainnya") setReasonCustom("");
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all active:scale-[0.99]
            ${isSelected
                        ? "bg-gray-900 border-gray-900 shadow-sm"
                        : "bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                  >
                    <span className="text-lg flex-shrink-0">{opt.icon}</span>
                    <div className="min-w-0">
                      <p className={`text-sm font-bold leading-tight ${isSelected ? "text-white" : "text-gray-800"}`}>
                        {opt.value}
                      </p>
                      <p className={`text-[10px] mt-0.5 leading-tight ${isSelected ? "text-gray-300" : "text-gray-400"}`}>
                        {opt.desc}
                      </p>
                    </div>
                    {isSelected && (
                      <span className="ml-auto flex-shrink-0 w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-black">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          {reasonType === "Lainnya" && (
            <div>
              <label className={labelCls}>
                Jelaskan Alasan <span className="text-red-400 normal-case tracking-normal">*</span>
              </label>
              <input
                type="text"
                value={reasonCustom}
                onChange={(e) => setReasonCustom(e.target.value)}
                placeholder="Tuliskan alasan spesifik..."
                className={inputCls}
                autoFocus
              />
            </div>
          )}
          <div>
            <label className={labelCls}>
              Rincian Pekerjaan <span className="text-red-400 normal-case tracking-normal">*</span>
            </label>
            <textarea
              value={workDescription}
              onChange={(e) => setWorkDescription(e.target.value)}
              placeholder="Jelaskan pekerjaan yang dikerjakan saat lembur..."
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all resize-none placeholder:text-gray-300"
            />
            <p className="text-[10px] text-gray-400 mt-1.5 font-medium">
              Contoh: Menyelesaikan desain konten Shopee promo weekend, input stok laptop baru, dll.
            </p>
          </div>
          <div>
            <label className={labelCls}>
              Foto Bukti{" "}
              <span className="normal-case tracking-normal text-gray-400 font-normal">(opsional)</span>
            </label>
            {isProcessing && (
              <div className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl p-3 mb-3">
                <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                <p className="text-xs font-semibold text-gray-500">Menambahkan watermark...</p>
              </div>
            )}
            {photoPreview ? (
              <div>
                <img
                  src={photoPreview}
                  alt="Preview"
                  className="w-full h-44 object-cover rounded-2xl border border-gray-100 shadow-md mb-3"
                />
                <button
                  onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                  className="text-xs font-bold text-gray-400 hover:text-gray-700 transition-colors"
                >
                  ↺ Ganti Foto
                </button>
              </div>
            ) : (
              <div className="border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center hover:border-violet-300 hover:bg-violet-50/30 transition-all">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="manualPhotoInput"
                  disabled={isProcessing}
                />
                <label htmlFor="manualPhotoInput" className="block cursor-pointer">
                  <div className="text-3xl mb-2 opacity-60">📸</div>
                  <p className="text-sm font-bold text-gray-600">Klik untuk upload foto</p>
                  <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP · maks 5MB</p>
                </label>
              </div>
            )}
          </div>
        </div>
        <ModalFooter>
          <button onClick={onClose} className={secondaryBtn}>Batal</button>
          <button
            onClick={submit}
            disabled={
              submitting ||
              !targetUserId ||
              !requestDate ||
              !startTime ||
              !endTime ||
              !reasonType ||
              (reasonType === "Lainnya" && !reasonCustom.trim()) ||
              !workDescription.trim() ||
              isProcessing
            }
            className={primaryBtn}
          >
            {submitting ? <><Spinner /><span>Menyimpan...</span></> : "✅ Simpan Lembur"}
          </button>
        </ModalFooter>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── OvertimePage ──────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
export default function OvertimePage() {
  const [overtimes, setOvertimes] = useState<OvertimeRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState<string>("Semua");
  const [calendarMonth, setCalendarMonth] = useState<{ year: number; month: number }>({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [setPayData, setSetPayData] = useState<OvertimeRequest | null>(null);
  const [completeData, setCompleteData] = useState<OvertimeRequest | null>(null);
  const [approveData, setApproveData] = useState<OvertimeRequest | null>(null);
  const [proofPhotoData, setProofPhotoData] = useState<OvertimeRequest | null>(null);
  const autoCompletingIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    getCurrentUserClient().then((u) => setCurrentUser(u));
  }, []);

  const fetchOvertimes = useCallback(async () => {
    const r = await fetch("/api/attendance/overtime");
    const d = await r.json();
    if (d.success) setOvertimes(d.data || []);
  }, []);

  const fetchAllUsers = useCallback(async () => {
    const r = await fetch("/api/users");
    const d = await r.json();
    if (d.success) setAllUsers(d.users || []);
  }, []);

  useEffect(() => {
    if (currentUser === null) return;
    setLoading(true);
    Promise.all([
      fetchOvertimes(),
      isAdminRole(currentUser?.role) ? fetchAllUsers() : Promise.resolve(),
    ]).finally(() => setLoading(false));
  }, [fetchOvertimes, fetchAllUsers, currentUser?.role]);

  // ✅ AUTO-COMPLETE INTERVAL dengan timezone handling robust
  useEffect(() => {
    if (!currentUser) return;

    const parseTimestamp = (iso: string | null): number => {
      if (!iso) return 0;
      try {
        const d = new Date(iso);
        const time = d.getTime();
        if (!isNaN(time)) return time;
        return 0;
      } catch (e) {
        console.warn("[PARSE] Failed:", iso);
        return 0;
      }
    };

    const checkAutoComplete = setInterval(() => {
      const now = Date.now();
      console.log(`[CHECK] Time: ${new Date(now).toISOString()}`);

      overtimes.forEach((o) => {
        const isMyOvertime = o.user_id === currentUser.id;
        const isOngoing = o.status === "ONGOING";
        const notYetCompleted = !o.actual_end;
        const notAlreadyProcessing = !autoCompletingIds.current.has(o.id);

        if (!isMyOvertime || !isOngoing || !notAlreadyProcessing) return;

        const scheduledEndTime = parseTimestamp(o.scheduled_end);
        if (scheduledEndTime === 0) {
          console.warn(`[CHECK] Parse failed: ${o.scheduled_end}`);
          return;
        }

        const isTimeUp = scheduledEndTime <= now;
        console.log(
          `[CHECK] ${o.users?.name}:`,
          `End: ${new Date(scheduledEndTime).toISOString()}`,
          `TimeUp: ${isTimeUp}`
        );

        if (isTimeUp && notYetCompleted && notAlreadyProcessing) {
          console.log(`✅ [AUTO-COMPLETE] Triggered for ${o.users?.name}`);
          handleAutoComplete(o);
        }
      });
    }, 5000);

    return () => clearInterval(checkAutoComplete);
  }, [overtimes, currentUser]);

  const handleAutoComplete = async (overtime: OvertimeRequest) => {
    if (autoCompletingIds.current.has(overtime.id)) return;
    autoCompletingIds.current.add(overtime.id);

    try {
      console.log(`[AUTO-COMPLETE] Processing...`);
      const res = await fetch("/api/attendance/overtime", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: overtime.id,
          action: "COMPLETE",
          proof_photo_url: null,
          auto_completed: true,
        }),
      });

      const d = await res.json();

      if (d.success) {
        console.log(`✅ Success:`, d.data);
        await fetchOvertimes();
        setCompleteData({
          ...overtime,
          status: "COMPLETED",
          auto_completed: true,
        });
        setTimeout(() => {
          autoCompletingIds.current.delete(overtime.id);
        }, 5000);
      } else {
        console.error(`❌ Failed:`, d.message);
        autoCompletingIds.current.delete(overtime.id);
      }
    } catch (err) {
      console.error("[AUTO-COMPLETE] Error:", err);
      autoCompletingIds.current.delete(overtime.id);
    }
  };

  const filtered = useMemo(() => {
    if (filterStatus === "Semua") return overtimes;
    return overtimes.filter((o) => o.status === filterStatus);
  }, [overtimes, filterStatus]);

  const statuses = useMemo(
    () => [...new Set(overtimes.map((o) => o.status))],
    [overtimes]
  );

  const thisMonthOvertimes = overtimes.filter((o) => {
    const dateKey = toWIBDateKey(o.request_date);
    return dateKey.startsWith(`${calendarMonth.year}-${pad2(calendarMonth.month + 1)}`);
  });

  const byDate = useMemo(() => {
    const m: Record<string, OvertimeRequest[]> = {};
    thisMonthOvertimes.forEach((o) => {
      const k = toWIBDateKey(o.request_date);
      if (!m[k]) m[k] = [];
      m[k].push(o);
    });
    return m;
  }, [thisMonthOvertimes]);

  const calDays = useMemo(() => {
    const fd = new Date(calendarMonth.year, calendarMonth.month, 1).getDay();
    const dim = new Date(calendarMonth.year, calendarMonth.month + 1, 0).getDate();
    const c: (number | null)[] = [];
    for (let i = 0; i < fd; i++) c.push(null);
    for (let d = 1; d <= dim; d++) c.push(d);
    return c;
  }, [calendarMonth.year, calendarMonth.month]);

  const selectedOvertimes = selectedDate
    ? (byDate[selectedDate] || []).sort((a, b) =>
      (a.users?.name || "").localeCompare(b.users?.name || "", "id-ID")
    )
    : [];

  const statCards = [
    { label: "Total", value: overtimes.length, icon: "📋", accent: "from-gray-700 to-gray-900" },
    { label: "Pending", value: overtimes.filter((o) => o.status === "PENDING").length, icon: "⏳", accent: "from-amber-500 to-amber-600" },
    { label: "Ongoing", value: overtimes.filter((o) => o.status === "ONGOING").length, icon: "🟢", accent: "from-emerald-500 to-emerald-700" },
    { label: "Selesai", value: overtimes.filter((o) => o.status === "COMPLETED").length, icon: "🏁", accent: "from-blue-500 to-blue-700" },
  ];

  const renderActions = (o: OvertimeRequest) => (
    <div className="flex justify-center gap-1.5 flex-wrap">
      {isAdminRole(currentUser?.role) && o.status === "PENDING" && (
        <button
          onClick={() => setApproveData(o)}
          className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-bold px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition-all active:scale-95 whitespace-nowrap shadow-sm"
        >
          ✅ Setujui
        </button>
      )}
      {canApproveRole(currentUser?.role) && o.status === "COMPLETED" && o.proof_photo_url && (
        <button
          onClick={() => setProofPhotoData(o)}
          className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-all active:scale-95 whitespace-nowrap shadow-sm"
        >
          👁️ Lihat
        </button>
      )}
      {canSetPay(currentUser?.role) && o.status === "COMPLETED" && (
        <button
          onClick={() => setSetPayData(o)}
          className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-all active:scale-95 whitespace-nowrap shadow-sm"
        >
          💰 {o.rate_per_hour ? "Edit" : "Set Bayar"}
        </button>
      )}
      {!canApproveRole(currentUser?.role) &&
        currentUser?.id === o.user_id &&
        o.status === "ONGOING" &&
        !o.actual_end &&
        o.rate_per_hour && (
          <button
            onClick={() => setCompleteData(o)}
            className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-all active:scale-95 whitespace-nowrap shadow-sm"
          >
            🏁 Selesai
          </button>
        )}
      {currentUser?.id === o.user_id && o.status === "COMPLETED" && !o.proof_photo_url && (
        <button
          onClick={() => setCompleteData({ ...o, auto_completed: true })}
          className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition-all active:scale-95 whitespace-nowrap shadow-sm"
        >
          📸 Upload
        </button>
      )}
    </div>
  );

  const EmployeeCell = ({ o }: { o: OvertimeRequest }) => (
    <div className="flex items-center gap-2.5">
      <div
        className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br ${avatarColor(o.users?.name || "")} flex items-center justify-center text-white text-[9px] font-black flex-shrink-0 shadow-sm`}
      >
        {initials(o.users?.name || "??")}
      </div>
      <div className="min-w-0">
        <p className="font-bold text-gray-800 text-xs truncate">{o.users?.name}</p>
        <p className="text-[9px] text-gray-400 truncate">{o.users?.role?.replace(/_/g, " ")}</p>
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-[#F7F7F8]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6 sm:space-y-8">

          {/* ══ HEADER ══ */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-1 h-8 rounded-full bg-gradient-to-b from-violet-500 to-violet-700 flex-shrink-0" />
                <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">Lembur Karyawan</h1>
              </div>
              <p className="text-sm text-gray-400 font-medium pl-4 ml-1">
                {loading ? "Memuat data..." : `${overtimes.length} total lemburan terdaftar`}
              </p>
            </div>
            <div className="flex items-center gap-2.5 flex-shrink-0">
              {isAdminRole(currentUser?.role) && (
                <button
                  onClick={() => setShowManualModal(true)}
                  className="h-10 sm:h-11 px-4 sm:px-5 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 rounded-xl font-bold text-sm flex items-center gap-2 transition-all hover:shadow-sm active:scale-[0.98] whitespace-nowrap"
                >
                  <span className="text-base">✏️</span>
                  <span className="hidden sm:inline">Input Manual</span>
                </button>
              )}
              <button
                onClick={() => setShowRequestModal(true)}
                className="h-10 sm:h-11 px-5 sm:px-6 bg-gray-900 hover:bg-black text-white rounded-xl font-bold text-sm flex items-center gap-2 transition-all shadow-md hover:shadow-lg active:scale-[0.98] whitespace-nowrap"
              >
                <span className="text-base">📝</span>
                <span>Ajukan Lemburan</span>
              </button>
            </div>
          </div>

          {/* ══ STAT CARDS ══ */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {statCards.map((c) => (
              <div
                key={c.label}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6 flex items-start gap-4 hover:shadow-md transition-all duration-300 hover:-translate-y-0.5"
              >
                <div
                  className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${c.accent} flex items-center justify-center text-xl flex-shrink-0 shadow-md`}
                >
                  {c.icon}
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{c.label}</p>
                  <p className="text-3xl font-black text-gray-900 tracking-tight leading-none">
                    {loading ? (
                      <span className="inline-block w-10 h-7 bg-gray-100 rounded-lg animate-pulse" />
                    ) : (
                      c.value
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* ══ CALENDAR & TABLE ══ */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-lg">📅</div>
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Kalender Lembur</p>
                  <p className="font-black text-gray-900 text-base sm:text-lg leading-tight">
                    {MONTH_NAMES[calendarMonth.month]} {calendarMonth.year}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() =>
                    setCalendarMonth((m) => ({
                      month: m.month === 0 ? 11 : m.month - 1,
                      year: m.month === 0 ? m.year - 1 : m.year,
                    }))
                  }
                  className="w-9 h-9 rounded-xl hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-800 font-bold transition-all active:scale-95 text-lg"
                >
                  ‹
                </button>
                <button
                  onClick={() =>
                    setCalendarMonth({ year: new Date().getFullYear(), month: new Date().getMonth() })
                  }
                  className="h-9 px-3 rounded-xl hover:bg-gray-100 text-xs font-bold text-gray-500 hover:text-gray-800 transition-all"
                >
                  Hari ini
                </button>
                <button
                  onClick={() =>
                    setCalendarMonth((m) => ({
                      month: m.month === 11 ? 0 : m.month + 1,
                      year: m.month === 11 ? m.year + 1 : m.year,
                    }))
                  }
                  className="w-9 h-9 rounded-xl hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-800 font-bold transition-all active:scale-95 text-lg"
                >
                  ›
                </button>
              </div>
            </div>
            <div className="p-4 sm:p-6 overflow-x-auto">
              <div className="grid grid-cols-7 gap-1.5 mb-1.5 min-w-[320px]">
                {DAY_NAMES.map((d, i) => (
                  <div
                    key={d}
                    className={`text-center text-[10px] font-black py-2 uppercase tracking-wider ${i === 0 ? "text-red-400" : "text-gray-400"}`}
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1.5 min-w-[320px]">
                {calDays.map((day, idx) => {
                  if (!day) return <div key={`empty-${idx}`} />;
                  const dk = `${calendarMonth.year}-${pad2(calendarMonth.month + 1)}-${pad2(day)}`;
                  const total = (byDate[dk] || []).length;
                  const isSel = dk === selectedDate;
                  const isToday = dk === new Date().toISOString().slice(0, 10);
                  const isSunday = new Date(dk + "T12:00:00").getDay() === 0;
                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDate(selectedDate === dk ? null : dk)}
                      className={`relative flex flex-col items-center justify-start pt-2.5 pb-2 rounded-xl min-h-[70px] sm:min-h-[88px] transition-all duration-200 border
                        ${isSel
                          ? "bg-gray-900 border-gray-800 shadow-lg"
                          : total > 0
                            ? "bg-violet-50 border-violet-100 hover:bg-violet-100 hover:border-violet-200"
                            : "bg-transparent border-gray-100 hover:bg-gray-50 hover:border-gray-200"
                        }`}
                    >
                      <span
                        className={`text-sm sm:text-base font-black mb-1.5 transition-colors
                          ${isSel ? "text-white" : isToday ? "text-violet-600" : isSunday ? "text-red-400" : "text-gray-700"}`}
                      >
                        {day}
                      </span>
                      {isToday && !isSel && (
                        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-violet-500" />
                      )}
                      {total > 0 && (
                        <span
                          className={`text-[9px] sm:text-[10px] font-black rounded-full px-2 py-0.5 leading-tight
                            ${isSel ? "bg-white/20 text-white" : "bg-violet-500 text-white"}`}
                        >
                          {total}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ══ SELECTED DATE DETAILS ══ */}
          {selectedDate && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div>
                  <p className="font-black text-gray-900 text-base sm:text-lg">
                    {new Date(selectedDate + "T12:00:00").toLocaleDateString("id-ID", {
                      weekday: "long", day: "numeric", month: "long", year: "numeric",
                    })}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 font-medium">
                    {selectedOvertimes.length} lemburan tercatat
                  </p>
                </div>
                <button
                  onClick={() => setSelectedDate(null)}
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {selectedOvertimes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="text-5xl mb-3 opacity-30">📭</div>
                  <p className="text-sm text-gray-400 font-semibold">Tidak ada lemburan pada tanggal ini</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm">
                    <thead className="bg-gray-50/80">
                      <tr className="border-b border-gray-100">
                        {["Karyawan", "Waktu", "Alasan", "Pekerjaan", "Status", "Bayaran", "Aksi"].map((h) => (
                          <th
                            key={h}
                            className={`px-4 py-3.5 text-[9px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap ${h === "Bayaran" ? "text-right" : h === "Aksi" ? "text-center" : "text-left"
                              }`}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {selectedOvertimes.map((o) => (
                        <tr key={o.id} className="hover:bg-gray-50/60 transition-colors">
                          <td className="px-4 py-3.5"><EmployeeCell o={o} /></td>
                          <td className="px-3 py-3.5 whitespace-nowrap">
                            <span className="font-mono font-bold text-gray-700 text-xs">
                              {formatTime(o.scheduled_start)} – {formatTime(o.scheduled_end)}
                            </span>
                          </td>
                          <td className="px-3 py-3.5 max-w-[120px]">
                            <span className="text-gray-500 text-xs line-clamp-2">{o.reason || "—"}</span>
                          </td>
                          <td className="px-3 py-3.5 max-w-[120px]">
                            <span className="text-gray-500 text-xs line-clamp-2">{o.work_description || "—"}</span>
                          </td>
                          <td className="px-3 py-3.5"><StatusBadge status={o.status} /></td>
                          <td className="px-3 py-3.5 text-right whitespace-nowrap">
                            {o.total_pay != null ? (
                              <span className="font-bold text-gray-800 font-mono text-xs">{formatRupiah(o.total_pay)}</span>
                            ) : (
                              <span className="text-gray-200 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3.5">{renderActions(o)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ══ ALL OVERTIMES TABLE ══ */}
          {!selectedDate && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <p className="font-black text-gray-900 text-base">Daftar Lemburan</p>
                  <span className="text-xs font-bold text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
                    {filtered.length} data
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {["Semua", ...statuses].map((s) => {
                    const cfg = s !== "Semua" ? STATUS_CONFIG[s] : null;
                    return (
                      <button
                        key={s}
                        onClick={() => setFilterStatus(s)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 border
                          ${filterStatus === s
                            ? "bg-gray-900 text-white border-gray-900 shadow-sm"
                            : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"
                          }`}
                      >
                        {cfg ? `${cfg.icon} ${cfg.label}` : "Semua"}
                      </button>
                    );
                  })}
                </div>
              </div>
              {loading ? (
                <div className="p-6 space-y-2.5">
                  {Array(4).fill(0).map((_, i) => (
                    <div
                      key={i}
                      className="h-14 bg-gray-50 rounded-xl animate-pulse"
                      style={{ opacity: 1 - i * 0.2 }}
                    />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="text-5xl mb-3 opacity-30">📭</div>
                  <p className="text-sm text-gray-400 font-semibold">Belum ada data lemburan</p>
                  <p className="text-xs text-gray-300 mt-1">Coba ubah filter status di atas</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm">
                    <thead className="bg-gray-50/80">
                      <tr className="border-b border-gray-100">
                        {["Karyawan", "Tanggal", "Waktu", "Alasan", "Pekerjaan", "Status", "Bayaran", "Aksi"].map((h) => (
                          <th
                            key={h}
                            className={`px-4 py-3.5 text-[9px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap ${h === "Bayaran" ? "text-right" : h === "Aksi" ? "text-center" : "text-left"
                              }`}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filtered.map((o) => (
                        <tr key={o.id} className="hover:bg-gray-50/60 transition-colors">
                          <td className="px-4 py-3.5"><EmployeeCell o={o} /></td>
                          <td className="px-3 py-3.5 whitespace-nowrap">
                            <span className="font-mono font-bold text-gray-600 text-xs">
                              {new Date(o.request_date).toLocaleDateString("id-ID", {
                                day: "numeric", month: "short", year: "numeric",
                              })}
                            </span>
                          </td>
                          <td className="px-3 py-3.5 whitespace-nowrap">
                            <span className="font-mono font-bold text-gray-600 text-xs">
                              {formatTime(o.scheduled_start)} – {formatTime(o.scheduled_end)}
                            </span>
                          </td>
                          <td className="px-3 py-3.5 max-w-[120px]">
                            <span className="text-gray-500 text-xs line-clamp-2">{o.reason || "—"}</span>
                          </td>
                          <td className="px-3 py-3.5 max-w-[120px]">
                            <span className="text-gray-500 text-xs line-clamp-2">{o.work_description || "—"}</span>
                          </td>
                          <td className="px-3 py-3.5"><StatusBadge status={o.status} /></td>
                          <td className="px-3 py-3.5 text-right whitespace-nowrap">
                            {o.total_pay != null ? (
                              <span className="font-bold text-gray-800 font-mono text-xs">{formatRupiah(o.total_pay)}</span>
                            ) : (
                              <span className="text-gray-200 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3.5">{renderActions(o)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ══ MODALS ══ */}
      {showRequestModal && (
        <RequestOvertimeModal
          onClose={() => setShowRequestModal(false)}
          onSaved={() => { fetchOvertimes(); setShowRequestModal(false); }}
          currentUser={currentUser}
        />
      )}
      {showManualModal && (
        <ManualOvertimeModal
          onClose={() => setShowManualModal(false)}
          onSaved={() => { fetchOvertimes(); setShowManualModal(false); }}
          allUsers={allUsers}
        />
      )}
      {approveData && (
        <ApproveModal
          overtime={approveData}
          onClose={() => setApproveData(null)}
          onSaved={() => { fetchOvertimes(); setApproveData(null); }}
        />
      )}
      {setPayData && (
        <SetPayModal
          overtime={setPayData}
          onClose={() => setSetPayData(null)}
          onSaved={() => { fetchOvertimes(); setSetPayData(null); }}
        />
      )}
      {completeData && (
        <CompleteModal
          overtime={completeData}
          onClose={() => setCompleteData(null)}
          onSaved={() => { fetchOvertimes(); setCompleteData(null); }}
          isAutoCompleted={completeData.auto_completed}
        />
      )}
      {proofPhotoData && (
        <ProofPhotoModal
          overtime={proofPhotoData}
          onClose={() => setProofPhotoData(null)}
        />
      )}

      <style jsx global>{`
        @keyframes modalUp {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </DashboardLayout>
  );
}