"use client";

import { useState } from "react";
import { exportAsetKeuanganToExcel } from "@/lib/exportAsetKeuangan";
import DashboardLayout from "@/components/layout/DashboardLayout";
import FixedAssetsContent from "./FixedAssetsContent";
import FinancialEntriesContent, { type EntryType } from "./FinancialEntriesContent";

type TabKey = "aset" | EntryType;

const TABS: { key: TabKey; label: string }[] = [
  { key: "aset", label: "Aset" },
  { key: "utang", label: "Utang" },
  { key: "piutang", label: "Piutang" },
  { key: "modal_service", label: "Modal Service" },
];

export default function AsetKeuanganContent() {
  const [tab, setTab] = useState<TabKey>("aset");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      // Fetch 4 endpoint paralel biar cepat
      const [asetRes, utangRes, piutangRes, modalRes] = await Promise.all([
        fetch("/api/fixed-assets", { cache: "no-store" }),
        fetch("/api/financial-entries?type=utang", { cache: "no-store" }),
        fetch("/api/financial-entries?type=piutang", { cache: "no-store" }),
        fetch("/api/financial-entries?type=modal_service", { cache: "no-store" }),
      ]);
      const [aset, utang, piutang, modal] = await Promise.all([
        asetRes.json(),
        utangRes.json(),
        piutangRes.json(),
        modalRes.json(),
      ]);

      if (!aset.success) throw new Error(aset.message || "Gagal memuat data aset");
      if (!utang.success) throw new Error(utang.message || "Gagal memuat data utang");
      if (!piutang.success) throw new Error(piutang.message || "Gagal memuat data piutang");
      if (!modal.success) throw new Error(modal.message || "Gagal memuat data modal service");

      await exportAsetKeuanganToExcel({
        aset: aset.data || [],
        utang: utang.data || [],
        piutang: piutang.data || [],
        modalService: modal.data || [],
      });
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Gagal export Excel");
    } finally {
      setExporting(false);
    }
  }

  return (
    <DashboardLayout>
      {/* Tab bar */}
      <div className="px-4 sm:px-6 lg:px-8 pt-5 sm:pt-7 max-w-6xl mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="flex gap-1 p-1 rounded-2xl bg-gray-100 overflow-x-auto flex-1 min-w-0">
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  aria-current={active ? "page" : undefined}
                  className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition whitespace-nowrap ${
                    active ? "bg-[#1a1a2e] text-white shadow-sm" : "text-gray-500 hover:text-gray-800 hover:bg-white/70"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            title="Export semua tab ke Excel (4 sheet)"
            className="flex-shrink-0 inline-flex items-center gap-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold px-3.5 sm:px-4 py-2.5 hover:bg-emerald-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/20 transition disabled:opacity-60"
          >
            {exporting ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            )}
            <span className="hidden sm:inline">{exporting ? "Menyiapkan..." : "Export Excel"}</span>
            <span className="sm:hidden">{exporting ? "..." : "Excel"}</span>
          </button>
        </div>
        {exportError && (
          <div role="alert" className="mt-2 rounded-xl bg-red-50 text-red-600 text-sm px-4 py-2.5 border border-red-100">
            {exportError}
          </div>
        )}
      </div>

      {/* Panel aktif */}
      {tab === "aset" && <FixedAssetsContent />}
      {tab === "utang" && <FinancialEntriesContent entryType="utang" />}
      {tab === "piutang" && <FinancialEntriesContent entryType="piutang" />}
      {tab === "modal_service" && <FinancialEntriesContent entryType="modal_service" />}
    </DashboardLayout>
  );
}