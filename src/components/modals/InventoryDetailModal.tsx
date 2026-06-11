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
  A: { bg: "from-emerald-50 to-emerald-100", text: "text-emerald-700", bar: "bg-emerald-500" },
  B: { bg: "from-amber-50 to-amber-100", text: "text-amber-700", bar: "bg-amber-500" },
  C: { bg: "from-gray-50 to-gray-100", text: "text-gray-700", bar: "bg-gray-500" },
};

export function InventoryDetailModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [data, setData] = useState<InventoryDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    
    const fetch_ = async () => {
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

    fetch_();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">Detail Inventory</h2>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">Breakdown stok berdasarkan grade dan brand</p>
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
              
              {/* Total Summary */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] text-blue-700 font-semibold uppercase tracking-wider">Total Unit</p>
                    <p className="text-2xl font-bold text-blue-900 mt-1">{data.total}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-blue-700 font-semibold uppercase tracking-wider">Total Model</p>
                    <p className="text-2xl font-bold text-blue-900 mt-1">{data.totalModels}</p>
                  </div>
                </div>
              </div>

              {/* Grade Breakdown */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-gray-900">Berdasarkan Grade</h3>
                {(["A", "B", "C"] as const).map((grade) => {
                  const gradeData = data.byGrade[grade];
                  const colors = GRADE_COLORS[grade];
                  return (
                    <div key={grade}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-gray-700">Grade {grade}</span>
                        <span className={`text-sm font-bold ${colors.text}`}>
                          {gradeData.qty} unit ({gradeData.pct}%)
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${colors.bar} transition-all duration-500`}
                          style={{ width: `${gradeData.pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Brand Breakdown */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-gray-900">Top Brand</h3>
                {data.byBrand.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-6">Belum ada data</p>
                ) : (
                  <div className="space-y-2">
                    {data.byBrand.map((brand, idx) => {
                      const maxTotal = data.byBrand[0]?.total || 1;
                      const pct = Math.round((brand.total / maxTotal) * 100);
                      return (
                        <div key={brand.name}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-gray-700">{brand.name}</span>
                            <span className="text-sm font-semibold text-gray-600">{brand.total} unit</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="h-2 rounded-full bg-gradient-to-r from-gray-500 to-gray-600 transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
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