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
  const [isMemuat, setIsMemuat] = useState(false);
  const [expandedLaptop, setExpandedLaptop] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOpen) setTimeout(() => setVisible(true), 10);
    else setVisible(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const fetch_ = async () => {
      setIsMemuat(true);
      try {
        const res = await fetch("/api/dashboard/laptop-detail");
        const result = await res.json();
        if (result.success) setData(result.data);
      } catch (e) {
        console.error(e);
      } finally {
        setIsMemuat(false);
      }
    };
    fetch_();
  }, [isOpen]);

  if (!isOpen) return null;

  const RANK_STYLES = [
    { bg: "linear-gradient(135deg, #6366f1, #4f46e5)", shadow: "0 4px 12px rgba(0,0,0,0.35)", color: "white" },
    { bg: "linear-gradient(135deg, #52525B, #3F3F46)", shadow: "0 4px 12px rgba(0,0,0,0.25)", color: "white" },
    { bg: "linear-gradient(135deg, #A1A1AA, #71717A)", shadow: "0 4px 12px rgba(0,0,0,0.20)", color: "white" },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        .ldm-overlay { font-family: 'Inter', sans-serif; }

        .ldm-shell {
          background: #FFFFFF;
          border: 1px solid #F1F5F9;
          box-shadow: 0 4px 20px -4px rgba(0,0,0,0.05);
        }
        .ldm-header {
          background: linear-gradient(135deg, #FAFAFA 0%, #F4F4F5 100%);
          border-bottom: 1px solid #E4E4E7;
        }
        .ldm-stat {
          background: #FFFFFF;
          border: 1px solid #F1F5F9;
          box-shadow: 0 2px 10px rgba(0,0,0,0.02);
          transition: box-shadow 0.2s, transform 0.2s;
        }
        .ldm-stat:hover { box-shadow: 0 4px 20px rgba(0,0,0,0.10); transform: translateY(-2px); }

        .ldm-laptop-card {
          background: #FFFFFF;
          border: 1px solid #F1F5F9;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          transition: box-shadow 0.2s;
        }
        .ldm-laptop-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.09); }

        .ldm-expand-btn:hover { background: #FAFAFA; }

        .ldm-daily-item {
          background: #FFFFFF;
          border: 1px solid #F4F4F5;
          border-radius: 10px;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .ldm-daily-item:hover { border-color: #A1A1AA; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }

        .ldm-scroll::-webkit-scrollbar { width: 4px; }
        .ldm-scroll::-webkit-scrollbar-track { background: transparent; }
        .ldm-scroll::-webkit-scrollbar-thumb { background: #D4D4D8; border-radius: 4px; }

        .ldm-inner-scroll::-webkit-scrollbar { width: 3px; }
        .ldm-inner-scroll::-webkit-scrollbar-track { background: transparent; }
        .ldm-inner-scroll::-webkit-scrollbar-thumb { background: #E4E4E7; border-radius: 3px; }

        .ldm-shimmer {
          background: linear-gradient(90deg, #FAFAFA 25%, #F4F4F5 50%, #FAFAFA 75%);
          background-size: 200% 100%;
          animation: ldm-shimmer 1.5s infinite;
          border-radius: 12px;
        }
        @keyframes ldm-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }

        .ldm-enter { opacity: 0; transform: scale(0.97) translateY(16px); }
        .ldm-visible {
          opacity: 1; transform: scale(1) translateY(0);
          transition: opacity 0.28s ease, transform 0.28s cubic-bezier(0.34,1.25,0.64,1);
        }
        .ldm-close { background: #F4F4F5; color: #A1A1AA; transition: background 0.2s, color 0.2s; }
        .ldm-close:hover { background: #6366f1; color: #FFFFFF; }
        .ldm-handle { background: #D4D4D8; }

        .ldm-footer { background: linear-gradient(135deg, #FAFAFA 0%, #F4F4F5 100%); border-top: 1px solid #E4E4E7; }
        .ldm-section-label { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #A1A1AA; }
      `}</style>

      <div
        className="ldm-overlay fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        style={{ background: "rgba(9,9,11,0.50)", backdropFilter: "blur(6px)" }}
        onClick={onClose}
      >
        <div
          className={`ldm-shell relative w-full sm:max-w-lg max-h-[92vh] sm:max-h-[88vh] flex flex-col rounded-t-3xl sm:rounded-2xl overflow-hidden ${visible ? "ldm-visible" : "ldm-enter"}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="ldm-handle w-10 h-1 rounded-full" />
          </div>

          {/* Header */}
          <div className="ldm-header flex items-center justify-between px-5 sm:px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)", boxShadow: "0 4px 14px rgba(0,0,0,0.35)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
                  <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                </svg>
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold" style={{ color: "#0f172a" }}>Detail Laptop Terlaris</h2>
                <p className="text-xs font-medium" style={{ color: "#A1A1AA" }}>Performa model laptop dan breakdown harian</p>
              </div>
            </div>
            <button onClick={onClose} className="ldm-close w-8 h-8 rounded-xl flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="ldm-scroll flex-1 overflow-y-auto" style={{ background: "#FAFAFA" }}>
            {isMemuat ? (
              <div className="p-5 space-y-3">
                <div className="grid grid-cols-2 gap-3">{[1,2].map(i=><div key={i} className="ldm-shimmer h-24"/>)}</div>
                <div className="space-y-2 pt-2">{[1,2,3].map(i=><div key={i} className="ldm-shimmer h-16"/>)}</div>
              </div>
            ) : data ? (
              <div className="p-5 space-y-5">

                {/* Summary */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="ldm-stat rounded-2xl overflow-hidden">
                    <div className="h-1" style={{ background: "linear-gradient(90deg, #6366f1, #818cf8)" }} />
                    <div className="p-4">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-3" style={{ background: "#F4F4F5" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round">
                          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                        </svg>
                      </div>
                      <p className="ldm-section-label">Hari Ini</p>
                      <p className="text-3xl font-extrabold mt-1" style={{ color: "#0f172a" }}>{data.today.count}</p>
                      <p className="text-xs font-medium mt-1" style={{ color: "#A1A1AA" }}>transaksi</p>
                    </div>
                  </div>
                  <div className="ldm-stat rounded-2xl overflow-hidden">
                    <div className="h-1" style={{ background: "linear-gradient(90deg, #6366f1, #818cf8)" }} />
                    <div className="p-4">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-3" style={{ background: "#F4F4F5" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#52525B" strokeWidth="2.5" strokeLinecap="round">
                          <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                        </svg>
                      </div>
                      <p className="ldm-section-label">Bulan Ini</p>
                      <p className="text-3xl font-extrabold mt-1" style={{ color: "#0f172a" }}>{data.monthly.count}</p>
                      <p className="text-xs font-medium mt-1" style={{ color: "#A1A1AA" }}>transaksi</p>
                    </div>
                  </div>
                </div>

                {/* Laptop List */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="ldm-section-label">Top Performers (30 Hari)</p>
                    <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full" style={{ background: "#F4F4F5", color: "#475569" }}>
                      {data.laptopPerformance.length} model
                    </span>
                  </div>

                  {data.laptopPerformance.length === 0 ? (
                    <div className="text-center py-14 bg-white rounded-2xl border border-dashed" style={{ borderColor: "#E4E4E7" }}>
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: "#F4F4F5" }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#D4D4D8" strokeWidth="1.8">
                          <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                        </svg>
                      </div>
                      <p className="text-sm font-semibold" style={{ color: "#A1A1AA" }}>Belum ada data</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {data.laptopPerformance.map((laptop, idx) => {
                        const rankStyle = idx < 3 ? RANK_STYLES[idx] : null;
                        const isExpanded = expandedLaptop === laptop.name;
                        return (
                          <div key={laptop.name} className="ldm-laptop-card rounded-2xl overflow-hidden">
                            {/* Row */}
                            <button
                              className="ldm-expand-btn w-full px-4 py-3.5 flex items-center justify-between gap-3 transition-colors"
                              onClick={() => setExpandedLaptop(isExpanded ? null : laptop.name)}
                            >
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div
                                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold"
                                  style={rankStyle
                                    ? { background: rankStyle.bg, boxShadow: rankStyle.shadow, color: rankStyle.color }
                                    : { background: "#F4F4F5", color: "#71717A" }
                                  }
                                >
                                  {idx + 1}
                                </div>
                                <div className="flex-1 min-w-0 text-left">
                                  <p className="text-sm font-semibold truncate" style={{ color: "#0f172a" }}>{laptop.name}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[10px] font-medium" style={{ color: "#A1A1AA" }}>{laptop.total}x terjual</span>
                                    <span className="w-1 h-1 rounded-full" style={{ background: "#E4E4E7" }} />
                                    <span className="text-[10px] font-semibold" style={{ color: "#0f172a" }}>{fmtShort(laptop.revenue)}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="hidden sm:block text-right">
                                  <p className="text-[9px] font-medium" style={{ color: "#A1A1AA" }}>rata-rata</p>
                                  <p className="text-xs font-bold" style={{ color: "#0f172a" }}>{fmtShort(laptop.revenue / laptop.total)}</p>
                                </div>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="2"
                                  className={`flex-shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}>
                                  <polyline points="6 9 12 15 18 9"/>
                                </svg>
                              </div>
                            </button>

                            {/* Expanded */}
                            {isExpanded && (
                              <div className="border-t" style={{ borderColor: "#F4F4F5", background: "#FAFAFA" }}>
                                <div className="px-4 py-3">
                                  <div className="flex items-center gap-2 mb-3">
                                    <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: "#F4F4F5" }}>
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5">
                                        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                                      </svg>
                                    </div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#A1A1AA" }}>Daily Performance</p>
                                  </div>
                                  <div className="ldm-inner-scroll space-y-1.5 max-h-56 overflow-y-auto">
                                    {laptop.dailyBreakdown.length === 0 ? (
                                      <p className="text-xs text-center py-6" style={{ color: "#A1A1AA" }}>Belum ada data harian</p>
                                    ) : (
                                      laptop.dailyBreakdown.map((day, i) => (
                                        <div key={day.date} className="ldm-daily-item px-3 py-2.5">
                                          <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2.5">
                                              <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                                                style={{ background: "#F4F4F5", color: "#0f172a" }}>
                                                {i + 1}
                                              </div>
                                              <div>
                                                <p className="text-xs font-semibold" style={{ color: "#0f172a" }}>{day.label}</p>
                                                <p className="text-[9px] font-medium" style={{ color: "#A1A1AA" }}>{day.total} unit terjual</p>
                                              </div>
                                            </div>
                                            <div className="text-right">
                                              <p className="text-xs font-bold" style={{ color: "#0f172a" }}>{fmtRupiah(day.revenue)}</p>
                                              <div className="w-16 h-1 rounded-full mt-1 overflow-hidden" style={{ background: "#F4F4F5" }}>
                                                <div className="h-full rounded-full" style={{
                                                  width: `${(day.revenue / laptop.revenue) * 100}%`,
                                                  background: "linear-gradient(90deg, #6366f1, #818cf8)"
                                                }} />
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "#F4F4F5" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                </div>
                <p className="text-sm font-semibold" style={{ color: "#475569" }}>Gagal memuat data</p>
                <p className="text-xs font-medium" style={{ color: "#A1A1AA" }}>Coba tutup dan buka kembali</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="ldm-footer px-5 sm:px-6 py-3">
            <p className="text-[10px] font-medium text-center" style={{ color: "#A1A1AA" }}>
              Data diperbarui secara real-time · {new Date().toLocaleDateString("id-ID")}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}