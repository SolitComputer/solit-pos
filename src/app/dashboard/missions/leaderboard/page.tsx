"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Trophy, Crown, RefreshCw, Search, Users, X, Flame, Zap, TrendingUp } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";

interface LeaderboardUser {
  id: string;
  name: string;
  role: string;
  photo_url: string | null;
  score: number;
  metrics: { label: string; value: number; unit?: string }[];
}

type BoardType = "kerja" | "misi" | "absensi";
type Period = "today" | "week" | "month";

const formatRole = (role: string) => {
  if (!role) return "Lainnya";
  return role.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
};

const getInitials = (name: string) => {
  if (!name) return "??";
  return name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
};

const periodLabels: Record<Period, string> = {
  today: "Hari Ini",
  week: "Minggu Ini",
  month: "Bulan Ini",
};

const boardLabels: Record<BoardType, { title: string; desc: string }> = {
  kerja: { title: "Leaderboard Pekerjaan", desc: "Peringkat berdasarkan aktivitas utama tiap divisi." },
  misi: { title: "Leaderboard Misi", desc: "Peringkat berdasarkan penyelesaian misi." },
  absensi: { title: "Leaderboard Absensi", desc: "Peringkat kehadiran berdasarkan data absensi wajah." },
};

const getDivision = (role: string) => {
  const r = (role || "").toUpperCase();
  if (r.includes("KEPALA_SALES")) return "Kepala Sales";
  if (r.includes("SALES")) return "Crew Sales";
  if (r.includes("KASIR")) return "Kasir";

  if (r.includes("KEPALA_PENYEDIA_BARANG")) return "Kepala Penyedia Barang";
  if (r.includes("PENYEDIA")) return "Divisi Penyedia Barang";
  if (r.includes("PENGANTARAN")) return "Tim Pengantaran";

  if (r.includes("SOTECH")) return "Sotech";
  if (r.includes("ONPOINT")) return "On Point";
  if (r.includes("PENGELOLA")) return "Pengelola Barang";

  if (r.includes("TEKNISI")) return "Divisi Teknisi";
  if (r.includes("KONTEN")) return "Divisi Konten";
  if (r.includes("ACCOUNTING")) return "Divisi Accounting";
  if (r.includes("MARKETING")) return "Divisi Marketing";
  if (r.includes("CUSTOMER_SERVICE") || r.includes("CS")) return "Customer Service";
  if (r.includes("PURCHASING")) return "Purchasing";

  return "Lainnya";
};

const rankColors = ["text-amber-500", "text-slate-400", "text-orange-400"];

/* ------------------------------------------------------------------ */
/* Podium (top 3 keseluruhan) — khusus Leaderboard Pekerjaan          */
/* ------------------------------------------------------------------ */

const podiumTheme = [
  {
    // Juara 1
    ring: "ring-amber-400",
    glow: "shadow-[0_0_40px_-8px_rgba(251,191,36,0.55)]",
    badge: "bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950",
    bar: "bg-gradient-to-t from-amber-500 to-amber-300",
    height: "h-24 sm:h-28",
    label: "Juara 1",
  },
  {
    // Juara 2
    ring: "ring-slate-300",
    glow: "shadow-[0_0_30px_-10px_rgba(148,163,184,0.5)]",
    badge: "bg-gradient-to-br from-slate-200 to-slate-400 text-slate-900",
    bar: "bg-gradient-to-t from-slate-500 to-slate-300",
    height: "h-16 sm:h-20",
    label: "Juara 2",
  },
  {
    // Juara 3
    ring: "ring-orange-400",
    glow: "shadow-[0_0_30px_-10px_rgba(251,146,60,0.5)]",
    badge: "bg-gradient-to-br from-orange-300 to-orange-500 text-orange-950",
    bar: "bg-gradient-to-t from-orange-600 to-orange-400",
    height: "h-12 sm:h-16",
    label: "Juara 3",
  },
];

function PodiumSlot({ user, rank }: { user: LeaderboardUser | undefined; rank: 0 | 1 | 2 }) {
  const t = podiumTheme[rank];
  if (!user) return <div className="flex-1" />;

  return (
    <div className={`flex-1 flex flex-col items-center min-w-0 ${rank === 0 ? "-mt-4 sm:-mt-6" : ""}`}>
      {rank === 0 && <Crown className="w-5 h-5 sm:w-6 sm:h-6 text-amber-300 mb-1 animate-bounce" style={{ animationDuration: "2s" }} />}

      {/* Avatar */}
      <div className={`relative w-12 h-12 sm:w-16 sm:h-16 rounded-full ring-2 ${t.ring} ${t.glow} bg-white/10 backdrop-blur flex items-center justify-center font-bold text-sm sm:text-base text-white overflow-hidden shrink-0`}>
        {user.photo_url ? (
          <img src={user.photo_url} alt={user.name} className="w-full h-full object-cover" />
        ) : (
          getInitials(user.name)
        )}
      </div>

      {/* Badge nomor */}
      <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full ${t.badge} text-[10px] sm:text-xs font-extrabold flex items-center justify-center -mt-2.5 ring-2 ring-slate-900 z-10`}>
        {rank + 1}
      </div>

      {/* Nama + role */}
      <div className="mt-1.5 text-center min-w-0 w-full px-1">
        <div className="text-white text-xs sm:text-sm font-semibold truncate" title={user.name}>{user.name}</div>
        <div className="text-white/40 text-[9px] sm:text-[10px] truncate">{formatRole(user.role)}</div>
      </div>

      {/* Skor */}
      <div className="mt-1 text-amber-50 text-sm sm:text-lg font-bold tabular-nums drop-shadow">
        {user.score.toLocaleString()}
        <span className="text-[9px] sm:text-[10px] font-medium text-white/40 ml-1">pts</span>
      </div>

      {/* Balok podium */}
      <div className={`w-full max-w-[110px] ${t.height} ${t.bar} rounded-t-xl mt-2 relative overflow-hidden opacity-90`}>
        <div className="absolute inset-0 bg-gradient-to-b from-white/25 to-transparent" />
        <div className="absolute inset-x-0 top-1.5 text-center text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-black/40">
          {t.label}
        </div>
      </div>
    </div>
  );
}

function Podium({ top3, period }: { top3: LeaderboardUser[]; period: Period }) {
  return (
    <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 border border-slate-800">
      {/* Dekorasi glow */}
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-72 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-16 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "22px 22px" }}
      />

      <div className="relative px-4 sm:px-8 pt-5 pb-0">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-amber-400/15 flex items-center justify-center shrink-0">
              <Trophy className="w-3.5 h-3.5 text-amber-300" />
            </div>
            <div className="min-w-0">
              <div className="text-white text-sm font-bold tracking-tight truncate">Top Performer</div>
              <div className="text-white/40 text-[10px]">Skor tertinggi lintas divisi</div>
            </div>
          </div>
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-amber-200/80 bg-amber-400/10 border border-amber-300/20 rounded-full px-2.5 py-1">
            {periodLabels[period]}
          </span>
        </div>

        {/* Urutan visual: 2 - 1 - 3 */}
        <div className="flex items-end gap-2 sm:gap-6 pt-2">
          <PodiumSlot user={top3[1]} rank={1} />
          <PodiumSlot user={top3[0]} rank={0} />
          <PodiumSlot user={top3[2]} rank={2} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function MissionLeaderboardPage() {
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<Period>("today");
  const [boardType, setBoardType] = useState<BoardType>("kerja");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async (p: Period, b: BoardType, silent = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      silent ? setRefreshing(true) : setLoading(true);
      setError("");

      const url =
        b === "kerja" ? `/api/leaderboard-kerja?period=${p}` :
        b === "absensi" ? `/api/attendance/leaderboard?period=${p}` :
        `/api/missions/leaderboard?period=${p}`;

      const res = await fetch(url, { signal: controller.signal });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Gagal mengambil data");

      if (b === "misi") {
        const finalUsers: LeaderboardUser[] = [];
        Object.values(json.data || {}).forEach((group: any) => {
          group.forEach((u: any) => {
            finalUsers.push({
              id: u.id,
              name: u.name,
              role: u.role,
              photo_url: null,
              score: u.totalCompleted * 10,
              metrics: [
                { label: "Selesai", value: u.totalCompleted },
                { label: "Waktu Resp", value: u.avgResponseMs ? Math.round(u.avgResponseMs / 1000 / 60) : 0, unit: "mnt" },
                { label: "Waktu Pengerjaan", value: u.avgCompletionMs ? Math.round(u.avgCompletionMs / 1000 / 60) : 0, unit: "mnt" },
              ],
            });
          });
        });
        setUsers(finalUsers);
      } else {
        setUsers(json.data || []);
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setError(err.message);
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchData(period, boardType);
    return () => abortRef.current?.abort();
  }, [period, boardType, fetchData]);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u => u.name.toLowerCase().includes(q) || formatRole(u.role).toLowerCase().includes(q));
  }, [users, query]);

  const grouped = useMemo(() => {
    const acc: Record<string, LeaderboardUser[]> = {};
    filteredUsers.forEach(user => {
      const div = boardType === "absensi" ? "Semua Divisi" : getDivision(user.role);
      (acc[div] ||= []).push(user);
    });
    Object.values(acc).forEach(list => list.sort((a, b) => b.score - a.score));
    return acc;
  }, [filteredUsers, boardType]);

  const divisions = useMemo(() => Object.keys(grouped).sort(), [grouped]);

  const overallRanked = useMemo(
    () => [...users].sort((a, b) => b.score - a.score),
    [users]
  );

  const top3 = overallRanked.slice(0, 3);
  const totalScore = useMemo(() => users.reduce((sum, u) => sum + u.score, 0), [users]);
  const showPodium = boardType === "kerja" && !query && top3.length > 0;

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-16 p-3 sm:p-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-semibold text-gray-900 tracking-tight truncate">
              {boardLabels[boardType].title}
            </h1>
            <p className="text-gray-400 text-xs mt-0.5">{boardLabels[boardType].desc}</p>
          </div>
          <button
            onClick={() => fetchData(period, boardType, true)}
            disabled={loading || refreshing}
            title="Muat ulang data"
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400 hover:text-gray-700 hover:border-gray-300 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="grid grid-cols-3 sm:flex bg-white rounded-lg border border-gray-200/70 p-0.5 w-full sm:w-auto">
            {(["kerja", "misi", "absensi"] as const).map(b => (
              <button
                key={b}
                onClick={() => setBoardType(b)}
                className={`px-3 py-1.5 text-[11px] sm:text-xs font-medium rounded-md transition-all whitespace-nowrap ${
                  boardType === b ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900"
                }`}
              >
                {b === "kerja" ? "Pekerjaan" : b === "misi" ? "Misi" : "Absensi"}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 sm:flex bg-white rounded-lg border border-gray-200/70 p-0.5 w-full sm:w-auto">
            {(["today", "week", "month"] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-[11px] sm:text-xs font-medium rounded-md transition-all whitespace-nowrap ${
                  period === p ? "bg-blue-600 text-white" : "text-gray-500 hover:text-gray-900"
                }`}
              >
                {periodLabels[p]}
              </button>
            ))}
          </div>

          <div className="relative flex-1 sm:max-w-[220px] sm:ml-auto">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Cari nama / role..."
              className="w-full h-full min-h-[34px] pl-8 pr-8 text-xs bg-white border border-gray-200/70 rounded-lg outline-none focus:border-blue-400 transition-colors placeholder:text-gray-400"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="p-4 bg-white rounded-xl border border-red-100 flex items-center justify-between gap-3">
            <p className="text-sm text-red-600 min-w-0 truncate">{error}</p>
            <button
              onClick={() => fetchData(period, boardType)}
              className="shrink-0 text-xs font-medium text-red-600 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors"
            >
              Coba Lagi
            </button>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="space-y-4">
            {boardType === "kerja" && (
              <div className="h-56 sm:h-64 rounded-2xl bg-gradient-to-br from-slate-200 to-slate-100 animate-pulse" />
            )}
            {[1, 2].map(g => (
              <div key={g} className="bg-white rounded-xl border border-gray-200/70 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <div className="h-3.5 w-32 bg-gray-100 rounded animate-pulse" />
                </div>
                {[1, 2, 3].map(i => (
                  <div key={i} className="px-4 py-3.5 flex items-center gap-3">
                    <div className="w-6 h-4 bg-gray-100 rounded animate-pulse" />
                    <div className="w-9 h-9 bg-gray-100 rounded-full animate-pulse shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-1/3 bg-gray-100 rounded animate-pulse" />
                      <div className="h-2.5 w-1/2 bg-gray-50 rounded animate-pulse" />
                    </div>
                    <div className="h-4 w-10 bg-gray-100 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : !error && filteredUsers.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200/70 py-14 text-center">
            <Trophy className="w-8 h-8 text-gray-200 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-gray-900">
              {query ? "Tidak Ada Hasil" : "Belum Ada Aktivitas"}
            </h3>
            <p className="text-gray-400 text-xs mt-1">
              {query ? `Tidak ada yang cocok dengan "${query}".` : "Belum ada skor yang tercatat untuk periode ini."}
            </p>
            {query && (
              <button
                onClick={() => setQuery("")}
                className="mt-3 text-xs font-medium text-blue-600 hover:underline"
              >
                Hapus pencarian
              </button>
            )}
          </div>
        ) : !error ? (
          <div className="space-y-4">
            {/* Podium top 3 — khusus board Pekerjaan */}
            {showPodium && <Podium top3={top3} period={period} />}

            {/* Statistik ringkas */}
            {boardType === "kerja" && !query && (
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div className="bg-white rounded-xl border border-gray-200/70 px-3 sm:px-4 py-3 flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-base sm:text-lg font-bold text-gray-900 tabular-nums leading-none">{users.length}</div>
                    <div className="text-[10px] text-gray-400 mt-1 truncate">Karyawan Aktif</div>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200/70 px-3 sm:px-4 py-3 flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                    <Zap className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-base sm:text-lg font-bold text-gray-900 tabular-nums leading-none">{totalScore.toLocaleString()}</div>
                    <div className="text-[10px] text-gray-400 mt-1 truncate">Total Poin</div>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200/70 px-3 sm:px-4 py-3 flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-base sm:text-lg font-bold text-gray-900 tabular-nums leading-none">{divisions.length}</div>
                    <div className="text-[10px] text-gray-400 mt-1 truncate">Divisi Aktif</div>
                  </div>
                </div>
              </div>
            )}

            {divisions.map(divName => {
              const divUsers = grouped[divName];
              const maxScore = Math.max(...divUsers.map(u => u.score), 1);

              return (
                <div key={divName} className="bg-white rounded-xl border border-gray-200/70 overflow-hidden">
                  {/* Division header */}
                  <div className="px-4 sm:px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
                    <h2 className="text-[13px] font-semibold text-gray-900 truncate">{divName}</h2>
                    <span className="text-[11px] text-gray-400 flex items-center gap-1 shrink-0 tabular-nums">
                      <Users className="w-3 h-3" /> {divUsers.length}
                    </span>
                  </div>

                  {/* Ranked list */}
                  <div className="divide-y divide-gray-50">
                    {divUsers.map((user, idx) => {
                      const overallRank = overallRanked.findIndex(u => u.id === user.id);
                      const isChampion = boardType === "kerja" && overallRank === 0;

                      return (
                        <div
                          key={user.id}
                          className={`px-4 sm:px-5 py-3 transition-colors ${
                            isChampion
                              ? "bg-gradient-to-r from-amber-50/80 to-transparent hover:from-amber-50"
                              : "hover:bg-gray-50/60"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {/* Rank */}
                            <div className={`w-6 shrink-0 text-center text-sm font-semibold tabular-nums ${
                              idx < 3 ? rankColors[idx] : "text-gray-300"
                            }`}>
                              {idx + 1}
                            </div>

                            {/* Avatar */}
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center font-semibold text-[11px] shrink-0 overflow-hidden ${
                              isChampion ? "bg-amber-100 text-amber-700 ring-2 ring-amber-300" : "bg-gray-100 text-gray-500"
                            }`}>
                              {user.photo_url ? (
                                <img src={user.photo_url} alt={user.name} className="w-full h-full object-cover" />
                              ) : (
                                getInitials(user.name)
                              )}
                            </div>

                            {/* Name + metrics */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="font-medium text-gray-900 text-sm truncate">{user.name}</span>
                                {isChampion && <Flame className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                                {!isChampion && idx === 0 && <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                                {boardType === "kerja" && overallRank >= 0 && overallRank < 3 && (
                                  <span className="text-[9px] font-bold uppercase tracking-wide text-amber-600 bg-amber-50 border border-amber-200/60 rounded-full px-1.5 py-px shrink-0">
                                    #{overallRank + 1} Global
                                  </span>
                                )}
                                <span className="text-[10px] text-gray-400 shrink-0 hidden sm:inline">{formatRole(user.role)}</span>
                              </div>
                              <div className="flex items-center gap-x-2 mt-0.5 flex-wrap">
                                {user.metrics.map((m, i) => (
                                  <span key={i} className="text-[10px] text-gray-400 flex items-center gap-2">
                                    {i > 0 && <span className="text-gray-200">·</span>}
                                    {m.label}{" "}
                                    <span className="text-gray-600 font-medium tabular-nums">
                                      {m.value}{m.unit ? ` ${m.unit}` : ""}
                                    </span>
                                  </span>
                                ))}
                              </div>
                            </div>

                            {/* Score */}
                            <div className="text-right shrink-0 w-16">
                              <div className="text-sm font-semibold text-gray-900 tabular-nums leading-none">
                                {user.score.toLocaleString()}
                              </div>
                              <div className="h-1 bg-gray-100 rounded-full mt-1.5 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${
                                    isChampion || idx === 0 ? "bg-gradient-to-r from-amber-400 to-amber-500" : "bg-blue-500/70"
                                  }`}
                                  style={{ width: `${Math.max((user.score / maxScore) * 100, 4)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
