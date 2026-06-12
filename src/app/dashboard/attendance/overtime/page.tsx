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
  return new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function initials(name: string): string {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
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
  const iconMap: Record<string, string> = {
    PENDING: "⏳",
    APPROVED: "✅",
    ONGOING: "🟢",
    COMPLETED: "🏁",
    REJECTED: "❌",
    CANCELLED: "🚫",
  };
  return (
    <span className="inline-flex text-[8px] sm:text-xs font-bold px-3 py-1.5 rounded-full border bg-gray-100 text-gray-700 border-gray-200">
      {iconMap[status] ?? "?"} {status}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── MODALS ────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

// ─── ProofPhotoModal ───────────────────────────────────────────────────────
function ProofPhotoModal({
  overtime,
  onClose,
}: {
  overtime: OvertimeRequest;
  onClose: () => void;
}) {
  if (!overtime.proof_photo_url) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-scaleIn">
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-base">👁️ Bukti Lemburan</p>
            <p className="text-xs text-gray-500 mt-1 truncate">{overtime.users?.name}</p>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-all">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4 max-h-[80vh] overflow-y-auto">
          <div>
            <p className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2.5">Foto Bukti</p>
            <img
              src={overtime.proof_photo_url}
              alt="Bukti Lemburan"
              className="w-full h-64 object-cover rounded-xl border border-gray-200 shadow-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-xs text-gray-500 font-medium mb-1">Tanggal</p>
              <p className="font-bold text-gray-900">
                {new Date(overtime.request_date).toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-xs text-gray-500 font-medium mb-1">Durasi</p>
              <p className="font-bold text-gray-900">
                {formatTime(overtime.actual_start ?? overtime.scheduled_start)} –{" "}
                {formatTime(overtime.actual_end ?? overtime.scheduled_end)}
              </p>
            </div>
          </div>
          {overtime.total_pay != null && (
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500 font-medium mb-2">Total Bayaran</p>
              <p className="text-2xl font-black text-gray-800">{formatRupiah(overtime.total_pay)}</p>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full h-10 bg-gray-800 text-white rounded-lg text-sm font-bold hover:bg-gray-900 transition-all"
          >
            Tutup
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── ApproveModal ──────────────────────────────────────────────────────────
function ApproveModal({
  overtime,
  onClose,
  onSaved,
}: {
  overtime: OvertimeRequest;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [scheduledStart, setScheduledStart] = useState(
    overtime.requested_start?.substring(0, 5) || "09:00"
  );
  const [scheduledEnd, setScheduledEnd] = useState("17:00");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const approve = async () => {
    if (!scheduledStart.trim()) { setError("Jam mulai wajib diisi"); return; }
    if (!scheduledEnd.trim()) { setError("Jam selesai wajib diisi"); return; }

    const startMs = new Date(`1970-01-01T${scheduledStart}:00`).getTime();
    const endMs = new Date(`1970-01-01T${scheduledEnd}:00`).getTime();
    if (endMs <= startMs) { setError("Jam selesai harus lebih besar dari jam mulai"); return; }

    setApproving(true);
    setError("");
    try {
      const fmt = (t: string) => (t.length === 5 ? `${t}:00` : t);
      const res = await fetch("/api/attendance/overtime", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: overtime.id,
          action: "APPROVE",
          scheduled_start: `${overtime.request_date}T${fmt(scheduledStart)}+07:00`,
          scheduled_end: `${overtime.request_date}T${fmt(scheduledEnd)}+07:00`,
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) { setError(d.message || `Error ${res.status}`); return; }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || "Gagal disetujui");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden animate-scaleIn">
        <div className="bg-white border-b border-gray-100 px-6 py-5 sm:py-6 flex items-start justify-between">
          <div className="flex-1">
            <p className="font-bold text-gray-900 text-base sm:text-lg">✅ Setujui Lemburan</p>
            <p className="text-xs text-gray-500 mt-2">{overtime.users?.name}</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all flex-shrink-0 ml-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
              ⚠️ {error}
            </div>
          )}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <p className="font-semibold text-sm text-gray-900 mb-2">📋 Info Pengajuan</p>
            <div className="text-sm text-gray-700 space-y-1">
              <p>
                <span className="font-medium">Tanggal:</span>{" "}
                {new Date(overtime.request_date).toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
              <p><span className="font-medium">Alasan:</span> {overtime.reason || "-"}</p>
              <p>
                <span className="font-medium">Jam diminta:</span>{" "}
                {formatTime(overtime.requested_start)}
              </p>
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-3">
              Jam Mulai <span className="text-red-500">*</span>
            </label>
            <input
              type="time"
              value={scheduledStart}
              onChange={(e) => setScheduledStart(e.target.value)}
              className="w-full h-11 border border-gray-200 rounded-lg px-4 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-400/30 focus:border-gray-300 transition-all"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-3">
              Jam Selesai <span className="text-red-500">*</span>
            </label>
            <input
              type="time"
              value={scheduledEnd}
              onChange={(e) => setScheduledEnd(e.target.value)}
              className="w-full h-11 border border-gray-200 rounded-lg px-4 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-400/30 focus:border-gray-300 transition-all"
            />
          </div>
          <div className="bg-gray-100/50 border border-gray-200 rounded-lg p-4">
            <p className="font-semibold text-sm text-gray-900 mb-2">💡 Tips</p>
            <ul className="text-xs text-gray-700 space-y-1">
              <li>• Tentukan jam mulai dan selesai dengan jelas</li>
              <li>• Durasi minimal 1 jam</li>
            </ul>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 bg-gray-50">
          <button
            onClick={onClose}
            className="flex-1 h-11 bg-white text-gray-700 rounded-lg text-sm font-semibold border border-gray-200 hover:bg-gray-50 transition-all"
          >
            Batal
          </button>
          <button
            onClick={approve}
            disabled={approving || !scheduledStart || !scheduledEnd}
            className="flex-1 h-11 bg-gray-800 text-white rounded-lg text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-900 transition-all flex items-center justify-center gap-2"
          >
            {approving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span className="hidden sm:inline">Menyetujui</span>
              </>
            ) : (
              "✅ Setujui"
            )}
          </button>
        </div>
      </div>
    </div>
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

  const today = new Date().toISOString().split("T")[0];

  const submit = async () => {
    if (!requestDate.trim()) { setError("Pilih tanggal terlebih dahulu"); return; }
    if (!startTime.trim()) { setError("Masukkan jam mulai"); return; }
    if (!reason.trim()) { setError("Jelaskan alasan pengajuan"); return; }

    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/attendance/overtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_date: requestDate,
          requested_start: `${startTime}:00`,
          reason: reason.trim(),
        }),
      });
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal mengajukan"); return; }
      onSaved();
      onClose();
    } catch {
      setError("Gagal mengajukan");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden animate-scaleIn">
        <div className="bg-white border-b border-gray-100 px-6 py-5 sm:py-6 flex items-start justify-between">
          <div className="flex-1">
            <p className="font-bold text-gray-900 text-base sm:text-lg">📝 Ajukan Lemburan</p>
            <p className="text-xs text-gray-500 mt-2">{currentUser?.name || "Karyawan"}</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all flex-shrink-0 ml-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
              ⚠️ {error}
            </div>
          )}
          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-3">
              Tanggal Lembur <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              min={today}
              value={requestDate}
              onChange={(e) => setRequestDate(e.target.value)}
              className="w-full h-11 border border-gray-200 rounded-lg px-4 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-400/30 focus:border-gray-300 transition-all"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-3">
              Jam Mulai <span className="text-red-500">*</span>
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full h-11 border border-gray-200 rounded-lg px-4 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-400/30 focus:border-gray-300 transition-all"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-3">
              Alasan Lembur <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Jelaskan alasan lembur..."
              rows={4}
              className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-400/30 focus:border-gray-300 transition-all resize-none"
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 bg-gray-50">
          <button
            onClick={onClose}
            className="flex-1 h-11 bg-white text-gray-700 rounded-lg text-sm font-semibold border border-gray-200 hover:bg-gray-50 transition-all"
          >
            Batal
          </button>
          <button
            onClick={submit}
            disabled={submitting || !requestDate || !startTime || !reason.trim()}
            className="flex-1 h-11 bg-gray-800 text-white rounded-lg text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-900 transition-all flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span className="hidden sm:inline">Mengirim</span>
              </>
            ) : (
              "✅ Ajukan"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function StartModal({ overtime, onClose, onSaved }: { overtime: OvertimeRequest; onClose: () => void; onSaved: () => void }) {
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!description.trim()) { setError("Deskripsi pekerjaan wajib diisi"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/attendance/overtime", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: overtime.id, action: "START", work_description: description }),
      });
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal dimulai"); return; }
      onSaved();
      onClose();
    } catch {
      setError("Gagal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden animate-scaleIn">
        <div className="bg-white border-b border-gray-100 px-6 py-5 sm:py-6 flex items-start justify-between">
          <div className="flex-1">
            <p className="font-bold text-gray-900 text-base sm:text-lg">🟢 Mulai Lemburan</p>
            <p className="text-xs text-gray-500 mt-2">{overtime.users?.name}</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all flex-shrink-0 ml-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
              ⚠️ {error}
            </div>
          )}
          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-3">
              Deskripsi Pekerjaan <span className="text-red-500">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Apa yang akan dikerjakan?"
              rows={4}
              className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-400/30 focus:border-gray-300 transition-all resize-none"
            />
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <p className="font-semibold text-sm text-gray-900 mb-3">⏱️ Waktu Lemburan</p>
            <div className="space-y-2 text-gray-700">
              <p className="text-sm">
                <span className="font-medium">Mulai:</span>{" "}
                <span className="font-bold">{formatTime(overtime.scheduled_start)}</span>
              </p>
              <p className="text-sm">
                <span className="font-medium">Selesai:</span>{" "}
                <span className="font-bold">{formatTime(overtime.scheduled_end)}</span>
              </p>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 bg-gray-50">
          <button
            onClick={onClose}
            className="flex-1 h-11 bg-white text-gray-700 rounded-lg text-sm font-semibold border border-gray-200 hover:bg-gray-50 transition-all"
          >
            Batal
          </button>
          <button
            onClick={save}
            disabled={saving || !description.trim()}
            className="flex-1 h-11 bg-gray-800 text-white rounded-lg text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-900 transition-all flex items-center justify-center gap-2"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              "✅ Mulai"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SetPayModal ───────────────────────────────────────────────────────────
function SetPayModal({
  overtime,
  onClose,
  onSaved,
}: {
  overtime: OvertimeRequest;
  onClose: () => void;
  onSaved: () => void;
}) {
  const calcDurationHours = (): number => {
    const start = overtime.actual_start ?? overtime.scheduled_start;
    const end = overtime.actual_end ?? overtime.scheduled_end;
    if (!start || !end) return 0;
    return Math.floor(
      (new Date(end).getTime() - new Date(start).getTime()) / (60 * 60 * 1000)
    );
  };

  const hours = calcDurationHours();
  const [rate, setRate] = useState(overtime.rate_per_hour ?? 100000);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const totalPay = rate * hours;

  const save = async () => {
    if (rate < 0) { setError("Tarif harus >= 0"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/attendance/overtime", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: overtime.id, action: "SET_PAY", rate_per_hour: Math.round(rate), total_pay: Math.round(totalPay) }),
      });
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal"); return; }
      onSaved();
      onClose();
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
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all flex-shrink-0 ml-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
              ⚠️ {error}
            </div>
          )}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
            <p className="font-semibold text-sm text-gray-900">⏱️ Durasi Lemburan</p>
            <div className="text-xs text-gray-500 space-y-1">
              <p>
                Mulai aktual:{" "}
                <span className="font-bold text-gray-700">{formatTime(overtime.actual_start)}</span>
              </p>
              <p>
                Selesai aktual:{" "}
                <span className="font-bold text-gray-700">{formatTime(overtime.actual_end)}</span>
              </p>
            </div>
            <p className="text-sm text-gray-700 pt-1">
              <span className="font-black text-2xl text-gray-900">{hours} jam</span>
              {" × "}
              <span className="font-bold">{formatRupiah(Math.round(rate))}</span>/jam
            </p>
            <p className="text-2xl font-black text-gray-800 pt-1">
              = {formatRupiah(Math.round(totalPay))}
            </p>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-3">
              Tarif Per Jam (Rp)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-semibold">
                Rp
              </span>
              <input
                type="number"
                min={0}
                value={rate}
                onChange={(e) => setRate(parseFloat(e.target.value) || 0)}
                className="w-full h-11 border border-gray-200 rounded-lg pl-11 pr-4 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-400/30 focus:border-gray-300 font-mono transition-all"
              />
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 bg-gray-50">
          <button
            onClick={onClose}
            className="flex-1 h-11 bg-white text-gray-700 rounded-lg text-sm font-semibold border border-gray-200 hover:bg-gray-50 transition-all"
          >
            Batal
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 h-11 bg-gray-800 text-white rounded-lg text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-900 transition-all flex items-center justify-center gap-2"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              "✅ Simpan"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CompleteModal ─────────────────────────────────────────────────────────
// ✅ Foto bukti sekarang OPSIONAL. isAutoCompleted=true → tombol X & Batal di-disable.
function CompleteModal({
  overtime,
  onClose,
  onSaved,
  isAutoCompleted,
}: {
  overtime: OvertimeRequest;
  onClose: () => void;
  onSaved: () => void;
  isAutoCompleted?: boolean;
}) {
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const handleClose = () => {
    if (isAutoCompleted) {
      setError("⚠️ Kamu wajib upload foto bukti lemburan sebelum menutup.");
      return;
    }
    onClose();
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  // ✅ FIX: foto opsional — upload hanya jika ada file dipilih
  const upload = async () => {
    setUploading(true);
    setError("");
    try {
      let photoUrl: string | null = null;

      if (photoFile) {
        const formData = new FormData();
        formData.append("file", photoFile);
        const uploadRes = await fetch("/api/attendance/overtime/upload", {
          method: "POST",
          body: formData,
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
        body: JSON.stringify({
          id: overtime.id,
          action: "COMPLETE",
          proof_photo_url: photoUrl, // null jika tidak upload foto
        }),
      });
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal menyimpan"); return; }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || "Gagal upload");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden animate-scaleIn">
        <div className="bg-white border-b border-gray-100 px-6 py-5 sm:py-6 flex items-start justify-between">
          <div className="flex-1">
            <p className="font-bold text-gray-900 text-base sm:text-lg">🏁 Selesaikan Lemburan</p>
            <p className="text-xs text-gray-500 mt-2">{overtime.users?.name}</p>
          </div>
          {/* ✅ Tombol X di-disable jika auto-completed */}
          <button
            onClick={handleClose}
            className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all flex-shrink-0 ml-2 ${
              isAutoCompleted
                ? "text-gray-200 cursor-not-allowed"
                : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            }`}
            title={isAutoCompleted ? "Upload foto dulu sebelum menutup" : "Tutup"}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* ✅ Banner auto-complete */}
          {isAutoCompleted && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="font-bold text-amber-800 text-sm mb-1">⚡ Waktu Lembur Habis!</p>
              <p className="text-xs text-amber-700">
                Lemburanmu telah selesai otomatis. Kamu{" "}
                <strong>wajib</strong> upload foto bukti sebelum bisa menutup halaman ini.
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {isProcessing && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
              <p className="text-sm font-semibold text-gray-700">Menambahkan tanggal pada foto...</p>
            </div>
          )}

          {photoPreview ? (
            <div>
              <p className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-3">
                Foto Bukti
              </p>
              <img
                src={photoPreview}
                alt="Preview"
                className="w-full h-56 object-cover rounded-xl border border-gray-200"
              />
              <button
                onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                className="mt-3 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors"
              >
                ↺ Ganti Foto
              </button>
            </div>
          ) : (
            <div>
              {/* ✅ FIX: label berubah dari wajib (*) menjadi opsional */}
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-3">
                Upload Foto Bukti{" "}
                <span className="text-gray-400 font-normal">(opsional)</span>
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:bg-gray-50 hover:border-gray-400 transition-all">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="photoInput"
                  disabled={isProcessing}
                />
                <label htmlFor="photoInput" className="block cursor-pointer">
                  <div className="text-4xl mb-3">📸</div>
                  <p className="text-sm font-bold text-gray-700">Klik untuk upload foto</p>
                  <p className="text-xs text-gray-500 mt-2">JPG, PNG, WEBP — maks 5MB</p>
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 bg-gray-50">
          {/* ✅ Tombol Batal disembunyikan saat auto-completed */}
          {!isAutoCompleted && (
            <button
              onClick={onClose}
              className="flex-1 h-11 bg-white text-gray-700 rounded-lg text-sm font-semibold border border-gray-200 hover:bg-gray-50 transition-all"
            >
              Batal
            </button>
          )}
          {/* ✅ FIX: disabled tidak lagi cek !photoFile, label dinamis */}
          <button
            onClick={upload}
            disabled={uploading || isProcessing}
            className="flex-1 h-11 bg-gray-800 text-white rounded-lg text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-900 transition-all flex items-center justify-center gap-2"
          >
            {uploading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              photoFile ? "✅ Upload & Selesai" : "✅ Selesai"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ManualOvertimeModal ─────────────────────────────────────────────────────
// Hanya untuk ADMIN, PROGRAMMER, ASISTEN_CEO
function ManualOvertimeModal({
  onClose,
  onSaved,
  allUsers,
}: {
  onClose: () => void;
  onSaved: () => void;
  allUsers: User[];
}) {
  const [targetUserId, setTargetUserId] = useState("");
  const [requestDate, setRequestDate] = useState(
    new Date().toISOString().split("T")[0]
  );
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
    if (!targetUserId) { setError("Pilih nama karyawan"); return; }
    if (!requestDate) { setError("Pilih tanggal"); return; }
    if (!startTime) { setError("Masukkan jam mulai"); return; }
    if (!endTime) { setError("Masukkan jam selesai"); return; }

    const startMs = new Date(`1970-01-01T${startTime}:00`).getTime();
    const endMs = new Date(`1970-01-01T${endTime}:00`).getTime();
    if (endMs <= startMs) { setError("Jam selesai harus lebih besar dari jam mulai"); return; }
    if (!description.trim()) { setError("Deskripsi pekerjaan wajib diisi"); return; }
    // ✅ FIX: validasi !photoFile dihapus — foto sekarang opsional

    setSubmitting(true);
    setError("");
    try {
      // ✅ FIX: upload foto hanya jika ada file dipilih
      let photoUrl: string | null = null;
      if (photoFile) {
        const formData = new FormData();
        formData.append("file", photoFile);
        const uploadRes = await fetch("/api/attendance/overtime/upload", {
          method: "POST",
          body: formData,
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
          work_description: description.trim(),
          reason: reason.trim() || "Input manual oleh admin",
          proof_photo_url: photoUrl, // null jika tidak ada foto
        }),
      });
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal menyimpan"); return; }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || "Gagal");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden animate-scaleIn">
        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-6 py-5 sm:py-6 flex items-start justify-between">
          <div className="flex-1">
            <p className="font-bold text-gray-900 text-base sm:text-lg">✏️ Input Lembur Manual</p>
            <p className="text-xs text-gray-500 mt-1">Hanya untuk Admin · Asisten CEO · Programmer</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all flex-shrink-0 ml-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
              ⚠️ {error}
            </div>
          )}

          {/* ✅ FIX: Nama Karyawan — data dari /api/users via allUsers prop */}
          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-3">
              Nama Karyawan <span className="text-red-500">*</span>
            </label>
            <select
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              className="w-full h-11 border border-gray-200 rounded-lg px-4 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-400/30 focus:border-gray-300 transition-all"
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

          {/* Tanggal */}
          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-3">
              Tanggal Lembur <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={requestDate}
              onChange={(e) => setRequestDate(e.target.value)}
              className="w-full h-11 border border-gray-200 rounded-lg px-4 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-400/30 focus:border-gray-300 transition-all"
            />
          </div>

          {/* Jam Mulai & Selesai */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-3">
                Jam Mulai <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full h-11 border border-gray-200 rounded-lg px-4 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-400/30 focus:border-gray-300 transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-3">
                Jam Selesai <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full h-11 border border-gray-200 rounded-lg px-4 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-400/30 focus:border-gray-300 transition-all"
              />
            </div>
          </div>

          {/* Preview durasi */}
          {previewHours !== null && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 flex items-center gap-3">
              <span className="text-lg">⏱️</span>
              <p className="text-sm text-gray-700">
                Durasi:{" "}
                <span className="font-black text-gray-900">{previewHours} jam</span>
                {previewHours === 0 && (
                  <span className="text-amber-600 ml-2 text-xs font-bold">
                    (kurang dari 1 jam — tidak akan dihitung)
                  </span>
                )}
              </p>
            </div>
          )}

          {/* Deskripsi Pekerjaan */}
          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-3">
              Deskripsi Pekerjaan <span className="text-red-500">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Apa yang dikerjakan selama lembur?"
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-400/30 focus:border-gray-300 transition-all resize-none"
            />
          </div>

          {/* Catatan/Alasan (opsional) */}
          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-3">
              Catatan <span className="text-gray-400 font-normal">(opsional)</span>
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Misal: Lembur tidak sempat diinput sebelumnya"
              className="w-full h-11 border border-gray-200 rounded-lg px-4 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-400/30 focus:border-gray-300 transition-all"
            />
          </div>

          {/* ✅ FIX: Upload Foto Bukti — sekarang opsional */}
          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-3">
              Foto Bukti{" "}
              <span className="text-gray-400 font-normal">(opsional)</span>
            </label>
            {isProcessing && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center gap-3 mb-3">
                <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                <p className="text-xs font-semibold text-gray-600">Menambahkan watermark...</p>
              </div>
            )}
            {photoPreview ? (
              <div>
                <img
                  src={photoPreview}
                  alt="Preview"
                  className="w-full h-48 object-cover rounded-xl border border-gray-200 mb-3"
                />
                <button
                  onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                  className="text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors"
                >
                  ↺ Ganti Foto
                </button>
              </div>
            ) : (
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:bg-gray-50 hover:border-gray-400 transition-all">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="manualPhotoInput"
                  disabled={isProcessing}
                />
                <label htmlFor="manualPhotoInput" className="block cursor-pointer">
                  <div className="text-3xl mb-2">📸</div>
                  <p className="text-sm font-bold text-gray-700">Klik untuk upload foto</p>
                  <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP — maks 5MB</p>
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 bg-gray-50">
          <button
            onClick={onClose}
            className="flex-1 h-11 bg-white text-gray-700 rounded-lg text-sm font-semibold border border-gray-200 hover:bg-gray-50 transition-all"
          >
            Batal
          </button>
          {/* ✅ FIX: !photoFile dihapus dari disabled condition */}
          <button
            onClick={submit}
            disabled={
              submitting ||
              !targetUserId ||
              !requestDate ||
              !startTime ||
              !endTime ||
              !description.trim() ||
              isProcessing
            }
            className="flex-1 h-11 bg-gray-800 text-white rounded-lg text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-900 transition-all flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Menyimpan...</span>
              </>
            ) : (
              "✅ Simpan Lembur"
            )}
          </button>
        </div>
      </td>
    </tr>
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
  const [calendarMonth, setCalendarMonth] = useState({
    year: new Date().getFullYear(), month: new Date().getMonth(),
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

  // ✅ FIX: fetch dari /api/users (bukan /api/attendance/users)
  // /api/users return { success, users: [...] } — bukan { success, data: [...] }
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
        const isTimeUp =
          o.scheduled_end && new Date(o.scheduled_end).getTime() <= now;
        const notYetCompleted = !o.actual_end;
        const notAlreadyProcessing = !autoCompletingIds.current.has(o.id);

        if (
          isMyOvertime &&
          isOngoing &&
          isTimeUp &&
          notYetCompleted &&
          notAlreadyProcessing
        ) {
          handleAutoComplete(o);
        }
      });
    }, 15000);

    return () => clearInterval(checkAutoComplete);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overtimes, currentUser]);

  const handleAutoComplete = async (overtime: OvertimeRequest) => {
    if (autoCompletingIds.current.has(overtime.id)) return;
    autoCompletingIds.current.add(overtime.id);

    try {
      const res = await fetch("/api/attendance/overtime", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
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

  const statuses = useMemo(() => [...new Set(overtimes.map(o => o.status))], [overtimes]);

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
    return dateKey.startsWith(
      `${calendarMonth.year}-${pad2(calendarMonth.month + 1)}`
    );
  });

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
    const dim = new Date(
      calendarMonth.year,
      calendarMonth.month + 1,
      0
    ).getDate();
    const c: (number | null)[] = [];
    for (let i = 0; i < fd; i++) c.push(null);
    for (let d = 1; d <= dim; d++) c.push(d);
    return c;
  }, [calendarMonth]);

  const selectedOvertimes = selectedDate
    ? (byDate[selectedDate] || []).sort((a, b) => (a.users?.name || "").localeCompare(b.users?.name || "", "id-ID"))
    : [];

  const statCards = [
    { label: "Total", value: overtimes.length, icon: "📋" },
    { label: "Pending", value: overtimes.filter((o) => o.status === "PENDING").length, icon: "⏳" },
    { label: "Ongoing", value: overtimes.filter((o) => o.status === "ONGOING").length, icon: "🟢" },
    { label: "Completed", value: overtimes.filter((o) => o.status === "COMPLETED").length, icon: "✅" },
  ];

  const renderActions = (o: OvertimeRequest) => (
    <div className="flex justify-center gap-1.5 flex-wrap">
      {canApproveRole(currentUser?.role) && o.status === "PENDING" && (
        <button
          onClick={() => setApproveData(o)}
          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-900 text-white transition-all active:scale-95 whitespace-nowrap shadow-sm"
        >
          ✅ Setujui
        </button>
      )}

      {canApproveRole(currentUser?.role) &&
        o.status === "COMPLETED" &&
        o.proof_photo_url && (
          <button
            onClick={() => setProofPhotoData(o)}
            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-800 text-white transition-all active:scale-95 whitespace-nowrap shadow-sm"
          >
            👁️ Lihat
          </button>
        )}

      {canSetPay(currentUser?.role) && o.status === "COMPLETED" && (
        <button
          onClick={() => setSetPayData(o)}
          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white transition-all active:scale-95 whitespace-nowrap shadow-sm"
        >
          💰 {o.rate_per_hour ? "Edit Bayar" : "Atur Bayar"}
        </button>
      )}

      {!canApproveRole(currentUser?.role) &&
        currentUser?.id === o.user_id &&
        o.status === "APPROVED" &&
        !o.actual_start && (
          <button
            onClick={() => setStartData(o)}
            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-900 text-white transition-all active:scale-95 whitespace-nowrap shadow-sm"
          >
            🟢 Mulai
          </button>
        )}

      {!canApproveRole(currentUser?.role) &&
        currentUser?.id === o.user_id &&
        o.status === "ONGOING" &&
        !o.actual_end &&
        o.rate_per_hour && (
          <button
            onClick={() => setCompleteData(o)}
            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-900 text-white transition-all active:scale-95 whitespace-nowrap shadow-sm"
          >
            🏁 Selesai
          </button>
        )}

      {currentUser?.id === o.user_id &&
        o.status === "COMPLETED" &&
        !o.proof_photo_url && (
          <button
            onClick={() => setCompleteData({ ...o, auto_completed: true })}
            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition-all active:scale-95 whitespace-nowrap shadow-sm"
          >
            📸 Upload Bukti
          </button>
        )}
    </div>
  );

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gradient-to-b from-white via-gray-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8 sm:space-y-10">

          {/* ══════ HEADER ══════ */}
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-gray-100 to-gray-50 rounded-3xl blur-2xl opacity-40" />
            <div className="relative flex items-start sm:items-center justify-between gap-4 flex-wrap">
              <div className="space-y-2 flex-1 min-w-0">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-gray-800 to-gray-700 flex items-center justify-center text-3xl shadow-lg flex-shrink-0">
                    ⏰
                  </div>
                  <div>
                    <h1 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight">
                      Lemburan Karyawan
                    </h1>
                    <p className="text-xs sm:text-sm text-gray-500 font-medium mt-1">
                      {loading
                        ? "Memuat..."
                        : `${overtimes.length} total lemburan bulan ini`}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {isAdminRole(currentUser?.role) && (
                  <button
                    onClick={() => setShowManualModal(true)}
                    className="h-12 px-5 sm:px-6 bg-white border-2 border-gray-300 hover:border-gray-400 text-gray-700 rounded-xl font-bold flex items-center gap-2 transition-all hover:shadow-md active:scale-95 whitespace-nowrap"
                  >
                    <span>✏️</span>
                    <span className="hidden sm:inline">Input Manual</span>
                  </button>
                )}
                <button
                  onClick={() => setShowRequestModal(true)}
                  className="h-12 px-6 sm:px-8 bg-gradient-to-r from-gray-800 to-gray-900 hover:from-gray-900 hover:to-black text-white rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg hover:shadow-xl active:scale-95 whitespace-nowrap"
                >
                  <span>📝</span>
                  <span className="hidden sm:inline">Ajukan Lemburan</span>
                </button>
              </div>
            </div>
          </div>

          {/* ══════ STAT CARDS ══════ */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {statCards.map((c) => (
              <div
                key={c.label}
                className="group relative bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-xl hover:border-gray-300 transition-all duration-300 p-6 sm:p-7 overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-gray-100 to-transparent rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative flex items-start justify-between mb-5">
                  <p className="text-[10px] sm:text-xs font-bold text-gray-500 uppercase tracking-widest">
                    {c.label}
                  </p>
                  <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center text-2xl group-hover:bg-gray-200 transition-colors duration-300 shadow-sm">
                    {c.icon}
                  </div>
                </div>
                <p className="text-3xl sm:text-4xl font-black tracking-tight text-gray-700 group-hover:text-gray-800 transition-colors duration-300">
                  {loading ? (
                    <span className="inline-block w-12 h-8 bg-gray-200 rounded-lg animate-pulse" />
                  ) : (
                    c.value
                  )}
                </p>
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-gray-800 via-gray-600 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </div>
            ))}
          </div>

          {/* ══════ CALENDAR ══════ */}
          <div className="bg-white rounded-3xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-6 sm:px-8 py-6 border-b border-gray-100 gap-4 bg-gradient-to-r from-gray-50 to-white">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center text-2xl shadow-md">
                  📅
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                    Kalender
                  </p>
                  <p className="font-black text-gray-900 text-lg">
                    {MONTH_NAMES[calendarMonth.month]} {calendarMonth.year}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-gray-100 rounded-xl p-1.5 shadow-sm">
                <button
                  onClick={() =>
                    setCalendarMonth((m) => ({
                      month: m.month === 0 ? 11 : m.month - 1,
                      year: m.month === 0 ? m.year - 1 : m.year,
                    }))
                  }
                  className="w-11 h-11 rounded-lg hover:bg-white transition-all active:scale-95 flex items-center justify-center text-gray-700 font-bold hover:shadow-md"
                >
                  ◀
                </button>
                <button
                  onClick={() =>
                    setCalendarMonth((m) => ({
                      month: m.month === 11 ? 0 : m.month + 1,
                      year: m.month === 11 ? m.year + 1 : m.year,
                    }))
                  }
                  className="w-11 h-11 rounded-lg hover:bg-white transition-all active:scale-95 flex items-center justify-center text-gray-700 font-bold hover:shadow-md"
                >
                  ▶
                </button>
              </div>
            </div>

            <div className="p-6 sm:p-8 overflow-x-auto">
              <div className="grid grid-cols-7 gap-2 mb-5 min-w-full">
                {DAY_NAMES.map((d) => (
                  <div
                    key={d}
                    className="text-center text-xs sm:text-sm font-bold text-gray-400 py-3 uppercase tracking-wider"
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2 min-w-full">
                {calDays.map((day, idx) => {
                  if (!day) return <div key={`empty-${idx}`} />;
                  const dk = `${calendarMonth.year}-${pad2(calendarMonth.month + 1)}-${pad2(day)}`;
                  const total = (byDate[dk] || []).length;
                  const isSel = dk === selectedDate;
                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDate(selectedDate === dk ? null : dk)}
                      className={`group flex flex-col items-center justify-center p-3 sm:p-4 rounded-2xl min-h-[85px] sm:min-h-[105px] border-2 transition-all duration-300 ${
                        isSel
                          ? "bg-gray-900 border-gray-800 ring-2 ring-gray-700 shadow-lg text-white"
                          : total > 0
                          ? "bg-gradient-to-br from-gray-50 to-white border-gray-200 hover:border-gray-300 hover:shadow-md hover:scale-[1.02]"
                          : "bg-white border-gray-100 hover:border-gray-200 hover:bg-gray-50 hover:shadow-sm"
                      }`}
                    >
                      <span
                        className={`text-xl sm:text-2xl font-black mb-2 transition-colors ${
                          isSel ? "text-white" : "text-gray-800 group-hover:text-gray-900"
                        }`}
                      >
                        {day}
                      </span>
                      {total > 0 && (
                        <div
                          className={`text-[10px] sm:text-xs font-bold rounded-full px-2.5 py-1 ${
                            isSel
                              ? "bg-white/20 text-white"
                              : "bg-gray-100 text-gray-600 group-hover:bg-gray-200"
                          }`}
                        >
                          {total} lemburan
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ══════ SELECTED DATE DETAILS ══════ */}
          {selectedDate && (
            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden animate-in fade-in duration-300">
              <div className="px-6 sm:px-8 py-6 border-b border-gray-100 flex items-start sm:items-center justify-between gap-3 flex-wrap bg-gradient-to-r from-gray-50 to-white">
                <div className="flex-1 min-w-0">
                  <p className="text-lg sm:text-xl font-black text-gray-900 truncate">
                    {new Date(selectedDate + "T12:00:00").toLocaleDateString("id-ID", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                  <p className="text-xs text-gray-500 mt-1 font-medium">
                    {selectedOvertimes.length} lemburan tercatat
                  </p>
                </div>
                <button
                  onClick={() => setSelectedDate(null)}
                  className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all flex-shrink-0"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {selectedOvertimes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 sm:py-20">
                  <div className="text-6xl sm:text-7xl mb-4 opacity-40">📭</div>
                  <p className="text-sm text-gray-500 font-medium">
                    Tidak ada lemburan pada tanggal ini
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/80">
                        {["Karyawan", "Waktu", "Status", "Bayaran", "Aksi"].map((h) => (
                          <th
                            key={h}
                            className={`px-4 sm:px-6 py-4 font-bold text-gray-600 uppercase tracking-wider text-[10px] sm:text-xs ${
                              h === "Bayaran"
                                ? "text-right"
                                : h === "Aksi"
                                ? "text-center"
                                : "text-left"
                            }`}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {selectedOvertimes.map((o) => (
                        <tr
                          key={o.id}
                          className="hover:bg-gray-50/80 transition-colors duration-200"
                        >
                          <td className="px-4 sm:px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-[9px] sm:text-xs font-black flex-shrink-0 shadow-md">
                                {initials(o.users?.name || "??")}
                              </div>
                              <div>
                                <p className="font-bold text-gray-800 truncate text-xs sm:text-sm">
                                  {o.users?.name}
                                </p>
                                <p className="text-[9px] text-gray-400 mt-0.5">
                                  {o.users?.role?.replace(/_/g, " ")}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 sm:px-4 py-4 text-xs sm:text-sm">
                            <span className="font-mono font-bold text-gray-700">
                              {formatTime(o.scheduled_start)} –{" "}
                              {formatTime(o.scheduled_end)}
                            </span>
                          </td>
                          <td className="px-3 sm:px-4 py-4">
                            <StatusBadge status={o.status} />
                          </td>
                          <td className="px-3 sm:px-4 py-4 text-right">
                            {o.total_pay != null ? (
                              <span className="font-bold text-gray-800 text-xs sm:text-sm">
                                {formatRupiah(o.total_pay)}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300 font-medium">—</span>
                            )}
                          </td>
                          <td className="px-3 sm:px-4 py-4 text-center">
                            {renderActions(o)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ══════ ALL OVERTIMES TABLE ══════ */}
          {!selectedDate && (
            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden">
              <div className="px-6 sm:px-8 py-6 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
                <p className="font-bold text-gray-900 mb-4 text-lg">📋 Daftar Lemburan</p>
                <div className="flex flex-wrap gap-2.5">
                  {["Semua", ...statuses].map((s) => (
                    <button
                      key={s}
                      onClick={() => setFilterStatus(s)}
                      className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 ${
                        filterStatus === s
                          ? "bg-gray-800 text-white shadow-md scale-[1.02]"
                          : "bg-white text-gray-600 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 hover:shadow-sm"
                      }`}
                    >
                      {s === "PENDING"
                        ? "⏳ Pending"
                        : s === "APPROVED"
                        ? "✅ Disetujui"
                        : s === "ONGOING"
                        ? "🟢 Berjalan"
                        : s === "COMPLETED"
                        ? "🏁 Selesai"
                        : s === "REJECTED"
                        ? "❌ Ditolak"
                        : s === "CANCELLED"
                        ? "🚫 Dibatalkan"
                        : "Semua"}
                    </button>
                  ))}
                </div>
              </div>

              {loading ? (
                <div className="p-6 sm:p-8 space-y-3">
                  {Array(3)
                    .fill(0)
                    .map((_, i) => (
                      <div key={i} className="h-16 bg-gray-50 rounded-xl animate-pulse" />
                    ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 sm:py-20">
                  <div className="text-6xl sm:text-7xl mb-4 opacity-40">📭</div>
                  <p className="text-sm text-gray-500 font-medium">Tidak ada lemburan</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/80">
                        {["Karyawan", "Tanggal", "Waktu", "Status", "Bayaran", "Aksi"].map(
                          (h) => (
                            <th
                              key={h}
                              className={`px-4 sm:px-6 py-4 font-bold text-gray-600 uppercase tracking-wider text-[10px] sm:text-xs ${
                                h === "Bayaran"
                                  ? "text-right"
                                  : h === "Aksi"
                                  ? "text-center"
                                  : "text-left"
                              }`}
                            >
                              {h}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filtered.map((o) => (
                        <tr
                          key={o.id}
                          className="hover:bg-gray-50/80 transition-colors duration-200"
                        >
                          <td className="px-4 sm:px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-[9px] sm:text-xs font-black flex-shrink-0 shadow-md">
                                {initials(o.users?.name || "??")}
                              </div>
                              <div>
                                <p className="font-bold text-gray-800 truncate text-xs sm:text-sm">
                                  {o.users?.name}
                                </p>
                                <p className="text-[9px] text-gray-400 mt-0.5">
                                  {o.users?.role?.replace(/_/g, " ")}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 sm:px-4 py-4 text-xs sm:text-sm">
                            <span className="font-mono font-bold text-gray-700">
                              {new Date(o.request_date).toLocaleDateString("id-ID", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                            </span>
                          </td>
                          <td className="px-3 sm:px-4 py-4 text-xs sm:text-sm">
                            <span className="text-gray-600 font-medium">
                              {formatTime(o.scheduled_start)} –{" "}
                              {formatTime(o.scheduled_end)}
                            </span>
                          </td>
                          <td className="px-3 sm:px-4 py-4">
                            <StatusBadge status={o.status} />
                          </td>
                          <td className="px-3 sm:px-4 py-4 text-right">
                            {o.total_pay != null ? (
                              <span className="font-bold text-gray-800 text-xs sm:text-sm">
                                {formatRupiah(o.total_pay)}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300 font-medium">—</span>
                            )}
                          </td>
                          <td className="px-3 sm:px-4 py-4 text-center">
                            {renderActions(o)}
                          </td>
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

      {/* ══════ MODALS ══════ */}
      {showRequestModal && (
        <RequestOvertimeModal
          onClose={() => setShowRequestModal(false)}
          onSaved={() => {
            fetchOvertimes();
            setShowRequestModal(false);
          }}
          currentUser={currentUser}
        />
      )}
      {showManualModal && (
        <ManualOvertimeModal
          onClose={() => setShowManualModal(false)}
          onSaved={() => {
            fetchOvertimes();
            setShowManualModal(false);
          }}
          allUsers={allUsers}
        />
      )}
      {approveData && (
        <ApproveModal
          overtime={approveData}
          onClose={() => setApproveData(null)}
          onSaved={() => {
            fetchOvertimes();
            setApproveData(null);
          }}
        />
      )}
      {startData && (
        <StartModal
          overtime={startData}
          onClose={() => setStartData(null)}
          onSaved={() => {
            fetchOvertimes();
            setStartData(null);
          }}
        />
      )}
      {setPayData && (
        <SetPayModal
          overtime={setPayData}
          onClose={() => setSetPayData(null)}
          onSaved={() => {
            fetchOvertimes();
            setSetPayData(null);
          }}
        />
      )}
      {completeData && (
        <CompleteModal
          overtime={completeData}
          onClose={() => setCompleteData(null)}
          onSaved={() => {
            fetchOvertimes();
            setCompleteData(null);
          }}
          isAutoCompleted={completeData.auto_completed}
        />
      )}
      {proofPhotoData && (
        <ProofPhotoModal
          overtime={proofPhotoData}
          onClose={() => setProofPhotoData(null)}
        />
      )}

      <style jsx>{`
        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.96);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-scaleIn {
          animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </DashboardLayout>
  );
}