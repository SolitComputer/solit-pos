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
  Trophy, Laptop, Inbox, BarChart3,
  CheckCircle2, Clock, XCircle, ClipboardList,
  Medal, ArrowUp, ArrowDown,
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

const fmtDur = (ms: number) => {
  const h = Math.floor(ms / (1000 * 60 * 60));
  const m = Math.floor((ms / 1000 / 60) % 60);
  if (h > 0) return `${h}j ${m}m`;
  return `${m} mnt`;
};

const fmtShort = (n: number): string => {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}Jt`;
  if (n >= 1_000) return `Rp ${(n / 1_000).toFixed(0)}Rb`;
  return `Rp ${n}`;
};

const fmtRupiah = (n: number): string =>
  "Rp " + (n || 0).toLocaleString("id-ID");

const getDealPrice = (item: Transaction): number =>
  Number(item.deal_price || item.amount || 0);

const getInitials = (name: string) =>
  name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();

// Avatar palette diversified (violet/blue/emerald/amber/rose) — purely decorative,
// same charCodeAt() distribution logic as before.
const AVATAR_COLORS = [
  "from-violet-500 to-purple-600",
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
];
const getAvatarColor = (name: string) =>
  AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];

const formatRole = (role: string) => {
  if (!role) return "Lainnya";
  return role.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
};

// Shared card/section styling tokens (visual only — no logic here)
const CARD = "bg-white rounded-2xl border border-gray-100/80 shadow-sm shadow-gray-200/40 hover:shadow-lg hover:shadow-gray-200/60 transition-all duration-300";

// ─── Shimmer ──────────────────────────────────────────────────────────────────
const Shimmer = ({ className = "", style = {} }: { className?: string; style?: React.CSSProperties }) => (
  <div className={`rounded-lg animate-shimmer bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 bg-[length:200%_100%] ${className}`} style={style} />
);

// ─── Trend Badge ──────────────────────────────────────────────────────────────
function TrendBadge({ change }: { change: number | null }) {
  if (change === null) return null;
  const up = change >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-full tabular-nums shadow-sm ${up ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-600"}`}>
      {up ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />} {Math.abs(change)}%
    </span>
  );
}

// ─── Section Header (reusable, DRY for the repeated card headers) ────────────
function SectionHeader({ icon, title, badge }: { icon?: React.ReactNode; title: string; badge?: string }) {
  return (
    <div className="flex items-center justify-between mb-2 sm:mb-3 flex-shrink-0">
      <h2 className="font-bold text-gray-800 text-xs sm:text-sm flex items-center gap-2">
        {icon ?? <span className="w-1 h-3 sm:h-4 bg-gradient-to-b from-violet-600 to-indigo-600 rounded-full" />}
        {title}
      </h2>
      {badge && (
        <span className="text-[9px] sm:text-[10px] text-gray-500 bg-gray-100 px-1.5 sm:px-2 py-0.5 rounded-full font-semibold">
          {badge}
        </span>
      )}
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
        <img src={url} alt="Bukti Bayar" className="w-full rounded-3xl shadow-2xl border border-white/20" />
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

// Accent tokens — violet = pendapatan, emerald = profit, blue = inventaris, amber = transaksi.
// Konsisten dipakai di stat card, chart, dan section header supaya tiap kategori data
// punya "warna sendiri" yang gampang dikenali sekilas.
const ACCENT = {
  gray: { bg: "from-slate-50 to-slate-100", text: "text-slate-700", bar: "bg-slate-600", border: "border-slate-200" },
  violet: { bg: "from-violet-50 to-purple-100", text: "text-violet-700", bar: "bg-violet-600", border: "border-violet-200" },
  emerald: { bg: "from-emerald-50 to-green-100", text: "text-emerald-700", bar: "bg-emerald-600", border: "border-emerald-200" },
  amber: { bg: "from-amber-50 to-yellow-100", text: "text-amber-700", bar: "bg-amber-600", border: "border-amber-200" },
  blue: { bg: "from-blue-50 to-indigo-100", text: "text-blue-700", bar: "bg-blue-600", border: "border-blue-200" },
} as const;

function StatCard({ label, value, sub, icon, accent = "gray", change }: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent?: keyof typeof ACCENT;
  change?: number | null;
}) {
  const a = ACCENT[accent];
  return (
    <div className="group h-full bg-white rounded-2xl border border-gray-100/80 p-3 sm:p-5 shadow-sm shadow-gray-200/40 hover:shadow-xl hover:shadow-gray-300/30 transition-all duration-300 hover:-translate-y-0.5 relative overflow-hidden flex flex-col justify-between">
      {/* decorative accent glow — signature touch, same accent hue as the card */}
      <div className={`pointer-events-none absolute -top-8 -right-8 w-24 h-24 rounded-full ${a.bar} opacity-[0.08] blur-2xl group-hover:opacity-[0.16] group-hover:scale-110 transition-all duration-500`} />
      <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${a.bar} opacity-0 group-hover:opacity-100 transition-all duration-300`} />
      <div className="relative flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[9px] sm:text-[10px] text-gray-400 font-bold uppercase tracking-wider">{label}</p>
          <p className="font-black mt-1 text-base sm:text-lg lg:text-xl tracking-tight text-gray-900 tabular-nums group-hover:scale-[1.03] transition-transform origin-left break-words">
            {value}
          </p>
          {sub && <p className="text-[9px] sm:text-[10px] text-gray-400 mt-0.5 font-medium truncate">{sub}</p>}
          {change !== undefined && change !== null && (
            <div className="mt-1.5"><TrendBadge change={change} /></div>
          )}
        </div>
        <div className={`w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl flex items-center justify-center flex-shrink-0 border bg-gradient-to-br ${a.bg} ${a.text} ${a.border} group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-sm`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

// ─── Top List Row ─────────────────────────────────────────────────────────────
const RANK_BAR: Record<number, string> = {
  1: "from-amber-400 to-amber-500",
  2: "from-gray-400 to-gray-500",
  3: "from-amber-600 to-amber-700",
};

function TopListItem({ rank, name, total, maxTotal, extra }: {
  rank: number; name: string; total: number; maxTotal: number; extra?: React.ReactNode;
}) {
  const medalColor = ["text-amber-400", "text-gray-400", "text-amber-600"][rank - 1];
  const barGradient = RANK_BAR[rank] ?? "from-gray-500 to-gray-600";
  const pct = Math.round((total / Math.max(maxTotal, 1)) * 100);
  return (
    <div className="group rounded-lg px-1 -mx-1 hover:bg-gray-50/70 transition-colors duration-200">
      <div className="flex items-center gap-2 py-2">
        <div className="w-6 flex-shrink-0 flex justify-center">
          {rank <= 3 ? (
            <Medal className={`w-4 h-4 sm:w-5 sm:h-5 ${medalColor} drop-shadow-sm`} />
          ) : (
            <span className="text-[10px] sm:text-xs font-bold text-gray-400 bg-gray-100 w-5 h-5 rounded-full inline-flex items-center justify-center">{rank}</span>
          )}
        </div>
        <p className="text-[11px] sm:text-xs text-gray-700 truncate flex-1 font-semibold group-hover:text-gray-900 transition">{name}</p>
        {extra}
        <span className="text-[10px] sm:text-[11px] font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0 tabular-nums">{total}x</span>
      </div>
      <div className="ml-7 mt-0.5 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full bg-gradient-to-r ${barGradient} rounded-full transition-all duration-700 ease-out group-hover:opacity-90`}
          style={{ width: `${pct}%` }}
        />
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
    <div className="px-3 sm:px-5 py-3 hover:bg-gray-50/80 transition-all duration-200 group">
      <div className="flex items-start gap-2 sm:gap-3">
        {/* Avatar */}
        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br ${getAvatarColor(item.customer_name)} flex items-center justify-center text-[10px] sm:text-xs font-bold flex-shrink-0 shadow-md ring-2 ring-white text-white group-hover:scale-105 transition-transform duration-300`}>
          {getInitials(item.customer_name)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-gray-800 text-xs sm:text-sm">{item.customer_name}</span>
            <span className={`inline-flex items-center gap-0.5 sm:gap-1 text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded-full border font-semibold shadow-sm ${STATUS_STYLES[item.status] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
              {(() => {
                const StatusIco = STATUS_ICON[item.status] || ClipboardList;
                return <StatusIco className="w-2.5 h-2.5 sm:w-3 sm:h-3" />;
              })()}
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
      <div className="ml-10 sm:ml-12 mt-1.5 flex items-center gap-2 flex-wrap">
        {item.source_platform && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium sm:hidden">
            {item.source_platform}
          </span>
        )}

        {item.payment_photo && (
          <button
            onClick={() => onPhotoClick(item.payment_photo!)}
            className="flex items-center gap-1 text-[9px] sm:text-[10px] text-gray-500 hover:text-violet-700 transition-all duration-200 group/btn"
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
            className="flex items-center gap-1 text-[9px] sm:text-[10px] text-gray-500 hover:text-violet-700 transition-all duration-200"
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

// ─── Refresh Button ───────────────────────────────────────────────────────────
function RefreshButton({ onRefresh, isLoading }: { onRefresh: () => void; isLoading: boolean }) {
  return (
    <button
      onClick={onRefresh}
      disabled={isLoading}
      className="relative flex items-center gap-1 sm:gap-1.5 text-[11px] sm:text-xs text-gray-500 hover:text-violet-700 border border-gray-200 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl transition-all duration-200 hover:bg-violet-50/60 hover:border-violet-200 group disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <svg
        className={`w-3 h-3 sm:w-3.5 sm:h-3.5 transition-all duration-500 ${isLoading ? "animate-spin" : "group-hover:rotate-180"}`}
        fill="none" stroke="currentColor" viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      <span className="hidden sm:inline">{isLoading ? "Memuat..." : "Refresh"}</span>
      <span className="sm:hidden">{isLoading ? "..." : "↻"}</span>
      {isLoading && <span className="absolute inset-0 rounded-xl bg-violet-50/50 animate-pulse" />}
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
        fetch("/api/auth/me"),
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

  // ── Chart data ─────────────────────────────────────────────────────────────
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
        borderColor: "#7C3AED",
        backgroundColor: (ctx: any) => {
          const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 160);
          gradient.addColorStop(0, "rgba(124,58,237,0.14)");
          gradient.addColorStop(1, "rgba(124,58,237,0)");
          return gradient;
        },
        borderWidth: 2.5,
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: "#7C3AED",
        pointBorderColor: "#fff",
        pointBorderWidth: 2,
        yAxisID: "yRevenue",
      },
      {
        label: "Profit",
        data: weeklyProfit,
        borderColor: "#10B981",
        backgroundColor: (ctx: any) => {
          const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 160);
          gradient.addColorStop(0, "rgba(16,185,129,0.08)");
          gradient.addColorStop(1, "rgba(16,185,129,0)");
          return gradient;
        },
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 2.5,
        pointHoverRadius: 5,
        pointBackgroundColor: "#10B981",
        pointBorderColor: "#fff",
        pointBorderWidth: 1.5,
        borderDash: [6, 4],
        yAxisID: "yRevenue",
      },
      {
        label: "Laptop Terjual",
        data: weeklyLaptopSold,
        borderColor: "#6366F1",
        backgroundColor: "rgba(99,102,241,0)",
        borderWidth: 2,
        fill: false,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 7,
        pointBackgroundColor: "#6366F1",
        pointBorderColor: "#fff",
        pointBorderWidth: 2,
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
        i === weeklyTrxCount.length - 1 ? "#D97706" : "rgba(217,119,6,0.2)"
      ),
      borderRadius: 8,
      borderSkipped: false as const,
      hoverBackgroundColor: "rgba(217,119,6,0.35)",
    }],
  };

  const chartBaseOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
  } as const;

  const trendOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index" as const, intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "rgba(0,0,0,0.85)",
        titleColor: "#fff",
        bodyColor: "#e5e7eb",
        padding: 8,
        cornerRadius: 8,
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
        ticks: { font: { size: 9 }, color: "#9ca3af" },
      },
      yRevenue: {
        type: "linear" as const,
        position: "left" as const,
        grid: { color: "rgba(0,0,0,.04)" },
        ticks: {
          font: { size: 9 },
          color: "#9ca3af",
          callback: (v: any) => fmtShort(v),
        },
      },
      yUnits: {
        type: "linear" as const,
        position: "right" as const,
        grid: { drawOnChartArea: false },
        min: 0,
        ticks: {
          font: { size: 9 },
          color: "#6366F1",
          stepSize: 1,
          callback: (v: any) => `${v}`,
        },
      },
    },
  };

  const barOptions = {
    ...chartBaseOptions,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "rgba(0,0,0,0.85)", cornerRadius: 8,
        callbacks: { label: (ctx: any) => `${ctx.raw} transaksi` },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 9 }, color: "#9ca3af" } },
      y: { grid: { color: "rgba(0,0,0,.04)" }, ticks: { font: { size: 9 }, color: "#9ca3af", stepSize: 1 } },
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
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
            .fade-up { animation: fade-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; }
            .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
            .animate-scaleIn { animation: scaleIn 0.25s ease-out; }
            .animate-slideIn { animation: slideIn 0.3s ease-out; }
            .animate-shimmer { animation: shimmer 1.5s ease-in-out infinite; background-size: 200% 100%; }
            .animate-spin { animation: spin 0.6s linear infinite; }
          `}</style>

      {photoModal && <PhotoModal url={photoModal} onClose={() => setPhotoModal(null)} />}

      <div className="space-y-4 sm:space-y-5 max-w-7xl mx-auto px-3 sm:px-4 relative">
        {/* subtle ambient glow behind the header — now tinted with the brand violet accent */}
        <div className="pointer-events-none absolute -top-6 left-0 right-0 h-56 -z-10 bg-[radial-gradient(ellipse_60%_100%_at_50%_0%,rgba(124,58,237,0.06),transparent)]" />

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
                  <div className="w-1 h-5 sm:h-7 bg-gradient-to-b from-violet-600 to-indigo-700 rounded-full" />
                  <p className="text-[10px] sm:text-xs text-gray-400 font-medium">{now}</p>
                </div>
                <h1 className="text-xl sm:text-2xl md:text-3xl font-black bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent mt-0.5 tracking-tight">
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
            <RefreshButton onRefresh={() => fetchAll(true)} isLoading={isRefreshing} />
            <a
              href="/payment/create"
              className="inline-flex items-center gap-1 sm:gap-1.5 bg-gradient-to-r from-violet-600 to-indigo-700 text-white text-[11px] sm:text-sm font-semibold px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl hover:from-violet-700 hover:to-indigo-800 transition-all duration-200 active:scale-95 shadow-md hover:shadow-lg hover:shadow-violet-900/25 whitespace-nowrap"
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3.5 fade-up" style={{ animationDelay: "0.05s" }}>
          {isLoading ? (
            Array(4).fill(0).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-3 sm:p-4 shadow-sm space-y-2">
                <Shimmer className="w-16 sm:w-20 h-2 sm:h-3" />
                <Shimmer className="w-24 sm:w-32 h-5 sm:h-6" />
                <Shimmer className="w-20 sm:w-24 h-2 sm:h-3" />
              </div>
            ))
          ) : (
            <>
              {/* Card 1: Omzet (finansial) atau Transaksi (non-finansial) */}
              {canSeeFinancials ? (
                <button
                  onClick={() => setShowRevenueModal(true)}
                  className="text-left hover:scale-105 transition-transform duration-300 active:scale-95 w-full h-full block"
                >
                  <StatCard
                    label="Omzet Hari Ini"
                    value={fmtRupiah(stats?.todayRevenue || 0)}
                    sub={`${stats?.todayTransactions || 0} transaksi selesai`}
                    icon={<OmzetIcon />}
                    accent="violet"
                    change={stats?.revenueChange}
                  />
                </button>
              ) : (
                // Non-finansial: card transaksi di posisi 1, bisa diklik buka modal
                <button
                  onClick={() => setShowTransactionModal(true)}
                  className="w-full h-full text-left hover:scale-105 transition-transform duration-300 active:scale-95 block"
                >
                  <StatCard
                    label="Transaksi Hari Ini"
                    value={String(stats?.todayTransactions || 0)}
                    sub={`${stats?.todayLaptopSold || 0} unit terjual`}
                    icon={<TrxIcon />}
                    accent="violet"
                    change={stats?.trxChange}
                  />
                </button>
              )}

              {/* Card 2: Gross Profit (finansial only) */}
              {canSeeFinancials && (
                <button
                  onClick={() => setShowGrossProfitModal(true)}
                  className="text-left hover:scale-105 transition-transform duration-300 active:scale-95 w-full h-full block"
                >
                  <StatCard
                    label="Gross Profit Hari Ini"
                    value={fmtRupiah(stats?.todayProfit || 0)}
                    sub="margin keuntungan"
                    icon={<ProfitIcon />}
                    accent="emerald"
                    change={stats?.profitChange}
                  />
                </button>
              )}

              {/* Card 3: Laptop Ready — selalu tampil */}
              <button
                onClick={() => setShowInventoryModal(true)}
                className="w-full h-full text-left hover:scale-105 transition-transform duration-300 active:scale-95 block"
              >
                <StatCard
                  label="Laptop Ready"
                  value={`${stats?.laptopReady || 0} tipe`}
                  sub={`${stats?.stockTotal || 0} unit total`}
                  icon={<LaptopIcon />}
                  accent="blue"
                />
              </button>

              {/* Card 4: Transaksi Hari Ini — selalu tampil, buka TransactionDetailModal */}
              <button
                onClick={() => setShowTransactionModal(true)}
                className="w-full h-full text-left hover:scale-105 transition-transform duration-300 active:scale-95 block"
              >
                <StatCard
                  label="Transaksi Hari Ini"
                  value={String(stats?.todayTransactions || 0)}
                  sub={`${stats?.todayLaptopSold || 0} unit laptop terjual`}
                  icon={<TrxIcon />}
                  accent="amber"
                  change={stats?.trxChange}
                />
              </button>
            </>
          )}
        </div>

        {canSeeServiceDashboard && (
          <div className="fade-up" style={{ animationDelay: "0.07s" }}>
            <ServiceDashboardWidget canSeeFinancials={canSeeFinancials} />
          </div>
        )}


        {/* ── Section Label ── */}
        <div className="flex items-center gap-2 fade-up" style={{ animationDelay: "0.08s" }}>
          <LiveDot />
          <span className="text-[10px] sm:text-[11px] font-bold text-gray-400 uppercase tracking-wider">Analitik Penjualan</span>
          <div className="flex-1 h-px bg-gradient-to-r from-gray-200 to-transparent" />
        </div>

        {/* ── Analytics Grid ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 fade-up auto-rows-fr" style={{ animationDelay: "0.1s" }}>

          {/* Chart: Trend (finansial) atau Bar transaksi (non-finansial) */}
          {canSeeFinancials ? (
            <div className="sm:col-span-2">
              <div className={`h-full flex flex-col ${CARD} p-3 sm:p-5`}>
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <SectionHeader title="Tren 7 Hari Terakhir" badge="7 hari" />
                </div>

                {/* Legend */}
                <div className="flex gap-3 sm:gap-4 mb-2 sm:mb-3 flex-wrap -mt-2">
                  {[
                    { color: "bg-violet-600", label: "Omzet", solid: true },
                    { color: "bg-emerald-500", label: "Profit", solid: false },
                    { color: "bg-indigo-500", label: "Laptop Terjual", solid: false },
                  ].map(({ color, label, solid }) => (
                    <div key={label} className="flex items-center gap-1 sm:gap-1.5 text-[9px] sm:text-[10px] text-gray-500">
                      <span className={`w-4 sm:w-5 h-0.5 inline-block rounded-full ${color}`}
                        style={!solid ? { borderTop: "2px dashed", background: "none" } : {}}
                      />
                      <span className={label === "Laptop Terjual" ? "text-indigo-500" : ""}>{label}</span>
                    </div>
                  ))}
                  <span className="ml-auto text-[9px] text-indigo-400 hidden sm:inline">
                    axis kanan = unit
                  </span>
                </div>

                {isLoading ? (
                  <Shimmer className="w-full h-28 sm:h-36" />
                ) : weeklyRevenue.length > 0 ? (
                  <div style={{ height: 150 }} className="sm:h-[170px]">
                    <Line data={trendChartData} options={trendOptions} />
                  </div>
                ) : (
                  <div className="text-center py-8 sm:py-12">
                    <div className="w-14 h-14 mx-auto rounded-2xl bg-gray-50 flex items-center justify-center mb-2">
                      <BarChart3 className="w-7 h-7 text-gray-300" />
                    </div>
                    <p className="text-gray-400 text-[11px] sm:text-sm">Belum ada data</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="sm:col-span-2">
              <div className={`h-full flex flex-col ${CARD} p-3 sm:p-5`}>
                <SectionHeader title="Transaksi per Hari" badge="7 hari terakhir" />
                {isLoading ? (
                  <Shimmer className="w-full h-28 sm:h-36" />
                ) : weeklyTrxCount.length > 0 ? (
                  <div style={{ height: 130 }} className="sm:h-[160px]">
                    <Bar data={trxBarData} options={barOptions} />
                  </div>
                ) : (
                  <div className="text-center py-8 sm:py-12">
                    <div className="w-14 h-14 mx-auto rounded-2xl bg-gray-50 flex items-center justify-center mb-2">
                      <BarChart3 className="w-7 h-7 text-gray-300" />
                    </div>
                    <p className="text-gray-400 text-[11px] sm:text-sm">Belum ada data</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Top Sales */}
          <div
            onClick={() => setShowSalesModal(true)}
            className="text-left w-full hover:shadow-lg transition-shadow duration-300 active:scale-[99%] cursor-pointer"
            role="button"
            tabIndex={0}
          >
            <div className={`h-full flex flex-col ${CARD} p-3 sm:p-5`}>
              <SectionHeader
                icon={<Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" />}
                title="Top Sales"
                badge="hari ini"
              />
              <div className="flex-1 flex flex-col justify-center">
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
                          <span className="text-[9px] sm:text-[10px] text-emerald-600 font-semibold flex-shrink-0 tabular-nums">
                            +{fmtShort(s.profit)}
                          </span>
                        ) : undefined}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 sm:py-8">
                    <div className="w-14 h-14 mx-auto rounded-2xl bg-gray-50 flex items-center justify-center mb-2">
                      <Trophy className="w-7 h-7 text-gray-300" />
                    </div>
                    <p className="text-gray-400 text-[11px] sm:text-sm">Belum ada data</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Top Laptop */}
          <div
            onClick={() => setShowLaptopModal(true)}
            className="text-left w-full hover:shadow-lg transition-shadow duration-300 active:scale-[99%] cursor-pointer"
            role="button"
            tabIndex={0}
          >
            <div className={`h-full flex flex-col ${CARD} p-3 sm:p-5`}>
              <SectionHeader
                icon={<Laptop className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />}
                title="Laptop Terlaris"
                badge="hari ini"
              />
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
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-gray-50 flex items-center justify-center mb-2">
                    <Laptop className="w-7 h-7 text-gray-300" />
                  </div>
                  <p className="text-gray-400 text-[11px] sm:text-sm">Belum ada data</p>
                </div>
              )}
            </div>
          </div>
        </div>



        {/* ── Bar Chart (finansial only) ── */}
        {canSeeFinancials && (
          <div className={`${CARD} p-3 sm:p-5 fade-up`} style={{ animationDelay: "0.13s" }}>
            <SectionHeader title="Transaksi per Hari" badge="7 hari terakhir" />
            {isLoading ? <Shimmer className="w-full h-28 sm:h-36" /> : weeklyTrxCount.length > 0 ? (
              <div style={{ height: 130 }} className="sm:h-[160px]"><Bar data={trxBarData} options={barOptions} /></div>
            ) : (
              <div className="text-center py-8 sm:py-12">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-gray-50 flex items-center justify-center mb-2">
                  <BarChart3 className="w-7 h-7 text-gray-300" />
                </div>
                <p className="text-gray-400 text-[11px] sm:text-sm">Belum ada data</p>
              </div>
            )}
          </div>
        )}

        {/* ── Recent Transactions ── */}
        <div className={`${CARD} overflow-hidden fade-up`} style={{ animationDelay: "0.16s" }}>
          <div className="flex items-center justify-between px-3 sm:px-5 py-3 sm:py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
            <h2 className="font-bold text-gray-800 text-xs sm:text-sm flex items-center gap-2">
              <LiveDot />
              Transaksi Terbaru
            </h2>
            <a href="/dashboard/transactions" className="text-[10px] sm:text-xs font-semibold text-gray-500 hover:text-violet-700 transition-all duration-200 flex items-center gap-1 group">
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
                <div className="w-16 h-16 mx-auto rounded-2xl bg-gray-50 flex items-center justify-center mb-3">
                  <Inbox className="w-8 h-8 text-gray-300" />
                </div>
                <p className="text-gray-500 text-[11px] sm:text-sm font-medium">Belum ada transaksi hari ini</p>
                <p className="text-gray-400 text-[9px] sm:text-xs mt-1">Transaksi akan muncul setelah dibuat</p>
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