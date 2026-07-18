"use client";

import { useEffect, useState, useCallback, useMemo, type ReactNode } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Trophy, Medal, Award, Clock, X, Inbox } from "lucide-react";

interface ProviderJob {
  id: string;
  order_number: string;
  customer_name: string;
  received_at: string | null;
  done_at: string;
  duration_hours: number | null;
}

interface ProviderPerformance {
  id: string;
  name: string;
  role: string;
  total_pekerjaan: number;
  jam_terbang: number;
  rata_rata: number | null;
  jobs: ProviderJob[];
}

type PresetKey = "today" | "7d" | "month" | "3m" | "1y" | "all" | "custom";

const pad2 = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const localMidnightISO = (s: string) => new Date(`${s}T00:00:00`).toISOString();
const nextDayISO = (s: string) => {
  const d = new Date(`${s}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
};
const fmtRangeDate = (s: string) =>
  new Date(`${s}T00:00:00`).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtHours = (h: number | null) => {
  if (h == null) return "—";
  if (h < 1) return `${Math.round(h * 60)} mnt`;
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  return mins > 0 ? `${whole}j ${mins}m` : `${whole} jam`;
};

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today", label: "Hari Ini" },
  { key: "7d", label: "7 Hari" },
  { key: "month", label: "Bulan Ini" },
  { key: "3m", label: "3 Bulan" },
  { key: "1y", label: "1 Tahun" },
  { key: "all", label: "Semua Waktu" },
];

const medal = (i: number): ReactNode =>
  i === 0 ? (
    <Trophy className="w-4 h-4 text-yellow-500 inline-block" />
  ) : i === 1 ? (
    <Medal className="w-4 h-4 text-gray-400 inline-block" />
  ) : i === 2 ? (
    <Award className="w-4 h-4 text-amber-700 inline-block" />
  ) : (
    `${i + 1}`
  );

function ProviderJobsModal({ provider, onClose }: { provider: ProviderPerformance; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[85dvh] overflow-hidden">
        <div className="bg-[#1a1a2e] px-5 py-4 flex-shrink-0 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold text-white text-sm truncate">{provider.name}</p>
            <p className="text-xs text-gray-300 mt-1">
              {provider.total_pekerjaan} pekerjaan · {fmtHours(provider.jam_terbang)} jam terbang · rata-rata{" "}
              {fmtHours(provider.rata_rata)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-2">
          {provider.jobs.length === 0 ? (
            <div className="py-10 text-center">
              <Inbox className="w-8 h-8 mx-auto mb-2 text-gray-200" />
              <p className="text-sm text-gray-400">Belum ada pekerjaan pada periode ini</p>
            </div>
          ) : (
            provider.jobs.map((j) => (
              <div key={j.id} className="border border-gray-100 rounded-xl px-3 py-2.5 bg-gray-50">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-gray-700">{j.order_number}</span>
                  <span className="text-xs font-bold text-emerald-700">{fmtHours(j.duration_hours)}</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{j.customer_name}</p>
                <p className="text-[10px] text-gray-400 mt-1">
                  {j.received_at ? fmtDateTime(j.received_at) : "—"} → {fmtDateTime(j.done_at)}
                </p>
              </div>
            ))
          )}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RiwayatPenyediaPage() {
  const [providers, setProviders] = useState<ProviderPerformance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ProviderPerformance | null>(null);

  const now0 = new Date();
  const [fromDate, setFromDate] = useState(() => ymd(new Date(now0.getFullYear(), now0.getMonth(), 1)));
  const [toDate, setToDate] = useState(() => ymd(now0));
  const [allTime, setAllTime] = useState(false);
  const [activePreset, setActivePreset] = useState<PresetKey>("month");

  const applyPreset = (key: PresetKey) => {
    const now = new Date();
    if (key === "today") {
      const t = ymd(now);
      setFromDate(t);
      setToDate(t);
      setAllTime(false);
    } else if (key === "7d") {
      setFromDate(ymd(new Date(Date.now() - 6 * 86400000)));
      setToDate(ymd(now));
      setAllTime(false);
    } else if (key === "month") {
      setFromDate(ymd(new Date(now.getFullYear(), now.getMonth(), 1)));
      setToDate(ymd(now));
      setAllTime(false);
    } else if (key === "3m") {
      setFromDate(ymd(new Date(now.getFullYear(), now.getMonth() - 2, 1)));
      setToDate(ymd(now));
      setAllTime(false);
    } else if (key === "1y") {
      setFromDate(ymd(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())));
      setToDate(ymd(now));
      setAllTime(false);
    } else if (key === "all") {
      setAllTime(true);
    }
    setActivePreset(key);
  };

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const qs = new URLSearchParams();
      if (!allTime) {
        qs.set("from", localMidnightISO(fromDate));
        qs.set("to", nextDayISO(toDate));
      }
      const res = await fetch(`/api/preparation/provider-performance?${qs.toString()}`);
      const result = await res.json();
      setProviders(result.success ? result.providers ?? [] : []);
    } catch {
      setProviders([]);
    } finally {
      setIsLoading(false);
    }
  }, [allTime, fromDate, toDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = useMemo(() => {
    if (!search.trim()) return providers;
    const t = search.toLowerCase();
    return providers.filter((p) => p.name.toLowerCase().includes(t));
  }, [providers, search]);

  const totals = useMemo(() => {
    const totalPekerjaan = providers.reduce((s, p) => s + p.total_pekerjaan, 0);
    const totalJamTerbang = providers.reduce((s, p) => s + p.jam_terbang, 0);
    const rataGlobal = totalPekerjaan > 0 ? totalJamTerbang / totalPekerjaan : null;
    return { totalProviders: providers.length, totalPekerjaan, rataGlobal };
  }, [providers]);

  const rangeLabel = allTime ? "Semua Waktu" : `${fmtRangeDate(fromDate)} — ${fmtRangeDate(toDate)}`;

  const inputCls =
    "h-9 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <DashboardLayout>
      <main className="min-h-screen bg-[#F7F7F8] p-4 sm:p-6 lg:p-8">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl flex items-center justify-center shadow-lg shadow-gray-800/25 flex-shrink-0">
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-gray-900 tracking-tight leading-none">Riwayat Pekerjaan Penyedia</h1>
              <p className="text-xs text-gray-400 mt-1 font-medium">
                Peringkat performa penyedia barang berdasarkan total pekerjaan &amp; jam terbang
              </p>
            </div>
          </div>

          {/* Periode */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => applyPreset(p.key)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                    activePreset === p.key ? "bg-[#1a1a2e] text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {p.label}
                </button>
              ))}
              <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-bold text-gray-500 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg">
                {rangeLabel}
              </span>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Dari</label>
                <input
                  type="date"
                  value={fromDate}
                  max={toDate}
                  disabled={allTime}
                  onChange={(e) => {
                    setAllTime(false);
                    setActivePreset("custom");
                    setFromDate(e.target.value);
                  }}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Sampai</label>
                <input
                  type="date"
                  value={toDate}
                  min={fromDate}
                  max={ymd(new Date())}
                  disabled={allTime}
                  onChange={(e) => {
                    setAllTime(false);
                    setActivePreset("custom");
                    setToDate(e.target.value);
                  }}
                  className={inputCls}
                />
              </div>
              <div className="relative ml-auto flex-1 min-w-[180px] max-w-xs">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari nama penyedia..."
                  className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] focus:bg-white transition"
                />
              </div>
            </div>
          </div>

          {/* Stat ringkasan */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 border border-gray-200 rounded-2xl p-4">
              <p className="text-2xl font-black text-gray-800 tabular-nums">{isLoading ? "…" : totals.totalProviders}</p>
              <p className="text-[11px] font-bold uppercase tracking-wide mt-1 text-gray-500">Penyedia</p>
            </div>
            <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200 rounded-2xl p-4">
              <p className="text-2xl font-black text-blue-700 tabular-nums">{isLoading ? "…" : totals.totalPekerjaan}</p>
              <p className="text-[11px] font-bold uppercase tracking-wide mt-1 text-blue-600">Total Pekerjaan</p>
            </div>
            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-200 rounded-2xl p-4">
              <p className="text-2xl font-black text-emerald-700 tabular-nums">
                {isLoading ? "…" : fmtHours(totals.rataGlobal)}
              </p>
              <p className="text-[11px] font-bold uppercase tracking-wide mt-1 text-emerald-600">Rata-rata Global</p>
            </div>
          </div>

          {/* Tabel leaderboard */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-4">
              <Clock className="w-5 h-5 text-gray-400" />
              <div>
                <h2 className="text-sm font-black text-gray-800 leading-tight">Peringkat Penyedia Barang</h2>
                <p className="text-[11px] text-gray-400">Klik nama untuk lihat rincian pekerjaan · {rangeLabel}</p>
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <Inbox className="w-10 h-10 mx-auto mb-3 text-gray-200" />
                <p className="text-sm text-gray-400">Belum ada data penyedia barang</p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-1">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="text-[10px] font-bold text-gray-400 uppercase">
                      <th className="text-left px-3 py-2 w-12">#</th>
                      <th className="text-left px-3 py-2">Nama</th>
                      <th className="text-center px-3 py-2">Total Pekerjaan</th>
                      <th className="text-center px-3 py-2">Jam Terbang</th>
                      <th className="text-center px-3 py-2">Rata-rata</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p, i) => (
                      <tr
                        key={p.id}
                        onClick={() => setSelected(p)}
                        className={`cursor-pointer border-t border-gray-100 hover:bg-gray-50 transition ${
                          i === 0 ? "bg-amber-50/60" : ""
                        }`}
                      >
                        <td className="px-3 py-3 text-center font-black text-sm">{medal(i)}</td>
                        <td className="px-3 py-3">
                          <span className="font-bold text-gray-800">{p.name}</span>
                        </td>
                        <td className="px-3 py-3 text-center font-black text-gray-900 tabular-nums">
                          {p.total_pekerjaan}
                        </td>
                        <td className="px-3 py-3 text-center font-bold text-blue-700 tabular-nums">
                          {fmtHours(p.jam_terbang)}
                        </td>
                        <td className="px-3 py-3 text-center font-bold text-emerald-700 tabular-nums">
                          {fmtHours(p.rata_rata)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {selected && <ProviderJobsModal provider={selected} onClose={() => setSelected(null)} />}
    </DashboardLayout>
  );
}