"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/services/supabase";
import { deriveLiveStatus, type LiveOrder } from "@/lib/trackingStatus";
import TrackingStatusBadge from "@/components/preparation/TrackingStatusBadge";
import {
  Inbox,
  User,
  PackageCheck,
  Truck,
  AlertTriangle,
  Trophy,
  MapPin,
  Phone,
  Clock,
  ChevronRight,
  Activity,
  RefreshCw,
  Search,
  X,
  Medal,
  Zap,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────
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

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "baru saja";
  if (m < 60) return `${m}m lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}j lalu`;
  return `${Math.floor(h / 24)}h lalu`;
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [now, setNow] = useState(() => Date.now());

  // Tick tiap 5 detik — supaya label "X menit lalu" ikut update
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(iv);
  }, []);

  const fetchAll = useCallback(async (silent = false) => {
    try {
      if (!silent) setIsRefreshing(true);
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
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Realtime: refresh setiap ada perubahan pada preparation_orders (silent)
  useEffect(() => {
    const ch = supabase
      .channel("monitoring-ceo-pengantaran")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "preparation_orders" },
        () => fetchAll(true)
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

  const totalUnitSiap = useMemo(
    () => siapKirim.reduce((s, o) => s + o.preparation_items.length, 0),
    [siapKirim]
  );

  return (
    <DashboardLayout>
      <main className="min-h-screen bg-gradient-to-b from-[#F7F7F8] to-white p-3 sm:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
          {/* ─── HERO HEADER ─── */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-teal-900 p-5 sm:p-7 shadow-xl shadow-teal-900/20">
            {/* Decorative blobs */}
            <div className="absolute -top-16 -right-16 w-48 h-48 bg-teal-500/20 rounded-full blur-3xl" />
            <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-violet-500/10 rounded-full blur-3xl" />

            <div className="relative flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg">
                  <Truck className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-white tracking-tight leading-none">
                      Monitoring Pengantaran
                    </h1>
                    <span className="inline-flex items-center gap-1.5 text-[9px] sm:text-[10px] font-bold text-emerald-300 bg-emerald-500/20 backdrop-blur-sm border border-emerald-400/30 px-2 py-0.5 rounded-full flex-shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      LIVE
                    </span>
                  </div>
                  <p className="text-[11px] sm:text-sm text-white/60 font-medium leading-snug">
                    Ringkasan operasional pengantaran seluruh tim — realtime
                  </p>
                </div>
              </div>

              <button
                onClick={() => fetchAll()}
                disabled={isRefreshing}
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 text-white flex items-center justify-center transition disabled:opacity-50 flex-shrink-0"
                title="Refresh manual"
              >
                <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 ${isRefreshing ? "animate-spin" : ""}`} />
              </button>
            </div>

            {/* Mini insight strip */}
            <div className="relative mt-5 sm:mt-6 flex items-center gap-4 sm:gap-6 text-white/80 text-[11px] sm:text-xs font-medium">
              <div className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-emerald-300" />
                <span>{aktif.length} aktif</span>
              </div>
              <div className="h-3 w-px bg-white/20" />
              <div className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-300" />
                <span>{siapKirim.length} antrian</span>
              </div>
              <div className="h-3 w-px bg-white/20" />
              <div className="flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-yellow-300" />
                <span>{selesaiHariIni} selesai hari ini</span>
              </div>
            </div>
          </div>

          {/* ─── STAT CARDS ─── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            <StatCard
              label="Siap Dikirim"
              value={isLoading ? "…" : siapKirim.length.toString()}
              subtitle={totalUnitSiap > 0 ? `${totalUnitSiap} unit` : "Kosong"}
              icon={<PackageCheck className="w-5 h-5" />}
              tone="orange"
            />
            <StatCard
              label="Sedang Diantar"
              value={isLoading ? "…" : aktif.length.toString()}
              subtitle="Jalan sekarang"
              icon={<Truck className="w-5 h-5" />}
              tone="violet"
            />
            <StatCard
              label="Bermasalah"
              value={isLoading ? "…" : problemCount.toString()}
              subtitle={problemCount > 0 ? "Perlu cek" : "Semua lancar"}
              icon={<AlertTriangle className="w-5 h-5" />}
              tone={problemCount > 0 ? "red" : "emerald"}
              pulse={problemCount > 0}
            />
            <StatCard
              label="Selesai Hari Ini"
              value={isLoading ? "…" : selesaiHariIni.toString()}
              subtitle="Total pengantaran"
              icon={<Trophy className="w-5 h-5" />}
              tone="teal"
            />
          </div>

          {/* ─── PROBLEM BANNER ─── */}
          {problemCount > 0 && (
            <div className="relative overflow-hidden bg-gradient-to-r from-red-500 to-red-600 rounded-2xl px-4 sm:px-5 py-4 flex items-center gap-3 sm:gap-4 shadow-lg shadow-red-500/25">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_50%)]" />
              <div className="relative w-10 h-10 sm:w-11 sm:h-11 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center flex-shrink-0 border border-white/30">
                <AlertTriangle className="w-5 h-5 text-white animate-pulse" />
              </div>
              <div className="relative flex-1 min-w-0">
                <p className="text-sm sm:text-base font-black text-white leading-tight">
                  {problemCount} pengantaran kehilangan sinyal GPS
                </p>
                <p className="text-[11px] sm:text-xs text-white/80 mt-0.5">
                  Kemungkinan app pengantar ditutup atau GPS dimatikan
                </p>
              </div>
              <Link
                href="/dashboard/preparation/sedang-diantar"
                className="relative hidden sm:inline-flex items-center gap-1 text-xs font-bold text-white bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/30 px-3 py-1.5 rounded-lg transition flex-shrink-0"
              >
                Cek <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          )}

          {/* ─── SEARCH ─── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-4 sticky top-2 z-20 backdrop-blur-sm bg-white/95">
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <Search className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
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
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* ─── SECTION: PENGANTARAN AKTIF ─── */}
          <section className="space-y-3">
            <SectionHeader
              title="Pengantaran Aktif"
              count={filteredAktif.length}
              href="/dashboard/preparation/sedang-diantar"
              accentColor="violet"
              icon={<Truck className="w-3.5 h-3.5" />}
            />
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
                {filteredAktif.map((o) => (
                  <ActiveCard key={o.id} order={o} now={now} />
                ))}
              </div>
            )}
          </section>

          {/* ─── SECTION: ANTRIAN SIAP KIRIM ─── */}
          <section className="space-y-3">
            <SectionHeader
              title="Antrian Siap Kirim"
              count={filteredSiap.length}
              href="/dashboard/preparation/siap-kirim"
              accentColor="orange"
              icon={<PackageCheck className="w-3.5 h-3.5" />}
            />
            {isLoading ? (
              <SkeletonGrid count={1} />
            ) : filteredSiap.length === 0 ? (
              <EmptyState
                text={
                  search
                    ? "Tidak ada yang cocok dengan pencarian"
                    : "Tidak ada barang menunggu dikirim"
                }
              />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-gray-200/60 bg-white shadow-sm">
                <div className="divide-y divide-gray-50">
                  {filteredSiap.slice(0, 8).map((o) => (
                    <div
                      key={o.id}
                      className="px-4 py-3 flex items-center gap-3 hover:bg-orange-50/40 transition"
                    >
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-orange-500 text-white flex items-center justify-center font-black text-xs shrink-0 shadow-sm shadow-orange-500/30">
                        {getInitials(o.customer_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-gray-900 text-sm truncate">
                          {o.customer_name}
                        </div>
                        <div className="text-[11px] text-gray-500 truncate flex items-center gap-2">
                          <span className="font-mono font-semibold">{o.order_number}</span>
                          <span className="text-gray-300">·</span>
                          <span>{o.preparation_items.length} unit</span>
                          <span className="text-gray-300">·</span>
                          <span className="flex items-center gap-0.5">
                            <Clock className="w-3 h-3" />
                            {timeAgo(o.created_at)}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 border border-orange-200 shrink-0 uppercase tracking-wider">
                        Menunggu
                      </span>
                    </div>
                  ))}
                  {filteredSiap.length > 8 && (
                    <Link
                      href="/dashboard/preparation/siap-kirim"
                      className="px-4 py-3 flex items-center justify-center gap-1 text-xs font-bold text-orange-600 hover:bg-orange-50 transition"
                    >
                      Lihat {filteredSiap.length - 8} lainnya
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* ─── SECTION: PERINGKAT KURIR ─── */}
          <section className="space-y-3">
            <SectionHeader
              title="Peringkat Kurir Hari Ini"
              count={topCouriers.length}
              href="/dashboard/preparation/statistik"
              accentColor="teal"
              icon={<Trophy className="w-3.5 h-3.5" />}
            />
            {isLoading ? (
              <SkeletonGrid count={1} />
            ) : topCouriers.length === 0 ? (
              <EmptyState text="Belum ada pengantaran selesai hari ini" />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-gray-200/60 bg-white shadow-sm">
                <div className="divide-y divide-gray-50">
                  {topCouriers.map((c, idx) => (
                    <CourierRow key={c.id} courier={c} idx={idx} />
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
const TONE: Record<
  string,
  { bg: string; text: string; ring: string; gradient: string }
> = {
  teal: {
    bg: "bg-teal-50",
    text: "text-teal-600",
    ring: "ring-teal-500/20",
    gradient: "from-teal-500 to-teal-600",
  },
  orange: {
    bg: "bg-orange-50",
    text: "text-orange-600",
    ring: "ring-orange-500/20",
    gradient: "from-orange-500 to-orange-600",
  },
  violet: {
    bg: "bg-violet-50",
    text: "text-violet-600",
    ring: "ring-violet-500/20",
    gradient: "from-violet-500 to-violet-600",
  },
  red: {
    bg: "bg-red-50",
    text: "text-red-600",
    ring: "ring-red-500/20",
    gradient: "from-red-500 to-red-600",
  },
  emerald: {
    bg: "bg-emerald-50",
    text: "text-emerald-600",
    ring: "ring-emerald-500/20",
    gradient: "from-emerald-500 to-emerald-600",
  },
};

function StatCard({
  label,
  value,
  subtitle,
  icon,
  tone,
  pulse = false,
}: {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  tone: keyof typeof TONE;
  pulse?: boolean;
}) {
  const t = TONE[tone];
  return (
    <div
      className={`relative bg-white rounded-2xl border border-gray-200/60 shadow-sm p-3 sm:p-4 overflow-hidden transition hover:shadow-md hover:-translate-y-0.5 ${
        pulse ? `ring-2 ${t.ring}` : ""
      }`}
    >
      {/* Corner accent */}
      <div
        className={`absolute top-0 right-0 w-16 h-16 bg-gradient-to-br ${t.gradient} opacity-[0.07] rounded-full blur-2xl`}
      />

      <div className="relative flex items-start justify-between gap-2 mb-2">
        <span
          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br ${t.gradient} text-white flex items-center justify-center shrink-0 shadow-sm`}
        >
          {icon}
        </span>
        {pulse && (
          <span className="flex h-2 w-2 relative mt-1">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${t.bg} opacity-75`} />
            <span className={`relative inline-flex rounded-full h-2 w-2 ${t.gradient.replace("from-", "bg-").split(" ")[0]}`} />
          </span>
        )}
      </div>

      <div className="relative">
        <div className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-gray-500 mb-0.5">
          {label}
        </div>
        <div className={`text-2xl sm:text-3xl font-black tabular-nums ${t.text} leading-none`}>
          {value}
        </div>
        {subtitle && (
          <div className="text-[10px] sm:text-[11px] text-gray-400 mt-1 truncate font-medium">
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  count,
  href,
  accentColor,
  icon,
}: {
  title: string;
  count: number;
  href: string;
  accentColor: "violet" | "orange" | "teal";
  icon: React.ReactNode;
}) {
  const colors = {
    violet: "text-violet-600 hover:text-violet-700 bg-violet-50 border-violet-200",
    orange: "text-orange-600 hover:text-orange-700 bg-orange-50 border-orange-200",
    teal: "text-teal-600 hover:text-teal-700 bg-teal-50 border-teal-200",
  };
  const iconColors = {
    violet: "text-violet-600 bg-violet-100",
    orange: "text-orange-600 bg-orange-100",
    teal: "text-teal-600 bg-teal-100",
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${iconColors[accentColor]}`}
        >
          {icon}
        </span>
        <h2 className="text-sm sm:text-base font-black text-gray-900 truncate">
          {title}
        </h2>
        <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-600 tabular-nums">
          {count}
        </span>
      </div>
      <Link
        href={href}
        className={`inline-flex items-center gap-1 text-[11px] sm:text-xs font-bold px-2.5 py-1 rounded-lg border transition ${colors[accentColor]} flex-shrink-0`}
      >
        Detail
        <ChevronRight className="w-3 h-3" />
      </Link>
    </div>
  );
}

function ActiveCard({
  order,
  now,
}: {
  order: MonitoringOrder;
  now: number;
}) {
  const live = deriveLiveStatus(order, now);
  const isBad = live.tone === "bad";

  return (
    <Link
      href={`/dashboard/preparation/${order.id}`}
      className={`group block bg-white rounded-2xl border shadow-sm p-4 sm:p-5 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 ${
        isBad
          ? "border-red-300 ring-2 ring-red-200/60"
          : "border-gray-100 hover:border-violet-200"
      }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
            <span className="font-mono text-[11px] font-black text-gray-700 bg-gray-100 px-2 py-0.5 rounded-lg">
              {order.order_number}
            </span>
            <span className="inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full bg-violet-500 text-white">
              <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
              DIANTAR
            </span>
            {isBad && (
              <span className="inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full bg-red-500 text-white animate-pulse">
                <AlertTriangle className="w-2.5 h-2.5" />
                MASALAH
              </span>
            )}
          </div>
          <p className="text-base sm:text-lg font-black text-gray-900 leading-tight truncate">
            {order.customer_name}
          </p>
        </div>
        <div className="flex-shrink-0">
          <TrackingStatusBadge order={order} />
        </div>
      </div>

      {/* Info rows */}
      <div className="space-y-1.5 mb-3">
        <div className="flex items-center gap-2 text-[11px] sm:text-xs text-gray-600">
          <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <span className="truncate">
            <span className="font-semibold text-gray-800">
              {order.delivery_user_name || "—"}
            </span>
          </span>
        </div>
        {order.delivery_address && (
          <div className="flex items-start gap-2 text-[11px] sm:text-xs text-gray-600">
            <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
            <span className="truncate">{order.delivery_address}</span>
          </div>
        )}
        {order.customer_phone && (
          <div className="flex items-center gap-2 text-[11px] sm:text-xs text-gray-600">
            <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span className="truncate">{order.customer_phone}</span>
          </div>
        )}
      </div>

      {/* Live status footer */}
      <div
        className={`rounded-xl px-3 py-2 text-[11px] font-bold border flex items-center gap-2 ${
          isBad
            ? "bg-red-50 border-red-200 text-red-700"
            : "bg-gray-50 border-gray-100 text-gray-700"
        }`}
      >
        <Activity
          className={`w-3.5 h-3.5 flex-shrink-0 ${
            isBad ? "text-red-500 animate-pulse" : "text-emerald-500"
          }`}
        />
        <span className="flex-1 truncate">{live.label}</span>
        <ChevronRight className="w-3.5 h-3.5 text-gray-400 group-hover:translate-x-0.5 transition-transform" />
      </div>
    </Link>
  );
}

function CourierRow({ courier, idx }: { courier: CourierStat; idx: number }) {
  const isTopThree = idx < 3;
  const medalColors = [
    "from-amber-400 to-yellow-500 shadow-amber-500/30", // gold
    "from-slate-300 to-slate-400 shadow-slate-400/30",  // silver
    "from-orange-400 to-amber-600 shadow-orange-500/30", // bronze
  ];

  return (
    <div className="px-4 py-3 flex items-center gap-3 hover:bg-teal-50/40 transition">
      {/* Rank badge */}
      {isTopThree ? (
        <div
          className={`w-8 h-8 rounded-xl bg-gradient-to-br ${medalColors[idx]} text-white flex items-center justify-center shrink-0 shadow-md`}
        >
          <Medal className="w-4 h-4" />
        </div>
      ) : (
        <div className="w-8 h-8 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center font-black text-xs shrink-0">
          {idx + 1}
        </div>
      )}

      {/* Avatar */}
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 text-white flex items-center justify-center font-black text-xs shrink-0 shadow-sm shadow-teal-500/30">
        {getInitials(courier.name)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="font-bold text-gray-900 text-sm truncate">
          {courier.name}
        </div>
        <div className="text-[11px] text-gray-500 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-0.5">
            <Truck className="w-3 h-3" />
            {courier.total} pengantaran
          </span>
          <span className="text-gray-300">·</span>
          <span className="inline-flex items-center gap-0.5">
            <Clock className="w-3 h-3" />
            avg {formatDuration(courier.avgMs)}
          </span>
        </div>
      </div>

      {/* Total number */}
      <div className="text-right shrink-0">
        <div className="text-lg font-black text-teal-600 tabular-nums leading-none">
          {courier.total}
        </div>
        <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">
          orders
        </div>
      </div>
    </div>
  );
}

function SkeletonGrid({ count = 2 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-32 bg-gradient-to-br from-gray-50 to-white animate-pulse rounded-2xl border border-gray-100"
        />
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 py-10 sm:py-12 text-center shadow-sm px-4">
      <div className="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
        <Inbox className="w-7 h-7 text-gray-300" />
      </div>
      <p className="text-gray-500 text-sm font-semibold">{text}</p>
    </div>
  );
}