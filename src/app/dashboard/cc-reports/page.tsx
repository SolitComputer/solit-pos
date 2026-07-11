// src/app/dashboard/cc-reports/page.tsx
"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Link from "next/link";

const MENUS = [
  {
    href: "/dashboard/cc-reports/laporan",
    title: "Laporan Kerja",
    desc: "Input judul, take video, editing, sampai posting.",
    accent: "bg-violet-50 text-violet-600",
    glow: "group-hover:bg-violet-50",
    icon: (
      <>
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </>
    ),
  },
  {
    href: "/dashboard/cc-reports/analisa",
    title: "Analisa",
    desc: "Grafik view, like, komen dari platform yang sudah diposting.",
    accent: "bg-emerald-50 text-emerald-600",
    glow: "group-hover:bg-emerald-50",
    icon: (
      <>
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
        <line x1="2" y1="20" x2="22" y2="20" />
      </>
    ),
  },
];

export default function CCReportHome() {
  return (
    <DashboardLayout>
      <div className="min-h-screen bg-white px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8">
            <h1 className="text-2xl font-black tracking-tight text-gray-900 sm:text-3xl">
              Laporan Konten (CC)
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Kelola alur produksi konten & pantau performanya.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
            {MENUS.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                className="group relative overflow-hidden rounded-3xl border border-gray-100 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-gray-200 hover:shadow-lg"
              >
                <div className="relative z-10">
                  <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${m.accent}`}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      {m.icon}
                    </svg>
                  </div>
                  <h2 className="text-lg font-black text-gray-900">{m.title}</h2>
                  <p className="mt-1 text-sm text-gray-500">{m.desc}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-gray-400 transition group-hover:gap-2 group-hover:text-gray-900">
                    Buka
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="9 6 15 12 9 18" />
                    </svg>
                  </span>
                </div>
                <div className={`absolute -bottom-8 -right-8 h-32 w-32 rounded-full bg-gray-50 transition-transform duration-500 group-hover:scale-125 ${m.glow}`} />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}