// src/components/dashboard/ServiceDashboardWidget.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface ServiceStats {
  antrian: number;
  sedangDikerjakan: number;
  menungguSparepart: number;
  done: number;
  gagal: number;
  sudahDiambilHariIni: number;
  pendapatanHariIni: number;
  terlamaAntrian: {
    no_urut: number;
    nama: string;
    type_laptop: string;
    tanggal_masuk: string;
    status: string;
  }[];
  sedangDetail: {
    no_urut: number;
    nama: string;
    type_laptop: string;
    tanggal_masuk: string;
    dikerjakan_by_user?: { name: string } | null;
  }[];
}

function getDuration(masuk: string): string {
  const diff = Math.floor((Date.now() - new Date(masuk).getTime()) / 60000);
  if (diff < 60) return `${diff} mnt`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h}j ${diff % 60}m`;
  return `${Math.floor(h / 24)}hr ${h % 24}j`;
}

function fmtRupiah(n: number): string {
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}Jt`;
  if (n >= 1_000) return `Rp ${(n / 1_000).toFixed(0)}Rb`;
  return `Rp ${n}`;
}

const Shimmer = ({ className = "" }: { className?: string }) => (
  <div className={`rounded-lg bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 animate-pulse ${className}`} />
);

export default function ServiceDashboardWidget({ canSeeFinancials }: { canSeeFinancials: boolean }) {
  const [data, setData] = useState<ServiceStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/service-stats");
      const json = await res.json();
      if (json.success) setData(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    // Auto-refresh tiap 30 detik
    const interval = setInterval(fetchStats, 30_000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  const totalAktif = (data?.antrian ?? 0) + (data?.sedangDikerjakan ?? 0) + (data?.menungguSparepart ?? 0);

  return (
    <div className="space-y-4">

      {/* Section label */}
      <div className="flex items-center gap-2">
        <span className="inline-block w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-blue-500 animate-pulse ring-2 ring-blue-200 flex-shrink-0" />
        <span className="text-[10px] sm:text-[11px] font-bold text-gray-400 uppercase tracking-wider">
          Dashboard Servis
        </span>
        <div className="flex-1 h-px bg-gradient-to-r from-gray-200 to-transparent" />
        <Link
          href="/dashboard/service/antrian"
          className="text-[10px] sm:text-xs font-semibold text-gray-400 hover:text-gray-600 transition flex items-center gap-1 group"
        >
          Lihat Antrian
          <svg className="w-2.5 h-2.5 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
        {loading ? (
          Array(6).fill(0).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm space-y-2">
              <Shimmer className="w-16 h-2.5" />
              <Shimmer className="w-10 h-6" />
            </div>
          ))
        ) : (
          <>
            {[
              {
                label: "Antrian",
                value: data?.antrian ?? 0,
                color: "text-yellow-700 bg-yellow-50 border-yellow-200",
                dot: "bg-yellow-400",
                href: "/dashboard/service/antrian",
              },
              {
                label: "Dikerjakan",
                value: data?.sedangDikerjakan ?? 0,
                color: "text-blue-700 bg-blue-50 border-blue-200",
                dot: "bg-blue-400",
                href: "/dashboard/service/antrian",
              },
              {
                label: "Tunggu Part",
                value: data?.menungguSparepart ?? 0,
                color: "text-orange-700 bg-orange-50 border-orange-200",
                dot: "bg-orange-400",
                href: "/dashboard/service/antrian",
              },
              {
                label: "Siap Diambil",
                value: data?.done ?? 0,
                color: "text-emerald-700 bg-emerald-50 border-emerald-200",
                dot: "bg-emerald-400",
                href: "/dashboard/service/done",
              },
              {
                label: "Gagal",
                value: data?.gagal ?? 0,
                color: "text-rose-700 bg-rose-50 border-rose-200",
                dot: "bg-rose-400",
                href: "/dashboard/service/done",
              },
              {
                label: "Selesai Hari Ini",
                value: data?.sudahDiambilHariIni ?? 0,
                color: "text-gray-700 bg-gray-50 border-gray-200",
                dot: "bg-gray-400",
                href: "/dashboard/service/history",
              },
            ].map((s) => (
              <Link
                key={s.label}
                href={s.href}
                className={`group relative rounded-xl border px-3 py-3 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 ${s.color}`}
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
                  <p className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wide opacity-70">
                    {s.label}
                  </p>
                </div>
                <p className="text-xl sm:text-2xl font-black">{s.value}</p>
                {/* Hover arrow */}
                <svg
                  className="absolute bottom-2.5 right-2.5 w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity"
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </Link>
            ))}
          </>
        )}
      </div>

      {/* Pendapatan servis hari ini (finansial only) + tabel ringkas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

        {/* Antrian terlama */}
        <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
            <h3 className="text-xs font-bold text-gray-700 flex items-center gap-2">
              <span className="text-sm">⏳</span>
              Antrian Terlama
            </h3>
            {totalAktif > 0 && (
              <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {totalAktif} aktif
              </span>
            )}
          </div>
          <div className="divide-y divide-gray-50">
            {loading ? (
              [1, 2, 3].map(i => (
                <div key={i} className="px-4 py-3 flex items-center gap-3">
                  <Shimmer className="w-6 h-6 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <Shimmer className="w-28 h-2.5" />
                    <Shimmer className="w-20 h-2" />
                  </div>
                  <Shimmer className="w-12 h-4 rounded-full" />
                </div>
              ))
            ) : data?.terlamaAntrian?.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-2xl mb-1">✅</p>
                <p className="text-xs text-gray-400">Tidak ada antrian</p>
              </div>
            ) : (
              data?.terlamaAntrian?.map(o => (
                <div key={o.no_urut} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition">
                  <div className="w-7 h-7 rounded-lg bg-yellow-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-yellow-700">#{o.no_urut}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">{o.nama}</p>
                    <p className="text-[10px] text-gray-400 truncate">{o.type_laptop}</p>
                  </div>
                  <span className="text-[10px] font-mono font-semibold text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap">
                    {getDuration(o.tanggal_masuk)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Sedang dikerjakan + pendapatan */}
        <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
            <h3 className="text-xs font-bold text-gray-700 flex items-center gap-2">
              <span className="text-sm">🔧</span>
              Sedang Dikerjakan
            </h3>
            {/* Pendapatan servis hari ini — hanya untuk yang boleh lihat finansial */}
            {canSeeFinancials && !loading && (data?.pendapatanHariIni ?? 0) > 0 && (
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                {fmtRupiah(data?.pendapatanHariIni ?? 0)} hari ini
              </span>
            )}
          </div>
          <div className="divide-y divide-gray-50">
            {loading ? (
              [1, 2, 3].map(i => (
                <div key={i} className="px-4 py-3 flex items-center gap-3">
                  <Shimmer className="w-6 h-6 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <Shimmer className="w-28 h-2.5" />
                    <Shimmer className="w-20 h-2" />
                  </div>
                  <Shimmer className="w-16 h-4 rounded-full" />
                </div>
              ))
            ) : data?.sedangDetail?.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-2xl mb-1">💤</p>
                <p className="text-xs text-gray-400">Tidak ada yang dikerjakan</p>
              </div>
            ) : (
              data?.sedangDetail?.map(o => (
                <div key={o.no_urut} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition">
                  <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-blue-700">#{o.no_urut}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">{o.nama}</p>
                    <p className="text-[10px] text-gray-400 truncate">
                      {o.type_laptop}
                      {o.dikerjakan_by_user?.name && (
                        <span className="ml-1 text-blue-500">· {o.dikerjakan_by_user.name}</span>
                      )}
                    </p>
                  </div>
                  <span className="text-[10px] font-mono font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap">
                    {getDuration(o.tanggal_masuk)}
                  </span>
                </div>
              ))
            )}
          </div>
          {/* Footer link */}
          <div className="px-4 py-2.5 border-t border-gray-50 flex justify-end">
            <Link
              href="/dashboard/service/antrian"
              className="text-[10px] text-gray-400 hover:text-gray-600 font-semibold flex items-center gap-1 transition group"
            >
              Kelola antrian
              <svg className="w-2.5 h-2.5 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}