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
    return (
      <DashboardLayout>
        <div className="min-h-screen bg-white flex items-center justify-center p-8">
          <div className="flex items-center gap-2.5 text-slate-400">
            <span className="w-4 h-4 rounded-full border-2 border-slate-200 border-t-slate-500 animate-spin" />
            <span className="text-sm font-semibold">Memuat...</span>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!hasFullAccess(roles)) {
    return (
      <DashboardLayout>
        <main className="min-h-screen bg-white p-8">
          <div className="max-w-md mx-auto text-center py-16">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
            </div>
            <p className="text-lg font-bold text-slate-800">Akses Ditolak</p>
            <p className="text-sm text-slate-500 mt-2 leading-relaxed">
              Halaman ini hanya untuk role Admin / Programmer / Asisten CEO.
            </p>
          </div>
        </main>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <main className="min-h-screen bg-slate-50/40 p-4 sm:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto space-y-5">
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
          <div className="sticky top-0 z-20 -mx-1 px-1 pt-1 pb-3 bg-gradient-to-b from-slate-50/95 via-slate-50/80 to-transparent backdrop-blur-sm">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Cari judul atau deskripsi misi..."
                    className="w-full h-10 border border-slate-200 rounded-xl pl-10 pr-9 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 focus:bg-white transition"
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
                  className="h-10 px-3.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-[0.97]"
                  style={showFilters || activeFilterCount > 0
                    ? { background: "#0f172a", color: "#fff", boxShadow: "0 1px 2px rgba(15,23,42,0.2)" }
                    : { background: "#f8fafc", color: "#475569", border: "1px solid #e2e8f0" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
                  </svg>
                  Filter
                  {activeFilterCount > 0 && (
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-white text-slate-900 leading-none">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>

              {showFilters && (
                <div className="pt-2.5 border-t border-slate-100 grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Status</span>
                    <select value={status} onChange={e => setStatus(e.target.value as any)}
                      className="h-9 border border-slate-200 rounded-lg px-2.5 text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 focus:bg-white transition">
                      {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Prioritas</span>
                    <select value={priority} onChange={e => setPriority(e.target.value as any)}
                      className="h-9 border border-slate-200 rounded-lg px-2.5 text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 focus:bg-white transition">
                      {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Pemberi</span>
                    <select value={assignerId} onChange={e => setAssignerId(e.target.value)}
                      className="h-9 border border-slate-200 rounded-lg px-2.5 text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 focus:bg-white transition">
                      <option value="">Semua Pemberi</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Penerima</span>
                    <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)}
                      className="h-9 border border-slate-200 rounded-lg px-2.5 text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 focus:bg-white transition">
                      <option value="">Semua Penerima</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </label>
                  <label className="col-span-2 flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Dari Tanggal</span>
                    <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                      className="h-9 border border-slate-200 rounded-lg px-2.5 text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 focus:bg-white transition" />
                  </label>
                  <label className="col-span-2 flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Sampai Tanggal</span>
                    <input type="date" value={to} onChange={e => setTo(e.target.value)}
                      className="h-9 border border-slate-200 rounded-lg px-2.5 text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 focus:bg-white transition" />
                  </label>
                  {activeFilterCount > 0 && (
                    <button onClick={resetFilters}
                      className="col-span-full h-9 rounded-lg text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 active:scale-[0.99] transition flex items-center justify-center gap-1.5">
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
              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
                <span>
                  Menampilkan <b className="text-slate-700">{missions.length}</b> dari <b className="text-slate-700">{fmtCount(total)}</b> misi
                </span>
                {loading && (
                  <span className="flex items-center gap-1.5 text-slate-400">
                    <span className="w-3 h-3 rounded-full border-2 border-slate-200 border-t-slate-500 animate-spin" />
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
                <div key={i} className="h-16 bg-white rounded-xl border border-slate-100 px-4 flex items-center gap-3 overflow-hidden">
                  <div className="flex-1 space-y-2">
                    <div className="h-2.5 w-1/3 bg-slate-100 rounded-full animate-pulse" />
                    <div className="h-2 w-1/5 bg-slate-100 rounded-full animate-pulse" />
                  </div>
                  <div className="h-5 w-16 bg-slate-100 rounded-full animate-pulse" />
                  <div className="h-2 w-20 bg-slate-100 rounded-full animate-pulse hidden sm:block" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl px-4 py-8 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-rose-100 flex items-center justify-center">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#e11d48" strokeWidth="2.2">
                  <path d="M12 9v4M12 17h.01" />
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <p className="text-sm font-bold text-rose-700">{error}</p>
              <button onClick={() => void refetch()}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 bg-white border border-rose-200 rounded-lg px-3 h-8 hover:bg-rose-50 active:scale-[0.98] transition">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M3 12a9 9 0 109-9 9 9 0 00-6.36 2.64L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
                Coba lagi
              </button>
            </div>
          ) : missions.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm py-16 text-center">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                  <path d="M21 21l-4.35-4.35" />
                  <circle cx="11" cy="11" r="8" />
                </svg>
              </div>
              <p className="text-sm font-bold text-slate-600">Tidak ada misi yang cocok</p>
              <p className="text-xs mt-1 text-slate-400">Coba longgarkan filter atau ubah kata kunci.</p>
            </div>
          ) : (
            <>
              {/* Table style (desktop) + card fallback (mobile) */}
              <div className="hidden lg:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
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
                            className="group cursor-pointer transition-colors"
                            style={isOpen ? { background: "#f8fafc", boxShadow: "inset 3px 0 0 #6366f1" } : undefined}
                          >
                            <td className="px-4 py-3 group-hover:bg-slate-50 transition-colors">
                              <div className="flex items-center gap-1.5">
                                {ceo && <span className="text-[8px] font-black px-1 py-0.5 rounded" style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>CEO</span>}
                                <span className="text-xs font-bold text-slate-800 line-clamp-1">{m.title}</span>
                              </div>
                              <div className="mt-1"><PriorityPill priority={m.priority} /></div>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-600 truncate max-w-[140px] group-hover:bg-slate-50 transition-colors">{m.assigner?.name ?? "—"}</td>
                            <td className="px-4 py-3 text-xs text-slate-600 truncate max-w-[140px] group-hover:bg-slate-50 transition-colors">{m.assignee?.name ?? "—"}</td>
                            <td className="px-4 py-3 group-hover:bg-slate-50 transition-colors"><StatusBadge status={m.status} /></td>
                            <td className="px-4 py-3 group-hover:bg-slate-50 transition-colors">
                              {t > 0 ? (
                                <div className="flex items-center gap-1.5">
                                  <div className="w-16 h-2 rounded-full bg-slate-100 overflow-hidden">
                                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? "#059669" : "#6366f1" }} />
                                  </div>
                                  <span className="text-[10px] font-bold text-slate-500 tabular-nums">{done}/{t}</span>
                                </div>
                              ) : <span className="text-[10px] text-slate-400">—</span>}
                            </td>
                            <td className="px-4 py-3 text-[11px] text-slate-500 whitespace-nowrap group-hover:bg-slate-50 transition-colors">{fmtDate(m.created_at)}</td>
                            <td className="px-4 py-3 text-[11px] whitespace-nowrap group-hover:bg-slate-50 transition-colors"
                              style={od ? { color: "#dc2626", fontWeight: 700 } : { color: "#64748b" }}>
                              {m.due_date ? fmtDate(m.due_date) : "—"}
                              {od && <span className="ml-1">⏰</span>}
                            </td>
                            <td className="px-2 py-3 text-slate-300 group-hover:text-slate-500 group-hover:bg-slate-50 transition-colors">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                                style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
                                <path d="M6 9l6 6 6-6" />
                              </svg>
                            </td>
                          </tr>
                          {isOpen && (
                            <tr className="bg-slate-50/50">
                              <td colSpan={8} className="px-4 py-3.5" style={{ boxShadow: "inset 3px 0 0 #6366f1" }}>
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
                                        className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline">
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

              {/* Mobile card view */}
              <div className="lg:hidden space-y-2.5">
                {missions.map(m => {
                  const { done, total: t, pct } = missionProgress(m.items);
                  const od = isOverdue(m);
                  const ceo = isFromCeo(m);
                  return (
                    <div key={m.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3.5 active:scale-[0.99] transition-transform">
                      <div className="flex items-start gap-2 mb-2">
                        {ceo && <span className="text-[8px] font-black px-1 py-0.5 rounded flex-shrink-0 mt-0.5" style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>CEO</span>}
                        <h3 className="text-sm font-bold text-slate-800 flex-1 leading-snug">{m.title}</h3>
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
                        <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden mb-2.5">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? "#059669" : "#6366f1" }} />
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                        <div className="bg-slate-50 rounded-lg px-2 py-1.5">
                          <p className="text-slate-400">Pemberi</p>
                          <p className="font-bold text-slate-700 truncate">{m.assigner?.name ?? "—"}</p>
                        </div>
                        <div className="bg-slate-50 rounded-lg px-2 py-1.5">
                          <p className="text-slate-400">Penerima</p>
                          <p className="font-bold text-slate-700 truncate">{m.assignee?.name ?? "—"}</p>
                        </div>
                        <div className="bg-slate-50 rounded-lg px-2 py-1.5">
                          <p className="text-slate-400">Dibuat</p>
                          <p className="font-bold text-slate-700">{fmtDate(m.created_at)}</p>
                        </div>
                        <div className="rounded-lg px-2 py-1.5" style={od ? { background: "#fef2f2" } : { background: "#f8fafc" }}>
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
                  className="w-full h-11 rounded-xl text-sm font-bold transition active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ background: "#f8fafc", color: "#475569", border: "1px solid #e2e8f0" }}
                >
                  {loadingMore ? (
                    <>
                      <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-slate-500 animate-spin" />
                      Memuat...
                    </>
                  ) : `Muat ${Math.min(25, total - missions.length)} misi lagi`}
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