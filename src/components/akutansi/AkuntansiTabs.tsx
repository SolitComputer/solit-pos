"use client";
// src/components/akuntansi/AkuntansiTabs.tsx

import { useState } from "react";
import Link from "next/link";
import { periodLabel } from "@/lib/accounting";
import JurnalUmum from "./JurnalUmum";
import BukuBesar from "./BukuBesar";
import Neraca from "./Neraca";
import AkunManager from "./AkunManager";
import { Inbox, FileSpreadsheet } from "lucide-react";

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
        const json = await res.json().catch(() => null);
        throw new Error(json?.message ?? "Gagal export akuntansi");
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
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/akutansi"
            className="w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center text-gray-500 hover:bg-gray-50 transition"
            title="Ganti bulan"
          >
            ‹
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900 leading-tight">Akuntansi</h1>
            <p className="text-xs text-gray-500 mt-0.5">Periode {periodLabel(period)}</p>
          </div>
        </div>

        {/* Export global — semua laporan akuntansi dalam 1 file Excel */}
        <button
          onClick={handleExport}
          disabled={exporting}
          title="Export seluruh akuntansi (Jurnal Umum, Buku Besar, Neraca) ke Excel"
          className="h-10 px-4 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition disabled:opacity-40 shrink-0 whitespace-nowrap"
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
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700">
          {exportError}
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white border border-gray-200 rounded-xl p-1 flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 min-w-[110px] h-9 rounded-lg text-xs font-bold transition whitespace-nowrap ${tab === t.key
              ? "bg-gray-900 text-white"
              : "text-gray-500 hover:bg-gray-50"
              }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "jurnal" ? (
        <JurnalUmum period={period} />
      ) : tab === "buku-besar" ? (
        <BukuBesar period={period} />
      ) : tab === "neraca" ? (
        <Neraca period={period} />
      ) : tab === "akun" ? (
        <AkunManager />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
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
  );
}