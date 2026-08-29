"use client";

import { getOvertimeColor, formatOvertimeMinutes, OVERTIME_CATEGORIES, OVERTIME_CATEGORY_LABELS, type OvertimeCategory, computeBeforeInOvertimeMinutes, computeAfterOutOvertimeMinutes, computeHolidayOvertimeMinutes } from "@/lib/overtimeEngine";
import React from "react";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { getCurrentUserClient } from "@/lib/auth-client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { ShiftConfigModal } from "@/components/attendance/ShiftConfigModal";
import { ManualCheckoutModal } from "@/components/attendance/ManualCheckoutModal"; // ✅ NEW poin 8
import { OvertimeSOPBanner } from "@/components/attendance/OvertimeSOPBanner";
import { MonthlyOffModal } from "@/components/attendance/onthlyOffModal";
import { canManageAttendance, DIVISION_MAP, isFullAccessMulti, getEffectiveSubordinates } from "@/lib/permissions";
import { useRouter, useSearchParams } from "next/navigation";
import { pickSchedule, SHIFT_DEFAULTS, type ShiftScheduleRow } from "@/lib/shiftSchedule";
import { Check, Clock, Frown, FileText, X, Umbrella, Shield, ShieldAlert, Sun, Moon, Plus, Pencil, Trash2, ArrowRightLeft, ChevronRight, CheckCircle2, Inbox, CalendarDays, GraduationCap, Briefcase, Trophy } from "lucide-react";
import { ShiftScheduleTab } from "./ShiftScheduleTab";
import ExcelJS from "exceljs";
import { ContractBadge } from "@/components/contracts/ContractBadge";
import { CareerLevelBadge } from "@/components/contracts/CareerLevelBadge";
import SendContractModal from "@/components/contracts/SendContractModal";
import ContractDetailModal from "@/components/contracts/ContractDetailModal";

function isPKLRole(role?: string): boolean {
    if (!role) return false;
    return role === "PKL" || role.startsWith("PKL_") || role.startsWith("PKL-");
}

function renderStatusEmoji(emojiName: string, className = "w-3.5 h-3.5") {
    if (emojiName === "check") return <Check className={className} />;
    if (emojiName === "clock") return <Clock className={className} />;
    if (emojiName === "frown") return <Frown className={className} />;
    if (emojiName === "file-text") return <FileText className={className} />;
    if (emojiName === "x") return <X className={className} />;
    if (emojiName === "umbrella") return <Umbrella className={className} />;
    if (emojiName === "slash") return <X className={`${className} opacity-50`} />;
    if (emojiName === "alert") return <ShieldAlert className={className} />;
    if (emojiName === "sun") return <Sun className={className} />;
    if (emojiName === "inbox") return <Inbox className={className} />;
    return null;
}

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
    direction?: "IN" | "OUT"; // ✅ NEW
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
type DateOff = { id: string; user_id: string; off_date: string; note?: string | null; users?: { id: string; name: string; role: string } };
type DateWork = {
    id: string;
    user_id: string;
    work_date: string;
    note?: string | null;
    users?: { id: string; name: string; role: string }
};

type SwapDayOff = {
    id?: string;
    user_id: string;
    user_name?: string;
    off_date: string;
    work_date: string;
    note?: string | null;
};
type UserInfo = { id: string; name: string; role: string; created_at?: string | null; shift?: "PAGI" | "SORE" | null; contract_status?: string | null; contract_valid_until?: string | null; career_level?: string | null };
type AbsenceReason = "ALPHA" | "ABSENT" | "SICK" | "PERMIT" | "LEAVE" | "NO_CHECKOUT";
type AbsenceItem = { date: string; reason: AbsenceReason; note: string | null };
type AttendanceDetailItem = {
    date: string;
    type: "PRESENT" | "LATE";
    checkInTime: string;
    method: string;
    notes?: string | null;
    manualCreatedBy?: string | null;
};

type AttendanceSummaryDetail = {
    name: string;
    type: "present" | "late";
    items: AttendanceDetailItem[];
    monthLabel: string;
};

type MonthlyOff = {
    id: string;
    user_id: string;
    off_date: string;
    year: number;
    month: number;
    notes: string | null;
    set_by: string | null;
    users?: { id: string; name: string; role: string };
};

const PKL_DAILY_RATE = 10000;
const PKL_LATE_RATE = 5000;

const CHECKOUT_REQUIRED_FROM = "2026-08-13";

// ─── Constants ─────────────────────────────────────────────────────────────
const OFFICE_LAT = -6.402593;
const OFFICE_LNG = 106.787233;
const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const FULL_ACCESS_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"] as const;
const FULL_ALLOWANCE_USER_IDS: string[] = [
    "236c08b5-0dd2-4f2f-95d6-286c5b6dd75e",
];
function isAdminRole(role?: string): boolean {
    return !!role && (FULL_ACCESS_ROLES as readonly string[]).includes(role);
}

const SALARY_ACCESS_ROLES = ["ADMIN", "ASISTEN_CEO", "PROGRAMMER"] as const;
function canViewSalary(role?: string): boolean {
    return !!role && (SALARY_ACCESS_ROLES as readonly string[]).includes(role);
}

// Multi-role aware: baca dari currentUser.role ATAU currentUser.roles[]
function getUserRoles(user: any): string[] {
    if (!user) return [];
    if (Array.isArray(user.roles) && user.roles.length > 0) return user.roles as string[];
    return user.role ? [user.role] : [];
}
function userIsAdmin(user: any): boolean {
    return getUserRoles(user).some(r => isAdminRole(r));
}
function userCanViewSalary(user: any): boolean {
    return getUserRoles(user).some(r => canViewSalary(r));
}
function userIsPKL(user: any): boolean {
    return getUserRoles(user).some(r => isPKLRole(r));
}
const DAY_FULL = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];


const MANUAL_STATUS_LABELS: Record<string, { label: string; color: string; bg: string; border: string; emoji: string }> = {
    PRESENT: { label: "Hadir", color: "text-emerald-700", bg: "bg-emerald-100", border: "border-emerald-200", emoji: "check" },
    LATE: { label: "Terlambat", color: "text-amber-700", bg: "bg-amber-100", border: "border-amber-200", emoji: "clock" },
    SICK: { label: "Sakit", color: "text-blue-700", bg: "bg-blue-100", border: "border-blue-200", emoji: "frown" },
    PERMIT: { label: "Izin", color: "text-violet-700", bg: "bg-violet-100", border: "border-violet-200", emoji: "file-text" },
    ABSENT: { label: "Tidak Hadir", color: "text-red-700", bg: "bg-red-100", border: "border-red-200", emoji: "x" },
    LEAVE: { label: "Cuti", color: "text-cyan-700", bg: "bg-cyan-100", border: "border-cyan-200", emoji: "umbrella" },
};

const ABSENCE_REASON_LABELS: Record<AbsenceReason, { label: string; emoji: string; bg: string; color: string; border: string }> = {
    ALPHA: { label: "Tanpa Keterangan", emoji: "slash", bg: "bg-red-50", color: "text-red-600", border: "border-red-200" },
    ABSENT: { label: "Tidak Hadir", emoji: "x", bg: "bg-red-50", color: "text-red-600", border: "border-red-200" },
    SICK: { label: "Sakit", emoji: "frown", bg: "bg-blue-50", color: "text-blue-700", border: "border-blue-200" },
    PERMIT: { label: "Izin", emoji: "file-text", bg: "bg-violet-50", color: "text-violet-700", border: "border-violet-200" },
    LEAVE: { label: "Cuti", emoji: "umbrella", bg: "bg-cyan-50", color: "text-cyan-700", border: "border-cyan-200" },
    NO_CHECKOUT: { label: "Tidak Absen Pulang", emoji: "clock", bg: "bg-orange-50", color: "text-orange-600", border: "border-orange-200" },
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
    // ✅ FIX: pergantian hari absensi jam 04:00 WIB (bukan 00:00) — jam
    // 00:00–03:59 WIB masih dihitung hari sebelumnya. Offset WIB (+7 jam)
    // dikurangi 4 jam cutoff = +3 jam.
    return new Date(new Date(iso).getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function getWIBToday(): string {
    // ✅ FIX: konsisten dengan toWIBDateKey — "hari ini" ikut cutoff jam 04:00 WIB.
    return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
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

function countWorkingDaysFrom(
    year: number,
    month: number,
    dayOffDows: Set<number>,
    offDates: Set<string>,
    startDate: string,
    leaveDates?: Set<string>  // Tambah parameter opsional
): number {
    const dim = new Date(year, month + 1, 0).getDate();
    let c = 0;
    for (let d = 1; d <= dim; d++) {
        const dk = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        if (dk < startDate) continue;
        const dow = new Date(dk + "T12:00:00").getDay();
        if (!dayOffDows.has(dow) && !offDates.has(dk) && !leaveDates?.has(dk)) c++;
    }
    return c;
}

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
function minToHHMM(min: number): string {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${pad2(h)}:${pad2(m)}`;
}

const OVERTIME_RESOLVED_STORAGE_PREFIX = "solitpos:overtime-resolved:";

function loadResolvedOvertimeDates(userId: string): Set<string> {
    if (typeof window === "undefined") return new Set();
    try {
        const raw = window.localStorage.getItem(OVERTIME_RESOLVED_STORAGE_PREFIX + userId);
        const arr = raw ? JSON.parse(raw) : [];
        return new Set(Array.isArray(arr) ? arr : []);
    } catch {
        return new Set();
    }
}

function saveResolvedOvertimeDates(userId: string, dates: Set<string>) {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(OVERTIME_RESOLVED_STORAGE_PREFIX + userId, JSON.stringify(Array.from(dates)));
    } catch { }
}

function getUserStartDate(
    userCreatedAt: string | null | undefined,
    calYear: number,
    calMonth: number
): string {
    const firstOfMonth = `${calYear}-${pad2(calMonth + 1)}-01`;
    const lastOfMonth = `${calYear}-${pad2(calMonth + 1)}-${pad2(new Date(calYear, calMonth + 1, 0).getDate())}`;

    if (!userCreatedAt) return firstOfMonth;

    const createdWIB = new Date(
        new Date(userCreatedAt).getTime() + 7 * 60 * 60 * 1000
    ).toISOString().slice(0, 10);

    if (createdWIB > lastOfMonth) return createdWIB;

    return firstOfMonth;
}

function computeMonthlySalary(
    salary: UserSalary | undefined,
    allowance: UserAllowances | undefined,
    overtimeAmount: number,
    stat: { totalWorkdays: number; score: number; pct: number; userId: string } | undefined
) {
    const isPercentage = salary?.salary_type === "PERCENTAGE";

    // Gaji pokok: FIXED = penuh · PERCENTAGE = (pokok / hari kerja) × skor kehadiran
    const salaryIncome = salary
        ? isPercentage
            ? stat && stat.totalWorkdays > 0
                ? Math.round((salary.base_salary / stat.totalWorkdays) * stat.score)
                : 0
            : salary.base_salary
        : 0;

    const allowanceFactor = stat?.userId && FULL_ALLOWANCE_USER_IDS.includes(stat.userId)
        ? 1
        : (stat?.pct ?? 0) / 100;
    const allowanceWife = Math.round((allowance?.allowance_wife || 0) * allowanceFactor);
    const allowanceChild = Math.round((allowance?.allowance_child || 0) * allowanceFactor);

    // Potongan: selalu langsung (tidak disesuaikan %)
    const deductionLoan = allowance?.deduction_loan || 0;
    const deductionPension = allowance?.deduction_pension || 0;

    const grossIncome = salaryIncome + allowanceWife + allowanceChild + overtimeAmount;
    const totalDeduction = deductionLoan + deductionPension;
    const netSalary = grossIncome - totalDeduction;

    return {
        salaryIncome, allowanceWife, allowanceChild, overtime: overtimeAmount,
        grossIncome, deductionLoan, deductionPension, totalDeduction, netSalary,
    };
}

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


function ManualAttendanceModal({ users, prefillDate, prefillUserId, editData, onClose, onSaved, pklMode }: {
    users: UserInfo[];
    prefillDate: string | null;
    prefillUserId?: string;
    editData?: ManualAttendance | null;
    onClose: () => void;
    onSaved: () => void;
    pklMode?: boolean;
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
            console.error(" parseTimeFromISO error:", e);
            return "08:00";
        }
    };

    // FIX 1: filteredUsers HARUS di atas early return (Rules of Hooks)
    const filteredUsers = useMemo(() => {
        if (pklMode === undefined) return users;
        return users.filter(u =>
            pklMode ? isPKLRole(u.role) : !isPKLRole(u.role)
        );
    }, [users, pklMode]);

    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState("");
    // ✅ NEW — opsi "Sudah Absen Pulang?" saat absen manual
    const [hasCheckedOut, setHasCheckedOut] = useState(false);
    const [checkoutTime, setCheckoutTime] = useState("17:00");
    const [checkoutCategory, setCheckoutCategory] = useState<OvertimeCategory | "">("");
    const [checkoutDesc, setCheckoutDesc] = useState("");
    const [pendingOvertime, setPendingOvertime] = useState<{ id: string; minutes: number } | null>(null);
    const [savingDetail, setSavingDetail] = useState(false);

    const [form, setForm] = useState({
        // FIX 3: gunakan filteredUsers[0]?.id, bukan users[0]?.id
        user_id: editData?.user_id ?? prefillUserId ?? filteredUsers[0]?.id ?? "",
        attendance_date: editData?.attendance_date ?? prefillDate ?? getWIBToday(),
        check_in_time: parseTimeFromISO(editData?.check_in_time),
        status: (editData?.status ?? "PRESENT") as "PRESENT" | "LATE" | "SICK" | "PERMIT" | "ABSENT" | "LEAVE",
        notes: editData?.notes ?? "",
    });

    useEffect(() => {
        console.log("[ManualAttendanceModal] filteredUsers:", filteredUsers.length, filteredUsers.map(u => u.name));
        console.log("[ManualAttendanceModal] prefillUserId:", prefillUserId);
        console.log("[ManualAttendanceModal] editData:", editData?.user_id);

        setForm({
            // FIX 3: gunakan filteredUsers[0]?.id
            user_id: editData?.user_id ?? prefillUserId ?? filteredUsers[0]?.id ?? "",
            attendance_date: editData?.attendance_date ?? prefillDate ?? getWIBToday(),
            check_in_time: parseTimeFromISO(editData?.check_in_time),
            status: (editData?.status ?? "PRESENT") as "PRESENT" | "LATE" | "SICK" | "PERMIT" | "ABSENT" | "LEAVE",
            notes: editData?.notes ?? "",
        });
    }, [editData, prefillDate, prefillUserId, filteredUsers]);

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

            if (form.status === "LEAVE") {
                await fetch("/api/attendance/leave", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action: "manual_leave",
                        user_id: form.user_id,
                        leave_date: form.attendance_date,
                        reason: form.notes || "Cuti (input manual admin)",
                    }),
                });
            }

            // ✅ NEW — kalau admin sekalian tandai "Sudah Absen Pulang", langsung
            // catat absen pulangnya juga lewat endpoint yang sama dengan "Absen
            // Pulang Manual", supaya lembur ikut kedeteksi otomatis kalau ada.
            if ((form.status === "PRESENT" || form.status === "LATE") && hasCheckedOut && checkoutTime) {
                const coRes = await fetch("/api/attendance/manual-checkout", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        user_id: form.user_id,
                        checkout_date: form.attendance_date,
                        checkout_time: checkoutTime,
                        category: checkoutCategory || null,
                        work_description: checkoutDesc.trim() || null,
                    }),
                });
                const coData = await coRes.json();
                if (!coData.success) {
                    setError(coData.message || "Absen masuk tersimpan, tapi gagal menyimpan absen pulang.");
                    onSaved();
                    return;
                }
                if (coData.overtimeCreated?.id && !checkoutCategory) {
                    onSaved();
                    setPendingOvertime({ id: coData.overtimeCreated.id, minutes: coData.overtimeCreated.minutes });
                    return;
                }
            }

            onSaved(); onClose();
        } catch { setError("Gagal menyimpan"); }
        finally { setSaving(false); }
    };

    // ✅ NEW — admin isi kategori + keterangan lembur yang kedeteksi dari absen
    // pulang manual di atas (kalau tadi dikosongkan)
    const saveOvertimeDetail = async () => {
        if (!pendingOvertime) return;
        if (!checkoutCategory) { setError("Kategori wajib dipilih."); return; }
        if (!checkoutDesc.trim()) { setError("Keterangan wajib diisi."); return; }
        setSavingDetail(true); setError("");
        try {
            const res = await fetch("/api/attendance/overtime", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: pendingOvertime.id,
                    action: "SUBMIT_DETAIL",
                    category: checkoutCategory,
                    work_description: checkoutDesc.trim(),
                }),
            });
            const d = await res.json();
            if (!d.success) { setError(d.message || "Gagal menyimpan detail lembur."); return; }
            onClose();
        } catch (err: any) {
            setError(err?.message || "Terjadi kesalahan jaringan — coba lagi.");
        } finally { setSavingDetail(false); }
    };

    const deleteRecord = async () => {
        if (!editData) return;
        if (!confirm("Hapus data absen manual ini?")) return;
        setDeleting(true);
        try {
            await fetch(`/api/attendance/manual?user_id=${editData.user_id}&attendance_date=${editData.attendance_date}`, { method: "DELETE" });
            if (editData.status === "LEAVE") {
                await fetch("/api/attendance/leave", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        user_id: editData.user_id,
                        leave_date: editData.attendance_date,
                    }),
                });
            }
            onSaved(); onClose();
        } catch { }
        finally { setDeleting(false); }
    };

    const selectedUser = filteredUsers.find(u => u.id === form.user_id);

    // FIX 4: cek filteredUsers.length, bukan users.length
    if (!isEdit && filteredUsers.length === 0) {
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

    // ✅ NEW — step lanjutan: absen masuk & pulang sudah tersimpan, tinggal
    // lengkapi kategori + keterangan lembur (atau biarkan diisi karyawan sendiri)
    if (pendingOvertime) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
                <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-3.5">
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3">
                        <p className="font-bold text-sm text-amber-800">Lemburan Terdeteksi — {pendingOvertime.minutes} menit</p>
                        <p className="text-[11px] text-amber-700 mt-1">
                            Absen masuk & pulang sudah tersimpan. Jam pulang ini menghasilkan lemburan otomatis — isi kategori & keterangan sekarang, atau biarkan karyawan yang melengkapinya sendiri di halaman Lembur.
                        </p>
                    </div>
                    {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3.5 py-3 rounded-xl">{error}</div>}
                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Kategori Lembur *</label>
                        <select value={checkoutCategory} onChange={(e) => setCheckoutCategory(e.target.value as OvertimeCategory)} className="w-full h-10 border border-gray-200 rounded-xl px-3 text-xs bg-white">
                            <option value="">— Pilih kategori —</option>
                            {OVERTIME_CATEGORIES.map((c) => <option key={c} value={c}>{OVERTIME_CATEGORY_LABELS[c]}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Keterangan Pekerjaan *</label>
                        <textarea value={checkoutDesc} onChange={(e) => setCheckoutDesc(e.target.value)} rows={2} placeholder="Pekerjaan yang dikerjakan saat lembur..." className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-xs resize-none" />
                    </div>
                    <div className="flex gap-2.5">
                        <button onClick={onClose} className="flex-1 h-10 bg-gray-100 rounded-xl text-xs font-semibold text-gray-600">Isi Nanti</button>
                        <button onClick={saveOvertimeDetail} disabled={savingDetail} className="flex-1 h-10 bg-[#1a1a2e] rounded-xl text-xs font-bold text-white disabled:opacity-50">
                            {savingDetail ? "Menyimpan..." : "Simpan Detail Lembur"}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <ModalShell onClose={onClose}
            headerColor={isEdit ? "bg-gradient-to-r from-blue-600 to-blue-700" : "bg-gradient-to-r from-[#1a1a2e] to-[#16213e]"}
            title={isEdit ? "Edit Absen Manual" : " Tambah Absen Manual"}
            subtitle={isEdit ? `${editData?.users?.name ?? "—"} · ${editData?.attendance_date}` : "Input data kehadiran yang belum tercatat atau koreksi absen"}
            footer={
                <div className="flex gap-3">
                    {isEdit && (
                        <button onClick={deleteRecord} disabled={deleting}
                            className="h-11 px-5 bg-red-50 text-red-600 border border-red-200 rounded-xl text-sm font-semibold hover:bg-red-100 transition-all duration-200 disabled:opacity-50 flex items-center gap-2">
                            {deleting ? <div className="w-4 h-4 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" /> : "Hapus"}
                        </button>
                    )}
                    <button onClick={onClose} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-all duration-200">Batal</button>
                    <button onClick={save} disabled={saving}
                        className={`flex-1 h-11 ${isEdit ? "bg-gradient-to-r from-blue-600 to-blue-700" : "bg-gradient-to-r from-[#1a1a2e] to-[#16213e]"} text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2`}>
                        {saving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</> : " Simpan"}
                    </button>
                </div>
            }>
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
                {error && <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-3 rounded-xl flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-amber-500 inline mr-1" />{error}</div>}

                {/* Karyawan */}
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                        Karyawan
                        <span className="ml-2 text-[10px] font-normal text-gray-400 normal-case">
                            ({filteredUsers.length} {pklMode === true ? "PKL" : pklMode === false ? "karyawan" : "user"} dimuat)
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
                            {!form.user_id && (
                                <option value="" disabled>— Pilih Karyawan —</option>
                            )}
                            {filteredUsers.map(u => (
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
                                    className={`flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl text-[11px] font-bold border transition-all duration-200 ${sel ? `${cfg.bg} ${cfg.color} ${cfg.border} shadow-md scale-[1.04]` : "bg-white text-gray-400 border-gray-200 hover:bg-gray-50 hover:scale-[1.02]"}`}>
                                    {renderStatusEmoji(cfg.emoji, "w-4 h-4")}
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

                {/* ✅ NEW — Absen Pulang (cuma relevan kalau statusnya Hadir/Terlambat) */}
                {(form.status === "PRESENT" || form.status === "LATE") && (
                    <div className="bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-100 rounded-2xl p-4 space-y-3">
                        <button type="button" onClick={() => setHasCheckedOut(v => !v)} className="w-full flex items-center gap-3 text-left">
                            <span className={`w-9 h-5 rounded-full flex-shrink-0 relative transition-colors ${hasCheckedOut ? "bg-violet-600" : "bg-gray-200"}`}>
                                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${hasCheckedOut ? "left-[18px]" : "left-0.5"}`} />
                            </span>
                            <div className="flex-1">
                                <p className="text-xs font-bold text-gray-700">Sudah Absen Pulang?</p>
                                <p className="text-[10px] text-gray-400 mt-0.5">
                                    {hasCheckedOut ? "Jam pulang akan ikut dicatat sekarang" : "Kalau belum, karyawan bisa absen pulang sendiri nanti pas jamnya"}
                                </p>
                            </div>
                        </button>

                        {hasCheckedOut && (
                            <div className="space-y-3 pt-1">
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Jam Pulang *</label>
                                    <input type="time" value={checkoutTime}
                                        onChange={e => setCheckoutTime(e.target.value)}
                                        className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400/20 transition-all font-mono" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                                        Kategori Lembur <span className="font-normal normal-case text-gray-400">(isi kalau jam pulang ini menghasilkan lembur)</span>
                                    </label>
                                    <select value={checkoutCategory} onChange={e => setCheckoutCategory(e.target.value as OvertimeCategory)}
                                        className="w-full h-10 border border-gray-200 rounded-xl px-3 text-xs bg-white focus:outline-none">
                                        <option value="">— Tidak diisi —</option>
                                        {OVERTIME_CATEGORIES.map(c => <option key={c} value={c}>{OVERTIME_CATEGORY_LABELS[c]}</option>)}
                                    </select>
                                </div>
                                <textarea value={checkoutDesc} onChange={e => setCheckoutDesc(e.target.value)}
                                    rows={2} placeholder="Keterangan lembur (opsional)..."
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-xs bg-white resize-none" />
                                <p className="text-[9px] text-gray-400">
                                    Kalau tidak diisi tapi jam pulang ini ternyata menghasilkan lembur, kamu akan diminta melengkapinya — atau bisa dilengkapi belakangan oleh karyawan sendiri di halaman Lembur.
                                </p>
                            </div>
                        )}
                    </div>
                )}

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
            title=" Kelola Gaji Karyawan" subtitle="Atur tipe dan nominal gaji per karyawan"
            footer={
                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-all">Batal</button>
                    <button onClick={save} disabled={saving} className="flex-1 h-11 bg-gradient-to-r from-emerald-600 to-green-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                        {saving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</> : " Simpan Semua"}
                    </button>
                </div>
            }>
            <div className="overflow-y-auto flex-1 px-6 py-4">
                {error && <div className="mb-3 bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-2.5 rounded-xl">{error}</div>}
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 text-xs text-amber-700">
                    <strong>ℹ</strong> Gaji <strong>Tetap</strong> = nominal penuh, tidak tergantung absensi.
                    Gaji <strong>Persentase Absen</strong> = % kehadiran × gaji pokok.
                </div>
                <div className="space-y-3">
                    {users.map(u => (
                        <div key={u.id} className="bg-gradient-to-br from-gray-50 to-white rounded-2xl p-4 border border-gray-100 hover:shadow-md transition-all duration-200">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex items-center justify-center text-white text-[11px] font-black shadow-md flex-shrink-0">{initials(u.name)}</div>
                                <div><p className="text-sm font-bold text-gray-800">{u.name}</p><p className="text-[10px] text-gray-400">{u.role.replace(/_/g, " ")}</p></div>
                                {local[u.id]?.salary_type === "FIXED" && (
                                    <span className="ml-auto text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-full"> Tetap</span>
                                )}
                                {local[u.id]?.salary_type === "PERCENTAGE" && (
                                    <span className="ml-auto text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-full">% Absen</span>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">Tipe Gaji</label>
                                    <select value={local[u.id]?.salary_type ?? "FIXED"} onChange={e => setLocal(p => ({ ...p, [u.id]: { ...p[u.id], salary_type: e.target.value as any } }))}
                                        className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none transition-all">
                                        <option value="FIXED"> Tetap</option>
                                        <option value="PERCENTAGE">Persentase Absen</option>
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

function EditAllowanceModal({
    userId,
    userName,
    currentAllowance,
    calYear,
    calMonth,
    onClose,
    onSaved,
}: {
    userId: string;
    userName: string;
    currentAllowance?: UserAllowances;
    calYear: number;
    calMonth: number;
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
                    year: calYear,
                    month: calMonth + 1,
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
                        <p className="font-bold text-white text-base">Tunjangan & Potongan</p>
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
                            {error}
                        </div>
                    )}

                    {/* TUNJANGAN SECTION */}
                    <div>
                        <p className="text-xs font-bold text-purple-600 uppercase tracking-wide mb-4">
                            Tunjangan (Disesuaikan % Kehadiran)
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
                            Potongan (Langsung Potong, Tidak Disesuaikan %)
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
                        <p className="text-xs font-bold text-purple-600 uppercase tracking-wide mb-3"> Ringkasan</p>
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
                            " Simpan"
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
    // ─── State ─────────────────────────────────────────────────────────────
    // Per-user expanded form untuk tambah cuti
    const [expandedUid, setExpandedUid] = useState<string | null>(null);
    const [addDate, setAddDate] = useState("");
    const [addReason, setAddReason] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    // Per-user set quota
    const [quotaUid, setQuotaUid] = useState<string | null>(null);
    const [manualQuota, setManualQuota] = useState<string>("");
    const [settingQuota, setSettingQuota] = useState(false);

    // Delete cuti
    const [deleting, setDeleting] = useState<string | null>(null);

    // ─── Helpers ───────────────────────────────────────────────────────────
    const dim = new Date(calYear, calMonth + 1, 0).getDate();
    const minDate = `${calYear}-${pad2(calMonth + 1)}-01`;
    const maxDate = `${calYear}-${pad2(calMonth + 1)}-${pad2(dim)}`;

    const getUserLeave = (userId: string) =>
        leaveData.find(d => d.user.id === userId);

    // ─── Actions ───────────────────────────────────────────────────────────
    const addLeave = async (uid: string) => {
        if (!addDate) { setError("Pilih tanggal cuti"); return; }
        setSaving(true); setError("");
        try {
            const res = await fetch("/api/attendance/leave", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: uid, leave_date: addDate, reason: addReason }),
            });
            const d = await res.json();
            if (!d.success) { setError(d.message || "Gagal"); return; }
            onSaved();
            setAddDate("");
            setAddReason("");
            setExpandedUid(null);
        } catch { setError("Gagal menambah cuti"); }
        finally { setSaving(false); }
    };

    const deleteLeave = async (id: string) => {
        setDeleting(id);
        try {
            await fetch(`/api/attendance/leave?id=${id}`, { method: "DELETE" });
            onSaved();
        } catch { }
        finally { setDeleting(null); }
    };

    const setQuotaManual = async (uid: string) => {
        if (manualQuota === "") return;
        setSettingQuota(true);
        try {
            const res = await fetch("/api/attendance/leave", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "set_quota",
                    user_id: uid,
                    year: calYear,
                    month: calMonth + 1,
                    quota: parseInt(manualQuota),
                }),
            });
            const d = await res.json();
            if (d.success) { onSaved(); setManualQuota(""); setQuotaUid(null); }
        } finally { setSettingQuota(false); }
    };

    // ─── Render ────────────────────────────────────────────────────────────
    return (
        <ModalShell
            onClose={onClose}
            headerColor="bg-gradient-to-r from-cyan-600 to-teal-700"
            title="Kelola Cuti Karyawan"
            subtitle={`${MONTH_NAMES[calMonth]} ${calYear} · ${users.length} karyawan`}
            wide
            footer={
                <button onClick={onClose} className="w-full h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-all">
                    Tutup
                </button>
            }
        >
            <div className="overflow-y-auto flex-1">
                {/* ── Info banner ── */}
                <div className="px-6 pt-4 pb-2">
                    <div className="bg-cyan-50 border border-cyan-200 rounded-xl px-4 py-2.5 text-[11px] text-cyan-700 flex items-center gap-2">
                        <span>ℹ</span>
                        <span>Admin bisa tambah/kurangi cuti meski saldo habis. Klik <strong></strong> untuk tambah, <strong></strong> untuk kurangi/hapus.</span>
                    </div>
                </div>

                {/* ── Table ── */}
                <div className="overflow-x-auto px-6 pb-4 pt-3">
                    <table className="w-full text-sm min-w-[600px]">
                        <thead>
                            <tr className="border-b-2 border-gray-100">
                                <th className="pb-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Karyawan</th>
                                <th className="pb-3 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest w-20">Kuota</th>
                                <th className="pb-3 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest w-20">Terpakai</th>
                                <th className="pb-3 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest w-20">Tersedia</th>
                                <th className="pb-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Tanggal Cuti</th>
                                <th className="pb-3 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest w-28">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {users.map(u => {
                                const ud = getUserLeave(u.id);
                                const isExpanded = expandedUid === u.id;
                                const isQuotaMode = quotaUid === u.id;
                                const available = ud?.available ?? 0;

                                return (
                                    <React.Fragment key={u.id}>
                                        {/* ── Main row ── */}
                                        <tr className={`transition-colors ${isExpanded ? "bg-cyan-50/40" : "hover:bg-gray-50/60"}`}>
                                            {/* Karyawan */}
                                            <td className="py-3 pr-3">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-white text-[10px] font-black flex-shrink-0">
                                                        {initials(u.name)}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-gray-800 text-sm leading-tight">{u.name}</p>
                                                        <p className="text-[10px] text-gray-400">{u.role.replace(/_/g, " ")}</p>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Kuota */}
                                            <td className="py-3 text-center">
                                                {isQuotaMode ? (
                                                    <div className="flex items-center gap-1 justify-center">
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            max={30}
                                                            value={manualQuota}
                                                            onChange={e => setManualQuota(e.target.value)}
                                                            placeholder="0"
                                                            autoFocus
                                                            className="w-14 h-8 border border-violet-300 rounded-lg px-2 text-xs text-center bg-white focus:outline-none focus:ring-2 focus:ring-violet-400/30"
                                                        />
                                                        <button
                                                            onClick={() => setQuotaManual(u.id)}
                                                            disabled={settingQuota || manualQuota === ""}
                                                            className="w-8 h-8 flex items-center justify-center bg-violet-600 text-white rounded-lg text-[10px] font-bold hover:bg-violet-700 disabled:opacity-50 transition-all"
                                                        >
                                                            {settingQuota ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : ""}
                                                        </button>
                                                        <button
                                                            onClick={() => { setQuotaUid(null); setManualQuota(""); }}
                                                            className="w-8 h-8 flex items-center justify-center bg-gray-100 text-gray-500 rounded-lg text-sm font-bold hover:bg-gray-200 transition-all"
                                                        >×</button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => { setQuotaUid(u.id); setExpandedUid(null); setManualQuota(String(ud?.balance.quota ?? 1)); }}
                                                        className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-violet-100 text-violet-700 text-sm font-black border border-violet-200 hover:bg-violet-200 hover:scale-105 transition-all"
                                                        title="Klik untuk set kuota"
                                                    >
                                                        {ud?.balance.quota ?? 1}
                                                    </button>
                                                )}
                                            </td>

                                            {/* Terpakai */}
                                            <td className="py-3 text-center">
                                                <span className={`inline-flex items-center justify-center w-9 h-9 rounded-xl text-sm font-black border ${(ud?.balance.used ?? 0) > 0 ? "bg-orange-100 text-orange-700 border-orange-200" : "bg-gray-50 text-gray-300 border-gray-100"}`}>
                                                    {ud?.balance.used ?? 0}
                                                </span>
                                            </td>

                                            {/* Tersedia */}
                                            <td className="py-3 text-center">
                                                <span className={`inline-flex items-center justify-center w-9 h-9 rounded-xl text-sm font-black border ${available > 0 ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-red-100 text-red-600 border-red-200"}`}>
                                                    {available}
                                                </span>
                                            </td>

                                            {/* Tanggal Cuti */}
                                            <td className="py-3 pr-3">
                                                {ud && ud.requests.length > 0 ? (
                                                    <div className="flex flex-wrap gap-1">
                                                        {ud.requests.map(r => (
                                                            <span key={r.id} className="group inline-flex items-center gap-1 text-[10px] font-bold bg-cyan-100 text-cyan-700 border border-cyan-200 px-2 py-1 rounded-lg">
                                                                {new Date(r.leave_date + "T12:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                                                                <button
                                                                    onClick={() => deleteLeave(r.id)}
                                                                    disabled={deleting === r.id}
                                                                    className="ml-0.5 w-3.5 h-3.5 flex items-center justify-center rounded text-cyan-500 hover:text-red-600 hover:bg-red-100 transition-all"
                                                                    title="Hapus cuti ini"
                                                                >
                                                                    {deleting === r.id ? <div className="w-2.5 h-2.5 border border-red-300 border-t-red-500 rounded-full animate-spin" /> : "×"}
                                                                </button>
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="text-[11px] text-gray-300 font-medium">—</span>
                                                )}
                                            </td>

                                            {/* Aksi */}
                                            <td className="py-3 text-center">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    {/* Tombol Tambah */}
                                                    <button
                                                        onClick={() => {
                                                            if (isExpanded) { setExpandedUid(null); setAddDate(""); setAddReason(""); setError(""); }
                                                            else { setExpandedUid(u.id); setQuotaUid(null); setError(""); }
                                                        }}
                                                        className={`w-8 h-8 flex items-center justify-center rounded-xl text-sm font-black border transition-all ${isExpanded ? "bg-cyan-600 text-white border-cyan-600" : "bg-cyan-100 text-cyan-700 border-cyan-200 hover:bg-cyan-200 hover:scale-105"}`}
                                                        title="Tambah cuti"
                                                    >
                                                        {isExpanded ? "−" : "＋"}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>

                                        {/* ── Expanded row: form tambah cuti ── */}
                                        {isExpanded && (
                                            <tr className="bg-cyan-50/60">
                                                <td colSpan={6} className="px-3 py-3">
                                                    <div className="flex items-end gap-3 flex-wrap">
                                                        <div>
                                                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">Tanggal Cuti</label>
                                                            <input
                                                                type="date"
                                                                value={addDate}
                                                                onChange={e => setAddDate(e.target.value)}
                                                                min={minDate}
                                                                max={maxDate}
                                                                autoFocus
                                                                className="h-9 border border-cyan-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-cyan-400/30 transition-all"
                                                            />
                                                        </div>
                                                        <div className="flex-1 min-w-[160px]">
                                                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">Alasan <span className="text-gray-300 font-normal normal-case">(opsional)</span></label>
                                                            <input
                                                                type="text"
                                                                value={addReason}
                                                                onChange={e => setAddReason(e.target.value)}
                                                                placeholder="e.g. Acara keluarga"
                                                                className="w-full h-9 border border-cyan-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-cyan-400/30 transition-all"
                                                            />
                                                        </div>
                                                        <div className="flex items-end gap-2">
                                                            <button
                                                                onClick={() => addLeave(u.id)}
                                                                disabled={saving || !addDate}
                                                                className="h-9 px-4 bg-gradient-to-r from-cyan-600 to-teal-700 text-white rounded-xl text-xs font-bold disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
                                                            >
                                                                {saving ? <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</> : "Simpan Cuti"}
                                                            </button>
                                                            <button
                                                                onClick={() => { setExpandedUid(null); setAddDate(""); setAddReason(""); setError(""); }}
                                                                className="h-9 px-3 bg-gray-100 text-gray-600 rounded-xl text-xs font-semibold hover:bg-gray-200 transition-all"
                                                            >
                                                                Batal
                                                            </button>
                                                        </div>
                                                        {error && (
                                                            <p className="w-full text-[11px] text-red-500 flex items-center gap-1"> {error}</p>
                                                        )}
                                                        {available <= 0 && (
                                                            <p className="w-full text-[11px] text-amber-500 flex items-center gap-1">
                                                                Saldo habis — admin tetap bisa tambah cuti
                                                            </p>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>

                    {users.length === 0 && (
                        <div className="py-16 text-center">
                            <p className="text-sm text-gray-400">Tidak ada data karyawan</p>
                        </div>
                    )}
                </div>

                {/* ── Footer legend ── */}
                <div className="px-6 pb-4 flex items-center gap-4 flex-wrap text-[10px] text-gray-400">
                    <span className="flex items-center gap-1.5"><span className="w-5 h-5 rounded-lg bg-violet-100 border border-violet-200 flex items-center justify-center text-violet-700 font-black text-[9px]">1</span>Kuota — klik untuk edit</span>
                    <span className="flex items-center gap-1.5"><span className="w-5 h-5 rounded-lg bg-cyan-100 border border-cyan-200 flex items-center justify-center text-cyan-700 font-black text-[10px]">＋</span>Tambah cuti</span>
                    <span className="flex items-center gap-1.5">tanggal → hover × untuk hapus</span>
                </div>
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
        <ModalShell onClose={onClose} headerColor="bg-gradient-to-r from-[#1a1a2e] to-[#16213e]" title=" Libur Mingguan Berulang" subtitle="Pilih hari libur tetap per karyawan"
            footer={
                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-all">Batal</button>
                    <button onClick={save} disabled={saving} className="flex-1 h-11 bg-gradient-to-r from-[#1a1a2e] to-[#16213e] text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                        {saving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</> : " Simpan"}
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

function TodayAttendanceCard({ status, loading, onRefresh, onRequestEarlyCheckout }: {
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
        checkedIn?: boolean;      // ✅ NEW
        checkedOut?: boolean;     // ✅ NEW
        needsCheckout?: boolean;  // ✅ NEW
        checkoutAt?: string;      // ✅ NEW
        isEarlyCheckout?: boolean; // ✅ NEW (poin 1)
        earlyCheckoutStatus?: "NONE" | "PENDING" | "APPROVED" | "REJECTED"; // ✅ NEW (poin 1)
        isManualCheckIn?: boolean; // ✅ NEW
        manualCheckInByName?: string | null; // ✅ NEW
    } | null;
    loading: boolean; onRefresh: () => void;
    onRequestEarlyCheckout: () => void; // ✅ NEW (poin 1)
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

    type CardState = "EXEMPT" | "MANUAL" | "NEEDS_CHECKOUT_EARLY" | "NEEDS_CHECKOUT_PENDING" | "NEEDS_CHECKOUT" | "ATTENDED" | "DAY_OFF" | "TOO_EARLY" | "TOO_LATE" | "OPEN";
    let state: CardState;
    if (status.isExempt) state = "EXEMPT";
    else if (status.manualAlreadyExists) state = "MANUAL";
    else if (status.needsCheckout && status.isEarlyCheckout && status.earlyCheckoutStatus === "PENDING") state = "NEEDS_CHECKOUT_PENDING";
    else if (status.needsCheckout && status.isEarlyCheckout && status.earlyCheckoutStatus !== "APPROVED") state = "NEEDS_CHECKOUT_EARLY";
    else if (status.needsCheckout) state = "NEEDS_CHECKOUT";
    else if (status.alreadyAttended) state = "ATTENDED";
    else if (status.isDayOff) state = "DAY_OFF";
    else if (status.reason === "TOO_EARLY") state = "TOO_EARLY";
    else if (status.reason === "TOO_LATE") state = "TOO_LATE";
    else state = "OPEN";

    let cfg: {
        icon: React.ReactNode; gradient: string; iconBg: string; badge: string; dot: string;
        badgeText: string; title: string; sub: string; showBtn: boolean;
        btnLabel?: string; btnColor?: string; btnAction?: () => void;
    };

    switch (state) {
        case "EXEMPT":
            cfg = {
                icon: <Shield className="w-6 h-6 text-slate-600" />, gradient: "from-slate-50 to-gray-100", iconBg: "bg-slate-100",
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
                icon: <Pencil className="w-6 h-6 text-blue-600" />,
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
        case "NEEDS_CHECKOUT_EARLY":
            cfg = {
                icon: <Clock className="w-6 h-6 text-amber-600" />, gradient: "from-amber-50 to-yellow-50", iconBg: "bg-amber-100",
                badge: "bg-amber-100 text-amber-700 border-amber-200", dot: "bg-amber-400 animate-pulse",
                badgeText: "Belum Waktunya Pulang",
                title: status.earlyCheckoutStatus === "REJECTED" ? "Izin Pulang Cepat Ditolak" : "Belum Waktunya Absen Pulang",
                sub: status.checkoutAt
                    ? `Jadwal pulang ${status.checkoutAt} · ${status.earlyCheckoutStatus === "REJECTED" ? "Ajukan izin lagi kalau masih perlu pulang cepat" : "Ajukan izin ke admin untuk pulang cepat"}`
                    : "Ajukan izin ke admin untuk pulang cepat",
                showBtn: true,
                btnLabel: status.earlyCheckoutStatus === "REJECTED" ? "Ajukan Izin Lagi →" : "Ajukan Izin Pulang Cepat →",
                btnColor: "bg-gradient-to-r from-amber-500 to-orange-600",
                btnAction: onRequestEarlyCheckout,
            };
            break;
        // ✅ NEW (poin 1) — sudah ajukan izin, masih menunggu ACC admin.
        case "NEEDS_CHECKOUT_PENDING":
            cfg = {
                icon: <Clock className="w-6 h-6 text-blue-600" />, gradient: "from-blue-50 to-indigo-50", iconBg: "bg-blue-100",
                badge: "bg-blue-100 text-blue-700 border-blue-200", dot: "bg-blue-400 animate-pulse",
                badgeText: "Menunggu Persetujuan",
                title: "Izin Pulang Cepat Sedang Diproses",
                sub: "Menunggu ACC admin/kepala divisi — tekan refresh untuk cek status terbaru",
                showBtn: false,
            };
            break;

        case "NEEDS_CHECKOUT":
            cfg = {
                icon: <Clock className="w-6 h-6 text-orange-600" />, gradient: "from-orange-50 to-amber-50", iconBg: "bg-orange-100",
                badge: "bg-orange-100 text-orange-700 border-orange-200", dot: "bg-orange-400 animate-pulse",
                badgeText: "Belum Absen Pulang", title: "Jangan Lupa Absen Pulang",
                sub: status.checkoutAt ? `Jam pulang: ${status.checkoutAt} · Shift ${status.shift}` : `Shift ${status.shift}`,
                showBtn: true, btnLabel: "Absen Pulang →",
                btnColor: "bg-gradient-to-r from-orange-500 to-amber-600",
                btnAction: () => { window.location.href = "/face-verify?from=/dashboard/attendance"; },
            };
            break;
        case "ATTENDED":
            cfg = {
                icon: <CheckCircle2 className="w-6 h-6 text-emerald-600" />, gradient: "from-emerald-50 to-green-50", iconBg: "bg-emerald-100",
                badge: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-400",
                badgeText: "Sudah Absen", title: "Absen Masuk & Pulang Tercatat",
                sub: `Shift ${status.shift}`, showBtn: false,
            };
            break;
        case "DAY_OFF":
            cfg = {
                icon: <Umbrella className="w-6 h-6 text-orange-600" />, gradient: "from-orange-50 to-amber-50", iconBg: "bg-orange-100",
                badge: "bg-orange-100 text-orange-700 border-orange-200", dot: "bg-orange-400",
                badgeText: "Hari Libur", title: "Kamu Libur Hari Ini",
                sub: "Tidak perlu absen", showBtn: false,
            };
            break;
        case "TOO_EARLY":
            cfg = {
                icon: <Clock className="w-6 h-6 text-indigo-600" />, gradient: "from-blue-50 to-indigo-50", iconBg: "bg-blue-100",
                badge: "bg-blue-100 text-blue-700 border-blue-200", dot: "bg-blue-400",
                badgeText: "Belum Waktunya", title: "Belum Waktunya Absen",
                sub: `Absen dibuka pukul ${openAt} · Shift ${status.shift}`, showBtn: false,
            };
            break;
        case "TOO_LATE":
            cfg = {
                icon: <Frown className="w-6 h-6 text-red-600" />, gradient: "from-red-50 to-rose-50", iconBg: "bg-red-100",
                badge: "bg-red-100 text-red-600 border-red-200", dot: "bg-red-400",
                badgeText: "Waktu Habis", title: "Waktu Absen Sudah Lewat",
                sub: `Batas absen pukul ${closeAt} · Shift ${status.shift}`, showBtn: false,
            };
            break;
        case "OPEN":
        default:
            cfg = {
                icon: <Clock className="w-6 h-6 text-amber-600" />, gradient: "from-amber-50 to-yellow-50", iconBg: "bg-amber-100",
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
        <div className={`bg-gradient-to-br ${cfg.gradient} rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5`}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                    <div className={`w-11 h-11 sm:w-14 sm:h-14 rounded-2xl ${cfg.iconBg} flex items-center justify-center flex-shrink-0 shadow-sm`}><span className="text-xl sm:text-2xl">{cfg.icon}</span></div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border ${cfg.badge}`}><span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.badgeText}</span>
                            {status.isManualCheckIn && (
                                <span
                                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border bg-blue-100 text-blue-700 border-blue-200"
                                    title={status.manualCheckInByName ? `Diabsenkan oleh ${status.manualCheckInByName}` : "Diabsenkan manual oleh admin"}
                                >
                                    <Pencil className="w-2.5 h-2.5" /> Absen Manual
                                </span>
                            )}
                        </div>
                        <p className="font-bold text-gray-800 text-sm leading-snug">{cfg.title}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{cfg.sub}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
                    <button onClick={onRefresh} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-400 hover:text-gray-600 transition-all shadow-sm flex-shrink-0" title="Refresh">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    </button>
                    {cfg.showBtn && <button onClick={cfg.btnAction} className={`${cfg.btnColor} text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-md hover:shadow-lg transition-all whitespace-nowrap flex-1 sm:flex-initial`}>{cfg.btnLabel}</button>}
                </div>
            </div>
        </div>
    );
}

function OvertimeChoiceCard({ date, options, isDayOff, alreadyRequested, onDismiss, onSubmitted }: {
    date: string;
    options: { beforeInMinutes: number; afterOutMinutes: number; holidayMinutes: number };
    isDayOff: boolean;
    alreadyRequested?: Set<string>;
    onDismiss?: () => void;
    onSubmitted?: () => void;
}) {
    const router = useRouter();
    const [dismissed, setDismissed] = useState(false);
    const [submitting, setSubmitting] = useState<string | null>(null);
    const [error, setError] = useState("");
    const already = alreadyRequested ?? new Set<string>();

    if (dismissed) return null;
    const { beforeInMinutes, afterOutMinutes, holidayMinutes } = options;
    if (beforeInMinutes <= 0 && afterOutMinutes <= 0 && holidayMinutes <= 0) return null;

    const isToday = date === getWIBToday();
    const dateLabel = new Date(date + "T12:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

    const submit = async (direction: "BEFORE_IN" | "AFTER_OUT" | "BOTH" | "HOLIDAY") => {
        setSubmitting(direction); setError("");
        try {
            const res = await fetch("/api/attendance/overtime", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_self_declare: true, declare_direction: direction, request_date: date }),
            });
            const d = await res.json();
            if (!d.success) { setError(d.message || "Gagal mengajukan lembur"); setSubmitting(null); return; }
            onSubmitted?.();
            router.push(`/dashboard/attendance/overtime?fillDetail=${d.data.id}`);
        } catch {
            setError("Gagal mengajukan lembur");
            setSubmitting(null);
        }
    };

    return (
        <div className="bg-gradient-to-br from-violet-50 to-purple-50 rounded-2xl border border-violet-100 shadow-sm p-4 sm:p-5 space-y-3">
            <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
                    <Clock className="w-5 h-5 text-violet-600" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-800 text-sm leading-snug">
                        {isToday ? "Kamu Berpotensi Dapat Lembur" : "Lembur Belum Diajukan"}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                        {dateLabel} · Pilih mau ajukan yang mana, atau tidak sama sekali.
                    </p>
                </div>
            </div>

            {error && <div className="bg-red-50 border border-red-200 text-red-600 text-[11px] px-3.5 py-2.5 rounded-xl">{error}</div>}

            <div className="flex flex-col gap-2">
                {isDayOff && holidayMinutes > 0 && !already.has("HOLIDAY") && (
                    <button onClick={() => submit("HOLIDAY")} disabled={!!submitting}
                        className="w-full h-11 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                        {submitting === "HOLIDAY" && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                        Ajukan Lembur Hari Libur ({formatOvertimeMinutes(holidayMinutes)})
                    </button>
                )}
                {!isDayOff && beforeInMinutes > 0 && !already.has("BEFORE_IN") && !already.has("BOTH") && (
                    <button onClick={() => submit("BEFORE_IN")} disabled={!!submitting}
                        className="w-full h-11 bg-white border border-violet-200 text-violet-700 rounded-xl text-xs font-bold hover:bg-violet-50 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                        {submitting === "BEFORE_IN" && <div className="w-4 h-4 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin" />}
                        Ajukan Lembur Awal ({formatOvertimeMinutes(beforeInMinutes)})
                    </button>
                )}
                {!isDayOff && afterOutMinutes > 0 && !already.has("AFTER_OUT") && !already.has("BOTH") && (
                    <button onClick={() => submit("AFTER_OUT")} disabled={!!submitting}
                        className="w-full h-11 bg-white border border-violet-200 text-violet-700 rounded-xl text-xs font-bold hover:bg-violet-50 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                        {submitting === "AFTER_OUT" && <div className="w-4 h-4 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin" />}
                        Ajukan Lembur Akhir ({formatOvertimeMinutes(afterOutMinutes)})
                    </button>
                )}
                {!isDayOff && beforeInMinutes > 0 && afterOutMinutes > 0 && !already.has("BOTH") && !(already.has("BEFORE_IN") && already.has("AFTER_OUT")) && (
                    <button onClick={() => submit("BOTH")} disabled={!!submitting}
                        className="w-full h-11 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                        {submitting === "BOTH" && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                        Ajukan Awal & Akhir ({formatOvertimeMinutes(beforeInMinutes + afterOutMinutes)})
                    </button>
                )}
                <button onClick={() => { setDismissed(true); onDismiss?.(); }} disabled={!!submitting}
                    className="w-full h-10 bg-white border border-gray-200 text-gray-500 rounded-xl text-xs font-semibold hover:bg-gray-50 transition-all disabled:opacity-50">
                    Tidak Mau Lembur
                </button>
            </div>
        </div>
    );
}

// ─── Kartu "Lembur Belum Diajukan" untuk tanggal-tanggal yang sudah lewat ──
// ✅ NEW — sebelumnya tombol ajukan lembur awal/akhir & tidak mau lembur cuma
// muncul untuk HARI INI (lewat TodayAttendanceCard). Begitu tanggalnya lewat,
// tombolnya hilang total walau karyawan belum sempat memilih. Kartu ini
// menampilkan daftar tanggal lalu yang masih berpotensi lembur & belum
// diajukan/ditandai "Tidak Mau Lembur" — ada ikon warning per tanggal, diklik
// baru muncul pilihan yang sama seperti kartu hari ini (lengkap tanggalnya).
function PastOvertimeOpportunitiesCard({ items, onResolved }: {
    items: { date: string; options: { beforeInMinutes: number; afterOutMinutes: number; holidayMinutes: number }; isDayOff: boolean; already: Set<string> }[];
    onResolved: (date: string) => void;
}) {
    const [openDate, setOpenDate] = useState<string | null>(null);
    if (items.length === 0) return null;

    return (
        <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5 bg-amber-50/70 border-b border-amber-100">
                <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <ShieldAlert className="w-5 h-5 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-amber-800">
                        {items.length} Hari Lembur Belum Diajukan
                    </p>
                    <p className="text-[11px] text-amber-600 mt-0.5">Klik tanggalnya untuk ajukan lembur atau tandai tidak mau lembur</p>
                </div>
            </div>
            <div className="divide-y divide-amber-50">
                {items.map(item => {
                    const isOpen = openDate === item.date;
                    const label = new Date(item.date + "T12:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });
                    return (
                        <div key={item.date}>
                            <button
                                onClick={() => setOpenDate(p => p === item.date ? null : item.date)}
                                className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3 hover:bg-amber-50/40 transition-all text-left"
                            >
                                <div className="flex items-center gap-2.5">
                                    <ShieldAlert className="w-4 h-4 text-amber-500 flex-shrink-0" />
                                    <span className="text-xs font-semibold text-gray-700">{label}</span>
                                </div>
                                <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${isOpen ? "rotate-90" : ""}`} />
                            </button>
                            {isOpen && (
                                <div className="px-4 sm:px-5 pb-4">
                                    <OvertimeChoiceCard
                                        date={item.date}
                                        options={item.options}
                                        isDayOff={item.isDayOff}
                                        alreadyRequested={item.already}
                                        onDismiss={() => { onResolved(item.date); setOpenDate(null); }}
                                        onSubmitted={() => { onResolved(item.date); setOpenDate(null); }}
                                    />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function EarlyCheckoutRequestModal({ checkoutAt, onClose, onSaved }: {
    checkoutAt?: string;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [reason, setReason] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [submitted, setSubmitted] = useState(false);

    const submit = async () => {
        if (!reason.trim()) { setError("Alasan wajib diisi"); return; }
        setSaving(true); setError("");
        try {
            const res = await fetch("/api/attendance/early-checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason: reason.trim() }),
            });
            const d = await res.json();
            if (!d.success) { setError(d.message || "Gagal mengirim pengajuan"); return; }
            setSubmitted(true);
            onSaved();
        } catch {
            setError("Gagal mengirim pengajuan");
        } finally { setSaving(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-scaleIn">
                <div className="bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-5 flex items-start justify-between">
                    <div>
                        <p className="font-bold text-white text-base">Ajukan Izin Pulang Cepat</p>
                        <p className="text-xs text-white/70 mt-1">
                            {checkoutAt ? `Jadwal pulang kamu ${checkoutAt}` : "Belum waktunya jadwal pulang"}
                        </p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/15 transition-all">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="px-6 py-5 space-y-4">
                    {error && <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-3 rounded-xl">{error}</div>}
                    {submitted ? (
                        <div className="text-center py-4">
                            <p className="text-sm font-bold text-emerald-700 mb-1">Pengajuan terkirim</p>
                            <p className="text-xs text-gray-400">Tunggu persetujuan admin/kepala divisi, lalu absen pulang seperti biasa.</p>
                        </div>
                    ) : (
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Alasan Pulang Cepat *</label>
                            <textarea
                                value={reason}
                                onChange={e => setReason(e.target.value)}
                                rows={3}
                                placeholder="Contoh: keperluan keluarga mendadak..."
                                className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-amber-400/20 resize-none"
                            />
                        </div>
                    )}
                </div>
                <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
                    <button onClick={onClose} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-all">
                        {submitted ? "Tutup" : "Batal"}
                    </button>
                    {!submitted && (
                        <button onClick={submit} disabled={saving} className="flex-1 h-11 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                            {saving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Mengirim...</> : "Kirim Pengajuan"}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

function EditCheckoutModal({ userName, dateKey, currentCheckoutIso, onClose, onSave }: {
    userName: string;
    dateKey: string;
    currentCheckoutIso: string | null;
    onClose: () => void;
    onSave: (time: string | null) => Promise<void>; // ✅ NEW — null = kosongkan jam pulang
}) {
    const parseTime = (iso: string | null): string => {
        if (!iso) return "17:00";
        const d = new Date(iso);
        if (isNaN(d.getTime())) return "17:00";
        return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).substring(0, 5);
    };

    const [hasCheckout, setHasCheckout] = useState(true); // ✅ NEW — toggle "Ada Jam Pulang" vs "Kosongkan"
    const [time, setTime] = useState(parseTime(currentCheckoutIso));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const submit = async () => {
        if (hasCheckout && !time) { setError("Jam pulang wajib diisi"); return; }
        setSaving(true); setError("");
        try {
            await onSave(hasCheckout ? time : null);
        } catch (err: any) {
            setError(err?.message || "Gagal menyimpan");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-scaleIn">
                <div className="bg-gradient-to-r from-violet-600 to-purple-700 px-6 py-5 flex items-start justify-between">
                    <div>
                        <p className="font-bold text-white text-base">
                            {currentCheckoutIso ? "Koreksi Jam Pulang" : "Tambahkan Jam Pulang"}
                        </p>
                        <p className="text-xs text-white/70 mt-1">
                            {userName} · {new Date(dateKey + "T12:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
                        </p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/15 transition-all">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="px-6 py-5 space-y-4">
                    {error && <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-3 rounded-xl">{error}</div>}
                    {currentCheckoutIso && (
                        <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Jam Pulang Saat Ini</p>
                            <p className="text-sm font-mono font-bold text-gray-700">{parseTime(currentCheckoutIso)} WIB</p>
                        </div>
                    )}

                    {/* ✅ NEW — pilihan: isi/ubah jam pulang, atau kosongkan lagi */}
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setHasCheckout(true)}
                            className={`flex-1 h-10 rounded-xl text-xs font-bold border transition-all ${hasCheckout ? "bg-violet-600 text-white border-violet-600" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
                        >
                            Ada Jam Pulang
                        </button>
                        <button
                            type="button"
                            onClick={() => setHasCheckout(false)}
                            className={`flex-1 h-10 rounded-xl text-xs font-bold border transition-all ${!hasCheckout ? "bg-red-600 text-white border-red-600" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
                        >
                            Tidak Ada (Kosongkan)
                        </button>
                    </div>

                    {hasCheckout ? (
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Jam Pulang Baru (WIB) *</label>
                            <input
                                type="time"
                                value={time}
                                onChange={e => setTime(e.target.value)}
                                className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-400/20 transition-all font-mono"
                            />
                            <p className="text-[10px] text-gray-400 mt-1.5">
                                Perubahan ini langsung tercatat sebagai koreksi manual oleh admin. Draft lemburan yang belum di-ACC ikut disesuaikan otomatis.
                            </p>
                        </div>
                    ) : (
                        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                            <p className="text-xs text-red-700 font-semibold mb-1">Jam pulang akan dikosongkan</p>
                            <p className="text-[11px] text-red-500">
                                Karyawan ini akan dianggap belum absen pulang untuk tanggal ini. Draft lemburan terkait yang belum di-ACC juga ikut dihapus.
                            </p>
                        </div>
                    )}
                </div>
                <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
                    <button onClick={onClose} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-all">Batal</button>
                    <button
                        onClick={submit}
                        disabled={saving}
                        className={`flex-1 h-11 rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2 text-white ${hasCheckout ? "bg-gradient-to-r from-violet-600 to-purple-700" : "bg-gradient-to-r from-red-600 to-rose-700"}`}
                    >
                        {saving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</> : hasCheckout ? "Simpan" : "Kosongkan"}
                    </button>
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
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] shadow-lg mb-4"><CalendarDays className="w-8 h-8 text-white" /></div>
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
                        <p className="font-bold text-white text-base"> Edit Gaji</p>
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
                        <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-3 rounded-xl"> {error}</div>
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
                                    {t === "FIXED" ? "Tetap" : "% Absen"}
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
                        {saving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</> : " Simpan"}
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
                        <p className="font-bold text-white text-base"> Detail Ketidakhadiran</p>
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
                            <p className="text-sm text-gray-400">Tidak ada ketidakhadiran </p>
                        ) : (
                            <div className="space-y-2">
                                {absences.map(a => {
                                    const cfg = ABSENCE_REASON_LABELS[a.reason];
                                    return (
                                        <div key={a.date} className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-2.5">
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-gray-800">{fmt(a.date)}</p>
                                                {a.note && <p className="text-[11px] text-gray-400 truncate">{a.note}</p>}
                                            </div>
                                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border flex-shrink-0 ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                                                {renderStatusEmoji(cfg.emoji, "w-3 h-3")} {cfg.label}
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
                                        {new Date(d + "T12:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
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

function AttendanceSummaryDetailModal({ detail, onClose }: {
    detail: AttendanceSummaryDetail;
    onClose: () => void;
}) {
    const isPresent = detail.type === "present";
    const headerColor = isPresent
        ? "bg-gradient-to-r from-emerald-600 to-green-700"
        : "bg-gradient-to-r from-amber-500 to-orange-600";
    const title = isPresent ? "Detail Hari Tepat Waktu" : " Detail Hari Terlambat";

    const fmt = (d: string) =>
        new Date(d + "T12:00:00").toLocaleDateString("id-ID", {
            weekday: "long", day: "numeric", month: "long",
        });

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[85dvh] overflow-hidden animate-scaleIn">
                <div className={`${headerColor} px-6 py-5 flex items-start justify-between flex-shrink-0`}>
                    <div>
                        <p className="font-bold text-white text-base">{title}</p>
                        <p className="text-xs text-white/70 mt-1">{detail.name} · {detail.monthLabel}</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-white/60 hover:text-white hover:bg-white/20 transition">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 px-6 py-5 space-y-2">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-3">
                        {isPresent ? "Hari tepat waktu" : "Hari terlambat"} ({detail.items.length})
                    </p>
                    {detail.items.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-8">Tidak ada data</p>
                    ) : (
                        detail.items.map(item => (
                            <div
                                key={item.date}
                                className={`flex items-center justify-between gap-3 rounded-xl px-3.5 py-3 border ${isPresent
                                    ? "bg-emerald-50/60 border-emerald-100"
                                    : "bg-amber-50/60 border-amber-100"
                                    }`}
                            >
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-gray-800">{fmt(item.date)}</p>
                                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                        <span className="font-mono text-[11px] font-bold text-gray-600">
                                            {item.checkInTime}
                                        </span>
                                        {item.method === "MANUAL" && (
                                            <span className="text-[10px] text-blue-600 font-bold"> Manual</span>
                                        )}
                                        {item.manualCreatedBy && (
                                            <span className="text-[10px] text-violet-500 font-semibold">
                                                oleh {item.manualCreatedBy}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border flex-shrink-0 ${isPresent
                                    ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                    : "bg-amber-100 text-amber-700 border-amber-200"
                                    }`}>
                                    {isPresent ? "Tepat" : "Terlambat"}
                                </span>
                            </div>
                        ))
                    )}
                </div>

                <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0">
                    <button onClick={onClose} className="w-full h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition">
                        Tutup
                    </button>
                </div>
            </div>
        </div>
    );
}

function LeaveDetailModal({ name, dates, monthLabel, onClose }: {
    name: string; dates: string[]; monthLabel: string; onClose: () => void;
}) {
    const fmt = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });
    const sorted = [...dates].sort();

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[85dvh] overflow-hidden animate-scaleIn">
                <div className="bg-gradient-to-r from-cyan-600 to-teal-700 px-6 py-5 flex items-start justify-between flex-shrink-0">
                    <div>
                        <p className="font-bold text-white text-base">Detail Cuti</p>
                        <p className="text-xs text-white/70 mt-1">{name} · {monthLabel}</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-white/60 hover:text-white hover:bg-white/20 transition">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <div className="overflow-y-auto flex-1 px-6 py-5 space-y-2">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-3">
                        Tanggal cuti ({sorted.length})
                    </p>
                    {sorted.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-8">Tidak ada data</p>
                    ) : (
                        sorted.map(d => (
                            <div key={d} className="flex items-center justify-between gap-3 bg-cyan-50/60 border border-cyan-100 rounded-xl px-3.5 py-3">
                                <p className="text-sm font-bold text-gray-800">{fmt(d)}</p>
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border bg-cyan-100 text-cyan-700 border-cyan-200 flex-shrink-0">
                                    Cuti
                                </span>
                            </div>
                        ))
                    )}
                </div>
                <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0">
                    <button onClick={onClose} className="w-full h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition">
                        Tutup
                    </button>
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
    salary_income?: number;
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
    sent_at: string | null;
    sent_by: string | null;
    notes: string | null;
    users?: { id: string; name: string; role: string };
};

function SalarySlipCard({ slip, onFinalize, onRefresh }: {
    slip: SalarySlip;
    onFinalize: () => void;
    onRefresh?: () => void;
}) {
    const [finalizing, setFinalizing] = useState(false);
    const [sending, setSending] = useState(false);

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

    const handleSend = async () => {
        if (!confirm(`Kirim slip gaji ke ${slip.users?.name ?? "karyawan ini"}? Slip akan otomatis difinalisasi.`)) return;
        setSending(true);
        try {
            const r = await fetch("/api/attendance/salary-slip/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ slip_id: slip.id }),
            });
            const d = await r.json();
            if (d.success) {
                onRefresh?.();
            } else {
                alert(d.message || "Gagal mengirim slip");
            }
        } finally { setSending(false); }
    };

    const alreadySent = !!slip.sent_at;
    const sentDate = slip.sent_at
        ? new Date(slip.sent_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
        : null;

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition overflow-hidden">
            {/* Header row */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white gap-3 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex items-center justify-center text-white text-[10px] font-black flex-shrink-0 shadow-md">
                        {initials(slip.users?.name || "?")}
                    </div>
                    <div>
                        <p className="font-bold text-gray-800 text-sm leading-tight">{slip.users?.name || "Unknown"}</p>
                        <p className="text-[10px] text-gray-400">{MONTH_NAMES[slip.month - 1]} {slip.year}</p>
                    </div>
                    {/* Badge status finalisasi */}
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border ${slip.status === "FINALIZED"
                        ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                        : "bg-amber-100 text-amber-700 border-amber-200"
                        }`}>
                        {slip.status === "FINALIZED" ? "Final" : "Draft"}
                    </span>
                    {/* Badge terkirim */}
                    {alreadySent && (
                        <span
                            className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border bg-blue-100 text-blue-700 border-blue-200"
                            title={`Dikirim: ${sentDate}`}
                        >
                            Terkirim {sentDate}
                        </span>
                    )}
                </div>

                {/* Tombol aksi */}
                <div className="flex items-center gap-1.5 flex-wrap">
                    <a
                        href={`/api/attendance/salary-slip/${slip.id}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-gray-800 text-white text-[10px] font-bold rounded-lg hover:bg-gray-700 transition flex items-center gap-1"
                    >
                        PDF
                    </a>

                    {slip.status === "DRAFT" && (
                        <button
                            onClick={handleFinalize}
                            disabled={finalizing}
                            className="px-3 py-1.5 bg-emerald-600 text-white text-[10px] font-bold rounded-lg hover:bg-emerald-700 transition disabled:opacity-50"
                        >
                            {finalizing ? "..." : "Finalisasi"}
                        </button>
                    )}

                    {/* Tombol Kirim */}
                    <button
                        onClick={handleSend}
                        disabled={sending || alreadySent}
                        title={alreadySent ? `Sudah dikirim: ${sentDate}` : "Kirim slip ke akun karyawan"}
                        className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition flex items-center gap-1 disabled:opacity-50 ${alreadySent
                            ? "bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"
                            : "bg-blue-600 text-white hover:bg-blue-700"
                            }`}
                    >
                        {sending
                            ? <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Mengirim...</>
                            : alreadySent ? "Terkirim" : "Kirim"
                        }
                    </button>
                </div>
            </div>

            {/* Body — compact grid */}
            <div className="px-5 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                    <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-wide mb-1">Penghasilan</p>
                    <p className="text-xs font-black text-emerald-700 font-mono">{formatRupiah(slip.total_income)}</p>
                    <div className="mt-1.5 space-y-0.5">
                        <p className="text-[9px] text-gray-500">
                            Pokok: {formatRupiah(slip.salary_income ?? slip.base_salary)}
                            {slip.salary_type === "PERCENTAGE" && typeof slip.salary_income === "number" && slip.salary_income !== slip.base_salary && (
                                <span className="text-gray-300"> (nominal {formatRupiah(slip.base_salary)})</span>
                            )}
                        </p>
                        {slip.overtime > 0 && <p className="text-[9px] text-orange-600">Lembur: +{formatRupiah(slip.overtime)}</p>}
                        {(slip.allowance_wife > 0 || slip.allowance_child > 0) && (
                            <p className="text-[9px] text-gray-500">Tunjangan: +{formatRupiah(slip.allowance_wife + slip.allowance_child)}</p>
                        )}
                    </div>
                </div>

                <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                    <p className="text-[9px] font-bold text-red-600 uppercase tracking-wide mb-1">Potongan</p>
                    <p className="text-xs font-black text-red-600 font-mono">-{formatRupiah(slip.total_deduction)}</p>
                    <div className="mt-1.5 space-y-0.5">
                        {slip.deduction_loan > 0 && <p className="text-[9px] text-gray-500">Kasbon: -{formatRupiah(slip.deduction_loan)}</p>}
                        {slip.deduction_pension > 0 && <p className="text-[9px] text-gray-500">Pensiun: -{formatRupiah(slip.deduction_pension)}</p>}
                        {slip.total_deduction === 0 && <p className="text-[9px] text-gray-300">Tidak ada</p>}
                    </div>
                </div>

                <div className="bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl p-3 sm:col-span-2">
                    <p className="text-[9px] font-bold text-white/70 uppercase tracking-wide mb-1">Gaji Bersih</p>
                    <p className="text-base font-black text-white font-mono">{formatRupiah(slip.net_salary)}</p>
                    <p className="text-[9px] text-white/60 mt-1">
                        {slip.salary_type === "FIXED" ? "Gaji Tetap" : "% Kehadiran"} · {MONTH_NAMES[slip.month - 1]} {slip.year}
                    </p>
                    {alreadySent && (
                        <p className="text-[9px] text-white/50 mt-0.5">Dikirim {sentDate}</p>
                    )}
                </div>
            </div>
        </div >
    );
}

function SwapDayOffModal({ users, dayOffs, allDateOffs, allDateWorks, calYear, calMonth, onClose, onSaved }: {
    users: UserInfo[];
    dayOffs: DayOff[];
    allDateOffs: DateOff[];
    allDateWorks: DateWork[];
    calYear: number;
    calMonth: number;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [uid, setUid] = useState(users[0]?.id ?? "");
    const [offDate, setOffDate] = useState("");   // hari masuk → jadi libur
    const [workDate, setWorkDate] = useState(""); // hari libur → jadi masuk
    const [note, setNote] = useState("");
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [error, setError] = useState("");

    // Ambil swap yang sudah ada untuk user ini
    const existingSwaps = useMemo(() => {
        // Pasangkan date_off (masuk→libur) dengan date_work (libur→masuk) berdasarkan note "Tukar libur"
        const offMap: Record<string, DateOff> = {};
        allDateOffs
            .filter(d => d.user_id === uid)
            .forEach(d => { offMap[d.off_date] = d; });

        const workMap: Record<string, DateWork> = {};
        allDateWorks
            .filter(d => d.user_id === uid)
            .forEach(d => { workMap[d.work_date] = d; });

        const swaps: Array<{ off: DateOff; work: DateWork }> = [];
        const workList = Object.values(workMap);
        Object.values(offMap).forEach((off, idx) => {
            const matchingWork = workList.find(
                w => w.note === off.note
            ) ?? workList[idx];
            if (matchingWork) {
                swaps.push({ off, work: matchingWork });
                const wIdx = workList.indexOf(matchingWork);
                if (wIdx !== -1) workList.splice(wIdx, 1);
            }
        });

        return swaps;
    }, [allDateOffs, allDateWorks, uid]);

    // Info hari libur mingguan user yang dipilih
    const userDayOffs = useMemo(() => {
        const m = new Set<number>();
        dayOffs.filter(d => d.user_id === uid).forEach(d => m.add(d.day_of_week));
        return m;
    }, [dayOffs, uid]);

    const dim = new Date(calYear, calMonth + 1, 0).getDate();
    const minDate = `${calYear}-${pad2(calMonth + 1)}-01`;
    const maxDate = `${calYear}-${pad2(calMonth + 1)}-${pad2(dim)}`;

    // Cek apakah tanggal adalah hari libur mingguan
    const isDayOff = (dateStr: string) => {
        if (!dateStr) return false;
        const dow = new Date(dateStr + "T12:00:00").getDay();
        return userDayOffs.has(dow);
    };

    const save = async () => {
        if (!uid || !offDate || !workDate) {
            setError("Semua field wajib diisi");
            return;
        }
        if (!isDayOff(workDate)) {
            setError(`Tanggal masuk pengganti (${workDate}) harus merupakan hari libur mingguan karyawan ini`);
            return;
        }
        if (isDayOff(offDate)) {
            setError(`Tanggal yang diganti libur (${offDate}) harus merupakan hari kerja`);
            return;
        }

        setSaving(true);
        setError("");
        try {
            const res = await fetch("/api/attendance/swap-dayoff", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: uid, off_date: offDate, work_date: workDate, note: note || "Tukar libur" }),
            });
            const d = await res.json();
            if (!d.success) { setError(d.message || "Gagal menyimpan"); return; }
            onSaved();
            setOffDate("");
            setWorkDate("");
            setNote("");
        } catch {
            setError("Gagal menyimpan");
        } finally {
            setSaving(false);
        }
    };

    const deleteSwap = async (off: DateOff, work: DateWork) => {
        const key = `${off.off_date}_${work.work_date}`;
        setDeleting(key);
        try {
            await fetch(
                `/api/attendance/swap-dayoff?user_id=${uid}&off_date=${off.off_date}&work_date=${work.work_date}`,
                { method: "DELETE" }
            );
            onSaved();
        } catch { }
        finally { setDeleting(null); }
    };

    const selectedUser = users.find(u => u.id === uid);

    return (
        <ModalShell
            onClose={onClose}
            headerColor="bg-gradient-to-r from-violet-600 to-purple-700"
            title="Tukar Libur"
            subtitle="Ganti hari libur dengan hari kerja lain dalam bulan ini"
            footer={
                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-all">
                        Tutup
                    </button>
                    <button
                        onClick={save}
                        disabled={saving || !offDate || !workDate}
                        className="flex-1 h-11 bg-gradient-to-r from-violet-600 to-purple-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {saving
                            ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</>
                            : "Simpan Tukar Libur"
                        }
                    </button>
                </div>
            }
        >
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-3 rounded-xl flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-amber-500 inline mr-1" />{error}
                    </div>
                )}

                {/* Info box */}
                <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 text-xs text-violet-700">
                    <p className="font-bold mb-1"><span className="inline-flex mr-1 items-center justify-center w-4 h-4 rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold">i</span> Cara kerja Tukar Libur:</p>
                    <ul className="space-y-1 text-violet-600">
                        <li>• <strong>Tanggal Diganti Libur</strong>: hari yang harusnya masuk, tapi karyawan izin/libur</li>
                        <li>• <strong>Tanggal Masuk Pengganti</strong>: hari libur mingguan yang akan dipakai sebagai ganti masuk</li>
                        <li>• Keduanya disimpan sekaligus dan mempengaruhi perhitungan absensi</li>
                    </ul>
                </div>

                {/* Pilih Karyawan */}
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Karyawan</label>
                    <select
                        value={uid}
                        onChange={e => { setUid(e.target.value); setOffDate(""); setWorkDate(""); }}
                        className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-400/20 transition-all"
                    >
                        {users.map(u => (
                            <option key={u.id} value={u.id}>{u.name} — {u.role.replace(/_/g, " ")}</option>
                        ))}
                    </select>
                    {/* Tampilkan hari libur mingguan user */}
                    {selectedUser && userDayOffs.size > 0 && (
                        <p className="text-[11px] text-gray-400 mt-1.5 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                            Libur mingguan: <span className="font-bold text-red-500">
                                {Array.from(userDayOffs).sort().map(d => DAY_FULL[d]).join(", ")}
                            </span>
                        </p>
                    )}
                </div>

                {/* Form Tukar */}
                <div className="bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-100 rounded-2xl p-4 space-y-4">
                    <p className="text-xs font-bold text-violet-700 uppercase tracking-wide">Pengaturan Tukar Libur</p>

                    <div className="grid grid-cols-2 gap-3">
                        {/* Tanggal yang jadi libur (harusnya masuk) */}
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                                Tanggal Diganti Libur
                            </label>
                            <input
                                type="date"
                                value={offDate}
                                min={minDate}
                                max={maxDate}
                                onChange={e => setOffDate(e.target.value)}
                                className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400/20 transition-all"
                            />
                            {offDate && (
                                <p className={`text-[10px] mt-1 font-semibold ${isDayOff(offDate) ? "text-red-500" : "text-emerald-600"}`}>
                                    {new Date(offDate + "T12:00:00").toLocaleDateString("id-ID", { weekday: "long" })}
                                    {isDayOff(offDate) ? " Ini hari libur!" : "Hari kerja"}
                                </p>
                            )}
                            <p className="text-[9px] text-gray-400 mt-0.5">Hari yang harusnya masuk → jadi libur</p>
                        </div>

                        {/* Tanggal pengganti (harusnya libur → jadi masuk) */}
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                                Tanggal Masuk Pengganti
                            </label>
                            <input
                                type="date"
                                value={workDate}
                                min={minDate}
                                max={maxDate}
                                onChange={e => setWorkDate(e.target.value)}
                                className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400/20 transition-all"
                            />
                            {workDate && (
                                <p className={`text-[10px] mt-1 font-semibold ${isDayOff(workDate) ? "text-emerald-600" : "text-amber-500"}`}>
                                    {new Date(workDate + "T12:00:00").toLocaleDateString("id-ID", { weekday: "long" })}
                                    {isDayOff(workDate) ? "Hari libur (bisa dipakai)" : " Ini bukan hari libur!"}
                                </p>
                            )}
                            <p className="text-[9px] text-gray-400 mt-0.5">Hari libur mingguan → jadi masuk</p>
                        </div>
                    </div>

                    {/* Preview swap */}
                    {offDate && workDate && !isDayOff(offDate) && isDayOff(workDate) && (
                        <div className="bg-white border border-violet-200 rounded-xl px-4 py-3">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Preview Tukar</p>
                            <div className="flex items-center gap-3 text-sm">
                                <div className="flex-1 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-center">
                                    <p className="text-[10px] text-red-500 font-bold">LIBUR</p>
                                    <p className="font-bold text-gray-800 text-xs mt-0.5">
                                        {new Date(offDate + "T12:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                                    </p>
                                    <p className="text-[9px] text-gray-500">
                                        {new Date(offDate + "T12:00:00").toLocaleDateString("id-ID", { weekday: "long" })}
                                    </p>
                                </div>
                                <span className="text-gray-400 font-bold text-lg">⇄</span>
                                <div className="flex-1 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-center">
                                    <p className="text-[10px] text-emerald-600 font-bold">MASUK</p>
                                    <p className="font-bold text-gray-800 text-xs mt-0.5">
                                        {new Date(workDate + "T12:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                                    </p>
                                    <p className="text-[9px] text-gray-500">
                                        {new Date(workDate + "T12:00:00").toLocaleDateString("id-ID", { weekday: "long" })}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Catatan */}
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                            Catatan <span className="text-gray-300 font-normal normal-case">(opsional)</span>
                        </label>
                        <input
                            type="text"
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            placeholder="e.g. Keperluan keluarga, event kantor..."
                            className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400/20 transition-all"
                        />
                    </div>
                </div>

                {/* Daftar tukar libur yang sudah ada */}
                {existingSwaps.length > 0 && (
                    <div>
                        <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-3">
                            Tukar Libur Aktif ({existingSwaps.length})
                        </p>
                        <div className="space-y-2">
                            {existingSwaps.map(({ off, work }) => {
                                const key = `${off.off_date}_${work.work_date}`;
                                return (
                                    <div
                                        key={key}
                                        className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-center justify-between gap-3 shadow-sm"
                                    >
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <div className="flex items-center gap-2 text-xs flex-wrap">
                                                <span className="bg-red-100 text-red-600 border border-red-200 px-2.5 py-1 rounded-lg font-bold">
                                                    {new Date(off.off_date + "T12:00:00").toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" })}
                                                </span>
                                                <span className="text-gray-400 font-bold">→</span>
                                                <span className="bg-emerald-100 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-lg font-bold">
                                                    {new Date(work.work_date + "T12:00:00").toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" })}
                                                </span>
                                            </div>
                                            {off.note && (
                                                <span className="text-[10px] text-gray-400 truncate hidden sm:block">{off.note}</span>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => deleteSwap(off, work)}
                                            disabled={deleting === key}
                                            className="w-8 h-8 flex items-center justify-center rounded-xl text-red-400 hover:bg-red-50 hover:text-red-600 transition-all font-bold text-lg flex-shrink-0"
                                        >
                                            {deleting === key
                                                ? <div className="w-4 h-4 border-2 border-red-300 border-t-red-500 rounded-full animate-spin" />
                                                : "×"
                                            }
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </ModalShell>
    );
}

function AbsentUsersModal({
    date,
    absentUsers,
    isAdmin,
    mode = "karyawan",
    onAbsenManual,
    onClose,
}: {
    date: string;
    absentUsers: {
        name: string; role: string; userId: string;
        reason: "ALPHA" | "ABSENT" | "SICK" | "PERMIT" | "LEAVE";
        note: string | null;
        attendanceStatus: "LATE_MORNING" | "POTENTIALLY_LATE" | "NO_RECORD" | "ABSENT_CONFIRMED" | "WITHIN_TIME";
    }[];
    isAdmin: boolean;
    mode?: "karyawan" | "pkl";
    onAbsenManual: (userId: string) => void;
    onClose: () => void;
}) {
    const isPKL = mode === "pkl";
    const headerGradient = isPKL ? "from-amber-500 to-yellow-600" : "from-orange-500 to-amber-600";
    const avatarGradient = isPKL ? "from-amber-400 to-yellow-500" : "from-orange-400 to-amber-500";
    const modeLabel = isPKL ? "PKL" : "karyawan";
    const STATUS_CONFIG = {
        WITHIN_TIME: {
            label: "Belum Buka Absen",
            icon: "clock",
            bg: "bg-blue-50",
            color: "text-blue-600",
            border: "border-blue-200",
            desc: "Waktu absen belum dibuka",
        },
        POTENTIALLY_LATE: {
            label: "Berpotensi Terlambat",
            icon: "alert",
            bg: "bg-amber-50",
            color: "text-amber-600",
            border: "border-amber-200",
            desc: "Sudah waktunya absen tapi belum",
        },
        LATE_MORNING: {
            label: "Absen Siang",
            icon: "sun",
            bg: "bg-orange-50",
            color: "text-orange-600",
            border: "border-orange-200",
            desc: "Sudah lewat jam tepat waktu, jika absen akan terlambat",
        },
        ABSENT_CONFIRMED: {
            label: "Tidak Hadir",
            icon: "slash",
            bg: "bg-red-50",
            color: "text-red-600",
            border: "border-red-200",
            desc: "Waktu absen sudah habis",
        },
        NO_RECORD: {
            label: "Tidak Ada Catatan",
            icon: "inbox",
            bg: "bg-gray-50",
            color: "text-gray-500",
            border: "border-gray-200",
            desc: "Tidak ada data kehadiran",
        },
    };

    const dateLabel = new Date(date + "T12:00:00").toLocaleDateString("id-ID", {
        weekday: "long", day: "numeric", month: "long", year: "numeric"
    });

    // Group by status
    const groups = {
        ABSENT_CONFIRMED: absentUsers.filter(u => u.attendanceStatus === "ABSENT_CONFIRMED"),
        LATE_MORNING: absentUsers.filter(u => u.attendanceStatus === "LATE_MORNING"),
        POTENTIALLY_LATE: absentUsers.filter(u => u.attendanceStatus === "POTENTIALLY_LATE"),
        WITHIN_TIME: absentUsers.filter(u => u.attendanceStatus === "WITHIN_TIME"),
        NO_RECORD: absentUsers.filter(u => u.attendanceStatus === "NO_RECORD"),
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[85dvh] overflow-hidden animate-scaleIn">
                {/* Header */}
                <div className={`bg-gradient-to-r ${headerGradient} px-6 py-5 flex items-start justify-between flex-shrink-0`}>
                    <div>
                        <p className="font-bold text-white text-base">{isPKL ? "PKL Belum Absen" : "Karyawan Belum Absen"}</p>
                        <p className="text-xs text-white/70 mt-1">{dateLabel} · {absentUsers.length} {modeLabel}</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-white/60 hover:text-white hover:bg-white/20 transition">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
                    {(["ABSENT_CONFIRMED", "LATE_MORNING", "POTENTIALLY_LATE", "WITHIN_TIME", "NO_RECORD"] as const).map(statusKey => {
                        const group = groups[statusKey];
                        if (group.length === 0) return null;
                        const cfg = STATUS_CONFIG[statusKey];

                        return (
                            <div key={statusKey}>
                                <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-xl ${cfg.bg} border ${cfg.border}`}>
                                    <span className="text-sm">{renderStatusEmoji(cfg.icon)}</span>
                                    <div>
                                        <p className={`text-xs font-bold ${cfg.color}`}>{cfg.label} ({group.length})</p>
                                        <p className="text-[10px] text-gray-400">{cfg.desc}</p>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    {group.map(u => (
                                        <div
                                            key={u.userId}
                                            className={`flex items-center justify-between gap-3 bg-white border ${cfg.border} rounded-xl px-3.5 py-3 shadow-sm`}
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${avatarGradient} flex items-center justify-center text-white text-[9px] font-black flex-shrink-0`}>
                                                    {initials(u.name)}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-bold text-gray-800 truncate">{u.name}</p>
                                                    <p className="text-[10px] text-gray-400">{u.role.replace(/_/g, " ")}</p>
                                                    {u.note && (
                                                        <p className="text-[10px] text-blue-500 mt-0.5 truncate">{u.note}</p>
                                                    )}
                                                </div>
                                            </div>
                                            {isAdmin && (
                                                <button
                                                    onClick={() => { onAbsenManual(u.userId); onClose(); }}
                                                    className="flex-shrink-0 text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-[#1a1a2e] hover:text-white hover:border-[#1a1a2e] transition-all"
                                                >
                                                    Absen
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0">
                    <button onClick={onClose} className="w-full h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition">
                        Tutup
                    </button>
                </div>
            </div>
        </div>
    );
}

function AbsentSummaryBanner({ list, mode, onClick }: {
    list: {
        name: string; userId: string;
        attendanceStatus: "LATE_MORNING" | "POTENTIALLY_LATE" | "NO_RECORD" | "ABSENT_CONFIRMED" | "WITHIN_TIME";
    }[];
    mode: "karyawan" | "pkl";
    onClick: () => void;
}) {
    const isPKL = mode === "pkl";
    const wrapBg = isPKL ? "bg-amber-50/10" : "bg-orange-50/10";
    const btnBg = isPKL ? "bg-amber-50 border-amber-200 hover:bg-amber-100" : "bg-orange-50 border-orange-200 hover:bg-orange-100";
    const titleColor = isPKL ? "text-amber-700" : "text-orange-700";
    const subColor = isPKL ? "text-amber-500" : "text-orange-500";
    const avatarGrad = isPKL ? "from-amber-400 to-yellow-500" : "from-orange-400 to-amber-500";
    const arrowColor = isPKL ? "text-amber-400 group-hover:text-amber-600" : "text-orange-400 group-hover:text-orange-600";
    const icon = isPKL ? "graduation-cap" : "alert";
    const label = isPKL ? "PKL" : "Karyawan";

    const confirmed = list.filter(u => u.attendanceStatus === "ABSENT_CONFIRMED").length;
    const late = list.filter(u => u.attendanceStatus === "LATE_MORNING").length;
    const potential = list.filter(u => u.attendanceStatus === "POTENTIALLY_LATE").length;
    const parts: string[] = [];
    if (confirmed > 0) parts.push(`${confirmed} tidak hadir`);
    if (late > 0) parts.push(`${late} absen siang`);
    if (potential > 0) parts.push(`${potential} berpotensi terlambat`);
    const summary = parts.join(" · ") || "Klik untuk detail";

    return (
        <div className={`px-6 pt-3 pb-3 border-b border-gray-50 ${wrapBg}`}>
            <button
                onClick={onClick}
                className={`w-full flex items-center justify-between gap-3 px-4 py-3 border rounded-xl transition-all group ${btnBg}`}
            >
                <div className="flex items-center gap-3">
                    <span className="text-lg">{icon}</span>
                    <div className="text-left">
                        <p className={`text-xs font-bold ${titleColor}`}>
                            {list.length} {label} Belum Absen
                        </p>
                        <p className={`text-[10px] mt-0.5 ${subColor}`}>{summary}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="flex -space-x-1.5">
                        {list.slice(0, 4).map(u => (
                            <div
                                key={u.userId}
                                className={`w-6 h-6 rounded-full bg-gradient-to-br ${avatarGrad} border-2 border-white flex items-center justify-center text-white text-[8px] font-black`}
                                title={u.name}
                            >
                                {initials(u.name)}
                            </div>
                        ))}
                        {list.length > 4 && (
                            <div className="w-6 h-6 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center text-gray-500 text-[8px] font-black">
                                +{list.length - 4}
                            </div>
                        )}
                    </div>
                    <svg className={`w-4 h-4 transition-colors ${arrowColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                </div>
            </button>
        </div>
    );
}

function ShiftScheduleModal({ users, schedules, calYear, calMonth, onClose, onSaved }: {
    users: UserInfo[];
    schedules: ShiftScheduleRow[];   // NEW
    calYear: number; calMonth: number;
    onClose: () => void; onSaved: () => void | Promise<void>;
}) {
    return (
        <ModalShell
            onClose={onClose}
            headerColor="bg-gradient-to-r from-violet-600 to-purple-700"
            title="Jadwal Shift per Tanggal"
            subtitle={`${MONTH_NAMES[calMonth]} ${calYear} · ${users.length} karyawan · ${schedules.length} jadwal aktif`}
            wide
            footer={
                <button onClick={onClose} className="w-full h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-all">
                    Tutup
                </button>
            }
        >
            <div className="overflow-y-auto flex-1 px-6 py-5 bg-[#F7F7F8]">
                <ShiftScheduleTab
                    users={users}
                    schedules={schedules}
                    calYear={calYear}
                    calMonth={calMonth}
                    onSaved={onSaved}
                />
            </div>
        </ModalShell>
    );
}

export default function AttendanceDashboardPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [selectedMonth, setSelectedMonth] = useState<{ year: number; month: number } | null>(() => {
        if (typeof window === "undefined") return null;
        const y = parseInt(searchParams.get("year") ?? "", 10);
        const m = parseInt(searchParams.get("month") ?? "", 10);

        if (!Number.isNaN(y) && !Number.isNaN(m) && y >= 2000 && y <= 2100 && m >= 0 && m <= 11) {
            const today = new Date();
            const isFuture = y > today.getFullYear() || (y === today.getFullYear() && m > today.getMonth());
            if (!isFuture) return { year: y, month: m };
        }
        return null;
    }); const [attendances, setAttendances] = useState<Attendance[]>([]);
    const [checkoutTimes, setCheckoutTimes] = useState<Record<string, string>>({}); // ✅ NEW — key: `${user_id}_${dateKey}` → jam pulang (ISO), buat kolom Jam Pulang
    const [afterOutOvertime, setAfterOutOvertime] = useState<Record<string, { minutes: number; status: string; auditStatus: string }>>({});
    // ✅ NEW — key: `${user_id}_${dateKey}`. Isi: lembur yang SUDAH otomatis
    // kedeteksi sistem dari absen OUT lewat jam pulang.
    const [manualRecords, setManualRecords] = useState<ManualAttendance[]>([]);
    const [dayOffs, setDayOffs] = useState<DayOff[]>([]);
    const [allDateOffs, setAllDateOffs] = useState<DateOff[]>([]);
    const [allDateWorks, setAllDateWorks] = useState<DateWork[]>([]);
    const [showSwapModal, setShowSwapModal] = useState(false);
    const [allUsers, setAllUsers] = useState<UserInfo[]>([]);
    const [salaries, setSalaries] = useState<UserSalary[]>([]);
    const [leaveData, setLeaveData] = useState<UserLeaveData[]>([]);
    const [loading, setLoading] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [filterUser, setFilterUser] = useState("Semua");
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [todayStatus, setTodayStatus] = useState<any>(null);
    const [statusLoading, setStatusLoading] = useState(false);
    type ActiveTab = "calendar" | "summary" | "salary" | "salary-pkl" | "salary-slip" | "salary-history" | "leave" | "my-salary" | "my-slip";

    const VALID_TABS: ActiveTab[] = ["calendar", "summary", "salary", "salary-pkl", "salary-slip", "salary-history", "leave", "my-salary", "my-slip"];

    const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
        const tabFromUrl = searchParams.get("tab");
        return (tabFromUrl && VALID_TABS.includes(tabFromUrl as ActiveTab))
            ? (tabFromUrl as ActiveTab)
            : "calendar";
    });

    const handleSetActiveTab = useCallback((tab: ActiveTab) => {
        setActiveTab(tab);
        const params = new URLSearchParams(searchParams.toString());
        params.set("tab", tab);
        router.replace(`?${params.toString()}`, { scroll: false });
    }, [router, searchParams]);

    // Modal state
    const [showDayOffModal, setShowDayOffModal] = useState(false);
    const [showManualModal, setShowManualModal] = useState(false);
    const [showManualCheckoutModal, setShowManualCheckoutModal] = useState(false);
    const [showEarlyCheckoutModal, setShowEarlyCheckoutModal] = useState(false);
    const [editCheckoutData, setEditCheckoutData] = useState<{ userId: string; userName: string; dateKey: string; currentCheckoutIso: string | null } | null>(null); // ✅ NEW — koreksi jam pulang
    const [pendingEarlyCheckoutCount, setPendingEarlyCheckoutCount] = useState(0); // ✅ NEW — badge jumlah pengajuan izin pulang cepat yang menunggu ACC

    useEffect(() => {
        let mounted = true;
        const fetchPendingCount = async () => {
            try {
                const r = await fetch("/api/attendance/early-checkout?status=PENDING");
                const d = await r.json();
                if (mounted && d.success) setPendingEarlyCheckoutCount((d.data || []).length);
            } catch { /* gagal fetch: biarkan angka lama, jangan direset ke 0 */ }
        };
        fetchPendingCount();
        const interval = setInterval(fetchPendingCount, 60000); // refresh tiap 1 menit
        const onFocus = () => fetchPendingCount(); // refresh begitu kembali dari halaman approval
        window.addEventListener("focus", onFocus);
        return () => { mounted = false; clearInterval(interval); window.removeEventListener("focus", onFocus); };
    }, []); const [showSalaryModal, setShowSalaryModal] = useState(false);
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
    const [attendanceSummaryDetail, setAttendanceSummaryDetail] = useState<AttendanceSummaryDetail | null>(null);
    const [leaveDetail, setLeaveDetail] = useState<{ name: string; dates: string[] } | null>(null);
    const [absentPopupMode, setAbsentPopupMode] = useState<"karyawan" | "pkl" | null>(null);
    const [pklFilterMode, setPklFilterMode] = useState(false);
    const [calendarPklFilter, setCalendarPklFilter] = useState<"all" | "karyawan" | "pkl">("karyawan");
    const [salaryModalPklOnly, setSalaryModalPklOnly] = useState<boolean | undefined>(undefined);
    const [showMonthlyOffModal, setShowMonthlyOffModal] = useState(false);
    const [monthlyOffs, setMonthlyOffs] = useState<MonthlyOff[]>([]);
    const [showShiftScheduleModal, setShowShiftScheduleModal] = useState(false);
    const [sendContractUser, setSendContractUser] = useState<UserInfo | null>(null);
    const [contractDetailUser, setContractDetailUser] = useState<UserInfo | null>(null);
    const [shiftSchedules, setShiftSchedules] = useState<ShiftScheduleRow[]>([]);
    const [shiftConfigs, setShiftConfigs] = useState<any[]>([]);
    const [myOvertimeDirections, setMyOvertimeDirections] = useState<Record<string, Set<string>>>({}); // ✅ NEW
    const [dismissedPastOvertimeDates, setDismissedPastOvertimeDates] = useState<Set<string>>(new Set()); // ✅ NEW

    useEffect(() => {
        if (!currentUser?.id) return;
        const stored = loadResolvedOvertimeDates(currentUser.id);
        if (stored.size === 0) return;
        setDismissedPastOvertimeDates(prev => {
            const merged = new Set(prev);
            stored.forEach(d => merged.add(d));
            return merged;
        });
    }, [currentUser?.id]);

    const markOvertimeDateResolved = useCallback((dateKey: string) => {
        setDismissedPastOvertimeDates(prev => {
            const next = new Set(prev);
            next.add(dateKey);
            if (currentUser?.id) saveResolvedOvertimeDates(currentUser.id, next);
            return next;
        });
    }, [currentUser?.id]);

    const fetchShiftSchedules = useCallback(async (y: number, m: number) => {
        try {
            const r = await fetch(`/api/attendance/shift-schedule?year=${y}&month=${m + 1}`);
            const d = await r.json();
            if (d.success) setShiftSchedules(d.data || []);
        } catch (err) {
            console.error("Failed to fetch shift schedules:", err);
        }
    }, []);

    const fetchShiftConfigs = useCallback(async () => {
        try {
            const r = await fetch("/api/attendance/shift-config");
            const d = await r.json();
            if (d.success) setShiftConfigs(d.data || []);
        } catch (err) {
            console.error("Failed to fetch shift configs:", err);
        }
    }, []);

    const fetchAttendance = useCallback(async () => {
        const r = await fetch("/api/attendance");
        const d = await r.json();
        if (!d.success) return;
        const rows: Attendance[] = d.data || [];
        // ✅ FIX: pisahkan absen PULANG (direction OUT) dari absen masuk — OUT
        // gak boleh ikut masuk ke `attendances`, karena seluruh logic status/
        // kalender/gaji di bawah berasumsi "1 baris = 1 kedatangan (IN)".
        const inRows = rows.filter(a => a.direction !== "OUT");
        const outRows = rows.filter(a => a.direction === "OUT");

        setAttendances(inRows.map((a) => ({ ...a, displayStatus: getDisplayStatus(a), source: "AUTO" })));

        const co: Record<string, string> = {};
        outRows.forEach(a => {
            const key = `${a.user_id}_${toWIBDateKey(a.check_in_time || a.created_at)}`;
            co[key] = a.check_in_time || a.created_at;
        });
        setCheckoutTimes(co);
    }, []);

    const fetchAfterOutOvertime = useCallback(async (year: number, month: number) => {
        try {
            const r = await fetch(`/api/attendance/overtime?year=${year}&month=${month + 1}`);
            const d = await r.json();
            if (!d.success) return;
            const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
            const map: Record<string, { minutes: number; status: string; auditStatus: string }> = {};
            (d.data || []).forEach((o: any) => {
                if (o.direction !== "AFTER_OUT") return;
                if (!o.request_date?.startsWith(monthPrefix)) return;
                map[`${o.user_id}_${o.request_date}`] = {
                    minutes: o.duration_minutes ?? 0,
                    status: o.status,
                    auditStatus: o.audit_status,
                };
            });
            setAfterOutOvertime(map);
        } catch { }
    }, []);

    const fetchMyOvertimeDirections = useCallback(async (year: number, month: number, myUserId?: string) => {
        if (!myUserId) { setMyOvertimeDirections({}); return; }
        try {
            const r = await fetch(`/api/attendance/overtime?year=${year}&month=${month + 1}`);
            const d = await r.json();
            if (!d.success) return;
            const map: Record<string, Set<string>> = {};
            (d.data || []).forEach((o: any) => {
                if (o.user_id !== myUserId) return;
                if (o.status === "REJECTED" || o.status === "CANCELLED") return; // boleh diajukan ulang
                if (!o.direction || o.direction === "MANUAL") return;
                if (!map[o.request_date]) map[o.request_date] = new Set();
                map[o.request_date].add(o.direction);
            });
            setMyOvertimeDirections(map);
        } catch { }
    }, []);

    useEffect(() => {
        if (!selectedMonth) return;
        fetchAfterOutOvertime(selectedMonth.year, selectedMonth.month);
        fetchMyOvertimeDirections(selectedMonth.year, selectedMonth.month, currentUser?.id);
    }, [selectedMonth, fetchAfterOutOvertime, fetchMyOvertimeDirections, currentUser?.id]);
    const fetchManualRecords = useCallback(async (y: number, m: number) => {
        const r = await fetch(`/api/attendance/manual?year=${y}&month=${m + 1}`);
        const d = await r.json();
        if (d.success) setManualRecords(d.data || []);
    }, []);
    const fetchDayOffs = useCallback(async () => { const r = await fetch("/api/attendance/day-off"); const d = await r.json(); if (d.success) setDayOffs(d.data || []); }, []);
    const fetchAllDateOffs = useCallback(async () => { const r = await fetch("/api/attendance/date-off"); const d = await r.json(); if (d.success) setAllDateOffs(d.data || []); }, []);
    const fetchAllDateWorks = useCallback(async () => {
        const r = await fetch("/api/attendance/date-work");
        const d = await r.json();
        if (d.success) setAllDateWorks(d.data || []);
    }, []);
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
    const fetchLeaveData = useCallback(async (y: number, m: number) => {
        const r = await fetch(`/api/attendance/leave?year=${y}&month=${m + 1}`);
        const d = await r.json();
        if (d.success) {
            const raw = d.data;
            console.log("[fetchLeaveData] raw response:", raw); //  sementara, buat ngecek shape asli — boleh dihapus setelah dicek
            setLeaveData(Array.isArray(raw) ? raw : raw ? [raw] : []);
        }
    }, []);
    const fetchAllowances = useCallback(async (y: number, m: number) => {
        const r = await fetch(`/api/attendance/allowances?year=${y}&month=${m + 1}`);
        const d = await r.json();
        if (d.success) setAllowances(d.data || []);
    }, []);

    const fetchMonthlyOffs = useCallback(async (y: number, m: number) => {
        try {
            const r = await fetch(`/api/attendance/monthly-off?year=${y}&month=${m + 1}`);
            const d = await r.json();
            if (d.success) setMonthlyOffs(d.data || []);
        } catch (err) {
            console.error("Failed to fetch monthly offs:", err);
        }
    }, []);

    const fetchOvertimeTotal = useCallback(async (y: number, m: number) => {
        try {
            const r = await fetch(`/api/attendance/overtime?year=${y}&month=${m + 1}&status=COMPLETED,NEED_PROOF`);
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
    const [slipPklFilter, setSlipPklFilter] = useState<"all" | "karyawan" | "pkl">("karyawan");
    const sortedSalarySlips = useMemo(() => {
        return [...salarySlips].sort((a, b) => {
            const nameA = a.users?.name ?? "";
            const nameB = b.users?.name ?? "";
            return nameA.localeCompare(nameB, "id");
        });
    }, [salarySlips]);

    const visibleSalarySlips = useMemo(() => {
        if (slipPklFilter === "all") return sortedSalarySlips;
        return sortedSalarySlips.filter(s => {
            const isPkl = isPKLRole(s.users?.role);
            return slipPklFilter === "pkl" ? isPkl : !isPkl;
        });
    }, [sortedSalarySlips, slipPklFilter]);

    const [mySlips, setMySlips] = useState<SalarySlip[]>([]);
    const [mySlipsLoading, setMySlipsLoading] = useState(false);

    const fetchMySlips = useCallback(async () => {
        setMySlipsLoading(true);
        try {
            const r = await fetch("/api/attendance/salary-slip");
            const d = await r.json();
            if (d.success) setMySlips(d.data || []);
        } catch (err) {
            console.error("Failed to fetch my slips:", err);
        } finally {
            setMySlipsLoading(false);
        }
    }, []);
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
                checkedIn: d.checkedIn ?? false,
                checkedOut: d.checkedOut ?? false,
                needsCheckout: d.needsCheckout ?? false,
                checkoutAt: d.checkoutAt,
                isEarlyCheckout: d.isEarlyCheckout ?? false,
                earlyCheckoutStatus: d.earlyCheckoutStatus ?? "NONE",
                overtimeOptions: d.overtimeOptions ?? null, // ✅ NEW
                isManualCheckIn: d.isManualCheckIn ?? false, // ✅ NEW
                manualCheckInByName: d.manualCheckInByName ?? null, // ✅ NEW
            });
        } catch { }
        finally { setStatusLoading(false); }
    }, []);
    useEffect(() => { getCurrentUserClient().then(u => setCurrentUser(u)); fetchTodayStatus(); }, []);

    useEffect(() => {
        if (!selectedMonth) return;
        fetchOvertimeTotal(selectedMonth.year, selectedMonth.month);
        fetchAllowances(selectedMonth.year, selectedMonth.month);
    }, [selectedMonth, fetchOvertimeTotal, fetchAllowances]);

    useEffect(() => {
        if (canViewSalary(currentUser?.role)) {
            fetchSalaryHistory();
        }
    }, [currentUser, fetchSalaryHistory]);

    useEffect(() => {
        getCurrentUserClient().then(u => {
            setCurrentUser(u);
            if (u && !isAdminRole(u.role)) {

            }
        });
        fetchTodayStatus();
    }, []);

    useEffect(() => {
        if (!selectedMonth) return;
        const { year, month } = selectedMonth;
        setLoading(true);
        const tasks: Promise<any>[] = [
            fetchAttendance(),
            fetchDayOffs(),
            fetchAllDateOffs(),
            fetchAllDateWorks(),
            fetchMonthlyOffs(year, month),
            fetchManualRecords(year, month),
            fetchAllUsers(),
            fetchSalaries(),
            fetchAllowances(year, month),
            fetchLeaveData(year, month),
            fetchShiftSchedules(year, month),
            fetchShiftConfigs(),
        ];
        Promise.all(tasks).finally(() => setLoading(false));
    }, [
        selectedMonth,
        fetchAttendance,
        fetchDayOffs,
        fetchAllDateOffs,
        fetchAllDateWorks,
        fetchMonthlyOffs,
        fetchManualRecords,
        fetchAllUsers,
        fetchSalaries,
        fetchAllowances,
        fetchLeaveData,
        fetchShiftSchedules,
        fetchShiftConfigs,
    ]);

    useEffect(() => {
        if (userCanViewSalary(currentUser)) {
            fetchSalarySlips(selectedSlipMonth.year, selectedSlipMonth.month);
        }
        if (!userIsAdmin(currentUser) && currentUser?.id) {
            fetchMySlips();
        }
    }, [selectedSlipMonth, currentUser, fetchSalarySlips]);

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

    // silent = true -> refetch data tanpa toggle `loading`, jadi UI tidak "berkedip"
    const refreshAll = useCallback(async (silent: boolean = false) => {
        if (!selectedMonth) return;
        const { year, month } = selectedMonth;
        if (!silent) setLoading(true);
        const tasks: Promise<any>[] = [
            fetchAttendance(),
            fetchDayOffs(),
            fetchAllDateOffs(),
            fetchAllDateWorks(),
            fetchMonthlyOffs(year, month),
            fetchManualRecords(year, month),
            fetchAllUsers(),
            fetchSalaries(),
            fetchAllowances(year, month),
            fetchLeaveData(year, month),
            fetchShiftSchedules(year, month),
            fetchShiftConfigs(),
        ];
        await Promise.all(tasks).finally(() => { if (!silent) setLoading(false); });
        if (userCanViewSalary(currentUser)) {
            fetchSalarySlips(year, month);
        }
    }, [selectedMonth, fetchAttendance, fetchDayOffs, fetchAllDateOffs, fetchManualRecords, fetchAllUsers, fetchSalaries, fetchAllowances, fetchLeaveData, fetchShiftSchedules, fetchShiftConfigs, fetchSalarySlips, currentUser]);
    // ── Derived ───────────────────────────────────────────────────────────────
    const dayOffByName = useMemo(() => { const m: Record<string, Set<number>> = {}; dayOffs.forEach(d => { const n = d.users?.name; if (!n) return; if (!m[n]) m[n] = new Set(); m[n].add(d.day_of_week); }); return m; }, [dayOffs]);
    const dateOffByName = useMemo(() => { const m: Record<string, Set<string>> = {}; allDateOffs.forEach(d => { const n = d.users?.name; if (!n) return; if (!m[n]) m[n] = new Set(); m[n].add(d.off_date); }); return m; }, [allDateOffs]);

    const dateWorkByName = useMemo(() => {
        const m: Record<string, Set<string>> = {};
        allDateWorks.forEach(d => {
            const n = d.users?.name;
            if (!n) return;
            if (!m[n]) m[n] = new Set();
            m[n].add(d.work_date);
        });
        return m;
    }, [allDateWorks]);

    const monthlyOffByName = useMemo(() => {
        const m: Record<string, Set<string>> = {};
        monthlyOffs.forEach(o => {
            const uInfo = allUsers.find(u => u.id === o.user_id);
            if (!uInfo) return;
            if (!m[uInfo.name]) m[uInfo.name] = new Set();
            m[uInfo.name].add(o.off_date);
        });
        return m;
    }, [monthlyOffs, allUsers]);

    const monthlyOffNoteByName = useMemo(() => {
        const m: Record<string, Record<string, string>> = {};
        monthlyOffs.forEach(o => {
            const uInfo = allUsers.find(u => u.id === o.user_id);
            if (!uInfo || !o.notes) return;
            if (!m[uInfo.name]) m[uInfo.name] = {};
            m[uInfo.name][o.off_date] = o.notes;
        });
        return m;
    }, [monthlyOffs, allUsers]);

    const isDayOffForUser = (name: string, dk: string) => {
        if (monthlyOffByName[name]?.has(dk)) return true;
        if (dateWorkByName[name]?.has(dk)) return false;
        const dow = new Date(dk + "T12:00:00").getDay();
        return (dayOffByName[name]?.has(dow) ?? false) || (dateOffByName[name]?.has(dk) ?? false);
    };

    const getOffUsersForDate = (dk: string) => {
        const dow = new Date(dk + "T12:00:00").getDay();
        const w = Object.entries(dayOffByName).filter(([, s]) => s.has(dow)).map(([n]) => n);
        const s = Object.entries(dateOffByName).filter(([, s]) => s.has(dk)).map(([n]) => n);
        const mo = Object.entries(monthlyOffByName).filter(([, s]) => s.has(dk)).map(([n]) => n);
        return [...new Set([...w, ...s, ...mo])];
    };
    const roleByName = useMemo(() => {
        const m: Record<string, string> = {};
        allUsers.forEach(u => { m[u.name] = u.role; });
        return m;
    }, [allUsers]);

    const getOffDetailForDate = (dk: string): { name: string; role: string; reason: string }[] => {
        const dow = new Date(dk + "T12:00:00").getDay();
        const allowed = new Set(allUsers.map(u => u.name));
        const seen = new Set<string>();
        const result: { name: string; role: string; reason: string }[] = [];

        const add = (name: string | null | undefined, reason: string) => {
            if (!name || seen.has(name)) return;
            if (allUsers.length > 0 && !allowed.has(name)) return;
            if (dateWorkByName[name]?.has(dk)) return;
            seen.add(name);
            result.push({ name, role: roleByName[name] ?? "", reason });
        };

        Object.entries(monthlyOffByName).forEach(([name, dates]) => { if (dates.has(dk)) add(name, monthlyOffNoteByName[name]?.[dk] || "Libur Bulanan"); });
        Object.entries(dayOffByName).forEach(([name, dows]) => { if (dows.has(dow)) add(name, "Libur Mingguan"); });
        Object.entries(dateOffByName).forEach(([name, dates]) => { if (dates.has(dk)) add(name, "Libur / Tukar"); });
        leaveData.forEach(ld => {
            const uid = ld?.user?.id;
            if (!uid || !ld?.requests?.some(r => r.leave_date === dk)) return;
            // Absen manual non-LEAVE menimpa status cuti basi (Cuti → Izin/Sakit/dll)
            const mr = manualMap[`${uid}_${dk}`];
            if (mr && mr.status !== "LEAVE") return;
            add(ld?.user?.name, "Cuti");
        });

        return result.sort((a, b) => a.name.localeCompare(b.name, "id"));
    };
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
        const todayWIB = getWIBToday();
        const manualExtra: Attendance[] = manualRecords
            .filter(mr => {
                const inAuto = auto.some(a => (a.user_id ?? "") === mr.user_id && toWIBDateKey(a.check_in_time || a.created_at) === mr.attendance_date);
                return !inAuto;
            })
            .map(mr => {
                const isPresentOrLate = mr.status === "PRESENT" || mr.status === "LATE";
                const hasCheckout = !!checkoutTimes[`${mr.user_id}_${mr.attendance_date}`];
                const noCheckoutPenalty = isPresentOrLate
                    && mr.attendance_date >= CHECKOUT_REQUIRED_FROM
                    && mr.attendance_date < todayWIB
                    && !hasCheckout;
                return {
                    id: mr.id, user_id: mr.user_id,
                    user_name: mr.users?.name || (mr.user_id === currentUser?.id ? currentUser?.name : null) || "Unknown",
                    user_role: mr.users?.role || (mr.user_id === currentUser?.id ? currentUser?.role : "") || "",
                    user_shift: (mr.users?.shift as "PAGI" | "SORE") || "PAGI",
                    date: mr.check_in_time, check_in_time: mr.check_in_time, status: mr.status, method: "MANUAL",
                    latitude: null, longitude: null, accuracy: null, device: "Manual entry", ip_address: "", face_distance: null, created_at: mr.check_in_time,
                    displayStatus: (noCheckoutPenalty ? "SKIP" : mr.status === "PRESENT" ? "PRESENT" : mr.status === "LATE" ? "LATE" : "SKIP") as "PRESENT" | "LATE" | "SKIP",
                    source: "MANUAL" as const,
                };
            });
        return [...auto, ...manualExtra];
    }, [attendances, manualRecords, currentUser, checkoutTimes]);

    const thisMonthKey = `${calYear}-${pad2(calMonth + 1)}`;
    const thisMonthAtt = mergedAttendances.filter(a => toWIBDateKey(a.check_in_time || a.created_at).startsWith(thisMonthKey));

    const byDate = useMemo(() => {
        const m: Record<string, Attendance[]> = {};

        let filtered = filterUser === "Semua" ? mergedAttendances : mergedAttendances.filter(a => a.user_name === filterUser);

        if (isAdminRole(currentUser?.role) && filterUser === "Semua" && calendarPklFilter !== "all") {
            filtered = filtered.filter(a => {
                const uInfo = allUsers.find(u => u.name === a.user_name);
                if (calendarPklFilter === "pkl") return uInfo ? isPKLRole(uInfo.role) : false;
                return uInfo ? !isPKLRole(uInfo.role) : true;
            });
        }

        filtered.forEach(a => { const k = toWIBDateKey(a.check_in_time || a.created_at); if (!m[k]) m[k] = []; m[k].push(a); });
        return m;
    }, [mergedAttendances, filterUser, currentUser?.role, calendarPklFilter, allUsers]);

    const calDays = useMemo(() => {
        const fd = new Date(calYear, calMonth, 1).getDay(), dim = new Date(calYear, calMonth + 1, 0).getDate();
        const c: (number | null)[] = []; for (let i = 0; i < fd; i++)c.push(null); for (let d = 1; d <= dim; d++)c.push(d); return c;
    }, [calYear, calMonth]);

    const todayKey = getWIBToday();
    const uniqueUsers = useMemo(() => { if (allUsers.length > 0) return allUsers.map(u => u.name).sort(); return [...new Set(mergedAttendances.map(a => a.user_name))].sort(); }, [allUsers, mergedAttendances]);
    const salaryMap = useMemo(() => { const m: Record<string, UserSalary> = {}; salaries.forEach(s => m[s.user_id] = s); return m; }, [salaries]);

    // Shift efektif per (user, tanggal): jadwal > shift user > PAGI
    const schedulesByUser = useMemo(() => {
        const m: Record<string, ShiftScheduleRow[]> = {};
        shiftSchedules.forEach(s => { (m[s.user_id] ??= []).push(s); });
        return m;
    }, [shiftSchedules]);

    const configsByUser = useMemo(() => {
        const m: Record<string, any> = {};
        shiftConfigs.forEach(c => { m[c.user_id] = c; });
        return m;
    }, [shiftConfigs]);

    const effectiveShiftFor = useCallback((userId: string, dk: string) => {
        const sched = pickSchedule(schedulesByUser[userId] ?? [], dk);
        const cfg = configsByUser[userId];
        const userBaseShift = (allUsers.find(u => u.id === userId)?.shift ?? "PAGI") as "PAGI" | "SORE";

        let shift: "PAGI" | "SORE" = userBaseShift;
        let fromSchedule = false;
        let openMin: number | null = null;
        let lateMin: number | null = null;
        let closeMin: number | null = null;
        let checkoutMin: number | null = null; // ✅ NEW — jam pulang resmi, TERPISAH dari closeMin (batas absen ditutup)

        if (sched) {
            fromSchedule = true;
            shift = sched.shift;
            if (sched.open_hour != null) {
                openMin = sched.open_hour * 60 + (sched.open_minute ?? 0);
            }
            if (sched.late_hour != null) {
                lateMin = sched.late_hour * 60 + (sched.late_minute ?? 0);
            }
            if (sched.close_hour != null) {
                closeMin = sched.close_hour * 60 + (sched.close_minute ?? 0);
            }
            if (sched.checkout_hour != null) { // ✅ NEW
                checkoutMin = sched.checkout_hour * 60 + (sched.checkout_minute ?? 0);
            }
        }

        if (cfg) {
            if (!sched) {
                shift = (cfg.shift ?? userBaseShift) as "PAGI" | "SORE";
            }
            if (openMin == null && cfg.open_hour != null) {
                openMin = cfg.open_hour * 60 + (cfg.open_minute ?? 0);
            }
            if (lateMin == null && cfg.late_hour != null) {
                lateMin = cfg.late_hour * 60 + (cfg.late_minute ?? 0);
            }
            if (closeMin == null && cfg.close_hour != null) {
                closeMin = cfg.close_hour * 60 + (cfg.close_minute ?? 0);
            }
            if (checkoutMin == null && cfg.checkout_hour != null) { // ✅ NEW
                checkoutMin = cfg.checkout_hour * 60 + (cfg.checkout_minute ?? 0);
            }
        }

        const base = SHIFT_DEFAULTS[shift] ?? SHIFT_DEFAULTS.PAGI;
        if (openMin == null) openMin = base.open_hour * 60 + base.open_minute;
        if (lateMin == null) lateMin = base.late_hour * 60 + base.late_minute;
        if (closeMin == null) closeMin = base.close_hour * 60 + base.close_minute;
        if (checkoutMin == null) checkoutMin = base.checkout_hour * 60 + base.checkout_minute; // ✅ NEW

        const defOpenMin = base.open_hour * 60 + base.open_minute;
        const defLateMin = base.late_hour * 60 + base.late_minute;
        const defCloseMin = base.close_hour * 60 + base.close_minute;
        const defCheckoutMin = base.checkout_hour * 60 + base.checkout_minute; // ✅ NEW

        const isCustom = openMin !== defOpenMin || lateMin !== defLateMin || closeMin !== defCloseMin || checkoutMin !== defCheckoutMin;

        return {
            shift,
            fromSchedule,
            isCustom,
            open: openMin,
            late: lateMin,
            close: closeMin,
            checkout: checkoutMin, // ✅ NEW — pakai INI buat hitung lembur akhir, JANGAN pakai `close`
        };
    }, [schedulesByUser, configsByUser, allUsers]);

    // ✅ NEW — daftar tanggal LALU (sebelum hari ini) milik user yang sedang
    // login yang masih berpotensi lembur (masuk lebih awal / pulang lebih
    // larut / lembur hari libur) tapi belum diajukan / belum ditandai
    // "Tidak Mau Lembur". Dipakai PastOvertimeOpportunitiesCard supaya tombol
    // ajukan lembur tetap bisa diakses walau harinya sudah lewat.
    const myPastOvertimeOpportunities = useMemo(() => {
        if (!currentUser?.id || !selectedMonth) return [];
        const dim = new Date(calYear, calMonth + 1, 0).getDate();
        const userStartDate = getUserStartDate(currentUser.created_at, calYear, calMonth);
        const results: { date: string; options: { beforeInMinutes: number; afterOutMinutes: number; holidayMinutes: number }; isDayOff: boolean; already: Set<string> }[] = [];

        for (let d = 1; d <= dim; d++) {
            const dk = `${calYear}-${pad2(calMonth + 1)}-${pad2(d)}`;
            if (dk >= todayKey) continue; // hanya tanggal yang sudah lewat
            if (dk < userStartDate) continue;
            if (dismissedPastOvertimeDates.has(dk)) continue;

            const myAtt = attendances.find(a => a.user_id === currentUser.id && toWIBDateKey(a.check_in_time || a.created_at) === dk);
            const myManual = manualMap[`${currentUser.id}_${dk}`];
            const checkInISO = myAtt
                ? (myAtt.check_in_time || myAtt.created_at)
                : (myManual && (myManual.status === "PRESENT" || myManual.status === "LATE") ? myManual.check_in_time : null);
            if (!checkInISO) continue;

            const checkoutISO = checkoutTimes[`${currentUser.id}_${dk}`] ?? null;
            const isOff = isDayOffForUser(currentUser.name, dk);
            const eff = effectiveShiftFor(currentUser.id, dk);
            const schedule = {
                lateFrom: { h: Math.floor(eff.late / 60), m: eff.late % 60 },
                checkout: { h: Math.floor(eff.checkout / 60), m: eff.checkout % 60 }, // ✅ FIX — sebelumnya salah pakai eff.close (batas absen ditutup)
            };

            let beforeInMinutes = 0, afterOutMinutes = 0, holidayMinutes = 0;
            if (isOff) {
                if (checkoutISO) holidayMinutes = computeHolidayOvertimeMinutes(checkInISO, checkoutISO);
            } else {
                beforeInMinutes = computeBeforeInOvertimeMinutes(checkInISO, schedule);
                if (checkoutISO) afterOutMinutes = computeAfterOutOvertimeMinutes(checkoutISO, schedule);
            }
            if (beforeInMinutes <= 0 && afterOutMinutes <= 0 && holidayMinutes <= 0) continue;

            const already = myOvertimeDirections[dk] ?? new Set<string>();
            if (already.size > 0) continue;

            results.push({ date: dk, options: { beforeInMinutes, afterOutMinutes, holidayMinutes }, isDayOff: isOff, already });
        }
        return results.sort((a, b) => b.date.localeCompare(a.date));
    }, [currentUser, selectedMonth, calYear, calMonth, attendances, manualMap, checkoutTimes, isDayOffForUser, effectiveShiftFor, myOvertimeDirections, dismissedPastOvertimeDates, todayKey]);

    const userSummary = useMemo(() => {
        type UserStat = {
            name: string; present: number; late: number; score: number;
            leave: number; leaveDates: string[];
            pastWorkdays: number; totalWorkdays: number; pct: number;
            remainingDays: number; userId: string;
            absences: AbsenceItem[]; offDates: string[];
            holidayWorkDates: string[];
        };

        const todayWIB = getWIBToday();
        const isCurrentMonth = thisMonthKey === todayWIB.slice(0, 7);
        const dim = new Date(calYear, calMonth + 1, 0).getDate();

        const effByName: Record<string, Record<string, "PRESENT" | "LATE" | "ABSENT">> = {};
        const setEff = (name: string, date: string, status: "PRESENT" | "LATE" | "ABSENT") => {
            if (!effByName[name]) effByName[name] = {};
            effByName[name][date] = status;
        };

        // ✅ NEW — tanggal yang kena penalti "tidak absen pulang" dicatat terpisah,
        // supaya reason di `absences` nanti bisa dibedakan jadi "NO_CHECKOUT"
        // (bukan "ALPHA"/Tanpa Keterangan yang generik).
        const noCheckoutByName: Record<string, Set<string>> = {};

        thisMonthAtt.forEach(a => {
            if (a.source !== "AUTO") return;
            const dk = toWIBDateKey(a.check_in_time || a.created_at);
            const hasCheckout = !!checkoutTimes[`${a.user_id}_${dk}`];
            // ✅ FIX: penalti "tidak absen pulang" cuma berlaku untuk tanggal yang SUDAH LEWAT
            // (dk < todayWIB). Untuk HARI INI, jam kerja mungkin belum selesai — jadi jangan
            // langsung dianggap ABSENT, biarkan status PRESENT/LATE dari absen masuk tetap dipakai.
            const noCheckoutPenalty = dk >= CHECKOUT_REQUIRED_FROM && dk < todayWIB && !hasCheckout;
            if (noCheckoutPenalty) {
                if (!noCheckoutByName[a.user_name]) noCheckoutByName[a.user_name] = new Set();
                noCheckoutByName[a.user_name].add(dk);
            }
            setEff(a.user_name, dk,
                noCheckoutPenalty ? "ABSENT"
                    : a.displayStatus === "PRESENT" ? "PRESENT" : a.displayStatus === "LATE" ? "LATE" : "ABSENT");
        });
        const manualByName: Record<string, Record<string, ManualAttendance>> = {};
        manualRecords.forEach(mr => {

            const name = mr.users?.name ?? (mr.user_id === currentUser?.id ? currentUser?.name : null);
            if (!name || !mr.attendance_date.startsWith(thisMonthKey)) return;
            if (!manualByName[name]) manualByName[name] = {};
            manualByName[name][mr.attendance_date] = mr;

            const isPresentOrLate = mr.status === "PRESENT" || mr.status === "LATE";
            const hasCheckout = !!checkoutTimes[`${mr.user_id}_${mr.attendance_date}`];
            const noCheckoutPenalty = isPresentOrLate
                && mr.attendance_date >= CHECKOUT_REQUIRED_FROM
                && mr.attendance_date < todayWIB
                && !hasCheckout;

            if (noCheckoutPenalty) {
                if (!noCheckoutByName[name]) noCheckoutByName[name] = new Set();
                noCheckoutByName[name].add(mr.attendance_date);
            }

            setEff(name, mr.attendance_date,
                noCheckoutPenalty ? "ABSENT"
                    : mr.status === "PRESENT" ? "PRESENT" : mr.status === "LATE" ? "LATE" : "ABSENT");
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
            const userId = userIdByName[name] ?? "";

            // Cari created_at user ini
            const userInfo = allUsers.find(u => u.id === userId);
            const userStartDate = getUserStartDate(userInfo?.created_at, calYear, calMonth);

            const userLeaveSet = new Set<string>(
                (leaveData.find(ld => ld?.user?.id === userId)?.requests ?? [])
                    .map(r => r.leave_date)
            );
            Object.entries(manualByName[name] ?? {}).forEach(([date, mr]) => {
                if (mr.status === "LEAVE") userLeaveSet.add(date);
                else userLeaveSet.delete(date);
            });

            let present = 0, late = 0, score = 0, leave = 0;
            const absences: AbsenceItem[] = [];
            const offDates: string[] = [];
            const leaveDates: string[] = [];
            const holidayWorkDates: string[] = [];
            let totalWorkdays = 0;
            let pastWorkdays = 0;

            for (let d = 1; d <= dim; d++) {
                const dk = `${calYear}-${pad2(calMonth + 1)}-${pad2(d)}`;

                const beforeStart = dk < userStartDate;
                const hasManual = !!manualByName[name]?.[dk];
                if (beforeStart && !hasManual) continue;

                const dow = new Date(dk + "T12:00:00").getDay();

                const isDateWork = allDateWorks.some(dw => dw.user_id === userId && dw.work_date === dk);
                const isMonthlyOff = monthlyOffByName[name]?.has(dk) ?? false;
                const isWeeklyOff = dows.has(dow) && !isDateWork;
                const isDateOff = offs.has(dk) && !isDateWork;
                const isLeave = userLeaveSet.has(dk);
                const isScheduledOff = isMonthlyOff || isWeeklyOff || isDateOff;
                const isPastOrToday = !(isCurrentMonth && dk > todayWIB);


                if (isLeave && !isScheduledOff) {
                    totalWorkdays++;
                    if (isPastOrToday) {
                        pastWorkdays++;
                        leave++;
                        score += 1;
                        leaveDates.push(dk);
                    }
                    continue;
                }

                if (isScheduledOff) {
                    const effOnOff = effByName[name]?.[dk];
                    if (isPastOrToday && (effOnOff === "PRESENT" || effOnOff === "LATE")) {
                        holidayWorkDates.push(dk);
                        continue;
                    }
                    if (isPastOrToday) offDates.push(dk);
                    continue;
                }

                totalWorkdays++;
                if (!isPastOrToday) continue;

                pastWorkdays++;
                const eff = effByName[name]?.[dk];
                if (eff === "PRESENT") { present++; score += 1; }
                else if (eff === "LATE") { late++; score += 0.5; }
                else {
                    const mr = manualByName[name]?.[dk];
                    const isNoCheckout = noCheckoutByName[name]?.has(dk) ?? false;
                    absences.push({
                        date: dk,
                        reason: isNoCheckout ? "NO_CHECKOUT" : ((mr?.status as AbsenceReason) ?? "ALPHA"),
                        note: mr?.notes ?? null,
                    });
                }
            }

            const pct = totalWorkdays > 0 ? Math.min(100, (score / totalWorkdays) * 100) : 0;

            const resolvedUserId = userIdByName[name] ??
                Object.entries(manualByName[name] || {})
                    .map(([_, rec]) => rec.user_id)
                    .filter(Boolean)[0] ??
                "";

            result.push({
                name, present, late, score, leave, leaveDates, pastWorkdays, totalWorkdays, pct,
                remainingDays: totalWorkdays - pastWorkdays,
                userId: resolvedUserId,
                absences, offDates,
                holidayWorkDates,
            });
        });

        return result.sort((a, b) => a.name.localeCompare(b.name, "id"));
    }, [thisMonthAtt, manualRecords, dayOffByName, dateOffByName, monthlyOffByName, calYear, calMonth, allUsers, thisMonthKey, currentUser, allDateWorks, leaveData, checkoutTimes]);

    const thisMonthPresent = thisMonthAtt.filter(a => a.displayStatus === "PRESENT" && !isDayOffForUser(a.user_name, toWIBDateKey(a.check_in_time || a.created_at))).length;
    const thisMonthLate = thisMonthAtt.filter(a => a.displayStatus === "LATE" && !isDayOffForUser(a.user_name, toWIBDateKey(a.check_in_time || a.created_at))).length;
    const thisMonthDays = new Set(thisMonthAtt.filter(a => !isDayOffForUser(a.user_name, toWIBDateKey(a.check_in_time || a.created_at))).map(a => toWIBDateKey(a.check_in_time || a.created_at))).size;

    const selectedAttendances = selectedDate
        ? [...(byDate[selectedDate] || [])].sort((a, b) =>
            a.user_name.localeCompare(b.user_name, "id-ID", { sensitivity: "base" })
        )
        : [];

    const selectedPresentCount = selectedAttendances.filter(a => a.displayStatus === "PRESENT" && !isDayOffForUser(a.user_name, selectedDate ?? "")).length;
    const selectedLateCount = selectedAttendances.filter(a => a.displayStatus === "LATE" && !isDayOffForUser(a.user_name, selectedDate ?? "")).length;
    const selectedHolidayWorkCount = selectedAttendances.filter(a => isDayOffForUser(a.user_name, selectedDate ?? "")).length;

    const selectedOffDetail = selectedDate ? getOffDetailForDate(selectedDate) : [];

    const selectedAbsentUsers = useMemo(() => {
        if (!selectedDate) return [];

        const dow = new Date(selectedDate + "T12:00:00").getDay();
        type AbsentUserEntry = {
            name: string;
            role: string;
            userId: string;
            reason: "ALPHA" | "ABSENT" | "SICK" | "PERMIT" | "LEAVE";
            note: string | null;
            attendanceStatus: "LATE_MORNING" | "POTENTIALLY_LATE" | "NO_RECORD" | "ABSENT_CONFIRMED" | "WITHIN_TIME";
        };
        const result: AbsentUserEntry[] = [];

        allUsers.forEach(u => {
            const userStartDate = getUserStartDate(u.created_at, calYear, calMonth);
            if (selectedDate < userStartDate) return;

            if (isDayOffForUser(u.name, selectedDate)) return;

            const hasAttendance = mergedAttendances.some(a => {
                const dk = toWIBDateKey(a.check_in_time || a.created_at);
                return a.user_id === u.id && dk === selectedDate &&
                    (a.displayStatus === "PRESENT" || a.displayStatus === "LATE");
            });
            if (hasAttendance) return;

            const manualRec = manualMap[`${u.id}_${selectedDate}`];
            if (manualRec && (manualRec.status === "PRESENT" || manualRec.status === "LATE")) return;

            const hasLeave = (!manualRec || manualRec.status === "LEAVE") &&
                leaveData.find(ld => ld?.user?.id === u.id)
                    ?.requests?.some(r => r.leave_date === selectedDate);
            if (hasLeave) return;

            const reason = manualRec?.status as "ABSENT" | "SICK" | "PERMIT" | undefined;

            const nowWIB = new Date(Date.now() + 7 * 60 * 60 * 1000);
            const todayWIB = nowWIB.toISOString().slice(0, 10);
            const isToday = selectedDate === todayWIB;

            let attendanceStatus: AbsentUserEntry["attendanceStatus"] = "NO_RECORD";

            if (isToday) {
                const totalMinNow = nowWIB.getUTCHours() * 60 + nowWIB.getUTCMinutes();
                const times = effectiveShiftFor(u.id, selectedDate); // hormati jadwal

                if (totalMinNow < times.open) {
                    attendanceStatus = "WITHIN_TIME";
                } else if (totalMinNow > times.close) {
                    attendanceStatus = "ABSENT_CONFIRMED";
                } else if (totalMinNow < times.late) {
                    attendanceStatus = "POTENTIALLY_LATE";
                } else {
                    attendanceStatus = "LATE_MORNING";
                }
            } else {
                attendanceStatus = "ABSENT_CONFIRMED";
            }

            result.push({
                name: u.name,
                role: u.role,
                userId: u.id,
                reason: reason ?? "ALPHA",
                note: manualRec?.notes ?? null,
                attendanceStatus,
            });
        });

        return result.sort((a, b) => a.name.localeCompare(b.name, "id"));
    }, [selectedDate, allUsers, mergedAttendances, manualMap, isDayOffForUser, leaveData, calYear, calMonth, effectiveShiftFor]);

    const selectedAbsentKaryawan = useMemo(
        () => selectedAbsentUsers.filter(u => !isPKLRole(u.role)),
        [selectedAbsentUsers]
    );
    const selectedAbsentPKL = useMemo(
        () => selectedAbsentUsers.filter(u => isPKLRole(u.role)),
        [selectedAbsentUsers]
    );

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

            // Tunjangan ikut % kehadiran, KECUALI akun di FULL_ALLOWANCE_USER_IDS —
            // sama persis dengan logic di computeMonthlySalary, biar slip PDF selalu
            // konsisten dengan angka di tabel Rekap Gaji.
            const allowanceFactor = FULL_ALLOWANCE_USER_IDS.includes(userStat.userId)
                ? 1
                : (userStat.pct / 100);
            const allowanceWife =
                Math.round((allow?.allowance_wife || 0) * allowanceFactor) || 0;
            const allowanceChild =
                Math.round((allow?.allowance_child || 0) * allowanceFactor) || 0;

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
                    // Kirim data pre-calculated dari rekapan
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

    // NEW: Generator slip khusus PKL — tanpa tunjangan, kasbon, pensiun.
    // Fallback ke rate harian (PKL_DAILY_RATE / PKL_LATE_RATE) kalau belum ada config gaji,
    // biar nominal di slip PERSIS sama dengan yang tampil di tab Rekap Gaji PKL.
    const generateSlipPKL = useCallback(async (userStat: typeof userSummary[0]) => {
        try {
            const sal = salaryMap[userStat.userId];
            const overtimeAmount = overtimeTotal[userStat.userId] || 0;
            const hasSalaryConfig = !!sal && sal.base_salary > 0;

            const salaryIncome = hasSalaryConfig
                ? (sal!.salary_type === "FIXED"
                    ? sal!.base_salary
                    : userStat.totalWorkdays > 0
                        ? Math.round((sal!.base_salary / userStat.totalWorkdays) * userStat.score)
                        : 0)
                : (userStat.present * PKL_DAILY_RATE) + (userStat.late * PKL_LATE_RATE);

            // PKL: tidak ada tunjangan & tidak ada potongan
            const grossIncome = salaryIncome + overtimeAmount;
            const netSalary = grossIncome;

            const res = await fetch("/api/attendance/salary-slip", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_id: userStat.userId,
                    year: calYear,
                    month: calMonth + 1,
                    salary_type: sal?.salary_type || "FIXED",
                    base_salary: sal?.base_salary || 0,
                    salary_income: salaryIncome,
                    allowance_wife: 0,
                    allowance_child: 0,
                    overtime: overtimeAmount,
                    total_income: grossIncome,
                    deduction_loan: 0,
                    deduction_pension: 0,
                    total_deduction: 0,
                    net_salary: netSalary,
                }),
            });

            const data = await res.json();
            if (!data.success) {
                alert(`Gagal generate slip PKL ${userStat.name}: ${data.message}`);
                return false;
            }
            return true;
        } catch (err) {
            console.error("[generateSlipPKL] error:", err);
            alert("Gagal generate slip PKL. Lihat console untuk detail.");
            return false;
        }
    }, [salaryMap, overtimeTotal, calYear, calMonth]);

    // ✅ NEW — export tabel Rekap Gaji (tab "salary", karyawan non-PKL) ke Excel.
    // Angka dihitung ulang pakai computeMonthlySalary yang sama dengan tabel/footer,
    // jadi tidak ada logic gaji baru — cuma bikin file .xlsx dengan tampilan tabel
    // 2-level header (PENGHASILAN / POTONGAN / TOTAL), mirip struktur tabel di layar.
    const exportSalaryRecapToExcel = useCallback(async () => {
        const filtered = userSummary.filter(u => {
            const uInfo = allUsers.find(au => au.id === u.userId);
            return uInfo ? !isPKLRole(uInfo.role) : true;
        });

        if (filtered.length === 0) {
            alert("Tidak ada data karyawan untuk di-export bulan ini");
            return;
        }

        const workbook = new ExcelJS.Workbook();
        workbook.creator = "Solit 03";
        workbook.created = new Date();
        const sheet = workbook.addWorksheet("Rekap Gaji", {
            views: [{ state: "frozen", xSplit: 2, ySplit: 5 }],
        });

        // Kolom A..K
        const colWidths = [6, 26, 16, 16, 16, 14, 14, 14, 18, 16, 18];
        colWidths.forEach((w, i) => { sheet.getColumn(i + 1).width = w; });

        // ── Baris 1: Judul ──
        sheet.mergeCells("A1:K1");
        const titleCell = sheet.getCell("A1");
        titleCell.value = `REKAP GAJI KARYAWAN — ${MONTH_NAMES[calMonth].toUpperCase()} ${calYear}`;
        titleCell.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
        titleCell.alignment = { vertical: "middle", horizontal: "center" };
        titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4338CA" } };
        sheet.getRow(1).height = 26;

        // ── Baris 2: Subjudul ──
        sheet.mergeCells("A2:K2");
        const subtitleCell = sheet.getCell("A2");
        subtitleCell.value = `Solit 03 · Diexport ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`;
        subtitleCell.font = { italic: true, size: 10, color: { argb: "FF6B7280" } };
        subtitleCell.alignment = { vertical: "middle", horizontal: "center" };
        sheet.getRow(2).height = 18;
        sheet.getRow(3).height = 6; // spacer

        // ── Baris 4-5: Header grup + sub-kolom ──
        sheet.mergeCells("A4:A5");
        sheet.mergeCells("B4:B5");
        sheet.mergeCells("C4:F4"); // Penghasilan
        sheet.mergeCells("G4:H4"); // Potongan
        sheet.mergeCells("I4:K4"); // Total

        const noCell = sheet.getCell("A4"); noCell.value = "No";
        const namaCell = sheet.getCell("B4"); namaCell.value = "Nama Karyawan";
        const penghasilanCell = sheet.getCell("C4"); penghasilanCell.value = "PENGHASILAN";
        const potonganCell = sheet.getCell("G4"); potonganCell.value = "POTONGAN";
        const totalCell = sheet.getCell("I4"); totalCell.value = "TOTAL";

        [noCell, namaCell].forEach(cell => {
            cell.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4338CA" } };
            cell.alignment = { vertical: "middle", horizontal: "center" };
        });

        const groupStyles: Array<[typeof penghasilanCell, string]> = [
            [penghasilanCell, "FF059669"], // hijau — Penghasilan
            [potonganCell, "FFDC2626"],    // merah — Potongan
            [totalCell, "FF2563EB"],       // biru — Total
        ];
        groupStyles.forEach(([cell, color]) => {
            cell.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
            cell.alignment = { vertical: "middle", horizontal: "center" };
        });

        const subHeaderLabels = ["Gaji Pokok", "Tunjangan Istri", "Tunjangan Anak", "Lemburan", "Kasbon", "Pensiun", "Gross", "Total Potongan", "Gaji Bersih (Net)"];
        subHeaderLabels.forEach((label, i) => {
            const cell = sheet.getCell(5, i + 3); // mulai kolom C
            cell.value = label;
            cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6366F1" } };
            cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        });

        sheet.getRow(4).height = 20;
        sheet.getRow(5).height = 28;

        for (let r = 4; r <= 5; r++) {
            for (let c = 1; c <= 11; c++) {
                sheet.getCell(r, c).border = {
                    top: { style: "thin", color: { argb: "FFFFFFFF" } },
                    left: { style: "thin", color: { argb: "FFFFFFFF" } },
                    bottom: { style: "thin", color: { argb: "FFFFFFFF" } },
                    right: { style: "thin", color: { argb: "FFFFFFFF" } },
                };
            }
        }

        // ── Data rows (mulai baris 6) ──
        const currencyColIndexes = [3, 4, 5, 6, 7, 8, 9, 10, 11]; // C..K
        const totals = new Array(currencyColIndexes.length).fill(0);

        filtered.forEach((u, idx) => {
            const sal = salaryMap[u.userId];
            const allow = allowanceMap[u.userId];
            const overtime = overtimeTotal[u.userId] || 0;
            const calc = computeMonthlySalary(sal, allow, overtime, u);
            const values = [
                idx + 1,
                u.name,
                calc.salaryIncome,
                calc.allowanceWife,
                calc.allowanceChild,
                calc.overtime,
                calc.deductionLoan,
                calc.deductionPension,
                calc.grossIncome,
                calc.totalDeduction,
                calc.netSalary,
            ];
            const row = sheet.addRow(values);
            const isEven = idx % 2 === 1;

            row.eachCell((cell, colNumber) => {
                cell.border = {
                    top: { style: "thin", color: { argb: "FFE5E7EB" } },
                    left: { style: "thin", color: { argb: "FFE5E7EB" } },
                    bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
                    right: { style: "thin", color: { argb: "FFE5E7EB" } },
                };
                if (isEven) {
                    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
                }
                if (colNumber === 1) cell.alignment = { horizontal: "center" };
                if (colNumber === 2) cell.alignment = { horizontal: "left" };
                if (currencyColIndexes.includes(colNumber)) {
                    cell.numFmt = "#,##0";
                    cell.alignment = { horizontal: "right" };
                }
            });

            // Highlight kolom Gaji Bersih (Net) — kolom ke-11
            const netCell = row.getCell(11);
            netCell.font = { bold: true, color: { argb: "FF047857" } };
            netCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFECFDF5" } };

            currencyColIndexes.forEach((c, i) => { totals[i] += values[c - 1] as number; });
        });

        // ── Baris TOTAL ──
        const totalRow = sheet.addRow(["", "TOTAL", ...totals]);
        totalRow.eachCell((cell, colNumber) => {
            cell.font = { bold: true, size: 11 };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
            cell.border = {
                top: { style: "double", color: { argb: "FF4338CA" } },
                left: { style: "thin", color: { argb: "FFD1D5DB" } },
                bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
                right: { style: "thin", color: { argb: "FFD1D5DB" } },
            };
            if (currencyColIndexes.includes(colNumber)) {
                cell.numFmt = "#,##0";
                cell.alignment = { horizontal: "right" };
            }
        });
        totalRow.getCell(11).font = { bold: true, size: 11, color: { argb: "FF047857" } };
        totalRow.getCell(11).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFA7F3D0" } };

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `Rekap_Gaji_${MONTH_NAMES[calMonth]}_${calYear}.xlsx`;
        link.click();
        URL.revokeObjectURL(url);
    }, [userSummary, allUsers, salaryMap, allowanceMap, overtimeTotal, calMonth, calYear]);

    const buildAttendanceDetail = useCallback((
        userName: string,
        type: "present" | "late"
    ): AttendanceSummaryDetail => {
        const targetStatus = type === "present" ? "PRESENT" : "LATE";
        const items: AttendanceDetailItem[] = [];
        const dim = new Date(calYear, calMonth + 1, 0).getDate();
        const todayWIB = getWIBToday();

        const userIdByName: Record<string, string> = {};
        allUsers.forEach(u => { userIdByName[u.name] = u.id; });
        const userId = userIdByName[userName] ?? "";

        // Build manual record lookup untuk user ini
        const manualByDate: Record<string, ManualAttendance> = {};
        manualRecords.forEach(mr => {
            if (mr.user_id === userId && mr.attendance_date.startsWith(thisMonthKey)) {
                manualByDate[mr.attendance_date] = mr;
            }
        });

        // Build auto attendance lookup untuk user ini
        const autoByDate: Record<string, Attendance> = {};
        thisMonthAtt.forEach(a => {
            if (a.user_name === userName && a.source === "AUTO") {
                const dk = toWIBDateKey(a.check_in_time || a.created_at);
                autoByDate[dk] = a;
            }
        });

        for (let d = 1; d <= dim; d++) {
            const dk = `${calYear}-${pad2(calMonth + 1)}-${pad2(d)}`;
            if (dk > todayWIB) break;

            const manualRec = manualByDate[dk];
            const autoRec = autoByDate[dk];

            let dayStatus: "PRESENT" | "LATE" | null = null;
            let checkInTime = "";
            let method = "FACE";
            let manualCreatedBy: string | null = null;

            if (manualRec) {
                const hasCheckout = !!checkoutTimes[`${userId}_${dk}`];
                const noCheckoutPenalty = dk >= CHECKOUT_REQUIRED_FROM && dk < todayWIB && !hasCheckout;
                if (!noCheckoutPenalty) {
                    if (manualRec.status === "PRESENT") dayStatus = "PRESENT";
                    else if (manualRec.status === "LATE") dayStatus = "LATE";
                }
                method = "MANUAL";
                checkInTime = toWIBTime(manualRec.check_in_time);
                manualCreatedBy = manualRec.created_by_name ?? null;
            } else if (autoRec) {
                const hasCheckout = !!checkoutTimes[`${userId}_${dk}`];
                const noCheckoutPenalty = dk >= CHECKOUT_REQUIRED_FROM && dk < todayWIB && !hasCheckout;
                dayStatus = noCheckoutPenalty
                    ? null
                    : autoRec.displayStatus === "PRESENT"
                        ? "PRESENT"
                        : autoRec.displayStatus === "LATE"
                            ? "LATE"
                            : null;
                checkInTime = toWIBTime(autoRec.check_in_time || autoRec.created_at);
                method = "FACE";
            }

            if (isDayOffForUser(userName, dk)) continue;

            if (dayStatus === targetStatus) {
                items.push({ date: dk, type: dayStatus, checkInTime, method, manualCreatedBy });
            }
        }

        return {
            name: userName,
            type,
            items,
            monthLabel: `${MONTH_NAMES[calMonth]} ${calYear}`,
        };
    }, [calYear, calMonth, allUsers, manualRecords, thisMonthAtt, thisMonthKey, isDayOffForUser, checkoutTimes]);

    const lastRefreshRef = useRef<number>(Date.now());

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden || !selectedMonth) return;

            const now = Date.now();
            // Hanya refetch kalau tab/app memang sudah tidak aktif > 60 detik.
            // Kalau cuma switch tab sebentar (< 1 menit), tidak perlu fetch ulang sama sekali.
            if (now - lastRefreshRef.current < 60_000) return;

            lastRefreshRef.current = now;
            refreshAll(true); // silent -> tidak ada skeleton loading yang muncul
            fetchTodayStatus();
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
    }, [selectedMonth, refreshAll, fetchTodayStatus]);

    const userRoles: string[] = getUserRoles(currentUser);
    const isAdmin = userIsAdmin(currentUser);
    const canManage = isAdmin || getEffectiveSubordinates(userRoles).length > 0;
    const canSalary = userCanViewSalary(currentUser);

    if (!selectedMonth) return (
        <DashboardLayout>
            <MonthSelector onSelect={(y, m) => {
                setSelectedMonth({ year: y, month: m });
                const params = new URLSearchParams(searchParams.toString());
                params.set("year", String(y));
                params.set("month", String(m));
                router.replace(`?${params.toString()}`, { scroll: false });
            }} />
            <style jsx global>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}.animate-fadeIn{animation:fadeIn 0.35s ease-out;}`}</style>
        </DashboardLayout>
    );

    return (
        <DashboardLayout>
            <div className="max-w-7xl mx-auto px-4 py-8 space-y-6 animate-fadeIn">

                {/* ── Header ── */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => {
                                setSelectedMonth(null);
                                const params = new URLSearchParams(searchParams.toString());
                                params.delete("year");
                                params.delete("month");
                                const qs = params.toString();
                                router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
                            }}
                            className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-all shadow-sm active:scale-95"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 flex-wrap">
                                <span className="bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">{canManage ? "Laporan Absensi" : "Absensi Saya"}</span>
                                <span className="text-gray-300">—</span>
                                <span className="bg-gradient-to-r from-[#1a1a2e] to-[#16213e] bg-clip-text text-transparent">{MONTH_NAMES[calMonth]} {calYear}</span>
                            </h1>
                            <p className="text-xs text-gray-400 mt-1">{thisMonthDays} hari hadir · {thisMonthPresent} tepat waktu · {thisMonthLate} terlambat</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            onClick={() => router.push("/dashboard/attendance/leaderboard")}
                            className="flex items-center gap-1.5 text-xs font-bold text-violet-600 bg-violet-50 border border-violet-200 px-4 py-2 rounded-xl hover:bg-violet-100 transition-all active:scale-95"
                        >
                            <Trophy className="w-3.5 h-3.5" /> Leaderboard
                        </button>
                        {canManage && (
                            <button
                                onClick={() => router.push("/dashboard/attendance/early-checkout")}
                                className="relative flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-4 py-2 rounded-xl hover:bg-amber-100 transition-all active:scale-95"
                            >
                                <Clock className="w-3.5 h-3.5" /> Izin Pulang Cepat
                                {pendingEarlyCheckoutCount > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-black leading-none shadow-sm">
                                        {pendingEarlyCheckoutCount > 99 ? "99+" : pendingEarlyCheckoutCount}
                                    </span>
                                )}
                            </button>
                        )}
                        {isAdmin && (
                            <button
                                onClick={() => openAddManual()}
                                disabled={usersLoading}
                                className="flex items-center gap-1.5 text-xs font-bold text-[#1a1a2e] bg-slate-100 border border-slate-200 px-4 py-2 rounded-xl hover:bg-slate-200 transition-all active:scale-95 disabled:opacity-60"
                            >
                                {usersLoading ? "Loading..." : "Absen Manual"}
                            </button>
                        )}
                        {isAdmin && (
                            <button
                                onClick={async () => { if (allUsers.length === 0) await fetchAllUsers(); setShowManualCheckoutModal(true); }}
                                className="flex items-center gap-1.5 text-xs font-bold text-orange-700 bg-orange-50 border border-orange-200 px-4 py-2 rounded-xl hover:bg-orange-100 transition-all active:scale-95"
                            >
                                Absen Pulang Manual
                            </button>
                        )}
                        {canManage && (
                            <>
                                <button
                                    onClick={async () => {
                                        if (allUsers.length === 0) await fetchAllUsers();
                                        setShowMonthlyOffModal(true);
                                    }}
                                    className="flex items-center gap-1.5 text-xs font-bold text-orange-600 bg-orange-50 border border-orange-200 px-4 py-2 rounded-xl hover:bg-orange-100 transition-all active:scale-95"
                                >
                                    Atur Libur
                                </button>
                                {/* NEW */}
                                <button
                                    onClick={async () => {
                                        if (allUsers.length === 0) await fetchAllUsers();
                                        setShowShiftScheduleModal(true);
                                    }}
                                    className="flex items-center gap-1.5 text-xs font-bold text-violet-600 bg-violet-50 border border-violet-200 px-4 py-2 rounded-xl hover:bg-violet-100 transition-all active:scale-95"
                                >
                                    Jadwal Shift
                                </button>
                            </>
                        )}
                        <button onClick={() => refreshAll()} className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 border border-gray-200 px-4 py-2 rounded-xl bg-white hover:shadow-md transition-all active:scale-95">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>Refresh
                        </button>
                    </div>
                </div>

                <OvertimeSOPBanner compact />
                <TodayAttendanceCard status={todayStatus} loading={statusLoading} onRefresh={fetchTodayStatus} onRequestEarlyCheckout={() => setShowEarlyCheckoutModal(true)} />
                {todayStatus?.overtimeOptions && !dismissedPastOvertimeDates.has(todayKey) && (
                    <OvertimeChoiceCard
                        date={todayKey}
                        options={todayStatus.overtimeOptions}
                        isDayOff={todayStatus.isDayOff}
                        alreadyRequested={myOvertimeDirections[todayKey]}
                        onDismiss={() => markOvertimeDateResolved(todayKey)}
                        onSubmitted={() => markOvertimeDateResolved(todayKey)}
                    />
                )}
                <PastOvertimeOpportunitiesCard
                    items={myPastOvertimeOpportunities}
                    onResolved={(dk) => markOvertimeDateResolved(dk)}
                />
                {/* ── Stat Cards ── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                        { label: "Hari Hadir", value: thisMonthDays, icon: <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>, gradient: "from-gray-50 to-gray-100", iconBg: "bg-gray-100" },
                        { label: "Tepat Waktu", value: thisMonthPresent, icon: <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>, gradient: "from-emerald-50 to-green-100", iconBg: "bg-emerald-100" },
                        { label: "Terlambat", value: thisMonthLate, icon: <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>, gradient: "from-amber-50 to-yellow-100", iconBg: "bg-amber-100" },
                        { label: "Karyawan", value: uniqueUsers.length, icon: <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>, gradient: "from-blue-50 to-indigo-100", iconBg: "bg-blue-100" },
                    ].map(c => (
                        <div key={c.label} className={`bg-gradient-to-br ${c.gradient} rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 p-5 hover:scale-[1.02]`}>
                            <div className="flex items-start justify-between mb-3">
                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{c.label}</p>
                                <div className={`w-8 h-8 rounded-xl ${c.iconBg} flex items-center justify-center shadow-sm`}>{c.icon}</div>
                            </div>
                            <p className="text-3xl font-black tracking-tight text-gray-800">
                                {loading ? <span className="inline-block w-10 h-8 bg-white/50 rounded-lg animate-pulse" /> : c.value}
                            </p>
                            <p className="text-[10px] text-gray-400 font-medium mt-1">{MONTH_SHORT[calMonth]} {calYear}</p>
                        </div>
                    ))}
                </div>

                {/* Tab bar — computed di luar JSX */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-1.5 flex gap-1 flex-wrap">
                    {(() => {
                        const tabs: { id: typeof activeTab; label: string }[] = [
                            { id: "calendar", label: "Kalender" },
                        ];
                        if (canManage) tabs.push({ id: "summary", label: "Ringkasan" });
                        if (canSalary) {
                            tabs.push({ id: "salary", label: "Rekap Gaji" });
                            tabs.push({ id: "salary-pkl", label: "Gaji PKL" });
                            tabs.push({ id: "salary-slip", label: "Slip Gaji" });
                            tabs.push({ id: "salary-history", label: "Riwayat Gaji" });
                        }
                        if (!isAdmin && !canSalary && !userIsPKL(currentUser)) {
                            tabs.push({ id: "my-salary" as typeof activeTab, label: "Gaji Saya" });
                            tabs.push({ id: "my-slip" as typeof activeTab, label: "Slip Gaji" });
                        }
                        if (isAdmin) tabs.push({ id: "leave", label: "Cuti" });
                        return tabs.map(t => (
                            <button key={t.id} onClick={() => handleSetActiveTab(t.id)}
                                className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all duration-200 flex-1 min-w-fit ${activeTab === t.id
                                    ? "bg-gradient-to-r from-[#1a1a2e] to-[#16213e] text-white shadow-md"
                                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                                    }`}>
                                {t.label}
                            </button>
                        ));
                    })()}
                </div>

                {/* ── Filter ── */}
                {canManage && activeTab === "calendar" && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Filter Karyawan</p>
                            {isAdmin && (
                                <div className="flex items-center gap-0.5 bg-gray-100 p-1 rounded-xl">
                                    <button
                                        onClick={() => { setCalendarPklFilter("karyawan"); setFilterUser("Semua"); }}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${calendarPklFilter === "karyawan"
                                            ? "bg-white text-gray-800 shadow-sm"
                                            : "text-gray-400 hover:text-gray-600"
                                            }`}
                                    >
                                        Karyawan
                                    </button>
                                    <button
                                        onClick={() => { setCalendarPklFilter("pkl"); setFilterUser("Semua"); }}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${calendarPklFilter === "pkl"
                                            ? "bg-amber-500 text-white shadow-sm"
                                            : "text-gray-400 hover:text-amber-600"
                                            }`}
                                    >
                                        PKL
                                    </button>
                                    <button
                                        onClick={() => { setCalendarPklFilter("all"); setFilterUser("Semua"); }}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${calendarPklFilter === "all"
                                            ? "bg-[#1a1a2e] text-white shadow-sm"
                                            : "text-gray-400 hover:text-gray-600"
                                            }`}
                                    >
                                        Semua
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => setFilterUser("Semua")}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${filterUser === "Semua"
                                    ? "bg-gradient-to-r from-[#1a1a2e] to-[#16213e] text-white shadow-md scale-105"
                                    : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"
                                    }`}
                            >
                                Semua
                            </button>
                            {uniqueUsers
                                .filter(n => {
                                    if (!isAdmin || calendarPklFilter === "all") return true;
                                    const uInfo = allUsers.find(u => u.name === n);
                                    if (calendarPklFilter === "pkl") return uInfo ? isPKLRole(uInfo.role) : false;
                                    return uInfo ? !isPKLRole(uInfo.role) : true; // "karyawan"
                                })
                                .map(n => (
                                    <button
                                        key={n}
                                        onClick={() => setFilterUser(n)}
                                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${filterUser === n
                                            ? "bg-gradient-to-r from-[#1a1a2e] to-[#16213e] text-white shadow-md scale-105"
                                            : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"
                                            }`}
                                    >
                                        {n}
                                    </button>
                                ))
                            }
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
                                    {[["bg-emerald-400", "Tepat"], ["bg-amber-400", "Terlambat"], ["bg-gray-400", "Skip"], ["bg-blue-400", "Manual"], ["bg-red-300", "Libur"], ["bg-purple-400", "Lembur Libur"], ["bg-violet-400", "Sudah Pulang"], ["bg-orange-400", "Belum Pulang"]].map(([c, l]) => (
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
                                            const hwc = dd.filter(a => isDayOffForUser(a.user_name, dk)).length;
                                            const pc = dd.filter(a => a.displayStatus === "PRESENT" && !isDayOffForUser(a.user_name, dk)).length;
                                            const lc = dd.filter(a => a.displayStatus === "LATE" && !isDayOffForUser(a.user_name, dk)).length;
                                            const sc = dd.filter(a => a.displayStatus === "SKIP" && !isDayOffForUser(a.user_name, dk)).length;
                                            const mc = dd.filter(a => a.source === "MANUAL" && !isDayOffForUser(a.user_name, dk)).length;
                                            const tot = pc + lc + sc;
                                            const isTod = dk === todayKey, isSel = dk === selectedDate;
                                            const effectiveFilterUser = !canManage && currentUser?.name ? currentUser.name : filterUser;
                                            const filteredUserInfo = allUsers.find(u => u.name === effectiveFilterUser);
                                            const filteredUserStart = getUserStartDate(filteredUserInfo?.created_at, calYear, calMonth);
                                            const isUserDayOff = effectiveFilterUser !== "Semua"
                                                ? (dk >= filteredUserStart && isDayOffForUser(effectiveFilterUser, dk))
                                                : false;
                                            const hasAnyDayOff = filterUser === "Semua"
                                                ? getOffUsersForDate(dk).filter(name => {
                                                    const uInfo = allUsers.find(u => u.name === name);
                                                    const startDate = getUserStartDate(uInfo?.created_at, calYear, calMonth);
                                                    return dk >= startDate;
                                                }).length > 0
                                                : false;
                                            const hasManual = mc > 0;
                                            const showLiburLine = !tot && (isUserDayOff || hasAnyDayOff);
                                            const coCount = dd.filter(a => a.user_id && checkoutTimes[`${a.user_id}_${dk}`]).length;
                                            const noCoCount = dd.length - coCount;
                                            return (
                                                <button key={day} onClick={() => {
                                                    setAbsentPopupMode(null);
                                                    setSelectedDate(p => p === dk ? null : dk);
                                                }}
                                                    className={`relative flex flex-col items-start justify-start p-1.5 sm:p-3 rounded-lg sm:rounded-xl min-h-[58px] sm:min-h-[80px] transition-all duration-300 ${isSel ? "bg-gradient-to-br from-[#1a1a2e] to-[#16213e] shadow-xl sm:scale-[1.02] ring-2 ring-[#1a1a2e]/30" : isTod ? "bg-gradient-to-br from-blue-50 to-indigo-50 ring-1 ring-blue-200" : isUserDayOff && !tot ? "bg-gradient-to-br from-red-50 to-rose-50 border border-red-100" : tot ? "bg-gray-50/80 hover:bg-gray-100 hover:shadow-md border border-gray-100" : "bg-gray-50/50 border border-gray-200/60 hover:bg-gray-100/80 hover:shadow-sm"}`}>
                                                    {isUserDayOff && (filterUser !== "Semua" || !isAdminRole(currentUser?.role)) && <span className="absolute top-1 right-1 sm:top-2 sm:right-2 w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-red-400 ring-2 ring-white" />}
                                                    <span className={`text-[11px] sm:text-xs font-semibold ${isSel ? "text-white/90" : isTod ? "text-blue-700" : isUserDayOff ? "text-red-500" : "text-gray-700"}`}>
                                                        {day}
                                                    </span>
                                                    {tot > 0 ? (
                                                        <div className="mt-auto pt-1 w-full space-y-1">
                                                            {/* Garis progress: proporsi Tepat/Terlambat/Skip hari ini */}
                                                            <div className={`w-full h-1 sm:h-1.5 rounded-full overflow-hidden flex ${isSel ? "bg-white/20" : "bg-gray-200/70"}`}>
                                                                {pc > 0 && <div className="h-full bg-emerald-400" style={{ width: `${(pc / tot) * 100}%` }} />}
                                                                {lc > 0 && <div className="h-full bg-amber-400" style={{ width: `${(lc / tot) * 100}%` }} />}
                                                                {sc > 0 && <div className="h-full bg-gray-400" style={{ width: `${(sc / tot) * 100}%` }} />}
                                                            </div>
                                                            {/* ✅ NEW — Garis progress: proporsi absen pulang (jam pulang) hari ini */}
                                                            <div className={`w-full h-1 sm:h-1.5 rounded-full overflow-hidden flex ${isSel ? "bg-white/20" : "bg-gray-200/70"}`} title={`${coCount} sudah absen pulang, ${noCoCount} belum`}>
                                                                {coCount > 0 && <div className="h-full bg-violet-400" style={{ width: `${(coCount / dd.length) * 100}%` }} />}
                                                                {noCoCount > 0 && <div className="h-full bg-orange-400" style={{ width: `${(noCoCount / dd.length) * 100}%` }} />}
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <div className={`flex items-center justify-center w-3 h-3 sm:w-4 sm:h-4 rounded-full ${isSel ? "bg-white/20" : "bg-[#1a1a2e]/10"} ${hasManual ? "ring-1 ring-blue-400" : ""}`}>
                                                                    <span className={`flex items-center justify-center ${isSel ? "text-white" : "text-[#1a1a2e]"}`}>
                                                                        {hasManual ? <Pencil className="w-2 h-2 sm:w-2.5 sm:h-2.5" /> : <CheckCircle2 className="w-2 h-2 sm:w-2.5 sm:h-2.5" />}
                                                                    </span>
                                                                </div>
                                                                <span className={`text-[9px] sm:text-[10px] font-bold leading-tight ${isSel ? "text-white/70" : "text-gray-400"}`}>
                                                                    <span className="hidden sm:inline">{tot} hadir{mc > 0 ? ` · ${mc} manual` : ""}</span>
                                                                    <span className="sm:hidden">{tot}{mc > 0 ? " (m)" : ""}</span>
                                                                </span>
                                                            </div>
                                                            {/* ✅ NEW — badge terpisah kalau ada yang masuk di hari libur (dihitung lembur) di tanggal yang sama */}
                                                            {hwc > 0 && (
                                                                <div className="flex items-center gap-1">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0" />
                                                                    <span className={`text-[8px] sm:text-[9px] font-bold leading-tight ${isSel ? "text-white/60" : "text-purple-500"}`}>
                                                                        <span className="hidden sm:inline">{hwc} lembur libur</span>
                                                                        <span className="sm:hidden">+{hwc}L</span>
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : hwc > 0 ? (
                                                        <div className="mt-auto pt-1 w-full space-y-1">
                                                            <div className="w-full h-1 sm:h-1.5 rounded-full bg-purple-300" />
                                                            <span className={`text-[8px] sm:text-[9px] font-bold leading-tight block text-center ${isSel ? "text-white/70" : "text-purple-500"}`}>
                                                                {hwc} lembur libur
                                                            </span>
                                                        </div>
                                                    ) : showLiburLine ? (
                                                        <div className="mt-auto pt-1 w-full">
                                                            <div className="w-full h-1 sm:h-1.5 rounded-full bg-red-300" />
                                                        </div>
                                                    ) : (
                                                        <div className="mt-auto pt-1 w-full">
                                                            <div className={`w-full h-1 sm:h-1.5 rounded-full ${isSel ? "bg-white/20" : "bg-gray-200/50"}`} />
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
                                            {selectedPresentCount > 0 && <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-3 py-1 rounded-full"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg> {selectedPresentCount} tepat</span>}
                                            {selectedLateCount > 0 && <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-3 py-1 rounded-full"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> {selectedLateCount} terlambat</span>}
                                            {selectedHolidayWorkCount > 0 && <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-purple-700 bg-purple-100 border border-purple-200 px-3 py-1 rounded-full"><Umbrella className="w-3 h-3" /> {selectedHolidayWorkCount} lembur libur</span>}
                                            {selectedAttendances.filter(a => a.source === "MANUAL").length > 0 && <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-blue-700 bg-blue-100 border border-blue-200 px-3 py-1 rounded-full"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg> {selectedAttendances.filter(a => a.source === "MANUAL").length} manual</span>}
                                            {selectedOffDetail.length > 0 && <span title={selectedOffDetail.map(o => o.name).join(", ")} className="inline-flex items-center gap-1.5 text-[10px] font-bold text-red-700 bg-red-100 border border-red-200 px-3 py-1 rounded-full"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg> {selectedOffDetail.length} libur</span>}
                                            {selectedAbsentKaryawan.length > 0 && calendarPklFilter !== "pkl" && (
                                                <button
                                                    onClick={() => setAbsentPopupMode("karyawan")}
                                                    className="inline-flex items-center gap-1.5 text-[10px] font-bold text-orange-700 bg-orange-100 border border-orange-200 px-3 py-1 rounded-full hover:bg-orange-200 transition-all"
                                                >
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg> {selectedAbsentKaryawan.length} karyawan tidak masuk
                                                </button>
                                            )}
                                            {selectedAbsentPKL.length > 0 && calendarPklFilter !== "karyawan" && (
                                                <button
                                                    onClick={() => setAbsentPopupMode("pkl")}
                                                    className="inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-3 py-1 rounded-full hover:bg-amber-200 transition-all"
                                                >
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 14l9-5-9-5-9 5 9 5z" /><path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M22 10v6M2 10l10 5 10-5" /></svg> {selectedAbsentPKL.length} PKL tidak masuk
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {isAdminRole(currentUser?.role)
                                            && (
                                                <button onClick={() => openAddManual(selectedDate)} className="flex items-center gap-1.5 text-[11px] font-bold text-[#1a1a2e] bg-slate-100 border border-slate-200 px-3 py-2 rounded-xl hover:bg-slate-200 transition-all">
                                                    Tambah Manual
                                                </button>
                                            )}
                                        <button onClick={() => { setSelectedDate(null); setAbsentPopupMode(null); }} className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all">                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                    </div>
                                </div>

                                {canManage && selectedOffDetail.length > 0 && calendarPklFilter !== "pkl" && (
                                    <div className="px-6 pt-4 pb-3 border-b border-gray-50 bg-red-50/20">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">
                                            Libur / Tidak Masuk ({selectedOffDetail.length})
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedOffDetail.map(o => (
                                                <div key={o.name} className="inline-flex items-center gap-2 bg-white border border-red-200 rounded-xl pl-1.5 pr-3 py-1.5 shadow-sm">
                                                    <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-red-400 to-rose-500 flex items-center justify-center text-white text-[9px] font-black flex-shrink-0">
                                                        {initials(o.name)}
                                                    </div>
                                                    <div className="leading-tight">
                                                        <p className="text-[11px] font-bold text-gray-700">{o.name}</p>
                                                        <p className="text-[9px] text-red-500 font-semibold">
                                                            {o.reason}{o.role ? ` · ${o.role.replace(/_/g, " ")}` : ""}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {canManage && selectedAbsentKaryawan.length > 0 && calendarPklFilter !== "pkl" && (
                                    <AbsentSummaryBanner
                                        list={selectedAbsentKaryawan}
                                        mode="karyawan"
                                        onClick={() => setAbsentPopupMode("karyawan")}
                                    />
                                )}
                                {canManage && selectedAbsentPKL.length > 0 && calendarPklFilter !== "karyawan" && (
                                    <AbsentSummaryBanner
                                        list={selectedAbsentPKL}
                                        mode="pkl"
                                        onClick={() => setAbsentPopupMode("pkl")}
                                    />
                                )}

                                {selectedAttendances.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-12 px-6">
                                        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                                            {!isAdminRole(currentUser?.role) && currentUser?.name && isDayOffForUser(currentUser.name, selectedDate ?? "")
                                                ? <svg className="w-8 h-8 text-orange-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m11.314 11.314l.707-.707M12 5a7 7 0 100 14 7 7 0 000-14z" /></svg>
                                                : <svg className="w-8 h-8 text-gray-400 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                            }
                                        </div>
                                        {!canManage && currentUser?.name && isDayOffForUser(currentUser.name, selectedDate ?? "") ? (
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
                                                    Hari Kerja
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
                                                    <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Jam Pulang</th>
                                                    <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Batas Absen</th>
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
                                                {selectedAttendances.map((a, idx) => {
                                                    const userId = a.user_id ?? "";
                                                    const dateKey = toWIBDateKey(a.check_in_time || a.created_at);
                                                    const manualRec = manualMap[`${userId}_${dateKey}`];
                                                    const isHolidayWork = isDayOffForUser(a.user_name, dateKey);
                                                    const rowStatusKey: string | undefined = manualRec?.status ?? a.displayStatus;
                                                    const ACCENT_COLOR_MAP: Record<string, string> = {
                                                        PRESENT: "border-l-emerald-400",
                                                        LATE: "border-l-amber-400",
                                                        SKIP: "border-l-gray-300",
                                                        SICK: "border-l-blue-400",
                                                        PERMIT: "border-l-violet-400",
                                                        ABSENT: "border-l-red-400",
                                                        LEAVE: "border-l-cyan-400",
                                                    };
                                                    const accentColor = isHolidayWork ? "border-l-purple-400" : (rowStatusKey && ACCENT_COLOR_MAP[rowStatusKey]) || "border-l-transparent";
                                                    return (
                                                        <tr key={a.id} className={`border-l-4 ${accentColor} hover:bg-gray-50/60 transition-colors duration-200 ${a.source === "MANUAL" ? "bg-blue-50/40" : idx % 2 === 1 ? "bg-gray-50/30" : ""}`}>
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
                                                                {manualRec && (["ABSENT", "SICK", "PERMIT"] as string[]).includes(manualRec.status) ? (
                                                                    <span className="text-[10px] text-gray-300 font-bold">—</span>
                                                                ) : (() => {
                                                                    const checkoutIso = checkoutTimes[`${userId}_${dateKey}`];
                                                                    if (!checkoutIso) {
                                                                        return <span className="text-[10px] text-gray-300 font-bold">Belum pulang</span>;
                                                                    }
                                                                    const ot = afterOutOvertime[`${userId}_${dateKey}`];
                                                                    const otColor = ot ? getOvertimeColor({ status: ot.status, audit_status: ot.auditStatus }) : null;
                                                                    return (
                                                                        <div className="flex flex-col gap-1">
                                                                            <span className="font-mono font-black text-violet-700 text-sm">
                                                                                {toWIBTime(checkoutIso)}
                                                                            </span>
                                                                            {ot && (
                                                                                <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border w-fit whitespace-nowrap ${otColor === "GREEN" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : otColor === "AMBER" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>
                                                                                    <Clock className="w-2.5 h-2.5" /> Lembur {formatOvertimeMinutes(ot.minutes)}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })()}
                                                            </td>
                                                            <td className="px-4 py-4">
                                                                {(() => {
                                                                    const eff = effectiveShiftFor(userId, dateKey);
                                                                    return (
                                                                        <div className="flex flex-col gap-1">
                                                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg w-fit whitespace-nowrap">
                                                                                Telat &gt; {minToHHMM(eff.late)}
                                                                            </span>
                                                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-1 rounded-lg w-fit whitespace-nowrap">
                                                                                Tutup {minToHHMM(eff.close)}
                                                                            </span>
                                                                        </div>
                                                                    );
                                                                })()}
                                                            </td>
                                                            <td className="px-4 py-4">
                                                                {isHolidayWork ? (
                                                                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-full border shadow-sm bg-purple-100 text-purple-700 border-purple-200">
                                                                        <Umbrella className="w-3 h-3 text-purple-600" /> Libur → Lembur
                                                                    </span>
                                                                ) : manualRec ? (
                                                                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-full border shadow-sm ${MANUAL_STATUS_LABELS[manualRec.status]?.bg} ${MANUAL_STATUS_LABELS[manualRec.status]?.color} ${MANUAL_STATUS_LABELS[manualRec.status]?.border}`}>
                                                                        {renderStatusEmoji(MANUAL_STATUS_LABELS[manualRec.status]?.emoji)} {MANUAL_STATUS_LABELS[manualRec.status]?.label}
                                                                    </span>
                                                                ) : (
                                                                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-full border shadow-sm ${a.displayStatus === "PRESENT" ? "bg-emerald-100 text-emerald-700 border-emerald-200" : a.displayStatus === "SKIP" ? "bg-gray-100 text-gray-500 border-gray-200" : "bg-amber-100 text-amber-700 border-amber-200"}`}>
                                                                        {a.displayStatus === "PRESENT" ? <Check className="w-3 h-3 text-emerald-600" /> : a.displayStatus === "SKIP" ? <X className="w-3 h-3 text-gray-500" /> : <Clock className="w-3 h-3 text-amber-600" />} {a.displayStatus === "PRESENT" ? "Tepat" : a.displayStatus === "SKIP" ? "Skip" : "Terlambat"}
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-4">
                                                                <span className={`inline-flex items-center text-[10px] font-bold px-3 py-1.5 rounded-full border w-fit ${a.source === "MANUAL" ? "bg-blue-100 text-blue-700 border-blue-200" : a.method === "FACE" ? "bg-indigo-100 text-indigo-600 border-indigo-200" : a.method === "BIOMETRIC" ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-400 border-gray-200"}`}>
                                                                    {a.source === "MANUAL" ? "Manual" : a.method === "FACE" ? "Wajah" : a.method === "BIOMETRIC" ? "Sidik Jari" : "Skip"}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-4">
                                                                {a.latitude && a.longitude ? (
                                                                    <a href={`https://maps.google.com/?q=${a.latitude},${a.longitude}`} target="_blank" rel="noopener noreferrer"
                                                                        className={`inline-flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 rounded-full border no-underline transition-all hover:shadow-md ${Math.round(haversine(a.latitude, a.longitude, OFFICE_LAT, OFFICE_LNG)) <= 80 ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-red-100 text-red-600 border-red-200"}`}>
                                                                        {Math.round(haversine(a.latitude, a.longitude, OFFICE_LAT, OFFICE_LNG))}m
                                                                    </a>
                                                                ) : <span className="text-[10px] text-gray-200 font-bold">—</span>}
                                                            </td>
                                                            <td className="px-4 py-4 hidden lg:table-cell">
                                                                <div className="space-y-0.5">
                                                                    {isHolidayWork && (
                                                                        <p className="text-[11px] text-purple-600 font-semibold leading-snug max-w-[180px]">
                                                                            Masuk di hari libur — jadi terhitung lembur, bukan kehadiran
                                                                        </p>
                                                                    )}
                                                                    {manualRec?.notes && (
                                                                        <p className="text-[11px] text-blue-600 font-medium max-w-[180px] truncate">Notes: {manualRec.notes}</p>
                                                                    )}
                                                                    {manualRec?.created_by_name && (
                                                                        <p className="text-[10px] text-violet-500 font-bold">
                                                                            oleh {manualRec.created_by_name}
                                                                        </p>
                                                                    )}
                                                                    {!manualRec && !isHolidayWork && (
                                                                        <p className="text-[10px] text-gray-400 truncate max-w-[180px] font-mono">{a.device || "—"}</p>
                                                                    )}
                                                                </div>
                                                            </td>
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
                                                                                    Edit
                                                                                </button>
                                                                            ) : (
                                                                                <>
                                                                                    <button
                                                                                        onClick={async () => {
                                                                                            if (!confirm("Hapus absen wajah ini? Absen pulang di hari yang sama juga akan ikut terhapus.")) return;
                                                                                            try {
                                                                                                const res = await fetch(`/api/attendance?id=${a.id}`, {
                                                                                                    method: "DELETE"
                                                                                                });
                                                                                                const d = await res.json();
                                                                                                if (!d.success) {
                                                                                                    alert(d.message || "Gagal menghapus");
                                                                                                    return;
                                                                                                }
                                                                                                if (d.warning) alert(d.warning);
                                                                                                refreshAll(); // Refresh data
                                                                                            } catch (err) {
                                                                                                console.error("Delete error:", err);
                                                                                                alert("Gagal menghapus absen");
                                                                                            }
                                                                                        }}
                                                                                        className="inline-flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 hover:text-red-700 transition-all duration-200"
                                                                                        title="Hapus absen wajah ini">
                                                                                        Hapus
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
                                                                                        Edit
                                                                                    </button>
                                                                                </>
                                                                            )}
                                                                            {/* ✅ NEW — koreksi/isi jam pulang, terlepas dari sumber absen masuknya */}
                                                                            <button
                                                                                onClick={() => {
                                                                                    setEditCheckoutData({
                                                                                        userId,
                                                                                        userName: a.user_name,
                                                                                        dateKey,
                                                                                        currentCheckoutIso: checkoutTimes[`${userId}_${dateKey}`] ?? null,
                                                                                    });
                                                                                }}
                                                                                className="inline-flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 hover:border-violet-300 transition-all duration-200"
                                                                                title="Edit/koreksi jam pulang">
                                                                                Edit Pulang
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                )}
                                                            {/* Kolom Shift — resolve per tanggal record */}
                                                            <td className="px-4 py-4 text-center">
                                                                {(() => {
                                                                    const eff = effectiveShiftFor(userId, dateKey);
                                                                    return (
                                                                        <div className="flex flex-col items-center gap-0.5">
                                                                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-lg border ${eff.shift === "PAGI"
                                                                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                                                                : "bg-indigo-50 text-indigo-700 border-indigo-200"
                                                                                }`}>
                                                                                {eff.shift === "PAGI" ? <Sun className="w-3.5 h-3.5 inline mr-1 text-amber-500" /> : <Moon className="w-3.5 h-3.5 inline mr-1 text-indigo-500" />} {eff.shift}
                                                                            </span>
                                                                            {eff.fromSchedule && (
                                                                                <span className="text-[8px] font-bold text-violet-500">jadwal</span>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })()}
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
                    </>
                )}

                {/* ════ TAB RINGKASAN ════ */}
                {activeTab === "summary" && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white flex items-center justify-between flex-wrap gap-3">
                            <div>
                                <p className="text-base font-bold text-gray-800">Ringkasan Kehadiran — {MONTH_NAMES[calMonth]} {calYear}</p>
                                <p className="text-[10px] text-gray-400 mt-1">
                                    Tepat=1.0 · Terlambat=0.5 · Cuti=1.0 (dihitung hadir) · Tidak Hadir=0 ·
                                    <span className="text-blue-500 font-semibold"> % dihitung dari total hari kerja bulan ini</span>
                                </p>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                {isAdmin && (
                                    <div className="flex items-center gap-0.5 bg-gray-100 p-1 rounded-xl">
                                        <button
                                            onClick={() => setPklFilterMode(false)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${!pklFilterMode ? "bg-white text-gray-800 shadow-sm" : "text-gray-400 hover:text-gray-600"
                                                }`}
                                        >
                                            Karyawan
                                        </button>
                                        <button
                                            onClick={() => setPklFilterMode(true)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${pklFilterMode ? "bg-amber-500 text-white shadow-sm" : "text-gray-400 hover:text-amber-600"
                                                }`}
                                        >
                                            PKL
                                        </button>
                                    </div>
                                )}
                                <button onClick={() => openAddManual()} disabled={usersLoading}
                                    className="flex items-center gap-1.5 text-xs font-bold text-[#1a1a2e] bg-slate-100 border border-slate-200 px-4 py-2 rounded-xl hover:bg-slate-200 transition-all active:scale-95 disabled:opacity-60">
                                    {usersLoading ? "Loading..." : "Absen Manual"}
                                </button>
                            </div>
                        </div>
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
                                            <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Cuti</th>
                                            <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Lembur Libur</th>
                                            <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Skor</th>
                                            <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Hari Efektif</th>
                                            <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Sisa Hari</th>                                                <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest min-w-[180px]">Persentase</th>
                                            {isAdmin && (
                                                <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Kontrak</th>
                                            )}
                                            {isAdmin && (
                                                <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Generate & Edit</th>
                                            )}
                                            {canManage && (
                                                <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Shift</th>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {(isAdmin
                                            ? (pklFilterMode
                                                ? userSummary.filter(u => {
                                                    const uInfo = allUsers.find(au => au.id === u.userId);
                                                    return uInfo ? isPKLRole(uInfo.role) : false;
                                                })
                                                : userSummary.filter(u => {
                                                    const uInfo = allUsers.find(au => au.id === u.userId);
                                                    return uInfo ? !isPKLRole(uInfo.role) : true;
                                                })
                                            )
                                            : canManage
                                                ? userSummary.filter(u => allUsers.some(au => au.id === u.userId))
                                                : userSummary.filter(u => u.userId === currentUser?.id)
                                        ).map((u, i) => {
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
                                                                        {salaryMap[u.userId].salary_type === "FIXED" ? "Tetap" : "% Absen"}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-4 text-center">
                                                        {u.present > 0 ? (
                                                            <button
                                                                onClick={() => setAttendanceSummaryDetail(buildAttendanceDetail(u.name, "present"))}
                                                                className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 text-sm font-black border border-emerald-200 hover:bg-emerald-200 hover:scale-105 transition-all cursor-pointer"
                                                                title={`Lihat detail hari tepat waktu ${u.name}`}
                                                            >
                                                                {u.present}
                                                            </button>
                                                        ) : (
                                                            <span className="text-gray-200 text-sm font-black">—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-4 text-center">
                                                        {u.late > 0 ? (
                                                            <button
                                                                onClick={() => setAttendanceSummaryDetail(buildAttendanceDetail(u.name, "late"))}
                                                                className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-amber-100 text-amber-700 text-sm font-black border border-amber-200 hover:bg-amber-200 hover:scale-105 transition-all cursor-pointer"
                                                                title={`Lihat detail hari terlambat ${u.name}`}
                                                            >
                                                                {u.late}
                                                            </button>
                                                        ) : (
                                                            <span className="text-gray-200 text-sm font-black">—</span>
                                                        )}
                                                    </td>
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
                                                    <td className="px-4 py-4 text-center">
                                                        {u.leave > 0 ? (
                                                            <button
                                                                onClick={() => setLeaveDetail({ name: u.name, dates: u.leaveDates })}
                                                                className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-cyan-100 text-cyan-700 text-sm font-black border border-cyan-200 hover:bg-cyan-200 hover:scale-105 transition-all cursor-pointer"
                                                                title={`Lihat detail cuti ${u.name}`}
                                                            >
                                                                {u.leave}
                                                            </button>
                                                        ) : (
                                                            <span className="text-gray-200 text-sm font-black">—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-4 text-center">
                                                        {u.holidayWorkDates.length > 0 ? (
                                                            <span
                                                                className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-purple-100 text-purple-700 text-sm font-black border border-purple-200"
                                                                title={`Masuk di hari libur (dihitung lembur, bukan kehadiran): ${u.holidayWorkDates.map(d => new Date(d + "T12:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short" })).join(", ")}`}
                                                            >
                                                                {u.holidayWorkDates.length}
                                                            </span>
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
                                                    {isAdmin && (
                                                        <td className="px-4 py-4 text-center">
                                                            <div className="flex flex-col items-center gap-1.5">
                                                                <ContractBadge status={allUsers.find(au => au.id === u.userId)?.contract_status} validUntil={allUsers.find(au => au.id === u.userId)?.contract_valid_until} />
                                                                {allUsers.find(au => au.id === u.userId)?.contract_status === "APPROVED" && allUsers.find(au => au.id === u.userId)?.career_level && (
                                                                    <CareerLevelBadge level={allUsers.find(au => au.id === u.userId)?.career_level} />
                                                                )}
                                                                <div className="flex items-center gap-1">
                                                                    {allUsers.find(au => au.id === u.userId)?.contract_status && allUsers.find(au => au.id === u.userId)?.contract_status !== "NONE" && (
                                                                        <button
                                                                            onClick={() => {
                                                                                const target = allUsers.find(au => au.id === u.userId);
                                                                                if (target) setContractDetailUser(target);
                                                                            }}
                                                                            className="text-[9px] font-bold text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300 px-2 py-0.5 rounded-lg transition-all whitespace-nowrap"
                                                                        >
                                                                            Lihat
                                                                        </button>
                                                                    )}
                                                                    <button
                                                                        onClick={() => {
                                                                            const target = allUsers.find(au => au.id === u.userId);
                                                                            if (target) setSendContractUser(target);
                                                                        }}
                                                                        className="text-[9px] font-bold text-violet-500 hover:text-violet-700 border border-violet-200 hover:border-violet-300 px-2 py-0.5 rounded-lg transition-all whitespace-nowrap"
                                                                    >
                                                                        Kirim
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </td>
                                                    )}
                                                    {isAdmin && (
                                                        <td className="px-4 py-4 text-center">
                                                            <div className="flex items-center gap-1.5 justify-center flex-wrap">
                                                                <button
                                                                    onClick={async () => {
                                                                        if (!confirm(`Generate slip gaji ${u.name} untuk ${MONTH_NAMES[calMonth]} ${calYear}?`)) return;
                                                                        const success = await generateSlipFromRecapan(u);
                                                                        if (success) { fetchSalarySlips(calYear, calMonth); alert(`Slip gaji ${u.name} berhasil di-generate!`); }
                                                                    }}
                                                                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 transition-all whitespace-nowrap"
                                                                    title={`Generate slip gaji ${u.name}`}>
                                                                    Slip
                                                                </button>
                                                                <button onClick={() => openAddManual(undefined, u.userId)}
                                                                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 border border-slate-200 hover:bg-[#1a1a2e] hover:text-white hover:border-[#1a1a2e] transition-all duration-200 whitespace-nowrap"
                                                                    title={`Tambah absen manual untuk ${u.name}`}>
                                                                    Absen
                                                                </button>
                                                            </div>
                                                        </td>
                                                    )}
                                                    {canManage && (
                                                        <td className="px-4 py-4 text-center">
                                                            {(() => {
                                                                const eff = effectiveShiftFor(u.userId, thisMonthKey === todayKey.slice(0, 7)
                                                                    ? todayKey
                                                                    : `${calYear}-${pad2(calMonth + 1)}-${pad2(new Date(calYear, calMonth + 1, 0).getDate())}`);
                                                                return (
                                                                    <div className="flex flex-col items-center gap-1">
                                                                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-lg border ${eff.isCustom ? "bg-rose-50 text-rose-700 border-rose-200" : eff.shift === "PAGI"
                                                                            ? "bg-amber-50 text-amber-700 border-amber-200"
                                                                            : "bg-indigo-50 text-indigo-700 border-indigo-200"
                                                                            }`}>
                                                                            {eff.shift === "PAGI" ? <Sun className="w-3.5 h-3.5 inline mr-1 text-amber-500" /> : <Moon className="w-3.5 h-3.5 inline mr-1 text-indigo-500" />} {minToHHMM(eff.open)}–{minToHHMM(eff.checkout)}
                                                                        </span>
                                                                        {eff.fromSchedule && !eff.isCustom && (
                                                                            <span className="text-[8px] font-bold text-violet-500">dari jadwal</span>
                                                                        )}
                                                                        {eff.isCustom && (
                                                                            <span className="text-[8px] font-black text-rose-600">Custom</span>
                                                                        )}
                                                                        {(isAdmin || u.userId !== currentUser?.id) && (
                                                                            <button
                                                                                onClick={() => { if (allUsers.length === 0) fetchAllUsers(); setShiftModalUserId(u.userId); setShowShiftModal(true); }}
                                                                                className="text-[9px] font-bold text-gray-400 hover:text-indigo-600 border border-gray-200 hover:border-indigo-300 px-2 py-0.5 rounded-lg transition-all whitespace-nowrap"
                                                                                title={`Atur shift default ${u.name}`}
                                                                            >
                                                                                Default
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })()}
                                                        </td>
                                                    )}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-t border-gray-100 flex items-center gap-6 flex-wrap">
                                                       {[["bg-emerald-400", "Tepat = 1.0 poin"], ["bg-amber-400", "Terlambat = 0.5 poin"], ["bg-cyan-400", "Cuti = 1.0 poin (hadir)"], ["bg-red-400", "Tidak hadir = 0 poin"], ["bg-purple-400", "Lembur Libur = 0 poin (dibayar lembur, bukan kehadiran)"]].map(([c, l]) => (
                                <span key={l} className="text-[10px] text-gray-500 font-medium flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-full ${c}`} />{l}</span>
                            ))}
                            <span className="text-[10px] text-blue-500 ml-auto font-medium">% = skor ÷ total hari kerja bulan ini</span>
                        </div>
                    </div>
                )}

                {/* ════ TAB GAJI ════ */}
                {activeTab === "salary" && canViewSalary(currentUser?.role) && (
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
                                <button
                                    onClick={exportSalaryRecapToExcel}
                                    disabled={loading}
                                    className="flex items-center gap-1.5 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 px-4 py-2 rounded-xl hover:bg-blue-100 transition-all disabled:opacity-60"
                                >
                                    <FileText className="w-3.5 h-3.5" /> Export Excel
                                </button>
                                <button onClick={() => { if (allUsers.length === 0) fetchAllUsers(); setSalaryModalPklOnly(false); setShowSalaryModal(true); }} className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-xl hover:bg-emerald-100 transition-all">Atur Gaji</button>
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
                                                PENGHASILAN
                                            </th>

                                            {/* POTONGAN SECTION */}
                                            <th colSpan={2} className="px-4 py-4 text-center text-[10px] font-black text-red-600 uppercase tracking-widest bg-red-50/40 border-2 border-gray-300">
                                                POTONGAN
                                            </th>

                                            {/* TOTAL SECTION */}
                                            <th colSpan={2} className="px-4 py-4 text-center text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50/40 border-2 border-gray-300">
                                                TOTAL
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
                                        {userSummary
                                            .filter(u => {
                                                const uInfo = allUsers.find(au => au.id === u.userId);
                                                return uInfo ? !isPKLRole(uInfo.role) : true;
                                            })
                                            .map(u => {
                                                const sal = salaryMap[u.userId];
                                                const allow = allowanceMap[u.userId];
                                                const overtime = overtimeTotal[u.userId] || 0;

                                                const {
                                                    allowanceWife, allowanceChild,
                                                    grossIncome, deductionLoan, deductionPension,
                                                    netSalary,
                                                } = computeMonthlySalary(sal, allow, overtime, u);

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
                                                                        {sal ? (sal.salary_type === "FIXED" ? "Tetap" : "% Absen") : "—"}
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
                                                                    {sal.salary_type === "FIXED" && u.totalWorkdays > 0 && (
                                                                        <span
                                                                            className="text-[8px] text-violet-500 font-semibold mt-0.5 whitespace-nowrap"
                                                                            title={`Jika dihitung dari kehadiran: ${formatPct(u.pct)}% × ${formatRupiah(sal.base_salary)}`}
                                                                        >
                                                                            ≈ {formatRupiah(Math.round((sal.base_salary / u.totalWorkdays) * u.score))} jika %
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
                                                                <span className={`text-sm font-black ${u.pct >= 90 ? "text-emerald-600" : u.pct >= 70 ? "text-amber-600" : "text-red-500"}`}>
                                                                    {formatPct(u.pct)}%
                                                                </span>
                                                                <div className="w-12 h-1 bg-gray-100 rounded-full overflow-hidden">
                                                                    <div
                                                                        className={`h-full rounded-full ${u.pct >= 90 ? "bg-emerald-400" : u.pct >= 70 ? "bg-amber-400" : "bg-red-400"}`}
                                                                        style={{ width: `${Math.min(u.pct, 100)}%` }}
                                                                    />
                                                                </div>
                                                                {salaryMap[u.userId]?.salary_type === "FIXED" && u.totalWorkdays > 0 && (
                                                                    <span className="text-[8px] font-bold text-violet-500 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                                                        Tetap
                                                                    </span>
                                                                )}
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
                                                                {/* NEW: Tombol Generate Slip dari rekapan gaji */}
                                                                <button
                                                                    onClick={async () => {
                                                                        if (!confirm(`Generate slip gaji ${u.name} untuk ${MONTH_NAMES[calMonth]} ${calYear}?`)) return;
                                                                        const success = await generateSlipFromRecapan(u);
                                                                        if (success) {
                                                                            // Refresh list slip gaji
                                                                            fetchSalarySlips(calYear, calMonth);
                                                                            alert(`Slip gaji ${u.name} berhasil di-generate!`);
                                                                        }
                                                                    }}
                                                                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 transition-all whitespace-nowrap"
                                                                    title={`Generate slip gaji ${u.name} dari rekapan bulan ini`}
                                                                >
                                                                    Slip
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
                                                                    Tunjangan
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
                                                        userSummary
                                                            .filter(u => { const i = allUsers.find(au => au.id === u.userId); return i ? !isPKLRole(i.role) : true; })
                                                            .reduce((sum, u) => sum + computeMonthlySalary(salaryMap[u.userId], allowanceMap[u.userId], overtimeTotal[u.userId] || 0, u).salaryIncome, 0)
                                                    )}
                                                </span>
                                                <span className="text-[8px] text-gray-400">Gaji Pokok</span>
                                            </td>
                                            <td className="px-3 py-4 text-center border-r-2 border-gray-200">
                                                <span className="font-mono font-black text-emerald-600 text-xs block">
                                                    {formatRupiah(
                                                        userSummary
                                                            .filter(u => { const i = allUsers.find(au => au.id === u.userId); return i ? !isPKLRole(i.role) : true; })
                                                            .reduce((sum, u) => sum + computeMonthlySalary(salaryMap[u.userId], allowanceMap[u.userId], 0, u).allowanceWife, 0)
                                                    )}
                                                </span>
                                                <span className="text-[8px] text-gray-400">Tunjangan Istri</span>
                                            </td>
                                            <td className="px-3 py-4 text-center border-r-2 border-gray-200">
                                                <span className="font-mono font-black text-emerald-600 text-xs block">
                                                    {formatRupiah(
                                                        userSummary
                                                            .filter(u => { const i = allUsers.find(au => au.id === u.userId); return i ? !isPKLRole(i.role) : true; })
                                                            .reduce((sum, u) => sum + computeMonthlySalary(salaryMap[u.userId], allowanceMap[u.userId], 0, u).allowanceChild, 0)
                                                    )}
                                                </span>
                                                <span className="text-[8px] text-gray-400">Tunjangan Anak</span>
                                            </td>
                                            <td className="px-3 py-4 text-center border-r-2 border-gray-200">
                                                <span className="font-mono font-black text-orange-600 text-xs block">
                                                    {formatRupiah(
                                                        userSummary
                                                            .filter(u => { const i = allUsers.find(au => au.id === u.userId); return i ? !isPKLRole(i.role) : true; })
                                                            .reduce((sum, u) => sum + (overtimeTotal[u.userId] || 0), 0)
                                                    )}
                                                </span>
                                                <span className="text-[8px] text-gray-400">Lemburan</span>
                                            </td>
                                            {/* Kasbon Total */}
                                            <td className="px-3 py-4 text-center border-r-2 border-gray-200">
                                                <span className="font-mono font-black text-red-600 text-xs block">
                                                    -{formatRupiah(
                                                        userSummary
                                                            .filter(u => { const i = allUsers.find(au => au.id === u.userId); return i ? !isPKLRole(i.role) : true; })
                                                            .reduce((sum, u) => sum + (allowanceMap[u.userId]?.deduction_loan || 0), 0)
                                                    )}
                                                </span>
                                                <span className="text-[8px] text-gray-400">Total Kasbon</span>
                                            </td>

                                            {/* Pensiun Total */}
                                            <td className="px-3 py-4 text-center border-r-2 border-gray-200">
                                                <span className="font-mono font-black text-red-600 text-xs block">
                                                    -{formatRupiah(
                                                        userSummary
                                                            .filter(u => { const i = allUsers.find(au => au.id === u.userId); return i ? !isPKLRole(i.role) : true; })
                                                            .reduce((sum, u) => sum + (allowanceMap[u.userId]?.deduction_pension || 0), 0)
                                                    )}
                                                </span>
                                                <span className="text-[8px] text-gray-400">Total Pensiun</span>
                                            </td>

                                            {/* Total Potongan gabungan — pindah ke kolom Gross */}
                                            <td className="px-3 py-4 text-center border-r-2 border-gray-200">
                                                <span className="font-mono font-black text-red-600 text-xs block">
                                                    -{formatRupiah(
                                                        userSummary
                                                            .filter(u => { const i = allUsers.find(au => au.id === u.userId); return i ? !isPKLRole(i.role) : true; })
                                                            .reduce((sum, u) => sum + ((allowanceMap[u.userId]?.deduction_loan || 0) + (allowanceMap[u.userId]?.deduction_pension || 0)), 0)
                                                    )}
                                                </span>
                                                <span className="text-[8px] text-gray-400">Total Potongan</span>
                                            </td>
                                            <td className="px-3 py-4 text-center border-r-2 border-gray-200">
                                                <span className="font-mono font-black text-blue-600 text-xs block">
                                                    {formatRupiah(
                                                        userSummary
                                                            .filter(u => { const i = allUsers.find(au => au.id === u.userId); return i ? !isPKLRole(i.role) : true; })
                                                            .reduce((sum, u) => sum + computeMonthlySalary(salaryMap[u.userId], allowanceMap[u.userId], overtimeTotal[u.userId] || 0, u).grossIncome, 0)
                                                    )}
                                                </span>
                                                <span className="text-[8px] text-gray-400">Gross</span>
                                            </td>
                                            <td className="px-3 py-4 text-right">
                                                <span className="font-mono font-black text-emerald-700 text-sm block bg-gradient-to-br from-emerald-100 to-green-100 px-2 py-1 rounded-lg border border-emerald-200">
                                                    {formatRupiah(
                                                        userSummary
                                                            .filter(u => { const i = allUsers.find(au => au.id === u.userId); return i ? !isPKLRole(i.role) : true; })
                                                            .reduce((sum, u) => sum + computeMonthlySalary(salaryMap[u.userId], allowanceMap[u.userId], overtimeTotal[u.userId] || 0, u).netSalary, 0)
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
                            <span><span className="text-emerald-600 font-semibold">Tunjangan × % kehadiran</span> — otomatis disesuaikan</span>
                            <span>•</span>
                            <span><span className="text-red-600 font-semibold">Potongan langsung</span> — tidak dihitung %</span>
                            <span>•</span>
                            <span><span className="text-blue-600 font-semibold">Gross = Total Penghasilan</span> sebelum potongan</span>
                        </div>
                    </div>
                )}

                {/* ════ TAB GAJI PKL ════ */}
                {activeTab === "salary-pkl" && canViewSalary(currentUser?.role) && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-amber-50 to-yellow-50 flex items-center justify-between flex-wrap gap-3">
                            <div>
                                <p className="text-base font-bold text-gray-800">Rekap Gaji PKL — {MONTH_NAMES[calMonth]} {calYear}</p>
                                <p className="text-[10px] text-amber-600 mt-1 font-semibold">
                                    Gaji Pokok + Lemburan · <span className="text-gray-400 font-medium">tanpa tunjangan, kasbon & pensiun</span>
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => { if (allUsers.length === 0) fetchAllUsers(); setSalaryModalPklOnly(true); setShowSalaryModal(true); }}
                                    className="flex items-center gap-1.5 text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 px-4 py-2 rounded-xl hover:bg-amber-100 transition-all"
                                >
                                    Atur Gaji PKL
                                </button>
                            </div>
                        </div>

                        {loading ? (
                            <div className="p-6 space-y-3">
                                {Array(3).fill(0).map((_, i) => (
                                    <div key={i} className="h-20 bg-gray-50 rounded-2xl animate-pulse" />
                                ))}
                            </div>
                        ) : (() => {
                            // Hanya user PKL
                            const pklSummary = userSummary.filter(u => {
                                const uInfo = allUsers.find(au => au.id === u.userId);
                                return uInfo ? isPKLRole(uInfo.role) : false;
                            });

                            if (pklSummary.length === 0) {
                                return (
                                    <div className="py-16 text-center px-4">
                                        <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
                                            <FileText className="w-8 h-8 text-gray-400 opacity-50" />
                                        </div>
                                        <p className="text-sm text-gray-400 font-medium">Tidak ada karyawan PKL bulan ini</p>
                                        <p className="text-xs text-gray-300 mt-1">PKL akan muncul otomatis setelah data absensi masuk</p>
                                    </div>
                                );
                            }

                            // Helper hitung gaji pokok PKL (tanpa potongan/tunjangan)
                            const calcPklIncome = (u: typeof pklSummary[0]) => {
                                const sal = salaryMap[u.userId];
                                const hasSalaryConfig = !!sal && sal.base_salary > 0;
                                return hasSalaryConfig
                                    ? (sal!.salary_type === "FIXED"
                                        ? sal!.base_salary
                                        : u.totalWorkdays > 0
                                            ? Math.round((sal!.base_salary / u.totalWorkdays) * u.score)
                                            : 0)
                                    : (u.present * PKL_DAILY_RATE) + (u.late * PKL_LATE_RATE);
                            };

                            const totalPokokPKL = pklSummary.reduce((s, u) => s + calcPklIncome(u), 0);
                            const totalOvertimePKL = pklSummary.reduce((s, u) => s + (overtimeTotal[u.userId] || 0), 0);
                            const totalNetPKL = totalPokokPKL + totalOvertimePKL; // PKL: net = pokok + lembur

                            return (
                                <>
                                    {/* Summary banner */}
                                    <div className="px-6 py-4 bg-amber-50/50 border-b border-amber-100 flex items-center gap-6 flex-wrap">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">Total PKL</span>
                                            <span className="text-sm font-black text-amber-700 bg-amber-100 border border-amber-200 px-3 py-1 rounded-full">
                                                {pklSummary.length} orang
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">Total Lemburan</span>
                                            <span className="text-sm font-black text-orange-700 bg-orange-100 border border-orange-200 px-3 py-1 rounded-full font-mono">
                                                {formatRupiah(totalOvertimePKL)}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">Total Gaji Bersih</span>
                                            <span className="text-sm font-black text-emerald-700 bg-emerald-100 border border-emerald-200 px-3 py-1 rounded-full font-mono">
                                                {formatRupiah(totalNetPKL)}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Table PKL */}
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm min-w-[1000px]">
                                            <thead>
                                                <tr className="border-b border-gray-100 bg-gray-50/60">
                                                    <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest w-8">#</th>
                                                    <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">PKL</th>
                                                    <th className="px-3 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Hadir</th>
                                                    <th className="px-3 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Terlambat</th>
                                                    <th className="px-3 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Tidak Hadir</th>
                                                    <th className="px-3 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Cuti</th>
                                                    <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Kehadiran %</th>
                                                    <th className="px-3 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Gaji Pokok</th>
                                                    <th className="px-3 py-4 text-center text-[10px] font-black text-orange-500 uppercase tracking-widest">Lemburan</th>
                                                    <th className="px-3 py-4 text-right text-[10px] font-black text-emerald-600 uppercase tracking-widest">Gaji Bersih</th>
                                                    <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Aksi</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {pklSummary.map((u, i) => {
                                                    const sal = salaryMap[u.userId];
                                                    const overtime = overtimeTotal[u.userId] || 0;
                                                    const hasSalaryConfig = !!sal && sal.base_salary > 0;

                                                    const salaryIncome = calcPklIncome(u);
                                                    const net = salaryIncome + overtime; // tanpa potongan

                                                    const pctColor = u.pct >= 90 ? "text-emerald-600" : u.pct >= 70 ? "text-amber-600" : "text-red-500";
                                                    const barGrad = u.pct >= 90 ? "from-emerald-400 to-green-500" : u.pct >= 70 ? "from-amber-400 to-orange-500" : "from-red-400 to-rose-500";

                                                    return (
                                                        <tr key={u.userId} className="hover:bg-amber-50/30 transition-colors duration-200">
                                                            <td className="px-4 py-4 text-[11px] text-gray-400 font-black">{i + 1}</td>

                                                            {/* Nama PKL */}
                                                            <td className="px-4 py-4">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-[10px] font-black flex-shrink-0 shadow-md">
                                                                        {initials(u.name)}
                                                                    </div>
                                                                    <div>
                                                                        <span className="font-bold text-gray-800 block text-sm">{u.name}</span>
                                                                        <span className="text-[10px] text-amber-600 font-semibold">
                                                                            {allUsers.find(au => au.id === u.userId)?.role?.replace(/_/g, " ") ?? "PKL"}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </td>

                                                            {/* Hadir */}
                                                            <td className="px-3 py-4 text-center">
                                                                {u.present > 0 ? (
                                                                    <button
                                                                        onClick={() => setAttendanceSummaryDetail(buildAttendanceDetail(u.name, "present"))}
                                                                        className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 text-sm font-black border border-emerald-200 hover:bg-emerald-200 hover:scale-105 transition-all"
                                                                    >
                                                                        {u.present}
                                                                    </button>
                                                                ) : <span className="text-gray-200 text-sm font-black">—</span>}
                                                            </td>

                                                            {/* Terlambat */}
                                                            <td className="px-3 py-4 text-center">
                                                                {u.late > 0 ? (
                                                                    <button
                                                                        onClick={() => setAttendanceSummaryDetail(buildAttendanceDetail(u.name, "late"))}
                                                                        className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-amber-100 text-amber-700 text-sm font-black border border-amber-200 hover:bg-amber-200 hover:scale-105 transition-all"
                                                                    >
                                                                        {u.late}
                                                                    </button>
                                                                ) : <span className="text-gray-200 text-sm font-black">—</span>}
                                                            </td>

                                                            {/* Tidak Hadir */}
                                                            <td className="px-3 py-4 text-center">
                                                                {u.absences.length > 0 ? (
                                                                    <button
                                                                        onClick={() => setAbsenceDetail({ name: u.name, absences: u.absences, offDates: u.offDates })}
                                                                        className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-red-100 text-red-600 text-sm font-black border border-red-200 hover:bg-red-200 hover:scale-105 transition-all"
                                                                    >
                                                                        {u.absences.length}
                                                                    </button>
                                                                ) : <span className="text-gray-200 text-sm font-black">—</span>}
                                                            </td>

                                                            {/* Cuti */}
                                                            <td className="px-3 py-4 text-center">
                                                                {u.leave > 0 ? (
                                                                    <button
                                                                        onClick={() => setLeaveDetail({ name: u.name, dates: u.leaveDates })}
                                                                        className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-cyan-100 text-cyan-700 text-sm font-black border border-cyan-200 hover:bg-cyan-200 hover:scale-105 transition-all cursor-pointer"
                                                                        title={`Lihat detail cuti ${u.name}`}
                                                                    >
                                                                        {u.leave}
                                                                    </button>
                                                                ) : <span className="text-gray-200 text-sm font-black">—</span>}
                                                            </td>

                                                            {/* Kehadiran % */}
                                                            <td className="px-4 py-4 text-center">
                                                                <div className="flex flex-col items-center gap-1">
                                                                    <span className={`text-sm font-black ${pctColor}`}>
                                                                        {formatPct(u.pct)}%
                                                                    </span>
                                                                    <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                                        <div
                                                                            className={`h-full rounded-full bg-gradient-to-r ${barGrad}`}
                                                                            style={{ width: `${Math.min(u.pct, 100)}%` }}
                                                                        />
                                                                    </div>
                                                                    <span className="text-[9px] text-gray-400">
                                                                        {u.pastWorkdays}/{u.totalWorkdays} hari
                                                                    </span>
                                                                </div>
                                                            </td>

                                                            {/* Gaji Pokok */}
                                                            <td className="px-3 py-4 text-center">
                                                                <div className="flex flex-col items-center gap-0.5">
                                                                    <span className="font-mono font-bold text-gray-800 text-xs">
                                                                        {formatRupiah(salaryIncome)}
                                                                    </span>
                                                                    {hasSalaryConfig ? (
                                                                        <span className="text-[8px] text-gray-400">
                                                                            {sal!.salary_type === "FIXED" ? "Tetap" : "% Absen"}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-[8px] text-amber-500 font-semibold whitespace-nowrap">
                                                                            {u.present}×10k{u.late > 0 ? ` +${u.late}×5k` : ""}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>

                                                            {/* Lemburan */}
                                                            <td className="px-3 py-4 text-center">
                                                                {overtime > 0 ? (
                                                                    <span className="font-mono font-bold text-orange-600 text-xs">
                                                                        +{formatRupiah(overtime)}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-gray-300 text-xs">—</span>
                                                                )}
                                                            </td>

                                                            {/* Gaji Bersih */}
                                                            <td className="px-3 py-4 text-right">
                                                                <div className="inline-flex flex-col items-end gap-1">
                                                                    <div className="inline-flex flex-col items-end gap-0.5 bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-200 rounded-lg px-3 py-1.5">
                                                                        <span className="font-black text-emerald-700 text-sm font-mono">
                                                                            {formatRupiah(net)}
                                                                        </span>
                                                                        <span className="text-[8px] text-emerald-600 font-semibold">bersih</span>
                                                                    </div>
                                                                    <button
                                                                        onClick={() => setEditSalaryUser({
                                                                            userId: u.userId,
                                                                            userName: u.name,
                                                                            currentSalary: sal,
                                                                        })}
                                                                        className="text-[9px] text-gray-400 hover:text-emerald-600 font-bold border border-gray-200 hover:border-emerald-300 px-2 py-0.5 rounded-lg transition-all"
                                                                    >
                                                                        Edit nominal
                                                                    </button>
                                                                </div>
                                                            </td>

                                                            {/* Aksi */}
                                                            <td className="px-4 py-4 text-center">
                                                                <div className="flex items-center gap-1.5 justify-center flex-wrap">
                                                                    <button
                                                                        onClick={async () => {
                                                                            if (!confirm(`Generate slip gaji PKL ${u.name} untuk ${MONTH_NAMES[calMonth]} ${calYear}?`)) return;
                                                                            const success = await generateSlipPKL(u);
                                                                            if (success) {
                                                                                fetchSalarySlips(calYear, calMonth);
                                                                                alert(`Slip gaji PKL ${u.name} berhasil di-generate!`);
                                                                            }
                                                                        }}
                                                                        className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 transition-all whitespace-nowrap"
                                                                    >
                                                                        Slip
                                                                    </button>
                                                                    <button
                                                                        onClick={() => setEditSalaryUser({
                                                                            userId: u.userId,
                                                                            userName: u.name,
                                                                            currentSalary: sal,
                                                                        })}
                                                                        className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100 transition-all whitespace-nowrap"
                                                                    >
                                                                        Edit Gaji
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>

                                            {/* Footer total */}
                                            <tfoot>
                                                <tr className="border-t-2 border-amber-200 bg-amber-50/40">
                                                    <td colSpan={7} className="px-4 py-4 text-sm font-black text-amber-700">
                                                        TOTAL GAJI PKL — {MONTH_NAMES[calMonth]} {calYear}
                                                    </td>
                                                    <td className="px-3 py-4 text-center">
                                                        <span className="font-mono font-black text-gray-700 text-xs block">
                                                            {formatRupiah(totalPokokPKL)}
                                                        </span>
                                                        <span className="text-[8px] text-gray-400">Pokok</span>
                                                    </td>
                                                    <td className="px-3 py-4 text-center">
                                                        <span className="font-mono font-black text-orange-600 text-xs block">
                                                            {formatRupiah(totalOvertimePKL)}
                                                        </span>
                                                        <span className="text-[8px] text-gray-400">Lembur</span>
                                                    </td>
                                                    <td className="px-3 py-4 text-right">
                                                        <span className="font-black text-emerald-700 text-sm font-mono bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-lg">
                                                            {formatRupiah(totalNetPKL)}
                                                        </span>
                                                    </td>
                                                    <td />
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>

                                    {/* Legend */}
                                    <div className="px-6 py-4 bg-amber-50/30 border-t border-amber-100 flex items-center gap-4 flex-wrap text-[10px] text-gray-500 font-medium">
                                        <span><span className="text-amber-600 font-semibold">Gaji PKL</span> = Gaji Pokok + Lemburan</span>
                                        <span>•</span>
                                        <span><span className="text-gray-500 font-semibold">Tanpa tunjangan, kasbon & pensiun</span></span>
                                        <span>•</span>
                                        <span>Belum diatur gaji → fallback rate harian <strong>Rp10rb/hadir</strong>, <strong>Rp5rb/telat</strong></span>
                                    </div>
                                </>
                            );
                        })()}
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
                                <button onClick={() => { if (allUsers.length === 0) fetchAllUsers(); fetchLeaveData(calYear, calMonth); setShowLeaveModal(true); }} className="flex items-center gap-1.5 text-xs font-bold text-cyan-600 bg-cyan-50 border border-cyan-200 px-4 py-2 rounded-xl hover:bg-cyan-100 transition-all">Kelola Cuti</button>
                            </div>
                            {loading ? (
                                <div className="p-6 space-y-3">{Array(5).fill(0).map((_, i) => <div key={i} className="h-16 bg-gray-50 rounded-2xl animate-pulse" />)}</div>
                            ) : leaveData.length === 0 ? (
                                <div className="py-16 text-center"><div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4"><Umbrella className="w-8 h-8 text-gray-400" /></div><p className="text-sm text-gray-400 font-medium">Belum ada data cuti</p></div>
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
                                            {leaveData
                                                .filter(ld => !isPKLRole(ld.user.role))
                                                .map(ld => (
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
                                                                            {new Date(r.leave_date + "T12:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
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
            {activeTab === "salary-history" && canViewSalary(currentUser?.role) && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
                        <div className="flex items-center justify-between flex-wrap gap-3">
                            <div>
                                <p className="text-base font-bold text-gray-800">Riwayat Perubahan Gaji</p>
                                <p className="text-[10px] text-gray-400 mt-1">Tracking semua perubahan gaji per karyawan</p>
                            </div>
                            <button
                                onClick={fetchSalaryHistory}
                                className="flex items-center gap-1.5 text-xs font-bold text-gray-500 bg-white border border-gray-200 px-4 py-2 rounded-xl hover:bg-gray-50 transition"
                            >
                                Refresh
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
                                <FileText className="w-8 h-8 text-gray-400" />
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
                                                        {hist.new_salary_type === "FIXED" ? "Tetap" : "% Absen"}
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
            {activeTab === "my-salary" && !canViewSalary(currentUser?.role) && (
                <div className="space-y-4 px-4 pb-8 max-w-2xl mx-auto">
                    {/* Info Gaji Saya */}
                    {(() => {
                        const mySalary = salaries.find(s => s.user_id === currentUser?.id);
                        const myStat = userSummary.find(u => u.userId === currentUser?.id);
                        const myCalc = mySalary && myStat
                            ? computeMonthlySalary(mySalary, allowanceMap[currentUser?.id ?? ""], overtimeTotal[currentUser?.id ?? ""] || 0, myStat)
                            : null;

                        return (
                            <div className="space-y-4">
                                {/* Card Gaji Pokok */}
                                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                    <div className="bg-gradient-to-r from-emerald-600 to-green-700 px-6 py-5">
                                        <p className="font-bold text-white text-base">Informasi Gaji</p>
                                        <p className="text-xs text-white/70 mt-1">
                                            {MONTH_NAMES[calMonth]} {calYear}
                                        </p>
                                    </div>

                                    <div className="p-6 space-y-4">
                                        {!mySalary ? (
                                            <div className="text-center py-8">
                                                <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                                                    <FileText className="w-6 h-6 text-gray-400" />
                                                </div>
                                                <p className="text-sm text-gray-400 font-medium">Belum ada data gaji</p>
                                                <p className="text-xs text-gray-300 mt-1">Hubungi admin untuk mengatur gaji kamu</p>
                                            </div>
                                        ) : (
                                            <>
                                                {/* Tipe dan nominal gaji */}
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="bg-gray-50 rounded-2xl p-4">
                                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Tipe Gaji</p>
                                                        <span className={`inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-full border ${mySalary.salary_type === "FIXED"
                                                            ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                                            : "bg-amber-100 text-amber-700 border-amber-200"
                                                            }`}>
                                                            {mySalary.salary_type === "FIXED" ? "Gaji Tetap" : "Persentase Kehadiran"}
                                                        </span>
                                                    </div>
                                                    <div className="bg-gray-50 rounded-2xl p-4">
                                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Gaji Pokok</p>
                                                        <p className="text-lg font-black text-gray-800 font-mono">
                                                            {formatRupiah(myCalc ? myCalc.salaryIncome : mySalary.base_salary)}
                                                        </p>
                                                        {mySalary.salary_type === "PERCENTAGE" && myStat && (
                                                            <p className="text-[10px] text-amber-600 font-semibold mt-1">
                                                                {formatPct(myStat.pct)}% kehadiran
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Persentase kehadiran — selalu ditampilkan */}
                                                {myStat && (
                                                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-4">
                                                        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide mb-3">
                                                            Kehadiran Bulan Ini
                                                        </p>
                                                        <div className="grid grid-cols-3 gap-3 mb-4">
                                                            <div className="bg-white rounded-xl p-3 text-center border border-blue-100">
                                                                <p className="text-2xl font-black text-emerald-600">{myStat.present}</p>
                                                                <p className="text-[10px] text-gray-400 font-medium mt-1">Tepat</p>
                                                            </div>
                                                            <div className="bg-white rounded-xl p-3 text-center border border-blue-100">
                                                                <p className="text-2xl font-black text-amber-600">{myStat.late}</p>
                                                                <p className="text-[10px] text-gray-400 font-medium mt-1"> Terlambat</p>
                                                            </div>
                                                            <div className="bg-white rounded-xl p-3 text-center border border-blue-100">
                                                                <p className="text-2xl font-black text-red-500">{myStat.absences.length}</p>
                                                                <p className="text-[10px] text-gray-400 font-medium mt-1"> Tidak Hadir</p>
                                                            </div>
                                                            <div className="bg-white rounded-xl p-3 text-center border border-blue-100">
                                                                <p className="text-2xl font-black text-cyan-600">{myStat.leave}</p>
                                                                <p className="text-[10px] text-gray-400 font-medium mt-1">Cuti</p>
                                                            </div>
                                                        </div>

                                                        {/* Progress bar persentase */}
                                                        <div className="space-y-2">
                                                            <div className="flex items-center justify-between">
                                                                <p className="text-xs font-bold text-gray-600">Persentase Kehadiran</p>
                                                                <span className={`text-sm font-black ${myStat.pct >= 90 ? "text-emerald-600" : myStat.pct >= 70 ? "text-amber-600" : "text-red-500"}`}>
                                                                    {formatPct(myStat.pct)}%
                                                                </span>
                                                            </div>
                                                            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                                                                <div
                                                                    className={`h-full rounded-full transition-all duration-700 ${myStat.pct >= 90 ? "bg-gradient-to-r from-emerald-400 to-green-500"
                                                                        : myStat.pct >= 70 ? "bg-gradient-to-r from-amber-400 to-orange-500"
                                                                            : "bg-gradient-to-r from-red-400 to-rose-500"
                                                                        }`}
                                                                    style={{ width: `${Math.min(myStat.pct, 100)}%` }}
                                                                />
                                                            </div>
                                                            <div className="flex justify-between text-[10px] text-gray-400">
                                                                <span>{myStat.pastWorkdays} hari kerja dari {myStat.totalWorkdays} total</span>
                                                                <span>Skor: {myStat.score.toFixed(1)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Rincian & gaji bersih — sama dengan halaman admin */}
                                                {myStat && myCalc && (() => {
                                                    const pokok = myCalc.salaryIncome;
                                                    const tWife = myCalc.allowanceWife;
                                                    const tChild = myCalc.allowanceChild;
                                                    const dLoan = myCalc.deductionLoan;
                                                    const dPension = myCalc.deductionPension;
                                                    const myOt = myCalc.overtime;
                                                    const gross = myCalc.grossIncome;
                                                    const net = myCalc.netSalary;
                                                    return (
                                                        <>
                                                            <div className="bg-gradient-to-br from-gray-50 to-white border border-gray-100 rounded-2xl p-4 space-y-2">
                                                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Rincian Gaji Bulan Ini</p>
                                                                <div className="flex justify-between text-sm">
                                                                    <span className="text-gray-500">Gaji Pokok{mySalary.salary_type === "PERCENTAGE" ? ` (${formatPct(myStat.pct)}%)` : ""}</span>
                                                                    <span className="font-bold text-gray-800 font-mono">{formatRupiah(pokok)}</span>
                                                                </div>
                                                                {tWife > 0 && (
                                                                    <div className="flex justify-between text-sm">
                                                                        <span className="text-gray-500">Tunjangan Istri</span>
                                                                        <span className="font-bold text-emerald-700 font-mono">+{formatRupiah(tWife)}</span>
                                                                    </div>
                                                                )}
                                                                {tChild > 0 && (
                                                                    <div className="flex justify-between text-sm">
                                                                        <span className="text-gray-500">Tunjangan Anak</span>
                                                                        <span className="font-bold text-emerald-700 font-mono">+{formatRupiah(tChild)}</span>
                                                                    </div>
                                                                )}
                                                                {myOt > 0 && (
                                                                    <div className="flex justify-between text-sm">
                                                                        <span className="text-gray-500">Lemburan</span>
                                                                        <span className="font-bold text-orange-600 font-mono">+{formatRupiah(myOt)}</span>
                                                                    </div>
                                                                )}
                                                                <div className="flex justify-between text-sm pt-2 border-t border-gray-100">
                                                                    <span className="text-gray-600 font-semibold">Total Penghasilan</span>
                                                                    <span className="font-black text-blue-600 font-mono">{formatRupiah(gross)}</span>
                                                                </div>
                                                                {dLoan > 0 && (
                                                                    <div className="flex justify-between text-sm">
                                                                        <span className="text-gray-500">Cicilan Kasbon</span>
                                                                        <span className="font-bold text-red-600 font-mono">-{formatRupiah(dLoan)}</span>
                                                                    </div>
                                                                )}
                                                                {dPension > 0 && (
                                                                    <div className="flex justify-between text-sm">
                                                                        <span className="text-gray-500">Dana Pensiun</span>
                                                                        <span className="font-bold text-red-600 font-mono">-{formatRupiah(dPension)}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl p-5">
                                                                <p className="text-[10px] font-bold text-white/70 uppercase tracking-wide mb-1">Gaji Bersih Bulan Ini</p>
                                                                <p className="text-3xl font-black text-white font-mono">{formatRupiah(net)}</p>
                                                                <p className="text-[11px] text-white/60 mt-1">
                                                                    {mySalary.salary_type === "FIXED"
                                                                        ? "Gaji tetap + tunjangan + lembur − potongan"
                                                                        : `${formatPct(myStat.pct)}% kehadiran · tunjangan & lembur penuh − potongan`}
                                                                </p>
                                                            </div>
                                                        </>
                                                    );
                                                })()}

                                                {/* Info tambahan untuk FIXED — tetap tampilkan persentase */}
                                                {mySalary.salary_type === "FIXED" && myStat && (
                                                    <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                                                        <p className="text-[11px] text-blue-700 font-medium">
                                                            ℹ Kamu memiliki gaji tetap — nominal gaji tidak berubah meskipun kehadiran kurang dari 100%.
                                                            Namun persentase kehadiran kamu tetap dicatat: <strong>{formatPct(myStat.pct)}%</strong>
                                                        </p>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* ════ TAB SLIP SAYA (non-admin) ════ */}
            {activeTab === "my-slip" && !isAdminRole(currentUser?.role) && (
                <div className="space-y-4 px-4 pb-8 max-w-3xl mx-auto">
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                        <div className="flex items-center gap-3 mb-5">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xl shadow-lg">

                            </div>
                            <div>
                                <p className="font-bold text-gray-800">Slip Gaji Saya</p>
                                <p className="text-xs text-gray-400 mt-0.5">Slip yang telah dikirimkan oleh admin</p>
                            </div>
                        </div>

                        {mySlipsLoading ? (
                            <div className="space-y-3">
                                {Array(3).fill(0).map((_, i) => (
                                    <div key={i} className="h-20 bg-gray-50 rounded-2xl animate-pulse" />
                                ))}
                            </div>
                        ) : mySlips.length === 0 ? (
                            <div className="text-center py-12">
                                <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                                    <span className="text-2xl opacity-40"><FileText className="w-5 h-5" /> </span>
                                </div>
                                <p className="text-sm text-gray-400 font-medium">Belum ada slip gaji yang dikirim</p>
                                <p className="text-xs text-gray-300 mt-1">Slip akan muncul setelah admin mengirimkannya</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {[...mySlips]
                                    .sort((a, b) => {
                                        if (b.year !== a.year) return b.year - a.year;
                                        return b.month - a.month;
                                    })
                                    .map(slip => {
                                        const sentDate = slip.sent_at
                                            ? new Date(slip.sent_at).toLocaleDateString("id-ID", {
                                                day: "numeric", month: "long", year: "numeric",
                                            })
                                            : null;
                                        return (
                                            <div key={slip.id} className="bg-gradient-to-br from-gray-50 to-white border border-gray-100 rounded-2xl p-4 hover:shadow-md transition">
                                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-lg shadow-md flex-shrink-0">
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-gray-800 text-sm">
                                                                Slip Gaji — {MONTH_NAMES[slip.month - 1]} {slip.year}
                                                            </p>
                                                            {sentDate && (
                                                                <p className="text-[11px] text-gray-400 mt-0.5">
                                                                    Dikirim {sentDate}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border bg-emerald-100 text-emerald-700 border-emerald-200">
                                                            Final
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <div className="text-right">
                                                            <p className="text-[10px] text-gray-400 font-medium">Gaji Bersih</p>
                                                            <p className="font-black text-emerald-700 font-mono text-sm">
                                                                {formatRupiah(slip.net_salary)}
                                                            </p>
                                                        </div>
                                                        <a
                                                            href={`/receipt/salary-slip/${slip.id}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex items-center gap-1.5 text-xs font-bold bg-gray-900 text-white px-4 py-2 rounded-xl hover:bg-gray-800 transition"
                                                        >
                                                            Lihat & Cetak
                                                        </a>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>
                        )}
                    </div>
                </div>
            )}


            {/* ════ TAB SLIP GAJI (admin only) ════ */}
            {activeTab === "salary-slip" && canViewSalary(currentUser?.role) && (
                <div className="space-y-4">
                    {/* Month Selector + Filter */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div>
                                <p className="text-sm font-bold text-gray-800">Slip Gaji</p>
                                <p className="text-[11px] text-gray-400 mt-0.5">
                                    Data dari rekapan gaji · Gunakan tombol <strong>Slip</strong> untuk generate
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
                                ></button>
                            </div>
                        </div>

                        {/* NEW: Toggle Karyawan / PKL / Semua */}
                        <div className="flex items-center justify-between gap-3 flex-wrap border-t border-gray-100 pt-3">
                            <div className="flex items-center gap-0.5 bg-gray-100 p-1 rounded-xl">
                                <button
                                    onClick={() => setSlipPklFilter("karyawan")}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${slipPklFilter === "karyawan"
                                        ? "bg-white text-gray-800 shadow-sm"
                                        : "text-gray-400 hover:text-gray-600"
                                        }`}
                                >
                                    Karyawan
                                </button>
                                <button
                                    onClick={() => setSlipPklFilter("pkl")}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${slipPklFilter === "pkl"
                                        ? "bg-amber-500 text-white shadow-sm"
                                        : "text-gray-400 hover:text-amber-600"
                                        }`}
                                >
                                    PKL
                                </button>
                                <button
                                    onClick={() => setSlipPklFilter("all")}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${slipPklFilter === "all"
                                        ? "bg-[#1a1a2e] text-white shadow-sm"
                                        : "text-gray-400 hover:text-gray-600"
                                        }`}
                                >
                                    Semua
                                </button>
                            </div>
                            <span className="text-[10px] font-bold text-gray-400">
                                {visibleSalarySlips.length} slip
                                {slipPklFilter === "pkl" ? " PKL" : slipPklFilter === "karyawan" ? " karyawan" : " total"}
                            </span>
                        </div>
                    </div>

                    {/* Slip List */}
                    {loading ? (
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
                    ) : visibleSalarySlips.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
                            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3 text-gray-400">
                                {slipPklFilter === "pkl" ? <GraduationCap className="w-7 h-7" /> : <Briefcase className="w-7 h-7" />}
                            </div>
                            <p className="text-sm text-gray-400 font-medium">
                                Belum ada slip {slipPklFilter === "pkl" ? "PKL" : slipPklFilter === "karyawan" ? "karyawan" : ""} bulan ini
                            </p>
                            <p className="text-xs text-gray-300 mt-1 mb-4">
                                Klik tombol di bawah untuk generate slip {slipPklFilter === "pkl" ? "semua PKL" : slipPklFilter === "karyawan" ? "semua karyawan" : "semua user"}
                            </p>
                            <button
                                onClick={async () => {
                                    const base = allUsers.length > 0 ? allUsers : await fetchAllUsers();
                                    // Hormati filter aktif: cuma generate grup yang dipilih
                                    const usersToGen = (base as UserInfo[]).filter(u => {
                                        if (slipPklFilter === "all") return true;
                                        return slipPklFilter === "pkl" ? isPKLRole(u.role) : !isPKLRole(u.role);
                                    });
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
                            >Generate Slip Sekarang</button>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {visibleSalarySlips.map(slip => (
                                <SalarySlipCard
                                    key={slip.id}
                                    slip={slip}
                                    onFinalize={() => fetchSalarySlips(selectedSlipMonth.year, selectedSlipMonth.month)}
                                    onRefresh={() => fetchSalarySlips(selectedSlipMonth.year, selectedSlipMonth.month)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {showMonthlyOffModal && canManage && (
                <MonthlyOffModal
                    users={
                        isAdmin
                            ? allUsers
                            : allUsers.filter(u => (getEffectiveSubordinates(userRoles) as string[]).includes(u.role))
                    }
                    calYear={calYear}
                    calMonth={calMonth}
                    onClose={() => setShowMonthlyOffModal(false)}
                    onSaved={() => {
                        fetchMonthlyOffs(calYear, calMonth);
                        fetchAllDateOffs();
                        fetchAllDateWorks();
                        fetchDayOffs();
                    }}
                />
            )}
            {sendContractUser && isAdmin && (
                <SendContractModal
                    user={{ id: sendContractUser.id, name: sendContractUser.name }}
                    onClose={() => setSendContractUser(null)}
                    onSent={() => { fetchAllUsers(); setSendContractUser(null); }}
                />
            )}
            {contractDetailUser && isAdmin && (
                <ContractDetailModal
                    userId={contractDetailUser.id}
                    userName={contractDetailUser.name}
                    onClose={() => setContractDetailUser(null)}
                />
            )}
            {showShiftScheduleModal && canManage && (
                <ShiftScheduleModal
                    users={
                        isAdmin
                            ? allUsers
                            : allUsers.filter(u => (getEffectiveSubordinates(userRoles) as string[]).includes(u.role))
                    }
                    schedules={shiftSchedules}
                    calYear={calYear}
                    calMonth={calMonth}
                    onClose={() => setShowShiftScheduleModal(false)}
                    onSaved={async () => {
                        await fetchShiftSchedules(calYear, calMonth);  // await → Ringkasan & list sinkron
                        await fetchAttendance();
                        fetchTodayStatus();
                    }}
                />
            )}

            {showManualCheckoutModal && isAdminRole(currentUser?.role) && (
                <ManualCheckoutModal
                    users={allUsers}
                    onClose={() => setShowManualCheckoutModal(false)}
                    onSaved={() => { refreshAll(); fetchTodayStatus(); }}
                />
            )}
            {showEarlyCheckoutModal && (
                <EarlyCheckoutRequestModal
                    checkoutAt={todayStatus?.checkoutAt}
                    onClose={() => setShowEarlyCheckoutModal(false)}
                    onSaved={() => { fetchTodayStatus(); }}
                />
            )}
            {editCheckoutData && (
                <EditCheckoutModal
                    userName={editCheckoutData.userName}
                    dateKey={editCheckoutData.dateKey}
                    currentCheckoutIso={editCheckoutData.currentCheckoutIso}
                    onClose={() => setEditCheckoutData(null)}
                    onSave={async (time) => {
                        const res = await fetch("/api/attendance/edit-checkout", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(
                                time === null
                                    ? { user_id: editCheckoutData.userId, date: editCheckoutData.dateKey, clear: true } // ✅ NEW — kosongkan jam pulang
                                    : { user_id: editCheckoutData.userId, date: editCheckoutData.dateKey, checkout_time: time }
                            ),
                        });
                        const d = await res.json();
                        if (!d.success) throw new Error(d.message || "Gagal menyimpan jam pulang");
                        if (d.warning) alert(d.warning);
                        await refreshAll();
                        fetchTodayStatus();
                        setEditCheckoutData(null);
                    }}
                />
            )}
            {showManualModal && isAdminRole(currentUser?.role) && (
                <ManualAttendanceModal
                    users={allUsers}
                    prefillDate={manualPrefillDate}
                    prefillUserId={manualPrefillUser}
                    editData={editManualData}
                    pklMode={calendarPklFilter === "pkl" ? true : calendarPklFilter === "karyawan" ? false : undefined}
                    onClose={() => { setShowManualModal(false); setEditManualData(null); }}
                    onSaved={() => {
                        refreshAll();
                        fetchTodayStatus();
                    }}
                />
            )}
            {showSalaryModal && isAdminRole(currentUser?.role) && (
                <SalaryModal
                    users={
                        salaryModalPklOnly === true
                            ? allUsers.filter(u => isPKLRole(u.role))
                            : salaryModalPklOnly === false
                                ? allUsers.filter(u => !isPKLRole(u.role))
                                : allUsers
                    }
                    salaries={salaries}
                    onClose={() => { setShowSalaryModal(false); setSalaryModalPklOnly(undefined); }}
                    onSaved={() => { fetchSalaries(); setShowSalaryModal(false); setSalaryModalPklOnly(undefined); }}
                />
            )}
            {showLeaveModal && isAdminRole(currentUser?.role)
                && (
                    <LeaveModal users={allUsers} leaveData={leaveData} calYear={calYear} calMonth={calMonth} onClose={() => setShowLeaveModal(false)} onSaved={() => { fetchLeaveData(calYear, calMonth); }} />
                )}
            {showShiftModal && canManage && (
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
                    calYear={calYear}
                    calMonth={calMonth}
                    onClose={() => setEditAllowanceUser(null)}
                    onSaved={() => {
                        fetchAllowances(calYear, calMonth);
                        setEditAllowanceUser(null);
                    }}
                />
            )}
            {showSwapModal && canManage && (
                <SwapDayOffModal
                    users={isAdmin ? allUsers : allUsers.filter(u => u.id !== currentUser?.id)}
                    dayOffs={dayOffs}
                    allDateOffs={allDateOffs}
                    allDateWorks={allDateWorks}
                    calYear={calYear}
                    calMonth={calMonth}
                    onClose={() => setShowSwapModal(false)}
                    onSaved={() => {
                        fetchAllDateOffs();
                        fetchAllDateWorks();
                        fetchDayOffs();
                    }}
                />
            )}
            {attendanceSummaryDetail && (
                <AttendanceSummaryDetailModal
                    detail={attendanceSummaryDetail}
                    onClose={() => setAttendanceSummaryDetail(null)}
                />
            )}

            {leaveDetail && (
                <LeaveDetailModal
                    name={leaveDetail.name}
                    dates={leaveDetail.dates}
                    monthLabel={`${MONTH_NAMES[calMonth]} ${calYear}`}
                    onClose={() => setLeaveDetail(null)}
                />
            )}

            {absentPopupMode === "karyawan" && selectedDate && selectedAbsentKaryawan.length > 0 && (
                <AbsentUsersModal
                    date={selectedDate}
                    absentUsers={selectedAbsentKaryawan}
                    isAdmin={isAdmin}
                    mode="karyawan"
                    onAbsenManual={(userId) => openAddManual(selectedDate, userId)}
                    onClose={() => setAbsentPopupMode(null)}
                />
            )}
            {absentPopupMode === "pkl" && selectedDate && selectedAbsentPKL.length > 0 && (
                <AbsentUsersModal
                    date={selectedDate}
                    absentUsers={selectedAbsentPKL}
                    isAdmin={isAdmin}
                    mode="pkl"
                    onAbsenManual={(userId) => openAddManual(selectedDate, userId)}
                    onClose={() => setAbsentPopupMode(null)}
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