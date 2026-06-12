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

const GRADE_CONFIG = {
  A: {
    color: "#10B981",
    glow: "rgba(16,185,129,0.2)",
    border: "rgba(16,185,129,0.25)",
    bg: "rgba(16,185,129,0.12)",
    bar: "linear-gradient(90deg, #10B981, #34D399)",
    label: "Kondisi terbaik",
  },
  B: {
    color: "#F59E0B",
    glow: "rgba(245,158,11,0.2)",
    border: "rgba(245,158,11,0.25)",
    bg: "rgba(245,158,11,0.12)",
    bar: "linear-gradient(90deg, #F59E0B, #FCD34D)",
    label: "Kondisi baik",
  },
  C: {
    color: "#818CF8",
    glow: "rgba(99,102,241,0.2)",
    border: "rgba(99,102,241,0.25)",
    bg: "rgba(99,102,241,0.12)",
    bar: "linear-gradient(90deg, #818CF8, #A5B4FC)",
    label: "Kondisi standar",
  },
} as const;

export function InventoryDetailModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [data, setData] = useState<InventoryDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
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

  const maxBrand = data?.byBrand[0]?.total || 1;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

        .idm-overlay { font-family: 'Inter', sans-serif; }

        .idm-card {
          background: linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%);
          border: 1px solid rgba(255,255,255,0.08);
          backdrop-filter: blur(10px);
        }

        .idm-row { transition: background 0.2s, transform 0.2s; }
        .idm-row:hover { background: rgba(255,255,255,0.05); transform: translateX(3px); }

        .idm-scrollbar::-webkit-scrollbar { width: 4px; }
        .idm-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .idm-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }

        .idm-shimmer {
          background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.03) 75%);
          background-size: 200% 100%;
          animation: idm-shimmer 1.5s infinite;
        }
        @keyframes idm-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }

        .idm-modal-enter { opacity: 0; transform: scale(0.96) translateY(12px); }
        .idm-modal-visible {
          opacity: 1;
          transform: scale(1) translateY(0);
          transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.34, 1.3, 0.64, 1);
        }

        .idm-stat-glow-blue  { box-shadow: 0 0 30px rgba(99,102,241,0.12),  inset 0 1px 0 rgba(255,255,255,0.06); }
        .idm-stat-glow-green { box-shadow: 0 0 30px rgba(16,185,129,0.12),  inset 0 1px 0 rgba(255,255,255,0.06); }
      `}</style>

      <div
        className="idm-overlay fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
        onClick={onClose}
      >
        <div
          className={`relative w-full sm:max-w-lg max-h-[92vh] sm:max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-2xl overflow-hidden ${visible ? "idm-modal-visible" : "idm-modal-enter"}`}
          style={{ background: "linear-gradient(160deg, #141820 0%, #0F1117 60%, #111318 100%)", border: "1px solid rgba(255,255,255,0.08)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle mobile */}
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="w-10 h-1 rounded-full bg-white/20" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 sm:px-6 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #818CF8, #6366F1)", boxShadow: "0 0 20px rgba(99,102,241,0.4)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold" style={{ color: "#F1F5F9" }}>Detail Inventory</h2>
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Breakdown stok per grade dan brand</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
              style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.12)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.8)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.4)"; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Scrollable content */}
          <div className="idm-scrollbar flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-5 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {[1, 2].map((i) => <div key={i} className="idm-shimmer rounded-xl h-20" />)}
                </div>
                <div className="grid grid-cols-3 gap-3 pt-2">
                  {[1, 2, 3].map((i) => <div key={i} className="idm-shimmer rounded-xl h-24" />)}
                </div>
                <div className="space-y-2 pt-2">
                  {[1, 2, 3, 4].map((i) => <div key={i} className="idm-shimmer rounded-xl h-14" />)}
                </div>
              </div>
            ) : data ? (
              <div className="p-5 space-y-5">

                {/* Summary Cards */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="idm-card idm-stat-glow-blue rounded-xl p-3.5">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center mb-2" style={{ background: "rgba(99,102,241,0.2)" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="2.5" strokeLinecap="round">
                        <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                    </div>
                    <p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>Total Unit</p>
                    <p className="text-2xl font-bold mt-0.5" style={{ color: "#F1F5F9" }}>{data.total}</p>
                    <p className="text-[9px] mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>stok tersedia</p>
                  </div>

                  <div className="idm-card idm-stat-glow-green rounded-xl p-3.5">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center mb-2" style={{ background: "rgba(16,185,129,0.2)" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round">
                        <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                    </div>
                    <p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>Total Model</p>
                    <p className="text-2xl font-bold mt-0.5" style={{ color: "#F1F5F9" }}>{data.totalModels}</p>
                    <p className="text-[9px] mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>variasi unik</p>
                  </div>
                </div>

                {/* Grade Breakdown */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>Berdasarkan Grade</p>
                    <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>Distribusi stok</p>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {(["A", "B", "C"] as const).map((grade) => {
                      const cfg = GRADE_CONFIG[grade];
                      const gradeData = data.byGrade[grade];
                      return (
                        <div
                          key={grade}
                          className="idm-card rounded-xl p-3.5"
                          style={{ border: `1px solid ${cfg.border}`, boxShadow: `0 0 20px ${cfg.glow}` }}
                        >
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2 text-sm font-black" style={{ background: cfg.bg, color: cfg.color }}>
                            {grade}
                          </div>
                          <p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>Grade {grade}</p>
                          <p className="text-lg font-bold mt-0.5" style={{ color: "#F1F5F9" }}>{gradeData.qty} <span className="text-xs font-normal" style={{ color: "rgba(255,255,255,0.4)" }}>unit</span></p>
                          <div className="w-full h-1 rounded-full mt-2 overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${gradeData.pct}%`, background: cfg.bar }} />
                          </div>
                          <p className="text-[9px] mt-1.5 font-semibold" style={{ color: cfg.color }}>{gradeData.pct}%</p>
                          <p className="text-[8px] mt-0.5" style={{ color: "rgba(255,255,255,0.25)" }}>{cfg.label}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Brand Breakdown */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>Top Brand</p>
                    <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>Berdasarkan jumlah unit</p>
                  </div>

                  {data.byBrand.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: "rgba(255,255,255,0.05)" }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5">
                          <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                      </div>
                      <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.35)" }}>Belum ada data brand</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {data.byBrand.map((brand, idx) => {
                        const pct = Math.max(4, Math.round((brand.total / maxBrand) * 100));
                        const isTop = idx === 0;
                        return (
                          <div key={brand.name} className="idm-row idm-card rounded-xl p-3.5 cursor-default">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <div
                                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px] font-bold"
                                  style={isTop
                                    ? { background: "linear-gradient(135deg, #818CF8, #6366F1)", color: "white", boxShadow: "0 0 12px rgba(99,102,241,0.4)" }
                                    : { background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.45)" }
                                  }
                                >
                                  #{idx + 1}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold truncate" style={{ color: "#F1F5F9" }}>{brand.name}</p>
                                  {isTop && (
                                    <p className="text-[9px] font-semibold" style={{ color: "#818CF8" }}>Paling banyak</p>
                                  )}
                                </div>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-sm font-bold" style={{ color: "#F1F5F9" }}>{brand.total}</p>
                                <p className="text-[9px]" style={{ color: "rgba(255,255,255,0.35)" }}>unit</p>
                              </div>
                            </div>
                            <div className="w-full h-1 rounded-full mt-2 overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                              <div
                                className="h-full rounded-full transition-all duration-700"
                                style={{ width: `${pct}%`, background: isTop ? "linear-gradient(90deg, #818CF8, #A5B4FC)" : "linear-gradient(90deg, rgba(255,255,255,0.2), rgba(255,255,255,0.3))" }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Footer info */}
                <div className="rounded-xl p-3.5 flex items-start gap-2.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" className="flex-shrink-0 mt-0.5">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <p className="text-[10px] leading-relaxed" style={{ color: "rgba(255,255,255,0.3)" }}>
                    Grade A: kondisi terbaik · Grade B: kondisi baik · Grade C: kondisi standar
                  </p>
                </div>

              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "rgba(239,68,68,0.1)" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </div>
                <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>Gagal memuat data</p>
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>Coba tutup dan buka kembali</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}