"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { getCurrentUserClient } from "@/lib/auth-client";
import DashboardLayout from "@/components/layout/DashboardLayout";

// ─── Types ────────────────────────────────────────────────────────────────────
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
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
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

  // Handle TIME format (HH:mm:ss)
  if (iso.includes(":") && !iso.includes("T")) {
    return iso.substring(0, 5); // Return HH:mm
  }

  // Handle TIMESTAMP format
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
  if (!overtime.proof_photo_url) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden animate-scaleIn">
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-5 sm:py-6 flex items-start justify-between">
          <div className="flex-1">
            <p className="font-bold text-white text-base sm:text-lg">👁️ Bukti Lemburan</p>
            <p className="text-xs text-white/80 mt-2">{overtime.users?.name}</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/20 transition-all flex-shrink-0 ml-2"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="px-6 py-6 space-y-5 max-h-[85vh] overflow-y-auto">
          {/* Foto Bukti */}
          <div>
            <p className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-3">
              Foto Bukti
            </p>
            <img
              src={overtime.proof_photo_url}
              alt="Bukti Lemburan"
              className="w-full rounded-lg border border-gray-200 shadow-sm"
            />
            <p className="text-[10px] text-gray-400 mt-2">
              💡 Tanggal upload tercantum di bawah kiri foto
            </p>
          </div>

          {/* Info Lemburan */}
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 rounded-lg p-4">
            <p className="font-semibold text-sm text-purple-900 mb-3">📋 Info Lemburan</p>
            <div className="space-y-2 text-sm text-purple-700">
              <div>
                <span className="font-medium">Karyawan:</span>{" "}
                <span className="font-bold">{overtime.users?.name}</span>
              </div>
              <div>
                <span className="font-medium">Tanggal:</span>{" "}
                <span className="font-bold">
                  {new Date(overtime.request_date).toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              </div>
              <div>
                <span className="font-medium">Waktu:</span>{" "}
                <span className="font-bold">
                  {formatTime(overtime.scheduled_start)} – {formatTime(overtime.scheduled_end)}
                </span>
              </div>
              <div>
                <span className="font-medium">Status:</span>{" "}
                <span
                  className={`font-bold px-2 py-1 rounded text-xs ${overtime.status === "COMPLETED"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-700"
                    }`}
                >
                  {overtime.status === "COMPLETED" ? "✅ Selesai" : overtime.status}
                </span>
              </div>
              {overtime.total_pay && (
                <div>
                  <span className="font-medium">Bayaran:</span>{" "}
                  <span className="font-bold">{formatRupiah(overtime.total_pay)}</span>
                </div>
              )}
              {overtime.work_description && (
                <div>
                  <span className="font-medium block mb-1">Deskripsi Pekerjaan:</span>
                  <p className="text-sm text-purple-600 bg-white/50 p-2 rounded">
                    {overtime.work_description}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Waktu Upload */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-3">
              ⏰ Informasi Dokumentasi
            </p>
            <div className="space-y-2 text-sm text-gray-700">
              <div className="flex items-center gap-2">
                <span className="font-medium">📅 Tanggal Diupload:</span>
                <span className="font-bold font-mono">
                  {(() => {
                    const uploadDate = new Date();
                    const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
                    const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
                    const dayName = days[uploadDate.getDay()];
                    const dateNum = String(uploadDate.getDate()).padStart(2, "0");
                    const monthName = months[uploadDate.getMonth()];
                    const year = uploadDate.getFullYear();
                    const hours = String(uploadDate.getHours()).padStart(2, "0");
                    const minutes = String(uploadDate.getMinutes()).padStart(2, "0");

                    return `${dateNum}-${monthName}-${year} (${dayName}) • ${hours}:${minutes} WIB`;
                  })()}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 italic">
                ✓ Tanggal dan waktu sudah ditambahkan di watermark foto
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 bg-gray-50">
          <button
            onClick={onClose}
            className="flex-1 h-12 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg text-sm font-bold hover:shadow-lg active:scale-[0.98] transition-all"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ApproveModal ──────────────────────────────────────────────────────────────
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
    overtime.requested_start || "09:00"
  );
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

      console.log("📤 Mengirim ke API:", {
        id: overtime.id,
        action: "APPROVE",
        scheduled_start: startFmt,
        scheduled_end: endFmt,
      });

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
        console.error("❌ API Error:", d.message || res.statusText);
        setError(d.message || `Error ${res.status}: Gagal disetujui`);
        return;
      }

      console.log("✅ Berhasil disetujui!");
      onSaved();
      onClose();
    } catch (err: any) {
      console.error("❌ Error:", err);
      setError(err.message || "Gagal disetujui");
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden animate-scaleIn">
        <div className="bg-gradient-to-r from-emerald-600 to-green-600 px-6 py-5 sm:py-6 flex items-start justify-between">
          <div className="flex-1">
            <p className="font-bold text-white text-base sm:text-lg">✅ Setujui Lemburan</p>
            <p className="text-xs text-white/80 mt-2">{overtime.users?.name}</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/20 transition-all flex-shrink-0 ml-2"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="px-6 py-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
              ⚠️ {error}
            </div>
          )}

          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            <p className="font-semibold text-sm text-emerald-900 mb-2">📋 Info Pengajuan</p>
            <div className="text-sm text-emerald-700 space-y-1">
              <p>
                <span className="font-medium">Tanggal:</span>{" "}
                {new Date(overtime.request_date).toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
              <p>
                <span className="font-medium">Alasan:</span> {overtime.reason || "-"}
              </p>
              <p>
                <span className="font-medium">Jam yang diminta:</span>{" "}
                {formatTime(overtime.requested_start)}
              </p>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-3">
              Jam Mulai Lembur <span className="text-red-500">*</span>
            </label>
            <input
              type="time"
              value={scheduledStart}
              onChange={(e) => setScheduledStart(e.target.value)}
              className="w-full h-12 border border-gray-200 rounded-lg px-4 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white transition-all"
            />
            <p className="text-xs text-gray-500 mt-2">Set jam mulai yang disetujui</p>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-3">
              Jam Selesai Lembur <span className="text-red-500">*</span>
            </label>
            <input
              type="time"
              value={scheduledEnd}
              onChange={(e) => setScheduledEnd(e.target.value)}
              className="w-full h-12 border border-gray-200 rounded-lg px-4 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white transition-all"
            />
            <p className="text-xs text-gray-500 mt-2">Set jam selesai yang disetujui</p>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="font-semibold text-sm text-amber-900 mb-2">💡 Tips Persetujuan</p>
            <ul className="text-xs text-amber-700 space-y-1">
              <li>• Tentukan jam mulai dan selesai dengan jelas</li>
              <li>• Pastikan durasi lembur wajar (minimal 1 jam)</li>
              <li>• Karyawan bisa mulai kerja setelah approval ini</li>
            </ul>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 bg-gray-50">
          <button
            onClick={onClose}
            className="flex-1 h-12 bg-white text-gray-700 rounded-lg text-sm font-semibold border border-gray-200 hover:bg-gray-50 active:bg-gray-100 transition-all"
          >
            Batal
          </button>
          <button
            onClick={approve}
            disabled={approving || !scheduledStart || !scheduledEnd}
            className="flex-1 h-12 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-lg text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2"
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

// ─── RequestOvertimeModal ──────────────────────────────────────────────────────
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
      setError("Jelaskan alasan pengajuan lembur");
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
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-5 sm:py-6 flex items-start justify-between">
          <div className="flex-1">
            <p className="font-bold text-white text-base sm:text-lg">📝 Ajukan Lemburan</p>
            <p className="text-xs text-white/80 mt-2">{currentUser?.name || "Karyawan"}</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/20 transition-all flex-shrink-0 ml-2"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
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
              className="w-full h-12 border border-gray-200 rounded-lg px-4 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:bg-white transition-all"
            />
            <p className="text-xs text-gray-500 mt-2">Pilih tanggal kapan Anda ingin lembur</p>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-3">
              Jam Mulai <span className="text-red-500">*</span>
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full h-12 border border-gray-200 rounded-lg px-4 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:bg-white transition-all"
            />
            <p className="text-xs text-gray-500 mt-2">Jam berapa Anda mulai lembur?</p>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-3">
              Alasan Lembur <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Contoh: Menyelesaikan project urgent, backup database, maintenance server, dll..."
              rows={4}
              className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:bg-white transition-all resize-none"
            />
            <p className="text-xs text-gray-500 mt-2">Jelaskan mengapa Anda perlu lembur</p>
          </div>

          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <p className="font-semibold text-sm text-purple-900 mb-2">💡 Tips Pengajuan</p>
            <ul className="text-xs text-purple-700 space-y-1">
              <li>• Ajukan minimal 1 hari sebelumnya jika memungkinkan</li>
              <li>• Jelaskan dengan detail mengapa perlu lembur</li>
              <li>• Waktu yang diminta akan diproses oleh atasan Anda</li>
            </ul>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 bg-gray-50">
          <button
            onClick={onClose}
            className="flex-1 h-12 bg-white text-gray-700 rounded-lg text-sm font-semibold border border-gray-200 hover:bg-gray-50 active:bg-gray-100 transition-all"
          >
            Batal
          </button>
          <button
            onClick={submit}
            disabled={submitting || !requestDate || !startTime || !reason.trim()}
            className="flex-1 h-12 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2"
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

// ─── StartModal ────────────────────────────────────────────────────────────────
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
        <div className="bg-gradient-to-r from-orange-600 to-amber-600 px-6 py-5 sm:py-6 flex items-start justify-between">
          <div className="flex-1">
            <p className="font-bold text-white text-base sm:text-lg">🟢 Mulai Lemburan</p>
            <p className="text-xs text-white/80 mt-2">{overtime.users?.name}</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/20 transition-all flex-shrink-0 ml-2"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
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
              placeholder="Contoh: Maintenance sistem database, backup data, update server..."
              rows={4}
              className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all resize-none"
            />
            <p className="text-xs text-gray-500 mt-2">
              Jelaskan apa yang akan dikerjakan selama lemburan
            </p>
          </div>

          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <p className="font-semibold text-sm text-orange-900 mb-3">⏱️ Waktu Lemburan</p>
            <div className="space-y-2 text-orange-700">
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
            className="flex-1 h-12 bg-white text-gray-700 rounded-lg text-sm font-semibold border border-gray-200 hover:bg-gray-50 active:bg-gray-100 transition-all"
          >
            Batal
          </button>
          <button
            onClick={save}
            disabled={saving || !description.trim()}
            className="flex-1 h-12 bg-gradient-to-r from-orange-600 to-amber-600 text-white rounded-lg text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span className="hidden sm:inline">Menyimpan</span>
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

// ─── SetPayModal ────────────────────────────────────────────────────────────────
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
        <div className="bg-gradient-to-r from-emerald-600 to-green-600 px-6 py-5 sm:py-6 flex items-start justify-between">
          <div className="flex-1">
            <p className="font-bold text-white text-base sm:text-lg">💰 Atur Bayaran</p>
            <p className="text-xs text-white/80 mt-2">{overtime.users?.name}</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/20 transition-all flex-shrink-0 ml-2"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="px-6 py-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
              ⚠️ {error}
            </div>
          )}

          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            <p className="font-semibold text-sm text-emerald-900 mb-3">⏱️ Durasi Lemburan</p>
            <p className="text-sm text-emerald-700">
              <span className="font-bold text-lg text-emerald-900">{hours} jam</span> ×{" "}
              <span className="font-bold">{formatRupiah(Math.round(rate))}</span>/jam
            </p>
            <p className="text-2xl font-black text-emerald-700 mt-3">
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
                className="w-full h-12 border border-gray-200 rounded-lg pl-11 pr-4 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white font-mono transition-all"
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 bg-gray-50">
          <button
            onClick={onClose}
            className="flex-1 h-12 bg-white text-gray-700 rounded-lg text-sm font-semibold border border-gray-200 hover:bg-gray-50 active:bg-gray-100 transition-all"
          >
            Batal
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 h-12 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-lg text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span className="hidden sm:inline">Menyimpan</span>
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

// ─── Helper: Add watermark to image ───────────────────────────────────────
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

    // Draw original image
    ctx.drawImage(img, 0, 0);

    // Format tanggal Indonesia dengan WIB
    const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const months = [
      "Januari", "Februari", "Maret", "April", "Mei", "Juni",
      "Juli", "Agustus", "September", "Oktober", "November", "Desember",
    ];
    const dayName = days[now.getUTCDay()];
    const date = now.getUTCDate();
    const monthName = months[now.getUTCMonth()];
    const year = now.getUTCFullYear();
    const hours = String(now.getUTCHours()).padStart(2, "0");
    const minutes = String(now.getUTCMinutes()).padStart(2, "0");

    const watermarkText = `${date}-${monthName}-${year} (${dayName}) • ${hours}:${minutes} WIB`;

    // Add semi-transparent background for watermark
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

    // ✅ Pass blob directly + preview URL
    canvas.toBlob((blob) => {
      if (blob) {
        const previewUrl = URL.createObjectURL(blob);
        callback(blob, previewUrl);
      }
    }, "image/jpeg", 0.95);
  };
  img.onerror = () => {
    console.error("Failed to load image for watermarking");
  };
  img.src = imageDataUrl;
}

// ─── CompleteModal ────────────────────────────────────────────────────────────────
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

      // ✅ FIX: Pass blob directly + preview URL
      addWatermarkToImage(imageDataUrl, (watermarkedBlob, previewUrl) => {
        setPhotoPreview(previewUrl);
        setIsProcessing(false);

        // ✅ Create File directly from blob
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
      console.error("Upload error:", err);
      setError(err.message || "Gagal upload");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden animate-scaleIn">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 sm:py-6 flex items-start justify-between">
          <div className="flex-1">
            <p className="font-bold text-white text-base sm:text-lg">🏁 Selesaikan Lemburan</p>
            <p className="text-xs text-white/80 mt-2">{overtime.users?.name}</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/20 transition-all flex-shrink-0 ml-2"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="px-6 py-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {isAutoCompleted && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="font-semibold text-sm text-amber-900 mb-1">⚡ Auto-Complete</p>
              <p className="text-sm text-amber-700">
                Lemburan ini di-auto complete karena sudah melewati waktu yang dijadwalkan.
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
              ⚠️ {error}
            </div>
          )}

          {isProcessing && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                <p className="text-sm font-semibold text-blue-700">
                  Menambahkan tanggal pada foto...
                </p>
              </div>
            </div>
          )}

          {photoPreview ? (
            <div>
              <p className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-3">
                Foto Bukti (Dengan Tanggal)
              </p>
              <img
                src={photoPreview}
                alt="Preview"
                className="w-full h-56 object-cover rounded-lg border border-gray-200"
              />
              <p className="text-[10px] text-gray-400 mt-2">
                ✓ Tanggal sudah ditambahkan di bawah kiri foto
              </p>
              <button
                onClick={() => {
                  setPhotoFile(null);
                  setPhotoPreview(null);
                }}
                className="mt-3 text-sm font-semibold text-red-600 hover:text-red-700 transition-colors"
              >
                ↺ Ganti Foto
              </button>
            </div>
          ) : (
            <div>
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-3">
                Upload Foto Bukti
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:bg-gray-50 hover:border-gray-400 transition-all">
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
                  <p className="text-[10px] text-blue-600 mt-2 font-medium">
                    Tanggal otomatis ditambahkan saat upload
                  </p>
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 bg-gray-50">
          <button
            onClick={onClose}
            className="flex-1 h-12 bg-white text-gray-700 rounded-lg text-sm font-semibold border border-gray-200 hover:bg-gray-50 active:bg-gray-100 transition-all"
          >
            Batal
          </button>
          <button
            onClick={upload}
            disabled={uploading || !photoFile || isProcessing}
            className="flex-1 h-12 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            {uploading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span className="hidden sm:inline">Mengunggah</span>
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

// ─── Main Component ────────────────────────────────────────────────────────────
export default function OvertimePage() {
  const [overtimes, setOvertimes] = useState<OvertimeRequest[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState<string>("Semua");
  const [filterUser, setFilterUser] = useState<string>("Semua");

  const [calendarMonth, setCalendarMonth] = useState<{
    year: number;
    month: number;
  }>({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Modal state
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [startData, setStartData] = useState<OvertimeRequest | null>(null);
  const [setPayData, setSetPayData] = useState<OvertimeRequest | null>(null);
  const [completeData, setCompleteData] = useState<OvertimeRequest | null>(null);
  const [approveData, setApproveData] = useState<OvertimeRequest | null>(null);
  const [proofPhotoData, setProofPhotoData] = useState<OvertimeRequest | null>(null);

  // Fetchers
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
    Promise.all([fetchOvertimes(), fetchAllUsers()]).finally(() =>
      setLoading(false)
    );
  }, []);

  useEffect(() => {
    const checkAutoComplete = setInterval(() => {
      const now = Date.now();

      overtimes.forEach((o) => {
        if (
          o.status === "ONGOING" &&
          o.scheduled_end &&
          new Date(o.scheduled_end).getTime() <= now &&
          !o.actual_end
        ) {
          console.log(
            `[AUTO-COMPLETE] Overtime ${o.id} scheduled_end reached, auto-triggering complete`
          );

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
        console.log("[AUTO-COMPLETE] Success");
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

    if (filterUser !== "Semua") {
      result = result.filter((o) => o.users?.name === filterUser);
    }

    return result;
  }, [overtimes, filterStatus, filterUser]);

  const uniqueUsers = useMemo(
    () =>
      [
        ...new Set(
          allUsers.length > 0
            ? allUsers.map((u) => u.name)
            : overtimes.map((o) => o.users?.name || "Unknown")
        ),
      ].sort(),
    [allUsers, overtimes]
  );

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
    thisMonthOvertimes.forEach((o) => {
      const k = toWIBDateKey(o.request_date);
      if (!m[k]) m[k] = [];
      m[k].push(o);
    });
    return m;
  }, [thisMonthOvertimes]);

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
  }, [calendarMonth.year, calendarMonth.month]);

  const todayKey = getWIBToday();

  const selectedOvertimes = selectedDate
    ? (byDate[selectedDate] || []).sort((a, b) =>
      (a.users?.name || "").localeCompare(b.users?.name || "", "id-ID")
    )
    : [];

  const statCards = [
    {
      label: "Total",
      value: overtimes.length,
      icon: "📋",
      gradient: "from-slate-50 to-slate-100",
      iconBg: "bg-slate-200",
      textColor: "text-slate-700",
    },
    {
      label: "Pending",
      value: overtimes.filter((o) => o.status === "PENDING").length,
      icon: "⏳",
      gradient: "from-amber-50 to-orange-100",
      iconBg: "bg-amber-200",
      textColor: "text-amber-700",
    },
    {
      label: "Ongoing",
      value: overtimes.filter((o) => o.status === "ONGOING").length,
      icon: "🟢",
      gradient: "from-green-50 to-emerald-100",
      iconBg: "bg-green-200",
      textColor: "text-green-700",
    },
    {
      label: "Completed",
      value: overtimes.filter((o) => o.status === "COMPLETED").length,
      icon: "✅",
      gradient: "from-blue-50 to-indigo-100",
      iconBg: "bg-blue-200",
      textColor: "text-blue-700",
    },
  ];

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6 sm:space-y-8 animate-fadeIn">
          {/* ── Header ── */}
          <div className="flex items-start sm:items-center justify-between gap-4 flex-wrap">
            <div className="space-y-2 flex-1 min-w-0">
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
                <span className="bg-gradient-to-r from-orange-600 via-amber-500 to-orange-600 bg-clip-text text-transparent">
                  Lemburan Karyawan
                </span>
              </h1>
              <p className="text-sm text-gray-500 font-medium">
                {loading ? "Memuat..." : `${overtimes.length} total lemburan`}
              </p>
            </div>
            <button
              onClick={() => setShowRequestModal(true)}
              className="h-12 px-6 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-bold flex items-center gap-2 hover:shadow-lg active:scale-95 transition-all whitespace-nowrap flex-shrink-0"
            >
              <span>📝</span>
              <span className="hidden sm:inline">Ajukan Lemburan</span>
              <span className="sm:hidden text-lg">+</span>
            </button>
          </div>

          {/* ── Stat Cards ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {statCards.map((c) => (
              <div
                key={c.label}
                className={`bg-gradient-to-br ${c.gradient} rounded-xl sm:rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 p-4 sm:p-6 border border-white/50`}
              >
                <div className="flex items-start justify-between mb-3 sm:mb-4">
                  <p className="text-[10px] sm:text-xs font-bold text-gray-600 uppercase tracking-wider">
                    {c.label}
                  </p>
                  <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg ${c.iconBg} flex items-center justify-center shadow-sm`}>
                    <span className="text-base sm:text-lg">{c.icon}</span>
                  </div>
                </div>
                <p className={`text-2xl sm:text-3xl font-black tracking-tight ${c.textColor}`}>
                  {loading ? (
                    <span className="inline-block w-8 h-6 bg-white/50 rounded animate-pulse" />
                  ) : (
                    c.value
                  )}
                </p>
              </div>
            ))}
          </div>

          {/* ════ CALENDAR VIEW ════ */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-5 sm:px-6 py-4 sm:py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white gap-3">
              <div className="flex items-center gap-2 sm:gap-3">
                <span className="text-lg sm:text-xl font-bold text-gray-800 tracking-tight">
                  📅
                </span>
                <span className="font-bold text-gray-800 tracking-tight">
                  {MONTH_NAMES[calendarMonth.month]} {calendarMonth.year}
                </span>
              </div>
              <div className="flex items-center gap-1 ml-auto sm:ml-0">
                <button
                  onClick={() =>
                    setCalendarMonth((m) => ({
                      ...m,
                      month: m.month === 0 ? 11 : m.month - 1,
                      year: m.month === 0 ? m.year - 1 : m.year,
                    }))
                  }
                  className="w-9 h-9 rounded-lg hover:bg-gray-100 transition-all active:scale-95 flex items-center justify-center"
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
                  className="w-9 h-9 rounded-lg hover:bg-gray-100 transition-all active:scale-95 flex items-center justify-center"
                >
                  ▶
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-6 overflow-x-auto">
              <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-3 sm:mb-4 min-w-full">
                {DAY_NAMES.map((d) => (
                  <div
                    key={d}
                    className="text-center text-xs sm:text-sm font-bold text-gray-400 py-2 sm:py-3"
                  >
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1 sm:gap-2 min-w-full">
                {calDays.map((day, idx) => {
                  if (!day) return <div key={`empty-${idx}`} />;

                  const dk = `${calendarMonth.year}-${pad2(
                    calendarMonth.month + 1
                  )}-${pad2(day)}`;
                  const dayOvertimes = byDate[dk] || [];
                  const pending = dayOvertimes.filter(
                    (o) => o.status === "PENDING"
                  ).length;
                  const approved = dayOvertimes.filter(
                    (o) => o.status === "APPROVED"
                  ).length;
                  const ongoing = dayOvertimes.filter(
                    (o) => o.status === "ONGOING"
                  ).length;
                  const completed = dayOvertimes.filter(
                    (o) => o.status === "COMPLETED"
                  ).length;
                  const total = dayOvertimes.length;
                  const isSel = dk === selectedDate;

                  return (
                    <button
                      key={day}
                      onClick={() =>
                        setSelectedDate(selectedDate === dk ? null : dk)
                      }
                      className={`flex flex-col items-start justify-start p-2 sm:p-3 rounded-lg min-h-[70px] sm:min-h-[90px] border-2 transition-all text-left ${isSel
                        ? "bg-gradient-to-br from-orange-50 to-amber-50 border-orange-300 ring-2 ring-orange-200/50 shadow-md"
                        : total > 0
                          ? "bg-gray-50 border-gray-200 hover:bg-gray-100 hover:border-gray-300"
                          : "bg-white border-gray-100 hover:bg-gray-50"
                        }`}
                    >
                      <span
                        className={`text-sm sm:text-base font-black mb-1.5 sm:mb-2 ${isSel ? "text-orange-600" : "text-gray-800"
                          }`}
                      >
                        {day}
                      </span>

                      {total > 0 && (
                        <div className="space-y-0.5 w-full text-[8px] sm:text-[9px]">
                          {pending > 0 && (
                            <span className="font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded block">
                              ⏳ {pending}
                            </span>
                          )}
                          {approved > 0 && (
                            <span className="font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded block">
                              ✅ {approved}
                            </span>
                          )}
                          {ongoing > 0 && (
                            <span className="font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded block">
                              🟢 {ongoing}
                            </span>
                          )}
                          {completed > 0 && (
                            <span className="font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded block">
                              🏁 {completed}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Selected Date Details ── */}
          {selectedDate && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-in fade-in duration-300">
              <div className="px-5 sm:px-6 py-4 sm:py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white flex items-start sm:items-center justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="text-lg sm:text-xl font-bold text-gray-800 truncate">
                    {new Date(selectedDate + "T12:00:00").toLocaleDateString(
                      "id-ID",
                      {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      }
                    )}
                  </p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {selectedOvertimes.filter((o) => o.status === "PENDING")
                      .length > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-bold text-amber-700 bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-full">
                          ⏳{" "}
                          {
                            selectedOvertimes.filter((o) => o.status === "PENDING")
                              .length
                          }
                        </span>
                      )}
                    {selectedOvertimes.filter((o) => o.status === "ONGOING")
                      .length > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-bold text-green-700 bg-green-100 border border-green-200 px-2.5 py-1 rounded-full">
                          🟢{" "}
                          {
                            selectedOvertimes.filter((o) => o.status === "ONGOING")
                              .length
                          }
                        </span>
                      )}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedDate(null)}
                  className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all flex-shrink-0"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
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
                <div className="flex flex-col items-center justify-center py-12 sm:py-16">
                  <div className="text-4xl sm:text-5xl mb-3">📭</div>
                  <p className="text-sm text-gray-400">Tidak ada lemburan</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <th className="px-4 sm:px-6 py-3 sm:py-4 text-left font-bold text-gray-600 uppercase tracking-wide">
                          Karyawan
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 text-left font-bold text-gray-600 uppercase tracking-wide">
                          Waktu
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 text-left font-bold text-gray-600 uppercase tracking-wide">
                          Status
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 text-right font-bold text-gray-600 uppercase tracking-wide">
                          Bayaran
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 text-center font-bold text-gray-600 uppercase tracking-wide">
                          Aksi
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {selectedOvertimes.map((o) => (
                        <tr
                          key={o.id}
                          className="hover:bg-gray-50/60 transition-colors duration-150"
                        >
                          <td className="px-4 sm:px-6 py-3 sm:py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white text-[9px] sm:text-xs font-black flex-shrink-0">
                                {initials(o.users?.name || "??")}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-gray-800 truncate text-xs sm:text-sm">
                                  {o.users?.name}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 sm:px-4 py-3 sm:py-4 text-xs sm:text-sm">
                            <div className="flex flex-col gap-1">
                              <span className="font-mono font-bold text-gray-800">
                                {formatTime(o.scheduled_start)} –{" "}
                                {formatTime(o.scheduled_end)}
                              </span>
                              {o.actual_end && (
                                <span className="text-[9px] text-gray-400">
                                  Selesai: {formatTime(o.actual_end)}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 sm:px-4 py-3 sm:py-4">
                            <span
                              className={`inline-flex items-center gap-1 text-[9px] sm:text-xs font-bold px-2 sm:px-3 py-1 sm:py-1.5 rounded-full border whitespace-nowrap ${o.status === "PENDING"
                                ? "bg-amber-100 text-amber-700 border-amber-200"
                                : o.status === "APPROVED"
                                  ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                  : o.status === "ONGOING"
                                    ? "bg-green-100 text-green-700 border-green-200"
                                    : o.status === "COMPLETED"
                                      ? "bg-blue-100 text-blue-700 border-blue-200"
                                      : "bg-red-100 text-red-700 border-red-200"
                                }`}
                            >
                              {o.status === "PENDING"
                                ? "⏳"
                                : o.status === "APPROVED"
                                  ? "✅"
                                  : o.status === "ONGOING"
                                    ? "🟢"
                                    : o.status === "COMPLETED"
                                      ? "🏁"
                                      : "❌"}{" "}
                              <span className="hidden sm:inline">
                                {o.status === "PENDING"
                                  ? "Pending"
                                  : o.status === "APPROVED"
                                    ? "Disetujui"
                                    : o.status === "ONGOING"
                                      ? "Berjalan"
                                      : o.status === "COMPLETED"
                                        ? "Selesai"
                                        : "Ditolak"}
                              </span>
                            </span>
                          </td>
                          <td className="px-3 sm:px-4 py-3 sm:py-4 text-right">
                            {o.total_pay ? (
                              <span className="font-bold text-gray-800 text-xs sm:text-sm">
                                {formatRupiah(o.total_pay)}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-3 sm:px-4 py-3 sm:py-4 text-center">
                            <div className="flex justify-center gap-2 flex-wrap">
                              {isAdminRole(currentUser?.role) && (
                                <>
                                  {o.status === "PENDING" && (
                                    <button
                                      onClick={() => setApproveData(o)}
                                      className="text-xs sm:text-sm font-bold px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-emerald-100 text-emerald-600 border border-emerald-200 hover:bg-emerald-200 active:scale-95 transition-all whitespace-nowrap"
                                    >
                                      ✅ Setujui
                                    </button>
                                  )}
                                  {o.status === "ONGOING" && !o.actual_end && !o.rate_per_hour && (
                                    <button
                                      onClick={() => setSetPayData(o)}
                                      className="text-xs sm:text-sm font-bold px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-emerald-100 text-emerald-600 border border-emerald-200 hover:bg-emerald-200 active:scale-95 transition-all whitespace-nowrap"
                                    >
                                      💰 Bayar
                                    </button>
                                  )}
                                  {o.status === "COMPLETED" && o.proof_photo_url && (
                                    <button
                                      onClick={() => setProofPhotoData(o)}
                                      className="text-xs sm:text-sm font-bold px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-purple-100 text-purple-600 border border-purple-200 hover:bg-purple-200 active:scale-95 transition-all whitespace-nowrap"
                                    >
                                      👁️ Lihat Bukti
                                    </button>
                                  )}
                                </>
                              )}

                              {!isAdminRole(currentUser?.role) && currentUser?.id === o.user_id && (
                                <>
                                  {o.status === "APPROVED" && !o.actual_start && (
                                    <button
                                      onClick={() => setStartData(o)}
                                      className="text-xs sm:text-sm font-bold px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-orange-100 text-orange-600 border border-orange-200 hover:bg-orange-200 active:scale-95 transition-all whitespace-nowrap"
                                    >
                                      🟢 Mulai
                                    </button>
                                  )}
                                  {o.status === "ONGOING" && !o.actual_end && o.rate_per_hour && (
                                    <button
                                      onClick={() => setCompleteData(o)}
                                      className="text-xs sm:text-sm font-bold px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-blue-100 text-blue-600 border border-blue-200 hover:bg-blue-200 active:scale-95 transition-all whitespace-nowrap"
                                    >
                                      🏁 Selesai
                                    </button>
                                  )}
                                  {o.status === "COMPLETED" && o.auto_completed && !o.proof_photo_url && (
                                    <button
                                      onClick={() => setCompleteData(o)}
                                      className="text-xs sm:text-sm font-bold px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-blue-100 text-blue-600 border border-blue-200 hover:bg-blue-200 active:scale-95 transition-all whitespace-nowrap"
                                    >
                                      📸 Upload Bukti
                                    </button>
                                  )}
                                </>
                              )}

                              {!isAdminRole(currentUser?.role) && currentUser?.id !== o.user_id && (
                                <span className="text-xs text-gray-300">—</span>
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

          {/* ── All Overtimes Table ── */}
          {!selectedDate && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 sm:px-6 py-4 sm:py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
                <p className="font-bold text-gray-800 mb-3 sm:mb-4 text-sm sm:text-base">
                  Daftar Lemburan
                </p>
                <div className="flex flex-wrap gap-2">
                  {["Semua", ...statuses].map((s) => (
                    <button
                      key={s}
                      onClick={() => setFilterStatus(s)}
                      className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all active:scale-95 ${filterStatus === s
                        ? "bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-md"
                        : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
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
                                : "Semua"}
                    </button>
                  ))}
                </div>
              </div>

              {loading ? (
                <div className="p-4 sm:p-6 space-y-3">
                  {Array(3)
                    .fill(0)
                    .map((_, i) => (
                      <div
                        key={i}
                        className="h-16 bg-gray-50 rounded-lg animate-pulse"
                      />
                    ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 sm:py-16">
                  <div className="text-4xl sm:text-5xl mb-3">📭</div>
                  <p className="text-sm text-gray-400">Tidak ada lemburan</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <th className="px-4 sm:px-6 py-3 sm:py-4 text-left font-bold text-gray-600 uppercase tracking-wide">
                          Karyawan
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 text-left font-bold text-gray-600 uppercase tracking-wide">
                          Tanggal
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 text-left font-bold text-gray-600 uppercase tracking-wide">
                          Waktu
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 text-left font-bold text-gray-600 uppercase tracking-wide">
                          Status
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 text-right font-bold text-gray-600 uppercase tracking-wide">
                          Bayaran
                        </th>
                        <th className="px-3 sm:px-4 py-3 sm:py-4 text-center font-bold text-gray-600 uppercase tracking-wide">
                          Aksi
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filtered.map((o) => (
                        <tr
                          key={o.id}
                          className="hover:bg-gray-50/60 transition-colors duration-150"
                        >
                          <td className="px-4 sm:px-6 py-3 sm:py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white text-[9px] sm:text-xs font-black flex-shrink-0">
                                {initials(o.users?.name || "??")}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-gray-800 truncate text-xs sm:text-sm">
                                  {o.users?.name}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 sm:px-4 py-3 sm:py-4 text-xs sm:text-sm">
                            <span className="font-mono font-bold text-gray-800">
                              {new Date(o.request_date).toLocaleDateString(
                                "id-ID",
                                {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                }
                              )}
                            </span>
                          </td>
                          <td className="px-3 sm:px-4 py-3 sm:py-4 text-xs sm:text-sm">
                            <span className="text-gray-600">
                              {formatTime(o.scheduled_start)} –{" "}
                              {formatTime(o.scheduled_end)}
                            </span>
                          </td>
                          <td className="px-3 sm:px-4 py-3 sm:py-4">
                            <span
                              className={`inline-flex items-center gap-1 text-[9px] sm:text-xs font-bold px-2 sm:px-3 py-1 sm:py-1.5 rounded-full border whitespace-nowrap ${o.status === "PENDING"
                                ? "bg-amber-100 text-amber-700 border-amber-200"
                                : o.status === "APPROVED"
                                  ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                  : o.status === "ONGOING"
                                    ? "bg-green-100 text-green-700 border-green-200"
                                    : o.status === "COMPLETED"
                                      ? "bg-blue-100 text-blue-700 border-blue-200"
                                      : "bg-red-100 text-red-700 border-red-200"
                                }`}
                            >
                              {o.status === "PENDING"
                                ? "⏳"
                                : o.status === "APPROVED"
                                  ? "✅"
                                  : o.status === "ONGOING"
                                    ? "🟢"
                                    : o.status === "COMPLETED"
                                      ? "🏁"
                                      : "❌"}{" "}
                              <span className="hidden sm:inline">
                                {o.status === "PENDING"
                                  ? "Pending"
                                  : o.status === "APPROVED"
                                    ? "Disetujui"
                                    : o.status === "ONGOING"
                                      ? "Berjalan"
                                      : o.status === "COMPLETED"
                                        ? "Selesai"
                                        : "Ditolak"}
                              </span>
                            </span>
                          </td>
                          <td className="px-3 sm:px-4 py-3 sm:py-4 text-right">
                            {o.total_pay ? (
                              <span className="font-bold text-gray-800 text-xs sm:text-sm">
                                {formatRupiah(o.total_pay)}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-3 sm:px-4 py-3 sm:py-4 text-center">
                            <div className="flex justify-center gap-2 flex-wrap">
                              {isAdminRole(currentUser?.role) && (
                                <>
                                  {o.status === "PENDING" && (
                                    <button
                                      onClick={() => setApproveData(o)}
                                      className="text-xs sm:text-sm font-bold px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-emerald-100 text-emerald-600 border border-emerald-200 hover:bg-emerald-200 active:scale-95 transition-all whitespace-nowrap"
                                    >
                                      ✅ Setujui
                                    </button>
                                  )}
                                  {o.status === "ONGOING" && !o.actual_end && !o.rate_per_hour && (
                                    <button
                                      onClick={() => setSetPayData(o)}
                                      className="text-xs sm:text-sm font-bold px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-emerald-100 text-emerald-600 border border-emerald-200 hover:bg-emerald-200 active:scale-95 transition-all whitespace-nowrap"
                                    >
                                      💰 Bayar
                                    </button>
                                  )}
                                  {o.status === "COMPLETED" && o.proof_photo_url && (
                                    <button
                                      onClick={() => setProofPhotoData(o)}
                                      className="text-xs sm:text-sm font-bold px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-purple-100 text-purple-600 border border-purple-200 hover:bg-purple-200 active:scale-95 transition-all whitespace-nowrap"
                                    >
                                      👁️ Lihat Bukti
                                    </button>
                                  )}
                                </>
                              )}

                              {!isAdminRole(currentUser?.role) && currentUser?.id === o.user_id && (
                                <>
                                  {o.status === "APPROVED" && !o.actual_start && (
                                    <button
                                      onClick={() => setStartData(o)}
                                      className="text-xs sm:text-sm font-bold px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-orange-100 text-orange-600 border border-orange-200 hover:bg-orange-200 active:scale-95 transition-all whitespace-nowrap"
                                    >
                                      🟢 Mulai
                                    </button>
                                  )}
                                  {o.status === "ONGOING" && !o.actual_end && o.rate_per_hour && (
                                    <button
                                      onClick={() => setCompleteData(o)}
                                      className="text-xs sm:text-sm font-bold px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-blue-100 text-blue-600 border border-blue-200 hover:bg-blue-200 active:scale-95 transition-all whitespace-nowrap"
                                    >
                                      🏁 Selesai
                                    </button>
                                  )}
                                  {o.status === "COMPLETED" && o.auto_completed && !o.proof_photo_url && (
                                    <button
                                      onClick={() => setCompleteData(o)}
                                      className="text-xs sm:text-sm font-bold px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-blue-100 text-blue-600 border border-blue-200 hover:bg-blue-200 active:scale-95 transition-all whitespace-nowrap"
                                    >
                                      📸 Upload Bukti
                                    </button>
                                  )}
                                </>
                              )}

                              {!isAdminRole(currentUser?.role) && currentUser?.id !== o.user_id && (
                                <span className="text-xs text-gray-300">—</span>
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
          onSaved={() => {
            fetchOvertimes();
            setShowRequestModal(false);
          }}
          currentUser={currentUser}
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

      <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
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
        .animate-fadeIn {
          animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .animate-scaleIn {
          animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </DashboardLayout>
  );
}