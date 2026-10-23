"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  Clock,
  Download,
  Eye,
  EyeOff,
  Hash,
  Layers,
  Megaphone,
  RefreshCw,
  Search,
  ShieldCheck,
  Trophy,
  X,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import InlineDateRange from "@/components/common/InlineDateRange";
import {
  channelLabel,
  todayWibDate,
  type MarketingReportData,
  type MarketingReportRow,
} from "@/lib/marketing-report";
import { exportMarketingReportExcel } from "@/lib/marketing-report-excel";
import MarketingPriceRangeReport from "./MarketingPriceRangeReport";
import MarketingInsightBoard from "./MarketingInsightBoard";
import SalesErrorReport from "./SalesErrorReport";
import AdsReport from "./AdsReport";

// "2026-10-22" → "22 Okt 2026". Diparse manual (bukan new Date("YYYY-MM-DD"))
// supaya tidak geser hari karena zona waktu.
function fmtTanggalShort(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

// Label periode — format sama dengan Cashflow ("Semua Waktu" / "1 Okt 2026 — 22 Okt 2026").
function getPeriodLabel(from: string, to: string): string {
  if (!from && !to) return "Semua Waktu";
  return `${from ? fmtTanggalShort(from) : "..."} — ${to ? fmtTanggalShort(to) : "..."}`;
}

// Warna header kolom channel — mengikuti spreadsheet referensi
// (WA hijau tua, Shopee oranye, FB biru, OLX cyan, Carousell merah,
// IG pink, TikTok hitam, Mitra coklat, Reseller teal).
// Ditulis literal (bukan dirangkai) supaya tidak ke-purge oleh Tailwind.
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

// Intensitas warna sel Qty — makin besar relatif ke Qty tertinggi, makin pekat
// (sel 15 di referensi ungu pekat, 1 ungu sangat muda, 0 kosong).
function qtyCellClass(value: number, max: number): string {
  if (value <= 0) return "text-transparent";
  const ratio = max > 0 ? value / max : 0;
  if (ratio >= 0.6) return "bg-violet-600 text-white font-bold";
  if (ratio >= 0.3) return "bg-violet-200 text-violet-900 font-semibold";
  return "bg-violet-50 text-gray-800";
}

export default function LaporanMarketingPage() {
  // Filter tanggal pakai kalender InlineDateRange (sama dengan Cashflow).
  // Default: awal bulan ini s/d hari ini (WIB). Klik "Semua" di kalender = tanpa batas tanggal.
  const [customFrom, setCustomFrom] = useState(() => todayWibDate().slice(0, 8) + "01");
  const [customTo, setCustomTo] = useState(() => todayWibDate());
  const [report, setReport] = useState<MarketingReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [hideEmptyChannels, setHideEmptyChannels] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<"barang" | "range" | "insight" | "kesalahan" | "ads">("barang");
  const [exporting, setExporting] = useState(false);

  // Abaikan response lama kalau user ganti filter cepat-cepat (race condition).
  const requestIdRef = useRef(0);

  const fetchReport = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    try {
      setLoading(true);
      setError("");
      // from/to kosong tidak dikirim → API anggap sisi itu tidak dibatasi
      // (kosong dua-duanya = semua waktu), persis perilaku filter Cashflow.
      const params = new URLSearchParams();
      if (customFrom) params.set("from", customFrom);
      if (customTo) params.set("to", customTo);
      const res = await fetch(`/api/marketing-report?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (requestId !== requestIdRef.current) return;
      if (!res.ok || !json.success) throw new Error(json.message || "Gagal memuat laporan");
      setReport(json.data as MarketingReportData);
      setLastUpdated(new Date());
    } catch (err: any) {
      if (requestId !== requestIdRef.current) return;
      setError(err.message);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [customFrom, customTo]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Laporan yang baru diaudit di tab lain langsung ikut masuk begitu user
  // balik ke tab ini — tanpa perlu klik Refresh.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") fetchReport();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [fetchReport]);

  const filteredRows: MarketingReportRow[] = useMemo(() => {
    if (!report) return [];
    const tokens = searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return report.rows;
    return report.rows.filter((r) => tokens.every((t) => r.key.includes(t)));
  }, [report, searchQuery]);

  // Total per kolom dihitung dari baris yang SEDANG tampil, supaya baris
  // TOTAL selalu konsisten dengan isi tabel (termasuk saat dicari).
  const footer = useMemo(() => {
    const perChannel: Record<string, number> = {};
    let total = 0;
    for (const row of filteredRows) {
      for (const [ch, qty] of Object.entries(row.channels)) {
        perChannel[ch] = (perChannel[ch] ?? 0) + qty;
      }
      total += row.total;
    }
    return { perChannel, total };
  }, [filteredRows]);

  const visibleChannels = useMemo(() => {
    if (!report) return [];
    return hideEmptyChannels
      ? report.channels.filter((ch) => (report.channelTotals[ch] ?? 0) > 0)
      : report.channels;
  }, [report, hideEmptyChannels]);

  const maxCellQty = useMemo(() => {
    let max = 0;
    for (const row of filteredRows) for (const qty of Object.values(row.channels)) if (qty > max) max = qty;
    return max;
  }, [filteredRows]);

  const maxRowTotal = useMemo(
    () => filteredRows.reduce((m, r) => (r.total > m ? r.total : m), 0),
    [filteredRows]
  );

  const topChannel = useMemo(() => {
    if (!report) return null;
    let best: { channel: string; qty: number } | null = null;
    for (const [channel, qty] of Object.entries(report.channelTotals)) {
      if (!best || qty > best.qty) best = { channel, qty };
    }
    return best && best.qty > 0 ? best : null;
  }, [report]);

  const hasData = (report?.rows.length ?? 0) > 0;
  const periodLabel = getPeriodLabel(customFrom, customTo);

  // Sama seperti handleDateRangeChange di Cashflow.
  const handleDateRangeChange = (from: string, to: string) => {
    setCustomFrom(from);
    setCustomTo(to);
  };

  // Export Excel = PERSIS yang sedang tampil (periode, pencarian, toggle channel kosong).
  const handleExport = async () => {
    if (!report || exporting || filteredRows.length === 0) return;
    setExporting(true);
    try {
      await exportMarketingReportExcel({
        rows: filteredRows,
        channels: visibleChannels,
        footer,
        summary: {
          grandTotal: report.grandTotal,
          keywordCount: report.rows.length,
          topChannel,
          pendingAuditCount: report.pendingAuditCount,
        },
        periodLabel,
        from: customFrom,
        to: customTo,
        searchQuery,
      });
    } catch (err) {
      console.error("Export Laporan Marketing error:", err);
      setError("Gagal export Excel. Coba lagi.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-5 p-3 sm:p-6 pb-16">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3.5">
          <div className="min-w-0 flex items-start gap-3">
            <span className="mt-0.5 w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-500 flex items-center justify-center shrink-0 shadow-lg shadow-violet-300/40 ring-1 ring-white/40">
              <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Laporan Marketing</h1>
              <p className="text-gray-400 text-xs sm:text-sm mt-1 max-w-lg leading-relaxed">
                Rekap minat customer per kata kunci dari Laporan Harian Sales. Hanya laporan yang sudah diaudit yang dihitung.
              </p>
              {lastUpdated && (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-500 bg-white border border-gray-100 px-2.5 py-1 rounded-full mt-2.5 shadow-sm shadow-gray-100">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                  </span>
                  Diperbarui {lastUpdated.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={fetchReport}
            className="flex items-center justify-center gap-1.5 h-10 px-3 sm:px-4 rounded-full text-xs sm:text-sm font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 active:scale-[0.97] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 self-start shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 bg-white border border-gray-100 shadow-sm ring-1 ring-gray-50 rounded-full p-1 w-fit">
          {([
            { key: "barang", label: "Laporan Barang", icon: BarChart3 },
            { key: "range", label: "Range Harga", icon: Hash },
            { key: "insight", label: "Insight", icon: Layers },
            { key: "kesalahan", label: "Kesalahan Sales", icon: AlertTriangle },
            { key: "ads", label: "Laporan Ads", icon: Megaphone },
          ] as const).map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`inline-flex items-center gap-1.5 px-3.5 sm:px-4 h-9 rounded-full text-xs sm:text-sm font-semibold transition-all focus:outline-none ${isActive ? "bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white shadow-sm shadow-violet-300/40" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {activeTab === "barang" && (
          <div className="space-y-4 sm:space-y-5">

            {/* Filter tanggal (kalender Cashflow) + ringkasan */}
            <div className="rounded-3xl bg-white border border-gray-100 shadow-sm ring-1 ring-gray-50 px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex flex-col-reverse lg:flex-row gap-4 lg:items-start">
                <div className="flex-1 min-w-0 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-violet-700 bg-violet-50 border border-violet-100 px-2.5 py-1 rounded-full">
                      <Calendar className="w-3 h-3" />
                      {periodLabel}
                    </span>
                    {customFrom && !customTo && (
                      <span className="text-[11px] text-gray-400">Klik tanggal akhir di kalender untuk menutup rentang</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                    <SummaryCard icon={Hash} iconClass="bg-violet-50 text-violet-600" label="Total Qty" value={report?.grandTotal ?? 0} caption="leads terverifikasi" />
                    <SummaryCard icon={Layers} iconClass="bg-fuchsia-50 text-fuchsia-600" label="Kata Kunci" value={report?.rows.length ?? 0} caption="barang unik" />
                    <SummaryCard
                      icon={Trophy}
                      iconClass="bg-amber-50 text-amber-600"
                      label="Channel Teratas"
                      value={topChannel ? topChannel.qty : 0}
                      caption={topChannel ? channelLabel(topChannel.channel) : "—"}
                    />
                    <SummaryCard icon={Clock} iconClass="bg-gray-100 text-gray-500" label="Menunggu Audit" value={report?.pendingAuditCount ?? 0} caption="belum dihitung" />
                  </div>
                </div>

                <div className="shrink-0 self-center lg:self-start">
                  <InlineDateRange from={customFrom} to={customTo} onChange={handleDateRangeChange} />
                </div>
              </div>
            </div>

            {/* Tabel */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm ring-1 ring-gray-50 overflow-hidden">
              <div className="px-4 sm:px-5 py-3.5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shrink-0 shadow-sm shadow-violet-200/60">
                    <ShieldCheck className="w-4 h-4 text-white" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-gray-900">Rekap per Kata Kunci</h2>
                    <p className="text-[11px] text-gray-500 mt-0.5 truncate">Qty = jumlah laporan teraudit dengan minat yang sama</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 sm:w-64">
                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Escape") setSearchQuery(""); }}
                      placeholder="Cari kata kunci..."
                      aria-label="Cari kata kunci"
                      className="w-full pl-8 pr-8 py-2 text-xs bg-gray-50 border border-gray-200 rounded-full outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 focus:bg-white transition-colors"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        aria-label="Hapus pencarian"
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-200/60"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => setHideEmptyChannels((v) => !v)}
                    title={hideEmptyChannels ? "Tampilkan semua channel" : "Sembunyikan channel yang kosong"}
                    className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-semibold border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 ${hideEmptyChannels ? "bg-violet-600 border-violet-600 text-white" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"}`}
                  >
                    {hideEmptyChannels ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    <span className="hidden sm:inline">Channel kosong</span>
                  </button>
                  <button
                    onClick={handleExport}
                    disabled={loading || exporting || filteredRows.length === 0}
                    title="Export tabel yang sedang tampil ke Excel"
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-semibold border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                  >
                    <Download className={`w-3 h-3 ${exporting ? "animate-bounce" : ""}`} />
                    <span className="hidden sm:inline">{exporting ? "Mengekspor..." : "Export Excel"}</span>
                  </button>
                </div>
              </div>

              {error && (
                <p className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 px-4 sm:px-5 py-3">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {error}
                </p>
              )}

              {loading && !report ? (
                <div className="p-4 sm:p-5 space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-7 rounded-md bg-gray-100 animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
                  ))}
                </div>
              ) : !hasData ? (
                <div className="py-12 flex flex-col items-center text-center px-6">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-50 to-fuchsia-50 flex items-center justify-center mb-3 ring-1 ring-violet-100/60">
                    <BarChart3 className="w-6 h-6 text-violet-300" />
                  </div>
                  <p className="text-sm font-medium text-gray-700">Belum ada laporan teraudit pada periode ini</p>
                  <p className="text-xs text-gray-400 mt-1 max-w-[280px]">
                    {(report?.pendingAuditCount ?? 0) > 0
                      ? `${report?.pendingAuditCount} laporan masih menunggu audit. Data otomatis masuk setelah diaudit.`
                      : "Laporan Harian Sales yang sudah diaudit akan muncul di sini."}
                  </p>
                </div>
              ) : (
                <div className={`overflow-x-auto transition-opacity ${loading ? "opacity-60" : ""}`}>
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr>
                        <th className="sticky left-0 z-10 bg-violet-600 text-white border border-violet-700 px-3 py-2 text-left font-bold whitespace-nowrap min-w-[180px]">
                          Model / Kata Kunci
                        </th>
                        {visibleChannels.map((ch) => (
                          <th
                            key={ch}
                            className={`border border-gray-300 px-2 py-2 text-center font-bold whitespace-nowrap min-w-[76px] ${channelHeaderClass[ch] ?? "bg-gray-500 text-white"}`}
                          >
                            {channelLabel(ch)}
                          </th>
                        ))}
                        <th className="bg-violet-600 text-white border border-violet-700 px-3 py-2 text-center font-bold min-w-[72px]">
                          TOTAL
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={visibleChannels.length + 2} className="border border-gray-200 px-4 py-8 text-center text-gray-400">
                            Tidak ada kata kunci yang cocok dengan &quot;{searchQuery.trim()}&quot;
                          </td>
                        </tr>
                      ) : (
                        filteredRows.map((row) => (
                          <tr key={row.key} className="group hover:bg-violet-50/40">
                            <td
                              className="sticky left-0 z-[1] bg-white group-hover:bg-violet-50 border border-gray-200 px-3 py-1.5 text-gray-800 max-w-[260px] truncate"
                              title={row.keyword}
                            >
                              {row.keyword}
                            </td>
                            {visibleChannels.map((ch) => {
                              const qty = row.channels[ch] ?? 0;
                              return (
                                <td
                                  key={ch}
                                  className={`border border-gray-200 px-2 py-1.5 text-center tabular-nums ${qtyCellClass(qty, maxCellQty)}`}
                                  title={qty > 0 ? `${row.keyword} — ${channelLabel(ch)}: ${qty}` : undefined}
                                >
                                  {qty > 0 ? qty : ""}
                                </td>
                              );
                            })}
                            <td className={`border border-gray-200 px-2 py-1.5 text-center tabular-nums font-bold ${qtyCellClass(row.total, maxRowTotal)}`}>
                              {row.total}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {filteredRows.length > 0 && (
                      <tfoot>
                        <tr className="bg-violet-50">
                          <td className="sticky left-0 z-[1] bg-violet-100 border border-violet-200 px-3 py-2 font-bold text-violet-800">
                            TOTAL
                          </td>
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
                    )}
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

           {activeTab === "range" && <MarketingPriceRangeReport />}
        {activeTab === "insight" && <MarketingInsightBoard />}
        {activeTab === "kesalahan" && <SalesErrorReport />}
        {activeTab === "ads" && <AdsReport />}
      </div>
    </DashboardLayout>
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