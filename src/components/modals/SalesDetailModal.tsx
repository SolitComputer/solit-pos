"use client";

import { useState, useEffect } from "react";

interface SalesDetail {
  today: { count: number; revenue: number; profit: number };
  monthly: { count: number; revenue: number; profit: number };
  salesPerformance: Array<{
    name: string;
    total: number;
    revenue: number;
    profit: number;
    dailyBreakdown: Array<{ date: string; label: string; total: number; revenue: number; profit: number }>;
  }>;
}

const fmtRupiah = (n: number): string =>
  "Rp " + (n || 0).toLocaleString("id-ID");

const fmtShort = (n: number): string => {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}Jt`;
  if (n >= 1_000) return `Rp ${(n / 1_000).toFixed(0)}Rb`;
  return `Rp ${n}`;
};

export function SalesDetailModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [data, setData] = useState<SalesDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedSales, setExpandedSales] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    
    const fetch_ = async () => {
      setIsLoading(true);
      try {
        const res = await fetch("/api/dashboard/sales-detail");
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
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">Detail Top Sales</h2>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">Performa penjual dan breakdown harian</p>
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
                <div key={i} className="bg-gray-100 rounded-lg h-20 animate-pulse" />
              ))}
            </div>
          ) : data ? (
            <div className="p-5 sm:p-6 space-y-6">
              
              {/* Summary Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-3 border border-gray-200">
                  <p className="text-[10px] text-gray-600 font-semibold uppercase tracking-wider">Hari Ini</p>
                  <p className="font-bold text-sm text-gray-900 mt-1">{data.today.count}</p>
                  <p className="text-[9px] text-gray-500 mt-0.5">transaksi</p>
                </div>
                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg p-3 border border-emerald-200">
                  <p className="text-[10px] text-emerald-700 font-semibold uppercase tracking-wider">Bulan Ini</p>
                  <p className="font-bold text-sm text-emerald-900 mt-1">{data.monthly.count}</p>
                  <p className="text-[9px] text-emerald-700 mt-0.5">transaksi</p>
                </div>
              </div>

              {/* Sales List */}
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-gray-900">Top Sales (30 Hari)</h3>
                {data.salesPerformance.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-8">Belum ada data</p>
                ) : (
                  data.salesPerformance.map((sales, idx) => (
                    <div key={sales.name} className="border border-gray-200 rounded-lg overflow-hidden">
                      
                      {/* Sales Header */}
                      <button
                        onClick={() => setExpandedSales(expandedSales === sales.name ? null : sales.name)}
                        className="w-full bg-gradient-to-r from-gray-50 to-white hover:from-gray-100 hover:to-gray-50 p-3 sm:p-4 flex items-center justify-between gap-3 transition"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gray-500 to-gray-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900 text-sm truncate">{sales.name}</p>
                            <p className="text-xs text-gray-500">{sales.total} transaksi</p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-bold text-sm text-gray-900">{fmtShort(sales.revenue)}</p>
                          <p className="text-xs text-emerald-600">+{fmtShort(sales.profit)}</p>
                        </div>
                        <svg
                          className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${expandedSales === sales.name ? "rotate-180" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>

                      {/* Expanded Daily Breakdown */}
                      {expandedSales === sales.name && (
                        <div className="border-t border-gray-200 bg-gray-50 p-3 sm:p-4 space-y-2">
                          {sales.dailyBreakdown.length === 0 ? (
                            <p className="text-xs text-gray-500 text-center py-4">Belum ada data</p>
                          ) : (
                            sales.dailyBreakdown.map((day) => (
                              <div key={day.date} className="bg-white rounded-lg p-2.5 flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-xs font-medium text-gray-700">{day.label}</p>
                                  <p className="text-[10px] text-gray-500 mt-0.5">{day.total} transaksi</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-xs font-bold text-gray-900">{fmtRupiah(day.revenue)}</p>
                                  <p className="text-[10px] text-emerald-600">+{fmtRupiah(day.profit)}</p>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="p-6 text-center text-gray-500">Gagal memuat data</div>
          )}
        </div>
      </div>
    </div>
  );
}