"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Calendar, Megaphone, RefreshCw } from "lucide-react";
import InlineDateRange from "@/components/common/InlineDateRange";
import { todayWibDate } from "@/lib/marketing-report";

interface AdsItemRow {
  invoice_number: string;
  created_at: string;
  customer_name: string;
  sales_name: string | null;
  barang: string;
  sumber: string | null;
  nama_toko: string | null;
}

function fmtTanggalShort(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}
function getPeriodLabel(from: string, to: string): string {
  if (!from && !to) return "Semua Waktu";
  return `${from ? fmtTanggalShort(from) : "..."} — ${to ? fmtTanggalShort(to) : "..."}`;
}

export default function BarangHasilAds() {
  const [customFrom, setCustomFrom] = useState(() => todayWibDate().slice(0, 8) + "01");
  const [customTo, setCustomTo] = useState(() => todayWibDate());
  const [rows, setRows] = useState<AdsItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const params = new URLSearchParams();
      if (customFrom) params.set("from", customFrom);
      if (customTo) params.set("to", customTo);
      const res = await fetch(`/api/marketing-report/ads-items?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Gagal memuat data");
      setRows(json.data as AdsItemRow[]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [customFrom, customTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const periodLabel = getPeriodLabel(customFrom, customTo);
  const handleDateRangeChange = (from: string, to: string) => {
    setCustomFrom(from);
    setCustomTo(to);
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="rounded-3xl bg-white border border-gray-100 shadow-sm ring-1 ring-gray-50 px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-col-reverse lg:flex-row gap-4 lg:items-center lg:justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-violet-700 bg-violet-50 border border-violet-100 px-2.5 py-1 rounded-full">
              <Calendar className="w-3 h-3" />
              {periodLabel}
            </span>
            <button
              onClick={fetchData}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 bg-white border border-gray-200 px-2.5 py-1 rounded-full hover:bg-gray-50"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 bg-gray-50 border border-gray-100 px-2.5 py-1 rounded-full">
              {rows.length} transaksi
            </span>
          </div>
          <div className="shrink-0 self-center lg:self-start">
            <InlineDateRange from={customFrom} to={customTo} onChange={handleDateRangeChange} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm ring-1 ring-gray-50 overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-gray-100 flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shrink-0 shadow-sm shadow-violet-200/60">
            <Megaphone className="w-4 h-4 text-white" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-gray-900">Barang Hasil Ads</h2>
            <p className="text-[11px] text-gray-500 mt-0.5 truncate">Transaksi dari Riwayat Transaksi yang sumbernya tercatat dari Ads</p>
          </div>
        </div>

        {error && (
          <p className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 px-4 sm:px-5 py-3">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
          </p>
        )}

        {loading && rows.length === 0 ? (
          <div className="p-4 sm:p-5 space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-7 rounded-md bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 flex flex-col items-center text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-50 to-fuchsia-50 flex items-center justify-center mb-3 ring-1 ring-violet-100/60">
              <Megaphone className="w-6 h-6 text-violet-300" />
            </div>
            <p className="text-sm font-medium text-gray-700">Belum ada transaksi dari Ads pada periode ini</p>
            <p className="text-xs text-gray-400 mt-1 max-w-[280px]">
              Transaksi di Riwayat Transaksi yang ditandai "Dari Ads" otomatis muncul di sini.
            </p>
          </div>
        ) : (
          <div className={`overflow-x-auto transition-opacity ${loading ? "opacity-60" : ""}`}>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-violet-600 text-white">
                  <th className="border border-violet-700 px-3 py-2 text-center font-bold w-12">No</th>
                  <th className="border border-violet-700 px-3 py-2 text-left font-bold whitespace-nowrap">Tanggal</th>
                  <th className="border border-violet-700 px-3 py-2 text-left font-bold min-w-[140px]">Nama Customer</th>
                  <th className="border border-violet-700 px-3 py-2 text-left font-bold min-w-[120px]">Nama Sales</th>
                  <th className="border border-violet-700 px-3 py-2 text-left font-bold min-w-[220px]">Nama Barang + Spesifikasi</th>
                  <th className="border border-violet-700 px-3 py-2 text-left font-bold min-w-[110px]">Sumber</th>
                  <th className="border border-violet-700 px-3 py-2 text-left font-bold min-w-[110px]">Nama Toko</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.invoice_number} className="hover:bg-violet-50/40">
                    <td className="border border-gray-200 px-3 py-1.5 text-center text-gray-400 font-semibold">{idx + 1}</td>
                    <td className="border border-gray-200 px-3 py-1.5 whitespace-nowrap text-gray-700">
                      {new Date(row.created_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="border border-gray-200 px-3 py-1.5 font-semibold text-gray-800">{row.customer_name}</td>
                    <td className="border border-gray-200 px-3 py-1.5 text-gray-700">{row.sales_name ?? "—"}</td>
                    <td className="border border-gray-200 px-3 py-1.5 text-gray-700">{row.barang}</td>
                    <td className="border border-gray-200 px-3 py-1.5 text-gray-700">{row.sumber ?? "—"}</td>
                    <td className="border border-gray-200 px-3 py-1.5 text-gray-700">{row.nama_toko ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}