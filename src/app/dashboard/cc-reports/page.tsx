"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";

type MenuItem = {
  href: string;
  title: string;
  desc: string;
  /** Warna tile ikon */
  accent: string;
  /** Warna blob dekoratif saat hover */
  glow: string;
  icon: ReactNode;
};

const MENUS: MenuItem[] = [
  {
    href: "/dashboard/cc-reports/laporan",
    title: "Laporan Kerja",
    desc: "Input judul, take video, editing, sampai posting.",
    accent: "bg-violet-50 text-violet-600 ring-1 ring-violet-100",
    glow: "group-hover:bg-violet-100/70",
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
    accent: "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100",
    glow: "group-hover:bg-emerald-100/70",
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
      <div className="min-h-screen bg-[#F7F7F8] px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
        <div className="mx-auto w-full max-w-4xl">
          {/* Header */}
          <header className="mb-5 overflow-hidden rounded-2xl bg-gradient-to-br from-[#0f0c29] via-[#1a1545] to-[#0f0c29] px-5 py-6 sm:mb-8 sm:rounded-3xl sm:px-8 sm:py-8">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white/70 ring-1 ring-white/15">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Content Creator
            </span>
            <h1 className="mt-3 text-2xl font-black leading-tight tracking-tight text-white sm:text-3xl">
              Laporan Konten (CC)
            </h1>
            <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-white/60 sm:text-sm">
              Kelola alur produksi konten &amp; pantau performanya.
            </p>
          </header>

          {/* Menu */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:gap-6">
            {MENUS.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm outline-none transition-all duration-300 hover:-translate-y-1 hover:border-gray-200 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 active:scale-[0.99] motion-reduce:transition-none motion-reduce:hover:transform-none sm:rounded-3xl sm:p-6"
              >
                <div className="relative z-10 flex h-full flex-col">
                  <div
                    className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-105 motion-reduce:transform-none sm:h-12 sm:w-12 sm:rounded-2xl ${m.accent}`}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className="h-5 w-5 sm:h-[22px] sm:w-[22px]"
                    >
                      {m.icon}
                    </svg>
                  </div>

                  <h2 className="text-base font-black tracking-tight text-gray-900 sm:text-lg">
                    {m.title}
                  </h2>
                  <p className="mt-1 text-[13px] leading-relaxed text-gray-500 sm:text-sm">
                    {m.desc}
                  </p>

                  <span className="mt-5 flex items-center gap-1.5 border-t border-dashed border-gray-100 pt-4 text-[11px] font-bold uppercase tracking-wider text-gray-400 transition-colors group-hover:text-gray-900 sm:mt-auto">
                    Buka
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transform-none"
                    >
                      <polyline points="9 6 15 12 9 18" />
                    </svg>
                  </span>
                </div>

                <div
                  className={`pointer-events-none absolute -bottom-10 -right-10 h-32 w-32 rounded-full bg-gray-50 transition-all duration-500 group-hover:scale-125 motion-reduce:transform-none sm:h-36 sm:w-36 ${m.glow}`}
                />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}