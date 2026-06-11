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

export function GrossProfitDetailModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [data, setData] = useState<GrossProfitDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"daily" | "weekly" | "monthly">("daily");

  useEffect(() => {
    if (!isOpen) return;
    
    const fetch_ = async () => {
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

    fetch_();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">Detail Gross Profit</h2>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">Rincian margin keuntungan per hari, minggu, dan bulan</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-gray-100 rounded-lg h-16 animate-pulse" />
              ))}
            </div>
          ) : data ? (
            <div className="p-5 sm:p-6 space-y-6">
              
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg p-3 border border-emerald-200">
                  <p className="text-[10px] text-emerald-700 font-semibold uppercase tracking-wider">Hari Ini</p>
                  <p className="font-bold text-sm text-emerald-900 mt-1">{fmtShort(data.today.gross_profit)}</p>
                  <p className="text-[9px] text-emerald-700 mt-0.5">{data.today.margin_pct}% margin</p>
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-3 border border-blue-200">
                  <p className="text-[10px] text-blue-700 font-semibold uppercase tracking-wider">Bulan Ini</p>
                  <p className="font-bold text-sm text-blue-900 mt-1">{fmtShort(data.monthly.gross_profit)}</p>
                  <p className="text-[9px] text-blue-700 mt-0.5">{data.monthly.margin_pct}% margin</p>
                </div>
                <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-3 border border-orange-200">
                  <p className="text-[10px] text-orange-700 font-semibold uppercase tracking-wider">Omzet Hari Ini</p>
                  <p className="font-bold text-sm text-orange-900 mt-1">{fmtShort(data.today.revenue)}</p>
                  <p className="text-[9px] text-orange-700 mt-0.5">{data.today.count} transaksi</p>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-2 border-b border-gray-200">
                {["daily", "weekly", "monthly"].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab as any)}
                    className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${
                      activeTab === tab
                        ? "border-emerald-600 text-emerald-900"
                        : "border-transparent text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    {tab === "daily" ? "Harian" : tab === "weekly" ? "Mingguan" : "Bulanan"}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              {activeTab === "daily" && (
                <div className="space-y-2">
                  {data.daily.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-8">Belum ada data</p>
                  ) : (
                    data.daily.map((day) => (
                      <div key={day.date} className="bg-gray-50 rounded-lg p-3 hover:bg-gray-100 transition">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{day.label}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <p className="text-xs text-gray-500">{day.count} transaksi</p>
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">
                                {day.margin_pct}%
                              </span>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-bold text-gray-900">{fmtRupiah(day.gross_profit)}</p>
                            <p className="text-xs text-gray-500 mt-0.5">dari {fmtRupiah(day.revenue)}</p>
                          </div>
                        </div>
                        <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className="h-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600"
                            style={{ width: `${day.margin_pct}%` }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === "weekly" && (
                <div className="space-y-2">
                  {data.weekly.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-8">Belum ada data</p>
                  ) : (
                    data.weekly.map((week) => (
                      <div key={week.weekStart} className="bg-gray-50 rounded-lg p-3 hover:bg-gray-100 transition">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{week.label}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <p className="text-xs text-gray-500">{week.count} transaksi</p>
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">
                                {week.margin_pct}%
                              </span>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-bold text-gray-900">{fmtRupiah(week.gross_profit)}</p>
                            <p className="text-xs text-gray-500 mt-0.5">dari {fmtRupiah(week.revenue)}</p>
                          </div>
                        </div>
                        <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className="h-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600"
                            style={{ width: `${week.margin_pct}%` }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === "monthly" && (
                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg p-4 border border-emerald-200">
                  <div className="space-y-4">
                    <div>
                      <p className="text-[10px] text-emerald-700 font-semibold uppercase tracking-wider mb-1">Gross Profit Bulan Ini</p>
                      <p className="text-2xl font-black text-emerald-900">{fmtRupiah(data.monthly.gross_profit)}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white/50 rounded-lg p-3">
                        <p className="text-[9px] text-emerald-700 font-semibold uppercase">Total Omzet</p>
                        <p className="text-sm font-bold text-emerald-900 mt-1">{fmtRupiah(data.monthly.revenue)}</p>
                      </div>
                      <div className="bg-white/50 rounded-lg p-3">
                        <p className="text-[9px] text-emerald-700 font-semibold uppercase">Margin %</p>
                        <p className="text-sm font-bold text-emerald-900 mt-1">{data.monthly.margin_pct}%</p>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-emerald-700 font-semibold">Margin Visual</span>
                      </div>
                      <div className="w-full bg-emerald-200 rounded-full h-3">
                        <div
                          className="h-3 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-500"
                          style={{ width: `${data.monthly.margin_pct}%` }}
                        />
                      </div>
                    </div>

                    <div className="text-xs text-emerald-700 pt-2 border-t border-emerald-200">
                      <p className="font-semibold">Rumus Gross Profit:</p>
                      <p className="mt-1">Deal Price - Inventory Price = Gross Profit</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-6 text-center text-gray-500">Gagal memuat data</div>
          )}
        </div>
      </div>
    </div>
  );
}