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
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  if (iso.includes(":") && !iso.includes("T")) {
    return iso.substring(0, 5);
  }
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

function getWIBToday(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
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
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-base">👁️ Bukti Lemburan</p>
            <p className="text-xs text-gray-500 mt-1 truncate">{overtime.users?.name}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all flex-shrink-0 ml-3"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Foto */}
          <div>
            <p className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2.5">Foto Bukti</p>
            <img
              src={overtime.proof_photo_url}
              alt="Bukti Lemburan"
              className="w-full h-64 object-cover rounded-xl border border-gray-200 shadow-sm"
            />
          </div>

          {/* Info Grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-xs text-gray-500 font-medium mb-1">Tanggal</p>
              <p className="font-bold text-gray-900">
                {new Date(overtime.request_date).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-xs text-gray-500 font-medium mb-1">Durasi</p>
              <p className="font-bold text-gray-900">
                {formatTime(overtime.scheduled_start)} – {formatTime(overtime.scheduled_end)}
              </p>
            </div>
          </div>

          {/* Bayaran */}
          {overtime.total_pay && (
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500 font-medium mb-2">Total Bayaran</p>
              <p className="text-2xl font-black text-gray-800">
                {formatRupiah(overtime.total_pay)}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full h-10 bg-gray-800 text-white rounded-lg text-sm font-bold hover:bg-gray-900 transition-all"
          >
            Tutup
          </button>
        </div>
      </div>
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
  const [scheduledStart, setScheduledStart] = useState(overtime.requested_start || "09:00");
  const [scheduledEnd, setScheduledEnd] = useState("17:00");
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState("");

  const approve = async () => {
    if (!scheduledStart.trim()) {
      setError("Jam mulai wajib diisi");
      return;
    }
    if (!scheduledEnd.trim()) {
      setError("Jam selesai wajib diisi");
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
      const formatTime = (timeStr: string): string => {
        return timeStr.length === 5 ? `${timeStr}:00` : timeStr;
      };

      const startFmt = `${overtime.request_date}T${formatTime(scheduledStart)}+07:00`;
      const endFmt = `${overtime.request_date}T${formatTime(scheduledEnd)}+07:00`;

      const res = await fetch("/api/attendance/overtime", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: overtime.id,
          action: "APPROVE",
          scheduled_start: startFmt,
          scheduled_end: endFmt,
        }),
      });

      const d = await res.json();
      if (!res.ok || !d.success) {
        setError(d.message || `Error ${res.status}`);
        return;
      }

      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || "Gagal disetujui");
    } finally {
      setApproving(false);
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
              <p><span className="font-medium">Tanggal:</span> {new Date(overtime.request_date).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</p>
              <p><span className="font-medium">Alasan:</span> {overtime.reason || "-"}</p>
              <p><span className="font-medium">Jam yang diminta:</span> {formatTime(overtime.requested_start)}</p>
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

// ─── RequestOvertimeModal ──────────────────────────────────────────────────
function RequestOvertimeModal({
  onClose,
  onSaved,
  currentUser,
}: {
  onClose: () => void;
  onSaved: () => void;
  currentUser: any;
}) {
  const [requestDate, setRequestDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const getMinDate = (): string => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  };

  const submit = async () => {
    if (!requestDate.trim()) {
      setError("Pilih tanggal terlebih dahulu");
      return;
    }
    if (!startTime.trim()) {
      setError("Masukkan jam mulai");
      return;
    }
    if (!reason.trim()) {
      setError("Jelaskan alasan pengajuan");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const requestedStart = `${startTime}:00`;
      const res = await fetch("/api/attendance/overtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_date: requestDate,
          requested_start: requestedStart,
          reason: reason.trim(),
        }),
      });

      const d = await res.json();
      if (!d.success) {
        setError(d.message || "Gagal mengajukan");
        return;
      }

      onSaved();
      onClose();
    } catch {
      setError("Gagal mengajukan");
    } finally {
      setSubmitting(false);
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
              min={getMinDate()}
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

// ─── StartModal ────────────────────────────────────────────────────────────
function StartModal({
  overtime,
  onClose,
  onSaved,
}: {
  overtime: OvertimeRequest;
  onClose: () => void;
  onSaved: () => void;
}) {
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
        body: JSON.stringify({
          id: overtime.id,
          action: "START",
          work_description: description,
        }),
      });
      const d = await res.json();
      if (!d.success) {
        setError(d.message || "Gagal dimulai");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Gagal");
    } finally {
      setSaving(false);
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
              <p className="text-sm"><span className="font-medium">Mulai:</span> <span className="font-bold">{formatTime(overtime.scheduled_start)}</span></p>
              <p className="text-sm"><span className="font-medium">Selesai:</span> <span className="font-bold">{formatTime(overtime.scheduled_end)}</span></p>
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
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </>
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
    if (!overtime.scheduled_start || !overtime.actual_end) return 0;
    const start = new Date(overtime.scheduled_start).getTime();
    const end = new Date(overtime.actual_end).getTime();
    return Math.max(1, Math.ceil((end - start) / (60 * 60 * 1000)));
  };

  const hours = calcDurationHours();
  const defaultRate = 100000;
  const [rate, setRate] = useState(overtime.rate_per_hour || defaultRate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const totalPay = rate * hours;

  const save = async () => {
    setSaving(true);
    setError("");
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
      if (!d.success) {
        setError(d.message || "Gagal");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Gagal");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden animate-scaleIn">
        <div className="bg-white border-b border-gray-100 px-6 py-5 sm:py-6 flex items-start justify-between">
          <div className="flex-1">
            <p className="font-bold text-gray-900 text-base sm:text-lg">💰 Atur Bayaran</p>
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
            <p className="font-semibold text-sm text-gray-900 mb-3">⏱️ Durasi Lemburan</p>
            <p className="text-sm text-gray-700">
              <span className="font-bold text-lg text-gray-900">{hours} jam</span> × <span className="font-bold">{formatRupiah(Math.round(rate))}</span>/jam
            </p>
            <p className="text-2xl font-black text-gray-800 mt-3">
              {formatRupiah(Math.round(totalPay))}
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
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </>
            ) : (
              "✅ Simpan"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

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
    const dayName = days[now.getUTCDay()];
    const date = now.getUTCDate();
    const monthName = months[now.getUTCMonth()];
    const year = now.getUTCFullYear();
    const hours = String(now.getUTCHours()).padStart(2, "0");
    const minutes = String(now.getUTCMinutes()).padStart(2, "0");

    const watermarkText = `${date}-${monthName}-${year} (${dayName}) • ${hours}:${minutes} WIB`;

    const padding = 12;
    const fontSize = Math.max(16, canvas.width / 40);
    ctx.font = `bold ${fontSize}px Arial`;
    const textMetrics = ctx.measureText(watermarkText);
    const textWidth = textMetrics.width;
    const textHeight = fontSize;

    const bgX = padding;
    const bgY = canvas.height - textHeight - padding - 10;
    const bgWidth = textWidth + padding * 2;
    const bgHeight = textHeight + padding;

    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(bgX, bgY, bgWidth, bgHeight);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = 2;
    ctx.strokeRect(bgX, bgY, bgWidth, bgHeight);

    ctx.fillStyle = "white";
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textBaseline = "middle";
    ctx.fillText(watermarkText, bgX + padding, bgY + textHeight / 2 + padding / 2);

    canvas.toBlob((blob) => {
      if (blob) {
        const previewUrl = URL.createObjectURL(blob);
        callback(blob, previewUrl);
      }
    }, "image/jpeg", 0.95);
  };
  img.onerror = () => {
    console.error("Failed to load image");
  };
  img.src = imageDataUrl;
}

// ─── CompleteModal ────────────────────────────────────────────────────────
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

        const watermarkedFile = new File(
          [watermarkedBlob],
          file.name,
          { type: "image/jpeg" }
        );
        setPhotoFile(watermarkedFile);
      });

      setError("");
    };
    reader.readAsDataURL(file);
  };

  const upload = async () => {
    if (!photoFile) {
      setError("Pilih foto terlebih dahulu");
      return;
    }

    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", photoFile);

      const uploadRes = await fetch("/api/attendance/overtime/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const errorData = await uploadRes.json();
        throw new Error(errorData.message || "Upload gagal");
      }

      const uploadData = await uploadRes.json();
      const photoUrl = uploadData.url;

      const res = await fetch("/api/attendance/overtime", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: overtime.id,
          action: "COMPLETE",
          proof_photo_url: photoUrl,
        }),
      });

      const d = await res.json();
      if (!d.success) {
        setError(d.message || "Gagal menyimpan");
        return;
      }

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
          {isAutoCompleted && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="font-semibold text-sm text-gray-900 mb-1">⚡ Auto-Complete</p>
              <p className="text-sm text-gray-600">Lemburan ini selesai otomatis karena melewati waktu yang dijadwalkan.</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
              ⚠️ {error}
            </div>
          )}

          {isProcessing && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                <p className="text-sm font-semibold text-gray-700">Menambahkan tanggal pada foto...</p>
              </div>
            </div>
          )}

          {photoPreview ? (
            <div>
              <p className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-3">Foto Bukti</p>
              <img
                src={photoPreview}
                alt="Preview"
                className="w-full h-56 object-cover rounded-xl border border-gray-200"
              />
              <button
                onClick={() => {
                  setPhotoFile(null);
                  setPhotoPreview(null);
                }}
                className="mt-3 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors"
              >
                ↺ Ganti Foto
              </button>
            </div>
          ) : (
            <div>
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-3">
                Upload Foto Bukti
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:bg-gray-50 hover:border-gray-400 transition-all">
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
                  <p className="text-xs text-gray-500 mt-2">atau drag file ke sini</p>
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 bg-gray-50">
          <button
            onClick={onClose}
            className="flex-1 h-11 bg-white text-gray-700 rounded-lg text-sm font-semibold border border-gray-200 hover:bg-gray-50 transition-all"
          >
            Batal
          </button>
          <button
            onClick={upload}
            disabled={uploading || !photoFile || isProcessing}
            className="flex-1 h-11 bg-gray-800 text-white rounded-lg text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-900 transition-all flex items-center justify-center gap-2"
          >
            {uploading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </>
            ) : (
              "✅ Selesai"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OvertimePage() {
  const [overtimes, setOvertimes] = useState<OvertimeRequest[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState<string>("Semua");

  const [calendarMonth, setCalendarMonth] = useState<{ year: number; month: number }>({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
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

  useEffect(() => {
    getCurrentUserClient().then((u) => setCurrentUser(u));
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchOvertimes(), fetchAllUsers()]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const checkAutoComplete = setInterval(() => {
      const now = Date.now();
      overtimes.forEach((o) => {
        if (o.status === "ONGOING" && o.scheduled_end && new Date(o.scheduled_end).getTime() <= now && !o.actual_end) {
          handleAutoComplete(o);
        }
      });
    }, 30000);
    return () => clearInterval(checkAutoComplete);
  }, [overtimes]);

  const handleAutoComplete = async (overtime: OvertimeRequest) => {
    try {
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
        fetchOvertimes();
        setCompleteData(overtime);
      }
    } catch (err) {
      console.error("[AUTO-COMPLETE] Error:", err);
    }
  };

  const filtered = useMemo(() => {
    let result = overtimes;
    if (filterStatus !== "Semua") {
      result = result.filter((o) => o.status === filterStatus);
    }
    return result;
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

  const selectedOvertimes = selectedDate
    ? (byDate[selectedDate] || []).sort((a, b) =>
        (a.users?.name || "").localeCompare(b.users?.name || "", "id-ID")
      )
    : [];

  const statCards = [
    { label: "Total", value: overtimes.length, icon: "📋", color: "text-gray-700" },
    { label: "Pending", value: overtimes.filter((o) => o.status === "PENDING").length, icon: "⏳", color: "text-gray-700" },
    { label: "Ongoing", value: overtimes.filter((o) => o.status === "ONGOING").length, icon: "🟢", color: "text-gray-700" },
    { label: "Completed", value: overtimes.filter((o) => o.status === "COMPLETED").length, icon: "✅", color: "text-gray-700" },
  ];

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gradient-to-b from-white via-gray-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8 sm:space-y-10">
          {/* ══════ PREMIUM HEADER ══════ */}
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-gray-100 to-gray-50 rounded-3xl blur-2xl opacity-40" />
            <div className="relative flex items-start sm:items-center justify-between gap-4 flex-wrap">
              <div className="space-y-2 flex-1 min-w-0">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-gray-800 to-gray-700 flex items-center justify-center text-3xl shadow-lg flex-shrink-0">
                    ⏰
                  </div>
                  <div>
                    <h1 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight">Lemburan Karyawan</h1>
                    <p className="text-xs sm:text-sm text-gray-500 font-medium mt-1">
                      {loading ? "Memuat..." : `${overtimes.length} total lemburan bulan ini`}
                    </p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowRequestModal(true)}
                className="h-12 px-6 sm:px-8 bg-gradient-to-r from-gray-800 to-gray-900 hover:from-gray-900 hover:to-black text-white rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg hover:shadow-xl active:scale-95 whitespace-nowrap flex-shrink-0"
              >
                <span>📝</span>
                <span className="hidden sm:inline">Ajukan Lemburan</span>
              </button>
            </div>
          </div>

          {/* ══════ PREMIUM STAT CARDS ══════ */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {statCards.map((c) => (
              <div
                key={c.label}
                className="group relative bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-xl hover:border-gray-300 transition-all duration-300 p-6 sm:p-7 overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-gray-100 to-transparent rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative flex items-start justify-between mb-5">
                  <p className="text-[10px] sm:text-xs font-bold text-gray-500 uppercase tracking-widest">{c.label}</p>
                  <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center text-2xl group-hover:bg-gray-200 transition-colors duration-300 shadow-sm">{c.icon}</div>
                </div>
                <p className={`text-3xl sm:text-4xl font-black tracking-tight ${c.color} group-hover:text-gray-800 transition-colors duration-300`}>
                  {loading ? <span className="inline-block w-12 h-8 bg-gray-200 rounded-lg animate-pulse" /> : c.value}
                </p>
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-gray-800 via-gray-600 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </div>
            ))}
          </div>

          {/* ══════ PREMIUM CALENDAR ══════ */}
          <div className="bg-white rounded-3xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-6 sm:px-8 py-6 border-b border-gray-100 gap-4 bg-gradient-to-r from-gray-50 to-white">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center text-2xl shadow-md">📅</div>
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Kalender</p>
                  <p className="font-black text-gray-900 text-lg">
                    {MONTH_NAMES[calendarMonth.month]} {calendarMonth.year}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-gray-100 rounded-xl p-1.5 shadow-sm">
                <button
                  onClick={() =>
                    setCalendarMonth((m) => ({
                      ...m,
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
                      ...m,
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
                  <div key={d} className="text-center text-xs sm:text-sm font-bold text-gray-400 py-3 uppercase tracking-wider">
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-2 min-w-full">
                {calDays.map((day, idx) => {
                  if (!day) return <div key={`empty-${idx}`} />;

                  const dk = `${calendarMonth.year}-${pad2(calendarMonth.month + 1)}-${pad2(day)}`;
                  const dayOvertimes = byDate[dk] || [];
                  const total = dayOvertimes.length;
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
                      <span className={`text-xl sm:text-2xl font-black mb-2 transition-colors ${isSel ? "text-white" : "text-gray-800 group-hover:text-gray-900"}`}>
                        {day}
                      </span>

                      {total > 0 && (
                        <div className={`text-[10px] sm:text-xs font-bold rounded-full px-2.5 py-1 ${isSel ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600 group-hover:bg-gray-200"}`}>
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
                  <p className="text-xs text-gray-500 mt-1 font-medium">{selectedOvertimes.length} lemburan tercatat</p>
                </div>
                <button
                  onClick={() => setSelectedDate(null)}
                  className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all flex-shrink-0"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {selectedOvertimes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 sm:py-20">
                  <div className="text-6xl sm:text-7xl mb-4 opacity-40">📭</div>
                  <p className="text-sm text-gray-500 font-medium">Tidak ada lemburan pada tanggal ini</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/80">
                        <th className="px-4 sm:px-6 py-4 text-left font-bold text-gray-600 uppercase tracking-wider text-[10px] sm:text-xs">Karyawan</th>
                        <th className="px-3 sm:px-4 py-4 text-left font-bold text-gray-600 uppercase tracking-wider text-[10px] sm:text-xs">Waktu</th>
                        <th className="px-3 sm:px-4 py-4 text-left font-bold text-gray-600 uppercase tracking-wider text-[10px] sm:text-xs">Status</th>
                        <th className="px-3 sm:px-4 py-4 text-right font-bold text-gray-600 uppercase tracking-wider text-[10px] sm:text-xs">Bayaran</th>
                        <th className="px-3 sm:px-4 py-4 text-center font-bold text-gray-600 uppercase tracking-wider text-[10px] sm:text-xs">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {selectedOvertimes.map((o) => (
                        <tr key={o.id} className="hover:bg-gray-50/80 transition-colors duration-200">
                          <td className="px-4 sm:px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-[9px] sm:text-xs font-black flex-shrink-0 shadow-md">
                                {initials(o.users?.name || "??")}
                              </div>
                              <div>
                                <p className="font-bold text-gray-800 truncate text-xs sm:text-sm">{o.users?.name}</p>
                                <p className="text-[9px] text-gray-400 mt-0.5">{o.users?.role?.replace(/_/g, " ")}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 sm:px-4 py-4 text-xs sm:text-sm">
                            <span className="font-mono font-bold text-gray-700">
                              {formatTime(o.scheduled_start)} – {formatTime(o.scheduled_end)}
                            </span>
                          </td>
                          <td className="px-3 sm:px-4 py-4">
                            <span className={`inline-flex text-[8px] sm:text-xs font-bold px-3 py-1.5 rounded-full border backdrop-blur ${
                              o.status === "PENDING" ? "bg-gray-100 text-gray-700 border-gray-200" :
                              o.status === "APPROVED" ? "bg-gray-100 text-gray-700 border-gray-200" :
                              o.status === "ONGOING" ? "bg-gray-100 text-gray-700 border-gray-200" :
                              "bg-gray-100 text-gray-700 border-gray-200"
                            }`}>
                              {o.status === "PENDING" ? "⏳" : o.status === "APPROVED" ? "✅" : o.status === "ONGOING" ? "🟢" : o.status === "COMPLETED" ? "🏁" : "❌"} {o.status}
                            </span>
                          </td>
                          <td className="px-3 sm:px-4 py-4 text-right">
                            {o.total_pay ? (
                              <span className="font-bold text-gray-800 text-xs sm:text-sm">
                                {formatRupiah(o.total_pay)}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300 font-medium">—</span>
                            )}
                          </td>
                          <td className="px-3 sm:px-4 py-4 text-center">
                            <div className="flex justify-center gap-1.5 flex-wrap">
                              {isAdminRole(currentUser?.role) && (
                                <>
                                  {o.status === "PENDING" && (
                                    <button
                                      onClick={() => setApproveData(o)}
                                      className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-900 text-white transition-all active:scale-95 whitespace-nowrap shadow-sm"
                                    >
                                      ✅ Setujui
                                    </button>
                                  )}
                                  {o.status === "ONGOING" && !o.actual_end && !o.rate_per_hour && (
                                    <button
                                      onClick={() => setSetPayData(o)}
                                      className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-900 text-white transition-all active:scale-95 whitespace-nowrap shadow-sm"
                                    >
                                      💰 Bayar
                                    </button>
                                  )}
                                  {o.status === "COMPLETED" && o.proof_photo_url && (
                                    <button
                                      onClick={() => setProofPhotoData(o)}
                                      className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-900 text-white transition-all active:scale-95 whitespace-nowrap shadow-sm"
                                    >
                                      👁️ Lihat
                                    </button>
                                  )}
                                </>
                              )}

                              {!isAdminRole(currentUser?.role) && currentUser?.id === o.user_id && (
                                <>
                                  {o.status === "APPROVED" && !o.actual_start && (
                                    <button
                                      onClick={() => setStartData(o)}
                                      className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-900 text-white transition-all active:scale-95 whitespace-nowrap shadow-sm"
                                    >
                                      🟢 Mulai
                                    </button>
                                  )}
                                  {o.status === "ONGOING" && !o.actual_end && o.rate_per_hour && (
                                    <button
                                      onClick={() => setCompleteData(o)}
                                      className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-900 text-white transition-all active:scale-95 whitespace-nowrap shadow-sm"
                                    >
                                      🏁 Selesai
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
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
                      {s === "PENDING" ? "⏳ Pending" :
                       s === "APPROVED" ? "✅ Disetujui" :
                       s === "ONGOING" ? "🟢 Berjalan" :
                       s === "COMPLETED" ? "🏁 Selesai" :
                       s === "REJECTED" ? "❌ Ditolak" : "Semua"}
                    </button>
                  ))}
                </div>
              </div>

              {loading ? (
                <div className="p-6 sm:p-8 space-y-3">
                  {Array(3).fill(0).map((_, i) => (
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
                        <th className="px-4 sm:px-6 py-4 text-left font-bold text-gray-600 uppercase tracking-wider text-[10px] sm:text-xs">Karyawan</th>
                        <th className="px-3 sm:px-4 py-4 text-left font-bold text-gray-600 uppercase tracking-wider text-[10px] sm:text-xs">Tanggal</th>
                        <th className="px-3 sm:px-4 py-4 text-left font-bold text-gray-600 uppercase tracking-wider text-[10px] sm:text-xs">Waktu</th>
                        <th className="px-3 sm:px-4 py-4 text-left font-bold text-gray-600 uppercase tracking-wider text-[10px] sm:text-xs">Status</th>
                        <th className="px-3 sm:px-4 py-4 text-right font-bold text-gray-600 uppercase tracking-wider text-[10px] sm:text-xs">Bayaran</th>
                        <th className="px-3 sm:px-4 py-4 text-center font-bold text-gray-600 uppercase tracking-wider text-[10px] sm:text-xs">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filtered.map((o) => (
                        <tr key={o.id} className="hover:bg-gray-50/80 transition-colors duration-200">
                          <td className="px-4 sm:px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-[9px] sm:text-xs font-black flex-shrink-0 shadow-md">
                                {initials(o.users?.name || "??")}
                              </div>
                              <div>
                                <p className="font-bold text-gray-800 truncate text-xs sm:text-sm">{o.users?.name}</p>
                                <p className="text-[9px] text-gray-400 mt-0.5">{o.users?.role?.replace(/_/g, " ")}</p>
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
                              {formatTime(o.scheduled_start)} – {formatTime(o.scheduled_end)}
                            </span>
                          </td>
                          <td className="px-3 sm:px-4 py-4">
                            <span className="inline-flex text-[8px] sm:text-xs font-bold px-3 py-1.5 rounded-full border bg-gray-100 text-gray-700 border-gray-200">
                              {o.status === "PENDING" ? "⏳" : o.status === "APPROVED" ? "✅" : o.status === "ONGOING" ? "🟢" : o.status === "COMPLETED" ? "🏁" : "❌"} {o.status}
                            </span>
                          </td>
                          <td className="px-3 sm:px-4 py-4 text-right">
                            {o.total_pay ? (
                              <span className="font-bold text-gray-800 text-xs sm:text-sm">
                                {formatRupiah(o.total_pay)}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300 font-medium">—</span>
                            )}
                          </td>
                          <td className="px-3 sm:px-4 py-4 text-center">
                            <div className="flex justify-center gap-1.5 flex-wrap">
                              {isAdminRole(currentUser?.role) && (
                                <>
                                  {o.status === "PENDING" && (
                                    <button
                                      onClick={() => setApproveData(o)}
                                      className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-900 text-white transition-all active:scale-95 whitespace-nowrap shadow-sm"
                                    >
                                      ✅ Setujui
                                    </button>
                                  )}
                                  {o.status === "ONGOING" && !o.actual_end && !o.rate_per_hour && (
                                    <button
                                      onClick={() => setSetPayData(o)}
                                      className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-900 text-white transition-all active:scale-95 whitespace-nowrap shadow-sm"
                                    >
                                      💰 Bayar
                                    </button>
                                  )}
                                  {o.status === "COMPLETED" && o.proof_photo_url && (
                                    <button
                                      onClick={() => setProofPhotoData(o)}
                                      className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-900 text-white transition-all active:scale-95 whitespace-nowrap shadow-sm"
                                    >
                                      👁️ Lihat
                                    </button>
                                  )}
                                </>
                              )}

                              {!isAdminRole(currentUser?.role) && currentUser?.id === o.user_id && (
                                <>
                                  {o.status === "APPROVED" && !o.actual_start && (
                                    <button
                                      onClick={() => setStartData(o)}
                                      className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-900 text-white transition-all active:scale-95 whitespace-nowrap shadow-sm"
                                    >
                                      🟢 Mulai
                                    </button>
                                  )}
                                  {o.status === "ONGOING" && !o.actual_end && o.rate_per_hour && (
                                    <button
                                      onClick={() => setCompleteData(o)}
                                      className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-900 text-white transition-all active:scale-95 whitespace-nowrap shadow-sm"
                                    >
                                      🏁 Selesai
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
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

      {/* ── Modals ── */}
      {showRequestModal && (
        <RequestOvertimeModal
          onClose={() => setShowRequestModal(false)}
          onSaved={() => { fetchOvertimes(); setShowRequestModal(false); }}
          currentUser={currentUser}
        />
      )}
      {approveData && (
        <ApproveModal
          overtime={approveData}
          onClose={() => setApproveData(null)}
          onSaved={() => { fetchOvertimes(); setApproveData(null); }}
        />
      )}
      {startData && (
        <StartModal
          overtime={startData}
          onClose={() => setStartData(null)}
          onSaved={() => { fetchOvertimes(); setStartData(null); }}
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

      <style jsx>{`
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-scaleIn { animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
      `}</style>
    </DashboardLayout>
  );
}