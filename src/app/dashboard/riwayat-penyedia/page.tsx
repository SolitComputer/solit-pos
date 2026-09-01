"use client";

import { useEffect, useState, useCallback, useMemo, type ReactNode } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Trophy, Medal, Award, Clock, X, Inbox, BarChart3, TrendingUp, Search, RefreshCw } from "lucide-react";
import { BarRankingChart } from "@/components/ui/BarRankingChart";
import { LineTrendChart } from "@/components/ui/LineTrendChart";

interface ProviderJob {
  id: string;
  order_number: string;
  customer_name: string;
  received_at: string | null;
  done_at: string;
  duration_hours: number | null;
}

interface ProviderPerformance {
  id: string;
  name: string;
  role: string;
  total_pekerjaan: number;
  jam_terbang: number;
  rata_rata: number | null;
  jobs: ProviderJob[];
}

type PresetKey = "today" | "7d" | "month" | "3m" | "1y" | "all" | "custom";

const pad2 = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const localMidnightISO = (s: string) => new Date(`${s}T00:00:00`).toISOString();
const nextDayISO = (s: string) => {
  const d = new Date(`${s}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
};
const fmtRangeDate = (s: string) =>
  new Date(`${s}T00:00:00`).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtHours = (h: number | null) => {
  if (h == null) return "—";
  if (h < 1) return `${Math.round(h * 60)} mnt`;
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  return mins > 0 ? `${whole}j ${mins}m` : `${whole} jam`;
};

// helper baru: bucket tanggal berbasis WIB (server/DB umumnya simpan UTC)
const wibDay = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10);
const fmtShortDate = (s: string) =>
  new Date(`${s}T00:00:00`).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });

// Card styling aligned with Dashboard layout
const CARD_STYLE = "bg-white rounded-3xl p-5 sm:p-6 border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_10px_30px_-6px_rgba(99,102,241,0.12)] transition-all duration-300";

// Shimmer Loader
const Shimmer = ({ className = "", style = {} }: { className?: string; style?: React.CSSProperties }) => (
  <span className={`block rounded-xl animate-shimmer bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100 bg-[length:200%_100%] ${className}`} style={style} />
);

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today", label: "Hari Ini" },
  { key: "7d", label: "7 Hari" },
  { key: "month", label: "Bulan Ini" },
  { key: "3m", label: "3 Bulan" },
  { key: "1y", label: "1 Tahun" },
  { key: "all", label: "Semua Waktu" },
];

const medal = (i: number): ReactNode =>
  i === 0 ? (
    <Medal className="w-4 h-4 text-amber-500 drop-shadow-sm inline-block" />
  ) : i === 1 ? (
    <Medal className="w-4 h-4 text-slate-400 drop-shadow-sm inline-block" />
  ) : i === 2 ? (
    <Medal className="w-4 h-4 text-amber-700 drop-shadow-sm inline-block" />
  ) : (
    <span className="text-[10px] text-slate-400 font-semibold w-5 h-5 rounded-full bg-slate-100 inline-flex items-center justify-center">
      {i + 1}
    </span>
  );

function ProviderJobsModal({ provider, onClose }: { provider: ProviderPerformance; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn" onClick={onClose}>
      <div className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[85dvh] overflow-hidden animate-scaleIn" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-5 py-4 flex-shrink-0 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-extrabold text-white text-sm truncate">{provider.name}</p>
            <p className="text-xs text-indigo-200 mt-1 font-medium">
              {provider.total_pekerjaan} pekerjaan · {fmtHours(provider.jam_terbang)} jam terbang · rata-rata{" "}
              {fmtHours(provider.rata_rata)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-2">
          {provider.jobs.length === 0 ? (
            <div className="py-10 text-center">
              <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-2">
                <Inbox className="w-6 h-6" />
              </div>
              <p className="text-sm text-slate-400 font-medium">Belum ada pekerjaan pada periode ini</p>
            </div>
          ) : (
            provider.jobs.map((j) => (
              <div key={j.id} className="border border-slate-100 rounded-2xl px-4 py-3 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-slate-700">{j.order_number}</span>
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                    {fmtHours(j.duration_hours)}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 truncate font-medium">{j.customer_name}</p>
                <p className="text-[10px] text-slate-400 mt-1.5">
                  {j.received_at ? fmtDateTime(j.received_at) : "—"} → {fmtDateTime(j.done_at)}
                </p>
              </div>
            ))
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full h-11 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl text-sm font-bold transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RiwayatPenyediaPage() {
  const [providers, setProviders] = useState<ProviderPerformance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ProviderPerformance | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const now0 = new Date();
  const [fromDate, setFromDate] = useState(() => ymd(new Date(now0.getFullYear(), now0.getMonth(), 1)));
  const [toDate, setToDate] = useState(() => ymd(now0));
  const [allTime, setAllTime] = useState(false);
  const [activePreset, setActivePreset] = useState<PresetKey>("month");

  const nowStr = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const applyPreset = (key: PresetKey) => {
    const now = new Date();
    if (key === "today") {
      const t = ymd(now);
      setFromDate(t);
      setToDate(t);
      setAllTime(false);
    } else if (key === "7d") {
      setFromDate(ymd(new Date(Date.now() - 6 * 86400000)));
      setToDate(ymd(now));
      setAllTime(false);
    } else if (key === "month") {
      setFromDate(ymd(new Date(now.getFullYear(), now.getMonth(), 1)));
      setToDate(ymd(now));
      setAllTime(false);
    } else if (key === "3m") {
      setFromDate(ymd(new Date(now.getFullYear(), now.getMonth() - 2, 1)));
      setToDate(ymd(now));
      setAllTime(false);
    } else if (key === "1y") {
      setFromDate(ymd(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())));
      setToDate(ymd(now));
      setAllTime(false);
    } else if (key === "all") {
      setAllTime(true);
    }
    setActivePreset(key);
  };

  const fetchData = useCallback(async (showRefreshAnimation = false) => {
    if (showRefreshAnimation) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    try {
      const qs = new URLSearchParams();
      if (!allTime) {
        qs.set("from", localMidnightISO(fromDate));
        qs.set("to", nextDayISO(toDate));
      }
      const res = await fetch(`/api/preparation/provider-performance?${qs.toString()}`);
      const result = await res.json();
      setProviders(result.success ? result.providers ?? [] : []);
      setLastUpdated(new Date());
    } catch {
      setProviders([]);
    } finally {
      if (showRefreshAnimation) {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
      }
    }
  }, [allTime, fromDate, toDate]);

  useEffect(() => {
    fetchData(false);
  }, [fetchData]);

  const filtered = useMemo(() => {
    if (!search.trim()) return providers;
    const t = search.toLowerCase();
    return providers.filter((p) => p.name.toLowerCase().includes(t));
  }, [providers, search]);

  // ✅ FIX: ranking asli harus dihitung dari `providers` (list lengkap yang
  // sudah terurut), bukan dari index di `filtered` — kalau lagi search,
  // `filtered` cuma berisi sebagian baris jadi index-nya bukan peringkat
  // sebenarnya (mis. hasil search cuma nampilin peringkat #5 & #8, tapi
  // ditampilkan sebagai medali emas & perak).
  const rankById = useMemo(() => {
    const map = new Map<string, number>();
    providers.forEach((p, i) => map.set(p.id, i));
    return map;
  }, [providers]);

  const totals = useMemo(() => {
    const totalPekerjaan = providers.reduce((s, p) => s + p.total_pekerjaan, 0);
    const totalJamTerbang = providers.reduce((s, p) => s + p.jam_terbang, 0);
    const rataGlobal = totalPekerjaan > 0 ? totalJamTerbang / totalPekerjaan : null;
    return { totalProviders: providers.length, totalPekerjaan, rataGlobal };
  }, [providers]);

  // === data untuk Bar Ranking Chart (Top 10 · Total Pekerjaan vs Jam Terbang) ===
  const rankingLabels = useMemo(() => filtered.slice(0, 10).map((p) => p.name), [filtered]);

  const rankingSeries = useMemo(
    () => [
      {
        key: "pekerjaan",
        label: "Total Pekerjaan",
        color: "#6366f1",
        data: filtered.slice(0, 10).map((p) => p.total_pekerjaan),
        formatValue: (v: number) => String(v),
      },
      {
        key: "jam",
        label: "Jam Terbang",
        color: "#06b6d4",
        data: filtered.slice(0, 10).map((p) => Number(p.jam_terbang.toFixed(1))),
        formatValue: (v: number) => fmtHours(v),
      },
    ],
    [filtered]
  );

  // === data untuk Line Trend Chart (pekerjaan selesai per hari, WIB) ===
  const trendLabelsRaw = useMemo(() => {
    const days = new Set<string>();
    filtered.forEach((p) => p.jobs.forEach((j) => days.add(wibDay(j.done_at))));
    return [...days].sort();
  }, [filtered]);

  const trendData = useMemo(() => {
    const counts = new Map<string, number>();
    filtered.forEach((p) =>
      p.jobs.forEach((j) => {
        const day = wibDay(j.done_at);
        counts.set(day, (counts.get(day) ?? 0) + 1);
      })
    );
    return trendLabelsRaw.map((d) => counts.get(d) ?? 0);
  }, [filtered, trendLabelsRaw]);

  const trendLabels = useMemo(() => trendLabelsRaw.map(fmtShortDate), [trendLabelsRaw]);

  const rangeLabel = allTime ? "Semua Waktu" : `${fmtRangeDate(fromDate)} — ${fmtRangeDate(toDate)}`;

  const inputCls =
    "h-9 border border-slate-200/50 rounded-full px-3.5 text-sm bg-slate-100/80 hover:bg-slate-100 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 font-medium";

  return (
    <DashboardLayout>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        .animate-fadeIn { animation: fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1); }
        .animate-scaleIn { animation: scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1); }
        .animate-shimmer { animation: shimmer 1.5s ease-in-out infinite; background-size: 200% 100%; }
      `}</style>

      <div className="space-y-6 max-w-[1400px] mx-auto px-2 sm:px-4 py-2">

        {/* ── TOP HEADER BAR (Matching Dashboard Header) ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
          {/* Left Title */}
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Riwayat Penyedia</h1>
            <p className="text-xs text-slate-400 font-medium mt-1 flex items-center gap-2">
              <span>{nowStr}</span>
              {lastUpdated && (
                <>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1.5 text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Terakhir diperbarui {lastUpdated.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </>
              )}
            </p>
          </div>

          {/* Right Header Controls: Search + Refresh */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Search Input Bar */}
            <div className="relative flex-1 sm:flex-initial min-w-[200px] sm:min-w-[260px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari nama penyedia..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-100/80 hover:bg-slate-100 focus:bg-white text-slate-700 placeholder-slate-400 text-xs font-medium rounded-full pl-9 pr-4 py-2.5 transition-all outline-none ring-2 ring-transparent focus:ring-indigo-400 border border-slate-200/50"
              />
            </div>

            {/* Refresh Button */}
            <button
              onClick={() => fetchData(true)}
              disabled={isRefreshing}
              className="p-2.5 sm:px-4 sm:py-2.5 bg-white hover:bg-slate-50 text-slate-700 rounded-full border border-slate-200 text-xs font-bold flex items-center gap-2 transition-all shadow-sm active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-indigo-600" : ""}`} />
              <span className="hidden sm:inline">{isRefreshing ? "Memuat..." : "Refresh"}</span>
            </button>
          </div>
        </div>

        {/* ── HERO BANNER (Matching Dashboard Wave Banner) ── */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-100/90 via-indigo-100/80 to-purple-100/90 p-5 sm:p-7 border border-indigo-100/60 shadow-sm">
          {/* Decorative Wave Graphics */}
          <div className="absolute inset-0 pointer-events-none opacity-40 overflow-hidden">
            <svg className="absolute -right-10 -bottom-10 w-[500px] h-[300px]" viewBox="0 0 500 300" fill="none">
              <circle cx="350" cy="200" r="180" fill="url(#waveGrad1)" opacity="0.5" />
              <circle cx="200" cy="150" r="120" fill="url(#waveGrad2)" opacity="0.4" />
              <defs>
                <linearGradient id="waveGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#818cf8" />
                  <stop offset="100%" stopColor="#c084fc" />
                </linearGradient>
                <linearGradient id="waveGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#818cf8" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          <div className="relative z-10 space-y-5">
            {/* Banner Header */}
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">Performa Penyedia Barang</h2>
              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
                Peringkat performa penyedia barang berdasarkan total pekerjaan &amp; jam terbang
              </p>
            </div>

            {/* Floating Stat Cards Grid inside Hero Banner */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
              {/* Stat 1: Total Penyedia */}
              <div className="bg-white/90 hover:bg-white backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-sm border border-white/70 transition-all hover:-translate-y-1 hover:shadow-md group">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Total Penyedia</span>
                <p className="text-xl sm:text-2xl font-extrabold text-slate-900 tabular-nums group-hover:text-indigo-600 transition-colors">
                  {isLoading ? <Shimmer className="w-16 h-7" /> : totals.totalProviders}
                </p>
                <div className="mt-3">
                  <span className="text-[10px] text-slate-400 font-medium">Penyedia aktif</span>
                </div>
              </div>

              {/* Stat 2: Total Pekerjaan */}
              <div className="bg-white/90 hover:bg-white backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-sm border border-white/70 transition-all hover:-translate-y-1 hover:shadow-md group">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Total Pekerjaan</span>
                <p className="text-xl sm:text-2xl font-extrabold text-slate-900 tabular-nums group-hover:text-indigo-600 transition-colors">
                  {isLoading ? <Shimmer className="w-20 h-7" /> : `${totals.totalPekerjaan} Job`}
                </p>
                <div className="mt-3">
                  <span className="text-[10px] text-slate-400 font-medium">{rangeLabel}</span>
                </div>
              </div>

              {/* Stat 3: Rata-rata Global */}
              <div className="col-span-2 md:col-span-1 bg-white/90 hover:bg-white backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-sm border border-white/70 transition-all hover:-translate-y-1 hover:shadow-md group">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Rata-rata Global</span>
                <p className="text-xl sm:text-2xl font-extrabold text-slate-900 tabular-nums group-hover:text-emerald-600 transition-colors">
                  {isLoading ? <Shimmer className="w-20 h-7" /> : fmtHours(totals.rataGlobal)}
                </p>
                <div className="mt-3">
                  <span className="text-[10px] text-slate-400 font-medium">Waktu rata-rata per pekerjaan</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── PERIOD FILTER CARD ── */}
        <div className={CARD_STYLE}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-900 text-sm">Filter Periode</h3>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
              {rangeLabel}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => applyPreset(p.key)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
                  activePreset === p.key
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 tracking-wider">Dari</label>
              <input
                type="date"
                value={fromDate}
                max={toDate}
                disabled={allTime}
                onChange={(e) => {
                  setAllTime(false);
                  setActivePreset("custom");
                  setFromDate(e.target.value);
                }}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 tracking-wider">Sampai</label>
              <input
                type="date"
                value={toDate}
                min={fromDate}
                max={ymd(new Date())}
                disabled={allTime}
                onChange={(e) => {
                  setAllTime(false);
                  setActivePreset("custom");
                  setToDate(e.target.value);
                }}
                className={inputCls}
              />
            </div>
          </div>
        </div>

        {/* ── CHARTS GRID ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Ranking Bar Chart — 7 cols */}
          <div className="lg:col-span-7">
            <div className={`${CARD_STYLE} h-full flex flex-col justify-between`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-indigo-600" />
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Ranking Penyedia</h3>
                    <p className="text-[11px] text-slate-400 font-medium">Top 10 · Total Pekerjaan vs Jam Terbang</p>
                  </div>
                </div>
                <span className="text-slate-400 text-xs font-bold hover:text-slate-600 cursor-pointer">•••</span>
              </div>
              {isLoading ? (
                <Shimmer className="w-full h-[280px]" />
              ) : rankingLabels.length === 0 ? (
                <div className="h-[280px] flex flex-col items-center justify-center text-center">
                  <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-2">
                    <BarChart3 className="w-6 h-6" />
                  </div>
                  <p className="text-slate-600 font-bold text-xs">Belum ada data</p>
                </div>
              ) : (
                <BarRankingChart labels={rankingLabels} series={rankingSeries} height={280} />
              )}
            </div>
          </div>

          {/* Trend Line Chart — 5 cols */}
          <div className="lg:col-span-5">
            <div className={`${CARD_STYLE} h-full flex flex-col justify-between`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Tren Pekerjaan Selesai</h3>
                    <p className="text-[11px] text-slate-400 font-medium">Per hari · {rangeLabel}</p>
                  </div>
                </div>
                <span className="text-slate-400 text-xs font-bold hover:text-slate-600 cursor-pointer">•••</span>
              </div>
              {isLoading ? (
                <Shimmer className="w-full h-[280px]" />
              ) : trendData.length === 0 ? (
                <div className="h-[280px] flex flex-col items-center justify-center text-center">
                  <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-2">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                  <p className="text-slate-600 font-bold text-xs">Belum ada data pada periode ini</p>
                </div>
              ) : (
                <LineTrendChart
                  labels={trendLabels}
                  data={trendData}
                  color="#059669"
                  height={280}
                  formatValue={(v) => `${v} pekerjaan`}
                />
              )}
            </div>
          </div>
        </div>

        {/* ── LEADERBOARD TABLE ── */}
        <div className={CARD_STYLE}>
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-indigo-600" />
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Peringkat Penyedia Barang</h3>
                <p className="text-[11px] text-slate-400 font-medium">Klik nama untuk lihat rincian pekerjaan · {rangeLabel}</p>
              </div>
            </div>
            <span className="text-slate-400 text-xs font-bold hover:text-slate-600 cursor-pointer">•••</span>
          </div>

          {isLoading ? (
            <div className="space-y-2 mt-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3 py-3">
                  <Shimmer className="w-8 h-8 rounded-full" />
                  <div className="flex-1 space-y-1">
                    <Shimmer className="w-32 h-3.5" />
                    <Shimmer className="w-48 h-2.5" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-2">
                <Inbox className="w-6 h-6" />
              </div>
              <p className="text-slate-600 font-bold text-xs">Belum ada data penyedia barang</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-1 mt-2">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="text-left px-3 py-2.5 w-12">#</th>
                    <th className="text-left px-3 py-2.5">Nama</th>
                    <th className="text-center px-3 py-2.5">Total Pekerjaan</th>
                    <th className="text-center px-3 py-2.5">Jam Terbang</th>
                    <th className="text-center px-3 py-2.5">Rata-rata</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const rank = rankById.get(p.id) ?? 0;
                    return (
                    <tr
                      key={p.id}
                      onClick={() => setSelected(p)}
                      className={`cursor-pointer border-t border-slate-100/80 hover:bg-slate-50/80 transition-all group ${
                        rank === 0 ? "bg-indigo-50/40" : ""
                      }`}
                    >
                      <td className="px-3 py-3.5 text-center font-black text-sm">{medal(rank)}</td>
                      <td className="px-3 py-3.5">
                        <span className="font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">{p.name}</span>
                      </td>
                      <td className="px-3 py-3.5 text-center">
                        <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-full text-xs tabular-nums">
                          {p.total_pekerjaan}x
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-center">
                        <span className="font-bold text-indigo-600 text-xs tabular-nums">
                          {fmtHours(p.jam_terbang)}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-center">
                        <span className="font-bold text-emerald-600 text-xs tabular-nums">
                          {fmtHours(p.rata_rata)}
                        </span>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {selected && <ProviderJobsModal provider={selected} onClose={() => setSelected(null)} />}
    </DashboardLayout>
  );
}