"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { UserRole, hasPermission } from "@/lib/permissions";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Stats {
  todayRevenue: number;
  todayProfit: number;
  todayTransactions: number;
  laptopReady: number;
  stockTotal: number;
  topSales: { name: string; total: number; profit: number }[];
  topSources: { name: string; total: number }[];
  topLaptop: { name: string; total: number }[];
}

interface Transaction {
  id: string;
  customer_name: string;
  laptop_name: string;
  amount: number;
  other: number;
  status: string;
  payment_photo?: string;
  latitude?: string;
  longitude?: string;
  created_at: string;
}

// ─── Shimmer ──────────────────────────────────────────────────────────────────
const Shimmer = ({
  w, h, r = "10px", style = {},
}: {
  w: string | number; h: string | number; r?: string; style?: React.CSSProperties;
}) => (
  <div style={{
    width: w, height: h, borderRadius: r, flexShrink: 0,
    background: "linear-gradient(90deg,#f0f0f0 25%,#e4e4e4 50%,#f0f0f0 75%)",
    backgroundSize: "600px 100%",
    animation: "sk-shimmer 1.4s infinite linear",
    ...style,
  }} />
);

// ─── Mini Bar Chart ───────────────────────────────────────────────────────────
function BarChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-1.5 h-20">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full relative flex items-end" style={{ height: 64 }}>
            <div
              className={`w-full rounded-t-md transition-all duration-700 ${d.color}`}
              style={{ height: `${Math.max((d.value / max) * 100, 4)}%` }}
            />
          </div>
          <span className="text-[9px] text-gray-400 truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Donut Chart (SVG) ────────────────────────────────────────────────────────
function DonutChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const size = 80;
  const r = 28;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  let offset = 0;
  const slices = data.map((d) => {
    const pct = d.value / total;
    const dash = pct * circumference;
    const gap = circumference - dash;
    const slice = { ...d, dash, gap, offset };
    offset += dash;
    return slice;
  });

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} className="flex-shrink-0 -rotate-90">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f3f4f6" strokeWidth="10" />
        {slices.map((s, i) => (
          <circle
            key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={s.color} strokeWidth="10"
            strokeDasharray={`${s.dash} ${s.gap}`}
            strokeDashoffset={-s.offset}
            className="transition-all duration-700"
          />
        ))}
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
          className="rotate-90" fill="#374151"
          style={{ fontSize: 13, fontWeight: 700, transform: `rotate(90deg)`, transformOrigin: `${cx}px ${cy}px` }}
        >
          {total}
        </text>
      </svg>
      <div className="flex flex-col gap-1.5 min-w-0">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-1.5 min-w-0">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
            <span className="text-xs text-gray-600 truncate">{d.label}</span>
            <span className="text-xs font-bold text-gray-800 ml-auto pl-2 flex-shrink-0">{d.value}</span>
          </div>
        ))}
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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative max-w-lg w-full" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-10 right-0 text-white/70 hover:text-white transition flex items-center gap-1.5 text-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          Tutup
        </button>
        <img src={url} alt="Bukti" className="w-full rounded-2xl shadow-2xl" />
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="mt-3 flex items-center justify-center gap-2 text-white/60 hover:text-white text-xs transition"
          onClick={e => e.stopPropagation()}>
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

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Page() {
  const [stats, setStats] = useState<Stats>();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [now, setNow] = useState("");
  const [photoModal, setPhotoModal] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);

  // Hanya ADMIN & ACCOUNTING boleh lihat omzet & profit
  const canSeeFinancials = userRole
    ? hasPermission(userRole, ["ADMIN", "ACCOUNTING"])
    : false;

  useEffect(() => {
    const d = new Date();
    setNow(d.toLocaleDateString("id-ID", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    }));

    const fetchAll = async () => {
      try {
        const [statsRes, transRes, meRes] = await Promise.all([
          fetch("/api/dashboard/stats"),
          fetch("/api/dashboard/transactions"),
          fetch("/api/auth/me"),
        ]);
        const [statsResult, transResult, meResult] = await Promise.all([
          statsRes.json(), transRes.json(), meRes.json(),
        ]);
        setStats(statsResult.data);
        setTransactions(transResult?.data || []);
        setUserRole(meResult.user?.role ?? null);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAll();
  }, []);

  // Data untuk bar chart top sales
  const salesBarData = (stats?.topSales || []).map((s, i) => ({
    label: s.name.split(" ")[0],
    value: s.total,
    color: ["bg-[#1a1a2e]", "bg-blue-400", "bg-emerald-400", "bg-violet-400", "bg-amber-400"][i] || "bg-gray-300",
  }));

  // Data untuk donut chart sumber
  const sourceColors = ["#1a1a2e", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];
  const sourceDonutData = (stats?.topSources || []).map((s, i) => ({
    label: s.name, value: s.total, color: sourceColors[i] || "#94a3b8",
  }));

  return (
    <DashboardLayout>
      <style>{`
        @keyframes sk-shimmer {
          0%   { background-position: -600px 0; }
          100% { background-position:  600px 0; }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fade-up { animation: fade-up 0.4s ease both; }
      `}</style>

      {photoModal && <PhotoModal url={photoModal} onClose={() => setPhotoModal(null)} />}

      <div className="space-y-5 max-w-6xl">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-end justify-between gap-3 fade-up">
          <div>
            {isLoading ? (
              <div className="flex flex-col gap-1.5">
                <Shimmer w={140} h={11} /><Shimmer w={100} h={20} style={{ marginTop: 4 }} />
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-400 font-medium capitalize">{now}</p>
                <h1 className="text-xl font-bold text-gray-900 mt-0.5 tracking-tight">Dashboard</h1>
              </>
            )}
          </div>
          <a href="/payment/create"
            className="inline-flex items-center gap-2 bg-[#1a1a2e] text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-[#16213e] transition active:scale-[0.98] shadow-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Buat Transaksi
          </a>
        </div>

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 fade-up" style={{ animationDelay: "0.05s" }}>
          {isLoading ? (
            Array(4).fill(0).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                <Shimmer w={70} h={11} /><Shimmer w={110} h={24} style={{ marginTop: 8 }} />
              </div>
            ))
          ) : (
            <>
              {/* Omzet — hanya ADMIN & ACCOUNTING */}
              {canSeeFinancials ? (
                <StatCard
                  label="Omzet Hari Ini"
                  value={`Rp ${(stats?.todayRevenue || 0).toLocaleString("id-ID")}`}
                  sub={`${stats?.todayTransactions || 0} transaksi`}
                  icon={<OmzetIcon />}
                  accent="emerald"
                />
              ) : (
                <StatCard
                  label="Transaksi Hari Ini"
                  value={stats?.todayTransactions || 0}
                  sub="total transaksi"
                  icon={<TrxIcon />}
                  accent="violet"
                />
              )}

              {/* Profit — hanya ADMIN & ACCOUNTING */}
              {canSeeFinancials ? (
                <StatCard
                  label="Profit Hari Ini"
                  value={`Rp ${(stats?.todayProfit || 0).toLocaleString("id-ID")}`}
                  sub="margin bersih"
                  icon={<ProfitIcon />}
                  accent="blue"
                />
              ) : (
                <StatCard
                  label="Laptop Ready"
                  value={stats?.laptopReady || 0}
                  sub="model tersedia"
                  icon={<LaptopIcon />}
                  accent="amber"
                />
              )}

              {/* Laptop Ready — semua */}
              <StatCard
                label="Laptop Ready"
                value={stats?.laptopReady || 0}
                sub={`${stats?.stockTotal || 0} total unit`}
                icon={<LaptopIcon />}
                accent="amber"
              />

              {/* Transaksi — semua */}
              <StatCard
                label="Transaksi Hari Ini"
                value={stats?.todayTransactions || 0}
                sub="transaksi selesai"
                icon={<TrxIcon />}
                accent="violet"
              />
            </>
          )}
        </div>

        {/* ── Charts Row ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 fade-up" style={{ animationDelay: "0.1s" }}>

          {/* Bar chart Top Sales */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-gray-500"><TrophyIcon /></span>
                <h2 className="font-bold text-gray-800 text-sm">Top Sales</h2>
              </div>
              <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">hari ini</span>
            </div>
            {isLoading ? (
              <div className="flex items-end gap-1.5 h-20">
                {[60, 80, 45, 70, 55].map((h, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full bg-gray-100 rounded-t-md animate-pulse" style={{ height: h }} />
                    <div className="h-2 w-full bg-gray-100 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            ) : salesBarData.length > 0 ? (
              <>
                <BarChart data={salesBarData} />
                <div className="mt-3 space-y-1.5 border-t border-gray-50 pt-3">
                  {stats?.topSales?.slice(0, 3).map((s, i) => (
                    <div key={s.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${["bg-[#1a1a2e]", "bg-blue-400", "bg-emerald-400"][i]}`} />
                        <span className="text-gray-600 truncate max-w-[100px]">{s.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-800">{s.total}x</span>
                        {canSeeFinancials && (
                          <span className="text-emerald-600 font-medium">
                            +Rp{s.profit.toLocaleString("id-ID")}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <EmptyState text="Belum ada data hari ini" />
            )}
          </div>

          {/* Donut chart Sumber Pembeli */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-gray-500"><SourceIcon /></span>
                <h2 className="font-bold text-gray-800 text-sm">Sumber Pembeli</h2>
              </div>
              <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">hari ini</span>
            </div>
            {isLoading ? (
              <div className="flex items-center gap-4">
                <Shimmer w={80} h={80} r="50%" />
                <div className="flex-1 space-y-2">
                  {[70, 55, 40].map((w, i) => <Shimmer key={i} w={w} h={11} />)}
                </div>
              </div>
            ) : sourceDonutData.length > 0 ? (
              <DonutChart data={sourceDonutData} />
            ) : (
              <EmptyState text="Belum ada data" />
            )}
          </div>

          {/* Laptop Terlaris */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-gray-500"><LaptopIcon /></span>
                <h2 className="font-bold text-gray-800 text-sm">Laptop Terlaris</h2>
              </div>
              <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">hari ini</span>
            </div>
            {isLoading ? (
              <div className="space-y-2">
                {[90, 70, 80, 60].map((w, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Shimmer w={20} h={20} r="6px" />
                    <Shimmer w={w} h={12} />
                    <Shimmer w={24} h={20} r="99px" style={{ marginLeft: "auto" }} />
                  </div>
                ))}
              </div>
            ) : stats?.topLaptop?.length ? (
              <div className="space-y-1">
                {stats.topLaptop.map((item, idx) => {
                  const max = stats.topLaptop[0]?.total || 1;
                  const pct = Math.round((item.total / max) * 100);
                  return (
                    <div key={item.name} className="group">
                      <div className="flex items-center gap-2 py-1.5">
                        <span className="text-sm w-5 text-center flex-shrink-0">
                          {["🥇", "🥈", "🥉"][idx] || <span className="text-xs text-gray-300">·</span>}
                        </span>
                        <p className="text-xs text-gray-700 truncate flex-1">{item.name}</p>
                        <span className="text-xs font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
                          {item.total}x
                        </span>
                      </div>
                      {/* Progress bar */}
                      <div className="ml-7 h-1 bg-gray-100 rounded-full overflow-hidden mb-1">
                        <div
                          className="h-full bg-[#1a1a2e]/70 rounded-full transition-all duration-700"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState text="Belum ada data" />
            )}
          </div>
        </div>

        {/* ── Recent Transactions ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden fade-up" style={{ animationDelay: "0.15s" }}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <h2 className="font-bold text-gray-800 text-sm">Transaksi Terbaru</h2>
            <a href="/dashboard/transactions"
              className="text-xs font-semibold text-gray-400 hover:text-gray-700 transition">
              Lihat Semua →
            </a>
          </div>

          <div className="divide-y divide-gray-50">
            {isLoading ? (
              [1, 2, 3].map((_, i) => (
                <div key={i} className="px-5 py-4 flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Shimmer w={100} h={14} /><Shimmer w={52} h={20} r="99px" />
                    </div>
                    <Shimmer w={130} h={11} />
                    <div className="flex gap-4 mt-2">
                      <div className="space-y-1"><Shimmer w={30} h={10} /><Shimmer w={80} h={15} /></div>
                      {canSeeFinancials && <div className="space-y-1"><Shimmer w={30} h={10} /><Shimmer w={60} h={15} /></div>}
                    </div>
                  </div>
                  <Shimmer w={35} h={11} />
                </div>
              ))
            ) : transactions.length === 0 ? (
              <div className="py-14 text-center">
                <p className="text-2xl mb-2">📭</p>
                <p className="text-gray-400 text-sm">Belum ada transaksi hari ini</p>
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

// ─── Transaction Row ──────────────────────────────────────────────────────────
function TransactionRow({
  item, onPhotoClick, canSeeFinancials,
}: {
  item: Transaction;
  onPhotoClick: (url: string) => void;
  canSeeFinancials: boolean;
}) {
  const statusMap: Record<string, string> = {
    PAID: "bg-emerald-50 text-emerald-700 border-emerald-200",
    PENDING: "bg-amber-50  text-amber-700  border-amber-200",
    CANCELLED: "bg-red-50    text-red-600    border-red-200",
  };
  return (
    <div className="px-5 py-4 hover:bg-gray-50/50 transition">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-800 text-sm">{item.customer_name}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusMap[item.status] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
              {item.status}
            </span>
          </div>
          <p className="text-gray-400 text-xs mt-0.5 truncate">{item.laptop_name}</p>
          <div className="flex items-center gap-4 mt-2">
            <div>
              <p className="text-xs text-gray-400">Total</p>
              <p className="text-sm font-bold text-gray-800">
                Rp{item.amount.toLocaleString("id-ID")}
              </p>
            </div>
            {/* Profit hanya untuk ADMIN & ACCOUNTING */}
            {canSeeFinancials && (
              <>
                <div className="h-5 w-px bg-gray-100" />
                <div>
                  <p className="text-xs text-gray-400">Profit</p>
                  <p className="text-sm font-semibold text-emerald-600">
                    +Rp{(item.other || 0).toLocaleString("id-ID")}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <p className="text-xs text-gray-300">
            {new Date(item.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
          </p>
          {item.payment_photo && (
            <button onClick={() => onPhotoClick(item.payment_photo!)} className="group">
              <img src={item.payment_photo} alt="bukti"
                className="w-12 h-12 rounded-lg object-cover border border-gray-200 group-hover:scale-105 group-hover:border-gray-400 transition-all" />
            </button>
          )}
          {item.latitude && item.longitude && (
            <a href={`https://maps.google.com/?q=${item.latitude},${item.longitude}`}
              target="_blank" rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-600 transition flex items-center gap-1">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              </svg>
              Lokasi
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
const accentMap: Record<string, { bg: string; icon: string; border: string }> = {
  emerald: { bg: "bg-emerald-50", icon: "text-emerald-600", border: "border-emerald-100" },
  blue: { bg: "bg-blue-50", icon: "text-blue-600", border: "border-blue-100" },
  violet: { bg: "bg-violet-50", icon: "text-violet-600", border: "border-violet-100" },
  amber: { bg: "bg-amber-50", icon: "text-amber-600", border: "border-amber-100" },
  slate: { bg: "bg-slate-50", icon: "text-slate-500", border: "border-slate-100" },
};

function StatCard({
  label, value, sub, icon, accent = "slate",
}: {
  label: string; value: string | number; sub?: string; icon: React.ReactNode; accent?: string;
}) {
  const a = accentMap[accent];
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400 font-medium">{label}</p>
          <p className="font-extrabold mt-1 text-lg tracking-tight text-gray-900 truncate">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border ${a.bg} ${a.icon} ${a.border}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────
function EmptyState({ text }: { text: string }) {
  return (
    <div className="py-8 text-center">
      <p className="text-gray-300 text-sm">{text}</p>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const OmzetIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></svg>;
const ProfitIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>;
const TrxIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>;
const LaptopIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>;
const TrophyIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="8 6 2 6 2 12a6 6 0 006 6" /><polyline points="16 6 22 6 22 12a6 6 0 01-6 6" /><path d="M12 17v4m-4 0h8M12 3v14" /></svg>;
const SourceIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></svg>;