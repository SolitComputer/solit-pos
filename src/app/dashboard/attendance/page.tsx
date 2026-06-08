"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { getCurrentUserClient } from "@/lib/auth-client";
import DashboardLayout from "@/components/layout/DashboardLayout";

// ─── Types ────────────────────────────────────────────────────────────────────
type Attendance = {
  id: string;
  user_id?: string;
  user_name: string;
  user_role: string;
  user_shift?: "PAGI" | "SORE";
  date: string;
  check_in_time: string;
  status: string;
  method: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  device: string;
  ip_address: string;
  face_distance: number | null;
  created_at: string;
  displayStatus?: "PRESENT" | "LATE" | "SKIP";
  source?: "AUTO" | "MANUAL";
};

type ManualAttendance = {
  id: string;
  user_id: string;
  attendance_date: string;
  check_in_time: string;
  status: "PRESENT" | "LATE" | "SICK" | "PERMIT" | "ABSENT";
  notes: string | null;
  created_by: string | null;
  users?: { id: string; name: string; role: string; shift: string };
};

type UserSalary = {
  user_id: string;
  salary_type: "FIXED" | "PERCENTAGE";
  base_salary: number;
};

type LeaveRequest = {
  id: string;
  leave_date: string;
  reason: string | null;
  status: string;
};

type LeaveBalance = {
  id?: string;
  user_id: string;
  year: number;
  month: number;
  quota: number;
  used: number;
  carried_over: number;
};

type UserLeaveData = {
  user: { id: string; name: string; role: string };
  balance: LeaveBalance;
  requests: LeaveRequest[];
  available: number;
};

type DayOff  = { id: string; user_id: string; day_of_week: number; users?: { id: string; name: string; role: string } };
type DateOff = { id: string; user_id: string; off_date: string;    users?: { id: string; name: string; role: string } };
type UserInfo = { id: string; name: string; role: string };

// ─── Constants ─────────────────────────────────────────────────────────────
const OFFICE_LAT  = -6.402593;
const OFFICE_LNG  = 106.787233;
const MONTH_NAMES = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
const DAY_NAMES   = ["Min","Sen","Sel","Rab","Kam","Jum","Sab"];
const DAY_FULL    = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];

const MANUAL_STATUS_LABELS: Record<string, { label: string; color: string; bg: string; border: string; emoji: string }> = {
  PRESENT: { label:"Hadir",       color:"text-emerald-700", bg:"bg-emerald-100", border:"border-emerald-200", emoji:"✅" },
  LATE:    { label:"Terlambat",   color:"text-amber-700",   bg:"bg-amber-100",   border:"border-amber-200",   emoji:"⏰" },
  SICK:    { label:"Sakit",       color:"text-blue-700",    bg:"bg-blue-100",    border:"border-blue-200",    emoji:"🤒" },
  PERMIT:  { label:"Izin",        color:"text-violet-700",  bg:"bg-violet-100",  border:"border-violet-200",  emoji:"📋" },
  ABSENT:  { label:"Tidak Hadir", color:"text-red-700",     bg:"bg-red-100",     border:"border-red-200",     emoji:"❌" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000, dLat = ((lat2-lat1)*Math.PI)/180, dLng = ((lng2-lng1)*Math.PI)/180;
  const a = Math.sin(dLat/2)**2 + Math.cos((lat1*Math.PI)/180)*Math.cos((lat2*Math.PI)/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function toWIBTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", { hour:"2-digit", minute:"2-digit", timeZone:"Asia/Jakarta" });
}

function toWIBDateKey(iso: string): string {
  return new Date(new Date(iso).getTime() + 7*60*60*1000).toISOString().slice(0,10);
}

function getWIBToday(): string {
  return new Date(Date.now() + 7*60*60*1000).toISOString().slice(0,10);
}

const SHIFT_LATE: Record<"PAGI"|"SORE", number> = { PAGI: 8*60, SORE: 16*60 };

function isLate(t: string, shift: "PAGI"|"SORE" = "PAGI"): boolean {
  const wib   = new Date(new Date(t).getTime() + 7*60*60*1000);
  const total = wib.getUTCHours()*60 + wib.getUTCMinutes();
  return total > SHIFT_LATE[shift];
}

function getDisplayStatus(a: Attendance): "PRESENT"|"LATE"|"SKIP" {
  if (a.method === "FORCE") return "PRESENT";
  if (a.method === "SKIP" || a.status === "SKIPPED_MANUAL") return "SKIP";
  if (isLate(a.check_in_time || a.created_at, a.user_shift ?? "PAGI")) return "LATE";
  return "PRESENT";
}

// Hitung total hari kerja seluruh bulan (untuk referensi)
function countWorkingDays(year: number, month: number, dayOffDows: Set<number>, offDates: Set<string>): number {
  const dim = new Date(year, month+1, 0).getDate();
  let c = 0;
  for (let d = 1; d <= dim; d++) {
    const dk  = `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const dow = new Date(dk+"T12:00:00").getDay();
    if (!dayOffDows.has(dow) && !offDates.has(dk)) c++;
  }
  return c;
}

// ✅ FIX: Hitung hari kerja yang SUDAH LEWAT (kemarin dan sebelumnya) dalam bulan ini
// Ini dipakai untuk menghitung "tidak hadir yang valid"
function countPastWorkingDays(year: number, month: number, dayOffDows: Set<number>, offDates: Set<string>): number {
  const todayWIB = getWIBToday(); // "YYYY-MM-DD" hari ini WIB
  const dim      = new Date(year, month+1, 0).getDate();
  let c = 0;
  for (let d = 1; d <= dim; d++) {
    const dk  = `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    if (dk >= todayWIB) break; // stop di hari ini — hanya hitung hari yang sudah lewat
    const dow = new Date(dk+"T12:00:00").getDay();
    if (!dayOffDows.has(dow) && !offDates.has(dk)) c++;
  }
  return c;
}

// Sisa hari kerja dari hari ini sampai akhir bulan
function getRemainingWorkingDays(year: number, month: number, dayOffDows: Set<number>, offDates: Set<string>): number {
  const todayWIB = getWIBToday();
  const dim      = new Date(year, month+1, 0).getDate();
  let c = 0;
  for (let d = 1; d <= dim; d++) {
    const dk  = `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    if (dk < todayWIB) continue;
    const dow = new Date(dk+"T12:00:00").getDay();
    if (!dayOffDows.has(dow) && !offDates.has(dk)) c++;
  }
  return c;
}

function formatRupiah(n: number): string {
  return new Intl.NumberFormat("id-ID", { style:"currency", currency:"IDR", maximumFractionDigits:0 }).format(n);
}

function initials(name: string): string {
  return name.split(" ").slice(0,2).map(w => w[0]).join("").toUpperCase();
}

function pad2(n: number) { return String(n).padStart(2,"0"); }

// ─── Modal Shell ──────────────────────────────────────────────────────────────
function ModalShell({ onClose, headerColor, title, subtitle, children, footer, wide }: {
  onClose: () => void; headerColor: string; title: string; subtitle?: string;
  children: React.ReactNode; footer: React.ReactNode; wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}/>
      <div className={`relative bg-white w-full ${wide?"sm:max-w-3xl":"sm:max-w-2xl"} rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden animate-scaleIn`}>
        <div className={`${headerColor} px-6 py-5 flex items-start justify-between flex-shrink-0`}>
          <div>
            <p className="font-bold text-white text-base tracking-tight">{title}</p>
            {subtitle && <p className="text-xs text-white/70 mt-1">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/15 transition-all duration-200">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        {children}
        <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0 bg-white/95">{footer}</div>
      </div>
    </div>
  );
}

// ─── Modal: Absen Manual (IMPROVED) ───────────────────────────────────────────
function ManualAttendanceModal({ users, prefillDate, prefillUserId, editData, onClose, onSaved }: {
  users: UserInfo[];
  prefillDate: string | null;
  prefillUserId?: string;
  editData?: ManualAttendance | null; // jika diisi → mode edit
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!editData;

  const defaultTime = () => {
    if (isEdit && editData) return toWIBTime(editData.check_in_time).replace(".",":"); // "08:30"
    return "08:00";
  };

  const [saving, setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError]     = useState("");
  const [form, setForm]       = useState({
    user_id:         editData?.user_id ?? prefillUserId ?? users[0]?.id ?? "",
    attendance_date: editData?.attendance_date ?? prefillDate ?? getWIBToday(),
    check_in_time:   defaultTime(),
    status:          (editData?.status ?? "PRESENT") as "PRESENT"|"LATE"|"SICK"|"PERMIT"|"ABSENT",
    notes:           editData?.notes ?? "",
  });

  const save = async () => {
    if (!form.user_id || !form.attendance_date || !form.check_in_time) {
      setError("Karyawan, tanggal, dan jam masuk wajib diisi"); return;
    }
    setSaving(true); setError("");
    try {
      const checkInISO = new Date(`${form.attendance_date}T${form.check_in_time}:00+07:00`).toISOString();
      const res = await fetch("/api/attendance/manual", {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ ...form, check_in_time: checkInISO }),
      });
      const d = await res.json();
      if (!d.success) { setError(d.message || "Gagal menyimpan"); return; }
      onSaved(); onClose();
    } catch { setError("Gagal menyimpan"); }
    finally { setSaving(false); }
  };

  const deleteRecord = async () => {
    if (!editData) return;
    if (!confirm("Hapus data absen manual ini?")) return;
    setDeleting(true);
    try {
      await fetch(`/api/attendance/manual?user_id=${editData.user_id}&attendance_date=${editData.attendance_date}`, { method:"DELETE" });
      onSaved(); onClose();
    } catch {}
    finally { setDeleting(false); }
  };

  const selectedUser = users.find(u => u.id === form.user_id);

  return (
    <ModalShell onClose={onClose}
      headerColor={isEdit ? "bg-gradient-to-r from-blue-600 to-blue-700" : "bg-gradient-to-r from-[#1a1a2e] to-[#16213e]"}
      title={isEdit ? "✏️ Edit Absen Manual" : "➕ Tambah Absen Manual"}
      subtitle={isEdit ? `${editData?.users?.name ?? "—"} · ${editData?.attendance_date}` : "Input data kehadiran yang belum tercatat atau koreksi absen"}
      footer={
        <div className="flex gap-3">
          {isEdit && (
            <button onClick={deleteRecord} disabled={deleting}
              className="h-11 px-5 bg-red-50 text-red-600 border border-red-200 rounded-xl text-sm font-semibold hover:bg-red-100 transition-all duration-200 disabled:opacity-50 flex items-center gap-2">
              {deleting ? <div className="w-4 h-4 border-2 border-red-300 border-t-red-600 rounded-full animate-spin"/> : "🗑️ Hapus"}
            </button>
          )}
          <button onClick={onClose} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-all duration-200">Batal</button>
          <button onClick={save} disabled={saving}
            className={`flex-1 h-11 ${isEdit?"bg-gradient-to-r from-blue-600 to-blue-700":"bg-gradient-to-r from-[#1a1a2e] to-[#16213e]"} text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2`}>
            {saving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Menyimpan...</> : "💾 Simpan"}
          </button>
        </div>
      }>
      <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
        {error && <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-3 rounded-xl flex items-center gap-2"><span>⚠️</span>{error}</div>}

        {/* Karyawan — disable di mode edit */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Karyawan</label>
          {isEdit ? (
            <div className="flex items-center gap-3 h-11 bg-gray-50 border border-gray-200 rounded-xl px-4">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex items-center justify-center text-white text-[10px] font-black">{initials(editData?.users?.name || "?")}</div>
              <span className="text-sm font-bold text-gray-700">{editData?.users?.name}</span>
              <span className="text-[10px] text-gray-400 ml-auto">{editData?.users?.role?.replace(/_/g," ")}</span>
            </div>
          ) : (
            <select value={form.user_id} onChange={e => setForm(f=>({...f,user_id:e.target.value}))}
              className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition-all">
              {users.map(u => <option key={u.id} value={u.id}>{u.name} — {u.role.replace(/_/g," ")}</option>)}
            </select>
          )}
        </div>

        {/* Tanggal + Jam */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Tanggal</label>
            <input type="date" value={form.attendance_date}
              onChange={e => setForm(f=>({...f,attendance_date:e.target.value}))}
              className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition-all"/>
            <p className="text-[10px] text-gray-400 mt-1">Bisa pilih tanggal hari ini atau sebelumnya</p>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Jam Masuk (WIB)</label>
            <input type="time" value={form.check_in_time} onChange={e => setForm(f=>({...f,check_in_time:e.target.value}))}
              className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition-all"/>
          </div>
        </div>

        {/* Status */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Status Kehadiran</label>
          <div className="grid grid-cols-5 gap-2">
            {(Object.keys(MANUAL_STATUS_LABELS) as Array<keyof typeof MANUAL_STATUS_LABELS>).map(s => {
              const cfg = MANUAL_STATUS_LABELS[s];
              const sel = form.status === s;
              return (
                <button key={s} type="button" onClick={() => setForm(f=>({...f,status:s as any}))}
                  className={`flex flex-col items-center gap-1 py-2.5 rounded-xl text-[11px] font-bold border transition-all duration-200 ${sel ? `${cfg.bg} ${cfg.color} ${cfg.border} shadow-md scale-[1.04]` : "bg-white text-gray-400 border-gray-200 hover:bg-gray-50 hover:scale-[1.02]"}`}>
                  <span className="text-base">{cfg.emoji}</span>
                  <span>{cfg.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Catatan */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
            Catatan <span className="text-gray-300 normal-case font-normal">(opsional)</span>
          </label>
          <input type="text" value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))}
            placeholder="e.g. Koreksi karena sistem error, izin keperluan mendadak..."
            className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition-all"/>
        </div>

        {/* Preview */}
        {form.user_id && form.attendance_date && form.check_in_time && (
          <div className="bg-gradient-to-br from-gray-50 to-white border border-gray-100 rounded-2xl px-4 py-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Preview</p>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex items-center justify-center text-white text-[11px] font-black flex-shrink-0">
                {initials(isEdit ? (editData?.users?.name||"?") : (selectedUser?.name||"?"))}
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-800">{isEdit ? editData?.users?.name : selectedUser?.name}</p>
                <p className="text-[11px] text-gray-500">
                  {new Date(form.attendance_date+"T12:00:00").toLocaleDateString("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
                  {" · "}<span className="font-mono font-bold">{form.check_in_time} WIB</span>
                </p>
              </div>
              <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-full border ${MANUAL_STATUS_LABELS[form.status].bg} ${MANUAL_STATUS_LABELS[form.status].color} ${MANUAL_STATUS_LABELS[form.status].border}`}>
                {MANUAL_STATUS_LABELS[form.status].emoji} {MANUAL_STATUS_LABELS[form.status].label}
              </span>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

// ─── Modal: Kelola Gaji ────────────────────────────────────────────────────────
function SalaryModal({ users, salaries, onClose, onSaved }: {
  users: UserInfo[]; salaries: UserSalary[]; onClose: () => void; onSaved: () => void;
}) {
  const salaryMap = useMemo(() => {
    const m: Record<string, UserSalary> = {};
    salaries.forEach(s => { m[s.user_id] = s; });
    return m;
  }, [salaries]);

  const [local, setLocal] = useState<Record<string, { salary_type:"FIXED"|"PERCENTAGE"; base_salary:string }>>(() => {
    const m: Record<string, { salary_type:"FIXED"|"PERCENTAGE"; base_salary:string }> = {};
    users.forEach(u => {
      const s = salaryMap[u.id];
      m[u.id] = { salary_type: s?.salary_type ?? "FIXED", base_salary: s?.base_salary?.toString() ?? "" };
    });
    return m;
  });

  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const save = async () => {
    setSaving(true); setError("");
    try {
      const ops = users.map(u => {
        const v = local[u.id];
        if (!v.base_salary) return Promise.resolve();
        return fetch("/api/attendance/salary", {
          method: "POST",
          headers: { "Content-Type":"application/json" },
          body: JSON.stringify({ user_id:u.id, salary_type:v.salary_type, base_salary:parseFloat(v.base_salary) }),
        });
      });
      await Promise.all(ops);
      onSaved(); onClose();
    } catch { setError("Gagal menyimpan"); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell onClose={onClose} headerColor="bg-gradient-to-r from-emerald-600 to-green-700"
      title="💰 Kelola Gaji Karyawan" subtitle="Atur tipe dan nominal gaji per karyawan"
      footer={
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-all">Batal</button>
          <button onClick={save} disabled={saving} className="flex-1 h-11 bg-gradient-to-r from-emerald-600 to-green-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Menyimpan...</> : "💾 Simpan Semua"}
          </button>
        </div>
      }>
      <div className="overflow-y-auto flex-1 px-6 py-4">
        {error && <div className="mb-3 bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-2.5 rounded-xl">{error}</div>}
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 text-xs text-amber-700">
          <strong>ℹ️</strong> Gaji <strong>Tetap</strong> = nominal penuh, tidak tergantung absensi.
          Gaji <strong>Persentase Absen</strong> = % kehadiran × gaji pokok.
        </div>
        <div className="space-y-3">
          {users.map(u => (
            <div key={u.id} className="bg-gradient-to-br from-gray-50 to-white rounded-2xl p-4 border border-gray-100 hover:shadow-md transition-all duration-200">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex items-center justify-center text-white text-[11px] font-black shadow-md flex-shrink-0">{initials(u.name)}</div>
                <div><p className="text-sm font-bold text-gray-800">{u.name}</p><p className="text-[10px] text-gray-400">{u.role.replace(/_/g," ")}</p></div>
                {local[u.id]?.salary_type === "FIXED" && (
                  <span className="ml-auto text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-full">💰 Tetap</span>
                )}
                {local[u.id]?.salary_type === "PERCENTAGE" && (
                  <span className="ml-auto text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-full">📊 % Absen</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">Tipe Gaji</label>
                  <select value={local[u.id]?.salary_type ?? "FIXED"} onChange={e => setLocal(p=>({...p,[u.id]:{...p[u.id],salary_type:e.target.value as any}}))}
                    className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none transition-all">
                    <option value="FIXED">💰 Tetap</option>
                    <option value="PERCENTAGE">📊 Persentase Absen</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">
                    {local[u.id]?.salary_type === "FIXED" ? "Nominal (Rp)" : "Gaji Pokok (Rp)"}
                  </label>
                  <input type="number" min={0} value={local[u.id]?.base_salary ?? ""} placeholder="e.g. 3000000"
                    onChange={e => setLocal(p=>({...p,[u.id]:{...p[u.id],base_salary:e.target.value}}))}
                    className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none transition-all"/>
                </div>
              </div>
              {local[u.id]?.base_salary && (
                <p className="text-[11px] text-gray-400 mt-2">
                  = <span className="font-bold text-gray-700">{formatRupiah(parseFloat(local[u.id].base_salary||"0"))}</span>
                  {local[u.id]?.salary_type === "PERCENTAGE" && <span className="text-gray-400"> × persen kehadiran bulan ini</span>}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </ModalShell>
  );
}

// ─── Modal: Kelola Cuti ────────────────────────────────────────────────────────
function LeaveModal({ users, leaveData, calYear, calMonth, onClose, onSaved }: {
  users: UserInfo[]; leaveData: UserLeaveData[]; calYear: number; calMonth: number;
  onClose: () => void; onSaved: () => void;
}) {
  const [uid, setUid]           = useState(users[0]?.id ?? "");
  const [date, setDate]         = useState("");
  const [reason, setReason]     = useState("");
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");
  const [deleting, setDeleting] = useState<string|null>(null);

  const userData = leaveData.find(d => d.user.id === uid);

  const addLeave = async () => {
    if (!uid || !date) { setError("Pilih karyawan dan tanggal"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/attendance/leave", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ user_id:uid, leave_date:date, reason }),
      });
      const d = await res.json();
      if (!d.success) { setError(d.message||"Gagal"); return; }
      onSaved(); setDate(""); setReason("");
    } catch { setError("Gagal menambah cuti"); }
    finally { setSaving(false); }
  };

  const deleteLeave = async (id: string) => {
    setDeleting(id);
    try { await fetch(`/api/attendance/leave?id=${id}`, { method:"DELETE" }); onSaved(); }
    catch {} finally { setDeleting(null); }
  };

  const dim     = new Date(calYear, calMonth+1, 0).getDate();
  const minDate = `${calYear}-${pad2(calMonth+1)}-01`;
  const maxDate = `${calYear}-${pad2(calMonth+1)}-${pad2(dim)}`;

  return (
    <ModalShell onClose={onClose} headerColor="bg-gradient-to-r from-cyan-600 to-teal-700"
      title="🌴 Kelola Cuti" subtitle={`${MONTH_NAMES[calMonth]} ${calYear}`}
      footer={<button onClick={onClose} className="w-full h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-all">Tutup</button>}>
      <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">Karyawan</label>
          <select value={uid} onChange={e => setUid(e.target.value)} className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-cyan-400/20">
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>

        {userData && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label:"Jatah Bulan Ini", val:userData.balance.quota,        color:"text-teal-700",    bg:"bg-teal-50",    border:"border-teal-200"    },
              { label:"Carry-over",      val:userData.balance.carried_over, color:"text-blue-700",    bg:"bg-blue-50",    border:"border-blue-200"    },
              { label:"Tersedia",        val:userData.available,            color:userData.available>0?"text-emerald-700":"text-red-700", bg:userData.available>0?"bg-emerald-50":"bg-red-50", border:userData.available>0?"border-emerald-200":"border-red-200" },
            ].map(c => (
              <div key={c.label} className={`${c.bg} border ${c.border} rounded-2xl p-3 text-center`}>
                <p className={`text-2xl font-black ${c.color}`}>{c.val}</p>
                <p className="text-[10px] text-gray-500 font-medium mt-1">{c.label}</p>
              </div>
            ))}
          </div>
        )}

        <div className="bg-gradient-to-br from-cyan-50 to-teal-50 border border-cyan-100 rounded-2xl p-4">
          <p className="text-xs font-bold text-cyan-700 mb-3">Tambah Cuti</p>
          {error && <div className="mb-3 bg-red-50 border border-red-200 text-red-600 text-xs px-3 py-2 rounded-xl">{error}</div>}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">Tanggal Cuti</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} min={minDate} max={maxDate}
                className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-cyan-400"/>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">Alasan</label>
              <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Acara keluarga"
                className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-cyan-400"/>
            </div>
          </div>
          <button onClick={addLeave} disabled={saving || !date || (userData?.available??0)<=0}
            className="w-full h-10 bg-gradient-to-r from-cyan-600 to-teal-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Menyimpan...</> : "➕ Tambah Cuti"}
          </button>
          {(userData?.available??0)<=0 && <p className="text-[11px] text-red-500 text-center mt-2">Saldo cuti habis untuk bulan ini</p>}
        </div>

        {userData && userData.requests.length > 0 && (
          <div>
            <p className="text-xs font-bold text-gray-600 mb-3 uppercase tracking-wide">Cuti {MONTH_NAMES[calMonth]} {calYear}</p>
            <div className="space-y-2">
              {userData.requests.map(r => (
                <div key={r.id} className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-center justify-between shadow-sm">
                  <div>
                    <p className="text-sm font-bold text-gray-800">{new Date(r.leave_date+"T12:00:00").toLocaleDateString("id-ID",{weekday:"short",day:"numeric",month:"short"})}</p>
                    {r.reason && <p className="text-[11px] text-gray-400 mt-0.5">{r.reason}</p>}
                  </div>
                  <button onClick={() => deleteLeave(r.id)} disabled={deleting===r.id}
                    className="w-8 h-8 flex items-center justify-center rounded-xl text-red-400 hover:bg-red-50 hover:text-red-600 transition-all font-bold text-lg flex-shrink-0">
                    {deleting===r.id ? <div className="w-4 h-4 border-2 border-red-300 border-t-red-500 rounded-full animate-spin"/> : "×"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

// ─── Modal: Day Off ────────────────────────────────────────────────────────────
function DayOffModal({ users, dayOffs, onClose, onSaved }: {
  users: UserInfo[]; dayOffs: DayOff[]; onClose: () => void; onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");
  const [error, setError]   = useState("");
  const origMap = useMemo(() => {
    const m: Record<string,Set<number>> = {};
    dayOffs.forEach(d => { if (!m[d.user_id]) m[d.user_id]=new Set(); m[d.user_id].add(d.day_of_week); });
    return m;
  }, [dayOffs]);
  const [local, setLocal] = useState<Record<string,Set<number>>>(() => {
    const m: Record<string,Set<number>> = {};
    dayOffs.forEach(d => { if (!m[d.user_id]) m[d.user_id]=new Set(); m[d.user_id].add(d.day_of_week); });
    return m;
  });
  const toggle = (uid: string, dow: number) => setLocal(prev => {
    const n={...prev}; if (!n[uid]) n[uid]=new Set();
    const s=new Set(n[uid]); s.has(dow)?s.delete(dow):s.add(dow); n[uid]=s; return n;
  });
  const save = async () => {
    setSaving(true); setError("");
    try {
      const ops: Promise<any>[] = [];
      users.forEach(u => {
        const orig=origMap[u.id]||new Set<number>(), cur=local[u.id]||new Set<number>();
        cur.forEach(d => { if (!orig.has(d)) ops.push(fetch("/api/attendance/day-off",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({user_id:u.id,day_of_week:d})})); });
        orig.forEach(d => { if (!cur.has(d)) ops.push(fetch(`/api/attendance/day-off?user_id=${u.id}&day_of_week=${d}`,{method:"DELETE"})); });
      });
      await Promise.all(ops); onSaved(); onClose();
    } catch { setError("Gagal menyimpan."); }
    finally { setSaving(false); }
  };
  const shown = filter ? users.filter(u => u.id===filter) : users;
  return (
    <ModalShell onClose={onClose} headerColor="bg-gradient-to-r from-[#1a1a2e] to-[#16213e]" title="📅 Libur Mingguan Berulang" subtitle="Pilih hari libur tetap per karyawan"
      footer={
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-all">Batal</button>
          <button onClick={save} disabled={saving} className="flex-1 h-11 bg-gradient-to-r from-[#1a1a2e] to-[#16213e] text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Menyimpan...</> : "💾 Simpan"}
          </button>
        </div>
      }>
      <div className="px-6 pt-5 pb-3 flex-shrink-0 border-b border-gray-100">
        <select value={filter} onChange={e => setFilter(e.target.value)} className="w-full sm:w-72 h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none">
          <option value="">Semua Karyawan</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name} — {u.role.replace(/_/g," ")}</option>)}
        </select>
      </div>
      <div className="overflow-y-auto flex-1 px-6 py-4">
        {error && <div className="mb-3 bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-2.5 rounded-xl">{error}</div>}
        <div className="space-y-3">
          {shown.map(u => (
            <div key={u.id} className="bg-gradient-to-br from-gray-50 to-white rounded-2xl p-4 border border-gray-100">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex items-center justify-center text-white text-[10px] font-black flex-shrink-0 shadow-md">{initials(u.name)}</div>
                <div><p className="text-sm font-bold text-gray-800">{u.name}</p><p className="text-[10px] text-gray-400">{u.role.replace(/_/g," ")}</p></div>
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {DAY_NAMES.map((day, dow) => { const off=local[u.id]?.has(dow)??false; return (
                  <button key={dow} type="button" onClick={() => toggle(u.id,dow)} title={DAY_FULL[dow]}
                    className={`h-9 rounded-xl text-[11px] font-bold transition-all duration-200 border ${off?"bg-red-500 text-white border-red-500 shadow-md scale-105":"bg-white text-gray-400 border-gray-200 hover:bg-gray-100 hover:text-gray-600 hover:scale-105"}`}>{day}</button>
                ); })}
              </div>
              {local[u.id]&&local[u.id].size>0 && <p className="text-[11px] text-red-500 font-medium mt-2.5 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0"/>Libur: {Array.from(local[u.id]).sort().map(d=>DAY_FULL[d]).join(", ")}</p>}
            </div>
          ))}
        </div>
      </div>
    </ModalShell>
  );
}

// ─── Today Attendance Card ─────────────────────────────────────────────────────
function TodayAttendanceCard({ status, loading, onRefresh }: {
  status: { alreadyAttended:boolean; needEnroll:boolean; isAttendanceTime:boolean; isDayOff:boolean; shift:string; reason?:string; openAt?:string; closeAt?:string }|null;
  loading: boolean; onRefresh: () => void;
}) {
  if (loading) return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 animate-pulse">
      <div className="flex items-center gap-4"><div className="w-14 h-14 rounded-2xl bg-gray-100"/><div className="flex-1 space-y-2"><div className="h-3 bg-gray-100 rounded w-32"/><div className="h-5 bg-gray-100 rounded w-48"/><div className="h-3 bg-gray-100 rounded w-24"/></div><div className="w-32 h-10 bg-gray-100 rounded-xl"/></div>
    </div>
  );
  if (!status) return null;
  const goAbsen = () => { window.location.href = "/face-verify?from=/dashboard/attendance"; };
  let cfg: any;
  if (status.alreadyAttended) {
    cfg = { icon:"✅", gradient:"from-emerald-50 to-green-50", iconBg:"bg-emerald-100", badge:"bg-emerald-100 text-emerald-700 border-emerald-200", dot:"bg-emerald-400", badgeText:"Sudah Absen", title:"Absensi Hari Ini Tercatat", sub:`Shift ${status.shift}`, showBtn:false };
  } else if (status.isDayOff) {
    cfg = { icon:"🏖️", gradient:"from-orange-50 to-amber-50", iconBg:"bg-orange-100", badge:"bg-orange-100 text-orange-700 border-orange-200", dot:"bg-orange-400", badgeText:"Hari Libur", title:"Kamu Libur Hari Ini", sub:"Tidak perlu absen", showBtn:false };
  } else if (!status.isAttendanceTime && status.reason==="TOO_EARLY") {
    cfg = { icon:"⏳", gradient:"from-blue-50 to-indigo-50", iconBg:"bg-blue-100", badge:"bg-blue-100 text-blue-700 border-blue-200", dot:"bg-blue-400", badgeText:"Belum Buka", title:"Absen Belum Dibuka", sub:`Buka pukul ${status.openAt} · Shift ${status.shift}`, showBtn:false };
  } else if (!status.isAttendanceTime && status.reason==="TOO_LATE") {
    cfg = { icon:"⌛", gradient:"from-red-50 to-rose-50", iconBg:"bg-red-100", badge:"bg-red-100 text-red-600 border-red-200", dot:"bg-red-400", badgeText:"Waktu Habis", title:"Waktu Absen Sudah Lewat", sub:`Batas ${status.closeAt} · Shift ${status.shift}`, showBtn:false };
  } else if (status.isAttendanceTime) {
    cfg = { icon:"🟡", gradient:"from-amber-50 to-yellow-50", iconBg:"bg-amber-100", badge:"bg-amber-100 text-amber-700 border-amber-200", dot:"bg-amber-400 animate-pulse", badgeText:"Belum Absen", title:"Kamu Belum Absen Hari Ini", sub:`Jam absen: ${status.openAt} – ${status.closeAt} WIB · Shift ${status.shift}`, showBtn:true, btnLabel:"Absen Sekarang →", btnColor:"bg-gradient-to-r from-[#1a1a2e] to-[#16213e]", btnAction:goAbsen };
  } else { return null; }
  return (
    <div className={`bg-gradient-to-br ${cfg.gradient} rounded-2xl border border-gray-100 shadow-sm p-5`}>
      <div className="flex items-center gap-4">
        <div className={`w-14 h-14 rounded-2xl ${cfg.iconBg} flex items-center justify-center flex-shrink-0 shadow-sm`}><span className="text-2xl">{cfg.icon}</span></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1"><span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border ${cfg.badge}`}><span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}/>{cfg.badgeText}</span></div>
          <p className="font-bold text-gray-800 text-sm">{cfg.title}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{cfg.sub}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={onRefresh} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-400 hover:text-gray-600 transition-all shadow-sm" title="Refresh">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
          </button>
          {cfg.showBtn && <button onClick={cfg.btnAction} className={`${cfg.btnColor} text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-md hover:shadow-lg transition-all whitespace-nowrap`}>{cfg.btnLabel}</button>}
        </div>
      </div>
    </div>
  );
}

// ─── Month Selector ────────────────────────────────────────────────────────────
function MonthSelector({ onSelect }: { onSelect: (year:number, month:number) => void }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const years = Array.from({length:4},(_,i) => today.getFullYear()-1+i);
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 animate-fadeIn">
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] shadow-lg mb-4"><span className="text-3xl">📊</span></div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-[#1a1a2e] to-[#16213e] bg-clip-text text-transparent tracking-tight">Absensi Karyawan</h1>
        <p className="text-sm text-gray-400 mt-2">Pilih bulan untuk melihat laporan absensi</p>
      </div>
      <div className="flex items-center justify-center gap-2.5 mb-8">
        <button onClick={() => setYear(y=>y-1)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-400 hover:bg-gray-50 transition-all shadow-sm active:scale-95">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
        </button>
        <div className="flex gap-2 flex-wrap justify-center">{years.map(y=>(
          <button key={y} onClick={() => setYear(y)} className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 border ${year===y?"bg-gradient-to-r from-[#1a1a2e] to-[#16213e] text-white border-[#1a1a2e] shadow-md scale-105":"bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:scale-105"}`}>{y}</button>
        ))}</div>
        <button onClick={() => setYear(y=>y+1)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-400 hover:bg-gray-50 transition-all shadow-sm active:scale-95">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
        </button>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
        {MONTH_NAMES.map((name,idx) => {
          const isCurrent = year===today.getFullYear() && idx===today.getMonth();
          const isFuture  = year>today.getFullYear() || (year===today.getFullYear() && idx>today.getMonth());
          return (
            <button key={idx} onClick={() => !isFuture && onSelect(year,idx)} disabled={isFuture}
              className={`relative group flex flex-col items-center justify-center gap-2 py-7 rounded-2xl border transition-all duration-300 ${isCurrent?"bg-gradient-to-br from-[#1a1a2e] to-[#16213e] border-[#1a1a2e] text-white shadow-xl scale-[1.02]":isFuture?"bg-gray-50/80 border-gray-100 text-gray-300 cursor-not-allowed":"bg-white border-gray-200 text-gray-700 hover:border-[#1a1a2e] hover:bg-gradient-to-br hover:from-[#1a1a2e]/5 hover:to-[#16213e]/5 hover:text-[#1a1a2e] hover:scale-105 hover:shadow-lg cursor-pointer shadow-sm"}`}>
              {isCurrent && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 animate-pulse"/>}
              <span className="text-4xl font-black tracking-tighter">{String(idx+1).padStart(2,"0")}</span>
              <span className={`text-[11px] font-semibold uppercase tracking-wide ${isCurrent?"text-white/70":isFuture?"text-gray-300":"text-gray-400 group-hover:text-[#1a1a2e]/60"}`}>{MONTH_SHORT[idx]}</span>
              {isCurrent && <span className="text-[9px] text-emerald-300 font-bold tracking-wider uppercase mt-1">Bulan ini</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function AttendanceDashboardPage() {
  const [selectedMonth,   setSelectedMonth]   = useState<{year:number;month:number}|null>(null);
  const [attendances,     setAttendances]     = useState<Attendance[]>([]);
  const [manualRecords,   setManualRecords]   = useState<ManualAttendance[]>([]);
  const [dayOffs,         setDayOffs]         = useState<DayOff[]>([]);
  const [allDateOffs,     setAllDateOffs]     = useState<DateOff[]>([]);
  const [allUsers,        setAllUsers]        = useState<UserInfo[]>([]);
  const [salaries,        setSalaries]        = useState<UserSalary[]>([]);
  const [leaveData,       setLeaveData]       = useState<UserLeaveData[]>([]);
  const [loading,         setLoading]         = useState(false);
  const [currentUser,     setCurrentUser]     = useState<any>(null);
  const [filterUser,      setFilterUser]      = useState("Semua");
  const [selectedDate,    setSelectedDate]    = useState<string|null>(null);
  const [todayStatus,     setTodayStatus]     = useState<any>(null);
  const [statusLoading,   setStatusLoading]   = useState(false);
  const [activeTab,       setActiveTab]       = useState<"calendar"|"summary"|"salary"|"leave">("calendar");

  // Modal state
  const [showDayOffModal,  setShowDayOffModal]  = useState(false);
  const [showManualModal,  setShowManualModal]  = useState(false);
  const [showSalaryModal,  setShowSalaryModal]  = useState(false);
  const [showLeaveModal,   setShowLeaveModal]   = useState(false);
  // ✅ NEW: edit modal state
  const [editManualData,   setEditManualData]   = useState<ManualAttendance|null>(null);
  const [manualPrefillDate, setManualPrefillDate] = useState<string|null>(null);
  const [manualPrefillUser, setManualPrefillUser] = useState<string|undefined>(undefined);

  const calYear  = selectedMonth?.year  ?? new Date().getFullYear();
  const calMonth = selectedMonth?.month ?? new Date().getMonth();

  // ── Fetchers ─────────────────────────────────────────────────────────────
  const fetchAttendance    = useCallback(async () => { const r=await fetch("/api/attendance"); const d=await r.json(); if(d.success) setAttendances((d.data||[]).map((a:Attendance)=>({...a,displayStatus:getDisplayStatus(a),source:"AUTO"}))); },[]);
  const fetchManualRecords = useCallback(async (y:number,m:number) => { const r=await fetch(`/api/attendance/manual?year=${y}&month=${m+1}`); const d=await r.json(); if(d.success) setManualRecords(d.data||[]); },[]);
  const fetchDayOffs       = useCallback(async () => { const r=await fetch("/api/attendance/day-off"); const d=await r.json(); if(d.success) setDayOffs(d.data||[]); },[]);
  const fetchAllDateOffs   = useCallback(async () => { const r=await fetch("/api/attendance/date-off"); const d=await r.json(); if(d.success) setAllDateOffs(d.data||[]); },[]);
  const fetchAllUsers      = useCallback(async () => { const r=await fetch("/api/attendance/users"); const d=await r.json(); if(d.success) setAllUsers(d.data||[]); },[]);
  const fetchSalaries      = useCallback(async () => { const r=await fetch("/api/attendance/salary"); const d=await r.json(); if(d.success) setSalaries(d.data?.map((s:any)=>s)||[]); },[]);
  const fetchLeaveData     = useCallback(async (y:number,m:number) => { const r=await fetch(`/api/attendance/leave?year=${y}&month=${m+1}`); const d=await r.json(); if(d.success) setLeaveData(d.data||[]); },[]);

  const fetchTodayStatus = useCallback(async () => {
    setStatusLoading(true);
    try { const r=await fetch("/api/auth/face-status"); const d=await r.json(); if(d.success) setTodayStatus({alreadyAttended:d.alreadyAttended??false,needEnroll:d.needEnroll??false,isAttendanceTime:d.isAttendanceTime??false,isDayOff:d.isDayOff??false,shift:d.shift??"PAGI",reason:d.reason,openAt:d.openAt,closeAt:d.closeAt}); }
    catch {} finally { setStatusLoading(false); }
  },[]);

  useEffect(() => { getCurrentUserClient().then(u=>setCurrentUser(u)); fetchTodayStatus(); },[]);

  useEffect(() => {
    if (!selectedMonth) return;
    const { year, month } = selectedMonth;
    setLoading(true); setSelectedDate(null); setFilterUser("Semua");
    const tasks: Promise<any>[] = [fetchAttendance(), fetchDayOffs(), fetchAllDateOffs(), fetchManualRecords(year,month)];
    if (currentUser?.role==="ADMIN") tasks.push(fetchAllUsers(), fetchSalaries(), fetchLeaveData(year,month));
    Promise.all(tasks).finally(()=>setLoading(false));
  },[selectedMonth]); // eslint-disable-line

  // ── Helpers open modal ───────────────────────────────────────────────────
  const openAddManual = useCallback((date?: string, userId?: string) => {
    setEditManualData(null);
    setManualPrefillDate(date ?? selectedDate);
    setManualPrefillUser(userId);
    if (allUsers.length === 0) fetchAllUsers();
    setShowManualModal(true);
  }, [selectedDate, allUsers, fetchAllUsers]);

  const openEditManual = useCallback((record: ManualAttendance) => {
    setEditManualData(record);
    setManualPrefillDate(null);
    setManualPrefillUser(undefined);
    if (allUsers.length === 0) fetchAllUsers();
    setShowManualModal(true);
  }, [allUsers, fetchAllUsers]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const dayOffByName  = useMemo(() => { const m:Record<string,Set<number>>={};dayOffs.forEach(d=>{const n=d.users?.name;if(!n)return;if(!m[n])m[n]=new Set();m[n].add(d.day_of_week);}); return m; },[dayOffs]);
  const dateOffByName = useMemo(() => { const m:Record<string,Set<string>>={};allDateOffs.forEach(d=>{const n=d.users?.name;if(!n)return;if(!m[n])m[n]=new Set();m[n].add(d.off_date);}); return m; },[allDateOffs]);

  const isDayOffForUser    = (name:string,dk:string) => { const dow=new Date(dk+"T12:00:00").getDay(); return (dayOffByName[name]?.has(dow)??false)||(dateOffByName[name]?.has(dk)??false); };
  const getOffUsersForDate = (dk:string) => { const dow=new Date(dk+"T12:00:00").getDay(); const w=Object.entries(dayOffByName).filter(([,s])=>s.has(dow)).map(([n])=>n); const s=Object.entries(dateOffByName).filter(([,s])=>s.has(dk)).map(([n])=>n); return [...new Set([...w,...s])]; };

  // manualMap: user_id_date → record
  const manualMap = useMemo(() => {
    const m: Record<string,ManualAttendance> = {};
    manualRecords.forEach(r => { m[`${r.user_id}_${r.attendance_date}`] = r; });
    return m;
  },[manualRecords]);

  // Merged auto + manual
  const mergedAttendances = useMemo((): Attendance[] => {
    const auto = attendances.map(a=>({...a,source:"AUTO" as const}));
    const manualExtra: Attendance[] = manualRecords
      .filter(mr => !auto.some(a => (a.user_id??"")=== mr.user_id && toWIBDateKey(a.check_in_time||a.created_at)===mr.attendance_date))
      .map(mr => ({
        id:mr.id, user_id:mr.user_id,
        user_name:mr.users?.name||"Unknown", user_role:mr.users?.role||"", user_shift:(mr.users?.shift as "PAGI"|"SORE")||"PAGI",
        date:mr.check_in_time, check_in_time:mr.check_in_time, status:mr.status, method:"MANUAL",
        latitude:null, longitude:null, accuracy:null, device:"Manual entry", ip_address:"", face_distance:null, created_at:mr.check_in_time,
        displayStatus:(mr.status==="PRESENT"?"PRESENT":mr.status==="LATE"?"LATE":"SKIP") as "PRESENT"|"LATE"|"SKIP",
        source:"MANUAL" as const,
      }));
    return [...auto,...manualExtra];
  },[attendances,manualRecords]);

  const thisMonthKey  = `${calYear}-${pad2(calMonth+1)}`;
  const thisMonthAtt  = mergedAttendances.filter(a=>toWIBDateKey(a.check_in_time||a.created_at).startsWith(thisMonthKey));

  const byDate = useMemo(() => {
    const m:Record<string,Attendance[]>={};
    const filtered = filterUser==="Semua"?mergedAttendances:mergedAttendances.filter(a=>a.user_name===filterUser);
    filtered.forEach(a=>{const k=toWIBDateKey(a.check_in_time||a.created_at);if(!m[k])m[k]=[];m[k].push(a);});
    return m;
  },[mergedAttendances,filterUser]);

  const calDays = useMemo(() => {
    const fd=new Date(calYear,calMonth,1).getDay(),dim=new Date(calYear,calMonth+1,0).getDate();
    const c:(number|null)[]=[]; for(let i=0;i<fd;i++)c.push(null); for(let d=1;d<=dim;d++)c.push(d); return c;
  },[calYear,calMonth]);

  const todayKey    = getWIBToday();
  const uniqueUsers = useMemo(() => { if(allUsers.length>0)return allUsers.map(u=>u.name).sort(); return[...new Set(mergedAttendances.map(a=>a.user_name))].sort(); },[allUsers,mergedAttendances]);
  const salaryMap   = useMemo(() => { const m:Record<string,UserSalary>={};salaries.forEach(s=>m[s.user_id]=s); return m; },[salaries]);

  // ✅ FIX: userSummary dengan kalkulasi "tidak hadir" yang benar
  const userSummary = useMemo(() => {
    const m: Record<string,{name:string;present:number;late:number;skip:number;score:number;pastWorkdays:number;totalWorkdays:number;pct:number;remainingDays:number;userId:string}> = {};

    thisMonthAtt.forEach(a => {
      if (!m[a.user_name]) m[a.user_name]={name:a.user_name,present:0,late:0,skip:0,score:0,pastWorkdays:0,totalWorkdays:0,pct:0,remainingDays:0,userId:""};
      if (a.displayStatus==="PRESENT") { m[a.user_name].present++; m[a.user_name].score+=1.0; }
      else if (a.displayStatus==="SKIP") { m[a.user_name].skip++; m[a.user_name].score+=0.75; }
      else { m[a.user_name].late++; m[a.user_name].score+=0.5; }
    });

    allUsers.forEach(u => { if (m[u.name]) m[u.name].userId=u.id; });

    Object.values(m).forEach(u => {
      const dows = dayOffByName[u.name] ?? new Set();
      const offs = dateOffByName[u.name] ?? new Set();
      // ✅ pastWorkdays = hari kerja yang sudah lewat (untuk hitung absent)
      u.pastWorkdays  = countPastWorkingDays(calYear, calMonth, dows, offs);
      // totalWorkdays = seluruh hari kerja bulan ini (untuk referensi)
      u.totalWorkdays = countWorkingDays(calYear, calMonth, dows, offs);
      // ✅ pct dihitung dari pastWorkdays agar tidak lebih dari 100%
      u.pct           = u.pastWorkdays > 0 ? Math.round((u.score / u.pastWorkdays) * 100) : 0;
      u.remainingDays = getRemainingWorkingDays(calYear, calMonth, dows, offs);
    });

    allUsers.forEach(u => {
      if (!m[u.name]) {
        const dows = dayOffByName[u.name] ?? new Set();
        const offs = dateOffByName[u.name] ?? new Set();
        m[u.name] = {
          name:u.name, present:0, late:0, skip:0, score:0,
          pastWorkdays:  countPastWorkingDays(calYear,calMonth,dows,offs),
          totalWorkdays: countWorkingDays(calYear,calMonth,dows,offs),
          pct:0, remainingDays:getRemainingWorkingDays(calYear,calMonth,dows,offs), userId:u.id,
        };
      }
    });

    return Object.values(m).sort((a,b)=>b.pct-a.pct);
  },[thisMonthAtt,dayOffByName,dateOffByName,calYear,calMonth,allUsers]);

  const thisMonthPresent = thisMonthAtt.filter(a=>a.displayStatus==="PRESENT").length;
  const thisMonthLate    = thisMonthAtt.filter(a=>a.displayStatus==="LATE").length;
  const thisMonthDays    = new Set(thisMonthAtt.map(a=>toWIBDateKey(a.check_in_time||a.created_at))).size;

  const selectedAttendances = selectedDate
    ? (byDate[selectedDate]||[]).sort((a,b)=>new Date(a.check_in_time).getTime()-new Date(b.check_in_time).getTime())
    : [];

  const refreshAll = useCallback(() => {
    if (!selectedMonth) return;
    setLoading(true);
    const {year,month}=selectedMonth;
    Promise.all([fetchAttendance(),fetchDayOffs(),fetchAllDateOffs(),fetchManualRecords(year,month),...(currentUser?.role==="ADMIN"?[fetchAllUsers(),fetchSalaries(),fetchLeaveData(year,month)]:[])])
      .finally(()=>setLoading(false));
  },[selectedMonth,currentUser]);

  if (!selectedMonth) return (
    <DashboardLayout>
      <MonthSelector onSelect={(y,m)=>setSelectedMonth({year:y,month:m})}/>
      <style jsx global>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}.animate-fadeIn{animation:fadeIn 0.35s ease-out;}`}</style>
    </DashboardLayout>
  );

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6 animate-fadeIn">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedMonth(null)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-all shadow-sm active:scale-95">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
            </button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 flex-wrap">
                <span className="bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">{currentUser?.role==="ADMIN"?"Laporan Absensi":"Absensi Saya"}</span>
                <span className="text-gray-300">—</span>
                <span className="bg-gradient-to-r from-[#1a1a2e] to-[#16213e] bg-clip-text text-transparent">{MONTH_NAMES[calMonth]} {calYear}</span>
              </h1>
              <p className="text-xs text-gray-400 mt-1">{thisMonthDays} hari hadir · {thisMonthPresent} tepat waktu · {thisMonthLate} terlambat</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {currentUser?.role==="ADMIN" && (<>
              <button onClick={() => openAddManual()} className="flex items-center gap-1.5 text-xs font-bold text-[#1a1a2e] bg-slate-100 border border-slate-200 px-4 py-2 rounded-xl hover:bg-slate-200 transition-all active:scale-95">✏️ Absen Manual</button>
              <button onClick={() => { if(allUsers.length===0)fetchAllUsers(); setShowDayOffModal(true); }} className="flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-4 py-2 rounded-xl hover:bg-red-100 transition-all active:scale-95">📅 Libur Mingguan</button>
              <button onClick={() => { if(allUsers.length===0)fetchAllUsers(); setShowSalaryModal(true); }} className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-xl hover:bg-emerald-100 transition-all active:scale-95">💰 Gaji</button>
              <button onClick={() => { if(allUsers.length===0)fetchAllUsers(); fetchLeaveData(calYear,calMonth); setShowLeaveModal(true); }} className="flex items-center gap-1.5 text-xs font-bold text-cyan-600 bg-cyan-50 border border-cyan-200 px-4 py-2 rounded-xl hover:bg-cyan-100 transition-all active:scale-95">🌴 Cuti</button>
            </>)}
            <button onClick={refreshAll} className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 border border-gray-200 px-4 py-2 rounded-xl bg-white hover:shadow-md transition-all active:scale-95">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>Refresh
            </button>
          </div>
        </div>

        <TodayAttendanceCard status={todayStatus} loading={statusLoading} onRefresh={fetchTodayStatus}/>

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            {label:"Hari Hadir",  value:thisMonthDays,     icon:"📅", gradient:"from-gray-50 to-gray-100",     iconBg:"bg-gray-100"   },
            {label:"Tepat Waktu", value:thisMonthPresent,  icon:"✅", gradient:"from-emerald-50 to-green-100", iconBg:"bg-emerald-100" },
            {label:"Terlambat",   value:thisMonthLate,     icon:"⏰", gradient:"from-amber-50 to-yellow-100",  iconBg:"bg-amber-100"   },
            {label:"Karyawan",    value:uniqueUsers.length,icon:"👥", gradient:"from-blue-50 to-indigo-100",   iconBg:"bg-blue-100"    },
          ].map(c=>(
            <div key={c.label} className={`bg-gradient-to-br ${c.gradient} rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 p-5 hover:scale-[1.02]`}>
              <div className="flex items-start justify-between mb-3">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{c.label}</p>
                <div className={`w-8 h-8 rounded-xl ${c.iconBg} flex items-center justify-center shadow-sm`}><span className="text-base">{c.icon}</span></div>
              </div>
              <p className="text-3xl font-black tracking-tight text-gray-800">
                {loading?<span className="inline-block w-10 h-8 bg-white/50 rounded-lg animate-pulse"/>:c.value}
              </p>
              <p className="text-[10px] text-gray-400 font-medium mt-1">{MONTH_SHORT[calMonth]} {calYear}</p>
            </div>
          ))}
        </div>

        {/* ── Tabs (admin only) ── */}
        {currentUser?.role==="ADMIN" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-1.5 flex gap-1">
            {([{id:"calendar",label:"📅 Kalender"},{id:"summary",label:"📊 Ringkasan"},{id:"salary",label:"💰 Rekap Gaji"},{id:"leave",label:"🌴 Cuti"}] as const).map(t=>(
              <button key={t.id} onClick={()=>setActiveTab(t.id)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 ${activeTab===t.id?"bg-gradient-to-r from-[#1a1a2e] to-[#16213e] text-white shadow-md":"text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Filter ── */}
        {currentUser?.role==="ADMIN" && activeTab==="calendar" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">🎯 Filter Karyawan</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={()=>setFilterUser("Semua")} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${filterUser==="Semua"?"bg-gradient-to-r from-[#1a1a2e] to-[#16213e] text-white shadow-md scale-105":"bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"}`}>Semua</button>
              {uniqueUsers.map(n=>(
                <button key={n} onClick={()=>setFilterUser(n)} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${filterUser===n?"bg-gradient-to-r from-[#1a1a2e] to-[#16213e] text-white shadow-md scale-105":"bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"}`}>{n}</button>
              ))}
            </div>
          </div>
        )}

        {/* ════ TAB KALENDER ════ */}
        {(activeTab==="calendar" || currentUser?.role!=="ADMIN") && (
          <>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-lg transition-all duration-300">
              <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-gray-800 tracking-tight">{MONTH_NAMES[calMonth]} {calYear}</span>
                  {calYear===new Date().getFullYear()&&calMonth===new Date().getMonth()&&<span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 border border-emerald-200 px-3 py-1 rounded-full">Bulan ini</span>}
                </div>
                <div className="hidden sm:flex items-center gap-4 flex-wrap">
                  {[["bg-emerald-400","Tepat"],["bg-amber-400","Terlambat"],["bg-gray-400","Skip"],["bg-blue-400","Manual"],["bg-red-300","Libur"]].map(([c,l])=>(
                    <div key={l} className="flex items-center gap-1.5 text-[11px] text-gray-500 font-medium"><span className={`w-2.5 h-2.5 rounded-full ${c}`}/>{l}</div>
                  ))}
                </div>
              </div>

              <div className="p-4 sm:p-6">
                <div className="grid grid-cols-7 mb-4">
                  {DAY_NAMES.map(d=><div key={d} className="text-center text-[10px] font-black uppercase py-2 text-gray-400 tracking-widest">{d}</div>)}
                </div>
                {loading ? (
                  <div className="grid grid-cols-7 gap-2">{Array(35).fill(0).map((_,i)=><div key={i} className="h-20 rounded-xl bg-gray-50 animate-pulse"/>)}</div>
                ) : (
                  <div className="grid grid-cols-7 gap-2">
                    {calDays.map((day,idx) => {
                      if (day===null) return <div key={`e-${idx}`}/>;
                      const dk   = `${calYear}-${pad2(calMonth+1)}-${pad2(day)}`;
                      const dd   = byDate[dk]||[];
                      const pc   = dd.filter(a=>a.displayStatus==="PRESENT").length;
                      const lc   = dd.filter(a=>a.displayStatus==="LATE").length;
                      const sc   = dd.filter(a=>a.displayStatus==="SKIP").length;
                      const mc   = dd.filter(a=>a.source==="MANUAL").length;
                      const tot  = dd.length;
                      const isTod=dk===todayKey, isSel=dk===selectedDate;
                      const isUserDayOff = filterUser!=="Semua"?isDayOffForUser(filterUser,dk):false;
                      const hasAnyDayOff = filterUser==="Semua"?getOffUsersForDate(dk).length>0:false;
                      const hasManual    = mc > 0;
                      return (
                        <button key={day} onClick={()=>setSelectedDate(p=>p===dk?null:dk)}
                          className={`relative flex flex-col items-start justify-start p-3 rounded-xl min-h-[80px] transition-all duration-300 ${isSel?"bg-gradient-to-br from-[#1a1a2e] to-[#16213e] shadow-xl scale-[1.02] ring-2 ring-[#1a1a2e]/30":isTod?"bg-gradient-to-br from-blue-50 to-indigo-50 ring-1 ring-blue-200":isUserDayOff&&!tot?"bg-gradient-to-br from-red-50 to-rose-50":tot?"bg-gray-50/80 hover:bg-gray-100 hover:shadow-md":"hover:bg-gray-50 hover:shadow-sm"}`}>
                          {isUserDayOff&&filterUser!=="Semua"&&<span className={`absolute top-2 right-2 w-2 h-2 rounded-full ${isSel?"bg-red-300 animate-pulse":"bg-red-400"}`}/>}
                          {filterUser==="Semua"&&hasAnyDayOff&&!isSel&&<span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-300 animate-pulse"/>}
                          {hasManual&&<span className="absolute top-2 left-2 w-2 h-2 rounded-full bg-blue-400"/>}
                          <span className={`text-base font-black leading-none mb-2 ${isSel?"text-white":isTod?"text-blue-600":isUserDayOff?"text-red-500":"text-gray-800"}`}>{day}</span>
                          {tot>0&&(
                            <div className="flex flex-col gap-1 w-full">
                              <div className="flex gap-1">
                                {pc>0&&<div className={`h-1.5 rounded-full ${isSel?"bg-emerald-300":"bg-emerald-400"}`} style={{width:`${(pc/tot)*100}%`}}/>}
                                {lc>0&&<div className={`h-1.5 rounded-full ${isSel?"bg-amber-300":"bg-amber-400"}`}   style={{width:`${(lc/tot)*100}%`}}/>}
                                {sc>0&&<div className={`h-1.5 rounded-full ${isSel?"bg-gray-300":"bg-gray-400"}`}     style={{width:`${(sc/tot)*100}%`}}/>}
                                {mc>0&&<div className={`h-1.5 rounded-full ${isSel?"bg-blue-300":"bg-blue-400"}`}     style={{width:`${(mc/tot)*100}%`}}/>}
                              </div>
                              <span className={`text-[10px] font-bold ${isSel?"text-white/70":"text-gray-400"}`}>{tot} hadir{mc>0?` · ${mc}✏️`:""}</span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Detail tanggal */}
            {selectedDate && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-fadeIn">
                <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white flex-wrap gap-3">
                  <div>
                    <p className="text-lg font-bold text-gray-800">
                      {new Date(selectedDate+"T12:00:00+07:00").toLocaleDateString("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
                    </p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {selectedAttendances.filter(a=>a.displayStatus==="PRESENT").length>0&&<span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-3 py-1 rounded-full">✅ {selectedAttendances.filter(a=>a.displayStatus==="PRESENT").length} tepat</span>}
                      {selectedAttendances.filter(a=>a.displayStatus==="LATE").length>0&&<span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-3 py-1 rounded-full">⏰ {selectedAttendances.filter(a=>a.displayStatus==="LATE").length} terlambat</span>}
                      {selectedAttendances.filter(a=>a.source==="MANUAL").length>0&&<span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-blue-700 bg-blue-100 border border-blue-200 px-3 py-1 rounded-full">✏️ {selectedAttendances.filter(a=>a.source==="MANUAL").length} manual</span>}
                      {getOffUsersForDate(selectedDate).length>0&&<span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-red-700 bg-red-100 border border-red-200 px-3 py-1 rounded-full">🔴 {getOffUsersForDate(selectedDate).length} libur</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {currentUser?.role==="ADMIN"&&(
                      <button onClick={()=>openAddManual(selectedDate)} className="flex items-center gap-1.5 text-[11px] font-bold text-[#1a1a2e] bg-slate-100 border border-slate-200 px-3 py-2 rounded-xl hover:bg-slate-200 transition-all">
                        ➕ Tambah Manual
                      </button>
                    )}
                    <button onClick={()=>setSelectedDate(null)} className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                  </div>
                </div>

                {selectedAttendances.length===0 ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4"><span className="text-3xl opacity-40">📅</span></div>
                    {(() => { const off=getOffUsersForDate(selectedDate); return off.length>0?(
                      <div className="text-center"><div className="inline-flex items-center gap-1.5 bg-red-100 border border-red-200 text-red-600 text-xs font-bold px-4 py-2 rounded-full mb-3">🔴 Hari Libur</div>{off.map(n=><p key={n} className="text-xs text-red-400 mt-1">• {n}</p>)}</div>
                    ):<p className="text-sm text-gray-400 font-medium">Tidak ada absensi hari ini</p>; })()}
                    {currentUser?.role==="ADMIN"&&(
                      <button onClick={()=>openAddManual(selectedDate)} className="mt-4 flex items-center gap-1.5 text-xs font-bold text-[#1a1a2e] bg-slate-100 border border-slate-200 px-4 py-2.5 rounded-xl hover:bg-slate-200 transition-all">✏️ Tambah Absen Manual</button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/50">
                          <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Karyawan</th>
                          <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Jam Masuk</th>
                          <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                          <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Metode</th>
                          <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Lokasi</th>
                          <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest hidden lg:table-cell">Catatan</th>
                          {currentUser?.role==="ADMIN" && <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Aksi</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {selectedAttendances.map(a => {
                          const userId    = a.user_id ?? "";
                          const dateKey   = toWIBDateKey(a.check_in_time||a.created_at);
                          const manualRec = manualMap[`${userId}_${dateKey}`];
                          return (
                            <tr key={a.id} className={`hover:bg-gray-50/60 transition-colors duration-200 ${a.source==="MANUAL"?"bg-blue-50/20":""}`}>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-[11px] font-black flex-shrink-0 shadow-md ${a.displayStatus==="PRESENT"?"bg-gradient-to-br from-[#1a1a2e] to-[#16213e]":"bg-gradient-to-br from-amber-500 to-orange-500"}`}>{initials(a.user_name)}</div>
                                  <div>
                                    <p className="font-bold text-gray-800 text-sm">{a.user_name}</p>
                                    <p className="text-[10px] text-gray-400 font-medium mt-0.5">{a.user_role?.replace(/_/g," ")}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-4"><span className="font-mono font-black text-gray-800 text-sm">{toWIBTime(a.check_in_time||a.created_at)}</span></td>
                              <td className="px-4 py-4">
                                {manualRec ? (
                                  <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-full border ${MANUAL_STATUS_LABELS[manualRec.status]?.bg} ${MANUAL_STATUS_LABELS[manualRec.status]?.color} ${MANUAL_STATUS_LABELS[manualRec.status]?.border}`}>
                                    {MANUAL_STATUS_LABELS[manualRec.status]?.emoji} {MANUAL_STATUS_LABELS[manualRec.status]?.label}
                                  </span>
                                ) : (
                                  <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-full border ${a.displayStatus==="PRESENT"?"bg-emerald-100 text-emerald-700 border-emerald-200":a.displayStatus==="SKIP"?"bg-gray-100 text-gray-500 border-gray-200":"bg-amber-100 text-amber-700 border-amber-200"}`}>
                                    {a.displayStatus==="PRESENT"?"✓ Tepat":a.displayStatus==="SKIP"?"⏭ Skip":"⏰ Terlambat"}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-4">
                                <span className={`inline-flex items-center text-[10px] font-bold px-3 py-1.5 rounded-full border w-fit ${a.source==="MANUAL"?"bg-blue-100 text-blue-700 border-blue-200":a.method==="FACE"?"bg-indigo-100 text-indigo-600 border-indigo-200":"bg-gray-100 text-gray-400 border-gray-200"}`}>
                                  {a.source==="MANUAL"?"✏️ Manual":a.method==="FACE"?"🫦 Wajah":"⏭ Skip"}
                                </span>
                              </td>
                              <td className="px-4 py-4">
                                {a.latitude&&a.longitude ? (
                                  <a href={`https://maps.google.com/?q=${a.latitude},${a.longitude}`} target="_blank" rel="noopener noreferrer"
                                    className={`inline-flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 rounded-full border no-underline transition-all hover:shadow-md ${Math.round(haversine(a.latitude,a.longitude,OFFICE_LAT,OFFICE_LNG))<=80?"bg-emerald-100 text-emerald-700 border-emerald-200":"bg-red-100 text-red-600 border-red-200"}`}>
                                    📍 {Math.round(haversine(a.latitude,a.longitude,OFFICE_LAT,OFFICE_LNG))}m
                                  </a>
                                ):<span className="text-[10px] text-gray-200 font-bold">—</span>}
                              </td>
                              <td className="px-4 py-4 hidden lg:table-cell">
                                {manualRec?.notes ? (
                                  <p className="text-[11px] text-blue-600 font-medium max-w-[180px] truncate">📝 {manualRec.notes}</p>
                                ) : (
                                  <p className="text-[10px] text-gray-400 truncate max-w-[180px] font-mono">{a.device||"—"}</p>
                                )}
                              </td>
                              {/* ✅ NEW: Tombol Edit di tabel */}
                              {currentUser?.role==="ADMIN" && (
                                <td className="px-4 py-4 text-center">
                                  <button
                                    onClick={() => {
                                      // Cari manual record yang ada, atau buat baru dari data ini
                                      if (manualRec) {
                                        openEditManual(manualRec);
                                      } else {
                                        // Edit auto record → buka modal dengan data pre-filled
                                        const prefillRecord: ManualAttendance = {
                                          id: "", user_id: userId,
                                          attendance_date: dateKey,
                                          check_in_time: a.check_in_time || a.created_at,
                                          status: (a.displayStatus==="PRESENT"?"PRESENT":a.displayStatus==="LATE"?"LATE":"PRESENT") as any,
                                          notes: null, created_by: null,
                                          users: { id:userId, name:a.user_name, role:a.user_role, shift:a.user_shift||"PAGI" },
                                        };
                                        openEditManual(prefillRecord);
                                      }
                                    }}
                                    className="inline-flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 border border-slate-200 hover:bg-blue-100 hover:text-blue-700 hover:border-blue-200 transition-all duration-200"
                                    title="Edit absen">
                                    ✏️ Edit
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ════ TAB RINGKASAN ════ */}
        {activeTab==="summary" && currentUser?.role==="ADMIN" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-base font-bold text-gray-800">Ringkasan Kehadiran — {MONTH_NAMES[calMonth]} {calYear}</p>
                <p className="text-[10px] text-gray-400 mt-1">
                  Tepat=1.0 · Terlambat=0.5 · Skip=0.75 · Tidak Hadir=0 ·
                  <span className="text-blue-500 font-semibold"> % dihitung dari hari kerja yang sudah lewat</span>
                </p>
              </div>
              {/* ✅ Tombol tambah absen manual langsung dari ringkasan */}
              <button onClick={()=>openAddManual()} className="flex items-center gap-1.5 text-xs font-bold text-[#1a1a2e] bg-slate-100 border border-slate-200 px-4 py-2 rounded-xl hover:bg-slate-200 transition-all">✏️ Tambah Manual</button>
            </div>

            {loading ? (
              <div className="p-6 space-y-3">{Array(5).fill(0).map((_,i)=><div key={i} className="h-14 bg-gray-50 rounded-2xl animate-pulse"/>)}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest w-8">#</th>
                      <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Karyawan</th>
                      <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Tepat</th>
                      <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Terlambat</th>
                      <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Skip</th>
                      <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Tidak Hadir</th>
                      <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Skor</th>
                      <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Hari Lewat</th>
                      <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Sisa</th>
                      <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest min-w-[180px]">Persentase</th>
                      <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {userSummary.map((u,i) => {
                      // ✅ absent = hari kerja yang sudah lewat dikurangi yang sudah hadir
                      const absent    = Math.max(0, u.pastWorkdays - u.present - u.late - u.skip);
                      const pctColor  = u.pct>=90?"text-emerald-600":u.pct>=70?"text-amber-600":"text-red-500";
                      const barGrad   = u.pct>=90?"from-emerald-400 to-green-500":u.pct>=70?"from-amber-400 to-orange-500":"from-red-400 to-rose-500";
                      return (
                        <tr key={u.name} className="hover:bg-gray-50/60 transition-colors duration-200">
                          <td className="px-6 py-4 text-[11px] text-gray-400 font-black">{i+1}</td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex items-center justify-center text-white text-[10px] font-black flex-shrink-0 shadow-md">{initials(u.name)}</div>
                              <div>
                                <span className="font-bold text-gray-800 block">{u.name}</span>
                                {salaryMap[u.userId] && (
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${salaryMap[u.userId].salary_type==="FIXED"?"bg-emerald-100 text-emerald-700":"bg-amber-100 text-amber-700"}`}>
                                    {salaryMap[u.userId].salary_type==="FIXED"?"💰 Tetap":"📊 % Absen"}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-center"><span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 text-sm font-black border border-emerald-200">{u.present}</span></td>
                          <td className="px-4 py-4 text-center">{u.late>0?<span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-amber-100 text-amber-700 text-sm font-black border border-amber-200">{u.late}</span>:<span className="text-gray-200 text-sm font-black">—</span>}</td>
                          <td className="px-4 py-4 text-center">{u.skip>0?<span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gray-100 text-gray-500 text-sm font-black border border-gray-200">{u.skip}</span>:<span className="text-gray-200 text-sm font-black">—</span>}</td>
                          <td className="px-4 py-4 text-center">{absent>0?<span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-red-100 text-red-600 text-sm font-black border border-red-200">{absent}</span>:<span className="text-gray-200 text-sm font-black">—</span>}</td>
                          <td className="px-4 py-4 text-center"><span className="text-sm font-black text-gray-700">{u.score.toFixed(1)}</span></td>
                          <td className="px-4 py-4 text-center">
                            <div className="flex flex-col items-center">
                              <span className="text-sm font-bold text-gray-500">{u.pastWorkdays}h</span>
                              <span className="text-[9px] text-gray-300">dari {u.totalWorkdays}</span>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-center"><span className="text-sm font-bold text-blue-500">{u.remainingDays}h</span></td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden min-w-[100px]">
                                <div className={`h-full rounded-full bg-gradient-to-r ${barGrad} transition-all duration-700`} style={{width:`${Math.min(u.pct,100)}%`}}/>
                              </div>
                              <span className={`text-sm font-black w-12 text-right flex-shrink-0 ${pctColor}`}>{u.pct}%</span>
                            </div>
                          </td>
                          {/* ✅ Tombol tambah absen manual per baris karyawan */}
                          <td className="px-4 py-4 text-center">
                            <button onClick={()=>openAddManual(undefined, u.userId)}
                              className="inline-flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 border border-slate-200 hover:bg-[#1a1a2e] hover:text-white hover:border-[#1a1a2e] transition-all duration-200 whitespace-nowrap"
                              title={`Tambah absen manual untuk ${u.name}`}>
                              ➕ Absen
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-t border-gray-100 flex items-center gap-6 flex-wrap">
              {[["bg-emerald-400","Tepat = 1.0 poin"],["bg-amber-400","Terlambat = 0.5 poin"],["bg-gray-400","Skip = 0.75 poin"],["bg-red-400","Tidak hadir = 0 poin"]].map(([c,l])=>(
                <span key={l} className="text-[10px] text-gray-500 font-medium flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-full ${c}`}/>{l}</span>
              ))}
              <span className="text-[10px] text-blue-500 ml-auto font-medium">% = skor ÷ hari kerja yang sudah lewat</span>
            </div>
          </div>
        )}

        {/* ════ TAB GAJI ════ */}
        {activeTab==="salary" && currentUser?.role==="ADMIN" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-base font-bold text-gray-800">Rekap Gaji — {MONTH_NAMES[calMonth]} {calYear}</p>
                <p className="text-[10px] text-gray-400 mt-1">Gaji tetap = penuh · Persentase = % kehadiran × gaji pokok</p>
              </div>
              <button onClick={()=>{if(allUsers.length===0)fetchAllUsers();setShowSalaryModal(true);}} className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-xl hover:bg-emerald-100 transition-all">⚙️ Atur Gaji</button>
            </div>
            {loading ? (
              <div className="p-6 space-y-3">{Array(5).fill(0).map((_,i)=><div key={i} className="h-16 bg-gray-50 rounded-2xl animate-pulse"/>)}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Karyawan</th>
                      <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Tipe</th>
                      <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Gaji Pokok</th>
                      <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">% Kehadiran</th>
                      <th className="px-4 py-4 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Gaji Diterima</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {userSummary.map(u => {
                      const sal    = salaryMap[u.userId];
                      const pct    = u.pct / 100;
                      const earned = sal ? (sal.salary_type==="FIXED" ? sal.base_salary : sal.base_salary*pct) : null;
                      return (
                        <tr key={u.name} className="hover:bg-gray-50/60 transition-colors duration-200">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex items-center justify-center text-white text-[10px] font-black flex-shrink-0 shadow-md">{initials(u.name)}</div>
                              <div><span className="font-bold text-gray-800 block">{u.name}</span><span className="text-[10px] text-gray-400">{u.pct}% kehadiran</span></div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-center">
                            {sal?(<span className={`inline-flex items-center text-[10px] font-bold px-3 py-1.5 rounded-full border ${sal.salary_type==="FIXED"?"bg-emerald-100 text-emerald-700 border-emerald-200":"bg-amber-100 text-amber-700 border-amber-200"}`}>{sal.salary_type==="FIXED"?"💰 Tetap":"📊 Persentase"}</span>):<span className="text-[10px] text-gray-300 font-bold">Belum diatur</span>}
                          </td>
                          <td className="px-4 py-4 text-center">
                            {sal?<span className="font-mono font-bold text-gray-800 text-sm">{formatRupiah(sal.base_salary)}</span>:<span className="text-gray-300 text-sm">—</span>}
                          </td>
                          <td className="px-4 py-4 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <span className={`text-sm font-black ${u.pct>=90?"text-emerald-600":u.pct>=70?"text-amber-600":"text-red-500"}`}>{u.pct}%</span>
                              <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${u.pct>=90?"bg-emerald-400":u.pct>=70?"bg-amber-400":"bg-red-400"}`} style={{width:`${Math.min(u.pct,100)}%`}}/></div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-right">
                            {earned!==null?<span className="font-black text-gray-800 text-base">{formatRupiah(earned)}</span>:<button onClick={()=>{if(allUsers.length===0)fetchAllUsers();setShowSalaryModal(true);}} className="text-[10px] font-bold text-emerald-600 hover:underline">Atur gaji →</button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50/50">
                      <td colSpan={4} className="px-6 py-4 text-sm font-bold text-gray-600 text-right">Total Gaji Bulan Ini:</td>
                      <td className="px-4 py-4 text-right">
                        <span className="text-lg font-black text-[#1a1a2e]">
                          {formatRupiah(userSummary.reduce((sum,u)=>{const sal=salaryMap[u.userId];const p=u.pct/100;return sum+(sal?(sal.salary_type==="FIXED"?sal.base_salary:sal.base_salary*p):0);},0))}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ════ TAB CUTI ════ */}
        {activeTab==="leave" && currentUser?.role==="ADMIN" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-base font-bold text-gray-800">Saldo & Pengajuan Cuti — {MONTH_NAMES[calMonth]} {calYear}</p>
                <p className="text-[10px] text-gray-400 mt-1">1 hari cuti per bulan · Sisa carry-over ke bulan berikutnya</p>
              </div>
              <button onClick={()=>{if(allUsers.length===0)fetchAllUsers();fetchLeaveData(calYear,calMonth);setShowLeaveModal(true);}} className="flex items-center gap-1.5 text-xs font-bold text-cyan-600 bg-cyan-50 border border-cyan-200 px-4 py-2 rounded-xl hover:bg-cyan-100 transition-all">➕ Kelola Cuti</button>
            </div>
            {loading ? (
              <div className="p-6 space-y-3">{Array(5).fill(0).map((_,i)=><div key={i} className="h-16 bg-gray-50 rounded-2xl animate-pulse"/>)}</div>
            ) : leaveData.length===0 ? (
              <div className="py-16 text-center"><div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4"><span className="text-3xl opacity-40">🌴</span></div><p className="text-sm text-gray-400 font-medium">Belum ada data cuti</p></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Karyawan</th>
                      <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Jatah</th>
                      <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Carry-over</th>
                      <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Terpakai</th>
                      <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Tersedia</th>
                      <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Tanggal Cuti</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {leaveData.map(ld=>(
                      <tr key={ld.user.id} className="hover:bg-gray-50/60 transition-colors duration-200">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-white text-[10px] font-black flex-shrink-0 shadow-md">{initials(ld.user.name)}</div>
                            <div><span className="font-bold text-gray-800 block">{ld.user.name}</span><span className="text-[10px] text-gray-400">{ld.user.role.replace(/_/g," ")}</span></div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center"><span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-teal-100 text-teal-700 text-sm font-black border border-teal-200">{ld.balance.quota}</span></td>
                        <td className="px-4 py-4 text-center">{ld.balance.carried_over>0?<span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-blue-100 text-blue-700 text-sm font-black border border-blue-200">+{ld.balance.carried_over}</span>:<span className="text-gray-200 text-sm font-black">—</span>}</td>
                        <td className="px-4 py-4 text-center">{ld.balance.used>0?<span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-orange-100 text-orange-700 text-sm font-black border border-orange-200">{ld.balance.used}</span>:<span className="text-gray-200 text-sm font-black">—</span>}</td>
                        <td className="px-4 py-4 text-center"><span className={`inline-flex items-center justify-center w-10 h-10 rounded-xl text-sm font-black border ${ld.available>0?"bg-emerald-100 text-emerald-700 border-emerald-200":"bg-red-100 text-red-600 border-red-200"}`}>{ld.available}</span></td>
                        <td className="px-4 py-4">
                          {ld.requests.length>0?(
                            <div className="flex flex-wrap gap-1.5">
                              {ld.requests.map(r=>(
                                <span key={r.id} className="inline-flex items-center gap-1 text-[10px] font-bold bg-cyan-100 text-cyan-700 border border-cyan-200 px-2 py-1 rounded-lg">
                                  🌴 {new Date(r.leave_date+"T12:00:00").toLocaleDateString("id-ID",{day:"numeric",month:"short"})}
                                </span>
                              ))}
                            </div>
                          ):<span className="text-[10px] text-gray-300 font-bold">Tidak ada cuti bulan ini</span>}
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

      {/* ── Modals ── */}
      {showDayOffModal && currentUser?.role==="ADMIN" && (
        <DayOffModal users={allUsers} dayOffs={dayOffs} onClose={()=>setShowDayOffModal(false)} onSaved={()=>{fetchDayOffs();setShowDayOffModal(false);}}/>
      )}
      {showManualModal && currentUser?.role==="ADMIN" && (
        <ManualAttendanceModal
          users={allUsers}
          prefillDate={manualPrefillDate}
          prefillUserId={manualPrefillUser}
          editData={editManualData}
          onClose={()=>{ setShowManualModal(false); setEditManualData(null); }}
          onSaved={refreshAll}
        />
      )}
      {showSalaryModal && currentUser?.role==="ADMIN" && (
        <SalaryModal users={allUsers} salaries={salaries} onClose={()=>setShowSalaryModal(false)} onSaved={()=>{fetchSalaries();setShowSalaryModal(false);}}/>
      )}
      {showLeaveModal && currentUser?.role==="ADMIN" && (
        <LeaveModal users={allUsers} leaveData={leaveData} calYear={calYear} calMonth={calMonth} onClose={()=>setShowLeaveModal(false)} onSaved={()=>{fetchLeaveData(calYear,calMonth);}}/>
      )}

      <style jsx global>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes scaleIn { from { opacity:0; transform:scale(0.96); } to { opacity:1; transform:scale(1); } }
        .animate-fadeIn { animation: fadeIn 0.4s cubic-bezier(0.16,1,0.3,1); }
        .animate-scaleIn { animation: scaleIn 0.3s cubic-bezier(0.16,1,0.3,1); }
      `}</style>
    </DashboardLayout>
  );
}