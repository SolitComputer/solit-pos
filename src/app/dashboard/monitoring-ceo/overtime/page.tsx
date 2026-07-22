"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUserClient } from "@/lib/auth-client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
  Clock, CalendarDays, FileText, TrendingUp, Users, Download,
  ArrowUpDown, ArrowUp, ArrowDown, Search, X, Trophy, ChevronLeft, ChevronRight,
  Medal, Activity, RefreshCw, Timer, DollarSign,
} from "lucide-react";

// ── TYPES ────────────────────────────────────────────────────────────────
type OvertimeRow = {
  id: string;
  user_id: string;
  request_date: string;
  reason: string | null;
  requested_start: string | null;
  status: string;
  approved_by: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  rate_per_hour: number | null;
  total_pay: number | null;
  duration_minutes: number | null;
  work_description: string | null;
  proof_photo_url: string | null;
  auto_completed: boolean;
  is_holiday: boolean;
  is_late: boolean | null;
  completed_at: string | null;
  created_at: string;
  users: { id: string; name: string; role: string } | null;
  approver: { id: string; name: string; role: string } | null;
};

type SummaryData = {
  totalSessions: number;
  payableSessions: number;
  totalMinutes: number;
  totalHours: number;
  totalPay: number;
  uniqueEmployees: number;
  statusCounts: Record<string, number>;
  topEmployees: { id: string; name: string; role: string; sessions: number; minutes: number; pay: number }[];
  avgMinutesPerSession: number;
};

type SortBy = "duration" | "pay" | "date";
type SortOrder = "asc" | "desc";
type EmployeeRef = { id: string; name: string; role: string };

const MONITORING_CEO_ROLES = ["ADMIN", "PROGRAMMER"];
const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

// ── HELPERS ──────────────────────────────────────────────────────────────
function pad2(n: number) { return String(n).padStart(2, "0"); }
function wibToday(): string { return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10); }
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
function startOfMonth(dateStr: string): string { return `${dateStr.slice(0, 8)}01`; }
function prevMonthRange(dateStr: string): { start: string; end: string } {
  let [y, m] = dateStr.split("-").map(Number);
  m -= 1; if (m === 0) { m = 12; y -= 1; }
  const start = `${y}-${pad2(m)}-01`;
  const last = new Date(y, m, 0).getDate();
  return { start, end: `${y}-${pad2(m)}-${pad2(last)}` };
}
function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  if (iso.includes(":") && !iso.includes("T")) return iso.substring(0, 5);
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
}
function formatDateLabel(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}
function formatDateLabelShort(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}
function formatDuration(mins: number | null): string {
  if (!mins || mins <= 0) return "—";
  const h = Math.floor(mins / 60), m = mins % 60;
  return m > 0 ? `${h}j ${m}m` : `${h} jam`;
}
function initials(name: string) { return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase(); }
const AV_COLORS = ["bg-violet-100 text-violet-700", "bg-blue-100 text-blue-700", "bg-emerald-100 text-emerald-700", "bg-rose-100 text-rose-700", "bg-amber-100 text-amber-700", "bg-cyan-100 text-cyan-700", "bg-purple-100 text-purple-700"];
function avBg(name: string) { let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff; return AV_COLORS[Math.abs(h) % AV_COLORS.length]; }
function csvEscape(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  PENDING: { label: "Pending", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-400" },
  APPROVED: { label: "Disetujui", bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200", dot: "bg-violet-500" },
  ONGOING: { label: "Berjalan", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
  COMPLETED: { label: "Selesai", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", dot: "bg-blue-500" },
  NEED_PROOF: { label: "Upload Foto", bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", dot: "bg-orange-500" },
  REJECTED: { label: "Ditolak", bg: "bg-red-50", text: "text-red-700", border: "border-red-200", dot: "bg-red-500" },
  CANCELLED: { label: "Dibatalkan", bg: "bg-gray-50", text: "text-gray-500", border: "border-gray-200", dot: "bg-gray-400" },
};
function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CONFIG[status] ?? { label: status, bg: "bg-gray-50", text: "text-gray-600", border: "border-gray-200", dot: "bg-gray-400" };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border ${c.bg} ${c.text} ${c.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.dot}`} />{c.label}
    </span>
  );
}

const PRESETS: { key: "today" | "7d" | "month" | "lastMonth"; label: string }[] = [
  { key: "today", label: "Hari Ini" },
  { key: "7d", label: "7 Hari Terakhir" },
  { key: "month", label: "Bulan Ini" },
  { key: "lastMonth", label: "Bulan Lalu" },
];

// ── DATE RANGE CALENDAR ──────────────────────────────────────────────────
function DateRangeCalendar({
  startDate,
  endDate,
  rangeAnchor,
  onDayClick,
  maxDate,
}: {
  startDate: string;
  endDate: string;
  rangeAnchor: string | null;
  onDayClick: (dateStr: string) => void;
  maxDate: string;
}) {
  const [viewYear, setViewYear] = useState(() => Number(endDate.slice(0, 4)));
  const [viewMonth, setViewMonth] = useState(() => Number(endDate.slice(5, 7)) - 1);
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  useEffect(() => {
    if (!rangeAnchor) {
      setViewYear(Number(endDate.slice(0, 4)));
      setViewMonth(Number(endDate.slice(5, 7)) - 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endDate]);

  const goPrevMonth = () => setViewMonth(m => { if (m === 0) { setViewYear(y => y - 1); return 11; } return m - 1; });
  const goNextMonth = () => setViewMonth(m => { if (m === 11) { setViewYear(y => y + 1); return 0; } return m + 1; });
  const goToday = () => { const t = wibToday(); setViewYear(Number(t.slice(0, 4))); setViewMonth(Number(t.slice(5, 7)) - 1); };

  const calDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }, [viewYear, viewMonth]);

  const effStart = rangeAnchor
    ? (hoverDate && hoverDate < rangeAnchor ? hoverDate : rangeAnchor)
    : startDate;
  const effEnd = rangeAnchor
    ? (hoverDate && hoverDate > rangeAnchor ? hoverDate : rangeAnchor)
    : endDate;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-black text-gray-900">{MONTH_NAMES[viewMonth]} {viewYear}</p>
        <div className="flex items-center gap-1">
          <button type="button" onClick={goPrevMonth} className="w-8 h-8 rounded-lg hover:bg-white flex items-center justify-center text-gray-500 hover:text-violet-600 transition-all border border-transparent hover:border-gray-200 hover:shadow-sm">
            <ChevronLeft size={14} />
          </button>
          <button type="button" onClick={goToday} className="h-8 px-2.5 rounded-lg hover:bg-white text-[10px] font-bold text-gray-500 hover:text-violet-600 transition-all border border-transparent hover:border-gray-200">
            Hari ini
          </button>
          <button type="button" onClick={goNextMonth} className="w-8 h-8 rounded-lg hover:bg-white flex items-center justify-center text-gray-500 hover:text-violet-600 transition-all border border-transparent hover:border-gray-200 hover:shadow-sm">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1.5">
        {DAY_NAMES.map((d, i) => (
          <div key={d} className={`text-center text-[9px] font-black py-1 uppercase tracking-wider ${i === 0 ? "text-red-400" : "text-gray-400"}`}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {calDays.map((day, idx) => {
          if (!day) return <div key={`e-${idx}`} />;
          const dk = `${viewYear}-${pad2(viewMonth + 1)}-${pad2(day)}`;
          const isFuture = dk > maxDate;
          const isToday = dk === wibToday();
          const isStart = dk === effStart;
          const isEnd = dk === effEnd;
          const isInRange = dk > effStart && dk < effEnd;
          const isSun = new Date(dk + "T12:00:00").getDay() === 0;
          return (
            <button
              key={day}
              type="button"
              onClick={() => onDayClick(dk)}
              onMouseEnter={() => setHoverDate(dk)}
              onMouseLeave={() => setHoverDate(null)}
              className={`relative h-9 rounded-lg flex items-center justify-center text-xs font-bold transition-all
                ${isStart || isEnd
                  ? "bg-gradient-to-br from-violet-500 to-violet-700 text-white shadow-md shadow-violet-500/30"
                  : isInRange
                    ? "bg-violet-100 text-violet-700"
                    : isFuture
                      ? "text-gray-300 hover:bg-gray-50"
                      : isSun
                        ? "text-red-400 hover:bg-white"
                        : "text-gray-700 hover:bg-white hover:shadow-sm"}`}
            >
              {day}
              {isToday && !isStart && !isEnd && <span className="absolute bottom-1 w-1 h-1 rounded-full bg-violet-500" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── DETAIL MODAL (read-only, per sesi) ─────────────────────────────────────
function MonitorDetailModal({ overtime: o, onClose }: { overtime: OvertimeRow; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden border border-gray-100/80" onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-0 sm:hidden"><div className="w-10 h-1 rounded-full bg-gray-200" /></div>

        {/* Header — gradient */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[#1e1b4b] via-[#4c1d95] to-violet-700 px-5 pt-4 pb-4 flex items-start gap-3">
          <div className="absolute -top-8 -right-8 w-32 h-32 bg-violet-500/30 rounded-full blur-2xl" />
          <div className="relative w-11 h-11 rounded-xl flex items-center justify-center text-xs font-black flex-shrink-0 bg-white/15 backdrop-blur-sm border border-white/20 text-white">
            {initials(o.users?.name ?? "?")}
          </div>
          <div className="relative flex-1 min-w-0 pt-0.5">
            <h2 className="text-sm font-black text-white leading-tight truncate">{o.users?.name ?? "—"}</h2>
            <p className="text-[10px] text-white/70 mt-0.5 truncate">{o.users?.role?.replace(/_/g, " ") ?? "—"} · {formatDateLabel(o.request_date)}</p>
          </div>
          <button onClick={onClose} className="relative w-8 h-8 rounded-xl flex items-center justify-center text-white/80 hover:text-white hover:bg-white/20 transition-all shrink-0 mt-0.5">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3.5 max-h-[70vh] overflow-y-auto">
          <div className="flex items-center gap-1.5 flex-wrap">
            <StatusBadge status={o.status} />
            {o.is_late && <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border bg-amber-50 text-amber-700 border-amber-200">Terlambat</span>}
            {o.is_holiday && <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border bg-purple-50 text-purple-700 border-purple-200">Hari Libur</span>}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              ["Mulai", formatTime(o.actual_start ?? o.scheduled_start)],
              ["Selesai", formatTime(o.actual_end ?? o.scheduled_end)],
              ["Durasi", formatDuration(o.duration_minutes)],
            ].map(([k, v]) => (
              <div key={k} className="bg-gradient-to-br from-gray-50 to-gray-100/50 border border-gray-100 rounded-xl p-3 text-center">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1.5">{k}</p>
                <p className="font-black text-gray-800 text-xs font-mono">{v}</p>
              </div>
            ))}
          </div>
          <div className="bg-gray-50/70 border border-gray-100 rounded-xl p-3.5">
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1.5">Alasan</p>
            <p className="text-xs text-gray-800">{o.reason || "—"}</p>
          </div>
          <div className="bg-gray-50/70 border border-gray-100 rounded-xl p-3.5">
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1.5">Rincian Pekerjaan</p>
            <p className="text-xs text-gray-700 leading-relaxed">{o.work_description || "—"}</p>
          </div>
          {o.approver && (
            <div className="bg-gray-50/70 border border-gray-100 rounded-xl p-3.5">
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1.5">
                {o.status === "REJECTED" ? "Ditolak oleh" : "Disetujui oleh"}
              </p>
              <p className="text-xs text-gray-800 font-bold">{o.approver.name}</p>
              <p className="text-[9px] text-gray-400 mt-0.5">{o.approver.role.replace(/_/g, " ")}</p>
            </div>
          )}
          <div className="relative overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-violet-900 rounded-2xl p-4">
            <div className="absolute -top-4 -right-4 w-24 h-24 bg-violet-500/20 rounded-full blur-2xl" />
            <div className="relative flex items-end justify-between">
              <div>
                <p className="text-[9px] text-white/60 font-black uppercase tracking-wider mb-1">Total Bayaran</p>
                <p className="text-xl font-black text-white">{o.total_pay != null ? formatRupiah(o.total_pay) : "—"}</p>
              </div>
              {o.rate_per_hour != null && <p className="text-[10px] text-white/50 font-mono">{formatRupiah(o.rate_per_hour)}/jam</p>}
            </div>
          </div>
          {o.proof_photo_url && (
            <div>
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-2">Foto Bukti</p>
              <a href={o.proof_photo_url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-2xl border border-gray-100 hover:opacity-90 transition-opacity shadow-sm">
                <img src={o.proof_photo_url} alt="Bukti" className="w-full h-44 object-cover" />
              </a>
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/60">
          <button onClick={onClose} className="w-full h-10 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-all">
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

// ── EMPLOYEE DETAIL VIEW (drill-down per karyawan) ─────────────────────────
function EmployeeOvertimeDetailView({
  employee,
  rows,
  loading,
  onBack,
  onOpenDetail,
}: {
  employee: EmployeeRef;
  rows: OvertimeRow[];
  loading: boolean;
  onBack: () => void;
  onOpenDetail: (row: OvertimeRow) => void;
}) {
  const [statusFilter, setStatusFilter] = useState("Semua");

  const sorted = useMemo(
    () => [...rows].sort((a, b) => new Date(b.request_date).getTime() - new Date(a.request_date).getTime()),
    [rows]
  );
  const statuses = useMemo(() => [...new Set(rows.map(r => r.status))], [rows]);
  const filtered = useMemo(
    () => (statusFilter === "Semua" ? sorted : sorted.filter(r => r.status === statusFilter)),
    [sorted, statusFilter]
  );

  const counts = {
    total: rows.length,
    pending: rows.filter(r => r.status === "PENDING").length,
    ongoing: rows.filter(r => r.status === "ONGOING").length,
    selesai: rows.filter(r => r.status === "COMPLETED").length,
  };
  const totalPay = rows
    .filter(r => ["COMPLETED", "NEED_PROOF"].includes(r.status))
    .reduce((s, r) => s + (r.total_pay ?? 0), 0);

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header — gradient */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#1e1b4b] via-[#4c1d95] to-violet-700 px-5 py-4 flex items-center gap-3">
        <div className="absolute -top-8 -right-8 w-32 h-32 bg-violet-500/30 rounded-full blur-2xl" />
        <button onClick={onBack} className="relative w-10 h-10 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-all flex-shrink-0 active:scale-95">
          <ChevronLeft size={18} />
        </button>
        <div className="relative w-11 h-11 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0 bg-white/15 backdrop-blur-sm border border-white/20 text-white">
          {initials(employee.name)}
        </div>
        <div className="relative flex-1 min-w-0">
          <p className="font-black text-white text-sm leading-tight truncate">{employee.name}</p>
          <p className="text-[10px] text-white/70 mt-0.5">{employee.role.replace(/_/g, " ")} · {rows.length} lemburan</p>
        </div>
      </div>

      {/* Quick stats */}
      <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-br from-gray-50/60 to-white">
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Total", value: counts.total, color: "text-gray-800", bg: "bg-gray-100" },
            { label: "Pending", value: counts.pending, color: "text-amber-600", bg: "bg-amber-50" },
            { label: "Berjalan", value: counts.ongoing, color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Selesai", value: counts.selesai, color: "text-blue-600", bg: "bg-blue-50" },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl px-2 py-2.5 text-center border border-white`}>
              <p className={`text-xl sm:text-2xl font-black ${s.color} tabular-nums leading-none`}>{s.value}</p>
              <p className="text-[9px] text-gray-400 font-black uppercase tracking-wider mt-1">{s.label}</p>
            </div>
          ))}
        </div>
        {totalPay > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <DollarSign size={12} className="text-gray-400" />
              <p className="text-[10px] text-gray-500 font-medium">Total bayaran lemburan selesai</p>
            </div>
            <p className="text-sm font-black text-gray-800 font-mono">{formatRupiah(totalPay)}</p>
          </div>
        )}
      </div>

      {statuses.length > 1 && (
        <div className="px-5 py-2.5 border-b border-gray-100 flex gap-1.5 overflow-x-auto scrollbar-hide">
          {["Semua", ...statuses].map(s => {
            const c = s !== "Semua" ? STATUS_CONFIG[s] : null;
            const active = statusFilter === s;
            return (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`flex-shrink-0 h-7 px-3 rounded-lg text-[10px] font-bold transition-all border ${active ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"}`}>
                {c ? c.label : "Semua"}
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="divide-y divide-gray-50">
          {Array(4).fill(0).map((_, i) => (
            <div key={i} className="px-5 py-4 flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-lg bg-gray-100 animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-2"><div className="h-3 bg-gray-100 rounded-lg animate-pulse w-40" /><div className="h-2.5 bg-gray-100 rounded-lg animate-pulse w-24" /></div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <div className="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center mb-1">
            <FileText size={26} className="text-gray-300" />
          </div>
          <p className="text-xs text-gray-400 font-bold">Tidak ada data</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {filtered.map(o => {
            const duration = formatDuration(o.duration_minutes);
            const dateObj = new Date(o.request_date + "T12:00:00");
            return (
              <button key={o.id} onClick={() => onOpenDetail(o)}
                className="w-full px-4 sm:px-5 py-4 flex items-center gap-3 sm:gap-4 text-left hover:bg-violet-50/40 transition-colors">
                <div className="w-10 flex-shrink-0 text-center bg-gray-50 border border-gray-100 rounded-xl py-1.5">
                  <p className="text-base font-black text-gray-800 leading-none">{dateObj.getDate()}</p>
                  <p className="text-[9px] text-gray-400 font-black uppercase mt-0.5">{MONTH_NAMES[dateObj.getMonth()].substring(0, 3)}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                    <StatusBadge status={o.status} />
                    {o.is_late && <span className="text-[8px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md uppercase">Telat</span>}
                    {o.is_holiday && <span className="text-[8px] font-black text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded-md uppercase">Libur</span>}
                    {o.approver && (
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md border ${o.status === "REJECTED" ? "text-red-600 bg-red-50 border-red-100" : "text-emerald-600 bg-emerald-50 border-emerald-100"}`}>
                        {o.status === "REJECTED" ? "Ditolak" : "Diacc"}: {o.approver.name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                    <Clock size={10} className="text-gray-400" />
                    <span className="font-mono font-semibold">{formatTime(o.actual_start ?? o.scheduled_start)} – {formatTime(o.actual_end ?? o.scheduled_end)}</span>
                    {duration !== "—" && <><span className="text-gray-200">·</span><span className="text-gray-400 font-medium">{duration}</span></>}
                  </div>
                  {o.work_description && <p className="text-[10px] text-gray-400 truncate mt-0.5">{o.work_description}</p>}
                </div>
                <div className="flex-shrink-0 flex items-center gap-2.5">
                  {o.total_pay != null && <p className="text-xs font-black text-gray-700 font-mono hidden sm:block">{formatRupiah(o.total_pay)}</p>}
                  <ChevronRight size={16} className="text-gray-300" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── MAIN PAGE ──────────────────────────────────────────────────────────────
export default function CeoOvertimeMonitoringPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const today = wibToday();
  const [startDate, setStartDate] = useState(startOfMonth(today));
  const [endDate, setEndDate] = useState(today);
  const [activePreset, setActivePreset] = useState<"today" | "7d" | "month" | "lastMonth" | "custom">("month");
  const [rangeAnchor, setRangeAnchor] = useState<string | null>(null);

  const [sortBy, setSortBy] = useState<SortBy>("duration");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [statusFilter, setStatusFilter] = useState<string>("Semua");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [rows, setRows] = useState<OvertimeRow[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detailRow, setDetailRow] = useState<OvertimeRow | null>(null);

  // ── Employee drill-down ──
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRef | null>(null);
  const [employeeRows, setEmployeeRows] = useState<OvertimeRow[]>([]);
  const [employeeLoading, setEmployeeLoading] = useState(false);

  useEffect(() => {
    getCurrentUserClient().then(u => { setCurrentUser(u); setAuthChecked(true); });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchData = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ startDate, endDate, sortBy, sortOrder });
      if (statusFilter !== "Semua") params.set("status", statusFilter);
      if (search) params.set("search", search);
      const res = await fetch(`/api/attendance/overtime/monitoring?${params.toString()}`);
      const d = await res.json();
      if (!res.ok || !d.success) {
        setError(d.message || `Gagal memuat data (${res.status})`);
        setRows([]); setSummary(null);
        return;
      }
      setRows(d.data || []); setSummary(d.summary || null);
    } catch {
      setError("Gagal memuat data. Periksa koneksi internet.");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, sortBy, sortOrder, statusFilter, search]);

  useEffect(() => { if (authChecked) fetchData(); }, [authChecked, fetchData]);

  const fetchEmployeeData = useCallback(async (employee: EmployeeRef) => {
    setEmployeeLoading(true);
    try {
      const params = new URLSearchParams({
        startDate, endDate, sortBy: "date", sortOrder: "desc", userId: employee.id,
      });
      const res = await fetch(`/api/attendance/overtime/monitoring?${params.toString()}`);
      const d = await res.json();
      setEmployeeRows(res.ok && d.success ? (d.data || []) : []);
    } catch {
      setEmployeeRows([]);
    } finally {
      setEmployeeLoading(false);
    }
  }, [startDate, endDate]);

  const openEmployee = (employee: EmployeeRef) => {
    setSelectedEmployee(employee);
    fetchEmployeeData(employee);
  };
  const closeEmployee = () => { setSelectedEmployee(null); setEmployeeRows([]); };

  const isAllowed = useMemo(() => {
    if (!currentUser) return true;
    const roles: string[] = Array.isArray(currentUser.roles) && currentUser.roles.length > 0 ? currentUser.roles : [currentUser.role];
    return roles.some((r: string) => MONITORING_CEO_ROLES.includes(r));
  }, [currentUser]);

  const applyPreset = (preset: "today" | "7d" | "month" | "lastMonth") => {
    setActivePreset(preset);
    setRangeAnchor(null);
    const t = wibToday();
    if (preset === "today") { setStartDate(t); setEndDate(t); }
    else if (preset === "7d") { setStartDate(addDays(t, -6)); setEndDate(t); }
    else if (preset === "month") { setStartDate(startOfMonth(t)); setEndDate(t); }
    else if (preset === "lastMonth") { const { start, end } = prevMonthRange(t); setStartDate(start); setEndDate(end); }
  };

  const handleCalendarDayClick = (dateStr: string) => {
    setActivePreset("custom");
    if (!rangeAnchor) {
      setRangeAnchor(dateStr);
      setStartDate(dateStr);
      setEndDate(dateStr);
    } else {
      if (dateStr >= rangeAnchor) { setStartDate(rangeAnchor); setEndDate(dateStr); }
      else { setStartDate(dateStr); setEndDate(rangeAnchor); }
      setRangeAnchor(null);
    }
  };

  const handleSortClick = (field: SortBy) => {
    if (sortBy === field) setSortOrder(o => (o === "asc" ? "desc" : "asc"));
    else { setSortBy(field); setSortOrder("desc"); }
  };

  const renderSortIcon = (field: SortBy) => {
    if (sortBy !== field) return <ArrowUpDown size={12} className="text-gray-300" />;
    return sortOrder === "asc" ? <ArrowUp size={12} className="text-violet-600" /> : <ArrowDown size={12} className="text-violet-600" />;
  };

  const exportCsv = () => {
    const sourceRows = selectedEmployee ? employeeRows : rows;
    const header = ["Nama", "Role", "Tanggal", "Jam Mulai", "Jam Selesai", "Durasi (menit)", "Status", "Keterangan Pekerjaan", "Total Nominal"];
    const lines = sourceRows.map(o => [
      csvEscape(o.users?.name ?? selectedEmployee?.name ?? "—"),
      csvEscape((o.users?.role ?? selectedEmployee?.role)?.replace(/_/g, " ") ?? "—"),
      csvEscape(o.request_date),
      csvEscape(formatTime(o.actual_start ?? o.scheduled_start)),
      csvEscape(formatTime(o.actual_end ?? o.scheduled_end)),
      csvEscape(o.duration_minutes ?? 0),
      csvEscape(o.status),
      csvEscape(o.work_description ?? ""),
      csvEscape(o.total_pay ?? 0),
    ].join(","));
    const csv = "\uFEFF" + [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = selectedEmployee
      ? `lembur_${selectedEmployee.name.replace(/\s+/g, "-")}_${startDate}_${endDate}.csv`
      : `monitoring-lembur_${startDate}_${endDate}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const statusChips = useMemo(() => ["Semua", ...(summary ? Object.keys(summary.statusCounts) : [])], [summary]);

  if (authChecked && !isAllowed) {
    return (
      <DashboardLayout>
        <div className="min-h-screen bg-[#F7F7F8] flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8 max-w-sm text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto"><X className="text-red-500" size={24} /></div>
            <p className="font-black text-gray-900">Akses Ditolak</p>
            <p className="text-xs text-gray-400">Halaman Monitoring CEO khusus untuk Admin dan Programmer.</p>
            <button onClick={() => router.push("/dashboard")} className="h-10 px-5 bg-gray-900 text-white rounded-xl text-xs font-bold hover:bg-gray-800 transition">Kembali ke Dashboard</button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-[#F7F7F8]">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 space-y-4 sm:space-y-5">

          {/* ─── HERO HEADER ─── */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1e1b4b] via-[#4c1d95] to-violet-700 p-5 sm:p-7 shadow-xl shadow-violet-900/20">
            <div className="absolute -top-16 -right-16 w-48 h-48 bg-violet-400/25 rounded-full blur-3xl" />
            <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-fuchsia-500/15 rounded-full blur-3xl" />

            <div className="relative flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row">
              <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg">
                  <Timer className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-white tracking-tight leading-none">
                      Monitor Lemburan
                    </h1>
                    <span className="inline-flex items-center gap-1.5 text-[9px] sm:text-[10px] font-bold text-emerald-300 bg-emerald-500/20 backdrop-blur-sm border border-emerald-400/30 px-2 py-0.5 rounded-full flex-shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      LIVE
                    </span>
                  </div>
                  <p className="text-[11px] sm:text-sm text-white/60 font-medium leading-snug truncate">
                    {selectedEmployee
                      ? (employeeLoading ? "Memuat data..." : `${selectedEmployee.name} · ${employeeRows.length} lemburan`)
                      : (loading
                        ? "Memuat data..."
                        : `${rows.length} lemburan · ${startDate === endDate ? formatDateLabel(startDate) : `${formatDateLabel(startDate)} – ${formatDateLabel(endDate)}`}`)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
                <button
                  onClick={() => fetchData()}
                  disabled={loading}
                  className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 text-white flex items-center justify-center transition disabled:opacity-50 flex-shrink-0"
                  title="Refresh"
                >
                  <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                </button>
                <button
                  onClick={() => router.push("/dashboard/attendance/overtime/leaderboard")}
                  className="h-10 px-3 sm:px-4 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
                >
                  <Trophy size={14} />
                  <span className="hidden sm:inline">Leaderboard</span>
                </button>
                <button
                  onClick={exportCsv}
                  disabled={(selectedEmployee ? employeeRows : rows).length === 0}
                  className="flex-1 sm:flex-none h-10 px-3 sm:px-4 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed text-violet-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-md"
                >
                  <Download size={14} />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-3 rounded-2xl font-semibold flex items-center gap-2">
              <X size={14} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {selectedEmployee ? (
            <EmployeeOvertimeDetailView
              employee={selectedEmployee}
              rows={employeeRows}
              loading={employeeLoading}
              onBack={closeEmployee}
              onOpenDetail={(row) => setDetailRow(row)}
            />
          ) : (
            <>
              {/* ─── SUMMARY CARDS ─── */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
                {[
                  { label: "Total Lemburan", value: summary?.totalSessions ?? 0, icon: <FileText className="w-5 h-5" />, tone: "gray" as const },
                  { label: "Total Jam", value: `${summary?.totalHours ?? 0} j`, icon: <Clock className="w-5 h-5" />, tone: "violet" as const },
                  { label: "Karyawan Terlibat", value: summary?.uniqueEmployees ?? 0, icon: <Users className="w-5 h-5" />, tone: "emerald" as const },
                  { label: "Total Nominal", value: formatRupiah(summary?.totalPay ?? 0), icon: <TrendingUp className="w-5 h-5" />, tone: "blue" as const, small: true },
                ].map(c => (
                  <StatCard key={c.label} label={c.label} value={c.value} icon={c.icon} tone={c.tone} small={c.small} loading={loading} />
                ))}
              </div>

              {/* ─── FILTER PANEL ─── */}
              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 sm:px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2 bg-gradient-to-r from-gray-50/60 to-white">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                      <CalendarDays className="w-4 h-4" />
                    </div>
                    <p className="text-sm font-black text-gray-900">Filter Rentang</p>
                  </div>
                  <div className="flex items-center gap-2 bg-violet-50 border border-violet-100 rounded-xl px-3 py-1.5">
                    <Activity size={10} className="text-violet-600" />
                    <span className="text-[10px] font-black text-violet-700 tabular-nums">
                      {startDate === endDate ? formatDateLabelShort(startDate) : `${formatDateLabelShort(startDate)} – ${formatDateLabelShort(endDate)}`}
                    </span>
                  </div>
                </div>

                <div className="px-4 sm:px-5 py-4 space-y-4">
                  <div className="flex flex-wrap gap-1.5">
                    {PRESETS.map(p => (
                      <button key={p.key} onClick={() => applyPreset(p.key)}
                        className={`h-8 px-3.5 rounded-lg text-[11px] font-bold border transition-all ${activePreset === p.key ? "bg-gray-900 text-white border-gray-900 shadow-sm" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-800"}`}>
                        {p.label}
                      </button>
                    ))}
                  </div>

                  <div className="border border-gray-100 rounded-2xl p-4 bg-gradient-to-br from-gray-50/40 to-white">
                    <DateRangeCalendar
                      startDate={startDate}
                      endDate={endDate}
                      rangeAnchor={rangeAnchor}
                      onDayClick={handleCalendarDayClick}
                      maxDate={wibToday()}
                    />
                    <p className="text-[10px] text-gray-400 mt-3 text-center font-medium">
                      {rangeAnchor
                        ? "Klik tanggal kedua untuk membuat rentang, atau klik yang sama untuk 1 hari."
                        : "Klik satu tanggal untuk 1 hari, atau klik dua tanggal untuk rentang."}
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2.5 pt-3 border-t border-gray-100">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" />
                      <input type="text" placeholder="Cari nama karyawan..." value={searchInput} onChange={e => setSearchInput(e.target.value)}
                        className="w-full h-10 pl-9 pr-8 border border-gray-200 rounded-xl text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 focus:bg-white transition-all placeholder:text-gray-300" />
                      {searchInput && (
                        <button onClick={() => setSearchInput("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 p-1 hover:bg-gray-100 rounded-lg transition">
                          <X size={13} />
                        </button>
                      )}
                    </div>
                    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
                      {statusChips.map(s => {
                        const c = s !== "Semua" ? STATUS_CONFIG[s] : null;
                        const active = statusFilter === s;
                        return (
                          <button key={s} onClick={() => setStatusFilter(s)}
                            className={`flex-shrink-0 h-10 px-3 rounded-xl text-[10px] font-bold transition-all border whitespace-nowrap ${active ? "bg-gray-900 text-white border-gray-900 shadow-sm" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"}`}>
                            {c ? c.label : "Semua"}{summary && s !== "Semua" ? ` (${summary.statusCounts[s] ?? 0})` : ""}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* ─── TOP EMPLOYEES ─── */}
              {summary && summary.topEmployees.length > 0 && (
                <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-4 sm:px-5 py-4 border-b border-gray-100 flex items-center gap-2.5 bg-gradient-to-r from-amber-50/60 to-white">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-amber-500 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                      <Trophy className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-gray-900">Top 5 Jam Lembur</p>
                      <p className="text-[10px] text-gray-400 font-medium">Di rentang tanggal ini</p>
                    </div>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 tabular-nums flex-shrink-0">
                      {summary.topEmployees.length}
                    </span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {summary.topEmployees.map((e, i) => (
                      <button key={e.id + i} onClick={() => openEmployee({ id: e.id, name: e.name, role: e.role })}
                        className="w-full flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-amber-50/30 transition-all text-left group">
                        {/* Rank / Medal */}
                        {i < 3 ? (
                          <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-white flex-shrink-0 shadow-md bg-gradient-to-br ${
                            i === 0 ? "from-amber-400 to-yellow-500 shadow-amber-500/40" :
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
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-black flex-shrink-0 ${avBg(e.name)}`}>
                          {initials(e.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-gray-800 truncate group-hover:text-violet-700 transition">{e.name}</p>
                          <p className="text-[10px] text-gray-400 truncate">{e.role.replace(/_/g, " ")} · {e.sessions} sesi</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs font-black text-gray-800 font-mono tabular-nums">{Math.round((e.minutes / 60) * 10) / 10}j</p>
                          <p className="text-[10px] text-gray-400 font-mono hidden sm:block">{formatRupiah(e.pay)}</p>
                        </div>
                        <ChevronRight size={14} className="text-gray-300 group-hover:text-violet-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ─── DETAIL TABLE ─── */}
              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 sm:px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2 bg-gradient-to-r from-gray-50/60 to-white">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-gray-700 to-gray-900 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                      <FileText className="w-4 h-4" />
                    </div>
                    <p className="text-sm font-black text-gray-900">Detail Lemburan</p>
                    {!loading && rows.length > 0 && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 tabular-nums">{rows.length}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[9px] text-gray-400 font-black uppercase tracking-wider mr-1 hidden sm:inline">Urutkan:</span>
                    {(["duration", "pay", "date"] as SortBy[]).map(f => (
                      <button key={f} onClick={() => handleSortClick(f)}
                        className={`h-7 px-2.5 rounded-lg text-[10px] font-bold border flex items-center gap-1 transition-all ${sortBy === f ? "bg-violet-50 border-violet-300 text-violet-700 shadow-sm" : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                        {f === "duration" ? "Durasi" : f === "pay" ? "Nominal" : "Tanggal"}
                        {renderSortIcon(f)}
                      </button>
                    ))}
                  </div>
                </div>

                {loading ? (
                  <div className="divide-y divide-gray-50">
                    {Array(6).fill(0).map((_, i) => (
                      <div key={i} className="px-5 py-4 flex items-center gap-3.5">
                        <div className="w-9 h-9 rounded-xl bg-gray-100 animate-pulse flex-shrink-0" />
                        <div className="flex-1 space-y-2"><div className="h-3 bg-gray-100 rounded-lg animate-pulse w-40" /><div className="h-2.5 bg-gray-100 rounded-lg animate-pulse w-24" /></div>
                        <div className="w-16 h-6 bg-gray-100 rounded-lg animate-pulse hidden sm:block" />
                      </div>
                    ))}
                  </div>
                ) : rows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-2.5 px-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-gray-50 to-gray-100 rounded-full flex items-center justify-center mb-1">
                      <FileText size={26} className="text-gray-300" />
                    </div>
                    <p className="text-sm font-black text-gray-500">Tidak Ada Data</p>
                    <p className="text-xs text-gray-400 text-center">Tidak ada lemburan pada rentang atau filter ini</p>
                  </div>
                ) : (
                  <>
                    {/* Desktop table */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full min-w-[820px] text-xs">
                        <thead>
                          <tr className="bg-gray-50/70 border-b border-gray-100">
                            <th className="text-left font-black text-gray-400 uppercase tracking-wider text-[9px] px-5 py-3">Karyawan</th>
                            <th className="text-left font-black text-gray-400 uppercase tracking-wider text-[9px] px-3 py-3">Tanggal</th>
                            <th className="text-left font-black text-gray-400 uppercase tracking-wider text-[9px] px-3 py-3">Jam</th>
                            <th className="text-left font-black text-gray-400 uppercase tracking-wider text-[9px] px-3 py-3">Durasi</th>
                            <th className="text-left font-black text-gray-400 uppercase tracking-wider text-[9px] px-3 py-3">Status</th>
                            <th className="text-left font-black text-gray-400 uppercase tracking-wider text-[9px] px-3 py-3">Keterangan</th>
                            <th className="text-right font-black text-gray-400 uppercase tracking-wider text-[9px] px-5 py-3">Nominal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {rows.map(o => (
                            <tr key={o.id} onClick={() => setDetailRow(o)} className="hover:bg-violet-50/40 cursor-pointer transition-colors group">
                              <td className="px-5 py-3.5">
                                <button
                                  onClick={(e) => { e.stopPropagation(); if (o.users) openEmployee(o.users); }}
                                  className="flex items-center gap-2.5 text-left hover:opacity-80 transition-opacity"
                                >
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black flex-shrink-0 ${avBg(o.users?.name ?? "?")}`}>{initials(o.users?.name ?? "?")}</div>
                                  <div className="min-w-0">
                                    <p className="font-bold text-gray-800 truncate group-hover:text-violet-700 transition">{o.users?.name ?? "—"}</p>
                                    <p className="text-[9px] text-gray-400">{o.users?.role?.replace(/_/g, " ") ?? "—"}</p>
                                  </div>
                                </button>
                              </td>
                              <td className="px-3 py-3.5 text-gray-600 whitespace-nowrap font-medium">{formatDateLabel(o.request_date)}</td>
                              <td className="px-3 py-3.5 text-gray-600 font-mono whitespace-nowrap font-semibold">{formatTime(o.actual_start ?? o.scheduled_start)}–{formatTime(o.actual_end ?? o.scheduled_end)}</td>
                              <td className="px-3 py-3.5 font-black text-gray-800 whitespace-nowrap">{formatDuration(o.duration_minutes)}</td>
                              <td className="px-3 py-3.5"><StatusBadge status={o.status} /></td>
                              <td className="px-3 py-3.5 text-gray-500 max-w-[240px] truncate">{o.work_description || "—"}</td>
                              <td className="px-5 py-3.5 text-right font-black text-gray-800 font-mono whitespace-nowrap tabular-nums">{o.total_pay != null ? formatRupiah(o.total_pay) : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile cards */}
                    <div className="md:hidden divide-y divide-gray-50">
                      {rows.map(o => (
                        <div key={o.id} onClick={() => setDetailRow(o)} className="px-4 py-3.5 hover:bg-violet-50/40 cursor-pointer transition-colors">
                          <div className="flex items-start gap-3">
                            <button
                              onClick={(e) => { e.stopPropagation(); if (o.users) openEmployee(o.users); }}
                              className={`w-10 h-10 rounded-xl flex items-center justify-center text-[11px] font-black flex-shrink-0 ${avBg(o.users?.name ?? "?")}`}>
                              {initials(o.users?.name ?? "?")}
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <p className="font-bold text-gray-900 text-sm truncate">{o.users?.name ?? "—"}</p>
                                <StatusBadge status={o.status} />
                              </div>
                              <p className="text-[10px] text-gray-500 truncate">{o.users?.role?.replace(/_/g, " ") ?? "—"} · {formatDateLabelShort(o.request_date)}</p>
                              <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-1">
                                <span className="font-mono font-semibold">{formatTime(o.actual_start ?? o.scheduled_start)}–{formatTime(o.actual_end ?? o.scheduled_end)}</span>
                                <span className="text-gray-300">·</span>
                                <span className="font-bold text-gray-700">{formatDuration(o.duration_minutes)}</span>
                              </div>
                              {o.work_description && (
                                <p className="text-[10px] text-gray-400 truncate mt-1">{o.work_description}</p>
                              )}
                              {o.total_pay != null && (
                                <p className="text-xs font-black text-violet-700 font-mono tabular-nums mt-1.5">{formatRupiah(o.total_pay)}</p>
                              )}
                            </div>
                            <ChevronRight size={14} className="text-gray-300 flex-shrink-0 mt-1" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {detailRow && <MonitorDetailModal overtime={detailRow} onClose={() => setDetailRow(null)} />}

      <style jsx global>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </DashboardLayout>
  );
}

// ─── Sub-component: StatCard ─────────────────────────────────────────────
function StatCard({
  label,
  value,
  icon,
  tone,
  small = false,
  loading = false,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  tone: "gray" | "violet" | "emerald" | "blue";
  small?: boolean;
  loading?: boolean;
}) {
  const tones = {
    gray:    { text: "text-gray-800",    gradient: "from-gray-500 to-gray-700",       glow: "from-gray-500" },
    violet:  { text: "text-violet-600",  gradient: "from-violet-500 to-violet-600",   glow: "from-violet-500" },
    emerald: { text: "text-emerald-600", gradient: "from-emerald-500 to-emerald-600", glow: "from-emerald-500" },
    blue:    { text: "text-blue-600",    gradient: "from-blue-500 to-blue-600",       glow: "from-blue-500" },
  };
  const t = tones[tone];
  return (
    <div className="relative bg-white rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-4 overflow-hidden transition hover:shadow-md hover:-translate-y-0.5">
      <div className={`absolute top-0 right-0 w-16 h-16 bg-gradient-to-br ${t.glow} to-transparent opacity-[0.06] rounded-full blur-2xl`} />

      <div className="relative flex items-start justify-between gap-2 mb-2">
        <span className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br ${t.gradient} text-white flex items-center justify-center shrink-0 shadow-sm`}>
          {icon}
        </span>
      </div>

      <div className="relative">
        <div className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1 truncate">
          {label}
        </div>
        {loading ? (
          <div className="w-16 h-6 bg-gray-100 rounded-lg animate-pulse" />
        ) : (
          <div className={`${small ? "text-sm sm:text-base" : "text-xl sm:text-2xl lg:text-3xl"} font-black tabular-nums ${t.text} leading-none truncate`}>
            {value}
          </div>
        )}
      </div>
    </div>
  );
}