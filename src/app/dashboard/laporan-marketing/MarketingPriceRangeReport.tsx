"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Calendar, Eye, EyeOff, Hash, RefreshCw, Trophy } from "lucide-react";
import InlineDateRange from "@/components/common/InlineDateRange";
import { channelLabel, todayWibDate, type MarketingReportData } from "@/lib/marketing-report";

const channelHeaderClass: Record<string, string> = {
  WA: "bg-green-700 text-white",
  SHOPEE: "bg-orange-500 text-white",
  FB: "bg-blue-600 text-white",
  OLX: "bg-cyan-500 text-white",
  CAROUSEL: "bg-red-600 text-white",
  IG: "bg-pink-600 text-white",
  TIKTOK: "bg-black text-white",
  MITRA: "bg-amber-700 text-white",
  RESELLER: "bg-teal-600 text-white",
  TOKOPEDIA: "bg-green-500 text-white",
  ECOMMERCE: "bg-rose-500 text-white",
  SOSMED: "bg-indigo-500 text-white",
  THREADS: "bg-neutral-800 text-white",
};

function qtyCellClass(value: number, max: number): string {
  if (value <= 0) return "text-transparent";
  const ratio = max > 0 ? value / max : 0;
  if (ratio >= 0.6) return "bg-violet-600 text-white font-bold";
  if (ratio >= 0.3) return "bg-violet-200 text-violet-900 font-semibold";
  return "bg-violet-50 text-gray-800";
}

function fmtTanggalShort(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}
function getPeriodLabel(from: string, to: string): string {
  if (!from && !to) return "Semua Waktu";
  return `${from ? fmtTanggalShort(from) : "..."} — ${to ? fmtTanggalShort(to) : "..."}`;
}

// Filter toko — HARUS disamakan dengan STORE_FILTER_OPTIONS di
// laporan-marketing/page.tsx & STORE_OPTIONS di api/sales-reports/route.ts.
const STORE_FILTER_OPTIONS = ["ALL", "Solit", "Sotech", "Onpoint", "Sultan Laptop"] as const;
type StoreFilter = (typeof STORE_FILTER_OPTIONS)[number];
const storeFilterLabel = (s: StoreFilter) => (s === "ALL" ? "Semua Toko" : s);

export default function MarketingPriceRangeReport() {
  const [customFrom, setCustomFrom] = useState(() => todayWibDate().slice(0, 8) + "01");
  const [customTo, setCustomTo] = useState(() => todayWibDate());
  const [report, setReport] = useState<MarketingReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hideEmptyChannels, setHideEmptyChannels] = useState(true);
  const [storeFilter, setStoreFilter] = useState<StoreFilter>("ALL");
  const requestIdRef = useRef(0);

  const fetchReport = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    try {
      setLoading(true);
      setError("");
      const params = new URLSearchParams();
      if (customFrom) params.set("from", customFrom);
      if (customTo) params.set("to", customTo);
      if (storeFilter !== "ALL") params.set("store", storeFilter);
      const res = await fetch(`/api/marketing-report/price-range?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (requestId !== requestIdRef.current) return;
      if (!res.ok || !json.success) throw new Error(json.message || "Gagal memuat laporan");
      setReport(json.data as MarketingReportData);
    } catch (err: any) {
      if (requestId !== requestIdRef.current) return;
      setError(err.message);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [customFrom, customTo, storeFilter]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const rows = report?.rows ?? [];

  const visibleChannels = useMemo(() => {
    if (!report) return [];
    return hideEmptyChannels
      ? report.channels.filter((ch) => (report.channelTotals[ch] ?? 0) > 0)
      : report.channels;
  }, [report, hideEmptyChannels]);

  const maxCellQty = useMemo(() => {
    let max = 0;
    for (const row of rows) for (const qty of Object.values(row.channels)) if (qty > max) max = qty;
    return max;
  }, [rows]);

  const maxRowTotal = useMemo(() => rows.reduce((m, r) => (r.total > m ? r.total : m), 0), [rows]);

  const footer = useMemo(() => {
    const perChannel: Record<string, number> = {};
    let total = 0;
    for (const row of rows) {
      for (const [ch, qty] of Object.entries(row.channels)) perChannel[ch] = (perChannel[ch] ?? 0) + qty;
      total += row.total;
    }
    return { perChannel, total };
  }, [rows]);

  const topChannel = useMemo(() => {
    if (!report) return null;
    let best: { channel: string; qty: number } | null = null;
    for (const [channel, qty] of Object.entries(report.channelTotals)) {
      if (!best || qty > best.qty) best = { channel, qty };
    }
    return best && best.qty > 0 ? best : null;
  }, [report]);

  const hasData = rows.length > 0;
  const periodLabel = getPeriodLabel(customFrom, customTo);

  const handleDateRangeChange = (from: string, to: string) => {
    setCustomFrom(from);
    setCustomTo(to);
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Filter + ringkasan */}
      <div className="rounded-3xl bg-white border border-gray-100 shadow-sm ring-1 ring-gray-50 px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-col-reverse lg:flex-row gap-4 lg:items-start">
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-violet-700 bg-violet-50 border border-violet-100 px-2.5 py-1 rounded-full">
                <Calendar className="w-3 h-3" />
                {periodLabel}
              </span>
              <button
                onClick={fetchReport}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 bg-white border border-gray-200 px-2.5 py-1 rounded-full hover:bg-gray-50"
              >
                <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Refresh
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              <SummaryCard icon={Hash} iconClass="bg-violet-50 text-violet-600" label="Total Qty" value={report?.grandTotal ?? 0} caption="leads terverifikasi" />
              <SummaryCard
                icon={Trophy}
                iconClass="bg-amber-50 text-amber-600"
                label="Channel Teratas"
                value={topChannel ? topChannel.qty : 0}
                caption={topChannel ? channelLabel(topChannel.channel) : "—"}
              />
            </div>
          </div>
          <div className="shrink-0 self-center lg:self-start">
            <InlineDateRange from={customFrom} to={customTo} onChange={handleDateRangeChange} />
          </div>
        </div>
      </div>

      {/* Tabel */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm ring-1 ring-gray-50 overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-gray-100 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-gray-900">Rekap per Range Harga</h2>
            <p className="text-[11px] text-gray-500 mt-0.5 truncate">Qty = jumlah laporan teraudit pada range harga tsb.</p>
          </div>
          <button
            onClick={() => setHideEmptyChannels((v) => !v)}
            title={hideEmptyChannels ? "Tampilkan semua channel" : "Sembunyikan channel kosong"}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-semibold border transition-colors ${hideEmptyChannels ? "bg-violet-600 border-violet-600 text-white" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"}`}
          >
            {hideEmptyChannels ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            <span className="hidden sm:inline">Channel kosong</span>
          </button>
        </div>

        {/* Tab filter Nama Toko — sama seperti di tab Laporan Barang */}
        <div className="px-4 sm:px-5 py-2.5 border-b border-gray-100 flex items-center gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
          {STORE_FILTER_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setStoreFilter(s)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/30 ${storeFilter === s ? "bg-violet-600 text-white" : "bg-gray-50 text-gray-500 hover:bg-gray-100"}`}
            >
              {storeFilterLabel(s)}
            </button>
          ))}
        </div>

        {error && (
          <p className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 px-4 sm:px-5 py-3">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
          </p>
        )}

        {loading && !report ? (
          <div className="p-4 sm:p-5 space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-7 rounded-md bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : !hasData ? (
          <div className="py-12 flex flex-col items-center text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-50 to-fuchsia-50 flex items-center justify-center mb-3 ring-1 ring-violet-100/60">
              <Hash className="w-6 h-6 text-violet-300" />
            </div>
            <p className="text-sm font-medium text-gray-700">Belum ada laporan teraudit pada periode ini</p>
            <p className="text-xs text-gray-400 mt-1 max-w-[280px]">
              {(report?.pendingAuditCount ?? 0) > 0
                ? `${report?.pendingAuditCount} laporan masih menunggu audit.`
                : "Data range harga muncul setelah Laporan Harian Sales diaudit."}
            </p>
          </div>
        ) : (
          <div className={`overflow-x-auto transition-opacity ${loading ? "opacity-60" : ""}`}>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-violet-600 text-white border border-violet-700 px-3 py-2 text-left font-bold whitespace-nowrap min-w-[160px]">
                    Range Harga
                  </th>
                  {visibleChannels.map((ch) => (
                    <th
                      key={ch}
                      className={`border border-gray-300 px-2 py-2 text-center font-bold whitespace-nowrap min-w-[76px] ${channelHeaderClass[ch] ?? "bg-gray-500 text-white"}`}
                    >
                      {channelLabel(ch)}
                    </th>
                  ))}
                  <th className="bg-violet-600 text-white border border-violet-700 px-3 py-2 text-center font-bold min-w-[72px]">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="group hover:bg-violet-50/40">
                    <td className="sticky left-0 z-[1] bg-white group-hover:bg-violet-50 border border-gray-200 px-3 py-1.5 font-semibold text-gray-800 whitespace-nowrap" title={row.keyword}>
                      {row.keyword}
                    </td>
                    {visibleChannels.map((ch) => {
                      const qty = row.channels[ch] ?? 0;
                      return (
                        <td key={ch} className={`border border-gray-200 px-2 py-1.5 text-center tabular-nums ${qtyCellClass(qty, maxCellQty)}`}>
                          {qty > 0 ? qty : ""}
                        </td>
                      );
                    })}
                    <td className={`border border-gray-200 px-2 py-1.5 text-center tabular-nums font-bold ${qtyCellClass(row.total, maxRowTotal)}`}>
                      {row.total}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-violet-50">
                  <td className="sticky left-0 z-[1] bg-violet-100 border border-violet-200 px-3 py-2 font-bold text-violet-800">TOTAL</td>
                  {visibleChannels.map((ch) => (
                    <td key={ch} className="border border-violet-200 px-2 py-2 text-center font-bold tabular-nums text-violet-800">
                      {footer.perChannel[ch] ?? 0}
                    </td>
                  ))}
                  <td className="border border-violet-300 px-2 py-2 text-center font-black tabular-nums bg-violet-600 text-white">
                    {footer.total}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  iconClass,
  label,
  value,
  caption,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  label: string;
  value: number;
  caption: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-3 py-3 sm:px-4 sm:py-3.5">
      <div className="flex items-center justify-between gap-1">
        <p className="text-[10px] font-semibold tracking-wide text-gray-500 uppercase truncate">{label}</p>
        <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${iconClass}`}>
          <Icon className="w-3 h-3" />
        </span>
      </div>
      <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1 tabular-nums">{value}</p>
      <p className="text-[11px] text-gray-400 mt-1 truncate">{caption}</p>
    </div>
  );
}