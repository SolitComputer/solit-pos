// src/app/dashboard/cc-reports/laporan/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  type CCReport, type CCStatus, CC_STATUS_META, computeStatus, canStartPosting, fmtDateTime,
} from "@/lib/ccReports";
import { hasAnyRole, CC_REPORT_MANAGE_ROLES } from "@/lib/permissions";
import type { UserRole } from "@/lib/auth";
import CCReportModal from "@/components/cc/CCReportModal";
import DashboardLayout from "@/components/layout/DashboardLayout";

type Filter = "ALL" | CCStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "ALL", label: "Semua" },
  { key: "BELUM_SELESAI", label: "Belum Mulai" },
  { key: "PROSES", label: "Bisa Posting" },
  { key: "SIAP_POSTING", label: "Siap Posting" },
  { key: "POSTED", label: "Sudah Posting" },
];

export default function CCLaporanPage() {
  const [reports, setReports] = useState<CCReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");

  const load = useCallback(async () => {
    const res = await fetch("/api/cc-reports");
    const json = await res.json();
    if (json.success) setReports(json.reports);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    (async () => {
      try {
        const me = await fetch("/api/auth/me").then((r) => r.json());
        const roles: string[] = me?.user?.roles ?? (me?.user?.role ? [me.user.role] : []);
        setCanManage(hasAnyRole(roles, CC_REPORT_MANAGE_ROLES as UserRole[]));
      } catch {
        /* ignore */
      }
    })();
  }, [load]);

  const handleCreate = async () => {
    const t = title.trim();
    if (!t || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/cc-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t }),
      });
      const json = await res.json();
      if (json.success) {
        setReports((prev) => [json.report, ...prev]);
        setTitle("");
      } else {
        alert(json.error ?? "Gagal membuat konten");
      }
    } finally {
      setCreating(false);
    }
  };

  const withStatus = useMemo(
    () => reports.map((r) => ({ ...r, status: r.status ?? computeStatus(r) })),
    [reports]
  );

  const filtered = useMemo(() => {
    const key = q.trim().toLowerCase();
    return withStatus.filter((r) => {
      const okQ = !key || r.title.toLowerCase().includes(key);
      const okF = filter === "ALL" || r.status === filter;
      return okQ && okF;
    });
  }, [withStatus, q, filter]);

  const stats = useMemo(() => ({
    total: withStatus.length,
    canPost: withStatus.filter((r) => canStartPosting(r) && r.status !== "POSTED").length,
    posted: withStatus.filter((r) => r.status === "POSTED").length,
  }), [withStatus]);

  const activeReport = reports.find((r) => r.id === activeId) ?? null;

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-white px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          {/* Header */}
          <div className="mb-6 flex items-center gap-3">
            <Link href="/dashboard/cc-reports"
              className="rounded-xl border border-gray-200 p-2 text-gray-500 transition hover:bg-gray-50 hover:text-gray-900">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </Link>
            <div>
              <h1 className="text-xl font-black tracking-tight text-gray-900 sm:text-2xl">Laporan Kerja</h1>
              <p className="text-sm text-gray-500">
                Tambah judul konten dulu — isi take atau edit, posting bisa jalan duluan.
              </p>
            </div>
          </div>

          {/* Stat strip */}
          <div className="mb-5 grid grid-cols-3 gap-3">
            {[
              { label: "Total Konten", value: stats.total, color: "text-gray-900" },
              { label: "Bisa Posting", value: stats.canPost, color: "text-amber-600" },
              { label: "Sudah Posting", value: stats.posted, color: "text-emerald-600" },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">{s.label}</p>
                <p className={`mt-1 text-2xl font-black tabular-nums ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Buat konten baru */}
          <div className="mb-5 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <label className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Judul Konten Baru</label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder="cth: Review ThinkPad X1 Carbon Gen 9"
                className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none transition focus:ring-4 focus:ring-gray-900/5"
              />
              <button
                onClick={handleCreate}
                disabled={!title.trim() || creating}
                className="rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-gray-800 disabled:opacity-40"
              >
                {creating ? "Menyimpan…" : "+ Tambah"}
              </button>
            </div>
          </div>

          {/* Toolbar */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1 rounded-xl border border-gray-200 p-1">
              {FILTERS.map((f) => (
                <button key={f.key} onClick={() => setFilter(f.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    filter === f.key ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-50"
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari judul konten…"
              className="ml-auto w-full rounded-xl border border-gray-200 px-4 py-2 text-sm outline-none transition focus:ring-4 focus:ring-gray-900/5 sm:w-64"
            />
          </div>

          {/* Tabel */}
          <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60 text-left text-[11px] font-bold uppercase tracking-wide text-gray-400">
                    <th className="px-5 py-3">Judul Konten</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-center">Take</th>
                    <th className="px-4 py-3 text-center">Edit</th>
                    <th className="px-4 py-3 text-center">Platform</th>
                    <th className="px-5 py-3">Dibuat</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    [...Array(4)].map((_, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td colSpan={6} className="px-5 py-4">
                          <div className="h-4 animate-pulse rounded bg-gray-100" />
                        </td>
                      </tr>
                    ))
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-16 text-center text-sm text-gray-400">
                        {reports.length === 0
                          ? "Belum ada konten. Tambah judul di atas untuk mulai."
                          : "Tidak ada konten yang cocok dengan filter."}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((r) => {
                      const meta = CC_STATUS_META[r.status as CCStatus];
                      return (
                        <tr
                          key={r.id}
                          onClick={() => setActiveId(r.id)}
                          className="cursor-pointer border-b border-gray-50 transition last:border-0 hover:bg-gray-50/70"
                        >
                          <td className="px-5 py-3.5 font-bold text-gray-800">{r.title}</td>
                          <td className="px-4 py-3.5">
                            <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-bold ${meta.className}`}>
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <Dot done={r.take_done} />
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <Dot done={r.edit_done} />
                          </td>
                          <td className="px-4 py-3.5 text-center font-bold tabular-nums text-gray-700">
                            {r.postings?.length ?? 0}
                          </td>
                          <td className="whitespace-nowrap px-5 py-3.5 text-gray-400">{fmtDateTime(r.created_at)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {activeReport && (
          <CCReportModal
            report={activeReport}
            canManage={canManage}
            onClose={() => setActiveId(null)}
            onChanged={load}
          />
        )}
      </div>
    </DashboardLayout>
  );
}

function Dot({ done }: { done: boolean }) {
  return done ? (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-xs font-black text-emerald-600">
      ✓
    </span>
  ) : (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-50 text-xs font-black text-gray-300">
      —
    </span>
  );
}