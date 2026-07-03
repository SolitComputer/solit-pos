"use client";
// src/components/missions/missionShared.tsx
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/services/supabase";

export type MissionStatus = "PENDING" | "IN_PROGRESS" | "SUBMITTED" | "REJECTED" | "APPROVED";
export type MissionPriority = "HIGH" | "MEDIUM" | "LOW";

export interface MissionItem {
  id: string; mission_id?: string; text: string;
  is_done: boolean; done_at: string | null; sort_order: number;
}
export interface MissionPerson { id: string; name: string; role?: string; roles?: string[]; }

export interface Mission {
  id: string; title: string; description: string | null;
  status: MissionStatus; priority: MissionPriority; due_date: string | null;
  proof_photo_url: string | null; proof_note: string | null;
  submitted_at: string | null; reviewed_at: string | null; rejection_reason: string | null;
  created_at: string; updated_at: string;
  assigner?: MissionPerson | null;
  assignee?: MissionPerson | null;
  reviewer?: { id: string; name: string } | null;
  items?: MissionItem[];
}

export const ACTIVE_STATUSES: MissionStatus[] = ["PENDING", "IN_PROGRESS", "SUBMITTED", "REJECTED"];
export const FULL_ACCESS_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];

export const STATUS_META: Record<MissionStatus, { label: string; text: string; bg: string; border: string; dot: string }> = {
  PENDING:     { label: "Belum Dikerjakan",  text: "#92610a", bg: "#fffbeb", border: "#fde68a", dot: "#f59e0b" },
  IN_PROGRESS: { label: "Sedang Dikerjakan", text: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe", dot: "#3b82f6" },
  SUBMITTED:   { label: "Menunggu ACC",      text: "#6d28d9", bg: "#f5f3ff", border: "#ddd6fe", dot: "#8b5cf6" },
  REJECTED:    { label: "Perlu Revisi",      text: "#be123c", bg: "#fff1f2", border: "#fecdd3", dot: "#f43f5e" },
  APPROVED:    { label: "Selesai",           text: "#047857", bg: "#ecfdf5", border: "#a7f3d0", dot: "#10b981" },
};

export const PRIORITY_META: Record<MissionPriority, { label: string; color: string; bg: string; border: string }> = {
  HIGH:   { label: "Tinggi", color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
  MEDIUM: { label: "Sedang", color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  LOW:    { label: "Rendah", color: "#059669", bg: "#ecfdf5", border: "#a7f3d0" },
};

export const isFromCeo = (m: Mission): boolean => {
  const rs = m.assigner?.roles?.length ? m.assigner.roles : m.assigner?.role ? [m.assigner.role] : [];
  return rs.some(r => FULL_ACCESS_ROLES.includes(r));
};

export const missionProgress = (items?: MissionItem[]) => {
  const total = items?.length ?? 0;
  const done = items?.filter(i => i.is_done).length ?? 0;
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
};

export const isOverdue = (m: Mission): boolean =>
  !!m.due_date && m.status !== "APPROVED" && new Date(m.due_date).getTime() < Date.now();

export const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export const fmtDateTime = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

// ── Hook fetch + realtime ─────────────────────────────────────────────────────
export function useReceivedMissions() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMissions = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/missions?box=received");
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Gagal memuat misi");
      setMissions((data.data ?? []) as Mission[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan saat memuat misi");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void fetchMissions(); }, [fetchMissions]);

  useEffect(() => {
    const ch = supabase
      .channel("missions-shared-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "missions" }, () => void fetchMissions())
      .on("postgres_changes", { event: "*", schema: "public", table: "mission_items" }, () => void fetchMissions())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchMissions]);

  return { missions, loading, error, refetch: fetchMissions };
}

// ── Header halaman (formal, putih) ────────────────────────────────────────────
export function WorkspaceHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3.5 pb-4 border-b border-slate-100">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-slate-50 border border-slate-200 text-slate-700">
        {icon}
      </div>
      <div>
        <h1 className="text-lg font-bold text-slate-900 tracking-tight leading-none">{title}</h1>
        <p className="text-[12px] mt-1 text-slate-400">{subtitle}</p>
      </div>
    </div>
  );
}

// ── Atom UI ───────────────────────────────────────────────────────────────────
export function StatusBadge({ status }: { status: MissionStatus }) {
  const s = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-md"
      style={{ color: s.text, background: s.bg, border: `1px solid ${s.border}` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
}

export function PriorityPill({ priority }: { priority: MissionPriority }) {
  const p = PRIORITY_META[priority];
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md"
      style={{ color: p.color, background: p.bg, border: `1px solid ${p.border}` }}>
      {p.label}
    </span>
  );
}

export function ProgressBar({ pct, ceo }: { pct: number; ceo?: boolean }) {
  return (
    <div className="h-1.5 rounded-full overflow-hidden bg-slate-100">
      <div className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, background: ceo ? "#2563eb" : "#6366f1" }} />
    </div>
  );
}