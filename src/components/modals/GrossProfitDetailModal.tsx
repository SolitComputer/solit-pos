"use client";

import { useState, useEffect } from "react";

interface GrossProfitDetail {
  today: { gross_profit: number; revenue: number; count: number; margin_pct: number };
  daily: Array<{ date: string; label: string; gross_profit: number; revenue: number; count: number; margin_pct: number }>;
  weekly: Array<{ weekStart: string; label: string; gross_profit: number; revenue: number; count: number; margin_pct: number }>;
  monthly: { gross_profit: number; revenue: number; count: number; margin_pct: number };
}

const fmtRupiah = (n: number): string =>
  "Rp " + (n || 0).toLocaleString("id-ID");

const fmtShort = (n: number): string => {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}Jt`;
  if (n >= 1_000) return `Rp ${(n / 1_000).toFixed(0)}Rb`;
  return `Rp ${n}`;
};

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(4, (value / max) * 100) : 4;
  return (
    <div className="w-full h-1 rounded-full overflow-hidden mt-2" style={{ background: "rgba(255,255,255,0.08)" }}>
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

export function GrossProfitDetailModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [data, setData] = useState<GrossProfitDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"daily" | "weekly" | "monthly">("daily");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => setVisible(true), 10);
    } else {
      setVisible(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const res = await fetch("/api/dashboard/gross-profit-detail");
        const result = await res.json();
        if (result.success) setData(result.data);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [isOpen]);

  if (!isOpen) return null;

  const maxDailyProfit = data ? Math.max(...data.daily.map((d) => d.gross_profit), 1) : 1;
  const maxWeeklyProfit = data ? Math.max(...data.weekly.map((w) => w.gross_profit), 1) : 1;

  const tabs = [
    { key: "daily", label: "Harian" },
    { key: "weekly", label: "Mingguan" },
    { key: "monthly", label: "Bulanan" },
  ] as const;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

        .gpdm-overlay { font-family: 'Inter', sans-serif; }

        .gpdm-card {
          background: linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%);
          border: 1px solid rgba(255,255,255,0.08);
          backdrop-filter: blur(10px);
        }

        .gpdm-row { transition: background 0.2s, transform 0.2s; }
        .gpdm-row:hover { background: rgba(255,255,255,0.05); transform: translateX(3px); }

        .gpdm-tab-active {
          background: linear-gradient(135deg, #10B981, #059669);
          color: white;
          box-shadow: 0 0 20px rgba(16,185,129,0.35);
        }
        .gpdm-tab-inactive {
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.55);
        }
        .gpdm-tab-inactive:hover {
          background: rgba(255,255,255,0.09);
          color: rgba(255,255,255,0.85);
        }

        .gpdm-scrollbar::-webkit-scrollbar { width: 4px; }
        .gpdm-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .gpdm-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }

        .gpdm-shimmer {
          background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.03) 75%);
          background-size: 200% 100%;
          animation: gpdm-shimmer 1.5s infinite;
        }
        @keyframes gpdm-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }

        .gpdm-modal-enter { opacity: 0; transform: scale(0.96) translateY(12px); }
        .gpdm-modal-visible {
          opacity: 1;
          transform: scale(1) translateY(0);
          transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.34, 1.3, 0.64, 1);
        }

        .gpdm-stat-glow-green  { box-shadow: 0 0 30px rgba(16,185,129,0.12), inset 0 1px 0 rgba(255,255,255,0.06); }
        .gpdm-stat-glow-amber  { box-shadow: 0 0 30px rgba(245,158,11,0.12),  inset 0 1px 0 rgba(255,255,255,0.06); }
        .gpdm-stat-glow-blue   { box-shadow: 0 0 30px rgba(99,102,241,0.12),  inset 0 1px 0 rgba(255,255,255,0.06); }

        .gpdm-profit-badge {
          background: rgba(16,185,129,0.15);
          border: 1px solid rgba(16,185,129,0.25);
        }
        .gpdm-margin-badge {
          background: rgba(99,102,241,0.15);
          border: 1px solid rgba(99,102,241,0.25);
        }
      `}</style>

      <div
        className="gpdm-overlay fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
        onClick={onClose}
      >
        <div
          className={`relative w-full sm:max-w-lg max-h-[92vh] sm:max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-2xl overflow-hidden ${visible ? "gpdm-modal-visible" : "gpdm-modal-enter"}`}
          style={{ background: "linear-gradient(160deg, #141820 0%, #0F1117 60%, #111318 100%)", border: "1px solid rgba(255,255,255,0.08)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle (mobile) */}
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="w-10 h-1 rounded-full bg-white/20" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 sm:px-6 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #10B981, #059669)", boxShadow: "0 0 20px rgba(16,185,129,0.4)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold" style={{ color: "#F1F5F9" }}>Detail Gross Profit</h2>
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Rincian margin keuntungan per periode</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
              style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.12)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.8)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.4)"; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Scrollable content */}
          <div className="gpdm-scrollbar flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-5 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  {[1, 2, 3].map((i) => <div key={i} className="gpdm-shimmer rounded-xl h-20" />)}
                </div>
                <div className="space-y-2 pt-3">
                  {[1, 2, 3, 4, 5].map((i) => <div key={i} className="gpdm-shimmer rounded-xl h-14" />)}
                </div>
              </div>
            ) : data ? (
              <div className="p-5 space-y-5">

                {/* Stat Cards */}
                <div className="grid grid-cols-3 gap-3">
                  {/* Gross Profit Hari Ini */}
                  <div className="gpdm-card gpdm-stat-glow-green rounded-xl p-3.5">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center mb-2" style={{ background: "rgba(16,185,129,0.2)" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                      </svg>
                    </div>
                    <p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>Profit Hari Ini</p>
                    <p className="text-sm font-bold mt-0.5" style={{ color: "#F1F5F9" }}>{fmtShort(data.today.gross_profit)}</p>
                    <p className="text-[9px] mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>{data.today.margin_pct}% margin</p>
                  </div>

                  {/* Gross Profit Bulan Ini */}
                  <div className="gpdm-card gpdm-stat-glow-amber rounded-xl p-3.5">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center mb-2" style={{ background: "rgba(245,158,11,0.2)" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    </div>
                    <p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>Bulan Ini</p>
                    <p className="text-sm font-bold mt-0.5" style={{ color: "#F1F5F9" }}>{fmtShort(data.monthly.gross_profit)}</p>
                    <p className="text-[9px] mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>{data.monthly.margin_pct}% margin</p>
                  </div>

                  {/* Omzet Hari Ini */}
                  <div className="gpdm-card gpdm-stat-glow-blue rounded-xl p-3.5">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center mb-2" style={{ background: "rgba(99,102,241,0.2)" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="2.5" strokeLinecap="round">
                        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
                      </svg>
                    </div>
                    <p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>Omzet</p>
                    <p className="text-sm font-bold mt-0.5" style={{ color: "#F1F5F9" }}>{fmtShort(data.today.revenue)}</p>
                    <p className="text-[9px] mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>{data.today.count} transaksi</p>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  {tabs.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setActiveTab(key)}
                      className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all duration-200 ${activeTab === key ? "gpdm-tab-active" : "gpdm-tab-inactive"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Daily */}
                {activeTab === "daily" && (
                  <div className="space-y-2">
                    {data.daily.length === 0 ? (
                      <div className="text-center py-12">
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: "rgba(255,255,255,0.05)" }}>
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        </div>
                        <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.35)" }}>Belum ada data harian</p>
                      </div>
                    ) : (
                      data.daily.map((day, idx) => (
                        <div key={day.date} className="gpdm-row gpdm-card rounded-xl p-3.5 cursor-default">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px] font-bold" style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.45)" }}>
                                {String(idx + 1).padStart(2, "0")}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold truncate" style={{ color: "#F1F5F9" }}>{day.label}</p>
                                <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{day.count} transaksi</p>
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-bold" style={{ color: "#F1F5F9" }}>{fmtRupiah(day.gross_profit)}</p>
                              <div className="flex items-center justify-end gap-1 mt-0.5">
                                <span className="gpdm-profit-badge inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded-md" style={{ color: "#34D399" }}>
                                  +{fmtShort(day.gross_profit)}
                                </span>
                                <span className="gpdm-margin-badge inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded-md" style={{ color: "#818CF8" }}>
                                  {day.margin_pct}%
                                </span>
                              </div>
                            </div>
                          </div>
                          <MiniBar value={day.gross_profit} max={maxDailyProfit} color="linear-gradient(90deg, #10B981, #34D399)" />
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Weekly */}
                {activeTab === "weekly" && (
                  <div className="space-y-2">
                    {data.weekly.length === 0 ? (
                      <div className="text-center py-12">
                        <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.35)" }}>Belum ada data mingguan</p>
                      </div>
                    ) : (
                      data.weekly.map((week, idx) => (
                        <div key={week.weekStart} className="gpdm-row gpdm-card rounded-xl p-3.5 cursor-default">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.2)" }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/></svg>
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold truncate" style={{ color: "#F1F5F9" }}>{week.label}</p>
                                <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{week.count} transaksi</p>
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-bold" style={{ color: "#F1F5F9" }}>{fmtRupiah(week.gross_profit)}</p>
                              <div className="flex items-center justify-end gap-1 mt-0.5">
                                <span className="gpdm-profit-badge inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded-md" style={{ color: "#34D399" }}>
                                  +{fmtShort(week.gross_profit)}
                                </span>
                                <span className="gpdm-margin-badge inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded-md" style={{ color: "#818CF8" }}>
                                  {week.margin_pct}%
                                </span>
                              </div>
                            </div>
                          </div>
                          <MiniBar value={week.gross_profit} max={maxWeeklyProfit} color="linear-gradient(90deg, #F59E0B, #FCD34D)" />
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Monthly */}
                {activeTab === "monthly" && (
                  <div className="space-y-3">
                    {/* Gross Profit */}
                    <div className="gpdm-card rounded-xl p-4" style={{ border: "1px solid rgba(16,185,129,0.2)" }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(16,185,129,0.15)" }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.2" strokeLinecap="round">
                              <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>Gross Profit</p>
                            <p className="text-[9px]" style={{ color: "rgba(255,255,255,0.25)" }}>Bulan ini</p>
                          </div>
                        </div>
                        <p className="text-lg font-bold" style={{ color: "#34D399" }}>{fmtRupiah(data.monthly.gross_profit)}</p>
                      </div>
                    </div>

                    {/* Total Omzet */}
                    <div className="gpdm-card rounded-xl p-4" style={{ border: "1px solid rgba(99,102,241,0.2)" }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(99,102,241,0.15)" }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="2.2" strokeLinecap="round">
                              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>Total Omzet</p>
                            <p className="text-[9px]" style={{ color: "rgba(255,255,255,0.25)" }}>Bulan ini</p>
                          </div>
                        </div>
                        <p className="text-lg font-bold" style={{ color: "#F1F5F9" }}>{fmtRupiah(data.monthly.revenue)}</p>
                      </div>
                    </div>

                    {/* Total Transaksi */}
                    <div className="gpdm-card rounded-xl p-4" style={{ border: "1px solid rgba(245,158,11,0.2)" }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(245,158,11,0.15)" }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.2" strokeLinecap="round">
                              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>
                            </svg>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>Total Transaksi</p>
                            <p className="text-[9px]" style={{ color: "rgba(255,255,255,0.25)" }}>Bulan ini</p>
                          </div>
                        </div>
                        <p className="text-lg font-bold" style={{ color: "#F1F5F9" }}>{data.monthly.count.toLocaleString("id-ID")}</p>
                      </div>
                    </div>

                    {/* Margin Indicator */}
                    <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(99,102,241,0.08) 100%)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>Margin Profit</p>
                        <p className="text-sm font-bold" style={{ color: "#34D399" }}>{data.monthly.margin_pct}%</p>
                      </div>
                      <div className="w-full h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                        <div
                          className="h-full rounded-full transition-all duration-1000"
                          style={{ width: `${Math.min(100, data.monthly.margin_pct)}%`, background: "linear-gradient(90deg, #10B981, #818CF8)" }}
                        />
                      </div>
                      <p className="text-[9px] mt-2.5" style={{ color: "rgba(255,255,255,0.25)" }}>
                        Deal Price − Inventory Price = Gross Profit
                      </p>
                    </div>
                  </div>
                )}

              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "rgba(239,68,68,0.1)" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </div>
                <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>Gagal memuat data</p>
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>Coba tutup dan buka kembali</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}