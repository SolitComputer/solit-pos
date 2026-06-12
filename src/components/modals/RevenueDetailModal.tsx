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

  if (!isOpen) return null;

  const TabButton = ({ tab, label }: { tab: typeof activeTab; label: string }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`px-5 py-2.5 text-sm font-medium rounded-t-lg transition-all duration-200 ${
        activeTab === tab
          ? "bg-white text-emerald-700 border-b-2 border-emerald-500 shadow-sm"
          : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
      }`}
    >
      {label}
    </button>
  );

  const RevenueItem = ({ item, type }: { item: any; type: "daily" | "weekly" }) => (
    <div className="group bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-all duration-200 hover:border-emerald-200">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-800">{item.label}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              {item.count} transaksi
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-base font-bold text-gray-900">{fmtRupiah(item.revenue)}</p>
          <p className="text-xs text-emerald-600 mt-0.5 font-semibold">+{fmtRupiah(item.profit)}</p>
        </div>
      </div>
      {type === "daily" && (
        <div className="mt-3">
          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all duration-500"
              style={{ width: `${Math.min((item.profit / item.revenue) * 100, 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-gray-400 mt-1 text-right">
            margin {((item.profit / item.revenue) * 100).toFixed(1)}%
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm transition-all duration-300"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header dengan desain modern - konsisten dengan modal lain */}
        <div className="relative px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold bg-gradient-to-r from-emerald-800 to-emerald-600 bg-clip-text text-transparent">
                Detail Omzet
              </h2>
              <p className="text-sm text-gray-500 mt-1">Rincian penjualan per periode</p>
            </div>
            <button 
              onClick={onClose} 
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all duration-200"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content dengan scroll area yang halus */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="bg-gray-100 rounded-xl h-24" />
                </div>
              ))}
            </div>
          ) : data ? (
            <div className="p-6 space-y-6">
              
              {/* Summary Stats dengan desain card yang menarik - konsisten warna emerald */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-4 text-white shadow-lg">
                  <p className="text-xs font-medium opacity-90">Hari Ini</p>
                  <p className="text-2xl font-bold mt-2">{fmtShort(data.today.revenue)}</p>
                  <div className="flex justify-between items-center mt-2">
                    <p className="text-xs opacity-90">{data.today.count} transaksi</p>
                    <svg className="w-4 h-4 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white shadow-lg">
                  <p className="text-xs font-medium opacity-90">Bulan Ini</p>
                  <p className="text-2xl font-bold mt-2">{fmtShort(data.monthly.revenue)}</p>
                  <div className="flex justify-between items-center mt-2">
                    <p className="text-xs opacity-90">{data.monthly.count} transaksi</p>
                    <svg className="w-4 h-4 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>
                
                <div className="bg-gradient-to-br from-emerald-400 to-teal-500 rounded-xl p-4 text-white shadow-lg">
                  <p className="text-xs font-medium opacity-90">Profit Hari Ini</p>
                  <p className="text-2xl font-bold mt-2">{fmtShort(data.today.profit)}</p>
                  <div className="flex justify-between items-center mt-2">
                    <p className="text-xs opacity-90">Keuntungan bersih</p>
                    <svg className="w-4 h-4 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Tabs dengan desain lebih elegan - konsisten */}
              <div className="border-b border-gray-200">
                <div className="flex gap-1">
                  <TabButton tab="daily" label="📊 Harian" />
                  <TabButton tab="weekly" label="📈 Mingguan" />
                  <TabButton tab="monthly" label="📉 Bulanan" />
                </div>
              </div>

              {/* Tab Content dengan animasi */}
              <div className="animate-in fade-in duration-300">
                {activeTab === "daily" && (
                  <div className="space-y-3">
                    {data.daily.length === 0 ? (
                      <div className="text-center py-12">
                        <div className="text-gray-400 text-sm">Belum ada data untuk periode ini</div>
                      </div>
                    ) : (
                      data.daily.map((day) => <RevenueItem key={day.date} item={day} type="daily" />)
                    )}
                  </div>
                )}

                {activeTab === "weekly" && (
                  <div className="space-y-3">
                    {data.weekly.length === 0 ? (
                      <div className="text-center py-12">
                        <div className="text-gray-400 text-sm">Belum ada data untuk periode ini</div>
                      </div>
                    ) : (
                      data.weekly.map((week) => <RevenueItem key={week.weekStart} item={week} type="weekly" />)
                    )}
                  </div>
                )}

                {activeTab === "monthly" && (
                  <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-xl p-6 border border-emerald-200">
                    <div className="space-y-5">
                      <div className="text-center">
                        <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">Total Omzet Bulan Ini</p>
                        <p className="text-3xl font-black text-emerald-900 mt-2">{fmtRupiah(data.monthly.revenue)}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white rounded-lg p-4 shadow-sm">
                          <p className="text-xs font-semibold text-gray-500 uppercase">Total Profit</p>
                          <p className="text-lg font-bold text-emerald-600 mt-1">{fmtRupiah(data.monthly.profit)}</p>
                        </div>
                        <div className="bg-white rounded-lg p-4 shadow-sm">
                          <p className="text-xs font-semibold text-gray-500 uppercase">Total Transaksi</p>
                          <p className="text-lg font-bold text-gray-900 mt-1">{data.monthly.count}</p>
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between mb-2">
                          <span className="text-sm font-semibold text-gray-700">Rata-rata per transaksi</span>
                          <span className="text-sm font-bold text-emerald-600">
                            {fmtShort(data.monthly.revenue / data.monthly.count)}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all duration-700"
                            style={{ width: `${Math.min((data.monthly.profit / data.monthly.revenue) * 100, 100)}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-500 mt-2 text-center">
                          Margin profit: {((data.monthly.profit / data.monthly.revenue) * 100).toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Info tambahan */}
              <div className="pt-4 border-t border-gray-100">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Omzet: Total penjualan | Profit: Keuntungan bersih setelah modal</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="text-gray-400 mb-2">⚠️</div>
              <p className="text-gray-500">Gagal memuat data omzet</p>
              <button 
                onClick={() => window.location.reload()} 
                className="mt-4 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
              >
                Coba lagi
              </button>
            </div>
          )}
        </div>
      </div>

      {/* CSS untuk custom scrollbar dan animasi */}
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #c1c1c1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #a8a8a8;
        }
        @keyframes zoom-in-95 {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        .animate-in {
          animation-duration: 0.3s;
          animation-fill-mode: both;
        }
        .zoom-in-95 {
          animation-name: zoom-in-95;
        }
        .fade-in {
          animation-name: fade-in;
        }
      `}</style>
    </div>
  );
}