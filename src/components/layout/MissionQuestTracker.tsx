"use client";
// src/components/layout/MissionQuestTracker.tsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/services/supabase";

const FULL_ACCESS = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];
const ACTIVE = ["PENDING", "IN_PROGRESS", "REJECTED"];
const COLLAPSE_KEY = "mission_quest_collapsed";
const HIDE_ON_MISSION_PAGE = true;

interface QItem { is_done: boolean }
interface Quest {
  id: string; title: string; status: string; priority: string; due_date: string | null;
  items?: QItem[];
  assigner?: { role?: string; roles?: string[] } | null;
}

const isCeo = (q: Quest): boolean => {
  const rs = q.assigner?.roles?.length ? q.assigner.roles : q.assigner?.role ? [q.assigner.role] : [];
  return rs.some(r => FULL_ACCESS.includes(r));
};
const prog = (items?: QItem[]) => {
  const total = items?.length ?? 0;
  const done = items?.filter(i => i.is_done).length ?? 0;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
};
const overdue = (q: Quest): boolean => !!q.due_date && new Date(q.due_date).getTime() < Date.now();

export default function MissionQuestTracker() {
  const router = useRouter();
  const pathname = usePathname();
  const [userId, setUserId] = useState<string | null>(null);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Pakai shared cache — tidak fetch terpisah ke /api/auth/me
    import("@/hooks/useAuthUser").then(({ getAuthUser }) =>
      getAuthUser().then(u => setUserId(u?.id ?? null))
    ).catch(() => setUserId(null));
  }, []);

  useEffect(() => {
    try { setCollapsed(sessionStorage.getItem(COLLAPSE_KEY) === "1"); } catch {}
  }, []);
  const toggle = () =>
    setCollapsed(v => {
      const n = !v;
      try { sessionStorage.setItem(COLLAPSE_KEY, n ? "1" : "0"); } catch {}
      return n;
    });

  const fetchQuests = useCallback(async () => {
    try {
      const res = await fetch("/api/missions?box=received");
      const data = await res.json();
      if (data.success) setQuests(((data.data as Quest[]) ?? []).filter(m => ACTIVE.includes(m.status)));
    } catch {} finally { setReady(true); }
  }, []);

  useEffect(() => { void fetchQuests(); }, [fetchQuests]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`quest-tracker-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "missions", filter: `assigned_to=eq.${userId}` }, () => void fetchQuests())
      .on("postgres_changes", { event: "*", schema: "public", table: "mission_items" }, () => void fetchQuests())
      .subscribe();
    const onVis = () => { if (document.visibilityState === "visible") void fetchQuests(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { supabase.removeChannel(ch); document.removeEventListener("visibilitychange", onVis); };
  }, [userId, fetchQuests]);

  const sorted = useMemo(() => {
    const rank: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return [...quests].sort((a, b) => {
      const ov = Number(overdue(b)) - Number(overdue(a));
      if (ov) return ov;
      const pr = (rank[a.priority] ?? 1) - (rank[b.priority] ?? 1);
      if (pr) return pr;
      const ad = a.due_date ? new Date(a.due_date).getTime() : Infinity;
      const bd = b.due_date ? new Date(b.due_date).getTime() : Infinity;
      return ad - bd;
    });
  }, [quests]);

  const onMissionPage = pathname.startsWith("/dashboard/missions");
  if (!ready || !userId || (HIDE_ON_MISSION_PAGE && onMissionPage) || sorted.length === 0) return null;

  const shown = sorted.slice(0, 4);
  const extra = sorted.length - shown.length;
  const hasOverdue = sorted.some(overdue);

  return (
    <div
      className="fixed z-[60] right-3 top-14 lg:top-3 w-[240px] sm:w-[264px] flex flex-col gap-1.5 select-none"
      style={{ animation: "qtPanelIn .4s cubic-bezier(.16,1,.3,1) both" }}
    >
      <style>{`
        @keyframes qtPanelIn { from { opacity:0; transform: translateX(24px) scale(.96);} to { opacity:1; transform: translateX(0) scale(1);} }
        @keyframes qtCardIn  { from { opacity:0; transform: translateY(-8px) scale(.97);} to { opacity:1; transform: translateY(0) scale(1);} }
        @keyframes qtShimmer { 0% { background-position: -140% 0;} 100% { background-position: 140% 0;} }
        @keyframes qtDot     { 0%,100% { transform: scale(1); opacity:1;} 50% { transform: scale(1.5); opacity:.55;} }
        @keyframes qtRing    { 0% { box-shadow: 0 0 0 0 rgba(244,63,94,.45);} 70% { box-shadow: 0 0 0 6px rgba(244,63,94,0);} 100% { box-shadow: 0 0 0 0 rgba(244,63,94,0);} }
      `}</style>

      {/* Header */}
      <button
        onClick={toggle}
        className="self-end flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-full bg-white/90 backdrop-blur border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-200 transition group"
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${hasOverdue ? "bg-rose-500" : "bg-indigo-500"}`}
          style={{ animation: "qtDot 1.4s ease-in-out infinite" }}
        />
        <span className="text-[11px] font-bold tracking-wide text-slate-600 group-hover:text-slate-800 transition">Misi Aktif</span>
        <span className={`text-[10px] font-black tabular-nums px-1.5 rounded-full ${hasOverdue ? "bg-rose-100 text-rose-600" : "bg-indigo-100 text-indigo-600"}`}>
          {sorted.length}
        </span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
          className="text-slate-400"
          style={{ transform: collapsed ? "rotate(180deg)" : "none", transition: "transform .25s ease" }}>
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>

      {/* Body — animasi collapse grid */}
      <div className={`grid transition-all duration-300 ease-out ${collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"}`}>
        <div className="overflow-hidden min-h-0">
          <div className="flex flex-col gap-1.5">
            {shown.map((q, idx) => {
              const { done, total, pct } = prog(q.items);
              const ceo = isCeo(q);
              const od = overdue(q);
              const accent = ceo ? "#2563eb" : "#6366f1";
              return (
                <button
                  key={q.id}
                  onClick={() => router.push("/dashboard/missions/progress")}
                  className="relative w-full text-left bg-white rounded-xl pl-3 pr-2.5 py-2 overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98]"
                  style={{
                    border: `1px solid ${od ? "#fecdd3" : ceo ? "#bfdbfe" : "#e5e7eb"}`,
                    boxShadow: ceo ? "0 2px 10px rgba(37,99,235,0.12)" : "0 1px 3px rgba(15,23,42,0.06)",
                    animation: `qtCardIn .35s cubic-bezier(.16,1,.3,1) both`,
                    animationDelay: `${idx * 55}ms`,
                    ...(od ? { animationName: "qtCardIn, qtRing", animationDuration: ".35s, 2s", animationIterationCount: "1, infinite", animationDelay: `${idx * 55}ms, ${idx * 55 + 350}ms` } : {}),
                  }}
                >
                  <span className="absolute left-0 top-0 h-full w-[3px]" style={{ background: accent }} />
                  <div className="flex items-center gap-1.5">
                    {ceo && (
                      <span className="text-[8px] font-black px-1 py-px rounded flex-shrink-0"
                        style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>CEO</span>
                    )}
                    <span className="text-[12px] font-bold text-slate-800 truncate flex-1">{q.title}</span>
                    {od && <span className="text-[8px] font-black text-rose-500 flex-shrink-0 animate-pulse">LEWAT</span>}
                  </div>
                  {total > 0 ? (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full overflow-hidden bg-slate-100 relative">
                        <div className="h-full rounded-full relative overflow-hidden" style={{ width: `${pct}%`, background: accent, transition: "width .7s cubic-bezier(.16,1,.3,1)" }}>
                          <span
                            className="absolute inset-0"
                            style={{
                              background: "linear-gradient(90deg, transparent, rgba(255,255,255,.55), transparent)",
                              backgroundSize: "200% 100%",
                              animation: "qtShimmer 1.8s linear infinite",
                            }}
                          />
                        </div>
                      </div>
                      <span className="text-[9px] font-black tabular-nums" style={{ color: accent }}>{done}/{total}</span>
                    </div>
                  ) : (
                    <p className="mt-1 text-[9px] font-semibold" style={{ color: od ? "#f43f5e" : "#94a3b8" }}>
                      {q.status === "REJECTED" ? "Perlu revisi" : od ? "Tenggat terlewat" : "Ketuk untuk mulai"}
                    </p>
                  )}
                </button>
              );
            })}
            {extra > 0 && (
              <button
                onClick={() => router.push("/dashboard/missions/progress")}
                className="text-[10px] font-bold text-slate-400 hover:text-indigo-600 transition py-0.5"
                style={{ animation: "qtCardIn .35s ease both", animationDelay: `${shown.length * 55}ms` }}
              >
                +{extra} misi lainnya →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}