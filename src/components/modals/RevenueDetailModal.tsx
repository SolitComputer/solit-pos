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

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">Detail Omzet</h2>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">Rincian penjualan per hari, minggu, dan bulan</p>
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
                <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-3 border border-gray-200">
                  <p className="text-[10px] text-gray-600 font-semibold uppercase tracking-wider">Hari Ini</p>
                  <p className="font-bold text-sm text-gray-900 mt-1">{fmtShort(data.today.revenue)}</p>
                  <p className="text-[9px] text-gray-400 mt-0.5 font-mono">{fmtRupiah(data.today.revenue)}</p>
                  <p className="text-[9px] text-gray-500 mt-0.5">{data.today.count} transaksi</p>
                </div>
                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg p-3 border border-emerald-200">
                  <p className="text-[10px] text-emerald-700 font-semibold uppercase tracking-wider">Bulan Ini</p>
                  <p className="font-bold text-sm text-emerald-900 mt-1">{fmtShort(data.monthly.revenue)}</p>
                  <p className="text-[9px] text-emerald-700 mt-0.5">{data.monthly.count} transaksi</p>
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-3 border border-blue-200">
                  <p className="text-[10px] text-blue-700 font-semibold uppercase tracking-wider">Profit Hari Ini</p>
                  <p className="font-bold text-sm text-blue-900 mt-1">{fmtShort(data.today.profit)}</p>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-2 border-b border-gray-200">
                {["daily", "weekly", "monthly"].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab as any)}
                    className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${activeTab === tab
                        ? "border-gray-900 text-gray-900"
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
                            <p className="text-xs text-gray-500 mt-0.5">{day.count} transaksi</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-bold text-gray-900">{fmtRupiah(day.revenue)}</p>
                            <p className="text-xs text-emerald-600 mt-0.5">+{fmtRupiah(day.profit)}</p>
                          </div>
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
                            <p className="text-xs text-gray-500 mt-0.5">{week.count} transaksi</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-bold text-gray-900">{fmtRupiah(week.revenue)}</p>
                            <p className="text-xs text-emerald-600 mt-0.5">+{fmtRupiah(week.profit)}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === "monthly" && (
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-blue-700 font-semibold">Total Omzet Bulan Ini</span>
                      <span className="text-lg font-bold text-blue-900">{fmtRupiah(data.monthly.revenue)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-blue-700 font-semibold">Total Profit Bulan Ini</span>
                      <span className="text-lg font-bold text-emerald-600">{fmtRupiah(data.monthly.profit)}</span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-blue-200">
                      <span className="text-sm text-blue-700 font-semibold">Total Transaksi</span>
                      <span className="text-lg font-bold text-blue-900">{data.monthly.count}</span>
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