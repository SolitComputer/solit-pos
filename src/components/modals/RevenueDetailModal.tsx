"use client";

import { useState, useEffect } from "react";

interface RevenueDetail {
  today: { revenue: number; profit: number; count: number };
  daily: Array<{ date: string; label: string; revenue: number; profit: number; count: number }>;
  weekly: Array<{ weekStart: string; label: string; revenue: number; profit: number; count: number }>;
  monthly: { revenue: number; profit: number; count: number };
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
  const pct = max > 0 ? Math.min(100, Math.max(4, (value / max) * 100)) : 4;
  return (
    <div className="w-full h-1.5 rounded-full overflow-hidden mt-3" style={{ background: "#F1F5F9" }}>
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

function Skeleton() {
  return (
    <div className="p-5 space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rdm-shimmer h-24 rounded-2xl" />
        ))}
      </div>
      <div className="rdm-shimmer h-10 rounded-xl" />
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="rdm-shimmer h-16 rounded-2xl" />
      ))}
    </div>
  );
}

export function RevenueDetailModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [data, setData] = useState<RevenueDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"daily" | "weekly" | "monthly">("daily");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOpen) setTimeout(() => setVisible(true), 10);
    else setVisible(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const res = await fetch("/api/dashboard/revenue-detail");
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

  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const tabs = [
    { key: "daily", label: "Harian" },
    { key: "weekly", label: "Mingguan" },
    { key: "monthly", label: "Bulanan" },
  ] as const;

  const maxDaily = data ? Math.max(...data.daily.map((d) => d.revenue), 1) : 1;
  const maxWeekly = data ? Math.max(...data.weekly.map((w) => w.revenue), 1) : 1;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

        .rdm-overlay { font-family: 'Inter', sans-serif; }

        .rdm-shell {
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          box-shadow: 0 32px 80px rgba(15,23,42,0.14), 0 8px 24px rgba(15,23,42,0.08);
        }

        .rdm-header {
          background: linear-gradient(135deg, #F0FFF8 0%, #ECFDF5 100%);
          border-bottom: 1px solid #D1FAE5;
        }

        .rdm-stat {
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          box-shadow: 0 1px 4px rgba(15,23,42,0.06), 0 4px 16px rgba(15,23,42,0.04);
          transition: box-shadow 0.2s, transform 0.2s;
        }
        .rdm-stat:hover {
          box-shadow: 0 4px 20px rgba(15,23,42,0.1);
          transform: translateY(-2px);
        }

        .rdm-tabs-wrap {
          background: #F1F5F9;
          border-radius: 14px;
          padding: 4px;
        }
        .rdm-tab-active {
          background: #FFFFFF;
          color: #10B981;
          font-weight: 700;
          box-shadow: 0 2px 8px rgba(16,185,129,0.18), 0 1px 3px rgba(15,23,42,0.08);
        }
        .rdm-tab-inactive {
          color: #94A3B8;
          font-weight: 500;
        }
        .rdm-tab-inactive:hover {
          color: #475569;
          background: rgba(255,255,255,0.6);
        }

        .rdm-row-card {
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          box-shadow: 0 1px 3px rgba(15,23,42,0.05);
          transition: box-shadow 0.2s, transform 0.2s, border-color 0.2s;
        }
        .rdm-row-card:hover {
          box-shadow: 0 4px 16px rgba(15,23,42,0.1);
          transform: translateX(4px);
          border-color: #A7F3D0;
        }

        .badge-revenue {
          background: #ECFDF5;
          color: #059669;
          border: 1px solid #A7F3D0;
          font-size: 9px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 6px;
        }
        .badge-profit {
          background: #F5F3FF;
          color: #7C3AED;
          border: 1px solid #DDD6FE;
          font-size: 9px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 6px;
        }
        .badge-weekly {
          background: #FFFBEB;
          color: #B45309;
          border: 1px solid #FDE68A;
          font-size: 9px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 6px;
        }

        .rdm-scroll::-webkit-scrollbar { width: 4px; }
        .rdm-scroll::-webkit-scrollbar-track { background: transparent; }
        .rdm-scroll::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 4px; }

        .rdm-shimmer {
          background: linear-gradient(90deg, #F8FAFC 25%, #EEF2FF 50%, #F8FAFC 75%);
          background-size: 200% 100%;
          animation: rdm-shimmer 1.5s infinite;
        }
        @keyframes rdm-shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }

        .rdm-enter   { opacity: 0; transform: scale(0.97) translateY(16px); }
        .rdm-visible {
          opacity: 1;
          transform: scale(1) translateY(0);
          transition: opacity 0.28s ease, transform 0.28s cubic-bezier(0.34, 1.25, 0.64, 1);
        }

        .rdm-monthly-card {
          background: #FAFBFF;
          border: 1px solid #E2E8F0;
          border-radius: 14px;
          transition: box-shadow 0.2s;
        }
        .rdm-monthly-card:hover { box-shadow: 0 4px 16px rgba(15,23,42,0.08); }

        .rdm-close {
          background: #F1F5F9;
          color: #94A3B8;
          transition: background 0.2s, color 0.2s;
        }
        .rdm-close:hover { background: #FEE2E2; color: #EF4444; }

        .rdm-handle { background: #CBD5E1; }
      `}</style>

      {/* ── Overlay ── */}
      <div
        className="rdm-overlay fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(6px)" }}
        onClick={onClose}
      >
        {/* ── Modal shell ── */}
        <div
          className={`rdm-shell relative w-full sm:max-w-lg max-h-[92vh] sm:max-h-[88vh] flex flex-col rounded-t-3xl sm:rounded-2xl overflow-hidden ${visible ? "rdm-visible" : "rdm-enter"}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle (mobile) */}
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="rdm-handle w-10 h-1 rounded-full" />
          </div>

          {/* ── Header ── */}
          <div className="rdm-header flex items-center justify-between px-5 sm:px-6 py-4">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: "linear-gradient(135deg,#10B981 0%,#059669 100%)",
                  boxShadow: "0 4px 14px rgba(16,185,129,0.35)",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                  <polyline points="16 7 22 7 22 13" />
                </svg>
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold" style={{ color: "#0F172A" }}>Detail Omzet</h2>
                <p className="text-xs font-medium" style={{ color: "#94A3B8" }}>Rincian penjualan per hari, minggu &amp; bulan</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rdm-close w-8 h-8 rounded-xl flex items-center justify-center"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* ── Scrollable body ── */}
          <div className="rdm-scroll flex-1 overflow-y-auto" style={{ background: "#F8FAFC" }}>

            {/* ── Loading ── */}
            {isLoading ? (
              <Skeleton />

            ) : data ? (
              <div className="p-5 space-y-4">

                {/* ── Stat Cards ── */}
                <div className="grid grid-cols-3 gap-3">

                  {/* Omzet Hari Ini */}
                  <div className="rdm-stat rounded-2xl overflow-hidden">
                    <div className="h-1" style={{ background: "linear-gradient(90deg,#10B981,#34D399)" }} />
                    <div className="p-3">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2.5" style={{ background: "#ECFDF5" }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round">
                          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
                        </svg>
                      </div>
                      <p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "#94A3B8" }}>Omzet Hari Ini</p>
                      <p className="text-sm font-extrabold mt-0.5 leading-tight" style={{ color: "#0F172A" }}>{fmtRupiah(data.today.revenue)}</p>
                      <p className="text-[9px] mt-1.5 font-medium" style={{ color: "#10B981" }}>{data.today.count} transaksi</p>
                    </div>
                  </div>

                  {/* Omzet Bulan Ini */}
                  <div className="rdm-stat rounded-2xl overflow-hidden">
                    <div className="h-1" style={{ background: "linear-gradient(90deg,#F59E0B,#FCD34D)" }} />
                    <div className="p-3">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2.5" style={{ background: "#FFFBEB" }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round">
                          <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                      </div>
                      <p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "#94A3B8" }}>Bulan Ini</p>
                      <p className="text-sm font-extrabold mt-0.5 leading-tight" style={{ color: "#0F172A" }}>{fmtRupiah(data.monthly.revenue)}</p>
                      <p className="text-[9px] mt-1.5 font-medium" style={{ color: "#F59E0B" }}>{data.monthly.count} transaksi</p>
                    </div>
                  </div>

                  {/* Profit Hari Ini */}
                  <div className="rdm-stat rounded-2xl overflow-hidden">
                    <div className="h-1" style={{ background: "linear-gradient(90deg,#8B5CF6,#C084FC)" }} />
                    <div className="p-3">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2.5" style={{ background: "#F5F3FF" }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2.5" strokeLinecap="round">
                          <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                        </svg>
                      </div>
                      <p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "#94A3B8" }}>Profit Hari Ini</p>
                      <p className="text-sm font-extrabold mt-0.5 leading-tight" style={{ color: "#0F172A" }}>{fmtRupiah(data.today.profit)}</p>
                      <p className="text-[9px] mt-1.5 font-medium" style={{ color: "#8B5CF6" }}>hari ini</p>
                    </div>
                  </div>

                </div>

                {/* ── Tabs ── */}
                <div className="rdm-tabs-wrap flex gap-1">
                  {tabs.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setActiveTab(key)}
                      className={`flex-1 py-2.5 text-xs rounded-[10px] transition-all duration-200 ${activeTab === key ? "rdm-tab-active" : "rdm-tab-inactive"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* ── Daily ── */}
                {activeTab === "daily" && (
                  <div className="space-y-2">
                    {data.daily.length === 0 ? (
                      <div className="text-center py-14">
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: "#F1F5F9" }}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.8">
                            <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                          </svg>
                        </div>
                        <p className="text-sm font-semibold" style={{ color: "#94A3B8" }}>Belum ada data harian</p>
                        <p className="text-xs mt-1" style={{ color: "#CBD5E1" }}>Transaksi akan muncul di sini</p>
                      </div>
                    ) : (
                      data.daily.map((day, idx) => (
                        <div key={day.date} className="rdm-row-card rounded-2xl p-4 cursor-default">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
                                style={{ background: "#ECFDF5", color: "#059669" }}
                              >
                                {String(idx + 1).padStart(2, "0")}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold truncate" style={{ color: "#0F172A" }}>{day.label}</p>
                                <p className="text-[10px] mt-0.5 font-medium" style={{ color: "#94A3B8" }}>{day.count} transaksi</p>
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-bold" style={{ color: "#0F172A" }}>{fmtRupiah(day.revenue)}</p>
                              <div className="flex items-center justify-end gap-1 mt-1">
                                <span className="badge-revenue">{fmtShort(day.revenue)}</span>
                                <span className="badge-profit">+{fmtShort(day.profit)}</span>
                              </div>
                            </div>
                          </div>
                          <MiniBar value={day.revenue} max={maxDaily} color="linear-gradient(90deg,#10B981,#34D399)" />
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* ── Weekly ── */}
                {activeTab === "weekly" && (
                  <div className="space-y-2">
                    {data.weekly.length === 0 ? (
                      <div className="text-center py-14">
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: "#F1F5F9" }}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.8">
                            <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                          </svg>
                        </div>
                        <p className="text-sm font-semibold" style={{ color: "#94A3B8" }}>Belum ada data mingguan</p>
                        <p className="text-xs mt-1" style={{ color: "#CBD5E1" }}>Transaksi akan muncul di sini</p>
                      </div>
                    ) : (
                      data.weekly.map((week) => (
                        <div key={week.weekStart} className="rdm-row-card rounded-2xl p-4 cursor-default">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                                style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5">
                                  <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                                </svg>
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold truncate" style={{ color: "#0F172A" }}>{week.label}</p>
                                <p className="text-[10px] mt-0.5 font-medium" style={{ color: "#94A3B8" }}>{week.count} transaksi</p>
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-bold" style={{ color: "#0F172A" }}>{fmtRupiah(week.revenue)}</p>
                              <div className="flex items-center justify-end gap-1 mt-1">
                                <span className="badge-weekly">{fmtShort(week.revenue)}</span>
                                <span className="badge-profit">+{fmtShort(week.profit)}</span>
                              </div>
                            </div>
                          </div>
                          <MiniBar value={week.revenue} max={maxWeekly} color="linear-gradient(90deg,#F59E0B,#FCD34D)" />
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* ── Monthly ── */}
                {activeTab === "monthly" && (
                  <div className="space-y-3">

                    {/* Total Omzet */}
                    <div className="rdm-monthly-card p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#ECFDF5" }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.2" strokeLinecap="round">
                            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#94A3B8" }}>Total Omzet</p>
                          <p className="text-[9px] font-medium" style={{ color: "#CBD5E1" }}>Bulan ini</p>
                        </div>
                      </div>
                      <p className="text-xl font-extrabold" style={{ color: "#059669" }}>{fmtRupiah(data.monthly.revenue)}</p>
                    </div>

                    {/* Total Profit */}
                    <div className="rdm-monthly-card p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#F5F3FF" }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2.2" strokeLinecap="round">
                            <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#94A3B8" }}>Total Profit</p>
                          <p className="text-[9px] font-medium" style={{ color: "#CBD5E1" }}>Bulan ini</p>
                        </div>
                      </div>
                      <p className="text-xl font-extrabold" style={{ color: "#7C3AED" }}>{fmtRupiah(data.monthly.profit)}</p>
                    </div>

                    {/* Total Transaksi */}
                    <div className="rdm-monthly-card p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#FFFBEB" }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.2" strokeLinecap="round">
                            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                            <rect x="9" y="3" width="6" height="4" rx="1" />
                            <line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="13" y2="16" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#94A3B8" }}>Total Transaksi</p>
                          <p className="text-[9px] font-medium" style={{ color: "#CBD5E1" }}>Bulan ini</p>
                        </div>
                      </div>
                      <p className="text-xl font-extrabold" style={{ color: "#0F172A" }}>{data.monthly.count.toLocaleString("id-ID")}</p>
                    </div>

                    {/* Profit vs Omzet bar */}
                    <div className="rounded-2xl p-4" style={{ background: "linear-gradient(135deg,#F0FDF4 0%,#F5F3FF 100%)", border: "1px solid #E2E8F0" }}>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#94A3B8" }}>Profit vs Omzet</p>
                          <p className="text-[9px] font-medium mt-0.5" style={{ color: "#CBD5E1" }}>Deal Price − Inventory Price = Gross Profit</p>
                        </div>
                        <span
                          className="text-sm font-extrabold px-3 py-1 rounded-xl"
                          style={{ background: "#ECFDF5", color: "#059669", border: "1px solid #A7F3D0" }}
                        >
                          {data.monthly.revenue > 0
                            ? `${((data.monthly.profit / data.monthly.revenue) * 100).toFixed(1)}%`
                            : "0%"}
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full" style={{ background: "#E2E8F0" }}>
                        <div
                          className="h-full rounded-full transition-all duration-1000"
                          style={{
                            width: data.monthly.revenue > 0
                              ? `${Math.min(100, (data.monthly.profit / data.monthly.revenue) * 100)}%`
                              : "0%",
                            background: "linear-gradient(90deg,#10B981,#8B5CF6)",
                          }}
                        />
                      </div>
                    </div>

                  </div>
                )}

              </div>

            ) : (
              /* ── Error state ── */
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "#FEF2F2" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
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