"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { PERMISSIONS, UserRole, hasPermission } from "@/lib/permissions";
import { RevenueDetailModal } from "@/components/modals/RevenueDetailModal";
import { InventoryDetailModal } from "@/components/modals/InventoryDetailModal";
import { SalesDetailModal } from "@/components/modals/SalesDetailModal";
import { LaptopDetailModal } from "@/components/modals/LaptopDetailModal";
import { GrossProfitDetailModal } from "@/components/modals/GrossProfitDetailModal";
import { TransactionDetailModal } from "@/components/modals/TransactionDetailModal";
import ServiceDashboardWidget from "@/components/service/ServiceDashboardWidget";
import { AdminChatMonitor } from "@/components/ui/AdminChatMonitor";
import {
  Medal, Banknote, TrendingUp, ShoppingCart, Calculator, Percent, Award,
  Laptop, Smartphone, Trophy, Inbox, BarChart3,
  CheckCircle2, Clock, XCircle, ClipboardList,
  ArrowUp, ArrowDown,
} from "lucide-react";

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
import { getAuthUser } from "@/hooks/useAuthUser";

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Filler, Tooltip, Legend
);

interface WeeklyTrendItem {
  date: string;
  label: string;
  revenue: number;
  profit: number;
  trxCount: number;
  laptopSold: number;
}
interface Stats {
  todayRevenue: number;
  todayProfit: number;
  todayTransactions: number;
  todayLaptopSold: number;
  laptopReady: number;
  stockTotal: number;
  revenueChange: number | null;
  profitChange: number | null;
  trxChange: number | null;
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

const fmtShort = (n: number): string => {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${sign}Rp ${(abs / 1_000_000_000).toFixed(1)}M`;
  if (abs >= 1_000_000) return `${sign}Rp ${(abs / 1_000_000).toFixed(1)}Jt`;
  if (abs >= 1_000) return `${sign}Rp ${(abs / 1_000).toFixed(0)}Rb`;
  return `${sign}Rp ${abs}`;
};

const fmtRupiah = (n: number): string =>
  "Rp " + (n || 0).toLocaleString("id-ID");

const getDealPrice = (item: Transaction): number =>
  Number(item.deal_price || item.amount || 0);

const getInitials = (name: string) =>
  name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();

// Shared card styling token aligned with Laporan Keuangan
const CARD = "bg-white rounded-2xl border border-gray-100 p-5 hover:border-gray-200 transition-all duration-200";

// ─── Shimmer ──────────────────────────────────────────────────────────────────
const Shimmer = ({ className = "", style = {} }: { className?: string; style?: React.CSSProperties }) => (
  <div className={`rounded-lg animate-shimmer bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 bg-[length:200%_100%] ${className}`} style={style} />
);

// ─── Trend Badge ──────────────────────────────────────────────────────────────
function TrendBadge({ change }: { change: number | null }) {
  if (change === null) return null;
  const up = change >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-lg tabular-nums border ${up ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-rose-50 text-rose-600 border-rose-100"}`}>
      {up ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />} {Math.abs(change)}%
    </span>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, icon, rank, change,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  rank?: number;
  change?: number | null;
}) {
  return (
    <div className="report-stat-card bg-white rounded-2xl border border-gray-100 p-5 relative overflow-hidden group hover:border-gray-200 transition-all duration-200 w-full h-full flex flex-col justify-between text-left">
      {/* Subtle corner accent */}
      <div className="absolute top-0 right-0 w-16 h-16 rounded-bl-[40px] bg-gray-50 group-hover:bg-gray-100 transition-colors duration-200" />

      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 bg-gray-50 rounded-xl flex items-center justify-center text-base group-hover:bg-gray-100 transition-colors duration-200 border border-gray-100 text-gray-500">
            {icon}
          </div>
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">{label}</span>
        </div>
        <p className="text-xl font-bold text-gray-800 tracking-tight leading-none">{value}</p>
        {sub && <p className="text-[11px] text-gray-400 mt-1.5">{sub}</p>}
        {change !== undefined && change !== null && (
          <div className="mt-2.5">
            <TrendBadge change={change} />
          </div>
        )}
      </div>

      {rank !== undefined && (
        <div className="absolute bottom-4 right-4 text-[10px] font-bold text-gray-300">
          #{rank}
        </div>
      )}
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ icon, title, badge }: { icon?: React.ReactNode; title: string; badge?: string }) {
  return (
    <div className="flex items-center justify-between mb-4 flex-shrink-0">
      <div className="flex items-center gap-2.5">
        {icon && (
          <div className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center text-sm border border-gray-100 text-gray-600">
            {icon}
          </div>
        )}
        <h2 className="font-bold text-gray-800 text-sm">{title}</h2>
      </div>
      {badge && (
        <span className="text-[10px] text-gray-400 font-medium bg-gray-50 px-2 py-1 rounded-lg border border-gray-100">
          {badge}
        </span>
      )}
    </div>
  );
}

// ─── Top List Item ────────────────────────────────────────────────────────────
function TopListItem({ rank, name, total, maxTotal, extra }: {
  rank: number; name: string; total: number; maxTotal: number; extra?: React.ReactNode;
}) {
  const medals = [
    <Medal key="gold" className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-500 drop-shadow-sm" />,
    <Medal key="silver" className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 drop-shadow-sm" />,
    <Medal key="bronze" className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 drop-shadow-sm" />
  ];
  const pct = Math.round((total / Math.max(maxTotal, 1)) * 100);

  return (
    <div className="group/item py-1">
      <div className="flex items-center gap-2.5 mb-1.5">
        {/* Rank badge */}
        <div className="w-6 flex-shrink-0 flex items-center justify-center">
          {rank <= 3 ? (
            <span className="text-base leading-none">{medals[rank - 1]}</span>
          ) : (
            <span className="text-[10px] font-bold text-gray-400 w-5 h-5 rounded-full bg-gray-50 flex items-center justify-center border border-gray-100">
              {rank}
            </span>
          )}
        </div>

        {/* Name */}
        <p className="text-xs text-gray-700 truncate flex-1 font-medium group-hover/item:text-gray-900 transition">
          {name}
        </p>

        {extra}

        {/* Count */}
        <div className="text-right flex-shrink-0 flex items-center gap-2">
          <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded-md border border-gray-100 font-medium tabular-nums">
            {total}x
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="ml-8.5 h-1 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            background: rank === 1 ? "#374151" : rank === 2 ? "#6B7280" : "#9CA3AF",
          }}
        />
      </div>
    </div>
  );
}

// ─── Transaction Row ──────────────────────────────────────────────────────────
const STATUS_STYLES: Record<string, string> = {
  PAID: "bg-emerald-50 text-emerald-700 border-emerald-100",
  PENDING: "bg-amber-50 text-amber-700 border-amber-100",
  CANCELLED: "bg-rose-50 text-rose-600 border-rose-100",
};

const STATUS_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  PAID: CheckCircle2,
  PENDING: Clock,
  CANCELLED: XCircle,
};

function TransactionRow({ item, onPhotoClick, canSeeFinancials }: {
  item: Transaction; onPhotoClick: (url: string) => void; canSeeFinancials: boolean;
}) {
  const profit = item.other || 0;
  const displayAmount = getDealPrice(item);
  const txDate = new Date(item.paid_at || item.created_at);
  const timeStr = txDate.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  const dateStr = txDate.toLocaleDateString("id-ID", { day: "numeric", month: "short" });

  return (
    <div className="px-4 sm:px-5 py-3 hover:bg-gray-50/70 transition-all duration-200 group">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gray-100 text-gray-700 font-bold border border-gray-200 flex items-center justify-center text-xs flex-shrink-0 group-hover:border-gray-300 transition-colors">
          {getInitials(item.customer_name)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-gray-800 text-xs sm:text-sm">{item.customer_name}</span>
            <span className={`inline-flex items-center gap-1 text-[9px] sm:text-[10px] px-2 py-0.5 rounded-lg border font-medium ${STATUS_STYLES[item.status] || "bg-gray-50 text-gray-600 border-gray-200"}`}>
              {(() => {
                const StatusIco = STATUS_ICON[item.status] || ClipboardList;
                return <StatusIco className="w-2.5 h-2.5 sm:w-3 sm:h-3" />;
              })()}
              <span className="hidden sm:inline">{item.status}</span>
            </span>
            {item.source_platform && (
              <span className="text-[9px] sm:text-[10px] px-2 py-0.5 rounded-lg bg-gray-50 text-gray-400 border border-gray-100 font-medium hidden sm:inline-flex">
                {item.source_platform}
              </span>
            )}
          </div>

          <p className="text-gray-500 text-[10px] sm:text-xs mt-0.5 truncate">
            <span className="font-medium">{item.laptop_name}</span>
            <span className="text-gray-300 mx-1">•</span>
            <span className="font-mono text-[9px] sm:text-[10px] text-gray-400">{item.invoice_number}</span>
          </p>

          {item.sales_name && (
            <p className="text-[9px] sm:text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              {item.sales_name}
            </p>
          )}
        </div>

        {/* Amount */}
        <div className="flex-shrink-0 text-right">
          <p className="text-xs sm:text-sm font-bold text-gray-800 tabular-nums">
            Rp {displayAmount.toLocaleString("id-ID")}
          </p>
          <p className="text-[9px] sm:text-[10px] text-gray-400 mt-0.5">{dateStr} · {timeStr}</p>
          {canSeeFinancials && profit > 0 && (
            <p className="text-[9px] sm:text-[10px] font-semibold text-emerald-600 mt-0.5 tabular-nums">
              +{profit.toLocaleString("id-ID")}
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="ml-11 sm:ml-12 mt-1.5 flex items-center gap-2 flex-wrap">
        {item.source_platform && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-gray-50 text-gray-500 border border-gray-100 font-medium sm:hidden">
            {item.source_platform}
          </span>
        )}

        {item.payment_photo && (
          <button
            onClick={() => onPhotoClick(item.payment_photo!)}
            className="flex items-center gap-1 text-[9px] sm:text-[10px] text-gray-500 hover:text-gray-800 transition-all duration-200 bg-gray-50 hover:bg-gray-100 px-2 py-0.5 rounded-md border border-gray-100"
          >
            <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            className="flex items-center gap-1 text-[9px] sm:text-[10px] text-gray-500 hover:text-gray-800 transition-all duration-200 bg-gray-50 hover:bg-gray-100 px-2 py-0.5 rounded-md border border-gray-100"
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
          className="mt-4 flex items-center justify-center gap-2 text-white/60 hover:text-white text-xs transition-all duration-200"
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

// ─── Refresh Button ───────────────────────────────────────────────────────────
function RefreshButton({ onRefresh, isLoading }: { onRefresh: () => void; isLoading: boolean }) {
  return (
    <button
      onClick={onRefresh}
      disabled={isLoading}
      className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-50 hover:border-gray-300 transition-all bg-white disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
    >
      <svg
        className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`}
        fill="none" stroke="currentColor" viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      <span>{isLoading ? "Memuat..." : "Refresh"}</span>
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
  const [showRevenueModal, setShowRevenueModal] = useState(false);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [showSalesModal, setShowSalesModal] = useState(false);
  const [showLaptopModal, setShowLaptopModal] = useState(false);
  const [showGrossProfitModal, setShowGrossProfitModal] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState(false);

  const canSeeFinancials = userRole ? hasPermission(userRole, PERMISSIONS.VIEW_FINANCIALS) : false;
  const SERVICE_DASHBOARD_ROLES = [
    "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
    "TEKNISI", "KEPALA_TEKNISI", "CUSTOMER_SERVICE",
  ];
  const canSeeServiceDashboard = userRole
    ? SERVICE_DASHBOARD_ROLES.includes(userRole)
    : false;

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
        getAuthUser().then(u => ({ ok: true, json: () => Promise.resolve({ success: true, user: u }) })),
      ]);
      const [statsResult, transResult, meResult] = await Promise.all([
        statsRes.json(), transRes.json(), meRes.json()
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

  useEffect(() => {
    const d = new Date();
    setNow(d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
    fetchAll(false);

    const interval = setInterval(() => { fetchAll(true); }, 60000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // ── Chart data (aligned with Laporan Keuangan monochromatic palette) ─────────
  const weeklyLabels = stats?.weeklyTrend?.map((d) => d.label) ?? [];
  const weeklyRevenue = stats?.weeklyTrend?.map((d) => d.revenue) ?? [];
  const weeklyProfit = stats?.weeklyTrend?.map((d) => d.profit) ?? [];
  const weeklyTrxCount = stats?.weeklyTrend?.map((d) => d.trxCount) ?? [];
  const weeklyLaptopSold = stats?.weeklyTrend?.map((d) => d.laptopSold) ?? [];

  const trendChartData = {
    labels: weeklyLabels,
    datasets: [
      {
        label: "Omzet",
        data: weeklyRevenue,
        borderColor: "#374151",
        backgroundColor: "rgba(55,65,81,0.05)",
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: "#374151",
        pointBorderColor: "#fff",
        pointBorderWidth: 2,
        yAxisID: "yRevenue",
      },
      {
        label: "Profit",
        data: weeklyProfit,
        borderColor: "#9CA3AF",
        backgroundColor: "rgba(156,163,175,0.04)",
        borderWidth: 1.5,
        fill: true,
        tension: 0.4,
        pointRadius: 2.5,
        pointHoverRadius: 5,
        pointBackgroundColor: "#9CA3AF",
        pointBorderColor: "#fff",
        pointBorderWidth: 1.5,
        borderDash: [5, 4],
        yAxisID: "yRevenue",
      },
      {
        label: "Laptop Terjual",
        data: weeklyLaptopSold,
        borderColor: "#6B7280",
        backgroundColor: "rgba(107,114,128,0)",
        borderWidth: 1.5,
        fill: false,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: "#6B7280",
        pointBorderColor: "#fff",
        pointBorderWidth: 1.5,
        borderDash: [3, 3],
        yAxisID: "yUnits",
      },
    ],
  };

  const trxBarData = {
    labels: weeklyLabels,
    datasets: [{
      label: "Transaksi",
      data: weeklyTrxCount,
      backgroundColor: weeklyTrxCount.map((_, i) =>
        i === weeklyTrxCount.length - 1 ? "#374151" : "rgba(55,65,81,0.25)"
      ),
      borderRadius: 6,
      borderSkipped: false as const,
      hoverBackgroundColor: "#111827",
    }],
  };

  const trendOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index" as const, intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#111827",
        titleColor: "#F9FAFB",
        bodyColor: "#D1D5DB",
        padding: 10,
        cornerRadius: 10,
        callbacks: {
          label: (ctx: any) => {
            if (ctx.dataset.label === "Laptop Terjual") {
              return ` Terjual: ${ctx.raw} unit`;
            }
            return `${ctx.dataset.label}: ${fmtShort(ctx.raw as number)}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { font: { size: 10 }, color: "#9ca3af" },
      },
      yRevenue: {
        type: "linear" as const,
        position: "left" as const,
        border: { display: false },
        grid: { color: "rgba(0,0,0,.04)" },
        ticks: {
          font: { size: 10 },
          color: "#9ca3af",
          callback: (v: any) => fmtShort(v),
        },
      },
      yUnits: {
        type: "linear" as const,
        position: "right" as const,
        border: { display: false },
        grid: { drawOnChartArea: false },
        min: 0,
        ticks: {
          font: { size: 10 },
          color: "#9ca3af",
          stepSize: 1,
          callback: (v: any) => `${v}`,
        },
      },
    },
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#111827",
        titleColor: "#F9FAFB",
        bodyColor: "#D1D5DB",
        cornerRadius: 10,
        padding: 10,
        callbacks: { label: (ctx: any) => `${ctx.raw} transaksi` },
      },
    },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 10 }, color: "#9ca3af" } },
      y: { grid: { color: "rgba(0,0,0,.04)" }, border: { display: false }, ticks: { font: { size: 10 }, color: "#9ca3af", stepSize: 1 }, beginAtZero: true },
    },
  };

  return (
    <DashboardLayout>
      <RevenueDetailModal isOpen={showRevenueModal} onClose={() => setShowRevenueModal(false)} />
      <InventoryDetailModal isOpen={showInventoryModal} onClose={() => setShowInventoryModal(false)} />
      <SalesDetailModal isOpen={showSalesModal} onClose={() => setShowSalesModal(false)} />
      <LaptopDetailModal isOpen={showLaptopModal} onClose={() => setShowLaptopModal(false)} />
      <GrossProfitDetailModal isOpen={showGrossProfitModal} onClose={() => setShowGrossProfitModal(false)} />
      <TransactionDetailModal
        isOpen={showTransactionModal}
        onClose={() => setShowTransactionModal(false)}
        canSeeFinancials={canSeeFinancials}
      />
      <style>{`
        .report-stat-card {
          transition: box-shadow 0.15s ease, border-color 0.15s ease;
        }
        .report-stat-card:hover {
          box-shadow: 0 4px 16px rgba(0,0,0,0.06);
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(12px); }
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
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .fade-up { animation: fade-up 0.3s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
        .animate-scaleIn { animation: scaleIn 0.25s ease-out; }
        .animate-slideIn { animation: slideIn 0.3s ease-out; }
        .animate-shimmer { animation: shimmer 1.5s ease-in-out infinite; background-size: 200% 100%; }
        .animate-spin { animation: spin 0.7s linear infinite; }
      `}</style>

      {photoModal && <PhotoModal url={photoModal} onClose={() => setPhotoModal(null)} />}

      <div className="space-y-4 max-w-7xl mx-auto px-4 py-6">

        {/* ── Page Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-4 fade-up">
          <div>
            {isLoading ? (
              <div className="space-y-1.5">
                <Shimmer className="w-32 sm:w-48 h-2 sm:h-3" />
                <Shimmer className="w-24 sm:w-32 h-5 sm:h-7 mt-1" />
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-gray-800 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900 leading-none">Dashboard</h1>
                  <p className="text-xs text-gray-400 mt-1 flex items-center gap-1.5">
                    <span>{now}</span>
                    {lastUpdated && (
                      <>
                        <span>•</span>
                        <span>Terakhir diperbarui {lastUpdated.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>
                      </>
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <RefreshButton onRefresh={() => fetchAll(true)} isLoading={isRefreshing} />
            <a
              href="/payment/create"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gray-800 text-white text-xs font-semibold hover:bg-gray-900 active:scale-[0.98] transition-all shadow-sm whitespace-nowrap"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span className="hidden sm:inline">Buat Transaksi</span>
              <span className="sm:hidden">Buat</span>
            </a>
          </div>
        </div>

        {/* ── Stat Cards Grid ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 fade-up" style={{ animationDelay: "0.05s" }}>
          {isLoading ? (
            Array(4).fill(0).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 animate-pulse">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 bg-gray-100 rounded-xl" />
                  <div className="h-3 bg-gray-100 rounded w-16" />
                </div>
                <div className="h-7 bg-gray-100 rounded w-24 mb-1" />
                <div className="h-2 bg-gray-50 rounded w-12" />
              </div>
            ))
          ) : (
            <>
              {/* Card 1: Omzet (finansial) atau Transaksi (non-finansial) */}
              {canSeeFinancials ? (
                <button
                  onClick={() => setShowRevenueModal(true)}
                  className="w-full h-full block focus:outline-none"
                >
                  <StatCard
                    label="Omzet Hari Ini"
                    value={fmtRupiah(stats?.todayRevenue || 0)}
                    sub={`${stats?.todayTransactions || 0} transaksi selesai`}
                    icon={<Banknote className="w-4 h-4 text-gray-500" />}
                    rank={1}
                    change={stats?.revenueChange}
                  />
                </button>
              ) : (
                <button
                  onClick={() => setShowTransactionModal(true)}
                  className="w-full h-full block focus:outline-none"
                >
                  <StatCard
                    label="Transaksi Hari Ini"
                    value={String(stats?.todayTransactions || 0)}
                    sub={`${stats?.todayLaptopSold || 0} unit terjual`}
                    icon={<ShoppingCart className="w-4 h-4 text-gray-500" />}
                    rank={1}
                    change={stats?.trxChange}
                  />
                </button>
              )}

              {/* Card 2: Gross Profit (finansial only) */}
              {canSeeFinancials && (
                <button
                  onClick={() => setShowGrossProfitModal(true)}
                  className="w-full h-full block focus:outline-none"
                >
                  <StatCard
                    label="Gross Profit Hari Ini"
                    value={fmtRupiah(stats?.todayProfit || 0)}
                    sub={stats?.todayRevenue ? `Margin ${Math.round(((stats.todayProfit || 0) / stats.todayRevenue) * 100)}%` : "Margin keuntungan"}
                    icon={<TrendingUp className="w-4 h-4 text-gray-500" />}
                    change={stats?.profitChange}
                  />
                </button>
              )}

              {/* Card 3: Laptop Ready — selalu tampil */}
              <button
                onClick={() => setShowInventoryModal(true)}
                className="w-full h-full block focus:outline-none"
              >
                <StatCard
                  label="Laptop Ready"
                  value={`${stats?.laptopReady || 0} tipe`}
                  sub={`${stats?.stockTotal || 0} unit total`}
                  icon={<Laptop className="w-4 h-4 text-gray-500" />}
                />
              </button>

              {/* Card 4: Transaksi Hari Ini — selalu tampil */}
              <button
                onClick={() => setShowTransactionModal(true)}
                className="w-full h-full block focus:outline-none"
              >
                <StatCard
                  label="Transaksi Hari Ini"
                  value={`${stats?.todayTransactions || 0} trx`}
                  sub={`${stats?.todayLaptopSold || 0} unit laptop terjual`}
                  icon={<ShoppingCart className="w-4 h-4 text-gray-500" />}
                  change={stats?.trxChange}
                />
              </button>
            </>
          )}
        </div>

        {/* ── Service Dashboard Widget (jika punya akses) ── */}
        {canSeeServiceDashboard && (
          <div className="fade-up" style={{ animationDelay: "0.07s" }}>
            <ServiceDashboardWidget canSeeFinancials={canSeeFinancials} />
          </div>
        )}

        {/* ── Section Label: Analitik Penjualan ── */}
        <div className="flex items-center gap-2 pt-2 fade-up" style={{ animationDelay: "0.08s" }}>
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0" />
          <span className="text-[10px] sm:text-[11px] font-bold text-gray-400 uppercase tracking-wider">Analitik Penjualan</span>
          <div className="flex-1 h-px bg-gray-100" />
        </div>

        {/* ── Analytics Grid ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 fade-up auto-rows-fr" style={{ animationDelay: "0.1s" }}>

          {/* Chart: Trend (finansial) atau Bar transaksi (non-finansial) */}
          {canSeeFinancials ? (
            <div className="sm:col-span-2">
              <div className={`h-full flex flex-col ${CARD}`}>
                <div className="flex items-center justify-between mb-4">
                  <SectionHeader title="Tren 7 Hari Terakhir" badge="7 hari" />
                </div>

                {/* Legend */}
                <div className="flex gap-4 mb-3 flex-wrap -mt-2">
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-medium">
                    <span className="w-4 h-0.5 bg-gray-700 inline-block rounded-full" />
                    <span>Omzet</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-medium">
                    <span className="w-4 h-[1px] inline-block rounded-full" style={{ borderTop: "1.5px dashed #9CA3AF", background: "none" }} />
                    <span>Profit</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-medium">
                    <span className="w-4 h-[1px] inline-block rounded-full" style={{ borderTop: "1.5px dashed #6B7280", background: "none" }} />
                    <span>Laptop Terjual</span>
                  </div>
                  <span className="ml-auto text-[10px] text-gray-400 font-medium hidden sm:inline">
                    axis kanan = unit
                  </span>
                </div>

                {isLoading ? (
                  <Shimmer className="w-full h-36" />
                ) : weeklyRevenue.length > 0 ? (
                  <div style={{ height: 170 }} className="sm:h-[180px]">
                    <Line data={trendChartData} options={trendOptions} />
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="w-14 h-14 mx-auto rounded-2xl bg-gray-50 flex items-center justify-center mb-2 border border-gray-100">
                      <BarChart3 className="w-7 h-7 text-gray-300" />
                    </div>
                    <p className="text-gray-400 text-xs">Belum ada data</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="sm:col-span-2">
              <div className={`h-full flex flex-col ${CARD}`}>
                <SectionHeader title="Transaksi per Hari" badge="7 hari terakhir" />
                {isLoading ? (
                  <Shimmer className="w-full h-36" />
                ) : weeklyTrxCount.length > 0 ? (
                  <div style={{ height: 160 }} className="sm:h-[180px]">
                    <Bar data={trxBarData} options={barOptions} />
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="w-14 h-14 mx-auto rounded-2xl bg-gray-50 flex items-center justify-center mb-2 border border-gray-100">
                      <BarChart3 className="w-7 h-7 text-gray-300" />
                    </div>
                    <p className="text-gray-400 text-xs">Belum ada data</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Top Sales */}
          <div
            onClick={() => setShowSalesModal(true)}
            className="text-left w-full cursor-pointer focus:outline-none"
            role="button"
            tabIndex={0}
          >
            <div className={`h-full flex flex-col ${CARD}`}>
              <SectionHeader
                icon={<Award className="w-4 h-4 text-gray-600" />}
                title="Top Sales"
                badge="hari ini"
              />
              <div className="flex-1 flex flex-col justify-center">
                {isLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Shimmer className="w-6 h-6 rounded-full" />
                        <Shimmer className="flex-1 h-3" />
                        <Shimmer className="w-10 h-4 rounded-md" />
                      </div>
                    ))}
                  </div>
                ) : stats?.topSales?.length ? (
                  <div className="space-y-1">
                    {stats.topSales.map((s, i) => (
                      <TopListItem
                        key={s.name}
                        rank={i + 1}
                        name={s.name}
                        total={s.total}
                        maxTotal={stats.topSales[0]?.total || 1}
                        extra={canSeeFinancials && s.profit > 0 ? (
                          <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded-md border border-gray-100 font-medium flex-shrink-0 tabular-nums">
                            +{fmtShort(s.profit)}
                          </span>
                        ) : undefined}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <div className="w-12 h-12 mx-auto rounded-2xl bg-gray-50 flex items-center justify-center mb-2 border border-gray-100">
                      <Trophy className="w-6 h-6 text-gray-300" />
                    </div>
                    <p className="text-gray-400 text-xs">Belum ada data</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Top Laptop */}
          <div
            onClick={() => setShowLaptopModal(true)}
            className="text-left w-full cursor-pointer focus:outline-none"
            role="button"
            tabIndex={0}
          >
            <div className={`h-full flex flex-col ${CARD}`}>
              <SectionHeader
                icon={<Laptop className="w-4 h-4 text-gray-600" />}
                title="Laptop Terlaris"
                badge="hari ini"
              />
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Shimmer className="w-6 h-6 rounded-full" />
                      <Shimmer className="flex-1 h-3" />
                      <Shimmer className="w-10 h-4 rounded-md" />
                    </div>
                  ))}
                </div>
              ) : stats?.topLaptop?.length ? (
                <div className="space-y-1">
                  {stats.topLaptop.map((item, i) => (
                    <TopListItem
                      key={item.name}
                      rank={i + 1}
                      name={item.name}
                      total={item.total}
                      maxTotal={stats.topLaptop[0]?.total || 1}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-gray-50 flex items-center justify-center mb-2 border border-gray-100">
                    <Laptop className="w-6 h-6 text-gray-300" />
                  </div>
                  <p className="text-gray-400 text-xs">Belum ada data</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Bar Chart (finansial only) ── */}
        {canSeeFinancials && (
          <div className={`${CARD} fade-up`} style={{ animationDelay: "0.13s" }}>
            <SectionHeader title="Transaksi per Hari" badge="7 hari terakhir" />
            {isLoading ? (
              <Shimmer className="w-full h-36" />
            ) : weeklyTrxCount.length > 0 ? (
              <div style={{ height: 160 }} className="sm:h-[180px]">
                <Bar data={trxBarData} options={barOptions} />
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-gray-50 flex items-center justify-center mb-2 border border-gray-100">
                  <BarChart3 className="w-7 h-7 text-gray-300" />
                </div>
                <p className="text-gray-400 text-xs">Belum ada data</p>
              </div>
            )}
          </div>
        )}

        {/* ── Recent Transactions ── */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:border-gray-200 transition-all duration-200 fade-up" style={{ animationDelay: "0.16s" }}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-white">
            <h2 className="font-bold text-gray-800 text-sm flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
              Transaksi Terbaru
            </h2>
            <a href="/dashboard/transactions" className="text-xs font-semibold text-gray-500 hover:text-gray-900 transition-all duration-200 flex items-center gap-1 group">
              Lihat Semua
              <svg className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </a>
          </div>

          <div className="divide-y divide-gray-100">
            {isLoading ? (
              [1, 2, 3].map((i) => (
                <div key={i} className="px-5 py-4 flex items-center gap-3 animate-pulse">
                  <Shimmer className="w-9 h-9 rounded-xl flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Shimmer className="w-36 h-3.5" />
                    <Shimmer className="w-52 h-2.5" />
                  </div>
                  <div className="space-y-1 text-right flex-shrink-0">
                    <Shimmer className="w-20 h-4" />
                    <Shimmer className="w-12 h-2.5" />
                  </div>
                </div>
              ))
            ) : transactions.length === 0 ? (
              <div className="py-16 text-center">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-gray-50 flex items-center justify-center mb-3 border border-gray-100">
                  <Inbox className="w-8 h-8 text-gray-300" />
                </div>
                <p className="text-gray-700 font-semibold text-sm">Belum ada transaksi hari ini</p>
                <p className="text-gray-400 text-xs mt-1">Transaksi akan muncul setelah dibuat</p>
              </div>
            ) : (
              transactions.map((item) => (
                <TransactionRow
                  key={item.id}
                  item={item}
                  onPhotoClick={setPhotoModal}
                  canSeeFinancials={canSeeFinancials}
                />
              ))
            )}
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}