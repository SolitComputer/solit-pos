"use client";
// src/components/akutansi/AkuntansiTabs.tsx

import { useState } from "react";
import Link from "next/link";
import { Fraunces } from "next/font/google";
import { periodLabel } from "@/lib/accounting";
import JurnalUmum from "./JurnalUmum";
import BukuBesar from "./BukuBesar";
import Neraca from "./Neraca";
import LabaRugi from "./LabaRugi";
import AkunManager from "./AkunManager";
import { Inbox, FileSpreadsheet } from "lucide-react";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["600", "900"],
  style: ["normal", "italic"],
  display: "swap",
});

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

  // Export SELURUH akuntansi (Jurnal Umum + Buku Besar per kategori + Neraca)
  // ke satu file Excel — tidak tergantung tab yang sedang aktif.
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
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-0">
      {/* Header — "sampul ledger" */}
      <div className="ledger-cover relative overflow-hidden bg-gradient-to-br from-[#FBF7EC] to-[#F3ECD8] border border-[#E4DCC8] rounded-2xl px-5 sm:px-6 py-5 flex items-center justify-between gap-4 flex-wrap">
        <div className="relative flex items-center gap-3">
          <Link
            href="/dashboard/akutansi"
            className="w-9 h-9 rounded-full bg-gradient-to-br from-[#0f0c29] to-[#1a1545] flex items-center justify-center text-white shadow-md hover:opacity-90 active:scale-90 transition-all duration-150 shrink-0"
            title="Ganti bulan"
          >
            ‹
          </Link>
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="w-5 h-[2px] bg-gradient-to-r from-[#9C7420] to-transparent" />
              <span className="text-[9px] font-semibold tracking-[0.2em] uppercase text-[#9C7420]">
                Pembukuan
              </span>
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className={`${fraunces.className} text-2xl font-bold italic text-gray-900 leading-tight`}>
                Akuntansi
              </h1>
              <span className="text-[10px] font-mono font-bold uppercase tracking-wide text-[#6b5730] bg-white/70 border border-[#E4DCC8] rounded-md px-2 py-1">
                {periodLabel(period)}
              </span>
            </div>
          </div>
        </div>

        {/* Export global — semua laporan akuntansi dalam 1 file Excel */}
        <button
          onClick={handleExport}
          disabled={exporting}
          title="Export seluruh akuntansi (Jurnal Umum, Buku Besar, Neraca) ke Excel"
          className="relative h-10 px-4 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 hover:shadow-lg hover:shadow-emerald-600/25 active:scale-[0.96] transition-all duration-150 disabled:opacity-40 disabled:active:scale-100 shrink-0 whitespace-nowrap"
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
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700 mt-4">
          {exportError}
        </div>
      )}

      {/* Tabs — kayak tab index buku besar */}
      <div className="relative flex gap-1 overflow-x-auto mt-5 px-1">
        {TABS.map((t, i) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{ animationDelay: `${i * 40}ms` }}
              className={`ledger-tab relative shrink-0 ${active ? "h-11" : "h-10"
                } min-w-[112px] flex items-center justify-center active:scale-[0.96] transition-all duration-200 ${active ? "" : "hover:-translate-y-0.5"
                }`}
            >
              <span
                className={`ledger-tab-shape absolute inset-0 transition-colors duration-200 ${active
                  ? "bg-gradient-to-br from-[#0f0c29] to-[#1a1545] shadow-lg shadow-black/20"
                  : "bg-white border border-gray-200 hover:bg-gray-50"
                  }`}
              />
              <span
                className={`relative z-10 text-xs font-bold whitespace-nowrap px-3 ${active ? "text-white" : "text-gray-500"
                  }`}
              >
                {t.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="relative bg-white border border-gray-200 rounded-b-2xl rounded-tr-2xl -mt-px pt-5 px-1">
        {tab === "jurnal" ? (
          <JurnalUmum period={period} />
        ) : tab === "buku-besar" ? (
          <BukuBesar period={period} />
        ) : tab === "neraca" ? (
          <Neraca period={period} />
        ) : tab === "laba-rugi" ? (
          <LabaRugi period={period} />
        ) : tab === "akun" ? (
          <AkunManager />
        ) : (
          <div className="bg-white rounded-xl p-16 text-center">
            <div className="flex justify-center mb-3 opacity-40"><Inbox className="w-10 h-10" /></div>
            <p className="text-sm font-semibold text-gray-600">
              {TABS.find((t) => t.key === tab)?.label} — belum dikerjakan
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Akan dibangun di atas data Jurnal Umum periode ini.
            </p>
          </div>
        )}
      </div>

      <style jsx global>{`
        .ledger-cover {
          background-image: radial-gradient(rgba(15, 12, 41, 0.06) 1px, transparent 1px);
          background-size: 16px 16px;
        }
        .ledger-tab-shape {
          clip-path: polygon(6% 0%, 94% 0%, 100% 100%, 0% 100%);
          border-radius: 10px 10px 0 0;
        }
        .ledger-tab {
          animation: tabFadeIn 0.35s ease backwards;
        }
        @keyframes tabFadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .ledger-tab {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}