"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Check,
  LayoutDashboard,
  Loader2,
  Pencil,
  Plus,
  TrendingUp,
  Trash2,
} from "lucide-react";
import { LineTrendChart } from "@/components/ui/LineTrendChart";
import { BarRankingChart } from "@/components/ui/BarRankingChart";
import { makeLocalId, type InsightRow, type InsightSheet } from "@/lib/marketing-insight";

// Deteksi sheet IG/TikTok dari NAMA tabel (case-insensitive). Sheet lain → null (grid Excel).
export function detectSocialPlatform(name: string): "tiktok" | "instagram" | null {
  const n = (name || "").toLowerCase();
  if (n.includes("tiktok")) return "tiktok";
  if (n.includes("instagram")) return "instagram";
  return null;
}

// type "sum" = metrik arus (dijumlah antar-snapshot); "total" = stok (ambil snapshot terbaru).
type MetricType = "sum" | "total";
interface MetricDef { key: string; label: string; type: MetricType; color: string; }
interface BreakdownField { key: string; label: string; color: string; }
// mode "percent" = tim isi persen langsung (ambil snapshot terbaru); "count" = isi angka (dijumlah → %).
interface BreakdownDef { key: string; title: string; mode: "percent" | "count"; fields: BreakdownField[]; }
interface PlatformConfig { label: string; metrics: MetricDef[]; breakdowns: BreakdownDef[]; }

const CONFIG: Record<"tiktok" | "instagram", PlatformConfig> = {
  tiktok: {
    label: "TikTok Studio",
    metrics: [
      { key: "views", label: "Video Views", type: "sum", color: "#2563EB" },
      { key: "profile_views", label: "Profile Views", type: "sum", color: "#0891B2" },
      { key: "likes", label: "Likes", type: "sum", color: "#DB2777" },
      { key: "comments", label: "Comments", type: "sum", color: "#D97706" },
      { key: "shares", label: "Shares", type: "sum", color: "#059669" },
      { key: "followers", label: "Followers", type: "total", color: "#7C3AED" },
    ],
    breakdowns: [
      {
        key: "traffic",
        title: "Sumber Traffic",
        mode: "percent",
        fields: [
          { key: "tr_foryou", label: "For You", color: "#2563EB" },
          { key: "tr_search", label: "Search", color: "#0891B2" },
          { key: "tr_profile", label: "Personal profile", color: "#D97706" },
          { key: "tr_following", label: "Following", color: "#059669" },
          { key: "tr_sound", label: "Sound", color: "#7C3AED" },
        ],
      },
    ],
  },
  instagram: {
    label: "IG Professional Dashboard",
    metrics: [
      { key: "views", label: "Views", type: "sum", color: "#DB2777" },
      { key: "interactions", label: "Interactions", type: "sum", color: "#7C3AED" },
      { key: "accounts_engaged", label: "Accounts Engaged", type: "sum", color: "#C026D3" },
      { key: "profile_visits", label: "Profile Visits", type: "sum", color: "#2563EB" },
      { key: "link_taps", label: "External Link Taps", type: "sum", color: "#0891B2" },
      { key: "followers", label: "Followers", type: "total", color: "#059669" },
    ],
    breakdowns: [
      {
        key: "views_content",
        title: "Views · Jenis Konten",
        mode: "percent",
        fields: [
          { key: "vc_reels", label: "Reels", color: "#7C3AED" },
          { key: "vc_stories", label: "Stories", color: "#C026D3" },
          { key: "vc_posts", label: "Posts", color: "#DB2777" },
        ],
      },
      {
        key: "views_source",
        title: "Views · Sumber",
        mode: "count",
        fields: [
          { key: "vs_ig", label: "Instagram", color: "#DB2777" },
          { key: "vs_fb", label: "Facebook", color: "#2563EB" },
        ],
      },
      {
        key: "int_content",
        title: "Interactions · Jenis Konten",
        mode: "percent",
        fields: [
          { key: "ic_reels", label: "Reels", color: "#7C3AED" },
          { key: "ic_stories", label: "Stories", color: "#C026D3" },
          { key: "ic_posts", label: "Posts", color: "#DB2777" },
        ],
      },
    ],
  },
};

interface StoreDef { key: string; label: string; }
const STORES: StoreDef[] = [
  { key: "solit", label: "Solit" },
  { key: "sotech", label: "Sotech" },
  { key: "onpoint", label: "On Point" },
  { key: "sultop", label: "Sultop" },
];

// 7/14/30 hari → berapa snapshot mingguan terakhir yang dihitung (1 snapshot ≈ 7 hari).
const PERIODS = [
  { key: 7, label: "7 Hari", snaps: 1 },
  { key: 14, label: "14 Hari", snaps: 2 },
  { key: 30, label: "30 Hari", snaps: 4 },
] as const;

const isSnapshotRow = (r: InsightRow) => Boolean(r.cells?.__store && r.cells?.__date);

const num = (v: string | undefined): number => {
  const n = parseFloat(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const sumField = (rows: InsightRow[], key: string) => rows.reduce((s, r) => s + num(r.cells[key]), 0);

// Hanya izinkan angka & satu titik desimal (huruf/simbol otomatis dibuang saat ketik).
const onlyNumeric = (v: string): string => {
  let s = v.replace(/[^\d.]/g, "");
  const i = s.indexOf(".");
  if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, "");
  return s;
};
function fmtCompact(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return (v / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (abs >= 1_000) return (v / 1_000).toFixed(abs >= 10_000 ? 0 : 1).replace(/\.0$/, "") + "K";
  return String(Math.round(v));
}
const fmtFull = (v: number) => v.toLocaleString("id-ID");

function fmtDateShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

function DeltaChip({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-[10px] font-semibold text-gray-300">—</span>;
  const up = delta >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${up ? "text-emerald-600" : "text-red-500"}`}>
      {up ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
      {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

function BreakdownPanel({
  title,
  mode,
  rows,
}: {
  title: string;
  mode: "percent" | "count";
  rows: { label: string; value: number; color: string }[];
}) {
  const sum = rows.reduce((s, r) => s + r.value, 0);
  const empty = rows.every((r) => r.value === 0);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-violet-500" />
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      </div>
      <div className="p-4 sm:p-5 space-y-3">
        {empty ? (
          <p className="text-xs text-gray-400">Belum ada data.</p>
        ) : (
          rows.map((r) => {
            const pct = mode === "percent" ? r.value : sum > 0 ? (r.value / sum) * 100 : 0;
            const w = Math.min(100, Math.max(0, pct));
            return (
              <div key={r.label}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-gray-600">{r.label}</span>
                  <span className="text-gray-400 tabular-nums">
                    {mode === "percent" ? `${r.value.toFixed(1)}%` : `${fmtFull(r.value)} · ${pct.toFixed(1)}%`}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${w}%`, backgroundColor: r.color }} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function MarketingSocialInsight({
  sheet,
  platform,
  onMutate,
  saveState,
}: {
  sheet: InsightSheet;
  platform: "tiktok" | "instagram";
  onMutate: (updater: (s: InsightSheet) => InsightSheet) => void;
  saveState: "idle" | "saving" | "saved" | "error";
}) {
  const config = CONFIG[platform];
  const metrics = config.metrics;
  // Semua key field (metrik + breakdown) — dipakai saat simpan & load draft.
  const allFieldKeys = useMemo(
    () => [...metrics.map((m) => m.key), ...config.breakdowns.flatMap((b) => b.fields.map((f) => f.key))],
    [config, metrics]
  );

  const [view, setView] = useState<"dashboard" | "input">("dashboard");
  const [store, setStore] = useState<string>(STORES[0].key);
  const [period, setPeriod] = useState<number>(7);
  const [primaryMetric, setPrimaryMetric] = useState<string>(metrics[0].key);
  const primaryDef = metrics.find((m) => m.key === primaryMetric) ?? metrics[0];

  const snapsCount = PERIODS.find((p) => p.key === period)?.snaps ?? 1;

  const snaps = useMemo(
    () =>
      (sheet.rows || [])
        .filter(isSnapshotRow)
        .filter((r) => r.cells.__store === store)
        .sort((a, b) => ((a.cells.__date ?? "") < (b.cells.__date ?? "") ? -1 : 1)),
    [sheet.rows, store]
  );

  const windowSnaps = snaps.slice(Math.max(0, snaps.length - snapsCount));
  const prevSnaps = snaps.slice(Math.max(0, snaps.length - snapsCount * 2), Math.max(0, snaps.length - snapsCount));

  const metricValue = (rows: InsightRow[], m: MetricDef): number => {
    if (rows.length === 0) return 0;
    if (m.type === "total") return num(rows[rows.length - 1].cells[m.key]);
    return rows.reduce((s, r) => s + num(r.cells[m.key]), 0);
  };

  const cards = metrics.map((m) => {
    const cur = metricValue(windowSnaps, m);
    const prev = metricValue(prevSnaps, m);
    const delta = prev > 0 ? ((cur - prev) / prev) * 100 : null;
    return { m, cur, delta };
  });

  // Breakdown (ala IG/TikTok): percent → snapshot terbaru; count → dijumlah di window.
  const breakdownData = config.breakdowns.map((bd) => ({
    ...bd,
    rows: bd.fields.map((f) => ({
      label: f.label,
      color: f.color,
      value:
        bd.mode === "percent"
          ? windowSnaps.length
            ? num(windowSnaps[windowSnaps.length - 1].cells[f.key])
            : 0
          : sumField(windowSnaps, f.key),
    })),
  }));

  const trend = useMemo(() => {
    const last = snaps.slice(Math.max(0, snaps.length - 8));
    return {
      labels: last.map((r) => fmtDateShort(r.cells.__date ?? "")),
      data: last.map((r) => num(r.cells[primaryDef.key])),
    };
  }, [snaps, primaryDef.key]);

  const storeCompare = useMemo(
    () =>
      STORES.map((st) => {
        const rows = (sheet.rows || [])
          .filter(isSnapshotRow)
          .filter((r) => r.cells.__store === st.key)
          .sort((a, b) => ((a.cells.__date ?? "") < (b.cells.__date ?? "") ? -1 : 1));
        const win = rows.slice(Math.max(0, rows.length - snapsCount));
        return metricValue(win, primaryDef);
      }),
    [sheet.rows, snapsCount, primaryDef]
  );

  // ── Form Input ──
  const todayWib = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const [draftDate, setDraftDate] = useState(todayWib);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const loadToDraft = (r: InsightRow) => {
    setDraftDate(r.cells.__date ?? todayWib);
    const d: Record<string, string> = {};
    for (const k of allFieldKeys) d[k] = r.cells[k] ?? "";
    setDraft(d);
    setView("input");
  };

  const saveSnapshot = () => {
    if (!draftDate) return;
    onMutate((s) => {
      const rows = [...(s.rows || [])];
      const idx = rows.findIndex(
        (r) => isSnapshotRow(r) && r.cells.__store === store && r.cells.__date === draftDate
      );
      const cells: Record<string, string> = { __store: store, __date: draftDate };
      for (const k of allFieldKeys) cells[k] = (draft[k] ?? "").toString();
      if (idx === -1) rows.push({ id: makeLocalId("snap"), cells });
      else rows[idx] = { ...rows[idx], cells: { ...rows[idx].cells, ...cells } };
      return { ...s, rows };
    });
    setDraft({});
    setDraftDate(todayWib);
  };

  const deleteSnapshot = (id: string) => {
    if (!window.confirm("Hapus snapshot ini?")) return;
    onMutate((s) => ({ ...s, rows: (s.rows || []).filter((r) => r.id !== id) }));
  };

  const storeLabel = STORES.find((s) => s.key === store)?.label ?? store;
  const hasData = snaps.length > 0;

  return (
    <div className="space-y-4">
      {/* Kontrol */}
      <div className="rounded-3xl bg-white border border-gray-100 shadow-sm ring-1 ring-gray-50 px-4 py-3.5 sm:px-5 sm:py-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex items-center bg-gray-50 border border-gray-200 rounded-full p-0.5 h-10">
              <button
                onClick={() => setView("dashboard")}
                className={`inline-flex items-center gap-1 px-3 h-9 rounded-full text-xs font-semibold ${view === "dashboard" ? "bg-violet-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" /> Dashboard
              </button>
              <button
                onClick={() => setView("input")}
                className={`inline-flex items-center gap-1 px-3 h-9 rounded-full text-xs font-semibold ${view === "input" ? "bg-violet-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                <Pencil className="w-3.5 h-3.5" /> Input
              </button>
            </div>

            <div className="inline-flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-full p-0.5 overflow-x-auto">
              {STORES.map((st) => (
                <button
                  key={st.key}
                  onClick={() => setStore(st.key)}
                  className={`shrink-0 px-3 h-9 rounded-full text-xs font-semibold transition-colors ${store === st.key ? "bg-gray-900 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {view === "dashboard" ? (
            <div className="inline-flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-full p-0.5 shrink-0">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={`px-3 h-9 rounded-full text-xs font-semibold ${period === p.key ? "bg-violet-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-[11px] inline-flex items-center gap-1.5 text-gray-400 shrink-0">
              {saveState === "saving" && (<><Loader2 className="w-3 h-3 animate-spin" /> Menyimpan…</>)}
              {saveState === "saved" && (<><Check className="w-3 h-3 text-emerald-500" /> Tersimpan</>)}
            </span>
          )}
        </div>
      </div>

      {/* ───────── DASHBOARD ───────── */}
      {view === "dashboard" && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
            {cards.map(({ m, cur, delta }) => {
              const active = m.key === primaryDef.key;
              return (
                <button
                  key={m.key}
                  onClick={() => setPrimaryMetric(m.key)}
                  title={`${m.label}: ${fmtFull(cur)} — klik untuk lihat tren`}
                  className={`text-left bg-white rounded-2xl border px-3.5 py-3 shadow-sm transition-all ${active ? "border-violet-400 ring-2 ring-violet-500/20" : "border-gray-100 hover:border-gray-200"}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-semibold tracking-wide text-gray-500 uppercase truncate">{m.label}</span>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                  </div>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1 tabular-nums">{fmtCompact(cur)}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <DeltaChip delta={delta} />
                    <span className="text-[10px] text-gray-400">vs {period} hari sblm</span>
                  </div>
                </button>
              );
            })}
          </div>

          {!hasData ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-14 flex flex-col items-center text-center px-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-50 to-fuchsia-50 flex items-center justify-center mb-3 ring-1 ring-violet-100/60">
                <BarChart3 className="w-6 h-6 text-violet-300" />
              </div>
              <p className="text-sm font-medium text-gray-700">Belum ada data untuk {storeLabel}</p>
              <p className="text-xs text-gray-400 mt-1 max-w-[320px]">
                Klik tombol <b>Input</b> untuk menyalin angka dari {config.label} ke sini.
              </p>
              <button
                onClick={() => setView("input")}
                className="mt-4 inline-flex items-center gap-1.5 h-10 px-4 rounded-full text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700"
              >
                <Plus className="w-4 h-4" /> Isi data
              </button>
            </div>
          ) : (
            <>
              {/* Panel breakdown ala IG/TikTok */}
              {breakdownData.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {breakdownData.map((bd) => (
                    <BreakdownPanel key={bd.key} title={bd.title} mode={bd.mode} rows={bd.rows} />
                  ))}
                </div>
              )}

              {/* Tren metrik utama */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 sm:px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-violet-500" />
                  <h3 className="text-sm font-bold text-gray-900">Tren {primaryDef.label} · {storeLabel}</h3>
                  <span className="ml-auto text-[11px] text-gray-400">per snapshot mingguan</span>
                </div>
                <div className="p-3 sm:p-4">
                  <div className="max-w-3xl mx-auto">
                    <LineTrendChart labels={trend.labels} data={trend.data} color={primaryDef.color} formatValue={fmtFull} />
                  </div>
                </div>
              </div>

              {/* Perbandingan antar toko */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 sm:px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-violet-500" />
                  <h3 className="text-sm font-bold text-gray-900">Perbandingan Antar Toko · {primaryDef.label}</h3>
                  <span className="ml-auto text-[11px] text-gray-400">periode {period} hari</span>
                </div>
                <div className="p-3 sm:p-4">
                  <div className="max-w-3xl mx-auto">
                    <BarRankingChart
                      labels={STORES.map((s) => s.label)}
                      series={[
                        {
                          key: primaryDef.key,
                          label: primaryDef.label,
                          color: primaryDef.color,
                          data: storeCompare,
                          formatValue: fmtFull,
                        },
                      ]}
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ───────── INPUT ───────── */}
      {view === "input" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-gray-100 bg-gradient-to-r from-violet-50/60 to-fuchsia-50/40">
            <h3 className="text-sm font-bold text-gray-900">Input Snapshot · {storeLabel}</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Buka {config.label}, pilih <b>Last 7 days</b>, lalu salin angkanya. Pilih tanggal rekap (akhir periode 7 hari).
            </p>
          </div>

          <div className="p-4 sm:p-5 space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-gray-500">Tanggal Rekap</span>
                <input
                  type="date"
                  value={draftDate}
                  onChange={(e) => setDraftDate(e.target.value)}
                  className="h-10 px-3 rounded-xl bg-gray-50 border border-gray-200 text-sm font-semibold text-gray-800 outline-none focus:border-violet-400 focus:bg-white"
                />
              </label>
            </div>

            {/* Metrik utama */}
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">Metrik Utama</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {metrics.map((m) => (
                  <label key={m.key} className="flex flex-col gap-1">
                    <span className="text-[11px] font-semibold text-gray-500 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.color }} />
                      {m.label}
                    </span>
                    <input
                                        inputMode="decimal"
                      value={draft[m.key] ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, [m.key]: onlyNumeric(e.target.value) }))}
                      placeholder="0"
                      className="h-10 px-3 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-800 tabular-nums outline-none focus:border-violet-400 focus:bg-white"
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* Breakdown */}
            {config.breakdowns.map((bd) => (
              <div key={bd.key}>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">
                  {bd.title} {bd.mode === "percent" && <span className="normal-case font-semibold text-gray-300">(isi dalam %)</span>}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {bd.fields.map((f) => (
                    <label key={f.key} className="flex flex-col gap-1">
                      <span className="text-[11px] font-semibold text-gray-500 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: f.color }} />
                        {f.label}
                      </span>
                      <input
                                               inputMode="decimal"
                        value={draft[f.key] ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, [f.key]: onlyNumeric(e.target.value) }))}
                        placeholder="0"
                        className="h-10 px-3 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-800 tabular-nums outline-none focus:border-violet-400 focus:bg-white"
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <button
              onClick={saveSnapshot}
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full text-sm font-semibold bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white shadow-sm shadow-violet-300/40 hover:opacity-95"
            >
              <Check className="w-4 h-4" /> Simpan Snapshot
            </button>
          </div>

          {/* Riwayat snapshot */}
          <div className="border-t border-gray-100">
            <div className="px-4 sm:px-5 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              Riwayat ({snaps.length})
            </div>
            {snaps.length === 0 ? (
              <p className="px-4 sm:px-5 pb-4 text-xs text-gray-400">Belum ada snapshot.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500">
                      <th className="text-left font-semibold px-3 py-2 whitespace-nowrap">Tanggal</th>
                      {metrics.map((m) => (
                        <th key={m.key} className="text-right font-semibold px-3 py-2 whitespace-nowrap">{m.label}</th>
                      ))}
                      <th className="px-3 py-2 w-16" />
                    </tr>
                  </thead>
                  <tbody>
                    {[...snaps].reverse().map((r) => (
                      <tr key={r.id} className="border-t border-gray-100 hover:bg-violet-50/40">
                        <td className="px-3 py-2 font-semibold text-gray-700 whitespace-nowrap">{fmtDateShort(r.cells.__date ?? "")}</td>
                        {metrics.map((m) => (
                          <td key={m.key} className="px-3 py-2 text-right tabular-nums text-gray-700">
                            {num(r.cells[m.key]).toLocaleString("id-ID")}
                          </td>
                        ))}
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => loadToDraft(r)} title="Edit" className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-violet-600 hover:bg-violet-50">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deleteSnapshot(r.id)} title="Hapus" className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}