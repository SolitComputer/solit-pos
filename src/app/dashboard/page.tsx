"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";

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

const Skeleton = ({ className }: { className: string }) => (
  <div className={`animate-pulse bg-gray-100 rounded-xl ${className}`} />
);

function PhotoModal({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="relative max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-white/70 hover:text-white transition flex items-center gap-1.5 text-sm"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          Tutup
        </button>
        <img
          src={url}
          alt="Bukti pembayaran"
          className="w-full rounded-2xl shadow-2xl"
        />
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex items-center justify-center gap-2 text-white/60 hover:text-white text-xs transition"
          onClick={(e) => e.stopPropagation()}
        >
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

export default function Page() {
  const [stats, setStats] = useState<Stats>();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [now, setNow] = useState("");
  const [photoModal, setPhotoModal] = useState<string | null>(null);

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
    <DashboardLayout>
      {photoModal && <PhotoModal url={photoModal} onClose={() => setPhotoModal(null)} />}

      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs text-gray-400 font-medium capitalize">{now}</p>
            <h1 className="text-xl font-bold text-gray-900 mt-0.5 tracking-tight">Dashboard</h1>
          </div>
          <a
            href="/payment/create"
            className="inline-flex items-center gap-2 bg-[#1a1a2e] text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-[#16213e] transition active:scale-[0.98]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Buat Transaksi
          </a>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {isLoading ? (
            Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-24" />)
          ) : (
            <>
              <StatCard label="Omzet Hari Ini" value={`Rp ${(stats?.todayRevenue || 0).toLocaleString("id-ID")}`} icon={<OmzetIcon />} accent="emerald" span2 />
              <StatCard label="Profit Hari Ini" value={`Rp ${(stats?.todayProfit || 0).toLocaleString("id-ID")}`} icon={<ProfitIcon />} accent="blue" span2 />
              <StatCard label="Transaksi" value={stats?.todayTransactions || 0} icon={<TrxIcon />} accent="violet" />
              <StatCard label="Laptop Ready" value={stats?.laptopReady || 0} icon={<LaptopIcon />} accent="amber" />
              <StatCard label="Total Stok" value={stats?.stockTotal || 0} icon={<StokIcon />} accent="slate" />
            </>
          )}
        </div>

        {/* Analytics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <AnalyticsCard title="Top Sales Hari Ini" icon={<TrophyIcon />}>
            {isLoading ? (
              Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-14" />)
            ) : stats?.topSales?.length ? (
              <div className="space-y-2">
                {stats.topSales.map((item, idx) => (
                  <div key={item.name} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${idx === 0 ? "bg-amber-100 text-amber-700" : idx === 1 ? "bg-slate-100 text-slate-600" : "bg-orange-50 text-orange-600"
                      }`}>{idx + 1}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800 text-sm truncate">{item.name}</p>
                      <p className="text-xs text-gray-400">{item.total} transaksi</p>
                    </div>
                    <p className="text-xs font-semibold text-emerald-600 flex-shrink-0">+Rp{item.profit.toLocaleString("id-ID")}</p>
                  </div>
                ))}
              </div>
            ) : <EmptyState text="Belum ada data hari ini" />}
          </AnalyticsCard>

          <AnalyticsCard title="Sumber Pembeli" icon={<SourceIcon />}>
            {isLoading ? (
              Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-10" />)
            ) : stats?.topSources?.length ? (
              <div className="space-y-2.5">
                {stats.topSources.map((item, idx) => {
                  const max = stats.topSources[0]?.total || 1;
                  const pct = Math.round((item.total / max) * 100);
                  const colors = ["bg-[#1a1a2e]", "bg-blue-400", "bg-emerald-400", "bg-gray-300"];
                  return (
                    <div key={item.name} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-700 font-medium">{item.name}</span>
                        <span className="text-gray-500 font-semibold">{item.total}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-700 ${colors[idx] || "bg-gray-300"}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : <EmptyState text="Belum ada data" />}
          </AnalyticsCard>

          <AnalyticsCard title="Laptop Terlaris" icon={<LaptopIcon />}>
            {isLoading ? (
              Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-10" />)
            ) : stats?.topLaptop?.length ? (
              <div className="space-y-1">
                {stats.topLaptop.map((item, idx) => (
                  <div key={item.name} className="flex items-center gap-2.5 py-2 px-1 rounded-lg hover:bg-gray-50 transition">
                    <span className="text-sm w-5 text-center flex-shrink-0">{["🥇", "🥈", "🥉"][idx] || "·"}</span>
                    <p className="text-sm text-gray-700 truncate flex-1">{item.name}</p>
                    <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0">{item.total}x</span>
                  </div>
                ))}
              </div>
            ) : <EmptyState text="Belum ada data" />}
          </AnalyticsCard>
        </div>

        {/* Recent Transactions */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <h2 className="font-bold text-gray-800 text-sm">Transaksi Terbaru</h2>
            <a href="/dashboard/transactions" className="text-xs font-semibold text-gray-400 hover:text-gray-700 transition">
              Lihat Semua →
            </a>
          </div>
          <div className="divide-y divide-gray-50">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-20" />)}
              </div>
            ) : transactions.length === 0 ? (
              <div className="py-14 text-center">
                <p className="text-2xl mb-2">📭</p>
                <p className="text-gray-400 text-sm">Belum ada transaksi hari ini</p>
              </div>
            ) : (
              transactions.map((item) => (
                <TransactionRow key={item.id} item={item} onPhotoClick={setPhotoModal} />
              ))
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function TransactionRow({ item, onPhotoClick }: { item: Transaction; onPhotoClick: (url: string) => void }) {
  const statusMap: Record<string, string> = {
    PAID: "bg-emerald-50 text-emerald-700 border-emerald-200",
    PENDING: "bg-amber-50 text-amber-700 border-amber-200",
    CANCELLED: "bg-red-50 text-red-600 border-red-200",
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
              <p className="text-sm font-bold text-gray-800">Rp{item.amount.toLocaleString("id-ID")}</p>
            </div>
            <div className="h-5 w-px bg-gray-100" />
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
            <button onClick={() => onPhotoClick(item.payment_photo!)} className="group">
              <img
                src={item.payment_photo}
                alt="bukti"
                className="w-12 h-12 rounded-lg object-cover border border-gray-200 group-hover:scale-105 group-hover:border-gray-400 transition-all"
              />
            </button>
          )}
          {item.latitude && item.longitude && (
            <a
              href={`https://maps.google.com/?q=${item.latitude},${item.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-600 transition flex items-center gap-1"
            >
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

const accentMap: Record<string, { card: string; icon: string; text: string }> = {
  emerald: { card: "bg-emerald-50", icon: "text-emerald-600", text: "text-emerald-800" },
  blue: { card: "bg-blue-50", icon: "text-blue-600", text: "text-blue-800" },
  violet: { card: "bg-violet-50", icon: "text-violet-600", text: "text-violet-800" },
  amber: { card: "bg-amber-50", icon: "text-amber-600", text: "text-amber-800" },
  slate: { card: "bg-slate-50", icon: "text-slate-500", text: "text-slate-700" },
};

function StatCard({ label, value, icon, accent = "slate", span2 }: {
  label: string; value: string | number; icon: React.ReactNode; accent?: string; span2?: boolean;
}) {
  const a = accentMap[accent];
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-shadow ${span2 ? "col-span-2 lg:col-span-2" : "col-span-1"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400 font-medium">{label}</p>
          <p className={`font-extrabold mt-1 tracking-tight text-gray-900 ${span2 ? "text-xl lg:text-2xl" : "text-xl"}`}>
            {value}
          </p>
        </div>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${a.card} ${a.icon}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function AnalyticsCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-gray-500">{icon}</span>
        <h2 className="font-bold text-gray-800 text-sm">{title}</h2>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="py-6 text-center"><p className="text-gray-300 text-sm">{text}</p></div>;
}

// Icons
const OmzetIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></svg>;
const ProfitIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>;
const TrxIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>;
const LaptopIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>;
const StokIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /></svg>;
const TrophyIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="8 6 2 6 2 12a6 6 0 006 6" /><polyline points="16 6 22 6 22 12a6 6 0 01-6 6" /><path d="M12 17v4m-4 0h8M12 3v14" /></svg>;
const SourceIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></svg>;