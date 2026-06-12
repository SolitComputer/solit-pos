"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
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
  status: "PENDING" | "APPROVED" | "ONGOING" | "COMPLETED" | "REJECTED";
  rate_per_hour: number | null;
  total_pay: number | null;
  auto_completed: boolean;
  created_at: string;
  reason?: string;
  requested_start?: string;
  completed_at?: string;
  users?: { id: string; name: string; role: string };
};

type User = { id: string; name: string; role: string };

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const FULL_ACCESS_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"] as const;

function isAdminRole(role?: string): boolean {
  return !!role && (FULL_ACCESS_ROLES as readonly string[]).includes(role);
}

function formatRupiah(n: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(n);
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  if (iso.includes(":") && !iso.includes("T")) return iso.substring(0, 5);
  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
  });
}

function toWIBDateKey(iso: string): string {
  return new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function initials(name: string): string {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function pad2(n: number) { return String(n).padStart(2, "0"); }

const STATUS_CONFIG: Record<string, { label: string; icon: string; badge: string; dot: string }> = {
  PENDING:   { label: "Pending",   icon: "⏳", badge: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",  dot: "bg-amber-400" },
  APPROVED:  { label: "Disetujui", icon: "✅", badge: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",    dot: "bg-blue-500" },
  ONGOING:   { label: "Berjalan",  icon: "🟢", badge: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200", dot: "bg-emerald-500" },
  COMPLETED: { label: "Selesai",   icon: "🏁", badge: "bg-gray-100 text-gray-600 ring-1 ring-gray-200",   dot: "bg-gray-400" },
  REJECTED:  { label: "Ditolak",   icon: "❌", badge: "bg-red-50 text-red-600 ring-1 ring-red-200",       dot: "bg-red-400" },
};

function ModalShell({ title, subtitle, onClose, children, footer }: {
  title: string; subtitle?: string; onClose: () => void;
  children: React.ReactNode; footer: React.ReactNode;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden modal-slide-up">
        <div className="bg-gray-900 px-5 py-4 flex-shrink-0 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-white text-sm">{title}</h2>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5 font-mono">{subtitle}</p>}
          </div>
          <button onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-all">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">{children}</div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">{footer}</div>
      </div>
    </div>
  );
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2.5 rounded-xl">
      ⚠️ {msg}
    </div>
  );
}

function FormInput({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = "w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-all";
const textareaCls = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-all resize-none";

function BtnCancel({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-all">
      Batal
    </button>
  );
}

function BtnSubmit({ loading, label, disabled }: { loading: boolean; label: string; disabled?: boolean }) {
  return (
    <button type="submit" disabled={loading || disabled}
      className="flex-1 h-10 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-all disabled:opacity-50 shadow-sm flex items-center justify-center gap-2">
      {loading ? (
        <>
          <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
          </svg>
          Menyimpan...
        </>
      ) : label}
    </button>
  );
}

function InfoGrid({ rows }: { rows: { label: string; value: string; mono?: boolean }[] }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-100 space-y-2">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Detail</p>
      {rows.map(r => (
        <div key={r.label} className="flex justify-between items-center text-xs">
          <span className="text-gray-400">{r.label}</span>
          <span className={`font-semibold text-gray-700 text-right max-w-[60%] truncate ${r.mono ? "font-mono text-[11px]" : ""}`}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function ProofPhotoModal({ overtime, onClose }: { overtime: OvertimeRequest; onClose: () => void }) {
  if (!overtime.proof_photo_url) return null;
  return (
    <ModalShell title="Bukti Lemburan" subtitle={overtime.users?.name} onClose={onClose}
      footer={<button onClick={onClose} className="flex-1 h-10 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-all">Tutup</button>}>
      <img src={overtime.proof_photo_url} alt="Bukti" className="w-full h-60 object-cover rounded-xl border border-gray-100" />
      <InfoGrid rows={[
        { label: "Tanggal", value: new Date(overtime.request_date).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) },
        { label: "Waktu", value: `${formatTime(overtime.scheduled_start)} – ${formatTime(overtime.scheduled_end)}` },
        ...(overtime.total_pay ? [{ label: "Bayaran", value: formatRupiah(overtime.total_pay) }] : []),
      ]} />
    </ModalShell>
  );
}

function ApproveModal({ overtime, onClose, onSaved }: { overtime: OvertimeRequest; onClose: () => void; onSaved: () => void }) {
  const [scheduledStart, setScheduledStart] = useState(overtime.requested_start?.slice(0, 5) || "09:00");
  const [scheduledEnd, setScheduledEnd] = useState("17:00");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const startMs = new Date(`1970-01-01T${scheduledStart}:00`).getTime();
    const endMs = new Date(`1970-01-01T${scheduledEnd}:00`).getTime();
    if (endMs <= startMs) { setError("Jam selesai harus lebih besar dari jam mulai"); return; }
    setLoading(true); setError("");
    try {
      const fmt = (t: string) => t.length === 5 ? `${t}:00` : t;
      const res = await fetch("/api/attendance/overtime", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: overtime.id, action: "APPROVE",
          scheduled_start: `${overtime.request_date}T${fmt(scheduledStart)}+07:00`,
          scheduled_end: `${overtime.request_date}T${fmt(scheduledEnd)}+07:00`,
        }),
      });
      const d = await res.json();
      if (!d.success) { setError(d.message || `Error ${res.status}`); return; }
      onSaved(); onClose();
    } catch (err: any) {
      setError(err.message || "Gagal disetujui");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell title="Setujui Lemburan" subtitle={overtime.users?.name} onClose={onClose}
      footer={<form onSubmit={handleSubmit} className="contents"><BtnCancel onClick={onClose} /><BtnSubmit loading={loading} label="Setujui" /></form>}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <ErrorBanner msg={error} />}
        <InfoGrid rows={[
          { label: "Tanggal", value: new Date(overtime.request_date).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) },
          { label: "Alasan", value: overtime.reason || "—" },
          { label: "Jam diminta", value: formatTime(overtime.requested_start) },
        ]} />
        <FormInput label="Jam Mulai" required>
          <input type="time" value={scheduledStart} onChange={e => setScheduledStart(e.target.value)} className={inputCls} required />
        </FormInput>
        <FormInput label="Jam Selesai" required>
          <input type="time" value={scheduledEnd} onChange={e => setScheduledEnd(e.target.value)} className={inputCls} required />
        </FormInput>
      </form>
    </ModalShell>
  );
}

function RequestOvertimeModal({ onClose, onSaved, currentUser }: {
  onClose: () => void; onSaved: () => void; currentUser: any;
}) {
  const [requestDate, setRequestDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) { setError("Jelaskan alasan pengajuan"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/attendance/overtime", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_date: requestDate, requested_start: `${startTime}:00`, reason: reason.trim() }),
      });
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal mengajukan"); return; }
      onSaved(); onClose();
    } catch {
      setError("Gagal mengajukan");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell title="Ajukan Lemburan" subtitle={currentUser?.name || "Karyawan"} onClose={onClose}
      footer={<form onSubmit={handleSubmit} className="contents"><BtnCancel onClick={onClose} /><BtnSubmit loading={loading} label="Ajukan" disabled={!requestDate || !startTime || !reason.trim()} /></form>}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <ErrorBanner msg={error} />}
        <FormInput label="Tanggal Lembur" required>
          <input type="date" min={new Date().toISOString().split("T")[0]} value={requestDate} onChange={e => setRequestDate(e.target.value)} className={inputCls} required />
        </FormInput>
        <FormInput label="Jam Mulai" required>
          <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={inputCls} required />
        </FormInput>
        <FormInput label="Alasan Lembur" required>
          <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Jelaskan alasan lembur..." rows={3} className={textareaCls} />
        </FormInput>
      </form>
    </ModalShell>
  );
}

function StartModal({ overtime, onClose, onSaved }: { overtime: OvertimeRequest; onClose: () => void; onSaved: () => void }) {
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) { setError("Deskripsi pekerjaan wajib diisi"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/attendance/overtime", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: overtime.id, action: "START", work_description: description }),
      });
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal dimulai"); return; }
      onSaved(); onClose();
    } catch {
      setError("Gagal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell title="Mulai Lemburan" subtitle={overtime.users?.name} onClose={onClose}
      footer={<form onSubmit={handleSubmit} className="contents"><BtnCancel onClick={onClose} /><BtnSubmit loading={loading} label="Mulai" disabled={!description.trim()} /></form>}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <ErrorBanner msg={error} />}
        <InfoGrid rows={[
          { label: "Mulai", value: formatTime(overtime.scheduled_start) },
          { label: "Selesai", value: formatTime(overtime.scheduled_end) },
        ]} />
        <FormInput label="Deskripsi Pekerjaan" required>
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Apa yang akan dikerjakan?" rows={3} className={textareaCls} />
        </FormInput>
      </form>
    </ModalShell>
  );
}

function SetPayModal({ overtime, onClose, onSaved }: { overtime: OvertimeRequest; onClose: () => void; onSaved: () => void }) {
  const hours = (() => {
    if (!overtime.scheduled_start || !overtime.actual_end) return 0;
    return Math.max(1, Math.ceil((new Date(overtime.actual_end).getTime() - new Date(overtime.scheduled_start).getTime()) / (60 * 60 * 1000)));
  })();

  const [rate, setRate] = useState(overtime.rate_per_hour || 100000);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const totalPay = rate * hours;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/attendance/overtime", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: overtime.id, action: "SET_PAY", rate_per_hour: Math.round(rate), total_pay: Math.round(totalPay) }),
      });
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal"); return; }
      onSaved(); onClose();
    } catch {
      setError("Gagal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell title="Atur Bayaran" subtitle={overtime.users?.name} onClose={onClose}
      footer={<form onSubmit={handleSubmit} className="contents"><BtnCancel onClick={onClose} /><BtnSubmit loading={loading} label="Simpan" /></form>}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <ErrorBanner msg={error} />}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Kalkulasi</p>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-gray-900">{hours}</span>
            <span className="text-sm text-gray-400">jam ×</span>
            <span className="text-sm font-semibold text-gray-600">{formatRupiah(Math.round(rate))}</span>
          </div>
          <div className="mt-2 pt-2 border-t border-gray-200">
            <p className="text-xs text-gray-400">Total Bayaran</p>
            <p className="text-xl font-black text-emerald-600">{formatRupiah(Math.round(totalPay))}</p>
          </div>
        </div>
        <FormInput label="Tarif Per Jam (Rp)">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-semibold">Rp</span>
            <input type="number" min={0} value={rate} onChange={e => setRate(parseFloat(e.target.value) || 0)}
              className="w-full h-10 border border-gray-200 rounded-xl pl-9 pr-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-all font-mono" />
          </div>
        </FormInput>
      </form>
    </ModalShell>
  );
}

function addWatermarkToImage(imageDataUrl: string, callback: (blob: Blob, preview: string) => void) {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const months = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
    const days = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
    const watermarkText = `${now.getUTCDate()}-${months[now.getUTCMonth()]}-${now.getUTCFullYear()} (${days[now.getUTCDay()]}) • ${String(now.getUTCHours()).padStart(2,"0")}:${String(now.getUTCMinutes()).padStart(2,"0")} WIB`;
    const pad = 12, fontSize = Math.max(16, canvas.width / 40);
    ctx.font = `bold ${fontSize}px Arial`;
    const tw = ctx.measureText(watermarkText).width;
    const bgX = pad, bgY = canvas.height - fontSize - pad - 10;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(bgX, bgY, tw + pad * 2, fontSize + pad);
    ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 2;
    ctx.strokeRect(bgX, bgY, tw + pad * 2, fontSize + pad);
    ctx.fillStyle = "white"; ctx.textBaseline = "middle";
    ctx.fillText(watermarkText, bgX + pad, bgY + fontSize / 2 + pad / 2);
    canvas.toBlob(blob => { if (blob) callback(blob, URL.createObjectURL(blob)); }, "image/jpeg", 0.95);
  };
  img.src = imageDataUrl;
}

function CompleteModal({ overtime, onClose, onSaved, isAutoCompleted }: {
  overtime: OvertimeRequest; onClose: () => void; onSaved: () => void; isAutoCompleted?: boolean;
}) {
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Hanya file gambar"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setProcessing(true);
      addWatermarkToImage(ev.target?.result as string, (blob, preview) => {
        setPhotoPreview(preview);
        setPhotoFile(new File([blob], file.name, { type: "image/jpeg" }));
        setProcessing(false);
      });
      setError("");
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photoFile) { setError("Pilih foto terlebih dahulu"); return; }
    setUploading(true); setError("");
    try {
      const formData = new FormData();
      formData.append("file", photoFile);
      const uploadRes = await fetch("/api/attendance/overtime/upload", { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error((await uploadRes.json()).message || "Upload gagal");
      const { url: photoUrl } = await uploadRes.json();
      const res = await fetch("/api/attendance/overtime", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: overtime.id, action: "COMPLETE", proof_photo_url: photoUrl }),
      });
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal menyimpan"); return; }
      onSaved(); onClose();
    } catch (err: any) {
      setError(err.message || "Gagal upload");
    } finally {
      setUploading(false);
    }
  };

  return (
    <ModalShell title="Selesaikan Lemburan" subtitle={overtime.users?.name} onClose={onClose}
      footer={<form onSubmit={handleSubmit} className="contents"><BtnCancel onClick={onClose} /><BtnSubmit loading={uploading} label="Selesai" disabled={!photoFile || processing} /></form>}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {isAutoCompleted && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 text-xs text-blue-700">
            ⚡ Lemburan ini selesai otomatis karena melewati waktu yang dijadwalkan.
          </div>
        )}
        {error && <ErrorBanner msg={error} />}
        {processing && (
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100">
            <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            Menambahkan watermark...
          </div>
        )}
        {photoPreview ? (
          <div>
            <img src={photoPreview} alt="Preview" className="w-full h-52 object-cover rounded-xl border border-gray-100" />
            <button type="button" onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
              className="mt-2 text-xs font-semibold text-gray-500 hover:text-gray-800 transition-colors">
              ↺ Ganti foto
            </button>
          </div>
        ) : (
          <label htmlFor="photoInput" className="block border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:bg-gray-50 hover:border-gray-300 transition-all">
            <input type="file" accept="image/*" onChange={handleFile} className="hidden" id="photoInput" disabled={processing} />
            <div className="text-3xl mb-2">📸</div>
            <p className="text-sm font-semibold text-gray-600">Klik untuk upload foto</p>
            <p className="text-xs text-gray-400 mt-1">Foto akan diberi watermark otomatis</p>
          </label>
        )}
      </form>
    </ModalShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0 ${cfg.badge}`}>
      <span className={`w-1 h-1 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function OvertimeRow({ o, currentUser, onApprove, onSetPay, onStart, onComplete, onViewProof }: {
  o: OvertimeRequest; currentUser: any;
  onApprove: () => void; onSetPay: () => void;
  onStart: () => void; onComplete: () => void; onViewProof: () => void;
}) {
  const isAdmin = isAdminRole(currentUser?.role);
  const isOwner = currentUser?.id === o.user_id;

  return (
    <tr className="hover:bg-gray-50/70 transition-colors">
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gray-900 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
            {initials(o.users?.name || "??")}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-800 text-sm truncate">{o.users?.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">{o.users?.role?.replace(/_/g, " ")}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-4">
        <p className="font-mono text-sm font-semibold text-gray-700">
          {formatTime(o.scheduled_start)}–{formatTime(o.scheduled_end)}
        </p>
        {o.scheduled_start && (
          <p className="text-xs text-gray-400 mt-1">
            {new Date(o.request_date).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
          </p>
        )}
      </td>
      <td className="px-4 py-4"><StatusBadge status={o.status} /></td>
      <td className="px-4 py-4 text-right">
        {o.total_pay
          ? <span className="text-sm font-bold text-gray-800">{formatRupiah(o.total_pay)}</span>
          : <span className="text-xs text-gray-300">—</span>}
      </td>
      <td className="px-4 py-4 text-center">
        <div className="flex justify-center gap-2 flex-wrap">
          {isAdmin && o.status === "PENDING" && (
            <button onClick={onApprove} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition-all whitespace-nowrap shadow-sm">
              Setujui
            </button>
          )}
          {isAdmin && o.status === "ONGOING" && !o.actual_end && !o.rate_per_hour && (
            <button onClick={onSetPay} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition-all whitespace-nowrap shadow-sm">
              💰 Bayar
            </button>
          )}
          {isAdmin && o.status === "COMPLETED" && o.proof_photo_url && (
            <button onClick={onViewProof} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition-all whitespace-nowrap shadow-sm">
              Lihat ↗
            </button>
          )}
          {!isAdmin && isOwner && o.status === "APPROVED" && !o.actual_start && (
            <button onClick={onStart} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-all whitespace-nowrap shadow-sm">
              Mulai
            </button>
          )}
          {!isAdmin && isOwner && o.status === "ONGOING" && !o.actual_end && o.rate_per_hour && (
            <button onClick={onComplete} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition-all whitespace-nowrap shadow-sm">
              Selesai
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function OvertimePage() {
  const [overtimes, setOvertimes] = useState<OvertimeRequest[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState<string>("Semua");
  const [calendarMonth, setCalendarMonth] = useState({
    year: new Date().getFullYear(), month: new Date().getMonth(),
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [startData, setStartData] = useState<OvertimeRequest | null>(null);
  const [setPayData, setSetPayData] = useState<OvertimeRequest | null>(null);
  const [completeData, setCompleteData] = useState<OvertimeRequest | null>(null);
  const [approveData, setApproveData] = useState<OvertimeRequest | null>(null);
  const [proofPhotoData, setProofPhotoData] = useState<OvertimeRequest | null>(null);

  const fetchOvertimes = useCallback(async () => {
    const r = await fetch("/api/attendance/overtime");
    const d = await r.json();
    if (d.success) setOvertimes(d.data || []);
  }, []);

  const fetchAllUsers = useCallback(async () => {
    const r = await fetch("/api/attendance/users");
    const d = await r.json();
    if (d.success) setAllUsers(d.data || []);
  }, []);

  useEffect(() => { getCurrentUserClient().then(u => setCurrentUser(u)); }, []);
  useEffect(() => {
    setLoading(true);
    Promise.all([fetchOvertimes(), fetchAllUsers()]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      overtimes.forEach(o => {
        if (o.status === "ONGOING" && o.scheduled_end && new Date(o.scheduled_end).getTime() <= now && !o.actual_end) {
          handleAutoComplete(o);
        }
      });
    }, 30000);
    return () => clearInterval(interval);
  }, [overtimes]);

  const handleAutoComplete = async (overtime: OvertimeRequest) => {
    try {
      const res = await fetch("/api/attendance/overtime", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: overtime.id, action: "COMPLETE", proof_photo_url: null, auto_completed: true }),
      });
      const d = await res.json();
      if (d.success) { fetchOvertimes(); setCompleteData(overtime); }
    } catch (err) { console.error("[AUTO-COMPLETE]", err); }
  };

  const statuses = useMemo(() => [...new Set(overtimes.map(o => o.status))], [overtimes]);

  const filtered = useMemo(() => {
    if (filterStatus === "Semua") return overtimes;
    return overtimes.filter(o => o.status === filterStatus);
  }, [overtimes, filterStatus]);

  const byDate = useMemo(() => {
    const m: Record<string, OvertimeRequest[]> = {};
    overtimes.forEach(o => {
      const k = toWIBDateKey(o.request_date);
      if (!m[k]) m[k] = [];
      m[k].push(o);
    });
    return m;
  }, [overtimes]);

  const calDays = useMemo(() => {
    const fd = new Date(calendarMonth.year, calendarMonth.month, 1).getDay();
    const dim = new Date(calendarMonth.year, calendarMonth.month + 1, 0).getDate();
    const c: (number | null)[] = [];
    for (let i = 0; i < fd; i++) c.push(null);
    for (let d = 1; d <= dim; d++) c.push(d);
    return c;
  }, [calendarMonth]);

  const selectedOvertimes = selectedDate
    ? (byDate[selectedDate] || []).sort((a, b) => (a.users?.name || "").localeCompare(b.users?.name || "", "id-ID"))
    : [];

  const stats = {
    total: overtimes.length,
    pending: overtimes.filter(o => o.status === "PENDING").length,
    ongoing: overtimes.filter(o => o.status === "ONGOING").length,
    completed: overtimes.filter(o => o.status === "COMPLETED").length,
  };

  const rowHandlers = (o: OvertimeRequest) => ({
    onApprove: () => setApproveData(o),
    onSetPay: () => setSetPayData(o),
    onStart: () => setStartData(o),
    onComplete: () => setCompleteData(o),
    onViewProof: () => setProofPhotoData(o),
  });

  const TABLE_HEAD = (
    <tr className="border-b border-gray-100 bg-gray-50/80">
      {["Karyawan", "Waktu", "Status", "Bayaran", "Aksi"].map((h, i) => (
        <th key={h} className={`px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider ${i === 3 ? "text-right" : i === 4 ? "text-center" : "text-left"} ${i === 0 ? "pl-5" : ""}`}>
          {h}
        </th>
      ))}
    </tr>
  );

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 bg-gray-900 rounded-xl flex items-center justify-center shadow-lg shadow-gray-900/20 text-2xl">
              ⏰
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 leading-tight">Lembur</h1>
              <p className="text-sm text-gray-400">Overtime Management</p>
            </div>
          </div>
          <button
            onClick={() => setShowRequestModal(true)}
            className="flex items-center gap-2 h-10 px-5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 active:scale-95 transition-all shadow-md shadow-gray-900/20 group"
          >
            <span className="w-5 h-5 rounded-lg bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </span>
            Ajukan
          </button>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total",    value: stats.total,     bg: "bg-gray-50",    color: "text-gray-700" },
            { label: "Pending",  value: stats.pending,   bg: "bg-amber-50",   color: "text-amber-600" },
            { label: "Berjalan", value: stats.ongoing,   bg: "bg-emerald-50", color: "text-emerald-600" },
            { label: "Selesai",  value: stats.completed, bg: "bg-blue-50",    color: "text-blue-600" },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-4 text-center border border-white/60`}>
              {loading
                ? <div className="h-7 w-10 bg-gray-200 rounded-lg animate-pulse mx-auto mb-2" />
                : <div className={`text-3xl font-black ${s.color}`}>{s.value}</div>}
              <div className="text-xs text-gray-500 font-semibold mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Calendar ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-xl">📅</div>
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Kalender</p>
                <p className="font-bold text-gray-900 text-lg leading-tight">
                  {MONTH_NAMES[calendarMonth.month]} {calendarMonth.year}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setCalendarMonth(m => ({ month: m.month === 0 ? 11 : m.month - 1, year: m.month === 0 ? m.year - 1 : m.year }))}
                className="w-8 h-8 rounded-md hover:bg-white transition-all flex items-center justify-center text-gray-600 text-sm font-bold hover:shadow-sm"
              >◀</button>
              <button
                onClick={() => setCalendarMonth(m => ({ month: m.month === 11 ? 0 : m.month + 1, year: m.month === 11 ? m.year + 1 : m.year }))}
                className="w-8 h-8 rounded-md hover:bg-white transition-all flex items-center justify-center text-gray-600 text-sm font-bold hover:shadow-sm"
              >▶</button>
            </div>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-7 mb-3">
              {DAY_NAMES.map(d => (
                <div key={d} className="text-center text-xs font-bold text-gray-300 py-2 uppercase tracking-wider">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {calDays.map((day, idx) => {
                if (!day) return <div key={`e-${idx}`} />;
                const dk = `${calendarMonth.year}-${pad2(calendarMonth.month + 1)}-${pad2(day)}`;
                const total = (byDate[dk] || []).length;
                const isSel = dk === selectedDate;
                const isToday = dk === new Date().toISOString().slice(0, 10);
                return (
                  <button key={day} onClick={() => setSelectedDate(selectedDate === dk ? null : dk)}
                    className={`flex flex-col items-center justify-center py-3 rounded-xl min-h-[60px] border transition-all duration-150 text-base font-bold ${
                      isSel
                        ? "bg-gray-900 border-gray-900 text-white shadow-md"
                        : total > 0
                          ? "bg-gray-50 border-gray-200 hover:border-gray-300 hover:shadow-sm text-gray-800"
                          : isToday
                            ? "bg-white border-gray-300 text-gray-900 ring-1 ring-gray-300"
                            : "bg-white border-gray-100 hover:border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <span className="text-lg">{day}</span>
                    {total > 0 && (
                      <span className={`mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isSel ? "bg-white/20 text-white" : "bg-gray-200 text-gray-600"
                      }`}>
                        {total}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Selected Date Detail ── */}
        {selectedDate && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <p className="font-bold text-gray-900 text-lg">
                  {new Date(selectedDate + "T12:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" })}
                </p>
                <p className="text-sm text-gray-400 mt-1">{selectedOvertimes.length} lembur</p>
              </div>
              <button onClick={() => setSelectedDate(null)}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-50 transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {selectedOvertimes.length === 0 ? (
              <div className="py-12 text-center">
                <div className="text-3xl mb-2 opacity-40">📭</div>
                <p className="text-xs text-gray-400">Tidak ada lembur pada tanggal ini</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>{TABLE_HEAD}</thead>
                  <tbody className="divide-y divide-gray-100">
                    {selectedOvertimes.map(o => (
                      <OvertimeRow key={o.id} o={o} currentUser={currentUser} {...rowHandlers(o)} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── All Overtimes Table ── */}
        {!selectedDate && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2 overflow-x-auto no-scrollbar">
              <span className="text-xs font-bold text-gray-400 flex-shrink-0">Filter:</span>
              {["Semua", ...statuses].map(s => {
                const cfg = STATUS_CONFIG[s];
                return (
                  <button key={s} onClick={() => setFilterStatus(s)}
                    className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      filterStatus === s
                        ? "bg-gray-900 text-white shadow-md"
                        : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"
                    }`}>
                    {cfg && <span>{cfg.icon}</span>}
                    {cfg ? cfg.label : "Semua"}
                    <span className={`tabular-nums text-[10px] px-1.5 py-0.5 rounded-md font-bold ml-0.5 ${
                      filterStatus === s ? "bg-white/20 text-white" : "bg-gray-100 text-gray-400"
                    }`}>
                      {s === "Semua" ? overtimes.length : overtimes.filter(o => o.status === s).length}
                    </span>
                  </button>
                );
              })}
            </div>
            {loading ? (
              <div className="p-4 space-y-2">
                {Array(3).fill(0).map((_, i) => (
                  <div key={i} className="h-14 bg-gray-50 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center">
                <div className="text-3xl mb-2 opacity-40">📭</div>
                <p className="text-xs text-gray-400">Tidak ada lembur</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>{TABLE_HEAD}</thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map(o => (
                      <OvertimeRow key={o.id} o={o} currentUser={currentUser} {...rowHandlers(o)} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {showRequestModal && <RequestOvertimeModal onClose={() => setShowRequestModal(false)} onSaved={() => { fetchOvertimes(); setShowRequestModal(false); }} currentUser={currentUser} />}
      {approveData && <ApproveModal overtime={approveData} onClose={() => setApproveData(null)} onSaved={() => { fetchOvertimes(); setApproveData(null); }} />}
      {startData && <StartModal overtime={startData} onClose={() => setStartData(null)} onSaved={() => { fetchOvertimes(); setStartData(null); }} />}
      {setPayData && <SetPayModal overtime={setPayData} onClose={() => setSetPayData(null)} onSaved={() => { fetchOvertimes(); setSetPayData(null); }} />}
      {completeData && <CompleteModal overtime={completeData} onClose={() => setCompleteData(null)} onSaved={() => { fetchOvertimes(); setCompleteData(null); }} isAutoCompleted={completeData.auto_completed} />}
      {proofPhotoData && <ProofPhotoModal overtime={proofPhotoData} onClose={() => setProofPhotoData(null)} />}

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .modal-slide-up { animation: slideUp 0.25s ease-out; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>
    </DashboardLayout>
  );
}