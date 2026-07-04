"use client";
// src/components/missions/HistoryWorkspace.tsx
import { useMemo, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
  isFromCeo, missionProgress, fmtDate, fmtDateTime, fmtCount,
  usePaginatedMissions, WorkspaceHeader, PriorityPill,
} from "./missionShared";

export default function HistoryWorkspace() {
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState<string>("");
  const [openId, setOpenId] = useState<string | null>(null);

  // Convert bulan (YYYY-MM) → date range for API
  const dateRange = useMemo(() => {
    if (!month) return { from: undefined, to: undefined };
    const [y, mo] = month.split("-").map(Number);
    const from = new Date(y, mo - 1, 1).toISOString();
    const to = new Date(y, mo, 0, 23, 59, 59).toISOString();
    return { from, to };
  }, [month]);

  const { missions, total, loading, loadingMore, error, hasMore, loadMore, refetch } =
    usePaginatedMissions({
      box: "received",
      status: "APPROVED",
      search,
      from: dateRange.from,
      to: dateRange.to,
      date_basis: "created",
      limit: 20,
    });

  // Bulan tersedia — derive dari data yang sudah termuat (best effort)
  const months = useMemo(() => {
    const set = new Set<string>();
    missions.forEach(m => {
      const d = m.reviewed_at ?? m.updated_at;
      if (d) set.add(d.slice(0, 7));
    });
    return Array.from(set).sort().reverse();
  }, [missions]);

  const monthLabel = (ym: string) => {
    const [y, mo] = ym.split("-").map(Number);
    return new Date(y, mo - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  };

  return (
    <DashboardLayout>
      <main className="min-h-screen bg-white p-4 sm:p-6 lg:p-8">
        <div className="max-w-3xl mx-auto space-y-4">
          <WorkspaceHeader
            title="Riwayat Misi"
            subtitle={`${fmtCount(total)} misi selesai`}
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M3 3v5h5" /><path d="M3.05 13A9 9 0 1021 12a9 9 0 00-8.83 7.5" /><path d="M12 7v5l3 2" /></svg>}
          />

          {/* Sticky filter */}
          <div className="sticky top-0 z-20 bg-white pb-2 -mx-1 px-1">
            <div className="bg-white rounded-xl border border-slate-200 p-3 flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Cari judul misi..."
                  className="w-full h-9 border border-slate-200 rounded-lg pl-9 pr-3 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 focus:bg-white transition" />
              </div>
              <select value={month} onChange={e => setMonth(e.target.value)}
                className="h-9 border border-slate-200 rounded-lg px-3 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 focus:bg-white transition">
                <option value="">Semua Bulan</option>
                {months.map(ym => <option key={ym} value={ym}>{monthLabel(ym)}</option>)}
              </select>
            </div>
          </div>

          {loading && missions.length === 0 ? (
            <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 bg-slate-50 rounded-xl border border-slate-100 animate-pulse" />)}</div>
          ) : error ? (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-4 text-center">
              <p className="text-sm font-bold text-rose-700">{error}</p>
              <button onClick={() => void refetch()} className="mt-2 text-xs font-bold text-rose-600 underline">Coba lagi</button>
            </div>
          ) : missions.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
              <p className="text-sm font-bold text-slate-600">{search || month ? "Tidak ada riwayat cocok" : "Belum ada misi selesai"}</p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {missions.map(m => {
                  const { done, total: t } = missionProgress(m.items);
                  const ceo = isFromCeo(m);
                  const isOpen = openId === m.id;
                  return (
                    <div key={m.id} className="bg-white rounded-xl overflow-hidden" style={{ border: "1px solid #e2e8f0" }}>
                      <button onClick={() => setOpenId(isOpen ? null : m.id)} className="w-full text-left p-4">
                        <div className="flex items-start gap-2">
                          <span className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#ecfdf5", border: "1px solid #a7f3d0" }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              {ceo && <span className="text-[9px] font-black px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>CEO</span>}
                              <h3 className="text-sm font-bold text-slate-800 truncate">{m.title}</h3>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5">Selesai {fmtDate(m.reviewed_at ?? m.updated_at)} · dari {m.assigner?.name ?? "—"}</p>
                          </div>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5"
                            style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .2s", flexShrink: 0 }}>
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </div>
                      </button>

                      {isOpen && (
                        <div className="px-4 pb-4 space-y-3 border-t border-slate-50 pt-3">
                          {m.description && <p className="text-xs text-slate-500 leading-relaxed whitespace-pre-wrap">{m.description}</p>}
                          <div className="flex flex-wrap items-center gap-1.5">
                            <PriorityPill priority={m.priority} />
                            {t > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-md" style={{ background: "#ecfdf5", color: "#059669", border: "1px solid #a7f3d0" }}>{done}/{t} objektif</span>}
                          </div>
                          {m.proof_photo_url && (
                            <a href={m.proof_photo_url} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden border border-slate-200">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={m.proof_photo_url} alt="Bukti misi" className="w-full max-h-56 object-cover" />
                            </a>
                          )}
                          {m.proof_note && (
                            <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "#f8fafc", border: "1px solid #e2e8f0", color: "#475569" }}>
                              <span className="font-black">Catatan: </span>{m.proof_note}
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div className="rounded-lg px-3 py-2 bg-slate-50 border border-slate-100">
                              <p className="text-slate-400">Disetujui oleh</p>
                              <p className="font-bold text-slate-700">{m.reviewer?.name ?? "—"}</p>
                            </div>
                            <div className="rounded-lg px-3 py-2 bg-slate-50 border border-slate-100">
                              <p className="text-slate-400">Waktu selesai</p>
                              <p className="font-bold text-slate-700">{fmtDateTime(m.reviewed_at ?? m.updated_at)}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {hasMore && (
                <button onClick={loadMore} disabled={loadingMore}
                  className="w-full h-11 rounded-xl text-sm font-bold transition disabled:opacity-60"
                  style={{ background: "#f8fafc", color: "#475569", border: "1px solid #e2e8f0" }}>
                  {loadingMore ? "Memuat..." : "Muat riwayat lebih lama"}
                </button>
              )}
              {!hasMore && missions.length > 0 && (
                <p className="text-center text-[11px] text-slate-400 py-2">Semua riwayat sudah tampil</p>
              )}
            </>
          )}
        </div>
      </main>
    </DashboardLayout>
  );
}