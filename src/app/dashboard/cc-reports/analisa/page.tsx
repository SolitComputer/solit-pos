// src/app/dashboard/cc-reports/analisa/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ComposedChart, Area, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  AreaChart,
} from "recharts";
import {
  CC_PLATFORMS, PLATFORM_COLOR, fmtCompact, fmtNum, pctDelta,
  type CCAnalytics, type CCRange,
} from "@/lib/ccReports";
import DashboardLayout from "@/components/layout/DashboardLayout";

type Metric = "views" | "likes" | "comments";

const METRIC_META: Record<Metric, { label: string; color: string; cumKey: keyof CCAnalytics["timeline"][number] }> = {
  views: { label: "Views", color: "#7c3aed", cumKey: "cumViews" },
  likes: { label: "Likes", color: "#10b981", cumKey: "cumLikes" },
  comments: { label: "Komentar", color: "#3b82f6", cumKey: "cumComments" },
};

const RANGES: { key: CCRange; label: string }[] = [
  { key: "7", label: "7H" },
  { key: "30", label: "30H" },
  { key: "90", label: "90H" },
  { key: "all", label: "Semua" },
];

const fmtDay = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short" });

export default function CCAnalisaPage() {
  const [data, setData] = useState<CCAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<Metric>("views");
  const [platform, setPlatform] = useState<string>("");
  const [range, setRange] = useState<CCRange>("30");
  const [mode, setMode] = useState<"cum" | "daily">("cum");

  useEffect(() => {
    const controller = new AbortController();
    const run = async () => {
      setLoading(true);
      try {
        const q = new URLSearchParams({ range });
        if (platform) q.set("platform", platform);
        const res = await fetch(`/api/cc-reports/analytics?${q.toString()}`, { signal: controller.signal });
        const json = await res.json();
        if (json.success) setData(json as CCAnalytics);
      } catch {
        /* aborted / network */
      } finally {
        setLoading(false);
      }
    };
    run();
    return () => controller.abort();
  }, [platform, range]);

  const m = METRIC_META[metric];

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.timeline.map((t) => ({
      date: t.date,
      value: mode === "cum" ? (t[m.cumKey] as number) : t[metric],
      posts: t.posts,
    }));
  }, [data, metric, mode, m.cumKey]);

  const total = data?.totals[metric] ?? 0;
  const prev = data?.prevTotals[metric] ?? 0;
  const delta = pctDelta(total, prev);
  const up = (delta ?? 0) >= 0;

  const engagement =
    data && data.totals.views > 0
      ? ((data.totals.likes + data.totals.comments) / data.totals.views) * 100
      : 0;

  const platformShare = useMemo(() => {
    if (!data) return [];
    const sum = data.platformTotals.reduce((s, p) => s + p[metric], 0) || 1;
    return data.platformTotals.map((p) => ({ ...p, share: (p[metric] / sum) * 100 }));
  }, [data, metric]);

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-white px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          {/* Header */}
          <div className="mb-6 flex items-center gap-3">
            <Link href="/dashboard/cc-reports"
              className="rounded-xl border border-gray-200 p-2 text-gray-500 transition hover:bg-gray-50 hover:text-gray-900">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </Link>
            <div>
              <h1 className="text-xl font-black tracking-tight text-gray-900 sm:text-2xl">Analisa Konten</h1>
              <p className="text-sm text-gray-500">Performa view, like, dan komen dari konten yang sudah diposting.</p>
            </div>
          </div>

          {/* Toolbar */}
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border border-gray-200 p-1">
              {(Object.keys(METRIC_META) as Metric[]).map((k) => (
                <button key={k} onClick={() => setMetric(k)}
                  className={`rounded-lg px-4 py-1.5 text-sm font-bold transition ${metric === k ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-50"
                    }`}>
                  {METRIC_META[k].label}
                </button>
              ))}
            </div>

            <div className="flex rounded-xl border border-gray-200 p-1">
              {RANGES.map((r) => (
                <button key={r.key} onClick={() => setRange(r.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${range === r.key ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:text-gray-700"
                    }`}>
                  {r.label}
                </button>
              ))}
            </div>

            <div className="flex rounded-xl border border-gray-200 p-1">
              {([["cum", "Kumulatif"], ["daily", "Harian"]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setMode(k)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${mode === k ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:text-gray-700"
                    }`}>
                  {l}
                </button>
              ))}
            </div>

            <select value={platform} onChange={(e) => setPlatform(e.target.value)}
              className="ml-auto rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 outline-none transition focus:ring-4 focus:ring-gray-900/5">
              <option value="">Semua Platform</option>
              {CC_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {/* ── Hero chart (ala chart trading) ── */}
          <div className="mb-5 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
                  Total {m.label}
                </p>
                <div className="mt-1 flex items-center gap-3">
                  <span className="text-3xl font-black tabular-nums tracking-tight text-gray-900 sm:text-4xl">
                    {fmtNum(total)}
                  </span>
                  {delta !== null && (
                    <span className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-black tabular-nums ${up ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                      }`}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                        style={{ transform: up ? "none" : "rotate(180deg)" }}>
                        <polyline points="4 15 12 7 20 15" />
                      </svg>
                      {Math.abs(delta).toFixed(1)}%
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  {range === "all" ? "Seluruh periode" : `${range} hari terakhir`} · vs periode sebelumnya
                </p>
              </div>

              <div className="flex gap-4 text-right">
                <MiniStat label="Posting" value={fmtNum(data?.totals.postCount ?? 0)} />
                <MiniStat label="Konten" value={fmtNum(data?.totals.contentCount ?? 0)} />
                <MiniStat label="Engagement" value={`${engagement.toFixed(1)}%`} />
              </div>
            </div>

            {loading ? (
              <div className="h-[340px] animate-pulse rounded-2xl bg-gray-50" />
            ) : chartData.length === 0 ? (
              <EmptyState text="Belum ada posting dengan tanggal pada rentang ini." />
            ) : (
              <ResponsiveContainer width="100%" height={340}>
                <ComposedChart data={chartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ccFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={m.color} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={m.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" stroke="#f1f2f4" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={fmtDay}
                    tick={{ fontSize: 11, fill: "#9ca3af" }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={28}
                  />
                  <YAxis
                    yAxisId="left"
                    orientation="right"
                    tick={{ fontSize: 11, fill: "#9ca3af" }}
                    tickFormatter={fmtCompact}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                  />
                  <YAxis yAxisId="right" hide domain={[0, (dMax: number) => Math.max(4, dMax * 4)]} />
                 <Tooltip
                    cursor={{ stroke: "#d1d5db", strokeDasharray: "4 4" }}
                    content={(props) => (
                      <ChartTooltip
                        {...(props as ChartTooltipInjected)}
                        metricLabel={m.label}
                        color={m.color}
                      />
                    )}
                  />
                  <Bar yAxisId="right" dataKey="posts" fill="#e5e7eb" radius={[3, 3, 0, 0]} barSize={6} />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="value"
                    stroke={m.color}
                    strokeWidth={2.4}
                    fill="url(#ccFill)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* ── KPI + sparkline ── */}
          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {(Object.keys(METRIC_META) as Metric[]).map((k) => (
              <SparkCard
                key={k}
                label={`Total ${METRIC_META[k].label}`}
                color={METRIC_META[k].color}
                value={data?.totals[k] ?? 0}
                delta={pctDelta(data?.totals[k] ?? 0, data?.prevTotals[k] ?? 0)}
                series={(data?.timeline ?? []).map((t) => ({ v: t[METRIC_META[k].cumKey] as number }))}
                loading={loading}
              />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Share per platform */}
            <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-black text-gray-900">Distribusi {m.label} per Platform</h2>
              {loading ? (
                <div className="h-48 animate-pulse rounded-2xl bg-gray-50" />
              ) : platformShare.length === 0 ? (
                <EmptyState text="Belum ada data platform." compact />
              ) : (
                <div className="space-y-3">
                  {platformShare.map((p) => (
                    <div key={p.platform}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 font-bold text-gray-700">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: PLATFORM_COLOR[p.platform] ?? "#6b7280" }} />
                          {p.platform}
                          <span className="font-medium text-gray-400">· {p.count} post</span>
                        </span>
                        <span className="font-black tabular-nums text-gray-900">
                          {fmtCompact(p[metric])}{" "}
                          <span className="font-semibold text-gray-400">({p.share.toFixed(0)}%)</span>
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${p.share}%`, background: PLATFORM_COLOR[p.platform] ?? "#6b7280" }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top konten */}
            <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-black text-gray-900">Top Konten</h2>
              {loading ? (
                <div className="h-48 animate-pulse rounded-2xl bg-gray-50" />
              ) : !data || data.perContent.length === 0 ? (
                <EmptyState text="Belum ada konten terposting." compact />
              ) : (
                <div className="divide-y divide-gray-50">
                  {data.perContent.slice(0, 6).map((c, i) => (
                    <div key={c.report_id} className="flex items-center gap-3 py-2.5">
                      <span className="w-5 text-center text-xs font-black text-gray-300">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-gray-800">{c.title}</p>
                        <p className="truncate text-[11px] text-gray-400">
                          {c.platforms.join(" · ")} · {c.postCount} posting
                        </p>
                      </div>
                      <span className="text-sm font-black tabular-nums text-gray-900">{fmtCompact(c[metric])}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Top posting */}
          <div className="mt-5 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-black text-gray-900">Top Posting</h2>
            {loading ? (
              <div className="h-32 animate-pulse rounded-2xl bg-gray-50" />
            ) : !data || data.topPosts.length === 0 ? (
              <EmptyState text="Belum ada posting." compact />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-[11px] font-bold uppercase tracking-wide text-gray-400">
                      <th className="py-2 pr-3">Konten</th>
                      <th className="py-2 pr-3">Platform</th>
                      <th className="py-2 pr-3 text-right">Views</th>
                      <th className="py-2 pr-3 text-right">Likes</th>
                      <th className="py-2 pr-3 text-right">Komen</th>
                      <th className="py-2 text-right">Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topPosts.map((p) => (
                      <tr key={p.id} className="border-b border-gray-50 last:border-0">
                        <td className="max-w-[220px] truncate py-2.5 pr-3 font-semibold text-gray-800">{p.title}</td>
                        <td className="py-2.5 pr-3">
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-600">
                            <span className="h-2 w-2 rounded-full" style={{ background: PLATFORM_COLOR[p.platform] ?? "#6b7280" }} />
                            {p.platform}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-right font-black tabular-nums text-gray-900">{fmtNum(p.views)}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums text-gray-600">{fmtNum(p.likes)}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums text-gray-600">{fmtNum(p.comments)}</td>
                        <td className="py-2.5 text-right">
                          {p.post_url ? (
                            <a href={p.post_url} target="_blank" rel="noopener noreferrer"
                              className="text-xs font-bold text-violet-600 hover:underline">
                              Buka ↗
                            </a>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

/* ── Sub-komponen ── */

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</p>
      <p className="text-lg font-black tabular-nums text-gray-900">{value}</p>
    </div>
  );
}

function EmptyState({ text, compact }: { text: string; compact?: boolean }) {
  return (
    <p className={`text-center text-sm text-gray-400 ${compact ? "py-12" : "py-24"}`}>{text}</p>
  );
}

/**
 * Superset dari Recharts `Payload`:
 * - dataKey bisa berupa fungsi (DataKey<any>), bukan cuma string/number
 * - value bisa berupa array (ValueType)
 */
interface ChartTooltipItem {
  dataKey?: string | number | ((obj: unknown) => unknown);
  value?: number | string | Array<number | string>;
}

/**
 * Bagian yang DI-INJECT Recharts.
 * `payload` WAJIB readonly — di v3 tipenya `readonly Payload[]`,
 * dan readonly array tidak comparable dengan array mutable.
 */
interface ChartTooltipInjected {
  active?: boolean;
  payload?: readonly ChartTooltipItem[];
  label?: unknown;
}

/** Props milik kita sendiri. */
interface ChartTooltipOwn {
  metricLabel: string;
  color: string;
}

type ChartTooltipProps = ChartTooltipInjected & ChartTooltipOwn;

function ChartTooltip({ active, payload, label, metricLabel, color }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  const pick = (key: string): number => {
    const hit = payload.find((p) => p.dataKey === key)?.value;
    return typeof hit === "number" || typeof hit === "string" ? Number(hit) || 0 : 0;
  };

  const value = pick("value");
  const posts = pick("posts");
  return (
    <div className="rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-lg">
      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
        {fmtDay(String(label))}
      </p>
      <p className="mt-0.5 flex items-center gap-1.5 text-sm font-black tabular-nums text-gray-900">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
       {fmtNum(value)} <span className="font-semibold text-gray-400">{metricLabel}</span>
      </p>
      <p className="text-[11px] font-semibold text-gray-400">{posts} posting hari ini</p>
    </div>
  );
}

function SparkCard({
  label, value, delta, color, series, loading,
}: {
  label: string;
  value: number;
  delta: number | null;
  color: string;
  series: { v: number }[];
  loading: boolean;
}) {
  const up = (delta ?? 0) >= 0;
  const id = label.replace(/\s/g, "");
  return (
    <div className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">{label}</p>
          <p className="mt-1 text-2xl font-black tabular-nums text-gray-900">{fmtNum(value)}</p>
        </div>
        {delta !== null && (
          <span className={`rounded-lg px-2 py-0.5 text-[11px] font-black tabular-nums ${up ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
            }`}>
            {up ? "+" : "−"}{Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
      <div className="mt-2 h-12">
        {loading || series.length === 0 ? (
          <div className="h-full animate-pulse rounded-lg bg-gray-50" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`spark${id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#spark${id})`} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}