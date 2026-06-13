"use client";

import { useState, useEffect } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface LaptopEntry {
  laptop_name: string;
  count: number;       // jumlah UNIT terjual (bukan jumlah transaksi)
  revenue: number;
  profit: number;
  transactions: {
    id: string;
    invoice_number: string;
    customer_name: string;
    laptop_name: string;
    units_sold: number; // unit yang dibeli customer ini dalam 1 transaksi
    deal_price?: number;
    amount?: number;
    paid_at?: string;
    created_at: string;
    source_platform?: string;
    sales_name?: string;
  }[];
}

interface PeriodData {
  label: string;
  date: string;
  count: number;
  revenue: number;
  profit: number;
  laptops: LaptopEntry[];
}

interface TransactionDetail {
  today: { revenue: number; profit: number; count: number };
  daily: PeriodData[];
  monthly: PeriodData[];
  yearly: PeriodData[];
}

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtRupiah = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");
const fmtShort = (n: number): string => {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}Jt`;
  if (n >= 1_000) return `Rp ${(n / 1_000).toFixed(0)}Rb`;
  return `Rp ${n}`;
};

type TabKey = "daily" | "monthly" | "yearly";

// ── Laptop Icon ───────────────────────────────────────────────────────────────
const LaptopSVG = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-500 flex-shrink-0">
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>
);

// ── Laptop Drill-Down Row ─────────────────────────────────────────────────────
function LaptopRow({
  entry,
  maxCount,
  canSeeFinancials,
}: {
  entry: LaptopEntry;
  maxCount: number;
  canSeeFinancials: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const pct = Math.round((entry.count / Math.max(maxCount, 1)) * 100);

  return (
    <div className="rounded-xl border border-gray-100 overflow-hidden transition-all duration-200">
      {/* ── Header Row ── */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
      >
        {/* Laptop icon */}
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center flex-shrink-0">
          <LaptopSVG size={13} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-800 truncate">{entry.laptop_name}</p>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-gray-500 to-gray-700 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="text-right flex-shrink-0 space-y-0.5">
          <div className="flex items-center justify-end gap-1.5">
            {/* ✅ Menampilkan jumlah UNIT terjual, bukan jumlah transaksi */}
            <span className="text-[10px] font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full">
              {entry.count} unit terjual
            </span>
          </div>
          {canSeeFinancials && (
            <p className="text-[10px] text-gray-500">{fmtShort(entry.revenue)}</p>
          )}
        </div>

        {/* Chevron */}
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`flex-shrink-0 text-gray-400 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* ── Expanded Transactions ── */}
      {expanded && (
        <div className="border-t border-gray-100 divide-y divide-gray-50 bg-gray-50/50">
          {entry.transactions.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">Tidak ada detail transaksi</p>
          ) : (
            entry.transactions.map((tx) => {
              const rev = Number(tx.deal_price || tx.amount || 0);
              const txDate = new Date(tx.paid_at || tx.created_at);
              const dateStr = txDate.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
              const timeStr = txDate.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

              return (
                <div key={tx.id} className="px-3 py-2.5 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">

                    {/* ── Customer name ── */}
                    <p className="text-[11px] font-semibold text-gray-700 truncate">
                      {tx.customer_name}
                    </p>

                    {/* ✅ Laptop yang dibeli + jumlah unit dalam transaksi ini */}
                    <div className="flex items-center gap-1 mt-0.5">
                      <LaptopSVG size={9} />
                      <p className="text-[10px] text-gray-600 font-medium truncate">
                        {tx.laptop_name}
                      </p>
                      {/* ✅ Tampilkan unit_sold jika > 1 (multi-unit) */}
                      {tx.units_sold > 1 && (
                        <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full flex-shrink-0">
                          {tx.units_sold} unit
                        </span>
                      )}
                    </div>

                    {/* Invoice number */}
                    <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                      {tx.invoice_number}
                    </p>

                    {/* Sales name & platform */}
                    {tx.sales_name && (
                      <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                        {tx.sales_name}
                        {tx.source_platform && (
                          <span className="text-gray-300">·</span>
                        )}
                        {tx.source_platform && (
                          <span className="text-gray-400">{tx.source_platform}</span>
                        )}
                      </p>
                    )}
                  </div>

                  {/* ── Amount & Date ── */}
                  <div className="text-right flex-shrink-0">
                    {canSeeFinancials && (
                      <p className="text-xs font-bold text-gray-800">{fmtRupiah(rev)}</p>
                    )}
                    <p className="text-[10px] text-gray-400 mt-0.5">{dateStr}</p>
                    <p className="text-[10px] text-gray-400">{timeStr}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ── Period Section ─────────────────────────────────────────────────────────────
function PeriodSection({
  period,
  canSeeFinancials,
}: {
  period: PeriodData;
  canSeeFinancials: boolean;
}) {
  const maxCount = period.laptops[0]?.count || 1;

  // ✅ Hitung total unit terjual di periode ini (bukan jumlah transaksi)
  const totalUnitsSold = period.laptops.reduce((sum, l) => sum + l.count, 0);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Period Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-gray-800">{period.label}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {period.count} transaksi
            {/* ✅ Tambah info unit terjual jika berbeda dari jumlah transaksi */}
            {totalUnitsSold !== period.count && (
              <span className="text-indigo-500 font-semibold"> · {totalUnitsSold} unit terjual</span>
            )}
            {canSeeFinancials && ` · ${fmtShort(period.revenue)} omzet`}
          </p>
        </div>
        {canSeeFinancials && period.profit > 0 && (
          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-full">
            +{fmtShort(period.profit)} profit
          </span>
        )}
      </div>

      {/* Laptop List */}
      <div className="p-3 space-y-2">
        {period.laptops.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">
            Tidak ada laptop terjual di periode ini
          </p>
        ) : (
          period.laptops.map((entry) => (
            <LaptopRow
              key={entry.laptop_name}
              entry={entry}
              maxCount={maxCount}
              canSeeFinancials={canSeeFinancials}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────
export function TransactionDetailModal({
  isOpen,
  onClose,
  canSeeFinancials = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  canSeeFinancials?: boolean;
}) {
  const [data, setData] = useState<TransactionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("daily");

  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      setIsLoading(true);
      try {
        const res = await fetch("/api/dashboard/transaction-detail");
        const result = await res.json();
        if (result.success) setData(result.data);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const tabs: { key: TabKey; label: string }[] = [
    { key: "daily", label: "Harian" },
    { key: "monthly", label: "Bulanan" },
    { key: "yearly", label: "Tahunan" },
  ];

  const activeData =
    activeTab === "daily" ? data?.daily :
      activeTab === "monthly" ? data?.monthly :
        data?.yearly;

  // ✅ Hitung total unit hari ini dari semua laptop entries
  const todayTotalUnits = data?.daily?.[0]?.laptops?.reduce((sum, l) => sum + l.count, 0) ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">Detail Transaksi</h2>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
              Laptop terjual per hari, bulan, dan tahun
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-gray-100 rounded-xl h-24 animate-pulse" />
              ))}
            </div>
          ) : data ? (
            <div className="p-5 sm:p-6 space-y-5">

              {/* ── Summary Cards ── */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-3 border border-gray-200">
                  <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Transaksi Hari Ini</p>
                  <p className="font-bold text-lg text-gray-900 mt-1 leading-none">{data.today.count}</p>
                  <p className="text-[10px] text-gray-400 mt-1">transaksi</p>
                </div>

                {/* ✅ Card 2: Unit terjual hari ini (selalu tampil, bukan hanya finansial) */}
                <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-xl p-3 border border-indigo-200">
                  <p className="text-[10px] text-indigo-700 font-semibold uppercase tracking-wider">Unit Terjual</p>
                  <p className="font-bold text-lg text-indigo-900 mt-1 leading-none">{todayTotalUnits}</p>
                  <p className="text-[10px] text-indigo-400 mt-1">unit hari ini</p>
                </div>

                {/* Card 3: Omzet (finansial) atau Tahun ini (non-finansial) */}
                {canSeeFinancials ? (
                  <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl p-3 border border-emerald-200">
                    <p className="text-[10px] text-emerald-700 font-semibold uppercase tracking-wider">Omzet Hari Ini</p>
                    <p className="font-bold text-sm text-emerald-900 mt-1">{fmtShort(data.today.revenue)}</p>
                    <p className="text-[9px] text-emerald-600 mt-0.5">{fmtRupiah(data.today.revenue)}</p>
                  </div>
                ) : (
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-3 border border-blue-200">
                    <p className="text-[10px] text-blue-700 font-semibold uppercase tracking-wider">Tahun Ini</p>
                    <p className="font-bold text-lg text-blue-900 mt-1 leading-none">
                      {data.yearly[0]?.count ?? 0}
                    </p>
                    <p className="text-[10px] text-blue-400 mt-1">transaksi</p>
                  </div>
                )}
              </div>

              {/* ── Tabs ── */}
              <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${activeTab === tab.key
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                      }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* ── Tab Content ── */}
              <div className="space-y-3">
                {!activeData || activeData.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-3xl mb-2">📭</p>
                    <p className="text-sm text-gray-500">Belum ada data transaksi</p>
                  </div>
                ) : (
                  activeData.map((period) => (
                    <PeriodSection
                      key={period.date}
                      period={period}
                      canSeeFinancials={canSeeFinancials}
                    />
                  ))
                )}
              </div>

            </div>
          ) : (
            <div className="p-6 text-center text-gray-500 text-sm">
              Gagal memuat data
            </div>
          )}
        </div>
      </div>
    </div>
  );
}