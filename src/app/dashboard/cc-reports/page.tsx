// src/app/dashboard/cc-reports/page.tsx
"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Link from "next/link";

export default function CCReportHome() {
  return (
    <DashboardLayout>

      <div className="min-h-screen bg-[#F7F7F8] px-4 py-6 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-black text-[#1a1a2e] tracking-tight">
              Laporan Konten (CC)
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Kelola alur produksi konten & pantau performanya.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            {/* Laporan Kerja */}
            <Link
              href="/dashboard/cc-reports/laporan"
              className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a1a2e] to-[#2d2d4a] p-6 shadow-lg shadow-[#1a1a2e]/20 transition-all hover:-translate-y-1 hover:shadow-xl"
            >
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center mb-4">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                </div>
                <h2 className="text-lg font-black text-white">Laporan Kerja</h2>
                <p className="text-sm text-white/60 mt-1">
                  Input judul, take video, editing, sampai posting.
                </p>
              </div>
              <div className="absolute -right-6 -bottom-6 w-28 h-28 rounded-full bg-white/5 group-hover:scale-125 transition-transform" />
            </Link>

            {/* Analisa */}
            <Link
              href="/dashboard/cc-reports/analisa"
              className="group relative overflow-hidden rounded-2xl bg-white border border-gray-100 p-6 shadow-lg shadow-gray-200/50 transition-all hover:-translate-y-1 hover:shadow-xl"
            >
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center mb-4">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2">
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="14" />
                    <line x1="2" y1="20" x2="22" y2="20" />
                  </svg>
                </div>
                <h2 className="text-lg font-black text-[#1a1a2e]">Analisa</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Grafik view, like, komen dari platform yang sudah diposting.
                </p>
              </div>
              <div className="absolute -right-6 -bottom-6 w-28 h-28 rounded-full bg-violet-50/60 group-hover:scale-125 transition-transform" />
            </Link>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}