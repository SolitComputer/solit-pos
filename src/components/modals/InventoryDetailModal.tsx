"use client";

import { useState, useEffect } from "react";

interface InventoryDetail {
  total: number;
  totalModels: number;
  byGrade: {
    A: { qty: number; pct: number };
    B: { qty: number; pct: number };
    C: { qty: number; pct: number };
  };
  byBrand: Array<{ name: string; total: number }>;
}

const GRADE_COLORS = {
  A: { bg: "from-emerald-500 to-emerald-600", text: "text-emerald-700", bar: "bg-gradient-to-r from-emerald-500 to-emerald-600", lightBg: "bg-emerald-50" },
  B: { bg: "from-amber-500 to-amber-600", text: "text-amber-700", bar: "bg-gradient-to-r from-amber-500 to-amber-600", lightBg: "bg-amber-50" },
  C: { bg: "from-gray-500 to-gray-600", text: "text-gray-700", bar: "bg-gradient-to-r from-gray-500 to-gray-600", lightBg: "bg-gray-50" },
};

export function InventoryDetailModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [data, setData] = useState<InventoryDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const res = await fetch("/api/dashboard/inventory-detail");
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

  const GradeCard = ({ grade, gradeData }: { grade: "A" | "B" | "C"; gradeData: { qty: number; pct: number } }) => {
    const colors = GRADE_COLORS[grade];
    return (
      <div className={`${colors.lightBg} rounded-xl p-4 transition-all duration-200 hover:shadow-md`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full ${colors.bar} flex items-center justify-center text-white font-bold text-sm shadow-sm`}>
              {grade}
            </div>
            <span className="font-semibold text-gray-800">Grade {grade}</span>
          </div>
          <div className="text-right">
            <span className="text-lg font-bold text-gray-900">{gradeData.qty}</span>
            <span className="text-sm text-gray-500 ml-1">unit</span>
          </div>
        </div>
        <div className="mt-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-600">Distribusi</span>
            <span className={`font-semibold ${colors.text}`}>{gradeData.pct}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${colors.bar}`}
              style={{ width: `${gradeData.pct}%` }}
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm transition-all duration-300"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header dengan desain modern */}
        <div className="relative px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold bg-gradient-to-r from-blue-800 to-blue-600 bg-clip-text text-transparent">
                Detail Inventory
              </h2>
              <p className="text-sm text-gray-500 mt-1">Breakdown stok berdasarkan grade dan brand</p>
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
              
              {/* Total Summary dengan desain card yang menarik */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white shadow-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium opacity-90">Total Unit</p>
                      <p className="text-3xl font-bold mt-2">{data.total}</p>
                    </div>
                    <svg className="w-10 h-10 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                  <div className="mt-3">
                    <div className="flex items-center gap-2 text-xs opacity-90">
                      <span>📦 Total stok tersedia</span>
                    </div>
                  </div>
                </div>
                
                <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl p-4 text-white shadow-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium opacity-90">Total Model</p>
                      <p className="text-3xl font-bold mt-2">{data.totalModels}</p>
                    </div>
                    <svg className="w-10 h-10 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  <div className="mt-3">
                    <div className="flex items-center gap-2 text-xs opacity-90">
                      <span>🔧 Variasi model unik</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Grade Breakdown dengan desain card per grade */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-800">Berdasarkan Grade</h3>
                  <span className="text-xs text-gray-500">Distribusi stok</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {(["A", "B", "C"] as const).map((grade) => (
                    <GradeCard key={grade} grade={grade} gradeData={data.byGrade[grade]} />
                  ))}
                </div>
              </div>

              {/* Brand Breakdown dengan desain lebih menarik */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-800">Top Brand</h3>
                  <span className="text-xs text-gray-500">Berdasarkan jumlah unit</span>
                </div>
                {data.byBrand.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-xl">
                    <div className="text-gray-400 text-sm">Belum ada data brand</div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.byBrand.map((brand, idx) => {
                      const maxTotal = data.byBrand[0]?.total || 1;
                      const pct = Math.round((brand.total / maxTotal) * 100);
                      const isTopBrand = idx === 0;
                      
                      return (
                        <div 
                          key={brand.name} 
                          className={`group bg-white rounded-xl p-4 shadow-sm border transition-all duration-200 hover:shadow-md ${
                            isTopBrand ? 'border-blue-200 bg-gradient-to-r from-blue-50/50 to-white' : 'border-gray-100'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                isTopBrand ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'
                              }`}>
                                #{idx + 1}
                              </div>
                              <div>
                                <p className="font-semibold text-gray-800">{brand.name}</p>
                                {isTopBrand && (
                                  <span className="text-[10px] text-blue-600 font-medium">Paling banyak</span>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-bold text-gray-900">{brand.total}</p>
                              <p className="text-xs text-gray-400">unit</p>
                            </div>
                          </div>
                          <div className="mt-2">
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-gray-500">Komposisi</span>
                              <span className="font-medium text-gray-700">{pct}% dari brand tertinggi</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-700 ${
                                  isTopBrand 
                                    ? 'bg-gradient-to-r from-blue-500 to-blue-600' 
                                    : 'bg-gradient-to-r from-gray-400 to-gray-500'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Info tambahan */}
              <div className="pt-4 border-t border-gray-100">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Grade A: Kondisi terbaik, Grade B: Kondisi baik, Grade C: Kondisi standar</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="text-gray-400 mb-2">⚠️</div>
              <p className="text-gray-500">Gagal memuat data inventory</p>
              <button 
                onClick={() => window.location.reload()} 
                className="mt-4 text-sm text-blue-600 hover:text-blue-700 font-medium"
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
        .animate-in {
          animation-duration: 0.3s;
          animation-fill-mode: both;
        }
        .zoom-in-95 {
          animation-name: zoom-in-95;
        }
      `}</style>
    </div>
  );
}