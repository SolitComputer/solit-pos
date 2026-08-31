"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/services/supabase";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────
interface DeliveryDetail {
  id: string;
  order_number: string | null;
  customer_name: string | null;
  status: string | null;
  dispatched_at: string | null;
  delivery_accepted_at: string | null;
  delivery_started_at: string | null;
  delivered_at: string | null;
  tempuhMs: number | null;
  selesaiMs: number | null;
}

interface CourierStat {
  id: string;
  name: string;
  total: number;
  tempuhTotalMs: number;
  tempuhAvgMs: number;
  selesaiTotalMs: number;
  selesaiAvgMs: number;
  avgMs: number;
  deliveries: DeliveryDetail[];
}

// ─── Periode ──────────────────────────────────────────────────────────────
const PERIODS = [
  { key: "1d", label: "1 Hari" },
  { key: "7d", label: "7 Hari" },
  { key: "1m", label: "1 Bulan" },
  { key: "3m", label: "3 Bulan" },
  { key: "1y", label: "1 Tahun" },
] as const;

type PeriodKey = (typeof PERIODS)[number]["key"];

// ─── Warna ──────────────────────────────────────────────────────────────────
const ACCENT = "#0d9488"; // teal-600

const STATUS_COLOR: Record<string, string> = {
  SELESAI: "#10b981",
  DIKIRIM: "#3b82f6",
  DIBATALKAN: "#ef4444",
  MENUNGGU_PENGANTAR: "#f59e0b",
};
const STATUS_FALLBACK = "#94a3b8";

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

function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const STATUS_STYLE: Record<string, string> = {
  SELESAI: "bg-emerald-50 text-emerald-700 border-emerald-200",
  DIKIRIM: "bg-blue-50 text-blue-700 border-blue-200",
  DIBATALKAN: "bg-red-50 text-red-700 border-red-200",
  MENUNGGU_PENGANTAR: "bg-amber-50 text-amber-700 border-amber-200",
};

function statusLabel(s?: string | null): string {
  if (!s) return "—";
  return s
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
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

function firstName(name: string): string {
  return (name || "—").split(" ")[0];
}

// Bucket rentang waktu untuk grafik tren
function makeBuckets(period: PeriodKey): { start: number; label: string }[] {
  const now = new Date();
  const starts: { start: number; label: string }[] = [];
  if (period === "1d") {
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now);
      d.setMinutes(0, 0, 0);
      d.setHours(now.getHours() - i);
      starts.push({
        start: d.getTime(),
        label: `${String(d.getHours()).padStart(2, "0")}:00`,
      });
    }
  } else if (period === "7d" || period === "1m") {
    const n = period === "7d" ? 7 : 30;
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(now.getDate() - i);
      starts.push({
        start: d.getTime(),
        label: d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" }),
      });
    }
  } else if (period === "3m") {
    for (let i = 12; i >= 0; i--) {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(now.getDate() - i * 7);
      starts.push({
        start: d.getTime(),
        label: d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" }),
      });
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      starts.push({
        start: d.getTime(),
        label: d.toLocaleDateString("id-ID", { month: "short" }),
      });
    }
  }
  return starts;
}

function bucketize(
  starts: { start: number; label: string }[],
  times: number[]
): { label: string; count: number }[] {
  const counts = new Array(starts.length).fill(0);
  for (const t of times) {
    let idx = -1;
    for (let i = 0; i < starts.length; i++) {
      if (starts[i].start <= t) idx = i;
      else break;
    }
    if (idx >= 0) counts[idx]++;
  }
  return starts.map((s, i) => ({ label: s.label, count: counts[i] }));
}

// ─── Page ─────────────────────────────────────────────────────────────────
export default function DeliveryStatistikPage() {
  const [period, setPeriod] = useState<PeriodKey>("7d");
  const [rows, setRows] = useState<CourierStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<CourierStat | null>(null);

  const fetchData = useCallback(async (p: PeriodKey) => {
    try {
      setError("");
      const res = await fetch(`/api/preparation/delivery-stats?range=${p}`);
      const json = await res.json();
      if (!res.ok || !json.success)
        throw new Error(json.message || "Gagal mengambil data");
      setRows(json.rows || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchData(period);
  }, [period, fetchData]);

  // Realtime: setiap perubahan order pengantaran → refresh
  useEffect(() => {
    const ch = supabase
      .channel("delivery-statistik-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "preparation_orders" },
        () => fetchData(period)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [period, fetchData]);

  // Jaga modal tetap sinkron dengan data terbaru
  useEffect(() => {
    if (!selected) return;
    const fresh = rows.find((r) => r.id === selected.id);
    if (fresh) setSelected(fresh);
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPengantaran = useMemo(
    () => rows.reduce((acc, r) => acc + r.total, 0),
    [rows]
  );

  const avgTempuh = useMemo(() => {
    const active = rows.filter((r) => r.tempuhAvgMs > 0);
    if (!active.length) return 0;
    return Math.round(
      active.reduce((a, r) => a + r.tempuhAvgMs, 0) / active.length
    );
  }, [rows]);

  const topCourier = rows[0];

  // ── Data grafik (dihitung dari respons yang sama) ──
  const workloadData = useMemo(
    () =>
      rows
        .slice(0, 8)
        .map((r) => ({ name: firstName(r.name), total: r.total })),
    [rows]
  );

  const trendData = useMemo(() => {
    const times: number[] = [];
    for (const r of rows)
      for (const d of r.deliveries)
        if (d.delivered_at) times.push(new Date(d.delivered_at).getTime());
    return bucketize(makeBuckets(period), times);
  }, [rows, period]);

  const statusData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows)
      for (const d of r.deliveries) {
        const s = d.status || "LAINNYA";
        counts.set(s, (counts.get(s) || 0) + 1);
      }
    return Array.from(counts.entries())
      .map(([status, value]) => ({
        status,
        label: statusLabel(status),
        value,
        color: STATUS_COLOR[status] || STATUS_FALLBACK,
      }))
      .sort((a, b) => b.value - a.value);
  }, [rows]);

  const hasData = !loading && rows.length > 0;

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-5 p-3 sm:p-6 pb-16">
        {/* Header */}
        <div className="flex flex-col gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM20 17a2 2 0 11-4 0 2 2 0 014 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10h2m8 0h3m0 0h2v-3.5a1 1 0 00-.293-.707l-2.5-2.5A1 1 0 0016.5 9H13" />
                </svg>
              </span>
              Statistik Pengantaran
            </h1>
            <p className="text-gray-500 text-xs mt-1">
              Peringkat kurir pengantaran (termasuk PKL aktif) berdasarkan waktu
              tempuh &amp; penyelesaian. Realtime.
            </p>
          </div>

          {/* Period filter */}
          <div className="grid grid-cols-5 sm:flex bg-white rounded-lg shadow-sm border border-gray-200/60 p-0.5 w-full sm:w-auto">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium rounded-md transition-all whitespace-nowrap ${
                  period === p.key
                    ? "bg-teal-600 text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 text-red-600 rounded-lg border border-red-100 text-sm">
            {error}
          </div>
        )}

        {/* Ringkasan */}
        {hasData && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              label="Total Pengantaran Selesai"
              value={totalPengantaran.toString()}
              tone="teal"
              icon={
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              }
            />
            <StatCard
              label="Kurir Aktif"
              value={rows.length.toString()}
              tone="sky"
              icon={
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4z" />
              }
            />
            <StatCard
              label="Rata-rata Waktu Tempuh"
              value={formatDuration(avgTempuh)}
              tone="amber"
              icon={
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              }
            />
            <StatCard
              label="Kurir Terbaik"
              value={topCourier ? firstName(topCourier.name) : "—"}
              sub={topCourier ? `${topCourier.total} pengantaran` : ""}
              tone="violet"
              icon={
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" />
              }
            />
          </div>
        )}

        {/* Grafik */}
        {loading ? (
          <div className="grid lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2 h-72 bg-white/60 animate-pulse rounded-2xl border border-gray-100" />
            <div className="h-72 bg-white/60 animate-pulse rounded-2xl border border-gray-100" />
          </div>
        ) : rows.length === 0 ? null : (
          <div className="grid lg:grid-cols-3 gap-3">
            {/* Beban kerja */}
            <ChartCard
              title="Beban Kerja Kurir"
              subtitle="Total pengantaran per kurir"
              className="lg:col-span-2"
            >
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={workloadData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} interval={0} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={32} />
                  <Tooltip cursor={{ fill: "#f0fdfa" }} content={<CountTooltip unit="pengantaran" />} />
                  <Bar dataKey="total" radius={[6, 6, 0, 0]} maxBarSize={46}>
                    {workloadData.map((_, i) => (
                      <Cell key={i} fill={ACCENT} fillOpacity={1 - i * 0.07} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Distribusi status */}
            <ChartCard title="Distribusi Status" subtitle="Semua pengantaran periode ini">
              {statusData.length === 0 ? (
                <div className="h-[260px] flex items-center justify-center text-sm text-gray-400">
                  Tidak ada data
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={statusData}
                        dataKey="value"
                        nameKey="label"
                        innerRadius={48}
                        outerRadius={72}
                        paddingAngle={2}
                        stroke="none"
                      >
                        {statusData.map((s, i) => (
                          <Cell key={i} fill={s.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<CountTooltip unit="pengantaran" />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="w-full mt-2 space-y-1.5">
                    {statusData.map((s) => (
                      <div key={s.status} className="flex items-center gap-2 text-xs">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
                        <span className="text-gray-600 flex-1 truncate">{s.label}</span>
                        <span className="font-semibold text-gray-900">{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </ChartCard>

            {/* Tren aktivitas */}
            <ChartCard
              title="Tren Pengantaran Selesai"
              subtitle="Jumlah pengantaran terselesaikan dari waktu ke waktu"
              className="lg:col-span-3"
            >
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={trendData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="prepTrend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={20} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={32} />
                  <Tooltip content={<CountTooltip unit="pengantaran" />} />
                  <Area type="monotone" dataKey="count" stroke={ACCENT} strokeWidth={2.5} fill="url(#prepTrend)" dot={false} activeDot={{ r: 4, fill: ACCENT }} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        )}

        {/* Tabel Leaderboard */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 bg-white/60 animate-pulse rounded-xl border border-gray-100" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-200/60 bg-white shadow-sm">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900">Peringkat Kurir</h3>
              <p className="text-[11px] text-gray-400">Ketuk baris untuk melihat riwayat lengkap</p>
            </div>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] font-black uppercase tracking-wider text-gray-400 border-b border-gray-100">
                    <th className="text-left px-4 py-3 w-10">#</th>
                    <th className="text-left px-4 py-3">Nama</th>
                    <th className="text-center px-4 py-3">Total Pekerjaan</th>
                    <th className="text-center px-4 py-3">Waktu Tempuh</th>
                    <th className="text-center px-4 py-3">Waktu Penyelesaian</th>
                    <th className="text-center px-4 py-3">Rata-rata</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((r, idx) => (
                    <tr
                      key={r.id}
                      onClick={() => setSelected(r)}
                      className="hover:bg-teal-50/40 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <RankBadge idx={idx} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-bold text-[11px] shrink-0">
                            {getInitials(r.name)}
                          </div>
                          <span className="font-semibold text-gray-900">{r.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-gray-900">
                        {r.total}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <DurCell avg={r.tempuhAvgMs} total={r.tempuhTotalMs} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <DurCell avg={r.selesaiAvgMs} total={r.selesaiTotalMs} />
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-teal-700">
                        {formatDuration(r.avgMs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-50">
              {rows.map((r, idx) => (
                <button
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className="w-full text-left px-3 py-3 hover:bg-teal-50/40 transition-colors flex items-center gap-3"
                >
                  <RankBadge idx={idx} />
                  <div className="w-9 h-9 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-bold text-xs shrink-0">
                    {getInitials(r.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 text-sm truncate">{r.name}</div>
                    <div className="text-[11px] text-gray-500 mt-0.5 flex flex-wrap gap-x-2">
                      <span>Total: <strong className="text-gray-700">{r.total}</strong></span>
                      <span>Tempuh: <strong className="text-gray-700">{formatDuration(r.tempuhAvgMs)}</strong></span>
                      <span>Selesai: <strong className="text-gray-700">{formatDuration(r.selesaiAvgMs)}</strong></span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selected && (
        <DetailModal courier={selected} onClose={() => setSelected(null)} />
      )}
    </DashboardLayout>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────
const TONE: Record<string, { bg: string; text: string }> = {
  teal: { bg: "bg-teal-50", text: "text-teal-600" },
  sky: { bg: "bg-sky-50", text: "text-sky-600" },
  amber: { bg: "bg-amber-50", text: "text-amber-600" },
  violet: { bg: "bg-zinc-100", text: "text-zinc-700" },
};

function StatCard({
  label,
  value,
  sub,
  tone = "teal",
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: keyof typeof TONE;
  icon?: React.ReactNode;
}) {
  const t = TONE[tone] ?? TONE.teal;
  return (
    <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm px-4 py-3 flex items-start gap-3">
      {icon && (
        <span className={`w-8 h-8 rounded-lg ${t.bg} ${t.text} flex items-center justify-center shrink-0 mt-0.5`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            {icon}
          </svg>
        </span>
      )}
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 truncate">{label}</div>
        <div className="text-lg font-bold text-gray-900 mt-0.5 truncate">{value}</div>
        {sub && <div className="text-[11px] text-gray-400 truncate">{sub}</div>}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  className = "",
  children,
}: {
  title: string;
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-200/60 shadow-sm p-4 ${className}`}>
      <div className="mb-3">
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
        {subtitle && <p className="text-[11px] text-gray-400">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function CountTooltip({
  active,
  payload,
  label,
  unit,
}: any) {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0];
  const name = item?.payload?.label ?? label;
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-lg px-3 py-2 text-xs">
      <div className="font-semibold text-gray-900">{name}</div>
      <div className="text-gray-500">
        <span className="font-bold text-gray-900">{item.value}</span> {unit}
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

function DurCell({ avg, total }: { avg: number; total: number }) {
  return (
    <div className="leading-tight">
      <div className="font-semibold text-gray-900">{formatDuration(avg)}</div>
      <div className="text-[10px] text-gray-400">total {formatDuration(total)}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 p-8 sm:p-10 text-center shadow-sm">
      <div className="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
        <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM20 17a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      </div>
      <h3 className="text-base font-bold text-gray-900 mb-1">Belum Ada Pengantaran</h3>
      <p className="text-gray-500 text-sm">Belum ada data pengantaran untuk periode ini.</p>
    </div>
  );
}

function DetailModal({
  courier,
  onClose,
}: {
  courier: CourierStat;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-4 sm:px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-bold text-sm shrink-0">
            {getInitials(courier.name)}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-gray-900 truncate">{courier.name}</h2>
            <p className="text-xs text-gray-500">
              {courier.total} pengantaran selesai · rata-rata tempuh {formatDuration(courier.avgMs)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* List riwayat */}
        <div className="overflow-y-auto p-3 sm:p-4 space-y-2">
          {courier.deliveries.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-6">Tidak ada riwayat.</p>
          ) : (
            courier.deliveries.map((d) => (
              <div
                key={d.id}
                className="rounded-xl border border-gray-200/60 p-3 hover:border-teal-200 transition-colors"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900 text-sm truncate">
                      {d.order_number || "—"}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {d.customer_name || "—"}
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${
                      STATUS_STYLE[d.status || ""] || "bg-gray-50 text-gray-600 border-gray-200"
                    }`}
                  >
                    {statusLabel(d.status)}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                  <TimeCol label="Dispatch" value={formatDateTime(d.dispatched_at)} />
                  <TimeCol label="Mulai Antar" value={formatDateTime(d.delivery_started_at)} />
                  <TimeCol label="Sampai" value={formatDateTime(d.delivered_at)} />
                  <TimeCol label="Diterima" value={formatDateTime(d.delivery_accepted_at)} />
                </div>
                <div className="flex gap-3 mt-2 pt-2 border-t border-gray-50 text-[11px]">
                  <span className="text-gray-500">
                    Tempuh: <strong className="text-gray-800">{formatDuration(d.tempuhMs)}</strong>
                  </span>
                  <span className="text-gray-500">
                    Penyelesaian: <strong className="text-gray-800">{formatDuration(d.selesaiMs)}</strong>
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function TimeCol({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-gray-400 font-bold">{label}</div>
      <div className="text-gray-700">{value}</div>
    </div>
  );
}