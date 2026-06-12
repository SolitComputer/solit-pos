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

// ─── Role helpers ──────────────────────────────────────────────────────────
const FULL_ACCESS_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"] as const;
const DIVISION_HEAD_ROLES = ["KEPALA_SALES", "KEPALA_MARKETING", "KEPALA_TEKNISI"] as const;

function isAdminRole(role?: string): boolean {
  return !!role && (FULL_ACCESS_ROLES as readonly string[]).includes(role);
}

function canApproveRole(role?: string): boolean {
  return (
    isAdminRole(role) ||
    (!!role && (DIVISION_HEAD_ROLES as readonly string[]).includes(role))
  );
}

function canSetPay(role?: string): boolean {
  return !!role && (FULL_ACCESS_ROLES as readonly string[]).includes(role);
}

// ─── Formatters ────────────────────────────────────────────────────────────
function formatRupiah(n: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  if (iso.includes(":") && !iso.includes("T")) return iso.substring(0, 5);
  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

function toWIBDateKey(iso: string): string {
  return new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

// ─── Watermark helper ──────────────────────────────────────────────────────
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
    const months = [
      "Januari", "Februari", "Maret", "April", "Mei", "Juni",
      "Juli", "Agustus", "September", "Oktober", "November", "Desember",
    ];
    const watermarkText = `${now.getUTCDate()}-${months[now.getUTCMonth()]}-${now.getUTCFullYear()} (${days[now.getUTCDay()]}) • ${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")} WIB`;

    const padding = 12;
    const fontSize = Math.max(16, canvas.width / 40);
    ctx.font = `bold ${fontSize}px Arial`;
    const textWidth = ctx.measureText(watermarkText).width;
    const bgX = padding;
    const bgY = canvas.height - fontSize - padding - 10;
    const bgWidth = textWidth + padding * 2;
    const bgHeight = fontSize + padding;

    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(bgX, bgY, bgWidth, bgHeight);
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 2;
    ctx.strokeRect(bgX, bgY, bgWidth, bgHeight);
    ctx.fillStyle = "white";
    ctx.textBaseline = "middle";
    ctx.fillText(watermarkText, bgX + padding, bgY + bgHeight / 2);

    canvas.toBlob(
      (blob) => {
        if (blob) callback(blob, URL.createObjectURL(blob));
      },
      "image/jpeg",
      0.95
    );
  };
  img.onerror = () => console.error("Failed to load image for watermark");
  img.src = imageDataUrl;
}

// ─── StatusBadge ───────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: OvertimeRequest["status"] }) {
  const config: Record<string, { icon: string; color: string; bg: string }> = {
    PENDING: { icon: "⏳", color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
    APPROVED: { icon: "✅", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
    ONGOING: { icon: "🟢", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
    COMPLETED: { icon: "🏁", color: "text-gray-700", bg: "bg-gray-100 border-gray-200" },
    REJECTED: { icon: "❌", color: "text-red-700", bg: "bg-red-50 border-red-200" },
    CANCELLED: { icon: "🚫", color: "text-gray-500", bg: "bg-gray-50 border-gray-200" },
  };
  const c = config[status] || config.PENDING;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${c.bg} ${c.color}`}>
      <span>{c.icon}</span>
      <span>{status}</span>
    </span>
  );
}

// ─── Modal Container (untuk ukuran konsisten) ─────────────────────────────
function ModalContainer({ children, onClose, title, subtitle }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-scaleIn">
        <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between bg-gradient-to-r from-gray-50 to-white">
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-900">{title}</h3>
            {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── ProofPhotoModal ───────────────────────────────────────────────────────
function ProofPhotoModal({ overtime, onClose }: { overtime: OvertimeRequest; onClose: () => void }) {
  if (!overtime.proof_photo_url) return null;
  return (
    <ModalContainer title="📸 Bukti Lemburan" subtitle={overtime.users?.name} onClose={onClose}>
      <div className="p-6 space-y-5">
        <div className="bg-gray-100 rounded-xl overflow-hidden">
          <img src={overtime.proof_photo_url} alt="Bukti Lemburan" className="w-full h-auto object-cover" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <p className="text-xs text-gray-500 mb-1">📅 Tanggal</p>
            <p className="font-bold text-gray-800">
              {new Date(overtime.request_date).toLocaleDateString("id-ID", {
                day: "numeric", month: "short", year: "numeric",
              })}
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <p className="text-xs text-gray-500 mb-1">⏱️ Durasi</p>
            <p className="font-bold text-gray-800 text-sm">
              {formatTime(overtime.actual_start ?? overtime.scheduled_start)} –{" "}
              {formatTime(overtime.actual_end ?? overtime.scheduled_end)}
            </p>
          </div>
        </div>
        {overtime.total_pay != null && (
          <div className="bg-gradient-to-r from-gray-800 to-gray-900 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-300 mb-1">💰 Total Bayaran</p>
            <p className="text-2xl font-bold text-white">{formatRupiah(overtime.total_pay)}</p>
          </div>
        )}
      </div>
      <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
        <button onClick={onClose} className="w-full py-2.5 bg-gray-800 text-white rounded-xl font-semibold hover:bg-gray-900 transition-all">
          Tutup
        </button>
      </div>
    </ModalContainer>
  );
}

// ─── ApproveModal ──────────────────────────────────────────────────────────
function ApproveModal({ overtime, onClose, onSaved }: { overtime: OvertimeRequest; onClose: () => void; onSaved: () => void }) {
  const [scheduledStart, setScheduledStart] = useState(overtime.requested_start?.substring(0, 5) || "09:00");
  const [scheduledEnd, setScheduledEnd] = useState("17:00");
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState("");

  const approve = async () => {
    if (!scheduledStart.trim() || !scheduledEnd.trim()) {
      setError("Jam mulai dan selesai wajib diisi");
      return;
    }
    const startMs = new Date(`1970-01-01T${scheduledStart}:00`).getTime();
    const endMs = new Date(`1970-01-01T${scheduledEnd}:00`).getTime();
    if (endMs <= startMs) {
      setError("Jam selesai harus lebih besar dari jam mulai");
      return;
    }

    setApproving(true);
    setError("");
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
      if (!res.ok || !d.success) throw new Error(d.message || "Gagal menyetujui");
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setApproving(false);
    }
  };

  return (
    <ModalContainer title="✅ Setujui Lemburan" subtitle={overtime.users?.name} onClose={onClose}>
      <div className="p-6 space-y-5">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl">{error}</div>}
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="font-semibold text-sm mb-2">📋 Info Pengajuan</p>
          <div className="text-sm space-y-1 text-gray-600">
            <p>📅 {new Date(overtime.request_date).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</p>
            <p>📝 {overtime.reason || "-"}</p>
            <p>⏰ Diminta: {formatTime(overtime.requested_start)}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-2">Jam Mulai *</label>
            <input type="time" value={scheduledStart} onChange={(e) => setScheduledStart(e.target.value)} className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm focus:ring-2 focus:ring-gray-400/30 focus:border-gray-300" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-2">Jam Selesai *</label>
            <input type="time" value={scheduledEnd} onChange={(e) => setScheduledEnd(e.target.value)} className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm focus:ring-2 focus:ring-gray-400/30 focus:border-gray-300" />
          </div>
        </div>
        <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700">💡 Pastikan jam lembur sesuai dengan pekerjaan yang dilakukan.</div>
      </div>
      <div className="px-6 py-4 border-t border-gray-100 flex gap-3 bg-gray-50">
        <button onClick={onClose} className="flex-1 py-2.5 bg-white border border-gray-200 rounded-xl font-semibold hover:bg-gray-50">Batal</button>
        <button onClick={approve} disabled={approving} className="flex-1 py-2.5 bg-gray-800 text-white rounded-xl font-semibold hover:bg-gray-900 disabled:opacity-50 flex items-center justify-center gap-2">
          {approving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "✅ Setujui"}
        </button>
      </div>
    </ModalContainer>
  );
}

// ─── RequestOvertimeModal ──────────────────────────────────────────────────
function RequestOvertimeModal({ onClose, onSaved, currentUser }: { onClose: () => void; onSaved: () => void; currentUser: any }) {
  const [requestDate, setRequestDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const today = new Date().toISOString().split("T")[0];

  const submit = async () => {
    if (!requestDate || !startTime || !reason.trim()) {
      setError("Semua field wajib diisi");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/attendance/overtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_date: requestDate, requested_start: `${startTime}:00`, reason: reason.trim() }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.message || "Gagal mengajukan");
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalContainer title="📝 Ajukan Lemburan" subtitle={currentUser?.name || "Karyawan"} onClose={onClose}>
      <div className="p-6 space-y-5">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl">{error}</div>}
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-2">Tanggal Lembur *</label>
          <input type="date" min={today} value={requestDate} onChange={(e) => setRequestDate(e.target.value)} className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-2">Jam Mulai *</label>
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-2">Alasan Lembur *</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Jelaskan alasan lembur..." rows={4} className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none" />
        </div>
      </div>
      <div className="px-6 py-4 border-t border-gray-100 flex gap-3 bg-gray-50">
        <button onClick={onClose} className="flex-1 py-2.5 bg-white border border-gray-200 rounded-xl font-semibold hover:bg-gray-50">Batal</button>
        <button onClick={submit} disabled={submitting || !requestDate || !startTime || !reason.trim()} className="flex-1 py-2.5 bg-gray-800 text-white rounded-xl font-semibold hover:bg-gray-900 disabled:opacity-50 flex items-center justify-center gap-2">
          {submitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "✅ Ajukan"}
        </button>
      </div>
    </ModalContainer>
  );
}

// ─── StartModal ────────────────────────────────────────────────────────────
function StartModal({ overtime, onClose, onSaved }: { overtime: OvertimeRequest; onClose: () => void; onSaved: () => void }) {
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!description.trim()) {
      setError("Deskripsi pekerjaan wajib diisi");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/attendance/overtime", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: overtime.id, action: "START", work_description: description }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.message || "Gagal memulai");
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalContainer title="🟢 Mulai Lemburan" subtitle={overtime.users?.name} onClose={onClose}>
      <div className="p-6 space-y-5">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl">{error}</div>}
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-2">Deskripsi Pekerjaan *</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Apa yang akan dikerjakan?" rows={4} className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none" />
        </div>
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="font-semibold text-sm mb-2">⏱️ Jadwal Lembur</p>
          <p className="text-sm">{formatTime(overtime.scheduled_start)} – {formatTime(overtime.scheduled_end)}</p>
        </div>
      </div>
      <div className="px-6 py-4 border-t border-gray-100 flex gap-3 bg-gray-50">
        <button onClick={onClose} className="flex-1 py-2.5 bg-white border border-gray-200 rounded-xl font-semibold hover:bg-gray-50">Batal</button>
        <button onClick={save} disabled={saving || !description.trim()} className="flex-1 py-2.5 bg-gray-800 text-white rounded-xl font-semibold hover:bg-gray-900 disabled:opacity-50 flex items-center justify-center gap-2">
          {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "✅ Mulai"}
        </button>
      </div>
    </ModalContainer>
  );
}

// ─── SetPayModal ───────────────────────────────────────────────────────────
function SetPayModal({ overtime, onClose, onSaved }: { overtime: OvertimeRequest; onClose: () => void; onSaved: () => void }) {
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
    if (rate < 0) {
      setError("Tarif harus >= 0");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/attendance/overtime", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: overtime.id, action: "SET_PAY", rate_per_hour: Math.round(rate), total_pay: Math.round(totalPay) }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.message || "Gagal menyimpan");
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalContainer title="💰 Atur Bayaran" subtitle={overtime.users?.name} onClose={onClose}>
      <div className="p-6 space-y-5">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl">{error}</div>}
        <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-5 text-center">
          <p className="text-sm text-gray-600 mb-1">Durasi Lembur</p>
          <p className="text-3xl font-bold text-gray-800">{hours} Jam</p>
          <p className="text-xs text-gray-500 mt-2">{formatTime(overtime.actual_start)} – {formatTime(overtime.actual_end)}</p>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-2">Tarif Per Jam (Rp)</label>
          <input type="number" min={0} value={rate} onChange={(e) => setRate(parseFloat(e.target.value) || 0)} className="w-full h-12 border border-gray-200 rounded-xl px-4 text-lg font-mono" />
        </div>
        <div className="bg-gray-800 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-300 mb-1">Total Bayaran</p>
          <p className="text-2xl font-bold text-white">{formatRupiah(totalPay)}</p>
        </div>
      </div>
      <div className="px-6 py-4 border-t border-gray-100 flex gap-3 bg-gray-50">
        <button onClick={onClose} className="flex-1 py-2.5 bg-white border border-gray-200 rounded-xl font-semibold hover:bg-gray-50">Batal</button>
        <button onClick={save} disabled={saving} className="flex-1 py-2.5 bg-gray-800 text-white rounded-xl font-semibold hover:bg-gray-900 disabled:opacity-50">✅ Simpan</button>
      </div>
    </ModalContainer>
  );
}

// ─── CompleteModal ─────────────────────────────────────────────────────────
function CompleteModal({ overtime, onClose, onSaved, isAutoCompleted }: { overtime: OvertimeRequest; onClose: () => void; onSaved: () => void; isAutoCompleted?: boolean }) {
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Hanya file gambar yang diterima");
      return;
    }
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
    setUploading(true);
    setError("");
    try {
      let photoUrl: string | null = null;
      if (photoFile) {
        const formData = new FormData();
        formData.append("file", photoFile);
        const uploadRes = await fetch("/api/attendance/overtime/upload", { method: "POST", body: formData });
        if (!uploadRes.ok) throw new Error("Upload gagal");
        const { url } = await uploadRes.json();
        photoUrl = url;
      }
      const res = await fetch("/api/attendance/overtime", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: overtime.id, action: "COMPLETE", proof_photo_url: photoUrl }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.message || "Gagal menyimpan");
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <ModalContainer title="🏁 Selesaikan Lemburan" subtitle={overtime.users?.name} onClose={onClose}>
      <div className="p-6 space-y-5">
        {isAutoCompleted && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="font-semibold text-amber-800 text-sm">⚡ Waktu Lembur Habis!</p>
            <p className="text-xs text-amber-700 mt-1">Kamu wajib upload foto bukti sebelum menyelesaikan.</p>
          </div>
        )}
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl">{error}</div>}
        {isProcessing && (
          <div className="bg-gray-50 rounded-xl p-4 flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            <p className="text-sm font-medium">Memproses foto...</p>
          </div>
        )}
        {photoPreview ? (
          <div>
            <img src={photoPreview} alt="Preview" className="w-full rounded-xl border" />
            <button onClick={() => { setPhotoFile(null); setPhotoPreview(null); }} className="mt-3 text-sm font-semibold text-gray-500 hover:text-gray-700">↺ Ganti Foto</button>
          </div>
        ) : (
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:bg-gray-50 transition-all">
            <input type="file" accept="image/*" onChange={handleFileSelect} className="hidden" id="photoInput" disabled={isProcessing} />
            <label htmlFor="photoInput" className="block cursor-pointer">
              <div className="text-5xl mb-3">📸</div>
              <p className="font-semibold">Klik untuk upload foto</p>
              <p className="text-xs text-gray-500 mt-1">JPG, PNG, WEBP — maks 5MB</p>
              <p className="text-xs text-gray-400 mt-2">(Opsional)</p>
            </label>
          </div>
        )}
      </div>
      <div className="px-6 py-4 border-t border-gray-100 flex gap-3 bg-gray-50">
        {!isAutoCompleted && (
          <button onClick={onClose} className="flex-1 py-2.5 bg-white border border-gray-200 rounded-xl font-semibold hover:bg-gray-50">Batal</button>
        )}
        <button onClick={upload} disabled={uploading || isProcessing} className="flex-1 py-2.5 bg-gray-800 text-white rounded-xl font-semibold hover:bg-gray-900 disabled:opacity-50 flex items-center justify-center gap-2">
          {uploading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (photoFile ? "✅ Upload & Selesai" : "✅ Selesai")}
        </button>
      </div>
    </ModalContainer>
  );
}

// ─── ManualOvertimeModal ─────────────────────────────────────────────────────
function ManualOvertimeModal({ onClose, onSaved, allUsers }: { onClose: () => void; onSaved: () => void; allUsers: User[] }) {
  const [targetUserId, setTargetUserId] = useState("");
  const [requestDate, setRequestDate] = useState(new Date().toISOString().split("T")[0]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const calcPreview = () => {
    const startMs = new Date(`1970-01-01T${startTime}:00`).getTime();
    const endMs = new Date(`1970-01-01T${endTime}:00`).getTime();
    if (endMs <= startMs) return null;
    return Math.floor((endMs - startMs) / (60 * 60 * 1000));
  };
  const previewHours = calcPreview();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Hanya file gambar yang diterima");
      return;
    }
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
    if (!targetUserId || !requestDate || !startTime || !endTime || !description.trim()) {
      setError("Semua field wajib diisi");
      return;
    }
    const startMs = new Date(`1970-01-01T${startTime}:00`).getTime();
    const endMs = new Date(`1970-01-01T${endTime}:00`).getTime();
    if (endMs <= startMs) {
      setError("Jam selesai harus lebih besar dari jam mulai");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      let photoUrl: string | null = null;
      if (photoFile) {
        const formData = new FormData();
        formData.append("file", photoFile);
        const uploadRes = await fetch("/api/attendance/overtime/upload", { method: "POST", body: formData });
        if (!uploadRes.ok) throw new Error("Upload foto gagal");
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
          work_description: description.trim(),
          reason: reason.trim() || "Input manual oleh admin",
          proof_photo_url: photoUrl,
        }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.message || "Gagal menyimpan");
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalContainer title="✏️ Input Lembur Manual" subtitle="Hanya untuk Admin · Asisten CEO · Programmer" onClose={onClose}>
      <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl">{error}</div>}
        
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-2">Nama Karyawan *</label>
          <select value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)} className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm">
            <option value="">— Pilih karyawan —</option>
            {allUsers.slice().sort((a, b) => a.name.localeCompare(b.name, "id-ID")).map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.role.replace(/_/g, " ")})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-2">Tanggal Lembur *</label>
          <input type="date" value={requestDate} onChange={(e) => setRequestDate(e.target.value)} className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-2">Jam Mulai *</label>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-2">Jam Selesai *</label>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm" />
          </div>
        </div>

        {previewHours !== null && (
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <p className="text-sm font-semibold">⏱️ Durasi: <span className="text-2xl font-black">{previewHours}</span> jam</p>
          </div>
        )}

        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-2">Deskripsi Pekerjaan *</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none" />
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-2">Catatan <span className="font-normal text-gray-400">(opsional)</span></label>
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Misal: Lembur tidak sempat diinput sebelumnya" className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm" />
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-2">Foto Bukti <span className="font-normal text-gray-400">(opsional)</span></label>
          {isProcessing && <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-2"><div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" /><span className="text-sm">Memproses...</span></div>}
          {photoPreview ? (
            <div>
              <img src={photoPreview} alt="Preview" className="w-full rounded-xl border mb-2" />
              <button onClick={() => { setPhotoFile(null); setPhotoPreview(null); }} className="text-sm font-semibold text-gray-500">↺ Ganti Foto</button>
            </div>
          ) : (
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:bg-gray-50">
              <input type="file" accept="image/*" onChange={handleFileSelect} className="hidden" id="manualPhotoInput" disabled={isProcessing} />
              <label htmlFor="manualPhotoInput" className="block cursor-pointer">
                <div className="text-3xl mb-2">📸</div>
                <p className="font-semibold text-sm">Klik untuk upload</p>
              </label>
            </div>
          )}
        </div>
      </div>
      <div className="px-6 py-4 border-t border-gray-100 flex gap-3 bg-gray-50">
        <button onClick={onClose} className="flex-1 py-2.5 bg-white border border-gray-200 rounded-xl font-semibold hover:bg-gray-50">Batal</button>
        <button onClick={submit} disabled={submitting || !targetUserId || !requestDate || !startTime || !endTime || !description.trim() || isProcessing} className="flex-1 py-2.5 bg-gray-800 text-white rounded-xl font-semibold hover:bg-gray-900 disabled:opacity-50 flex items-center justify-center gap-2">
          {submitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "✅ Simpan Lembur"}
        </button>
      </div>
    </ModalContainer>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── OvertimePage ──────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
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
  const [startData, setStartData] = useState<OvertimeRequest | null>(null);
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

  useEffect(() => {
    if (!currentUser) return;
    const checkAutoComplete = setInterval(() => {
      const now = Date.now();
      overtimes.forEach((o) => {
        const isMyOvertime = o.user_id === currentUser.id;
        const isOngoing = o.status === "ONGOING";
        const isTimeUp = o.scheduled_end && new Date(o.scheduled_end).getTime() <= now;
        const notYetCompleted = !o.actual_end;
        const notAlreadyProcessing = !autoCompletingIds.current.has(o.id);
        if (isMyOvertime && isOngoing && isTimeUp && notYetCompleted && notAlreadyProcessing) {
          handleAutoComplete(o);
        }
      });
    }, 15000);
    return () => clearInterval(checkAutoComplete);
  }, [overtimes, currentUser]);

  const handleAutoComplete = async (overtime: OvertimeRequest) => {
    if (autoCompletingIds.current.has(overtime.id)) return;
    autoCompletingIds.current.add(overtime.id);
    try {
      const res = await fetch("/api/attendance/overtime", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: overtime.id, action: "COMPLETE", proof_photo_url: null, auto_completed: true }),
      });
      const d = await res.json();
      if (d.success) {
        await fetchOvertimes();
        setCompleteData({ ...overtime, status: "COMPLETED", auto_completed: true });
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

  const statuses = useMemo(() => [...new Set(overtimes.map((o) => o.status))], [overtimes]);

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

  const selectedOvertimes = selectedDate ? (byDate[selectedDate] || []).sort((a, b) => (a.users?.name || "").localeCompare(b.users?.name || "", "id-ID")) : [];

  const statCards = [
    { label: "Total", value: overtimes.length, icon: "📋", color: "from-gray-500 to-gray-600" },
    { label: "Pending", value: overtimes.filter((o) => o.status === "PENDING").length, icon: "⏳", color: "from-amber-500 to-amber-600" },
    { label: "Berjalan", value: overtimes.filter((o) => o.status === "ONGOING").length, icon: "🟢", color: "from-blue-500 to-blue-600" },
    { label: "Selesai", value: overtimes.filter((o) => o.status === "COMPLETED").length, icon: "✅", color: "from-emerald-500 to-emerald-600" },
  ];

  const renderActions = (o: OvertimeRequest) => (
    <div className="flex justify-center gap-2 flex-wrap">
      {canApproveRole(currentUser?.role) && o.status === "PENDING" && (
        <button onClick={() => setApproveData(o)} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-sm">
          ✅ Setujui
        </button>
      )}
      {canApproveRole(currentUser?.role) && o.status === "COMPLETED" && o.proof_photo_url && (
        <button onClick={() => setProofPhotoData(o)} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-600 hover:bg-gray-700 text-white transition-all shadow-sm">
          👁️ Lihat
        </button>
      )}
      {canSetPay(currentUser?.role) && o.status === "COMPLETED" && (
        <button onClick={() => setSetPayData(o)} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-purple-600 hover:bg-purple-700 text-white transition-all shadow-sm">
          💰 {o.rate_per_hour ? "Edit" : "Atur"}
        </button>
      )}
      {!canApproveRole(currentUser?.role) && currentUser?.id === o.user_id && o.status === "APPROVED" && !o.actual_start && (
        <button onClick={() => setStartData(o)} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-sm">
          🟢 Mulai
        </button>
      )}
      {!canApproveRole(currentUser?.role) && currentUser?.id === o.user_id && o.status === "ONGOING" && !o.actual_end && o.rate_per_hour && (
        <button onClick={() => setCompleteData(o)} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-800 hover:bg-gray-900 text-white transition-all shadow-sm">
          🏁 Selesai
        </button>
      )}
      {currentUser?.id === o.user_id && o.status === "COMPLETED" && !o.proof_photo_url && (
        <button onClick={() => setCompleteData({ ...o, auto_completed: true })} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition-all shadow-sm">
          📸 Upload
        </button>
      )}
    </div>
  );

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

          {/* ══════ HEADER ══════ */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center text-3xl shadow-lg">
                ⏰
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Lemburan Karyawan</h1>
                <p className="text-sm text-gray-500 mt-1">
                  {loading ? "Memuat..." : `${overtimes.length} total lemburan`}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              {isAdminRole(currentUser?.role) && (
                <button onClick={() => setShowManualModal(true)} className="px-5 py-2.5 bg-white border-2 border-gray-300 hover:border-gray-400 text-gray-700 rounded-xl font-semibold flex items-center gap-2 transition-all hover:shadow-md">
                  ✏️ Input Manual
                </button>
              )}
              <button onClick={() => setShowRequestModal(true)} className="px-6 py-2.5 bg-gradient-to-r from-gray-800 to-gray-900 hover:from-gray-900 hover:to-black text-white rounded-xl font-semibold flex items-center gap-2 transition-all shadow-lg hover:shadow-xl">
                📝 Ajukan Lemburan
              </button>
            </div>
          </div>

          {/* ══════ STAT CARDS ══════ */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {statCards.map((c) => (
              <div key={c.label} className="group bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden">
                <div className={`p-6 bg-gradient-to-r ${c.color} opacity-5 group-hover:opacity-10 transition-opacity`} />
                <div className="relative p-6">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{c.label}</p>
                    <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                      {c.icon}
                    </div>
                  </div>
                  <p className="text-4xl font-black text-gray-800">
                    {loading ? <span className="inline-block w-12 h-10 bg-gray-200 rounded-lg animate-pulse" /> : c.value}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* ══════ CALENDAR SECTION ══════ */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-xl">📅</div>
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase">Kalender</p>
                    <p className="font-bold text-gray-800">{MONTH_NAMES[calendarMonth.month]} {calendarMonth.year}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setCalendarMonth((m) => ({ month: m.month === 0 ? 11 : m.month - 1, year: m.month === 0 ? m.year - 1 : m.year }))} className="w-10 h-10 rounded-lg bg-gray-100 hover:bg-gray-200 transition-all">◀</button>
                  <button onClick={() => setCalendarMonth((m) => ({ month: m.month === 11 ? 0 : m.month + 1, year: m.month === 11 ? m.year + 1 : m.year }))} className="w-10 h-10 rounded-lg bg-gray-100 hover:bg-gray-200 transition-all">▶</button>
                </div>
              </div>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-7 gap-2 mb-4">
                {DAY_NAMES.map((d) => (
                  <div key={d} className="text-center text-xs font-bold text-gray-400 py-2 uppercase">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {calDays.map((day, idx) => {
                  if (!day) return <div key={`empty-${idx}`} className="aspect-square" />;
                  const dk = `${calendarMonth.year}-${pad2(calendarMonth.month + 1)}-${pad2(day)}`;
                  const total = (byDate[dk] || []).length;
                  const isSel = dk === selectedDate;
                  return (
                    <button key={day} onClick={() => setSelectedDate(selectedDate === dk ? null : dk)} className={`aspect-square rounded-xl flex flex-col items-center justify-center border-2 transition-all ${isSel ? "bg-gray-800 border-gray-800 text-white shadow-lg" : total > 0 ? "bg-gray-50 border-gray-200 hover:border-gray-300 hover:shadow-md" : "bg-white border-gray-100 hover:border-gray-200"}`}>
                      <span className={`text-xl font-bold ${isSel ? "text-white" : "text-gray-700"}`}>{day}</span>
                      {total > 0 && <span className={`text-xs font-semibold mt-1 px-2 py-0.5 rounded-full ${isSel ? "bg-white/20 text-white" : "bg-gray-200 text-gray-600"}`}>{total}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ══════ SELECTED DATE DETAILS ══════ */}
          {selectedDate && selectedOvertimes.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden animate-in fade-in">
              <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white flex items-center justify-between">
                <div>
                  <p className="font-bold text-gray-800">{new Date(selectedDate + "T12:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
                  <p className="text-xs text-gray-500">{selectedOvertimes.length} lemburan</p>
                </div>
                <button onClick={() => setSelectedDate(null)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>
              <div className="divide-y divide-gray-100">
                {selectedOvertimes.map((o) => (
                  <div key={o.id} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-xs shadow-md">
                          {initials(o.users?.name || "??")}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800">{o.users?.name}</p>
                          <p className="text-xs text-gray-400">{o.users?.role?.replace(/_/g, " ")}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 flex-wrap">
                        <span className="text-sm font-mono text-gray-600">{formatTime(o.scheduled_start)} – {formatTime(o.scheduled_end)}</span>
                        <StatusBadge status={o.status} />
                        {o.total_pay != null && <span className="text-sm font-bold text-gray-800">{formatRupiah(o.total_pay)}</span>}
                      </div>
                      <div>{renderActions(o)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══════ ALL OVERTIMES TABLE ══════ */}
          {!selectedDate && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
                <p className="font-bold text-gray-800 mb-4">📋 Daftar Lemburan</p>
                <div className="flex flex-wrap gap-2">
                  {["Semua", ...statuses].map((s) => (
                    <button key={s} onClick={() => setFilterStatus(s)} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${filterStatus === s ? "bg-gray-800 text-white shadow-md" : "bg-white text-gray-600 border border-gray-200 hover:border-gray-300 hover:shadow-sm"}`}>
                      {s === "PENDING" ? "⏳ Pending" : s === "APPROVED" ? "✅ Disetujui" : s === "ONGOING" ? "🟢 Berjalan" : s === "COMPLETED" ? "🏁 Selesai" : s === "REJECTED" ? "❌ Ditolak" : s === "CANCELLED" ? "🚫 Dibatalkan" : "Semua"}
                    </button>
                  ))}
                </div>
              </div>

              {loading ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-50 rounded-xl animate-pulse" />)}
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="text-6xl mb-4 opacity-40">📭</div>
                  <p className="text-gray-500">Tidak ada lemburan</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">Karyawan</th>
                        <th className="px-4 py-4 text-left text-xs font-bold text-gray-500 uppercase">Tanggal</th>
                        <th className="px-4 py-4 text-left text-xs font-bold text-gray-500 uppercase">Waktu</th>
                        <th className="px-4 py-4 text-left text-xs font-bold text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-4 text-right text-xs font-bold text-gray-500 uppercase">Bayaran</th>
                        <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filtered.map((o) => (
                        <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xs font-bold shadow-md">
                                {initials(o.users?.name || "??")}
                              </div>
                              <div>
                                <p className="font-semibold text-gray-800 text-sm">{o.users?.name}</p>
                                <p className="text-xs text-gray-400">{o.users?.role?.replace(/_/g, " ")}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-600">{new Date(o.request_date).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</td>
                          <td className="px-4 py-4 text-sm font-mono text-gray-600">{formatTime(o.scheduled_start)} – {formatTime(o.scheduled_end)}</td>
                          <td className="px-4 py-4"><StatusBadge status={o.status} /></td>
                          <td className="px-4 py-4 text-right font-semibold text-gray-800">{o.total_pay != null ? formatRupiah(o.total_pay) : "—"}</td>
                          <td className="px-6 py-4 text-center">{renderActions(o)}</td>
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

      {/* Modals */}
      {showRequestModal && <RequestOvertimeModal onClose={() => setShowRequestModal(false)} onSaved={() => { fetchOvertimes(); setShowRequestModal(false); }} currentUser={currentUser} />}
      {showManualModal && <ManualOvertimeModal onClose={() => setShowManualModal(false)} onSaved={() => { fetchOvertimes(); setShowManualModal(false); }} allUsers={allUsers} />}
      {approveData && <ApproveModal overtime={approveData} onClose={() => setApproveData(null)} onSaved={() => { fetchOvertimes(); setApproveData(null); }} />}
      {startData && <StartModal overtime={startData} onClose={() => setStartData(null)} onSaved={() => { fetchOvertimes(); setStartData(null); }} />}
      {setPayData && <SetPayModal overtime={setPayData} onClose={() => setSetPayData(null)} onSaved={() => { fetchOvertimes(); setSetPayData(null); }} />}
      {completeData && <CompleteModal overtime={completeData} onClose={() => setCompleteData(null)} onSaved={() => { fetchOvertimes(); setCompleteData(null); }} isAutoCompleted={completeData.auto_completed} />}
      {proofPhotoData && <ProofPhotoModal overtime={proofPhotoData} onClose={() => setProofPhotoData(null)} />}

      <style jsx>{`
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-scaleIn { animation: scaleIn 0.2s ease-out; }
        .animate-in { animation: fadeIn 0.3s ease-out; }
      `}</style>
    </DashboardLayout>
  );
}