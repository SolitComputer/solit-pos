"use client";

import { useEffect, useState, useCallback } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { PERMISSIONS, UserRole, hasPermission } from "@/lib/permissions";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Filler, Tooltip, Legend
);

// ─── Types ────────────────────────────────────────────────────────────────────
interface WeeklyTrendItem {
  date: string; label: string; revenue: number; profit: number; trxCount: number;
}
interface Stats {
  todayRevenue: number; todayProfit: number; todayTransactions: number;
  laptopReady: number; stockTotal: number;
  revenueChange: number | null; profitChange: number | null; trxChange: number | null;
  weeklyTrend: WeeklyTrendItem[];
  topSales: { name: string; total: number; profit: number }[];
  topSources: { name: string; total: number }[];
  topLaptop: { name: string; total: number }[];
}
interface Transaction {
  id: string; invoice_number: string; customer_name: string; laptop_name: string;
  amount: number; deal_price?: number; inventory_price?: number; other: number;
  status: string; sales_name?: string; source_platform?: string;
  payment_photo?: string; latitude?: string; longitude?: string;
  paid_at?: string; created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString("id-ID");
const fmtShort = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}Jt`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}Rb`;
  return String(n);
};
const getInitials = (name: string) =>
  name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700", "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700", "bg-violet-100 text-violet-700",
  "bg-rose-100 text-rose-700",
];
const getAvatarColor = (name: string) =>
  AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];

// ─── Shimmer ──────────────────────────────────────────────────────────────────
const Shimmer = ({ className = "", style = {} }: { className?: string; style?: React.CSSProperties }) => (
  <div className={`rounded-lg animate-pulse bg-gray-100 ${className}`} style={style} />
);

// ─── Trend Badge ──────────────────────────────────────────────────────────────
function TrendBadge({ change }: { change: number | null }) {
  if (change === null) return null;
  const up = change >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${up ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
      {up ? "▲" : "▼"} {Math.abs(change)}% vs kemarin
    </span>
  );
}

// ─── Photo Modal ──────────────────────────────────────────────────────────────
function PhotoModal({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-10 right-0 text-white/70 hover:text-white transition flex items-center gap-1.5 text-sm">
          ✕ Tutup
        </button>
        <img src={url} alt="Bukti Bayar" className="w-full rounded-2xl shadow-2xl" />
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="mt-3 flex items-center justify-center gap-2 text-white/60 hover:text-white text-xs transition"
          onClick={(e) => e.stopPropagation()}>
          ↗ Buka di tab baru
        </a>
      </div>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
const ACCENT = {
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600", bar: "bg-emerald-500", border: "border-emerald-100" },
  blue: { bg: "bg-blue-50", text: "text-blue-600", bar: "bg-blue-500", border: "border-blue-100" },
  amber: { bg: "bg-amber-50", text: "text-amber-600", bar: "bg-amber-500", border: "border-amber-100" },
  violet: { bg: "bg-violet-50", text: "text-violet-600", bar: "bg-violet-500", border: "border-violet-100" },
} as const;

function StatCard({ label, value, sub, icon, accent = "emerald", change }: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; accent?: keyof typeof ACCENT; change?: number | null;
}) {
  const a = ACCENT[accent];
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-3.5 sm:p-4 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
      <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${a.bar} opacity-60`} />
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] sm:text-[11px] text-gray-400 font-semibold uppercase tracking-wider leading-tight">{label}</p>
          <p className="font-extrabold mt-1 text-base sm:text-lg tracking-tight text-gray-900 truncate">{value}</p>
          {sub && <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">{sub}</p>}
          {change !== undefined && (
            <div className="mt-1.5"><TrendBadge change={change ?? null} /></div>
          )}
        </div>
        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${a.bg} ${a.text} ${a.border}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

// ─── Top List Row ─────────────────────────────────────────────────────────────
function TopListItem({ rank, name, total, maxTotal, extra }: {
  rank: number; name: string; total: number; maxTotal: number; extra?: React.ReactNode;
}) {
  const medal = ["🥇", "🥈", "🥉"][rank - 1] ?? "·";
  const pct = Math.round((total / Math.max(maxTotal, 1)) * 100);
  return (
    <div>
      <div className="flex items-center gap-2 py-1">
        <span className="text-sm w-5 text-center flex-shrink-0">{medal}</span>
        <p className="text-xs text-gray-700 truncate flex-1 font-medium">{name}</p>
        {extra}
        <span className="text-[11px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full flex-shrink-0">{total}x</span>
      </div>
      <div className="ml-7 h-1 bg-gray-100 rounded-full overflow-hidden mb-1">
        <div className="h-full bg-[#1a1a2e]/60 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Transaction Row ──────────────────────────────────────────────────────────
// ✅ FIX: Redesign layout menjadi 2 baris di mobile agar tidak overflow
const STATUS_STYLES: Record<string, string> = {
  PAID: "bg-emerald-50 text-emerald-700 border-emerald-200",
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  CANCELLED: "bg-red-50 text-red-600 border-red-200",
};

function TransactionRow({ item, onPhotoClick, canSeeFinancials }: {
  item: Transaction; onPhotoClick: (url: string) => void; canSeeFinancials: boolean;
}) {
  const profit = item.other || 0;
  const displayAmount = item.deal_price || item.amount;
  const timeStr = new Date(item.paid_at || item.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="px-4 sm:px-5 py-3 sm:py-3.5 hover:bg-gray-50/60 transition">
      {/* ── Baris 1: Avatar + Info + Amount ── */}
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${getAvatarColor(item.customer_name)}`}>
          {getInitials(item.customer_name)}
        </div>

        {/* Info — tengah, flex-1 */}
        <div className="flex-1 min-w-0">
          {/* Nama + status + platform */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-gray-800 text-sm leading-tight">{item.customer_name}</span>
            <span className={`text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded-full border font-semibold flex-shrink-0 ${STATUS_STYLES[item.status] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
              {item.status}
            </span>
            {item.source_platform && (
              <span className="text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium flex-shrink-0 hidden sm:inline-flex">
                {item.source_platform}
              </span>
            )}
          </div>

          {/* Laptop + invoice */}
          <p className="text-gray-400 text-[11px] sm:text-xs mt-0.5 truncate leading-tight">
            <span className="truncate">{item.laptop_name}</span>
            <span className="text-gray-300 mx-1">·</span>
            <span className="font-mono text-[10px] text-gray-300">{item.invoice_number}</span>
          </p>

          {/* Sales name — mobile only ditampilkan di baris ini */}
          {item.sales_name && (
            <p className="text-[10px] text-gray-400 mt-0.5">Sales: {item.sales_name}</p>
          )}
        </div>

        {/* Amount + time — kanan atas, tidak pernah overflow */}
        <div className="flex-shrink-0 text-right">
          <p className="text-sm font-bold text-gray-800 leading-tight">Rp {fmtShort(displayAmount)}</p>
          <p className="text-[10px] text-gray-300 mt-0.5">{timeStr}</p>
          {/* Profit — tampil di sini untuk mobile jika bisa lihat finansial */}
          {canSeeFinancials && profit > 0 && (
            <p className="text-[10px] font-semibold text-emerald-600 mt-0.5 sm:hidden">
              +{fmtShort(profit)}
            </p>
          )}
        </div>
      </div>

      {/* ── Baris 2 (mobile): platform + profit + foto + lokasi ── */}
      <div className="ml-11 mt-1.5 flex items-center gap-2 flex-wrap">
        {/* Platform badge di mobile */}
        {item.source_platform && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium sm:hidden flex-shrink-0">
            {item.source_platform}
          </span>
        )}

        {/* Profit desktop */}
        {canSeeFinancials && profit > 0 && (
          <span className="text-[10px] font-semibold text-emerald-600 hidden sm:inline-flex items-center gap-1 flex-shrink-0">
            <span className="w-1 h-1 rounded-full bg-emerald-400 inline-block" />
            Profit +Rp {fmt(profit)}
          </span>
        )}

        {/* Foto bukti bayar */}
        {item.payment_photo && (
          <button onClick={() => onPhotoClick(item.payment_photo!)} className="flex-shrink-0">
            <img
              src={item.payment_photo}
              alt="bukti"
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg object-cover border border-gray-200 hover:scale-110 hover:border-gray-400 transition-all"
            />
          </button>
        )}

        {/* Lokasi */}
        {item.latitude && item.longitude && (
          <a
            href={`https://maps.google.com/?q=${item.latitude},${item.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-blue-400 hover:text-blue-600 transition flex-shrink-0"
          >
            📍 Lokasi
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Live Dot ─────────────────────────────────────────────────────────────────
const LiveDot = () => (
  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
);

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Page() {
  const [stats, setStats] = useState<Stats>();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [now, setNow] = useState("");
  const [photoModal, setPhotoModal] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const canSeeFinancials = userRole ? hasPermission(userRole, PERMISSIONS.VIEW_FINANCIALS) : false;

  const fetchAll = useCallback(async () => {
    try {
      const [statsRes, transRes, meRes] = await Promise.all([
        fetch("/api/dashboard/stats"),
        fetch("/api/dashboard/transactions"),
        fetch("/api/auth/me"),
      ]);
      const [statsResult, transResult, meResult] = await Promise.all([
        statsRes.json(), transRes.json(), meRes.json(),
      ]);
      if (statsResult.success) setStats(statsResult.data);
      setTransactions(transResult?.data || []);
      setUserRole(meResult.user?.role ?? null);
      setLastUpdated(new Date());
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const d = new Date();
    setNow(d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
    fetchAll();
  }, [fetchAll]);

  // ── Chart data ─────────────────────────────────────────────────────────────
  const weeklyLabels    = stats?.weeklyTrend?.map((d) => d.label) ?? [];
  const weeklyRevenue   = stats?.weeklyTrend?.map((d) => d.revenue) ?? [];
  const weeklyProfit    = stats?.weeklyTrend?.map((d) => d.profit) ?? [];
  const weeklyTrxCount  = stats?.weeklyTrend?.map((d) => d.trxCount) ?? [];

  const trendChartData = {
    labels: weeklyLabels,
    datasets: [
      {
        label: "Omzet", data: weeklyRevenue,
        borderColor: "#1a1a2e", backgroundColor: "rgba(26,26,46,0.06)",
        borderWidth: 2, fill: true, tension: 0.4, pointRadius: 3,
        pointHoverRadius: 5, pointBackgroundColor: "#1a1a2e",
      },
      {
        label: "Profit", data: weeklyProfit,
        borderColor: "#10b981", backgroundColor: "rgba(16,185,129,0.06)",
        borderWidth: 2, fill: true, tension: 0.4, pointRadius: 3,
        pointHoverRadius: 5, pointBackgroundColor: "#10b981", borderDash: [4, 3],
      },
    ],
  };

  const trxBarData = {
    labels: weeklyLabels,
    datasets: [{
      label: "Transaksi",
      data: weeklyTrxCount,
      backgroundColor: weeklyTrxCount.map((_, i) => i === weeklyTrxCount.length - 1 ? "#1a1a2e" : "rgba(26,26,46,0.15)"),
      borderRadius: 6,
      borderSkipped: false as const,
    }],
  };

  const chartBaseOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
  } as const;

  const trendOptions = {
    ...chartBaseOptions,
    interaction: { mode: "index" as const, intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx: any) => `${ctx.dataset.label}: Rp ${fmtShort(ctx.raw as number)}` } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 9 }, color: "#9ca3af" } },
      y: { grid: { color: "rgba(0,0,0,.04)" }, ticks: { font: { size: 9 }, color: "#9ca3af", callback: (v: any) => "Rp " + fmtShort(v) } },
    },
  };

  const barOptions = {
    ...chartBaseOptions,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx: any) => `${ctx.raw} transaksi` } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 9 }, color: "#9ca3af" } },
      y: { grid: { color: "rgba(0,0,0,.04)" }, ticks: { font: { size: 9 }, color: "#9ca3af", stepSize: 1 } },
    },
  };

  return (
    <DashboardLayout>
      <style>{`
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fade-up { animation: fade-up 0.35s ease both; }
      `}</style>

      {photoModal && <PhotoModal url={photoModal} onClose={() => setPhotoModal(null)} />}

      <div className="space-y-4 sm:space-y-5">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-end justify-between gap-2 sm:gap-3 fade-up">
          <div>
            {isLoading ? (
              <div className="space-y-1.5">
                <Shimmer className="w-36 h-3" />
                <Shimmer className="w-28 h-6 mt-1" />
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-400 font-medium capitalize">{now}</p>
                <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 mt-0.5 tracking-tight">Dashboard</h1>
                {lastUpdated && (
                  <p className="text-[10px] text-gray-300 mt-0.5 flex items-center gap-1">
                    <LiveDot />
                    Diperbarui {lastUpdated.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
              </>
            )}
          </div>

          {/* ✅ FIX: tombol tidak overflow di HP */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={fetchAll}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 border border-gray-200 px-2.5 py-1.5 rounded-xl transition"
            >
              ↻ <span className="hidden sm:inline">Refresh</span>
            </button>
            <a
              href="/payment/create"
              className="inline-flex items-center gap-1.5 bg-[#1a1a2e] text-white text-xs sm:text-sm font-semibold px-3 sm:px-4 py-2 rounded-xl hover:bg-[#16213e] transition active:scale-[0.98] shadow-sm whitespace-nowrap"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Buat Transaksi
            </a>
          </div>
        </div>

        {/* ── Stat Cards ── */}
        {/* ✅ FIX: 2 kolom di mobile, 4 di desktop — ukuran seragam */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 fade-up" style={{ animationDelay: "0.05s" }}>
          {isLoading ? (
            Array(4).fill(0).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-3.5 shadow-sm space-y-2">
                <Shimmer className="w-20 h-3" />
                <Shimmer className="w-32 h-6" />
                <Shimmer className="w-24 h-3" />
                <Shimmer className="w-28 h-4" />
              </div>
            ))
          ) : (
            <>
              {canSeeFinancials ? (
                <StatCard label="Omzet Hari Ini" value={`Rp ${fmtShort(stats?.todayRevenue || 0)}`}
                  sub={`${stats?.todayTransactions || 0} transaksi`} icon={<OmzetIcon />} accent="emerald" change={stats?.revenueChange} />
              ) : (
                <StatCard label="Transaksi Hari Ini" value={stats?.todayTransactions || 0}
                  sub="transaksi selesai" icon={<TrxIcon />} accent="violet" change={stats?.trxChange} />
              )}

              {canSeeFinancials ? (
                <StatCard label="Profit Hari Ini" value={`Rp ${fmtShort(stats?.todayProfit || 0)}`}
                  sub="margin bersih" icon={<ProfitIcon />} accent="blue" change={stats?.profitChange} />
              ) : (
                <StatCard label="Laptop Ready" value={stats?.laptopReady || 0}
                  sub="model tersedia" icon={<LaptopIcon />} accent="amber" />
              )}

              <StatCard label="Laptop Ready" value={stats?.laptopReady || 0}
                sub={`${stats?.stockTotal || 0} total unit`} icon={<LaptopIcon />} accent="amber" />

              <StatCard label="Transaksi Hari Ini" value={stats?.todayTransactions || 0}
                sub="transaksi selesai" icon={<TrxIcon />} accent="violet" change={stats?.trxChange} />
            </>
          )}
        </div>

        {/* ── Section Label ── */}
        <div className="flex items-center gap-2 fade-up" style={{ animationDelay: "0.08s" }}>
          <LiveDot />
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Analitik Penjualan</span>
        </div>

        {/* ── Analytics Grid ── */}
        {/* ✅ FIX: 1 kolom di mobile, 3 kolom di lg — tidak pakai col-span yang ambigu */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 fade-up" style={{ animationDelay: "0.1s" }}>

          {/* Chart: Trend atau Bar */}
          {canSeeFinancials ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-bold text-gray-800 text-sm">Tren Omzet & Profit</h2>
                <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">7 hari</span>
              </div>
              <div className="flex gap-3 mb-3">
                <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                  <span className="w-5 h-0.5 bg-[#1a1a2e] inline-block rounded" />Omzet
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                  <span className="w-5 inline-block" style={{ borderTop: "2px dashed #10b981" }} />Profit
                </div>
              </div>
              {isLoading ? <Shimmer className="w-full h-32" /> : weeklyRevenue.length > 0 ? (
                <div style={{ height: 140 }}><Line data={trendChartData} options={trendOptions} /></div>
              ) : (
                <p className="text-center text-gray-300 text-sm py-10">Belum ada data</p>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-gray-800 text-sm">📊 Transaksi per Hari</h2>
                <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">7 hari</span>
              </div>
              {isLoading ? <Shimmer className="w-full h-32" /> : weeklyTrxCount.length > 0 ? (
                <div style={{ height: 140 }}><Bar data={trxBarData} options={barOptions} /></div>
              ) : (
                <p className="text-center text-gray-300 text-sm py-10">Belum ada data</p>
              )}
            </div>
          )}

          {/* Top Sales */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-800 text-sm flex items-center gap-1.5">🏆 Top Sales</h2>
              <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">hari ini</span>
            </div>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Shimmer className="w-5 h-5 rounded" />
                    <Shimmer className="flex-1 h-3" />
                    <Shimmer className="w-6 h-5 rounded-full" />
                  </div>
                ))}
              </div>
            ) : stats?.topSales?.length ? (
              <div className="space-y-0.5">
                {stats.topSales.map((s, i) => (
                  <TopListItem key={s.name} rank={i + 1} name={s.name} total={s.total}
                    maxTotal={stats.topSales[0]?.total || 1}
                    extra={canSeeFinancials && s.profit > 0 ? (
                      <span className="text-[10px] text-emerald-600 font-semibold flex-shrink-0">+{fmtShort(s.profit)}</span>
                    ) : undefined}
                  />
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-300 text-sm py-6">Belum ada data</p>
            )}
          </div>

          {/* Top Laptop */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-800 text-sm">💻 Laptop Terlaris</h2>
              <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">hari ini</span>
            </div>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Shimmer className="w-5 h-5 rounded" />
                    <Shimmer className="flex-1 h-3" />
                    <Shimmer className="w-6 h-5 rounded-full" />
                  </div>
                ))}
              </div>
            ) : stats?.topLaptop?.length ? (
              <div className="space-y-0.5">
                {stats.topLaptop.map((item, i) => (
                  <TopListItem key={item.name} rank={i + 1} name={item.name} total={item.total}
                    maxTotal={stats.topLaptop[0]?.total || 1} />
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-300 text-sm py-6">Belum ada data</p>
            )}
          </div>
        </div>

        {/* ── Bar Chart Transaksi (only shown for financials role, non-fin sudah ada di atas) ── */}
        {/* ✅ FIX: Hapus duplikat — chart ini hanya ditampilkan untuk canSeeFinancials */}
        {canSeeFinancials && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5 fade-up" style={{ animationDelay: "0.13s" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-800 text-sm">📊 Transaksi per Hari</h2>
              <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">7 hari</span>
            </div>
            {isLoading ? <Shimmer className="w-full h-32" /> : weeklyTrxCount.length > 0 ? (
              <div style={{ height: 140 }}><Bar data={trxBarData} options={barOptions} /></div>
            ) : (
              <p className="text-center text-gray-300 text-sm py-10">Belum ada data</p>
            )}
          </div>
        )}

        {/* ── Recent Transactions ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden fade-up" style={{ animationDelay: "0.16s" }}>
          <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 sm:py-4 border-b border-gray-50">
            <h2 className="font-bold text-gray-800 text-sm flex items-center gap-2">
              Transaksi Terbaru <LiveDot />
            </h2>
            <a href="/dashboard/transactions" className="text-xs font-semibold text-gray-400 hover:text-gray-700 transition whitespace-nowrap">
              Lihat Semua →
            </a>
          </div>

          <div className="divide-y divide-gray-50">
            {isLoading ? (
              [1, 2, 3].map((i) => (
                <div key={i} className="px-4 sm:px-5 py-4 flex items-center gap-3">
                  <Shimmer className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Shimmer className="w-36 h-3.5" />
                    <Shimmer className="w-52 h-3" />
                  </div>
                  <div className="space-y-1 text-right flex-shrink-0">
                    <Shimmer className="w-20 h-4" />
                    <Shimmer className="w-12 h-3" />
                  </div>
                </div>
              ))
            ) : transactions.length === 0 ? (
              <div className="py-14 text-center">
                <p className="text-2xl mb-2">📭</p>
                <p className="text-gray-400 text-sm">Belum ada transaksi hari ini</p>
              </div>
            ) : (
              transactions.map((item) => (
                <TransactionRow key={item.id} item={item} onPhotoClick={setPhotoModal} canSeeFinancials={canSeeFinancials} />
              ))
            )}
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const OmzetIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
  </svg>
);
const ProfitIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
);
const TrxIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);
const LaptopIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>
);