"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
  ArrowLeft, Trophy, Medal, Award, Users, TrendingUp, Clock, CheckCircle2,
  Inbox, CalendarDays, type LucideIcon,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend, AreaChart, Area,
} from "recharts";

// ─── TYPES ──────────────────────────────────────────────────────────────
type Scope = "day" | "month" | "all";

type UserInfo = { id: string; name: string; role: string };
type AttendanceRecord = {
  id: string; user_id: string; check_in_time: string; created_at: string;
  status: string; method: string; late_weight: number | null;
};
type ManualRecord = { id: string; user_id: string; attendance_date: string; check_in_time: string; status: string };
type LeaveRequest = { id: string; leave_date: string; reason: string | null; status: string };
type UserLeaveData = { user: { id: string; name: string; role: string }; requests: LeaveRequest[] };

type RankingEntry = {
  userId: string; name: string; role: string;
  present: number; late: number; leave: number; absentRecorded: number;
  score: number; onTimeRate: number; attendanceRate: number;
};
type StatusCount = { status: string; count: number };
type TrendPoint = { key: string; count: number };

// ─── CONSTANTS ──────────────────────────────────────────────────────────
const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

const STATUS_COLORS: Record<string, string> = { PRESENT: "#10b981", LATE: "#f59e0b", LEAVE: "#06b6d4", ABSENT: "#ef4444" };
const STATUS_LABELS: Record<string, string> = { PRESENT: "Tepat Waktu", LATE: "Terlambat", LEAVE: "Cuti", ABSENT: "Tidak Hadir" };

// ─── HELPERS ────────────────────────────────────────────────────────────
function pad2(n: number) { return String(n).padStart(2, "0"); }
function initials(name: string) { return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase(); }
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

// Versi simpel dari getDisplayStatus di halaman utama absensi — tanpa
// hitung ulang shift, karena late_weight sudah dihitung server-side saat absen.
function getAutoStatus(a: { method: string; status: string; late_weight: number | null }): "PRESENT" | "LATE" | "SKIP" {
  if (a.method === "FORCE") return "PRESENT";
  if (a.method === "SKIP" || a.status === "SKIPPED_MANUAL") return "SKIP";
  if (a.late_weight != null) {
    if (a.late_weight >= 1) return "PRESENT";
    if (a.late_weight > 0) return "LATE";
    return "SKIP";
  }
  return "PRESENT"; // fallback data lama tanpa late_weight
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

  const effByUserDate: Record<string, "PRESENT" | "LATE"> = {};
  const absentByUserDate: Record<string, "SICK" | "PERMIT" | "ABSENT"> = {};
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
    if (effByUserDate[key]) return; // absen wajah lebih diutamakan
    if (mr.status === "PRESENT" || mr.status === "LATE") {
      effByUserDate[key] = mr.status;
      trendEvents.push({ dateKey, hour: wibHour(mr.check_in_time) });
    } else if (mr.status === "SICK" || mr.status === "PERMIT" || mr.status === "ABSENT") {
      absentByUserDate[key] = mr.status as "SICK" | "PERMIT" | "ABSENT";
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
      if (effByUserDate[key]) return; // sudah hadir/telat di tanggal itu, jangan dobel
      leaveByUserDate.add(key);
    });
  });

  const agg: Record<string, { present: number; late: number; leave: number; absentRecorded: number }> = {};
  const ensure = (uid: string) => (agg[uid] ??= { present: 0, late: 0, leave: 0, absentRecorded: 0 });

  Object.entries(effByUserDate).forEach(([key, status]) => {
    const uid = key.split("_")[0];
    ensure(uid);
    if (status === "PRESENT") agg[uid].present++; else agg[uid].late++;
  });
  leaveByUserDate.forEach(key => { const uid = key.split("_")[0]; ensure(uid); agg[uid].leave++; });
  Object.keys(absentByUserDate).forEach(key => { const uid = key.split("_")[0]; ensure(uid); agg[uid].absentRecorded++; });

  const userMap: Record<string, { name: string; role: string }> = {};
  users.forEach(u => { userMap[u.id] = { name: u.name, role: u.role }; });

  const ranking: RankingEntry[] = Object.entries(agg)
    .map(([uid, v]) => {
      const score = v.present * 1 + v.late * 0.5 + v.leave * 1;
      const totalRecorded = v.present + v.late;
      const onTimeRate = totalRecorded > 0 ? Math.round((v.present / totalRecorded) * 1000) / 10 : 0;
      // Basis peringkat: RATA-RATA kualitas kehadiran per hari tercatat
      // (present+late+leave+absentRecorded), bukan total poin mentah.
      // Ini mencegah karyawan yang sering telat tapi jumlah hadirnya lebih
      // banyak mengalahkan karyawan yang jarang/tidak pernah telat.
      const totalCounted = v.present + v.late + v.leave + v.absentRecorded;
      const attendanceRate = totalCounted > 0 ? Math.round((score / totalCounted) * 1000) / 10 : 0;
      return {
        userId: uid,
        name: userMap[uid]?.name ?? "—",
        role: userMap[uid]?.role ?? "—",
        present: v.present, late: v.late, leave: v.leave, absentRecorded: v.absentRecorded,
        score, onTimeRate, attendanceRate,
      };
    })
    .sort((a, b) =>
      b.attendanceRate - a.attendanceRate ||
      b.onTimeRate - a.onTimeRate ||
      b.score - a.score
    );

  const totalPresent = ranking.reduce((s, r) => s + r.present, 0);
  const totalLate = ranking.reduce((s, r) => s + r.late, 0);
  const totalLeave = ranking.reduce((s, r) => s + r.leave, 0);
  const totalAbsent = ranking.reduce((s, r) => s + r.absentRecorded, 0);
  const totalRecordedAll = totalPresent + totalLate;

  const summary = {
    totalPresent, totalLate, totalLeave,
    activeEmployees: ranking.length,
    avgOnTimeRate: totalRecordedAll > 0 ? Math.round((totalPresent / totalRecordedAll) * 1000) / 10 : 0,
  };

  const statusDistribution: StatusCount[] = [
    { status: "PRESENT", count: totalPresent },
    { status: "LATE", count: totalLate },
    { status: "LEAVE", count: totalLeave },
    { status: "ABSENT", count: totalAbsent },
  ].filter(s => s.count > 0);

  const trendMap: Record<string, number> = {};
  trendEvents.forEach(e => {
    const key = scope === "day" ? `${pad2(e.hour)}:00` : scope === "month" ? e.dateKey : e.dateKey.slice(0, 7);
    trendMap[key] = (trendMap[key] ?? 0) + 1;
  });
  const trend: TrendPoint[] = Object.entries(trendMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => ({ key, count }));

  return { ranking, summary, statusDistribution, trend };
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
  return (
    <div className={`flex-1 ${style.order} ${style.height}`}>
      <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5 text-center ring-2 ${style.ring} relative`}>
        <div className={`absolute -top-3 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full ${style.badge} flex items-center justify-center text-white text-[10px] font-black shadow-sm`}>
          {rank + 1}
        </div>
        <Icon className={`w-5 h-5 mx-auto mt-2 mb-1.5 ${style.iconColor}`} />
        <div className={`w-12 h-12 mx-auto rounded-xl flex items-center justify-center text-sm font-bold mb-2 ${bg}`}>{initials(entry.name)}</div>
        <p className="font-bold text-gray-900 text-xs leading-tight truncate">{entry.name}</p>
        <p className="text-[9px] text-gray-400 mt-0.5 mb-2 truncate">{entry.role.replace(/_/g, " ")}</p>
        <p className="text-lg font-black text-violet-600 leading-none">{entry.attendanceRate.toFixed(1)}<span className="text-[10px] font-semibold text-gray-400 ml-1">%</span></p>
        <p className="text-[9px] text-gray-400 mt-1">{entry.present} tepat · {entry.late} telat{entry.leave > 0 ? ` · ${entry.leave} cuti` : ""}</p>
        <p className="text-[10px] font-semibold text-emerald-600 mt-1.5">{entry.score.toFixed(1)} poin · {entry.onTimeRate}% ketepatan</p>
      </div>
    </div>
  );
}

// ─── CUSTOM TOOLTIPS ────────────────────────────────────────────────────
function BarTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-gray-900 text-white text-[10px] rounded-lg px-3 py-2 shadow-lg">
      <p className="font-bold mb-0.5">{d.fullName}</p>
      <p className="text-gray-300">{d.attendanceRate.toFixed(1)}% kehadiran · {d.present} tepat · {d.late} telat</p>
    </div>
  );
}
function TrendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 text-white text-[10px] rounded-lg px-3 py-2 shadow-lg">
      <p className="font-bold mb-0.5">{label}</p>
      <p className="text-gray-300">{payload[0].value} absen</p>
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

  const top3 = data.ranking.slice(0, 3).map((entry, rank) => ({ entry, rank }));
  const podiumOrder = top3.length === 3 ? [top3[1], top3[0], top3[2]] : top3;

  const barData = useMemo(
    () => data.ranking.slice(0, 10).map(r => ({
      name: r.name.split(" ")[0], fullName: r.name, score: r.score,
      attendanceRate: r.attendanceRate, present: r.present, late: r.late,
    })),
    [data.ranking]
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
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-5">

          {/* ── Header ── */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push("/dashboard/attendance")}
                className="w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-all flex-shrink-0 active:scale-95 bg-white">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <div className="flex items-center gap-2.5 mb-1">
                  <div className="w-1 h-6 rounded-full bg-violet-600 flex-shrink-0" />
                  <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">Leaderboard Absensi</h1>
                </div>
                <p className="text-xs text-gray-400 pl-4">{headerSubtitle}</p>
              </div>
            </div>

            {/* ── Filter Periode ── */}
            <div className="flex items-center gap-1.5 flex-wrap flex-shrink-0">
              <div className="flex gap-1 p-1 bg-white rounded-xl border border-gray-100 shadow-sm">
                {SCOPE_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => setScope(opt.value)}
                    className={`h-8 px-3 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap ${scope === opt.value ? "bg-[#1a1a2e] text-white shadow-sm" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"}`}>
                    {opt.label}
                  </button>
                ))}
              </div>

              {scope === "day" && (
                <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-100 shadow-sm px-1">
                  <button onClick={() => setSelectedDate(d => addDaysToDateStr(d, -1))}
                    className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-800 transition-all font-bold text-base">‹</button>
                  <span className="text-[10px] font-semibold text-gray-600 px-1.5 whitespace-nowrap">
                    {new Date(selectedDate + "T12:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                  <button onClick={() => setSelectedDate(d => addDaysToDateStr(d, 1))}
                    className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-800 transition-all font-bold text-base">›</button>
                  <button onClick={() => setSelectedDate(todayWIB())}
                    className="h-8 px-2.5 rounded-lg hover:bg-gray-100 text-[10px] font-semibold text-gray-500 hover:text-gray-800 transition-all whitespace-nowrap">Hari ini</button>
                </div>
              )}

              {scope === "month" && (
                <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-100 shadow-sm px-1">
                  <button onClick={() => setPeriod(p => ({ month: p.month === 0 ? 11 : p.month - 1, year: p.month === 0 ? p.year - 1 : p.year }))}
                    className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-800 transition-all font-bold text-base">‹</button>
                  <span className="text-[10px] font-semibold text-gray-600 px-1.5 whitespace-nowrap">{MONTH_NAMES[period.month].substring(0, 3)} {period.year}</span>
                  <button onClick={() => setPeriod(p => ({ month: p.month === 11 ? 0 : p.month + 1, year: p.month === 11 ? p.year + 1 : p.year }))}
                    className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-800 transition-all font-bold text-base">›</button>
                </div>
              )}
            </div>
          </div>

          {scope === "all" && (
            <div className="flex items-center gap-2.5 bg-blue-50 border border-blue-100 text-blue-700 text-[11px] px-3.5 py-2.5 rounded-xl">
              Mode Semua Waktu hanya menghitung absen otomatis (wajah) — absen manual & cuti tidak disertakan.
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 text-xs px-3.5 py-3 rounded-xl">{error}</div>
          )}

          {/* ── Summary Cards ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Tepat Waktu", value: loading ? null : `${data.summary.totalPresent}`, icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />, accent: "from-emerald-50 to-emerald-100/30" },
              { label: "Terlambat", value: loading ? null : `${data.summary.totalLate}`, icon: <Clock className="w-5 h-5 text-amber-500" />, accent: "from-amber-50 to-amber-100/30" },
              { label: "Karyawan Aktif", value: loading ? null : `${data.summary.activeEmployees}`, icon: <Users className="w-5 h-5 text-blue-500" />, accent: "from-blue-50 to-blue-100/30" },
              { label: "Rata² Ketepatan", value: loading ? null : `${data.summary.avgOnTimeRate}%`, icon: <TrendingUp className="w-5 h-5 text-violet-500" />, accent: "from-violet-50 to-violet-100/30" },
            ].map(c => (
              <div key={c.label} className={`bg-gradient-to-br ${c.accent} rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3`}>
                <div className="w-9 h-9 rounded-xl bg-white/80 border border-white shadow-sm flex items-center justify-center flex-shrink-0">{c.icon}</div>
                <div className="min-w-0">
                  <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest leading-none mb-1.5">{c.label}</p>
                  <p className="text-base font-black leading-none text-gray-800 truncate">
                    {c.value === null ? <span className="inline-block w-14 h-4 bg-white/60 rounded-lg animate-pulse" /> : c.value}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Podium ── */}
          {!loading && top3.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-4">Top Performer</p>
              <div className="flex items-end gap-3">
                {podiumOrder.map(({ entry, rank }) => (
                  <PodiumCard key={entry.userId} entry={entry} rank={rank} />
                ))}
              </div>
            </div>
          )}

          {/* ── Charts ── */}
          {!loading && data.ranking.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Bar ranking */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-4">Ranking Tingkat Kehadiran (Top 10)</p>
                <ResponsiveContainer width="100%" height={Math.max(220, barData.length * 34)}>
                  <BarChart data={barData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f1f3" />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#4b5563" }} axisLine={false} tickLine={false} width={70} />
                    <Tooltip content={<BarTooltip />} cursor={{ fill: "#f5f3ff" }} />
                    <Bar dataKey="attendanceRate" fill="#7c3aed" radius={[0, 6, 6, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Status distribution */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-4">Distribusi Status</p>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(value, name) => [`${value ?? 0} hari`, name]} />
                    <Legend wrapperStyle={{ fontSize: "10px" }} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Trend */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 lg:col-span-2">
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-4">
                  Tren Kehadiran {trendLabel}
                </p>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={data.trend} margin={{ left: -16, right: 16, top: 4, bottom: 4 }}>
                    <defs>
                      <linearGradient id="trendFillAbsen" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#7c3aed" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f3" />
                    <XAxis dataKey="key" tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false}
                      tickFormatter={trendTickFormatter} />
                    <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<TrendTooltip />} />
                    <Area type="monotone" dataKey="count" stroke="#7c3aed" strokeWidth={2} fill="url(#trendFillAbsen)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── Full Ranking Table ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="font-bold text-gray-900 text-sm">Papan Peringkat Lengkap</p>
            </div>
            {loading ? (
              <div className="divide-y divide-gray-50">
                {Array(5).fill(0).map((_, i) => (
                  <div key={i} className="px-5 py-4 flex items-center gap-3.5">
                    <div className="w-6 h-4 bg-gray-100 rounded animate-pulse" />
                    <div className="w-10 h-10 rounded-xl bg-gray-100 animate-pulse flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-gray-100 rounded-lg animate-pulse w-36" />
                      <div className="h-2.5 bg-gray-100 rounded-lg animate-pulse w-24" />
                    </div>
                  </div>
                ))}
              </div>
            ) : data.ranking.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2">
                <Inbox size={30} className="text-gray-300" />
                <p className="text-xs text-gray-400 font-medium">Belum ada data absensi pada periode ini</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {data.ranking.map((r, idx) => {
                  const bg = avBg(r.name);
                  return (
                    <div key={r.userId} className="px-5 py-3.5 flex items-center gap-3.5">
                      <span className={`w-6 text-center text-xs font-black flex-shrink-0 ${idx < 3 ? "text-violet-600" : "text-gray-300"}`}>{idx + 1}</span>
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${bg}`}>{initials(r.name)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-xs leading-tight truncate">{r.name}</p>
                        <p className="text-[9px] text-gray-400 mt-0.5">
                          {r.role.replace(/_/g, " ")} · {r.present} tepat · {r.late} telat{r.leave > 0 ? ` · ${r.leave} cuti` : ""}{r.absentRecorded > 0 ? ` · ${r.absentRecorded} tidak hadir` : ""}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-bold text-gray-800 font-mono">{r.attendanceRate.toFixed(1)}% kehadiran</p>
                        <p className="text-[9px] text-emerald-600 font-semibold mt-0.5">{r.score.toFixed(1)} poin · {r.onTimeRate}% ketepatan</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </DashboardLayout>
  );
}