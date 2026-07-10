// src/app/dashboard/cc-reports/laporan/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import {
  type CCReport, CC_STATUS_META, computeStatus, fmtDateTime,
} from "@/lib/ccReports";
import { hasAnyRole, CC_REPORT_MANAGE_ROLES } from "@/lib/permissions";
import type { UserRole } from "@/lib/auth";
import CCReportModal from "@/components/cc/CCReportModal";
import DashboardLayout from "@/components/layout/DashboardLayout";

export default function CCLaporanPage() {
  const [reports, setReports] = useState<CCReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);

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
      } catch { }
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

  const activeReport = reports.find((r) => r.id === activeId) ?? null;

  return (
    <DashboardLayout>

      <div className="min-h-screen bg-[#F7F7F8] px-4 py-6 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <Link
              href="/dashboard/cc-reports"
              className="p-2 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-gray-800 transition"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-[#1a1a2e] tracking-tight">Laporan Kerja</h1>
              <p className="text-sm text-gray-500">Tambahkan judul konten dulu, isi take & edit kapan saja.</p>
            </div>
          </div>

          {/* Buat konten baru */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6">
            <label className="text-xs font-bold uppercase tracking-wide text-gray-400">Judul Konten Baru</label>
            <div className="flex flex-col sm:flex-row gap-2 mt-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder="cth: Review ThinkPad X1 Carbon Gen 9"
                className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#1a1a2e]/20"
              />
              <button
                onClick={handleCreate}
                disabled={!title.trim() || creating}
                className="rounded-xl bg-[#1a1a2e] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#2d2d4a] disabled:opacity-40"
              >
                {creating ? "Menyimpan…" : "+ Tambah"}
              </button>
            </div>
          </div>

          {/* Tabel */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                    <th className="px-4 py-3">Judul Konten</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-center">Take</th>
                    <th className="px-4 py-3 text-center">Edit</th>
                    <th className="px-4 py-3 text-center">Platform</th>
                    <th className="px-4 py-3">Dibuat</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    [...Array(4)].map((_, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td colSpan={6} className="px-4 py-4">
                          <div className="h-4 bg-gray-100 rounded animate-pulse" />
                        </td>
                      </tr>
                    ))
                  ) : reports.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                        Belum ada konten. Tambah judul di atas untuk mulai.
                      </td>
                    </tr>
                  ) : (
                    reports.map((r) => {
                      const status = r.status ?? computeStatus(r);
                      const meta = CC_STATUS_META[status];
                      return (
                        <tr
                          key={r.id}
                          onClick={() => setActiveId(r.id)}
                          className="border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50/70 transition"
                        >
                          <td className="px-4 py-3 font-semibold text-gray-800">{r.title}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-md ${meta.className}`}>
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">{r.take_done ? "✅" : "—"}</td>
                          <td className="px-4 py-3 text-center">{r.edit_done ? "✅" : "—"}</td>
                          <td className="px-4 py-3 text-center tabular-nums text-gray-600">
                            {r.postings?.length ?? 0}
                          </td>
                          <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{fmtDateTime(r.created_at)}</td>
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