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
export const FULL_ACCESS_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO", "ACCOUNTING"];

export const STATUS_META: Record<MissionStatus, { label: string; text: string; bg: string; border: string; dot: string }> = {
  PENDING: { label: "Audit", text: "#92610a", bg: "#fffbeb", border: "#fde68a", dot: "#f59e0b" },
  IN_PROGRESS: { label: "On Progress", text: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe", dot: "#3b82f6" },
  SUBMITTED: { label: "Audit", text: "#6d28d9", bg: "#f5f3ff", border: "#ddd6fe", dot: "#8b5cf6" },
  REJECTED: { label: "Perlu Revisi", text: "#be123c", bg: "#fff1f2", border: "#fecdd3", dot: "#f43f5e" },
  APPROVED: { label: "Selesai", text: "#047857", bg: "#ecfdf5", border: "#a7f3d0", dot: "#10b981" },
};

export const PRIORITY_META: Record<MissionPriority, { label: string; color: string; bg: string; border: string }> = {
  HIGH: { label: "Tinggi", color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
  MEDIUM: { label: "Sedang", color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  LOW: { label: "Rendah", color: "#059669", bg: "#ecfdf5", border: "#a7f3d0" },
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

// ── Tambahan di bawah useReceivedMissions ────────────────────────────────────

export type MissionBox = "received" | "assigned" | "all";

export interface MissionFilters {
  box: MissionBox;
  search?: string;
  status?: MissionStatus | "";
  priority?: MissionPriority | "";
  assigner_id?: string;
  assignee_id?: string;
  from?: string;
  to?: string;
  date_basis?: "created" | "due";
  limit?: number;
}

export interface PaginatedResult {
  missions: Mission[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  refetch: () => Promise<void>;
}

/**
 * Hook fetch paginated + realtime.
 * - Debounced search (300ms) supaya tidak spam API.
 * - Load more (append) — smooth di mobile.
 * - Realtime hanya invalidate halaman 1 biar hemat.
 */
export function usePaginatedMissions(filters: MissionFilters): PaginatedResult {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [debouncedSearch, setDebouncedSearch] = useState(filters.search ?? "");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filters.search ?? ""), 300);
    return () => clearTimeout(t);
  }, [filters.search]);

  const limit = filters.limit ?? 20;

  const buildParams = useCallback((p: number) => {
    const qs = new URLSearchParams();
    qs.set("box", filters.box);
    qs.set("page", String(p));
    qs.set("limit", String(limit));
    if (debouncedSearch) qs.set("search", debouncedSearch);
    if (filters.status) qs.set("status", filters.status);
    if (filters.priority) qs.set("priority", filters.priority);
    if (filters.assigner_id) qs.set("assigner_id", filters.assigner_id);
    if (filters.assignee_id) qs.set("assignee_id", filters.assignee_id);
    if (filters.from) qs.set("from", filters.from);
    if (filters.to) qs.set("to", filters.to);
    if (filters.date_basis) qs.set("date_basis", filters.date_basis);
    return qs.toString();
  }, [
    filters.box, filters.status, filters.priority,
    filters.assigner_id, filters.assignee_id, filters.from, filters.to,
    filters.date_basis, limit, debouncedSearch,
  ]);

  const fetchPage = useCallback(async (p: number, append: boolean) => {
    if (append) setLoadingMore(true); else setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/missions?${buildParams(p)}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Gagal memuat misi");
      const rows = (data.data ?? []) as Mission[];
      setMissions(prev => (append ? [...prev, ...rows] : rows));
      setTotal(data.total ?? rows.length);
      setHasMore(!!data.hasMore);
      setPage(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [buildParams]);

  useEffect(() => { void fetchPage(1, false); }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    void fetchPage(page + 1, true);
  }, [loadingMore, hasMore, page, fetchPage]);

  const refetch = useCallback(() => fetchPage(1, false), [fetchPage]);

  useEffect(() => {
    const ch = supabase
      .channel(`missions-paginated-${filters.box}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "missions" }, () => {
        void fetchPage(1, false);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "mission_items" }, () => {
        void fetchPage(1, false);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchPage, filters.box]);

  return { missions, total, loading, loadingMore, error, hasMore, loadMore, refetch };
}

export const fmtCount = (n: number): string => {
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}rb`;
  return `${Math.round(n / 1000)}rb`;
};

export const hasFullAccess = (roles: string[]): boolean =>
  roles.some(r => FULL_ACCESS_ROLES.includes(r));

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