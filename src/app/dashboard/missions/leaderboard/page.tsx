"use client";

import { useEffect, useState } from "react";
import { Trophy, Award } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";

interface LeaderboardUser {
  id: string;
  name: string;
  role: string;
  photo_url: string | null;
  score: number;
  metrics: { label: string; value: number, unit?: string }[];
}

const formatRole = (role: string) => {
  if (!role) return "Lainnya";
  return role.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
};

const getInitials = (name: string) => {
  if (!name) return "??";
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
};

const periodLabels: Record<string, string> = {
  today: "Hari Ini",
  week: "Minggu Ini",
  month: "Bulan Ini"
};

export default function MissionLeaderboardPage() {
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"today" | "week" | "month">("today");
  const [error, setError] = useState("");

  const fetchData = async (p: string) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/leaderboard-kerja?period=${p}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Gagal mengambil data");
      setUsers(json.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(period);
  }, [period]);

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

  const groupedUsers = users.reduce((acc, user) => {
    const div = getDivision(user.role);
    if (!acc[div]) acc[div] = [];
    acc[div].push(user);
    return acc;
  }, {} as Record<string, LeaderboardUser[]>);

  // Sort division keys so they are ordered nicely, and inside, sort users by score just in case.
  const divisions = Object.keys(groupedUsers).sort();

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-16 p-4 md:p-6">

        {/* Header & Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <Trophy className="w-5 h-5 text-blue-600" />
              Leaderboard Pekerjaan
            </h1>
            <p className="text-gray-500 text-xs mt-1">
              Peringkat karyawan berdasarkan aktivitas utama tiap divisi.
            </p>
          </div>

          <div className="flex bg-white rounded-lg shadow-sm border border-gray-200/60 p-0.5 self-start sm:self-auto">
            {(["today", "week", "month"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  period === p
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                {periodLabels[p]}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 text-red-600 rounded-lg border border-red-100 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 bg-white/60 animate-pulse rounded-xl border border-gray-100" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200/60 p-10 text-center shadow-sm">
            <div className="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <Trophy className="w-7 h-7 text-gray-300" />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-1">Belum Ada Aktivitas</h3>
            <p className="text-gray-500 text-sm">Belum ada skor yang tercatat untuk periode ini.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {divisions.map((divName) => {
              const divUsers = groupedUsers[divName].sort((a, b) => b.score - a.score);

              const rankStyles = [
                "bg-amber-100 text-amber-700 border-amber-200",
                "bg-slate-100 text-slate-600 border-slate-200",
                "bg-orange-100 text-orange-600 border-orange-200",
              ];

              return (
                <div key={divName} className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
                  {/* Division header */}
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                      <Award className="w-4 h-4 text-blue-600" />
                      {divName}
                    </h2>
                    <span className="text-[11px] font-medium bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                      {divUsers.length} Anggota
                    </span>
                  </div>

                  {/* Ranked list */}
                  <div className="divide-y divide-gray-50">
                    {divUsers.map((user, idx) => (
                      <div key={user.id} className="px-4 py-2.5 hover:bg-blue-50/30 transition-colors flex items-center gap-3">
                        {/* Rank */}
                        <div className={`w-7 h-7 shrink-0 rounded-lg flex items-center justify-center font-bold text-xs border ${
                          idx < 3 ? rankStyles[idx] : "bg-gray-50 text-gray-400 border-gray-100"
                        }`}>
                          {idx + 1}
                        </div>

                        {/* Avatar */}
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden border border-blue-200/50">
                          {user.photo_url ? (
                            <img src={user.photo_url} alt={user.name} className="w-full h-full object-cover" />
                          ) : (
                            getInitials(user.name)
                          )}
                        </div>

                        {/* Name + metrics */}
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-gray-900 truncate text-sm flex items-center gap-2">
                            {user.name}
                            <span className="text-[9px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full border border-gray-200/60 shrink-0">
                              {formatRole(user.role)}
                            </span>
                          </div>
                          <div className="flex items-center gap-x-3 gap-y-0.5 mt-0.5 flex-wrap">
                            {user.metrics.map((m, i) => (
                              <span key={i} className="text-[10px] text-gray-500">
                                {m.label}: <strong className="text-gray-700">{m.value}{m.unit ? ` ${m.unit}` : ""}</strong>
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Score */}
                        <div className="text-right shrink-0">
                          <div className="text-sm font-bold text-gray-900 leading-none">{user.score.toLocaleString()}</div>
                          <div className="text-[9px] text-gray-400 uppercase tracking-wider mt-0.5">Skor</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
