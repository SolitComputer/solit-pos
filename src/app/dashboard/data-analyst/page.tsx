"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, RefreshCw, Calendar, Layers } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { todayWibDate } from "@/lib/marketing-report";
import MarketingFunnel from "./MarketingFunnel";

interface FunnelData {
  awareness: number;
  interest: number;
  decision: number;
  action: number;
}

// Division tab — untuk sekarang baru Marketing. Nanti tinggal tambah entry
// di sini kalau mau integrate ke divisi lain (Sales, Service, Teknisi, dll).
const DIVISIONS = [
  { key: "marketing" as const, label: "Marketing", icon: BarChart3 },
] as const;
type DivisionKey = (typeof DIVISIONS)[number]["key"];

function fmtTanggalShort(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", {
    day: "2-digit", month: "2-digit", year: "2-digit",
  });
}

export default function DataAnalystPage() {
  const [division, setDivision] = useState<DivisionKey>("marketing");
  const [period, setPeriod] = useState<"today" | "week" | "month">("month");
  const [funnel, setFunnel] = useState<FunnelData>({
    awareness: 0, interest: 0, decision: 0, action: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Derive from/to dari tab periode — pola sama dgn AwarenessReport.tsx
  const { customFrom, customTo } = useMemo(() => {
    const today = todayWibDate();
    if (period === "today") return { customFrom: today, customTo: today };
    if (period === "week") {
      const [y, m, d] = today.split("-").map(Number);
      const dt = new Date(y, m - 1, d - 6);
      const pad = (n: number) => String(n).padStart(2, "0");
      return {
        customFrom: `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`,
        customTo: today,
      };
    }
    return { customFrom: today.slice(0, 8) + "01", customTo: today };
  }, [period]);

  const fetchFunnel = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const params = new URLSearchParams();
      if (customFrom) params.set("from", customFrom);
      if (customTo) params.set("to", customTo);
      // Endpoint di-switch berdasarkan division — untuk sekarang cuma marketing
      const endpoint =
        division === "marketing"
          ? `/api/data-analyst/marketing-funnel?${params.toString()}`
          : "";
      if (!endpoint) {
        setFunnel({ awareness: 0, interest: 0, decision: 0, action: 0 });
        return;
      }
      const res = await fetch(endpoint, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Gagal memuat");
      setFunnel(json.data as FunnelData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [customFrom, customTo, division]);

  useEffect(() => {
    fetchFunnel();
  }, [fetchFunnel]);

  const periodLabel = `${fmtTanggalShort(customFrom)} — ${fmtTanggalShort(customTo)}`;

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-5 p-3 sm:p-6 pb-16">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3.5">
          <div className="min-w-0 flex items-start gap-3">
            <span className="mt-0.5 w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shrink-0 shadow-lg shadow-indigo-300/40 ring-1 ring-white/40">
              <Layers className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Data Analyst</h1>
              <p className="text-gray-400 text-xs sm:text-sm mt-1 max-w-lg leading-relaxed">
                Dashboard analitik lintas divisi — Lihat performa Marketing, Sales, Service, dan lainnya
                dalam satu tempat (read-only).
              </p>
            </div>
          </div>
          <button
            onClick={fetchFunnel}
            className="flex items-center justify-center gap-1.5 h-10 px-3 sm:px-4 rounded-full text-xs sm:text-sm font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        {/* Division switcher */}
        <div className="flex items-center gap-1 bg-white border border-gray-100 shadow-sm ring-1 ring-gray-50 rounded-full p-1 w-fit max-w-full overflow-x-auto">
          {DIVISIONS.map((d) => {
            const Icon = d.icon;
            const isActive = division === d.key;
            return (
              <button
                key={d.key}
                onClick={() => setDivision(d.key)}
                className={`inline-flex items-center gap-1.5 px-3.5 sm:px-4 h-9 rounded-full text-xs sm:text-sm font-semibold transition-all whitespace-nowrap focus:outline-none ${
                  isActive
                    ? "bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-sm shadow-indigo-300/40"
                    : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {d.label}
              </button>
            );
          })}
          <span className="inline-flex items-center gap-1 px-3 text-[11px] text-gray-300 italic">
            + divisi lain segera
          </span>
        </div>

        {/* Period filter */}
        <div className="rounded-3xl bg-white border border-gray-100 shadow-sm ring-1 ring-gray-50 px-4 py-3.5 sm:px-6 sm:py-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-full">
              <Calendar className="w-3 h-3" />
              {periodLabel}
            </span>
          </div>
          <div className="inline-flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-full p-1">
            {([
              { key: "today" as const, label: "Hari Ini" },
              { key: "week" as const, label: "Mingguan" },
              { key: "month" as const, label: "Bulanan" },
            ]).map((t) => (
              <button
                key={t.key}
                onClick={() => setPeriod(t.key)}
                className={`px-3 h-8 rounded-full text-[11px] font-semibold transition-colors ${
                  period === t.key
                    ? "bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-800 hover:bg-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
          </p>
        )}

        {/* Marketing Funnel visualization */}
        {division === "marketing" && (
          <MarketingFunnel data={funnel} loading={loading} />
        )}

        {/* Hint */}
        <p className="text-[11px] text-gray-400 text-center italic">
          Data funnel terhubung otomatis dengan tab Awareness di Laporan Marketing.
          Interest akan aktif setelah engagement konten dipetakan ke sistem.
        </p>
      </div>
    </DashboardLayout>
  );
}