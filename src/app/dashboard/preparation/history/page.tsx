"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { fmtDistance } from "@/lib/geo";
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  BarController, BarElement, LineController, LineElement, PointElement, Tooltip, Legend,
} from "chart.js";
import { useRef } from "react";
ChartJS.register(CategoryScale, LinearScale, BarController, BarElement, LineController, LineElement, PointElement, Tooltip, Legend);

interface Trip {
  id: string; order_number: string; customer_name: string;
  delivery_user_id: string | null; delivery_user_name: string | null;
  delivery_address: string | null; status: string;
  delivery_started_at: string | null; delivered_at: string | null;
  return_started_at: string | null; returned_at: string | null;
  tracked_distance_m: number; plan_distance_m: number | null;
  dur_antar_s: number | null; dur_pulang_s: number | null;
  avg_speed_kmh: number | null; max_speed_kmh: number | null;
  stops: number; point_count: number;
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtFull = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const fmtShort = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });

function fmtDur(s: number | null): string {
  if (s == null) return "—";
  if (s < 60) return `${Math.round(s)} dtk`;
  const m = Math.floor(s / 60), sec = Math.round(s % 60);
  if (m < 60) return sec ? `${m}m ${sec}d` : `${m} mnt`;
  const h = Math.floor(m / 60);
  return `${h}j ${m % 60}m`;
}

export default function PreparationHistoryPage() {
  const today = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(() => ymd(new Date(Date.now() - 30 * 86400000)));
  const [to, setTo] = useState(() => ymd(today));
  const [driverFilter, setDriverFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  const [trips, setTrips] = useState<Trip[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const fromIso = from ? new Date(`${from}T00:00:00`).toISOString() : "";
      const toIso = to ? new Date(`${to}T23:59:59`).toISOString() : "";
      const qs = new URLSearchParams();
      if (fromIso) qs.set("from", fromIso);
      if (toIso) qs.set("to", toIso);
      const res = await fetch(`/api/preparation/history?${qs.toString()}`);
      const r = await res.json();
      setTrips(r.success ? r.trips : []);
    } catch { setTrips([]); } finally { setIsLoading(false); }
  }, [from, to]);
  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const setPreset = (days: number) => {
    setFrom(ymd(new Date(Date.now() - days * 86400000)));
    setTo(ymd(new Date()));
  };

  const driverOptions = useMemo(() => {
    const map = new Map<string, string>();
    trips.forEach((t) => { if (t.delivery_user_id) map.set(t.delivery_user_id, t.delivery_user_name || "—"); });
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [trips]);

  const filtered = useMemo(() => {
    let list = trips;
    if (driverFilter !== "ALL") list = list.filter((t) => t.delivery_user_id === driverFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) =>
        t.order_number.toLowerCase().includes(q) ||
        t.customer_name.toLowerCase().includes(q) ||
        (t.delivery_user_name || "").toLowerCase().includes(q) ||
        (t.delivery_address || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [trips, driverFilter, search]);

  const totals = useMemo(() => ({
    trips: filtered.length,
    completed: filtered.filter((t) => t.delivered_at).length,
    distance: filtered.reduce((s, t) => s + t.tracked_distance_m, 0),
    antar: filtered.reduce((s, t) => s + (t.dur_antar_s || 0), 0),
    stops: filtered.reduce((s, t) => s + t.stops, 0),
  }), [filtered]);

  const leaderboard = useMemo(() => {
    const map = new Map<string, { name: string; trips: number; distance: number; antar: number; stops: number; completed: number }>();
    for (const t of filtered) {
      const key = t.delivery_user_id ?? "unknown";
      const agg = map.get(key) ?? { name: t.delivery_user_name ?? "—", trips: 0, distance: 0, antar: 0, stops: 0, completed: 0 };
      agg.trips += 1; agg.distance += t.tracked_distance_m; agg.antar += t.dur_antar_s || 0;
      agg.stops += t.stops; if (t.delivered_at) agg.completed += 1;
      map.set(key, agg);
    }
    return [...map.values()].sort((a, b) => b.trips - a.trips);
  }, [filtered]);

  // ── data harian buat grafik ──
  const daily = useMemo(() => {
    const map = new Map<string, { trips: number; distance: number }>();
    for (const t of filtered) {
      if (!t.delivery_started_at) continue;
      const d = ymd(new Date(t.delivery_started_at));
      const agg = map.get(d) ?? { trips: 0, distance: 0 };
      agg.trips += 1; agg.distance += t.tracked_distance_m;
      map.set(d, agg);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  // ── render chart pakai Chart.js murni (mixed bar+line) ──
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<ChartJS | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    chartRef.current?.destroy(); // buang instance lama sebelum gambar ulang

    chartRef.current = new ChartJS(canvasRef.current, {
      type: "bar",
      data: {
        labels: daily.map(([d]) => fmtShort(d)),
        datasets: [
          { type: "bar", label: "Trip", data: daily.map(([, v]) => v.trips), backgroundColor: "rgba(37,99,235,0.75)", borderRadius: 6, yAxisID: "y" },
          { type: "line", label: "Jarak (km)", data: daily.map(([, v]) => +(v.distance / 1000).toFixed(1)), borderColor: "#f97316", backgroundColor: "#f97316", tension: 0.3, pointRadius: 3, yAxisID: "y1" },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "top", labels: { boxWidth: 12, font: { size: 11 } } } },
        scales: {
          y: { type: "linear", position: "left", beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: "Trip" } },
          y1: { type: "linear", position: "right", beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: "km" } },
        },
      },
    });

    return () => { chartRef.current?.destroy(); chartRef.current = null; };
  }, [daily]);

  const exportCSV = () => {
    const head = ["No Order", "Customer", "Pengantar", "Alamat", "Mulai", "Sampai", "Jarak (km)", "Durasi Antar", "Durasi Pulang", "Berhenti", "Avg (km/j)", "Max (km/j)", "Status"];
    const rows = filtered.map((t) => [
      t.order_number, t.customer_name, t.delivery_user_name ?? "", (t.delivery_address ?? "").replace(/[\n,]/g, " "),
      fmtFull(t.delivery_started_at), fmtFull(t.delivered_at),
      (t.tracked_distance_m / 1000).toFixed(2), fmtDur(t.dur_antar_s), fmtDur(t.dur_pulang_s),
      String(t.stops), t.avg_speed_kmh != null ? Math.round(t.avg_speed_kmh).toString() : "",
      t.max_speed_kmh != null ? Math.round(t.max_speed_kmh).toString() : "", t.status,
    ]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `riwayat-pengantaran-${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const inputCls = "h-9 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition";

  const SUMMARY = [
    { label: "Total Trip", value: totals.trips, sub: `${totals.completed} selesai`, color: "from-blue-50 to-blue-100/50 border-blue-200 text-blue-700", icon: "🛵" },
    { label: "Total Jarak", value: fmtDistance(totals.distance), sub: "akumulasi", color: "from-violet-50 to-violet-100/50 border-violet-200 text-violet-700", icon: "📏" },
    { label: "Total Waktu Antar", value: fmtDur(totals.antar), sub: "berangkat→sampai", color: "from-emerald-50 to-emerald-100/50 border-emerald-200 text-emerald-700", icon: "⏱️" },
    { label: "Total Berhenti", value: totals.stops, sub: "≥45 dtk", color: "from-amber-50 to-amber-100/50 border-amber-200 text-amber-700", icon: "⏸️" },
  ];

  return (
    <DashboardLayout>
      <main className="min-h-screen bg-[#F7F7F8] p-4 sm:p-6 lg:p-8">
        <div className="max-w-5xl mx-auto space-y-5">
          <Link href="/dashboard/preparation" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Kembali ke Penyiapan
          </Link>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 bg-gray-800 rounded-2xl flex items-center justify-center shadow-lg shadow-gray-800/25 flex-shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M3 3v5h5" /><path d="M3.05 13A9 9 0 1021 12a9 9 0 00-8.83 7.5" /></svg>
              </div>
              <div>
                <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none">Riwayat Pengantaran</h1>
                <p className="text-xs text-gray-400 mt-0.5 font-medium">Laporan perjalanan, kecepatan, & titik berhenti pengantar</p>
              </div>
            </div>
            <button onClick={exportCSV} disabled={filtered.length === 0}
              className="inline-flex items-center gap-2 h-9 px-4 bg-emerald-600 rounded-xl text-sm font-semibold text-white hover:bg-emerald-700 active:scale-[0.97] transition shadow-lg shadow-emerald-800/25 disabled:opacity-40">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
              Export CSV
            </button>
          </div>

          {/* Filter + preset */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {[{ l: "Hari ini", d: 0 }, { l: "7 Hari", d: 7 }, { l: "30 Hari", d: 30 }, { l: "90 Hari", d: 90 }].map((p) => (
                <button key={p.l} onClick={() => setPreset(p.d)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition">{p.l}</button>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Dari</label>
                <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Sampai</label>
                <input type="date" value={to} min={from} max={ymd(today)} onChange={(e) => setTo(e.target.value)} className={inputCls} />
              </div>
              <div className="min-w-[160px]">
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Pengantar</label>
                <select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)} className={`${inputCls} w-full`}>
                  <option value="ALL">Semua Pengantar</option>
                  {driverOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="flex-1 min-w-[180px]">
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Cari</label>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="No order / customer / alamat..." className={`${inputCls} w-full`} />
              </div>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {SUMMARY.map((s) => (
              <div key={s.label} className={`bg-gradient-to-br ${s.color} border rounded-2xl p-3`}>
                <div className="flex items-center justify-between">
                  <span className="text-lg">{s.icon}</span>
                  <span className="text-xl font-black tabular-nums">{s.value}</span>
                </div>
                <p className="text-[11px] font-bold uppercase tracking-wide mt-1 opacity-80">{s.label}</p>
                <p className="text-[10px] opacity-60 mt-0.5">{s.sub}</p>
              </div>
            ))}
          </div>

          {/* Grafik tren harian */}
          {daily.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <h2 className="text-sm font-bold text-gray-800 mb-3">📈 Tren Pengantaran Harian</h2>
              <div style={{ height: 250 }}>
                <canvas ref={canvasRef} />
              </div>
            </div>
          )}

          {/* Leaderboard pengantar */}
          {leaderboard.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <h2 className="text-sm font-bold text-gray-800 mb-3">🏆 Rekap per Pengantar</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {leaderboard.map((d, i) => (
                  <div key={i} className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl p-3">
                    <span className="w-9 h-9 rounded-full bg-violet-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">{d.name.charAt(0).toUpperCase()}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-gray-800 truncate">{d.name}</p>
                      <div className="flex flex-wrap gap-1.5 mt-1 text-[10px] font-bold">
                        <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{d.trips} trip</span>
                        <span className="bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded">{fmtDistance(d.distance)}</span>
                        <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">{fmtDur(d.antar)}</span>
                        <span className="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">{d.stops}× berhenti</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Daftar trip */}
          {isLoading ? (
            <div className="space-y-2.5">{[1, 2, 3].map((i) => <div key={i} className="h-28 bg-white rounded-2xl border border-gray-100 animate-pulse" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
              <div className="text-4xl mb-3 opacity-40">🗺️</div>
              <p className="text-gray-500 text-sm font-medium">Belum ada riwayat pengantaran di rentang ini</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filtered.map((t) => {
                const inProgress = !t.delivered_at;
                return (
                  <Link key={t.id} href={`/dashboard/preparation/${t.id}`}
                    className="block bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md hover:border-gray-200 transition">
                    <div className="flex items-start justify-between gap-3 mb-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="font-mono text-xs font-bold text-gray-700">{t.order_number}</span>
                          {inProgress
                            ? <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-violet-500 text-white animate-pulse">BERLANGSUNG</span>
                            : <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-500 text-white">SELESAI</span>}
                          {t.returned_at && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 border border-orange-200">PP ✓</span>}
                        </div>
                        <p className="text-base font-black text-gray-900 leading-tight">{t.customer_name}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">🛵 {t.delivery_user_name || "—"}{t.delivery_address ? ` · 📍 ${t.delivery_address}` : ""}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[10px] text-gray-400">{fmtFull(t.delivery_started_at)}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 text-center">
                      <div className="bg-gray-50 rounded-lg py-1.5"><p className="text-[9px] text-gray-400 font-bold uppercase">Jarak</p><p className="text-xs font-black text-gray-800">{t.tracked_distance_m > 0 ? fmtDistance(t.tracked_distance_m) : "—"}</p></div>
                      <div className="bg-gray-50 rounded-lg py-1.5"><p className="text-[9px] text-gray-400 font-bold uppercase">Antar</p><p className="text-xs font-black text-gray-800">{fmtDur(t.dur_antar_s)}</p></div>
                      <div className="bg-gray-50 rounded-lg py-1.5"><p className="text-[9px] text-gray-400 font-bold uppercase">Pulang</p><p className="text-xs font-black text-gray-800">{fmtDur(t.dur_pulang_s)}</p></div>
                      <div className="bg-blue-50 rounded-lg py-1.5"><p className="text-[9px] text-blue-400 font-bold uppercase">Avg</p><p className="text-xs font-black text-blue-700">{t.avg_speed_kmh != null ? `${Math.round(t.avg_speed_kmh)}` : "—"}</p></div>
                      <div className="bg-violet-50 rounded-lg py-1.5"><p className="text-[9px] text-violet-400 font-bold uppercase">Max</p><p className="text-xs font-black text-violet-700">{t.max_speed_kmh != null ? `${Math.round(t.max_speed_kmh)}` : "—"}</p></div>
                      <div className={`rounded-lg py-1.5 ${t.stops > 0 ? "bg-amber-50" : "bg-gray-50"}`}><p className={`text-[9px] font-bold uppercase ${t.stops > 0 ? "text-amber-400" : "text-gray-400"}`}>Berhenti</p><p className={`text-xs font-black ${t.stops > 0 ? "text-amber-700" : "text-gray-700"}`}>{t.stops}×</p></div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </DashboardLayout>
  );
}