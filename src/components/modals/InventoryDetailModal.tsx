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
    color: "#18181B",
    bg: "#F4F4F5",
    border: "#E4E4E7",
    bar: "linear-gradient(90deg, #18181B, #3F3F46)",
    stripColor: "linear-gradient(90deg, #18181B, #3F3F46)",
    iconBg: "#F4F4F5",
    label: "Kondisi terbaik",
  },
  B: {
    color: "#3F3F46",
    bg: "#F4F4F5",
    border: "#E4E4E7",
    bar: "linear-gradient(90deg, #52525B, #71717A)",
    stripColor: "linear-gradient(90deg, #52525B, #71717A)",
    iconBg: "#F4F4F5",
    label: "Kondisi baik",
  },
  C: {
    color: "#71717A",
    bg: "#F4F4F5",
    border: "#E4E4E7",
    bar: "linear-gradient(90deg, #A1A1AA, #D4D4D8)",
    stripColor: "linear-gradient(90deg, #A1A1AA, #D4D4D8)",
    iconBg: "#F4F4F5",
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

        .idm-shell {
          background: #FFFFFF;
          border: 1px solid #E4E4E7;
          box-shadow: 0 32px 80px rgba(0,0,0,0.16), 0 8px 24px rgba(0,0,0,0.08);
        }
        .idm-header {
          background: linear-gradient(135deg, #FAFAFA 0%, #F4F4F5 100%);
          border-bottom: 1px solid #E4E4E7;
        }
        .idm-stat {
          background: #FFFFFF;
          border: 1px solid #E4E4E7;
          box-shadow: 0 1px 4px rgba(0,0,0,0.05);
          transition: box-shadow 0.2s, transform 0.2s;
        }
        .idm-stat:hover { box-shadow: 0 4px 20px rgba(0,0,0,0.10); transform: translateY(-2px); }

        .idm-grade-card {
          background: #FFFFFF;
          border: 1px solid #E4E4E7;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          transition: box-shadow 0.2s, transform 0.2s;
        }
        .idm-grade-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.10); transform: translateY(-2px); }

        .idm-row-card {
          background: #FFFFFF;
          border: 1px solid #E4E4E7;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          transition: box-shadow 0.2s, transform 0.2s, border-color 0.2s;
        }
        .idm-row-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.10); transform: translateX(4px); border-color: #A1A1AA; }

        .idm-section-label {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #A1A1AA;
        }

        .idm-scroll::-webkit-scrollbar { width: 4px; }
        .idm-scroll::-webkit-scrollbar-track { background: transparent; }
        .idm-scroll::-webkit-scrollbar-thumb { background: #D4D4D8; border-radius: 4px; }

        .idm-shimmer {
          background: linear-gradient(90deg, #FAFAFA 25%, #F4F4F5 50%, #FAFAFA 75%);
          background-size: 200% 100%;
          animation: idm-shimmer 1.5s infinite;
          border-radius: 12px;
        }
        @keyframes idm-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }

        .idm-enter { opacity: 0; transform: scale(0.97) translateY(16px); }
        .idm-visible {
          opacity: 1; transform: scale(1) translateY(0);
          transition: opacity 0.28s ease, transform 0.28s cubic-bezier(0.34,1.25,0.64,1);
        }
        .idm-close { background: #F4F4F5; color: #A1A1AA; transition: background 0.2s, color 0.2s; }
        .idm-close:hover { background: #18181B; color: #FFFFFF; }
        .idm-handle { background: #D4D4D8; }

        .idm-footer {
          background: linear-gradient(135deg, #FAFAFA 0%, #F4F4F5 100%);
          border-top: 1px solid #E4E4E7;
        }
      `}</style>

      <div
        className="idm-overlay fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        style={{ background: "rgba(9,9,11,0.50)", backdropFilter: "blur(6px)" }}
        onClick={onClose}
      >
        <div
          className={`idm-shell relative w-full sm:max-w-lg max-h-[92vh] sm:max-h-[88vh] flex flex-col rounded-t-3xl sm:rounded-2xl overflow-hidden ${visible ? "idm-visible" : "idm-enter"}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle mobile */}
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="idm-handle w-10 h-1 rounded-full" />
          </div>

          {/* Header */}
          <div className="idm-header flex items-center justify-between px-5 sm:px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #18181B 0%, #3F3F46 100%)", boxShadow: "0 4px 14px rgba(0,0,0,0.35)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold" style={{ color: "#18181B" }}>Detail Inventory</h2>
                <p className="text-xs font-medium" style={{ color: "#A1A1AA" }}>Breakdown stok per grade dan brand</p>
              </div>
            </div>
            <button onClick={onClose} className="idm-close w-8 h-8 rounded-xl flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Scrollable body */}
          <div className="idm-scroll flex-1 overflow-y-auto" style={{ background: "#FAFAFA" }}>
            {isLoading ? (
              <div className="p-5 space-y-3">
                <div className="grid grid-cols-2 gap-3">{[1,2].map(i=><div key={i} className="idm-shimmer h-24"/>)}</div>
                <div className="grid grid-cols-3 gap-3 pt-2">{[1,2,3].map(i=><div key={i} className="idm-shimmer h-28"/>)}</div>
                <div className="space-y-2 pt-2">{[1,2,3,4].map(i=><div key={i} className="idm-shimmer h-14"/>)}</div>
              </div>
            ) : data ? (
              <div className="p-5 space-y-5">

                {/* Summary Cards */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="idm-stat rounded-2xl overflow-hidden">
                    <div className="h-1" style={{ background: "linear-gradient(90deg, #18181B, #3F3F46)" }} />
                    <div className="p-4">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-3" style={{ background: "#F4F4F5" }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#18181B" strokeWidth="2.5" strokeLinecap="round">
                          <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                      </div>
                      <p className="idm-section-label">Total Unit</p>
                      <p className="text-3xl font-extrabold mt-1" style={{ color: "#18181B" }}>{data.total}</p>
                      <p className="text-xs font-medium mt-1" style={{ color: "#A1A1AA" }}>stok tersedia</p>
                    </div>
                  </div>
                  <div className="idm-stat rounded-2xl overflow-hidden">
                    <div className="h-1" style={{ background: "linear-gradient(90deg, #52525B, #71717A)" }} />
                    <div className="p-4">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-3" style={{ background: "#F4F4F5" }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#52525B" strokeWidth="2.5" strokeLinecap="round">
                          <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                      </div>
                      <p className="idm-section-label">Total Model</p>
                      <p className="text-3xl font-extrabold mt-1" style={{ color: "#18181B" }}>{data.totalModels}</p>
                      <p className="text-xs font-medium mt-1" style={{ color: "#A1A1AA" }}>variasi unik</p>
                    </div>
                  </div>
                </div>

                {/* Grade Breakdown */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="idm-section-label">Berdasarkan Grade</p>
                    <p className="text-[10px] font-medium" style={{ color: "#D4D4D8" }}>Distribusi stok</p>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {(["A", "B", "C"] as const).map((grade) => {
                      const cfg = GRADE_CONFIG[grade];
                      const gradeData = data.byGrade[grade];
                      return (
                        <div key={grade} className="idm-grade-card rounded-2xl overflow-hidden">
                          <div className="h-1" style={{ background: cfg.stripColor }} />
                          <div className="p-3">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2.5 text-base font-black"
                              style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                              {grade}
                            </div>
                            <p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "#A1A1AA" }}>Grade {grade}</p>
                            <p className="text-xl font-extrabold mt-0.5" style={{ color: "#18181B" }}>
                              {gradeData.qty} <span className="text-xs font-normal" style={{ color: "#A1A1AA" }}>unit</span>
                            </p>
                            <div className="w-full h-1.5 rounded-full mt-2.5 overflow-hidden" style={{ background: "#F4F4F5" }}>
                              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${gradeData.pct}%`, background: cfg.bar }} />
                            </div>
                            <p className="text-[10px] mt-1.5 font-bold" style={{ color: cfg.color }}>{gradeData.pct}%</p>
                            <p className="text-[8px] mt-0.5 font-medium" style={{ color: "#D4D4D8" }}>{cfg.label}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Brand Breakdown */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="idm-section-label">Top Brand</p>
                    <p className="text-[10px] font-medium" style={{ color: "#D4D4D8" }}>Berdasarkan jumlah unit</p>
                  </div>
                  {data.byBrand.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-2xl border border-dashed" style={{ borderColor: "#E4E4E7" }}>
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: "#F4F4F5" }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#D4D4D8" strokeWidth="1.8">
                          <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                      </div>
                      <p className="text-sm font-semibold" style={{ color: "#A1A1AA" }}>Belum ada data brand</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {data.byBrand.map((brand, idx) => {
                        const pct = Math.max(4, Math.round((brand.total / maxBrand) * 100));
                        const isTop = idx === 0;
                        return (
                          <div key={brand.name} className="idm-row-card rounded-2xl p-4 cursor-default">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <div
                                  className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
                                  style={isTop
                                    ? { background: "linear-gradient(135deg, #18181B, #3F3F46)", color: "white", boxShadow: "0 4px 12px rgba(0,0,0,0.30)" }
                                    : { background: "#F4F4F5", color: "#71717A" }
                                  }
                                >
                                  #{idx + 1}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold truncate" style={{ color: "#18181B" }}>{brand.name}</p>
                                  {isTop && (
                                    <p className="text-[9px] font-bold mt-0.5" style={{ color: "#18181B" }}>Paling banyak</p>
                                  )}
                                </div>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-sm font-bold" style={{ color: "#18181B" }}>{brand.total}</p>
                                <p className="text-[9px] font-medium" style={{ color: "#A1A1AA" }}>unit</p>
                              </div>
                            </div>
                            <div className="w-full h-1.5 rounded-full mt-3 overflow-hidden" style={{ background: "#F4F4F5" }}>
                              <div className="h-full rounded-full transition-all duration-700"
                                style={{ width: `${pct}%`, background: isTop ? "linear-gradient(90deg, #18181B, #3F3F46)" : "linear-gradient(90deg, #D4D4D8, #E4E4E7)" }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Footer Info */}
                <div className="rounded-2xl p-4 flex items-start gap-3"
                  style={{ background: "linear-gradient(135deg, #FAFAFA 0%, #F4F4F5 100%)", border: "1px solid #E4E4E7" }}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "#F4F4F5" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#52525B" strokeWidth="2.2">
                      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                  </div>
                  <p className="text-[10px] leading-relaxed font-medium" style={{ color: "#71717A" }}>
                    Grade A: kondisi terbaik · Grade B: kondisi baik · Grade C: kondisi standar
                  </p>
                </div>

              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "#F4F4F5" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                </div>
                <p className="text-sm font-semibold" style={{ color: "#52525B" }}>Gagal memuat data</p>
                <p className="text-xs font-medium" style={{ color: "#A1A1AA" }}>Coba tutup dan buka kembali</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}