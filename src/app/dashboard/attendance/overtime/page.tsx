"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { getCurrentUserClient } from "@/lib/auth-client";
import DashboardLayout from "@/components/layout/DashboardLayout";

type OvertimeRequest = {
  id: string; user_id: string; request_date: string;
  scheduled_start: string | null; scheduled_end: string | null;
  actual_start: string | null; actual_end: string | null;
  work_description: string | null; proof_photo_url: string | null;
  status: "PENDING" | "APPROVED" | "ONGOING" | "COMPLETED" | "REJECTED" | "CANCELLED" | "NEED_PROOF";
  rate_per_hour: number | null; total_pay: number | null; auto_completed: boolean;
  created_at: string; reason?: string; requested_start?: string;
  completed_at?: string; rejection_note?: string;
  users?: { id: string; name: string; role: string };
  approver?: { id: string; name: string; role: string } | null;
};
type User = { id: string; name: string; role: string };

const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const FULL_ACCESS_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"] as const;
const DIVISION_HEAD_ROLES = ["KEPALA_SALES", "KEPALA_MARKETING", "KEPALA_TEKNISI", "KEPALA_ONPOINT", "KEPALA_PENYEDIA_BARANG", "KEPALA_SOTECH"] as const;
const PAY_VIEW_ROLES = ["KEPALA_SALES", "KEPALA_MARKETING", "KEPALA_TEKNISI", "KEPALA_PENYEDIA_BARANG", "ADMIN", "PROGRAMMER", "ASISTEN_CEO", "KEPALA_ONPOINT", "KEPALA_SOTECH"] as const;

const DIVISION_HEAD_MAP: Record<string, string[]> = {
  KEPALA_SALES: ["CREW_SALES", "SOTECH", "PENGANTARAN", "KEPALA_SALES"],
  KEPALA_MARKETING: ["MARKETING", "KONTEN", "KEPALA_MARKETING"],
  KEPALA_TEKNISI: ["TEKNISI", "KEPALA_TEKNISI"],
  KEPALA_ONPOINT: ["ONPOINT", "KEPALA_ONPOINT"],
  KEPALA_PENYEDIA_BARANG: ["PENYEDIA_BARANG", "PENGELOLA_BARANG", "KEPALA_PENYEDIA_BARANG"],
  KEPALA_SOTECH: ["SOTECH", "KEPALA_SOTECH"],
};

function canViewPay(role?: string) { return !!role && (PAY_VIEW_ROLES as readonly string[]).includes(role); }
function isAdminRole(role?: string) { return !!role && (FULL_ACCESS_ROLES as readonly string[]).includes(role); }
function canSetPay(role?: string) { return !!role && (FULL_ACCESS_ROLES as readonly string[]).includes(role); }
function isDivisionHead(role?: string) { return !!role && (DIVISION_HEAD_ROLES as readonly string[]).includes(role); }

function canApproveTarget(approverRole?: string, targetRole?: string): boolean {
  if (!approverRole || !targetRole) return false;
  if (isAdminRole(approverRole)) return true;
  return DIVISION_HEAD_MAP[approverRole]?.includes(targetRole) ?? false;
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
function calcDuration(start: string | null, end: string | null): string {
  if (!start || !end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms <= 0) return "—";
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return m > 0 ? `${h}j ${m}m` : `${h} jam`;
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
const STATUS_CONFIG: Record<string, { label: string; icon: string; bg: string; text: string; border: string; dot: string }> = {
  PENDING:    { label: "Pending",      icon: "⏳", bg: "bg-amber-50",   text: "text-amber-700",  border: "border-amber-200",  dot: "bg-amber-400"  },
  APPROVED:   { label: "Disetujui",   icon: "✅", bg: "bg-violet-50",  text: "text-violet-700", border: "border-violet-200", dot: "bg-violet-500" },
  ONGOING:    { label: "Berjalan",    icon: "▶",  bg: "bg-emerald-50", text: "text-emerald-700",border: "border-emerald-200",dot: "bg-emerald-500"},
  COMPLETED:  { label: "Selesai",     icon: "✓",  bg: "bg-blue-50",    text: "text-blue-700",   border: "border-blue-200",   dot: "bg-blue-500"   },
  NEED_PROOF: { label: "Upload Foto", icon: "📸", bg: "bg-orange-50",  text: "text-orange-700", border: "border-orange-200", dot: "bg-orange-500" },
  REJECTED:   { label: "Ditolak",     icon: "✕",  bg: "bg-red-50",     text: "text-red-700",    border: "border-red-200",    dot: "bg-red-500"    },
  CANCELLED:  { label: "Dibatalkan",  icon: "⊘",  bg: "bg-gray-50",    text: "text-gray-500",   border: "border-gray-200",   dot: "bg-gray-400"   },
};

function StatusBadge({ status }: { status: OvertimeRequest["status"] }) {
  const c = STATUS_CONFIG[status] ?? { label: status, icon: "?", bg: "bg-gray-50", text: "text-gray-600", border: "border-gray-200", dot: "bg-gray-400" };
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
const inp  = "w-full h-10 border border-gray-200 rounded-xl px-3.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all placeholder:text-gray-300";
const lbl  = "text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5";
const primaryBtn   = "flex-1 h-10 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-semibold transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-violet-200";
const secondaryBtn = "flex-1 h-10 bg-white border border-gray-200 text-gray-600 rounded-xl text-xs font-semibold hover:bg-gray-50 transition-all active:scale-[0.98] flex items-center justify-center";

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 text-xs px-3.5 py-3 rounded-xl">
      <span className="flex-shrink-0 mt-px">⚠️</span>
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
        {/* drag handle for mobile */}
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

// ─── DETAIL MODAL ──────────────────────────────────────────────────────────
function OvertimeDetailModal({ overtime: o, onClose, userCanViewPay, currentUser, onApprove, onComplete, onSetPay, onProofPhoto, onEdit, onDelete }: {
  overtime: OvertimeRequest; onClose: () => void; userCanViewPay: boolean; currentUser: any;
  onApprove: () => void; onComplete: () => void; onSetPay: () => void; onProofPhoto: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const dateStr = new Date(o.request_date + "T12:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const duration = calcDuration(o.actual_start ?? o.scheduled_start, o.actual_end ?? o.scheduled_end);
  return (
    <ModalWrapper onClose={onClose} wide>
      <ModalHead icon="📋" title="Detail Lemburan" sub={`${o.users?.name} · ${dateStr}`} onClose={onClose} />
      <div className="px-5 py-4 space-y-3.5 max-h-[72vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <StatusBadge status={o.status} />
          <span className="text-[10px] text-gray-400">{new Date(o.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</span>
        </div>

        {/* Time grid */}
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
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Disetujui oleh</p>
            <p className="text-xs text-gray-800 font-semibold">{o.approver.name}</p>
          </div>
        )}
      </div>

      <ModalFoot>
        <div className="flex-1 flex gap-2 flex-wrap">
          {currentUser?.id === o.user_id && o.status === "NEED_PROOF" && (
            <button onClick={() => { onClose(); setTimeout(onComplete, 100); }} className="flex-1 h-10 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm">📸 Upload Foto</button>
          )}
          {currentUser?.id === o.user_id && o.status === "ONGOING" && !o.actual_end && (
            <button onClick={() => { onClose(); setTimeout(onComplete, 100); }} className="flex-1 h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm">🏁 Selesai</button>
          )}
          {canApproveTarget(currentUser?.role, o.users?.role) && o.status === "PENDING" && (
            <button onClick={() => { onClose(); setTimeout(onApprove, 100); }} className="flex-1 h-10 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm">✅ Setujui</button>
          )}
          {canSetPay(currentUser?.role) && (o.status === "COMPLETED" || o.status === "NEED_PROOF") && (
            <button onClick={() => { onClose(); setTimeout(onSetPay, 100); }} className="flex-1 h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm">💰 {o.rate_per_hour ? "Edit Bayaran" : "Set Bayaran"}</button>
          )}
          {isAdminRole(currentUser?.role) && (
            <>
              <button onClick={() => { onClose(); setTimeout(onEdit, 100); }} className="h-10 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-semibold hover:bg-gray-50 flex items-center gap-1.5 transition-all">✏️ Edit</button>
              <button onClick={() => { onClose(); setTimeout(onDelete, 100); }} className="h-10 px-3.5 bg-white border border-red-100 text-red-500 rounded-xl text-xs font-semibold hover:bg-red-50 flex items-center transition-all">🗑️</button>
            </>
          )}
          <button onClick={onClose} className="h-10 px-4 bg-gray-100 text-gray-600 rounded-xl text-xs font-semibold hover:bg-gray-200 transition-all">Tutup</button>
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
            🖼️ Pilih dari Galeri
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
            className="absolute top-2.5 right-2.5 w-8 h-8 rounded-xl bg-black/50 backdrop-blur-sm flex items-center justify-center text-white text-xs hover:bg-black/70 transition-all">🔄</button>
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
          {processing ? <Spinner /> : <><span>📸</span><span>Ambil Foto</span></>}
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
      <ModalHead icon="📷" title="Bukti Lemburan" sub={o.users?.name} onClose={onClose} />
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

// ─── APPROVE MODAL ─────────────────────────────────────────────────────────
function ApproveModal({ overtime: o, onClose, onSaved }: { overtime: OvertimeRequest; onClose: () => void; onSaved: () => void }) {
  const [scheduledStart, setScheduledStart] = useState(o.requested_start?.substring(0, 5) || "09:00");
  const [scheduledEnd, setScheduledEnd] = useState("17:00");
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState("");

  const approve = async () => {
    if (!scheduledStart || !scheduledEnd) { setError("Jam mulai & selesai wajib diisi"); return; }
    if (new Date(`1970-01-01T${scheduledEnd}:00`).getTime() <= new Date(`1970-01-01T${scheduledStart}:00`).getTime()) { setError("Jam selesai harus lebih besar"); return; }
    setApproving(true); setError("");
    try {
      const fmt = (t: string) => t.length === 5 ? `${t}:00` : t;
      const res = await fetch("/api/attendance/overtime", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: o.id, action: "APPROVE", scheduled_start: `${o.request_date}T${fmt(scheduledStart)}+07:00`, scheduled_end: `${o.request_date}T${fmt(scheduledEnd)}+07:00` }) });
      const d = await res.json();
      if (!res.ok || !d.success) { setError(d.message || `Error ${res.status}`); return; }
      onSaved(); onClose();
    } catch (err: any) { setError(err.message || "Gagal"); } finally { setApproving(false); }
  };

  return (
    <ModalWrapper onClose={onClose}>
      <ModalHead icon="✅" title="Setujui Lemburan" sub={o.users?.name} onClose={onClose} />
      <div className="px-5 py-4 space-y-3.5 max-h-[70vh] overflow-y-auto">
        {error && <ErrorBanner msg={error} />}
        <div className="bg-violet-50 border border-violet-100 rounded-xl p-3.5 space-y-2">
          <p className="text-[9px] font-bold text-violet-400 uppercase tracking-wider mb-1">Info Pengajuan</p>
          <div className="flex justify-between text-xs"><span className="text-gray-400">Tanggal</span><span className="font-semibold text-gray-800">{new Date(o.request_date).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</span></div>
          <div className="flex justify-between text-xs"><span className="text-gray-400">Jam diminta</span><span className="font-mono font-semibold text-gray-800">{formatTime(o.requested_start)}</span></div>
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
      </div>
      <ModalFoot>
        <button onClick={onClose} className={secondaryBtn}>Batal</button>
        <button onClick={approve} disabled={approving} className={primaryBtn}>{approving ? <Spinner /> : "✅ Setujui & Mulai"}</button>
      </ModalFoot>
    </ModalWrapper>
  );
}

const REASON_OPTIONS = [
  { value: "Tugas Mendesak",           icon: "🔴", desc: "Harus diselesaikan segera" },
  { value: "Pekerjaan Belum Selesai",  icon: "🟡", desc: "Pekerjaan hari ini belum tuntas" },
  { value: "Permintaan Atasan",        icon: "🔵", desc: "Diminta langsung oleh atasan" },
  { value: "Lainnya",                  icon: "✏️", desc: "Alasan lain" },
] as const;

function ReasonGrid({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {REASON_OPTIONS.map(opt => {
        const sel = value === opt.value;
        return (
          <button key={opt.value} type="button" onClick={() => onChange(opt.value)}
            className={`flex items-start gap-2.5 px-3 py-3 rounded-xl border text-left transition-all active:scale-[0.98] ${sel ? "bg-violet-600 border-violet-600 shadow-sm shadow-violet-200" : "bg-white border-gray-200 hover:border-violet-300 hover:bg-violet-50/50"}`}>
            <span className="text-sm flex-shrink-0 mt-px">{opt.icon}</span>
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
  const [requestDate, setRequestDate] = useState(""), [startTime, setStartTime] = useState("09:00");
  const [reasonType, setReasonType] = useState(""), [reasonCustom, setReasonCustom] = useState("");
  const [workDescription, setWorkDescription] = useState(""), [submitting, setSubmitting] = useState(false), [error, setError] = useState("");
  const today = new Date().toISOString().split("T")[0];
  const isLainnya = reasonType === "Lainnya";

  const submit = async () => {
    if (!requestDate) { setError("Pilih tanggal"); return; }
    if (!reasonType) { setError("Pilih alasan"); return; }
    if (isLainnya && !reasonCustom.trim()) { setError("Jelaskan alasan"); return; }
    if (!workDescription.trim()) { setError("Rincian pekerjaan wajib diisi"); return; }
    setSubmitting(true); setError("");
    try {
      const res = await fetch("/api/attendance/overtime", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request_date: requestDate, requested_start: `${startTime}:00`, reason: isLainnya ? reasonCustom.trim() : reasonType, work_description: workDescription.trim() }) });
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal mengajukan"); return; }
      onSaved(); onClose();
    } catch { setError("Gagal mengajukan"); } finally { setSubmitting(false); }
  };

  return (
    <ModalWrapper onClose={onClose}>
      <ModalHead icon="📝" title="Ajukan Lemburan" sub={currentUser?.name || "Karyawan"} onClose={onClose} />
      <div className="px-5 py-4 space-y-4 max-h-[78vh] overflow-y-auto">
        {error && <ErrorBanner msg={error} />}
        <div className="grid grid-cols-2 gap-2.5">
          <div><label className={lbl}>Tanggal *</label><input type="date" min={today} value={requestDate} onChange={e => setRequestDate(e.target.value)} className={inp} /></div>
          <div><label className={lbl}>Jam Mulai *</label><input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={inp} /></div>
        </div>
        <div><label className={lbl}>Alasan Lembur *</label><ReasonGrid value={reasonType} onChange={v => { setReasonType(v); if (v !== "Lainnya") setReasonCustom(""); }} /></div>
        {isLainnya && <div><label className={lbl}>Jelaskan Alasan *</label><input type="text" value={reasonCustom} onChange={e => setReasonCustom(e.target.value)} placeholder="Tuliskan alasan spesifik..." className={inp} autoFocus /></div>}
        <div>
          <label className={lbl}>Rincian Pekerjaan *</label>
          <textarea value={workDescription} onChange={e => setWorkDescription(e.target.value)} placeholder="Pekerjaan yang akan dikerjakan saat lembur..." rows={3} className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all resize-none placeholder:text-gray-300" />
        </div>
      </div>
      <ModalFoot>
        <button onClick={onClose} className={secondaryBtn}>Batal</button>
        <button onClick={submit} disabled={submitting || !requestDate || !reasonType || (isLainnya && !reasonCustom.trim()) || !workDescription.trim()} className={primaryBtn}>
          {submitting ? <><Spinner /><span>Mengirim...</span></> : "📝 Ajukan"}
        </button>
      </ModalFoot>
    </ModalWrapper>
  );
}

// ─── SET PAY MODAL ─────────────────────────────────────────────────────────
function SetPayModal({ overtime: o, onClose, onSaved }: { overtime: OvertimeRequest; onClose: () => void; onSaved: () => void }) {
  const start = o.actual_start ?? o.scheduled_start, end = o.actual_end ?? o.scheduled_end;
  const hours = (!start || !end) ? 0 : Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 3600000);
  const [rate, setRate] = useState(o.rate_per_hour ?? 100000), [saving, setSaving] = useState(false), [error, setError] = useState("");
  const totalPay = rate * hours;

  const save = async () => {
    if (rate < 0) { setError("Tarif harus >= 0"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/attendance/overtime", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: o.id, action: "SET_PAY", rate_per_hour: Math.round(rate), total_pay: Math.round(totalPay) }) });
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal"); return; }
      onSaved(); onClose();
    } catch { setError("Gagal"); } finally { setSaving(false); }
  };

  return (
    <ModalWrapper onClose={onClose}>
      <ModalHead icon="💰" title="Atur Bayaran" sub={o.users?.name} onClose={onClose} />
      <div className="px-5 py-4 space-y-3.5 max-h-[65vh] overflow-y-auto">
        {error && <ErrorBanner msg={error} />}
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
            <p className="text-[9px] text-gray-500 mt-0.5">{hours} jam × {formatRupiah(Math.round(rate))}</p>
          </div>
        </div>
        <div>
          <label className={lbl}>Tarif Per Jam (Rp)</label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-medium">Rp</span>
            <input type="number" min={0} value={rate} onChange={e => setRate(parseFloat(e.target.value) || 0)} className="w-full h-10 border border-gray-200 rounded-xl pl-9 pr-3.5 text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all" />
          </div>
        </div>
      </div>
      <ModalFoot>
        <button onClick={onClose} className={secondaryBtn}>Batal</button>
        <button onClick={save} disabled={saving} className={primaryBtn}>{saving ? <Spinner /> : "💾 Simpan"}</button>
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

  const handleClose = () => { if (mustUpload) { setError("⚠️ Wajib upload foto bukti dulu."); return; } onClose(); };

  const upload = async () => {
    if (mustUpload && !photoFile) { setError("⚠️ Foto bukti wajib diupload."); return; }
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
      <ModalHead icon={isNeedProof ? "📸" : "🏁"} title={isNeedProof ? "Upload Bukti Lemburan" : "Selesaikan Lemburan"} sub={o.users?.name} onClose={handleClose} noClose={mustUpload} />
      <div className="px-5 py-4 space-y-3.5 max-h-[75vh] overflow-y-auto">
        {isNeedProof && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3.5">
            <p className="font-semibold text-orange-800 text-xs mb-0.5">📸 Foto Bukti Wajib</p>
            <p className="text-[10px] text-orange-700">Upload foto bukti sebelum menutup halaman ini.</p>
          </div>
        )}
        {isAutoCompleted && !isNeedProof && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5">
            <p className="font-semibold text-amber-800 text-xs mb-0.5">⚡ Waktu Lembur Habis</p>
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
            <span className="text-2xl">📷</span>
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
            {uploading ? <Spinner /> : photoFile ? "📸 Upload & Selesai" : mustUpload ? "📷 Ambil Foto Dulu" : "🏁 Selesai"}
          </button>
        </ModalFoot>
      )}
    </ModalWrapper>
  );
}

// ─── MANUAL MODAL ──────────────────────────────────────────────────────────
function ManualOvertimeModal({ onClose, onSaved, allUsers }: { onClose: () => void; onSaved: () => void; allUsers: User[] }) {
  const [targetUserId, setTargetUserId] = useState(""), [requestDate, setRequestDate] = useState(new Date().toISOString().split("T")[0]);
  const [startTime, setStartTime] = useState("09:00"), [endTime, setEndTime] = useState("17:00");
  const [reasonType, setReasonType] = useState(""), [reasonCustom, setReasonCustom] = useState("");
  const [workDescription, setWorkDescription] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null), [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoStep, setPhotoStep] = useState<"idle" | "camera" | "preview">("idle");
  const [submitting, setSubmitting] = useState(false), [error, setError] = useState("");

  const previewHours = useMemo(() => {
    if (!startTime || !endTime) return null;
    const d = (new Date(`1970-01-01T${endTime}:00`).getTime() - new Date(`1970-01-01T${startTime}:00`).getTime()) / 3600000;
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
      if (photoFile) { const fd = new FormData(); fd.append("file", photoFile); const ur = await fetch("/api/attendance/overtime/upload", { method: "POST", body: fd }); if (!ur.ok) throw new Error((await ur.json()).message || "Upload gagal"); photoUrl = (await ur.json()).url; }
      const res = await fetch("/api/attendance/overtime", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_manual: true, target_user_id: targetUserId, request_date: requestDate, actual_start_time: startTime, actual_end_time: endTime, work_description: workDescription.trim(), reason: reasonType === "Lainnya" ? reasonCustom.trim() : reasonType, proof_photo_url: photoUrl }) });
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal"); return; }
      onSaved(); onClose();
    } catch (err: any) { setError(err.message || "Gagal"); } finally { setSubmitting(false); }
  };

  return (
    <ModalWrapper onClose={onClose} wide>
      <ModalHead icon="✏️" title="Input Lembur Manual" sub="Admin · Asisten CEO · Programmer" onClose={onClose} />
      <div className="px-5 py-4 space-y-3.5 max-h-[75vh] overflow-y-auto">
        {error && <ErrorBanner msg={error} />}
        <div>
          <label className={lbl}>Nama Karyawan *</label>
          <select value={targetUserId} onChange={e => setTargetUserId(e.target.value)} className={inp + " cursor-pointer"}>
            <option value="">— Pilih karyawan —</option>
            {allUsers.slice().sort((a, b) => a.name.localeCompare(b.name, "id-ID")).map(u => (
              <option key={u.id} value={u.id}>{u.name} ({u.role.replace(/_/g, " ")})</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div><label className={lbl}>Tanggal *</label><input type="date" value={requestDate} onChange={e => setRequestDate(e.target.value)} className={inp} /></div>
          <div><label className={lbl}>Jam Mulai *</label><input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={inp} /></div>
          <div><label className={lbl}>Jam Selesai *</label><input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={inp} /></div>
        </div>
        {previewHours !== null && (
          <div className="flex items-center gap-2.5 bg-violet-50 border border-violet-100 rounded-xl px-3.5 py-2.5">
            <span className="text-sm">⏱️</span>
            <span className="text-xs text-violet-700">Durasi: <strong>{previewHours} jam</strong></span>
          </div>
        )}
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
              : <button onClick={() => setPhotoStep("camera")} className="w-full flex items-center justify-center gap-2.5 border-2 border-dashed border-gray-200 rounded-xl p-5 hover:border-violet-300 hover:bg-violet-50/20 transition-all"><span className="text-xl">📷</span><span className="text-xs font-semibold text-gray-600">Buka Kamera</span></button>}
        </div>
      </div>
      {photoStep !== "camera" && (
        <ModalFoot>
          <button onClick={onClose} className={secondaryBtn}>Batal</button>
          <button onClick={submit} disabled={submitting || !targetUserId || !requestDate || !reasonType || !workDescription.trim()} className={primaryBtn}>
            {submitting ? <><Spinner /><span>Menyimpan...</span></> : "✅ Simpan Lembur"}
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

  const prevDur = useMemo(() => {
    if (!startTime || !endTime) return null;
    const d = (new Date(`1970-01-01T${endTime}:00`).getTime() - new Date(`1970-01-01T${startTime}:00`).getTime()) / 3600000;
    return d > 0 ? Math.floor(d) : null;
  }, [startTime, endTime]);

  const fmt = (t: string) => t.length === 5 ? `${t}:00` : t;

  const save = async () => {
    if (!requestDate || !startTime || !endTime || !reasonType) { setError("Semua field wajib diisi"); return; }
    if (isLainnya && !reasonCustom.trim()) { setError("Jelaskan alasan lembur"); return; }
    const s = new Date(`1970-01-01T${startTime}:00`).getTime(), e = new Date(`1970-01-01T${endTime}:00`).getTime();
    if (e <= s) { setError("Jam selesai harus lebih besar"); return; }
    setSaving(true); setError("");
    try {
      let proofUrl: string | null | undefined = undefined;
      if (photoFile) { const fd = new FormData(); fd.append("file", photoFile); const ur = await fetch("/api/attendance/overtime/upload", { method: "POST", body: fd }); if (!ur.ok) throw new Error((await ur.json()).message || "Upload foto gagal"); proofUrl = (await ur.json()).url; }
      else if (photoPreview === null && o.proof_photo_url) proofUrl = null;
      const isoS = `${requestDate}T${fmt(startTime)}+07:00`, isoE = `${requestDate}T${fmt(endTime)}+07:00`;
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
      <ModalHead icon="✏️" title="Edit Lembur" sub={o.users?.name ?? "Karyawan"} onClose={onClose} />
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
              <span className="text-xs">⏱️</span>
              <span className="text-[10px] text-violet-700 font-medium">{prevDur} jam</span>
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
              : <button onClick={() => setPhotoStep("camera")} className="w-full flex items-center justify-center gap-2.5 border-2 border-dashed border-gray-200 rounded-xl p-5 hover:border-violet-300 hover:bg-violet-50/20 transition-all"><span className="text-xl">📷</span><span className="text-xs font-semibold text-gray-600">Buka Kamera</span></button>}
        </div>
      </div>
      {photoStep !== "camera" && (
        <ModalFoot>
          <button onClick={onClose} className={secondaryBtn}>Batal</button>
          <button onClick={save} disabled={saving || !requestDate || !startTime || !endTime || !reasonType || (isLainnya && !reasonCustom.trim())} className={primaryBtn}>
            {saving ? <><Spinner /><span>Menyimpan...</span></> : "💾 Simpan Perubahan"}
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
      <ModalHead icon="🗑️" title="Hapus Lembur" sub={o.users?.name} onClose={onClose} />
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
          {deleting ? <Spinner /> : "🗑️ Hapus Permanen"}
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
  const sorted   = useMemo(() => [...overtimes].sort((a, b) => new Date(b.request_date).getTime() - new Date(a.request_date).getTime()), [overtimes]);
  const filtered = useMemo(() => filterStatus === "Semua" ? sorted : sorted.filter(o => o.status === filterStatus), [sorted, filterStatus]);
  const statuses = useMemo(() => [...new Set(overtimes.map(o => o.status))], [overtimes]);
  const totalPay = useMemo(() => overtimes.filter(o => o.status === "COMPLETED").reduce((s, o) => s + (o.total_pay ?? 0), 0), [overtimes]);
  const counts = {
    total:   overtimes.length,
    pending: overtimes.filter(o => o.status === "PENDING").length,
    ongoing: overtimes.filter(o => o.status === "ONGOING").length,
    selesai: overtimes.filter(o => o.status === "COMPLETED").length,
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
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

      {/* Stats strip */}
      <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/60">
        <div className="grid grid-cols-4 divide-x divide-gray-200">
          {[
            ["Total",   counts.total,   "text-gray-800"],
            ["Pending", counts.pending, "text-amber-600"],
            ["Berjalan",counts.ongoing, "text-emerald-600"],
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

      {/* Filter chips */}
      {statuses.length > 1 && (
        <div className="px-5 py-2.5 border-b border-gray-100 flex gap-1.5 overflow-x-auto scrollbar-hide">
          {["Semua", ...statuses].map(s => {
            const c = s !== "Semua" ? STATUS_CONFIG[s] : null;
            const active = filterStatus === s;
            return (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`flex-shrink-0 h-7 px-3 rounded-lg text-[10px] font-semibold transition-all border ${active ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"}`}>
                {c ? `${c.icon} ${c.label}` : "Semua"}
              </button>
            );
          })}
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <span className="text-3xl">📭</span>
          <p className="text-xs text-gray-400 font-medium">Tidak ada data</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {filtered.map(o => {
            const cfg = STATUS_CONFIG[o.status] ?? STATUS_CONFIG["PENDING"];
            const isMyUrgent = currentUser?.id === userId && (o.status === "NEED_PROOF" || (o.status === "ONGOING" && !o.actual_end));
            const duration = calcDuration(o.actual_start ?? o.scheduled_start, o.actual_end ?? o.scheduled_end);
            const dateObj = new Date(o.request_date + "T12:00:00");
            return (
              <button key={o.id} onClick={() => onDetailOpen(o)}
                className={`w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-gray-50/80 transition-colors group ${isMyUrgent ? "bg-orange-50/30" : ""}`}>
                {/* Date block */}
                <div className="w-10 flex-shrink-0 text-center">
                  <p className="text-base font-black text-gray-800 leading-none">{dateObj.getDate()}</p>
                  <p className="text-[9px] text-gray-400 font-bold uppercase mt-0.5">{MONTH_NAMES[dateObj.getMonth()].substring(0, 3)}</p>
                </div>
                <div className="w-px h-8 bg-gray-100 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                    <StatusBadge status={o.status} />
                    {isMyUrgent && <span className="text-[8px] font-bold text-orange-600 bg-orange-50 border border-orange-100 px-1.5 py-0.5 rounded-md">{o.status === "NEED_PROOF" ? "Upload foto" : "Selesaikan"}</span>}
                    {canApproveTarget(currentUser?.role, o.users?.role ?? userId) && o.status === "PENDING" && <span className="text-[8px] font-semibold text-violet-600 bg-violet-50 border border-violet-100 px-1.5 py-0.5 rounded-md">Perlu acc</span>}
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
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Toolbar */}
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
          {statuses.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
              {["Semua", ...statuses].map(s => {
                const c = s !== "Semua" ? STATUS_CONFIG[s] : null;
                const active = filterStatus === s;
                return (
                  <button key={s} onClick={() => setFilterStatus(s)}
                    className={`flex-shrink-0 h-9 px-3 rounded-xl text-[10px] font-semibold transition-all border ${active ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"}`}>
                    {c ? `${c.icon} ${c.label}` : "Semua"}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Rows */}
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
          <span className="text-3xl">📭</span>
          <p className="text-xs font-semibold text-gray-400">Tidak ada data lemburan</p>
          <p className="text-[10px] text-gray-300">Coba ubah filter atau hapus pencarian</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {groupedByUser.map(({ user, items }) => {
            const bg = avBg(user.name);
            const hasUrgent = items.some(o => o.status === "NEED_PROOF" || (o.status === "PENDING" && canApproveTarget(currentUser?.role, user.role)));
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
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [detailData, setDetailData]       = useState<OvertimeRequest | null>(null);
  const [setPayData, setSetPayData]       = useState<OvertimeRequest | null>(null);
  const [completeData, setCompleteData]   = useState<OvertimeRequest | null>(null);
  const [approveData, setApproveData]     = useState<OvertimeRequest | null>(null);
  const [proofPhotoData, setProofPhotoData] = useState<OvertimeRequest | null>(null);
  const [editData, setEditData]           = useState<OvertimeRequest | null>(null);
  const [deleteData, setDeleteData]       = useState<OvertimeRequest | null>(null);
  const autoCompletingIds = useRef<Set<string>>(new Set());

  useEffect(() => { getCurrentUserClient().then(u => setCurrentUser(u)); }, []);
  const fetchOvertimes  = useCallback(async () => { const r = await fetch("/api/attendance/overtime"); const d = await r.json(); if (d.success) setOvertimes(d.data || []); }, []);
  const fetchAllUsers   = useCallback(async () => { const r = await fetch("/api/users"); const d = await r.json(); if (d.success) setAllUsers(d.users || []); }, []);

  useEffect(() => {
    if (currentUser === null) return;
    setLoading(true);
    Promise.all([fetchOvertimes(), fetchAllUsers()]).finally(() => setLoading(false));
  }, [fetchOvertimes, fetchAllUsers, currentUser?.role]);

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

  const handleAutoComplete = async (overtime: OvertimeRequest) => {
    if (autoCompletingIds.current.has(overtime.id)) return;
    autoCompletingIds.current.add(overtime.id);
    try {
      const res = await fetch("/api/attendance/overtime", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: overtime.id, action: "COMPLETE", proof_photo_url: null, auto_completed: true }) });
      const d = await res.json();
      if (d.success) { await fetchOvertimes(); setCompleteData({ ...overtime, ...d.data, auto_completed: true }); setTimeout(() => { autoCompletingIds.current.delete(overtime.id); }, 5000); }
      else autoCompletingIds.current.delete(overtime.id);
    } catch { autoCompletingIds.current.delete(overtime.id); }
  };

  const filtered = useMemo(() => {
    if (filterStatus !== "Semua") return overtimes.filter(o => o.status === filterStatus);
    return overtimes;
  }, [overtimes, filterStatus]);

  const groupedByUser = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const map = new Map<string, { user: { id: string; name: string; role: string }; items: OvertimeRequest[] }>();
    allUsers.forEach(u => { if (!q || u.name.toLowerCase().includes(q)) map.set(u.id, { user: u, items: [] }); });
    filtered.forEach(o => {
      if (!o.users) return;
      const uid = o.user_id;
      if (map.has(uid)) { map.get(uid)!.items.push(o); }
      else if (!q || o.users.name.toLowerCase().includes(q)) { map.set(uid, { user: o.users, items: [o] }); }
    });
    const hasStatusFilter = filterStatus !== "Semua";
    const result = Array.from(map.values()).filter(g => !hasStatusFilter || g.items.length > 0);
    return result.sort((a, b) => a.user.name.localeCompare(b.user.name, "id-ID"));
  }, [filtered, allUsers, filterStatus, searchQuery]);

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
    { label: "Total",    value: overtimes.length,                                     icon: "📋", color: "text-gray-800",   accent: "from-gray-50 to-gray-100/50" },
    { label: "Pending",  value: overtimes.filter(o => o.status === "PENDING").length,  icon: "⏳", color: "text-amber-600",  accent: "from-amber-50 to-amber-100/30" },
    { label: "Berjalan", value: overtimes.filter(o => o.status === "ONGOING").length,  icon: "▶",  color: "text-emerald-600",accent: "from-emerald-50 to-emerald-100/30" },
    { label: "Selesai",  value: overtimes.filter(o => o.status === "COMPLETED").length,icon: "✓",  color: "text-blue-600",   accent: "from-blue-50 to-blue-100/30" },
  ];

  const userCanViewPay = canViewPay(currentUser?.role);

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
              {isAdminRole(currentUser?.role) && (
                <button onClick={() => setShowManualModal(true)}
                  className="h-9 px-4 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap shadow-sm hover:shadow">
                  <span>✏️</span><span className="hidden sm:inline">Input Manual</span>
                </button>
              )}
              <button onClick={() => setShowRequestModal(true)}
                className="h-9 px-4 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap shadow-sm shadow-violet-200">
                <span>📝</span><span>Ajukan Lemburan</span>
              </button>
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
            {/* Calendar header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-sm flex-shrink-0 shadow-sm">📅</div>
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
              {/* Day headers */}
              <div className="grid grid-cols-7 gap-1 mb-2 min-w-[280px]">
                {DAY_NAMES.map((d, i) => (
                  <div key={d} className={`text-center text-[9px] font-bold py-1 uppercase tracking-wider ${i === 0 ? "text-red-400" : "text-gray-400"}`}>{d}</div>
                ))}
              </div>
              {/* Day cells */}
              <div className="grid grid-cols-7 gap-1 min-w-[280px]">
                {calDays.map((day, idx) => {
                  if (!day) return <div key={`e-${idx}`} />;
                  const dk = `${calendarMonth.year}-${pad2(calendarMonth.month + 1)}-${pad2(day)}`;
                  const total  = (byDate[dk] || []).length;
                  const isSel  = dk === selectedDate;
                  const isToday = dk === new Date().toISOString().slice(0, 10);
                  const isSun  = new Date(dk + "T12:00:00").getDay() === 0;
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
                  <span className="text-sm">📌</span>
                  <p className="text-xs text-gray-700 flex-1">
                    <span className="font-semibold">{new Date(selectedDate + "T12:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" })}</span>
                    <span className="text-gray-400 ml-1.5">· {(byDate[selectedDate] || []).length} lemburan</span>
                  </p>
                  <button onClick={() => setSelectedDate(null)} className="text-[10px] text-violet-500 hover:text-violet-700 font-semibold transition-colors">✕ Hapus</button>
                </div>
              </div>
            )}
          </div>

          {/* ── Employee List / Detail ── */}
          {selectedUserId && selectedUserData ? (
            <EmployeeDetailView
              userId={selectedUserId}
              name={(selectedUserData.user as { id: string; name: string; role: string }).name}
              role={(selectedUserData.user as { id: string; name: string; role: string }).role}
              overtimes={selectedUserData.items}
              userCanViewPay={userCanViewPay}
              currentUser={currentUser}
              onBack={() => setSelectedUserId(null)}
              onDetailOpen={o => setDetailData(o)}
            />
          ) : (
            <EmployeeListPanel
              groupedByUser={groupedByUser}
              loading={loading}
              userCanViewPay={userCanViewPay}
              currentUser={currentUser}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              filterStatus={filterStatus}
              setFilterStatus={setFilterStatus}
              statuses={statuses}
              onSelectUser={uid => setSelectedUserId(uid)}
            />
          )}

        </div>
      </div>

      {/* ── Modals ── */}
      {showRequestModal  && <RequestOvertimeModal onClose={() => setShowRequestModal(false)}  onSaved={() => { fetchOvertimes(); setShowRequestModal(false);  }} currentUser={currentUser} />}
      {showManualModal   && <ManualOvertimeModal  onClose={() => setShowManualModal(false)}   onSaved={() => { fetchOvertimes(); setShowManualModal(false);   }} allUsers={allUsers} />}
      {approveData       && <ApproveModal         overtime={approveData}    onClose={() => setApproveData(null)}    onSaved={() => { fetchOvertimes(); setApproveData(null);    }} />}
      {setPayData        && <SetPayModal           overtime={setPayData}     onClose={() => setSetPayData(null)}     onSaved={() => { fetchOvertimes(); setSetPayData(null);     }} />}
      {completeData      && <CompleteModal         overtime={completeData}   onClose={() => setCompleteData(null)}   onSaved={() => { fetchOvertimes(); setCompleteData(null);   }} isAutoCompleted={completeData.auto_completed} />}
      {proofPhotoData    && <ProofPhotoModal       overtime={proofPhotoData} onClose={() => setProofPhotoData(null)} canViewPay={userCanViewPay} />}
      {editData          && <EditOvertimeModal      overtime={editData}       onClose={() => setEditData(null)}       onSaved={() => { fetchOvertimes(); setEditData(null);       }} />}
      {deleteData        && <DeleteConfirmModal     overtime={deleteData}     onClose={() => setDeleteData(null)}     onDeleted={() => { fetchOvertimes(); setDeleteData(null);   }} canViewPay={userCanViewPay} />}
      {detailData && (
        <OvertimeDetailModal
          overtime={detailData} onClose={() => setDetailData(null)} userCanViewPay={userCanViewPay} currentUser={currentUser}
          onApprove={() => setApproveData(detailData)} onComplete={() => setCompleteData(detailData)}
          onSetPay={() => setSetPayData(detailData)} onProofPhoto={() => setProofPhotoData(detailData)}
          onEdit={() => setEditData(detailData)} onDelete={() => setDeleteData(detailData)}
        />
      )}

      <style jsx global>{`
        @keyframes modalUp {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </DashboardLayout>
  );
}