"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
  ArrowLeft, Trophy, Medal, Award, Users, TrendingUp, Clock, CheckCircle2,
  Inbox, AlertCircle, ChevronDown, ChevronUp,
  type LucideIcon,
} from "lucide-react";

const LeaderboardCharts = dynamic(() => import("./LeaderboardCharts"), {
  ssr: false,
  loading: () => <div className="h-[420px] rounded-2xl bg-gray-100 animate-pulse" />,
});

// ─── TYPES ──────────────────────────────────────────────────────────────
type Scope = "day" | "month" | "all";
type Tab = "karyawan" | "pkl";

type UserInfo = { id: string; name: string; role: string };
type AttendanceRecord = {
  id: string; user_id: string; check_in_time: string; created_at: string;
  status: string; method: string; late_weight: number | null;
};
type ManualRecord = { id: string; user_id: string; attendance_date: string; check_in_time: string; status: string };
type LeaveRequest = { id: string; leave_date: string; reason: string | null; status: string };
type UserLeaveData = { user: { id: string; name: string; role: string }; requests: LeaveRequest[] };

/** Minimum hadir agar masuk ranking. Untuk scope "day", gate di-skip. */
const MIN_SESI = 5;

/** Prior weight untuk Bayesian smoothing */
const BAYESIAN_M = 5;

type RankingEntry = {
  userId: string; name: string; role: string; isPkl: boolean;
  hadir: number; tepat: number; telat: number; leave: number;
  expected: number;
  disiplin: number;   // Bayesian on-time rate [0,1]
  kehadiran: number;  // hadir/expected [0,1]
  volume: number;     // hadir/targetSesi [0,1]
  lateRatio: number;  // telat/hadir, penalty proxy
  bayesianScore: number; // final composite score
};

type InsufficientEntry = {
  userId: string; name: string; role: string; isPkl: boolean;
  hadir: number; tepat: number;
};

type StatusCount = { status: string; count: number };
type TrendPoint = { key: string; count: number };

// ─── CONSTANTS ──────────────────────────────────────────────────────────
const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const STATUS_COLORS: Record<string, string> = { PRESENT: "#10b981", LATE: "#f59e0b", LEAVE: "#06b6d4" };
const STATUS_LABELS: Record<string, string> = { PRESENT: "Tepat Waktu", LATE: "Terlambat", LEAVE: "Cuti" };

// ─── HELPERS ────────────────────────────────────────────────────────────
function pad2(n: number) { return String(n).padStart(2, "0"); }
function initials(name: string) { return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase(); }
function isPKLRole(role: string): boolean { return /pkl|magang/i.test(role); }

const AV_COLORS = [
  "bg-violet-100 text-violet-700", "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700", "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-700", "bg-cyan-100 text-cyan-700", "bg-purple-100 text-purple-700",
];
function avBg(name: string) { let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff; return AV_COLORS[Math.abs(h) % AV_COLORS.length]; }

function toWIBDateKey(iso: string): string {
  return new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function wibHour(iso: string): number {
  return new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000).getUTCHours();
}
function todayWIB(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getAutoStatus(a: { method: string; status: string; late_weight: number | null }): "PRESENT" | "LATE" | "SKIP" {
  if (a.method === "FORCE") return "PRESENT";
  if (a.method === "SKIP" || a.status === "SKIPPED_MANUAL") return "SKIP";
  if (a.late_weight != null) {
    if (a.late_weight >= 1) return "PRESENT";
    if (a.late_weight > 0) return "LATE";
    return "SKIP";
  }
  return "PRESENT";
}

/** Hitung jumlah hari kerja (Senin–Jumat) dalam bulan tertentu */
function workdaysInMonth(year: number, month: number): number {
  const dim = new Date(year, month + 1, 0).getDate();
  let count = 0;
  for (let d = 1; d <= dim; d++) {
    const dow = new Date(year, month, d).getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

// ─── CORE COMPUTATION ───────────────────────────────────────────────────
function computeLeaderboard(
  scope: Scope,
  period: { year: number; month: number },
  selectedDate: string,
  users: UserInfo[],
  autoRecords: AttendanceRecord[],
  manualRecords: ManualRecord[],
  leaveData: UserLeaveData[]
) {
  const inScope = (dateKey: string) => {
    if (scope === "day") return dateKey === selectedDate;
    if (scope === "month") return dateKey.startsWith(`${period.year}-${pad2(period.month + 1)}`);
    return true;
  };

  // ── Tahap 1: Kumpulkan attendance per user-date ──────────────────────
  const effByUserDate: Record<string, "PRESENT" | "LATE"> = {};
  const trendEvents: { dateKey: string; hour: number }[] = [];

  autoRecords.forEach(a => {
    const iso = a.check_in_time || a.created_at;
    const dateKey = toWIBDateKey(iso);
    if (!inScope(dateKey) || !a.user_id) return;
    const st = getAutoStatus(a);
    if (st === "PRESENT" || st === "LATE") {
      effByUserDate[`${a.user_id}_${dateKey}`] = st;
      trendEvents.push({ dateKey, hour: wibHour(iso) });
    }
  });

  manualRecords.forEach(mr => {
    const dateKey = mr.attendance_date;
    if (!inScope(dateKey)) return;
    const key = `${mr.user_id}_${dateKey}`;
    if (effByUserDate[key]) return;
    if (mr.status === "PRESENT" || mr.status === "LATE") {
      effByUserDate[key] = mr.status;
      trendEvents.push({ dateKey, hour: wibHour(mr.check_in_time) });
    }
  });

  const leaveByUserDate = new Set<string>();
  leaveData.forEach(ld => {
    const uid = ld.user?.id;
    if (!uid) return;
    (ld.requests ?? []).forEach(r => {
      const dateKey = r.leave_date;
      if (!inScope(dateKey)) return;
      const key = `${uid}_${dateKey}`;
      if (effByUserDate[key]) return;
      leaveByUserDate.add(key);
    });
  });

  // ── Tahap 2: Agregasi per user ───────────────────────────────────────
  const agg: Record<string, { hadir: number; tepat: number; telat: number; leave: number }> = {};
  const ensure = (uid: string) => (agg[uid] ??= { hadir: 0, tepat: 0, telat: 0, leave: 0 });

  Object.entries(effByUserDate).forEach(([key, status]) => {
    const uid = key.split("_")[0];
    ensure(uid);
    agg[uid].hadir++;
    if (status === "PRESENT") agg[uid].tepat++;
    else agg[uid].telat++;
  });
  leaveByUserDate.forEach(key => {
    const uid = key.split("_")[0];
    ensure(uid);
    agg[uid].leave++;
  });

  const userMap: Record<string, UserInfo> = {};
  users.forEach(u => { userMap[u.id] = u; });

  // ── Tahap 3: Expected & target sesi ─────────────────────────────────
  // expected = hari kerja kalender bulan ini (untuk scope month)
  // Untuk scope lain: expected = hadir sendiri (kehadiran netral)
  const expectedDays = scope === "month"
    ? workdaysInMonth(period.year, period.month)
    : 22; // fallback untuk scope "all"

  // targetSesi untuk volume: pakai expectedDays agar fair lintas role
  const targetSesi = expectedDays;

  // ── Tahap 4: Global on-time rate C (Bayesian prior) ─────────────────
  // Hitung dari user yang sudah cukup data (atau semua kalau tidak ada)
  const skipGateForScope = scope === "day";
  const aggValues = Object.values(agg);
  const eligibleForC = skipGateForScope
    ? aggValues
    : aggValues.filter(v => v.hadir >= MIN_SESI);
  const srcForC = eligibleForC.length > 0 ? eligibleForC : aggValues;
  const globalTepat = srcForC.reduce((s, v) => s + v.tepat, 0);
  const globalHadir = srcForC.reduce((s, v) => s + v.hadir, 0);
  const C = globalHadir > 0 ? globalTepat / globalHadir : 0.75;

  // ── Tahap 5: Hitung skor per user + gate ────────────────────────────
  const validEntries: RankingEntry[] = [];
  const insufficientEntries: InsufficientEntry[] = [];

  Object.entries(agg).forEach(([uid, v]) => {
    const uInfo = userMap[uid];
    const isPkl = uInfo ? isPKLRole(uInfo.role) : false;

    if (!skipGateForScope && v.hadir < MIN_SESI) {
      insufficientEntries.push({
        userId: uid,
        name: uInfo?.name ?? "—",
        role: uInfo?.role ?? "—",
        isPkl,
        hadir: v.hadir,
        tepat: v.tepat,
      });
      return;
    }

    const hadir = v.hadir;
    const tepat = v.tepat;
    const telat = v.telat;

    // a. Disiplin: Bayesian smoothing anti small-sample
    const disiplin = hadir > 0
      ? (tepat + BAYESIAN_M * C) / (hadir + BAYESIAN_M)
      : C;

    // b. Kehadiran: hadir vs hari kerja terjadwal
    const expected = scope === "month" ? expectedDays : hadir;
    const kehadiran = expected > 0 ? Math.min(hadir / expected, 1.0) : 1.0;

    // c. Volume: reward konsistensi hadir
    const volume = targetSesi > 0 ? Math.min(hadir / targetSesi, 1.0) : 1.0;

    // Penalty: proporsi hari telat
    const lateRatio = hadir > 0 ? telat / hadir : 0;

    // d. Skor gabungan
    // 0.45×disiplin + 0.35×kehadiran + 0.20×volume → [0,1] range
    // Penalti: 15 × lateRatio (max -15 poin, bila 100% telat)
    const bayesianScore = Math.max(
      0,
      100 * (0.45 * disiplin + 0.35 * kehadiran + 0.20 * volume) - 15 * lateRatio
    );

    validEntries.push({
      userId: uid,
      name: uInfo?.name ?? "—",
      role: uInfo?.role ?? "—",
      isPkl,
      hadir, tepat, telat,
      leave: v.leave,
      expected,
      disiplin,
      kehadiran,
      volume,
      lateRatio,
      bayesianScore,
    });
  });

  // ── Tahap 6: Sort + tie-breaker ─────────────────────────────────────
  const sortRanking = (arr: RankingEntry[]) =>
    [...arr].sort((a, b) =>
      b.bayesianScore - a.bayesianScore ||
      b.tepat - a.tepat ||
      a.lateRatio - b.lateRatio ||
      b.hadir - a.hadir
    );

  const karyawanRanking = sortRanking(validEntries.filter(e => !e.isPkl));
  const pklRanking = sortRanking(validEntries.filter(e => e.isPkl));
  const allRanking = sortRanking(validEntries);

  // ── Summary ──────────────────────────────────────────────────────────
  const totalPresent = allRanking.reduce((s, r) => s + r.tepat, 0);
  const totalLate = allRanking.reduce((s, r) => s + r.telat, 0);
  const totalLeave = allRanking.reduce((s, r) => s + r.leave, 0);
  const totalHadir = allRanking.reduce((s, r) => s + r.hadir, 0);

  const summary = {
    totalPresent, totalLate, totalLeave,
    activeEmployees: allRanking.length,
    avgOnTimeRate: totalHadir > 0 ? Math.round((totalPresent / totalHadir) * 1000) / 10 : 0,
  };

  const statusDistribution: StatusCount[] = [
    { status: "PRESENT", count: totalPresent },
    { status: "LATE", count: totalLate },
    { status: "LEAVE", count: totalLeave },
  ].filter(s => s.count > 0);

  const trendMap: Record<string, number> = {};
  trendEvents.forEach(e => {
    const key = scope === "day" ? `${pad2(e.hour)}:00` : scope === "month" ? e.dateKey : e.dateKey.slice(0, 7);
    trendMap[key] = (trendMap[key] ?? 0) + 1;
  });
  const trend: TrendPoint[] = Object.entries(trendMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => ({ key, count }));

  return {
    karyawanRanking, pklRanking, allRanking,
    summary, statusDistribution, trend,
    insufficientEntries,
    globalOnTimeRate: Math.round(C * 1000) / 10,
  };
}

// ─── PODIUM CARD ───────────────────────────────────────────────────────
const PODIUM_STYLE: Record<number, { badge: string; ring: string; icon: LucideIcon; iconColor: string; height: string; order: string }> = {
  0: { badge: "bg-gradient-to-br from-amber-300 to-amber-500", ring: "ring-amber-300", icon: Trophy, iconColor: "text-amber-500", height: "sm:mt-0", order: "order-2" },
  1: { badge: "bg-gradient-to-br from-gray-300 to-gray-400", ring: "ring-gray-300", icon: Medal, iconColor: "text-gray-400", height: "sm:mt-6", order: "order-1" },
  2: { badge: "bg-gradient-to-br from-orange-300 to-orange-500", ring: "ring-orange-300", icon: Award, iconColor: "text-orange-400", height: "sm:mt-9", order: "order-3" },
};

function PodiumCard({ entry, rank }: { entry: RankingEntry; rank: number }) {
  const style = PODIUM_STYLE[rank];
  const Icon = style.icon;
  const bg = avBg(entry.name);
  const disiplinPct = (entry.disiplin * 100).toFixed(1);
  const isFirst = rank === 0;
  return (
    <div className={`flex-1 min-w-0 ${style.order} ${style.height}`}>
      <div className={`bg-white rounded-xl sm:rounded-2xl border ${isFirst ? "border-amber-200" : "border-gray-100"} shadow-sm ${isFirst ? "shadow-md" : ""} p-2.5 sm:p-5 text-center ring-2 ${style.ring} relative`}>
        <div className={`absolute -top-2.5 sm:-top-3 left-1/2 -translate-x-1/2 w-6 h-6 sm:w-7 sm:h-7 rounded-full ${style.badge} flex items-center justify-center text-white text-[9px] sm:text-[10px] font-black shadow-sm`}>
          {rank + 1}
        </div>
        <Icon className={`w-4 h-4 sm:w-5 sm:h-5 mx-auto mt-1 sm:mt-2 mb-1 sm:mb-1.5 ${style.iconColor}`} />
        <div className={`w-9 h-9 sm:w-12 sm:h-12 mx-auto rounded-lg sm:rounded-xl flex items-center justify-center text-xs sm:text-sm font-bold mb-1.5 sm:mb-2 ${bg} ${isFirst ? "ring-2 ring-amber-300 ring-offset-1" : ""}`}>{initials(entry.name)}</div>
        <p className="font-bold text-gray-900 text-[11px] sm:text-xs leading-tight truncate">{entry.name}</p>
        <p className="text-[8px] sm:text-[9px] text-gray-400 mt-0.5 mb-1.5 sm:mb-2 truncate">{entry.role.replace(/_/g, " ")}</p>
        <p className="text-sm sm:text-lg font-black text-violet-600 leading-none">
          {entry.bayesianScore.toFixed(1)}<span className="text-[9px] sm:text-[10px] font-semibold text-gray-400 ml-0.5 sm:ml-1">poin</span>
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2 mt-1 sm:mt-1.5">
          <span className="text-[8px] sm:text-[9px] font-bold text-emerald-600">{disiplinPct}% disiplin</span>
          <span className="hidden sm:inline text-[9px] text-gray-300">·</span>
          <span className="text-[8px] sm:text-[9px] text-gray-400 truncate">{entry.tepat} tepat · {entry.telat} telat</span>
        </div>
      </div>
    </div>
  );
}

// ─── RANKING ROW ────────────────────────────────────────────────────────
const RANK_BADGE: Record<number, string> = {
  0: "bg-gradient-to-br from-amber-300 to-amber-500 text-white",
  1: "bg-gradient-to-br from-gray-300 to-gray-400 text-white",
  2: "bg-gradient-to-br from-orange-300 to-orange-500 text-white",
};

function RankingRow({ entry, idx }: { entry: RankingEntry; idx: number }) {
  const bg = avBg(entry.name);
  const disiplinPct = (entry.disiplin * 100).toFixed(1);
  const kehadiranPct = (entry.kehadiran * 100).toFixed(0);
  const rankBadgeClass = RANK_BADGE[idx] ?? "bg-gray-50 text-gray-400";
  return (
    <div className="px-3.5 sm:px-5 py-3 sm:py-3.5 flex items-center gap-2.5 sm:gap-3.5 hover:bg-gray-50/60 transition-colors">
      <span className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 ${rankBadgeClass}`}>
        {idx + 1}
      </span>
      <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center text-[10px] sm:text-[11px] font-bold flex-shrink-0 ${bg}`}>{initials(entry.name)}</div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-gray-900 text-xs sm:text-sm leading-tight truncate">{entry.name}</p>
        <p className="text-[9px] sm:text-[10px] text-gray-400 mt-0.5 uppercase tracking-wide truncate">
          {entry.role.replace(/_/g, " ")} · {entry.hadir} hadir · {entry.tepat} tepat · {entry.telat} telat
          {entry.leave > 0 ? ` · ${entry.leave} cuti` : ""}
        </p>
        <div className="h-1 bg-gray-100 rounded-full overflow-hidden mt-1.5 max-w-[140px] sm:max-w-[180px]">
          <div className="h-full bg-violet-500 rounded-full" style={{ width: `${Math.min(entry.disiplin * 100, 100)}%` }} />
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-xs sm:text-sm font-black text-violet-700">{entry.bayesianScore.toFixed(1)} <span className="text-[9px] sm:text-[10px] font-semibold text-gray-400">poin</span></p>
        <p className="text-[9px] sm:text-[10px] text-gray-400 mt-0.5">
          <span className="text-emerald-600 font-bold">{disiplinPct}%</span> <span className="hidden sm:inline">disiplin</span> · <span className="font-semibold text-gray-500">{kehadiranPct}%</span> <span className="hidden sm:inline">hadir</span>
        </p>
      </div>
    </div>
  );
}

// ─── RANKING TABLE ───────────────────────────────────────────────────────
function RankingTable({ title, ranking, loading }: { title: string; ranking: RankingEntry[]; loading: boolean }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-3.5 sm:px-5 py-3 sm:py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50/60 to-transparent">
        <p className="font-bold text-gray-900 text-xs sm:text-sm">{title}</p>
        {!loading && ranking.length > 0 && (
          <span className="text-[10px] font-bold text-violet-600 bg-violet-50 border border-violet-100 rounded-full px-2 py-0.5">{ranking.length} orang</span>
        )}
      </div>
      {loading ? (
        <div className="divide-y divide-gray-50">
          {Array(4).fill(0).map((_, i) => (
            <div key={i} className="px-3.5 sm:px-5 py-3.5 sm:py-4 flex items-center gap-2.5 sm:gap-3.5">
              <div className="w-5 sm:w-6 h-4 bg-gray-100 rounded animate-pulse" />
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gray-100 animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-gray-100 rounded-lg animate-pulse w-28 sm:w-36" />
                <div className="h-2.5 bg-gray-100 rounded-lg animate-pulse w-20 sm:w-24" />
              </div>
            </div>
          ))}
        </div>
      ) : ranking.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <Inbox size={28} className="text-gray-300" />
          <p className="text-xs text-gray-400 font-medium">Belum ada data absensi pada periode ini</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {ranking.map((r, idx) => (
            <RankingRow key={r.userId} entry={r} idx={idx} />
          ))}
        </div>
      )}
    </div>
  );
}

const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
  { value: "day", label: "Harian" },
  { value: "month", label: "Bulanan" },
  { value: "all", label: "Semua Waktu" },
];

export default function AttendanceLeaderboardPage() {
  const router = useRouter();
  const [scope, setScope] = useState<Scope>("month");
  const [period, setPeriod] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() });
  const [selectedDate, setSelectedDate] = useState(() => todayWIB());
  const [showInsufficient, setShowInsufficient] = useState(false);

  const [users, setUsers] = useState<UserInfo[]>([]);
  const [autoRecords, setAutoRecords] = useState<AttendanceRecord[]>([]);
  const [manualRecords, setManualRecords] = useState<ManualRecord[]>([]);
  const [leaveData, setLeaveData] = useState<UserLeaveData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const targetYear = scope === "day" ? Number(selectedDate.slice(0, 4)) : period.year;
      const targetMonth = scope === "day" ? Number(selectedDate.slice(5, 7)) - 1 : period.month;

      const calls: Promise<any>[] = [
        fetch("/api/attendance/users").then(r => r.json()),
        fetch("/api/attendance").then(r => r.json()),
      ];
      if (scope !== "all") {
        calls.push(fetch(`/api/attendance/manual?year=${targetYear}&month=${targetMonth + 1}`).then(r => r.json()));
        calls.push(fetch(`/api/attendance/leave?year=${targetYear}&month=${targetMonth + 1}`).then(r => r.json()));
      }
      const results = await Promise.all(calls);
      const [usersRes, autoRes, manualRes, leaveRes] = results;

      if (!usersRes?.success || !autoRes?.success) { setError("Gagal memuat data absensi"); return; }
      setUsers(usersRes.data || []);
      setAutoRecords(autoRes.data || []);

      if (scope !== "all") {
        setManualRecords(manualRes?.success ? (manualRes.data || []) : []);
        const rawLeave = leaveRes?.success ? leaveRes.data : [];
        setLeaveData(Array.isArray(rawLeave) ? rawLeave : rawLeave ? [rawLeave] : []);
      } else {
        setManualRecords([]);
        setLeaveData([]);
      }
    } catch { setError("Gagal memuat data absensi"); } finally { setLoading(false); }
  }, [scope, period, selectedDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const data = useMemo(
    () => computeLeaderboard(scope, period, selectedDate, users, autoRecords, manualRecords, leaveData),
    [scope, period, selectedDate, users, autoRecords, manualRecords, leaveData]
  );

  const hasBothSections = data.pklRanking.length > 0 && data.karyawanRanking.length > 0;

  // Podium selalu dari karyawan (atau all jika tidak ada pemisah)
  const podiumSource = data.karyawanRanking.length > 0 ? data.karyawanRanking : data.allRanking;
  const top3 = podiumSource.slice(0, 3).map((entry, rank) => ({ entry, rank }));
  const podiumOrder = top3.length === 3 ? [top3[1], top3[0], top3[2]] : top3;

  const barData = useMemo(
    () => data.allRanking.slice(0, 10).map(r => ({
      name: r.name.split(" ")[0], fullName: r.name,
      bayesianScore: r.bayesianScore, tepat: r.tepat, telat: r.telat,
    })),
    [data.allRanking]
  );

  const pieData = useMemo(
    () => data.statusDistribution.map(s => ({ name: STATUS_LABELS[s.status] ?? s.status, value: s.count, color: STATUS_COLORS[s.status] ?? "#9ca3af" })),
    [data.statusDistribution]
  );

  const headerSubtitle = loading
    ? "Memuat data..."
    : scope === "all"
      ? "Semua waktu"
      : scope === "day"
        ? new Date(selectedDate + "T12:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
        : `${MONTH_NAMES[period.month]} ${period.year}`;

  const trendLabel = scope === "day" ? "per Jam" : scope === "month" ? "per Hari" : "per Bulan";
  const trendTickFormatter = (v: string) => scope === "day" ? v : scope === "month" ? v.slice(-2) : v.slice(2);

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-[#F7F7F8]">
        <div className="max-w-5xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-4 sm:space-y-5">

          {/* ── Header ── */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-2.5 sm:gap-3.5">
              <button onClick={() => router.push("/dashboard/attendance")}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:text-gray-800 hover:border-gray-300 hover:shadow-sm transition-all flex-shrink-0 active:scale-95 bg-white">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-[#1a1545] to-[#0f0c29] flex items-center justify-center flex-shrink-0 shadow-sm shadow-[#1a1545]/20">
                <Trophy className="w-4 h-4 sm:w-[18px] sm:h-[18px] text-amber-300" />
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-black text-gray-900 tracking-tight leading-none">Leaderboard Absensi</h1>
                <p className="text-[11px] sm:text-xs text-gray-400 mt-1 sm:mt-1.5">{headerSubtitle}</p>
              </div>
            </div>

            {/* ── Filter Periode ── */}
            <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap flex-shrink-0 overflow-x-auto pb-1 sm:pb-0 max-w-full">
              <div className="flex gap-1 p-1 bg-white rounded-xl border border-gray-100 shadow-sm flex-shrink-0">
                {SCOPE_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => setScope(opt.value)}
                    className={`h-7 sm:h-8 px-2.5 sm:px-3 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap ${scope === opt.value ? "bg-gradient-to-br from-[#1a1545] to-[#0f0c29] text-white shadow-sm" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"}`}>
                    {opt.label}
                  </button>
                ))}
              </div>

              {scope === "day" && (
                <div className="flex items-center gap-0.5 sm:gap-1 bg-white rounded-xl border border-gray-100 shadow-sm px-1 flex-shrink-0">
                  <button onClick={() => setSelectedDate(d => addDaysToDateStr(d, -1))}
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-800 transition-all font-bold text-sm sm:text-base">‹</button>
                  <span className="text-[10px] font-semibold text-gray-600 px-1 sm:px-1.5 whitespace-nowrap">
                    {new Date(selectedDate + "T12:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                  <button onClick={() => setSelectedDate(d => addDaysToDateStr(d, 1))}
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-800 transition-all font-bold text-sm sm:text-base">›</button>
                  <button onClick={() => setSelectedDate(todayWIB())}
                    className="h-7 sm:h-8 px-2 sm:px-2.5 rounded-lg hover:bg-gray-100 text-[10px] font-semibold text-gray-500 hover:text-gray-800 transition-all whitespace-nowrap">Hari ini</button>
                </div>
              )}

              {scope === "month" && (
                <div className="flex items-center gap-0.5 sm:gap-1 bg-white rounded-xl border border-gray-100 shadow-sm px-1 flex-shrink-0">
                  <button onClick={() => setPeriod(p => ({ month: p.month === 0 ? 11 : p.month - 1, year: p.month === 0 ? p.year - 1 : p.year }))}
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-800 transition-all font-bold text-sm sm:text-base">‹</button>
                  <span className="text-[10px] font-semibold text-gray-600 px-1 sm:px-1.5 whitespace-nowrap">{MONTH_NAMES[period.month].substring(0, 3)} {period.year}</span>
                  <button onClick={() => setPeriod(p => ({ month: p.month === 11 ? 0 : p.month + 1, year: p.month === 11 ? p.year + 1 : p.year }))}
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-800 transition-all font-bold text-sm sm:text-base">›</button>
                </div>
              )}
            </div>
          </div>

          {/* ── Info banners ── */}
          {scope === "all" && (
            <div className="flex items-center gap-2.5 bg-blue-50 border border-blue-100 text-blue-700 text-[10px] sm:text-[11px] px-3 sm:px-3.5 py-2.5 sm:py-3 rounded-xl">
              <div className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                <Clock className="w-3.5 h-3.5" />
              </div>
              <span>Mode Semua Waktu hanya menghitung absen otomatis (wajah) — absen manual & cuti tidak disertakan.</span>
            </div>
          )}
          {!loading && scope !== "day" && (
            <div className="flex items-center gap-2.5 bg-violet-50 border border-violet-100 text-violet-700 text-[10px] sm:text-[11px] px-3 sm:px-3.5 py-2.5 sm:py-3 rounded-xl">
              <div className="w-6 h-6 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-3.5 h-3.5" />
              </div>
              <span>Skor menggunakan <strong className="mx-0.5 font-bold">Bayesian smoothing</strong>. Prior global = <strong className="font-bold">{data.globalOnTimeRate}%</strong> · Min sesi = <strong className="font-bold">{MIN_SESI} hari</strong>.</span>
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 text-xs px-3.5 py-3 rounded-xl">
              <div className="w-6 h-6 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-3.5 h-3.5" />
              </div>
              <span>{error}</span>
            </div>
          )}

          {/* ── Summary Cards ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
            {[
              { label: "Tepat Waktu", value: loading ? null : `${data.summary.totalPresent}`, icon: CheckCircle2, color: "emerald" as const },
              { label: "Terlambat", value: loading ? null : `${data.summary.totalLate}`, icon: Clock, color: "amber" as const },
              { label: "Karyawan Aktif", value: loading ? null : `${data.summary.activeEmployees}`, icon: Users, color: "blue" as const },
              { label: "Rata² Ketepatan", value: loading ? null : `${data.summary.avgOnTimeRate}%`, icon: TrendingUp, color: "violet" as const },
            ].map(c => {
              const Icon = c.icon;
              const CARD_STYLE: Record<string, { border: string; iconBg: string; iconText: string }> = {
                emerald: { border: "border-t-emerald-400", iconBg: "bg-emerald-50", iconText: "text-emerald-500" },
                amber: { border: "border-t-amber-400", iconBg: "bg-amber-50", iconText: "text-amber-500" },
                blue: { border: "border-t-blue-400", iconBg: "bg-blue-50", iconText: "text-blue-500" },
                violet: { border: "border-t-violet-400", iconBg: "bg-violet-50", iconText: "text-violet-500" },
              };
              const s = CARD_STYLE[c.color];
              return (
                <div key={c.label} className={`bg-white rounded-xl sm:rounded-2xl border border-gray-100 border-t-2 ${s.border} shadow-sm p-3 sm:p-4 flex items-center gap-2.5 sm:gap-3 hover:shadow-md transition-shadow`}>
                  <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl ${s.iconBg} flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${s.iconText}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[8px] sm:text-[9px] text-gray-400 font-bold uppercase tracking-widest leading-none mb-1 sm:mb-1.5 truncate">{c.label}</p>
                    <p className="text-sm sm:text-base font-black leading-none text-gray-800 truncate">
                      {c.value === null ? <span className="inline-block w-10 sm:w-14 h-4 bg-gray-100 rounded-lg animate-pulse" /> : c.value}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Podium Karyawan ── */}
          {!loading && top3.length > 0 && (
            <div className="relative bg-white rounded-2xl border border-gray-100 shadow-sm p-3.5 sm:p-6 overflow-hidden">
              <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-56 h-56 rounded-full bg-gradient-to-br from-amber-200/40 via-violet-200/30 to-transparent blur-3xl pointer-events-none" />
              <div className="relative flex items-center gap-1.5 mb-3 sm:mb-4">
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                <p className="text-[8px] sm:text-[9px] font-bold text-gray-400 uppercase tracking-widest">Top Performer{hasBothSections ? " · Karyawan" : ""}</p>
              </div>
              <div className="relative flex items-end gap-1.5 sm:gap-3">
                {podiumOrder.map(({ entry, rank }) => (
                  <PodiumCard key={entry.userId} entry={entry} rank={rank} />
                ))}
              </div>
            </div>
          )}

          {/* ── Charts ── */}
          {!loading && data.allRanking.length > 0 && (
            <LeaderboardCharts
              barData={barData}
              pieData={pieData}
              trend={data.trend}
              trendLabel={trendLabel}
              trendTickFormatter={trendTickFormatter}
            />
          )}

          {/* ── Ranking Table: Karyawan ── */}
          <RankingTable
            title="Papan Peringkat Karyawan"
            ranking={data.karyawanRanking.length > 0 ? data.karyawanRanking : (!hasBothSections ? data.allRanking : [])}
            loading={loading}
          />

          {/* ── Ranking Table: PKL ── */}
          {!loading && data.pklRanking.length > 0 && (
            <RankingTable title="Papan Peringkat PKL / Magang" ranking={data.pklRanking} loading={false} />
          )}

          {/* ── Data Belum Cukup ── */}
          {!loading && data.insufficientEntries.length > 0 && (
            <div className="bg-white rounded-2xl border border-amber-100 shadow-sm overflow-hidden">
              <button
                className="w-full px-3.5 sm:px-5 py-3 sm:py-4 border-b border-amber-100 flex items-center justify-between text-left hover:bg-amber-50/40 transition-colors"
                onClick={() => setShowInsufficient(v => !v)}
              >
                <div className="flex items-center gap-2 sm:gap-2.5">
                  <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                  <p className="font-bold text-gray-700 text-xs sm:text-sm">Data Belum Cukup</p>
                  <span className="text-[9px] sm:text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                    {data.insufficientEntries.length} orang
                  </span>
                </div>
                <div className="flex items-center gap-1 sm:gap-1.5 text-gray-400">
                  <span className="text-[9px] sm:text-[10px] hidden sm:inline">Min. {MIN_SESI} hari hadir untuk masuk ranking</span>
                  {showInsufficient ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </div>
              </button>
              {showInsufficient && (
                <div className="divide-y divide-amber-50">
                  {data.insufficientEntries.map(e => {
                    const bg = avBg(e.name);
                    return (
                      <div key={e.userId} className="px-3.5 sm:px-5 py-2.5 sm:py-3 flex items-center gap-2.5 sm:gap-3 hover:bg-amber-50/30 transition-colors">
                        <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl flex items-center justify-center text-[9px] sm:text-[10px] font-bold flex-shrink-0 ${bg}`}>{initials(e.name)}</div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-800 text-xs truncate">{e.name}</p>
                          <p className="text-[9px] text-gray-400 truncate">{e.role.replace(/_/g, " ")} {e.isPkl ? "· PKL" : ""}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-[9px] sm:text-[10px] font-bold text-amber-600">{e.hadir} / {MIN_SESI} hari</p>
                          <p className="text-[8px] sm:text-[9px] text-gray-400">{e.tepat} tepat waktu</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </DashboardLayout>
  );
}