"use client";

import { useState, useEffect } from "react";

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

const PLATFORM_COLOR: Record<string, { bg: string; color: string }> = {
  shopee:     { bg: "rgba(249,115,22,0.15)",  color: "#FB923C" },
  tokopedia:  { bg: "rgba(16,185,129,0.15)",  color: "#34D399" },
  facebook:   { bg: "rgba(99,102,241,0.15)",  color: "#818CF8" },
  olx:        { bg: "rgba(168,85,247,0.15)",  color: "#C084FC" },
  carousell:  { bg: "rgba(239,68,68,0.15)",   color: "#F87171" },
  cod:        { bg: "rgba(245,158,11,0.15)",  color: "#FCD34D" },
};

type TabKey = "daily" | "monthly" | "yearly";

// ── Mini bar ──────────────────────────────────────────────────────────────────
function MiniBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(4, (value / max) * 100) : 4;
  return (
    <div className="w-full h-1 rounded-full mt-2 overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{ width: `${pct}%`, background: "linear-gradient(90deg,#10B981,#34D399)" }}
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
    rank === 1 ? { bg: "rgba(245,158,11,0.2)",  color: "#FCD34D", bar: "linear-gradient(90deg,#F59E0B,#FCD34D)" } :
    rank === 2 ? { bg: "rgba(148,163,184,0.15)", color: "#CBD5E1", bar: "linear-gradient(90deg,#94A3B8,#CBD5E1)" } :
    rank === 3 ? { bg: "rgba(180,83,9,0.2)",     color: "#D97706", bar: "linear-gradient(90deg,#B45309,#D97706)" } :
                 { bg: "rgba(255,255,255,0.06)",  color: "rgba(255,255,255,0.4)", bar: "linear-gradient(90deg,#6366F1,#818CF8)" };

  return (
    <div
      className="rounded-xl overflow-hidden transition-all duration-200"
      style={{
        background: "linear-gradient(135deg,rgba(255,255,255,0.05) 0%,rgba(255,255,255,0.02) 100%)",
        border: `1px solid ${expanded ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.07)"}`,
      }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center gap-3 px-3.5 py-3 text-left transition-all duration-200"
        style={{ background: expanded ? "rgba(255,255,255,0.03)" : "transparent" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = expanded ? "rgba(255,255,255,0.03)" : "transparent"; }}
      >
        {/* Rank badge */}
        <span
          className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-black"
          style={{ background: rankStyle.bg, color: rankStyle.color }}
        >
          {rank}
        </span>

        {/* Laptop icon */}
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.07)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.75">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        </div>

        {/* Name + bar */}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold truncate leading-tight" style={{ color: "#F1F5F9" }}>
            {entry.laptop_name}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${pct}%`, background: rankStyle.bar }}
              />
            </div>
            <span className="text-[10px] flex-shrink-0 font-medium" style={{ color: "rgba(255,255,255,0.35)" }}>
              {pct}%
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="text-right flex-shrink-0 space-y-0.5">
          <span
            className="inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full"
            style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)" }}
          >
            {entry.count}x
          </span>
          {canSeeFinancials && (
            <p className="text-[11px] font-semibold" style={{ color: "#34D399" }}>
              {fmtShort(entry.revenue)}
            </p>
          )}
        </div>

        {/* Chevron */}
        <svg
          width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2.5"
          className={`flex-shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Expanded transactions */}
      {expanded && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {entry.transactions.length === 0 ? (
            <p className="text-xs text-center py-5" style={{ color: "rgba(255,255,255,0.3)" }}>
              Tidak ada detail transaksi
            </p>
          ) : (
            entry.transactions.map((tx) => {
              const rev = Number(tx.deal_price || tx.amount || 0);
              const txDate = new Date(tx.paid_at || tx.created_at);
              const dateStr = txDate.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
              const timeStr = txDate.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
              const plat = tx.source_platform?.toLowerCase() ?? "";
              const platStyle = PLATFORM_COLOR[plat] ?? { bg: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" };

              return (
                <div
                  key={tx.id}
                  className="px-3.5 py-2.5 flex items-start justify-between gap-3 transition-colors duration-150"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", background: "rgba(255,255,255,0.015)" }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold truncate" style={{ color: "#F1F5F9" }}>
                      {tx.customer_name}
                    </p>
                    <p className="text-[10px] font-mono tracking-wide mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>
                      {tx.invoice_number}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {tx.sales_name && (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md"
                          style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.45)" }}
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
                          style={{ background: platStyle.bg, color: platStyle.color }}
                        >
                          {tx.source_platform}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {canSeeFinancials && (
                      <p className="text-[12px] font-bold" style={{ color: "#F1F5F9" }}>
                        {fmtRupiah(rev)}
                      </p>
                    )}
                    <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>{dateStr}</p>
                    <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>{timeStr}</p>
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
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
      {/* Period header */}
      <button
        onClick={() => setCollapsed((p) => !p)}
        className="w-full flex items-center justify-between px-4 py-3 text-left transition-all duration-150"
        style={{ background: "linear-gradient(135deg,rgba(255,255,255,0.06) 0%,rgba(255,255,255,0.03) 100%)" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg,rgba(255,255,255,0.09) 0%,rgba(255,255,255,0.05) 100%)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg,rgba(255,255,255,0.06) 0%,rgba(255,255,255,0.03) 100%)"; }}
      >
        <div className="flex items-center gap-3">
          <div className="w-1 h-7 rounded-full" style={{ background: "rgba(255,255,255,0.15)" }} />
          <div>
            <p className="text-[13px] font-bold" style={{ color: "#F1F5F9" }}>{period.label}</p>
            <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
              {period.count} transaksi
              {canSeeFinancials && (
                <span style={{ color: "#34D399" }}> · {fmtShort(period.revenue)}</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canSeeFinancials && period.profit > 0 && (
            <span
              className="text-[10px] font-bold px-2 py-1 rounded-full"
              style={{
                background: "rgba(16,185,129,0.15)",
                border: "1px solid rgba(16,185,129,0.25)",
                color: "#34D399",
              }}
            >
              +{fmtShort(period.profit)}
            </span>
          )}
          <svg
            width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5"
            className={`transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {/* Laptop list */}
      {!collapsed && (
        <div className="p-3 space-y-2" style={{ background: "rgba(0,0,0,0.15)" }}>
          {period.laptops.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-2xl mb-1">📦</p>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
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
          <div key={i} className="h-20 rounded-xl" style={{
            background: "linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,255,255,0.08) 50%,rgba(255,255,255,0.04) 75%)",
            backgroundSize: "200% 100%",
            animation: "gpdm-shimmer 1.5s infinite",
          }} />
        ))}
      </div>
      <div className="h-10 rounded-xl" style={{ background: "rgba(255,255,255,0.05)" }} />
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-28 rounded-xl" style={{
          background: "linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,255,255,0.08) 50%,rgba(255,255,255,0.04) 75%)",
          backgroundSize: "200% 100%",
          animation: "gpdm-shimmer 1.5s infinite",
        }} />
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
    { key: "daily",   label: "Harian"  },
    { key: "monthly", label: "Bulanan" },
    { key: "yearly",  label: "Tahunan" },
  ];

  const activeData =
    activeTab === "daily"   ? data?.daily   :
    activeTab === "monthly" ? data?.monthly :
    data?.yearly;

  return (
    <>
      <style>{`
        @keyframes gpdm-shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
        .tdm-modal-enter   { opacity: 0; transform: scale(0.96) translateY(12px); }
        .tdm-modal-visible {
          opacity: 1; transform: scale(1) translateY(0);
          transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.34,1.3,0.64,1);
        }
        .tdm-scrollbar::-webkit-scrollbar { width: 4px; }
        .tdm-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .tdm-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }
      `}</style>

      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", fontFamily: "'Inter',sans-serif" }}
        onClick={onClose}
      >
        <div
          className={`relative w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[88vh] flex flex-col rounded-t-3xl sm:rounded-2xl overflow-hidden ${visible ? "tdm-modal-visible" : "tdm-modal-enter"}`}
          style={{ background: "linear-gradient(160deg,#141820 0%,#0F1117 60%,#111318 100%)", border: "1px solid rgba(255,255,255,0.08)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle (mobile) */}
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="w-10 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.2)" }} />
          </div>

          {/* ── Header ── */}
          <div
            className="flex-shrink-0 px-5 sm:px-6 py-4"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                {/* Icon */}
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg,#6366F1,#4F46E5)", boxShadow: "0 0 20px rgba(99,102,241,0.4)" }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold" style={{ color: "#F1F5F9" }}>Detail Transaksi</h2>
                  <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Laptop terjual per hari, bulan &amp; tahun</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.12)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.8)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.4)"; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Today summary cards */}
            {data && (
              <div className="grid grid-cols-3 gap-2 mt-4">
                {/* Transaksi hari ini */}
                <div
                  className="rounded-xl px-3 py-2.5"
                  style={{
                    background: "linear-gradient(135deg,rgba(255,255,255,0.06) 0%,rgba(255,255,255,0.02) 100%)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    boxShadow: "0 0 30px rgba(99,102,241,0.08),inset 0 1px 0 rgba(255,255,255,0.06)",
                  }}
                >
                  <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>Hari Ini</p>
                  <p className="text-2xl font-black leading-none mt-1" style={{ color: "#F1F5F9" }}>{data.today.count}</p>
                  <p className="text-[9px] mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>transaksi</p>
                  <MiniBar value={data.today.count} max={Math.max(data.today.count, 1)} />
                </div>

                {canSeeFinancials ? (
                  <div
                    className="rounded-xl px-3 py-2.5"
                    style={{
                      background: "linear-gradient(135deg,rgba(16,185,129,0.12) 0%,rgba(16,185,129,0.05) 100%)",
                      border: "1px solid rgba(16,185,129,0.2)",
                      boxShadow: "0 0 30px rgba(16,185,129,0.08),inset 0 1px 0 rgba(255,255,255,0.06)",
                    }}
                  >
                    <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "#10B981" }}>Omzet</p>
                    <p className="text-lg font-black leading-none mt-1" style={{ color: "#34D399" }}>{fmtShort(data.today.revenue)}</p>
                    <p className="text-[9px] mt-0.5" style={{ color: "rgba(16,185,129,0.6)" }}>hari ini</p>
                    <div className="w-full h-1 rounded-full mt-2 overflow-hidden" style={{ background: "rgba(16,185,129,0.15)" }}>
                      <div className="h-full rounded-full" style={{ width: "100%", background: "linear-gradient(90deg,#10B981,#34D399)" }} />
                    </div>
                  </div>
                ) : (
                  <div
                    className="rounded-xl px-3 py-2.5"
                    style={{
                      background: "linear-gradient(135deg,rgba(99,102,241,0.12) 0%,rgba(99,102,241,0.05) 100%)",
                      border: "1px solid rgba(99,102,241,0.2)",
                      boxShadow: "0 0 30px rgba(99,102,241,0.08),inset 0 1px 0 rgba(255,255,255,0.06)",
                    }}
                  >
                    <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "#818CF8" }}>Bulan Ini</p>
                    <p className="text-2xl font-black leading-none mt-1" style={{ color: "#F1F5F9" }}>{data.monthly[0]?.count ?? 0}</p>
                    <p className="text-[9px] mt-0.5" style={{ color: "rgba(99,102,241,0.6)" }}>transaksi</p>
                    <MiniBar value={data.monthly[0]?.count ?? 0} max={Math.max(data.monthly[0]?.count ?? 1, 1)} />
                  </div>
                )}

                {canSeeFinancials ? (
                  <div
                    className="rounded-xl px-3 py-2.5"
                    style={{
                      background: "linear-gradient(135deg,rgba(168,85,247,0.12) 0%,rgba(168,85,247,0.05) 100%)",
                      border: "1px solid rgba(168,85,247,0.2)",
                      boxShadow: "0 0 30px rgba(168,85,247,0.08),inset 0 1px 0 rgba(255,255,255,0.06)",
                    }}
                  >
                    <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "#C084FC" }}>Profit</p>
                    <p className="text-lg font-black leading-none mt-1" style={{ color: "#C084FC" }}>{fmtShort(data.today.profit)}</p>
                    <p className="text-[9px] mt-0.5" style={{ color: "rgba(168,85,247,0.6)" }}>hari ini</p>
                    <div className="w-full h-1 rounded-full mt-2 overflow-hidden" style={{ background: "rgba(168,85,247,0.15)" }}>
                      <div className="h-full rounded-full" style={{ width: "100%", background: "linear-gradient(90deg,#A855F7,#C084FC)" }} />
                    </div>
                  </div>
                ) : (
                  <div
                    className="rounded-xl px-3 py-2.5"
                    style={{
                      background: "linear-gradient(135deg,rgba(245,158,11,0.12) 0%,rgba(245,158,11,0.05) 100%)",
                      border: "1px solid rgba(245,158,11,0.2)",
                      boxShadow: "0 0 30px rgba(245,158,11,0.08),inset 0 1px 0 rgba(255,255,255,0.06)",
                    }}
                  >
                    <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "#F59E0B" }}>Tahun Ini</p>
                    <p className="text-2xl font-black leading-none mt-1" style={{ color: "#F1F5F9" }}>{data.yearly[0]?.count ?? 0}</p>
                    <p className="text-[9px] mt-0.5" style={{ color: "rgba(245,158,11,0.6)" }}>transaksi</p>
                    <MiniBar value={data.yearly[0]?.count ?? 0} max={Math.max(data.yearly[0]?.count ?? 1, 1)} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Tabs ── */}
          <div
            className="flex-shrink-0 px-5 py-3"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
          >
            <div className="flex gap-2 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className="flex-1 py-2 text-xs font-semibold rounded-lg transition-all duration-200"
                  style={
                    activeTab === tab.key
                      ? { background: "linear-gradient(135deg,#6366F1,#4F46E5)", color: "white", boxShadow: "0 0 20px rgba(99,102,241,0.35)" }
                      : { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.55)" }
                  }
                  onMouseEnter={(e) => { if (activeTab !== tab.key) { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.09)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.85)"; } }}
                  onMouseLeave={(e) => { if (activeTab !== tab.key) { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.55)"; } }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Content ── */}
          <div className="tdm-scrollbar flex-1 overflow-y-auto">
            {isLoading ? (
              <Skeleton />
            ) : data ? (
              <div className="p-4 sm:p-5 space-y-3">
                {!activeData || activeData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.05)" }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5">
                        <rect x="3" y="4" width="18" height="18" rx="2" />
                        <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.35)" }}>Belum ada data transaksi</p>
                    <p className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>Data akan muncul setelah ada transaksi</p>
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
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "rgba(239,68,68,0.1)" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
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