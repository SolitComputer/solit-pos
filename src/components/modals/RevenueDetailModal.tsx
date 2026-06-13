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
    const fetch_ = async () => {
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
    fetch_();
  }, [isOpen]);

  if (!isOpen) return null;

  const maxDaily = data ? Math.max(...data.daily.map(d => d.revenue), 1) : 1;
  const maxWeekly = data ? Math.max(...data.weekly.map(w => w.revenue), 1) : 1;

  const tabs = [
    { key: "daily" as const, label: "Harian" },
    { key: "weekly" as const, label: "Mingguan" },
    { key: "monthly" as const, label: "Bulanan" },
  ];

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
          background: linear-gradient(135deg, #F8FAFF 0%, #EFF6FF 100%);
          border-bottom: 1px solid #DBEAFE;
        }
        .rdm-stat {
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          box-shadow: 0 1px 4px rgba(15,23,42,0.06);
          transition: box-shadow 0.2s, transform 0.2s;
        }
        .rdm-stat:hover { box-shadow: 0 4px 20px rgba(15,23,42,0.1); transform: translateY(-2px); }

        .rdm-tabs-wrap { background: #F1F5F9; border-radius: 14px; padding: 4px; }
        .rdm-tab-active {
          background: #FFFFFF; color: #3B82F6; font-weight: 700;
          box-shadow: 0 2px 8px rgba(59,130,246,0.18), 0 1px 3px rgba(15,23,42,0.08);
        }
        .rdm-tab-inactive { color: #94A3B8; font-weight: 500; }
        .rdm-tab-inactive:hover { color: #475569; background: rgba(255,255,255,0.6); }

        .rdm-row-card {
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          box-shadow: 0 1px 3px rgba(15,23,42,0.05);
          transition: box-shadow 0.2s, transform 0.2s, border-color 0.2s;
        }
        .rdm-row-card:hover { box-shadow: 0 4px 16px rgba(15,23,42,0.1); transform: translateX(4px); border-color: #BFDBFE; }

        .rdm-scroll::-webkit-scrollbar { width: 4px; }
        .rdm-scroll::-webkit-scrollbar-track { background: transparent; }
        .rdm-scroll::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 4px; }

        .rdm-shimmer {
          background: linear-gradient(90deg, #F8FAFC 25%, #EFF6FF 50%, #F8FAFC 75%);
          background-size: 200% 100%;
          animation: rdm-shimmer 1.5s infinite; border-radius: 12px;
        }
        @keyframes rdm-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }

        .rdm-enter { opacity: 0; transform: scale(0.97) translateY(16px); }
        .rdm-visible {
          opacity: 1; transform: scale(1) translateY(0);
          transition: opacity 0.28s ease, transform 0.28s cubic-bezier(0.34,1.25,0.64,1);
        }
        .rdm-close { background: #F1F5F9; color: #94A3B8; transition: background 0.2s, color 0.2s; }
        .rdm-close:hover { background: #FEE2E2; color: #EF4444; }
        .rdm-handle { background: #CBD5E1; }
        .rdm-section-label { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #94A3B8; }

        .badge-revenue { background: #EFF6FF; color: #2563EB; border: 1px solid #BFDBFE; font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 6px; }
        .badge-profit-rdm { background: #ECFDF5; color: #059669; border: 1px solid #A7F3D0; font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 6px; }
      `}</style>

      <div
        className="rdm-overlay fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(6px)" }}
        onClick={onClose}
      >
        <div
          className={`rdm-shell relative w-full sm:max-w-lg max-h-[92vh] sm:max-h-[88vh] flex flex-col rounded-t-3xl sm:rounded-2xl overflow-hidden ${visible ? "rdm-visible" : "rdm-enter"}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="rdm-handle w-10 h-1 rounded-full" />
          </div>

          {/* Header */}
          <div className="rdm-header flex items-center justify-between px-5 sm:px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)", boxShadow: "0 4px 14px rgba(59,130,246,0.35)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
                  <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
                </svg>
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold" style={{ color: "#0F172A" }}>Detail Omzet</h2>
                <p className="text-xs font-medium" style={{ color: "#94A3B8" }}>Rincian penjualan per hari, minggu, dan bulan</p>
              </div>
            </div>
            <button onClick={onClose} className="rdm-close w-8 h-8 rounded-xl flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="rdm-scroll flex-1 overflow-y-auto" style={{ background: "#F8FAFC" }}>
            {isLoading ? (
              <div className="p-5 space-y-3">
                <div className="grid grid-cols-3 gap-3">{[1,2,3].map(i=><div key={i} className="rdm-shimmer h-24"/>)}</div>
                <div className="space-y-2 pt-2">{[1,2,3,4,5].map(i=><div key={i} className="rdm-shimmer h-16"/>)}</div>
              </div>
            ) : data ? (
              <div className="p-5 space-y-4">

                {/* Stat Cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rdm-stat rounded-2xl overflow-hidden">
                    <div className="h-1" style={{ background: "linear-gradient(90deg, #3B82F6, #60A5FA)" }} />
                    <div className="p-3">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2.5" style={{ background: "#EFF6FF" }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round">
                          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
                        </svg>
                      </div>
                      <p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "#94A3B8" }}>Hari Ini</p>
                      <p className="text-sm font-extrabold mt-0.5 leading-tight" style={{ color: "#0F172A" }}>{fmtShort(data.today.revenue)}</p>
                      <p className="text-[9px] mt-1.5 font-medium" style={{ color: "#3B82F6" }}>{data.today.count} transaksi</p>
                    </div>
                  </div>
                  <div className="rdm-stat rounded-2xl overflow-hidden">
                    <div className="h-1" style={{ background: "linear-gradient(90deg, #10B981, #34D399)" }} />
                    <div className="p-3">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2.5" style={{ background: "#ECFDF5" }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round">
                          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                      </div>
                      <p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "#94A3B8" }}>Bulan Ini</p>
                      <p className="text-sm font-extrabold mt-0.5 leading-tight" style={{ color: "#0F172A" }}>{fmtShort(data.monthly.revenue)}</p>
                      <p className="text-[9px] mt-1.5 font-medium" style={{ color: "#10B981" }}>{data.monthly.count} transaksi</p>
                    </div>
                  </div>
                  <div className="rdm-stat rounded-2xl overflow-hidden">
                    <div className="h-1" style={{ background: "linear-gradient(90deg, #6366F1, #818CF8)" }} />
                    <div className="p-3">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2.5" style={{ background: "#EEF2FF" }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2.5" strokeLinecap="round">
                          <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                        </svg>
                      </div>
                      <p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "#94A3B8" }}>Profit</p>
                      <p className="text-sm font-extrabold mt-0.5 leading-tight" style={{ color: "#0F172A" }}>{fmtShort(data.today.profit)}</p>
                      <p className="text-[9px] mt-1.5 font-medium" style={{ color: "#6366F1" }}>Hari ini</p>
                    </div>
                  </div>
                </div>

                {/* Tabs */}
                <div className="rdm-tabs-wrap flex gap-1">
                  {tabs.map(({ key, label }) => (
                    <button key={key} onClick={() => setActiveTab(key)}
                      className={`flex-1 py-2.5 text-xs rounded-[10px] transition-all duration-200 ${activeTab === key ? "rdm-tab-active" : "rdm-tab-inactive"}`}>
                      {label}
                    </button>
                  ))}
                </div>

                {/* Daily */}
                {activeTab === "daily" && (
                  <div className="space-y-2">
                    {data.daily.length === 0 ? (
                      <div className="text-center py-14 bg-white rounded-2xl border border-dashed" style={{ borderColor: "#E2E8F0" }}>
                        <p className="text-sm font-semibold" style={{ color: "#94A3B8" }}>Belum ada data harian</p>
                      </div>
                    ) : data.daily.map((day, idx) => (
                      <div key={day.date} className="rdm-row-card rounded-2xl p-4 cursor-default">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
                              style={{ background: "#EFF6FF", color: "#3B82F6" }}>
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
                              <span className="badge-profit-rdm">+{fmtShort(day.profit)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="w-full h-1.5 rounded-full mt-3 overflow-hidden" style={{ background: "#F1F5F9" }}>
                          <div className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${Math.max(4, (day.revenue / maxDaily) * 100)}%`, background: "linear-gradient(90deg, #3B82F6, #60A5FA)" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Weekly */}
                {activeTab === "weekly" && (
                  <div className="space-y-2">
                    {data.weekly.length === 0 ? (
                      <div className="text-center py-14 bg-white rounded-2xl border border-dashed" style={{ borderColor: "#E2E8F0" }}>
                        <p className="text-sm font-semibold" style={{ color: "#94A3B8" }}>Belum ada data mingguan</p>
                      </div>
                    ) : data.weekly.map((week, idx) => (
                      <div key={week.weekStart} className="rdm-row-card rounded-2xl p-4 cursor-default">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                              style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5">
                                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
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
                              <span className="badge-revenue">{fmtShort(week.revenue)}</span>
                              <span className="badge-profit-rdm">+{fmtShort(week.profit)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="w-full h-1.5 rounded-full mt-3 overflow-hidden" style={{ background: "#F1F5F9" }}>
                          <div className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${Math.max(4, (week.revenue / maxWeekly) * 100)}%`, background: "linear-gradient(90deg, #F59E0B, #FCD34D)" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Monthly */}
                {activeTab === "monthly" && (
                  <div className="space-y-3">
                    {[
                      { label: "Total Omzet", value: fmtRupiah(data.monthly.revenue), color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE",
                        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2.2" strokeLinecap="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg> },
                      { label: "Total Profit", value: fmtRupiah(data.monthly.profit), color: "#059669", bg: "#ECFDF5", border: "#A7F3D0",
                        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.2" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
                    ].map(item => (
                      <div key={item.label} className="rounded-2xl p-4 flex items-center justify-between"
                        style={{ background: "#FAFBFF", border: "1px solid #E2E8F0" }}>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: item.bg }}>
                            {item.icon}
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#94A3B8" }}>{item.label}</p>
                            <p className="text-[9px] font-medium" style={{ color: "#CBD5E1" }}>Bulan ini</p>
                          </div>
                        </div>
                        <p className="text-xl font-extrabold" style={{ color: item.color }}>{item.value}</p>
                      </div>
                    ))}
                    <div className="rounded-2xl p-4 flex items-center justify-between"
                      style={{ background: "#FAFBFF", border: "1px solid #E2E8F0" }}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#FFFBEB" }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.2" strokeLinecap="round">
                            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/>
                          </svg>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#94A3B8" }}>Total Transaksi</p>
                          <p className="text-[9px] font-medium" style={{ color: "#CBD5E1" }}>Bulan ini</p>
                        </div>
                      </div>
                      <p className="text-xl font-extrabold" style={{ color: "#0F172A" }}>{data.monthly.count.toLocaleString("id-ID")}</p>
                    </div>
                  </div>
                )}

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