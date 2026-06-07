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

function getPreset(preset: string): { from: string; to: string } {
  const WIB = 7 * 60 * 60 * 1000;
  const nowWIB = new Date(Date.now() + WIB);
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const todayStr = fmt(nowWIB);

  if (preset === "today") {
    return { from: todayStr, to: todayStr };
  }
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
    const last  = new Date(Date.UTC(nowWIB.getUTCFullYear(), nowWIB.getUTCMonth(), 0));
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

function SummarySkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {Array(5).fill(0).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse">
          <div className="h-3 bg-gray-200 rounded w-20 mb-2" />
          <div className="h-6 bg-gray-200 rounded w-28" />
        </div>
      ))}
    </div>
  );
}

// Chart Skeleton
function ChartSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-32 mb-4" />
      <div className="h-[200px] bg-gray-100 rounded-xl" />
    </div>
  );
}

// Enhanced Stat Card Component
function StatCard({ label, value, color, bg, border, bar, icon }: any) {
  return (
    <div className={`bg-white rounded-2xl border ${border} shadow-sm hover:shadow-md transition-all duration-300 p-4 relative overflow-hidden group`}>
      <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${bar} opacity-60 group-hover:opacity-100 transition-opacity`} />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">{label}</p>
          <p className={`text-xl font-extrabold mt-1 tracking-tight ${color} group-hover:scale-105 transition-transform origin-left`}>
            {value}
          </p>
        </div>
        <div className={`p-2 rounded-xl ${bg} opacity-60 group-hover:opacity-100 transition-opacity`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

// Rank List Component
function RankList({ title, icon, items, color, revenueKey = "revenue" }: any) {
  if (items.length === 0) return null;
  
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className={`w-6 h-6 rounded-lg ${color} flex items-center justify-center`}>
          <span className="text-sm">{icon}</span>
        </div>
        <h2 className="font-bold text-gray-800 text-sm">{title}</h2>
      </div>
      <div className="space-y-3">
        {items.slice(0, 8).map((item: any, i: number) => (
          <div key={item.name} className="group">
            <div className="flex items-center gap-2">
              <div className="w-6 text-center flex-shrink-0">
                {i === 0 && <span className="text-lg">🥇</span>}
                {i === 1 && <span className="text-lg">🥈</span>}
                {i === 2 && <span className="text-lg">🥉</span>}
                {i > 2 && <span className="text-xs font-semibold text-gray-400 bg-gray-100 w-5 h-5 rounded-full flex items-center justify-center">{i+1}</span>}
              </div>
              <p className="text-xs text-gray-700 truncate flex-1 font-medium group-hover:text-gray-900 transition">
                {item.name}
              </p>
              <div className="text-right flex-shrink-0">
                <p className="text-xs font-bold text-gray-800">{fmtK(item[revenueKey])}</p>
                <p className="text-[10px] text-gray-400">{item.count}x</p>
              </div>
            </div>
            <div className="ml-7 mt-1.5 h-1 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 group-hover:opacity-80 ${
                  color === "bg-gray-100" ? "bg-gray-600" : 
                  color === "bg-gray-100" ? "bg-gray-600" : "bg-gray-600"
                }`}
                style={{ width: `${Math.round((item[revenueKey] / items[0][revenueKey]) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Empty State Component
function EmptyState() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-20 text-center animate-fadeIn">
      <div className="text-7xl mb-4 animate-bounce">📊</div>
      <p className="text-gray-500 font-semibold text-base">Belum ada data</p>
      <p className="text-gray-400 text-sm mt-2">Pilih periode dan klik tombol Tampilkan</p>
      <div className="mt-4 flex justify-center">
        <div className="w-16 h-1 bg-gray-300 rounded-full" />
      </div>
    </div>
  );
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
    if (["today", "yesterday"].includes(preset)) setGroupBy("day");
    else if (["this_week", "last_7"].includes(preset)) setGroupBy("day");
    else if (["this_month", "last_month", "last_30"].includes(preset)) setGroupBy("day");
    else if (preset === "this_year") setGroupBy("month");
  };

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
        borderColor: "#4B5563",
        backgroundColor: "rgba(75,85,99,0.06)",
        borderWidth: 2.5,
        fill: true,
        tension: 0.4,
        pointRadius: trendLabels.length > 30 ? 0 : 4,
        pointHoverRadius: 6,
        pointBackgroundColor: "#4B5563",
        pointBorderColor: "#fff",
        pointBorderWidth: 2,
      },
      {
        label: "Profit",
        data: trendProfit,
        borderColor: "#9CA3AF",
        backgroundColor: "rgba(156,163,175,0.06)",
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: trendLabels.length > 30 ? 0 : 3,
        pointHoverRadius: 5,
        pointBackgroundColor: "#9CA3AF",
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
      backgroundColor: "rgba(75,85,99,0.15)",
      borderRadius: 6,
      borderSkipped: false as const,
      hoverBackgroundColor: "rgba(75,85,99,0.3)",
    }],
  };

  const chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { 
      legend: { display: false },
      tooltip: {
        backgroundColor: "rgba(0,0,0,0.8)",
        titleColor: "#fff",
        bodyColor: "#e5e7eb",
        padding: 8,
        cornerRadius: 8,
        callbacks: {
          label: (context: any) => {
            let label = context.dataset.label || '';
            let value = context.raw;
            return `${label}: ${fmtK(value)}`;
          }
        }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 }, color: "#9ca3af", maxRotation: 45 } },
      y: { grid: { color: "rgba(0,0,0,.04)" }, ticks: { font: { size: 10 }, color: "#9ca3af",
            callback: (v: any) => fmtK(v) } },
    },
  } as const;

  const barOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { 
      legend: { display: false },
      tooltip: { 
        backgroundColor: "rgba(0,0,0,0.8)",
        cornerRadius: 8,
        callbacks: { label: (c: any) => `${c.raw} transaksi` } 
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 }, color: "#9ca3af", maxRotation: 45 } },
      y: { grid: { color: "rgba(0,0,0,.04)" }, ticks: { font: { size: 10 }, color: "#9ca3af", stepSize: 1 } },
    },
  } as const;

  const PRESETS = [
    { id: "today",      label: "Hari ini", icon: "📅" },
    { id: "yesterday",  label: "Kemarin", icon: "📆" },
    { id: "this_week",  label: "Minggu ini", icon: "📊" },
    { id: "this_month", label: "Bulan ini", icon: "📈" },
    { id: "last_month", label: "Bulan lalu", icon: "📉" },
    { id: "last_30",    label: "30 hari", icon: "🗓️" },
    { id: "this_year",  label: "Tahun ini", icon: "🎯" },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

        {/* Header dengan animasi */}
        <div className="animate-fadeIn">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-1 h-7 bg-gradient-to-b from-gray-600 to-gray-800 rounded-full" />
                <div className="w-7 h-7 bg-gradient-to-br from-gray-600 to-gray-800 rounded-lg flex items-center justify-center shadow-md">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6"  y1="20" x2="6"  y2="14" />
                    <line x1="2"  y1="20" x2="22" y2="20" />
                  </svg>
                </div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-900 bg-clip-text text-transparent">
                  Laporan Keuangan
                </h1>
              </div>
              <p className="text-sm text-gray-500 ml-10">
                Omzet, profit, dan analisis transaksi
              </p>
            </div>
            <button
              onClick={fetchReport}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 bg-white shadow-sm group"
            >
              <svg className={`w-4 h-4 transition-transform group-hover:rotate-180 ${isLoading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {isLoading ? "Memuat..." : "Refresh"}
            </button>
          </div>
        </div>

        {/* Filter Panel yang ditingkatkan */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden">
          <div className="p-5 space-y-4">
            {/* Preset buttons */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span>⚡</span> Periode Cepat
              </p>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => applyPreset(p.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 flex items-center gap-1.5 ${
                      activePreset === p.id
                        ? "bg-gray-700 text-white shadow-md transform scale-105"
                        : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 hover:border-gray-300"
                    }`}
                  >
                    <span>{p.icon}</span>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Date range + group by + apply */}
            <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-gray-100">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-1">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  Dari Tanggal
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => { setDateFrom(e.target.value); setActivePreset(""); }}
                  className="h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all duration-200"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-1">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  Sampai Tanggal
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => { setDateTo(e.target.value); setActivePreset(""); }}
                  className="h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all duration-200"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-1">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4v16h16" />
                    <polyline points="20 10 12 18 8 14" />
                  </svg>
                  Kelompokkan Per
                </label>
                <select
                  value={groupBy}
                  onChange={e => setGroupBy(e.target.value)}
                  className="h-10 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all duration-200 cursor-pointer"
                >
                  <option value="day">📅 Hari</option>
                  <option value="week">📆 Minggu</option>
                  <option value="month">🗓️ Bulan</option>
                </select>
              </div>
              <button
                onClick={fetchReport}
                disabled={isLoading}
                className="h-10 px-6 bg-gray-700 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-all duration-200 disabled:opacity-50 shadow-md hover:shadow-lg transform hover:scale-105"
              >
                Tampilkan
              </button>
            </div>
          </div>
        </div>

        {/* Summary Cards - Enhanced */}
        {isLoading ? (
          <SummarySkeleton />
        ) : summary ? (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <StatCard 
              label="Total Omzet" 
              value={fmtK(summary.totalRevenue)} 
              color="text-gray-700" 
              bg="bg-gray-50" 
              border="border-gray-100" 
              bar="bg-gray-600"
              icon={<span className="text-lg">💰</span>}
            />
            <StatCard 
              label="Total Profit" 
              value={fmtK(summary.totalProfit)} 
              color="text-gray-700" 
              bg="bg-gray-50" 
              border="border-gray-100" 
              bar="bg-gray-600"
              icon={<span className="text-lg">📈</span>}
            />
            <StatCard 
              label="Total Transaksi" 
              value={summary.totalTrx + " trx"} 
              color="text-gray-700" 
              bg="bg-gray-50" 
              border="border-gray-100" 
              bar="bg-gray-600"
              icon={<span className="text-lg">🛒</span>}
            />
            <StatCard 
              label="Rata-rata Deal" 
              value={fmtK(summary.avgDeal)} 
              color="text-gray-700" 
              bg="bg-gray-50" 
              border="border-gray-100" 
              bar="bg-gray-600"
              icon={<span className="text-lg">💵</span>}
            />
            <StatCard 
              label="Margin Profit" 
              value={summary.profitMargin + "%"} 
              color="text-gray-700" 
              bg="bg-gray-50" 
              border="border-gray-100" 
              bar="bg-gray-600"
              icon={<span className="text-lg">📊</span>}
            />
          </div>
        ) : null}

        {/* Charts Section */}
        {trend.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Trend Omzet & Profit */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 p-5 lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                  <span className="w-1 h-4 bg-gray-600 rounded-full" />
                  Tren Omzet & Profit
                </h2>
                <div className="flex gap-3">
                  <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
                    <span className="w-5 h-0.5 bg-gray-600 inline-block rounded-full" /> Omzet
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
                    <span className="w-5 h-0.5 bg-gray-400 inline-block rounded-full" /> Profit
                  </span>
                </div>
              </div>
              <div style={{ height: 250 }}>
                <Line data={lineData} options={chartOpts} />
              </div>
            </div>

            {/* Bar Transaksi */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                  <span className="w-1 h-4 bg-gray-600 rounded-full" />
                  Jumlah Transaksi
                </h2>
                <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  Total: {trend.reduce((sum, t) => sum + t.trxCount, 0)} transaksi
                </span>
              </div>
              <div style={{ height: 250 }}>
                <Bar data={barData} options={barOpts} />
              </div>
            </div>
          </div>
        )}

        {/* Top Lists */}
        {(topSales.length > 0 || topLaptop.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <RankList 
              title="Top Sales" 
              icon="🏆" 
              items={topSales} 
              color="bg-gray-100"
              revenueKey="revenue"
            />
            <RankList 
              title="Laptop Terlaris" 
              icon="💻" 
              items={topLaptop} 
              color="bg-gray-100"
              revenueKey="revenue"
            />
            <RankList 
              title="Sumber Penjualan" 
              icon="📱" 
              items={topSource} 
              color="bg-gray-100"
              revenueKey="revenue"
            />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !summary && <EmptyState />}

      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-fadeIn { animation: fadeIn 0.4s ease-out; }
        .animate-bounce { animation: bounce 1s ease-in-out infinite; }
      `}</style>
    </DashboardLayout>
  );
}