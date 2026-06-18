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
  status: "PENDING" | "APPROVED" | "ONGOING" | "COMPLETED" | "REJECTED" | "CANCELLED" | "NEED_PROOF";
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

const MONTH_NAMES = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const DAY_NAMES = ["Min","Sen","Sel","Rab","Kam","Jum","Sab"];
const FULL_ACCESS_ROLES = ["ADMIN","PROGRAMMER","ASISTEN_CEO"] as const;
const DIVISION_HEAD_ROLES = ["KEPALA_SALES","KEPALA_MARKETING","KEPALA_TEKNISI"] as const;
const PAY_VIEW_ROLES = ["KEPALA_SALES","KEPALA_MARKETING","KEPALA_TEKNISI","KEPALA_PENYEDIA_BARANG","ADMIN","PROGRAMMER","ASISTEN_CEO","KEPALA_ONPOINT","KEPALA_SOTECH"] as const;

function canViewPay(role?: string) { return !!role && (PAY_VIEW_ROLES as readonly string[]).includes(role); }
function isAdminRole(role?: string) { return !!role && (FULL_ACCESS_ROLES as readonly string[]).includes(role); }
function canApproveRole(role?: string) { return isAdminRole(role) || (!!role && (DIVISION_HEAD_ROLES as readonly string[]).includes(role)); }
function canSetPay(role?: string) { return !!role && (FULL_ACCESS_ROLES as readonly string[]).includes(role); }
function formatRupiah(n: number) { return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n); }
function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  if (iso.includes(":") && !iso.includes("T")) return iso.substring(0, 5);
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
}
function toWIBDateKey(iso: string) { return new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10); }
function initials(name: string) { return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase(); }
function pad2(n: number) { return String(n).padStart(2, "0"); }

function addWatermarkToImage(imageDataUrl: string, callback: (blob: Blob, url: string) => void) {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const days = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
    const months = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
    const txt = `${now.getUTCDate()}-${months[now.getUTCMonth()]}-${now.getUTCFullYear()} (${days[now.getUTCDay()]}) \u2022 ${String(now.getUTCHours()).padStart(2,"0")}:${String(now.getUTCMinutes()).padStart(2,"0")} WIB`;
    const pad = 12, fs = Math.max(16, canvas.width / 40);
    ctx.font = `bold ${fs}px Arial`;
    const tw = ctx.measureText(txt).width;
    const bx = pad, by = canvas.height - fs - pad - 10, bw = tw + pad * 2, bh = fs + pad;
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 2; ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = "white"; ctx.textBaseline = "middle"; ctx.fillText(txt, bx + pad, by + bh / 2);
    canvas.toBlob((blob) => { if (blob) callback(blob, URL.createObjectURL(blob)); }, "image/jpeg", 0.95);
  };
  img.onerror = () => console.error("Failed to load image"); img.src = imageDataUrl;
}

// ─── STATUS CONFIG ────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; icon: string; bg: string; text: string; border: string; dot: string; accent: string }> = {
  PENDING:    { label: "Pending",           icon: "⏳", bg: "bg-amber-50",    text: "text-amber-700",   border: "border-amber-200",   dot: "bg-amber-400",    accent: "from-amber-400 to-orange-400"    },
  APPROVED:   { label: "Disetujui",         icon: "✅", bg: "bg-violet-50",   text: "text-violet-700",  border: "border-violet-200",  dot: "bg-violet-500",   accent: "from-violet-500 to-purple-500"   },
  ONGOING:    { label: "Berjalan",          icon: "▶",  bg: "bg-emerald-50",  text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500",  accent: "from-emerald-400 to-teal-500"    },
  COMPLETED:  { label: "Selesai",           icon: "✓",  bg: "bg-blue-50",     text: "text-blue-700",    border: "border-blue-200",    dot: "bg-blue-500",     accent: "from-blue-400 to-cyan-500"       },
  NEED_PROOF: { label: "Upload Foto",       icon: "📸", bg: "bg-orange-50",   text: "text-orange-700",  border: "border-orange-200",  dot: "bg-orange-500",   accent: "from-orange-400 to-rose-400"     },
  REJECTED:   { label: "Ditolak",           icon: "✕",  bg: "bg-red-50",      text: "text-red-700",     border: "border-red-200",     dot: "bg-red-500",      accent: "from-red-400 to-rose-500"        },
  CANCELLED:  { label: "Dibatalkan",        icon: "⊘",  bg: "bg-gray-100",    text: "text-gray-500",    border: "border-gray-200",    dot: "bg-gray-400",     accent: "from-gray-300 to-gray-400"       },
};

function StatusBadge({ status }: { status: OvertimeRequest["status"] }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, icon: "?", bg: "bg-gray-100", text: "text-gray-600", border: "border-gray-200", dot: "bg-gray-400" };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

const AVATAR_COLORS = ["from-violet-500 to-purple-600","from-blue-500 to-cyan-600","from-emerald-500 to-teal-600","from-rose-500 to-pink-600","from-amber-400 to-orange-500","from-cyan-500 to-blue-600","from-fuchsia-500 to-violet-600"];
function avatarColor(name: string) {
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

// ─── SHARED DESIGN TOKENS ─────────────────────────────────────────────────────
// Compact input: h-9 (36px) — lebih kecil dari default h-11
const inp = "w-full h-9 border border-gray-200 rounded-lg px-3 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all placeholder:text-gray-300";
const lbl = "text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1.5";
// Primary CTA: violet gradient — signature accent color
const primaryBtn = "flex-1 h-9 bg-gradient-to-r from-violet-600 to-violet-700 hover:from-violet-700 hover:to-violet-800 text-white rounded-lg text-xs font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 shadow-sm shadow-violet-200 disabled:opacity-40 disabled:cursor-not-allowed";
const secondaryBtn = "flex-1 h-9 bg-white border border-gray-200 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-50 hover:border-gray-300 transition-all active:scale-[0.98] flex items-center justify-center";

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2.5 rounded-lg">
      <span className="flex-shrink-0 mt-px">⚠️</span>
      <span className="font-medium leading-relaxed">{msg}</span>
    </div>
  );
}
function Spinner() { return <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />; }

// ─── MODAL SHELL ──────────────────────────────────────────────────────────────
function ModalWrapper({ children, onClose, preventClose, wide }: { children: React.ReactNode; onClose: () => void; preventClose?: boolean; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
      onClick={preventClose ? undefined : onClose}>
      <div className={`w-full ${wide ? "sm:max-w-lg" : "sm:max-w-md"} bg-white rounded-t-2xl sm:rounded-xl shadow-2xl overflow-hidden`}
        style={{ animation: "modalUp 0.28s cubic-bezier(0.22,1,0.36,1)" }}
        onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ icon, title, subtitle, accentColor, onClose, disableClose }: { icon: string; title: string; subtitle?: string; accentColor?: string; onClose: () => void; disableClose?: boolean }) {
  return (
    <div className={`px-5 pt-5 pb-4 border-b border-gray-100 bg-gradient-to-r ${accentColor || "from-gray-50 to-white"}`}>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-white shadow-sm border border-gray-100 flex items-center justify-center text-lg flex-shrink-0">{icon}</div>
        <div className="flex-1 min-w-0 pt-0.5">
          <h2 className="text-sm font-black text-gray-900 tracking-tight leading-tight">{title}</h2>
          {subtitle && <p className="text-[10px] text-gray-400 mt-0.5 truncate font-medium">{subtitle}</p>}
        </div>
        <button onClick={onClose} disabled={disableClose}
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all flex-shrink-0 mt-0.5 ${disableClose ? "text-gray-200 cursor-not-allowed" : "text-gray-400 hover:text-gray-700 hover:bg-white/80"}`}>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  );
}

function ModalFooter({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-3.5 border-t border-gray-100 bg-gray-50/60 flex gap-2">{children}</div>;
}

// ─── CAMERA ───────────────────────────────────────────────────────────────────
type CameraCaptureProps = { onCapture: (file: File, previewUrl: string) => void; onCancel: () => void; };
function CameraCapture({ onCapture, onCancel }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment"|"user">("environment");

  const startCamera = useCallback(async (facing: "environment"|"user") => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setIsReady(false); setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err: any) {
      setError(err.name === "NotAllowedError" ? "Izin kamera ditolak." : err.name === "NotFoundError" ? "Kamera tidak ditemukan." : `Gagal: ${err.message}`);
    }
  }, []);

  useEffect(() => { startCamera(facingMode); return () => { streamRef.current?.getTracks().forEach(t => t.stop()); }; }, [facingMode, startCamera]);

  const capture = () => {
    if (!videoRef.current || !isReady) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas"); canvas.width = video.videoWidth || 1280; canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    if (facingMode === "user") { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    if (facingMode === "user") ctx.setTransform(1, 0, 0, 1, 0, 0);
    setIsProcessing(true);
    addWatermarkToImage(canvas.toDataURL("image/jpeg", 0.95), (blob, previewUrl) => {
      const file = new File([blob], `overtime-${Date.now()}.jpg`, { type: "image/jpeg" });
      setIsProcessing(false); streamRef.current?.getTracks().forEach(t => t.stop()); onCapture(file, previewUrl);
    });
  };

  return (
    <div className="space-y-2.5">
      {error ? (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-center space-y-2">
          <p className="text-sm font-bold text-red-700">{error}</p>
          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-700 cursor-pointer hover:bg-gray-50">
            🖼️ Pilih dari Galeri
            <input type="file" accept="image/*" className="hidden" onChange={(e) => {
              const file = e.target.files?.[0]; if (!file) return;
              const reader = new FileReader();
              reader.onload = (ev) => { const url = ev.target?.result as string; setIsProcessing(true); addWatermarkToImage(url, (blob, previewUrl) => { const f = new File([blob], file.name, { type: "image/jpeg" }); setIsProcessing(false); onCapture(f, previewUrl); }); };
              reader.readAsDataURL(file);
            }} />
          </label>
        </div>
      ) : (
        <div className="relative rounded-xl overflow-hidden bg-black aspect-video border border-gray-100">
          <video ref={videoRef} autoPlay playsInline muted onCanPlay={() => setIsReady(true)}
            className={`w-full h-full object-cover transition-opacity duration-300 ${facingMode === "user" ? "scale-x-[-1]" : ""} ${isReady ? "opacity-100" : "opacity-0"}`} />
          {!isReady && <div className="absolute inset-0 flex items-center justify-center"><div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" /></div>}
          <button onClick={() => setFacingMode(p => p === "environment" ? "user" : "environment")}
            className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/40 backdrop-blur-sm flex items-center justify-center text-white text-xs hover:bg-black/60 transition-all">🔄</button>
        </div>
      )}
      {isProcessing && <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2"><div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" /><p className="text-xs font-semibold text-gray-500">Menambahkan watermark...</p></div>}
      <div className="flex gap-2">
        <button onClick={onCancel} className={secondaryBtn} style={{ flex: "0 0 auto", padding: "0 12px" }}>Batal</button>
        <button onClick={capture} disabled={!isReady || isProcessing || !!error} className={primaryBtn}>{isProcessing ? <Spinner /> : <><span>📸</span><span>Ambil Foto</span></>}</button>
      </div>
    </div>
  );
}

// ─── PROOF PHOTO MODAL ────────────────────────────────────────────────────────
function ProofPhotoModal({ overtime, onClose, canViewPay: showPay }: { overtime: OvertimeRequest; onClose: () => void; canViewPay?: boolean }) {
  if (!overtime.proof_photo_url) return null;
  return (
    <ModalWrapper onClose={onClose}>
      <ModalHeader icon="📷" title="Bukti Lemburan" subtitle={overtime.users?.name} accentColor="from-blue-50 to-white" onClose={onClose} />
      <div className="px-5 py-4 space-y-3 max-h-[75vh] overflow-y-auto">
        <img src={overtime.proof_photo_url} alt="Bukti" className="w-full h-56 object-cover rounded-xl border border-gray-100 shadow-sm" />
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">Tanggal</p>
            <p className="font-bold text-gray-800 text-xs">{new Date(overtime.request_date).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</p>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">Waktu</p>
            <p className="font-bold text-gray-800 text-xs font-mono">{formatTime(overtime.actual_start ?? overtime.scheduled_start)} – {formatTime(overtime.actual_end ?? overtime.scheduled_end)}</p>
          </div>
        </div>
        {showPay && overtime.total_pay != null && (
          <div className="rounded-xl p-3.5 bg-gradient-to-r from-violet-600 to-purple-600 text-white">
            <p className="text-[9px] text-violet-200 font-bold uppercase tracking-wider mb-1">Total Bayaran</p>
            <p className="text-xl font-black tracking-tight">{formatRupiah(overtime.total_pay)}</p>
          </div>
        )}
      </div>
      <ModalFooter><button onClick={onClose} className={primaryBtn}>Tutup</button></ModalFooter>
    </ModalWrapper>
  );
}

// ─── APPROVE MODAL ────────────────────────────────────────────────────────────
function ApproveModal({ overtime, onClose, onSaved }: { overtime: OvertimeRequest; onClose: () => void; onSaved: () => void }) {
  const [scheduledStart, setScheduledStart] = useState(overtime.requested_start?.substring(0, 5) || "09:00");
  const [scheduledEnd, setScheduledEnd] = useState("17:00");
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState("");

  const approve = async () => {
    if (!scheduledStart || !scheduledEnd) { setError("Jam mulai & selesai wajib diisi"); return; }
    if (new Date(`1970-01-01T${scheduledEnd}:00`).getTime() <= new Date(`1970-01-01T${scheduledStart}:00`).getTime()) { setError("Jam selesai harus lebih besar"); return; }
    setApproving(true); setError("");
    try {
      const fmt = (t: string) => t.length === 5 ? `${t}:00` : t;
      const res = await fetch("/api/attendance/overtime", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: overtime.id, action: "APPROVE", scheduled_start: `${overtime.request_date}T${fmt(scheduledStart)}+07:00`, scheduled_end: `${overtime.request_date}T${fmt(scheduledEnd)}+07:00` }) });
      const d = await res.json();
      if (!res.ok || !d.success) { setError(d.message || `Error ${res.status}`); return; }
      onSaved(); onClose();
    } catch (err: any) { setError(err.message || "Gagal"); }
    finally { setApproving(false); }
  };

  return (
    <ModalWrapper onClose={onClose}>
      <ModalHeader icon="✅" title="Setujui Lemburan" subtitle={overtime.users?.name} accentColor="from-emerald-50 to-white" onClose={onClose} />
      <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
        {error && <ErrorBanner msg={error} />}
        <div className="bg-violet-50 border border-violet-100 rounded-xl p-3.5 space-y-2">
          <p className="text-[9px] font-black text-violet-700 uppercase tracking-wider">Info Pengajuan</p>
          <div className="space-y-1.5 text-xs text-gray-700">
            <div className="flex justify-between"><span className="text-gray-400">Tanggal</span><span className="font-bold">{new Date(overtime.request_date).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Jam diminta</span><span className="font-bold font-mono">{formatTime(overtime.requested_start)}</span></div>
            {overtime.reason && <div className="pt-2 border-t border-violet-100"><p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">Alasan</p><p className="text-xs text-gray-700">{overtime.reason}</p></div>}
          </div>
        </div>
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
          <span className="text-sm flex-shrink-0">⚡</span>
          <p className="text-[10px] text-emerald-700 font-medium">Setelah disetujui, lembur langsung berjalan otomatis.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className={lbl}>Jam Mulai *</label><input type="time" value={scheduledStart} onChange={e => setScheduledStart(e.target.value)} className={inp} /></div>
          <div><label className={lbl}>Jam Selesai *</label><input type="time" value={scheduledEnd} onChange={e => setScheduledEnd(e.target.value)} className={inp} /></div>
        </div>
      </div>
      <ModalFooter>
        <button onClick={onClose} className={secondaryBtn}>Batal</button>
        <button onClick={approve} disabled={approving} className={primaryBtn}>{approving ? <Spinner /> : "✅ Setujui & Mulai"}</button>
      </ModalFooter>
    </ModalWrapper>
  );
}

// ─── REASON OPTIONS ───────────────────────────────────────────────────────────
const REASON_OPTIONS = [
  { value: "Tugas Mendesak",          icon: "🔴", desc: "Harus diselesaikan segera" },
  { value: "Pekerjaan Belum Selesai", icon: "🟡", desc: "Pekerjaan hari ini belum tuntas" },
  { value: "Permintaan Atasan",       icon: "🔵", desc: "Diminta langsung oleh atasan" },
  { value: "Lainnya",                 icon: "✏️", desc: "Alasan lain" },
] as const;

// ─── REQUEST MODAL ────────────────────────────────────────────────────────────
function RequestOvertimeModal({ onClose, onSaved, currentUser }: { onClose: () => void; onSaved: () => void; currentUser: any }) {
  const [requestDate, setRequestDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [reasonType, setReasonType] = useState("");
  const [reasonCustom, setReasonCustom] = useState("");
  const [workDescription, setWorkDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const today = new Date().toISOString().split("T")[0];
  const isLainnya = reasonType === "Lainnya";

  const submit = async () => {
    if (!requestDate) { setError("Pilih tanggal"); return; }
    if (!reasonType) { setError("Pilih alasan"); return; }
    if (isLainnya && !reasonCustom.trim()) { setError("Jelaskan alasan"); return; }
    if (!workDescription.trim()) { setError("Rincian pekerjaan wajib diisi"); return; }
    setSubmitting(true); setError("");
    try {
      const res = await fetch("/api/attendance/overtime", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_date: requestDate, requested_start: `${startTime}:00`, reason: isLainnya ? reasonCustom.trim() : reasonType, work_description: workDescription.trim() }) });
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal mengajukan"); return; }
      onSaved(); onClose();
    } catch { setError("Gagal mengajukan"); }
    finally { setSubmitting(false); }
  };

  return (
    <ModalWrapper onClose={onClose}>
      <ModalHeader icon="📝" title="Ajukan Lemburan" subtitle={currentUser?.name || "Karyawan"} accentColor="from-violet-50 to-white" onClose={onClose} />
      <div className="px-5 py-4 space-y-3.5 max-h-[78vh] overflow-y-auto">
        {error && <ErrorBanner msg={error} />}
        <div className="grid grid-cols-2 gap-2">
          <div><label className={lbl}>Tanggal *</label><input type="date" min={today} value={requestDate} onChange={e => setRequestDate(e.target.value)} className={inp} /></div>
          <div><label className={lbl}>Jam Mulai *</label><input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={inp} /></div>
        </div>
        <div>
          <label className={lbl}>Alasan Lembur *</label>
          <div className="grid grid-cols-2 gap-1.5">
            {REASON_OPTIONS.map(opt => { const isSel = reasonType === opt.value; return (
              <button key={opt.value} type="button" onClick={() => { setReasonType(opt.value); if (opt.value !== "Lainnya") setReasonCustom(""); }}
                className={`flex items-start gap-2 px-3 py-2.5 rounded-xl border text-left transition-all active:scale-[0.99] ${isSel ? "bg-violet-600 border-violet-600 shadow-sm" : "bg-white border-gray-200 hover:border-violet-200 hover:bg-violet-50/40"}`}>
                <span className="text-sm flex-shrink-0 mt-px">{opt.icon}</span>
                <div><p className={`text-[11px] font-bold leading-tight ${isSel ? "text-white" : "text-gray-800"}`}>{opt.value}</p><p className={`text-[9px] mt-0.5 ${isSel ? "text-violet-200" : "text-gray-400"}`}>{opt.desc}</p></div>
              </button>
            ); })}
          </div>
        </div>
        {isLainnya && <div><label className={lbl}>Jelaskan Alasan *</label><input type="text" value={reasonCustom} onChange={e => setReasonCustom(e.target.value)} placeholder="Tuliskan alasan spesifik..." className={inp} autoFocus /></div>}
        <div>
          <label className={lbl}>Rincian Pekerjaan *</label>
          <textarea value={workDescription} onChange={e => setWorkDescription(e.target.value)} placeholder="Pekerjaan yang akan dikerjakan saat lembur..." rows={3}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all resize-none placeholder:text-gray-300" />
        </div>
      </div>
      <ModalFooter>
        <button onClick={onClose} className={secondaryBtn}>Batal</button>
        <button onClick={submit} disabled={submitting || !requestDate || !reasonType || (isLainnya && !reasonCustom.trim()) || !workDescription.trim()} className={primaryBtn}>{submitting ? <><Spinner /><span>Mengirim...</span></> : "📝 Ajukan"}</button>
      </ModalFooter>
    </ModalWrapper>
  );
}

// ─── SET PAY MODAL ────────────────────────────────────────────────────────────
function SetPayModal({ overtime, onClose, onSaved }: { overtime: OvertimeRequest; onClose: () => void; onSaved: () => void }) {
  const start = overtime.actual_start ?? overtime.scheduled_start;
  const end = overtime.actual_end ?? overtime.scheduled_end;
  const hours = (!start || !end) ? 0 : Math.floor((new Date(end).getTime() - new Date(start).getTime()) / (60 * 60 * 1000));
  const [rate, setRate] = useState(overtime.rate_per_hour ?? 100000);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const totalPay = rate * hours;

  const save = async () => {
    if (rate < 0) { setError("Tarif harus >= 0"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/attendance/overtime", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: overtime.id, action: "SET_PAY", rate_per_hour: Math.round(rate), total_pay: Math.round(totalPay) }) });
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal"); return; }
      onSaved(); onClose();
    } catch { setError("Gagal"); }
    finally { setSaving(false); }
  };

  return (
    <ModalWrapper onClose={onClose}>
      <ModalHeader icon="💰" title="Atur Bayaran" subtitle={overtime.users?.name} accentColor="from-emerald-50 to-white" onClose={onClose} />
      <div className="px-5 py-4 space-y-3 max-h-[65vh] overflow-y-auto">
        {error && <ErrorBanner msg={error} />}
        <div className="rounded-xl p-4 bg-gradient-to-br from-gray-900 to-gray-800 text-white">
          <div className="flex items-end justify-between mb-3">
            <div><p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">Durasi Aktual</p><p className="text-3xl font-black">{hours}<span className="text-base font-bold text-gray-400 ml-1">jam</span></p></div>
            <div className="text-right text-xs"><p className="text-gray-400 text-[9px] mb-0.5">Mulai</p><p className="font-mono font-bold">{formatTime(overtime.actual_start)}</p><p className="text-gray-400 text-[9px] mt-1 mb-0.5">Selesai</p><p className="font-mono font-bold">{formatTime(overtime.actual_end)}</p></div>
          </div>
          <div className="border-t border-white/10 pt-3">
            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">Total Bayaran</p>
            <p className="text-xl font-black text-emerald-400">{formatRupiah(Math.round(totalPay))}</p>
            <p className="text-[9px] text-gray-500 mt-0.5">{hours} jam × {formatRupiah(Math.round(rate))}</p>
          </div>
        </div>
        <div><label className={lbl}>Tarif Per Jam (Rp)</label>
          <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-bold">Rp</span><input type="number" min={0} value={rate} onChange={e => setRate(parseFloat(e.target.value) || 0)} className="w-full h-9 border border-gray-200 rounded-lg pl-9 pr-3 text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all" /></div>
        </div>
      </div>
      <ModalFooter>
        <button onClick={onClose} className={secondaryBtn}>Batal</button>
        <button onClick={save} disabled={saving} className={primaryBtn}>{saving ? <Spinner /> : "💾 Simpan"}</button>
      </ModalFooter>
    </ModalWrapper>
  );
}

// ─── COMPLETE MODAL ───────────────────────────────────────────────────────────
function CompleteModal({ overtime, onClose, onSaved, isAutoCompleted }: { overtime: OvertimeRequest; onClose: () => void; onSaved: () => void; isAutoCompleted?: boolean }) {
  const isNeedProof = overtime.status === "NEED_PROOF";
  const mustUpload = isAutoCompleted || isNeedProof;
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [photoStep, setPhotoStep] = useState<"idle"|"camera"|"preview">("idle");

  const handleClose = () => { if (mustUpload) { setError("⚠️ Wajib upload foto bukti dulu."); return; } onClose(); };

  const upload = async () => {
    if (mustUpload && !photoFile) { setError("⚠️ Foto bukti wajib diupload."); return; }
    setUploading(true); setError("");
    try {
      let photoUrl: string | null = null;
      if (photoFile) {
        const formData = new FormData(); formData.append("file", photoFile);
        const uploadRes = await fetch("/api/attendance/overtime/upload", { method: "POST", body: formData });
        if (!uploadRes.ok) { const e = await uploadRes.json(); throw new Error(e.message || "Upload gagal"); }
        const { url } = await uploadRes.json(); photoUrl = url;
      }
      const res = await fetch("/api/attendance/overtime", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: overtime.id, action: "COMPLETE", proof_photo_url: photoUrl }) });
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal"); return; }
      onSaved(); onClose();
    } catch (err: any) { setError(err.message || "Gagal"); }
    finally { setUploading(false); }
  };

  return (
    <ModalWrapper onClose={handleClose} preventClose={mustUpload}>
      <ModalHeader icon={isNeedProof ? "📸" : "🏁"} title={isNeedProof ? "Upload Bukti Lemburan" : "Selesaikan Lemburan"}
        subtitle={overtime.users?.name} accentColor={isNeedProof ? "from-orange-50 to-white" : "from-blue-50 to-white"} onClose={handleClose} disableClose={mustUpload} />
      <div className="px-5 py-4 space-y-3 max-h-[75vh] overflow-y-auto">
        {isNeedProof && <div className="bg-orange-50 border border-orange-200 rounded-xl p-3"><p className="font-black text-orange-800 text-xs mb-0.5">📸 Foto Bukti Wajib!</p><p className="text-[10px] text-orange-700">Upload foto bukti sebelum menutup halaman ini.</p></div>}
        {isAutoCompleted && !isNeedProof && <div className="bg-amber-50 border border-amber-200 rounded-xl p-3"><p className="font-black text-amber-800 text-xs mb-0.5">⚡ Waktu Lembur Habis!</p><p className="text-[10px] text-amber-700">Lemburanmu selesai otomatis. Wajib upload foto bukti.</p></div>}
        {error && <ErrorBanner msg={error} />}
        {photoStep === "preview" && photoPreview && (<div><img src={photoPreview} alt="Preview" className="w-full h-44 object-cover rounded-xl border border-gray-100 shadow-sm mb-2" /><button onClick={() => { setPhotoFile(null); setPhotoPreview(null); setPhotoStep("idle"); }} className="text-[10px] font-bold text-gray-400 hover:text-gray-700">↺ Ambil Ulang</button></div>)}
        {photoStep === "camera" && <CameraCapture onCapture={(file, url) => { setPhotoFile(file); setPhotoPreview(url); setPhotoStep("preview"); setError(""); }} onCancel={() => setPhotoStep("idle")} />}
        {photoStep === "idle" && (
          <button onClick={() => setPhotoStep("camera")} className={`w-full flex items-center justify-center gap-2.5 border-2 border-dashed rounded-xl p-6 text-center transition-all active:scale-[0.99] group ${mustUpload ? "border-orange-300 bg-orange-50/40 hover:border-orange-400" : "border-gray-200 hover:border-violet-300 hover:bg-violet-50/30"}`}>
            <span className="text-2xl group-hover:scale-110 transition-transform">📷</span>
            <div className="text-left"><p className={`text-xs font-bold ${mustUpload ? "text-orange-700" : "text-gray-700"}`}>Buka Kamera</p><p className={`text-[10px] mt-0.5 ${mustUpload ? "text-orange-500" : "text-gray-400"}`}>{mustUpload ? "Wajib ambil foto bukti" : "Ambil foto bukti lemburan"}</p></div>
          </button>
        )}
      </div>
      {photoStep !== "camera" && <ModalFooter>
        {!mustUpload && <button onClick={onClose} className={secondaryBtn}>Batal</button>}
        <button onClick={upload} disabled={uploading || (mustUpload && !photoFile)} className={primaryBtn}>{uploading ? <Spinner /> : photoFile ? "📸 Upload & Selesai" : mustUpload ? "📷 Ambil Foto Dulu" : "🏁 Selesai"}</button>
      </ModalFooter>}
    </ModalWrapper>
  );
}

// ─── MANUAL OVERTIME MODAL ────────────────────────────────────────────────────
function ManualOvertimeModal({ onClose, onSaved, allUsers }: { onClose: () => void; onSaved: () => void; allUsers: User[] }) {
  const [targetUserId, setTargetUserId] = useState("");
  const [requestDate, setRequestDate] = useState(new Date().toISOString().split("T")[0]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [reasonType, setReasonType] = useState("");
  const [reasonCustom, setReasonCustom] = useState("");
  const [workDescription, setWorkDescription] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoStep, setPhotoStep] = useState<"idle"|"camera"|"preview">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const previewHours = useMemo(() => {
    if (!startTime || !endTime) return null;
    const d = (new Date(`1970-01-01T${endTime}:00`).getTime() - new Date(`1970-01-01T${startTime}:00`).getTime()) / (60*60*1000);
    return d > 0 ? Math.floor(d) : null;
  }, [startTime, endTime]);

  const submit = async () => {
    if (!targetUserId || !requestDate || !startTime || !endTime || !reasonType || !workDescription.trim()) { setError("Semua field wajib diisi"); return; }
    const s = new Date(`1970-01-01T${startTime}:00`).getTime(), e = new Date(`1970-01-01T${endTime}:00`).getTime();
    if (e <= s) { setError("Jam selesai harus lebih besar dari jam mulai"); return; }
    if (reasonType === "Lainnya" && !reasonCustom.trim()) { setError("Jelaskan alasan"); return; }
    setSubmitting(true); setError("");
    try {
      let photoUrl: string | null = null;
      if (photoFile) {
        const formData = new FormData(); formData.append("file", photoFile);
        const ur = await fetch("/api/attendance/overtime/upload", { method: "POST", body: formData });
        if (!ur.ok) throw new Error((await ur.json()).message || "Upload gagal");
        photoUrl = (await ur.json()).url;
      }
      const res = await fetch("/api/attendance/overtime", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_manual: true, target_user_id: targetUserId, request_date: requestDate, actual_start_time: startTime, actual_end_time: endTime, work_description: workDescription.trim(), reason: reasonType === "Lainnya" ? reasonCustom.trim() : reasonType, proof_photo_url: photoUrl }) });
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal"); return; }
      onSaved(); onClose();
    } catch (err: any) { setError(err.message || "Gagal"); }
    finally { setSubmitting(false); }
  };

  return (
    <ModalWrapper onClose={onClose} wide>
      <ModalHeader icon="✏️" title="Input Lembur Manual" subtitle="Admin · Asisten CEO · Programmer" accentColor="from-gray-50 to-white" onClose={onClose} />
      <div className="px-5 py-4 space-y-3 max-h-[75vh] overflow-y-auto">
        {error && <ErrorBanner msg={error} />}
        <div><label className={lbl}>Nama Karyawan *</label>
          <select value={targetUserId} onChange={e => setTargetUserId(e.target.value)} className={inp + " cursor-pointer"}>
            <option value="">— Pilih karyawan —</option>
            {allUsers.slice().sort((a,b) => a.name.localeCompare(b.name,"id-ID")).map(u => <option key={u.id} value={u.id}>{u.name} ({u.role.replace(/_/g," ")})</option>)}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div><label className={lbl}>Tanggal *</label><input type="date" value={requestDate} onChange={e => setRequestDate(e.target.value)} className={inp} /></div>
          <div><label className={lbl}>Jam Mulai *</label><input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={inp} /></div>
          <div><label className={lbl}>Jam Selesai *</label><input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={inp} /></div>
        </div>
        {previewHours !== null && <div className="flex items-center gap-2 bg-violet-50 border border-violet-100 rounded-lg px-3 py-2"><span className="text-sm">⏱️</span><span className="text-xs text-violet-700 font-bold">Durasi: {previewHours} jam</span></div>}
        <div>
          <label className={lbl}>Alasan Lembur *</label>
          <div className="grid grid-cols-2 gap-1.5">
            {REASON_OPTIONS.map(opt => { const isSel = reasonType === opt.value; return (
              <button key={opt.value} type="button" onClick={() => { setReasonType(opt.value); if (opt.value !== "Lainnya") setReasonCustom(""); }}
                className={`flex items-start gap-2 px-3 py-2.5 rounded-xl border text-left transition-all active:scale-[0.99] ${isSel ? "bg-violet-600 border-violet-600" : "bg-white border-gray-200 hover:border-violet-200 hover:bg-violet-50/40"}`}>
                <span className="text-sm">{opt.icon}</span>
                <div><p className={`text-[11px] font-bold leading-tight ${isSel ? "text-white" : "text-gray-800"}`}>{opt.value}</p><p className={`text-[9px] mt-0.5 ${isSel ? "text-violet-200" : "text-gray-400"}`}>{opt.desc}</p></div>
              </button>
            ); })}
          </div>
        </div>
        {reasonType === "Lainnya" && <div><label className={lbl}>Jelaskan Alasan *</label><input type="text" value={reasonCustom} onChange={e => setReasonCustom(e.target.value)} placeholder="Alasan spesifik..." className={inp} autoFocus /></div>}
        <div><label className={lbl}>Rincian Pekerjaan *</label>
          <textarea value={workDescription} onChange={e => setWorkDescription(e.target.value)} placeholder="Pekerjaan yang dikerjakan saat lembur..." rows={2}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all resize-none placeholder:text-gray-300" />
        </div>
        <div>
          <label className={lbl}>Foto Bukti <span className="normal-case font-normal text-gray-400">(opsional)</span></label>
          {photoStep === "preview" && photoPreview ? (<div><img src={photoPreview} alt="Preview" className="w-full h-36 object-cover rounded-xl border border-gray-100 shadow-sm mb-2" /><button onClick={() => { setPhotoFile(null); setPhotoPreview(null); setPhotoStep("idle"); }} className="text-[10px] font-bold text-gray-400 hover:text-gray-700">↺ Ambil Ulang</button></div>)
          : photoStep === "camera" ? <CameraCapture onCapture={(file, url) => { setPhotoFile(file); setPhotoPreview(url); setPhotoStep("preview"); setError(""); }} onCancel={() => setPhotoStep("idle")} />
          : <button onClick={() => setPhotoStep("camera")} className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl p-4 hover:border-violet-300 hover:bg-violet-50/30 transition-all group"><span className="text-xl group-hover:scale-110 transition-transform">📷</span><span className="text-xs font-bold text-gray-600">Buka Kamera</span></button>}
        </div>
      </div>
      {photoStep !== "camera" && <ModalFooter>
        <button onClick={onClose} className={secondaryBtn}>Batal</button>
        <button onClick={submit} disabled={submitting || !targetUserId || !requestDate || !reasonType || !workDescription.trim()} className={primaryBtn}>{submitting ? <><Spinner /><span>Menyimpan...</span></> : "✅ Simpan Lembur"}</button>
      </ModalFooter>}
    </ModalWrapper>
  );
}

// ─── EDIT OVERTIME MODAL ──────────────────────────────────────────────────────
function EditOvertimeModal({ overtime, onClose, onSaved }: { overtime: OvertimeRequest; onClose: () => void; onSaved: () => void }) {
  const toTimeStr = (iso: string | null | undefined): string => {
    if (!iso) return "";
    if (!iso.includes("T")) return iso.substring(0, 5);
    const d = new Date(iso); if (isNaN(d.getTime())) return "";
    const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000);
    return `${String(wib.getUTCHours()).padStart(2,"0")}:${String(wib.getUTCMinutes()).padStart(2,"0")}`;
  };

  const savedReason = overtime.reason ?? "";
  const knownOptions = REASON_OPTIONS.map(o => o.value) as string[];
  const isKnownReason = knownOptions.includes(savedReason);

  const [requestDate, setRequestDate] = useState(overtime.request_date?.slice(0,10) ?? "");
  const [startTime, setStartTime] = useState(toTimeStr(overtime.actual_start ?? overtime.scheduled_start));
  const [endTime, setEndTime] = useState(toTimeStr(overtime.actual_end ?? overtime.scheduled_end));
  const [reasonType, setReasonType] = useState(isKnownReason ? savedReason : "Lainnya");
  const [reasonCustom, setReasonCustom] = useState(isKnownReason ? "" : savedReason);
  const [workDesc, setWorkDesc] = useState(overtime.work_description ?? "");
  const [status, setStatus] = useState(overtime.status);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(overtime.proof_photo_url ?? null);
  const [photoStep, setPhotoStep] = useState<"idle"|"camera"|"preview">(overtime.proof_photo_url ? "preview" : "idle");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isLainnya = reasonType === "Lainnya";

  const previewDuration = useMemo(() => {
    if (!startTime || !endTime) return null;
    const d = (new Date(`1970-01-01T${endTime}:00`).getTime() - new Date(`1970-01-01T${startTime}:00`).getTime()) / (60*60*1000);
    return d > 0 ? Math.floor(d) : null;
  }, [startTime, endTime]);

  const fmt = (t: string) => t.length === 5 ? `${t}:00` : t;

  const save = async () => {
    if (!requestDate || !startTime || !endTime || !reasonType) { setError("Semua field wajib diisi"); return; }
    if (isLainnya && !reasonCustom.trim()) { setError("Jelaskan alasan lembur"); return; }
    const s = new Date(`1970-01-01T${startTime}:00`).getTime(), e = new Date(`1970-01-01T${endTime}:00`).getTime();
    if (e <= s) { setError("Jam selesai harus lebih besar dari jam mulai"); return; }
    setSaving(true); setError("");
    try {
      let proofUrl: string | null | undefined = undefined;
      if (photoFile) {
        const formData = new FormData(); formData.append("file", photoFile);
        const uploadRes = await fetch("/api/attendance/overtime/upload", { method: "POST", body: formData });
        if (!uploadRes.ok) throw new Error((await uploadRes.json()).message || "Upload foto gagal");
        proofUrl = (await uploadRes.json()).url;
      } else if (photoPreview === null && overtime.proof_photo_url) {
        proofUrl = null;
      }
      const isoStart = `${requestDate}T${fmt(startTime)}+07:00`;
      const isoEnd   = `${requestDate}T${fmt(endTime)}+07:00`;
      const payload: Record<string, any> = {
        id: overtime.id, action: "UPDATE",
        request_date: requestDate,
        scheduled_start: isoStart, scheduled_end: isoEnd,
        actual_start: isoStart,   actual_end: isoEnd,
        reason: isLainnya ? reasonCustom.trim() : reasonType,
        work_description: workDesc.trim(), status,
      };
      if (proofUrl !== undefined) payload.proof_photo_url = proofUrl;
      const res = await fetch("/api/attendance/overtime", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.message || `Error ${res.status}`); return; }
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal menyimpan"); return; }
      onSaved(); onClose();
    } catch (err: any) { setError(err.message || "Terjadi kesalahan"); }
    finally { setSaving(false); }
  };

  const STATUS_OPTIONS: OvertimeRequest["status"][] = ["PENDING","APPROVED","ONGOING","NEED_PROOF","COMPLETED","REJECTED","CANCELLED"];

  return (
    <ModalWrapper onClose={onClose} wide>
      <ModalHeader icon="✏️" title="Edit Lembur" subtitle={overtime.users?.name ?? "Karyawan"} accentColor="from-violet-50 to-white" onClose={onClose} />
      <div className="px-5 py-4 space-y-3 max-h-[78vh] overflow-y-auto">
        {error && <ErrorBanner msg={error} />}

        {/* Row 1: Tanggal + Status */}
        <div className="grid grid-cols-2 gap-2">
          <div><label className={lbl}>Tanggal *</label><input type="date" value={requestDate} onChange={e => setRequestDate(e.target.value)} className={inp} /></div>
          <div><label className={lbl}>Status</label>
            <select value={status} onChange={e => setStatus(e.target.value as OvertimeRequest["status"])} className={inp + " cursor-pointer"}>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_CONFIG[s]?.label ?? s}</option>)}
            </select>
          </div>
        </div>

        {/* Row 2: Jam */}
        <div>
          <label className={lbl}>Jam Lembur *</label>
          <div className="grid grid-cols-2 gap-2">
            <div><p className="text-[9px] text-gray-400 font-semibold mb-1">Mulai</p><input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={inp} /></div>
            <div><p className="text-[9px] text-gray-400 font-semibold mb-1">Selesai</p><input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={inp} /></div>
          </div>
          {previewDuration !== null && (
            <div className="mt-2 inline-flex items-center gap-1.5 bg-violet-50 border border-violet-100 rounded-lg px-3 py-1.5">
              <span className="text-xs">⏱️</span>
              <span className="text-[10px] font-bold text-violet-700">{previewDuration} jam</span>
            </div>
          )}
        </div>

        {/* Alasan — compact 2 col grid */}
        <div>
          <label className={lbl}>Alasan Lembur *</label>
          <div className="grid grid-cols-2 gap-1.5">
            {REASON_OPTIONS.map(opt => { const isSel = reasonType === opt.value; return (
              <button key={opt.value} type="button" onClick={() => { setReasonType(opt.value); if (opt.value !== "Lainnya") setReasonCustom(""); }}
                className={`flex items-start gap-2 px-3 py-2.5 rounded-xl border text-left transition-all active:scale-[0.99] ${isSel ? "bg-violet-600 border-violet-600 shadow-sm" : "bg-white border-gray-200 hover:border-violet-200 hover:bg-violet-50/40"}`}>
                <span className="text-sm flex-shrink-0 mt-px">{opt.icon}</span>
                <div><p className={`text-[11px] font-bold leading-tight ${isSel ? "text-white" : "text-gray-800"}`}>{opt.value}</p><p className={`text-[9px] mt-0.5 ${isSel ? "text-violet-200" : "text-gray-400"}`}>{opt.desc}</p></div>
              </button>
            ); })}
          </div>
        </div>
        {isLainnya && <div><label className={lbl}>Jelaskan Alasan *</label><input type="text" value={reasonCustom} onChange={e => setReasonCustom(e.target.value)} placeholder="Tuliskan alasan spesifik..." className={inp} autoFocus /></div>}

        {/* Rincian */}
        <div><label className={lbl}>Rincian Pekerjaan</label>
          <textarea value={workDesc} onChange={e => setWorkDesc(e.target.value)} rows={2} placeholder="Pekerjaan yang dikerjakan saat lembur..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all resize-none placeholder:text-gray-300" />
        </div>

        {/* Foto bukti */}
        <div>
          <label className={lbl}>Foto Bukti <span className="normal-case font-normal text-gray-400">(opsional)</span></label>
          {photoStep === "preview" && photoPreview
            ? <div><img src={photoPreview} alt="Preview" className="w-full h-36 object-cover rounded-xl border border-gray-100 shadow-sm mb-2" /><button onClick={() => { setPhotoFile(null); setPhotoPreview(null); setPhotoStep("idle"); }} className="text-[10px] font-bold text-gray-400 hover:text-gray-700">↺ Hapus Foto</button></div>
            : photoStep === "camera"
            ? <CameraCapture onCapture={(file, url) => { setPhotoFile(file); setPhotoPreview(url); setPhotoStep("preview"); setError(""); }} onCancel={() => setPhotoStep("idle")} />
            : <button onClick={() => setPhotoStep("camera")} className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl p-4 hover:border-violet-300 hover:bg-violet-50/30 transition-all group"><span className="text-xl group-hover:scale-110 transition-transform">📷</span><span className="text-xs font-bold text-gray-600">Buka Kamera</span></button>}
        </div>
      </div>
      {photoStep !== "camera" && <ModalFooter>
        <button onClick={onClose} className={secondaryBtn}>Batal</button>
        <button onClick={save} disabled={saving || !requestDate || !startTime || !endTime || !reasonType || (isLainnya && !reasonCustom.trim())} className={primaryBtn}>{saving ? <><Spinner /><span>Menyimpan...</span></> : "💾 Simpan Perubahan"}</button>
      </ModalFooter>}
    </ModalWrapper>
  );
}

// ─── DELETE MODAL ─────────────────────────────────────────────────────────────
function DeleteConfirmModal({ overtime, onClose, onDeleted, canViewPay: showPay }: { overtime: OvertimeRequest; onClose: () => void; onDeleted: () => void; canViewPay?: boolean }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const handleDelete = async () => {
    setDeleting(true); setError("");
    try {
      const res = await fetch(`/api/attendance/overtime?id=${overtime.id}`, { method: "DELETE" });
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal menghapus"); return; }
      onDeleted(); onClose();
    } catch (err: any) { setError(err.message || "Gagal"); }
    finally { setDeleting(false); }
  };
  return (
    <ModalWrapper onClose={onClose}>
      <ModalHeader icon="🗑️" title="Hapus Lembur" subtitle={overtime.users?.name} accentColor="from-red-50 to-white" onClose={onClose} />
      <div className="px-5 py-4 space-y-3">
        {error && <ErrorBanner msg={error} />}
        <div className="bg-red-50 border border-red-100 rounded-xl p-3.5 space-y-1.5">
          <p className="text-[9px] font-black text-red-700 uppercase tracking-wider mb-2">Data yang akan dihapus</p>
          {[["Karyawan", overtime.users?.name ?? "—"], ["Tanggal", new Date(overtime.request_date).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })], ["Waktu", `${formatTime(overtime.scheduled_start)} – ${formatTime(overtime.scheduled_end)}`]].map(([k,v]) => (
            <div key={k} className="flex justify-between text-xs"><span className="text-gray-400">{k}</span><span className="font-bold text-gray-800">{v}</span></div>
          ))}
          <div className="flex justify-between items-center text-xs"><span className="text-gray-400">Status</span><StatusBadge status={overtime.status} /></div>
          {showPay && overtime.total_pay != null && <div className="flex justify-between text-xs"><span className="text-gray-400">Total Bayaran</span><span className="font-bold text-gray-800">{formatRupiah(overtime.total_pay)}</span></div>}
        </div>
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2"><span className="text-sm flex-shrink-0">⚠️</span><p className="text-[10px] text-amber-700 font-medium">Tindakan ini <strong>tidak dapat dibatalkan</strong>.</p></div>
      </div>
      <ModalFooter>
        <button onClick={onClose} className={secondaryBtn}>Batal</button>
        <button onClick={handleDelete} disabled={deleting} className="flex-1 h-9 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-40">{deleting ? <Spinner /> : "🗑️ Hapus Permanen"}</button>
      </ModalFooter>
    </ModalWrapper>
  );
}

// ─── ACTION DROPDOWN ──────────────────────────────────────────────────────────
type ActionItem = { label: string; icon: string; onClick: () => void; variant?: "default"|"danger"|"success" };
function ActionDropdown({ items }: { items: ActionItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const cls: Record<string, string> = { default: "text-gray-700 hover:bg-gray-50", danger: "text-red-600 hover:bg-red-50", success: "text-emerald-700 hover:bg-emerald-50" };
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(v => !v)} className="w-6 h-6 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all border border-gray-200 text-xs font-bold" title="Aksi lainnya">⋯</button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden min-w-[140px]" style={{ animation: "modalUp 0.15s ease" }}>
          {items.map((item, i) => (
            <button key={i} onClick={() => { item.onClick(); setOpen(false); }} className={`w-full flex items-center gap-2 px-3 py-2 text-[11px] font-bold text-left transition-colors ${cls[item.variant ?? "default"]}`}>
              <span className="text-sm flex-shrink-0">{item.icon}</span>{item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── OVERTIME TABLE ───────────────────────────────────────────────────────────
function OvertimeTable({ rows, showDateCol, userCanViewPay, renderActions }: { rows: OvertimeRequest[]; showDateCol: boolean; userCanViewPay: boolean; renderActions: (o: OvertimeRequest) => React.ReactNode }) {
  const headers = [
    { key: "karyawan", label: "Karyawan", align: "text-left" },
    ...(showDateCol ? [{ key: "tanggal", label: "Tanggal", align: "text-left" }] : []),
    { key: "waktu",     label: "Waktu",     align: "text-left"   },
    { key: "alasan",    label: "Alasan",    align: "text-left"   },
    { key: "pekerjaan", label: "Pekerjaan", align: "text-left"   },
    { key: "status",    label: "Status",    align: "text-left"   },
    ...(userCanViewPay ? [{ key: "bayaran", label: "Bayaran", align: "text-right" }] : []),
    { key: "aksi",      label: "",          align: "text-center" },
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/80">
            {headers.map(h => <th key={h.key} className={`px-3 py-2.5 text-[9px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap ${h.align}`}>{h.label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map(o => (
            <tr key={o.id} className="hover:bg-violet-50/30 transition-colors group">
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${avatarColor(o.users?.name||"")} flex items-center justify-center text-white text-[9px] font-black flex-shrink-0 shadow-sm`}>{initials(o.users?.name||"??")}</div>
                  <div className="min-w-0"><p className="font-bold text-gray-800 text-[11px] truncate">{o.users?.name}</p><p className="text-[9px] text-gray-400 truncate">{o.users?.role?.replace(/_/g," ")}</p></div>
                </div>
              </td>
              {showDateCol && <td className="px-3 py-2.5 whitespace-nowrap"><span className="font-mono font-bold text-gray-500 text-[10px]">{new Date(o.request_date).toLocaleDateString("id-ID", { day:"numeric", month:"short", year:"numeric" })}</span></td>}
              <td className="px-3 py-2.5 whitespace-nowrap"><span className="font-mono text-gray-600 text-[10px] font-semibold">{formatTime(o.scheduled_start)} – {formatTime(o.scheduled_end)}</span></td>
              <td className="px-3 py-2.5" style={{ maxWidth: 120 }}><span className="text-gray-500 text-[10px] line-clamp-2" title={o.reason||""}>{o.reason||"—"}</span></td>
              <td className="px-3 py-2.5" style={{ maxWidth: 140 }}><span className="text-gray-500 text-[10px] line-clamp-2" title={o.work_description||""}>{o.work_description||"—"}</span></td>
              <td className="px-3 py-2.5"><StatusBadge status={o.status} /></td>
              {userCanViewPay && <td className="px-3 py-2.5 text-right whitespace-nowrap">{o.total_pay != null ? <span className="font-bold text-gray-800 font-mono text-[10px]">{formatRupiah(o.total_pay)}</span> : <span className="text-gray-300 text-[10px]">—</span>}</td>}
              <td className="px-3 py-2.5">{renderActions(o)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function OvertimePage() {
  const [overtimes, setOvertimes] = useState<OvertimeRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState<string>("Semua");
  const [calendarMonth, setCalendarMonth] = useState<{year:number;month:number}>({ year: new Date().getFullYear(), month: new Date().getMonth() });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [setPayData, setSetPayData] = useState<OvertimeRequest | null>(null);
  const [completeData, setCompleteData] = useState<OvertimeRequest | null>(null);
  const [approveData, setApproveData] = useState<OvertimeRequest | null>(null);
  const [proofPhotoData, setProofPhotoData] = useState<OvertimeRequest | null>(null);
  const [editData, setEditData] = useState<OvertimeRequest | null>(null);
  const [deleteData, setDeleteData] = useState<OvertimeRequest | null>(null);
  const autoCompletingIds = useRef<Set<string>>(new Set());

  useEffect(() => { getCurrentUserClient().then(u => setCurrentUser(u)); }, []);
  const fetchOvertimes = useCallback(async () => { const r = await fetch("/api/attendance/overtime"); const d = await r.json(); if (d.success) setOvertimes(d.data || []); }, []);
  const fetchAllUsers = useCallback(async () => { const r = await fetch("/api/users"); const d = await r.json(); if (d.success) setAllUsers(d.users || []); }, []);

  useEffect(() => {
    if (currentUser === null) return;
    setLoading(true);
    Promise.all([fetchOvertimes(), isAdminRole(currentUser?.role) ? fetchAllUsers() : Promise.resolve()]).finally(() => setLoading(false));
  }, [fetchOvertimes, fetchAllUsers, currentUser?.role]);

  useEffect(() => {
    if (!currentUser) return;
    const parse = (iso: string|null) => { if (!iso) return 0; try { const t = new Date(iso).getTime(); return isNaN(t) ? 0 : t; } catch { return 0; } };
    const id = setInterval(() => {
      const now = Date.now();
      overtimes.forEach(o => {
        if (o.user_id !== currentUser.id || o.status !== "ONGOING" || o.actual_end || autoCompletingIds.current.has(o.id)) return;
        const t = parse(o.scheduled_end);
        if (t === 0 || t > now) return;
        handleAutoComplete(o);
      });
    }, 5000);
    return () => clearInterval(id);
  }, [overtimes, currentUser]);

  const handleAutoComplete = async (overtime: OvertimeRequest) => {
    if (autoCompletingIds.current.has(overtime.id)) return;
    autoCompletingIds.current.add(overtime.id);
    try {
      const res = await fetch("/api/attendance/overtime", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: overtime.id, action: "COMPLETE", proof_photo_url: null, auto_completed: true }) });
      const d = await res.json();
      if (d.success) { await fetchOvertimes(); setCompleteData({ ...overtime, ...d.data, auto_completed: true }); setTimeout(() => { autoCompletingIds.current.delete(overtime.id); }, 5000); }
      else { autoCompletingIds.current.delete(overtime.id); }
    } catch { autoCompletingIds.current.delete(overtime.id); }
  };

  const filtered = useMemo(() => filterStatus === "Semua" ? overtimes : overtimes.filter(o => o.status === filterStatus), [overtimes, filterStatus]);
  const statuses = useMemo(() => [...new Set(overtimes.map(o => o.status))], [overtimes]);
  const thisMonthOvertimes = overtimes.filter(o => toWIBDateKey(o.request_date).startsWith(`${calendarMonth.year}-${pad2(calendarMonth.month + 1)}`));
  const byDate = useMemo(() => { const m: Record<string, OvertimeRequest[]> = {}; thisMonthOvertimes.forEach(o => { const k = toWIBDateKey(o.request_date); if (!m[k]) m[k] = []; m[k].push(o); }); return m; }, [thisMonthOvertimes]);
  const calDays = useMemo(() => {
    const fd = new Date(calendarMonth.year, calendarMonth.month, 1).getDay(), dim = new Date(calendarMonth.year, calendarMonth.month + 1, 0).getDate();
    const c: (number|null)[] = []; for (let i = 0; i < fd; i++) c.push(null); for (let d = 1; d <= dim; d++) c.push(d); return c;
  }, [calendarMonth.year, calendarMonth.month]);
  const selectedOvertimes = selectedDate ? (byDate[selectedDate] || []).sort((a,b) => (a.users?.name||"").localeCompare(b.users?.name||"","id-ID")) : [];

  const statCards = [
    { label: "Total",    value: overtimes.length,                                          icon: "📋", from: "from-gray-700", to: "to-gray-900",    ring: "ring-gray-200"    },
    { label: "Pending",  value: overtimes.filter(o => o.status === "PENDING").length,       icon: "⏳", from: "from-amber-400", to: "to-orange-500",  ring: "ring-amber-100"   },
    { label: "Berjalan", value: overtimes.filter(o => o.status === "ONGOING").length,       icon: "▶",  from: "from-emerald-400", to: "to-teal-500",  ring: "ring-emerald-100" },
    { label: "Selesai",  value: overtimes.filter(o => o.status === "COMPLETED").length,     icon: "✓",  from: "from-blue-400", to: "to-cyan-500",    ring: "ring-blue-100"    },
  ];

  const userCanViewPay = canViewPay(currentUser?.role);

  const renderActions = (o: OvertimeRequest) => {
    const primary = (() => {
      if (currentUser?.id === o.user_id && o.status === "NEED_PROOF")
        return <button onClick={() => setCompleteData(o)} className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded-md bg-orange-500 hover:bg-orange-600 text-white transition-all active:scale-95 whitespace-nowrap animate-pulse">📸 Upload</button>;
      if (currentUser?.id === o.user_id && o.status === "ONGOING" && !o.actual_end)
        return <button onClick={() => setCompleteData(o)} className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-all active:scale-95 whitespace-nowrap">🏁 Selesai</button>;
      if (currentUser?.id === o.user_id && o.status === "COMPLETED" && !o.proof_photo_url)
        return <button onClick={() => setCompleteData({...o, auto_completed: true})} className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded-md bg-amber-500 hover:bg-amber-600 text-white transition-all active:scale-95 whitespace-nowrap">📸 Upload</button>;
      if (isAdminRole(currentUser?.role) && o.status === "PENDING")
        return <button onClick={() => setApproveData(o)} className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded-md bg-violet-600 hover:bg-violet-700 text-white transition-all active:scale-95 whitespace-nowrap">✅ Setujui</button>;
      return null;
    })();

    const secondary: ActionItem[] = [];
    if (o.proof_photo_url && (canApproveRole(currentUser?.role) || currentUser?.id === o.user_id)) secondary.push({ label: "Lihat Foto", icon: "👁️", onClick: () => setProofPhotoData(o) });
    if (canSetPay(currentUser?.role) && (o.status === "COMPLETED" || o.status === "NEED_PROOF")) secondary.push({ label: o.rate_per_hour ? "Edit Bayaran" : "Set Bayaran", icon: "💰", onClick: () => setSetPayData(o), variant: "success" });

    const admin: ActionItem[] = [];
    if (isAdminRole(currentUser?.role)) { admin.push({ label: "Edit", icon: "✏️", onClick: () => setEditData(o) }); admin.push({ label: "Hapus", icon: "🗑️", onClick: () => setDeleteData(o), variant: "danger" }); }

    const allItems = [...secondary, ...admin];
    const hasDivider = primary !== null || secondary.length > 0;

    return (
      <div className="flex items-center justify-center gap-1">
        {primary}
        {secondary.map((item,i) => <button key={i} onClick={item.onClick} className={`hidden sm:inline-flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded-md transition-all active:scale-95 whitespace-nowrap ${item.variant === "success" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"}`}>{item.icon} {item.label}</button>)}
        {admin.length > 0 && hasDivider && <div className="hidden sm:block w-px h-3.5 bg-gray-200 mx-0.5 flex-shrink-0" />}
        {admin.map((item,i) => <button key={i} onClick={item.onClick} className={`hidden sm:inline-flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded-md transition-all active:scale-95 whitespace-nowrap border ${item.variant === "danger" ? "bg-red-50 hover:bg-red-100 text-red-600 border-red-100" : "bg-gray-100 hover:bg-gray-200 text-gray-700 border-gray-200"}`}>{item.icon}{item.label !== "Hapus" ? ` ${item.label}` : ""}</button>)}
        {allItems.length > 0 && <div className="sm:hidden"><ActionDropdown items={allItems} /></div>}
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-[#F5F5F7]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-4 sm:space-y-5">

          {/* ── HEADER ── */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5 mb-0.5">
                <div className="w-1 h-6 rounded-full bg-gradient-to-b from-violet-500 to-violet-700 flex-shrink-0" />
                <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">Lembur Karyawan</h1>
              </div>
              <p className="text-xs text-gray-400 font-medium pl-4">{loading ? "Memuat data..." : `${overtimes.length} lemburan terdaftar`}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {isAdminRole(currentUser?.role) && (
                <button onClick={() => setShowManualModal(true)} className="h-9 px-4 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all hover:shadow-sm active:scale-[0.98] whitespace-nowrap">
                  <span>✏️</span><span className="hidden sm:inline">Input Manual</span>
                </button>
              )}
              <button onClick={() => setShowRequestModal(true)} className="h-9 px-4 bg-gradient-to-r from-violet-600 to-violet-700 hover:from-violet-700 hover:to-violet-800 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm shadow-violet-200 active:scale-[0.98] whitespace-nowrap">
                <span>📝</span><span>Ajukan Lemburan</span>
              </button>
            </div>
          </div>

          {/* ── STAT CARDS ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {statCards.map(c => (
              <div key={c.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-all duration-200 hover:-translate-y-0.5">
                <div className={`h-0.5 w-full bg-gradient-to-r ${c.from} ${c.to}`} />
                <div className="p-4 flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${c.from} ${c.to} flex items-center justify-center text-base flex-shrink-0 ring-4 ${c.ring} shadow-sm`}>{c.icon}</div>
                  <div className="min-w-0">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">{c.label}</p>
                    <p className="text-2xl font-black text-gray-900 tracking-tight leading-none">{loading ? <span className="inline-block w-7 h-5 bg-gray-100 rounded animate-pulse" /> : c.value}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* ── CALENDAR ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center text-sm flex-shrink-0">📅</div>
                <div>
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none mb-0.5">Kalender Lembur</p>
                  <p className="font-black text-gray-900 text-sm leading-tight">{MONTH_NAMES[calendarMonth.month]} {calendarMonth.year}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setCalendarMonth(m => ({ month: m.month === 0 ? 11 : m.month - 1, year: m.month === 0 ? m.year - 1 : m.year }))} className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-800 transition-all active:scale-95 text-sm font-bold">‹</button>
                <button onClick={() => setCalendarMonth({ year: new Date().getFullYear(), month: new Date().getMonth() })} className="h-7 px-2.5 rounded-lg hover:bg-gray-100 text-[10px] font-bold text-gray-500 hover:text-gray-800 transition-all">Hari ini</button>
                <button onClick={() => setCalendarMonth(m => ({ month: m.month === 11 ? 0 : m.month + 1, year: m.month === 11 ? m.year + 1 : m.year }))} className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-800 transition-all active:scale-95 text-sm font-bold">›</button>
              </div>
            </div>
            <div className="p-4 overflow-x-auto">
              <div className="grid grid-cols-7 gap-1 mb-1 min-w-[280px]">
                {DAY_NAMES.map((d,i) => <div key={d} className={`text-center text-[9px] font-black py-1 uppercase tracking-wider ${i === 0 ? "text-red-400" : "text-gray-400"}`}>{d}</div>)}
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
                    <button key={day} onClick={() => setSelectedDate(selectedDate === dk ? null : dk)}
                      className={`relative flex flex-col items-center justify-start pt-1.5 pb-1 rounded-xl min-h-[52px] sm:min-h-[64px] transition-all duration-150 border text-sm ${isSel ? "bg-violet-600 border-violet-500 shadow-sm shadow-violet-200" : total > 0 ? "bg-violet-50 border-violet-100 hover:bg-violet-100 hover:border-violet-200" : "bg-transparent border-gray-100 hover:bg-gray-50 hover:border-gray-200"}`}>
                      <span className={`font-black mb-1 transition-colors text-sm leading-none ${isSel ? "text-white" : isToday ? "text-violet-600" : isSun ? "text-red-400" : "text-gray-700"}`}>{day}</span>
                      {isToday && !isSel && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-violet-500" />}
                      {total > 0 && <span className={`text-[9px] font-black rounded-full px-1.5 py-0.5 leading-none ${isSel ? "bg-white/25 text-white" : "bg-violet-500 text-white"}`}>{total}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── SELECTED DATE ── */}
          {selectedDate && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
                <div>
                  <p className="font-black text-gray-900 text-sm">{new Date(selectedDate + "T12:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5 font-medium">{selectedOvertimes.length} lemburan tercatat</p>
                </div>
                <button onClick={() => setSelectedDate(null)} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-all">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              {selectedOvertimes.length === 0
                ? <div className="flex flex-col items-center justify-center py-12 gap-2"><div className="w-10 h-10 rounded-2xl bg-gray-100 flex items-center justify-center text-xl">📭</div><p className="text-xs font-bold text-gray-400">Tidak ada lemburan</p></div>
                : <OvertimeTable rows={selectedOvertimes} showDateCol={false} userCanViewPay={userCanViewPay} renderActions={renderActions} />}
            </div>
          )}

          {/* ── ALL OVERTIMES ── */}
          {!selectedDate && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100">
                <div className="flex items-center justify-between mb-2.5">
                  <p className="font-black text-gray-900 text-sm">Daftar Lemburan</p>
                  <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full tabular-nums">{filtered.length} data</span>
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
                  {["Semua", ...statuses].map(s => {
                    const cfg = s !== "Semua" ? STATUS_CONFIG[s] : null;
                    const isActive = filterStatus === s;
                    return (
                      <button key={s} onClick={() => setFilterStatus(s)}
                        className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all duration-150 border ${isActive ? "bg-violet-600 text-white border-violet-600 shadow-sm" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700 hover:bg-gray-50"}`}>
                        {cfg ? `${cfg.icon} ${cfg.label}` : "Semua"}
                      </button>
                    );
                  })}
                </div>
              </div>
              {loading
                ? <div className="p-4 space-y-1.5">{Array(5).fill(0).map((_,i) => <div key={i} className="h-10 bg-gray-50 rounded-xl animate-pulse" style={{ opacity: 1 - i * 0.15 }} />)}</div>
                : filtered.length === 0
                ? <div className="flex flex-col items-center justify-center py-16 gap-2"><div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center text-2xl">📭</div><p className="text-xs font-bold text-gray-400">Belum ada data lemburan</p><p className="text-[10px] text-gray-300">Coba ubah filter status</p></div>
                : <OvertimeTable rows={filtered} showDateCol={true} userCanViewPay={userCanViewPay} renderActions={renderActions} />}
            </div>
          )}
        </div>
      </div>

      {showRequestModal && <RequestOvertimeModal onClose={() => setShowRequestModal(false)} onSaved={() => { fetchOvertimes(); setShowRequestModal(false); }} currentUser={currentUser} />}
      {showManualModal  && <ManualOvertimeModal  onClose={() => setShowManualModal(false)}  onSaved={() => { fetchOvertimes(); setShowManualModal(false); }}  allUsers={allUsers} />}
      {approveData      && <ApproveModal         overtime={approveData}    onClose={() => setApproveData(null)}    onSaved={() => { fetchOvertimes(); setApproveData(null);    }} />}
      {setPayData       && <SetPayModal           overtime={setPayData}     onClose={() => setSetPayData(null)}     onSaved={() => { fetchOvertimes(); setSetPayData(null);     }} />}
      {completeData     && <CompleteModal         overtime={completeData}   onClose={() => setCompleteData(null)}   onSaved={() => { fetchOvertimes(); setCompleteData(null);   }} isAutoCompleted={completeData.auto_completed} />}
      {proofPhotoData   && <ProofPhotoModal       overtime={proofPhotoData} onClose={() => setProofPhotoData(null)} canViewPay={userCanViewPay} />}
      {editData         && <EditOvertimeModal      overtime={editData}       onClose={() => setEditData(null)}       onSaved={() => { fetchOvertimes(); setEditData(null);       }} />}
      {deleteData       && <DeleteConfirmModal     overtime={deleteData}     onClose={() => setDeleteData(null)}     onDeleted={() => { fetchOvertimes(); setDeleteData(null);   }} canViewPay={userCanViewPay} />}

      <style jsx global>{`
        @keyframes modalUp { from { opacity:0; transform:translateY(16px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }
        .scrollbar-hide::-webkit-scrollbar { display:none; } .scrollbar-hide { -ms-overflow-style:none; scrollbar-width:none; }
      `}</style>
    </DashboardLayout>
  );
}