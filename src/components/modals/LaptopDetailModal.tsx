"use client";

import { useState, useEffect } from "react";

interface LaptopDetail {
  today: { count: number; topLaptop: any };
  monthly: { count: number };
  laptopPerformance: Array<{
    name: string;
    total: number;
    revenue: number;
    dailyBreakdown: Array<{ date: string; label: string; total: number; revenue: number }>;
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

export function LaptopDetailModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [data, setData] = useState<LaptopDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedLaptop, setExpandedLaptop] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    
    const fetch_ = async () => {
      setIsLoading(true);
      try {
        const res = await fetch("/api/dashboard/laptop-detail");
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
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">Detail Laptop Terlaris</h2>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">Performa model laptop dan breakdown harian</p>
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
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-3 border border-blue-200">
                  <p className="text-[10px] text-blue-700 font-semibold uppercase tracking-wider">Hari Ini</p>
                  <p className="font-bold text-sm text-blue-900 mt-1">{data.today.count}</p>
                  <p className="text-[9px] text-blue-700 mt-0.5">transaksi</p>
                </div>
                <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg p-3 border border-amber-200">
                  <p className="text-[10px] text-amber-700 font-semibold uppercase tracking-wider">Bulan Ini</p>
                  <p className="font-bold text-sm text-amber-900 mt-1">{data.monthly.count}</p>
                  <p className="text-[9px] text-amber-700 mt-0.5">transaksi</p>
                </div>
              </div>

              {/* Laptop List */}
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-gray-900">Laptop Terlaris (30 Hari)</h3>
                {data.laptopPerformance.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-8">Belum ada data</p>
                ) : (
                  data.laptopPerformance.map((laptop, idx) => (
                    <div key={laptop.name} className="border border-gray-200 rounded-lg overflow-hidden">
                      
                      {/* Laptop Header */}
                      <button
                        onClick={() => setExpandedLaptop(expandedLaptop === laptop.name ? null : laptop.name)}
                        className="w-full bg-gradient-to-r from-gray-50 to-white hover:from-gray-100 hover:to-gray-50 p-3 sm:p-4 flex items-center justify-between gap-3 transition"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900 text-sm truncate">{laptop.name}</p>
                            <p className="text-xs text-gray-500">{laptop.total}x terjual</p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-bold text-sm text-gray-900">{fmtShort(laptop.revenue)}</p>
                          <p className="text-xs text-gray-500">{laptop.total} unit</p>
                        </div>
                        <svg
                          className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${expandedLaptop === laptop.name ? "rotate-180" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>

                      {/* Expanded Daily Breakdown */}
                      {expandedLaptop === laptop.name && (
                        <div className="border-t border-gray-200 bg-gray-50 p-3 sm:p-4 space-y-2">
                          {laptop.dailyBreakdown.length === 0 ? (
                            <p className="text-xs text-gray-500 text-center py-4">Belum ada data</p>
                          ) : (
                            laptop.dailyBreakdown.map((day) => (
                              <div key={day.date} className="bg-white rounded-lg p-2.5 flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-xs font-medium text-gray-700">{day.label}</p>
                                  <p className="text-[10px] text-gray-500 mt-0.5">{day.total} unit</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-xs font-bold text-gray-900">{fmtRupiah(day.revenue)}</p>
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