"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { getCurrentUserClient } from "@/lib/auth-client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { ShiftConfigModal } from "@/components/attendance/ShiftConfigModal";

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
    late_weight?: number | null;
    displayStatus?: "PRESENT" | "LATE" | "SKIP";
    source?: "AUTO" | "MANUAL";
};

type ManualAttendance = {
    id: string;
    user_id: string;
    attendance_date: string;
    check_in_time: string;
    status: "PRESENT" | "LATE" | "SICK" | "PERMIT" | "ABSENT" | "LEAVE";
    notes: string | null;
    created_by: string | null;
    created_by_name?: string | null;
    users?: { id: string; name: string; role: string; shift: string };
};

type UserAllowances = {
    id: string;
    user_id: string;
    allowance_wife: number;
    allowance_child: number;
    deduction_loan: number;
    deduction_pension: number;
    updated_at: string;
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

type DayOff = { id: string; user_id: string; day_of_week: number; users?: { id: string; name: string; role: string } };
type DateOff = { id: string; user_id: string; off_date: string; users?: { id: string; name: string; role: string } };
type UserInfo = { id: string; name: string; role: string };
type AbsenceReason = "ALPHA" | "ABSENT" | "SICK" | "PERMIT" | "LEAVE";
type AbsenceItem = { date: string; reason: AbsenceReason; note: string | null };

// ─── Constants ─────────────────────────────────────────────────────────────
const OFFICE_LAT = -6.402593;
const OFFICE_LNG = 106.787233;
const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const FULL_ACCESS_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"] as const;
function isAdminRole(role?: string): boolean {
    return !!role && (FULL_ACCESS_ROLES as readonly string[]).includes(role);
} const DAY_FULL = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

const MANUAL_STATUS_LABELS: Record<string, { label: string; color: string; bg: string; border: string; emoji: string }> = {
    PRESENT: { label: "Hadir", color: "text-emerald-700", bg: "bg-emerald-100", border: "border-emerald-200", emoji: "✅" },
    LATE: { label: "Terlambat", color: "text-amber-700", bg: "bg-amber-100", border: "border-amber-200", emoji: "⏰" },
    SICK: { label: "Sakit", color: "text-blue-700", bg: "bg-blue-100", border: "border-blue-200", emoji: "🤒" },
    PERMIT: { label: "Izin", color: "text-violet-700", bg: "bg-violet-100", border: "border-violet-200", emoji: "📋" },
    ABSENT: { label: "Tidak Hadir", color: "text-red-700", bg: "bg-red-100", border: "border-red-200", emoji: "❌" },
    LEAVE: { label: "Cuti", color: "text-cyan-700", bg: "bg-cyan-100", border: "border-cyan-200", emoji: "🌴" },
};

const ABSENCE_REASON_LABELS: Record<AbsenceReason, { label: string; emoji: string; bg: string; color: string; border: string }> = {
    ALPHA: { label: "Tanpa Keterangan", emoji: "🚫", bg: "bg-red-50", color: "text-red-600", border: "border-red-200" },
    ABSENT: { label: "Tidak Hadir", emoji: "❌", bg: "bg-red-50", color: "text-red-600", border: "border-red-200" },
    SICK: { label: "Sakit", emoji: "🤒", bg: "bg-blue-50", color: "text-blue-700", border: "border-blue-200" },
    PERMIT: { label: "Izin", emoji: "📋", bg: "bg-violet-50", color: "text-violet-700", border: "border-violet-200" },
    LEAVE: { label: "Cuti", emoji: "🌴", bg: "bg-cyan-50", color: "text-cyan-700", border: "border-cyan-200" },
};


function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000, dLat = ((lat2 - lat1) * Math.PI) / 180, dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toWIBTime(iso: string): string {
    return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
}

function toWIBDateKey(iso: string): string {
    return new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function getWIBToday(): string {
    return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const SHIFT_LATE: Record<"PAGI" | "SORE", number> = { PAGI: 8 * 60, SORE: 16 * 60 };

function isLate(t: string, shift: "PAGI" | "SORE" = "PAGI"): boolean {
    const wib = new Date(new Date(t).getTime() + 7 * 60 * 60 * 1000);
    const total = wib.getUTCHours() * 60 + wib.getUTCMinutes();
    return total > SHIFT_LATE[shift];
}

function getDisplayStatus(a: Attendance): "PRESENT" | "LATE" | "SKIP" {
    if (a.method === "FORCE") return "PRESENT";
    if (a.method === "SKIP" || a.status === "SKIPPED_MANUAL") return "SKIP";

    if ("late_weight" in a && a.late_weight != null) {
        const w = a.late_weight as number;
        if (w >= 1) return "PRESENT";   
        if (w > 0) return "LATE";     
        return "SKIP";                  
    }

    if (isLate(a.check_in_time || a.created_at, a.user_shift ?? "PAGI")) return "LATE";
    return "PRESENT";
}

function countWorkingDays(year: number, month: number, dayOffDows: Set<number>, offDates: Set<string>): number {
    const dim = new Date(year, month + 1, 0).getDate();
    let c = 0;
    for (let d = 1; d <= dim; d++) {
        const dk = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const dow = new Date(dk + "T12:00:00").getDay();
        if (!dayOffDows.has(dow) && !offDates.has(dk)) c++;
    }
    return c;
}

function countEffectiveWorkingDays(
    year: number,
    month: number,
    dayOffDows: Set<number>,
    offDates: Set<string>
): number {
    const todayWIB = getWIBToday();
    const todayYear = parseInt(todayWIB.slice(0, 4));
    const todayMonth = parseInt(todayWIB.slice(5, 7)) - 1;
    const dim = new Date(year, month + 1, 0).getDate();
    const isCurrentMonth = (year === todayYear && month === todayMonth);
    let c = 0;
    for (let d = 1; d <= dim; d++) {
        const dk = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        if (isCurrentMonth && dk > todayWIB) break;
        const dow = new Date(dk + "T12:00:00").getDay();
        if (!dayOffDows.has(dow) && !offDates.has(dk)) c++;
    }
    return c;
}

// Sisa hari kerja dari hari ini sampai akhir bulan
function getRemainingWorkingDays(year: number, month: number, dayOffDows: Set<number>, offDates: Set<string>): number {
    const todayWIB = getWIBToday();
    const dim = new Date(year, month + 1, 0).getDate();
    let c = 0;
    for (let d = 1; d <= dim; d++) {
        const dk = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        if (dk < todayWIB) continue;
        const dow = new Date(dk + "T12:00:00").getDay();
        if (!dayOffDows.has(dow) && !offDates.has(dk)) c++;
    }
    return c;
}

function formatRupiah(n: number): string {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

function formatPct(n: number): string {
    return String(Math.floor(n * 100 + 1e-6) / 100);
}

function initials(name: string): string {
    return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

function pad2(n: number) { return String(n).padStart(2, "0"); }

// ─── Modal Shell ──────────────────────────────────────────────────────────────
function ModalShell({ onClose, headerColor, title, subtitle, children, footer, wide }: {
    onClose: () => void; headerColor: string; title: string; subtitle?: string;
    children: React.ReactNode; footer: React.ReactNode; wide?: boolean;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className={`relative bg-white w-full ${wide ? "sm:max-w-3xl" : "sm:max-w-2xl"} rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden animate-scaleIn`}>
                <div className={`${headerColor} px-6 py-5 flex items-start justify-between flex-shrink-0`}>
                    <div>
                        <p className="font-bold text-white text-base tracking-tight">{title}</p>
                        {subtitle && <p className="text-xs text-white/70 mt-1">{subtitle}</p>}
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/15 transition-all duration-200">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                {children}
                <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0 bg-white/95">{footer}</div>
            </div>
        </div>
    );
}


function ManualAttendanceModal({ users, prefillDate, prefillUserId, editData, onClose, onSaved }: {
    users: UserInfo[];
    prefillDate: string | null;
    prefillUserId?: string;
    editData?: ManualAttendance | null;
    onClose: () => void;
    onSaved: () => void;
}) {
    const isEdit = !!editData;

    const parseTimeFromISO = (iso: string | undefined): string => {
        if (!iso) return "08:00";
        try {
            const date = new Date(iso);
            if (isNaN(date.getTime())) return "08:00";

            const timeString = date.toLocaleTimeString("id-ID", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Asia/Jakarta"
            });

            return timeString.substring(0, 5);
        } catch (e) {
            console.error("❌ parseTimeFromISO error:", e);
            return "08:00";
        }
    };

    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState("");

    const [form, setForm] = useState({
        user_id: editData?.user_id ?? prefillUserId ?? users[0]?.id ?? "",
        attendance_date: editData?.attendance_date ?? prefillDate ?? getWIBToday(),
        check_in_time: parseTimeFromISO(editData?.check_in_time),
        status: (editData?.status ?? "PRESENT") as "PRESENT" | "LATE" | "SICK" | "PERMIT" | "ABSENT" | "LEAVE",
        notes: editData?.notes ?? "",
    });

    useEffect(() => {
        // ✅ DEBUG: log users yang diterima modal
        console.log("[ManualAttendanceModal] users received:", users.length, users.map(u => u.name));
        console.log("[ManualAttendanceModal] prefillUserId:", prefillUserId);
        console.log("[ManualAttendanceModal] editData:", editData?.user_id);

        setForm({
            user_id: editData?.user_id ?? prefillUserId ?? users[0]?.id ?? "",
            attendance_date: editData?.attendance_date ?? prefillDate ?? getWIBToday(),
            check_in_time: parseTimeFromISO(editData?.check_in_time),
            status: (editData?.status ?? "PRESENT") as "PRESENT" | "LATE" | "SICK" | "PERMIT" | "ABSENT" | "LEAVE",
            notes: editData?.notes ?? "",
        });
    }, [editData, prefillDate, prefillUserId, users]);

    const save = async () => {
        if (!form.user_id || !form.attendance_date || !form.check_in_time) {
            setError("Karyawan, tanggal, dan jam masuk wajib diisi");
            return;
        }
        setSaving(true); setError("");
        try {
            const checkInISO = new Date(`${form.attendance_date}T${form.check_in_time}:00+07:00`).toISOString();
            const res = await fetch("/api/attendance/manual", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
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
            await fetch(`/api/attendance/manual?user_id=${editData.user_id}&attendance_date=${editData.attendance_date}`, { method: "DELETE" });
            onSaved(); onClose();
        } catch { }
        finally { setDeleting(false); }
    };

    const selectedUser = users.find(u => u.id === form.user_id);

    // ✅ GUARD: Tampilkan loading kalau users belum ada dan ini bukan mode edit
    if (!isEdit && users.length === 0) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
                <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center animate-scaleIn">
                    <div className="w-12 h-12 border-4 border-gray-200 border-t-[#1a1a2e] rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-sm font-semibold text-gray-600">Memuat daftar karyawan...</p>
                    <button onClick={onClose} className="mt-4 text-xs text-gray-400 hover:text-gray-600">Batal</button>
                </div>
            </div>
        );
    }

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
                            {deleting ? <div className="w-4 h-4 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" /> : "🗑️ Hapus"}
                        </button>
                    )}
                    <button onClick={onClose} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-all duration-200">Batal</button>
                    <button onClick={save} disabled={saving}
                        className={`flex-1 h-11 ${isEdit ? "bg-gradient-to-r from-blue-600 to-blue-700" : "bg-gradient-to-r from-[#1a1a2e] to-[#16213e]"} text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2`}>
                        {saving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</> : "💾 Simpan"}
                    </button>
                </div>
            }>
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
                {error && <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-3 rounded-xl flex items-center gap-2"><span>⚠️</span>{error}</div>}

                {/* Karyawan */}
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                        Karyawan
                        {/* ✅ DEBUG badge — hapus setelah confirmed working */}
                        <span className="ml-2 text-[10px] font-normal text-gray-400 normal-case">
                            ({users.length} karyawan dimuat)
                        </span>
                    </label>
                    {isEdit ? (
                        <div className="flex items-center gap-3 h-11 bg-gray-50 border border-gray-200 rounded-xl px-4">
                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex items-center justify-center text-white text-[10px] font-black">{initials(editData?.users?.name || "?")}</div>
                            <span className="text-sm font-bold text-gray-700">{editData?.users?.name}</span>
                            <span className="text-[10px] text-gray-400 ml-auto">{editData?.users?.role?.replace(/_/g, " ")}</span>
                        </div>
                    ) : (
                        <select
                            value={form.user_id}
                            onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))}
                            className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition-all"
                        >
                            {/* ✅ Placeholder option kalau user_id kosong */}
                            {!form.user_id && (
                                <option value="" disabled>— Pilih Karyawan —</option>
                            )}
                            {users.map(u => (
                                <option key={u.id} value={u.id}>
                                    {u.name} — {u.role.replace(/_/g, " ")}
                                </option>
                            ))}
                        </select>
                    )}
                </div>

                {/* Tanggal + Jam */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Tanggal</label>
                        <input type="date" value={form.attendance_date}
                            onChange={e => setForm(f => ({ ...f, attendance_date: e.target.value }))}
                            className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition-all" />
                        <p className="text-[10px] text-gray-400 mt-1">Bisa pilih tanggal hari ini atau sebelumnya</p>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Jam Masuk (WIB)</label>
                        <input type="time" value={form.check_in_time}
                            onChange={e => setForm(f => ({ ...f, check_in_time: e.target.value }))}
                            className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition-all" />
                    </div>
                </div>

                {/* Status */}
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Status Kehadiran</label>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                        {(Object.keys(MANUAL_STATUS_LABELS) as Array<keyof typeof MANUAL_STATUS_LABELS>).map(s => {
                            const cfg = MANUAL_STATUS_LABELS[s];
                            const sel = form.status === s;
                            return (
                                <button key={s} type="button" onClick={() => setForm(f => ({ ...f, status: s as any }))}
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
                    <input type="text" value={form.notes}
                        onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                        placeholder="e.g. Koreksi karena sistem error, izin keperluan mendadak..."
                        className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 transition-all" />
                </div>

                {/* Preview */}
                {form.user_id && form.attendance_date && form.check_in_time && (
                    <div className="bg-gradient-to-br from-gray-50 to-white border border-gray-100 rounded-2xl px-4 py-3">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Preview</p>
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex items-center justify-center text-white text-[11px] font-black flex-shrink-0">
                                {initials(isEdit ? (editData?.users?.name || "?") : (selectedUser?.name || "?"))}
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-bold text-gray-800">{isEdit ? editData?.users?.name : selectedUser?.name}</p>
                                <p className="text-[11px] text-gray-500">
                                    {new Date(form.attendance_date + "T12:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
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

    const [local, setLocal] = useState<Record<string, { salary_type: "FIXED" | "PERCENTAGE"; base_salary: string }>>(() => {
        const m: Record<string, { salary_type: "FIXED" | "PERCENTAGE"; base_salary: string }> = {};
        users.forEach(u => {
            const s = salaryMap[u.id];
            m[u.id] = { salary_type: s?.salary_type ?? "FIXED", base_salary: s?.base_salary?.toString() ?? "" };
        });
        return m;
    });

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const save = async () => {
        setSaving(true); setError("");
        try {
            const ops = users.map(u => {
                const v = local[u.id];
                if (!v.base_salary) return Promise.resolve();
                return fetch("/api/attendance/salary", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ user_id: u.id, salary_type: v.salary_type, base_salary: parseFloat(v.base_salary) }),
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
                        {saving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</> : "💾 Simpan Semua"}
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
                                <div><p className="text-sm font-bold text-gray-800">{u.name}</p><p className="text-[10px] text-gray-400">{u.role.replace(/_/g, " ")}</p></div>
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
                                    <select value={local[u.id]?.salary_type ?? "FIXED"} onChange={e => setLocal(p => ({ ...p, [u.id]: { ...p[u.id], salary_type: e.target.value as any } }))}
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
                                        onChange={e => setLocal(p => ({ ...p, [u.id]: { ...p[u.id], base_salary: e.target.value } }))}
                                        className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none transition-all" />
                                </div>
                            </div>
                            {local[u.id]?.base_salary && (
                                <p className="text-[11px] text-gray-400 mt-2">
                                    = <span className="font-bold text-gray-700">{formatRupiah(parseFloat(local[u.id].base_salary || "0"))}</span>
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

// ─── Modal: Edit Tunjangan & Potongan ────────────────────────────────────────
function EditAllowanceModal({
    userId,
    userName,
    currentAllowance,
    onClose,
    onSaved,
}: {
    userId: string;
    userName: string;
    currentAllowance?: UserAllowances;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [form, setForm] = useState({
        allowance_wife: currentAllowance?.allowance_wife ?? 0,
        allowance_child: currentAllowance?.allowance_child ?? 0,
        deduction_loan: currentAllowance?.deduction_loan ?? 0,
        deduction_pension: currentAllowance?.deduction_pension ?? 0,
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const save = async () => {
        setSaving(true);
        setError("");
        try {
            const res = await fetch("/api/attendance/allowances", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_id: userId,
                    ...form,
                }),
            });
            const d = await res.json();
            if (!d.success) {
                setError(d.message || "Gagal menyimpan");
                return;
            }
            onSaved();
            onClose();
        } catch {
            setError("Gagal menyimpan");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-scaleIn">
                <div className="bg-gradient-to-r from-purple-600 to-violet-700 px-6 py-5 flex items-start justify-between">
                    <div>
                        <p className="font-bold text-white text-base">💜 Tunjangan & Potongan</p>
                        <p className="text-xs text-white/70 mt-1">{userName}</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/15 transition">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="px-6 py-5 space-y-6 overflow-y-auto max-h-[70vh]">
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-3 rounded-xl">
                            ⚠️ {error}
                        </div>
                    )}

                    {/* TUNJANGAN SECTION */}
                    <div>
                        <p className="text-xs font-bold text-purple-600 uppercase tracking-wide mb-4">
                            ➕ Tunjangan (Disesuaikan % Kehadiran)
                        </p>
                        <div className="space-y-3">
                            {/* Tunjangan Istri */}
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">
                                    Tunjangan Istri
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">Rp</span>
                                    <input
                                        type="number"
                                        min={0}
                                        value={form.allowance_wife}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, allowance_wife: parseInt(e.target.value) || 0 }))
                                        }
                                        placeholder="Contoh: 500000"
                                        className="w-full h-11 border border-gray-200 rounded-xl pl-9 pr-4 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-400/20 font-mono"
                                    />
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1">
                                    Contoh: Rp{formatRupiah(form.allowance_wife)} × 85% kehadiran = Rp
                                    {formatRupiah(Math.round(form.allowance_wife * 0.85))}
                                </p>
                            </div>

                            {/* Tunjangan Anak */}
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">
                                    Tunjangan Anak
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">Rp</span>
                                    <input
                                        type="number"
                                        min={0}
                                        value={form.allowance_child}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, allowance_child: parseInt(e.target.value) || 0 }))
                                        }
                                        placeholder="Contoh: 300000"
                                        className="w-full h-11 border border-gray-200 rounded-xl pl-9 pr-4 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-400/20 font-mono"
                                    />
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1">
                                    Contoh: Rp{formatRupiah(form.allowance_child)} × 85% kehadiran = Rp
                                    {formatRupiah(Math.round(form.allowance_child * 0.85))}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* POTONGAN SECTION */}
                    <div>
                        <p className="text-xs font-bold text-red-600 uppercase tracking-wide mb-4">
                            ➖ Potongan (Langsung Potong, Tidak Disesuaikan %)
                        </p>
                        <div className="space-y-3">
                            {/* Cicilan Kasbon */}
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">
                                    Cicilan Kasbon / Pinjaman
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">Rp</span>
                                    <input
                                        type="number"
                                        min={0}
                                        value={form.deduction_loan}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, deduction_loan: parseInt(e.target.value) || 0 }))
                                        }
                                        placeholder="Contoh: 100000"
                                        className="w-full h-11 border border-gray-200 rounded-xl pl-9 pr-4 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-400/20 font-mono"
                                    />
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1">
                                    Dipotong penuh setiap bulan, tidak disesuaikan kehadiran
                                </p>
                            </div>

                            {/* Dana Pensiun */}
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">
                                    Dana Pensiun / Iuran
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">Rp</span>
                                    <input
                                        type="number"
                                        min={0}
                                        value={form.deduction_pension}
                                        onChange={(e) =>
                                            setForm((f) => ({ ...f, deduction_pension: parseInt(e.target.value) || 0 }))
                                        }
                                        placeholder="Contoh: 50000"
                                        className="w-full h-11 border border-gray-200 rounded-xl pl-9 pr-4 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-400/20 font-mono"
                                    />
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1">
                                    Dipotong penuh setiap bulan, tidak disesuaikan kehadiran
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* SUMMARY */}
                    <div className="bg-gradient-to-br from-purple-50 to-violet-50 border border-purple-200 rounded-2xl p-4">
                        <p className="text-xs font-bold text-purple-600 uppercase tracking-wide mb-3">📋 Ringkasan</p>
                        <div className="space-y-1.5 text-sm">
                            <div className="flex justify-between text-gray-600">
                                <span>Tunjangan Istri (×%)</span>
                                <span className="font-bold text-gray-800">{formatRupiah(form.allowance_wife)}</span>
                            </div>
                            <div className="flex justify-between text-gray-600">
                                <span>Tunjangan Anak (×%)</span>
                                <span className="font-bold text-gray-800">{formatRupiah(form.allowance_child)}</span>
                            </div>
                            <div className="flex justify-between text-gray-600">
                                <span>Cicilan Kasbon</span>
                                <span className="font-bold text-red-600">-{formatRupiah(form.deduction_loan)}</span>
                            </div>
                            <div className="flex justify-between text-gray-600">
                                <span>Dana Pensiun</span>
                                <span className="font-bold text-red-600">-{formatRupiah(form.deduction_pension)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
                    <button onClick={onClose} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-all">
                        Batal
                    </button>
                    <button onClick={save} disabled={saving}
                        className="flex-1 h-11 bg-gradient-to-r from-purple-600 to-violet-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                        {saving ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Menyimpan...
                            </>
                        ) : (
                            "💾 Simpan"
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

function LeaveModal({ users, leaveData, calYear, calMonth, onClose, onSaved }: {
    users: UserInfo[]; leaveData: UserLeaveData[]; calYear: number; calMonth: number;
    onClose: () => void; onSaved: () => void;
}) {
    const [uid, setUid] = useState(users[0]?.id ?? "");
    const [date, setDate] = useState("");
    const [reason, setReason] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [deleting, setDeleting] = useState<string | null>(null);

    const userData = leaveData.find(d => d.user.id === uid);

    const addLeave = async () => {
        if (!uid || !date) { setError("Pilih karyawan dan tanggal"); return; }
        setSaving(true); setError("");
        try {
            const res = await fetch("/api/attendance/leave", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: uid, leave_date: date, reason }),
            });
            const d = await res.json();
            if (!d.success) { setError(d.message || "Gagal"); return; }
            onSaved(); setDate(""); setReason("");
        } catch { setError("Gagal menambah cuti"); }
        finally { setSaving(false); }
    };

    const deleteLeave = async (id: string) => {
        setDeleting(id);
        try { await fetch(`/api/attendance/leave?id=${id}`, { method: "DELETE" }); onSaved(); }
        catch { } finally { setDeleting(null); }
    };

    const dim = new Date(calYear, calMonth + 1, 0).getDate();
    const minDate = `${calYear}-${pad2(calMonth + 1)}-01`;
    const maxDate = `${calYear}-${pad2(calMonth + 1)}-${pad2(dim)}`;

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
                            { label: "Jatah Bulan Ini", val: userData.balance.quota, color: "text-teal-700", bg: "bg-teal-50", border: "border-teal-200" },
                            { label: "Carry-over", val: userData.balance.carried_over, color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200" },
                            { label: "Tersedia", val: userData.available, color: userData.available > 0 ? "text-emerald-700" : "text-red-700", bg: userData.available > 0 ? "bg-emerald-50" : "bg-red-50", border: userData.available > 0 ? "border-emerald-200" : "border-red-200" },
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
                                className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-cyan-400" />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">Alasan</label>
                            <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Acara keluarga"
                                className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-cyan-400" />
                        </div>
                    </div>
                    <button onClick={addLeave} disabled={saving || !date || (userData?.available ?? 0) <= 0}
                        className="w-full h-10 bg-gradient-to-r from-cyan-600 to-teal-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                        {saving ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</> : "➕ Tambah Cuti"}
                    </button>
                    {(userData?.available ?? 0) <= 0 && <p className="text-[11px] text-red-500 text-center mt-2">Saldo cuti habis untuk bulan ini</p>}
                </div>

                {userData && userData.requests.length > 0 && (
                    <div>
                        <p className="text-xs font-bold text-gray-600 mb-3 uppercase tracking-wide">Cuti {MONTH_NAMES[calMonth]} {calYear}</p>
                        <div className="space-y-2">
                            {userData.requests.map(r => (
                                <div key={r.id} className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-center justify-between shadow-sm">
                                    <div>
                                        <p className="text-sm font-bold text-gray-800">{new Date(r.leave_date + "T12:00:00").toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" })}</p>
                                        {r.reason && <p className="text-[11px] text-gray-400 mt-0.5">{r.reason}</p>}
                                    </div>
                                    <button onClick={() => deleteLeave(r.id)} disabled={deleting === r.id}
                                        className="w-8 h-8 flex items-center justify-center rounded-xl text-red-400 hover:bg-red-50 hover:text-red-600 transition-all font-bold text-lg flex-shrink-0">
                                        {deleting === r.id ? <div className="w-4 h-4 border-2 border-red-300 border-t-red-500 rounded-full animate-spin" /> : "×"}
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
    const [error, setError] = useState("");
    const origMap = useMemo(() => {
        const m: Record<string, Set<number>> = {};
        dayOffs.forEach(d => { if (!m[d.user_id]) m[d.user_id] = new Set(); m[d.user_id].add(d.day_of_week); });
        return m;
    }, [dayOffs]);
    const [local, setLocal] = useState<Record<string, Set<number>>>(() => {
        const m: Record<string, Set<number>> = {};
        dayOffs.forEach(d => { if (!m[d.user_id]) m[d.user_id] = new Set(); m[d.user_id].add(d.day_of_week); });
        return m;
    });
    const toggle = (uid: string, dow: number) => setLocal(prev => {
        const n = { ...prev }; if (!n[uid]) n[uid] = new Set();
        const s = new Set(n[uid]); s.has(dow) ? s.delete(dow) : s.add(dow); n[uid] = s; return n;
    });
    const save = async () => {
        setSaving(true); setError("");
        try {
            const ops: Promise<any>[] = [];
            users.forEach(u => {
                const orig = origMap[u.id] || new Set<number>(), cur = local[u.id] || new Set<number>();
                cur.forEach(d => { if (!orig.has(d)) ops.push(fetch("/api/attendance/day-off", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: u.id, day_of_week: d }) })); });
                orig.forEach(d => { if (!cur.has(d)) ops.push(fetch(`/api/attendance/day-off?user_id=${u.id}&day_of_week=${d}`, { method: "DELETE" })); });
            });
            await Promise.all(ops); onSaved(); onClose();
        } catch { setError("Gagal menyimpan."); }
        finally { setSaving(false); }
    };
    const shown = filter ? users.filter(u => u.id === filter) : users;
    return (
        <ModalShell onClose={onClose} headerColor="bg-gradient-to-r from-[#1a1a2e] to-[#16213e]" title="📅 Libur Mingguan Berulang" subtitle="Pilih hari libur tetap per karyawan"
            footer={
                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-all">Batal</button>
                    <button onClick={save} disabled={saving} className="flex-1 h-11 bg-gradient-to-r from-[#1a1a2e] to-[#16213e] text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                        {saving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</> : "💾 Simpan"}
                    </button>
                </div>
            }>
            <div className="px-6 pt-5 pb-3 flex-shrink-0 border-b border-gray-100">
                <select value={filter} onChange={e => setFilter(e.target.value)} className="w-full sm:w-72 h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none">
                    <option value="">Semua Karyawan</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name} — {u.role.replace(/_/g, " ")}</option>)}
                </select>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4">
                {error && <div className="mb-3 bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-2.5 rounded-xl">{error}</div>}
                <div className="space-y-3">
                    {shown.map(u => (
                        <div key={u.id} className="bg-gradient-to-br from-gray-50 to-white rounded-2xl p-4 border border-gray-100">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex items-center justify-center text-white text-[10px] font-black flex-shrink-0 shadow-md">{initials(u.name)}</div>
                                <div><p className="text-sm font-bold text-gray-800">{u.name}</p><p className="text-[10px] text-gray-400">{u.role.replace(/_/g, " ")}</p></div>
                            </div>
                            <div className="grid grid-cols-7 gap-1.5">
                                {DAY_NAMES.map((day, dow) => {
                                    const off = local[u.id]?.has(dow) ?? false; return (
                                        <button key={dow} type="button" onClick={() => toggle(u.id, dow)} title={DAY_FULL[dow]}
                                            className={`h-9 rounded-xl text-[11px] font-bold transition-all duration-200 border ${off ? "bg-red-500 text-white border-red-500 shadow-md scale-105" : "bg-white text-gray-400 border-gray-200 hover:bg-gray-100 hover:text-gray-600 hover:scale-105"}`}>{day}</button>
                                    );
                                })}
                            </div>
                            {local[u.id] && local[u.id].size > 0 && <p className="text-[11px] text-red-500 font-medium mt-2.5 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />Libur: {Array.from(local[u.id]).sort().map(d => DAY_FULL[d]).join(", ")}</p>}
                        </div>
                    ))}
                </div>
            </div>
        </ModalShell>
    );
}

function TodayAttendanceCard({ status, loading, onRefresh }: {
    status: {
        alreadyAttended: boolean;
        needEnroll: boolean;
        isAttendanceTime: boolean;
        isDayOff: boolean;
        isExempt?: boolean;
        shift: string;
        reason?: string;
        openAt?: string;
        closeAt?: string;
        manualAlreadyExists?: boolean;
        manualStatus?: string;
        manualCreatedByName?: string | null;
    } | null;
    loading: boolean; onRefresh: () => void;
}) {
    if (loading) return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 animate-pulse">
            <div className="flex items-center gap-4"><div className="w-14 h-14 rounded-2xl bg-gray-100" /><div className="flex-1 space-y-2"><div className="h-3 bg-gray-100 rounded w-32" /><div className="h-5 bg-gray-100 rounded w-48" /><div className="h-3 bg-gray-100 rounded w-24" /></div><div className="w-32 h-10 bg-gray-100 rounded-xl" /></div>
        </div>
    );
    if (!status) return null;

    const goAbsen = () => { window.location.href = "/face-verify?from=/dashboard/attendance"; };
    const openAt = status.openAt ?? "—";
    const closeAt = status.closeAt ?? "—";
    const needEnroll = status.needEnroll;

    type CardState = "EXEMPT" | "MANUAL" | "ATTENDED" | "DAY_OFF" | "TOO_EARLY" | "TOO_LATE" | "OPEN";
    let state: CardState;
    if (status.isExempt) state = "EXEMPT";
    else if (status.manualAlreadyExists) state = "MANUAL";
    else if (status.alreadyAttended) state = "ATTENDED";
    else if (status.isDayOff) state = "DAY_OFF";
    else if (status.reason === "TOO_EARLY") state = "TOO_EARLY";
    else if (status.reason === "TOO_LATE") state = "TOO_LATE";
    else state = "OPEN";

    let cfg: {
        icon: string; gradient: string; iconBg: string; badge: string; dot: string;
        badgeText: string; title: string; sub: string; showBtn: boolean;
        btnLabel?: string; btnColor?: string; btnAction?: () => void;
    };

    switch (state) {
        case "EXEMPT":
            cfg = {
                icon: "🛡️", gradient: "from-slate-50 to-gray-100", iconBg: "bg-slate-100",
                badge: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400",
                badgeText: "Bebas Absen", title: "Tidak Wajib Absen",
                sub: `Role kamu dikecualikan dari absensi · Shift ${status.shift}`, showBtn: false,
            };
            break;
        case "MANUAL":
            const manualStatusMap: Record<string, { label: string; color: string }> = {
                "PRESENT": { label: "Hadir", color: "text-emerald-700" },
                "LATE": { label: "Terlambat", color: "text-amber-700" },
                "SICK": { label: "Sakit", color: "text-blue-700" },
                "PERMIT": { label: "Izin", color: "text-violet-700" },
                "ABSENT": { label: "Tidak Hadir", color: "text-red-700" },
                "LEAVE": { label: "Cuti", color: "text-cyan-700" },
            };
            const manualInfo = manualStatusMap[status.manualStatus || "PRESENT"]
                || { label: "Tercatat", color: "text-gray-700" };
            const adminName = status.manualCreatedByName;
            cfg = {
                icon: "✏️",
                gradient: "from-blue-50 to-indigo-50",
                iconBg: "bg-blue-100",
                badge: "bg-blue-100 text-blue-700 border-blue-200",
                dot: "bg-blue-400",
                badgeText: "Absen Manual",
                title: "Sudah Di-absenkan oleh Admin",
                sub: `Status: ${manualInfo.label}${adminName ? ` · Oleh ${adminName}` : " · Diinput oleh admin"}`,
                showBtn: false,
            };
            break;
        case "ATTENDED":
            cfg = {
                icon: "✅", gradient: "from-emerald-50 to-green-50", iconBg: "bg-emerald-100",
                badge: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-400",
                badgeText: "Sudah Absen", title: "Absensi Hari Ini Tercatat",
                sub: `Shift ${status.shift}`, showBtn: false,
            };
            break;
        case "DAY_OFF":
            cfg = {
                icon: "🏖️", gradient: "from-orange-50 to-amber-50", iconBg: "bg-orange-100",
                badge: "bg-orange-100 text-orange-700 border-orange-200", dot: "bg-orange-400",
                badgeText: "Hari Libur", title: "Kamu Libur Hari Ini",
                sub: "Tidak perlu absen", showBtn: false,
            };
            break;
        case "TOO_EARLY":
            cfg = {
                icon: "⏳", gradient: "from-blue-50 to-indigo-50", iconBg: "bg-blue-100",
                badge: "bg-blue-100 text-blue-700 border-blue-200", dot: "bg-blue-400",
                badgeText: "Belum Waktunya", title: "Belum Waktunya Absen",
                sub: `Absen dibuka pukul ${openAt} · Shift ${status.shift}`, showBtn: false,
            };
            break;
        case "TOO_LATE":
            cfg = {
                icon: "⌛", gradient: "from-red-50 to-rose-50", iconBg: "bg-red-100",
                badge: "bg-red-100 text-red-600 border-red-200", dot: "bg-red-400",
                badgeText: "Waktu Habis", title: "Waktu Absen Sudah Lewat",
                sub: `Batas absen pukul ${closeAt} · Shift ${status.shift}`, showBtn: false,
            };
            break;
        case "OPEN":
        default:
            cfg = {
                icon: "🟡", gradient: "from-amber-50 to-yellow-50", iconBg: "bg-amber-100",
                badge: "bg-amber-100 text-amber-700 border-amber-200", dot: "bg-amber-400 animate-pulse",
                badgeText: "Belum Absen",
                title: needEnroll ? "Belum Absen — Daftar Wajah Dulu" : "Kamu Belum Absen Hari Ini",
                sub: `Jam absen: ${openAt} – ${closeAt} WIB · Shift ${status.shift}`,
                showBtn: true,
                btnLabel: needEnroll ? "Daftar & Absen →" : "Absen Sekarang →",
                btnColor: "bg-gradient-to-r from-[#1a1a2e] to-[#16213e]",
                btnAction: goAbsen,
            };
            break;
    }

    return (
        <div className={`bg-gradient-to-br ${cfg.gradient} rounded-2xl border border-gray-100 shadow-sm p-5`}>
            <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-2xl ${cfg.iconBg} flex items-center justify-center flex-shrink-0 shadow-sm`}><span className="text-2xl">{cfg.icon}</span></div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1"><span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border ${cfg.badge}`}><span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.badgeText}</span></div>
                    <p className="font-bold text-gray-800 text-sm">{cfg.title}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{cfg.sub}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={onRefresh} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-400 hover:text-gray-600 transition-all shadow-sm" title="Refresh">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    </button>
                    {cfg.showBtn && <button onClick={cfg.btnAction} className={`${cfg.btnColor} text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-md hover:shadow-lg transition-all whitespace-nowrap`}>{cfg.btnLabel}</button>}
                </div>
            </div>
        </div>
    );
}

// ─── Month Selector ────────────────────────────────────────────────────────────
function MonthSelector({ onSelect }: { onSelect: (year: number, month: number) => void }) {
    const today = new Date();
    const [year, setYear] = useState(today.getFullYear());
    const years = Array.from({ length: 4 }, (_, i) => today.getFullYear() - 1 + i);
    return (
        <div className="max-w-2xl mx-auto px-4 py-12 animate-fadeIn">
            <div className="text-center mb-10">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] shadow-lg mb-4"><span className="text-3xl">📊</span></div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-[#1a1a2e] to-[#16213e] bg-clip-text text-transparent tracking-tight">Absensi Karyawan</h1>
                <p className="text-sm text-gray-400 mt-2">Pilih bulan untuk melihat laporan absensi</p>
            </div>
            <div className="flex items-center justify-center gap-2.5 mb-8">
                <button onClick={() => setYear(y => y - 1)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-400 hover:bg-gray-50 transition-all shadow-sm active:scale-95">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <div className="flex gap-2 flex-wrap justify-center">{years.map(y => (
                    <button key={y} onClick={() => setYear(y)} className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 border ${year === y ? "bg-gradient-to-r from-[#1a1a2e] to-[#16213e] text-white border-[#1a1a2e] shadow-md scale-105" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:scale-105"}`}>{y}</button>
                ))}</div>
                <button onClick={() => setYear(y => y + 1)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-400 hover:bg-gray-50 transition-all shadow-sm active:scale-95">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
                {MONTH_NAMES.map((name, idx) => {
                    const isCurrent = year === today.getFullYear() && idx === today.getMonth();
                    const isFuture = year > today.getFullYear() || (year === today.getFullYear() && idx > today.getMonth());
                    return (
                        <button key={idx} onClick={() => !isFuture && onSelect(year, idx)} disabled={isFuture}
                            className={`relative group flex flex-col items-center justify-center gap-2 py-7 rounded-2xl border transition-all duration-300 ${isCurrent ? "bg-gradient-to-br from-[#1a1a2e] to-[#16213e] border-[#1a1a2e] text-white shadow-xl scale-[1.02]" : isFuture ? "bg-gray-50/80 border-gray-100 text-gray-300 cursor-not-allowed" : "bg-white border-gray-200 text-gray-700 hover:border-[#1a1a2e] hover:bg-gradient-to-br hover:from-[#1a1a2e]/5 hover:to-[#16213e]/5 hover:text-[#1a1a2e] hover:scale-105 hover:shadow-lg cursor-pointer shadow-sm"}`}>
                            {isCurrent && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />}
                            <span className="text-4xl font-black tracking-tighter">{String(idx + 1).padStart(2, "0")}</span>
                            <span className={`text-[11px] font-semibold uppercase tracking-wide ${isCurrent ? "text-white/70" : isFuture ? "text-gray-300" : "text-gray-400 group-hover:text-[#1a1a2e]/60"}`}>{MONTH_SHORT[idx]}</span>
                            {isCurrent && <span className="text-[9px] text-emerald-300 font-bold tracking-wider uppercase mt-1">Bulan ini</span>}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function InlineSalaryEditModal({ userId, userName, currentSalary, onClose, onSaved }: {
    userId: string;
    userName: string;
    currentSalary?: UserSalary;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [salaryType, setSalaryType] = useState<"FIXED" | "PERCENTAGE">(
        currentSalary?.salary_type ?? "FIXED"
    );
    const [baseSalary, setBaseSalary] = useState(
        currentSalary?.base_salary?.toString() ?? ""
    );
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const save = async () => {
        if (!baseSalary || parseFloat(baseSalary) < 0) {
            setError("Nominal gaji harus diisi"); return;
        }
        setSaving(true); setError("");
        try {
            const res = await fetch("/api/attendance/salary", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_id: userId,
                    salary_type: salaryType,
                    base_salary: parseFloat(baseSalary),
                }),
            });
            const d = await res.json();
            if (!d.success) { setError(d.message || "Gagal menyimpan"); return; }
            onSaved(); onClose();
        } catch { setError("Gagal menyimpan"); }
        finally { setSaving(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-scaleIn">
                <div className="bg-gradient-to-r from-emerald-600 to-green-700 px-6 py-5 flex items-start justify-between flex-shrink-0">
                    <div>
                        <p className="font-bold text-white text-base">💰 Edit Gaji</p>
                        <p className="text-xs text-white/70 mt-1">{userName}</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/15 transition-all">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="px-6 py-5 space-y-4">
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-3 rounded-xl">⚠️ {error}</div>
                    )}
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">Tipe Gaji</label>
                        <div className="grid grid-cols-2 gap-2">
                            {(["FIXED", "PERCENTAGE"] as const).map(t => (
                                <button key={t} type="button" onClick={() => setSalaryType(t)}
                                    className={`py-3 rounded-xl text-xs font-bold border transition-all ${salaryType === t
                                        ? "bg-emerald-600 text-white border-emerald-600 shadow-md"
                                        : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                                        }`}>
                                    {t === "FIXED" ? "💰 Tetap" : "📊 % Absen"}
                                </button>
                            ))}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1.5">
                            {salaryType === "FIXED"
                                ? "Gaji penuh tiap bulan, tidak tergantung kehadiran"
                                : "Gaji = % kehadiran × nominal pokok"}
                        </p>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">
                            {salaryType === "FIXED" ? "Nominal Gaji (Rp)" : "Gaji Pokok (Rp)"}
                        </label>
                        <input type="number" min={0} value={baseSalary}
                            onChange={e => setBaseSalary(e.target.value)}
                            placeholder="contoh: 3000000"
                            className="w-full h-12 border border-gray-200 rounded-xl px-4 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-400/20 transition-all font-mono font-bold"
                        />
                        {baseSalary && parseFloat(baseSalary) > 0 && (
                            <p className="text-[11px] text-gray-500 mt-1.5">
                                = <span className="font-bold text-gray-800">
                                    {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(parseFloat(baseSalary))}
                                </span>
                                {salaryType === "PERCENTAGE" && <span className="text-gray-400"> × persen kehadiran</span>}
                            </p>
                        )}
                    </div>
                </div>
                <div className="px-6 pb-6 flex gap-3">
                    <button onClick={onClose} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-all">Batal</button>
                    <button onClick={save} disabled={saving || !baseSalary}
                        className="flex-1 h-11 bg-gradient-to-r from-emerald-600 to-green-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                        {saving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</> : "💾 Simpan"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function AbsenceDetailModal({ name, absences, offDates, monthLabel, onClose }: {
    name: string; absences: AbsenceItem[]; offDates: string[]; monthLabel: string; onClose: () => void;
}) {
    const fmt = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });
    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[85dvh] overflow-hidden animate-scaleIn">
                <div className="bg-gradient-to-r from-red-600 to-rose-700 px-6 py-5 flex items-start justify-between flex-shrink-0">
                    <div>
                        <p className="font-bold text-white text-base">❌ Detail Ketidakhadiran</p>
                        <p className="text-xs text-white/70 mt-1">{name} · {monthLabel}</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-white/60 hover:text-white hover:bg-white/20 transition">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
                    <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Hari tidak hadir ({absences.length})</p>
                        {absences.length === 0 ? (
                            <p className="text-sm text-gray-400">Tidak ada ketidakhadiran 🎉</p>
                        ) : (
                            <div className="space-y-2">
                                {absences.map(a => {
                                    const cfg = ABSENCE_REASON_LABELS[a.reason];
                                    return (
                                        <div key={a.date} className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-2.5">
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-gray-800">{fmt(a.date)}</p>
                                                {a.note && <p className="text-[11px] text-gray-400 truncate">📝 {a.note}</p>}
                                            </div>
                                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border flex-shrink-0 ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                                                {cfg.emoji} {cfg.label}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {offDates.length > 0 && (
                        <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Libur — tidak dihitung ({offDates.length})</p>
                            <div className="flex flex-wrap gap-1.5">
                                {offDates.map(d => (
                                    <span key={d} className="inline-flex items-center gap-1 text-[10px] font-bold bg-orange-50 text-orange-600 border border-orange-200 px-2 py-1 rounded-lg">
                                        🏖️ {new Date(d + "T12:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                                    </span>
                                ))}
                            </div>
                            <p className="text-[10px] text-gray-400 mt-2">Hari libur tidak masuk hitungan kewajiban hadir, jadi tidak dianggap absen.</p>
                        </div>
                    )}
                </div>
                <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0">
                    <button onClick={onClose} className="w-full h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition">Tutup</button>
                </div>
            </div>
        </div>
    );
}

type SalarySlip = {
    id: string;
    user_id: string;
    year: number;
    month: number;
    salary_type: "FIXED" | "PERCENTAGE";
    base_salary: number;
    allowance_wife: number;
    allowance_child: number;
    allowance_transport: number;
    bonus: number;
    overtime: number;
    total_income: number;
    deduction_violation: number;
    deduction_loan: number;
    deduction_pension: number;
    total_deduction: number;
    net_salary: number;
    status: "DRAFT" | "FINALIZED";
    finalized_at: string | null;
    notes: string | null;
    users?: { id: string; name: string; role: string };
};

function SalarySlipCard({ slip, onFinalize, onGenerate }: {
    slip: SalarySlip;
    onFinalize: () => void;
    onGenerate?: () => void;
}) {
    const [finalizing, setFinalizing] = useState(false);
    const [generating, setGenerating] = useState(false);

    const handleFinalize = async () => {
        if (!confirm("Finalisasi slip gaji ini? Tidak bisa diubah lagi setelah finalisasi.")) return;
        setFinalizing(true);
        try {
            const r = await fetch("/api/attendance/salary-slip", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: slip.user_id, year: slip.year, month: slip.month }),
            });
            const d = await r.json();
            if (d.success) onFinalize();
        } finally { setFinalizing(false); }
    };

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition overflow-hidden">
            {/* Header row */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex items-center justify-center text-white text-[10px] font-black flex-shrink-0 shadow-md">
                        {initials(slip.users?.name || "?")}
                    </div>
                    <div>
                        <p className="font-bold text-gray-800 text-sm leading-tight">{slip.users?.name || "Unknown"}</p>
                        <p className="text-[10px] text-gray-400">{MONTH_NAMES[slip.month - 1]} {slip.year}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border ${slip.status === "FINALIZED"
                        ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                        : "bg-amber-100 text-amber-700 border-amber-200"}`}>
                        {slip.status === "FINALIZED" ? "✅ Final" : "⏳ Draft"}
                    </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                    <a href={`/receipt/salary-slip/${slip.id}`} target="_blank" rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-gray-800 text-white text-[10px] font-bold rounded-lg hover:bg-gray-700 transition flex items-center gap-1">
                        🖨️ Cetak
                    </a>
                    {slip.status === "DRAFT" && (
                        <button onClick={handleFinalize} disabled={finalizing}
                            className="px-3 py-1.5 bg-emerald-600 text-white text-[10px] font-bold rounded-lg hover:bg-emerald-700 transition disabled:opacity-50">
                            {finalizing ? "..." : "✔ Finalisasi"}
                        </button>
                    )}
                </div>
            </div>

            {/* Body — compact grid */}
            <div className="px-5 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Penghasilan */}
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                    <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-wide mb-1">Penghasilan</p>
                    <p className="text-xs font-black text-emerald-700 font-mono">{formatRupiah(slip.total_income)}</p>
                    <div className="mt-1.5 space-y-0.5">
                        <p className="text-[9px] text-gray-500">Pokok: {formatRupiah(slip.base_salary)}</p>
                        {slip.overtime > 0 && <p className="text-[9px] text-orange-600">Lembur: +{formatRupiah(slip.overtime)}</p>}
                        {(slip.allowance_wife > 0 || slip.allowance_child > 0) && (
                            <p className="text-[9px] text-gray-500">Tunjangan: +{formatRupiah(slip.allowance_wife + slip.allowance_child)}</p>
                        )}
                    </div>
                </div>

                {/* Potongan */}
                <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                    <p className="text-[9px] font-bold text-red-600 uppercase tracking-wide mb-1">Potongan</p>
                    <p className="text-xs font-black text-red-600 font-mono">-{formatRupiah(slip.total_deduction)}</p>
                    <div className="mt-1.5 space-y-0.5">
                        {slip.deduction_loan > 0 && <p className="text-[9px] text-gray-500">Kasbon: {formatRupiah(slip.deduction_loan)}</p>}
                        {slip.deduction_pension > 0 && <p className="text-[9px] text-gray-500">Pensiun: {formatRupiah(slip.deduction_pension)}</p>}
                        {slip.total_deduction === 0 && <p className="text-[9px] text-gray-300">Tidak ada</p>}
                    </div>
                </div>

                {/* Gaji Bersih */}
                <div className="bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl p-3 sm:col-span-2">
                    <p className="text-[9px] font-bold text-white/70 uppercase tracking-wide mb-1">Gaji Bersih</p>
                    <p className="text-base font-black text-white font-mono">{formatRupiah(slip.net_salary)}</p>
                    <p className="text-[9px] text-white/60 mt-1">
                        {slip.salary_type === "FIXED" ? "💰 Gaji Tetap" : "📊 % Kehadiran"} · {MONTH_NAMES[slip.month - 1]} {slip.year}
                    </p>
                </div>
            </div>
        </div>
    );
}

export default function AttendanceDashboardPage() {
    const [selectedMonth, setSelectedMonth] = useState<{ year: number; month: number } | null>(null);
    const [attendances, setAttendances] = useState<Attendance[]>([]);
    const [manualRecords, setManualRecords] = useState<ManualAttendance[]>([]);
    const [dayOffs, setDayOffs] = useState<DayOff[]>([]);
    const [allDateOffs, setAllDateOffs] = useState<DateOff[]>([]);
    const [allUsers, setAllUsers] = useState<UserInfo[]>([]);
    const [salaries, setSalaries] = useState<UserSalary[]>([]);
    const [leaveData, setLeaveData] = useState<UserLeaveData[]>([]);
    const [loading, setLoading] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [filterUser, setFilterUser] = useState("Semua");
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [todayStatus, setTodayStatus] = useState<any>(null);
    const [statusLoading, setStatusLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<"calendar" | "summary" | "salary" | "salary-slip" | "salary-history" | "leave" | "my-salary">("calendar");
    // Modal state
    const [showDayOffModal, setShowDayOffModal] = useState(false);
    const [showManualModal, setShowManualModal] = useState(false);
    const [showSalaryModal, setShowSalaryModal] = useState(false);
    const [showLeaveModal, setShowLeaveModal] = useState(false);
    const [editManualData, setEditManualData] = useState<ManualAttendance | null>(null);
    const [manualPrefillDate, setManualPrefillDate] = useState<string | null>(null);
    const [manualPrefillUser, setManualPrefillUser] = useState<string | undefined>(undefined);

    const calYear = selectedMonth?.year ?? new Date().getFullYear();
    const calMonth = selectedMonth?.month ?? new Date().getMonth();
    const [showShiftModal, setShowShiftModal] = useState(false);
    const [shiftModalUserId, setShiftModalUserId] = useState<string | undefined>(undefined);
    const [editSalaryUser, setEditSalaryUser] = useState<{
        userId: string; userName: string; currentSalary?: UserSalary;
    } | null>(null);
    const [absenceDetail, setAbsenceDetail] = useState<{ name: string; absences: AbsenceItem[]; offDates: string[] } | null>(null);
    const [allowances, setAllowances] = useState<UserAllowances[]>([]);
    const [editAllowanceUser, setEditAllowanceUser] = useState<{
        userId: string;
        userName: string;
        currentAllowance?: UserAllowances;
    } | null>(null);
    const [overtimeTotal, setOvertimeTotal] = useState<Record<string, number>>({});
    const [usersLoading, setUsersLoading] = useState(false);
    const [salaryHistory, setSalaryHistory] = useState<any[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);


    const fetchAttendance = useCallback(async () => { const r = await fetch("/api/attendance"); const d = await r.json(); if (d.success) setAttendances((d.data || []).map((a: Attendance) => ({ ...a, displayStatus: getDisplayStatus(a), source: "AUTO" }))); }, []);
    const fetchManualRecords = useCallback(async (y: number, m: number) => {
        const r = await fetch(`/api/attendance/manual?year=${y}&month=${m + 1}`);
        const d = await r.json();
        if (d.success) setManualRecords(d.data || []);
    }, []);
    const fetchDayOffs = useCallback(async () => { const r = await fetch("/api/attendance/day-off"); const d = await r.json(); if (d.success) setDayOffs(d.data || []); }, []);
    const fetchAllDateOffs = useCallback(async () => { const r = await fetch("/api/attendance/date-off"); const d = await r.json(); if (d.success) setAllDateOffs(d.data || []); }, []);
    const fetchAllUsers = useCallback(async () => {
        const r = await fetch("/api/attendance/users");
        const d = await r.json();
        if (d.success) {
            setAllUsers(d.data || []);
            return d.data || [];
        }
        return [];
    }, []);
    const fetchSalaries = useCallback(async () => {
        const r = await fetch("/api/attendance/salary");
        const d = await r.json();
        if (d.success) {
            console.log("[fetchSalaries] Data:", d.data);
            setSalaries(d.data?.map((s: any) => s) || []);
        }
    }, []);
    const fetchLeaveData = useCallback(async (y: number, m: number) => { const r = await fetch(`/api/attendance/leave?year=${y}&month=${m + 1}`); const d = await r.json(); if (d.success) setLeaveData(d.data || []); }, []);
    const fetchAllowances = useCallback(async () => {
        const r = await fetch("/api/attendance/allowances");
        const d = await r.json();
        if (d.success) setAllowances(d.data || []);
    }, []);

    const fetchOvertimeTotal = useCallback(async (y: number, m: number) => {
        try {
            const r = await fetch(`/api/attendance/overtime?year=${y}&month=${m + 1}&status=COMPLETED`);
            const d = await r.json();
            if (d.success) {
                const map: Record<string, number> = {};
                (d.data || []).forEach((o: any) => {
                    if (!map[o.user_id]) map[o.user_id] = 0;
                    map[o.user_id] += o.total_pay || 0;
                });
                setOvertimeTotal(map);
            }
        } catch (err) {
            console.error("Failed to fetch overtime total:", err);
        }
    }, []);

    const [salarySlips, setSalarySlips] = useState<any[]>([]);
    const sortedSalarySlips = useMemo(() => {
        return [...salarySlips].sort((a, b) => {
            const nameA = a.users?.name ?? "";
            const nameB = b.users?.name ?? "";
            return nameA.localeCompare(nameB, "id");
        });
    }, [salarySlips]);
    const [selectedSlipMonth, setSelectedSlipMonth] = useState<{ year: number; month: number }>({
        year: new Date().getFullYear(),
        month: new Date().getMonth(),
    });

    const fetchSalarySlips = useCallback(async (y: number, m: number) => {
        try {
            const r = await fetch(`/api/attendance/salary-slip?year=${y}&month=${m + 1}`);
            const d = await r.json();
            if (d.success) setSalarySlips(d.data || []);
        } catch (err) {
            console.error("Failed to fetch salary slips:", err);
        }
    }, []);

    const fetchSalaryHistory = useCallback(async () => {
        setHistoryLoading(true);
        try {
            const r = await fetch("/api/attendance/salary?history=true");
            const d = await r.json();
            if (d.success) setSalaryHistory(d.history || []);
        } catch (err) {
            console.error("Failed to fetch salary history:", err);
        } finally {
            setHistoryLoading(false);
        }
    }, []);

    const fetchTodayStatus = useCallback(async () => {
        setStatusLoading(true);
        try {
            const r = await fetch("/api/auth/face-status");
            const d = await r.json();
            if (d.success) setTodayStatus({
                alreadyAttended: d.alreadyAttended ?? false,
                needEnroll: d.needEnroll ?? false,
                isAttendanceTime: d.isAttendanceTime ?? false,
                isDayOff: d.isDayOff ?? false,
                isExempt: d.isExempt ?? false,
                shift: d.shift ?? "PAGI",
                reason: d.reason,
                openAt: d.openAt,
                closeAt: d.closeAt,
                manualAlreadyExists: d.manualAlreadyExists ?? false,
                manualStatus: d.manualStatus ?? null,
                manualCreatedByName: d.manualCreatedByName ?? null,
            });
        } catch { }
        finally { setStatusLoading(false); }
    }, []);
    useEffect(() => { getCurrentUserClient().then(u => setCurrentUser(u)); fetchTodayStatus(); }, []);

    useEffect(() => {
        if (!selectedMonth) return;
        fetchOvertimeTotal(selectedMonth.year, selectedMonth.month);
        fetchAllowances();
    }, [selectedMonth, fetchOvertimeTotal, fetchAllowances]);

    useEffect(() => {
        if (isAdminRole(currentUser?.role)) {
            fetchSalaryHistory();
        }
    }, [isAdminRole, currentUser, fetchSalaryHistory]);

    useEffect(() => {
        if (!selectedMonth) return;
        const { year, month } = selectedMonth;
        setLoading(true);
        const tasks: Promise<any>[] = [
            fetchAttendance(),
            fetchDayOffs(),
            fetchAllDateOffs(),
            fetchManualRecords(year, month),
            fetchAllUsers(),
            fetchSalaries(),  // ✅ Untuk SEMUA users
            fetchAllowances()  // ✅ Untuk SEMUA users
        ];
        if (isAdminRole(currentUser?.role)) {
            tasks.push(fetchLeaveData(year, month));
        }
        Promise.all(tasks).finally(() => setLoading(false));
        if (isAdminRole(currentUser?.role)) {
            fetchSalarySlips(year, month);
        }
    }, [selectedMonth, fetchAttendance, fetchDayOffs, fetchAllDateOffs, fetchManualRecords, fetchAllUsers, fetchSalaries, fetchAllowances, fetchLeaveData, fetchSalarySlips, currentUser?.role]);

    useEffect(() => {
        if (isAdminRole(currentUser?.role)) {
            fetchSalarySlips(selectedSlipMonth.year, selectedSlipMonth.month);
        }
    }, [selectedSlipMonth, isAdminRole, currentUser, fetchSalarySlips]);

    const openAddManual = useCallback(async (date?: string, userId?: string) => {
        setEditManualData(null);
        setManualPrefillDate(date ?? selectedDate);
        setManualPrefillUser(userId);
        if (allUsers.length === 0) {
            setUsersLoading(true);
            await fetchAllUsers();
            setUsersLoading(false);
        }
        setShowManualModal(true);
    }, [selectedDate, allUsers, fetchAllUsers]);

    const openEditManual = useCallback(async (record: ManualAttendance) => {
        setEditManualData(record);
        setManualPrefillDate(null);
        setManualPrefillUser(undefined);
        if (allUsers.length === 0) {
            setUsersLoading(true);
            await fetchAllUsers();
            setUsersLoading(false);
        }
        setShowManualModal(true);
    }, [allUsers, fetchAllUsers]);

    // ✅ FIXED: Tambahkan refreshAll yang hilang
    const refreshAll = useCallback(async () => {
        if (!selectedMonth) return;
        const { year, month } = selectedMonth;
        setLoading(true);
        const tasks: Promise<any>[] = [
            fetchAttendance(),
            fetchDayOffs(),
            fetchAllDateOffs(),
            fetchManualRecords(year, month),
            fetchAllUsers(),
            fetchSalaries(),
            fetchAllowances(),
        ];
        if (isAdminRole(currentUser?.role)) {
            tasks.push(fetchLeaveData(year, month));
        }
        Promise.all(tasks).finally(() => setLoading(false));
    }, [
        selectedMonth,
        currentUser?.role,
        fetchAttendance,
        fetchDayOffs,
        fetchAllDateOffs,
        fetchManualRecords,
        fetchAllUsers,
        fetchSalaries,
        fetchAllowances,
        fetchLeaveData,
    ]);

    // ── Derived ───────────────────────────────────────────────────────────────
    const dayOffByName = useMemo(() => { const m: Record<string, Set<number>> = {}; dayOffs.forEach(d => { const n = d.users?.name; if (!n) return; if (!m[n]) m[n] = new Set(); m[n].add(d.day_of_week); }); return m; }, [dayOffs]);
    const dateOffByName = useMemo(() => { const m: Record<string, Set<string>> = {}; allDateOffs.forEach(d => { const n = d.users?.name; if (!n) return; if (!m[n]) m[n] = new Set(); m[n].add(d.off_date); }); return m; }, [allDateOffs]);

    const isDayOffForUser = (name: string, dk: string) => { const dow = new Date(dk + "T12:00:00").getDay(); return (dayOffByName[name]?.has(dow) ?? false) || (dateOffByName[name]?.has(dk) ?? false); };
    const getOffUsersForDate = (dk: string) => { const dow = new Date(dk + "T12:00:00").getDay(); const w = Object.entries(dayOffByName).filter(([, s]) => s.has(dow)).map(([n]) => n); const s = Object.entries(dateOffByName).filter(([, s]) => s.has(dk)).map(([n]) => n); return [...new Set([...w, ...s])]; };
    const allowanceMap = useMemo(() => {
        const m: Record<string, UserAllowances> = {};
        allowances.forEach(a => (m[a.user_id] = a));
        return m;
    }, [allowances]);

    // manualMap: user_id_date → record
    const manualMap = useMemo(() => {
        const m: Record<string, ManualAttendance> = {};
        manualRecords.forEach(r => { m[`${r.user_id}_${r.attendance_date}`] = r; });
        return m;
    }, [manualRecords]);

    // Merged auto + manual
    const mergedAttendances = useMemo((): Attendance[] => {
        const auto = attendances.map(a => ({ ...a, source: "AUTO" as const }));
        const manualExtra: Attendance[] = manualRecords
            .filter(mr => {
                const inAuto = auto.some(a => (a.user_id ?? "") === mr.user_id && toWIBDateKey(a.check_in_time || a.created_at) === mr.attendance_date);
                return !inAuto;
            })
            .map(mr => ({
                id: mr.id, user_id: mr.user_id,
                user_name: mr.users?.name || (mr.user_id === currentUser?.id ? currentUser?.name : null) || "Unknown",
                user_role: mr.users?.role || (mr.user_id === currentUser?.id ? currentUser?.role : "") || "",
                user_shift: (mr.users?.shift as "PAGI" | "SORE") || "PAGI",
                date: mr.check_in_time, check_in_time: mr.check_in_time, status: mr.status, method: "MANUAL",
                latitude: null, longitude: null, accuracy: null, device: "Manual entry", ip_address: "", face_distance: null, created_at: mr.check_in_time,
                displayStatus: (mr.status === "PRESENT" ? "PRESENT" : mr.status === "LATE" ? "LATE" : "SKIP") as "PRESENT" | "LATE" | "SKIP",
                source: "MANUAL" as const,
            }));
        return [...auto, ...manualExtra];
    }, [attendances, manualRecords, currentUser]);

    const thisMonthKey = `${calYear}-${pad2(calMonth + 1)}`;
    const thisMonthAtt = mergedAttendances.filter(a => toWIBDateKey(a.check_in_time || a.created_at).startsWith(thisMonthKey));

    const byDate = useMemo(() => {
        const m: Record<string, Attendance[]> = {};
        const filtered = filterUser === "Semua" ? mergedAttendances : mergedAttendances.filter(a => a.user_name === filterUser);
        filtered.forEach(a => { const k = toWIBDateKey(a.check_in_time || a.created_at); if (!m[k]) m[k] = []; m[k].push(a); });
        return m;
    }, [mergedAttendances, filterUser]);

    const calDays = useMemo(() => {
        const fd = new Date(calYear, calMonth, 1).getDay(), dim = new Date(calYear, calMonth + 1, 0).getDate();
        const c: (number | null)[] = []; for (let i = 0; i < fd; i++)c.push(null); for (let d = 1; d <= dim; d++)c.push(d); return c;
    }, [calYear, calMonth]);

    const todayKey = getWIBToday();
    const uniqueUsers = useMemo(() => { if (allUsers.length > 0) return allUsers.map(u => u.name).sort(); return [...new Set(mergedAttendances.map(a => a.user_name))].sort(); }, [allUsers, mergedAttendances]);
    const salaryMap = useMemo(() => { const m: Record<string, UserSalary> = {}; salaries.forEach(s => m[s.user_id] = s); return m; }, [salaries]);


    const userSummary = useMemo(() => {
        type UserStat = {
            name: string; present: number; late: number; score: number;
            pastWorkdays: number; totalWorkdays: number; pct: number;
            remainingDays: number; userId: string;
            absences: AbsenceItem[]; offDates: string[];
        };

        const todayWIB = getWIBToday();
        const isCurrentMonth = thisMonthKey === todayWIB.slice(0, 7);
        const dim = new Date(calYear, calMonth + 1, 0).getDate();

        const effByName: Record<string, Record<string, "PRESENT" | "LATE" | "ABSENT">> = {};
        const setEff = (name: string, date: string, status: "PRESENT" | "LATE" | "ABSENT") => {
            if (!effByName[name]) effByName[name] = {};
            effByName[name][date] = status;
        };

        thisMonthAtt.forEach(a => {
            if (a.source !== "AUTO") return;
            const dk = toWIBDateKey(a.check_in_time || a.created_at);
            setEff(a.user_name, dk,
                a.displayStatus === "PRESENT" ? "PRESENT" : a.displayStatus === "LATE" ? "LATE" : "ABSENT");
        });

        const manualByName: Record<string, Record<string, ManualAttendance>> = {};
        manualRecords.forEach(mr => {

            const name = mr.users?.name ?? (mr.user_id === currentUser?.id ? currentUser?.name : null);
            if (!name || !mr.attendance_date.startsWith(thisMonthKey)) return;
            if (!manualByName[name]) manualByName[name] = {};
            manualByName[name][mr.attendance_date] = mr;
            setEff(name, mr.attendance_date,
                mr.status === "PRESENT" ? "PRESENT" : mr.status === "LATE" ? "LATE" : "ABSENT");
        });

        const names = new Set<string>();
        allUsers.forEach(u => names.add(u.name));
        Object.keys(effByName).forEach(n => names.add(n));
        Object.keys(manualByName).forEach(n => names.add(n));

        const userIdByName: Record<string, string> = {};

        allUsers.forEach(u => { userIdByName[u.name] = u.id; });

        if (allUsers.length === 0) {
            mergedAttendances.forEach(a => {
                if (a.user_id && a.user_name && !userIdByName[a.user_name]) {
                    userIdByName[a.user_name] = a.user_id;
                }
            });
        }

        // Source 3: manualRecords (extra fallback)
        manualRecords.forEach(mr => {
            if (mr.user_id && mr.users?.name && !userIdByName[mr.users.name]) {
                userIdByName[mr.users.name] = mr.user_id;
            }
        });

        // 3) Enumerasi hari kerja yang SUDAH LEWAT per user → present/late/absent konsisten
        const result: UserStat[] = [];
        names.forEach(name => {
            const dows = dayOffByName[name] ?? new Set<number>();
            const offs = dateOffByName[name] ?? new Set<string>();

            let present = 0, late = 0, score = 0;
            const absences: AbsenceItem[] = [];
            const offDates: string[] = [];

            for (let d = 1; d <= dim; d++) {
                const dk = `${calYear}-${pad2(calMonth + 1)}-${pad2(d)}`;
                if (isCurrentMonth && dk > todayWIB) break;
                const dow = new Date(dk + "T12:00:00").getDay();
                if (dows.has(dow) || offs.has(dk)) { offDates.push(dk); continue; }

                const eff = effByName[name]?.[dk];
                if (eff === "PRESENT") { present++; score += 1; }
                else if (eff === "LATE") { late++; score += 0.5; }
                else {
                    const mr = manualByName[name]?.[dk];
                    const hasLeaveToday = leaveData.find(ld => ld.user.id === userIdByName[name])?.requests.some(r => r.leave_date === dk);

                    if (!hasLeaveToday) {
                        absences.push({ date: dk, reason: (mr?.status as AbsenceReason) ?? "ALPHA", note: mr?.notes ?? null });
                    } else {
                        offDates.push(dk);
                    }
                }
            }

            const pastWorkdays = present + late + absences.length;
            const totalWorkdays = countWorkingDays(calYear, calMonth, dows, offs);
            const pct = totalWorkdays > 0 ? Math.min(100, (score / totalWorkdays) * 100) : 0;

            const resolvedUserId = userIdByName[name] ??
                Object.entries(manualByName[name] || {})
                    .map(([_, rec]) => rec.user_id)
                    .filter(Boolean)[0] ??
                "";

            result.push({
                name, present, late, score, pastWorkdays, totalWorkdays, pct,
                remainingDays: totalWorkdays - pastWorkdays,
                userId: resolvedUserId,
                absences, offDates,
            });
        });

        return result.sort((a, b) => a.name.localeCompare(b.name, "id"));
    }, [thisMonthAtt, manualRecords, dayOffByName, dateOffByName, calYear, calMonth, allUsers, thisMonthKey, currentUser]);

    const thisMonthPresent = thisMonthAtt.filter(a => a.displayStatus === "PRESENT").length;
    const thisMonthLate = thisMonthAtt.filter(a => a.displayStatus === "LATE").length;
    const thisMonthDays = new Set(thisMonthAtt.map(a => toWIBDateKey(a.check_in_time || a.created_at))).size;

    const selectedAttendances = selectedDate
        ? [...(byDate[selectedDate] || [])].sort((a, b) =>
            a.user_name.localeCompare(b.user_name, "id-ID", { sensitivity: "base" })
        )
        : [];

    // ✅ NEW FUNCTION: Generate slip gaji dari data rekapan yang sudah di-calculate
    const generateSlipFromRecapan = useCallback(async (userStat: typeof userSummary[0]) => {
        try {
            const sal = salaryMap[userStat.userId];
            const allow = allowanceMap[userStat.userId];
            const overtimeAmount = overtimeTotal[userStat.userId] || 0;

            // Hitung gaji pokok
            const salaryIncome =
                sal && sal.salary_type === "FIXED"
                    ? sal.base_salary
                    : sal && userStat.totalWorkdays > 0
                        ? Math.round((sal.base_salary / userStat.totalWorkdays) * userStat.score)
                        : 0;

            // Tunjangan (disesuaikan % kehadiran)
            const allowanceWife =
                Math.round((allow?.allowance_wife || 0) * (userStat.pct / 100)) || 0;
            const allowanceChild =
                Math.round((allow?.allowance_child || 0) * (userStat.pct / 100)) || 0;

            // Potongan (langsung)
            const deductionLoan = allow?.deduction_loan || 0;
            const deductionPension = allow?.deduction_pension || 0;

            // Total
            const grossIncome = salaryIncome + allowanceWife + allowanceChild + overtimeAmount;
            const totalDeduction = deductionLoan + deductionPension;
            const netSalary = grossIncome - totalDeduction;

            console.log(`[generateSlipFromRecapan] Generate slip untuk ${userStat.name}:`, {
                salaryIncome,
                allowanceWife,
                allowanceChild,
                grossIncome,
                totalDeduction,
                netSalary,
            });

            // POST ke API dengan data pre-calculated
            const res = await fetch("/api/attendance/salary-slip", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_id: userStat.userId,
                    year: calYear,
                    month: calMonth + 1,
                    // ✅ Kirim data pre-calculated dari rekapan
                    salary_type: sal?.salary_type || "FIXED",
                    base_salary: sal?.base_salary || 0,
                    salary_income: salaryIncome,
                    allowance_wife: allowanceWife,
                    allowance_child: allowanceChild,
                    overtime: overtimeAmount,
                    total_income: grossIncome,
                    deduction_loan: deductionLoan,
                    deduction_pension: deductionPension,
                    total_deduction: totalDeduction,
                    net_salary: netSalary,
                }),
            });

            const data = await res.json();
            if (!data.success) {
                alert(`Gagal generate slip ${userStat.name}: ${data.message}`);
                return false;
            }

            return true;
        } catch (err) {
            console.error("[generateSlipFromRecapan] error:", err);
            alert("Gagal generate slip. Lihat console untuk detail.");
            return false;
        }
    }, [salaryMap, allowanceMap, overtimeTotal, calYear, calMonth]);

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (!document.hidden && selectedMonth) {
                console.log("🔄 Refresh data...");
                refreshAll();
            }
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
    }, [selectedMonth, refreshAll]);

    if (!selectedMonth) return (
        <DashboardLayout>
            <MonthSelector onSelect={(y, m) => setSelectedMonth({ year: y, month: m })} />
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
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 flex-wrap">
                                <span className="bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">{isAdminRole(currentUser?.role)
                                    ? "Laporan Absensi" : "Absensi Saya"}</span>
                                <span className="text-gray-300">—</span>
                                <span className="bg-gradient-to-r from-[#1a1a2e] to-[#16213e] bg-clip-text text-transparent">{MONTH_NAMES[calMonth]} {calYear}</span>
                            </h1>
                            <p className="text-xs text-gray-400 mt-1">{thisMonthDays} hari hadir · {thisMonthPresent} tepat waktu · {thisMonthLate} terlambat</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        {isAdminRole(currentUser?.role) && (
                            <button
                                onClick={() => openAddManual()}
                                disabled={usersLoading}
                                className="flex items-center gap-1.5 text-xs font-bold text-[#1a1a2e] bg-slate-100 border border-slate-200 px-4 py-2 rounded-xl hover:bg-slate-200 transition-all active:scale-95 disabled:opacity-60"
                            >
                                {usersLoading ? "⏳ Loading..." : "✏️ Absen Manual"}
                            </button>
                        )}
                        <button onClick={refreshAll} className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 border border-gray-200 px-4 py-2 rounded-xl bg-white hover:shadow-md transition-all active:scale-95">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>Refresh
                        </button>
                    </div>
                </div>

                <TodayAttendanceCard status={todayStatus} loading={statusLoading} onRefresh={fetchTodayStatus} />

                {/* ── Stat Cards ── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                        { label: "Hari Hadir", value: thisMonthDays, icon: "📅", gradient: "from-gray-50 to-gray-100", iconBg: "bg-gray-100" },
                        { label: "Tepat Waktu", value: thisMonthPresent, icon: "✅", gradient: "from-emerald-50 to-green-100", iconBg: "bg-emerald-100" },
                        { label: "Terlambat", value: thisMonthLate, icon: "⏰", gradient: "from-amber-50 to-yellow-100", iconBg: "bg-amber-100" },
                        { label: "Karyawan", value: uniqueUsers.length, icon: "👥", gradient: "from-blue-50 to-indigo-100", iconBg: "bg-blue-100" },
                    ].map(c => (
                        <div key={c.label} className={`bg-gradient-to-br ${c.gradient} rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 p-5 hover:scale-[1.02]`}>
                            <div className="flex items-start justify-between mb-3">
                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{c.label}</p>
                                <div className={`w-8 h-8 rounded-xl ${c.iconBg} flex items-center justify-center shadow-sm`}><span className="text-base">{c.icon}</span></div>
                            </div>
                            <p className="text-3xl font-black tracking-tight text-gray-800">
                                {loading ? <span className="inline-block w-10 h-8 bg-white/50 rounded-lg animate-pulse" /> : c.value}
                            </p>
                            <p className="text-[10px] text-gray-400 font-medium mt-1">{MONTH_SHORT[calMonth]} {calYear}</p>
                        </div>
                    ))}
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-1.5 flex gap-1 flex-wrap">
                    {isAdminRole(currentUser?.role) ? (
                        ([
                            { id: "calendar", label: "📅 Kalender" },
                            { id: "summary", label: "📊 Ringkasan" },
                            { id: "salary", label: "💰 Rekap Gaji" },
                            { id: "salary-slip", label: "📄 Slip Gaji" },
                            { id: "salary-history", label: "📋 Riwayat Gaji" },
                            { id: "leave", label: "🌴 Cuti" },
                        ] as const).map(t => (
                            <button key={t.id} onClick={() => setActiveTab(t.id)}
                                className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all duration-200 flex-1 min-w-fit ${activeTab === t.id
                                    ? "bg-gradient-to-r from-[#1a1a2e] to-[#16213e] text-white shadow-md"
                                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                                    }`}>
                                {t.label}
                            </button>
                        ))
                    ) : (
                        ([
                            { id: "calendar", label: "📅 Kalender" },
                            { id: "my-salary", label: "💰 Gaji Saya" },
                        ] as const).map(t => (
                            <button key={t.id} onClick={() => setActiveTab(t.id)}
                                className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all duration-200 flex-1 ${activeTab === t.id
                                    ? "bg-gradient-to-r from-[#1a1a2e] to-[#16213e] text-white shadow-md"
                                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                                    }`}>
                                {t.label}
                            </button>
                        ))
                    )}
                </div>

                {/* ── Filter ── */}
                {isAdminRole(currentUser?.role)
                    && activeTab === "calendar" && (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">🎯 Filter Karyawan</p>
                            <div className="flex flex-wrap gap-2">
                                <button onClick={() => setFilterUser("Semua")} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${filterUser === "Semua" ? "bg-gradient-to-r from-[#1a1a2e] to-[#16213e] text-white shadow-md scale-105" : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"}`}>Semua</button>
                                {uniqueUsers.map(n => (
                                    <button key={n} onClick={() => setFilterUser(n)} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${filterUser === n ? "bg-gradient-to-r from-[#1a1a2e] to-[#16213e] text-white shadow-md scale-105" : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"}`}>{n}</button>
                                ))}
                            </div>
                        </div>
                    )}

                {/* ════ TAB KALENDER ════ */}
                {activeTab === "calendar" && (
                    <>
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-lg transition-all duration-300">
                            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
                                <div className="flex items-center gap-3">
                                    <span className="text-lg font-bold text-gray-800 tracking-tight">{MONTH_NAMES[calMonth]} {calYear}</span>
                                    {calYear === new Date().getFullYear() && calMonth === new Date().getMonth() && <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 border border-emerald-200 px-3 py-1 rounded-full">Bulan ini</span>}
                                </div>
                                <div className="hidden sm:flex items-center gap-4 flex-wrap">
                                    {[["bg-emerald-400", "Tepat"], ["bg-amber-400", "Terlambat"], ["bg-gray-400", "Skip"], ["bg-blue-400", "Manual"], ["bg-red-300", "Libur"]].map(([c, l]) => (
                                        <div key={l} className="flex items-center gap-1.5 text-[11px] text-gray-500 font-medium"><span className={`w-2.5 h-2.5 rounded-full ${c}`} />{l}</div>
                                    ))}
                                </div>
                            </div>

                            <div className="p-4 sm:p-6">
                                <div className="grid grid-cols-7 mb-2 sm:mb-4">
                                    {DAY_NAMES.map(d => <div key={d} className="text-center text-[9px] sm:text-[10px] font-black uppercase py-1.5 sm:py-2 text-gray-400 tracking-wider sm:tracking-widest">{d}</div>)}
                                </div>
                                {loading ? (
                                    <div className="grid grid-cols-7 gap-1 sm:gap-2">{Array(35).fill(0).map((_, i) => <div key={i} className="h-[58px] sm:h-20 rounded-lg sm:rounded-xl bg-gray-50 animate-pulse" />)}</div>

                                ) : (
                                    <div className="grid grid-cols-7 gap-1 sm:gap-2">
                                        {calDays.map((day, idx) => {
                                            if (day === null) return <div key={`e-${idx}`} />;
                                            const dk = `${calYear}-${pad2(calMonth + 1)}-${pad2(day)}`;
                                            const dd = byDate[dk] || [];
                                            const pc = dd.filter(a => a.displayStatus === "PRESENT").length;
                                            const lc = dd.filter(a => a.displayStatus === "LATE").length;
                                            const sc = dd.filter(a => a.displayStatus === "SKIP").length;
                                            const mc = dd.filter(a => a.source === "MANUAL").length;
                                            const tot = dd.length;
                                            const isTod = dk === todayKey, isSel = dk === selectedDate;
                                            const effectiveFilterUser = !isAdminRole(currentUser?.role) && currentUser?.name
                                                ? currentUser.name
                                                : filterUser;
                                            const isUserDayOff = effectiveFilterUser !== "Semua" ? isDayOffForUser(effectiveFilterUser, dk) : false;
                                            const hasAnyDayOff = filterUser === "Semua" ? getOffUsersForDate(dk).length > 0 : false;
                                            const hasManual = mc > 0;
                                            return (
                                                <button key={day} onClick={() => setSelectedDate(p => p === dk ? null : dk)}
                                                    className={`relative flex flex-col items-start justify-start p-1.5 sm:p-3 rounded-lg sm:rounded-xl min-h-[58px] sm:min-h-[80px] transition-all duration-300 ${isSel ? "bg-gradient-to-br from-[#1a1a2e] to-[#16213e] shadow-xl sm:scale-[1.02] ring-2 ring-[#1a1a2e]/30" : isTod ? "bg-gradient-to-br from-blue-50 to-indigo-50 ring-1 ring-blue-200" : isUserDayOff && !tot ? "bg-gradient-to-br from-red-50 to-rose-50" : tot ? "bg-gray-50/80 hover:bg-gray-100 hover:shadow-md" : "hover:bg-gray-50 hover:shadow-sm"}`}>
                                                    {isUserDayOff && (filterUser !== "Semua" || !isAdminRole(currentUser?.role)) && <span className={`absolute top-1 right-1 sm:top-2 sm:right-2 w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${isSel ? "bg-red-300 animate-pulse" : "bg-red-400"}`} />}
                                                    {filterUser === "Semua" && hasAnyDayOff && !isSel && <span className="absolute top-1 right-1 sm:top-2 sm:right-2 w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-red-300 animate-pulse" />}
                                                    {hasManual && <span className="hidden sm:block absolute top-2 left-2 w-2 h-2 rounded-full bg-blue-400" />}
                                                    <span className={`text-xs sm:text-base font-black leading-none mb-1 sm:mb-2 ${isSel ? "text-white" : isTod ? "text-blue-600" : isUserDayOff ? "text-red-500" : "text-gray-800"}`}>{day}</span>
                                                    {tot > 0 && (
                                                        <div className="flex flex-col gap-1 w-full mt-auto">
                                                            <div className="flex gap-0.5 sm:gap-1">
                                                                {pc > 0 && <div className={`h-1 sm:h-1.5 rounded-full ${isSel ? "bg-emerald-300" : "bg-emerald-400"}`} style={{ width: `${(pc / tot) * 100}%` }} />}
                                                                {lc > 0 && <div className={`h-1 sm:h-1.5 rounded-full ${isSel ? "bg-amber-300" : "bg-amber-400"}`} style={{ width: `${(lc / tot) * 100}%` }} />}
                                                                {sc > 0 && <div className={`h-1 sm:h-1.5 rounded-full ${isSel ? "bg-gray-300" : "bg-gray-400"}`} style={{ width: `${(sc / tot) * 100}%` }} />}
                                                                {mc > 0 && <div className={`h-1 sm:h-1.5 rounded-full ${isSel ? "bg-blue-300" : "bg-blue-400"}`} style={{ width: `${(mc / tot) * 100}%` }} />}
                                                            </div>
                                                            <span className={`text-[9px] sm:text-[10px] font-bold leading-tight ${isSel ? "text-white/70" : "text-gray-400"}`}>
                                                                <span className="hidden sm:inline">{tot} hadir{mc > 0 ? ` · ${mc}✏️` : ""}</span>
                                                                <span className="sm:hidden">{tot}{mc > 0 ? "✏️" : ""}</span>
                                                            </span>
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
                                            {new Date(selectedDate + "T12:00:00+07:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                                        </p>
                                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                                            {selectedAttendances.filter(a => a.displayStatus === "PRESENT").length > 0 && <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-3 py-1 rounded-full">✅ {selectedAttendances.filter(a => a.displayStatus === "PRESENT").length} tepat</span>}
                                            {selectedAttendances.filter(a => a.displayStatus === "LATE").length > 0 && <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-3 py-1 rounded-full">⏰ {selectedAttendances.filter(a => a.displayStatus === "LATE").length} terlambat</span>}
                                            {selectedAttendances.filter(a => a.source === "MANUAL").length > 0 && <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-blue-700 bg-blue-100 border border-blue-200 px-3 py-1 rounded-full">✏️ {selectedAttendances.filter(a => a.source === "MANUAL").length} manual</span>}
                                            {getOffUsersForDate(selectedDate).length > 0 && <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-red-700 bg-red-100 border border-red-200 px-3 py-1 rounded-full">🔴 {getOffUsersForDate(selectedDate).length} libur</span>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {isAdminRole(currentUser?.role)
                                            && (
                                                <button onClick={() => openAddManual(selectedDate)} className="flex items-center gap-1.5 text-[11px] font-bold text-[#1a1a2e] bg-slate-100 border border-slate-200 px-3 py-2 rounded-xl hover:bg-slate-200 transition-all">
                                                    ➕ Tambah Manual
                                                </button>
                                            )}
                                        <button onClick={() => setSelectedDate(null)} className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                    </div>
                                </div>

                                {selectedAttendances.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-12 px-6">
                                        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                                            {!isAdminRole(currentUser?.role) && currentUser?.name && isDayOffForUser(currentUser.name, selectedDate ?? "")
                                                ? <span className="text-3xl">🏖️</span>
                                                : <span className="text-3xl opacity-40">📅</span>
                                            }
                                        </div>
                                        {!isAdminRole(currentUser?.role) && currentUser?.name && isDayOffForUser(currentUser.name, selectedDate ?? "") ? (
                                            <div className="text-center">
                                                <p className="text-sm font-bold text-orange-600 mb-1">Hari Libur</p>
                                                <p className="text-xs text-gray-400">Kamu tidak masuk kerja di tanggal ini</p>
                                            </div>
                                        ) : !isAdminRole(currentUser?.role) ? (
                                            <div className="text-center">
                                                <p className="text-sm font-bold text-gray-500 mb-1">Tidak Ada Catatan</p>
                                                <p className="text-xs text-gray-400">
                                                    Ini bukan hari liburmu — tapi tidak ada data absensi di tanggal ini
                                                </p>
                                                <span className="inline-flex items-center gap-1.5 mt-3 text-[10px] font-bold px-3 py-1.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                                                    📋 Hari Kerja
                                                </span>
                                            </div>
                                        ) : (
                                            <p className="text-sm text-gray-400 font-medium">Tidak ada data absensi di tanggal ini</p>
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
                                                    {isAdminRole(currentUser?.role)
                                                        && <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Aksi</th>}
                                                    <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Shift</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {selectedAttendances.map(a => {
                                                    const userId = a.user_id ?? "";
                                                    const dateKey = toWIBDateKey(a.check_in_time || a.created_at);
                                                    const manualRec = manualMap[`${userId}_${dateKey}`];
                                                    return (
                                                        <tr key={a.id} className={`hover:bg-gray-50/60 transition-colors duration-200 ${a.source === "MANUAL" && (
                                                            <span className="inline-flex items-center text-[10px] font-bold px-3 py-1.5 rounded-full border bg-blue-100 text-blue-700 border-blue-200">
                                                                ✏️ Manual
                                                            </span>
                                                        )}`}>
                                                            <td className="px-6 py-4">
                                                                <div className="flex items-center gap-3">
                                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-[11px] font-black flex-shrink-0 shadow-md ${a.displayStatus === "PRESENT" ? "bg-gradient-to-br from-[#1a1a2e] to-[#16213e]" : "bg-gradient-to-br from-amber-500 to-orange-500"}`}>{initials(a.user_name)}</div>
                                                                    <div>
                                                                        <p className="font-bold text-gray-800 text-sm">{a.user_name}</p>
                                                                        <p className="text-[10px] text-gray-400 font-medium mt-0.5">{a.user_role?.replace(/_/g, " ")}</p>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-4">
                                                                {manualRec && (["ABSENT", "SICK", "PERMIT"] as string[]).includes(manualRec.status) ? (
                                                                    <span className="text-[10px] text-gray-300 font-bold">—</span>
                                                                ) : (
                                                                    <span className="font-mono font-black text-gray-800 text-sm">
                                                                        {toWIBTime(a.check_in_time || a.created_at)}
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-4">
                                                                {manualRec ? (
                                                                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-full border ${MANUAL_STATUS_LABELS[manualRec.status]?.bg} ${MANUAL_STATUS_LABELS[manualRec.status]?.color} ${MANUAL_STATUS_LABELS[manualRec.status]?.border}`}>
                                                                        {MANUAL_STATUS_LABELS[manualRec.status]?.emoji} {MANUAL_STATUS_LABELS[manualRec.status]?.label}
                                                                    </span>
                                                                ) : (
                                                                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-full border ${a.displayStatus === "PRESENT" ? "bg-emerald-100 text-emerald-700 border-emerald-200" : a.displayStatus === "SKIP" ? "bg-gray-100 text-gray-500 border-gray-200" : "bg-amber-100 text-amber-700 border-amber-200"}`}>
                                                                        {a.displayStatus === "PRESENT" ? "✓ Tepat" : a.displayStatus === "SKIP" ? "⏭ Skip" : "⏰ Terlambat"}
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-4">
                                                                <span className={`inline-flex items-center text-[10px] font-bold px-3 py-1.5 rounded-full border w-fit ${a.source === "MANUAL" ? "bg-blue-100 text-blue-700 border-blue-200" : a.method === "FACE" ? "bg-indigo-100 text-indigo-600 border-indigo-200" : "bg-gray-100 text-gray-400 border-gray-200"}`}>
                                                                    {a.source === "MANUAL" ? "✏️ Manual" : a.method === "FACE" ? "🫦 Wajah" : "⏭ Skip"}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-4">
                                                                {a.latitude && a.longitude ? (
                                                                    <a href={`https://maps.google.com/?q=${a.latitude},${a.longitude}`} target="_blank" rel="noopener noreferrer"
                                                                        className={`inline-flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 rounded-full border no-underline transition-all hover:shadow-md ${Math.round(haversine(a.latitude, a.longitude, OFFICE_LAT, OFFICE_LNG)) <= 80 ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-red-100 text-red-600 border-red-200"}`}>
                                                                        📍 {Math.round(haversine(a.latitude, a.longitude, OFFICE_LAT, OFFICE_LNG))}m
                                                                    </a>
                                                                ) : <span className="text-[10px] text-gray-200 font-bold">—</span>}
                                                            </td>
                                                            <td className="px-4 py-4 hidden lg:table-cell">
                                                                <div className="space-y-0.5">
                                                                    {manualRec?.notes && (
                                                                        <p className="text-[11px] text-blue-600 font-medium max-w-[180px] truncate">📝 {manualRec.notes}</p>
                                                                    )}
                                                                    {manualRec?.created_by_name && (
                                                                        <p className="text-[10px] text-violet-500 font-bold">
                                                                            ✏️ oleh {manualRec.created_by_name}
                                                                        </p>
                                                                    )}
                                                                    {!manualRec && (
                                                                        <p className="text-[10px] text-gray-400 truncate max-w-[180px] font-mono">{a.device || "—"}</p>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            {/* ✅ NEW: Tombol Edit di tabel */}
                                                            {isAdminRole(currentUser?.role)
                                                                && (
                                                                    <td className="px-4 py-4 text-center">
                                                                        <div className="flex items-center gap-1.5 justify-center flex-wrap">
                                                                            {a.source === "MANUAL" ? (
                                                                                <button
                                                                                    onClick={async () => {
                                                                                        if (manualRec) await openEditManual(manualRec);
                                                                                    }}
                                                                                    className="inline-flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 border border-slate-200 hover:bg-blue-100 hover:text-blue-700 hover:border-blue-200 transition-all duration-200"
                                                                                    title="Edit manual attendance">
                                                                                    ✏️ Edit
                                                                                </button>
                                                                            ) : (
                                                                                <>
                                                                                    <button
                                                                                        onClick={async () => {
                                                                                            if (!confirm("Hapus absen wajah ini? Akan dihapus dari sistem.")) return;
                                                                                            try {
                                                                                                const res = await fetch(`/api/attendance?id=${a.id}`, {
                                                                                                    method: "DELETE"
                                                                                                });
                                                                                                const d = await res.json();
                                                                                                if (!d.success) {
                                                                                                    alert(d.message || "Gagal menghapus");
                                                                                                    return;
                                                                                                }
                                                                                                refreshAll(); // Refresh data
                                                                                            } catch (err) {
                                                                                                console.error("Delete error:", err);
                                                                                                alert("Gagal menghapus absen");
                                                                                            }
                                                                                        }}
                                                                                        className="inline-flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 hover:text-red-700 transition-all duration-200"
                                                                                        title="Hapus absen wajah ini">
                                                                                        🗑️ Hapus
                                                                                    </button>

                                                                                    <button
                                                                                        onClick={async () => {
                                                                                            const foundUser = allUsers.find(u => u.name === a.user_name);
                                                                                            const resolvedUserId = foundUser?.id || a.user_id || "";
                                                                                            const dateKey = toWIBDateKey(a.check_in_time || a.created_at);
                                                                                            const prefillRecord: ManualAttendance = {
                                                                                                id: "",
                                                                                                user_id: resolvedUserId,
                                                                                                attendance_date: dateKey,
                                                                                                check_in_time: a.check_in_time || a.created_at,
                                                                                                status: (a.displayStatus === "PRESENT" ? "PRESENT" : a.displayStatus === "LATE" ? "LATE" : "PRESENT") as any,
                                                                                                notes: null,
                                                                                                created_by: null,
                                                                                                users: { id: resolvedUserId, name: a.user_name, role: a.user_role, shift: a.user_shift || "PAGI" },
                                                                                            };
                                                                                            await openEditManual(prefillRecord);
                                                                                        }}
                                                                                        className="inline-flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 border border-slate-200 hover:bg-blue-100 hover:text-blue-700 hover:border-blue-200 transition-all duration-200"
                                                                                        title="Convert ke manual entry">
                                                                                        ✏️ Edit
                                                                                    </button>
                                                                                </>
                                                                            )}
                                                                        </div>
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
                {activeTab === "summary" && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white flex items-center justify-between flex-wrap gap-3">
                            <div>
                                <p className="text-base font-bold text-gray-800">Ringkasan Kehadiran — {MONTH_NAMES[calMonth]} {calYear}</p>
                                <p className="text-[10px] text-gray-400 mt-1">
                                    Tepat=1.0 · Terlambat=0.5 · Tidak Hadir=0 ·
                                    <span className="text-blue-500 font-semibold"> % dihitung dari total hari kerja bulan ini</span>
                                </p>
                            </div>
                            <button
                                onClick={() => openAddManual()}
                                disabled={usersLoading}
                                className="flex items-center gap-1.5 text-xs font-bold text-[#1a1a2e] bg-slate-100 border border-slate-200 px-4 py-2 rounded-xl hover:bg-slate-200 transition-all active:scale-95 disabled:opacity-60"
                            >
                                {usersLoading ? "⏳ Loading..." : "✏️ Absen Manual"}
                            </button>                            </div>

                        {loading ? (
                            <div className="p-6 space-y-3">{Array(5).fill(0).map((_, i) => <div key={i} className="h-14 bg-gray-50 rounded-2xl animate-pulse" />)}</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-gray-100 bg-gray-50/60">
                                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest w-8">#</th>
                                            <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Karyawan</th>
                                            <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Tepat</th>
                                            <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Terlambat</th>
                                            <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Tidak Hadir</th>
                                            <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Skor</th>
                                            <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Hari Efektif</th>
                                            <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Sisa Hari</th>                                                <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest min-w-[180px]">Persentase</th>
                                            {isAdminRole(currentUser?.role) && (
                                                <>
                                                    <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Generate & Edit</th>
                                                    <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Shift</th>
                                                </>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {(isAdminRole(currentUser?.role)
                                            ? userSummary
                                            : userSummary.filter(u => u.userId === currentUser?.id)
                                        ).map((u, i) => {
                                            // ✅ absent = hari kerja yang sudah lewat dikurangi yang sudah hadir
                                            const absent = u.absences.length;
                                            const pctColor = u.pct >= 90 ? "text-emerald-600" : u.pct >= 70 ? "text-amber-600" : "text-red-500";
                                            const barGrad = u.pct >= 90 ? "from-emerald-400 to-green-500" : u.pct >= 70 ? "from-amber-400 to-orange-500" : "from-red-400 to-rose-500";
                                            return (
                                                <tr key={u.name} className="hover:bg-gray-50/60 transition-colors duration-200">
                                                    <td className="px-6 py-4 text-[11px] text-gray-400 font-black">{i + 1}</td>
                                                    <td className="px-4 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex items-center justify-center text-white text-[10px] font-black flex-shrink-0 shadow-md">{initials(u.name)}</div>
                                                            <div>
                                                                <span className="font-bold text-gray-800 block">{u.name}</span>
                                                                {salaryMap[u.userId] && (
                                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${salaryMap[u.userId].salary_type === "FIXED" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                                                                        {salaryMap[u.userId].salary_type === "FIXED" ? "💰 Tetap" : "📊 % Absen"}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-4 text-center"><span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 text-sm font-black border border-emerald-200">{u.present}</span></td>
                                                    <td className="px-4 py-4 text-center">{u.late > 0 ? <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-amber-100 text-amber-700 text-sm font-black border border-amber-200">{u.late}</span> : <span className="text-gray-200 text-sm font-black">—</span>}</td>
                                                    <td className="px-4 py-4 text-center">
                                                        {absent > 0 ? (
                                                            <button
                                                                onClick={() => setAbsenceDetail({ name: u.name, absences: u.absences, offDates: u.offDates })}
                                                                className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-red-100 text-red-600 text-sm font-black border border-red-200 hover:bg-red-200 hover:scale-105 transition-all cursor-pointer"
                                                                title={`Lihat detail ketidakhadiran ${u.name}`}>
                                                                {absent}
                                                            </button>
                                                        ) : (
                                                            <span className="text-gray-200 text-sm font-black">—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-4 text-center"><span className="text-sm font-black text-gray-700">{u.score.toFixed(1)}</span></td>
                                                    <td className="px-4 py-4 text-center">
                                                        <div className="flex flex-col items-center">
                                                            <span className="text-sm font-bold text-gray-500">{u.pastWorkdays}h</span>
                                                            <span className="text-[9px] text-gray-300">dari {u.totalWorkdays}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-4 text-center">
                                                        <div className="flex flex-col items-center">
                                                            <span className="text-sm font-bold text-blue-500">{u.remainingDays}h</span>
                                                            <span className="text-[9px] text-gray-300">dari {u.totalWorkdays}</span>
                                                        </div>
                                                    </td>                                                        <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden min-w-[100px]">
                                                                <div className={`h-full rounded-full bg-gradient-to-r ${barGrad} transition-all duration-700`} style={{ width: `${Math.min(u.pct, 100)}%` }} />
                                                            </div>
                                                            <span className={`text-sm font-black w-16 text-right flex-shrink-0 ${pctColor}`}>{formatPct(u.pct)}%</span>
                                                        </div>
                                                    </td>
                                                    {isAdminRole(currentUser?.role) && (
                                                        <>
                                                            <td className="px-4 py-4 text-center">
                                                                <div className="flex items-center gap-1.5 justify-center flex-wrap">
                                                                    <button
                                                                        onClick={async () => {
                                                                            if (!confirm(`Generate slip gaji ${u.name} untuk ${MONTH_NAMES[calMonth]} ${calYear}?`)) return;
                                                                            const success = await generateSlipFromRecapan(u);
                                                                            if (success) {
                                                                                fetchSalarySlips(calYear, calMonth);
                                                                                alert(`✅ Slip gaji ${u.name} berhasil di-generate!`);
                                                                            }
                                                                        }}
                                                                        className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 transition-all whitespace-nowrap"
                                                                        title={`Generate slip gaji ${u.name}`}>
                                                                        📄 Slip
                                                                    </button>
                                                                    <button onClick={() => openAddManual(undefined, u.userId)}
                                                                        className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 border border-slate-200 hover:bg-[#1a1a2e] hover:text-white hover:border-[#1a1a2e] transition-all duration-200 whitespace-nowrap"
                                                                        title={`Tambah absen manual untuk ${u.name}`}>
                                                                        ➕ Absen
                                                                    </button>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-4 text-center">
                                                                <button onClick={() => {
                                                                    if (allUsers.length === 0) fetchAllUsers();
                                                                    setShiftModalUserId(u.userId);
                                                                    setShowShiftModal(true);
                                                                }} className="inline-flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100 transition-all whitespace-nowrap"
                                                                    title={`Atur jadwal shift ${u.name}`}>
                                                                    ⏰ Shift
                                                                </button>
                                                            </td>
                                                        </>
                                                    )}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-t border-gray-100 flex items-center gap-6 flex-wrap">
                            {[["bg-emerald-400", "Tepat = 1.0 poin"], ["bg-amber-400", "Terlambat = 0.5 poin"], ["bg-red-400", "Tidak hadir = 0 poin"]].map(([c, l]) => (
                                <span key={l} className="text-[10px] text-gray-500 font-medium flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-full ${c}`} />{l}</span>
                            ))}
                            <span className="text-[10px] text-blue-500 ml-auto font-medium">% = skor ÷ total hari kerja bulan ini</span>
                        </div>
                    </div>
                )}

                {/* ════ TAB GAJI ════ */}
                {activeTab === "salary" && isAdminRole(currentUser?.role) && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white flex items-center justify-between flex-wrap gap-3">
                            <div>
                                <p className="text-base font-bold text-gray-800">Rekap Gaji Lengkap — {MONTH_NAMES[calMonth]} {calYear}</p>
                                <p className="text-[10px] text-gray-400 mt-1">
                                    Gaji tetap = penuh · Persentase = % kehadiran × gaji pokok ·
                                    <span className="text-emerald-500 font-semibold"> Tunjangan disesuaikan % kehadiran</span> ·
                                    <span className="text-red-500 font-semibold"> Potongan langsung</span>
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => { if (allUsers.length === 0) fetchAllUsers(); setShowSalaryModal(true); }} className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-xl hover:bg-emerald-100 transition-all">⚙️ Atur Gaji</button>
                            </div>
                        </div>

                        {loading ? (
                            <div className="p-6 space-y-3">{Array(5).fill(0).map((_, i) => <div key={i} className="h-20 bg-gray-50 rounded-2xl animate-pulse" />)}</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm min-w-[1200px] border-collapse">
                                    <thead>
                                        <tr className="border-2 border-gray-300 bg-gray-50/60 sticky top-0">
                                            <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest border-2 border-gray-300">Karyawan</th>

                                            {/* PENGHASILAN SECTION */}
                                            <th colSpan={5} className="px-4 py-4 text-center text-[10px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50/40 border-2 border-gray-300">
                                                📈 PENGHASILAN
                                            </th>

                                            {/* POTONGAN SECTION */}
                                            <th colSpan={2} className="px-4 py-4 text-center text-[10px] font-black text-red-600 uppercase tracking-widest bg-red-50/40 border-2 border-gray-300">
                                                📉 POTONGAN
                                            </th>

                                            {/* TOTAL SECTION */}
                                            <th colSpan={2} className="px-4 py-4 text-center text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50/40 border-2 border-gray-300">
                                                💰 TOTAL
                                            </th>

                                            <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest border-2 border-gray-300">Aksi</th>
                                        </tr>

                                        {/* Sub-header */}
                                        <tr className="border-2 border-gray-200 bg-gray-50/40">
                                            <th className="px-4 py-4 border-2 border-gray-200" />

                                            {/* Penghasilan sub-headers */}
                                            <th className="px-3 py-3 text-center text-[9px] font-bold text-gray-500 border-r-2 border-gray-200">Gaji Pokok</th>
                                            <th className="px-3 py-3 text-center text-[9px] font-bold text-gray-500 border-r-2 border-gray-200">Tunjangan Istri (×%)</th>
                                            <th className="px-3 py-3 text-center text-[9px] font-bold text-gray-500 border-r-2 border-gray-200">Tunjangan Anak (×%)</th>
                                            <th className="px-3 py-3 text-center text-[9px] font-bold text-gray-500 border-r-2 border-gray-200">Lemburan</th>
                                            <th className="px-3 py-3 text-center text-[9px] font-bold text-gray-500 border-r-2 border-gray-200">Kehadiran %</th>

                                            {/* Potongan sub-headers */}
                                            <th className="px-3 py-3 text-center text-[9px] font-bold text-gray-500 border-r-2 border-gray-200">Kasbon</th>
                                            <th className="px-3 py-3 text-center text-[9px] font-bold text-gray-500 border-r-2 border-gray-200">Pensiun</th>

                                            {/* Total sub-headers */}
                                            <th className="px-3 py-3 text-center text-[9px] font-bold text-gray-500 border-r-2 border-gray-200">Gross</th>
                                            <th className="px-3 py-3 text-right text-[9px] font-bold text-gray-500 border-r-2 border-gray-200">Net</th>

                                            <th className="px-4 py-3 border-2 border-gray-200" />
                                        </tr>
                                    </thead>

                                    <tbody className="divide-y divide-gray-300">
                                        {userSummary.map(u => {
                                            const sal = salaryMap[u.userId];
                                            const allow = allowanceMap[u.userId];
                                            const overtime = overtimeTotal[u.userId] || 0;

                                            // Hitung gaji pokok
                                            const salaryIncome =
                                                sal && sal.salary_type === "FIXED"
                                                    ? sal.base_salary
                                                    : sal && u.totalWorkdays > 0
                                                        ? Math.round((sal.base_salary / u.totalWorkdays) * u.score)
                                                        : 0;

                                            // Tunjangan (disesuaikan % kehadiran)
                                            const allowanceWife =
                                                Math.round((allow?.allowance_wife || 0) * (u.pct / 100)) || 0;
                                            const allowanceChild =
                                                Math.round((allow?.allowance_child || 0) * (u.pct / 100)) || 0;

                                            // Potongan (langsung)
                                            const deductionLoan = allow?.deduction_loan || 0;
                                            const deductionPension = allow?.deduction_pension || 0;

                                            // Total
                                            const grossIncome = salaryIncome + allowanceWife + allowanceChild + overtime;
                                            const totalDeduction = deductionLoan + deductionPension;
                                            const netSalary = grossIncome - totalDeduction;

                                            return (
                                                <tr key={u.name} className="hover:bg-gray-50/60 transition-colors duration-200 border-2 border-gray-200">
                                                    <td className="px-4 py-4 border-r-2 border-gray-200">
                                                        <div className="flex items-center gap-2.5">
                                                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex items-center justify-center text-white text-[10px] font-black flex-shrink-0 shadow-md">
                                                                {initials(u.name)}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <span className="font-bold text-gray-800 block text-sm truncate">{u.name}</span>
                                                                <span className="text-[10px] text-gray-400">
                                                                    {sal ? (sal.salary_type === "FIXED" ? "💰 Tetap" : "📊 % Absen") : "—"}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    <td className="px-3 py-4 text-center border-r-2 border-gray-200">
                                                        {sal ? (
                                                            <div className="flex flex-col items-center gap-0.5">
                                                                <span className="font-mono font-bold text-gray-800 text-xs">
                                                                    {formatRupiah(sal.base_salary)}
                                                                </span>
                                                                {sal.salary_type === "PERCENTAGE" && (
                                                                    <span className="text-[8px] text-gray-400">
                                                                        {formatRupiah(Math.round(sal.base_salary / u.totalWorkdays))}/hari
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span className="text-gray-300 text-xs">—</span>
                                                        )}
                                                    </td>

                                                    {/* Tunjangan Istri */}
                                                    <td className="px-3 py-4 text-center border-r-2 border-gray-200">
                                                        {allow?.allowance_wife ? (
                                                            <div className="flex flex-col items-center gap-0.5">
                                                                <span className="font-mono font-bold text-emerald-700 text-xs">
                                                                    {formatRupiah(allowanceWife)}
                                                                </span>
                                                                <button
                                                                    onClick={() => setEditAllowanceUser({
                                                                        userId: u.userId,
                                                                        userName: u.name,
                                                                        currentAllowance: allow,
                                                                    })}
                                                                    className="text-[8px] text-blue-500 hover:text-blue-700 font-semibold cursor-pointer"
                                                                    title="Edit tunjangan"
                                                                >
                                                                    {formatRupiah(allow.allowance_wife)}
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                onClick={() => setEditAllowanceUser({
                                                                    userId: u.userId,
                                                                    userName: u.name,
                                                                    currentAllowance: allow,
                                                                })}
                                                                className="text-[9px] text-gray-400 hover:text-blue-500 font-semibold cursor-pointer"
                                                            >
                                                                Atur →
                                                            </button>
                                                        )}
                                                    </td>

                                                    {/* Tunjangan Anak */}
                                                    <td className="px-3 py-4 text-center border-r-2 border-gray-200">
                                                        {allow?.allowance_child ? (
                                                            <div className="flex flex-col items-center gap-0.5">
                                                                <span className="font-mono font-bold text-emerald-700 text-xs">
                                                                    {formatRupiah(allowanceChild)}
                                                                </span>
                                                                <span className="text-[8px] text-gray-400">
                                                                    {formatRupiah(allow.allowance_child)}
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-gray-300 text-xs">—</span>
                                                        )}
                                                    </td>

                                                    {/* Lemburan */}
                                                    <td className="px-3 py-4 text-center border-r-2 border-gray-200">
                                                        {overtime > 0 ? (
                                                            <span className="font-mono font-bold text-orange-600 text-xs">
                                                                {formatRupiah(overtime)}
                                                            </span>
                                                        ) : (
                                                            <span className="text-gray-300 text-xs">—</span>
                                                        )}
                                                    </td>

                                                    {/* Kehadiran % */}
                                                    <td className="px-3 py-4 text-center border-r-2 border-gray-200">
                                                        <div className="flex flex-col items-center gap-1">
                                                            <span className={`text-sm font-black ${u.pct >= 90 ? "text-emerald-600" : u.pct >= 70 ? "text-amber-600" : "text-red-500"
                                                                }`}>
                                                                {formatPct(u.pct)}%
                                                            </span>
                                                            <div className="w-12 h-1 bg-gray-100 rounded-full overflow-hidden">
                                                                <div
                                                                    className={`h-full rounded-full ${u.pct >= 90 ? "bg-emerald-400" : u.pct >= 70 ? "bg-amber-400" : "bg-red-400"
                                                                        }`}
                                                                    style={{ width: `${Math.min(u.pct, 100)}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* POTONGAN */}
                                                    {/* Kasbon */}
                                                    <td className="px-3 py-4 text-center border-r-2 border-gray-200">
                                                        {deductionLoan > 0 ? (
                                                            <span className="font-mono font-bold text-red-600 text-xs">
                                                                -{formatRupiah(deductionLoan)}
                                                            </span>
                                                        ) : (
                                                            <span className="text-gray-300 text-xs">—</span>
                                                        )}
                                                    </td>

                                                    {/* Pensiun */}
                                                    <td className="px-3 py-4 text-center border-r-2 border-gray-200">
                                                        {deductionPension > 0 ? (
                                                            <span className="font-mono font-bold text-red-600 text-xs">
                                                                -{formatRupiah(deductionPension)}
                                                            </span>
                                                        ) : (
                                                            <span className="text-gray-300 text-xs">—</span>
                                                        )}
                                                    </td>

                                                    {/* TOTAL */}
                                                    {/* Gross */}
                                                    <td className="px-3 py-4 text-center border-r-2 border-gray-200">
                                                        <div className="flex flex-col items-center gap-0.5">
                                                            <span className="font-black text-blue-600 text-sm">
                                                                {formatRupiah(grossIncome)}
                                                            </span>
                                                            <span className="text-[8px] text-gray-400">bruto</span>
                                                        </div>
                                                    </td>

                                                    {/* Net (dengan highlight) */}
                                                    <td className="px-3 py-4 text-right">
                                                        <div className="inline-flex flex-col items-end gap-0.5 bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-200 rounded-lg px-2 py-1">
                                                            <span className="font-black text-emerald-700 text-sm">
                                                                {formatRupiah(netSalary)}
                                                            </span>
                                                            <span className="text-[8px] text-emerald-600 font-semibold">bersih</span>
                                                        </div>
                                                    </td>

                                                    {/* Aksi */}
                                                    <td className="px-4 py-4 text-center">
                                                        <div className="flex items-center gap-1.5 justify-center flex-wrap">
                                                            {/* ✅ NEW: Tombol Generate Slip dari rekapan gaji */}
                                                            <button
                                                                onClick={async () => {
                                                                    if (!confirm(`Generate slip gaji ${u.name} untuk ${MONTH_NAMES[calMonth]} ${calYear}?`)) return;
                                                                    const success = await generateSlipFromRecapan(u);
                                                                    if (success) {
                                                                        // Refresh list slip gaji
                                                                        fetchSalarySlips(calYear, calMonth);
                                                                        alert(`✅ Slip gaji ${u.name} berhasil di-generate!`);
                                                                    }
                                                                }}
                                                                className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 transition-all whitespace-nowrap"
                                                                title={`Generate slip gaji ${u.name} dari rekapan bulan ini`}
                                                            >
                                                                📄 Slip
                                                            </button>
                                                            {/* Tombol Edit Tunjangan */}
                                                            <button
                                                                onClick={() => setEditAllowanceUser({
                                                                    userId: u.userId,
                                                                    userName: u.name,
                                                                    currentAllowance: allow,
                                                                })}
                                                                className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-purple-50 text-purple-600 border border-purple-200 hover:bg-purple-100 transition-all whitespace-nowrap"
                                                                title="Edit tunjangan & potongan"
                                                            >
                                                                💜 Tunjangan
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>

                                    {/* Footer Total */}
                                    <tfoot>
                                        <tr className="border-t-2 border-gray-300 bg-gradient-to-r from-gray-50 to-white">
                                            <td colSpan={2} className="px-4 py-4 text-sm font-black text-gray-700">
                                                TOTAL BULAN INI
                                            </td>
                                            <td className="px-3 py-4 text-center border-r-2 border-gray-200">
                                                <span className="font-mono font-black text-emerald-600 text-xs block">
                                                    {formatRupiah(
                                                        userSummary.reduce((sum, u) => {
                                                            const sal = salaryMap[u.userId];
                                                            return (
                                                                sum +
                                                                (sal && sal.salary_type === "FIXED"
                                                                    ? sal.base_salary
                                                                    : sal && u.totalWorkdays > 0
                                                                        ? Math.round((sal.base_salary / u.totalWorkdays) * u.score)
                                                                        : 0)
                                                            );
                                                        }, 0)
                                                    )}
                                                </span>
                                                <span className="text-[8px] text-gray-400">Gaji Pokok</span>
                                            </td>
                                            <td className="px-3 py-4 text-center border-r-2 border-gray-200">
                                                <span className="font-mono font-black text-emerald-600 text-xs block">
                                                    {formatRupiah(
                                                        userSummary.reduce((sum, u) => {
                                                            const allow = allowanceMap[u.userId];
                                                            return sum + (Math.round((allow?.allowance_wife || 0) * (u.pct / 100)) || 0);
                                                        }, 0)
                                                    )}
                                                </span>
                                                <span className="text-[8px] text-gray-400">Tunjangan Istri</span>
                                            </td>
                                            <td className="px-3 py-4 text-center border-r-2 border-gray-200">
                                                <span className="font-mono font-black text-emerald-600 text-xs block">
                                                    {formatRupiah(
                                                        userSummary.reduce((sum, u) => {
                                                            const allow = allowanceMap[u.userId];
                                                            return sum + (Math.round((allow?.allowance_child || 0) * (u.pct / 100)) || 0);
                                                        }, 0)
                                                    )}
                                                </span>
                                                <span className="text-[8px] text-gray-400">Tunjangan Anak</span>
                                            </td>
                                            <td className="px-3 py-4 text-center border-r-2 border-gray-200">
                                                <span className="font-mono font-black text-orange-600 text-xs block">
                                                    {formatRupiah(
                                                        userSummary.reduce((sum, u) => sum + (overtimeTotal[u.userId] || 0), 0)
                                                    )}
                                                </span>
                                                <span className="text-[8px] text-gray-400">Lemburan</span>
                                            </td>
                                            <td colSpan={2} />
                                            <td className="px-3 py-4 text-center border-r-2 border-gray-200">
                                                <span className="font-mono font-black text-red-600 text-xs block">
                                                    -{formatRupiah(
                                                        userSummary.reduce((sum, u) => sum + ((allowanceMap[u.userId]?.deduction_loan || 0) + (allowanceMap[u.userId]?.deduction_pension || 0)), 0)
                                                    )}
                                                </span>
                                                <span className="text-[8px] text-gray-400">Total Potongan</span>
                                            </td>
                                            <td className="px-3 py-4 text-center border-r-2 border-gray-200">
                                                <span className="font-mono font-black text-blue-600 text-xs block">
                                                    {formatRupiah(
                                                        userSummary.reduce((sum, u) => {
                                                            const sal = salaryMap[u.userId];
                                                            const allow = allowanceMap[u.userId];
                                                            const overtime = overtimeTotal[u.userId] || 0;

                                                            const salaryIncome =
                                                                sal && sal.salary_type === "FIXED"
                                                                    ? sal.base_salary
                                                                    : sal && u.totalWorkdays > 0
                                                                        ? Math.round((sal.base_salary / u.totalWorkdays) * u.score)
                                                                        : 0;

                                                            const allowanceWife = Math.round((allow?.allowance_wife || 0) * (u.pct / 100)) || 0;
                                                            const allowanceChild = Math.round((allow?.allowance_child || 0) * (u.pct / 100)) || 0;

                                                            return sum + salaryIncome + allowanceWife + allowanceChild + overtime;
                                                        }, 0)
                                                    )}
                                                </span>
                                                <span className="text-[8px] text-gray-400">Gross</span>
                                            </td>
                                            <td className="px-3 py-4 text-right">
                                                <span className="font-mono font-black text-emerald-700 text-sm block bg-gradient-to-br from-emerald-100 to-green-100 px-2 py-1 rounded-lg border border-emerald-200">
                                                    {formatRupiah(
                                                        userSummary.reduce((sum, u) => {
                                                            const sal = salaryMap[u.userId];
                                                            const allow = allowanceMap[u.userId];
                                                            const overtime = overtimeTotal[u.userId] || 0;

                                                            const salaryIncome =
                                                                sal && sal.salary_type === "FIXED"
                                                                    ? sal.base_salary
                                                                    : sal && u.totalWorkdays > 0
                                                                        ? Math.round((sal.base_salary / u.totalWorkdays) * u.score)
                                                                        : 0;

                                                            const allowanceWife = Math.round((allow?.allowance_wife || 0) * (u.pct / 100)) || 0;
                                                            const allowanceChild = Math.round((allow?.allowance_child || 0) * (u.pct / 100)) || 0;
                                                            const deductionLoan = allow?.deduction_loan || 0;
                                                            const deductionPension = allow?.deduction_pension || 0;

                                                            const grossIncome = salaryIncome + allowanceWife + allowanceChild + overtime;
                                                            const totalDeduction = deductionLoan + deductionPension;

                                                            return sum + (grossIncome - totalDeduction);
                                                        }, 0)
                                                    )}
                                                </span>
                                            </td>
                                            <td />
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}

                        <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-t border-gray-100 flex items-center gap-4 flex-wrap text-[10px] text-gray-500 font-medium">
                            <span>💡 <span className="text-emerald-600 font-semibold">Tunjangan × % kehadiran</span> — otomatis disesuaikan</span>
                            <span>•</span>
                            <span>💡 <span className="text-red-600 font-semibold">Potongan langsung</span> — tidak dihitung %</span>
                            <span>•</span>
                            <span>💡 <span className="text-blue-600 font-semibold">Gross = Total Penghasilan</span> sebelum potongan</span>
                        </div>
                    </div>
                )}

                {/* ════ TAB CUTI ════ */}
                {activeTab === "leave" && isAdminRole(currentUser?.role)
                    && (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                            <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white flex items-center justify-between flex-wrap gap-3">
                                <div>
                                    <p className="text-base font-bold text-gray-800">Saldo & Pengajuan Cuti — {MONTH_NAMES[calMonth]} {calYear}</p>
                                    <p className="text-[10px] text-gray-400 mt-1">1 hari cuti per bulan · Sisa carry-over ke bulan berikutnya</p>
                                </div>
                                <button onClick={() => { if (allUsers.length === 0) fetchAllUsers(); fetchLeaveData(calYear, calMonth); setShowLeaveModal(true); }} className="flex items-center gap-1.5 text-xs font-bold text-cyan-600 bg-cyan-50 border border-cyan-200 px-4 py-2 rounded-xl hover:bg-cyan-100 transition-all">➕ Kelola Cuti</button>
                            </div>
                            {loading ? (
                                <div className="p-6 space-y-3">{Array(5).fill(0).map((_, i) => <div key={i} className="h-16 bg-gray-50 rounded-2xl animate-pulse" />)}</div>
                            ) : leaveData.length === 0 ? (
                                <div className="py-16 text-center"><div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4"><span className="text-3xl opacity-40">🌴</span></div><p className="text-sm text-gray-400 font-medium">Belum ada data cuti</p></div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-gray-100 bg-gray-50/60">
                                                <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Karyawan</th>
                                                <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Kuota Lembur</th>
                                                <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Carry-over</th>
                                                <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Terpakai</th>
                                                <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Tersedia</th>
                                                <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Tanggal Cuti</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {leaveData.map(ld => (
                                                <tr key={ld.user.id} className="hover:bg-gray-50/60 transition-colors duration-200">
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-white text-[10px] font-black flex-shrink-0 shadow-md">{initials(ld.user.name)}</div>
                                                            <div><span className="font-bold text-gray-800 block">{ld.user.name}</span><span className="text-[10px] text-gray-400">{ld.user.role.replace(/_/g, " ")}</span></div>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-4 text-center"><span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-teal-100 text-teal-700 text-sm font-black border border-teal-200">{ld.balance.quota}</span></td>
                                                    <td className="px-4 py-4 text-center">{ld.balance.carried_over > 0 ? <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-blue-100 text-blue-700 text-sm font-black border border-blue-200">+{ld.balance.carried_over}</span> : <span className="text-gray-200 text-sm font-black">—</span>}</td>
                                                    <td className="px-4 py-4 text-center">{ld.balance.used > 0 ? <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-orange-100 text-orange-700 text-sm font-black border border-orange-200">{ld.balance.used}</span> : <span className="text-gray-200 text-sm font-black">—</span>}</td>
                                                    <td className="px-4 py-4 text-center"><span className={`inline-flex items-center justify-center w-10 h-10 rounded-xl text-sm font-black border ${ld.available > 0 ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-red-100 text-red-600 border-red-200"}`}>{ld.available}</span></td>
                                                    <td className="px-4 py-4">
                                                        {ld.requests.length > 0 ? (
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {ld.requests.map(r => (
                                                                    <span key={r.id} className="inline-flex items-center gap-1 text-[10px] font-bold bg-cyan-100 text-cyan-700 border border-cyan-200 px-2 py-1 rounded-lg">
                                                                        🌴 {new Date(r.leave_date + "T12:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        ) : <span className="text-[10px] text-gray-300 font-bold">Tidak ada cuti bulan ini</span>}
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

            {/* ════ TAB RIWAYAT GAJI (admin only) ════ */}
            {activeTab === "salary-history" && isAdminRole(currentUser?.role) && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
                        <div className="flex items-center justify-between flex-wrap gap-3">
                            <div>
                                <p className="text-base font-bold text-gray-800">📋 Riwayat Perubahan Gaji</p>
                                <p className="text-[10px] text-gray-400 mt-1">Tracking semua perubahan gaji per karyawan</p>
                            </div>
                            <button
                                onClick={fetchSalaryHistory}
                                className="flex items-center gap-1.5 text-xs font-bold text-gray-500 bg-white border border-gray-200 px-4 py-2 rounded-xl hover:bg-gray-50 transition"
                            >
                                🔄 Refresh
                            </button>
                        </div>
                    </div>

                    {historyLoading ? (
                        <div className="p-6 space-y-3">
                            {Array(4).fill(0).map((_, i) => (
                                <div key={i} className="h-16 bg-gray-50 rounded-2xl animate-pulse" />
                            ))}
                        </div>
                    ) : salaryHistory.length === 0 ? (
                        <div className="py-16 text-center px-4">
                            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                                <span className="text-3xl opacity-40">📋</span>
                            </div>
                            <p className="text-sm text-gray-400 font-medium">Belum ada riwayat perubahan gaji</p>
                            <p className="text-xs text-gray-300 mt-1">Semua perubahan gaji akan tampil di sini</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-100 bg-gray-50/60">
                                        <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Karyawan</th>
                                        <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Gaji Lama</th>
                                        <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest w-8">→</th>
                                        <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Gaji Baru</th>
                                        <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Tipe</th>
                                        <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Diubah Oleh</th>
                                        <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Tanggal</th>
                                        <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Catatan</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {salaryHistory.map((hist: any) => {
                                        const oldSal = hist.old_base_salary || 0;
                                        const newSal = hist.new_base_salary || 0;
                                        const diff = newSal - oldSal;
                                        const diffText = diff > 0
                                            ? `+${formatRupiah(diff)}`
                                            : diff < 0
                                                ? `-${formatRupiah(Math.abs(diff))}`
                                                : "—";

                                        return (
                                            <tr key={hist.id} className="hover:bg-gray-50/60 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex items-center justify-center text-white text-[10px] font-black flex-shrink-0 shadow-md">
                                                            {initials(hist.user?.name || "?")}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-bold text-gray-800">{hist.user?.name || "Unknown"}</p>
                                                            <p className="text-[10px] text-gray-400">{hist.user?.role?.replace(/_/g, " ")}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="flex flex-col">
                                                        <span className="font-mono font-bold text-red-600 text-xs">
                                                            {hist.old_base_salary ? formatRupiah(hist.old_base_salary) : "—"}
                                                        </span>
                                                        <span className="text-[10px] text-gray-400">{hist.old_salary_type || "—"}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4 text-center text-gray-300 font-bold">→</td>
                                                <td className="px-4 py-4">
                                                    <div className="flex flex-col">
                                                        <span className="font-mono font-bold text-emerald-600 text-xs">
                                                            {formatRupiah(hist.new_base_salary)}
                                                        </span>
                                                        <span className="text-[10px] text-gray-400">{hist.new_salary_type}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <span className={`inline-flex items-center text-[10px] font-bold px-2.5 py-1 rounded-full border ${hist.new_salary_type === "FIXED"
                                                        ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                                        : "bg-amber-100 text-amber-700 border-amber-200"
                                                        }`}>
                                                        {hist.new_salary_type === "FIXED" ? "💰 Tetap" : "📊 % Absen"}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <p className="text-sm font-semibold text-gray-700">Admin</p>
                                                    <p className="text-[10px] text-gray-400 mt-0.5">{hist.changed_by?.slice(0, 8)}</p>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <p className="text-sm font-mono text-gray-700">
                                                        {new Date(hist.changed_at).toLocaleDateString("id-ID", {
                                                            day: "2-digit",
                                                            month: "2-digit",
                                                            year: "numeric",
                                                        })}
                                                    </p>
                                                    <p className="text-[10px] text-gray-400">
                                                        {new Date(hist.changed_at).toLocaleTimeString("id-ID", {
                                                            hour: "2-digit",
                                                            minute: "2-digit",
                                                        })}
                                                    </p>
                                                </td>
                                                <td className="px-4 py-4">
                                                    {hist.notes ? (
                                                        <p className="text-sm text-blue-600 font-medium max-w-[200px] truncate">
                                                            {hist.notes}
                                                        </p>
                                                    ) : (
                                                        <span className="text-gray-300 text-sm">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ════ TAB GAJI SAYA (non-admin) ════ */}
            {activeTab === "my-salary" && !isAdminRole(currentUser?.role) && (
                <div className="max-w-2xl mx-auto space-y-6 px-4 pb-8">
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center text-white text-2xl shadow-lg">
                                💰
                            </div>
                            <div>
                                <p className="text-sm text-gray-400 font-semibold uppercase tracking-wide">Gaji Bulan Ini</p>
                                <p className="text-3xl font-black text-gray-800 tracking-tight mt-1">
                                    {loading ? (
                                        <span className="inline-block w-48 h-8 bg-gray-200 rounded-lg animate-pulse" />
                                    ) : salaries.length > 0 && salaries[0] ? (
                                        (() => {
                                            const sal = salaries[0];
                                            const stat = userSummary.find(u => u.userId === currentUser?.id);
                                            if (!stat) return "—";
                                            // Gaji yang dibayarkan: FIXED = pokok penuh, PERCENTAGE = hitung per hari
                                            const earned = sal.salary_type === "FIXED"
                                                ? sal.base_salary
                                                : stat.totalWorkdays > 0
                                                    ? Math.round((sal.base_salary / stat.totalWorkdays) * stat.score)
                                                    : 0;
                                            return formatRupiah(earned);
                                        })()
                                    ) : (
                                        "Belum diatur"
                                    )}
                                </p>
                            </div>
                        </div>

                        {salaries.length > 0 && salaries[0] && (() => {
                            const sal = salaries[0];
                            const stat = userSummary.find(u => u.userId === currentUser?.id);
                            if (!stat) return null;

                            const earnedByPct = stat.totalWorkdays > 0
                                ? Math.round((sal.base_salary / stat.totalWorkdays) * stat.score)
                                : 0;

                            return (
                                <div className="space-y-4">
                                    {/* Gaji Pokok */}
                                    <div className="bg-gradient-to-br from-slate-50 to-gray-50 border border-gray-200 rounded-2xl p-4">
                                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Gaji Pokok</p>
                                        <p className="text-2xl font-black text-gray-800">{formatRupiah(sal.base_salary)}</p>
                                        <p className="text-[11px] text-gray-400 mt-1">
                                            Tipe: <span className={`font-bold ${sal.salary_type === "FIXED" ? "text-emerald-600" : "text-amber-600"}`}>
                                                {sal.salary_type === "FIXED" ? "💰 Gaji Tetap" : "📊 Persentase Absen"}
                                            </span>
                                        </p>
                                    </div>

                                    {/* Kehadiran */}
                                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-4">
                                        <p className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-2">📊 Kehadiran Bulan Ini</p>
                                        <div className="flex items-baseline gap-2 mb-2">
                                            <p className="text-2xl font-black text-blue-700">{formatPct(stat.pct)}%</p>
                                            <span className="text-sm text-blue-600 font-semibold">
                                                Skor {stat.score.toFixed(1)} dari {stat.totalWorkdays} hari kerja
                                            </span>
                                        </div>
                                        {/* Progress bar kehadiran */}
                                        <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden mb-3">
                                            <div
                                                className={`h-full rounded-full transition-all duration-700 ${stat.pct >= 90 ? "bg-emerald-500" : stat.pct >= 70 ? "bg-amber-500" : "bg-red-500"}`}
                                                style={{ width: `${Math.min(stat.pct, 100)}%` }}
                                            />
                                        </div>
                                        <div className="flex gap-3 flex-wrap">
                                            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                                                ✅ {stat.present} tepat
                                            </span>
                                            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                                                ⏰ {stat.late} terlambat
                                            </span>
                                            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                                                ❌ {stat.absences.length} tidak hadir
                                            </span>
                                        </div>
                                    </div>

                                    {/* ✅ FIX: Perhitungan — SELALU tampil untuk semua tipe gaji */}
                                    <div className={`bg-gradient-to-br rounded-2xl p-4 border ${sal.salary_type === "PERCENTAGE" ? "from-amber-50 to-orange-50 border-amber-200" : "from-gray-50 to-slate-50 border-gray-200"}`}>
                                        <p className={`text-xs font-bold uppercase tracking-wide mb-3 ${sal.salary_type === "PERCENTAGE" ? "text-amber-700" : "text-gray-500"}`}>
                                            {sal.salary_type === "PERCENTAGE" ? "📐 Cara Hitung" : "📐 Estimasi Jika Berdasarkan % Kehadiran"}
                                        </p>
                                        <div className="space-y-2 text-sm">
                                            {stat.totalWorkdays > 0 && (
                                                <div className="flex items-center justify-between text-gray-600">
                                                    <span>Gaji per hari kerja</span>
                                                    <span className="font-mono font-bold text-gray-800">
                                                        {formatRupiah(Math.round(sal.base_salary / stat.totalWorkdays))}
                                                    </span>
                                                </div>
                                            )}
                                            <div className="flex items-center justify-between text-gray-600">
                                                <span>Skor kehadiran</span>
                                                <span className="font-bold">{stat.score.toFixed(1)} poin</span>
                                            </div>
                                            <div className="h-px bg-gray-200 my-1" />
                                            <div className="flex items-center justify-between">
                                                <span className="font-bold text-gray-700">
                                                    {sal.salary_type === "FIXED" ? "Jika berdasarkan %" : "Gaji diterima"}
                                                </span>
                                                <span className={`font-black text-base font-mono ${sal.salary_type === "PERCENTAGE" ? "text-amber-700" : "text-gray-600"}`}>
                                                    {formatRupiah(earnedByPct)}
                                                </span>
                                            </div>
                                            {sal.salary_type === "FIXED" && (
                                                <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mt-2">
                                                    <p className="text-[11px] text-emerald-700 font-semibold">
                                                        💡 Kamu pakai <strong>Gaji Tetap</strong> — diterima penuh {formatRupiah(sal.base_salary)} terlepas dari kehadiran.
                                                    </p>
                                                    {earnedByPct < sal.base_salary && (
                                                        <p className="text-[10px] text-emerald-600 mt-1">
                                                            Selisih vs % absen: +{formatRupiah(sal.base_salary - earnedByPct)}
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Catatan */}
                                    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-xs text-blue-700">
                                        <p className="font-semibold mb-1">📌 Catatan:</p>
                                        <ul className="space-y-1 text-blue-600">
                                            <li>• Gaji diproses setiap akhir bulan</li>
                                            <li>• Perhitungan berdasarkan kehadiran bulan ini</li>
                                            <li>• Hubungi admin jika ada pertanyaan</li>
                                        </ul>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>

                    {salaries.length === 0 && (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
                            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                                <span className="text-3xl opacity-50">💰</span>
                            </div>
                            <p className="text-sm text-gray-400 font-medium">Gaji belum diatur oleh admin</p>
                            <p className="text-xs text-gray-300 mt-1">Hubungi admin untuk setup gaji kamu</p>
                        </div>
                    )}
                </div>
            )}


            {/* ════ TAB SLIP GAJI (admin only) ════ */}
            {activeTab === "salary-slip" && isAdminRole(currentUser?.role) && (
                <div className="space-y-4">
                    {/* Month Selector */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div>
                                <p className="text-sm font-bold text-gray-800">Slip Gaji</p>
                                <p className="text-[11px] text-gray-400 mt-0.5">
                                    ✅ Data dari rekapan gaji (tab Rekap Gaji) · Gunakan tombol <strong>📄 Slip</strong> untuk generate
                                </p>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    onClick={() => setSelectedSlipMonth(s => ({
                                        month: s.month === 0 ? 11 : s.month - 1,
                                        year: s.month === 0 ? s.year - 1 : s.year,
                                    }))}
                                    className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 transition text-sm"
                                >◀</button>
                                <div className="px-5 py-2 bg-gradient-to-r from-[#1a1a2e] to-[#16213e] text-white rounded-xl font-bold text-xs min-w-[130px] text-center">
                                    {MONTH_NAMES[selectedSlipMonth.month]} {selectedSlipMonth.year}
                                </div>
                                <button
                                    onClick={() => setSelectedSlipMonth(s => ({
                                        month: s.month === 11 ? 0 : s.month + 1,
                                        year: s.month === 11 ? s.year + 1 : s.year,
                                    }))}
                                    className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 transition text-sm"
                                >▶</button>
                            </div>
                        </div>
                    </div>

                    {/* Slip List */}
                    {loading ? (
                        // ✅ Skeleton loading
                        <div className="space-y-2">
                            {Array(4).fill(0).map((_, i) => (
                                <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-xl bg-gray-200" />
                                            <div className="space-y-1.5">
                                                <div className="h-3 w-32 bg-gray-200 rounded" />
                                                <div className="h-2.5 w-20 bg-gray-100 rounded" />
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <div className="h-7 w-16 bg-gray-100 rounded-lg" />
                                            <div className="h-7 w-16 bg-gray-100 rounded-lg" />
                                            <div className="h-7 w-20 bg-gray-100 rounded-lg" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-4 gap-2">
                                        {Array(4).fill(0).map((_, j) => (
                                            <div key={j} className="h-12 bg-gray-50 rounded-xl" />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : sortedSalarySlips.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
                            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                                <span className="text-2xl opacity-50">📄</span>
                            </div>
                            <p className="text-sm text-gray-400 font-medium">Belum ada slip gaji bulan ini</p>
                            <p className="text-xs text-gray-300 mt-1 mb-4">Klik tombol di bawah untuk generate slip semua karyawan</p>
                            <button
                                onClick={async () => {
                                    const usersToGen = allUsers.length > 0 ? allUsers : await fetchAllUsers();
                                    for (const u of usersToGen) {
                                        await fetch("/api/attendance/salary-slip", {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ user_id: u.id, year: selectedSlipMonth.year, month: selectedSlipMonth.month + 1 }),
                                        });
                                    }
                                    fetchSalarySlips(selectedSlipMonth.year, selectedSlipMonth.month);
                                }}
                                className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 px-4 py-2 rounded-xl hover:bg-blue-100 transition"
                            >⚡ Generate Slip Sekarang</button>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {sortedSalarySlips.map(slip => (
                                <SalarySlipCard
                                    key={slip.id}
                                    slip={slip}
                                    onFinalize={() => fetchSalarySlips(selectedSlipMonth.year, selectedSlipMonth.month)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── Modals ── */}
            {showDayOffModal && isAdminRole(currentUser?.role)
                && (
                    <DayOffModal users={allUsers} dayOffs={dayOffs} onClose={() => setShowDayOffModal(false)} onSaved={() => { fetchDayOffs(); setShowDayOffModal(false); }} />
                )}
            {showManualModal && isAdminRole(currentUser?.role)
                && (
                    <ManualAttendanceModal
                        users={allUsers}
                        prefillDate={manualPrefillDate}
                        prefillUserId={manualPrefillUser}
                        editData={editManualData}
                        onClose={() => { setShowManualModal(false); setEditManualData(null); }}
                        onSaved={() => {
                            refreshAll();
                            fetchTodayStatus();
                        }}
                    />
                )}
            {showSalaryModal && isAdminRole(currentUser?.role)
                && (
                    <SalaryModal users={allUsers} salaries={salaries} onClose={() => setShowSalaryModal(false)} onSaved={() => { fetchSalaries(); setShowSalaryModal(false); }} />
                )}
            {showLeaveModal && isAdminRole(currentUser?.role)
                && (
                    <LeaveModal users={allUsers} leaveData={leaveData} calYear={calYear} calMonth={calMonth} onClose={() => setShowLeaveModal(false)} onSaved={() => { fetchLeaveData(calYear, calMonth); }} />
                )}
            {showShiftModal && isAdminRole(currentUser?.role)
                && (
                    <ShiftConfigModal
                        users={allUsers}
                        initialUserId={shiftModalUserId}
                        onClose={() => {
                            setShowShiftModal(false);
                            setShiftModalUserId(undefined);
                        }}
                    />
                )}
            {editSalaryUser && isAdminRole(currentUser?.role)
                && (
                    <InlineSalaryEditModal
                        userId={editSalaryUser.userId}
                        userName={editSalaryUser.userName}
                        currentSalary={editSalaryUser.currentSalary}
                        onClose={() => setEditSalaryUser(null)}
                        onSaved={() => { fetchSalaries(); setEditSalaryUser(null); }}
                    />
                )}

            {absenceDetail && (
                <AbsenceDetailModal
                    name={absenceDetail.name}
                    absences={absenceDetail.absences}
                    offDates={absenceDetail.offDates}
                    monthLabel={`${MONTH_NAMES[calMonth]} ${calYear}`}
                    onClose={() => setAbsenceDetail(null)}
                />
            )}
            {editAllowanceUser && isAdminRole(currentUser?.role) && (
                <EditAllowanceModal
                    userId={editAllowanceUser.userId}
                    userName={editAllowanceUser.userName}
                    currentAllowance={editAllowanceUser.currentAllowance}
                    onClose={() => setEditAllowanceUser(null)}
                    onSaved={() => {
                        fetchAllowances();
                        setEditAllowanceUser(null);
                    }}
                />
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

