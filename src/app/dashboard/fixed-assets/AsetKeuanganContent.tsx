"use client";

import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import FixedAssetsContent from "./FixedAssetsContent";
import FinancialEntriesContent, { type EntryType } from "./FinancialEntriesContent";

type TabKey = "aset" | EntryType;

const TABS: { key: TabKey; label: string }[] = [
  { key: "aset", label: "Aset Tetap" },
  { key: "utang", label: "Utang" },
  { key: "piutang", label: "Piutang" },
  { key: "modal_service", label: "Modal Service" },
];

export default function AsetKeuanganContent() {
  const [tab, setTab] = useState<TabKey>("aset");

  return (
    <DashboardLayout>
      {/* Tab bar */}
      <div className="px-4 sm:px-6 lg:px-8 pt-5 sm:pt-7 max-w-6xl mx-auto">
        <div className="flex gap-1 p-1 rounded-2xl bg-gray-100 overflow-x-auto">
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
      </div>

      {/* Panel aktif */}
      {tab === "aset" && <FixedAssetsContent />}
      {tab === "utang" && <FinancialEntriesContent entryType="utang" />}
      {tab === "piutang" && <FinancialEntriesContent entryType="piutang" />}
      {tab === "modal_service" && <FinancialEntriesContent entryType="modal_service" />}
    </DashboardLayout>
  );
}