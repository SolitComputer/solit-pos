"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/services/supabase";
import { deriveLiveStatus, type LiveOrder } from "@/lib/trackingStatus";
import TrackingStatusBadge from "@/components/preparation/TrackingStatusBadge";
import { Inbox, User, PackageCheck, Truck, AlertTriangle, Trophy } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────
interface PrepItem {
  id: string;
  serial_number: string;
  laptop_name: string | null;
}

interface MonitoringOrder extends LiveOrder {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string | null;
  status: string;
  delivery_method: string | null;
  delivery_user_id: string | null;
  delivery_user_name: string | null;
  delivery_address: string | null;
  created_at: string;
  updated_at: string;
  preparation_items: PrepItem[];
}

interface CourierStat {
  id: string;
  name: string;
  total: number;
  avgMs: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return "—";
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}j ${m}m`;
  if (m > 0) return `${m}m ${s}d`;
  return `${s}d`;
}

function getInitials(name: string): string {
  if (!name) return "??";
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

// ─── Page ─────────────────────────────────────────────────────────────────
export default function MonitoringPengantaranPage() {
  const [siapKirim, setSiapKirim] = useState<MonitoringOrder[]>([]);
  const [aktif, setAktif] = useState<MonitoringOrder[]>([]);
  const [courierStats, setCourierStats] = useState<CourierStat[]>([]);
  const [selesaiHariIni, setSelesaiHariIni] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [now, setNow] = useState(() => Date.now());

  // Tick tiap 5 detik supaya label "X menit lalu" di kartu aktif ikut update
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(iv);
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      const [siapRes, allRes, statsRes] = await Promise.all([
        fetch("/api/preparation?status=SIAP_KIRIM", { cache: "no-store" }),
        fetch("/api/preparation", { cache: "no-store" }),
        fetch("/api/preparation/delivery-stats?range=1d", { cache: "no-store" }),
      ]);

      const siapJson = await siapRes.json();
      const allJson = await allRes.json();
      const statsJson = await statsRes.json();

      setSiapKirim(siapJson.data || []);

      const allOrders: MonitoringOrder[] = allJson.data || [];
      setAktif(
        allOrders.filter(
          (o) => o.status === "DIKIRIM" && o.delivery_method === "PENGANTARAN"
        )
      );

      const rows: CourierStat[] = statsJson.rows || [];
      setCourierStats(rows);
      setSelesaiHariIni(rows.reduce((acc, r) => acc + r.total, 0));
    } catch {
      setSiapKirim([]);
      setAktif([]);
      setCourierStats([]);
      setSelesaiHariIni(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Realtime: refresh setiap ada perubahan pada preparation_orders
  useEffect(() => {
    const ch = supabase
      .channel("monitoring-ceo-pengantaran")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "preparation_orders" },
        () => fetchAll()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [fetchAll]);

  const problemCount = useMemo(
    () => aktif.filter((o) => deriveLiveStatus(o, now).tone === "bad").length,
    [aktif, now]
  );

  const filteredAktif = useMemo(() => {
    if (!search.trim()) return aktif;
    const t = search.toLowerCase();
    return aktif.filter(
      (o) =>
        o.order_number.toLowerCase().includes(t) ||
        o.customer_name.toLowerCase().includes(t) ||
        (o.delivery_user_name || "").toLowerCase().includes(t) ||
        (o.delivery_address || "").toLowerCase().includes(t)
    );
  }, [aktif, search]);

  const filteredSiap = useMemo(() => {
    if (!search.trim()) return siapKirim;
    const t = search.toLowerCase();
    return siapKirim.filter(
      (o) =>
        o.order_number.toLowerCase().includes(t) ||
        o.customer_name.toLowerCase().includes(t)
    );
  }, [siapKirim, search]);

  const topCouriers = useMemo(() => courierStats.slice(0, 5), [courierStats]);

  return (
    <DashboardLayout>
      <main className="min-h-screen bg-gradient-to-b from-[#F7F7F8] to-white p-3 sm:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-teal-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg shadow-teal-500/30 flex-shrink-0">
              <Truck className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-2xl font-black text-gray-900 tracking-tight leading-none truncate">
                  Monitoring Pengantaran
                </h1>
                <span className="inline-flex items-center gap-1.5 text-[9px] sm:text-[10px] font-bold text-teal-600 bg-teal-50 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full border border-teal-200 flex-shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
                  LIVE
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5 sm:mt-1 font-medium truncate">
                Ringkasan operasional pengantaran seluruh tim — realtime
              </p>
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            <StatCard
              label="Siap Dikirim"
              value={isLoading ? "…" : siapKirim.length.toString()}
              icon={<PackageCheck className="w-4 h-4 sm:w-5 sm:h-5" />}
              tone="orange"
            />
            <StatCard
              label="Sedang Diantar"
              value={isLoading ? "…" : aktif.length.toString()}
              icon={<Truck className="w-4 h-4 sm:w-5 sm:h-5" />}
              tone="violet"
            />
            <StatCard
              label="Bermasalah"
              value={isLoading ? "…" : problemCount.toString()}
              icon={<AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5" />}
              tone={problemCount > 0 ? "red" : "emerald"}
            />
            <StatCard
              label="Selesai Hari Ini"
              value={isLoading ? "…" : selesaiHariIni.toString()}
              icon={<Trophy className="w-4 h-4 sm:w-5 sm:h-5" />}
              tone="teal"
            />
          </div>

          {/* Problem banner */}
          {problemCount > 0 && (
            <div className="bg-gradient-to-r from-red-50 to-red-100/70 border border-red-200 rounded-2xl px-4 sm:px-5 py-3.5 sm:py-4 flex items-center gap-3 sm:gap-4 shadow-sm">
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-red-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-red-500/25">
                <AlertTriangle className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-bold text-red-800">
                  {problemCount} pengantaran kehilangan sinyal / izin GPS mati
                </p>
                <p className="text-[10px] sm:text-xs text-red-600 mt-0.5">
                  Cek daftar &quot;Pengantaran Aktif&quot; di bawah untuk detail.
                </p>
              </div>
            </div>
          )}

          {/* Search */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-4 sticky top-2 z-20 backdrop-blur-sm bg-white/95">
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <svg
                  className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari customer, pengantar, no order, alamat..."
                className="w-full h-10 sm:h-11 border border-gray-200 rounded-xl pl-9 sm:pl-10 pr-9 sm:pr-4 text-xs sm:text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 focus:bg-white transition"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Pengantaran Aktif */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900">
                Pengantaran Aktif ({filteredAktif.length})
              </h2>
              <Link
                href="/dashboard/preparation/sedang-diantar"
                className="text-xs font-semibold text-violet-600 hover:text-violet-700"
              >
                Lihat detail →
              </Link>
            </div>
            {isLoading ? (
              <SkeletonGrid />
            ) : filteredAktif.length === 0 ? (
              <EmptyState
                text={
                  search
                    ? "Tidak ada yang cocok dengan pencarian"
                    : "Tidak ada pengantaran yang sedang berjalan"
                }
              />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {filteredAktif.map((o) => {
                  const live = deriveLiveStatus(o, now);
                  return (
                    <div
                      key={o.id}
                      className={`bg-white rounded-2xl border shadow-sm p-4 sm:p-5 ${
                        live.tone === "bad"
                          ? "border-red-300 ring-2 ring-red-200 ring-offset-2"
                          : "border-gray-100"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap mb-1">
                            <span className="font-mono text-[11px] font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-lg">
                              {o.order_number}
                            </span>
                            {live.tone === "bad" && (
                              <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-red-500 text-white animate-pulse">
                                MASALAH
                              </span>
                            )}
                          </div>
                          <p className="text-base font-black text-gray-900 leading-tight truncate">
                            {o.customer_name}
                          </p>
                          <p className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1 truncate">
                            <User className="w-3.5 h-3.5 inline" /> {o.delivery_user_name || "—"}
                          </p>
                        </div>
                        <TrackingStatusBadge order={o} />
                      </div>
                      <div
                        className={`rounded-xl px-3 py-2 text-[11px] font-semibold border ${
                          live.tone === "bad"
                            ? "bg-red-50 border-red-200 text-red-600"
                            : "bg-gray-50 border-gray-100 text-gray-600"
                        }`}
                      >
                        {live.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Antrian Siap Kirim */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900">
                Antrian Siap Kirim ({filteredSiap.length})
              </h2>
              <Link
                href="/dashboard/preparation/siap-kirim"
                className="text-xs font-semibold text-orange-600 hover:text-orange-700"
              >
                Lihat detail →
              </Link>
            </div>
            {isLoading ? (
              <SkeletonGrid />
            ) : filteredSiap.length === 0 ? (
              <EmptyState
                text={search ? "Tidak ada yang cocok dengan pencarian" : "Tidak ada barang menunggu dikirim"}
              />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-gray-200/60 bg-white shadow-sm">
                <div className="divide-y divide-gray-50">
                  {filteredSiap.map((o) => (
                    <div key={o.id} className="px-4 py-3 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center font-bold text-xs shrink-0">
                        {getInitials(o.customer_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-900 text-sm truncate">{o.customer_name}</div>
                        <div className="text-[11px] text-gray-500 truncate">
                          {o.order_number} · {o.preparation_items.length} unit
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-orange-50 text-orange-700 border-orange-200 shrink-0">
                        Menunggu
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Kurir Hari Ini */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900">Peringkat Kurir Hari Ini</h2>
              <Link
                href="/dashboard/preparation/statistik"
                className="text-xs font-semibold text-teal-600 hover:text-teal-700"
              >
                Statistik lengkap →
              </Link>
            </div>
            {isLoading ? (
              <SkeletonGrid count={1} />
            ) : topCouriers.length === 0 ? (
              <EmptyState text="Belum ada pengantaran selesai hari ini" />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-gray-200/60 bg-white shadow-sm">
                <div className="divide-y divide-gray-50">
                  {topCouriers.map((c, idx) => (
                    <div key={c.id} className="px-4 py-3 flex items-center gap-3">
                      <RankBadge idx={idx} />
                      <div className="w-9 h-9 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-bold text-xs shrink-0">
                        {getInitials(c.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-900 text-sm truncate">{c.name}</div>
                        <div className="text-[11px] text-gray-500">
                          {c.total} pengantaran · rata-rata {formatDuration(c.avgMs)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </DashboardLayout>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────
const TONE: Record<string, { bg: string; text: string }> = {
  teal: { bg: "bg-teal-50", text: "text-teal-600" },
  orange: { bg: "bg-orange-50", text: "text-orange-600" },
  violet: { bg: "bg-violet-50", text: "text-violet-600" },
  red: { bg: "bg-red-50", text: "text-red-600" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600" },
};

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: keyof typeof TONE;
}) {
  const t = TONE[tone];
  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <span className={`w-8 h-8 rounded-lg ${t.bg} ${t.text} flex items-center justify-center shrink-0`}>
            {icon}
          </span>
          <span className="text-[10px] sm:text-xs font-bold text-gray-500 uppercase tracking-wide truncate">
            {label}
          </span>
        </div>
        <span className={`text-2xl sm:text-3xl font-black tabular-nums ${t.text} flex-shrink-0`}>{value}</span>
      </div>
    </div>
  );
}

function RankBadge({ idx }: { idx: number }) {
  const styles = [
    "bg-amber-100 text-amber-700 border-amber-200",
    "bg-slate-100 text-slate-600 border-slate-200",
    "bg-orange-100 text-orange-600 border-orange-200",
  ];
  return (
    <span
      className={`w-6 h-6 shrink-0 rounded-lg flex items-center justify-center font-bold text-[11px] border ${
        idx < 3 ? styles[idx] : "bg-gray-50 text-gray-400 border-gray-100"
      }`}
    >
      {idx + 1}
    </span>
  );
}

function SkeletonGrid({ count = 2 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-24 bg-white/60 animate-pulse rounded-2xl border border-gray-100" />
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="bg-white rounded-3xl border border-gray-100 py-10 text-center shadow-sm px-4">
      <div className="flex justify-center mb-3 opacity-30">
        <Inbox className="w-10 h-10" />
      </div>
      <p className="text-gray-500 text-sm font-medium">{text}</p>
    </div>
  );
}