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

// ─── Subcomponents ────────────────────────────────────────────────────────────

/** Dot indicator untuk priority — lebih hemat ruang dari pill */
function PriorityDot({ priority }: { priority: MissionPriority }) {
  const colors: Record<MissionPriority, string> = {
    HIGH: "#ef4444",
    MEDIUM: "#f59e0b",
    LOW: "#10b981",
  };
  const labels: Record<MissionPriority, string> = {
    HIGH: "Tinggi",
    MEDIUM: "Sedang",
    LOW: "Rendah",
  };
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
      <span
        className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: colors[priority] }}
      />
      {labels[priority]}
    </span>
  );
}

/** Progress bar inline — compact */
function ProgressBar({ done, total, pct }: { done: number; total: number; pct: number }) {
  if (total === 0) return <span className="text-[11px] text-slate-400">—</span>;
  const isDone = pct === 100;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="w-14 h-1.5 rounded-full bg-slate-100 border border-slate-200/80 overflow-hidden flex-shrink-0">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${pct}%`,
            background: isDone
              ? "linear-gradient(90deg,#10b981,#059669)"
              : "linear-gradient(90deg,#6366f1,#818cf8)",
          }}
        />
      </div>
      <span className="text-[10px] font-semibold text-slate-500 tabular-nums whitespace-nowrap">
        {done}/{total}
      </span>
    </div>
  );
}

/** Badge kecil untuk CEO tag */
function CeoTag() {
  return (
    <span className="inline-flex items-center h-4 px-1.5 text-[9px] font-black rounded tracking-wide"
      style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>
      CEO
    </span>
  );
}

/** Expanded detail row untuk desktop */
function ExpandedDetail({ m }: { m: Mission }) {
  return (
    <tr style={{ background: "#f8f8ff" }}>
      <td colSpan={7} className="px-5 py-4" style={{ boxShadow: "inset 3px 0 0 #6366f1" }}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
          {m.description && (
            <div className="col-span-2 lg:col-span-4 bg-white rounded-xl border border-slate-200 px-3.5 py-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Deskripsi</p>
              <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">{m.description}</p>
            </div>
          )}
          {m.rejection_reason && (
            <div className="col-span-2 lg:col-span-4 rounded-xl px-3.5 py-3"
              style={{ background: "#fff1f2", border: "1px solid #fecdd3" }}>
              <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest mb-1.5">Alasan Ditolak</p>
              <p className="text-rose-700 leading-relaxed">{m.rejection_reason}</p>
            </div>
          )}
          {m.submitted_at && (
            <div className="bg-white rounded-xl border border-slate-200 px-3.5 py-2.5">
              <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Submitted</p>
              <p className="font-semibold text-slate-700">{fmtDateTime(m.submitted_at)}</p>
            </div>
          )}
          {m.reviewed_at && (
            <div className="bg-white rounded-xl border border-slate-200 px-3.5 py-2.5">
              <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Reviewed</p>
              <p className="font-semibold text-slate-700">{fmtDateTime(m.reviewed_at)}</p>
            </div>
          )}
          {m.reviewer && (
            <div className="bg-white rounded-xl border border-slate-200 px-3.5 py-2.5">
              <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Reviewer</p>
              <p className="font-semibold text-slate-700">{m.reviewer.name}</p>
            </div>
          )}
          {m.proof_photo_url && (
            <div className="col-span-2 lg:col-span-4 flex items-center gap-2 pt-0.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              <a href={m.proof_photo_url} target="_blank" rel="noopener noreferrer"
                className="text-xs font-bold text-indigo-600 hover:text-indigo-700 hover:underline underline-offset-2">
                Lihat bukti foto →
              </a>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

/** Mobile card expanded detail */
function MobileExpandedDetail({ m }: { m: Mission }) {
  return (
    <div className="mt-3.5 pt-3.5 border-t border-slate-100 space-y-2">
      {m.description && (
        <div className="bg-slate-50 rounded-xl px-3 py-2.5">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Deskripsi</p>
          <p className="text-xs text-slate-600 leading-relaxed">{m.description}</p>
        </div>
      )}
      {m.rejection_reason && (
        <div className="rounded-xl px-3 py-2.5" style={{ background: "#fff1f2", border: "1px solid #fecdd3" }}>
          <p className="text-[9px] font-bold text-rose-500 uppercase tracking-widest mb-1">Alasan Ditolak</p>
          <p className="text-xs text-rose-700 leading-relaxed">{m.rejection_reason}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {m.submitted_at && (
          <div className="bg-slate-50 rounded-xl px-3 py-2.5">
            <p className="text-[9px] text-slate-400 uppercase tracking-widest">Submitted</p>
            <p className="text-xs font-semibold text-slate-700 mt-0.5">{fmtDateTime(m.submitted_at)}</p>
          </div>
        )}
        {m.reviewed_at && (
          <div className="bg-slate-50 rounded-xl px-3 py-2.5">
            <p className="text-[9px] text-slate-400 uppercase tracking-widest">Reviewed</p>
            <p className="text-xs font-semibold text-slate-700 mt-0.5">{fmtDateTime(m.reviewed_at)}</p>
          </div>
        )}
      </div>
      {m.reviewer && (
        <div className="bg-slate-50 rounded-xl px-3 py-2.5">
          <p className="text-[9px] text-slate-400 uppercase tracking-widest">Reviewer</p>
          <p className="text-xs font-semibold text-slate-700 mt-0.5">{m.reviewer.name}</p>
        </div>
      )}
      {m.proof_photo_url && (
        <a href={m.proof_photo_url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:underline underline-offset-2">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
          Lihat bukti foto
        </a>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

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

  // ── Loading / Access Guards ──────────────────────────────────────────────
  if (!user) {
    return (
      <DashboardLayout>
        <div className="min-h-screen bg-gradient-to-b from-slate-100/70 via-[#f7f8fa] to-[#f7f8fa] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200/80 px-8 py-12 flex flex-col items-center gap-4">
            <div className="w-10 h-10 rounded-full border-4 border-slate-200 border-t-indigo-500 animate-spin" />
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

  // ── Shared select/input class ────────────────────────────────────────────
  const fieldBase =
    "w-full h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 " +
    "focus:outline-none focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-300 focus:bg-white transition";

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <main className="min-h-screen bg-gradient-to-b from-slate-100/70 via-[#f7f8fa] to-[#f7f8fa] p-3 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-5">

          {/* ── Header ── */}
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

          {/* ── Sticky Filter Bar ── */}
          <div className="sticky top-0 z-20 -mx-1 px-1 pt-1 pb-2">
            <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/80 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.08)] p-3 sm:p-4 space-y-3">

              {/* Baris atas: search + tombol filter */}
              <div className="flex gap-2">
                {/* Search */}
                <div className="relative flex-1">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Cari judul atau deskripsi misi..."
                    className={
                      "w-full h-10 rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-9 text-sm text-slate-700 " +
                      "placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/15 " +
                      "focus:border-indigo-300 focus:bg-white transition"
                    }
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      aria-label="Bersihkan pencarian"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Tombol Filter */}
                <button
                  onClick={() => setShowFilters(v => !v)}
                  className="h-10 px-4 rounded-xl text-sm font-bold flex items-center gap-1.5 transition active:scale-[0.97] whitespace-nowrap flex-shrink-0"
                  style={
                    showFilters || activeFilterCount > 0
                      ? { background: "linear-gradient(180deg,#4f46e5,#4338ca)", color: "#fff", boxShadow: "0 2px 8px -2px rgba(79,70,229,0.4)" }
                      : { background: "#f8fafc", color: "#475569", border: "1px solid #e2e8f0" }
                  }
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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

              {/* Filter grid (expanded) */}
              {showFilters && (
                <div className="pt-3 border-t border-slate-100 space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</span>
                      <select value={status} onChange={e => setStatus(e.target.value as MissionStatus | "")}
                        className={fieldBase}>
                        {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Prioritas</span>
                      <select value={priority} onChange={e => setPriority(e.target.value as MissionPriority | "")}
                        className={fieldBase}>
                        {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pemberi</span>
                      <select value={assignerId} onChange={e => setAssignerId(e.target.value)}
                        className={fieldBase}>
                        <option value="">Semua</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Penerima</span>
                      <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)}
                        className={fieldBase}>
                        <option value="">Semua</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dari</span>
                      <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                        className={fieldBase} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sampai</span>
                      <input type="date" value={to} onChange={e => setTo(e.target.value)}
                        className={fieldBase} />
                    </label>
                  </div>

                  {activeFilterCount > 0 && (
                    <button onClick={resetFilters}
                      className="w-full h-8 rounded-lg text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 active:scale-[0.99] transition flex items-center justify-center gap-1.5">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
                  Menampilkan{" "}
                  <b className="text-slate-600 font-semibold">{missions.length}</b>
                  {" "}dari{" "}
                  <b className="text-slate-600 font-semibold">{fmtCount(total)}</b>
                  {" "}misi
                </span>
                {loading && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full border-2 border-slate-200 border-t-indigo-500 animate-spin" />
                    Memuat...
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── States: loading / error / empty ── */}
          {loading && missions.length === 0 ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="bg-white rounded-xl border border-slate-100 px-4 py-3.5 flex items-center gap-3 animate-pulse">
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-2/5 bg-slate-200 rounded-full" />
                    <div className="h-2 w-1/4 bg-slate-100 rounded-full" />
                  </div>
                  <div className="h-5 w-16 bg-slate-100 rounded-full" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="bg-white rounded-2xl border border-rose-200 shadow-sm px-4 py-12 text-center">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-rose-100 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#e11d48" strokeWidth="2.2">
                  <path d="M12 9v4M12 17h.01" />
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <p className="text-sm font-bold text-rose-700 mb-4">{error}</p>
              <button onClick={() => void refetch()}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 bg-white border border-rose-200 rounded-lg px-4 h-9 hover:bg-rose-50 active:scale-[0.98] transition">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M3 12a9 9 0 109-9 9 9 0 00-6.36 2.64L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
                Coba lagi
              </button>
            </div>
          ) : missions.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm py-16 text-center">
              <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                  <path d="M21 21l-4.35-4.35" />
                  <circle cx="11" cy="11" r="8" />
                </svg>
              </div>
              <p className="text-base font-bold text-slate-700 tracking-tight">Tidak ada misi yang cocok</p>
              <p className="text-sm mt-1.5 text-slate-400">Coba longgarkan filter atau ubah kata kunci.</p>
            </div>
          ) : (
            <>
              {/* ── Desktop Table ── */}
              <div className="hidden lg:block bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_4px_16px_-8px_rgba(15,23,42,0.08)] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200">
                        {["Misi", "Pemberi", "Penerima", "Status", "Progress", "Tenggat", ""].map((h, i) => (
                          <th
                            key={i}
                            className={`text-left px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest ${i === 6 ? "w-8 px-2" : ""}`}
                          >
                            {h}
                          </th>
                        ))}
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
                              className="group cursor-pointer hover:bg-slate-50/60 transition-colors"
                              style={isOpen ? { background: "#f5f4ff", boxShadow: "inset 3px 0 0 #6366f1" } : undefined}
                            >
                              {/* Misi */}
                              <td className="px-4 py-3 max-w-[220px]">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  {ceo && <CeoTag />}
                                  <span className="text-[13px] font-semibold text-slate-800 truncate leading-snug">
                                    {m.title}
                                  </span>
                                </div>
                                <div className="mt-1">
                                  <PriorityDot priority={m.priority} />
                                </div>
                              </td>
                              {/* Pemberi */}
                              <td className="px-4 py-3 text-xs text-slate-500 max-w-[130px] truncate">
                                {m.assigner?.name ?? "—"}
                              </td>
                              {/* Penerima */}
                              <td className="px-4 py-3 text-xs text-slate-500 max-w-[130px] truncate">
                                {m.assignee?.name ?? "—"}
                              </td>
                              {/* Status */}
                              <td className="px-4 py-3">
                                <StatusBadge status={m.status} />
                              </td>
                              {/* Progress */}
                              <td className="px-4 py-3">
                                <ProgressBar done={done} total={t} pct={pct} />
                              </td>
                              {/* Tenggat */}
                              <td className="px-4 py-3 whitespace-nowrap">
                                {m.due_date ? (
                                  <span className={`text-[11px] font-medium ${od ? "text-rose-600" : "text-slate-500"}`}>
                                    {fmtDate(m.due_date)}{od && " ⏰"}
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-slate-400">—</span>
                                )}
                              </td>
                              {/* Chevron */}
                              <td className="px-2 py-3 text-slate-300 group-hover:text-indigo-400 transition-colors">
                                <svg
                                  width="14" height="14" viewBox="0 0 24 24"
                                  fill="none" stroke="currentColor" strokeWidth="2.5"
                                  style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }}
                                >
                                  <path d="M6 9l6 6 6-6" />
                                </svg>
                              </td>
                            </tr>

                            {/* Expanded row */}
                            {isOpen && <ExpandedDetail m={m} />}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Mobile Card View ── */}
              <div className="lg:hidden space-y-2.5">
                {missions.map(m => {
                  const { done, total: t, pct } = missionProgress(m.items);
                  const od = isOverdue(m);
                  const ceo = isFromCeo(m);
                  const isOpen = openId === m.id;
                  return (
                    <div
                      key={m.id}
                      onClick={() => setOpenId(isOpen ? null : m.id)}
                      className="bg-white rounded-xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_4px_12px_-6px_rgba(15,23,42,0.08)] p-4 cursor-pointer active:scale-[0.99] transition-transform"
                    >
                      {/* Top: CEO tag + title + chevron */}
                      <div className="flex items-start justify-between gap-2 mb-2.5">
                        <div className="flex-1 min-w-0">
                          {ceo && <div className="mb-1.5"><CeoTag /></div>}
                          <h3 className="text-sm font-semibold text-slate-800 leading-snug">{m.title}</h3>
                        </div>
                        <svg
                          width="15" height="15" viewBox="0 0 24 24"
                          fill="none" stroke="currentColor" strokeWidth="2.5"
                          className="text-slate-400 flex-shrink-0 mt-0.5"
                          style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }}
                        >
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </div>

                      {/* Badge row: status + priority + progress */}
                      <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                        <StatusBadge status={m.status} />
                        <PriorityPill priority={m.priority} />
                        {t > 0 && (
                          <span className="inline-flex items-center h-5 px-1.5 rounded-md bg-slate-50 border border-slate-200 text-[10px] font-semibold text-slate-600 tabular-nums">
                            {done}/{t} · {pct}%
                          </span>
                        )}
                      </div>

                      {/* Progress bar */}
                      {t > 0 && (
                        <div className="w-full h-1.5 rounded-full bg-slate-100 border border-slate-200/60 overflow-hidden mb-3">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${pct}%`,
                              background: pct === 100
                                ? "linear-gradient(90deg,#10b981,#059669)"
                                : "linear-gradient(90deg,#6366f1,#818cf8)",
                            }}
                          />
                        </div>
                      )}

                      {/* Meta grid */}
                      <div className="grid grid-cols-2 gap-1.5">
                        <div className="bg-slate-50 rounded-lg px-2.5 py-2">
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Pemberi</p>
                          <p className="text-xs font-semibold text-slate-700 truncate">{m.assigner?.name ?? "—"}</p>
                        </div>
                        <div className="bg-slate-50 rounded-lg px-2.5 py-2">
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Penerima</p>
                          <p className="text-xs font-semibold text-slate-700 truncate">{m.assignee?.name ?? "—"}</p>
                        </div>
                        <div className="bg-slate-50 rounded-lg px-2.5 py-2">
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Dibuat</p>
                          <p className="text-xs font-semibold text-slate-700">{fmtDate(m.created_at)}</p>
                        </div>
                        <div className={`rounded-lg px-2.5 py-2 ${od ? "bg-rose-50" : "bg-slate-50"}`}>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Tenggat</p>
                          <p className={`text-xs font-semibold ${od ? "text-rose-600" : "text-slate-700"}`}>
                            {m.due_date ? fmtDate(m.due_date) : "—"}{od && " ⏰"}
                          </p>
                        </div>
                      </div>

                      {/* Expanded detail */}
                      {isOpen && <MobileExpandedDetail m={m} />}
                    </div>
                  );
                })}
              </div>

              {/* ── Load More ── */}
              {hasMore && (
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full h-11 rounded-xl text-sm font-semibold transition active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-2 hover:border-indigo-200 hover:text-indigo-600 bg-white text-slate-500 border border-slate-200"
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