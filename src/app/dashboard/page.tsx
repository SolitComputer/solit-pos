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
  ArrowUp, ArrowDown, Plus, RefreshCw,
  ChevronRight, ImageIcon, MapPin, User, Sparkles,
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

// Palet brand Solit03 (disampling dari landing page):
// biru #2563EB · navy #0F172A · tint #EFF6FF · bg #F8FAFC.
// Emerald hanya untuk makna data positif (profit / PAID / tren naik).
const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-[#0F172A] text-white",
  "bg-slate-100 text-slate-600",
  "bg-blue-600 text-white",
];
const getAvatarColor = (name: string) =>
  AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];

const formatRole = (role: string) => {
  if (!role) return "Lainnya";
  return role.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
};

// Warna brand — persis dari referensi, jangan tambah di luar ini.
const BLUE = "#2563EB";
const NAVY = "#0F172A";
const BG_PAGE = "#F8FAFC";
// Hero: navy dengan glow biru dari atas, meniru hero landing page.
const HERO_BG = `radial-gradient(ellipse 90% 130% at 50% -30%, rgba(37,99,235,0.55) 0%, rgba(37,99,235,0.18) 45%, transparent 75%), ${NAVY}`;
// Starfield halus (titik putih kecil, repeat)
const STARFIELD =
  "radial-gradient(1px 1px at 22% 30%, rgba(255,255,255,0.55), transparent 55%)," +
  "radial-gradient(1px 1px at 68% 18%, rgba(255,255,255,0.4), transparent 55%)," +
  "radial-gradient(1.5px 1.5px at 84% 62%, rgba(255,255,255,0.35), transparent 55%)," +
  "radial-gradient(1px 1px at 42% 74%, rgba(255,255,255,0.3), transparent 55%)," +
  "radial-gradient(1px 1px at 8% 58%, rgba(255,255,255,0.35), transparent 55%)";

// Card token — putih flat di atas #F8FAFC, border slate tipis.
const CARD = "bg-white rounded-2xl border border-slate-200/60 shadow-[0_1px_2px_rgba(15,23,42,0.04)]";

// ─── Shimmer ──────────────────────────────────────────────────────────────────
const Shimmer = ({ className = "", style = {} }: { className?: string; style?: React.CSSProperties }) => (
  <div className={`rounded-lg animate-shimmer bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100 bg-[length:200%_100%] ${className}`} style={style} />
);

// Shimmer versi panel gelap (dipakai di hero)
const ShimmerInk = ({ className = "" }: { className?: string }) => (
  <div className={`rounded-lg bg-white/10 animate-pulse ${className}`} />
);

// ─── Trend Badge ──────────────────────────────────────────────────────────────
function TrendBadge({ change }: { change: number | null }) {
  if (change === null) return null;
  const up = change >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-black px-1.5 py-0.5 rounded-md tabular-nums ${up ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
      {up ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
      {Math.abs(change)}%
    </span>
  );
}

// ─── Section Label — eyebrow pill + judul two-tone (khas landing Solit03) ────
function SectionLabel({ eyebrow, title, accent }: { eyebrow: string; title: string; accent: string }) {
  return (
    <div>
      <span className="inline-flex items-center gap-1.5 text-[9px] sm:text-[10px] font-bold text-blue-600 uppercase tracking-[0.2em] bg-[#EFF6FF] border border-blue-100 px-3 py-1 rounded-full">
        <Sparkles className="w-2.5 h-2.5" />
        {eyebrow}
      </span>
      <div className="flex items-center gap-3 mt-2">
        <h2 className="font-black text-lg sm:text-xl tracking-tight text-slate-900 leading-none">
          {title} <span className="text-blue-600">{accent}</span>
        </h2>
        <div className="flex-1 h-px bg-slate-200/80" />
      </div>
    </div>
  );
}

// ─── Card Header ──────────────────────────────────────────────────────────────
function SectionHeader({ icon, title, badge }: { icon?: React.ReactNode; title: string; badge?: string }) {
  return (
    <div className="flex items-center justify-between mb-3 sm:mb-4 flex-shrink-0">
      <h2 className="font-black text-slate-900 text-[13px] sm:text-sm flex items-center gap-2 tracking-tight">
        {icon}
        {title}
      </h2>
      {badge && (
        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.15em] bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-full">
          {badge}
        </span>
      )}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ icon: Icon, label, sub }: { icon: React.ComponentType<{ className?: string }>; label: string; sub?: string }) {
  return (
    <div className="text-center py-8 sm:py-10">
      <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-2.5">
        <Icon className="w-5 h-5 text-slate-300" />
      </div>
      <p className="text-slate-500 text-xs sm:text-[13px] font-medium">{label}</p>
      {sub && <p className="text-slate-400 text-[10px] sm:text-xs mt-1">{sub}</p>}
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
    <div className="fixed inset-0 z-50 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn" style={{ background: "rgba(15,23,42,0.92)" }} onClick={onClose}>
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

// Accent tokens — biru = omzet, emerald = profit, navy = transaksi, slate = inventaris.
const ACCENT = {
  slate: { chip: "bg-slate-50 text-slate-500 ring-slate-100" },
  blue: { chip: "bg-[#EFF6FF] text-blue-600 ring-blue-100" },
  emerald: { chip: "bg-emerald-50 text-emerald-600 ring-emerald-100" },
  navy: { chip: "bg-[#0F172A] text-white ring-slate-200" },
} as const;

function StatCard({ label, value, sub, icon, accent = "slate", change }: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent?: keyof typeof ACCENT;
  change?: number | null;
}) {
  const a = ACCENT[accent];
  return (
    <div className={`group h-full ${CARD} p-3.5 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)] hover:border-blue-200`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[9px] sm:text-[10px] text-slate-400 font-bold uppercase tracking-[0.18em] truncate">{label}</p>
          <p className="font-black mt-1.5 sm:mt-2 text-lg sm:text-2xl tracking-tight text-slate-900 tabular-nums break-words leading-none">
            {value}
          </p>
          <div className="mt-1.5 sm:mt-2 flex items-center gap-1.5 flex-wrap">
            {change !== undefined && change !== null && <TrendBadge change={change} />}
            {sub && <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">{sub}</p>}
          </div>
        </div>
        <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 ring-1 ${a.chip} transition-transform duration-200 group-hover:scale-105`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

// ─── Top List Row ─────────────────────────────────────────────────────────────
function TopListItem({ rank, name, total, maxTotal, extra, barClass = "bg-blue-600" }: {
  rank: number; name: string; total: number; maxTotal: number; extra?: React.ReactNode; barClass?: string;
}) {
  const pct = Math.round((total / Math.max(maxTotal, 1)) * 100);
  const chipClass =
    rank === 1 ? "bg-[#0F172A] text-white" :
    rank === 2 ? "bg-blue-100 text-blue-700" :
    rank === 3 ? "bg-[#EFF6FF] text-blue-500" :
    "bg-slate-100 text-slate-400";
  return (
    <div className="group rounded-lg px-1.5 -mx-1.5 py-1.5 hover:bg-slate-50 transition-colors duration-150">
      <div className="flex items-center gap-2.5">
        <span className={`w-5 h-5 rounded-md text-[10px] font-black inline-flex items-center justify-center flex-shrink-0 tabular-nums ${chipClass}`}>
          {rank}
        </span>
        <p className="text-xs sm:text-[13px] text-slate-700 truncate flex-1 font-semibold group-hover:text-slate-900 transition-colors">{name}</p>
        {extra}
        <span className="text-[10px] sm:text-[11px] font-black text-slate-500 flex-shrink-0 tabular-nums">{total}x</span>
      </div>
      <div className="ml-[30px] mt-1.5 h-1 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${barClass} rounded-full transition-all duration-700 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Transaction Row ──────────────────────────────────────────────────────────
const STATUS_STYLES: Record<string, string> = {
  PAID: "bg-emerald-50 text-emerald-600",
  PENDING: "bg-[#EFF6FF] text-blue-600",
  CANCELLED: "bg-slate-100 text-slate-500",
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
  const StatusIco = STATUS_ICON[item.status] || ClipboardList;

  return (
    <div className="px-3.5 sm:px-5 py-3 sm:py-3.5 hover:bg-slate-50/70 transition-colors duration-150 group">
      <div className="flex items-start gap-2.5 sm:gap-3">
        {/* Avatar */}
        <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full ${getAvatarColor(item.customer_name)} flex items-center justify-center text-[10px] sm:text-[11px] font-black flex-shrink-0`}>
          {getInitials(item.customer_name)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-slate-900 text-xs sm:text-[13px]">{item.customer_name}</span>
            <span className={`inline-flex items-center gap-1 text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded-md font-bold ${STATUS_STYLES[item.status] || "bg-slate-100 text-slate-500"}`}>
              <StatusIco className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
              <span className="hidden sm:inline">{item.status}</span>
            </span>
            {item.source_platform && (
              <span className="text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded-md bg-slate-50 border border-slate-100 text-slate-400 font-medium hidden sm:inline-flex">
                {item.source_platform}
              </span>
            )}
          </div>

          <p className="text-slate-500 text-[10px] sm:text-xs mt-0.5 truncate">
            {item.laptop_name}
            <span className="text-slate-300 mx-1">·</span>
            <span className="font-mono text-[9px] sm:text-[10px] text-slate-400">{item.invoice_number}</span>
          </p>

          {item.sales_name && (
            <p className="text-[9px] sm:text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
              <User className="w-2.5 h-2.5" />
              {item.sales_name}
            </p>
          )}
        </div>

        {/* Amount */}
        <div className="flex-shrink-0 text-right">
          <p className="text-xs sm:text-[13px] font-black text-slate-900 tabular-nums">
            Rp {displayAmount.toLocaleString("id-ID")}
          </p>
          <p className="text-[9px] sm:text-[10px] text-slate-400 mt-0.5">{dateStr} · {timeStr}</p>
          {canSeeFinancials && profit > 0 && (
            <p className="text-[9px] sm:text-[10px] font-bold text-emerald-600 mt-0.5 tabular-nums">
              +{profit.toLocaleString("id-ID")}
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      {(item.payment_photo || (item.latitude && item.longitude) || item.source_platform) && (
        <div className="ml-[42px] sm:ml-12 mt-1.5 flex items-center gap-3 flex-wrap">
          {item.source_platform && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-slate-50 border border-slate-100 text-slate-400 font-medium sm:hidden">
              {item.source_platform}
            </span>
          )}

          {item.payment_photo && (
            <button
              onClick={() => onPhotoClick(item.payment_photo!)}
              className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-blue-600 transition-colors duration-150"
            >
              <ImageIcon className="w-3 h-3" />
              Bukti
            </button>
          )}

          {item.latitude && item.longitude && (
            <a
              href={`https://maps.google.com/?q=${item.latitude},${item.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-blue-600 transition-colors duration-150"
            >
              <MapPin className="w-3 h-3" />
              Maps
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Live Dot ─────────────────────────────────────────────────────────────────
const LiveDot = () => (
  <span className="relative inline-flex w-2 h-2 flex-shrink-0">
    <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
    <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-500" />
  </span>
);

// ─── Refresh Button (versi hero gelap) ────────────────────────────────────────
function RefreshButton({ onRefresh, isLoading }: { onRefresh: () => void; isLoading: boolean }) {
  return (
    <button
      onClick={onRefresh}
      disabled={isLoading}
      className="flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold text-white/60 hover:text-white border border-white/15 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl transition-colors duration-150 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <RefreshCw className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${isLoading ? "animate-spin" : ""}`} />
      <span className="hidden sm:inline">{isLoading ? "Memuat..." : "Refresh"}</span>
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
        borderColor: "#2563EB",
        backgroundColor: (ctx: any) => {
          const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 160);
          gradient.addColorStop(0, "rgba(37,99,235,0.14)");
          gradient.addColorStop(1, "rgba(37,99,235,0)");
          return gradient;
        },
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointBackgroundColor: "#2563EB",
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
        pointRadius: 0,
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
        borderColor: "#60A5FA",
        backgroundColor: "rgba(96,165,250,0)",
        borderWidth: 2,
        fill: false,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: "#60A5FA",
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
        i === weeklyTrxCount.length - 1 ? "#2563EB" : "rgba(37,99,235,0.16)"
      ),
      borderRadius: 6,
      borderSkipped: false as const,
      hoverBackgroundColor: "rgba(37,99,235,0.4)",
      maxBarThickness: 28,
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
        backgroundColor: "rgba(15,23,42,0.94)",
        titleColor: "#fff",
        bodyColor: "#e5e7eb",
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
        ticks: { font: { size: 9 }, color: "#94a3b8" },
      },
      yRevenue: {
        type: "linear" as const,
        position: "left" as const,
        grid: { color: "rgba(15,23,42,.04)" },
        border: { display: false },
        ticks: {
          font: { size: 9 },
          color: "#94a3b8",
          callback: (v: any) => fmtShort(v),
        },
      },
      yUnits: {
        type: "linear" as const,
        position: "right" as const,
        grid: { drawOnChartArea: false },
        border: { display: false },
        min: 0,
        ticks: {
          font: { size: 9 },
          color: "#60A5FA",
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
        backgroundColor: "rgba(15,23,42,0.94)", cornerRadius: 10, padding: 10,
        callbacks: { label: (ctx: any) => `${ctx.raw} transaksi` },
      },
    },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 9 }, color: "#94a3b8" } },
      y: { grid: { color: "rgba(15,23,42,.04)" }, border: { display: false }, ticks: { font: { size: 9 }, color: "#94a3b8", stepSize: 1 } },
    },
  };

  // ── Reusable chart bodies ──────────────────────────────────────────────────
  const trendChartBody = isLoading ? (
    <Shimmer className="w-full h-28 sm:h-36" />
  ) : weeklyRevenue.length > 0 ? (
    <div style={{ height: 150 }} className="sm:h-[170px]">
      <Line data={trendChartData} options={trendOptions} />
    </div>
  ) : (
    <EmptyState icon={BarChart3} label="Belum ada data" />
  );

  const trxBarBody = isLoading ? (
    <Shimmer className="w-full h-28 sm:h-36" />
  ) : weeklyTrxCount.length > 0 ? (
    <div style={{ height: 150 }} className="sm:h-[170px]">
      <Bar data={trxBarData} options={barOptions} />
    </div>
  ) : (
    <EmptyState icon={BarChart3} label="Belum ada data" />
  );

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
              from { opacity: 0; transform: translateY(14px); }
              to   { opacity: 1; transform: translateY(0); }
            }
            @keyframes fadeIn {
              from { opacity: 0; transform: scale(0.97); }
              to { opacity: 1; transform: scale(1); }
            }
            @keyframes scaleIn {
              from { opacity: 0; transform: scale(0.95); }
              to { opacity: 1; transform: scale(1); }
            }
            @keyframes slideIn {
              from { opacity: 0; transform: translateX(-8px); }
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
            .animate-fadeIn { animation: fadeIn 0.25s ease-out; }
            .animate-scaleIn { animation: scaleIn 0.2s ease-out; }
            .animate-slideIn { animation: slideIn 0.25s ease-out; }
            .animate-shimmer { animation: shimmer 1.5s ease-in-out infinite; background-size: 200% 100%; }
            .animate-spin { animation: spin 0.8s linear infinite; }
          `}</style>

      {photoModal && <PhotoModal url={photoModal} onClose={() => setPhotoModal(null)} />}

      {/* Background halaman — #F8FAFC, sama dengan landing */}
      <div className="fixed inset-0 -z-10" style={{ background: BG_PAGE }} />

      <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto px-3 sm:px-4 pb-8">

        {/* ══ SIGNATURE: Hero deck navy + glow biru + starfield (meniru hero landing) ══ */}
        <div className="fade-up">
          <div className="relative overflow-hidden rounded-2xl" style={{ background: HERO_BG }}>
            {/* starfield halus */}
            <div
              className="pointer-events-none absolute inset-0 opacity-70"
              style={{ backgroundImage: STARFIELD, backgroundSize: "260px 260px" }}
            />

            <div className="relative px-4 sm:px-8 pt-5 sm:pt-8 pb-16 sm:pb-24">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  {isLoading ? (
                    <div className="space-y-2">
                      <ShimmerInk className="w-40 sm:w-56 h-5 rounded-full" />
                      <ShimmerInk className="w-48 sm:w-64 h-8 sm:h-10 mt-2" />
                      <ShimmerInk className="w-28 h-2.5 mt-2" />
                    </div>
                  ) : (
                    <>
                      {/* eyebrow pill — gaya landing */}
                      <span className="inline-flex items-center gap-1.5 text-[8px] sm:text-[9px] font-bold text-blue-200 uppercase tracking-[0.25em] border border-white/15 bg-white/5 px-3 py-1 rounded-full">
                        <Sparkles className="w-2.5 h-2.5" />
                        {now}
                      </span>
                      {/* judul two-tone khas Solit03 */}
                      <h1 className="font-black text-white text-3xl sm:text-5xl tracking-tight mt-3 leading-none">
                        Dashboard <span className="text-blue-400">Utama</span>
                      </h1>
                      {lastUpdated && (
                        <p className="text-[9px] sm:text-[10px] text-white/40 mt-3.5 flex items-center gap-1.5 animate-slideIn">
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
                    className="inline-flex items-center gap-1.5 text-white text-[11px] sm:text-xs font-black px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl transition-all duration-150 active:scale-[0.98] whitespace-nowrap hover:brightness-110 shadow-lg shadow-blue-900/40"
                    style={{ background: BLUE }}
                  >
                    <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5" strokeWidth={3} />
                    <span className="hidden sm:inline">Buat Transaksi</span>
                    <span className="sm:hidden">Buat</span>
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* ── Stat cards menggantung di bibir bawah hero ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4 relative z-10 -mt-12 sm:-mt-16 mx-2 sm:mx-4">
            {isLoading ? (
              Array(4).fill(0).map((_, i) => (
                <div key={i} className={`${CARD} p-3.5 sm:p-5 space-y-2`}>
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
                    className="text-left w-full h-full block active:scale-[0.99] transition-transform duration-150"
                  >
                    <StatCard
                      label="Omzet Hari Ini"
                      value={fmtRupiah(stats?.todayRevenue || 0)}
                      sub={`${stats?.todayTransactions || 0} transaksi selesai`}
                      icon={<OmzetIcon />}
                      accent="blue"
                      change={stats?.revenueChange}
                    />
                  </button>
                ) : (
                  // Non-finansial: card transaksi di posisi 1, bisa diklik buka modal
                  <button
                    onClick={() => setShowTransactionModal(true)}
                    className="text-left w-full h-full block active:scale-[0.99] transition-transform duration-150"
                  >
                    <StatCard
                      label="Transaksi Hari Ini"
                      value={String(stats?.todayTransactions || 0)}
                      sub={`${stats?.todayLaptopSold || 0} unit terjual`}
                      icon={<TrxIcon />}
                      accent="blue"
                      change={stats?.trxChange}
                    />
                  </button>
                )}

                {/* Card 2: Gross Profit (finansial only) */}
                {canSeeFinancials && (
                  <button
                    onClick={() => setShowGrossProfitModal(true)}
                    className="text-left w-full h-full block active:scale-[0.99] transition-transform duration-150"
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
                  className="text-left w-full h-full block active:scale-[0.99] transition-transform duration-150"
                >
                  <StatCard
                    label="Laptop Ready"
                    value={`${stats?.laptopReady || 0} tipe`}
                    sub={`${stats?.stockTotal || 0} unit total`}
                    icon={<LaptopIcon />}
                    accent="slate"
                  />
                </button>

                {/* Card 4: Transaksi Hari Ini — selalu tampil, buka TransactionDetailModal */}
                <button
                  onClick={() => setShowTransactionModal(true)}
                  className="text-left w-full h-full block active:scale-[0.99] transition-transform duration-150"
                >
                  <StatCard
                    label="Transaksi Hari Ini"
                    value={String(stats?.todayTransactions || 0)}
                    sub={`${stats?.todayLaptopSold || 0} unit laptop terjual`}
                    icon={<TrxIcon />}
                    accent="navy"
                    change={stats?.trxChange}
                  />
                </button>
              </>
            )}
          </div>
        </div>

        {canSeeServiceDashboard && (
          <div className="fade-up" style={{ animationDelay: "0.07s" }}>
            <ServiceDashboardWidget canSeeFinancials={canSeeFinancials} />
          </div>
        )}

        {/* ── Analitik Penjualan ── */}
        <div className="fade-up pt-2" style={{ animationDelay: "0.08s" }}>
          <SectionLabel eyebrow="Insight Harian" title="Analitik" accent="Penjualan" />
        </div>

        {/* ── Charts Row ── */}
        {canSeeFinancials ? (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 sm:gap-4 fade-up" style={{ animationDelay: "0.1s" }}>
            {/* Trend */}
            <div className={`lg:col-span-3 flex flex-col ${CARD} p-3.5 sm:p-5`}>
              <SectionHeader title="Tren 7 Hari Terakhir" badge="7 hari" />

              {/* Legend */}
              <div className="flex gap-3 sm:gap-4 mb-3 flex-wrap -mt-1">
                {[
                  { color: "bg-blue-600", label: "Omzet", solid: true },
                  { color: "bg-emerald-500", label: "Profit", solid: false },
                  { color: "bg-blue-400", label: "Laptop Terjual", solid: false },
                ].map(({ color, label, solid }) => (
                  <div key={label} className="flex items-center gap-1.5 text-[9px] sm:text-[10px] text-slate-500">
                    <span className={`w-4 sm:w-5 h-0.5 inline-block rounded-full ${color}`}
                      style={!solid ? { borderTop: "2px dashed", background: "none" } : {}}
                    />
                    <span className={label === "Laptop Terjual" ? "text-blue-400" : ""}>{label}</span>
                  </div>
                ))}
                <span className="ml-auto text-[9px] text-blue-400 hidden sm:inline">
                  axis kanan = unit
                </span>
              </div>

              {trendChartBody}
            </div>

            {/* Bar: transaksi per hari */}
            <div className={`lg:col-span-2 flex flex-col ${CARD} p-3.5 sm:p-5`}>
              <SectionHeader title="Transaksi per Hari" badge="7 hari" />
              {trxBarBody}
            </div>
          </div>
        ) : (
          <div className="fade-up" style={{ animationDelay: "0.1s" }}>
            <div className={`flex flex-col ${CARD} p-3.5 sm:p-5`}>
              <SectionHeader title="Transaksi per Hari" badge="7 hari terakhir" />
              {trxBarBody}
            </div>
          </div>
        )}

        {/* ── Top Lists Row ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 fade-up auto-rows-fr" style={{ animationDelay: "0.13s" }}>
          {/* Top Sales */}
          <div
            onClick={() => setShowSalesModal(true)}
            className="text-left w-full cursor-pointer active:scale-[0.995] transition-transform duration-150"
            role="button"
            tabIndex={0}
          >
            <div className={`h-full flex flex-col ${CARD} hover:border-blue-200 transition-colors duration-200 p-3.5 sm:p-5`}>
              <SectionHeader
                icon={<Trophy className="w-4 h-4 text-blue-600" />}
                title="Top Sales"
                badge="hari ini"
              />
              <div className="flex-1 flex flex-col justify-center">
                {isLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Shimmer className="w-5 h-5 rounded-md" />
                        <Shimmer className="flex-1 h-2 sm:h-3" />
                        <Shimmer className="w-8 sm:w-10 h-4 rounded-full" />
                      </div>
                    ))}
                  </div>
                ) : stats?.topSales?.length ? (
                  <div className="space-y-1">
                    {stats.topSales.map((s, i) => (
                      <TopListItem key={s.name} rank={i + 1} name={s.name} total={s.total}
                        maxTotal={stats.topSales[0]?.total || 1}
                        barClass="bg-blue-600"
                        extra={canSeeFinancials && s.profit > 0 ? (
                          <span className="text-[9px] sm:text-[10px] text-emerald-600 font-bold flex-shrink-0 tabular-nums">
                            +{fmtShort(s.profit)}
                          </span>
                        ) : undefined}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={Trophy} label="Belum ada data" />
                )}
              </div>
            </div>
          </div>

          {/* Top Laptop */}
          <div
            onClick={() => setShowLaptopModal(true)}
            className="text-left w-full cursor-pointer active:scale-[0.995] transition-transform duration-150"
            role="button"
            tabIndex={0}
          >
            <div className={`h-full flex flex-col ${CARD} hover:border-blue-200 transition-colors duration-200 p-3.5 sm:p-5`}>
              <SectionHeader
                icon={<Laptop className="w-4 h-4 text-blue-400" />}
                title="Laptop Terlaris"
                badge="hari ini"
              />
              <div className="flex-1 flex flex-col justify-center">
                {isLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Shimmer className="w-5 h-5 rounded-md" />
                        <Shimmer className="flex-1 h-2 sm:h-3" />
                        <Shimmer className="w-8 sm:w-10 h-4 rounded-full" />
                      </div>
                    ))}
                  </div>
                ) : stats?.topLaptop?.length ? (
                  <div className="space-y-1">
                    {stats.topLaptop.map((item, i) => (
                      <TopListItem key={item.name} rank={i + 1} name={item.name} total={item.total}
                        maxTotal={stats.topLaptop[0]?.total || 1}
                        barClass="bg-blue-400" />
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={Laptop} label="Belum ada data" />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Transaksi Terbaru ── */}
        <div className="fade-up pt-2" style={{ animationDelay: "0.15s" }}>
          <SectionLabel eyebrow="Aktivitas Live" title="Transaksi" accent="Terbaru" />
        </div>

        <div className={`${CARD} overflow-hidden fade-up`} style={{ animationDelay: "0.16s" }}>
          <div className="flex items-center justify-between px-3.5 sm:px-5 py-3 sm:py-4 border-b border-slate-100">
            <h2 className="font-black text-slate-900 text-[13px] sm:text-sm flex items-center gap-2 tracking-tight">
              <LiveDot />
              Transaksi Terbaru
            </h2>
            <a href="/dashboard/transactions" className="text-[10px] sm:text-xs font-semibold text-slate-400 hover:text-blue-600 transition-colors duration-150 flex items-center gap-0.5 group">
              Lihat Semua
              <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
            </a>
          </div>

          <div className="divide-y divide-slate-50">
            {isLoading ? (
              [1, 2, 3].map((i) => (
                <div key={i} className="px-3.5 sm:px-5 py-3 sm:py-4 flex items-center gap-2.5 sm:gap-3">
                  <Shimmer className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Shimmer className="w-28 sm:w-36 h-3" />
                    <Shimmer className="w-40 sm:w-52 h-2 sm:h-3" />
                  </div>
                  <div className="space-y-1.5 flex flex-col items-end flex-shrink-0">
                    <Shimmer className="w-16 sm:w-20 h-3 sm:h-4" />
                    <Shimmer className="w-10 sm:w-12 h-2 sm:h-3" />
                  </div>
                </div>
              ))
            ) : transactions.length === 0 ? (
              <div className="py-10 sm:py-14">
                <EmptyState
                  icon={Inbox}
                  label="Belum ada transaksi hari ini"
                  sub="Transaksi akan muncul setelah dibuat"
                />
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
