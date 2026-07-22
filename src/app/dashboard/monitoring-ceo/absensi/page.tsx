"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUserClient } from "@/lib/auth-client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { isPKLRole } from "@/lib/permissions";
import {
  ArrowLeft, Clock, CheckCircle2, Umbrella, Users, Trophy, Inbox, Sun, Moon,
  Medal, RefreshCw, Activity, CalendarDays, TrendingUp, ChevronRight,
} from "lucide-react";
import { pickSchedule, SHIFT_DEFAULTS, type ShiftScheduleRow } from "@/lib/shiftSchedule";

// ─── Types ─────────────────────────────────────────────────────────────────
type UserInfo = {
  id: string; name: string; role: string;
  shift?: "PAGI" | "SORE" | null; created_at?: string | null;
};
type Attendance = {
  id: string; user_id?: string; user_name: string; user_role: string;
  user_shift?: "PAGI" | "SORE"; check_in_time: string; created_at: string;
  status: string; method: string; late_weight?: number | null;
};
type ManualAttendance = {
  id: string; user_id: string; attendance_date: string; check_in_time: string;
  status: "PRESENT" | "LATE" | "SICK" | "PERMIT" | "ABSENT" | "LEAVE";
  notes: string | null;
  users?: { id: string; name: string; role: string };
};
type DayOff = { id: string; user_id: string; day_of_week: number };
type DateOff = { id: string; user_id: string; off_date: string };
type MonthlyOff = { id: string; user_id: string; off_date: string; year: number; month: number };
type LeaveRequest = { id: string; leave_date: string; reason: string | null; status: string };
type UserLeaveData = { user: { id: string; name: string; role: string }; requests: LeaveRequest[] };

type GroupFilter = "karyawan" | "pkl" | "semua";

type RosterEntry = {
  userId: string; name: string; role: string; isPkl: boolean;
  checkInTime: string | null;
  kind: "PRESENT" | "LATE" | "SKIP" | "LEAVE" | "DAY_OFF" | "SICK" | "PERMIT" | "ABSENT" | "BELUM_ABSEN";
  shift: "PAGI" | "SORE";
  shiftLabel: string;
  shiftFromSchedule: boolean;
  shiftIsCustom?: boolean;
};

type MonthStat = {
  userId: string; name: string; role: string; isPkl: boolean;
  present: number; late: number; absent: number; leave: number;
  totalWorkdays: number; pastWorkdays: number; score: number; pct: number;
};

// ─── Constants ───────────────────────────────────────────────────────────────
const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const CEO_MONITORING_ROLES = ["ADMIN", "PROGRAMMER"] as const;
const SHIFT_LATE: Record<"PAGI" | "SORE", number> = { PAGI: 8 * 60, SORE: 16 * 60 };

const KIND_CONFIG: Record<RosterEntry["kind"], { label: string; bg: string; color: string; border: string }> = {
  PRESENT: { label: "Tepat Waktu", bg: "bg-emerald-50", color: "text-emerald-700", border: "border-emerald-200" },
  LATE: { label: "Terlambat", bg: "bg-amber-50", color: "text-amber-700", border: "border-amber-200" },
  SKIP: { label: "Skip", bg: "bg-gray-50", color: "text-gray-500", border: "border-gray-200" },
  LEAVE: { label: "Cuti", bg: "bg-cyan-50", color: "text-cyan-700", border: "border-cyan-200" },
  DAY_OFF: { label: "Libur", bg: "bg-orange-50", color: "text-orange-600", border: "border-orange-200" },
  SICK: { label: "Sakit", bg: "bg-blue-50", color: "text-blue-700", border: "border-blue-200" },
  PERMIT: { label: "Izin", bg: "bg-violet-50", color: "text-violet-700", border: "border-violet-200" },
  ABSENT: { label: "Tidak Hadir", bg: "bg-red-50", color: "text-red-600", border: "border-red-200" },
  BELUM_ABSEN: { label: "Belum Absen", bg: "bg-gray-50", color: "text-gray-400", border: "border-gray-200" },
};

const AV_COLORS = [
  "bg-violet-100 text-violet-700", "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700", "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-700", "bg-cyan-100 text-cyan-700",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function pad2(n: number) { return String(n).padStart(2, "0"); }
function initials(name: string) { return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase(); }
function avBg(name: string) {
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AV_COLORS[Math.abs(h) % AV_COLORS.length];
}
function toWIBDateKey(iso: string): string {
  return new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function getWIBToday(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function toWIBTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
}
function formatPct(n: number): string {
  return String(Math.floor(n * 100 + 1e-6) / 100);
}
function minToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${pad2(h)}:${pad2(m)}`;
}
function isLateAuto(t: string, shift: "PAGI" | "SORE" = "PAGI"): boolean {
  const wib = new Date(new Date(t).getTime() + 7 * 60 * 60 * 1000);
  const total = wib.getUTCHours() * 60 + wib.getUTCMinutes();
  return total > SHIFT_LATE[shift];
}
function getDisplayStatus(a: Attendance): "PRESENT" | "LATE" | "SKIP" {
  if (a.method === "FORCE") return "PRESENT";
  if (a.method === "SKIP" || a.status === "SKIPPED_MANUAL") return "SKIP";
  if (a.late_weight != null) {
    if (a.late_weight >= 1) return "PRESENT";
    if (a.late_weight > 0) return "LATE";
    return "SKIP";
  }
  return isLateAuto(a.check_in_time || a.created_at, a.user_shift ?? "PAGI") ? "LATE" : "PRESENT";
}
function getUserStartDate(createdAt: string | null | undefined, year: number, month: number): string {
  const firstOfMonth = `${year}-${pad2(month + 1)}-01`;
  if (!createdAt) return firstOfMonth;
  const createdWIB = toWIBDateKey(createdAt);
  return createdWIB > firstOfMonth ? createdWIB : firstOfMonth;
}
function getUserRoles(user: any): string[] {
  if (!user) return [];
  if (Array.isArray(user.roles) && user.roles.length > 0) return user.roles as string[];
  return user.role ? [user.role] : [];
}
function userCanAccessCeoMonitoring(user: any): boolean {
  return getUserRoles(user).some(r => (CEO_MONITORING_ROLES as readonly string[]).includes(r));
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function RosterRow({ entry }: { entry: RosterEntry }) {
  const cfg = KIND_CONFIG[entry.kind];
  const ShiftIcon = entry.shift === "PAGI" ? Sun : Moon;
  return (
    <div className="px-4 sm:px-6 py-3 flex items-center gap-3 hover:bg-gray-50/70 transition-colors">
      <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-[10px] sm:text-[11px] font-black flex-shrink-0 ${avBg(entry.name)}`}>
        {initials(entry.name)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-800 truncate">{entry.name}</p>
        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
          <span className={`inline-block text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider ${entry.isPkl ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
            {entry.isPkl ? "PKL" : entry.role.replace(/_/g, " ")}
          </span>
          {/* Shift chip — mobile inline */}
          <span className={`sm:hidden inline-flex items-center gap-0.5 text-[9px] font-bold ${entry.shiftIsCustom ? "text-rose-700" : entry.shift === "PAGI" ? "text-amber-700" : "text-indigo-700"}`}>
            <ShiftIcon className="w-2.5 h-2.5" /> {entry.shift}
          </span>
        </div>
      </div>
      {/* Shift info — desktop */}
      <div className={`hidden sm:flex flex-col items-end text-right flex-shrink-0 px-2.5 py-1 rounded-lg border ${entry.shiftIsCustom ? "bg-rose-50 border-rose-200" : entry.shift === "PAGI" ? "bg-amber-50 border-amber-200" : "bg-indigo-50 border-indigo-200"}`}>
        <span className={`inline-flex items-center gap-1 text-[10px] font-black ${entry.shiftIsCustom ? "text-rose-700" : entry.shift === "PAGI" ? "text-amber-700" : "text-indigo-700"}`}>
          <ShiftIcon className="w-3 h-3" /> {entry.shift}
          {entry.shiftFromSchedule && !entry.shiftIsCustom && <span className="text-[8px] font-bold text-violet-500 normal-case">·jadwal</span>}
          {entry.shiftIsCustom && <span className="text-[8px] font-black text-rose-600 normal-case">·custom</span>}
        </span>
        <span className={`text-[9px] font-mono ${entry.shiftIsCustom ? "text-rose-500 font-bold" : "text-gray-400"}`}>{entry.shiftLabel}</span>
      </div>
      {entry.checkInTime && (
        <span className="font-mono font-black text-gray-700 text-xs flex-shrink-0 bg-gray-50 border border-gray-100 px-2 py-1 rounded-lg">
          {entry.checkInTime}
        </span>
      )}
      <span className={`inline-flex items-center text-[10px] font-black px-2.5 py-1 rounded-full border flex-shrink-0 ${cfg.bg} ${cfg.color} ${cfg.border}`}>
        {cfg.label}
      </span>
    </div>
  );
}

// ─── Skeleton components (inline, lightweight) ─────────────────────────────
function StatCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-4 overflow-hidden">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gray-100 animate-pulse" />
      </div>
      <div className="h-2.5 w-20 bg-gray-100 rounded animate-pulse mb-2" />
      <div className="h-7 w-14 bg-gray-100 rounded animate-pulse" />
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="px-4 sm:px-6 py-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-gray-100 animate-pulse flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-32 bg-gray-100 rounded animate-pulse" />
        <div className="h-2.5 w-20 bg-gray-100 rounded animate-pulse" />
      </div>
      <div className="w-16 h-6 bg-gray-100 rounded-lg animate-pulse" />
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function MonitoringCeoAbsensiPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const now = useMemo(() => new Date(), []);
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("semua");

  const [allUsers, setAllUsers] = useState<UserInfo[]>([]);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [manualRecords, setManualRecords] = useState<ManualAttendance[]>([]);
  const [dayOffs, setDayOffs] = useState<DayOff[]>([]);
  const [dateOffs, setDateOffs] = useState<DateOff[]>([]);
  const [monthlyOffs, setMonthlyOffs] = useState<MonthlyOff[]>([]);
  const [leaveData, setLeaveData] = useState<UserLeaveData[]>([]);
  const [shiftSchedules, setShiftSchedules] = useState<ShiftScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Guard: hanya ADMIN & PROGRAMMER ──────────────────────────────────────
  useEffect(() => {
    getCurrentUserClient().then(u => {
      setCurrentUser(u);
      setAuthChecked(true);
      if (u && !userCanAccessCeoMonitoring(u)) router.replace("/dashboard");
    });
  }, [router]);

  const fetchAll = useCallback(async (year: number, month: number, silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const [usersRes, attRes, manualRes, dayOffRes, dateOffRes, monthlyOffRes, leaveRes, shiftRes] = await Promise.all([
        fetch("/api/attendance/users").then(r => r.json()),
        fetch("/api/attendance").then(r => r.json()),
        fetch(`/api/attendance/manual?year=${year}&month=${month + 1}`).then(r => r.json()),
        fetch("/api/attendance/day-off").then(r => r.json()),
        fetch("/api/attendance/date-off").then(r => r.json()),
        fetch(`/api/attendance/monthly-off?year=${year}&month=${month + 1}`).then(r => r.json()),
        fetch(`/api/attendance/leave?year=${year}&month=${month + 1}`).then(r => r.json()),
        fetch(`/api/attendance/shift-schedule?year=${year}&month=${month + 1}`).then(r => r.json()),
      ]);
      if (usersRes?.success) setAllUsers(usersRes.data || []);
      if (attRes?.success) setAttendances(attRes.data || []);
      if (manualRes?.success) setManualRecords(manualRes.data || []);
      if (dayOffRes?.success) setDayOffs(dayOffRes.data || []);
      if (dateOffRes?.success) setDateOffs(dateOffRes.data || []);
      if (monthlyOffRes?.success) setMonthlyOffs(monthlyOffRes.data || []);
      if (leaveRes?.success) {
        const raw = leaveRes.data;
        setLeaveData(Array.isArray(raw) ? raw : raw ? [raw] : []);
      }
      if (shiftRes?.success) setShiftSchedules(shiftRes.data || []);
    } catch (err) {
      console.error("[monitoring-ceo/absensi] fetch error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchAll(period.year, period.month); }, [period, fetchAll]);

  // ── Lookup maps ───────────────────────────────────────────────────────
  const userById = useMemo(() => {
    const m: Record<string, UserInfo> = {};
    allUsers.forEach(u => { m[u.id] = u; });
    return m;
  }, [allUsers]);

  const schedulesByUser = useMemo(() => {
    const m: Record<string, ShiftScheduleRow[]> = {};
    shiftSchedules.forEach(s => { (m[s.user_id] ??= []).push(s); });
    return m;
  }, [shiftSchedules]);

  const effectiveShiftFor = useCallback((userId: string, dateKey: string) => {
    const sched = pickSchedule(schedulesByUser[userId] ?? [], dateKey);
    if (sched) {
      const base = SHIFT_DEFAULTS[sched.shift];
      const custom = sched.open_hour != null && sched.late_hour != null && sched.close_hour != null;
      return {
        shift: sched.shift,
        fromSchedule: true,
        isCustom: custom,
        openMin: custom ? sched.open_hour! * 60 + (sched.open_minute ?? 0) : base.open_hour * 60 + base.open_minute,
        closeMin: custom ? sched.close_hour! * 60 + (sched.close_minute ?? 0) : base.close_hour * 60 + base.close_minute,
      };
    }
    const shift = (userById[userId]?.shift ?? "PAGI") as "PAGI" | "SORE";
    const base = SHIFT_DEFAULTS[shift];
    return {
      shift,
      fromSchedule: false,
      isCustom: false,
      openMin: base.open_hour * 60 + base.open_minute,
      closeMin: base.close_hour * 60 + base.close_minute,
    };
  }, [schedulesByUser, userById]);

  const dayOffByUser = useMemo(() => {
    const m: Record<string, Set<number>> = {};
    dayOffs.forEach(d => { (m[d.user_id] ??= new Set()).add(d.day_of_week); });
    return m;
  }, [dayOffs]);

  const dateOffByUser = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    dateOffs.forEach(d => { (m[d.user_id] ??= new Set()).add(d.off_date); });
    return m;
  }, [dateOffs]);

  const monthlyOffByUser = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    monthlyOffs.forEach(o => { (m[o.user_id] ??= new Set()).add(o.off_date); });
    return m;
  }, [monthlyOffs]);

  const leaveByUser = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    leaveData.forEach(ld => {
      const uid = ld.user?.id;
      if (!uid) return;
      (ld.requests ?? []).forEach(r => (m[uid] ??= new Set()).add(r.leave_date));
    });
    return m;
  }, [leaveData]);

  const isDayOffForUser = useCallback((userId: string, dateKey: string): boolean => {
    if (monthlyOffByUser[userId]?.has(dateKey)) return true;
    const dow = new Date(dateKey + "T12:00:00").getDay();
    return (dayOffByUser[userId]?.has(dow) ?? false) || (dateOffByUser[userId]?.has(dateKey) ?? false);
  }, [dayOffByUser, dateOffByUser, monthlyOffByUser]);

  const autoByUserDate = useMemo(() => {
    const m: Record<string, Attendance> = {};
    attendances.forEach(a => {
      if (!a.user_id) return;
      m[`${a.user_id}_${toWIBDateKey(a.check_in_time || a.created_at)}`] = a;
    });
    return m;
  }, [attendances]);

  const manualByUserDate = useMemo(() => {
    const m: Record<string, ManualAttendance> = {};
    manualRecords.forEach(mr => { m[`${mr.user_id}_${mr.attendance_date}`] = mr; });
    return m;
  }, [manualRecords]);

  const filteredUsers = useMemo(() => {
    return allUsers.filter(u => {
      if (groupFilter === "semua") return true;
      return groupFilter === "pkl" ? isPKLRole(u.role) : !isPKLRole(u.role);
    });
  }, [allUsers, groupFilter]);

  const todayKey = getWIBToday();
  const isCurrentMonthSelected = period.year === now.getFullYear() && period.month === now.getMonth();

  const todayRoster: RosterEntry[] = useMemo(() => {
    return filteredUsers.map(u => {
      const startDate = getUserStartDate(u.created_at, now.getFullYear(), now.getMonth());
      const autoRec = autoByUserDate[`${u.id}_${todayKey}`];
      const manualRec = manualByUserDate[`${u.id}_${todayKey}`];
      const isOff = isDayOffForUser(u.id, todayKey);
      const isLeave = (leaveByUser[u.id]?.has(todayKey) ?? false) && (!manualRec || manualRec.status === "LEAVE");
      const eff = effectiveShiftFor(u.id, todayKey);

      let kind: RosterEntry["kind"] = "BELUM_ABSEN";
      let checkInTime: string | null = null;

      if (manualRec) {
        checkInTime = ["PRESENT", "LATE"].includes(manualRec.status) ? toWIBTime(manualRec.check_in_time) : null;
        kind = manualRec.status as RosterEntry["kind"];
      } else if (autoRec) {
        checkInTime = toWIBTime(autoRec.check_in_time || autoRec.created_at);
        kind = getDisplayStatus(autoRec);
      } else if (isLeave) {
        kind = "LEAVE";
      } else if (isOff || todayKey < startDate) {
        kind = "DAY_OFF";
      }

      return {
        userId: u.id, name: u.name, role: u.role, isPkl: isPKLRole(u.role), checkInTime, kind,
        shift: eff.shift, shiftLabel: `${minToHHMM(eff.openMin)}–${minToHHMM(eff.closeMin)}`, shiftFromSchedule: eff.fromSchedule,
        shiftIsCustom: eff.isCustom,
      };
    }).sort((a, b) => {
      const rank = (k: RosterEntry["kind"]) =>
        k === "PRESENT" ? 0 : k === "LATE" ? 1 : k === "SKIP" ? 2 :
          k === "BELUM_ABSEN" ? 3 : (k === "SICK" || k === "PERMIT" || k === "ABSENT") ? 4 :
            k === "LEAVE" ? 5 : 6;
      const r = rank(a.kind) - rank(b.kind);
      if (r !== 0) return r;
      if (a.checkInTime && b.checkInTime) return a.checkInTime.localeCompare(b.checkInTime);
      return a.name.localeCompare(b.name, "id");
    });
  }, [filteredUsers, autoByUserDate, manualByUserDate, isDayOffForUser, leaveByUser, todayKey, now, effectiveShiftFor]);

  const todaySummary = useMemo(() => {
    const hadir = todayRoster.filter(r => r.kind === "PRESENT" || r.kind === "LATE").length;
    const telat = todayRoster.filter(r => r.kind === "LATE").length;
    const libur = todayRoster.filter(r => r.kind === "DAY_OFF" || r.kind === "LEAVE").length;
    const belumAbsen = todayRoster.filter(r => r.kind === "BELUM_ABSEN").length;
    return { hadir, telat, libur, belumAbsen, total: todayRoster.length };
  }, [todayRoster]);

  // ── Ringkasan bulanan ─────────────────────────────────────────────────
  const monthStats: MonthStat[] = useMemo(() => {
    const dim = new Date(period.year, period.month + 1, 0).getDate();

    return filteredUsers.map(u => {
      const startDate = getUserStartDate(u.created_at, period.year, period.month);
      let present = 0, late = 0, absent = 0, leave = 0, totalWorkdays = 0, pastWorkdays = 0, score = 0;

      for (let d = 1; d <= dim; d++) {
        const dk = `${period.year}-${pad2(period.month + 1)}-${pad2(d)}`;
        if (dk < startDate) continue;

        const isPastOrToday = !(isCurrentMonthSelected && dk > todayKey);
        const manualRec = manualByUserDate[`${u.id}_${dk}`];
        const autoRec = autoByUserDate[`${u.id}_${dk}`];
        const isLeaveDay = (leaveByUser[u.id]?.has(dk) ?? false) && (!manualRec || manualRec.status === "LEAVE");
        const isOffDay = isDayOffForUser(u.id, dk);

        let dayStatus: "PRESENT" | "LATE" | "ABSENT" | null = null;
        if (manualRec) {
          dayStatus = manualRec.status === "PRESENT" ? "PRESENT"
            : manualRec.status === "LATE" ? "LATE"
              : manualRec.status === "LEAVE" ? null
                : "ABSENT";
        } else if (autoRec) {
          const st = getDisplayStatus(autoRec);
          dayStatus = st === "SKIP" ? "ABSENT" : st;
        }

        if (isLeaveDay) {
          totalWorkdays++;
          if (isPastOrToday) { pastWorkdays++; leave++; score += 1; }
          continue;
        }
        if (isOffDay) {
          if (isPastOrToday && (dayStatus === "PRESENT" || dayStatus === "LATE")) {
            totalWorkdays++; pastWorkdays++;
            if (dayStatus === "PRESENT") { present++; score += 1; } else { late++; score += 0.5; }
          }
          continue;
        }
        totalWorkdays++;
        if (!isPastOrToday) continue;
        pastWorkdays++;
        if (dayStatus === "PRESENT") { present++; score += 1; }
        else if (dayStatus === "LATE") { late++; score += 0.5; }
        else absent++;
      }

      const pct = totalWorkdays > 0 ? Math.min(100, (score / totalWorkdays) * 100) : 0;
      return {
        userId: u.id, name: u.name, role: u.role, isPkl: isPKLRole(u.role),
        present, late, absent, leave, totalWorkdays, pastWorkdays, score, pct,
      };
    }).sort((a, b) => a.name.localeCompare(b.name, "id"));
  }, [filteredUsers, manualByUserDate, autoByUserDate, leaveByUser, isDayOffForUser, period, isCurrentMonthSelected, todayKey]);

  const topPerformers = useMemo(() => {
    return [...monthStats]
      .filter(s => s.pastWorkdays > 0)
      .sort((a, b) => b.pct - a.pct || b.score - a.score)
      .slice(0, 5);
  }, [monthStats]);

  // ── Access denied check (non-blocking) ─────────────────────────────────
  const accessDenied = authChecked && currentUser && !userCanAccessCeoMonitoring(currentUser);

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-[#F7F7F8]">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 space-y-4 sm:space-y-5 animate-fadeIn">

          {/* ─── HERO HEADER ─── */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f0f1e] via-[#1a1a2e] to-[#16213e] p-5 sm:p-7 shadow-xl shadow-slate-900/20">
            <div className="absolute -top-16 -right-16 w-48 h-48 bg-violet-500/20 rounded-full blur-3xl" />
            <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-blue-500/15 rounded-full blur-3xl" />

            <div className="relative flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row">
              <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                <button
                  onClick={() => router.push("/dashboard")}
                  className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 text-white flex items-center justify-center transition flex-shrink-0"
                  title="Kembali"
                >
                  <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg">
                  <Users className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-white tracking-tight leading-none">
                      Monitor Absensi
                    </h1>
                    <span className="inline-flex items-center gap-1.5 text-[9px] sm:text-[10px] font-bold text-emerald-300 bg-emerald-500/20 backdrop-blur-sm border border-emerald-400/30 px-2 py-0.5 rounded-full flex-shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      LIVE
                    </span>
                  </div>
                  <p className="text-[11px] sm:text-sm text-white/60 font-medium leading-snug truncate">
                    {todaySummary.total > 0
                      ? `${todaySummary.total} orang terpantau · ${MONTH_NAMES[period.month]} ${period.year}`
                      : `Monitoring absensi tim — ${MONTH_NAMES[period.month]} ${period.year}`}
                  </p>
                </div>
              </div>

              <button
                onClick={() => fetchAll(period.year, period.month, true)}
                disabled={loading || refreshing}
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 text-white flex items-center justify-center transition disabled:opacity-50 flex-shrink-0 self-end sm:self-auto"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 ${loading || refreshing ? "animate-spin" : ""}`} />
              </button>
            </div>

            {/* Insight strip */}
            <div className="relative mt-5 sm:mt-6 flex items-center gap-3 sm:gap-6 text-white/80 text-[11px] sm:text-xs font-medium">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                <span>{loading ? "…" : todaySummary.hadir} hadir</span>
              </div>
              <div className="h-3 w-px bg-white/20" />
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-300" />
                <span>{loading ? "…" : todaySummary.telat} telat</span>
              </div>
              <div className="h-3 w-px bg-white/20" />
              <div className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-red-300" />
                <span>{loading ? "…" : todaySummary.belumAbsen} belum absen</span>
              </div>
            </div>
          </div>

          {/* ─── Access denied banner (non-blocking) ─── */}
          {accessDenied && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-3 rounded-2xl font-semibold flex items-center gap-2">
              <span>Anda dialihkan ke dashboard — halaman ini khusus Admin & Programmer.</span>
            </div>
          )}

          {/* ─── FILTER PANEL ─── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-2 mr-1">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#1a1a2e] to-[#16213e] text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                  <CalendarDays className="w-3.5 h-3.5" />
                </div>
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-wider hidden sm:inline">Filter</p>
              </div>

              <select
                value={period.month}
                onChange={e => setPeriod(p => ({ ...p, month: Number(e.target.value) }))}
                className="h-9 border border-gray-200 rounded-xl px-3 text-xs font-bold bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-400 focus:bg-white transition cursor-pointer"
              >
                {MONTH_NAMES.map((name, idx) => {
                  const isFuture = period.year === now.getFullYear() && idx > now.getMonth();
                  return <option key={idx} value={idx} disabled={isFuture}>{name}</option>;
                })}
              </select>

              <select
                value={period.year}
                onChange={e => {
                  const newYear = Number(e.target.value);
                  setPeriod(p => ({
                    year: newYear,
                    month: (newYear === now.getFullYear() && p.month > now.getMonth()) ? now.getMonth() : p.month,
                  }));
                }}
                className="h-9 border border-gray-200 rounded-xl px-3 text-xs font-bold bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-400 focus:bg-white transition cursor-pointer"
              >
                {Array.from({ length: 4 }, (_, i) => now.getFullYear() - 3 + i).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>

              <button
                onClick={() => setPeriod({ year: now.getFullYear(), month: now.getMonth() })}
                disabled={isCurrentMonthSelected}
                className="h-9 px-3 rounded-xl text-[11px] font-black text-violet-700 bg-violet-50 border border-violet-200 hover:bg-violet-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Bulan Ini
              </button>

              <div className="w-px h-6 bg-gray-100 mx-0.5 hidden sm:block" />

              <div className="flex items-center gap-0.5 bg-gray-50 p-0.5 rounded-xl border border-gray-100 ml-auto sm:ml-0">
                {(["semua", "karyawan", "pkl"] as GroupFilter[]).map(f => (
                  <button
                    key={f}
                    onClick={() => setGroupFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all ${groupFilter === f
                        ? f === "pkl"
                          ? "bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-sm"
                          : "bg-gradient-to-br from-[#1a1a2e] to-[#16213e] text-white shadow-sm"
                        : "text-gray-500 hover:text-gray-800 hover:bg-white"
                      }`}
                  >
                    {f === "semua" ? "Semua" : f === "karyawan" ? "Karyawan" : "PKL"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ─── SUMMARY STAT CARDS ─── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            {loading ? (
              <>
                <StatCardSkeleton />
                <StatCardSkeleton />
                <StatCardSkeleton />
                <StatCardSkeleton />
              </>
            ) : (
              [
                { label: "Hadir Hari Ini", value: todaySummary.hadir, icon: <CheckCircle2 className="w-5 h-5" />, tone: "emerald" },
                { label: "Terlambat", value: todaySummary.telat, icon: <Clock className="w-5 h-5" />, tone: "amber" },
                { label: "Libur / Cuti", value: todaySummary.libur, icon: <Umbrella className="w-5 h-5" />, tone: "orange" },
                { label: "Belum Absen", value: todaySummary.belumAbsen, icon: <Users className="w-5 h-5" />, tone: todaySummary.belumAbsen > 0 ? "red" : "gray" },
              ].map(c => {
                const tones: Record<string, { text: string; gradient: string; glow: string }> = {
                  emerald: { text: "text-emerald-600", gradient: "from-emerald-500 to-emerald-600", glow: "from-emerald-500" },
                  amber: { text: "text-amber-600", gradient: "from-amber-500 to-amber-600", glow: "from-amber-500" },
                  orange: { text: "text-orange-600", gradient: "from-orange-500 to-orange-600", glow: "from-orange-500" },
                  red: { text: "text-red-600", gradient: "from-red-500 to-red-600", glow: "from-red-500" },
                  gray: { text: "text-gray-700", gradient: "from-gray-400 to-gray-500", glow: "from-gray-400" },
                };
                const t = tones[c.tone as string];
                return (
                  <div key={c.label} className="relative bg-white rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-4 overflow-hidden transition hover:shadow-md hover:-translate-y-0.5">
                    <div className={`absolute top-0 right-0 w-16 h-16 bg-gradient-to-br ${t.glow} to-transparent opacity-[0.07] rounded-full blur-2xl`} />
                    <div className="relative flex items-start justify-between gap-2 mb-2">
                      <span className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br ${t.gradient} text-white flex items-center justify-center shrink-0 shadow-sm`}>
                        {c.icon}
                      </span>
                    </div>
                    <div className="relative">
                      <div className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1 truncate">{c.label}</div>
                      <div className={`text-2xl sm:text-3xl font-black tabular-nums ${t.text} leading-none`}>{c.value}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* ─── JAM MASUK HARI INI ─── */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50/60 to-white flex items-center gap-3">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                <Clock className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm sm:text-base font-black text-gray-900">Jam Masuk Hari Ini</p>
                <p className="text-[10px] sm:text-[11px] text-gray-400 mt-0.5 font-medium truncate">
                  {new Date(todayKey + "T12:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </p>
              </div>
              {!loading && todayRoster.length > 0 && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 tabular-nums flex-shrink-0">
                  {todayRoster.length}
                </span>
              )}
            </div>

            {loading ? (
              <div className="divide-y divide-gray-50">
                {Array(6).fill(0).map((_, i) => <RowSkeleton key={i} />)}
              </div>
            ) : todayRoster.length === 0 ? (
              <div className="py-14 text-center px-4">
                <div className="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Inbox className="w-7 h-7 text-gray-300" />
                </div>
                <p className="text-sm text-gray-500 font-bold">Tidak ada data</p>
              </div>
            ) : (
              <div className="max-h-[480px] overflow-y-auto divide-y divide-gray-50">
                {todayRoster.map(r => <RosterRow key={r.userId} entry={r} />)}
              </div>
            )}
          </div>

          {/* ─── TOP PERFORMER BULAN INI ─── */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-amber-50/60 to-white flex items-center gap-3">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-500 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                <Trophy className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm sm:text-base font-black text-gray-900">Top Kehadiran Bulan Ini</p>
                <p className="text-[10px] sm:text-[11px] text-gray-400 mt-0.5 font-medium">
                  Ranking berdasarkan skor kehadiran
                </p>
              </div>
              {!loading && topPerformers.length > 0 && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 tabular-nums flex-shrink-0">
                  {topPerformers.length}
                </span>
              )}
            </div>

            {loading ? (
              <div className="divide-y divide-gray-50">
                {Array(5).fill(0).map((_, i) => <RowSkeleton key={i} />)}
              </div>
            ) : topPerformers.length === 0 ? (
              <div className="py-14 text-center px-4">
                <div className="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Inbox className="w-7 h-7 text-gray-300" />
                </div>
                <p className="text-sm text-gray-500 font-bold">Belum ada data</p>
                <p className="text-xs text-gray-400 mt-1">Belum ada kehadiran bulan ini</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {topPerformers.map((s, i) => (
                  <div key={s.userId} className="px-4 sm:px-6 py-3 flex items-center gap-2.5 sm:gap-3 hover:bg-amber-50/30 transition-colors">
                    {/* Medal / Rank */}
                    {i < 3 ? (
                      <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-white flex-shrink-0 shadow-md bg-gradient-to-br ${i === 0 ? "from-amber-400 to-yellow-500 shadow-amber-500/40" :
                          i === 1 ? "from-slate-300 to-slate-400 shadow-slate-400/40" :
                            "from-orange-400 to-amber-600 shadow-orange-500/40"
                        }`}>
                        <Medal className="w-4 h-4" />
                      </span>
                    ) : (
                      <span className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-[11px] font-black text-gray-500 flex-shrink-0">
                        {i + 1}
                      </span>
                    )}
                    <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-[10px] sm:text-[11px] font-black flex-shrink-0 ${avBg(s.name)}`}>
                      {initials(s.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-800 text-sm truncate">{s.name}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5 truncate">
                        <span className={`inline-block text-[9px] font-black px-1.5 py-0.5 rounded-full mr-1 uppercase tracking-wider ${s.isPkl ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                          {s.isPkl ? "PKL" : "Karyawan"}
                        </span>
                        <span className="hidden sm:inline">{s.present} tepat · {s.late} telat{s.leave > 0 ? ` · ${s.leave} cuti` : ""}</span>
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm sm:text-base font-black text-emerald-600 tabular-nums">{formatPct(s.pct)}%</p>
                      <p className="text-[9px] text-gray-400 tabular-nums">{s.score.toFixed(1)} poin</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ─── RINGKASAN LENGKAP BULAN INI ─── */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50/60 to-white flex items-start gap-3">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm sm:text-base font-black text-gray-900">Ringkasan Kehadiran</p>
                <p className="text-[10px] sm:text-[11px] text-gray-400 mt-0.5 font-medium">
                  {MONTH_NAMES[period.month]} {period.year} · Tepat=1.0 · Telat=0.5 · Cuti=1.0
                </p>
              </div>
              {!loading && monthStats.length > 0 && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 tabular-nums flex-shrink-0">
                  {monthStats.length}
                </span>
              )}
            </div>

            {loading ? (
              <div className="divide-y divide-gray-50">
                {Array(6).fill(0).map((_, i) => <RowSkeleton key={i} />)}
              </div>
            ) : monthStats.length === 0 ? (
              <div className="py-14 text-center px-4">
                <div className="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Inbox className="w-7 h-7 text-gray-300" />
                </div>
                <p className="text-sm text-gray-500 font-bold">Tidak ada data</p>
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/60">
                        <th className="px-6 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Nama</th>
                        <th className="px-3 py-3 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Tepat</th>
                        <th className="px-3 py-3 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Telat</th>
                        <th className="px-3 py-3 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Tidak Hadir</th>
                        <th className="px-3 py-3 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Cuti</th>
                        <th className="px-3 py-3 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Shift</th>
                        <th className="px-6 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest min-w-[140px]">%</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {monthStats.map(s => {
                        const pctColor = s.pct >= 90 ? "text-emerald-600" : s.pct >= 70 ? "text-amber-600" : "text-red-500";
                        const barGrad = s.pct >= 90 ? "from-emerald-400 to-green-500" : s.pct >= 70 ? "from-amber-400 to-orange-500" : "from-red-400 to-rose-500";
                        const eff = effectiveShiftFor(s.userId, todayKey);
                        const ShiftIcon = eff.shift === "PAGI" ? Sun : Moon;
                        return (
                          <tr key={s.userId} className="hover:bg-gray-50/70 transition-colors">
                            <td className="px-6 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-black flex-shrink-0 ${avBg(s.name)}`}>{initials(s.name)}</div>
                                <div className="min-w-0">
                                  <p className="font-bold text-gray-800 text-xs truncate">{s.name}</p>
                                  <span className={`inline-block text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider ${s.isPkl ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                                    {s.isPkl ? "PKL" : s.role.replace(/_/g, " ")}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-center font-black text-emerald-600 tabular-nums">{s.present || "—"}</td>
                            <td className="px-3 py-3 text-center font-black text-amber-600 tabular-nums">{s.late || "—"}</td>
                            <td className="px-3 py-3 text-center font-black text-red-500 tabular-nums">{s.absent || "—"}</td>
                            <td className="px-3 py-3 text-center font-black text-cyan-600 tabular-nums">{s.leave || "—"}</td>
                            <td className="px-3 py-3 text-center">
                              <div className="flex flex-col items-center gap-0.5">
                                <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-lg border whitespace-nowrap ${eff.isCustom ? "bg-rose-50 text-rose-700 border-rose-200" : eff.shift === "PAGI" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-indigo-50 text-indigo-700 border-indigo-200"}`}>
                                  <ShiftIcon className="w-3 h-3" /> {minToHHMM(eff.openMin)}–{minToHHMM(eff.closeMin)}
                                </span>
                                {eff.isCustom && <span className="text-[8px] font-black text-rose-600">Custom</span>}
                              </div>
                            </td>
                            <td className="px-6 py-3">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden min-w-[80px]">
                                  <div className={`h-full rounded-full bg-gradient-to-r ${barGrad} transition-all duration-500`} style={{ width: `${Math.min(s.pct, 100)}%` }} />
                                </div>
                                <span className={`text-xs font-black w-14 text-right tabular-nums ${pctColor}`}>{formatPct(s.pct)}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden divide-y divide-gray-50">
                  {monthStats.map(s => {
                    const pctColor = s.pct >= 90 ? "text-emerald-600" : s.pct >= 70 ? "text-amber-600" : "text-red-500";
                    const barGrad = s.pct >= 90 ? "from-emerald-400 to-green-500" : s.pct >= 70 ? "from-amber-400 to-orange-500" : "from-red-400 to-rose-500";
                    const eff = effectiveShiftFor(s.userId, todayKey);
                    const ShiftIcon = eff.shift === "PAGI" ? Sun : Moon;
                    return (
                      <div key={s.userId} className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5 mb-2">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-[11px] font-black flex-shrink-0 ${avBg(s.name)}`}>{initials(s.name)}</div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-gray-800 text-sm truncate">{s.name}</p>
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                              <span className={`inline-block text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider ${s.isPkl ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                                {s.isPkl ? "PKL" : s.role.replace(/_/g, " ")}
                              </span>
                              <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold ${eff.isCustom ? "text-rose-700" : eff.shift === "PAGI" ? "text-amber-700" : "text-indigo-700"}`}>
                                <ShiftIcon className="w-2.5 h-2.5" /> {minToHHMM(eff.openMin)}–{minToHHMM(eff.closeMin)}
                              </span>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className={`text-lg font-black tabular-nums ${pctColor}`}>{formatPct(s.pct)}%</p>
                            <p className="text-[9px] text-gray-400 tabular-nums">{s.score.toFixed(1)} pts</p>
                          </div>
                        </div>
                        {/* Progress bar */}
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2">
                          <div className={`h-full rounded-full bg-gradient-to-r ${barGrad} transition-all duration-500`} style={{ width: `${Math.min(s.pct, 100)}%` }} />
                        </div>
                        {/* Stats row */}
                        <div className="grid grid-cols-4 gap-1.5">
                          <div className="text-center bg-emerald-50 border border-emerald-100 rounded-lg py-1.5">
                            <p className="text-xs font-black text-emerald-600 tabular-nums leading-none">{s.present || "—"}</p>
                            <p className="text-[8px] font-black text-emerald-700/60 uppercase tracking-wider mt-0.5">Tepat</p>
                          </div>
                          <div className="text-center bg-amber-50 border border-amber-100 rounded-lg py-1.5">
                            <p className="text-xs font-black text-amber-600 tabular-nums leading-none">{s.late || "—"}</p>
                            <p className="text-[8px] font-black text-amber-700/60 uppercase tracking-wider mt-0.5">Telat</p>
                          </div>
                          <div className="text-center bg-red-50 border border-red-100 rounded-lg py-1.5">
                            <p className="text-xs font-black text-red-500 tabular-nums leading-none">{s.absent || "—"}</p>
                            <p className="text-[8px] font-black text-red-600/60 uppercase tracking-wider mt-0.5">Absen</p>
                          </div>
                          <div className="text-center bg-cyan-50 border border-cyan-100 rounded-lg py-1.5">
                            <p className="text-xs font-black text-cyan-600 tabular-nums leading-none">{s.leave || "—"}</p>
                            <p className="text-[8px] font-black text-cyan-700/60 uppercase tracking-wider mt-0.5">Cuti</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.35s cubic-bezier(0.16,1,0.3,1); }
      `}</style>
    </DashboardLayout>
  );
}