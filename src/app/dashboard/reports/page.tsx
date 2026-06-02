"use client";

import { useEffect, useState, useMemo } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  PointElement, LineElement, BarElement,
  Filler, Tooltip, Legend,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";

ChartJS.register(
  CategoryScale, LinearScale,
  PointElement, LineElement, BarElement,
  Filler, Tooltip, Legend
);

const fmt  = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");
const fmtK = (n: number) => {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000)     return `Rp ${(n / 1_000_000).toFixed(1)}Jt`;
  if (n >= 1_000)         return `Rp ${(n / 1_000).toFixed(0)}Rb`;
  return `Rp ${n}`;
};

interface Summary {
  totalRevenue:  number;
  totalProfit:   number;
  totalTrx:      number;
  avgDeal:       number;
  profitMargin:  number;
}
interface TrendItem {
  key: string; label: string;
  revenue: number; profit: number; trxCount: number;
}
interface RankItem {
  name: string; revenue: number; profit?: number; count: number;
}

// ── Preset tanggal ────────────────────────────────────────────────────────────
function getPreset(preset: string): { from: string; to: string } {
  const today = new Date();
  const pad   = (n: number) => String(n).padStart(2, "0");
  const fmt   = (d: Date)   => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const todayStr = fmt(today);

  if (preset === "today") {
    return { from: todayStr, to: todayStr };
  }
  if (preset === "yesterday") {
    const y = new Date(today); y.setDate(y.getDate() - 1);
    const ys = fmt(y);
    return { from: ys, to: ys };
  }
  if (preset === "this_week") {
    const mon = new Date(today);
    mon.setDate(today.getDate() - (today.getDay() || 7) + 1);
    return { from: fmt(mon), to: todayStr };
  }
  if (preset === "this_month") {
    return { from: `${today.getFullYear()}-${pad(today.getMonth()+1)}-01`, to: todayStr };
  }
  if (preset === "last_month") {
    const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const last  = new Date(today.getFullYear(), today.getMonth(), 0);
    return { from: fmt(first), to: fmt(last) };
  }
  if (preset === "last_7") {
    const d = new Date(today); d.setDate(d.getDate() - 6);
    return { from: fmt(d), to: todayStr };
  }
  if (preset === "last_30") {
    const d = new Date(today); d.setDate(d.getDate() - 29);
    return { from: fmt(d), to: todayStr };
  }
  if (preset === "this_year") {
    return { from: `${today.getFullYear()}-01-01`, to: todayStr };
  }
  return { from: todayStr, to: todayStr };
}

export default function ReportsPage() {
  const [dateFrom, setDateFrom]   = useState(() => getPreset("this_month").from);
  const [dateTo,   setDateTo]     = useState(() => getPreset("this_month").to);
  const [groupBy,  setGroupBy]    = useState("day");
  const [activePreset, setActivePreset] = useState("this_month");
  const [isLoading, setIsLoading] = useState(false);

  const [summary,   setSummary]   = useState<Summary | null>(null);
  const [trend,     setTrend]     = useState<TrendItem[]>([]);
  const [topSales,  setTopSales]  = useState<RankItem[]>([]);
  const [topLaptop, setTopLaptop] = useState<RankItem[]>([]);
  const [topSource, setTopSource] = useState<RankItem[]>([]);

  const fetchReport = async () => {
    setIsLoading(true);
    try {
      const res    = await fetch(`/api/reports?from=${dateFrom}&to=${dateTo}&group=${groupBy}`);
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
    // Auto group by
    if (["today", "yesterday"].includes(preset)) setGroupBy("day");
    else if (["this_week", "last_7"].includes(preset)) setGroupBy("day");
    else if (["this_month", "last_month", "last_30"].includes(preset)) setGroupBy("day");
    else if (preset === "this_year") setGroupBy("month");
  };

  // Chart data
  const trendLabels  = trend.map(t => t.label);
  const trendRevenue = trend.map(t => t.revenue);
  const trendProfit  = trend.map(t => t.profit);
  const trendTrx     = trend.map(t => t.trxCount);

  const lineData = {
    labels: trendLabels,
    datasets: [
      {
        label: "Omzet",
        data: trendRevenue,
        borderColor: "#1a1a2e",
        backgroundColor: "rgba(26,26,46,0.06)",
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: trendLabels.length > 30 ? 0 : 3,
        pointHoverRadius: 5,
        pointBackgroundColor: "#1a1a2e",
      },
      {
        label: "Profit",
        data: trendProfit,
        borderColor: "#10b981",
        backgroundColor: "rgba(16,185,129,0.06)",
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: trendLabels.length > 30 ? 0 : 3,
        pointHoverRadius: 5,
        pointBackgroundColor: "#10b981",
        borderDash: [4, 3],
      },
    ],
  };

  const barData = {
    labels: trendLabels,
    datasets: [{
      label: "Transaksi",
      data: trendTrx,
      backgroundColor: "rgba(26,26,46,0.2)",
      borderRadius: 4,
      borderSkipped: false as const,
    }],
  };

  const chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 }, color: "#9ca3af", maxRotation: 45 } },
      y: { grid: { color: "rgba(0,0,0,.04)" }, ticks: { font: { size: 10 }, color: "#9ca3af",
           callback: (v: any) => fmtK(v) } },
    },
  } as const;

  const barOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false },
      tooltip: { callbacks: { label: (c: any) => `${c.raw} transaksi` } }
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 }, color: "#9ca3af", maxRotation: 45 } },
      y: { grid: { color: "rgba(0,0,0,.04)" }, ticks: { font: { size: 10 }, color: "#9ca3af", stepSize: 1 } },
    },
  } as const;

  const PRESETS = [
    { id: "today",      label: "Hari ini" },
    { id: "yesterday",  label: "Kemarin" },
    { id: "this_week",  label: "Minggu ini" },
    { id: "this_month", label: "Bulan ini" },
    { id: "last_month", label: "Bulan lalu" },
    { id: "last_30",    label: "30 hari" },
    { id: "this_year",  label: "Tahun ini" },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 bg-[#1a1a2e] rounded-lg flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6"  y1="20" x2="6"  y2="14" />
                  <line x1="2"  y1="20" x2="22" y2="20" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-[#1a1a2e] tracking-tight">Laporan Keuangan</h1>
            </div>
            <p className="text-xs text-gray-400 ml-9">Omzet, profit, dan analisis transaksi</p>
          </div>
          <button
            onClick={fetchReport}
            disabled={isLoading}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-2 rounded-xl transition bg-white"
          >
            <svg className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {isLoading ? "Memuat..." : "Refresh"}
          </button>
        </div>

        {/* Filter Panel */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">

          {/* Preset buttons */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Periode Cepat</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map(p => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                    activePreset === p.id
                      ? "bg-[#1a1a2e] text-white border-[#1a1a2e]"
                      : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date range + group by + apply */}
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Dari Tanggal</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setActivePreset(""); }}
                className="h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Sampai Tanggal</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => { setDateTo(e.target.value); setActivePreset(""); }}
                className="h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Kelompokkan Per</label>
              <select
                value={groupBy}
                onChange={e => setGroupBy(e.target.value)}
                className="h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] transition"
              >
                <option value="day">Hari</option>
                <option value="week">Minggu</option>
                <option value="month">Bulan</option>
              </select>
            </div>
            <button
              onClick={fetchReport}
              disabled={isLoading}
              className="h-10 px-5 bg-[#1a1a2e] text-white rounded-xl text-sm font-medium hover:bg-[#16213e] transition disabled:opacity-50"
            >
              Tampilkan
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {Array(5).fill(0).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse">
                <div className="h-3 bg-gray-100 rounded w-20 mb-2" />
                <div className="h-6 bg-gray-100 rounded w-28" />
              </div>
            ))}
          </div>
        ) : summary ? (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { label: "Total Omzet",    value: fmtK(summary.totalRevenue),  color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-100", bar: "bg-emerald-500" },
              { label: "Total Profit",   value: fmtK(summary.totalProfit),   color: "text-blue-600",    bg: "bg-blue-50",    border: "border-blue-100",    bar: "bg-blue-500" },
              { label: "Total Transaksi",value: summary.totalTrx + " trx",   color: "text-violet-600",  bg: "bg-violet-50",  border: "border-violet-100",  bar: "bg-violet-500" },
              { label: "Rata-rata Deal", value: fmtK(summary.avgDeal),       color: "text-amber-600",   bg: "bg-amber-50",   border: "border-amber-100",   bar: "bg-amber-500" },
              { label: "Margin Profit",  value: summary.profitMargin + "%",  color: "text-rose-600",    bg: "bg-rose-50",    border: "border-rose-100",    bar: "bg-rose-500" },
            ].map(s => (
              <div key={s.label} className={`bg-white rounded-2xl border ${s.border} shadow-sm p-4 relative overflow-hidden`}>
                <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${s.bar} opacity-60`} />
                <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">{s.label}</p>
                <p className={`text-lg font-extrabold mt-1 tracking-tight ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        ) : null}

        {/* Charts */}
        {trend.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Trend Omzet & Profit */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-gray-800 text-sm">Tren Omzet & Profit</h2>
                <div className="flex gap-3">
                  <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
                    <span className="w-5 h-0.5 bg-[#1a1a2e] inline-block rounded" /> Omzet
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
                    <span className="w-5 h-0.5 bg-emerald-500 inline-block rounded" /> Profit
                  </span>
                </div>
              </div>
              <div style={{ height: 200 }}>
                <Line data={lineData} options={chartOpts} />
              </div>
            </div>

            {/* Bar Transaksi */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-gray-800 text-sm">Jumlah Transaksi</h2>
              </div>
              <div style={{ height: 200 }}>
                <Bar data={barData} options={barOpts} />
              </div>
            </div>
          </div>
        )}

        {/* Top Lists */}
        {(topSales.length > 0 || topLaptop.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Top Sales */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="font-bold text-gray-800 text-sm mb-4">🏆 Top Sales</h2>
              <div className="space-y-2">
                {topSales.slice(0, 8).map((s, i) => (
                  <div key={s.name}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm w-5 text-center flex-shrink-0">
                        {["🥇","🥈","🥉"][i] ?? <span className="text-xs text-gray-400">{i+1}</span>}
                      </span>
                      <p className="text-xs text-gray-700 truncate flex-1 font-medium">{s.name}</p>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-bold text-gray-800">{fmtK(s.revenue)}</p>
                        <p className="text-[10px] text-emerald-600">{s.count}x</p>
                      </div>
                    </div>
                    <div className="ml-7 mt-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#1a1a2e]/50 rounded-full"
                        style={{ width: `${Math.round((s.revenue / topSales[0].revenue) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Laptop */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="font-bold text-gray-800 text-sm mb-4">💻 Laptop Terlaris</h2>
              <div className="space-y-2">
                {topLaptop.slice(0, 8).map((l, i) => (
                  <div key={l.name}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm w-5 text-center flex-shrink-0">
                        {["🥇","🥈","🥉"][i] ?? <span className="text-xs text-gray-400">{i+1}</span>}
                      </span>
                      <p className="text-xs text-gray-700 truncate flex-1 font-medium">{l.name}</p>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-bold text-gray-800">{fmtK(l.revenue)}</p>
                        <p className="text-[10px] text-gray-400">{l.count}x terjual</p>
                      </div>
                    </div>
                    <div className="ml-7 mt-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-400/60 rounded-full"
                        style={{ width: `${Math.round((l.revenue / topLaptop[0].revenue) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Source */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="font-bold text-gray-800 text-sm mb-4">📱 Sumber Penjualan</h2>
              <div className="space-y-2">
                {topSource.slice(0, 8).map((s, i) => (
                  <div key={s.name}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-5 text-center flex-shrink-0">{i+1}</span>
                      <p className="text-xs text-gray-700 truncate flex-1 font-medium">{s.name}</p>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-bold text-gray-800">{fmtK(s.revenue)}</p>
                        <p className="text-[10px] text-gray-400">{s.count}x</p>
                      </div>
                    </div>
                    <div className="ml-7 mt-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-violet-400/60 rounded-full"
                        style={{ width: `${Math.round((s.revenue / topSource[0].revenue) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !summary && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center">
            <div className="text-4xl mb-3">📊</div>
            <p className="text-gray-500 font-medium">Belum ada data</p>
            <p className="text-gray-400 text-sm mt-1">Pilih periode dan klik Tampilkan</p>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}