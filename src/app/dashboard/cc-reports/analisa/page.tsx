// src/app/dashboard/cc-reports/analisa/page.tsx
"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { isStale, AUTO_SYNC_STALE_MINUTES, SYNC_STATUS_META } from "@/lib/ccMetrics";
import {
  ANALISA_FILTERS, PLATFORM_COLOR, BRAND_TABS, BRAND_META, CC_RANGES, DEFAULT_BRAND,
  fmtCompact, fmtNum, fmtMinutes, pctDelta, matchFilter, wibDateStr, isDateStr,
  type AnalisaFilter, type BrandFilter, type CCAnalytics, type CCBrand,
  type CCMetric, type CCMetricTotals, type CCRange,
} from "@/lib/ccReports";

const AnalisaHeroChart = dynamic(() => import("./AnalisaHeroChart"), {
  ssr: false,
  loading: () => <div className="h-[340px] animate-pulse rounded-2xl bg-gray-50" />,
});
const AnalisaProcessChart = dynamic(() => import("./AnalisaProcessChart"), {
  ssr: false,
  loading: () => <div className="h-[300px] animate-pulse rounded-2xl bg-gray-50" />,
});

const METRIC_META: Record<CCMetric, { label: string; short: string; color: string }> = {
  views: { label: "Views", short: "View", color: "#7c3aed" },
  likes: { label: "Likes", short: "Like", color: "#10b981" },
  comments: { label: "Komentar", short: "Komen", color: "#3b82f6" },
};

const PROCESS_SEGMENTS = [
  { key: "takeMinutes", label: "Take", color: "#7c3aed" },
  { key: "handoffMinutes", label: "Serah ke Editor", color: "#f59e0b" },
  { key: "editMinutes", label: "Editing", color: "#10b981" },
] as const;

const EMPTY: CCMetricTotals = { views: 0, likes: 0, comments: 0, postCount: 0 };

const DETAIL_PAGE_SIZE = 10;

interface Row {
  report_id: string;
  title: string;
  brand: CCBrand;
  views: number;
  likes: number;
  comments: number;
  postCount: number;
  platforms: string[];
}

type ConnHealth = {
  connected: boolean;
  accountName: string | null;
  daysLeft: number | null;
  level: "OK" | "WARN" | "DEAD";
  error: string | null;
};

export default function CCAnalisaPage() {
  const [data, setData] = useState<CCAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [live, setLive] = useState(false);
  const [lastPulse, setLastPulse] = useState<Date | null>(null);

  const [metric, setMetric] = useState<CCMetric>("views");
  const [range, setRange] = useState<CCRange>("30");
  const [filter, setFilter] = useState<AnalisaFilter>("ALL");
  const [brand, setBrand] = useState<BrandFilter>("ALL");

  // custom date range
  const today = useMemo(() => wibDateStr(), []);
  const [from, setFrom] = useState<string>(today);
  const [to, setTo] = useState<string>(today);

  const [visible, setVisible] = useState(DETAIL_PAGE_SIZE);

  const [tt, setTt] = useState<ConnHealth | null>(null);
  const [ig, setIg] = useState<ConnHealth | null>(null);

  useEffect(() => {
    fetch("/api/cc-reports/tiktok/status")
      .then((r) => r.json())
      .then((j) => j.success && setTt(j))
      .catch(() => { });

    fetch("/api/cc-reports/instagram/status")
      .then((r) => r.json())
      .then((j) => j.success && setIg(j))
      .catch(() => { });
  }, []);

  // ── Query string analytics ────────────────────────────────────────────────
  const query = useMemo(() => {
    const sp = new URLSearchParams({ range });
    if (brand !== "ALL") sp.set("brand", brand);
    if (range === "custom" && isDateStr(from)) {
      sp.set("from", from);
      sp.set("to", isDateStr(to) ? to : from);
    }
    return sp.toString();
  }, [range, brand, from, to]);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cc-reports/analytics?${query}&_cb=${Date.now()}`, {
        signal,
        cache: "no-store",
      });
      const json = await res.json();
      if (json.success) setData(json as CCAnalytics);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const c = new AbortController();
    load(c.signal);
    setVisible(DETAIL_PAGE_SIZE);   // reset paging tiap ganti filter
    return () => c.abort();
  }, [load]);

  // ── Auto-sync kalau metrik basi ───────────────────────────────────────────
  const autoSynced = useRef(false);

  useEffect(() => {
    if (!data || autoSynced.current || syncing) return;
    if (!isStale(data.lastSyncedAt, AUTO_SYNC_STALE_MINUTES)) return;

    autoSynced.current = true;
    (async () => {
      setSyncing(true);
      try {
        await fetch(`/api/cc-reports/sync?stale=${AUTO_SYNC_STALE_MINUTES}`, { method: "POST" });
        await load();
      } catch {
        /* diamkan — user masih bisa sync manual */
      } finally {
        setSyncing(false);
      }
    })();
  }, [data, syncing, load]);

  useEffect(() => {
    if (!live) return;

    let stop = false;

    const pulse = async () => {
      if (stop) return;
      try {
        await fetch("/api/cc-reports/sync?force=1", { method: "POST", cache: "no-store" });
        if (stop) return;
        await load();
        setLastPulse(new Date());
      } catch {
        /* diamkan — coba lagi di siklus berikutnya */
      }
    };

    pulse();                                   
    const t = setInterval(pulse, 60_000);

    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [live, load]);

  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/cc-reports/sync?force=1", {
        method: "POST",
        cache: "no-store",
      });
      const json = await res.json();
      if (!json.success) {
        alert(json.error ?? "Gagal sync");
        return;
      }
      await load();
      setLastPulse(new Date());

      if (json.failed > 0) {
        alert(
          `Sync selesai — OK: ${json.ok}, sebagian: ${json.partial ?? 0}, gagal: ${json.failed}.\n` +
          `Cek banner kuning untuk posting yang bermasalah.`
        );
      }
    } finally {
      setSyncing(false);
    }
  };

  const m = METRIC_META[metric];

  // ── Terapkan filter platform ──────────────────────────────────────────────
  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    return data.contents
      .map((c) => {
        const stats = Object.values(c.perPlatform).filter((s) => matchFilter(s.platform, filter));
        if (stats.length === 0) return null;
        return {
          report_id: c.report_id,
          title: c.title,
          brand: c.brand,
          views: stats.reduce((s, p) => s + p.views, 0),
          likes: stats.reduce((s, p) => s + p.likes, 0),
          comments: stats.reduce((s, p) => s + p.comments, 0),
          postCount: stats.reduce((s, p) => s + p.postCount, 0),
          platforms: stats.map((p) => p.platform),
        } satisfies Row;
      })
      .filter((r): r is Row => r !== null);
  }, [data, filter]);

  const totals = useMemo<CCMetricTotals>(
    () =>
      rows.reduce(
        (acc, r) => ({
          views: acc.views + r.views,
          likes: acc.likes + r.likes,
          comments: acc.comments + r.comments,
          postCount: acc.postCount + r.postCount,
        }),
        { ...EMPTY }
      ),
    [rows]
  );

  const prevTotals = useMemo<CCMetricTotals>(() => {
    if (!data) return { ...EMPTY };
    return Object.entries(data.prevByPlatform)
      .filter(([p]) => matchFilter(p, filter))
      .reduce(
        (acc, [, t]) => ({
          views: acc.views + t.views,
          likes: acc.likes + t.likes,
          comments: acc.comments + t.comments,
          postCount: acc.postCount + t.postCount,
        }),
        { ...EMPTY }
      );
  }, [data, filter]);

  const delta = pctDelta(totals[metric], prevTotals[metric]);
  const up = (delta ?? 0) >= 0;
  const engagement = totals.views > 0 ? ((totals.likes + totals.comments) / totals.views) * 100 : 0;

  const top3 = useCallback(
    (key: CCMetric) =>
      [...rows].filter((r) => r[key] > 0).sort((a, b) => b[key] - a[key]).slice(0, 3),
    [rows]
  );

  const barData = useMemo(
    () =>
      [...rows]
        .sort((a, b) => b[metric] - a[metric])
        .slice(0, 10)
        .map((r) => ({ name: r.title, value: r[metric], posts: r.postCount })),
    [rows, metric]
  );

  const processData = useMemo(() => {
    if (!data) return [];
    return data.process.rows
      .filter((r) => r.takeMinutes || r.handoffMinutes || r.editMinutes)
      .slice(0, 8)
      .map((r) => ({
        name: r.title,
        takeMinutes: r.takeMinutes ?? 0,
        handoffMinutes: r.handoffMinutes ?? 0,
        editMinutes: r.editMinutes ?? 0,
      }));
  }, [data]);

  const summary = data?.process.summary;

  // Rincian per konten (paginated)
  const detailRows = useMemo(() => {
    if (!data) return [];
    return data.contents.filter((c) =>
      Object.keys(c.perPlatform).some((p) => matchFilter(p, filter))
    );
  }, [data, filter]);

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-white px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">

          {/* ── Kesehatan koneksi TikTok ── */}
          {tt && (
            <div
              className={`mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-3 ${tt.level === "OK"
                ? "border-emerald-100 bg-emerald-50"
                : tt.level === "WARN"
                  ? "border-amber-100 bg-amber-50"
                  : "border-red-100 bg-red-50"
                }`}
            >
              <p className={`text-xs font-medium ${tt.level === "OK"
                ? "text-emerald-800"
                : tt.level === "WARN" ? "text-amber-800" : "text-red-800"}`}>
                {tt.level === "OK" && (
                  <>
                    <b>TikTok terhubung</b>
                    {tt.accountName && <span className="ml-1">· @{tt.accountName}</span>}
                    <span className="ml-1 opacity-70">
                      — token diperbarui otomatis tiap hari
                      {tt.daysLeft !== null && ` (aman ${tt.daysLeft} hari)`}
                    </span>
                  </>
                )}
                {tt.level === "WARN" && (
                  <>
                    <b> Koneksi TikTok perlu perhatian.</b>{" "}
                    {tt.error ?? (tt.daysLeft !== null && `Sesi tersisa ${tt.daysLeft} hari.`)}
                  </>
                )}
                {tt.level === "DEAD" && (
                  <>
                    <b> TikTok tidak terhubung.</b> Metrik TikTok tidak ter-update otomatis.
                    {tt.error && <span className="ml-1 opacity-80">({tt.error})</span>}
                  </>
                )}
              </p>
              {tt.level !== "OK" && (
                <a
                  href="/api/cc-reports/tiktok/connect"
                  className="flex-shrink-0 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-gray-800"
                >
                  {tt.level === "DEAD" ? "Hubungkan TikTok" : "Hubungkan Ulang"}
                </a>
              )}
            </div>
          )}

          {/* ── Kesehatan koneksi Instagram ── */}
          {ig && ig.level !== "OK" && (
            <div className={`mb-4 rounded-2xl border p-3 ${ig.level === "WARN"
              ? "border-amber-100 bg-amber-50" : "border-red-100 bg-red-50"}`}>
              <p className={`text-xs font-medium ${ig.level === "WARN" ? "text-amber-800" : "text-red-800"}`}>
                {ig.level === "WARN" ? (
                  <>
                    <b> Token Instagram perlu perhatian.</b>{" "}
                    {ig.error ?? (ig.daysLeft !== null && `Sisa ${ig.daysLeft} hari sebelum kedaluwarsa.`)}
                  </>
                ) : (
                  <>
                    <b> Token Instagram kedaluwarsa.</b> Metrik IG tidak ter-update.
                    {ig.error && <span className="ml-1 opacity-80">({ig.error})</span>}
                  </>
                )}
              </p>
            </div>
          )}

          {/* ── Posting bermasalah ── */}
          {data && data.problems.length > 0 && (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3.5">
              <p className="text-xs font-black text-amber-900">
                 {data.problems.length} posting metriknya belum akurat
                {data.issues.partial > 0 && ` · ${data.issues.partial} sebagian`}
                {data.issues.error > 0 && ` · ${data.issues.error} gagal`}
              </p>
              <ul className="mt-2 space-y-1">
                {data.problems.slice(0, 5).map((p) => (
                  <li key={`${p.report_id}-${p.platform}-${p.post_url ?? ""}`}
                    className="truncate text-[11px] font-medium text-amber-800">
                    <b>{p.title}</b> · {p.platform} — {p.sync_error ?? SYNC_STATUS_META[p.sync_status].label}
                  </li>
                ))}
              </ul>
              <Link href="/dashboard/cc-reports/laporan"
                className="mt-2 inline-block rounded-lg bg-amber-900 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-amber-800">
                Lengkapi di Laporan Kerja →
              </Link>
            </div>
          )}

          {/* ── Header ── */}
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <Link href="/dashboard/cc-reports"
              className="rounded-xl border border-gray-200 p-2 text-gray-500 transition hover:bg-gray-50 hover:text-gray-900">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </Link>
<div className="min-w-0">
              <h1 className="text-xl font-black tracking-tight text-gray-900 sm:text-2xl">Analisa Konten</h1>
              <p className="text-sm text-gray-500">
                {data?.rangeLabel ?? "Memuat…"}
                {lastPulse ? (
                  <span className="ml-1 font-bold text-emerald-600">
                    · diperbarui {lastPulse.toLocaleTimeString("id-ID", {
                      hour: "2-digit", minute: "2-digit", second: "2-digit",
                    })}
                  </span>
                ) : (
                  data?.lastSyncedAt && (
                    <span className="ml-1 text-gray-400">
                      · sync terakhir {new Date(data.lastSyncedAt).toLocaleString("id-ID", {
                        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                  )
                )}
              </p>
            </div>

            <div className="ml-auto flex flex-shrink-0 items-center gap-2">
              {/*  Toggle realtime */}
              <button
                onClick={() => setLive((v) => !v)}
                title="Tarik ulang metrik otomatis tiap 60 detik"
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition ${
                  live
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-800"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${live ? "animate-pulse bg-emerald-500" : "bg-gray-300"}`} />
                {live ? "Realtime ON" : "Realtime"}
              </button>

              <button
                onClick={handleSyncAll}
                disabled={syncing}
                className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-gray-800 disabled:opacity-40"
              >
                {syncing ? "Menarik data…" : "↻ Sync Metrik"}
              </button>
            </div>
            <button
              onClick={handleSyncAll}
              disabled={syncing}
              className="ml-auto rounded-xl bg-gray-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-gray-800 disabled:opacity-40"
            >
              {syncing ? "Menarik data…" : "↻ Sync Metrik"}
            </button>
          </div>

          {/* ── Tab BRAND ── */}
          <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {BRAND_TABS.map((b) => {
              const active = brand === b.key;
              const bt = b.key !== "ALL" ? data?.byBrand?.[b.key] : undefined;
              return (
                <button
                  key={b.key}
                  onClick={() => setBrand(b.key)}
                  className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl border px-2 py-2.5 transition ${active
                    ? "border-gray-900 bg-gray-900 text-white shadow-sm"
                    : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-800"
                    }`}
                >
                  <span className="flex items-center gap-1.5 text-xs font-bold">
                    <span
                      className="h-2 w-2 flex-shrink-0 rounded-full ring-1 ring-white/40"
                      style={{ background: b.color }}
                    />
                    <span className="truncate">{b.label}</span>
                  </span>
                  {bt && (
                    <span className={`text-[10px] font-black tabular-nums ${active ? "text-white/70" : "text-gray-400"}`}>
                      {fmtCompact(bt.views)} view
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Rentang waktu ── */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {CC_RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition ${range === r.key
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-800"
                  }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* ── Custom date picker ── */}
          {range === "custom" && (
            <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-gray-50/70 p-3.5">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Dari Tanggal</label>
                <input
                  type="date"
                  value={from}
                  max={today}
                  onChange={(e) => setFrom(e.target.value)}
                  className="mt-1 block rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-800 outline-none transition focus:ring-4 focus:ring-gray-900/5"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Sampai Tanggal</label>
                <input
                  type="date"
                  value={to}
                  min={from}
                  max={today}
                  onChange={(e) => setTo(e.target.value)}
                  className="mt-1 block rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-800 outline-none transition focus:ring-4 focus:ring-gray-900/5"
                />
              </div>
              <button
                onClick={() => { setFrom(today); setTo(today); }}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-600 transition hover:bg-gray-50"
              >
                Reset ke hari ini
              </button>
              <p className="ml-auto text-[11px] text-gray-400">
                Isi tanggal yang sama untuk melihat 1 hari saja.
              </p>
            </div>
          )}

          {/* ── Filter platform ── */}
          <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {ANALISA_FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`flex items-center justify-center gap-1.5 rounded-2xl border px-2 py-2.5 text-xs font-bold transition ${active
                    ? "border-gray-900 bg-gray-900 text-white shadow-sm"
                    : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-800"
                    }`}
                >
                  <span className="h-2 w-2 flex-shrink-0 rounded-full ring-1 ring-white/40"
                    style={{ background: f.color }} />
                  <span className="truncate">{f.label}</span>
                </button>
              );
            })}
          </div>

          {/* ── Toolbar metrik ── */}
          <div className="mb-5 flex rounded-xl border border-gray-200 p-1">
            {(Object.keys(METRIC_META) as CCMetric[]).map((k) => (
              <button
                key={k}
                onClick={() => setMetric(k)}
                className={`flex-1 rounded-lg px-4 py-1.5 text-sm font-bold transition ${metric === k ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-50"
                  }`}
              >
                {METRIC_META[k].label}
              </button>
            ))}
          </div>

          {/* ── Hero: diagram batang ── */}
          <div className="mb-5 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
                  Total {m.label} · {BRAND_TABS.find((b) => b.key === brand)?.label} ·{" "}
                  {ANALISA_FILTERS.find((f) => f.key === filter)?.label}
                </p>
                <div className="mt-1 flex items-center gap-3">
                  <span className="text-3xl font-black tabular-nums tracking-tight text-gray-900 sm:text-4xl">
                    {fmtNum(totals[metric])}
                  </span>
                  {delta !== null && (
                    <span className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-black tabular-nums ${up ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                      }`}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="3"
                        style={{ transform: up ? "none" : "rotate(180deg)" }}>
                        <polyline points="4 15 12 7 20 15" />
                      </svg>
                      {Math.abs(delta).toFixed(1)}%
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  {data?.rangeLabel ?? "—"} · vs periode sebelumnya
                </p>
              </div>
              <div className="flex gap-4 text-right">
                <MiniStat label="Posting" value={fmtNum(totals.postCount)} />
                <MiniStat label="Konten" value={fmtNum(rows.length)} />
                <MiniStat label="Engagement" value={`${engagement.toFixed(1)}%`} />
              </div>
            </div>

            {loading ? (
              <div className="h-[340px] animate-pulse rounded-2xl bg-gray-50" />
            ) : barData.length === 0 ? (
              <EmptyState text="Belum ada posting pada filter & rentang ini." />
            ) : (
              <AnalisaHeroChart barData={barData} metricLabel={m.label} color={m.color} />
            )}
          </div>

          {/* ── Top 3 ── */}
          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {(Object.keys(METRIC_META) as CCMetric[]).map((k) => (
              <PodiumCard
                key={k}
                title={k === "comments" ? "Komen Terbanyak" : `${METRIC_META[k].short} Tertinggi`}
                color={METRIC_META[k].color}
                rows={top3(k)}
                metric={k}
                showBrand={brand === "ALL"}
                loading={loading}
              />
            ))}
          </div>

          {/* ── Rincian per konten × platform ── */}
          <div className="mb-5 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-black text-gray-900">Rincian per Konten &amp; Platform</h2>
              {detailRows.length > 0 && (
                <span className="text-[11px] font-bold text-gray-400">
                  {Math.min(visible, detailRows.length)} / {detailRows.length} konten
                </span>
              )}
            </div>

            {loading ? (
              <div className="h-48 animate-pulse rounded-2xl bg-gray-50" />
            ) : detailRows.length === 0 ? (
              <EmptyState text="Belum ada konten terposting pada filter ini." compact />
            ) : (
              <>
                <div className="space-y-3">
                  {detailRows.slice(0, visible).map((c) => {
                    const stats = Object.values(c.perPlatform).filter((s) => matchFilter(s.platform, filter));
                    const bm = BRAND_META[c.brand] ?? BRAND_META[DEFAULT_BRAND];
                    return (
                      <div key={c.report_id} className="rounded-2xl border border-gray-100 p-3.5">
                        <div className="mb-2.5 flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className={`flex-shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${bm.className}`}>
                              {bm.label}
                            </span>
                            <p className="truncate text-sm font-black text-gray-900">{c.title}</p>
                          </div>
                          <span className="flex-shrink-0 text-[11px] font-bold text-gray-400">
                            {stats.length} platform
                          </span>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {stats.map((s) => (
                            <div key={s.platform}
                              className="rounded-xl bg-gray-50/70 p-3 ring-1 ring-gray-100"
                              style={{ borderLeft: `3px solid ${PLATFORM_COLOR[s.platform] ?? "#6b7280"}` }}>
                              <div className="mb-2 flex items-center justify-between">
                                <span className="text-xs font-black text-gray-800">{s.platform}</span>
                                {s.post_url && (
                                  <a href={s.post_url} target="_blank" rel="noopener noreferrer"
                                    className="text-[10px] font-bold text-violet-600 hover:underline">
                                    Buka ↗
                                  </a>
                                )}
                              </div>
                              <div className="grid grid-cols-3 gap-1 text-center">
                                <MicroStat label="View" value={s.views} />
                                <MicroStat label="Like" value={s.likes} />
                                <MicroStat label="Komen" value={s.comments} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {visible < detailRows.length && (
                  <button
                    onClick={() => setVisible((v) => v + DETAIL_PAGE_SIZE)}
                    className="mt-4 w-full rounded-xl border border-gray-200 py-2.5 text-xs font-bold text-gray-600 transition hover:bg-gray-50"
                  >
                    Muat {Math.min(DETAIL_PAGE_SIZE, detailRows.length - visible)} konten lagi ↓
                  </button>
                )}
              </>
            )}
          </div>

          {/* ── Analisa proses pengerjaan ── */}
          <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-black text-gray-900">Analisa Proses Pengerjaan</h2>
                <p className="text-xs text-gray-400">
                  Durasi take → serah ke editor → editing, per konten (menit).
                </p>
              </div>
              <div className="flex flex-wrap gap-4 text-right">
                <MiniStat label="Rata Take" value={fmtMinutes(summary?.avgTake)} />
                <MiniStat label="Rata Serah" value={fmtMinutes(summary?.avgHandoff)} />
                <MiniStat label="Rata Edit" value={fmtMinutes(summary?.avgEdit)} />
                <MiniStat label="Rata Total" value={fmtMinutes(summary?.avgTotal)} />
              </div>
            </div>

            <div className="mb-3 flex flex-wrap gap-3">
              {PROCESS_SEGMENTS.map((s) => (
                <span key={s.key} className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
                  {s.label}
                </span>
              ))}
            </div>

            {loading ? (
              <div className="h-[300px] animate-pulse rounded-2xl bg-gray-50" />
            ) : processData.length === 0 ? (
              <EmptyState text="Belum ada konten dengan jam take / edit terisi." compact />
            ) : (
              <AnalisaProcessChart processData={processData} />
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

/* ── Sub-komponen ─────────────────────────────────────────────────────────── */

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</p>
      <p className="text-lg font-black tabular-nums text-gray-900">{value}</p>
    </div>
  );
}

function MicroStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-sm font-black tabular-nums text-gray-900">{fmtCompact(value)}</p>
    </div>
  );
}

function EmptyState({ text, compact }: { text: string; compact?: boolean }) {
  return <p className={`text-center text-sm text-gray-400 ${compact ? "py-12" : "py-24"}`}>{text}</p>;
}

function PodiumCard({
  title, color, rows, metric, loading, showBrand,
}: {
  title: string;
  color: string;
  rows: Row[];
  metric: CCMetric;
  loading: boolean;
  showBrand: boolean;
}) {
  const max = rows[0]?.[metric] ?? 0;
  return (
    <div className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">{title}</p>
      </div>

      {loading ? (
        <div className="h-28 animate-pulse rounded-xl bg-gray-50" />
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-xs text-gray-400">Belum ada data.</p>
      ) : (
        <div className="space-y-2.5">
          {rows.map((r, i) => {
            const bm = BRAND_META[r.brand] ?? BRAND_META[DEFAULT_BRAND];
            return (
              <div key={r.report_id}>
                <div className="mb-1 flex items-center gap-2">
                  <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md text-[10px] font-black ${i === 0 ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"
                    }`}>
                    {i + 1}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-xs font-bold text-gray-800">{r.title}</p>
                  <span className="flex-shrink-0 text-sm font-black tabular-nums text-gray-900">
                    {fmtCompact(r[metric])}
                  </span>
                </div>
                <div className="ml-7 h-1.5 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${max ? (r[metric] / max) * 100 : 0}%`, background: color }} />
                </div>
                <p className="ml-7 mt-0.5 flex items-center gap-1 truncate text-[10px] text-gray-400">
                  {showBrand && (
                    <span className="flex-shrink-0 font-bold" style={{ color: bm.color }}>
                      {bm.label}
                    </span>
                  )}
                  {showBrand && <span>·</span>}
                  <span className="truncate">{r.platforms.join(" · ")}</span>
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

