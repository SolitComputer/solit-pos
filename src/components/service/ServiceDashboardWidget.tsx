// src/components/dashboard/ServiceDashboardWidget.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Medal, Trophy, Wrench, Moon, CheckCircle2, Hourglass } from "lucide-react";

interface TeknisiRank {
  id: string;
  name: string;
  count: number;
}

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
  topTeknisiAllTime: TeknisiRank[];
  topTeknisiHariIni: TeknisiRank[];
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

const MEDAL_COLORS = ["text-white", "text-gray-600", "text-gray-700"];

const STAT_CARDS = [
  { key: "antrian" as const, label: "Antrian", color: "text-gray-600 bg-gray-50 border-gray-200", dot: "bg-gray-400", href: "/dashboard/service/antrian" },
  { key: "sedangDikerjakan" as const, label: "Dikerjakan", color: "text-gray-700 bg-gray-100 border-gray-300", dot: "bg-gray-500", href: "/dashboard/service/antrian" },
  { key: "menungguSparepart" as const, label: "Tunggu Part", color: "text-gray-800 bg-gray-100 border-gray-400", dot: "bg-gray-600", href: "/dashboard/service/antrian" },
  { key: "done" as const, label: "Siap Diambil", color: "text-gray-900 bg-white border-gray-300", dot: "bg-gray-900", href: "/dashboard/service/done" },
  { key: "gagal" as const, label: "Gagal", color: "text-white bg-gray-900 border-gray-900", dot: "bg-white", href: "/dashboard/service/done" },
  { key: "sudahDiambilHariIni" as const, label: "Selesai Hari Ini", color: "text-gray-700 bg-gray-50 border-gray-200", dot: "bg-gray-400", href: "/dashboard/service/history" },
];

export default function ServiceDashboardWidget({ canSeeFinancials }: { canSeeFinancials: boolean }) {
  const [data, setData] = useState<ServiceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [rankTab, setRankTab] = useState<"today" | "alltime">("today");

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
    const interval = setInterval(fetchStats, 30_000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  const totalAktif =
    (data?.antrian ?? 0) +
    (data?.sedangDikerjakan ?? 0) +
    (data?.menungguSparepart ?? 0);

  const rankList: TeknisiRank[] =
    rankTab === "today"
      ? (data?.topTeknisiHariIni ?? [])
      : (data?.topTeknisiAllTime ?? []);
  const maxCount = rankList[0]?.count || 1;

  return (
    <div className="space-y-4">

      {/* Section label */}
      <div className="flex items-center gap-2">
        <span className="inline-block w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-gray-900 animate-pulse ring-2 ring-gray-300 flex-shrink-0" />
        <span className="text-[10px] sm:text-[11px] font-bold text-gray-400 uppercase tracking-wider">
          Dashboard Servis
        </span>
        <div className="flex-1 h-px bg-gradient-to-r from-gray-200 to-transparent" />
        <Link
          href="/dashboard/service/antrian"
          className="text-[10px] sm:text-xs font-semibold text-gray-400 hover:text-gray-600 transition flex items-center gap-1 group"
        >
          Kelola Antrian
          <svg className="w-2.5 h-2.5 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </Link>
      </div>

      {/* 6 stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
        {loading
          ? Array(6).fill(0).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm space-y-2">
              <Shimmer className="w-16 h-2.5" />
              <Shimmer className="w-10 h-7" />
            </div>
          ))
          : STAT_CARDS.map((s) => (
            <Link
              key={s.key}
              href={s.href}
              className={`group relative rounded-xl border px-3 py-3 shadow-sm hover:shadow-lg hover:shadow-gray-300/40 transition-all duration-300 ease-out hover:-translate-y-1 ${s.color}`}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-transform duration-300 group-hover:scale-150 ${s.dot}`} />
                <p className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wide opacity-70 leading-tight">
                  {s.label}
                </p>
              </div>
              <p className="text-xl sm:text-2xl font-black transition-transform duration-300 group-hover:scale-105 origin-left">
                {data ? data[s.key] : 0}
              </p>
              <svg
                className="absolute bottom-2.5 right-2.5 w-3 h-3 opacity-0 group-hover:opacity-40 transition-opacity"
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Link>
          ))}
      </div>

      {/* Bottom 3 cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

        {/* Antrian Terlama */}
        <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:shadow-gray-200/60 hover:border-gray-200 transition-all duration-300 ease-out overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
            <h3 className="text-xs font-bold text-gray-700 flex items-center gap-2">
              <Hourglass className="w-3.5 h-3.5 text-gray-600" /> Antrian Terlama
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
                  <Shimmer className="w-7 h-7 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <Shimmer className="w-28 h-2.5" />
                    <Shimmer className="w-20 h-2" />
                  </div>
                  <Shimmer className="w-12 h-5 rounded-full" />
                </div>
              ))
            ) : !data?.terlamaAntrian?.length ? (
              <div className="py-8 text-center">
                <CheckCircle2 className="w-8 h-8 mx-auto text-gray-300 mb-1" />
                <p className="text-xs text-gray-400 font-medium">Tidak ada antrian</p>
              </div>
            ) : (
              data.terlamaAntrian.map(o => (
                <div key={o.no_urut} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 hover:translate-x-0.5 transition-all duration-200 ease-out">                  <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-gray-700">#{o.no_urut}</span>
                </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">{o.nama}</p>
                    <p className="text-[10px] text-gray-400 truncate">{o.type_laptop}</p>
                  </div>
                  <span className="text-[10px] font-mono font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap">
                    {getDuration(o.tanggal_masuk)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Sedang Dikerjakan */}
        <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:shadow-gray-200/60 hover:border-gray-200 transition-all duration-300 ease-out overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
            <h3 className="text-xs font-bold text-gray-700 flex items-center gap-2">
              <Wrench className="w-3.5 h-3.5 text-gray-600" /> Sedang Dikerjakan
            </h3>
            {canSeeFinancials && !loading && (data?.pendapatanHariIni ?? 0) > 0 && (
              <span className="text-[10px] font-semibold text-gray-900 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">
                {fmtRupiah(data!.pendapatanHariIni)} hari ini
              </span>
            )}
          </div>
          <div className="divide-y divide-gray-50">
            {loading ? (
              [1, 2, 3].map(i => (
                <div key={i} className="px-4 py-3 flex items-center gap-3">
                  <Shimmer className="w-7 h-7 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <Shimmer className="w-28 h-2.5" />
                    <Shimmer className="w-20 h-2" />
                  </div>
                  <Shimmer className="w-14 h-5 rounded-full" />
                </div>
              ))
            ) : !data?.sedangDetail?.length ? (
              <div className="py-8 text-center">
                <Moon className="w-8 h-8 mx-auto text-gray-300 mb-1" />
                <p className="text-xs text-gray-400 font-medium">Tidak ada yang dikerjakan</p>
              </div>
            ) : (
              data.sedangDetail.map(o => (
                <div key={o.no_urut} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 hover:translate-x-0.5 transition-all duration-200 ease-out">                  <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-gray-700">#{o.no_urut}</span>
                </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">{o.nama}</p>
                    <p className="text-[10px] text-gray-400 truncate">
                      {o.type_laptop}
                      {o.dikerjakan_by_user?.name && (
                        <span className="ml-1 text-gray-400">· {o.dikerjakan_by_user.name}</span>
                      )}
                    </p>
                  </div>
                  <span className="text-[10px] font-mono font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap">
                    {getDuration(o.tanggal_masuk)}
                  </span>
                </div>
              ))
            )}
          </div>
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

        {/*  Ranking Teknisi */}
        <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:shadow-gray-200/60 hover:border-gray-200 transition-all duration-300 ease-out overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
            <h3 className="text-xs font-bold text-gray-700 flex items-center gap-2">
              <Trophy className="w-3.5 h-3.5 text-gray-700" /> Ranking Teknisi
            </h3>
            <div className="flex items-center gap-0.5 p-0.5 bg-gray-100 rounded-lg">
              <button
                onClick={() => setRankTab("today")}
                className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all duration-200 ease-out ${rankTab === "today"
                    ? "bg-white text-gray-800 shadow-sm scale-105"
                    : "text-gray-400 hover:text-gray-600"
                  }`}
              >
                Hari Ini
              </button>
              <button
                onClick={() => setRankTab("alltime")}
                className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all duration-200 ease-out ${rankTab === "alltime"
                    ? "bg-white text-gray-800 shadow-sm scale-105"
                    : "text-gray-400 hover:text-gray-600"
                  }`}
              >
                All Time
              </button>
            </div>
          </div>

          <div className="px-4 py-3 space-y-3">
            {loading ? (
              [1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-3">
                  <Shimmer className="w-7 h-7 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Shimmer className="w-24 h-2.5" />
                    <Shimmer className="w-full h-1.5 rounded-full" />
                  </div>
                  <Shimmer className="w-8 h-5 rounded-full" />
                </div>
              ))
            ) : rankList.length === 0 ? (
              <div className="py-6 text-center">
                <Wrench className="w-8 h-8 mx-auto text-gray-300 mb-1" />
                <p className="text-xs text-gray-400 font-medium">
                  {rankTab === "today" ? "Belum ada yang selesai hari ini" : "Belum ada data"}
                </p>
              </div>
            ) : (
              rankList.map((t, i) => {
                const pct = Math.round((t.count / maxCount) * 100);
                const badgeColor =
                  i === 0 ? "bg-gray-900 text-white" :
                    i === 1 ? "bg-gray-100 text-gray-600" :
                      i === 2 ? "bg-gray-200 text-gray-700" :
                        "bg-gray-50 text-gray-400";
                const barColor =
                  i === 0 ? "from-gray-800 to-gray-900" :
                    i === 1 ? "from-gray-500 to-gray-600" :
                      i === 2 ? "from-gray-300 to-gray-400" :
                        "from-gray-200 to-gray-300";

                return (
                  <div key={t.id} className="group/rank -mx-1 px-1 py-0.5 rounded-lg hover:bg-gray-50 transition-colors duration-200">
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 font-bold transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover/rank:scale-110 ${badgeColor}`}>
                        {i < 3
                          ? <Medal className={`w-4 h-4 ${MEDAL_COLORS[i]}`} />
                          : <span className="text-[10px]">{i + 1}</span>
                        }
                      </div>
                      <p className="flex-1 text-xs font-semibold text-gray-800 truncate">{t.name}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${badgeColor}`}>
                        {t.count}x
                      </span>
                    </div>
                    <div className="ml-9 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-700 ease-out`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="px-4 py-2.5 border-t border-gray-50 flex justify-end">
            <Link
              href="/dashboard/service/history"
              className="text-[10px] text-gray-400 hover:text-gray-600 font-semibold flex items-center gap-1 transition group"
            >
              Lihat riwayat
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