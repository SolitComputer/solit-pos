"use client";

import { useState, useEffect } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface LaptopEntry {
  laptop_name: string;
  count: number;
  revenue: number;
  profit: number;
  transactions: {
    id: string;
    invoice_number: string;
    customer_name: string;
    laptop_name: string;
    units_sold: number;
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
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400 flex-shrink-0">
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
    <div className="tdm-laptop-row rounded-xl overflow-hidden">
      {/* Header Row */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="tdm-laptop-btn w-full flex items-center gap-3 px-3 py-2.5 transition-colors text-left"
      >
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#F1F5F9" }}>
          <LaptopSVG size={12} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate" style={{ color: "#0F172A" }}>{entry.laptop_name}</p>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "#F1F5F9" }}>
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: "linear-gradient(90deg, #6366F1, #818CF8)" }} />
            </div>
          </div>
        </div>
        <div className="text-right flex-shrink-0 space-y-0.5">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#EEF2FF", color: "#6366F1" }}>
            {entry.count} unit terjual
          </span>
          {canSeeFinancials && (
            <p className="text-[9px] font-medium" style={{ color: "#94A3B8" }}>{fmtShort(entry.revenue)}</p>
          )}
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2"
          className={`flex-shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Expanded Transactions */}
      {expanded && (
        <div style={{ borderTop: "1px solid #F1F5F9" }}>
          {entry.transactions.length === 0 ? (
            <p className="text-xs text-center py-4" style={{ color: "#94A3B8" }}>Tidak ada detail transaksi</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {entry.transactions.map((tx) => {
                const rev = Number(tx.deal_price || tx.amount || 0);
                const txDate = new Date(tx.paid_at || tx.created_at);
                const dateStr = txDate.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
                const timeStr = txDate.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
                return (
                  <div key={tx.id} className="tdm-tx-item px-3 py-2.5 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold truncate" style={{ color: "#0F172A" }}>{tx.customer_name}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <LaptopSVG size={9} />
                        <p className="text-[10px] font-medium truncate" style={{ color: "#64748B" }}>{tx.laptop_name}</p>
                        {tx.units_sold > 1 && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                            style={{ background: "#EEF2FF", color: "#6366F1" }}>
                            {tx.units_sold} unit
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] font-mono mt-0.5" style={{ color: "#94A3B8" }}>{tx.invoice_number}</p>
                      {tx.sales_name && (
                        <p className="text-[10px] mt-0.5 flex items-center gap-1" style={{ color: "#94A3B8" }}>
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
                          </svg>
                          {tx.sales_name}
                          {tx.source_platform && <><span style={{ color: "#E2E8F0" }}>·</span><span>{tx.source_platform}</span></>}
                        </p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      {canSeeFinancials && <p className="text-xs font-bold" style={{ color: "#0F172A" }}>{fmtRupiah(rev)}</p>}
                      <p className="text-[10px]" style={{ color: "#94A3B8" }}>{dateStr}</p>
                      <p className="text-[10px]" style={{ color: "#94A3B8" }}>{timeStr}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Period Section ─────────────────────────────────────────────────────────────
function PeriodSection({ period, canSeeFinancials }: { period: PeriodData; canSeeFinancials: boolean }) {
  const maxCount = period.laptops[0]?.count || 1;
  const totalUnitsSold = period.laptops.reduce((sum, l) => sum + l.count, 0);

  return (
    <div className="tdm-period-card rounded-2xl overflow-hidden">
      {/* Period Header */}
      <div className="px-4 py-3 flex items-center justify-between" style={{ background: "linear-gradient(135deg, #F8FAFC 0%, #F0F4FF 100%)", borderBottom: "1px solid #E2E8F0" }}>
        <div>
          <p className="text-xs font-bold" style={{ color: "#0F172A" }}>{period.label}</p>
          <p className="text-[10px] mt-0.5" style={{ color: "#94A3B8" }}>
            {period.count} transaksi
            {totalUnitsSold !== period.count && (
              <span className="font-bold" style={{ color: "#6366F1" }}> · {totalUnitsSold} unit terjual</span>
            )}
            {canSeeFinancials && <span> · {fmtShort(period.revenue)} omzet</span>}
          </p>
        </div>
        {canSeeFinancials && period.profit > 0 && (
          <span className="text-[10px] font-bold px-2 py-1 rounded-full"
            style={{ background: "#ECFDF5", color: "#059669", border: "1px solid #A7F3D0" }}>
            +{fmtShort(period.profit)} profit
          </span>
        )}
      </div>
      {/* Laptop List */}
      <div className="p-3 space-y-2">
        {period.laptops.length === 0 ? (
          <p className="text-xs text-center py-6" style={{ color: "#94A3B8" }}>Tidak ada laptop terjual di periode ini</p>
        ) : (
          period.laptops.map((entry) => (
            <LaptopRow key={entry.laptop_name} entry={entry} maxCount={maxCount} canSeeFinancials={canSeeFinancials} />
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
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOpen) setTimeout(() => setVisible(true), 10);
    else setVisible(false);
  }, [isOpen]);

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

  const todayTotalUnits = data?.daily?.[0]?.laptops?.reduce((sum, l) => sum + l.count, 0) ?? 0;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        .tdm-overlay { font-family: 'Inter', sans-serif; }

        .tdm-shell {
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          box-shadow: 0 32px 80px rgba(15,23,42,0.14), 0 8px 24px rgba(15,23,42,0.08);
        }
        .tdm-header {
          background: linear-gradient(135deg, #F8FAFF 0%, #EEF2FF 100%);
          border-bottom: 1px solid #E8EFFE;
        }
        .tdm-stat {
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          box-shadow: 0 1px 4px rgba(15,23,42,0.06);
          transition: box-shadow 0.2s, transform 0.2s;
        }
        .tdm-stat:hover { box-shadow: 0 4px 20px rgba(15,23,42,0.1); transform: translateY(-2px); }

        .tdm-tabs-wrap { background: #F1F5F9; border-radius: 14px; padding: 4px; }
        .tdm-tab-active {
          background: #FFFFFF; color: #6366F1; font-weight: 700;
          box-shadow: 0 2px 8px rgba(99,102,241,0.18), 0 1px 3px rgba(15,23,42,0.08);
        }
        .tdm-tab-inactive { color: #94A3B8; font-weight: 500; }
        .tdm-tab-inactive:hover { color: #475569; background: rgba(255,255,255,0.6); }

        .tdm-period-card {
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          box-shadow: 0 1px 3px rgba(15,23,42,0.05);
        }

        .tdm-laptop-row {
          border: 1px solid #F1F5F9;
          background: #FAFBFF;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .tdm-laptop-row:hover { border-color: #C7D2FE; box-shadow: 0 2px 8px rgba(99,102,241,0.07); }
        .tdm-laptop-btn:hover { background: #F8FAFC; }

        .tdm-tx-item { background: #FFFFFF; }
        .tdm-tx-item:hover { background: #F8FAFC; }

        .tdm-scroll::-webkit-scrollbar { width: 4px; }
        .tdm-scroll::-webkit-scrollbar-track { background: transparent; }
        .tdm-scroll::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 4px; }

        .tdm-shimmer {
          background: linear-gradient(90deg, #F8FAFC 25%, #EEF2FF 50%, #F8FAFC 75%);
          background-size: 200% 100%;
          animation: tdm-shimmer 1.5s infinite; border-radius: 12px;
        }
        @keyframes tdm-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }

        .tdm-enter { opacity: 0; transform: scale(0.97) translateY(16px); }
        .tdm-visible {
          opacity: 1; transform: scale(1) translateY(0);
          transition: opacity 0.28s ease, transform 0.28s cubic-bezier(0.34,1.25,0.64,1);
        }
        .tdm-close { background: #F1F5F9; color: #94A3B8; transition: background 0.2s, color 0.2s; }
        .tdm-close:hover { background: #FEE2E2; color: #EF4444; }
        .tdm-handle { background: #CBD5E1; }
        .tdm-section-label { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #94A3B8; }
      `}</style>

      <div
        className="tdm-overlay fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(6px)" }}
        onClick={onClose}
      >
        <div
          className={`tdm-shell relative w-full sm:max-w-lg max-h-[92vh] sm:max-h-[88vh] flex flex-col rounded-t-3xl sm:rounded-2xl overflow-hidden ${visible ? "tdm-visible" : "tdm-enter"}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="tdm-handle w-10 h-1 rounded-full" />
          </div>

          {/* Header */}
          <div className="tdm-header flex items-center justify-between px-5 sm:px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)", boxShadow: "0 4px 14px rgba(99,102,241,0.35)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
                  <rect x="9" y="3" width="6" height="4" rx="1"/>
                  <line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>
                </svg>
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold" style={{ color: "#0F172A" }}>Detail Transaksi</h2>
                <p className="text-xs font-medium" style={{ color: "#94A3B8" }}>Laptop terjual per hari, bulan, dan tahun</p>
              </div>
            </div>
            <button onClick={onClose} className="tdm-close w-8 h-8 rounded-xl flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="tdm-scroll flex-1 overflow-y-auto" style={{ background: "#F8FAFC" }}>
            {isLoading ? (
              <div className="p-5 space-y-3">
                <div className="grid grid-cols-3 gap-3">{[1,2,3].map(i=><div key={i} className="tdm-shimmer h-24"/>)}</div>
                <div className="space-y-2 pt-2">{[1,2,3].map(i=><div key={i} className="tdm-shimmer h-20"/>)}</div>
              </div>
            ) : data ? (
              <div className="p-5 space-y-4">

                {/* Summary Cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="tdm-stat rounded-2xl overflow-hidden">
                    <div className="h-1" style={{ background: "linear-gradient(90deg, #64748B, #94A3B8)" }} />
                    <div className="p-3">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2.5" style={{ background: "#F1F5F9" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round">
                          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/>
                        </svg>
                      </div>
                      <p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "#94A3B8" }}>Transaksi</p>
                      <p className="text-xl font-extrabold mt-0.5" style={{ color: "#0F172A" }}>{data.today.count}</p>
                      <p className="text-[9px] mt-1 font-medium" style={{ color: "#94A3B8" }}>Hari ini</p>
                    </div>
                  </div>
                  <div className="tdm-stat rounded-2xl overflow-hidden">
                    <div className="h-1" style={{ background: "linear-gradient(90deg, #6366F1, #818CF8)" }} />
                    <div className="p-3">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2.5" style={{ background: "#EEF2FF" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2.5" strokeLinecap="round">
                          <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                        </svg>
                      </div>
                      <p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "#94A3B8" }}>Unit Terjual</p>
                      <p className="text-xl font-extrabold mt-0.5" style={{ color: "#0F172A" }}>{todayTotalUnits}</p>
                      <p className="text-[9px] mt-1 font-medium" style={{ color: "#6366F1" }}>Hari ini</p>
                    </div>
                  </div>
                  {canSeeFinancials ? (
                    <div className="tdm-stat rounded-2xl overflow-hidden">
                      <div className="h-1" style={{ background: "linear-gradient(90deg, #10B981, #34D399)" }} />
                      <div className="p-3">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2.5" style={{ background: "#ECFDF5" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round">
                            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
                          </svg>
                        </div>
                        <p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "#94A3B8" }}>Omzet</p>
                        <p className="text-sm font-extrabold mt-0.5" style={{ color: "#0F172A" }}>{fmtShort(data.today.revenue)}</p>
                        <p className="text-[9px] mt-1 font-medium" style={{ color: "#10B981" }}>Hari ini</p>
                      </div>
                    </div>
                  ) : (
                    <div className="tdm-stat rounded-2xl overflow-hidden">
                      <div className="h-1" style={{ background: "linear-gradient(90deg, #3B82F6, #60A5FA)" }} />
                      <div className="p-3">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2.5" style={{ background: "#EFF6FF" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round">
                            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                          </svg>
                        </div>
                        <p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "#94A3B8" }}>Tahun Ini</p>
                        <p className="text-xl font-extrabold mt-0.5" style={{ color: "#0F172A" }}>{data.yearly[0]?.count ?? 0}</p>
                        <p className="text-[9px] mt-1 font-medium" style={{ color: "#3B82F6" }}>transaksi</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Tabs */}
                <div className="tdm-tabs-wrap flex gap-1">
                  {tabs.map((tab) => (
                    <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                      className={`flex-1 py-2.5 text-xs rounded-[10px] transition-all duration-200 ${activeTab === tab.key ? "tdm-tab-active" : "tdm-tab-inactive"}`}>
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Tab Content */}
                <div className="space-y-3">
                  {!activeData || activeData.length === 0 ? (
                    <div className="text-center py-14 bg-white rounded-2xl border border-dashed" style={{ borderColor: "#E2E8F0" }}>
                      <div className="text-3xl mb-2">📭</div>
                      <p className="text-sm font-semibold" style={{ color: "#94A3B8" }}>Belum ada data transaksi</p>
                    </div>
                  ) : (
                    activeData.map((period) => (
                      <PeriodSection key={period.date} period={period} canSeeFinancials={canSeeFinancials} />
                    ))
                  )}
                </div>

              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "#FEF2F2" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                </div>
                <p className="text-sm font-semibold" style={{ color: "#475569" }}>Gagal memuat data</p>
                <p className="text-xs font-medium" style={{ color: "#94A3B8" }}>Coba tutup dan buka kembali</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}