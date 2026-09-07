"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Medal, Banknote, TrendingUp, ShoppingCart, Calculator, Percent, Award, Laptop, Smartphone } from "lucide-react";

const chartLoading = () => <div className="w-full h-full animate-pulse bg-gray-100 rounded-xl" />;
const LineChart = dynamic(() => import("./ReportsCharts").then(m => m.LineChart), { ssr: false, loading: chartLoading });
const BarChart = dynamic(() => import("./ReportsCharts").then(m => m.BarChart), { ssr: false, loading: chartLoading });

const fmtRupiah = (n: number): string =>
  "Rp " + (n || 0).toLocaleString("id-ID");

const fmtShort = (n: number): string => {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${sign}Rp ${(abs / 1_000_000_000).toFixed(1)}M`;
  if (abs >= 1_000_000) return `${sign}Rp ${(abs / 1_000_000).toFixed(1)}Jt`;
  if (abs >= 1_000) return `${sign}Rp ${(abs / 1_000).toFixed(0)}Rb`;
  return `${sign}Rp ${abs}`;
};

interface Summary {
  totalRevenue: number;
  totalProfit: number;
  totalTrx: number;
  avgDeal: number;
  profitMargin: number;
}
interface TrendItem {
  key: string; label: string;
  revenue: number; profit: number; trxCount: number;
}
interface RankItem {
  name: string; revenue: number; profit?: number; count: number;
}


function getPreset(preset: string): { from: string; to: string } {
  const WIB = 7 * 60 * 60 * 1000;
  const nowWIB = new Date(Date.now() + WIB);
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const todayStr = fmt(nowWIB);

  if (preset === "today") return { from: todayStr, to: todayStr };
  if (preset === "yesterday") {
    const y = new Date(nowWIB); y.setUTCDate(y.getUTCDate() - 1);
    const ys = fmt(y);
    return { from: ys, to: ys };
  }
  if (preset === "this_week") {
    const mon = new Date(nowWIB);
    const day = mon.getUTCDay() || 7;
    mon.setUTCDate(mon.getUTCDate() - day + 1);
    return { from: fmt(mon), to: todayStr };
  }
  if (preset === "this_month") {
    return { from: `${nowWIB.getUTCFullYear()}-${pad(nowWIB.getUTCMonth() + 1)}-01`, to: todayStr };
  }
  if (preset === "last_month") {
    const first = new Date(Date.UTC(nowWIB.getUTCFullYear(), nowWIB.getUTCMonth() - 1, 1));
    const last = new Date(Date.UTC(nowWIB.getUTCFullYear(), nowWIB.getUTCMonth(), 0));
    return { from: fmt(first), to: fmt(last) };
  }
  if (preset === "last_7") {
    const d = new Date(nowWIB); d.setUTCDate(d.getUTCDate() - 6);
    return { from: fmt(d), to: todayStr };
  }
  if (preset === "last_30") {
    const d = new Date(nowWIB); d.setUTCDate(d.getUTCDate() - 29);
    return { from: fmt(d), to: todayStr };
  }
  if (preset === "this_year") {
    return { from: `${nowWIB.getUTCFullYear()}-01-01`, to: todayStr };
  }
  return { from: todayStr, to: todayStr };
}

// RESPONSIVE FIX: grid 2 kolom di HP kecil, 3 di tablet, 5 di desktop; padding & ukuran skeleton di-scale
function SummarySkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
      {Array(5).fill(0).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-gray-100 p-3 sm:p-5 animate-pulse">
          <div className="flex items-center gap-2 mb-2 sm:mb-3">
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gray-100 rounded-xl" />
            <div className="h-3 bg-gray-100 rounded w-16" />
          </div>
          <div className="h-6 sm:h-7 bg-gray-100 rounded w-20 sm:w-24 mb-1" />
          <div className="h-2 bg-gray-50 rounded w-12" />
        </div>
      ))}
    </div>
  );
}

// RESPONSIVE FIX: padding & font StatCard di-scale untuk layar kecil
function StatCard({
  label, value, sub, icon, rank,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  rank?: number;
}) {
  return (
    <div className="report-stat-card bg-white rounded-2xl border border-gray-100 p-3 sm:p-5 relative overflow-hidden group hover:border-violet-200 transition-all duration-200">
      {/* Subtle corner accent */}
      <div className="absolute top-0 right-0 w-12 h-12 sm:w-16 sm:h-16 rounded-bl-[40px] bg-violet-50/70 group-hover:bg-violet-100/70 transition-colors duration-200" />

      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-2.5 sm:mb-4">
          <div className="w-7 h-7 sm:w-8 sm:h-8 bg-violet-50 rounded-xl flex items-center justify-center text-base group-hover:bg-violet-100 transition-colors duration-200 border border-violet-100/60 flex-shrink-0">
            {icon}
          </div>
          <span className="text-[10px] sm:text-[11px] font-semibold text-gray-500 uppercase tracking-wider sm:tracking-widest truncate">{label}</span>
        </div>
        <p className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight leading-none">{value}</p>
        {sub && <p className="text-[10px] sm:text-[11px] text-gray-500 mt-1.5 truncate">{sub}</p>}
      </div>

      {rank !== undefined && (
        <div className="absolute bottom-2 right-2 sm:bottom-4 sm:right-4 text-[9px] sm:text-[10px] font-bold text-gray-300">
          #{rank}
        </div>
      )}
    </div>
  );
}

// RESPONSIVE FIX: padding card & header di-scale untuk HP
function RankList({ title, icon, items, color, revenueKey = "revenue" }: {
  title: string;
  icon: React.ReactNode;
  items: RankItem[];
  color: string;
  revenueKey?: string;
}) {
  if (!items || items.length === 0) return null;

  const medals = [
    <Medal key="gold" className="w-5 h-5 text-yellow-500 drop-shadow-sm" />,
    <Medal key="silver" className="w-5 h-5 text-gray-400 drop-shadow-sm" />,
    <Medal key="bronze" className="w-5 h-5 text-amber-600 drop-shadow-sm" />
  ];
  const maxVal = items[0]?.[revenueKey as keyof RankItem] as number ?? 1;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 hover:border-violet-200 transition-all duration-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 sm:mb-5 gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-8 h-8 rounded-xl ${color} flex items-center justify-center text-sm border border-gray-100 flex-shrink-0`}>
            {icon}
          </div>
          <span className="font-bold text-gray-800 text-sm truncate">{title}</span>
        </div>
        <span className="text-[10px] text-gray-500 font-medium bg-gray-50 px-2 py-1 rounded-lg border border-gray-100 flex-shrink-0">
          Top {Math.min(items.length, 8)}
        </span>
      </div>

      {/* Items */}
      <div className="space-y-2.5">
        {items.slice(0, 8).map((item: any, i: number) => {
          const pct = Math.round((item[revenueKey] / maxVal) * 100);
          return (
            <div key={item.name} className="group/item">
              <div className="flex items-center gap-2 sm:gap-3 mb-1.5">
                {/* Rank badge */}
                <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center">
                  {i < 3 ? (
                    <span className="text-base leading-none">{medals[i]}</span>
                  ) : (
                    <span className="text-[10px] font-bold text-gray-400 w-5 h-5 rounded-full bg-gray-50 flex items-center justify-center border border-gray-100">
                      {i + 1}
                    </span>
                  )}
                </div>

                {/* Name */}
                <p className="text-xs text-gray-700 truncate flex-1 font-medium min-w-0">
                  {item.name}
                </p>

                {/* Stats */}
                <div className="text-right flex-shrink-0 flex items-center gap-1.5 sm:gap-2">
                  <span className="text-[10px] text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded-md border border-gray-100">
                    {item.count}x
                  </span>
                  <span className="text-xs font-bold text-gray-900">{fmtShort(item[revenueKey])}</span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="ml-8 sm:ml-9 h-1 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${pct}%`,
                    background: i === 0 ? "#7c3aed" : i === 1 ? "#a78bfa" : "#ddd6fe",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// RESPONSIVE FIX: padding vertikal dikurangi di HP
function EmptyState() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 py-16 sm:py-24 text-center">
      <div className="w-16 h-16 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-violet-100/60">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.5">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
          <line x1="2" y1="20" x2="22" y2="20" />
        </svg>
      </div>
      <p className="text-gray-700 font-semibold text-sm">Belum ada data</p>
      <p className="text-gray-400 text-xs mt-1">Pilih periode dan klik tombol Tampilkan</p>
    </div>
  );
}

const PRESETS = [
  { id: "today", label: "Hari ini" },
  { id: "yesterday", label: "Kemarin" },
  { id: "this_week", label: "Minggu ini" },
  { id: "this_month", label: "Bulan ini" },
  { id: "last_month", label: "Bulan lalu" },
  { id: "last_30", label: "30 hari" },
  { id: "this_year", label: "Tahun ini" },
];

export default function ReportsPage() {
  const [dateFrom, setDateFrom] = useState(() => getPreset("this_month").from);
  const [dateTo, setDateTo] = useState(() => getPreset("this_month").to);
  const [groupBy, setGroupBy] = useState("day");
  const [activePreset, setActivePreset] = useState("this_month");
  const [isLoading, setIsLoading] = useState(false);
  const [filterError, setFilterError] = useState("");

  const [summary, setSummary] = useState<Summary | null>(null);
  const [trend, setTrend] = useState<TrendItem[]>([]);
  const [topSales, setTopSales] = useState<RankItem[]>([]);
  const [topLaptop, setTopLaptop] = useState<RankItem[]>([]);
  const [topSource, setTopSource] = useState<RankItem[]>([]);


  const fetchReport = async (from?: string, to?: string, group?: string) => {
    const f = from ?? dateFrom;
    const t = to ?? dateTo;
    const g = group ?? groupBy;

    setIsLoading(true);
    try {
      const res = await fetch(`/api/reports?from=${f}&to=${t}&group=${g}`);
      const result = await res.json();
      if (result.success) {
        setSummary(result.data.summary);
        setTrend(result.data.trend);
        setTopSales(result.data.topSales);
        setTopLaptop(result.data.topLaptop);
        setTopSource(result.data.topSource);

      }
    } catch {
      /* ignore */
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchReport(); }, []);

  const applyPreset = (preset: string) => {
    const { from, to } = getPreset(preset);
    setDateFrom(from);
    setDateTo(to);
    setActivePreset(preset);

    let group = "day";
    if (preset === "this_year") group = "month";
    setGroupBy(group);

    fetchReport(from, to, group);
    setFilterError("");
  };

  // Dipakai tombol "Tampilkan" pada panel filter manual (Dari / Sampai / Kelompok)
  const applyManualFilter = () => {
    if (!dateFrom || !dateTo) {
      setFilterError("Tanggal 'Dari' dan 'Sampai' wajib diisi.");
      return;
    }
    if (dateFrom > dateTo) {
      setFilterError("Tanggal 'Dari' tidak boleh lebih besar dari 'Sampai'.");
      return;
    }
    setFilterError("");
    fetchReport(dateFrom, dateTo, groupBy);
  };

  const trendLabels = trend.map(t => t.label);
  const trendRevenue = trend.map(t => t.revenue);
  const trendProfit = trend.map(t => t.profit);
  const trendTrx = trend.map(t => t.trxCount);

  const lineData = {
    labels: trendLabels,
    datasets: [
      {
        label: "Omzet",
        data: trendRevenue,
        borderColor: "#7c3aed",
        backgroundColor: "rgba(124,58,237,0.08)",
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: trendLabels.length > 30 ? 0 : 4,
        pointHoverRadius: 6,
        pointBackgroundColor: "#7c3aed",
        pointBorderColor: "#fff",
        pointBorderWidth: 2,
      },
      {
        label: "Profit",
        data: trendProfit,
        borderColor: "#10b981",
        backgroundColor: "rgba(16,185,129,0.06)",
        borderWidth: 1.5,
        fill: true,
        tension: 0.4,
        pointRadius: trendLabels.length > 30 ? 0 : 3,
        pointHoverRadius: 5,
        pointBackgroundColor: "#10b981",
        pointBorderColor: "#fff",
        pointBorderWidth: 1.5,
        borderDash: [5, 4],
      },
    ],
  };

  const barData = {
    labels: trendLabels,
    datasets: [{
      label: "Transaksi",
      data: trendTrx,
      backgroundColor: "rgba(124,58,237,0.8)",
      borderRadius: 6,
      borderSkipped: false as const,
      hoverBackgroundColor: "#5b21b6",
      barPercentage: 0.5,
      categoryPercentage: 0.7,
    }],
  };

  const chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#2e1065",
        titleColor: "#F5F3FF",
        bodyColor: "#DDD6FE",
        padding: 10,
        cornerRadius: 10,
        callbacks: {
          label: (context: any) => `${context.dataset.label}: ${fmtShort(context.raw)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { font: { size: 10 }, color: "#9ca3af", maxRotation: 45 },
      },
      y: {
        grid: { color: "rgba(0,0,0,.04)" },
        border: { display: false },
        ticks: { font: { size: 10 }, color: "#9ca3af", callback: (v: any) => fmtShort(v) },
      },
    },
  } as const;

  const barOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#2e1065",
        titleColor: "#F5F3FF",
        bodyColor: "#DDD6FE",
        cornerRadius: 10,
        padding: 10,
        callbacks: {
          label: (c: any) => `${c.raw} transaksi`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { font: { size: 10 }, color: "#9CA3AF", maxRotation: 0 },
      },
      y: {
        grid: { color: "rgba(156,163,175,0.15)" },
        border: { display: false },
        ticks: { font: { size: 10 }, color: "#9CA3AF", stepSize: 1 },
        beginAtZero: true,
      },
    },
  } as const;

  const activePresetLabel = PRESETS.find(p => p.id === activePreset)?.label;
  const periodDisplay = activePresetLabel ? activePresetLabel : `${dateFrom} – ${dateTo}`;

  return (
    <DashboardLayout>
      {/* RESPONSIVE FIX: padding & spacing container di-scale untuk HP */}
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-3 sm:space-y-4">

        {/* ── PAGE HEADER ──
         * RESPONSIVE FIX: stack vertikal di HP (flex-col), tombol Refresh full-width di HP
         */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-violet-600 rounded-xl flex items-center justify-center shadow-sm shadow-violet-200 flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                  <line x1="2" y1="20" x2="22" y2="20" />
                </svg>
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-bold text-gray-900 leading-none">Laporan Keuangan</h1>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{periodDisplay}</p>
              </div>
            </div>
          </div>

          <button
            onClick={() => fetchReport()}
            disabled={isLoading}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-full border border-gray-200 text-xs font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-50 hover:border-gray-300 transition-all bg-white w-full sm:w-auto"
          >
            <svg
              className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {isLoading ? "Memuat..." : "Refresh"}
          </button>
        </div>

        {/* ── FILTER PANEL ── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          {/* Preset chips */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {PRESETS.map(p => (
              <button
                key={p.id}
                onClick={() => applyPreset(p.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                  activePreset === p.id
                    ? "bg-violet-600 text-white shadow-sm shadow-violet-200"
                    : "bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700 border border-gray-100"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Date range row — RESPONSIVE FIX: stack vertikal (full width) di HP, sejajar di ≥ sm */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-2 pt-3 border-t border-gray-100">
            <div className="flex flex-col gap-1 w-full sm:w-auto">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Dari</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setActivePreset(""); setFilterError(""); }}
                onKeyDown={e => { if (e.key === "Enter") applyManualFilter(); }}
                className="h-9 border border-gray-200 rounded-xl px-3 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-100 focus:border-violet-300 focus:bg-white transition-all w-full sm:w-auto"
              />
            </div>
            <div className="flex flex-col gap-1 w-full sm:w-auto">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Sampai</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => { setDateTo(e.target.value); setActivePreset(""); setFilterError(""); }}
                onKeyDown={e => { if (e.key === "Enter") applyManualFilter(); }}
                className="h-9 border border-gray-200 rounded-xl px-3 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-100 focus:border-violet-300 focus:bg-white transition-all w-full sm:w-auto"
              />
            </div>
            <div className="flex flex-col gap-1 w-full sm:w-auto">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Kelompok</label>
              <select
                value={groupBy}
                onChange={e => { setGroupBy(e.target.value); setFilterError(""); }}
                className="h-9 border border-gray-200 rounded-xl px-3 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-100 focus:border-violet-300 focus:bg-white transition-all cursor-pointer w-full sm:w-auto"
              >
                <option value="day">Per Hari</option>
                <option value="week">Per Minggu</option>
                <option value="month">Per Bulan</option>
              </select>
            </div>

            {/* Tombol apply filter manual — full width di HP */}
            <button
              onClick={applyManualFilter}
              disabled={isLoading}
              className="h-9 px-5 rounded-xl bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all w-full sm:w-auto"
            >
              {isLoading ? "Memuat..." : "Tampilkan"}
            </button>
          </div>

          {filterError && (
            <p className="text-[11px] text-red-500 font-medium mt-2">{filterError}</p>
          )}
        </div>

        {/* ── SUMMARY PANEL — panel gradasi + kartu statistik mengambang, senada dengan panel "Distribusi Penjualan" di Dashboard ── */}
        {(isLoading || summary) && (
          <div className="relative overflow-hidden rounded-3xl bg-white border border-gray-100 shadow-sm p-4 sm:p-6">
            <div className="pointer-events-none absolute -right-14 -top-20 h-64 w-64 rounded-full bg-violet-300/50 blur-2xl" />
            <div className="pointer-events-none absolute right-24 -bottom-14 h-48 w-48 rounded-full bg-blue-300/40 blur-2xl" />

            <div className="relative mb-4 sm:mb-5">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900">Ringkasan {periodDisplay}</h2>
              <p className="text-gray-500 text-xs mt-0.5">Statistik omzet, profit, dan transaksi pada periode ini</p>
            </div>

            <div className="relative">
              {isLoading ? (
                <SummarySkeleton />
              ) : summary ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
                  <StatCard
                    label="Total Omzet"
                    value={fmtRupiah(summary.totalRevenue)}
                    sub="Berdasarkan Akutansi"
                    icon={<Banknote className="w-5 h-5 text-violet-600" />}
                    rank={1}
                  />
                  <StatCard
                    label="Total Profit"
                    value={fmtRupiah(summary.totalProfit)}
                    sub={`Margin ${summary.profitMargin}% · Akutansi`}
                    icon={<TrendingUp className="w-5 h-5 text-violet-600" />}
                  />
                  <StatCard
                    label="Transaksi"
                    value={`${summary.totalTrx} trx`}
                    sub="Total deal"
                    icon={<ShoppingCart className="w-5 h-5 text-violet-600" />}
                  />
                  <StatCard
                    label="Rata-rata Deal"
                    value={fmtRupiah(summary.avgDeal)}
                    sub="Per transaksi"
                    icon={<Calculator className="w-5 h-5 text-violet-600" />}
                  />
                  <StatCard
                    label="Margin Profit"
                    value={`${summary.profitMargin}%`}
                    sub="Profit / omzet"
                    icon={<Percent className="w-5 h-5 text-violet-600" />}
                  />
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* ── CHARTS — RESPONSIVE FIX: padding & tinggi chart di-scale, header boleh wrap ── */}
        {trend.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
            {/* Line chart */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4 sm:mb-5">
                <div>
                  <h2 className="font-bold text-gray-800 text-sm">Tren Omzet & Profit</h2>
                  <p className="text-[11px] text-gray-500 mt-0.5">{periodDisplay}</p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-0.5 bg-violet-600 inline-block rounded-full" />
                    <span className="text-[10px] text-gray-500 font-medium">Omzet</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-[1px] inline-block rounded-full" style={{ borderTop: "1.5px dashed #10b981", background: "none", display: "inline-block" }} />
                    <span className="text-[10px] text-gray-500 font-medium">Profit</span>
                  </div>
                </div>
              </div>
              <div className="h-[200px] sm:h-[260px]">
                <LineChart data={lineData} options={chartOpts} />
              </div>
            </div>

            {/* Bar chart */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4 sm:mb-5">
                <div>
                  <h2 className="font-bold text-gray-800 text-sm">Jumlah Transaksi</h2>
                  <p className="text-[11px] text-gray-500 mt-0.5">Per periode</p>
                </div>
                <span className="text-[10px] font-bold text-violet-600 bg-violet-50 border border-violet-100 px-2.5 py-1 rounded-lg">
                  {trend.reduce((sum, t) => sum + t.trxCount, 0)} total
                </span>
              </div>
              <div className="h-[200px] sm:h-[260px]">
                <BarChart data={barData} options={barOpts} />
              </div>
            </div>
          </div>
        )}

        {/* ── RANKING LISTS — RESPONSIVE FIX: 1 kolom di HP, 2 di tablet, 3 di desktop ── */}
        {(topSales.length > 0 || topLaptop.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            <RankList title="Top Sales" icon={<Award className="w-5 h-5 text-violet-600" />} items={topSales} color="bg-violet-50" revenueKey="revenue" />
            <RankList title="Laptop Terlaris" icon={<Laptop className="w-5 h-5 text-blue-600" />} items={topLaptop} color="bg-blue-50" revenueKey="revenue" />
            <RankList title="Sumber Penjualan" icon={<Smartphone className="w-5 h-5 text-amber-600" />} items={topSource} color="bg-amber-50" revenueKey="revenue" />
          </div>
        )}

        {/* ── EMPTY STATE ── */}
        {!isLoading && !summary && <EmptyState />}

      </div>

      <style jsx>{`
        .report-stat-card {
          transition: box-shadow 0.15s ease, border-color 0.15s ease;
        }
        .report-stat-card:hover {
          box-shadow: 0 4px 16px rgba(124,58,237,0.08);
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin { animation: spin 0.7s linear infinite; }
      `}</style>
    </DashboardLayout>
  );
}