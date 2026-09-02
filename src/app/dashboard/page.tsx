"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { PERMISSIONS, UserRole, hasPermission, isDashboardLimited, getDashboardTopWidgetConfig } from "@/lib/permissions";
import { RevenueDetailModal } from "@/components/modals/RevenueDetailModal";
import { InventoryDetailModal } from "@/components/modals/InventoryDetailModal";
import { SalesDetailModal } from "@/components/modals/SalesDetailModal";
import { LaptopDetailModal } from "@/components/modals/LaptopDetailModal";
import { GrossProfitDetailModal } from "@/components/modals/GrossProfitDetailModal";
import { TransactionDetailModal } from "@/components/modals/TransactionDetailModal";
import ServiceDashboardWidget from "@/components/service/ServiceDashboardWidget";
import {
  Medal, Banknote, TrendingUp, ShoppingCart, Award,
  Laptop, Trophy, Inbox, BarChart3,
  CheckCircle2, Clock, XCircle, ClipboardList,
  ArrowUp, ArrowDown, Search, RefreshCw, Plus, MapPin, Image as ImageIcon,
  CreditCard, Wallet, ArrowRight, Activity
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
import { Line, Bar, Doughnut } from "react-chartjs-2";
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
interface LeaderboardEntry {
  id: string;
  name: string;
  role: string;
  score: number;
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
  (name || "C").split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();

// Card styling aligned with Catalog Dashboard layout
const CARD_STYLE = "bg-white rounded-3xl p-5 sm:p-6 border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_10px_30px_-6px_rgba(99,102,241,0.12)] transition-all duration-300";

// Shimmer Loader
const Shimmer = ({ className = "", style = {} }: { className?: string; style?: React.CSSProperties }) => (
  <span className={`block rounded-xl animate-shimmer bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100 bg-[length:200%_100%] ${className}`} style={style} />
);

// Trend Badge
function TrendBadge({ change }: { change: number | null }) {
  if (change === null) return null;
  const up = change >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-2 py-0.5 rounded-full tabular-nums ${up ? "bg-emerald-50 text-emerald-600 border border-emerald-200/60" : "bg-rose-50 text-rose-500 border border-rose-200/60"}`}>
      {up ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />} {Math.abs(change)}%
    </span>
  );
}

// Top List Item (Top Sales & Laptop)
function TopListItem({ rank, name, total, maxTotal, extra, unit = "x" }: {
  rank: number; name: string; total: number; maxTotal: number; extra?: React.ReactNode; unit?: string;
}) {
  const medals = [
    <Medal key="gold" className="w-4 h-4 text-amber-500 drop-shadow-sm" />,
    <Medal key="silver" className="w-4 h-4 text-slate-400 drop-shadow-sm" />,
    <Medal key="bronze" className="w-4 h-4 text-amber-700 drop-shadow-sm" />
  ];
  const pct = Math.round((total / Math.max(maxTotal, 1)) * 100);

  return (
    <div className="group/item py-2 px-2.5 -mx-2 rounded-2xl hover:bg-slate-50/80 transition-all duration-200">
      <div className="flex items-center gap-3 mb-1.5">
        <div className="w-6 flex-shrink-0 flex items-center justify-center font-bold text-xs">
          {rank <= 3 ? medals[rank - 1] : (
            <span className="text-[10px] text-slate-400 font-semibold w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center">
              {rank}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-700 font-semibold truncate flex-1 group-hover/item:text-indigo-600 transition-colors">
          {name}
        </p>
        {extra}
        <span className="text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full tabular-nums">
          {total}{unit}
        </span>
      </div>
      <div className="ml-9 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${pct}%`,
            background: rank === 1 ? "linear-gradient(to right, #6366f1, #4f46e5)" : rank === 2 ? "#818cf8" : "#c7d2fe",
          }}
        />
      </div>
    </div>
  );
}

// Transaction Item (Catalog Payment Gateways Style)
const STATUS_STYLES: Record<string, string> = {
  PAID: "bg-emerald-50 text-emerald-600 border-emerald-200/80",
  PENDING: "bg-amber-50 text-amber-600 border-amber-200/80",
  CANCELLED: "bg-rose-50 text-rose-500 border-rose-200/80",
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

  const avatarColors = [
    "from-indigo-500 to-purple-600",
    "from-rose-500 to-amber-500",
    "from-blue-500 to-teal-500",
    "from-violet-500 to-indigo-600",
  ];
  const bgGradient = avatarColors[Math.abs(item.id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)) % avatarColors.length];

  return (
     <div className="py-2 px-2 rounded-2xl hover:bg-slate-50/80 transition-all duration-200 group">
      <div className="flex items-center gap-3">
        {/* Rounded Avatar */}
        <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${bgGradient} text-white font-bold flex items-center justify-center text-xs flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform`}>
          {getInitials(item.customer_name)}
        </div>

        {/* Customer & Laptop Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-slate-800 text-xs sm:text-sm truncate">{item.customer_name}</span>
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLES[item.status] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
              {(() => {
                const StatusIco = STATUS_ICON[item.status] || ClipboardList;
                return <StatusIco className="w-3 h-3" />;
              })()}
              <span>{item.status}</span>
            </span>
          </div>

          <p className="text-slate-500 text-[11px] mt-0.5 truncate flex items-center gap-1.5">
            <span className="font-medium text-slate-700">{item.laptop_name}</span>
            <span className="text-slate-300">•</span>
            <span className="font-mono text-slate-400 text-[10px]">{item.invoice_number}</span>
          </p>

          <div className="flex items-center gap-2 mt-1">
            {item.sales_name && (
              <span className="text-[10px] text-slate-400 font-medium">
                Sales: <strong className="text-slate-600 font-semibold">{item.sales_name}</strong>
              </span>
            )}
            {item.source_platform && (
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium border border-slate-200/60">
                {item.source_platform}
              </span>
            )}
            {item.payment_photo && (
              <button
                onClick={() => onPhotoClick(item.payment_photo!)}
                className="inline-flex items-center gap-1 text-[9px] font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-full transition-colors"
              >
                <ImageIcon className="w-2.5 h-2.5" />
                Bukti
              </button>
            )}
            {item.latitude && item.longitude && (
              <a
                href={`https://maps.google.com/?q=${item.latitude},${item.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[9px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded-full transition-colors"
              >
                <MapPin className="w-2.5 h-2.5" />
                Maps
              </a>
            )}
          </div>
        </div>

        {/* Right side Amount */}
        <div className="text-right flex-shrink-0">
          <p className="text-xs sm:text-sm font-bold text-slate-900 tabular-nums">
            Rp {displayAmount.toLocaleString("id-ID")}
          </p>
          <p className="text-[10px] text-slate-400 font-medium mt-0.5">{dateStr} · {timeStr}</p>
          {canSeeFinancials && profit > 0 && (
            <p className="text-[10px] font-bold text-emerald-600 mt-0.5 tabular-nums">
              +{fmtShort(profit)} profit
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// Photo Modal
function PhotoModal({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn" onClick={onClose}>
      <div className="relative max-w-lg w-full animate-scaleIn" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-10 right-0 text-white/80 hover:text-white transition text-xs flex items-center gap-1.5 font-medium">
          Tutup ✕
        </button>
        <img src={url} alt="Bukti Bayar" className="w-full rounded-3xl shadow-2xl border border-white/20" />
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="mt-3 flex items-center justify-center gap-1.5 text-white/70 hover:text-white text-xs transition"
          onClick={(e) => e.stopPropagation()}>
          Buka gambar ukuran penuh
        </a>
      </div>
    </div>
  );
}

// Main Page Component
export default function Page() {
  const [stats, setStats] = useState<Stats>();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [now, setNow] = useState("");
  const [photoModal, setPhotoModal] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Modals state
  const [showRevenueModal, setShowRevenueModal] = useState(false);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [showSalesModal, setShowSalesModal] = useState(false);
  const [showLaptopModal, setShowLaptopModal] = useState(false);
  const [showGrossProfitModal, setShowGrossProfitModal] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [leaderboardTop, setLeaderboardTop] = useState<LeaderboardEntry[]>([]);

  const canSeeFinancials = userRole ? hasPermission(userRole, PERMISSIONS.VIEW_FINANCIALS) : false;
  // Role di luar FULL_ACCESS (Admin/Programmer/Asisten CEO) → dashboard versi
  // ringkas: Laptop Ready + widget "Top X Hari Ini" (beda per divisi) +
  // Laptop Terlaris. Admin/Programmer/Asisten CEO tetap full seperti semula.
  const dashboardLimited = isDashboardLimited(userRole);
  // Full dashboard SELALU pakai "Top Sales" (perilaku lama, tidak berubah);
  // logic per-divisi cuma berlaku kalau dashboard-nya dibatasi.
  const topWidgetConfig = dashboardLimited
    ? getDashboardTopWidgetConfig(userRole)
    : { label: "Top Sales Hari Ini", source: "sales" as const, matchRole: undefined };
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

  // Widget "Top X Hari Ini" (non-sales) sumbernya /api/leaderboard-kerja —
  // endpoint itu berat (~13 query paralel, sebagian tanpa filter tanggal),
  // makanya SENGAJA dipisah dari poll 60 detik utama & pakai interval 5
  // menit sendiri, biar tidak nambah beban di siklus refresh dashboard biasa
  // (lihat riwayat 408/timeout akibat query berat + polling).
  useEffect(() => {
    if (topWidgetConfig.source !== "leaderboard") return;

    let cancelled = false;
    const fetchLeaderboard = async () => {
      try {
        const res = await fetch("/api/leaderboard-kerja?period=today");
        const json = await res.json();
        if (!cancelled && json.success) setLeaderboardTop(json.data || []);
      } catch (e) {
        console.error(e);
      }
    };

    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 5 * 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [topWidgetConfig.source]);

  // Chart data setup
  const weeklyLabels = stats?.weeklyTrend?.map((d) => d.label) ?? [];
  const weeklyRevenue = stats?.weeklyTrend?.map((d) => d.revenue) ?? [];
  const weeklyProfit = stats?.weeklyTrend?.map((d) => d.profit) ?? [];
  const weeklyTrxCount = stats?.weeklyTrend?.map((d) => d.trxCount) ?? [];
  const weeklyLaptopSold = stats?.weeklyTrend?.map((d) => d.laptopSold) ?? [];

  // Line Chart Data (Yearly Sales / Trend style)
  const trendChartData = {
    labels: weeklyLabels,
    datasets: [
      {
        label: "Omzet",
        data: weeklyRevenue,
        borderColor: "#6366f1",
        backgroundColor: (context: any) => {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) return "rgba(99,102,241,0.1)";
          const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, "rgba(99,102,241,0.35)");
          gradient.addColorStop(1, "rgba(99,102,241,0.0)");
          return gradient;
        },
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 7,
        pointBackgroundColor: "#6366f1",
        pointBorderColor: "#ffffff",
        pointBorderWidth: 2,
        yAxisID: "yRevenue",
      },
      {
        label: "Profit",
        data: weeklyProfit,
        borderColor: "#10b981",
        backgroundColor: (context: any) => {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) return "rgba(16,185,129,0.05)";
          const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, "rgba(16,185,129,0.2)");
          gradient.addColorStop(1, "rgba(16,185,129,0.0)");
          return gradient;
        },
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: "#10b981",
        pointBorderColor: "#ffffff",
        pointBorderWidth: 2,
        borderDash: [4, 4],
        yAxisID: "yRevenue",
      },
    ],
  };

  // Bar Chart Data (Revenue Updates style - Vertical rounded pillars)
  const trxBarData = {
    labels: weeklyLabels,
    datasets: [{
      label: "Transaksi",
      data: weeklyTrxCount,
      backgroundColor: weeklyTrxCount.map((_, i) =>
        i === weeklyTrxCount.length - 1 ? "#6366f1" : "rgba(99,102,241,0.25)"
      ),
      borderRadius: 8,
      borderSkipped: false as const,
      hoverBackgroundColor: "#4f46e5",
    }],
  };

  // Donut Chart Data (Sales Overview style)
  const donutData = {
    labels: ["Profit", "Estimasi Modal & Ops"],
    datasets: [
      {
        data: [
          stats?.todayProfit || 1,
          Math.max(0, (stats?.todayRevenue || 1) - (stats?.todayProfit || 0)),
        ],
        backgroundColor: ["#6366f1", "#06b6d4"],
        hoverBackgroundColor: ["#4f46e5", "#0891b2"],
        borderWidth: 0,
        spacing: 2,
        borderRadius: 4,
      },
    ],
  };

  const trendOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index" as const, intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#1e293b",
        titleColor: "#f8fafc",
        bodyColor: "#cbd5e1",
        padding: 12,
        cornerRadius: 12,
        displayColors: true,
        callbacks: {
          label: (ctx: any) => `${ctx.dataset.label}: ${fmtShort(ctx.raw as number)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { font: { size: 10, weight: "bold" as const }, color: "#94a3b8" },
      },
      yRevenue: {
        type: "linear" as const,
        position: "left" as const,
        border: { display: false },
        grid: { color: "rgba(226,232,240,0.6)" },
        ticks: {
          font: { size: 10 },
          color: "#94a3b8",
          callback: (v: any) => fmtShort(v),
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
        backgroundColor: "#1e293b",
        titleColor: "#f8fafc",
        bodyColor: "#cbd5e1",
        cornerRadius: 12,
        padding: 12,
        callbacks: { label: (ctx: any) => `${ctx.raw} transaksi` },
      },
    },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 10, weight: "bold" as const }, color: "#94a3b8" } },
      y: { grid: { color: "rgba(226,232,240,0.6)" }, border: { display: false }, ticks: { font: { size: 10 }, color: "#94a3b8", stepSize: 1 }, beginAtZero: true },
    },
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "75%",
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#1e293b",
        titleColor: "#f8fafc",
        bodyColor: "#cbd5e1",
        cornerRadius: 12,
        padding: 10,
        callbacks: {
          label: (ctx: any) => ` ${ctx.label}: ${fmtShort(ctx.raw)}`,
        },
      },
    },
  };

  // Data untuk widget "Top X Hari Ini" non-sales (leaderboard-kerja, sudah
  // terurut skor tertinggi dari API — cukup filter by role lalu ambil 5 teratas)
  const topWidgetData: { name: string; total: number }[] =
    topWidgetConfig.source === "leaderboard" && topWidgetConfig.matchRole
      ? leaderboardTop
          .filter((e) => e.role && e.role.includes(topWidgetConfig.matchRole as string))
          .slice(0, 5)
          .map((e) => ({ name: e.name, total: Math.round(e.score * 10) / 10 }))
      : [];

  // Filter transactions if user searches
  const filteredTransactions = transactions.filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.customer_name.toLowerCase().includes(q) ||
      t.laptop_name.toLowerCase().includes(q) ||
      t.invoice_number.toLowerCase().includes(q) ||
      (t.sales_name && t.sales_name.toLowerCase().includes(q))
    );
  }); 

  return (
    <DashboardLayout>
      {/* Detail Modals */}
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
      {photoModal && <PhotoModal url={photoModal} onClose={() => setPhotoModal(null)} />}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        .animate-fadeIn { animation: fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1); }
        .animate-scaleIn { animation: scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1); }
        .animate-shimmer { animation: shimmer 1.5s ease-in-out infinite; background-size: 200% 100%; }
      `}</style>

      <div className="space-y-6 max-w-[1400px] mx-auto px-2 sm:px-4 py-2">

        {/* ── TOP HEADER BAR (Matching Catalog Dashboard Header) ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
          {/* Left Title */}
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Dashboard</h1>
            <p className="text-xs text-slate-400 font-medium mt-1 flex items-center gap-2">
              <span>{now}</span>
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

          {/* Right Header Controls: Search + Refresh + New Transaction */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Search Input Bar */}
            <div className="relative flex-1 sm:flex-initial min-w-[200px] sm:min-w-[260px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari transaksi / customer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-100/80 hover:bg-slate-100 focus:bg-white text-slate-700 placeholder-slate-400 text-xs font-medium rounded-full pl-9 pr-4 py-2.5 transition-all outline-none ring-2 ring-transparent focus:ring-indigo-400 border border-slate-200/50"
              />
            </div>

            {/* Refresh Button */}
            <button
              onClick={() => fetchAll(true)}
              disabled={isRefreshing}
              className="p-2.5 sm:px-4 sm:py-2.5 bg-white hover:bg-slate-50 text-slate-700 rounded-full border border-slate-200 text-xs font-bold flex items-center gap-2 transition-all shadow-sm active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-indigo-600" : ""}`} />
              <span className="hidden sm:inline">{isRefreshing ? "Memuat..." : "Refresh"}</span>
            </button>

            {/* Create Transaction CTA Button */}
            <Link
              href="/payment/create"
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs rounded-full shadow-md shadow-indigo-500/20 hover:shadow-indigo-500/30 flex items-center gap-1.5 transition-all hover:-translate-y-0.5"
            >
              <Plus className="w-4 h-4" />
              <span>Buat Transaksi</span>
            </Link>
          </div>
        </div>

        {/* ── HERO BANNER: "SALES DISTRIBUTION" (Matching Reference Wave Banner) ── */}
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
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">Distribusi Penjualan</h2>
              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
                Ringkasan performa penjualan & distribusi transaksi platform SOLIT POS
              </p>
            </div>

            {/* Floating Stat Cards Grid inside Hero Banner */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
              {!dashboardLimited && (
              <>
              {/* Stat 1: Main Omzet / Transaksi (Hero Card) */}
              <div className="col-span-2 sm:col-span-1 lg:col-span-1">
                {canSeeFinancials ? (
                  <button
                    onClick={() => setShowRevenueModal(true)}
                    className="w-full text-left bg-white/90 hover:bg-white backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-sm border border-white/70 transition-all hover:-translate-y-1 hover:shadow-md group h-full flex flex-col justify-between"
                  >
                    <div>
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Total Omzet</span>
                      <p className="text-xl sm:text-2xl font-extrabold text-slate-900 tabular-nums group-hover:text-indigo-600 transition-colors">
                        {isLoading ? <Shimmer className="w-28 h-7" /> : fmtShort(stats?.todayRevenue || 0)}
                      </p>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-medium">{stats?.todayTransactions || 0} transaksi</span>
                      <TrendBadge change={stats?.revenueChange ?? null} />
                    </div>
                  </button>
                ) : (
                  <button
                    onClick={() => setShowTransactionModal(true)}
                    className="w-full text-left bg-white/90 hover:bg-white backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-sm border border-white/70 transition-all hover:-translate-y-1 hover:shadow-md group h-full flex flex-col justify-between"
                  >
                    <div>
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Total Transaksi</span>
                      <p className="text-2xl font-extrabold text-slate-900 tabular-nums group-hover:text-indigo-600 transition-colors">
                        {isLoading ? <Shimmer className="w-16 h-7" /> : `${stats?.todayTransactions || 0} trx`}
                      </p>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-medium">{stats?.todayLaptopSold || 0} unit terjual</span>
                      <TrendBadge change={stats?.trxChange ?? null} />
                    </div>
                  </button>
                )}
              </div>

              {/* Stat 2: Gross Profit (Financials) */}
              {canSeeFinancials && (
                <button
                  onClick={() => setShowGrossProfitModal(true)}
                  className="w-full text-left bg-white/90 hover:bg-white backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-sm border border-white/70 transition-all hover:-translate-y-1 hover:shadow-md group h-full flex flex-col justify-between"
                >
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Gross Profit</span>
                    <p className="text-xl sm:text-2xl font-extrabold text-slate-900 tabular-nums group-hover:text-emerald-600 transition-colors">
                      {isLoading ? <Shimmer className="w-24 h-7" /> : fmtShort(stats?.todayProfit || 0)}
                    </p>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 font-medium">
                      {stats?.todayRevenue ? `${Math.round(((stats.todayProfit || 0) / stats.todayRevenue) * 100)}% margin` : "keuntungan"}
                    </span>
                    <TrendBadge change={stats?.profitChange ?? null} />
                  </div>
                </button>
              )}
              </>
              )}

              {/* Stat 3: Laptop Ready */}
              <button
                onClick={() => setShowInventoryModal(true)}
                className="w-full text-left bg-white/90 hover:bg-white backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-sm border border-white/70 transition-all hover:-translate-y-1 hover:shadow-md group h-full flex flex-col justify-between"
              >
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Laptop Ready</span>
                  <p className="text-xl sm:text-2xl font-extrabold text-slate-900 tabular-nums group-hover:text-indigo-600 transition-colors">
                    {isLoading ? <Shimmer className="w-20 h-7" /> : `${stats?.laptopReady || 0} Tipe`}
                  </p>
                </div>
                <div className="mt-3">
                  <span className="text-[10px] text-slate-400 font-medium">{stats?.stockTotal || 0} unit total stok</span>
                </div>
              </button>

              {!dashboardLimited && (
              <>
              {/* Stat 4: Transaksi Hari Ini */}
              <button
                onClick={() => setShowTransactionModal(true)}
                className="w-full text-left bg-white/90 hover:bg-white backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-sm border border-white/70 transition-all hover:-translate-y-1 hover:shadow-md group h-full flex flex-col justify-between"
              >
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Transaksi Hari Ini</span>
                  <p className="text-xl sm:text-2xl font-extrabold text-slate-900 tabular-nums group-hover:text-indigo-600 transition-colors">
                    {isLoading ? <Shimmer className="w-16 h-7" /> : `${stats?.todayTransactions || 0} Trx`}
                  </p>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 font-medium">Hari ini</span>
                  <TrendBadge change={stats?.trxChange ?? null} />
                </div>
              </button>

              {/* Stat 5: Laptop Terjual */}
              <button
                onClick={() => setShowLaptopModal(true)}
                className="w-full text-left bg-white/90 hover:bg-white backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-sm border border-white/70 transition-all hover:-translate-y-1 hover:shadow-md group h-full flex flex-col justify-between"
              >
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Unit Terjual</span>
                  <p className="text-xl sm:text-2xl font-extrabold text-slate-900 tabular-nums group-hover:text-indigo-600 transition-colors">
                    {isLoading ? <Shimmer className="w-16 h-7" /> : `${stats?.todayLaptopSold || 0} Unit`}
                  </p>
                </div>
                <div className="mt-3">
                  <span className="text-[10px] text-slate-400 font-medium">Terjual hari ini</span>
                </div>
              </button>
              </>
              )}
            </div>
          </div>
        </div>

        {/* ── MIDDLE CARDS GRID: "Sales Overview", "Revenue Updates", "Yearly Sales" ── */}
        {!dashboardLimited && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-12 gap-5">

          {/* CARD A: Sales Overview (Donut Chart) — 3 cols */}
          <div className="lg:col-span-3">
            <div className={`${CARD_STYLE} h-full flex flex-col justify-between`}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-slate-900 text-sm">Ringkasan Penjualan</h3>
                <span className="text-slate-400 text-xs font-bold hover:text-slate-600 cursor-pointer">•••</span>
              </div>

              {/* Donut Chart Container */}
              <div className="relative my-4 h-44 flex items-center justify-center">
                {isLoading ? (
                  <Shimmer className="w-36 h-36 rounded-full" />
                ) : (
                  <>
                    <Doughnut data={donutData} options={doughnutOptions} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Profit</span>
                      <span className="text-base font-extrabold text-slate-900 tabular-nums">
                        {fmtShort(stats?.todayProfit || 0)}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Legend pills */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="flex items-center gap-2 text-slate-600">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                    Gross Profit
                  </span>
                  <span className="text-slate-900 tabular-nums">{fmtShort(stats?.todayProfit || 0)}</span>
                </div>
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="flex items-center gap-2 text-slate-600">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-500" />
                    Omzet Total
                  </span>
                  <span className="text-slate-900 tabular-nums">{fmtShort(stats?.todayRevenue || 0)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* CARD B: Revenue Updates (Bar Chart) — 4 cols */}
          <div className="lg:col-span-4">
            <div className={`${CARD_STYLE} h-full flex flex-col justify-between`}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Pembaruan Pendapatan</h3>
                  <p className="text-[11px] text-slate-400 font-medium">Transaksi 7 hari terakhir</p>
                </div>
                <span className="text-slate-400 text-xs font-bold hover:text-slate-600 cursor-pointer">•••</span>
              </div>

              <div className="h-48 my-2">
                {isLoading ? (
                  <Shimmer className="w-full h-full" />
                ) : (
                  <Bar data={trxBarData} options={barOptions} />
                )}
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold pt-2 border-t border-slate-100">
                <span>Rata-rata: <strong className="text-slate-900">{Math.round((weeklyTrxCount.reduce((a, b) => a + b, 0) || 0) / (weeklyTrxCount.length || 1))} trx/hari</strong></span>
                <span className="text-indigo-600 font-bold">{weeklyTrxCount.reduce((a, b) => a + b, 0)} Total Trx</span>
              </div>
            </div>
          </div>

          {/* CARD C: Yearly Sales / Trend Penjualan (Line Chart) — 5 cols */}
          <div className="lg:col-span-5">
            <div className={`${CARD_STYLE} h-full flex flex-col justify-between`}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Tren Penjualan Tahunan</h3>
                  <p className="text-[11px] text-slate-400 font-medium">Performa Omzet & Profit mingguan</p>
                </div>
                <span className="text-slate-400 text-xs font-bold hover:text-slate-600 cursor-pointer">•••</span>
              </div>

              <div className="h-48 my-2">
                {isLoading ? (
                  <Shimmer className="w-full h-full" />
                ) : (
                  <Line data={trendChartData} options={trendOptions} />
                )}
              </div>

              {/* Chart Legend Tags */}
              <div className="flex items-center justify-center gap-6 pt-2 border-t border-slate-100 text-xs font-semibold">
                <div className="flex items-center gap-2 text-indigo-600">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                  <span>Omzet (Rp)</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-600">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span>Profit (Rp)</span>
                </div>
              </div>
            </div>
          </div>

        </div>
        )}

        {/* ── Service Dashboard Widget (if permitted) ── */}
        {canSeeServiceDashboard && (
          <div>
            <ServiceDashboardWidget canSeeFinancials={canSeeFinancials} />
          </div>
        )}

        {/* ── BOTTOM GRID SECTION: "Active Users / Top Rankings" & "Payment Gateways / Recent Transactions" ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

          {/* LEFT BOTTOM: Top Sales & Top Laptop Cards — 7 cols (12 cols kalau dashboard dibatasi) */}
          <div className={dashboardLimited ? "lg:col-span-12 space-y-5" : "lg:col-span-7 space-y-5"}>
            <div className={`grid grid-cols-1 gap-5 ${topWidgetConfig.source === "none" ? "" : "sm:grid-cols-2"}`}>

              {/* Top X Ranking Card — "Top Sales" (data transaksi) untuk role
                  sales-like, atau "Top Teknisi/Konten/dst" (data leaderboard-kerja)
                  untuk role lain; disembunyikan total kalau role tidak punya
                  metrik apa pun (source: "none", mis. Customer Service/Kebersihan) */}
              {topWidgetConfig.source !== "none" && (
              <div
                onClick={() => topWidgetConfig.source === "sales" && setShowSalesModal(true)}
                className={`${CARD_STYLE} ${topWidgetConfig.source === "sales" ? "cursor-pointer hover:border-indigo-200" : ""} transition-all flex flex-col justify-between`}
                role={topWidgetConfig.source === "sales" ? "button" : undefined}
                tabIndex={topWidgetConfig.source === "sales" ? 0 : undefined}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-indigo-600" />
                    <h3 className="font-bold text-slate-900 text-sm">{topWidgetConfig.label}</h3>
                  </div>
                  {topWidgetConfig.source === "sales" && (
                    <span className="text-[10px] text-slate-400 font-bold bg-slate-100 px-2 py-0.5 rounded-full">Detail</span>
                  )}
                </div>

                <div className="space-y-2 my-1">
                  {topWidgetConfig.source === "sales" ? (
                    isLoading ? (
                      Array(3).fill(0).map((_, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Shimmer className="w-5 h-5 rounded-full" />
                          <Shimmer className="flex-1 h-4" />
                        </div>
                      ))
                    ) : stats?.topSales?.length ? (
                      stats.topSales.map((s, i) => (
                        <TopListItem
                          key={s.name}
                          rank={i + 1}
                          name={s.name}
                          total={s.total}
                          maxTotal={stats.topSales[0]?.total || 1}
                          extra={canSeeFinancials && s.profit > 0 ? (
                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200/60 tabular-nums">
                              +{fmtShort(s.profit)}
                            </span>
                          ) : undefined}
                        />
                      ))
                    ) : (
                      <div className="py-6 text-center text-slate-400 text-xs">Belum ada data sales hari ini</div>
                    )
                  ) : (
                    topWidgetData.length ? (
                      topWidgetData.map((s, i) => (
                        <TopListItem
                          key={s.name}
                          rank={i + 1}
                          name={s.name}
                          total={s.total}
                          maxTotal={topWidgetData[0]?.total || 1}
                          unit=" poin"
                        />
                      ))
                    ) : (
                      <div className="py-6 text-center text-slate-400 text-xs">Belum ada data hari ini</div>
                    )
                  )}
                </div>
              </div>
              )}

              {/* Top Laptop Card */}
              <div
                onClick={() => setShowLaptopModal(true)}
                className={`${CARD_STYLE} cursor-pointer hover:border-indigo-200 transition-all flex flex-col justify-between`}
                role="button"
                tabIndex={0}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Laptop className="w-4 h-4 text-indigo-600" />
                    <h3 className="font-bold text-slate-900 text-sm">Laptop Terlaris</h3>
                  </div>
                  <span className="text-[10px] text-slate-400 font-bold bg-slate-100 px-2 py-0.5 rounded-full">Detail</span>
                </div>

                <div className="space-y-2 my-1">
                  {isLoading ? (
                    Array(3).fill(0).map((_, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Shimmer className="w-5 h-5 rounded-full" />
                        <Shimmer className="flex-1 h-4" />
                      </div>
                    ))
                  ) : stats?.topLaptop?.length ? (
                    stats.topLaptop.map((item, i) => (
                      <TopListItem
                        key={item.name}
                        rank={i + 1}
                        name={item.name}
                        total={item.total}
                        maxTotal={stats.topLaptop[0]?.total || 1}
                      />
                    ))
                  ) : (
                    <div className="py-6 text-center text-slate-400 text-xs">Belum ada data laptop terjual</div>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* RIGHT BOTTOM: Payment Gateways / Transaksi Terbaru — 5 cols (disembunyikan utk dashboard terbatas) */}
          {!dashboardLimited && (
          <div className="lg:col-span-5">
            <div className={`${CARD_STYLE} flex flex-col justify-between h-full`}>
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Transaksi Terbaru</h3>
                    <p className="text-[11px] text-slate-400 font-medium">Payment status & histori real-time</p>
                  </div>
                  <span className="text-slate-400 text-xs font-bold hover:text-slate-600 cursor-pointer">•••</span>
                </div>

                {/* Transaction List */}
                <div className="divide-y divide-slate-100/80 my-2">
                  {isLoading ? (
                    Array(4).fill(0).map((_, i) => (
                      <div key={i} className="py-3 flex items-center gap-3">
                        <Shimmer className="w-10 h-10 rounded-2xl" />
                        <div className="flex-1 space-y-1">
                          <Shimmer className="w-32 h-3.5" />
                          <Shimmer className="w-48 h-2.5" />
                        </div>
                      </div>
                    ))
                  ) : filteredTransactions.length === 0 ? (
                    <div className="py-12 text-center">
                      <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-2">
                        <Inbox className="w-6 h-6" />
                      </div>
                      <p className="text-slate-600 font-bold text-xs">Belum ada transaksi hari ini</p>
                    </div>
                  ) : (
                     filteredTransactions.slice(0, 4).map((item) => (
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

              {/* Full-width bottom button: "View all transactions" */}
              <div className="pt-3 border-t border-slate-100">
                <Link
                  href="/dashboard/transactions"
                  className="w-full py-2.5 rounded-2xl bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 text-indigo-600 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span>Lihat Semua Transaksi</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
          )}

        </div>

      </div>
    </DashboardLayout>
  );
}