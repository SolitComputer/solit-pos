"use client";
// src/components/missions/ProgressWorkspace.tsx
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
  Mission, MissionStatus,
  isFromCeo, isOverdue, missionProgress, fmtDate, fmtCount,
  usePaginatedMissions, WorkspaceHeader, StatusBadge, PriorityPill, ProgressBar,
} from "./missionShared";
import {
  Search, ChevronDown, Crown, Clock, Settings, X, LayoutGrid, ArrowRight,
  AlertTriangle, Inbox, Loader2,
  type LucideIcon,
} from "lucide-react";

type FilterKey = "ALL" | MissionStatus;

const FILTERS: { key: FilterKey; label: string; status?: MissionStatus; Icon: LucideIcon }[] = [
  { key: "ALL", label: "Semua", Icon: LayoutGrid },
  { key: "PENDING", label: "Belum", status: "PENDING", Icon: Clock },
  { key: "IN_PROGRESS", label: "On Progress", status: "IN_PROGRESS", Icon: Settings },
  { key: "SUBMITTED", label: "Audit", status: "SUBMITTED", Icon: Search },
  { key: "REJECTED", label: "Revisi", status: "REJECTED", Icon: X },
];

export default function ProgressWorkspace() {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [savingItem, setSavingItem] = useState<string | null>(null);

  // Kalau ALL → fetch tanpa filter status, exclude APPROVED via filter status trick
  // Karena API tidak support "exclude APPROVED", kita fetch semua & filter di client.
  // Untuk filter spesifik, kirim status ke API.
  const activeStatus = FILTERS.find(f => f.key === filter)?.status;

  const { missions, total, loading, loadingMore, error, hasMore, loadMore, refetch } =
    usePaginatedMissions({
      box: "received",
      search,
      status: activeStatus,
      limit: 20,
    });

  // Kalau ALL → sisihkan APPROVED (progress = yg belum selesai)
  const shown = useMemo(() => {
    const list = filter === "ALL"
      ? missions.filter(m => m.status !== "APPROVED")
      : missions;
    const rank: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return [...list].sort((a, b) => {
      const ov = Number(isOverdue(b)) - Number(isOverdue(a));
      if (ov) return ov;
      const pr = (rank[a.priority] ?? 1) - (rank[b.priority] ?? 1);
      if (pr) return pr;
      const ad = a.due_date ? new Date(a.due_date).getTime() : Infinity;
      const bd = b.due_date ? new Date(b.due_date).getTime() : Infinity;
      return ad - bd;
    });
  }, [missions, filter]);

  const toggleItem = async (mission: Mission, itemId: string, next: boolean) => {
    if (mission.status === "APPROVED" || mission.status === "SUBMITTED") return;
    setSavingItem(itemId);
    try {
      const res = await fetch(`/api/missions/${mission.id}/items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId, is_done: next }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Gagal memperbarui");
      await refetch();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal memperbarui checklist");
    } finally { setSavingItem(null); }
  };

  return (
    <DashboardLayout>
      <main className="min-h-screen bg-white p-4 sm:p-6 lg:p-8">
        <div className="max-w-3xl mx-auto space-y-4">
          <WorkspaceHeader
            title="Progress Misi"
            subtitle={`Misi berjalan · ${fmtCount(total)} total${filter !== "ALL" ? ` di kategori ini` : ""}`}
            icon={<Clock className="w-[18px] h-[18px]" strokeWidth={2.2} />}
          />

          {/* Sticky filter + search */}
          <div className="sticky top-0 z-20 bg-white pb-2 -mx-1 px-1 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Cari misi..."
                className="w-full h-10 border border-slate-200 rounded-lg pl-10 pr-3 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 focus:bg-white transition" />
            </div>
            <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-1">
              {FILTERS.map(f => {
                const activeF = filter === f.key;
                return (
                  <button key={f.key} onClick={() => setFilter(f.key)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap"
                    style={activeF ? { background: "#0f172a", color: "#fff" } : { background: "#fff", color: "#64748b", border: "1px solid #e2e8f0" }}>
                    <f.Icon className="w-3.5 h-3.5" />
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          {loading && missions.length === 0 ? (
            <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-24 bg-slate-50 rounded-xl border border-slate-100 animate-pulse" />)}</div>
          ) : error ? (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-5 text-center">
              <AlertTriangle className="w-6 h-6 mx-auto mb-2" style={{ color: "#e11d48" }} />
              <p className="text-sm font-bold text-rose-700">{error}</p>
              <button onClick={() => void refetch()} className="mt-2 text-xs font-bold text-rose-600 underline">Coba lagi</button>
            </div>
          ) : shown.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
              <Inbox className="w-9 h-9 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-bold text-slate-600">
                {search ? "Tidak ada misi cocok" : filter === "ALL" ? "Tidak ada misi berjalan" : "Kategori ini kosong"}
              </p>
              <p className="text-xs mt-1 text-slate-400">
                {search ? "Coba kata kunci lain." : "Semua misi kamu sudah selesai."}
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {shown.map(m => {
                  const { done, total: t, pct } = missionProgress(m.items);
                  const ceo = isFromCeo(m);
                  const od = isOverdue(m);
                  const isOpen = openId === m.id;
                  const items = [...(m.items ?? [])].sort((a, b) => a.sort_order - b.sort_order);
                  const allDone = t > 0 && done === t;
                  return (
                    <div key={m.id} className="bg-white rounded-xl overflow-hidden transition"
                      style={{ border: `1px solid ${ceo ? "#bfdbfe" : "#e2e8f0"}` }}>
                      <div className="h-0.5 w-full" style={{ background: ceo ? "#2563eb" : "#6366f1" }} />
                      <button onClick={() => setOpenId(isOpen ? null : m.id)} className="w-full text-left p-4">
                        <div className="flex items-start gap-2 mb-2">
                          {ceo && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-black px-1.5 py-0.5 rounded flex-shrink-0"
                              style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>
                              <Crown className="w-2.5 h-2.5" /> CEO
                            </span>
                          )}
                          <h3 className="text-sm font-bold text-slate-800 flex-1 leading-tight">{m.title}</h3>
                          <ChevronDown
                            className="w-4 h-4 flex-shrink-0"
                            style={{ color: "#94a3b8", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }}
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mb-3">
                          <StatusBadge status={m.status} />
                          <PriorityPill priority={m.priority} />
                          {m.due_date && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                              style={od ? { color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca" } : { color: "#64748b", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                              {od ? "Lewat: " : "Tenggat: "}{fmtDate(m.due_date)}
                            </span>
                          )}
                        </div>
                        {t > 0 && (
                          <>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[11px] font-bold text-slate-400">Objektif {done}/{t}</span>
                              <span className="text-[11px] font-black" style={{ color: ceo ? "#2563eb" : "#6366f1" }}>{pct}%</span>
                            </div>
                            <ProgressBar pct={pct} ceo={ceo} />
                          </>
                        )}
                      </button>

                      {isOpen && (
                        <div className="px-4 pb-4 -mt-1 space-y-3 border-t border-slate-50 pt-3">
                          {m.description && <p className="text-xs text-slate-500 leading-relaxed whitespace-pre-wrap">{m.description}</p>}
                          {m.status === "REJECTED" && m.rejection_reason && (
                            <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: "#fff1f2", border: "1px solid #fecdd3", color: "#be123c" }}>
                              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                              <span><span className="font-black">Alasan ditolak: </span>{m.rejection_reason}</span>
                            </div>
                          )}
                          {items.length > 0 ? (
                            <div className="space-y-1.5">
                              {items.map(it => {
                                const saving = savingItem === it.id;
                                const locked = m.status === "SUBMITTED";
                                return (
                                  <button key={it.id} disabled={saving || locked}
                                    onClick={() => void toggleItem(m, it.id, !it.is_done)}
                                    className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left transition disabled:opacity-60 disabled:cursor-not-allowed"
                                    style={{ background: it.is_done ? "#f8fafc" : "#fff", border: `1px solid #e2e8f0` }}>
                                    <span className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                                      style={{ background: it.is_done ? "#059669" : "#fff", border: `1.5px solid ${it.is_done ? "#059669" : "#cbd5e1"}` }}>
                                      {saving ? <span className="w-3 h-3 rounded-full border-2 border-slate-300 border-t-slate-500 animate-spin" />
                                        : it.is_done ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg> : null}
                                    </span>
                                    <span className="text-xs font-semibold flex-1"
                                      style={{ color: it.is_done ? "#94a3b8" : "#334155", textDecoration: it.is_done ? "line-through" : "none" }}>
                                      {it.text}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          ) : <p className="text-xs text-slate-400 italic">Misi ini tanpa checklist objektif.</p>}
                          {m.status === "SUBMITTED" && <p className="text-[11px] font-semibold text-violet-500">Bukti sudah dikirim, menunggu ACC. Checklist terkunci sementara.</p>}
                          {allDone && (m.status === "PENDING" || m.status === "IN_PROGRESS") && (
                            <button onClick={() => router.push("/dashboard/missions")}
                              className="w-full h-10 rounded-lg text-sm font-bold text-white transition active:scale-[0.98] flex items-center justify-center gap-1.5"
                              style={{ background: "#0f172a" }}>
                              Semua objektif beres — Kirim bukti di Dashboard <ArrowRight className="w-4 h-4" />
                            </button>
                          )}
                          <p className="text-[10px] text-slate-400">Dari {m.assigner?.name ?? "—"} · dibuat {fmtDate(m.created_at)}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {hasMore && (
                <button onClick={loadMore} disabled={loadingMore}
                  className="w-full h-11 rounded-xl text-sm font-bold transition disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ background: "#f8fafc", color: "#475569", border: "1px solid #e2e8f0" }}>
                  {loadingMore ? (<><Loader2 className="w-4 h-4 animate-spin" /> Memuat...</>) : "Muat lebih banyak"}
                </button>
              )}
              {!hasMore && shown.length > 0 && (
                <p className="text-center text-[11px] text-slate-400 py-2">Sudah tampil semua</p>
              )}
            </>
          )}
        </div>
      </main>
    </DashboardLayout>
  );
}