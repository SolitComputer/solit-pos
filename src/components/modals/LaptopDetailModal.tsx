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
    <div 
      className="fixed inset-0 z-50 bg-gradient-to-br from-black/70 to-black/50 backdrop-blur-md flex items-center justify-center p-4 transition-all duration-300 animate-in fade-in"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header with gradient accent */}
        <div className="relative bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 px-6 py-5">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-full blur-2xl" />
          <div className="flex items-center justify-between relative z-10">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-1 h-6 bg-gradient-to-b from-purple-500 to-pink-500 rounded-full" />
                <h2 className="text-xl font-bold text-white">Detail Laptop Terlaris</h2>
              </div>
              <p className="text-sm text-gray-300">Performa model laptop dan breakdown harian</p>
            </div>
            <button 
              onClick={onClose} 
              className="text-gray-400 hover:text-white hover:bg-white/10 rounded-xl p-2 transition-all duration-200"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content with custom scrollbar */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-gray-50">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-xl shadow-sm p-4 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-200 rounded-xl" />
                    <div className="flex-1">
                      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                      <div className="h-3 bg-gray-200 rounded w-1/2" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : data ? (
            <div className="p-6 space-y-6">
              
              {/* Summary Stats with modern cards */}
              <div className="grid grid-cols-2 gap-4">
                <div className="group relative overflow-hidden bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-4 shadow-lg hover:shadow-xl transition-all duration-300">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full blur-xl group-hover:scale-150 transition-transform duration-500" />
                  <div className="relative">
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="w-4 h-4 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-xs font-semibold text-white/90 uppercase tracking-wider">Hari Ini</p>
                    </div>
                    <p className="font-bold text-3xl text-white mt-1">{data.today.count}</p>
                    <p className="text-xs text-white/80 mt-1">transaksi</p>
                  </div>
                </div>
                
                <div className="group relative overflow-hidden bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-4 shadow-lg hover:shadow-xl transition-all duration-300">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full blur-xl group-hover:scale-150 transition-transform duration-500" />
                  <div className="relative">
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="w-4 h-4 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      <p className="text-xs font-semibold text-white/90 uppercase tracking-wider">Bulan Ini</p>
                    </div>
                    <p className="font-bold text-3xl text-white mt-1">{data.monthly.count}</p>
                    <p className="text-xs text-white/80 mt-1">transaksi</p>
                  </div>
                </div>
              </div>

              {/* Laptop List with modern styling */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zm0 0h14" />
                    </svg>
                    Top Performers (30 Hari)
                  </h3>
                  <span className="text-xs text-gray-400">{data.laptopPerformance.length} model</span>
                </div>
                
                {data.laptopPerformance.length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-2xl">
                    <svg className="w-16 h-16 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                    <p className="text-sm text-gray-500">Belum ada data</p>
                  </div>
                ) : (
                  data.laptopPerformance.map((laptop, idx) => (
                    <div key={laptop.name} className="bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
                      
                      {/* Laptop Header with rank badge */}
                      <button
                        onClick={() => setExpandedLaptop(expandedLaptop === laptop.name ? null : laptop.name)}
                        className="w-full p-4 flex items-center justify-between gap-3 hover:bg-gradient-to-r hover:from-gray-50 hover:to-white transition-all duration-200"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {/* Rank Badge */}
                          <div className={`
                            w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm
                            ${idx === 0 ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 shadow-lg' : 
                              idx === 1 ? 'bg-gradient-to-br from-gray-400 to-gray-600' : 
                              idx === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-600' : 
                              'bg-gradient-to-br from-gray-200 to-gray-300 text-gray-600'}
                          `}>
                            {idx + 1}
                          </div>
                          
                          <div className="flex-1 min-w-0 text-left">
                            <p className="font-semibold text-gray-900 text-sm truncate">{laptop.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-gray-500">{laptop.total}x terjual</span>
                              <span className="w-1 h-1 bg-gray-300 rounded-full" />
                              <span className="text-xs font-medium text-green-600">{fmtShort(laptop.revenue)}</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <div className="hidden sm:block text-right">
                            <p className="text-xs text-gray-400">rata-rata</p>
                            <p className="text-sm font-bold text-gray-900">{fmtShort(laptop.revenue / laptop.total)}</p>
                          </div>
                          <svg
                            className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${expandedLaptop === laptop.name ? "rotate-180" : ""}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </div>
                      </button>

                      {/* Expanded Daily Breakdown with timeline style */}
                      {expandedLaptop === laptop.name && (
                        <div className="border-t border-gray-100 bg-gradient-to-b from-gray-50 to-white p-4">
                          <p className="text-xs font-semibold text-gray-500 mb-3 flex items-center gap-2">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            Daily Performance
                          </p>
                          <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                            {laptop.dailyBreakdown.length === 0 ? (
                              <p className="text-xs text-gray-500 text-center py-6">Belum ada data harian</p>
                            ) : (
                              laptop.dailyBreakdown.map((day, i) => (
                                <div key={day.date} className="group bg-white rounded-lg p-3 hover:shadow-sm transition-all duration-200">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center text-xs font-bold">
                                        {i + 1}
                                      </div>
                                      <div>
                                        <p className="text-sm font-medium text-gray-700">{day.label}</p>
                                        <p className="text-xs text-gray-400">{day.total} unit terjual</p>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-sm font-bold text-gray-900">{fmtRupiah(day.revenue)}</p>
                                      <div className="w-full h-1 bg-gray-100 rounded-full mt-1 overflow-hidden">
                                        <div 
                                          className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
                                          style={{ width: `${(day.revenue / laptop.revenue) * 100}%` }}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 px-6">
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-4">
                <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-gray-600 font-medium">Gagal memuat data</p>
              <p className="text-sm text-gray-400 mt-1">Silakan coba lagi nanti</p>
            </div>
          )}
        </div>

        {/* Footer with subtle gradient */}
        <div className="bg-gradient-to-r from-gray-50 to-white border-t border-gray-200 px-6 py-3">
          <p className="text-xs text-gray-400 text-center">
            Data diperbarui secara real-time • {new Date().toLocaleDateString('id-ID')}
          </p>
        </div>
      </div>
    </div>
  );
}

// Add this to your global CSS or component styles
const styles = `
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  
  .custom-scrollbar::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 10px;
  }
  
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 10px;
  }
  
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
  }
  
  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  @keyframes slide-in-from-bottom-4 {
    from {
      opacity: 0;
      transform: translateY(1rem);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .animate-in {
    animation-duration: 0.3s;
    animation-fill-mode: both;
  }
  
  .fade-in {
    animation-name: fade-in;
  }
  
  .slide-in-from-bottom-4 {
    animation-name: slide-in-from-bottom-4;
  }
`;