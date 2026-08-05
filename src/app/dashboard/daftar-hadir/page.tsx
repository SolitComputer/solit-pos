"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { humanizeRoleKey } from "@/lib/permissions";
import {
  Sun,
  Cloud,
  Moon,
  RefreshCw,
  Users,
  Search,
  UserX,
  ChevronDown,
  ChevronUp,
  X,
  Copy,
  Check,
  ArrowUpDown,
  CalendarDays,
  Clock,
  Percent,
  Pencil,
} from "lucide-react";

type AttendanceEntry = {
  user_id: string;
  name: string;
  role: string;
  check_in_time: string;
  method: "FACE" | "MANUAL";
};

type ManualRecord = {
  id: string;
  user_id: string;
  attendance_date: string;
  check_in_time: string;
  status: "PRESENT" | "LATE" | "SICK" | "PERMIT" | "ABSENT" | "LEAVE";
  users?: { id: string; name: string; role: string };
};

type GroupedAttendance = {
  pagi: AttendanceEntry[];
  siang: AttendanceEntry[];
  sore: AttendanceEntry[];
};

type UserInfo = {
  id: string;
  name: string;
  role: string;
  shift?: string | null;
  created_at?: string | null;
};

const EMPTY: GroupedAttendance = { pagi: [], siang: [], sore: [] };

function initials(name: string): string {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function toWIBTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

function nowWIBTime(): string {
  return new Date().toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

function todayLabel(): string {
  return new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

function toWIBDateKey(iso: string): string {
  return new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function getWIBToday(): string {
  return toWIBDateKey(new Date().toISOString());
}

// Disamakan persis dengan bucketFromHour() di api/attendance/today/route.ts
function classifyDaySection(iso: string): keyof GroupedAttendance {
  const wib = new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000);
  const hour = wib.getUTCHours();
  if (hour < 11) return "pagi";
  if (hour < 15) return "siang";
  return "sore";
}

const SECTIONS: {
  key: keyof GroupedAttendance;
  label: string;
  shortLabel: string;
  icon: ReactNode;
  gradient: string;
  iconBg: string;
  barColor: string;
  emptyText: string;
  borderAccent: string;
}[] = [
  {
    key: "pagi",
    label: "Masuk Pagi",
    shortLabel: "Pagi",
    icon: <Sun className="w-5 h-5 text-amber-500" />,
    gradient: "from-amber-50 via-orange-50/60 to-yellow-50",
    iconBg: "bg-gradient-to-br from-amber-100 to-orange-100",
    barColor: "bg-gradient-to-r from-amber-400 to-orange-400",
    emptyText: "Belum ada data kehadiran pagi ini.",
    borderAccent: "border-l-[3px] border-l-amber-300",
  },
  {
    key: "siang",
    label: "Masuk Siang",
    shortLabel: "Siang",
    icon: <Cloud className="w-5 h-5 text-sky-500" />,
    gradient: "from-sky-50 via-blue-50/60 to-cyan-50",
    iconBg: "bg-gradient-to-br from-sky-100 to-blue-100",
    barColor: "bg-gradient-to-r from-sky-400 to-blue-400",
    emptyText: "Belum ada data kehadiran siang ini.",
    borderAccent: "border-l-[3px] border-l-sky-300",
  },
  {
    key: "sore",
    label: "Masuk Sore",
    shortLabel: "Sore",
    icon: <Moon className="w-5 h-5 text-indigo-500" />,
    gradient: "from-indigo-50 via-violet-50/60 to-purple-50",
    iconBg: "bg-gradient-to-br from-indigo-100 to-violet-100",
    barColor: "bg-gradient-to-r from-indigo-400 to-violet-400",
    emptyText: "Belum ada data kehadiran sore ini.",
    borderAccent: "border-l-[3px] border-l-indigo-300",
  },
];

export default function DaftarHadirPage() {
  const [data, setData] = useState<GroupedAttendance>(EMPTY);
  const [allUsers, setAllUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("—");
  const [search, setSearch] = useState("");
  const [showBelum, setShowBelum] = useState(false);

  // ── State tambahan (murni untuk tampilan/fitur, tidak menyentuh fetch logic) ──
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [scrolled, setScrolled] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const fetchData = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const now = new Date();
      const todayKey = getWIBToday();

      const [attRes, usersRes, manualRes] = await Promise.all([
        fetch("/api/attendance/today", { cache: "no-store" }),
        fetch("/api/attendance/users", { cache: "no-store" }),
        fetch(`/api/attendance/manual?year=${now.getFullYear()}&month=${now.getMonth() + 1}`, { cache: "no-store" }),
      ]);

      const attJson = await attRes.json();
      const baseData: GroupedAttendance = attJson.success ? attJson.data : EMPTY;

      const usersJson = await usersRes.json();
      if (usersJson.success) setAllUsers(usersJson.data || []);

      const manualJson = await manualRes.json();
      if (manualJson.success) {
        // user yang sudah punya absen otomatis (wajah) hari ini — jangan dobel sama manual
        const autoIds = new Set(
          [...baseData.pagi, ...baseData.siang, ...baseData.sore].map((e) => e.user_id)
        );

        const merged: GroupedAttendance = {
          pagi: [...baseData.pagi],
          siang: [...baseData.siang],
          sore: [...baseData.sore],
        };

        (manualJson.data || []).forEach((m: ManualRecord) => {
          if (m.attendance_date !== todayKey) return;
          if (m.status !== "PRESENT" && m.status !== "LATE") return; // SICK/IZIN/CUTI/dll bukan "hadir"
          if (autoIds.has(m.user_id)) return;

          const entry: AttendanceEntry = {
            user_id: m.user_id,
            name: m.users?.name || "Unknown",
            role: m.users?.role || "",
            check_in_time: m.check_in_time,
            method: "MANUAL",
          };
          merged[classifyDaySection(m.check_in_time)].push(entry);
        });

        setData(merged);
      } else {
        setData(baseData);
      }

      setLastUpdated(nowWIBTime());
    } catch (err) {
      console.error("[daftar-hadir] fetch error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(true), 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Countdown auto-refresh — reset tiap kali lastUpdated berubah (habis fetch)
  useEffect(() => {
    setCountdown(60);
    const tick = setInterval(() => {
      setCountdown((c) => (c <= 1 ? 60 : c - 1));
    }, 1000);
    return () => clearInterval(tick);
  }, [lastUpdated]);

  // Deteksi scroll — buat sticky header shadow + tombol kembali ke atas (mobile)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ── Union semua id yang sudah tercatat hari ini (lintas 3 kotak) ─────────
  const presentIds = useMemo(() => {
    const ids = new Set<string>();
    [...data.pagi, ...data.siang, ...data.sore].forEach((e) => ids.add(e.user_id));
    return ids;
  }, [data]);

  const belumTercatat = useMemo(
    () => allUsers.filter((u) => !presentIds.has(u.id)),
    [allUsers, presentIds]
  );

  const totalHadir = data.pagi.length + data.siang.length + data.sore.length;
  const totalTerdaftar = allUsers.length;
  const pctHadir = totalTerdaftar > 0 ? Math.round((totalHadir / totalTerdaftar) * 100) : null;

  const filterMatch = useCallback(
    (name: string, role: string) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return name.toLowerCase().includes(q) || humanizeRoleKey(role).toLowerCase().includes(q);
    },
    [search]
  );

  const scrollToSection = (key: string) => {
    sectionRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  const copyBelumTercatat = useCallback(async () => {
    const names = belumTercatat
      .filter((u) => filterMatch(u.name, u.role))
      .map((u) => u.name)
      .join("\n");
    if (!names) return;
    try {
      await navigator.clipboard.writeText(names);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("[daftar-hadir] copy error:", err);
    }
  }, [belumTercatat, filterMatch]);

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5 sm:space-y-6">
        {/* Header — sticky di mobile biar tetap keliatan pas scroll list panjang */}
        <div
          className={`sticky top-0 z-20 -mx-4 px-4 sm:mx-0 sm:px-0 pt-1 pb-3 sm:pt-0 sm:pb-0 transition-shadow duration-300 ${
            scrolled ? "bg-white/90 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.05)] sm:bg-transparent sm:backdrop-blur-0 sm:shadow-none" : ""
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex w-11 h-11 rounded-2xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] items-center justify-center shadow-lg shadow-[#1a1a2e]/20 flex-shrink-0">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight bg-gradient-to-r from-[#1a1a2e] to-[#16213e] bg-clip-text text-transparent">
                  Daftar Hadir
                </h1>
                <p className="flex items-center gap-1.5 text-xs text-gray-400 mt-1">
                  <CalendarDays className="w-3.5 h-3.5 text-gray-300" />
                  {todayLabel()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-gray-500 bg-white border border-gray-100 rounded-full px-3 py-1.5 shadow-sm">
                <span className={`w-1.5 h-1.5 rounded-full bg-emerald-400 ${refreshing ? "animate-pulse" : ""}`} />
                <Clock className="w-3 h-3 text-gray-300" />
                {lastUpdated} WIB
                <span className="text-gray-300">· {countdown}s</span>
              </span>
              <button
                onClick={() => fetchData(true)}
                disabled={refreshing}
                className="flex items-center gap-1.5 text-xs font-bold text-white px-4 py-2.5 sm:py-2 rounded-xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] hover:shadow-lg hover:shadow-[#1a1a2e]/25 transition-all active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          </div>

          {/* Quick-jump khusus mobile — biar gak perlu scroll manual antar section */}
          <div className="flex md:hidden gap-2 overflow-x-auto pb-1 mt-3 -mx-1 px-1">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                onClick={() => scrollToSection(s.key)}
                className="flex-shrink-0 flex items-center gap-1.5 text-xs font-bold text-gray-600 bg-white border border-gray-200 rounded-full px-3 py-2 shadow-sm hover:shadow-md hover:border-gray-300 active:scale-95 transition-all"
              >
                {s.icon}
                {s.shortLabel}
                <span className="text-gray-400 font-medium">({data[s.key].length})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Stat overview — angka besar per waktu masuk + total */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          {SECTIONS.map((s) => (
            <div
              key={s.key}
              className={`relative overflow-hidden bg-gradient-to-br ${s.gradient} rounded-2xl border border-gray-100 shadow-sm p-3.5 sm:p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-md`}
            >
              <div className={`absolute top-0 left-0 right-0 h-1 ${s.barColor}`} />
              <div className="flex items-center justify-between mb-2">
                <span className={`w-9 h-9 rounded-xl ${s.iconBg} flex items-center justify-center shadow-sm`}>
                  {s.icon}
                </span>
              </div>
              <p className="text-xl sm:text-2xl font-black text-gray-800 tabular-nums">
                {loading ? <span className="inline-block w-8 h-6 bg-white/60 rounded animate-pulse" /> : data[s.key].length}
              </p>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mt-0.5">{s.shortLabel}</p>
            </div>
          ))}
          <div className="relative overflow-hidden bg-gradient-to-br from-emerald-50 via-teal-50/60 to-green-50 rounded-2xl border border-gray-100 shadow-sm p-3.5 sm:p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-400" />
            <div className="flex items-center justify-between mb-2">
              <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center shadow-sm">
                <Users className="w-4 h-4 text-emerald-600" />
              </span>
              {!loading && pctHadir !== null && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded-full">
                  <Percent className="w-2.5 h-2.5" />
                  {pctHadir}
                </span>
              )}
            </div>
            <p className="text-xl sm:text-2xl font-black text-gray-800 tabular-nums">
              {loading ? <span className="inline-block w-8 h-6 bg-white/60 rounded animate-pulse" /> : totalHadir}
            </p>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mt-0.5">Total Hadir</p>
          </div>
        </div>

        {/* Distribusi Pagi/Siang/Sore dalam satu bar */}
        {!loading && totalHadir > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Distribusi Kehadiran</p>
              <p className="text-[10px] text-gray-400 font-semibold">{totalHadir} orang</p>
            </div>
            <div className="w-full h-2.5 rounded-full overflow-hidden bg-gray-100 flex gap-px">
              {SECTIONS.map((s) => {
                const count = data[s.key].length;
                const pct = (count / totalHadir) * 100;
                if (pct === 0) return null;
                return (
                  <div
                    key={s.key}
                    className={`${s.barColor} transition-all duration-500`}
                    style={{ width: `${pct}%` }}
                    title={`${s.shortLabel}: ${count}`}
                  />
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 flex-wrap">
              {SECTIONS.map((s) => (
                <span key={s.key} className="inline-flex items-center gap-1.5 text-[10px] sm:text-xs text-gray-500 font-medium">
                  <span className={`w-2 h-2 rounded-full ${s.barColor}`} />
                  {s.shortLabel} ({data[s.key].length})
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Search + Sort — filter & urutkan cepat lintas 3 kotak */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-2.5 sm:p-3 flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-300 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama atau role..."
              className="w-full h-11 border border-gray-200 rounded-xl pl-10 pr-10 text-sm bg-gray-50/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/10 focus:border-gray-300 transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors"
                aria-label="Bersihkan pencarian"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            className="flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 border border-gray-200 px-4 h-11 rounded-xl bg-gray-50/60 hover:bg-white hover:shadow-sm transition-all active:scale-95 whitespace-nowrap"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            {sortDir === "asc" ? "Terlama → Terbaru" : "Terbaru → Terlama"}
          </button>
        </div>

        {/* 3 kotak: Pagi / Siang / Sore */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {SECTIONS.map((section) => {
            const entries = data[section.key]
              .filter((e) => filterMatch(e.name, e.role))
              .sort((a, b) => {
                const ta = new Date(a.check_in_time).getTime();
                const tb = new Date(b.check_in_time).getTime();
                return sortDir === "asc" ? ta - tb : tb - ta;
              });
            return (
              <div
                key={section.key}
                ref={(el) => {
                  sectionRefs.current[section.key] = el;
                }}
                className={`relative bg-gradient-to-br ${section.gradient} rounded-2xl border border-gray-100 shadow-sm overflow-hidden scroll-mt-24 transition-shadow duration-300 hover:shadow-md`}
              >
                <div className={`h-1 w-full ${section.barColor}`} />
                <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100/70">
                  <div className={`w-10 h-10 rounded-xl ${section.iconBg} flex items-center justify-center shadow-sm flex-shrink-0`}>
                    {section.icon}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-800">{section.label}</p>
                    <p className="text-[10px] text-gray-400">
                      {entries.length} orang{search.trim() ? ` (dari ${data[section.key].length})` : ""}
                    </p>
                  </div>
                </div>

                <div className="p-3 space-y-2 min-h-[140px] max-h-[420px] overflow-y-auto">
                  {loading ? (
                    Array(3).fill(0).map((_, i) => (
                      <div key={i} className="h-12 bg-white/60 rounded-xl animate-pulse" />
                    ))
                  ) : entries.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
                      <span className="w-10 h-10 rounded-full bg-white/70 flex items-center justify-center opacity-50">{section.icon}</span>
                      <p className="text-xs text-gray-400 font-medium">
                        {search.trim() ? "Tidak ada yang cocok." : section.emptyText}
                      </p>
                    </div>
                  ) : (
                    entries.map((e) => (
                      <div
                        key={e.user_id}
                        className={`flex items-center gap-3 bg-white rounded-xl px-3 py-2.5 shadow-sm border ${
                          e.method === "MANUAL" ? "border-blue-100 bg-blue-50/30" : "border-gray-50"
                        } ${section.borderAccent} hover:shadow-md hover:-translate-y-0.5 transition-all duration-200`}
                      >
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex items-center justify-center text-white text-[10px] font-black flex-shrink-0">
                          {initials(e.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-gray-800 truncate flex items-center gap-1">
                            {e.name}
                            {e.method === "MANUAL" && (
                              <Pencil className="w-2.5 h-2.5 text-blue-500 flex-shrink-0" aria-label="Absen manual" />
                            )}
                          </p>
                          <p className="text-[10px] text-gray-400">{humanizeRoleKey(e.role)}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs font-mono font-bold text-gray-700 bg-gray-50 px-2 py-1 rounded-lg">{toWIBTime(e.check_in_time)}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Belum Tercatat — fitur tambahan, collapsible + salin nama */}
        {!loading && allUsers.length > 1 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div
              role="button"
              tabIndex={0}
              onClick={() => setShowBelum((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setShowBelum((v) => !v);
              }}
              className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-50 to-orange-50 flex items-center justify-center flex-shrink-0">
                  <UserX className="w-4 h-4 text-rose-400" />
                </div>
                <div className="text-left min-w-0">
                  <p className="text-sm font-bold text-gray-700">Belum Tercatat Hari Ini</p>
                  <p className="text-[10px] text-gray-400">
                    {belumTercatat.length} orang belum ada catatan kehadiran
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {belumTercatat.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copyBelumTercatat();
                    }}
                    className="hidden sm:flex items-center gap-1.5 text-[10px] font-bold text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg bg-white hover:shadow-sm transition-all active:scale-95"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    {copied ? "Tersalin" : "Salin nama"}
                  </button>
                )}
                {showBelum ? (
                  <ChevronUp className="w-4 h-4 text-gray-400 transition-transform" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-400 transition-transform" />
                )}
              </div>
            </div>
            {showBelum && (
              <div className="px-5 pb-5 pt-1">
                {belumTercatat.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">Semua sudah tercatat hari ini 🎉</p>
                ) : (
                  <>
                    <button
                      onClick={copyBelumTercatat}
                      className="sm:hidden mb-3 w-full flex items-center justify-center gap-1.5 text-xs font-bold text-gray-600 border border-gray-200 py-2.5 rounded-xl bg-gray-50 active:scale-95 transition-transform"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? "Tersalin" : "Salin nama"}
                    </button>
                    <div className="flex flex-wrap gap-2">
                      {belumTercatat.filter((u) => filterMatch(u.name, u.role)).map((u) => (
                        <span
                          key={u.id}
                          className="inline-flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl pl-1.5 pr-3 py-1.5 hover:bg-gray-100 transition-colors"
                        >
                          <span className="w-6 h-6 rounded-lg bg-gray-300 flex items-center justify-center text-white text-[9px] font-black">
                            {initials(u.name)}
                          </span>
                          <span className="text-[11px] font-semibold text-gray-600">{u.name}</span>
                          <span className="text-[9px] text-gray-400">{humanizeRoleKey(u.role)}</span>
                        </span>
                      ))}
                    </div>
                  </>
                )}
                <p className="text-[10px] text-gray-300 mt-3">
                  Catatan: daftar ini murni berdasarkan data absensi hari ini — belum memperhitungkan jadwal libur, cuti, atau shift masing-masing karyawan.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tombol kembali ke atas — khusus mobile, muncul setelah scroll */}
      {scrolled && (
        <button
          onClick={scrollToTop}
          aria-label="Kembali ke atas"
          className="md:hidden fixed bottom-5 right-5 z-30 w-12 h-12 rounded-full bg-gradient-to-br from-[#1a1a2e] to-[#16213e] text-white shadow-lg shadow-[#1a1a2e]/30 flex items-center justify-center active:scale-90 hover:shadow-xl transition-all"
        >
          <ChevronUp className="w-5 h-5" />
        </button>
      )}
    </DashboardLayout>
  );
}