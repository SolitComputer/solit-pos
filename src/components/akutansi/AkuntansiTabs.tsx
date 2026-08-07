"use client";
// src/components/akutansi/AkuntansiTabs.tsx

import { useState } from "react";
import Link from "next/link";
import { periodLabel } from "@/lib/accounting";
import JurnalUmum from "./JurnalUmum";
import BukuBesar from "./BukuBesar";
import Neraca from "./Neraca";
import LabaRugi from "./LabaRugi";
import AkunManager from "./AkunManager";
import { Inbox, FileSpreadsheet, ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";

type TabKey = "jurnal" | "buku-besar" | "neraca" | "laba-rugi" | "akun";

const TABS: { key: TabKey; label: string }[] = [
  { key: "jurnal", label: "Jurnal Umum" },
  { key: "buku-besar", label: "Buku Besar" },
  { key: "neraca", label: "Neraca" },
  { key: "laba-rugi", label: "Laba Rugi" },
  { key: "akun", label: "Kelola Akun" },
];

export default function AkuntansiTabs({ period }: { period: string }) {
  const [tab, setTab] = useState<TabKey>("jurnal");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  // Navigasi periode bulan (sebelumnya / berikutnya)
  const [y, m] = period.split("-").map(Number);
  const prevDate = new Date(y, m - 2, 1);
  const prevPeriod = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
  const nextDate = new Date(y, m, 1);
  const nextPeriod = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`;

  // Export SELURUH akuntansi (Jurnal Umum + Buku Besar per kategori + Neraca)
  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    setExportError("");
    try {
      const res = await fetch(`/api/akutansi/export?period=${period}`);
      if (!res.ok) {
        const rawText = await res.text().catch(() => "");
        let json: any = null;
        try { json = rawText ? JSON.parse(rawText) : null; } catch { /* bukan JSON */ }
        console.error("[export akutansi] gagal:", {
          status: res.status,
          statusText: res.statusText,
          body: rawText,
        });
        throw new Error(
          json?.message ?? `Gagal export akuntansi (${res.status} ${res.statusText})`
        );
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Akuntansi-${period}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setExportError(e?.message ?? "Gagal export akuntansi");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-5">
      {/* Header — Modern Minimalist Card */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 shadow-xs flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 sm:gap-4">
          <Link
            href="/dashboard/akutansi"
            className="w-9 h-9 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 active:scale-95 text-slate-700 flex items-center justify-center transition-all shrink-0"
            title="Pilih Bulan dari Grid"
          >
            <ArrowLeft className="w-4 h-4 text-slate-600" />
          </Link>

          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-blue-600" />
              <span className="text-[10px] font-bold tracking-widest uppercase text-slate-400">
                Pembukuan Internal
              </span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-none">
                Akuntansi
              </h1>

              {/* Segmented Month Switcher Pill */}
              <div className="bg-slate-100/90 border border-slate-200/80 rounded-full px-1.5 py-1 flex items-center gap-1 shrink-0">
                <Link
                  href={`/dashboard/akutansi/${prevPeriod}`}
                  className="w-7 h-7 rounded-full bg-white hover:bg-slate-200/70 text-slate-700 font-bold flex items-center justify-center shadow-2xs active:scale-90 transition-all shrink-0"
                  title={`Bulan sebelumnya (${periodLabel(prevPeriod)})`}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Link>
                <span className="text-xs sm:text-sm font-bold uppercase tracking-wide text-slate-800 px-2.5">
                  {periodLabel(period)}
                </span>
                <Link
                  href={`/dashboard/akutansi/${nextPeriod}`}
                  className="w-7 h-7 rounded-full bg-white hover:bg-slate-200/70 text-slate-700 font-bold flex items-center justify-center shadow-2xs active:scale-90 transition-all shrink-0"
                  title={`Bulan berikutnya (${periodLabel(nextPeriod)})`}
                >
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Export Excel Button */}
        <button
          onClick={handleExport}
          disabled={exporting}
          title="Export seluruh akuntansi ke 1 file Excel"
          className="h-10 px-4 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.97] text-white text-xs font-semibold shadow-xs hover:shadow transition-all disabled:opacity-40 shrink-0 whitespace-nowrap"
        >
          {exporting ? (
            <span className="inline-block animate-spin">⟳</span>
          ) : (
            <FileSpreadsheet className="w-4 h-4" />
          )}
          {exporting ? "Exporting..." : "Export Excel"}
        </button>
      </div>

      {/* Error export */}
      {exportError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700 font-medium">
          {exportError}
        </div>
      )}

      {/* Segmented Control Bar Nav Tabs */}
      <div className="bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200/60 inline-flex flex-wrap gap-1">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-xl transition-all duration-200 whitespace-nowrap ${active
                  ? "bg-white text-slate-900 font-bold shadow-xs"
                  : "text-slate-500 hover:text-slate-800 hover:bg-white/40"
                }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Main Content Container */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-6">
        {tab === "jurnal" ? (
          <JurnalUmum period={period} />
        ) : tab === "buku-besar" ? (
          <BukuBesar period={period} />
        ) : tab === "neraca" ? (
          <Neraca key={`neraca-${period}`} period={period} />
        ) : tab === "laba-rugi" ? (
          <LabaRugi period={period} />
        ) : tab === "akun" ? (
          <AkunManager />
        ) : (
          <div className="py-16 text-center">
            <div className="flex justify-center mb-3 opacity-40"><Inbox className="w-10 h-10 text-slate-400" /></div>
            <p className="text-sm font-semibold text-slate-600">
              {TABS.find((t) => t.key === tab)?.label} — belum dikerjakan
            </p>
          </div>
        )}
      </div>
    </div>
  );
}