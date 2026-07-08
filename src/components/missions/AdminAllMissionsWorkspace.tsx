"use client";
// src/components/missions/AdminAllMissionsWorkspace.tsx
import { Fragment, useEffect, useMemo, useState } from "react";
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
  { value: "IN_PROGRESS", label: "On Progress" },
  { value: "SUBMITTED", label: "Audit" },
  { value: "REJECTED", label: "Revisi" },
  { value: "APPROVED", label: "Selesai" },
];

const PRIORITY_OPTIONS: { value: MissionPriority | ""; label: string }[] = [
  { value: "", label: "Semua Prioritas" },
  { value: "HIGH", label: "Tinggi" },
  { value: "MEDIUM", label: "Sedang" },
  { value: "LOW", label: "Rendah" },
];

const fieldBase =
  "border border-slate-200 bg-slate-50/70 focus:outline-none focus:ring-2 " +
  "focus:ring-indigo-500/15 focus:border-indigo-300 focus:bg-white transition";

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
    return (
      <DashboardLayout>
        <div className="min-h-screen bg-gradient-to-b from-slate-100/70 via-[#f7f8fa] to-[#f7f8fa] flex items-center justify-center p-4 sm:p-8">
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200/80 px-8 py-12 flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full border-4 border-slate-200 border-t-indigo-500 animate-spin" />
            <p className="text-sm font-semibold text-slate-600">Memuat data...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!hasFullAccess(roles)) {
    return (
      <DashboardLayout>
        <main className="min-h-screen bg-gradient-to-b from-slate-100/70 via-[#f7f8fa] to-[#f7f8fa] p-4 sm:p-6 lg:p-8">
          <div className="max-w-md mx-auto bg-white rounded-2xl shadow-lg border border-slate-200/80 p-8 sm:p-12 text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-red-50 to-red-100 border border-red-200 flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Akses Ditolak</h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              Halaman ini hanya untuk role Admin / Programmer / Asisten CEO.
            </p>
          </div>
        </main>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <main className="min-h-screen bg-gradient-to-b from-slate-100/70 via-[#f7f8fa] to-[#f7f8fa] p-3 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
          {/* Header */}
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
          <div className="sticky top-0 z-20 -mx-1 px-1 pt-1 pb-2 sm:pb-3 bg-gradient-to-b from-[#f7f8fa] via-[#f7f8fa]/90 to-transparent backdrop-blur-sm">
            <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_4px_16px_-8px_rgba(15,23,42,0.08)] p-2.5 sm:p-4 space-y-2.5 sm:space-y-3">
              {/* Search & Filter Button */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Cari judul atau deskripsi misi..."
                    className={`w-full h-10 sm:h-11 rounded-xl pl-10 pr-9 text-sm ${fieldBase}`}
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      aria-label="Bersihkan pencarian"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setShowFilters(v => !v)}
                  className="h-10 sm:h-11 px-4 sm:px-5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition active:scale-[0.97] whitespace-nowrap"
                  style={showFilters || activeFilterCount > 0
                    ? { background: "linear-gradient(180deg,#4f46e5,#4338ca)", color: "#fff", boxShadow: "0 2px 8px -2px rgba(79,70,229,0.5)" }
                    : { background: "#f8fafc", color: "#475569", border: "1px solid #e2e8f0" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
                  </svg>
                  Filter
                  {activeFilterCount > 0 && (
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-white text-indigo-600 leading-none">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>

              {/* Filters */}
              {showFilters && (
                <div className="pt-2.5 sm:pt-3 border-t border-slate-100">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Status</span>
                      <select value={status} onChange={e => setStatus(e.target.value as any)}
                        className={`h-9 sm:h-10 rounded-lg px-2.5 sm:px-3 text-xs sm:text-sm ${fieldBase}`}>
                        {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Prioritas</span>
                      <select value={priority} onChange={e => setPriority(e.target.value as any)}
                        className={`h-9 sm:h-10 rounded-lg px-2.5 sm:px-3 text-xs sm:text-sm ${fieldBase}`}>
                        {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Pemberi</span>
                      <select value={assignerId} onChange={e => setAssignerId(e.target.value)}
                        className={`h-9 sm:h-10 rounded-lg px-2.5 sm:px-3 text-xs sm:text-sm ${fieldBase}`}>
                        <option value="">Semua Pemberi</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Penerima</span>
                      <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)}
                        className={`h-9 sm:h-10 rounded-lg px-2.5 sm:px-3 text-xs sm:text-sm ${fieldBase}`}>
                        <option value="">Semua Penerima</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Dari Tanggal</span>
                      <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                        className={`h-9 sm:h-10 rounded-lg px-2.5 sm:px-3 text-xs sm:text-sm ${fieldBase}`} />
                    </label>
                    <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Sampai Tanggal</span>
                      <input type="date" value={to} onChange={e => setTo(e.target.value)}
                        className={`h-9 sm:h-10 rounded-lg px-2.5 sm:px-3 text-xs sm:text-sm ${fieldBase}`} />
                    </label>
                  </div>
                  
                  {activeFilterCount > 0 && (
                    <button onClick={resetFilters}
                      className="mt-3 w-full h-9 sm:h-10 rounded-lg text-xs sm:text-sm font-bold text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 active:scale-[0.99] transition flex items-center justify-center gap-1.5">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M3 12a9 9 0 109-9 9 9 0 00-6.36 2.64L3 8" />
                        <path d="M3 3v5h5" />
                      </svg>
                      Reset semua filter ({activeFilterCount})
                    </button>
                  )}
                </div>
              )}

              {/* Info hasil */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-[11px] sm:text-xs text-slate-400 pt-0.5 gap-1 sm:gap-0">
                <span>
                  Menampilkan <b className="text-slate-700">{missions.length}</b> dari <b className="text-slate-700">{fmtCount(total)}</b> misi
                </span>
                {loading && (
                  <span className="flex items-center gap-1.5 text-slate-400">
                    <span className="w-3 h-3 rounded-full border-2 border-slate-200 border-t-indigo-500 animate-spin" />
                    Memuat...
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* List */}
          {loading && missions.length === 0 ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="bg-white rounded-xl border border-slate-100 px-4 py-3 flex items-center gap-3 animate-pulse">
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-1/3 bg-slate-200 rounded-full" />
                    <div className="h-2 w-1/5 bg-slate-100 rounded-full" />
                  </div>
                  <div className="h-5 w-16 bg-slate-100 rounded-full" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="bg-white rounded-xl sm:rounded-2xl border border-rose-200 shadow-sm px-4 py-8 sm:py-12 text-center">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-rose-100 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#e11d48" strokeWidth="2.2">
                  <path d="M12 9v4M12 17h.01" />
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <p className="text-sm font-bold text-rose-700">{error}</p>
              <button onClick={() => void refetch()}
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 bg-white border border-rose-200 rounded-lg px-4 h-9 hover:bg-rose-50 active:scale-[0.98] transition">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M3 12a9 9 0 109-9 9 9 0 00-6.36 2.64L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
                Coba lagi
              </button>
            </div>
          ) : missions.length === 0 ? (
            <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm py-12 sm:py-20 text-center">
              <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                  <path d="M21 21l-4.35-4.35" />
                  <circle cx="11" cy="11" r="8" />
                </svg>
              </div>
              <p className="text-base font-bold text-slate-700 tracking-tight">Tidak ada misi yang cocok</p>
              <p className="text-sm mt-2 text-slate-400">Coba longgarkan filter atau ubah kata kunci.</p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden lg:block bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_4px_16px_-8px_rgba(15,23,42,0.08)] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50/80 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Misi</th>
                        <th className="text-left px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Pemberi</th>
                        <th className="text-left px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Penerima</th>
                        <th className="text-left px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                        <th className="text-left px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Progress</th>
                        <th className="text-left px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Dibuat</th>
                        <th className="text-left px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tenggat</th>
                        <th className="w-8 px-2 py-3" aria-hidden="true" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {missions.map(m => {
                        const { done, total: t, pct } = missionProgress(m.items);
                        const od = isOverdue(m);
                        const ceo = isFromCeo(m);
                        const isOpen = openId === m.id;
                        return (
                          <Fragment key={m.id}>
                            <tr
                              onClick={() => setOpenId(isOpen ? null : m.id)}
                              className="group cursor-pointer transition-colors hover:bg-slate-50/50"
                              style={isOpen ? { background: "#f5f5ff", boxShadow: "inset 3px 0 0 #4f46e5" } : undefined}
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1.5">
                                  {ceo && <span className="text-[8px] font-black px-1.5 py-0.5 rounded" style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>CEO</span>}
                                  <span className="text-xs font-bold text-slate-800 line-clamp-1">{m.title}</span>
                                </div>
                                <div className="mt-1"><PriorityPill priority={m.priority} /></div>
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-600 truncate max-w-[140px]">{m.assigner?.name ?? "—"}</td>
                              <td className="px-4 py-3 text-xs text-slate-600 truncate max-w-[140px]">{m.assignee?.name ?? "—"}</td>
                              <td className="px-4 py-3"><StatusBadge status={m.status} /></td>
                              <td className="px-4 py-3">
                                {t > 0 ? (
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-16 h-2 rounded-full bg-slate-100 overflow-hidden">
                                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? "linear-gradient(90deg,#10b981,#059669)" : "linear-gradient(90deg,#6366f1,#818cf8)" }} />
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-500 tabular-nums">{done}/{t}</span>
                                  </div>
                                ) : <span className="text-[10px] text-slate-400">—</span>}
                              </td>
                              <td className="px-4 py-3 text-[11px] text-slate-500 whitespace-nowrap">{fmtDate(m.created_at)}</td>
                              <td className="px-4 py-3 text-[11px] whitespace-nowrap"
                                style={od ? { color: "#dc2626", fontWeight: 700 } : { color: "#64748b" }}>
                                {m.due_date ? fmtDate(m.due_date) : "—"}
                                {od && <span className="ml-1">⏰</span>}
                              </td>
                              <td className="px-2 py-3 text-slate-300 group-hover:text-indigo-500 transition-colors">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                                  style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
                                  <path d="M6 9l6 6 6-6" />
                                </svg>
                              </td>
                            </tr>
                            {isOpen && (
                              <tr className="bg-indigo-50/30">
                                <td colSpan={8} className="px-4 py-3.5" style={{ boxShadow: "inset 3px 0 0 #4f46e5" }}>
                                  <div className="grid grid-cols-2 gap-3 text-xs">
                                    {m.description && (
                                      <div className="col-span-2 bg-white rounded-lg border border-slate-200 px-3 py-2.5">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-wide">Deskripsi</p>
                                        <p className="text-slate-600 whitespace-pre-wrap leading-relaxed">{m.description}</p>
                                      </div>
                                    )}
                                    {m.rejection_reason && (
                                      <div className="col-span-2 rounded-lg px-3 py-2.5" style={{ background: "#fff1f2", border: "1px solid #fecdd3", color: "#be123c" }}>
                                        <p className="font-bold mb-0.5">Alasan ditolak:</p>
                                        <p className="leading-relaxed">{m.rejection_reason}</p>
                                      </div>
                                    )}
                                    <div className="bg-white rounded-lg border border-slate-200 px-3 py-2">
                                      <span className="text-slate-400">Submitted:</span> <span className="font-semibold text-slate-700">{fmtDateTime(m.submitted_at)}</span>
                                    </div>
                                    <div className="bg-white rounded-lg border border-slate-200 px-3 py-2">
                                      <span className="text-slate-400">Reviewed:</span> <span className="font-semibold text-slate-700">{fmtDateTime(m.reviewed_at)}</span>
                                    </div>
                                    {m.reviewer && (
                                      <div className="bg-white rounded-lg border border-slate-200 px-3 py-2">
                                        <span className="text-slate-400">Reviewer:</span> <span className="font-semibold text-slate-700">{m.reviewer.name}</span>
                                      </div>
                                    )}
                                    {m.proof_photo_url && (
                                      <div className="col-span-2">
                                        <a href={m.proof_photo_url} target="_blank" rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 hover:underline">
                                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                            <rect x="3" y="3" width="18" height="18" rx="2" />
                                            <circle cx="8.5" cy="8.5" r="1.5" />
                                            <path d="M21 15l-5-5L5 21" />
                                          </svg>
                                          Lihat bukti foto →
                                        </a>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Card View */}
              <div className="lg:hidden space-y-3">
                {missions.map(m => {
                  const { done, total: t, pct } = missionProgress(m.items);
                  const od = isOverdue(m);
                  const ceo = isFromCeo(m);
                  return (
                    <div key={m.id} 
                         onClick={() => setOpenId(openId === m.id ? null : m.id)}
                         className="bg-white rounded-xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_4px_16px_-8px_rgba(15,23,42,0.08)] p-4 active:scale-[0.99] transition-transform cursor-pointer">
                      <div className="flex items-start gap-2 mb-2">
                        {ceo && <span className="text-[8px] font-black px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5" style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>CEO</span>}
                        <h3 className="text-sm font-bold text-slate-800 flex-1 leading-snug">{m.title}</h3>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                          className="text-slate-400 flex-shrink-0 mt-1"
                          style={{ transform: openId === m.id ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                        <StatusBadge status={m.status} />
                        <PriorityPill priority={m.priority} />
                        {t > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-600 tabular-nums">
                            {done}/{t} · {pct}%
                          </span>
                        )}
                      </div>
                      
                      {t > 0 && (
                        <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden mb-3">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? "linear-gradient(90deg,#10b981,#059669)" : "linear-gradient(90deg,#6366f1,#818cf8)" }} />
                        </div>
                      )}
                      
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div className="bg-slate-50 rounded-lg px-2.5 py-2">
                          <p className="text-slate-400 text-[9px] uppercase tracking-wide">Pemberi</p>
                          <p className="font-bold text-slate-700 truncate text-xs mt-0.5">{m.assigner?.name ?? "—"}</p>
                        </div>
                        <div className="bg-slate-50 rounded-lg px-2.5 py-2">
                          <p className="text-slate-400 text-[9px] uppercase tracking-wide">Penerima</p>
                          <p className="font-bold text-slate-700 truncate text-xs mt-0.5">{m.assignee?.name ?? "—"}</p>
                        </div>
                        <div className="bg-slate-50 rounded-lg px-2.5 py-2">
                          <p className="text-slate-400 text-[9px] uppercase tracking-wide">Dibuat</p>
                          <p className="font-bold text-slate-700 text-xs mt-0.5">{fmtDate(m.created_at)}</p>
                        </div>
                        <div className={`rounded-lg px-2.5 py-2 ${od ? 'bg-rose-50' : 'bg-slate-50'}`}>
                          <p className="text-slate-400 text-[9px] uppercase tracking-wide">Tenggat</p>
                          <p className={`font-bold text-xs mt-0.5 ${od ? 'text-rose-600' : 'text-slate-700'}`}>
                            {m.due_date ? fmtDate(m.due_date) : "—"}{od && " ⏰"}
                          </p>
                        </div>
                      </div>

                      {/* Expanded details on mobile */}
                      {openId === m.id && (
                        <div className="mt-3 pt-3 border-t border-slate-100 space-y-2.5">
                          {m.description && (
                            <div className="bg-slate-50 rounded-lg px-3 py-2.5">
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-1">Deskripsi</p>
                              <p className="text-xs text-slate-600 leading-relaxed">{m.description}</p>
                            </div>
                          )}
                          {m.rejection_reason && (
                            <div className="rounded-lg px-3 py-2.5" style={{ background: "#fff1f2", border: "1px solid #fecdd3" }}>
                              <p className="text-[9px] font-bold text-rose-600 uppercase tracking-wide mb-1">Alasan ditolak</p>
                              <p className="text-xs text-rose-700 leading-relaxed">{m.rejection_reason}</p>
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {m.submitted_at && (
                              <div className="bg-slate-50 rounded-lg px-3 py-2">
                                <p className="text-[9px] text-slate-400 uppercase tracking-wide">Submitted</p>
                                <p className="font-semibold text-slate-700 mt-0.5">{fmtDateTime(m.submitted_at)}</p>
                              </div>
                            )}
                            {m.reviewed_at && (
                              <div className="bg-slate-50 rounded-lg px-3 py-2">
                                <p className="text-[9px] text-slate-400 uppercase tracking-wide">Reviewed</p>
                                <p className="font-semibold text-slate-700 mt-0.5">{fmtDateTime(m.reviewed_at)}</p>
                              </div>
                            )}
                          </div>
                          {m.reviewer && (
                            <div className="bg-slate-50 rounded-lg px-3 py-2">
                              <p className="text-[9px] text-slate-400 uppercase tracking-wide">Reviewer</p>
                              <p className="font-semibold text-slate-700 mt-0.5">{m.reviewer.name}</p>
                            </div>
                          )}
                          {m.proof_photo_url && (
                            <a href={m.proof_photo_url} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                <rect x="3" y="3" width="18" height="18" rx="2" />
                                <circle cx="8.5" cy="8.5" r="1.5" />
                                <path d="M21 15l-5-5L5 21" />
                              </svg>
                              Lihat bukti foto
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Load More */}
              {hasMore && (
                <button
                  onClick={loadMore} disabled={loadingMore}
                  className="w-full h-11 sm:h-12 rounded-xl text-sm font-bold transition active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-2 hover:border-indigo-200 hover:text-indigo-600"
                  style={{ background: "#fff", color: "#475569", border: "1px solid #e2e8f0" }}
                >
                  {loadingMore ? (
                    <>
                      <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-indigo-500 animate-spin" />
                      Memuat...
                    </>
                  ) : (
                    `Muat ${Math.min(25, total - missions.length)} misi lagi`
                  )}
                </button>
              )}
              {!hasMore && missions.length > 0 && (
                <p className="text-center text-[11px] text-slate-400 py-2">
                  ✓ Semua {fmtCount(missions.length)} misi telah ditampilkan
                </p>
              )}
            </>
          )}
        </div>
      </main>
    </DashboardLayout>
  );
}