"use client";

import { useState, useEffect } from "react";

interface GrossProfitDetail {
  today: { gross_profit: number; revenue: number; count: number; margin_pct: number };
  daily: Array<{ date: string; label: string; gross_profit: number; revenue: number; count: number; margin_pct: number }>;
  weekly: Array<{ weekStart: string; label: string; gross_profit: number; revenue: number; count: number; margin_pct: number }>;
  monthly: { gross_profit: number; revenue: number; count: number; margin_pct: number };
}

const fmtRupiah = (n: number): string =>
  "Rp " + (n || 0).toLocaleString("id-ID");

const fmtShort = (n: number): string => {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}Jt`;
  if (n >= 1_000) return `Rp ${(n / 1_000).toFixed(0)}Rb`;
  return `Rp ${n}`;
};

// Target gross profit harian (Rupiah) — ubah angka ini kalau target berubah
const DAILY_PROFIT_TARGET = 5_000_000;

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(4, (value / max) * 100)) : 4;
  return (
    <div className="w-full h-1.5 rounded-full overflow-hidden mt-3" style={{ background: "#F1F5F9" }}>
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

function TargetStatusBanner({ profit }: { profit: number }) {
  const met = profit >= DAILY_PROFIT_TARGET; // >= : tepat 5jt sudah dianggap tercapai
  const pct = Math.floor(Math.min(100, (profit / DAILY_PROFIT_TARGET) * 100));
  const diff = Math.abs(profit - DAILY_PROFIT_TARGET);
  const achievedPct = Math.max(0, Math.floor((profit / DAILY_PROFIT_TARGET) * 100)); // display only, bisa > 100%

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-4"
      style={{
        background: met
          ? "linear-gradient(135deg, #F0FDF4 0%, #ECFDF5 100%)"
          : "linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%)",
        border: `1px solid ${met ? "#A7F3D0" : "#FECACA"}`,
        boxShadow: met
          ? "0 1px 3px rgba(5,150,105,0.08), 0 10px 28px rgba(16,185,129,0.10)"
          : "0 1px 3px rgba(220,38,38,0.08), 0 10px 28px rgba(239,68,68,0.10)",
      }}
    >
      {/* Watermark dekoratif */}
      <svg
        className="absolute -top-5 -right-5 pointer-events-none"
        width="128" height="128" viewBox="0 0 24 24" fill="none"
        stroke={met ? "#10B981" : "#EF4444"} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"
        style={{ opacity: 0.07 }}
      >
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
      </svg>

      {/* Header */}
      <div className="relative flex items-center justify-between gap-3 mb-3.5">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: met ? "#DCFCE7" : "#FEE2E2",
              border: `1px solid ${met ? "#A7F3D0" : "#FECACA"}`,
              boxShadow: met
                ? "0 2px 8px rgba(16,185,129,0.20)"
                : "0 2px 8px rgba(239,68,68,0.20)",
            }}
          >
            {met ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#94A3B8" }}>
              Status Target Harian
            </p>
            <p className="text-[15px] font-extrabold leading-tight truncate" style={{ color: met ? "#059669" : "#DC2626" }}>
              {met ? "Melebihi Target" : "Belum Melebihi Target"}
            </p>
          </div>
        </div>

        {/* Persentase besar */}
        <div className="text-right flex-shrink-0">
          <p className="text-2xl font-extrabold leading-none tabular-nums" style={{ color: met ? "#059669" : "#DC2626" }}>
            {achievedPct}%
          </p>
          <p className="text-[9px] font-semibold uppercase tracking-wider mt-1" style={{ color: "#94A3B8" }}>
            dari target
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div
        className="relative w-full h-2.5 rounded-full overflow-hidden"
        style={{ background: "rgba(255,255,255,0.85)", border: `1px solid ${met ? "#A7F3D0" : "#FECACA"}` }}
      >
        <div
          className="h-full rounded-full transition-all duration-1000 ease-out"
          style={{
            width: `${Math.max(4, pct)}%`,
            background: met
              ? "linear-gradient(90deg, #10B981, #34D399)"
              : "linear-gradient(90deg, #EF4444, #F87171)",
            boxShadow: met
              ? "0 0 8px rgba(16,185,129,0.5)"
              : "0 0 8px rgba(239,68,68,0.5)",
          }}
        />
      </div>

      {/* Footer: pesan + target */}
      <div className="relative flex items-center justify-between gap-3 mt-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: met ? "#10B981" : "#EF4444" }}
          />
          <p className="text-[11px] font-medium truncate" style={{ color: met ? "#059669" : "#DC2626" }}>
            {met
              ? diff > 0
                ? `Surplus ${fmtRupiah(diff)} di atas target`
                : "Tepat mencapai target"
              : `Kurang ${fmtRupiah(diff)} lagi untuk capai target`}
          </p>
        </div>
        <p className="text-[11px] font-semibold flex-shrink-0" style={{ color: "#475569" }}>
          Target <span className="font-extrabold" style={{ color: "#0F172A" }}>{fmtShort(DAILY_PROFIT_TARGET)}</span>
        </p>
      </div>
    </div>
  );
}

export function GrossProfitDetailModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [data, setData] = useState<GrossProfitDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"daily" | "weekly" | "monthly">("daily");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => setVisible(true), 10);
    } else {
      setVisible(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const res = await fetch("/api/dashboard/gross-profit-detail");
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

  const maxWeeklyProfit = data ? Math.max(...data.weekly.map((w) => w.gross_profit), 1) : 1;

  const tabs = [
    { key: "daily", label: "Harian" },
    { key: "weekly", label: "Mingguan" },
    { key: "monthly", label: "Bulanan" },
  ] as const;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

        .gpdm-overlay { font-family: 'Inter', sans-serif; }

        /* ── Modal shell ── */
        .gpdm-shell {
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          box-shadow: 0 32px 80px rgba(15,23,42,0.14), 0 8px 24px rgba(15,23,42,0.08);
        }

        /* ── Glass header ── */
        .gpdm-header {
          background: linear-gradient(135deg, #F8FAFF 0%, #F0F4FF 100%);
          border-bottom: 1px solid #E8EFFE;
        }

        /* ── Stat cards ── */
        .gpdm-stat {
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          box-shadow: 0 1px 4px rgba(15,23,42,0.06), 0 4px 16px rgba(15,23,42,0.04);
          transition: box-shadow 0.2s, transform 0.2s;
        }
        .gpdm-stat:hover {
          box-shadow: 0 4px 20px rgba(15,23,42,0.1);
          transform: translateY(-2px);
        }

        /* ── Tabs ── */
        .gpdm-tabs-wrap {
          background: #F1F5F9;
          border-radius: 14px;
          padding: 4px;
        }
        .gpdm-tab-active {
          background: #FFFFFF;
          color: #6366F1;
          font-weight: 700;
          box-shadow: 0 2px 8px rgba(99,102,241,0.18), 0 1px 3px rgba(15,23,42,0.08);
        }
        .gpdm-tab-inactive {
          color: #94A3B8;
          font-weight: 500;
        }
        .gpdm-tab-inactive:hover {
          color: #475569;
          background: rgba(255,255,255,0.6);
        }

        /* ── Row cards ── */
        .gpdm-row-card {
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          box-shadow: 0 1px 3px rgba(15,23,42,0.05);
          transition: box-shadow 0.2s, transform 0.2s, border-color 0.2s;
        }
        .gpdm-row-card:hover {
          box-shadow: 0 4px 16px rgba(15,23,42,0.1);
          transform: translateX(4px);
          border-color: #C7D2FE;
        }

        /* ── Badges ── */
        .badge-profit {
          background: #ECFDF5;
          color: #059669;
          border: 1px solid #A7F3D0;
          font-size: 9px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 6px;
        }
        .badge-margin {
          background: #EEF2FF;
          color: #6366F1;
          border: 1px solid #C7D2FE;
          font-size: 9px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 6px;
        }

        /* ── Scrollbar ── */
        .gpdm-scroll::-webkit-scrollbar { width: 4px; }
        .gpdm-scroll::-webkit-scrollbar-track { background: transparent; }
        .gpdm-scroll::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 4px; }

        /* ── Shimmer ── */
        .gpdm-shimmer {
          background: linear-gradient(90deg, #F8FAFC 25%, #EEF2FF 50%, #F8FAFC 75%);
          background-size: 200% 100%;
          animation: gpdm-shimmer 1.5s infinite;
          border-radius: 12px;
        }
        @keyframes gpdm-shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }

        /* ── Enter animation ── */
        .gpdm-enter { opacity: 0; transform: scale(0.97) translateY(16px); }
        .gpdm-visible {
          opacity: 1;
          transform: scale(1) translateY(0);
          transition: opacity 0.28s ease, transform 0.28s cubic-bezier(0.34, 1.25, 0.64, 1);
        }

        /* ── Monthly detail cards ── */
        .gpdm-monthly-card {
          background: #FAFBFF;
          border: 1px solid #E2E8F0;
          border-radius: 14px;
          transition: box-shadow 0.2s;
        }
        .gpdm-monthly-card:hover { box-shadow: 0 4px 16px rgba(15,23,42,0.08); }

        /* ── Close button ── */
        .gpdm-close {
          background: #F1F5F9;
          color: #94A3B8;
          transition: background 0.2s, color 0.2s;
        }
        .gpdm-close:hover { background: #FEE2E2; color: #EF4444; }

        /* ── Drag handle ── */
        .gpdm-handle { background: #CBD5E1; }
      `}</style>

      {/* ── Overlay ── */}
      <div
        className="gpdm-overlay fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(6px)" }}
        onClick={onClose}
      >
        {/* ── Modal shell ── */}
        <div
          className={`gpdm-shell relative w-full sm:max-w-lg max-h-[92vh] sm:max-h-[88vh] flex flex-col rounded-t-3xl sm:rounded-2xl overflow-hidden ${visible ? "gpdm-visible" : "gpdm-enter"}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle (mobile) */}
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="gpdm-handle w-10 h-1 rounded-full" />
          </div>

          {/* ── Header ── */}
          <div className="gpdm-header flex items-center justify-between px-5 sm:px-6 py-4">
            <div className="flex items-center gap-3">
              {/* Icon */}
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: "linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)",
                  boxShadow: "0 4px 14px rgba(99,102,241,0.35)",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold" style={{ color: "#0F172A" }}>Detail Gross Profit</h2>
                <p className="text-xs font-medium" style={{ color: "#94A3B8" }}>Rincian margin keuntungan per periode</p>
              </div>
            </div>
            {/* Close */}
            <button
              onClick={onClose}
              className="gpdm-close w-8 h-8 rounded-xl flex items-center justify-center"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* ── Scrollable body ── */}
          <div className="gpdm-scroll flex-1 overflow-y-auto" style={{ background: "#F8FAFC" }}>

            {/* ── Loading ── */}
            {isLoading ? (
              <div className="p-5 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  {[1, 2, 3].map((i) => <div key={i} className="gpdm-shimmer h-24" />)}
                </div>
                <div className="space-y-2 pt-2">
                  {[1, 2, 3, 4, 5].map((i) => <div key={i} className="gpdm-shimmer h-16" />)}
                </div>
              </div>

            ) : data ? (
              <div className="p-5 space-y-4">

                {/* ── Stat Cards Row ── */}
                <div className="grid grid-cols-3 gap-3">

                  {/* Profit Hari Ini */}
                  <div className="gpdm-stat rounded-2xl overflow-hidden">
                    {/* Colored top stripe */}
                    <div className="h-1" style={{ background: "linear-gradient(90deg, #10B981, #34D399)" }} />
                    <div className="p-3">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2.5" style={{ background: "#ECFDF5" }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round">
                          <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                        </svg>
                      </div>
                      <p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "#94A3B8" }}>Profit Hari Ini</p>
                      <p className="text-sm font-extrabold mt-0.5 leading-tight" style={{ color: "#0F172A" }}>{fmtShort(data.today.gross_profit)}</p>
                      <p className="text-[9px] mt-1.5 font-medium" style={{ color: "#10B981" }}>{data.today.margin_pct}% margin</p>
                    </div>
                  </div>

                  {/* Bulan Ini */}
                  <div className="gpdm-stat rounded-2xl overflow-hidden">
                    <div className="h-1" style={{ background: "linear-gradient(90deg, #F59E0B, #FCD34D)" }} />
                    <div className="p-3">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2.5" style={{ background: "#FFFBEB" }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round">
                          <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                      </div>
                      <p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "#94A3B8" }}>Bulan Ini</p>
                      <p className="text-sm font-extrabold mt-0.5 leading-tight" style={{ color: "#0F172A" }}>{fmtShort(data.monthly.gross_profit)}</p>
                      <p className="text-[9px] mt-1.5 font-medium" style={{ color: "#F59E0B" }}>{data.monthly.margin_pct}% margin</p>
                    </div>
                  </div>

                  {/* Omzet */}
                  <div className="gpdm-stat rounded-2xl overflow-hidden">
                    <div className="h-1" style={{ background: "linear-gradient(90deg, #6366F1, #818CF8)" }} />
                    <div className="p-3">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2.5" style={{ background: "#EEF2FF" }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2.5" strokeLinecap="round">
                          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
                        </svg>
                      </div>
                      <p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "#94A3B8" }}>Omzet</p>
                      <p className="text-sm font-extrabold mt-0.5 leading-tight" style={{ color: "#0F172A" }}>{fmtShort(data.today.revenue)}</p>
                      <p className="text-[9px] mt-1.5 font-medium" style={{ color: "#6366F1" }}>{data.today.count} transaksi</p>
                    </div>
                  </div>
                </div>

                {/* ── Status Target Harian ── */}
                <TargetStatusBanner profit={data.today.gross_profit} />

                {/* ── Tabs ── */}
                <div className="gpdm-tabs-wrap flex gap-1">
                  {tabs.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setActiveTab(key)}
                      className={`flex-1 py-2.5 text-xs rounded-[10px] transition-all duration-200 ${activeTab === key ? "gpdm-tab-active" : "gpdm-tab-inactive"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* ── Daily ── */}
                {activeTab === "daily" && (
                  <div className="space-y-2">
                    {data.daily.length === 0 ? (
                      <div className="text-center py-14">
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: "#F1F5F9" }}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.8">
                            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                          </svg>
                        </div>
                        <p className="text-sm font-semibold" style={{ color: "#94A3B8" }}>Belum ada data harian</p>
                        <p className="text-xs mt-1" style={{ color: "#CBD5E1" }}>Transaksi akan muncul di sini</p>
                      </div>
                    ) : (
                      data.daily.map((day, idx) => (
                        <div key={day.date} className="gpdm-row-card rounded-2xl p-4 cursor-default">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              {/* Index badge */}
                              <div
                                className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
                                style={{ background: "#EEF2FF", color: "#6366F1" }}
                              >
                                {String(idx + 1).padStart(2, "0")}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold truncate" style={{ color: "#0F172A" }}>{day.label}</p>
                                <p className="text-[10px] mt-0.5 font-medium" style={{ color: "#94A3B8" }}>{day.count} transaksi</p>
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-bold" style={{ color: "#0F172A" }}>{fmtRupiah(day.gross_profit)}</p>
                              <div className="flex items-center justify-end gap-1 mt-1">
                                <span className="badge-profit">+{fmtShort(day.gross_profit)}</span>
                                <span className="badge-margin">{day.margin_pct}%</span>
                              </div>
                            </div>
                          </div>
                          <MiniBar
                            value={day.gross_profit}
                            max={DAILY_PROFIT_TARGET}
                            color={
                              day.gross_profit >= DAILY_PROFIT_TARGET
                                ? "linear-gradient(90deg, #10B981, #34D399)"
                                : "linear-gradient(90deg, #EF4444, #F87171)"
                            }
                          />
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* ── Weekly ── */}
                {activeTab === "weekly" && (
                  <div className="space-y-2">
                    {data.weekly.length === 0 ? (
                      <div className="text-center py-14">
                        <p className="text-sm font-semibold" style={{ color: "#94A3B8" }}>Belum ada data mingguan</p>
                        <p className="text-xs mt-1" style={{ color: "#CBD5E1" }}>Transaksi akan muncul di sini</p>
                      </div>
                    ) : (
                      data.weekly.map((week) => (
                        <div key={week.weekStart} className="gpdm-row-card rounded-2xl p-4 cursor-default">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                                style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5">
                                  <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
                                </svg>
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold truncate" style={{ color: "#0F172A" }}>{week.label}</p>
                                <p className="text-[10px] mt-0.5 font-medium" style={{ color: "#94A3B8" }}>{week.count} transaksi</p>
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-bold" style={{ color: "#0F172A" }}>{fmtRupiah(week.gross_profit)}</p>
                              <div className="flex items-center justify-end gap-1 mt-1">
                                <span className="badge-profit">+{fmtShort(week.gross_profit)}</span>
                                <span className="badge-margin">{week.margin_pct}%</span>
                              </div>
                            </div>
                          </div>
                          <MiniBar value={week.gross_profit} max={maxWeeklyProfit} color="linear-gradient(90deg, #F59E0B, #FCD34D)" />
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* ── Monthly ── */}
                {activeTab === "monthly" && (
                  <div className="space-y-3">

                    {/* Gross Profit */}
                    <div className="gpdm-monthly-card p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#ECFDF5" }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.2" strokeLinecap="round">
                            <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#94A3B8" }}>Gross Profit</p>
                          <p className="text-[9px] font-medium" style={{ color: "#CBD5E1" }}>Bulan ini</p>
                        </div>
                      </div>
                      <p className="text-xl font-extrabold" style={{ color: "#059669" }}>{fmtRupiah(data.monthly.gross_profit)}</p>
                    </div>

                    {/* Total Omzet */}
                    <div className="gpdm-monthly-card p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#EEF2FF" }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2.2" strokeLinecap="round">
                            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#94A3B8" }}>Total Omzet</p>
                          <p className="text-[9px] font-medium" style={{ color: "#CBD5E1" }}>Bulan ini</p>
                        </div>
                      </div>
                      <p className="text-xl font-extrabold" style={{ color: "#0F172A" }}>{fmtRupiah(data.monthly.revenue)}</p>
                    </div>

                    {/* Total Transaksi */}
                    <div className="gpdm-monthly-card p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#FFFBEB" }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.2" strokeLinecap="round">
                            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>
                          </svg>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#94A3B8" }}>Total Transaksi</p>
                          <p className="text-[9px] font-medium" style={{ color: "#CBD5E1" }}>Bulan ini</p>
                        </div>
                      </div>
                      <p className="text-xl font-extrabold" style={{ color: "#0F172A" }}>{data.monthly.count.toLocaleString("id-ID")}</p>
                    </div>

                    {/* Margin Indicator */}
                    <div className="rounded-2xl p-4" style={{ background: "linear-gradient(135deg, #F0FDF4 0%, #EEF2FF 100%)", border: "1px solid #E2E8F0" }}>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#94A3B8" }}>Margin Profit</p>
                          <p className="text-[9px] font-medium mt-0.5" style={{ color: "#CBD5E1" }}>Deal Price − Inventory Price = Gross Profit</p>
                        </div>
                        <span
                          className="text-sm font-extrabold px-3 py-1 rounded-xl"
                          style={{ background: "#ECFDF5", color: "#059669", border: "1px solid #A7F3D0" }}
                        >
                          {data.monthly.margin_pct}%
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full" style={{ background: "#E2E8F0" }}>
                        <div
                          className="h-full rounded-full transition-all duration-1000"
                          style={{
                            width: `${Math.min(100, data.monthly.margin_pct)}%`,
                            background: "linear-gradient(90deg, #10B981, #6366F1)",
                          }}
                        />
                      </div>
                    </div>

                  </div>
                )}

              </div>

            ) : (
              /* ── Error state ── */
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "#FEF2F2" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                </div>
                <p className="text-sm font-semibold" style={{ color: "#475569" }}>Gagal memuat data</p>
                <p className="text-xs font-medium" style={{ color: "#94A3B8" }}>Coba tutup dan buka kembali</p>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
}