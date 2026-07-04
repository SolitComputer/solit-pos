"use client";
// src/components/missions/AdminAllMissionsWorkspace.tsx
import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuthUser } from "@/hooks/useAuthUser";
import {
  Mission, MissionStatus, MissionPriority,
  usePaginatedMissions, hasFullAccess, fmtCount,
  fmtDate, fmtDateTime, isFromCeo, isOverdue, missionProgress,
  StatusBadge, PriorityPill, WorkspaceHeader,
} from "./missionShared";

interface UserOption { id: string; name: string; role: string; roles: string[]; }

const STATUS_OPTIONS: { value: MissionStatus | ""; label: string }[] = [
  { value: "", label: "Semua Status" },
  { value: "PENDING", label: "Belum" },
  { value: "IN_PROGRESS", label: "Berjalan" },
  { value: "SUBMITTED", label: "Menunggu ACC" },
  { value: "REJECTED", label: "Revisi" },
  { value: "APPROVED", label: "Selesai" },
];

const PRIORITY_OPTIONS: { value: MissionPriority | ""; label: string }[] = [
  { value: "", label: "Semua Prioritas" },
  { value: "HIGH", label: "Tinggi" },
  { value: "MEDIUM", label: "Sedang" },
  { value: "LOW", label: "Rendah" },
];

export default function AdminAllMissionsWorkspace() {
  const { user } = useAuthUser();
  const roles = useMemo(
    () => (user?.roles?.length ? user.roles : user?.role ? [user.role] : []),
    [user]
  );

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<MissionStatus | "">("");
  const [priority, setPriority] = useState<MissionPriority | "">("");
  const [assignerId, setAssignerId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const [users, setUsers] = useState<UserOption[]>([]);
  useEffect(() => {
    (async () => {
      try {
        // Reuse assignable-users? Tidak, itu filter perizinan.
        // Untuk admin view kita butuh list semua user aktif — pakai endpoint sederhana.
        // Kalau belum ada, sementara pakai assignable-users sbg fallback.
        const res = await fetch("/api/missions/assignable-users");
        const data = await res.json();
        if (data.success) setUsers(data.data);
      } catch { /* silent */ }
    })();
  }, []);

  const { missions, total, loading, loadingMore, error, hasMore, loadMore, refetch } =
    usePaginatedMissions({
      box: "all",
      search, status, priority,
      assigner_id: assignerId || undefined,
      assignee_id: assigneeId || undefined,
      from: from || undefined,
      to: to || undefined,
      limit: 25,
    });

  const activeFilterCount = [status, priority, assignerId, assigneeId, from, to].filter(Boolean).length;

  const resetFilters = () => {
    setStatus(""); setPriority(""); setAssignerId(""); setAssigneeId("");
    setFrom(""); setTo("");
  };

  if (!user) {
    return <DashboardLayout><div className="p-8">Memuat...</div></DashboardLayout>;
  }

  if (!hasFullAccess(roles)) {
    return (
      <DashboardLayout>
        <main className="min-h-screen bg-white p-8">
          <div className="max-w-md mx-auto text-center py-16">
            <p className="text-lg font-bold text-slate-800">Akses Ditolak</p>
            <p className="text-sm text-slate-500 mt-2">
              Halaman ini hanya untuk role Admin / Programmer / Asisten CEO.
            </p>
          </div>
        </main>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <main className="min-h-screen bg-white p-4 sm:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto space-y-4">
          <WorkspaceHeader
            title="Semua Misi Karyawan"
            subtitle={`Pantau seluruh misi organisasi · ${fmtCount(total)} misi total`}
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M3 9l9-6 9 6-9 6-9-6z" />
                <path d="M3 15l9 6 9-6" />
                <path d="M3 12l9 6 9-6" />
              </svg>
            }
          />

          {/* Sticky Filter Bar */}
          <div className="sticky top-0 z-20 bg-white pb-3 -mx-1 px-1">
            <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Cari judul atau deskripsi misi..."
                    className="w-full h-10 border border-slate-200 rounded-lg pl-10 pr-3 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 focus:bg-white transition"
                  />
                </div>
                <button
                  onClick={() => setShowFilters(v => !v)}
                  className="h-10 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 transition"
                  style={showFilters || activeFilterCount > 0
                    ? { background: "#0f172a", color: "#fff" }
                    : { background: "#f8fafc", color: "#475569", border: "1px solid #e2e8f0" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
                  </svg>
                  Filter
                  {activeFilterCount > 0 && (
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-white text-slate-900">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>

              {showFilters && (
                <div className="pt-2 border-t border-slate-100 grid grid-cols-2 lg:grid-cols-4 gap-2">
                  <select value={status} onChange={e => setStatus(e.target.value as any)}
                    className="h-9 border border-slate-200 rounded-lg px-2.5 text-xs bg-slate-50 focus:outline-none focus:border-slate-400 focus:bg-white transition">
                    {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <select value={priority} onChange={e => setPriority(e.target.value as any)}
                    className="h-9 border border-slate-200 rounded-lg px-2.5 text-xs bg-slate-50 focus:outline-none focus:border-slate-400 focus:bg-white transition">
                    {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <select value={assignerId} onChange={e => setAssignerId(e.target.value)}
                    className="h-9 border border-slate-200 rounded-lg px-2.5 text-xs bg-slate-50 focus:outline-none focus:border-slate-400 focus:bg-white transition">
                    <option value="">Semua Pemberi</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)}
                    className="h-9 border border-slate-200 rounded-lg px-2.5 text-xs bg-slate-50 focus:outline-none focus:border-slate-400 focus:bg-white transition">
                    <option value="">Semua Penerima</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  <div className="col-span-2 flex items-center gap-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Dari</label>
                    <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                      className="flex-1 h-9 border border-slate-200 rounded-lg px-2.5 text-xs bg-slate-50 focus:outline-none focus:border-slate-400 focus:bg-white transition" />
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Sampai</label>
                    <input type="date" value={to} onChange={e => setTo(e.target.value)}
                      className="flex-1 h-9 border border-slate-200 rounded-lg px-2.5 text-xs bg-slate-50 focus:outline-none focus:border-slate-400 focus:bg-white transition" />
                  </div>
                  {activeFilterCount > 0 && (
                    <button onClick={resetFilters}
                      className="col-span-full h-9 rounded-lg text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition">
                      Reset semua filter ({activeFilterCount})
                    </button>
                  )}
                </div>
              )}

              {/* Info hasil */}
              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                <span>
                  Menampilkan <b className="text-slate-700">{missions.length}</b> dari <b className="text-slate-700">{fmtCount(total)}</b> misi
                </span>
                {loading && <span className="text-slate-400">Memuat...</span>}
              </div>
            </div>
          </div>

          {/* List */}
          {loading && missions.length === 0 ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-16 bg-slate-50 rounded-xl border border-slate-100 animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-4 text-center">
              <p className="text-sm font-bold text-rose-700">{error}</p>
              <button onClick={() => void refetch()} className="mt-2 text-xs font-bold text-rose-600 underline">
                Coba lagi
              </button>
            </div>
          ) : missions.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
              <p className="text-sm font-bold text-slate-600">Tidak ada misi yang cocok</p>
              <p className="text-xs mt-1 text-slate-400">Coba longgarkan filter atau ubah kata kunci.</p>
            </div>
          ) : (
            <>
              {/* Table style (desktop) + card fallback (mobile) */}
              <div className="hidden lg:block bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Misi</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Pemberi</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Penerima</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Progress</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Dibuat</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tenggat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {missions.map(m => {
                      const { done, total: t, pct } = missionProgress(m.items);
                      const od = isOverdue(m);
                      const ceo = isFromCeo(m);
                      const isOpen = openId === m.id;
                      return (
                        <>
                          <tr key={m.id}
                            onClick={() => setOpenId(isOpen ? null : m.id)}
                            className="hover:bg-slate-50 cursor-pointer transition">
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-1.5">
                                {ceo && <span className="text-[8px] font-black px-1 py-0.5 rounded" style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>CEO</span>}
                                <span className="text-xs font-bold text-slate-800 line-clamp-1">{m.title}</span>
                              </div>
                              <div className="mt-0.5"><PriorityPill priority={m.priority} /></div>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-slate-600 truncate max-w-[140px]">{m.assigner?.name ?? "—"}</td>
                            <td className="px-4 py-2.5 text-xs text-slate-600 truncate max-w-[140px]">{m.assignee?.name ?? "—"}</td>
                            <td className="px-4 py-2.5"><StatusBadge status={m.status} /></td>
                            <td className="px-4 py-2.5">
                              {t > 0 ? (
                                <div className="flex items-center gap-1.5">
                                  <div className="w-14 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                    <div className="h-full" style={{ width: `${pct}%`, background: pct === 100 ? "#059669" : "#6366f1" }} />
                                  </div>
                                  <span className="text-[10px] font-bold text-slate-500">{done}/{t}</span>
                                </div>
                              ) : <span className="text-[10px] text-slate-400">—</span>}
                            </td>
                            <td className="px-4 py-2.5 text-[11px] text-slate-500 whitespace-nowrap">{fmtDate(m.created_at)}</td>
                            <td className="px-4 py-2.5 text-[11px] whitespace-nowrap"
                              style={od ? { color: "#dc2626", fontWeight: 700 } : { color: "#64748b" }}>
                              {m.due_date ? fmtDate(m.due_date) : "—"}
                              {od && <span className="ml-1">⏰</span>}
                            </td>
                          </tr>
                          {isOpen && (
                            <tr key={`${m.id}-detail`} className="bg-slate-50/50">
                              <td colSpan={7} className="px-4 py-3">
                                <div className="grid grid-cols-2 gap-3 text-xs">
                                  {m.description && (
                                    <div className="col-span-2">
                                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Deskripsi</p>
                                      <p className="text-slate-600 whitespace-pre-wrap">{m.description}</p>
                                    </div>
                                  )}
                                  {m.rejection_reason && (
                                    <div className="col-span-2 rounded-lg px-3 py-2" style={{ background: "#fff1f2", border: "1px solid #fecdd3", color: "#be123c" }}>
                                      <p className="font-bold">Alasan ditolak:</p>
                                      <p>{m.rejection_reason}</p>
                                    </div>
                                  )}
                                  <div><span className="text-slate-400">Submitted:</span> <span className="font-semibold">{fmtDateTime(m.submitted_at)}</span></div>
                                  <div><span className="text-slate-400">Reviewed:</span> <span className="font-semibold">{fmtDateTime(m.reviewed_at)}</span></div>
                                  {m.reviewer && <div><span className="text-slate-400">Reviewer:</span> <span className="font-semibold">{m.reviewer.name}</span></div>}
                                  {m.proof_photo_url && (
                                    <div className="col-span-2">
                                      <a href={m.proof_photo_url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-blue-600 underline">
                                        Lihat bukti foto →
                                      </a>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile card view */}
              <div className="lg:hidden space-y-2">
                {missions.map(m => {
                  const { done, total: t, pct } = missionProgress(m.items);
                  const od = isOverdue(m);
                  const ceo = isFromCeo(m);
                  return (
                    <div key={m.id} className="bg-white rounded-xl border border-slate-200 p-3">
                      <div className="flex items-start gap-2 mb-1.5">
                        {ceo && <span className="text-[8px] font-black px-1 py-0.5 rounded flex-shrink-0" style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>CEO</span>}
                        <h3 className="text-sm font-bold text-slate-800 flex-1 leading-tight">{m.title}</h3>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mb-2">
                        <StatusBadge status={m.status} />
                        <PriorityPill priority={m.priority} />
                        {t > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-600">
                            {done}/{t} · {pct}%
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                        <div className="bg-slate-50 rounded px-2 py-1">
                          <p className="text-slate-400">Pemberi</p>
                          <p className="font-bold text-slate-700 truncate">{m.assigner?.name ?? "—"}</p>
                        </div>
                        <div className="bg-slate-50 rounded px-2 py-1">
                          <p className="text-slate-400">Penerima</p>
                          <p className="font-bold text-slate-700 truncate">{m.assignee?.name ?? "—"}</p>
                        </div>
                        <div className="bg-slate-50 rounded px-2 py-1">
                          <p className="text-slate-400">Dibuat</p>
                          <p className="font-bold text-slate-700">{fmtDate(m.created_at)}</p>
                        </div>
                        <div className="bg-slate-50 rounded px-2 py-1" style={od ? { background: "#fef2f2" } : undefined}>
                          <p className="text-slate-400">Tenggat</p>
                          <p className="font-bold" style={{ color: od ? "#dc2626" : "#334155" }}>
                            {m.due_date ? fmtDate(m.due_date) : "—"}{od && " ⏰"}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Load more */}
              {hasMore && (
                <button
                  onClick={loadMore} disabled={loadingMore}
                  className="w-full h-11 rounded-xl text-sm font-bold transition disabled:opacity-60"
                  style={{ background: "#f8fafc", color: "#475569", border: "1px solid #e2e8f0" }}
                >
                  {loadingMore ? "Memuat..." : `Muat ${Math.min(25, total - missions.length)} misi lagi`}
                </button>
              )}
              {!hasMore && missions.length > 0 && (
                <p className="text-center text-[11px] text-slate-400 py-2">
                  Sudah tampil semua ({fmtCount(missions.length)} misi)
                </p>
              )}
            </>
          )}
        </div>
      </main>
    </DashboardLayout>
  );
}