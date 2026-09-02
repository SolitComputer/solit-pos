"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/services/supabase";
import {
  Wrench,
  Users,
  Clock,
  Trophy,
  Medal,
  CheckCircle2,
  Activity,
  RefreshCw,
  X,
  Inbox,
} from "lucide-react";

const ServiceCharts = dynamic(() => import("./ServiceCharts"), {
  ssr: false,
  loading: () => <div className="grid lg:grid-cols-3 gap-3"><div className="lg:col-span-2 h-72 bg-white/60 animate-pulse rounded-2xl border border-gray-100" /><div className="h-72 bg-white/60 animate-pulse rounded-2xl border border-gray-100" /></div>,
});

// ─── Types ────────────────────────────────────────────────────────────────
interface ServiceDetail {
  id: string;
  type_laptop: string | null;
  keluhan: string | null;
  status: string | null;
  tanggal_masuk: string | null;
  mulai_dikerjakan: string | null;
  tanggal_selesai: string | null;
  pengerjaanMs: number | null;
  penyelesaianMs: number | null;
}

interface TechStat {
  id: string;
  name: string;
  total: number;
  pengerjaanTotalMs: number;
  pengerjaanAvgMs: number;
  penyelesaianTotalMs: number;
  penyelesaianAvgMs: number;
  avgMs: number;
  orders: ServiceDetail[];
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
const STATUS_COLOR: Record<string, string> = {
  ANTRIAN: "#94a3b8",
  SEDANG_DIKERJAKAN: "#3b82f6",
  MENUNGGU_SPAREPART: "#f59e0b",
  DONE: "#10b981",
  SUDAH_DIAMBIL: "#14b8a6",
  GAGAL_DIPERBAIKI: "#ef4444",
  TIDAK_JADI: "#f43f5e",
};
const STATUS_FALLBACK = "#94a3b8";

// ─── Helpers ──────────────────────────────────────────────────────────────
function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return "—";
  const totalMin = Math.round(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}h ${h}j`;
  if (h > 0) return `${h}j ${m}m`;
  return `${m}m`;
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
  ANTRIAN: "bg-gray-50 text-gray-600 border-gray-200",
  SEDANG_DIKERJAKAN: "bg-blue-50 text-blue-700 border-blue-200",
  MENUNGGU_SPAREPART: "bg-amber-50 text-amber-700 border-amber-200",
  DONE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  SUDAH_DIAMBIL: "bg-teal-50 text-teal-700 border-teal-200",
  GAGAL_DIPERBAIKI: "bg-red-50 text-red-700 border-red-200",
  TIDAK_JADI: "bg-red-50 text-red-700 border-red-200",
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
export default function ServiceStatistikPage() {
  const [period, setPeriod] = useState<PeriodKey>("7d");
  const [rows, setRows] = useState<TechStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<TechStat | null>(null);

  const fetchData = useCallback(async (p: PeriodKey) => {
    try {
      setError("");
      const res = await fetch(`/api/service/statistik?range=${p}`);
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

  // Realtime: setiap perubahan order servis → refresh
  useEffect(() => {
    const ch = supabase
      .channel("service-statistik-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "service_orders" },
        () => fetchData(period)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [period, fetchData]);

  useEffect(() => {
    if (!selected) return;
    const fresh = rows.find((r) => r.id === selected.id);
    if (fresh) setSelected(fresh);
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalServis = useMemo(
    () => rows.reduce((acc, r) => acc + r.total, 0),
    [rows]
  );

  const avgPengerjaan = useMemo(() => {
    const active = rows.filter((r) => r.pengerjaanAvgMs > 0);
    if (!active.length) return 0;
    return Math.round(
      active.reduce((a, r) => a + r.pengerjaanAvgMs, 0) / active.length
    );
  }, [rows]);

  const topTech = rows[0];

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
      for (const o of r.orders)
        if (o.tanggal_selesai) times.push(new Date(o.tanggal_selesai).getTime());
    return bucketize(makeBuckets(period), times);
  }, [rows, period]);

  const statusData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows)
      for (const o of r.orders) {
        const s = o.status || "LAINNYA";
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
        {/* ─── HERO HEADER ─── */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-900 via-zinc-800 to-black p-5 sm:p-7 shadow-xl shadow-black/20">
          {/* Decorative blobs */}
          <div className="absolute -top-16 -right-16 w-48 h-48 bg-zinc-500/15 rounded-full blur-3xl" />
          <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-zinc-400/10 rounded-full blur-3xl" />

          <div className="relative flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
              <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg">
                <Wrench className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-white tracking-tight leading-none">
                    Statistik Servis
                  </h1>
                  <span className="inline-flex items-center gap-1.5 text-[9px] sm:text-[10px] font-bold text-emerald-300 bg-emerald-500/20 backdrop-blur-sm border border-emerald-400/30 px-2 py-0.5 rounded-full flex-shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    LIVE
                  </span>
                </div>
                <p className="text-[11px] sm:text-sm text-white/60 font-medium leading-snug">
                  Peringkat teknisi (termasuk PKL) berdasarkan waktu pengerjaan &amp; penyelesaian
                </p>
              </div>
            </div>

            <button
              onClick={() => { setLoading(true); fetchData(period); }}
              disabled={loading}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 text-white flex items-center justify-center transition disabled:opacity-50 flex-shrink-0 self-end sm:self-auto"
              title="Refresh manual"
            >
              <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          {/* Period filter — glassmorphism */}
          <div className="relative mt-5 sm:mt-6">
            <div className="grid grid-cols-5 gap-1 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-1">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={`px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                    period === p.key
                      ? "bg-white text-zinc-900 shadow-md"
                      : "text-white/70 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 text-red-600 rounded-xl border border-red-100 text-sm flex items-center gap-2">
            <X className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Ringkasan */}
        {hasData && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            <StatCard
              label="Total Servis Selesai"
              value={totalServis.toString()}
              subtitle="Periode aktif"
              icon={<CheckCircle2 className="w-5 h-5" />}
              tone="zinc"
            />
            <StatCard
              label="Teknisi Aktif"
              value={rows.length.toString()}
              subtitle="Termasuk PKL"
              icon={<Users className="w-5 h-5" />}
              tone="sky"
            />
            <StatCard
              label="Rata-rata Pengerjaan"
              value={formatDuration(avgPengerjaan)}
              subtitle="Waktu kerja aktif"
              icon={<Clock className="w-5 h-5" />}
              tone="amber"
            />
            <StatCard
              label="Teknisi Terbaik"
              value={topTech ? firstName(topTech.name) : "—"}
              subtitle={topTech ? `${topTech.total} servis` : "Belum ada"}
              icon={<Trophy className="w-5 h-5" />}
              tone="slate"
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
          <ServiceCharts workloadData={workloadData} statusData={statusData} trendData={trendData} />
        )}

        {/* Leaderboard */}
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
            <div className="px-4 sm:px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-zinc-100 text-zinc-700 flex items-center justify-center flex-shrink-0">
                <Trophy className="w-3.5 h-3.5" />
              </span>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-black text-gray-900">Peringkat Teknisi</h3>
                <p className="text-[11px] text-gray-400 font-medium">Ketuk baris untuk melihat riwayat lengkap</p>
              </div>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 tabular-nums flex-shrink-0">
                {rows.length}
              </span>
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] font-black uppercase tracking-wider text-gray-400 border-b border-gray-100 bg-gray-50/40">
                    <th className="text-left px-4 py-3 w-14">#</th>
                    <th className="text-left px-4 py-3">Nama</th>
                    <th className="text-center px-4 py-3">Total Pekerjaan</th>
                    <th className="text-center px-4 py-3">Waktu Pengerjaan</th>
                    <th className="text-center px-4 py-3">Waktu Penyelesaian</th>
                    <th className="text-center px-4 py-3">Rata-rata</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((r, idx) => (
                    <tr
                      key={r.id}
                      onClick={() => setSelected(r)}
                      className="hover:bg-zinc-50 transition-colors cursor-pointer group"
                    >
                      <td className="px-4 py-3">
                        <RankBadge idx={idx} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 text-white flex items-center justify-center font-black text-[11px] shrink-0 shadow-sm shadow-zinc-900/30">
                            {getInitials(r.name)}
                          </div>
                          <span className="font-bold text-gray-900 group-hover:text-zinc-900 transition">{r.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center font-black text-gray-900 tabular-nums">
                        {r.total}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <DurCell avg={r.pengerjaanAvgMs} total={r.pengerjaanTotalMs} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <DurCell avg={r.penyelesaianAvgMs} total={r.penyelesaianTotalMs} />
                      </td>
                      <td className="px-4 py-3 text-center font-black text-zinc-900 tabular-nums">
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
                  className="w-full text-left px-3 py-3 hover:bg-zinc-50 transition-colors flex items-center gap-3"
                >
                  <RankBadge idx={idx} />
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 text-white flex items-center justify-center font-black text-xs shrink-0 shadow-sm shadow-zinc-900/30">
                    {getInitials(r.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-gray-900 text-sm truncate">{r.name}</div>
                    <div className="text-[11px] text-gray-500 mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                      <span>Total: <strong className="text-gray-700 tabular-nums">{r.total}</strong></span>
                      <span>Kerja: <strong className="text-gray-700">{formatDuration(r.pengerjaanAvgMs)}</strong></span>
                      <span>Selesai: <strong className="text-gray-700">{formatDuration(r.penyelesaianAvgMs)}</strong></span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-base font-black text-zinc-800 tabular-nums leading-none">{r.total}</div>
                    <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">servis</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selected && (
        <DetailModal tech={selected} onClose={() => setSelected(null)} />
      )}
    </DashboardLayout>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────
const TONE: Record<string, { text: string; gradient: string; ring: string }> = {
  zinc:   { text: "text-zinc-800",   gradient: "from-zinc-700 to-zinc-900",   ring: "ring-zinc-500/20" },
  sky:    { text: "text-sky-600",    gradient: "from-sky-500 to-sky-600",       ring: "ring-sky-500/20" },
  amber:  { text: "text-amber-600",  gradient: "from-amber-500 to-amber-600",   ring: "ring-amber-500/20" },
  slate:  { text: "text-slate-700",  gradient: "from-slate-500 to-slate-700", ring: "ring-slate-500/20" },
};

function StatCard({
  label,
  value,
  subtitle,
  tone = "zinc",
  icon,
}: {
  label: string;
  value: string;
  subtitle?: string;
  tone?: keyof typeof TONE;
  icon?: React.ReactNode;
}) {
  const t = TONE[tone] ?? TONE.zinc;
  return (
    <div className="relative bg-white rounded-2xl border border-gray-200/60 shadow-sm p-3 sm:p-4 overflow-hidden transition hover:shadow-md hover:-translate-y-0.5">
      <div className={`absolute top-0 right-0 w-16 h-16 bg-gradient-to-br ${t.gradient} opacity-[0.07] rounded-full blur-2xl`} />

      <div className="relative flex items-start justify-between gap-2 mb-2">
        {icon && (
          <span className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br ${t.gradient} text-white flex items-center justify-center shrink-0 shadow-sm`}>
            {icon}
          </span>
        )}
      </div>

      <div className="relative">
        <div className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-gray-500 mb-0.5 truncate">
          {label}
        </div>
        <div className={`text-xl sm:text-2xl lg:text-3xl font-black tabular-nums ${t.text} leading-none truncate`}>
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

function RankBadge({ idx }: { idx: number }) {
  const medalGradients = [
    "from-amber-400 to-yellow-500 shadow-amber-500/40",  // gold
    "from-slate-300 to-slate-400 shadow-slate-400/40",   // silver
    "from-orange-400 to-amber-600 shadow-orange-500/40", // bronze
  ];
  if (idx < 3) {
    return (
      <span className={`w-8 h-8 shrink-0 rounded-xl flex items-center justify-center bg-gradient-to-br ${medalGradients[idx]} text-white shadow-md`}>
        <Medal className="w-4 h-4" />
      </span>
    );
  }
  return (
    <span className="w-8 h-8 shrink-0 rounded-xl flex items-center justify-center font-black text-[11px] bg-gray-100 text-gray-500">
      {idx + 1}
    </span>
  );
}

function DurCell({ avg, total }: { avg: number; total: number }) {
  return (
    <div className="leading-tight">
      <div className="font-bold text-gray-900 tabular-nums">{formatDuration(avg)}</div>
      <div className="text-[10px] text-gray-400 tabular-nums">total {formatDuration(total)}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white rounded-3xl border border-gray-200/60 p-8 sm:p-12 text-center shadow-sm">
      <div className="w-16 h-16 bg-gradient-to-br from-gray-50 to-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <Inbox className="w-8 h-8 text-gray-300" />
      </div>
      <h3 className="text-base font-black text-gray-900 mb-1">Belum Ada Servis</h3>
      <p className="text-gray-500 text-sm font-medium">Belum ada data servis untuk periode ini.</p>
    </div>
  );
}

function DetailModal({
  tech,
  onClose,
}: {
  tech: TechStat;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden">
        {/* Header — dengan gradient */}
        <div className="relative overflow-hidden bg-gradient-to-br from-zinc-900 via-zinc-800 to-black px-4 sm:px-5 py-4 flex items-center gap-3">
          <div className="absolute -top-8 -right-8 w-32 h-32 bg-zinc-500/20 rounded-full blur-2xl" />
          <div className="relative w-11 h-11 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 text-white flex items-center justify-center font-black text-sm shrink-0">
            {getInitials(tech.name)}
          </div>
          <div className="relative flex-1 min-w-0">
            <h2 className="font-black text-white text-base truncate">{tech.name}</h2>
            <p className="text-xs text-white/70 font-medium">
              {tech.total} servis selesai · avg {formatDuration(tech.avgMs)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="relative w-8 h-8 rounded-lg hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick stats bar */}
        <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100 bg-gray-50/40">
          <div className="px-3 py-2.5 text-center">
            <div className="text-[9px] font-black uppercase tracking-wider text-gray-400">Total</div>
            <div className="text-sm font-black text-gray-900 tabular-nums">{tech.total}</div>
          </div>
          <div className="px-3 py-2.5 text-center">
            <div className="text-[9px] font-black uppercase tracking-wider text-gray-400">Pengerjaan</div>
            <div className="text-sm font-black text-gray-900">{formatDuration(tech.pengerjaanAvgMs)}</div>
          </div>
          <div className="px-3 py-2.5 text-center">
            <div className="text-[9px] font-black uppercase tracking-wider text-gray-400">Penyelesaian</div>
            <div className="text-sm font-black text-gray-900">{formatDuration(tech.penyelesaianAvgMs)}</div>
          </div>
        </div>

        {/* List riwayat */}
        <div className="overflow-y-auto p-3 sm:p-4 space-y-2 flex-1">
          {tech.orders.length === 0 ? (
            <div className="text-center py-10">
              <Inbox className="w-10 h-10 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400 font-medium">Tidak ada riwayat.</p>
            </div>
          ) : (
            tech.orders.map((o) => (
              <div
                key={o.id}
                className="rounded-xl border border-gray-200/60 p-3 hover:border-zinc-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-gray-900 text-sm truncate">
                      {o.type_laptop || "—"}
                    </div>
                    <div className="text-xs text-gray-500 truncate mt-0.5">
                      {o.keluhan || "—"}
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded-full border shrink-0 uppercase tracking-wider ${
                      STATUS_STYLE[o.status || ""] || "bg-gray-50 text-gray-600 border-gray-200"
                    }`}
                  >
                    {statusLabel(o.status)}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <TimeCol label="Masuk" value={formatDateTime(o.tanggal_masuk)} />
                  <TimeCol label="Mulai" value={formatDateTime(o.mulai_dikerjakan)} />
                  <TimeCol label="Selesai" value={formatDateTime(o.tanggal_selesai)} />
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 pt-2 border-t border-gray-50 text-[11px]">
                  <span className="text-gray-500 inline-flex items-center gap-1">
                    <Activity className="w-3 h-3 text-zinc-700" />
                    Pengerjaan: <strong className="text-gray-800">{formatDuration(o.pengerjaanMs)}</strong>
                  </span>
                  <span className="text-gray-500 inline-flex items-center gap-1">
                    <Clock className="w-3 h-3 text-emerald-500" />
                    Penyelesaian: <strong className="text-gray-800">{formatDuration(o.penyelesaianMs)}</strong>
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
    <div className="min-w-0">
      <div className="text-[9px] uppercase tracking-wider text-gray-400 font-black">{label}</div>
      <div className="text-gray-700 font-semibold truncate">{value}</div>
    </div>
  );
}