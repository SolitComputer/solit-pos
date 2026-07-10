// src/app/dashboard/cc-reports/analisa/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import { CC_PLATFORMS, PLATFORM_COLOR } from "@/lib/ccReports";
import DashboardLayout from "@/components/layout/DashboardLayout";

type Metric = "views" | "likes" | "comments";
const METRIC_LABEL: Record<Metric, string> = { views: "Views", likes: "Likes", comments: "Komentar" };
const METRIC_COLOR: Record<Metric, string> = { views: "#7c3aed", likes: "#10b981", comments: "#3b82f6" };

interface AnalyticsData {
  perContent: { report_id: string; title: string; views: number; likes: number; comments: number; postCount: number; platforms: string[] }[];
  platformTotals: { platform: string; views: number; likes: number; comments: number; count: number }[];
  totals: { views: number; likes: number; comments: number; postCount: number; contentCount: number };
}

export default function CCAnalisaPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<Metric>("views");
  const [platform, setPlatform] = useState<string>("");

  useEffect(() => {
    setLoading(true);
    const q = platform ? `?platform=${encodeURIComponent(platform)}` : "";
    fetch(`/api/cc-reports/analytics${q}`)
      .then((r) => r.json())
      .then((json) => { if (json.success) setData(json); })
      .finally(() => setLoading(false));
  }, [platform]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.perContent
      .slice(0, 12)
      .map((c) => ({ name: c.title.length > 18 ? c.title.slice(0, 18) + "…" : c.title, value: c[metric], full: c.title }));
  }, [data, metric]);

  const fmt = (n: number) => n.toLocaleString("id-ID");

  return (
    <DashboardLayout>

      <div className="min-h-screen bg-[#F7F7F8] px-4 py-6 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <Link href="/dashboard/cc-reports" className="p-2 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-gray-800 transition">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-[#1a1a2e] tracking-tight">Analisa Konten</h1>
              <p className="text-sm text-gray-500">Performa view, like, komen dari konten yang sudah diposting.</p>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: "Total Views", value: data?.totals.views ?? 0, color: "text-violet-600" },
              { label: "Total Likes", value: data?.totals.likes ?? 0, color: "text-emerald-600" },
              { label: "Total Komen", value: data?.totals.comments ?? 0, color: "text-blue-600" },
              { label: "Konten Terposting", value: data?.totals.contentCount ?? 0, color: "text-gray-700" },
            ].map((c) => (
              <div key={c.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{c.label}</p>
                <p className={`text-2xl font-black mt-1 tabular-nums ${c.color}`}>{fmt(c.value)}</p>
              </div>
            ))}
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="flex gap-1 bg-white rounded-xl border border-gray-100 p-1">
              {(["views", "likes", "comments"] as Metric[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-bold transition ${metric === m ? "bg-[#1a1a2e] text-white" : "text-gray-500 hover:bg-gray-50"}`}
                >
                  {METRIC_LABEL[m]}
                </button>
              ))}
            </div>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-[#1a1a2e]/20"
            >
              <option value="">Semua Platform</option>
              {CC_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {/* Chart per konten */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6">
            <h2 className="text-sm font-black text-gray-700 mb-3">{METRIC_LABEL[metric]} per Konten (Top 12)</h2>
            {loading ? (
              <div className="h-72 bg-gray-50 rounded-xl animate-pulse" />
            ) : chartData.length === 0 ? (
              <p className="text-center text-gray-400 py-16 text-sm">Belum ada data posting untuk dianalisa.</p>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="name" angle={-35} textAnchor="end" interval={0} tick={{ fontSize: 11, fill: "#6b7280" }} height={70} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickFormatter={fmt} />
                  <Tooltip
                    formatter={(v) => [fmt(Number(v) || 0), METRIC_LABEL[metric]] as [string, string]}
                    labelFormatter={(_label, p) => ((p as any)?.[0]?.payload?.full ?? "")}
                    contentStyle={{ borderRadius: 12, border: "1px solid #eee", fontSize: 12 }}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} fill={METRIC_COLOR[metric]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Chart per platform */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h2 className="text-sm font-black text-gray-700 mb-3">{METRIC_LABEL[metric]} per Platform</h2>
            {loading ? (
              <div className="h-60 bg-gray-50 rounded-xl animate-pulse" />
            ) : !data || data.platformTotals.length === 0 ? (
              <p className="text-center text-gray-400 py-12 text-sm">Belum ada data platform.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.platformTotals} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="platform" tick={{ fontSize: 12, fill: "#6b7280" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickFormatter={fmt} />
                  <Tooltip formatter={(v) => [fmt(Number(v) || 0), METRIC_LABEL[metric]] as [string, string]} contentStyle={{ borderRadius: 12, border: "1px solid #eee", fontSize: 12 }} />
                  <Bar dataKey={metric} radius={[6, 6, 0, 0]}>
                    {data.platformTotals.map((p) => (
                      <Cell key={p.platform} fill={PLATFORM_COLOR[p.platform] ?? "#6b7280"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}