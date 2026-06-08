// src/app/dashboard/attendance/overtime/page.tsx
"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { getCurrentUserClient } from "@/lib/auth-client";
import DashboardLayout from "@/components/layout/DashboardLayout";

// ─── Types ────────────────────────────────────────────────────────────────────
type OvertimeStatus = "PENDING" | "APPROVED" | "REJECTED" | "ONGOING" | "COMPLETED" | "CANCELLED";

type OvertimeRequest = {
  id: string;
  user_id: string;
  request_date: string;
  reason: string;
  requested_start: string;
  status: OvertimeStatus;
  approved_by: string | null;
  approved_at: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  rate_per_hour: number | null;
  rejection_note: string | null;
  actual_end: string | null;
  proof_photo_url: string | null;
  completed_at: string | null;
  duration_minutes: number | null;
  total_pay: number | null;
  created_at: string;
  user?: { id: string; name: string; role: string; shift: string };
  approver?: { id: string; name: string; role: string } | null;
};

type OvertimeRate = { id: string; role: string; rate_per_hour: number };

// ─── Constants ─────────────────────────────────────────────────────────────
const FULL_ACCESS = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];
const DIVISION_HEADS = ["KEPALA_SALES", "KEPALA_MARKETING", "KEPALA_TEKNISI"];
const ALL_ROLES = [
  "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
  "KEPALA_SALES", "KEPALA_MARKETING", "KEPALA_TEKNISI",
  "CREW_SALES", "SOTECH", "ACCOUNTING", "PENGELOLA_BARANG",
  "TEKNISI", "PENGANTARAN", "MARKETING", "KEBERSIHAN",
];
const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin", PROGRAMMER: "Programmer", ASISTEN_CEO: "Asisten CEO",
  KEPALA_SALES: "Kepala Sales", KEPALA_MARKETING: "Kepala Marketing", KEPALA_TEKNISI: "Kepala Teknisi",
  CREW_SALES: "Crew Sales", SOTECH: "Sotech", ACCOUNTING: "Accounting",
  PENGELOLA_BARANG: "Pengelola Barang", TEKNISI: "Teknisi", PENGANTARAN: "Pengantaran",
  MARKETING: "Marketing", KEBERSIHAN: "Kebersihan",
};

const STATUS_CONFIG: Record<OvertimeStatus, { label: string; emoji: string; bg: string; color: string; border: string }> = {
  PENDING:   { label: "Menunggu",  emoji: "⏳", bg: "bg-amber-50",   color: "text-amber-700",  border: "border-amber-200"  },
  APPROVED:  { label: "Disetujui", emoji: "✅", bg: "bg-emerald-50", color: "text-emerald-700", border: "border-emerald-200" },
  REJECTED:  { label: "Ditolak",   emoji: "❌", bg: "bg-red-50",     color: "text-red-700",    border: "border-red-200"    },
  ONGOING:   { label: "Berlangsung",emoji: "🟢",bg: "bg-green-50",   color: "text-green-700",  border: "border-green-200"  },
  COMPLETED: { label: "Selesai",   emoji: "🏁", bg: "bg-blue-50",    color: "text-blue-700",   border: "border-blue-200"   },
  CANCELLED: { label: "Dibatalkan",emoji: "🚫", bg: "bg-gray-50",    color: "text-gray-500",   border: "border-gray-200"   },
};

function isApprover(role?: string): boolean {
  return !!role && ([...FULL_ACCESS, ...DIVISION_HEADS].includes(role));
}

function formatRupiah(n: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h}j ${m}m` : `${m}m`;
}

function toWIBStr(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
}

function getWIBToday(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function initials(name: string): string {
  return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

// ─── Modal: Request Lembur ────────────────────────────────────────────────────
function RequestOvertimeModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    request_date:    getWIBToday(),
    reason:          "",
    requested_start: "19:00",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const save = async () => {
    if (!form.reason.trim()) { setError("Alasan lembur wajib diisi"); return; }
    setSaving(true); setError("");
    try {
      const res  = await fetch("/api/attendance/overtime", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal"); return; }
      onSaved(); onClose();
    } catch { setError("Gagal menyimpan"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-5 flex items-start justify-between">
          <div>
            <p className="font-bold text-white text-base">⏰ Request Lembur</p>
            <p className="text-xs text-white/70 mt-1">Ajukan permintaan lembur ke kepala divisi</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-white/60 hover:text-white hover:bg-white/20 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-3 rounded-xl">⚠️ {error}</div>}

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Tanggal Lembur</label>
            <input type="date" value={form.request_date}
              onChange={e => setForm(f => ({ ...f, request_date: e.target.value }))}
              className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-400/20" />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Jam Mulai (perkiraan)</label>
            <input type="time" value={form.requested_start}
              onChange={e => setForm(f => ({ ...f, requested_start: e.target.value }))}
              className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-400/20" />
            <p className="text-[10px] text-gray-400 mt-1">Kepala divisi akan menentukan jam pasti saat approve</p>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Alasan Lembur</label>
            <textarea value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              placeholder="Contoh: Perlu menyelesaikan order mendesak dari pelanggan..."
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-400/20 resize-none" />
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
            <strong>ℹ️</strong> Request akan dikirim ke kepala divisi dan admin untuk disetujui.
            Pastikan request dibuat <strong>sebelum</strong> jam lembur dimulai.
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition">Batal</button>
          <button onClick={save} disabled={saving}
            className="flex-1 h-11 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Mengirim...</> : "📤 Kirim Request"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Approve Lembur ────────────────────────────────────────────────────
function ApproveModal({ overtime, onClose, onSaved }: { overtime: OvertimeRequest; onClose: () => void; onSaved: () => void }) {
  const defaultStart = overtime.request_date + "T" + overtime.requested_start;
  const [form, setForm] = useState({
    scheduled_start: defaultStart,
    scheduled_end:   overtime.request_date + "T22:00",
    rate_per_hour:   "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const approve = async () => {
    if (!form.scheduled_start || !form.scheduled_end) { setError("Jam mulai dan selesai wajib diisi"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/attendance/overtime", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: overtime.id, action: "APPROVE",
          scheduled_start: new Date(form.scheduled_start).toISOString(),
          scheduled_end:   new Date(form.scheduled_end).toISOString(),
          rate_per_hour:   form.rate_per_hour ? parseInt(form.rate_per_hour) : undefined,
        }),
      });
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal"); return; }
      onSaved(); onClose();
    } catch { setError("Gagal"); }
    finally { setSaving(false); }
  };

  const reject = async () => {
    const note = prompt("Alasan penolakan (opsional):");
    if (note === null) return; // user cancel prompt
    try {
      await fetch("/api/attendance/overtime", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: overtime.id, action: "REJECT", rejection_note: note }),
      });
      onSaved(); onClose();
    } catch { }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-600 to-green-700 px-6 py-5 flex items-start justify-between">
          <div>
            <p className="font-bold text-white text-base">✅ Setujui Lembur</p>
            <p className="text-xs text-white/70 mt-1">{overtime.user?.name} · {overtime.request_date}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-white/60 hover:text-white hover:bg-white/20 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-3 rounded-xl">⚠️ {error}</div>}

          <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
            <p className="text-xs font-bold text-gray-500 uppercase mb-1">Alasan dari {overtime.user?.name}:</p>
            <p className="text-sm text-gray-700">{overtime.reason}</p>
            <p className="text-xs text-gray-400 mt-1">Jam yang diminta: <strong>{overtime.requested_start}</strong></p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Jam Mulai</label>
              <input type="datetime-local" value={form.scheduled_start}
                onChange={e => setForm(f => ({ ...f, scheduled_start: e.target.value }))}
                className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Jam Selesai</label>
              <input type="datetime-local" value={form.scheduled_end}
                onChange={e => setForm(f => ({ ...f, scheduled_end: e.target.value }))}
                className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none" />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">
              Rate/Jam (Rp) <span className="normal-case font-normal text-gray-400">— kosongkan untuk pakai rate default role</span>
            </label>
            <input type="number" min={0} value={form.rate_per_hour}
              onChange={e => setForm(f => ({ ...f, rate_per_hour: e.target.value }))}
              placeholder="Contoh: 25000"
              className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none" />
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={reject} className="h-11 px-5 bg-red-50 text-red-600 border border-red-200 rounded-xl text-sm font-semibold hover:bg-red-100 transition">❌ Tolak</button>
          <button onClick={onClose} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition">Batal</button>
          <button onClick={approve} disabled={saving}
            className="flex-1 h-11 bg-gradient-to-r from-emerald-600 to-green-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</> : "✅ Setujui"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Selesai Lembur ────────────────────────────────────────────────────
function CompleteModal({ overtime, onClose, onSaved }: { overtime: OvertimeRequest; onClose: () => void; onSaved: () => void }) {
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setPhotoFile(f);
      setPhotoPreview(URL.createObjectURL(f));
    }
  };

  const complete = async () => {
    setSaving(true); setError("");
    try {
      let photoUrl: string | null = null;

      // Upload foto ke Supabase Storage jika ada
      if (photoFile) {
        const fileName = `overtime_${overtime.id}_${Date.now()}.${photoFile.name.split(".").pop()}`;
        const formData = new FormData();
        formData.append("file", photoFile);
        formData.append("filename", fileName);

        const uploadRes = await fetch("/api/attendance/overtime/upload", {
          method: "POST",
          body: formData,
        });
        const uploadData = await uploadRes.json();
        if (uploadData.success) photoUrl = uploadData.url;
      }

      const res = await fetch("/api/attendance/overtime", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: overtime.id, action: "COMPLETE", proof_photo_url: photoUrl }),
      });
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal"); return; }
      onSaved(); onClose();
    } catch { setError("Gagal menyimpan"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-5 flex items-start justify-between">
          <div>
            <p className="font-bold text-white text-base">🏁 Selesai Lembur</p>
            <p className="text-xs text-white/70 mt-1">Upload bukti foto bahwa lembur sudah selesai</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-white/60 hover:text-white hover:bg-white/20 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-3 rounded-xl">⚠️ {error}</div>}

          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm">
            <p className="font-bold text-blue-700 mb-1">Info Lembur</p>
            <p className="text-blue-600 text-xs">Mulai: <strong>{overtime.scheduled_start ? toWIBStr(overtime.scheduled_start) : "-"}</strong></p>
            <p className="text-blue-600 text-xs">Selesai dijadwalkan: <strong>{overtime.scheduled_end ? toWIBStr(overtime.scheduled_end) : "-"}</strong></p>
            <p className="text-blue-600 text-xs mt-1">Rate: <strong>{overtime.rate_per_hour ? formatRupiah(overtime.rate_per_hour) + "/jam" : "-"}</strong></p>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">
              Foto Bukti <span className="normal-case font-normal text-gray-400">(opsional tapi disarankan)</span>
            </label>
            {photoPreview ? (
              <div className="relative">
                <img src={photoPreview} alt="Preview" className="w-full h-40 object-cover rounded-xl border border-gray-200" />
                <button onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                  className="absolute top-2 right-2 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600 transition">✕</button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition">
                <span className="text-3xl mb-1">📸</span>
                <span className="text-xs text-gray-500">Tap untuk ambil/pilih foto</span>
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
              </label>
            )}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
            ⏱️ Waktu selesai akan dicatat <strong>saat ini</strong>. Total bayar dihitung otomatis dari jam mulai.
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition">Batal</button>
          <button onClick={complete} disabled={saving}
            className="flex-1 h-11 bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</> : "🏁 Selesai"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Set Rate Lembur ───────────────────────────────────────────────────
function RateModal({ rates, onClose, onSaved }: { rates: OvertimeRate[]; onClose: () => void; onSaved: () => void }) {
  const rateMap = useMemo(() => {
    const m: Record<string, string> = {};
    rates.forEach(r => { m[r.role] = r.rate_per_hour.toString(); });
    return m;
  }, [rates]);

  const [local, setLocal] = useState<Record<string, string>>(() => ({ ...rateMap }));
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const save = async () => {
    setSaving(true); setError("");
    try {
      const ops = ALL_ROLES.filter(r => local[r]).map(role =>
        fetch("/api/attendance/overtime/rates", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role, rate_per_hour: parseInt(local[role] || "0") }),
        })
      );
      await Promise.all(ops);
      onSaved(); onClose();
    } catch { setError("Gagal menyimpan"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden">
        <div className="bg-gradient-to-r from-violet-600 to-purple-700 px-6 py-5 flex items-start justify-between flex-shrink-0">
          <div>
            <p className="font-bold text-white text-base">💰 Rate Lembur Per Role</p>
            <p className="text-xs text-white/70 mt-1">Set rate per jam untuk setiap jabatan</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-white/60 hover:text-white hover:bg-white/20 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-5 space-y-2">
          {error && <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-3 rounded-xl mb-3">⚠️ {error}</div>}
          {ALL_ROLES.map(role => (
            <div key={role} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
              <span className="text-sm font-bold text-gray-700 flex-1">{ROLE_LABEL[role] ?? role}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-400">Rp</span>
                <input type="number" min={0} value={local[role] ?? ""}
                  onChange={e => setLocal(p => ({ ...p, [role]: e.target.value }))}
                  placeholder="0"
                  className="w-28 h-9 border border-gray-200 rounded-lg px-2.5 text-sm text-right bg-white focus:outline-none focus:ring-2 focus:ring-violet-400/20 font-mono" />
                <span className="text-xs text-gray-400">/jam</span>
              </div>
            </div>
          ))}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0 flex gap-3">
          <button onClick={onClose} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition">Batal</button>
          <button onClick={save} disabled={saving}
            className="flex-1 h-11 bg-gradient-to-r from-violet-600 to-purple-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</> : "💾 Simpan Semua"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function OvertimePage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [overtimes, setOvertimes]     = useState<OvertimeRequest[]>([]);
  const [rates, setRates]             = useState<OvertimeRate[]>([]);
  const [loading, setLoading]         = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");

  const [showRequest,  setShowRequest]  = useState(false);
  const [approveData,  setApproveData]  = useState<OvertimeRequest | null>(null);
  const [completeData, setCompleteData] = useState<OvertimeRequest | null>(null);
  const [showRates,    setShowRates]    = useState(false);

  const today = getWIBToday();

  const canManageRates = isApprover(currentUser?.role);

  const fetchOvertimes = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const y = now.getFullYear(), m = now.getMonth() + 1;
      const r = await fetch(`/api/attendance/overtime?year=${y}&month=${m}`);
      const d = await r.json();
      if (d.success) setOvertimes(d.data || []);
    } catch {} finally { setLoading(false); }
  }, []);

  const fetchRates = useCallback(async () => {
    const r = await fetch("/api/attendance/overtime/rates");
    const d = await r.json();
    if (d.success) setRates(d.data || []);
  }, []);

  useEffect(() => {
    getCurrentUserClient().then(u => setCurrentUser(u));
    fetchOvertimes();
    fetchRates();
  }, []);

  const filtered = useMemo(() => {
    if (filterStatus === "ALL") return overtimes;
    return overtimes.filter(o => o.status === filterStatus);
  }, [overtimes, filterStatus]);

  const myPending = overtimes.filter(o =>
    o.user_id === currentUser?.id && ["PENDING", "APPROVED", "ONGOING"].includes(o.status)
  );

  const pendingApprovals = isApprover(currentUser?.role)
    ? overtimes.filter(o => o.status === "PENDING")
    : [];

  const cancel = async (id: string) => {
    if (!confirm("Batalkan request lembur ini?")) return;
    await fetch("/api/attendance/overtime", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "CANCEL" }),
    });
    fetchOvertimes();
  };

  const startOverttime = async (id: string) => {
    await fetch("/api/attendance/overtime", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "START" }),
    });
    fetchOvertimes();
  };

  const rateMap = useMemo(() => {
    const m: Record<string, number> = {};
    rates.forEach(r => { m[r.role] = r.rate_per_hour; });
    return m;
  }, [rates]);

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-800">⏰ Lembur</h1>
            <p className="text-xs text-gray-400 mt-1">Kelola request dan approval lembur karyawan</p>
          </div>
          <div className="flex items-center gap-2">
            {canManageRates && (
              <button onClick={() => setShowRates(true)}
                className="flex items-center gap-1.5 text-xs font-bold text-violet-600 bg-violet-50 border border-violet-200 px-4 py-2 rounded-xl hover:bg-violet-100 transition">
                💰 Rate Lembur
              </button>
            )}
            <button onClick={() => setShowRequest(true)}
              className="flex items-center gap-1.5 text-xs font-bold text-white bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2 rounded-xl hover:opacity-90 transition shadow-sm">
              ➕ Request Lembur
            </button>
            <button onClick={fetchOvertimes}
              className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 border border-gray-200 px-4 py-2 rounded-xl bg-white hover:shadow-md transition">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              Refresh
            </button>
          </div>
        </div>

        {/* ── Pending Approvals Banner (khusus approver) ── */}
        {pendingApprovals.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔔</span>
              <div>
                <p className="font-bold text-amber-800 text-sm">{pendingApprovals.length} request lembur menunggu persetujuan</p>
                <p className="text-xs text-amber-600 mt-0.5">Klik untuk review dan approve/tolak</p>
              </div>
            </div>
            <button onClick={() => setFilterStatus("PENDING")}
              className="text-xs font-bold text-amber-700 bg-amber-100 border border-amber-300 px-4 py-2 rounded-xl hover:bg-amber-200 transition">
              Lihat →
            </button>
          </div>
        )}

        {/* ── My Active Overtime (karyawan) ── */}
        {myPending.length > 0 && myPending.some(o => o.user_id === currentUser?.id) && (
          <div className="space-y-3">
            {myPending.filter(o => ["APPROVED", "ONGOING"].includes(o.status)).map(o => {
              const statusCfg = STATUS_CONFIG[o.status];
              return (
                <div key={o.id} className={`${statusCfg.bg} border ${statusCfg.border} rounded-2xl p-4`}>
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${statusCfg.bg} ${statusCfg.color} ${statusCfg.border}`}>
                          {statusCfg.emoji} {statusCfg.label}
                        </span>
                        <span className="text-xs font-bold text-gray-600">{o.request_date}</span>
                      </div>
                      <p className="text-sm font-bold text-gray-800">
                        {o.scheduled_start ? toWIBStr(o.scheduled_start) : "-"} — {o.scheduled_end ? toWIBStr(o.scheduled_end) : "-"}
                      </p>
                      {o.rate_per_hour && (
                        <p className="text-xs text-gray-500 mt-0.5">{formatRupiah(o.rate_per_hour)}/jam</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {o.status === "APPROVED" && (
                        <button onClick={() => startOverttime(o.id)}
                          className="text-xs font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-4 py-2 rounded-xl hover:bg-emerald-200 transition">
                          ▶ Mulai Lembur
                        </button>
                      )}
                      {o.status === "ONGOING" && (
                        <button onClick={() => setCompleteData(o)}
                          className="text-xs font-bold text-blue-700 bg-blue-100 border border-blue-200 px-4 py-2 rounded-xl hover:bg-blue-200 transition">
                          🏁 Selesai
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Bulan Ini", value: overtimes.length, icon: "📋", color: "text-gray-800" },
            { label: "Menunggu",  value: overtimes.filter(o => o.status === "PENDING").length,   icon: "⏳", color: "text-amber-700" },
            { label: "Berlangsung", value: overtimes.filter(o => o.status === "ONGOING").length, icon: "🟢", color: "text-green-700" },
            { label: "Selesai",   value: overtimes.filter(o => o.status === "COMPLETED").length, icon: "🏁", color: "text-blue-700"  },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition">
              <div className="flex items-start justify-between mb-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{c.label}</p>
                <span className="text-lg">{c.icon}</span>
              </div>
              <p className={`text-2xl font-black ${c.color}`}>{loading ? <span className="w-8 h-6 bg-gray-100 rounded animate-pulse inline-block" /> : c.value}</p>
            </div>
          ))}
        </div>

        {/* ── Filter Status ── */}
        <div className="flex flex-wrap gap-2">
          {["ALL", "PENDING", "APPROVED", "ONGOING", "COMPLETED", "REJECTED", "CANCELLED"].map(s => {
            const cfg = s === "ALL" ? null : STATUS_CONFIG[s as OvertimeStatus];
            return (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${filterStatus === s ? "bg-[#1a1a2e] text-white border-[#1a1a2e] shadow-md" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}>
                {s === "ALL" ? "Semua" : `${cfg?.emoji} ${cfg?.label}`}
              </button>
            );
          })}
        </div>

        {/* ── Daftar Overtime ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">{Array(4).fill(0).map((_, i) => <div key={i} className="h-16 bg-gray-50 rounded-2xl animate-pulse" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4"><span className="text-3xl opacity-40">⏰</span></div>
              <p className="text-sm text-gray-400">Belum ada data lembur</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="px-5 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Karyawan</th>
                    <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Tanggal</th>
                    <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Jadwal</th>
                    <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                    <th className="px-4 py-4 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Total</th>
                    <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(o => {
                    const statusCfg = STATUS_CONFIG[o.status];
                    const isOwn     = o.user_id === currentUser?.id;
                    const canAppr   = isApprover(currentUser?.role) && o.status === "PENDING";

                    return (
                      <tr key={o.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-[#1a1a2e] flex items-center justify-center text-white text-[10px] font-black flex-shrink-0">
                              {initials(o.user?.name ?? "?")}
                            </div>
                            <div>
                              <p className="font-bold text-gray-800 text-sm">{o.user?.name ?? "-"}</p>
                              <p className="text-[10px] text-gray-400">{ROLE_LABEL[o.user?.role ?? ""] ?? o.user?.role}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-bold text-gray-700 text-sm">{new Date(o.request_date + "T12:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short" })}</p>
                          <p className="text-[10px] text-gray-400 truncate max-w-[120px]">{o.reason}</p>
                        </td>
                        <td className="px-4 py-4">
                          {o.scheduled_start && o.scheduled_end ? (
                            <div>
                              <p className="font-mono font-bold text-gray-700 text-xs">{toWIBStr(o.scheduled_start)} – {toWIBStr(o.scheduled_end)}</p>
                              {o.rate_per_hour && <p className="text-[10px] text-gray-400">{formatRupiah(o.rate_per_hour)}/jam</p>}
                            </div>
                          ) : (
                            <span className="text-[10px] text-gray-300 font-bold">Diminta: {o.requested_start}</span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-full border ${statusCfg.bg} ${statusCfg.color} ${statusCfg.border}`}>
                            {statusCfg.emoji} {statusCfg.label}
                          </span>
                          {o.rejection_note && (
                            <p className="text-[10px] text-red-400 mt-0.5 max-w-[120px] truncate">{o.rejection_note}</p>
                          )}
                          {o.duration_minutes && (
                            <p className="text-[10px] text-gray-400 mt-0.5">{formatDuration(o.duration_minutes)}</p>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right">
                          {o.total_pay ? (
                            <span className="font-black text-gray-800 text-sm">{formatRupiah(o.total_pay)}</span>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            {canAppr && (
                              <button onClick={() => setApproveData(o)}
                                className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 transition whitespace-nowrap">
                                ✅ Review
                              </button>
                            )}
                            {isOwn && o.status === "ONGOING" && (
                              <button onClick={() => setCompleteData(o)}
                                className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 transition">
                                🏁 Selesai
                              </button>
                            )}
                            {isOwn && o.status === "APPROVED" && (
                              <button onClick={() => startOverttime(o.id)}
                                className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-green-50 text-green-600 border border-green-200 hover:bg-green-100 transition">
                                ▶ Mulai
                              </button>
                            )}
                            {(isOwn || isApprover(currentUser?.role)) && ["PENDING", "APPROVED"].includes(o.status) && (
                              <button onClick={() => cancel(o.id)}
                                className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100 transition">
                                🚫
                              </button>
                            )}
                            {o.proof_photo_url && (
                              <a href={o.proof_photo_url} target="_blank" rel="noopener noreferrer"
                                className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100 transition">
                                📷
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Total Lembur Bulan Ini ── */}
        {overtimes.filter(o => o.status === "COMPLETED" && o.total_pay).length > 0 && (
          <div className="bg-gradient-to-r from-[#1a1a2e] to-[#16213e] rounded-2xl px-6 py-4 flex items-center justify-between">
            <p className="text-white/70 text-sm font-medium">Total Biaya Lembur Bulan Ini</p>
            <p className="text-white font-black text-xl">
              {formatRupiah(overtimes.filter(o => o.status === "COMPLETED").reduce((s, o) => s + (o.total_pay ?? 0), 0))}
            </p>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {showRequest   && <RequestOvertimeModal onClose={() => setShowRequest(false)} onSaved={fetchOvertimes} />}
      {approveData   && <ApproveModal overtime={approveData} onClose={() => setApproveData(null)} onSaved={fetchOvertimes} />}
      {completeData  && <CompleteModal overtime={completeData} onClose={() => setCompleteData(null)} onSaved={fetchOvertimes} />}
      {showRates     && <RateModal rates={rates} onClose={() => setShowRates(false)} onSaved={() => { fetchRates(); setShowRates(false); }} />}

      <style jsx global>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.35s ease-out; }
      `}</style>
    </DashboardLayout>
  );
}