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
  "from-gray-500 to-gray-600",
  "from-gray-600 to-gray-700",
  "from-gray-700 to-gray-800",
  "from-gray-500 to-gray-700",
  "from-gray-600 to-gray-800",
];
const getAvatarColor = (name: string) =>
  AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];

// ─── Shimmer ──────────────────────────────────────────────────────────────────
const Shimmer = ({ className = "", style = {} }: { className?: string; style?: React.CSSProperties }) => (
  <div className={`rounded-lg animate-shimmer bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 bg-[length:200%_100%] ${className}`} style={style} />
);

// ─── Trend Badge ──────────────────────────────────────────────────────────────
function TrendBadge({ change }: { change: number | null }) {
  if (change === null) return null;
  const up = change >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded-full ${up ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-600"}`}>
      {up ? "▲" : "▼"} {Math.abs(change)}%
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
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn" onClick={onClose}>
      <div className="relative max-w-lg w-full animate-scaleIn" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-12 right-0 text-white/70 hover:text-white transition-all duration-200 flex items-center gap-2 text-xs group">
          <span className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </span>
          Tutup
        </button>
        <img src={url} alt="Bukti Bayar" className="w-full rounded-2xl shadow-2xl border border-white/20" />
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="mt-4 flex items-center justify-center gap-2 text-white/60 hover:text-white text-xs transition-all duration-200 hover:gap-3"
          onClick={(e) => e.stopPropagation()}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
            <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
          </svg>
          Buka di tab baru
        </a>
      </div>
    </div>
  );
}

const ACCENT = {
  gray:    { bg: "from-gray-50 to-gray-100", text: "text-gray-700",   bar: "bg-gray-600",   border: "border-gray-200"   },
  emerald: { bg: "from-emerald-50 to-green-100", text: "text-emerald-700", bar: "bg-emerald-600", border: "border-emerald-200" },
  amber:   { bg: "from-amber-50 to-yellow-100",  text: "text-amber-700",  bar: "bg-amber-600",  border: "border-amber-200"  },
  blue:    { bg: "from-blue-50 to-indigo-100",   text: "text-blue-700",   bar: "bg-blue-600",   border: "border-blue-200"   },
} as const;

function StatCard({ label, value, sub, icon, accent = "gray", change }: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; accent?: keyof typeof ACCENT; change?: number | null;
}) {
  const a = ACCENT[accent];
  return (
    <div className="group bg-white rounded-xl sm:rounded-2xl border border-gray-100 p-3 sm:p-5 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5 relative overflow-hidden">
      <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${a.bar} opacity-0 group-hover:opacity-100 transition-all duration-300`} />
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[9px] sm:text-[10px] text-gray-400 font-semibold uppercase tracking-wider">{label}</p>
          {typeof value === 'number' ? (
            <p className="font-black mt-1 text-lg sm:text-xl tracking-tight text-gray-900 group-hover:scale-105 transition-transform origin-left">
              {value.toLocaleString('id-ID')}
            </p>
          ) : (
            <p className="font-black mt-1 text-base sm:text-xl tracking-tight text-gray-900 group-hover:scale-105 transition-transform origin-left">
              {value}
            </p>
          )}
          {sub && <p className="text-[9px] sm:text-[10px] text-gray-400 mt-0.5">{sub}</p>}
          {change !== undefined && change !== null && (
            <div className="mt-1"><TrendBadge change={change} /></div>
          )}
        </div>
        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 border bg-gradient-to-br ${a.bg} ${a.text} ${a.border} group-hover:scale-110 transition-all duration-300 shadow-sm`}>
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
  const medal = ["🥇", "🥈", "🥉"][rank - 1] ?? `${rank}`;
  const pct = Math.round((total / Math.max(maxTotal, 1)) * 100);
  return (
    <div className="group">
      <div className="flex items-center gap-2 py-1.5">
        <div className="w-6 text-center flex-shrink-0">
          {rank <= 3 ? (
            <span className="text-base sm:text-lg">{medal}</span>
          ) : (
            <span className="text-[10px] sm:text-xs font-semibold text-gray-400 bg-gray-100 w-5 h-5 rounded-full inline-flex items-center justify-center">{rank}</span>
          )}
        </div>
        <p className="text-[11px] sm:text-xs text-gray-700 truncate flex-1 font-medium group-hover:text-gray-900 transition">{name}</p>
        {extra}
        <span className="text-[10px] sm:text-[11px] font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0">{total}x</span>
      </div>
      <div className="ml-7 mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-gray-500 to-gray-600 rounded-full transition-all duration-500 group-hover:opacity-80" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Transaction Row ──────────────────────────────────────────────────────────
const STATUS_STYLES: Record<string, string> = {
  PAID: "bg-emerald-100 text-emerald-700 border-emerald-200",
  PENDING: "bg-amber-100 text-amber-700 border-amber-200",
  CANCELLED: "bg-rose-100 text-rose-600 border-rose-200",
};

const STATUS_ICON: Record<string, string> = {
  PAID: "✅",
  PENDING: "⏳",
  CANCELLED: "❌",
};

function TransactionRow({ item, onPhotoClick, canSeeFinancials }: {
  item: Transaction; onPhotoClick: (url: string) => void; canSeeFinancials: boolean;
}) {
  const profit = item.other || 0;
  const displayAmount = item.deal_price || item.amount;
  const timeStr = new Date(item.paid_at || item.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="px-3 sm:px-5 py-3 hover:bg-gray-50/80 transition-all duration-200 group">
      <div className="flex items-start gap-2 sm:gap-3">
        {/* Avatar */}
        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br ${getAvatarColor(item.customer_name)} flex items-center justify-center text-[10px] sm:text-xs font-bold flex-shrink-0 shadow-md text-white`}>
          {getInitials(item.customer_name)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-gray-800 text-xs sm:text-sm">{item.customer_name}</span>
            <span className={`inline-flex items-center gap-0.5 sm:gap-1 text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded-full border font-semibold ${STATUS_STYLES[item.status] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
              <span className="text-[8px] sm:text-[10px]">{STATUS_ICON[item.status] || "📋"}</span>
              <span className="hidden sm:inline">{item.status}</span>
            </span>
            {item.source_platform && (
              <span className="text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium hidden sm:inline-flex">
                {item.source_platform}
              </span>
            )}
          </div>

          <p className="text-gray-500 text-[10px] sm:text-xs mt-0.5 truncate">
            <span className="font-medium">{item.laptop_name}</span>
            <span className="text-gray-300 mx-0.5 sm:mx-1">•</span>
            <span className="font-mono text-[9px] sm:text-[10px] text-gray-400">{item.invoice_number}</span>
          </p>

          {item.sales_name && (
            <p className="text-[9px] sm:text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
              <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              {item.sales_name}
            </p>
          )}
        </div>

        {/* Amount */}
        <div className="flex-shrink-0 text-right">
          <p className="text-xs sm:text-sm font-bold text-gray-800">Rp {fmtShort(displayAmount)}</p>
          <p className="text-[9px] sm:text-[10px] text-gray-400 mt-0.5">{timeStr}</p>
          {canSeeFinancials && profit > 0 && (
            <p className="text-[9px] sm:text-[10px] font-semibold text-emerald-600 mt-0.5">+{fmtShort(profit)}</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="ml-10 sm:ml-12 mt-1.5 flex items-center gap-2 flex-wrap">
        {item.source_platform && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium sm:hidden">
            {item.source_platform}
          </span>
        )}

        {item.payment_photo && (
          <button 
            onClick={() => onPhotoClick(item.payment_photo!)} 
            className="flex items-center gap-1 text-[9px] sm:text-[10px] text-gray-500 hover:text-gray-700 transition-all duration-200 group/btn"
          >
            <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3 group-hover/btn:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span>Bukti</span>
          </button>
        )}

        {item.latitude && item.longitude && (
          <a
            href={`https://maps.google.com/?q=${item.latitude},${item.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[9px] sm:text-[10px] text-gray-500 hover:text-gray-700 transition-all duration-200"
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17.657 16.657L13.414 20.9a8 8 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <circle cx="12" cy="11" r="3" />
            </svg>
            Maps
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Live Dot ─────────────────────────────────────────────────────────────────
const LiveDot = () => (
  <span className="inline-block w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-500 animate-pulse ring-2 ring-emerald-200 flex-shrink-0" />
);

// ─── Refresh Button Component ────────────────────────────────────────────────
function RefreshButton({ onRefresh, isLoading }: { onRefresh: () => void; isLoading: boolean }) {
  return (
    <button
      onClick={onRefresh}
      disabled={isLoading}
      className="relative flex items-center gap-1 sm:gap-1.5 text-[11px] sm:text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl transition-all duration-200 hover:bg-gray-50 hover:border-gray-300 group disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <svg 
        className={`w-3 h-3 sm:w-3.5 sm:h-3.5 transition-all duration-500 ${isLoading ? 'animate-spin' : 'group-hover:rotate-180'}`} 
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      <span className="hidden sm:inline">{isLoading ? 'Memuat...' : 'Refresh'}</span>
      <span className="sm:hidden">{isLoading ? '...' : '↻'}</span>
      {isLoading && (
        <span className="absolute inset-0 rounded-xl bg-gray-50/50 animate-pulse" />
      )}
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Page() {
  const [stats, setStats] = useState<Stats>();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [now, setNow] = useState("");
  const [photoModal, setPhotoModal] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const canSeeFinancials = userRole ? hasPermission(userRole, PERMISSIONS.VIEW_FINANCIALS) : false;

  const fetchAll = useCallback(async (showRefreshAnimation = false) => {
    if (showRefreshAnimation) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    
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
      if (showRefreshAnimation) {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
      }
    }
  }, []);

  const handleRefresh = () => {
    fetchAll(true);
  };

  useEffect(() => {
    const d = new Date();
    setNow(d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
    fetchAll(false);
    
    const interval = setInterval(() => {
      fetchAll(true);
    }, 30000);
    
    return () => clearInterval(interval);
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
        borderColor: "#4B5563", backgroundColor: (ctx: any) => {
          const canvas = ctx.chart.ctx;
          const gradient = canvas.createLinearGradient(0, 0, 0, 160);
          gradient.addColorStop(0, 'rgba(75,85,99,0.1)');
          gradient.addColorStop(1, 'rgba(75,85,99,0)');
          return gradient;
        },
        borderWidth: 2.5, fill: true, tension: 0.4, pointRadius: 3,
        pointHoverRadius: 6, pointBackgroundColor: "#4B5563", pointBorderColor: "#fff", pointBorderWidth: 2,
      },
      {
        label: "Profit", data: weeklyProfit,
        borderColor: "#10B981", backgroundColor: (ctx: any) => {
          const canvas = ctx.chart.ctx;
          const gradient = canvas.createLinearGradient(0, 0, 0, 160);
          gradient.addColorStop(0, 'rgba(16,185,129,0.08)');
          gradient.addColorStop(1, 'rgba(16,185,129,0)');
          return gradient;
        },
        borderWidth: 2, fill: true, tension: 0.4, pointRadius: 2.5,
        pointHoverRadius: 5, pointBackgroundColor: "#10B981", pointBorderColor: "#fff", pointBorderWidth: 1.5,
        borderDash: [6, 4],
      },
    ],
  };

  const trxBarData = {
    labels: weeklyLabels,
    datasets: [{
      label: "Transaksi",
      data: weeklyTrxCount,
      backgroundColor: weeklyTrxCount.map((_, i) => 
        i === weeklyTrxCount.length - 1 ? "#4B5563" : "rgba(75,85,99,0.2)"
      ),
      borderRadius: 8,
      borderSkipped: false as const,
      hoverBackgroundColor: "rgba(75,85,99,0.35)",
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
      tooltip: { 
        backgroundColor: "rgba(0,0,0,0.85)",
        titleColor: "#fff",
        bodyColor: "#e5e7eb",
        padding: 8,
        cornerRadius: 8,
        callbacks: { label: (ctx: any) => `${ctx.dataset.label}: Rp ${fmtShort(ctx.raw as number)}` } 
      },
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
      tooltip: { 
        backgroundColor: "rgba(0,0,0,0.85)",
        cornerRadius: 8,
        callbacks: { label: (ctx: any) => `${ctx.raw} transaksi` } 
      },
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
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-12px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .fade-up { animation: fade-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
        .animate-scaleIn { animation: scaleIn 0.25s ease-out; }
        .animate-slideIn { animation: slideIn 0.3s ease-out; }
        .animate-shimmer { animation: shimmer 1.5s ease-in-out infinite; background-size: 200% 100%; }
        .animate-bounce { animation: bounce 1s ease-in-out infinite; }
        .animate-spin { animation: spin 0.6s linear infinite; }
        
        @keyframes pulse-ring {
          0% { transform: scale(0.8); opacity: 0.5; }
          100% { transform: scale(1.2); opacity: 0; }
        }
        .animate-pulse-ring { animation: pulse-ring 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
      `}</style>

      {photoModal && <PhotoModal url={photoModal} onClose={() => setPhotoModal(null)} />}

      <div className="space-y-4 sm:space-y-5 max-w-7xl mx-auto px-3 sm:px-4">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-end justify-between gap-3 fade-up">
          <div>
            {isLoading ? (
              <div className="space-y-1.5">
                <Shimmer className="w-32 sm:w-48 h-2 sm:h-3" />
                <Shimmer className="w-24 sm:w-32 h-5 sm:h-7 mt-1" />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-0.5 h-5 sm:h-7 bg-gradient-to-b from-gray-600 to-gray-800 rounded-full" />
                  <p className="text-[10px] sm:text-xs text-gray-400 font-medium">{now}</p>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-900 bg-clip-text text-transparent mt-0.5">
                  Dashboard
                </h1>
                {lastUpdated && (
                  <p className="text-[9px] sm:text-[10px] text-gray-400 mt-1 flex items-center gap-1.5 animate-slideIn">
                    <LiveDot />
                    Terakhir diperbarui {lastUpdated.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </p>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <RefreshButton onRefresh={handleRefresh} isLoading={isRefreshing} />
            <a
              href="/payment/create"
              className="inline-flex items-center gap-1 sm:gap-1.5 bg-gray-700 text-white text-[11px] sm:text-sm font-semibold px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl hover:bg-gray-800 transition-all duration-200 active:scale-95 shadow-md hover:shadow-lg whitespace-nowrap"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span className="hidden sm:inline">Buat Transaksi</span>
              <span className="sm:hidden">Buat</span>
            </a>
          </div>
        </div>

        {/* ── Stat Cards Grid ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 fade-up" style={{ animationDelay: "0.05s" }}>
          {isLoading ? (
            Array(4).fill(0).map((_, i) => (
              <div key={i} className="bg-white rounded-xl sm:rounded-2xl border border-gray-100 p-3 sm:p-4 shadow-sm space-y-2">
                <Shimmer className="w-16 sm:w-20 h-2 sm:h-3" />
                <Shimmer className="w-24 sm:w-32 h-5 sm:h-6" />
                <Shimmer className="w-20 sm:w-24 h-2 sm:h-3" />
              </div>
            ))
          ) : canSeeFinancials ? (
            <>
              <StatCard label="Omzet Hari Ini" value={`Rp ${fmtShort(stats?.todayRevenue || 0)}`}
                sub={`${stats?.todayTransactions || 0} transaksi`} icon={<OmzetIcon />} accent="gray" change={stats?.revenueChange} />
              <StatCard label="Profit Hari Ini" value={`Rp ${fmtShort(stats?.todayProfit || 0)}`}
                sub="margin bersih" icon={<ProfitIcon />} accent="emerald" change={stats?.profitChange} />
              <StatCard label="Laptop Ready" value={stats?.laptopReady || 0}
                sub={`${stats?.stockTotal || 0} total unit`} icon={<LaptopIcon />} accent="gray" />
              <StatCard label="Transaksi Hari Ini" value={stats?.todayTransactions || 0}
                sub="transaksi selesai" icon={<TrxIcon />} accent="gray" change={stats?.trxChange} />
            </>
          ) : (
            <>
              <StatCard label="Transaksi Hari Ini" value={stats?.todayTransactions || 0}
                sub="transaksi selesai" icon={<TrxIcon />} accent="gray" change={stats?.trxChange} />
              <StatCard label="Laptop Ready" value={stats?.laptopReady || 0}
                sub={`${stats?.stockTotal || 0} total unit`} icon={<LaptopIcon />} accent="gray" />
            </>
          )}
        </div>

        {/* ── Section Label ── */}
        <div className="flex items-center gap-2 fade-up" style={{ animationDelay: "0.08s" }}>
          <LiveDot />
          <span className="text-[10px] sm:text-[11px] font-bold text-gray-400 uppercase tracking-wider">Analitik Penjualan</span>
          <div className="flex-1 h-px bg-gradient-to-r from-gray-200 to-transparent" />
        </div>

        {/* ── Analytics Grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 fade-up" style={{ animationDelay: "0.1s" }}>

          {/* Chart: Trend */}
          {canSeeFinancials ? (
            <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 p-3 sm:p-5">
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <h2 className="font-bold text-gray-800 text-xs sm:text-sm flex items-center gap-2">
                  <span className="w-0.5 h-3 sm:h-4 bg-gray-600 rounded-full" />
                  Tren Omzet & Profit
                </h2>
                <span className="text-[9px] sm:text-[10px] text-gray-400 bg-gray-100 px-1.5 sm:px-2 py-0.5 rounded-full">7 hari terakhir</span>
              </div>
              <div className="flex gap-2 sm:gap-3 mb-2 sm:mb-3">
                <div className="flex items-center gap-1 sm:gap-1.5 text-[9px] sm:text-[10px] text-gray-500">
                  <span className="w-4 sm:w-5 h-0.5 bg-gray-600 inline-block rounded-full" />Omzet
                </div>
                <div className="flex items-center gap-1 sm:gap-1.5 text-[9px] sm:text-[10px] text-gray-500">
                  <span className="w-4 sm:w-5 inline-block border-t-2 border-dashed border-emerald-500" />Profit
                </div>
              </div>
              {isLoading ? <Shimmer className="w-full h-28 sm:h-36" /> : weeklyRevenue.length > 0 ? (
                <div style={{ height: 130 }} className="sm:h-[160px]"><Line data={trendChartData} options={trendOptions} /></div>
              ) : (
                <div className="text-center py-8 sm:py-12">
                  <p className="text-2xl sm:text-3xl mb-1 sm:mb-2">📊</p>
                  <p className="text-gray-400 text-[11px] sm:text-sm">Belum ada data</p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 p-3 sm:p-5">
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <h2 className="font-bold text-gray-800 text-xs sm:text-sm flex items-center gap-2">
                  <span className="w-0.5 h-3 sm:h-4 bg-gray-600 rounded-full" />
                  Transaksi per Hari
                </h2>
                <span className="text-[9px] sm:text-[10px] text-gray-400 bg-gray-100 px-1.5 sm:px-2 py-0.5 rounded-full">7 hari terakhir</span>
              </div>
              {isLoading ? <Shimmer className="w-full h-28 sm:h-36" /> : weeklyTrxCount.length > 0 ? (
                <div style={{ height: 130 }} className="sm:h-[160px]"><Bar data={trxBarData} options={barOptions} /></div>
              ) : (
                <div className="text-center py-8 sm:py-12">
                  <p className="text-2xl sm:text-3xl mb-1 sm:mb-2">📊</p>
                  <p className="text-gray-400 text-[11px] sm:text-sm">Belum ada data</p>
                </div>
              )}
            </div>
          )}

          {/* Top Sales */}
          <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 p-3 sm:p-5">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h2 className="font-bold text-gray-800 text-xs sm:text-sm flex items-center gap-2">
                <span className="text-base sm:text-lg">🏆</span>
                Top Sales
              </h2>
              <span className="text-[9px] sm:text-[10px] text-gray-400 bg-gray-100 px-1.5 sm:px-2 py-0.5 rounded-full">hari ini</span>
            </div>
            {isLoading ? (
              <div className="space-y-2 sm:space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Shimmer className="w-5 h-5 sm:w-6 sm:h-6 rounded-full" />
                    <Shimmer className="flex-1 h-2 sm:h-3" />
                    <Shimmer className="w-8 sm:w-10 h-4 sm:h-5 rounded-full" />
                  </div>
                ))}
              </div>
            ) : stats?.topSales?.length ? (
              <div className="space-y-1">
                {stats.topSales.map((s, i) => (
                  <TopListItem key={s.name} rank={i + 1} name={s.name} total={s.total}
                    maxTotal={stats.topSales[0]?.total || 1}
                    extra={canSeeFinancials && s.profit > 0 ? (
                      <span className="text-[9px] sm:text-[10px] text-emerald-600 font-semibold flex-shrink-0">+{fmtShort(s.profit)}</span>
                    ) : undefined}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-6 sm:py-8">
                <p className="text-2xl sm:text-3xl mb-1 sm:mb-2">🏆</p>
                <p className="text-gray-400 text-[11px] sm:text-sm">Belum ada data</p>
              </div>
            )}
          </div>

          {/* Top Laptop */}
          <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 p-3 sm:p-5">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h2 className="font-bold text-gray-800 text-xs sm:text-sm flex items-center gap-2">
                <span className="text-base sm:text-lg">💻</span>
                Laptop Terlaris
              </h2>
              <span className="text-[9px] sm:text-[10px] text-gray-400 bg-gray-100 px-1.5 sm:px-2 py-0.5 rounded-full">hari ini</span>
            </div>
            {isLoading ? (
              <div className="space-y-2 sm:space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Shimmer className="w-5 h-5 sm:w-6 sm:h-6 rounded-full" />
                    <Shimmer className="flex-1 h-2 sm:h-3" />
                    <Shimmer className="w-8 sm:w-10 h-4 sm:h-5 rounded-full" />
                  </div>
                ))}
              </div>
            ) : stats?.topLaptop?.length ? (
              <div className="space-y-1">
                {stats.topLaptop.map((item, i) => (
                  <TopListItem key={item.name} rank={i + 1} name={item.name} total={item.total}
                    maxTotal={stats.topLaptop[0]?.total || 1} />
                ))}
              </div>
            ) : (
              <div className="text-center py-6 sm:py-8">
                <p className="text-2xl sm:text-3xl mb-1 sm:mb-2">💻</p>
                <p className="text-gray-400 text-[11px] sm:text-sm">Belum ada data</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Bar Chart Transaksi (only for financials role) ── */}
        {canSeeFinancials && (
          <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 p-3 sm:p-5 fade-up" style={{ animationDelay: "0.13s" }}>
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h2 className="font-bold text-gray-800 text-xs sm:text-sm flex items-center gap-2">
                <span className="w-0.5 h-3 sm:h-4 bg-gray-600 rounded-full" />
                Transaksi per Hari
              </h2>
              <span className="text-[9px] sm:text-[10px] text-gray-400 bg-gray-100 px-1.5 sm:px-2 py-0.5 rounded-full">7 hari terakhir</span>
            </div>
            {isLoading ? <Shimmer className="w-full h-28 sm:h-36" /> : weeklyTrxCount.length > 0 ? (
              <div style={{ height: 130 }} className="sm:h-[160px]"><Bar data={trxBarData} options={barOptions} /></div>
            ) : (
              <div className="text-center py-8 sm:py-12">
                <p className="text-2xl sm:text-3xl mb-1 sm:mb-2">📊</p>
                <p className="text-gray-400 text-[11px] sm:text-sm">Belum ada data</p>
              </div>
            )}
          </div>
        )}

        {/* ── Recent Transactions ── */}
        <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm overflow-hidden fade-up" style={{ animationDelay: "0.16s" }}>
          <div className="flex items-center justify-between px-3 sm:px-5 py-3 sm:py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
            <h2 className="font-bold text-gray-800 text-xs sm:text-sm flex items-center gap-2">
              <LiveDot />
              Transaksi Terbaru
            </h2>
            <a href="/dashboard/transactions" className="text-[10px] sm:text-xs font-semibold text-gray-500 hover:text-gray-700 transition-all duration-200 flex items-center gap-1 group">
              Lihat Semua
              <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </a>
          </div>

          <div className="divide-y divide-gray-50">
            {isLoading ? (
              [1, 2, 3].map((i) => (
                <div key={i} className="px-3 sm:px-5 py-3 sm:py-4 flex items-center gap-2 sm:gap-3 animate-pulse">
                  <Shimmer className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex-shrink-0" />
                  <div className="flex-1 space-y-1">
                    <Shimmer className="w-28 sm:w-36 h-3 sm:h-3.5" />
                    <Shimmer className="w-40 sm:w-52 h-2 sm:h-3" />
                  </div>
                  <div className="space-y-1 text-right flex-shrink-0">
                    <Shimmer className="w-16 sm:w-20 h-3 sm:h-4" />
                    <Shimmer className="w-10 sm:w-12 h-2 sm:h-3" />
                  </div>
                </div>
              ))
            ) : transactions.length === 0 ? (
              <div className="py-12 sm:py-16 text-center">
                <div className="text-4xl sm:text-5xl mb-2 sm:mb-3 animate-bounce">📭</div>
                <p className="text-gray-500 text-[11px] sm:text-sm font-medium">Belum ada transaksi hari ini</p>
                <p className="text-gray-400 text-[9px] sm:text-xs mt-1">Transaksi akan muncul setelah dibuat</p>
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