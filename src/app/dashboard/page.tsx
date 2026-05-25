"use client";

import { useEffect, useState } from "react";

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

// ── Skeleton ──────────────────────────────────────────────────────────────
const Skeleton = ({ className }: { className: string }) => (
  <div className={`animate-pulse bg-gray-100 rounded-xl ${className}`} />
);

// ── Main ──────────────────────────────────────────────────────────────────
export default function Page() {
  const [stats, setStats] = useState<Stats>();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [now, setNow] = useState("");

  useEffect(() => {
    const d = new Date();
    setNow(d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));

    const fetchData = async () => {
      try {
        const [statsRes, transRes] = await Promise.all([
          fetch("/api/dashboard/stats"),
          fetch("/api/dashboard/transactions"),
        ]);
        const statsResult = await statsRes.json();
        const transResult = await transRes.json();
        setStats(statsResult.data);
        setTransactions(transResult?.data || []);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <main className="p-5 lg:p-7 bg-gray-50 min-h-screen space-y-6">

      {/* ── Page Header ── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">{now}</p>
          <h1 className="text-2xl font-bold text-gray-900 mt-0.5 tracking-tight">Dashboard</h1>
        </div>
        <a
          href="/payment/create"
          className="inline-flex items-center gap-2 bg-[#0f172a] text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-[#1e293b] transition shadow-sm active:scale-[0.98]"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Buat Transaksi
        </a>
      </div>

      {/* ── Stats Grid ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {isLoading ? (
          Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <StatCard
              label="Omzet Hari Ini"
              value={`Rp ${(stats?.todayRevenue || 0).toLocaleString("id-ID")}`}
              icon="💰"
              accent="emerald"
              span2
            />
            <StatCard
              label="Profit Hari Ini"
              value={`Rp ${(stats?.todayProfit || 0).toLocaleString("id-ID")}`}
              icon="📈"
              accent="blue"
              span2
            />
            <StatCard label="Transaksi" value={stats?.todayTransactions || 0} icon="🧾" accent="violet" />
            <StatCard label="Laptop Ready" value={stats?.laptopReady || 0} icon="💻" accent="amber" />
            <StatCard label="Total Stok" value={stats?.stockTotal || 0} icon="📦" accent="slate" />
          </>
        )}
      </div>

      {/* ── Analytics Row ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Top Sales */}
        <AnalyticsCard title="Top Sales Hari Ini" icon="🏆">
          {isLoading ? (
            Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-14" />)
          ) : stats?.topSales?.length ? (
            stats.topSales.map((item, idx) => (
              <div key={item.name} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${idx === 0 ? "bg-amber-100 text-amber-700" :
                    idx === 1 ? "bg-slate-100 text-slate-600" :
                      "bg-orange-50 text-orange-600"
                  }`}>
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 text-sm truncate">{item.name}</p>
                  <p className="text-xs text-gray-400">{item.total} transaksi</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-semibold text-emerald-600">
                    +Rp{item.profit.toLocaleString("id-ID")}
                  </p>
                </div>
              </div>
            ))
          ) : <EmptyState text="Belum ada data hari ini" />}
        </AnalyticsCard>

        {/* Top Source */}
        <AnalyticsCard title="Sumber Pembeli" icon="📡">
          {isLoading ? (
            Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-10" />)
          ) : stats?.topSources?.length ? (
            <div className="space-y-2">
              {stats.topSources.map((item, idx) => {
                const max = stats.topSources[0]?.total || 1;
                const pct = Math.round((item.total / max) * 100);
                return (
                  <div key={item.name} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700 font-medium">{item.name}</span>
                      <span className="text-gray-500 font-semibold">{item.total}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${idx === 0 ? "bg-blue-500" :
                            idx === 1 ? "bg-violet-400" :
                              idx === 2 ? "bg-emerald-400" : "bg-gray-300"
                          }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <EmptyState text="Belum ada data" />}
        </AnalyticsCard>

        {/* Top Laptop */}
        <AnalyticsCard title="Laptop Terlaris" icon="💻">
          {isLoading ? (
            Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-10" />)
          ) : stats?.topLaptop?.length ? (
            stats.topLaptop.map((item, idx) => (
              <div key={item.name} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition">
                <span className="text-lg">{["🥇", "🥈", "🥉"][idx] || "•"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">{item.name}</p>
                </div>
                <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  {item.total}x
                </span>
              </div>
            ))
          ) : <EmptyState text="Belum ada data" />}
        </AnalyticsCard>
      </div>

      {/* ── Recent Transactions ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
          <div className="flex items-center gap-2">
            <span className="text-base">🧾</span>
            <h2 className="font-bold text-gray-800">Transaksi Terbaru</h2>
          </div>
          <a href="/dashboard/transactions" className="text-xs font-semibold text-gray-400 hover:text-gray-700 transition">
            Lihat Semua →
          </a>
        </div>

        <div className="divide-y divide-gray-50">
          {isLoading ? (
            <div className="p-5 space-y-3">
              {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-20" />)}
            </div>
          ) : transactions.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-3xl mb-2">📭</p>
              <p className="text-gray-400 text-sm">Belum ada transaksi hari ini</p>
            </div>
          ) : (
            transactions.map((item) => (
              <TransactionRow key={item.id} item={item} />
            ))
          )}
        </div>
      </div>
    </main>
  );
}

// ── Transaction Row ───────────────────────────────────────────────────────
function TransactionRow({ item }: { item: Transaction }) {
  const statusColors: Record<string, string> = {
    PAID: "bg-emerald-50 text-emerald-700 border-emerald-200",
    PENDING: "bg-amber-50 text-amber-700 border-amber-200",
    CANCELLED: "bg-red-50 text-red-600 border-red-200",
  };
  const statusColor = statusColors[item.status] || "bg-gray-100 text-gray-600 border-gray-200";

  return (
    <div className="px-5 py-4 hover:bg-gray-50/50 transition group">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-800 text-sm">{item.customer_name}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusColor}`}>
              {item.status}
            </span>
          </div>
          <p className="text-gray-400 text-xs mt-0.5 truncate">{item.laptop_name}</p>
          <div className="flex items-center gap-4 mt-2.5">
            <div>
              <p className="text-xs text-gray-400">Total</p>
              <p className="text-sm font-bold text-gray-800">Rp{item.amount.toLocaleString("id-ID")}</p>
            </div>
            <div className="h-6 w-px bg-gray-100" />
            <div>
              <p className="text-xs text-gray-400">Profit</p>
              <p className="text-sm font-semibold text-emerald-600">+Rp{(item.other || 0).toLocaleString("id-ID")}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <p className="text-xs text-gray-300">
            {new Date(item.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
          </p>
          {item.payment_photo && (
            <a href={item.payment_photo} target="_blank" rel="noopener noreferrer">
              <img
                src={item.payment_photo}
                alt="bukti"
                className="w-12 h-12 rounded-lg object-cover border border-gray-200 hover:scale-105 transition"
              />
            </a>
          )}
          {item.latitude && item.longitude && (
            <a
              href={`https://maps.google.com/?q=${item.latitude},${item.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-600 transition flex items-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              </svg>
              Lokasi
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────
const accentMap: Record<string, string> = {
  emerald: "border-emerald-100 bg-emerald-50",
  blue: "border-blue-100 bg-blue-50",
  violet: "border-violet-100 bg-violet-50",
  amber: "border-amber-100 bg-amber-50",
  slate: "border-slate-100 bg-slate-50",
};
const accentText: Record<string, string> = {
  emerald: "text-emerald-700",
  blue: "text-blue-700",
  violet: "text-violet-700",
  amber: "text-amber-700",
  slate: "text-slate-700",
};

function StatCard({
  label, value, icon, accent = "slate", span2,
}: {
  label: string;
  value: string | number;
  icon: string;
  accent?: string;
  span2?: boolean;
}) {
  return (
    <div className={`
      bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition
      ${span2 ? "col-span-2 lg:col-span-2" : "col-span-1"}
    `}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-gray-400 font-medium">{label}</p>
          <p className={`text-xl font-black mt-1 tracking-tight ${span2 ? "text-2xl" : ""} text-gray-900`}>
            {value}
          </p>
        </div>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base border ${accentMap[accent]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

// ── Analytics Card ────────────────────────────────────────────────────────
function AnalyticsCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <span>{icon}</span>
        <h2 className="font-bold text-gray-800 text-sm">{title}</h2>
      </div>
      {children}
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────
function EmptyState({ text }: { text: string }) {
  return (
    <div className="py-6 text-center">
      <p className="text-gray-300 text-sm">{text}</p>
    </div>
  );
}