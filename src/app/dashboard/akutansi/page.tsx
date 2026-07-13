"use client";
// src/app/dashboard/akuntansi/page.tsx

import { useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { MONTH_LABELS } from "@/lib/accounting";

export default function AkuntansiPeriodPickerPage() {
  const router = useRouter();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const [year, setYear] = useState(currentYear);

  const open = (month: number) => {
    const period = `${year}-${String(month).padStart(2, "0")}`;
    router.push(`/dashboard/akutansi/${period}`);
  };

  return (
    <DashboardLayout>
      <div className="max-w-[1100px] mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-1.5 h-7 bg-gradient-to-b from-gray-700 to-gray-900 rounded-full" />
              <h1 className="text-2xl font-bold text-gray-900">Akuntansi</h1>
            </div>
            <p className="text-sm text-gray-500 ml-5">Pilih bulan untuk membuka pembukuan</p>
          </div>

          {/* Year switcher */}
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1">
            <button
              onClick={() => setYear((y) => y - 1)}
              className="w-8 h-8 rounded-lg text-gray-500 hover:bg-gray-100 transition"
            >
              ‹
            </button>
            <span className="px-3 text-sm font-bold text-gray-800 tabular-nums">{year}</span>
            <button
              onClick={() => setYear((y) => y + 1)}
              disabled={year >= currentYear + 1}
              className="w-8 h-8 rounded-lg text-gray-500 hover:bg-gray-100 transition disabled:opacity-30"
            >
              ›
            </button>
          </div>
        </div>

        {/* Grid bulan (angka) */}
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
            const isCurrent = year === currentYear && m === currentMonth;
            const isFuture = year > currentYear || (year === currentYear && m > currentMonth);

            return (
              <button
                key={m}
                onClick={() => open(m)}
                className={`group relative aspect-square rounded-2xl border transition-all duration-150 flex flex-col items-center justify-center
                  ${isCurrent
                    ? "bg-gray-900 border-gray-900 text-white shadow-lg"
                    : isFuture
                    ? "bg-white border-dashed border-gray-200 text-gray-300 hover:border-gray-300"
                    : "bg-white border-gray-200 text-gray-800 hover:border-gray-900 hover:shadow-md"
                  }`}
              >
                <span className="text-3xl font-black tabular-nums leading-none">
                  {String(m).padStart(2, "0")}
                </span>
                <span
                  className={`text-[11px] font-semibold mt-2 ${
                    isCurrent ? "text-gray-300" : "text-gray-400"
                  }`}
                >
                  {MONTH_LABELS[m - 1]}
                </span>
                {isCurrent && (
                  <span className="absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/20">
                    NOW
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <p className="text-xs text-gray-400">
          Data jurnal dipisah per bulan. Bulan yang belum lewat tetap bisa dibuka untuk input berjalan.
        </p>
      </div>
    </DashboardLayout>
  );
}