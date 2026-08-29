"use client";

import { useState, useEffect } from "react";
import { useRegisterOverlay } from "@/contexts/OverlayContext";

// ── Types ─────────────────────────────────────────────────────────────────────
interface LaptopEntry {
  laptop_name: string;
  count: number;
  revenue: number;
  profit: number;
  transactions: {
    id: string;
    invoice_number: string;
    customer_name: string;
    deal_price?: number;
    amount?: number;
    paid_at?: string;
    created_at: string;
    sales_name?: string;
    source_platform?: string;
    items?: { name: string; type: "laptop" | "accessory"; quantity: number; is_bonus: boolean }[];
  }[];
}

interface PeriodData {
  label: string;
  date: string;
  count: number;
  revenue: number;
  profit: number;
  laptops: LaptopEntry[];
}

interface TransactionDetail {
  today: { revenue: number; profit: number; count: number };
  daily: PeriodData[];
  monthly: PeriodData[];
  yearly: PeriodData[];
}

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtRupiah = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");
const fmtShort = (n: number): string => {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}Jt`;
  if (n >= 1_000) return `Rp ${(n / 1_000).toFixed(0)}Rb`;
  return `Rp ${n}`;
};

const PLATFORM_COLOR: Record<string, { bg: string; color: string; border: string }> = {
  shopee: { bg: "#F4F4F5", color: "#3F3F46", border: "#E4E4E7" },
  tokopedia: { bg: "#F4F4F5", color: "#3F3F46", border: "#E4E4E7" },
  facebook: { bg: "#F4F4F5", color: "#3F3F46", border: "#E4E4E7" },
  olx: { bg: "#F4F4F5", color: "#3F3F46", border: "#E4E4E7" },
  carousell: { bg: "#F4F4F5", color: "#3F3F46", border: "#E4E4E7" },
  cod: { bg: "#F4F4F5", color: "#3F3F46", border: "#E4E4E7" },
};

type TabKey = "daily" | "monthly" | "yearly";

// ── Mini bar ──────────────────────────────────────────────────────────────────
function MiniBar({ value, max, color = "linear-gradient(90deg,#18181B,#3F3F46)" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.max(4, (value / max) * 100) : 4;
  return (
    <div className="w-full h-1.5 rounded-full mt-2 overflow-hidden" style={{ background: "#F4F4F5" }}>
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

// ── Laptop Row ─────────────────────────────────────────────────────────────────
function LaptopRow({
  entry,
  rank,
  maxCount,
  canSeeFinancials,
}: {
  entry: LaptopEntry;
  rank: number;
  maxCount: number;
  canSeeFinancials: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const pct = Math.round((entry.count / Math.max(maxCount, 1)) * 100);

  const rankStyle =
    rank === 1
      ? { bg: "#F4F4F5", color: "#18181B", border: "#E4E4E7", bar: "linear-gradient(90deg,#18181B,#3F3F46)" }
      : rank === 2
        ? { bg: "#F4F4F5", color: "#52525B", border: "#E4E4E7", bar: "linear-gradient(90deg,#71717A,#A1A1AA)" }
        : rank === 3
          ? { bg: "#F4F4F5", color: "#71717A", border: "#E4E4E7", bar: "linear-gradient(90deg,#A1A1AA,#D4D4D8)" }
          : { bg: "#F4F4F5", color: "#3F3F46", border: "#E4E4E7", bar: "linear-gradient(90deg,#52525B,#71717A)" };

  return (
    <div
      className="rounded-xl overflow-hidden transition-all duration-200"
      style={{
        background: "#FFFFFF",
        border: `1px solid ${expanded ? "#A1A1AA" : "#E4E4E7"}`,
        boxShadow: expanded
          ? "0 4px 16px rgba(0,0,0,0.10)"
          : "0 1px 3px rgba(0,0,0,0.05)",
      }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center gap-3 px-3.5 py-3 text-left transition-all duration-200"
        style={{ background: expanded ? "#FAFAFA" : "#FFFFFF" }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "#FAFAFA";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = expanded ? "#FAFAFA" : "#FFFFFF";
        }}
      >
        {/* Rank badge */}
        <span
          className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-black"
          style={{ background: rankStyle.bg, color: rankStyle.color, border: `1px solid ${rankStyle.border}` }}
        >
          {rank}
        </span>

        {/* Laptop icon */}
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "#F4F4F5" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#18181B" strokeWidth="1.75">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        </div>

        {/* Name + bar */}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold truncate leading-tight" style={{ color: "#18181B" }}>
            {entry.laptop_name}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "#F4F4F5" }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${pct}%`, background: rankStyle.bar }}
              />
            </div>
            <span className="text-[10px] flex-shrink-0 font-medium" style={{ color: "#A1A1AA" }}>
              {pct}%
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="text-right flex-shrink-0 space-y-0.5">
          <span
            className="inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full"
            style={{ background: "#18181B", color: "#FFFFFF" }}
          >
            {entry.count}x
          </span>
          {canSeeFinancials && (
            <p className="text-[11px] font-semibold" style={{ color: "#18181B" }}>
              {fmtShort(entry.revenue)}
            </p>
          )}
        </div>

        {/* Chevron */}
        <svg
          width="13" height="13" viewBox="0 0 24 24" fill="none"
          stroke="#A1A1AA" strokeWidth="2.5"
          className={`flex-shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Expanded transactions */}
      {expanded && (
        <div style={{ borderTop: "1px solid #E4E4E7" }}>
          {entry.transactions.length === 0 ? (
            <p className="text-xs text-center py-5" style={{ color: "#A1A1AA" }}>
              Tidak ada detail transaksi
            </p>
          ) : (
            entry.transactions.map((tx) => {
              const rev = Number(tx.deal_price || tx.amount || 0);
              const txDate = new Date(tx.paid_at || tx.created_at);
              const dateStr = txDate.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
              const timeStr = txDate.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
              const plat = tx.source_platform?.toLowerCase() ?? "";
              const platStyle = PLATFORM_COLOR[plat] ?? { bg: "#FAFAFA", color: "#52525B", border: "#E4E4E7" };

              return (
                <div
                  key={tx.id}
                  className="px-3.5 py-2.5 flex items-start justify-between gap-3 transition-colors duration-150"
                  style={{
                    borderBottom: "1px solid #F4F4F5",
                    background: "#FAFAFA",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = "#F4F4F5";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = "#FAFAFA";
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold truncate" style={{ color: "#18181B" }}>
                      {tx.customer_name}
                    </p>
                    <p className="text-[10px] font-mono tracking-wide mt-0.5" style={{ color: "#A1A1AA" }}>
                      {tx.invoice_number}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {tx.sales_name && (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md"
                          style={{ background: "#F4F4F5", color: "#52525B", border: "1px solid #E4E4E7" }}
                        >
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                          {tx.sales_name}
                        </span>
                      )}
                      {tx.source_platform && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold"
                          style={{
                            background: platStyle.bg,
                            color: platStyle.color,
                            border: `1px solid ${platStyle.border}`,
                          }}
                        >
                          {tx.source_platform}
                        </span>
                      )}
                    </div>
                    {tx.items && tx.items.length > 0 && (
                      <p className="text-[10px] mt-1 leading-relaxed" style={{ color: "#71717A" }}>
                        {tx.items.map((it, idx) => (
                          <span key={idx}>
                            {idx > 0 && <span style={{ color: "#D4D4D8" }}> · </span>}
                            {it.name}
                            {it.quantity > 1 ? ` x${it.quantity}` : ""}
                            {it.is_bonus && <span style={{ color: "#A1A1AA" }}> (bonus)</span>}
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    {canSeeFinancials && (
                      <p className="text-[12px] font-bold" style={{ color: "#18181B" }}>
                        {fmtRupiah(rev)}
                      </p>
                    )}
                    <p className="text-[10px] mt-0.5 font-medium" style={{ color: "#71717A" }}>{dateStr}</p>
                    <p className="text-[10px] font-medium" style={{ color: "#A1A1AA" }}>{timeStr}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ── Period Section ─────────────────────────────────────────────────────────────
function PeriodSection({
  period,
  canSeeFinancials,
}: {
  period: PeriodData;
  canSeeFinancials: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const maxCount = period.laptops[0]?.count || 1;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: "1px solid #E4E4E7", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}
    >
      {/* Period header */}
      <button
        onClick={() => setCollapsed((p) => !p)}
        className="w-full flex items-center justify-between px-4 py-3 text-left transition-all duration-150"
        style={{ background: "linear-gradient(135deg,#FAFAFA 0%,#F4F4F5 100%)" }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background =
            "linear-gradient(135deg,#F4F4F5 0%,#E4E4E7 100%)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background =
            "linear-gradient(135deg,#FAFAFA 0%,#F4F4F5 100%)";
        }}
      >
        <div className="flex items-center gap-3">
          <div className="w-1 h-7 rounded-full" style={{ background: "linear-gradient(180deg,#18181B,#3F3F46)" }} />
          <div>
            <p className="text-[13px] font-bold" style={{ color: "#18181B" }}>{period.label}</p>
            <p className="text-[11px] mt-0.5" style={{ color: "#71717A" }}>
              {period.count} transaksi
              {canSeeFinancials && (
                <span style={{ color: "#18181B" }}> · {fmtShort(period.revenue)}</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canSeeFinancials && period.profit > 0 && (
            <span
              className="text-[10px] font-bold px-2 py-1 rounded-full"
              style={{
                background: "#18181B",
                color: "#FFFFFF",
              }}
            >
              +{fmtShort(period.profit)}
            </span>
          )}
          <svg
            width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="#A1A1AA" strokeWidth="2.5"
            className={`transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {/* Laptop list */}
      {!collapsed && (
        <div className="p-3 space-y-2" style={{ background: "#FAFAFA" }}>
          {period.laptops.length === 0 ? (
            <div className="text-center py-8">
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center mx-auto mb-2"
                style={{ background: "#F4F4F5" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4D4D8" strokeWidth="1.8">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              </div>
              <p className="text-xs font-medium" style={{ color: "#A1A1AA" }}>
                Tidak ada laptop terjual di periode ini
              </p>
            </div>
          ) : (
            period.laptops.map((entry, i) => (
              <LaptopRow
                key={entry.laptop_name}
                entry={entry}
                rank={i + 1}
                maxCount={maxCount}
                canSeeFinancials={canSeeFinancials}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="p-5 space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="tdm-shimmer h-24 rounded-2xl" />
        ))}
      </div>
      <div className="tdm-shimmer h-10 rounded-xl" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="tdm-shimmer h-28 rounded-xl" />
      ))}
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────
export function TransactionDetailModal({
  isOpen,
  onClose,
  canSeeFinancials = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  canSeeFinancials?: boolean;
}) {
  const [data, setData] = useState<TransactionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("daily");
  const [visible, setVisible] = useState(false);
  useRegisterOverlay(isOpen);

  useEffect(() => {
    if (isOpen) setTimeout(() => setVisible(true), 10);
    else setVisible(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      setIsLoading(true);
      try {
        const res = await fetch("/api/dashboard/transaction-detail");
        const result = await res.json();
        if (result.success) setData(result.data);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const tabs: { key: TabKey; label: string }[] = [
    { key: "daily", label: "Harian" },
    { key: "monthly", label: "Bulanan" },
    { key: "yearly", label: "Tahunan" },
  ];

  const activeData =
    activeTab === "daily" ? data?.daily :
      activeTab === "monthly" ? data?.monthly :
        data?.yearly;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

        .tdm-overlay { font-family: 'Inter', sans-serif; }

        .tdm-shell {
          background: #FFFFFF;
          border: 1px solid #E4E4E7;
          box-shadow: 0 32px 80px rgba(0,0,0,0.16), 0 8px 24px rgba(0,0,0,0.08);
        }

        .tdm-header {
          background: linear-gradient(135deg, #FAFAFA 0%, #F4F4F5 100%);
          border-bottom: 1px solid #E4E4E7;
        }

        .tdm-stat {
          background: #FFFFFF;
          border: 1px solid #E4E4E7;
          box-shadow: 0 1px 4px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.04);
          transition: box-shadow 0.2s, transform 0.2s;
        }
        .tdm-stat:hover {
          box-shadow: 0 4px 20px rgba(0,0,0,0.10);
          transform: translateY(-2px);
        }

        .tdm-tabs-wrap {
          background: #F4F4F5;
          border-radius: 14px;
          padding: 4px;
        }
        .tdm-tab-active {
          background: #18181B;
          color: #FFFFFF;
          font-weight: 700;
          box-shadow: 0 2px 8px rgba(0,0,0,0.25), 0 1px 3px rgba(0,0,0,0.08);
        }
        .tdm-tab-inactive {
          color: #A1A1AA;
          font-weight: 500;
        }
        .tdm-tab-inactive:hover {
          color: #52525B;
          background: rgba(0,0,0,0.03);
        }

        .tdm-scroll::-webkit-scrollbar { width: 4px; }
        .tdm-scroll::-webkit-scrollbar-track { background: transparent; }
        .tdm-scroll::-webkit-scrollbar-thumb { background: #D4D4D8; border-radius: 4px; }

        .tdm-shimmer {
          background: linear-gradient(90deg, #FAFAFA 25%, #F4F4F5 50%, #FAFAFA 75%);
          background-size: 200% 100%;
          animation: tdm-shimmer 1.5s infinite;
        }
        @keyframes tdm-shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }

        .tdm-enter { opacity: 0; transform: scale(0.97) translateY(16px); }
        .tdm-visible {
          opacity: 1;
          transform: scale(1) translateY(0);
          transition: opacity 0.28s ease, transform 0.28s cubic-bezier(0.34, 1.25, 0.64, 1);
        }

        .tdm-close {
          background: #F4F4F5;
          color: #A1A1AA;
          transition: background 0.2s, color 0.2s;
        }
        .tdm-close:hover { background: #18181B; color: #FFFFFF; }

        .tdm-handle { background: #D4D4D8; }

        .tdm-tabs-section {
          background: #FFFFFF;
          border-bottom: 1px solid #E4E4E7;
        }
      `}</style>

      {/* ── Overlay ── */}
      <div
        className="tdm-overlay fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        style={{ background: "rgba(9,9,11,0.50)", backdropFilter: "blur(6px)" }}
        onClick={onClose}
      >
        {/* ── Modal shell ── */}
        <div
          className={`tdm-shell relative w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[88vh] flex flex-col rounded-t-3xl sm:rounded-2xl overflow-hidden ${visible ? "tdm-visible" : "tdm-enter"}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle (mobile) */}
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="tdm-handle w-10 h-1 rounded-full" />
          </div>

          {/* ── Header ── */}
          <div className="tdm-header flex-shrink-0 px-5 sm:px-6 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: "linear-gradient(135deg,#18181B 0%,#3F3F46 100%)",
                    boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold" style={{ color: "#18181B" }}>Detail Transaksi</h2>
                  <p className="text-xs font-medium" style={{ color: "#A1A1AA" }}>Laptop terjual per hari, bulan &amp; tahun</p>
                </div>
              </div>
              <button onClick={onClose} className="tdm-close w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* ── Summary cards ── */}
            {data && (
              <div className="grid grid-cols-3 gap-3 mt-4">

                {/* Transaksi Hari Ini */}
                <div className="tdm-stat rounded-2xl overflow-hidden">
                  <div className="h-1" style={{ background: "linear-gradient(90deg,#18181B,#3F3F46)" }} />
                  <div className="px-3 py-2.5">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2" style={{ background: "#F4F4F5" }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#18181B" strokeWidth="2.5" strokeLinecap="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" />
                        <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    </div>
                    <p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "#A1A1AA" }}>Hari Ini</p>
                    <p className="text-2xl font-extrabold leading-none mt-0.5" style={{ color: "#18181B" }}>{data.today.count}</p>
                    <p className="text-[9px] mt-1.5 font-medium" style={{ color: "#3F3F46" }}>transaksi</p>
                  </div>
                </div>

                {canSeeFinancials ? (
                  /* Omzet */
                  <div className="tdm-stat rounded-2xl overflow-hidden">
                    <div className="h-1" style={{ background: "linear-gradient(90deg,#52525B,#71717A)" }} />
                    <div className="px-3 py-2.5">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2" style={{ background: "#F4F4F5" }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#52525B" strokeWidth="2.5" strokeLinecap="round">
                          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
                        </svg>
                      </div>
                      <p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "#A1A1AA" }}>Omzet</p>
                      <p className="text-lg font-extrabold leading-none mt-0.5" style={{ color: "#18181B" }}>{fmtShort(data.today.revenue)}</p>
                      <p className="text-[9px] mt-1.5 font-medium" style={{ color: "#52525B" }}>hari ini</p>
                    </div>
                  </div>
                ) : (
                  /* Bulan Ini (non-financial) */
                  <div className="tdm-stat rounded-2xl overflow-hidden">
                    <div className="h-1" style={{ background: "linear-gradient(90deg,#52525B,#71717A)" }} />
                    <div className="px-3 py-2.5">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2" style={{ background: "#F4F4F5" }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#52525B" strokeWidth="2.5" strokeLinecap="round">
                          <rect x="3" y="4" width="18" height="18" rx="2" />
                          <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                      </div>
                      <p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "#A1A1AA" }}>Bulan Ini</p>
                      <p className="text-2xl font-extrabold leading-none mt-0.5" style={{ color: "#18181B" }}>{data.monthly[0]?.count ?? 0}</p>
                      <p className="text-[9px] mt-1.5 font-medium" style={{ color: "#52525B" }}>transaksi</p>
                    </div>
                  </div>
                )}

                {canSeeFinancials ? (
                  /* Profit */
                  <div className="tdm-stat rounded-2xl overflow-hidden">
                    <div className="h-1" style={{ background: "linear-gradient(90deg,#A1A1AA,#D4D4D8)" }} />
                    <div className="px-3 py-2.5">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2" style={{ background: "#F4F4F5" }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#71717A" strokeWidth="2.5" strokeLinecap="round">
                          <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                        </svg>
                      </div>
                      <p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "#A1A1AA" }}>Profit</p>
                      <p className="text-lg font-extrabold leading-none mt-0.5" style={{ color: "#18181B" }}>{fmtShort(data.today.profit)}</p>
                      <p className="text-[9px] mt-1.5 font-medium" style={{ color: "#71717A" }}>hari ini</p>
                    </div>
                  </div>
                ) : (
                  /* Tahun Ini (non-financial) */
                  <div className="tdm-stat rounded-2xl overflow-hidden">
                    <div className="h-1" style={{ background: "linear-gradient(90deg,#A1A1AA,#D4D4D8)" }} />
                    <div className="px-3 py-2.5">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-2" style={{ background: "#F4F4F5" }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#71717A" strokeWidth="2.5" strokeLinecap="round">
                          <rect x="3" y="4" width="18" height="18" rx="2" />
                          <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                      </div>
                      <p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "#A1A1AA" }}>Tahun Ini</p>
                      <p className="text-2xl font-extrabold leading-none mt-0.5" style={{ color: "#18181B" }}>{data.yearly[0]?.count ?? 0}</p>
                      <p className="text-[9px] mt-1.5 font-medium" style={{ color: "#71717A" }}>transaksi</p>
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>

          {/* ── Tabs ── */}
          <div className="tdm-tabs-section flex-shrink-0 px-5 py-3">
            <div className="tdm-tabs-wrap flex gap-1">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 py-2.5 text-xs rounded-[10px] transition-all duration-200 ${activeTab === tab.key ? "tdm-tab-active" : "tdm-tab-inactive"}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Content ── */}
          <div className="tdm-scroll flex-1 overflow-y-auto" style={{ background: "#FAFAFA" }}>
            {isLoading ? (
              <Skeleton />
            ) : data ? (
              <div className="p-4 sm:p-5 space-y-3">
                {!activeData || activeData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center"
                      style={{ background: "#F4F4F5" }}
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#D4D4D8" strokeWidth="1.8">
                        <rect x="3" y="4" width="18" height="18" rx="2" />
                        <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold" style={{ color: "#A1A1AA" }}>Belum ada data transaksi</p>
                    <p className="text-xs font-medium" style={{ color: "#D4D4D8" }}>Data akan muncul setelah ada transaksi</p>
                  </div>
                ) : (
                  activeData.map((period) => (
                    <PeriodSection
                      key={period.date}
                      period={period}
                      canSeeFinancials={canSeeFinancials}
                    />
                  ))
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "#F4F4F5" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
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