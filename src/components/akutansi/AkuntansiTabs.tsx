"use client";
// src/components/akuntansi/AkuntansiTabs.tsx

import { useState } from "react";
import Link from "next/link";
import { periodLabel } from "@/lib/accounting";
import JurnalUmum from "./JurnalUmum";
import BukuBesar from "./BukuBesar";
import Neraca from "./Neraca";

type TabKey = "jurnal" | "buku-besar" | "neraca" | "laba-rugi";

const TABS: { key: TabKey; label: string }[] = [
  { key: "jurnal", label: "Jurnal Umum" },
  { key: "buku-besar", label: "Buku Besar" },
  { key: "neraca", label: "Neraca" },
  { key: "laba-rugi", label: "Laba Rugi" },
];

export default function AkuntansiTabs({ period }: { period: string }) {
  const [tab, setTab] = useState<TabKey>("jurnal");

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
      </div>

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
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
          <div className="text-4xl mb-3 opacity-40">🚧</div>
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