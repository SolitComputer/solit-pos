// src/app/dashboard/cc-reports/laporan/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  type CCReport, type CCStatus, type CCBrand, type BrandFilter, type CCReportListResponse,
  CC_STATUS_META, CC_BRANDS, BRAND_META, BRAND_TABS, DEFAULT_BRAND,
  computeStatus, fmtDateTime,
} from "@/lib/ccReports";
import { hasAnyRole, CC_REPORT_MANAGE_ROLES } from "@/lib/permissions";
import type { UserRole } from "@/lib/auth";
import CCReportModal from "@/components/cc/CCReportModal";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { getAuthUser } from "@/hooks/useAuthUser";

type Filter = "ALL" | CCStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "ALL", label: "Semua" },
  { key: "BELUM_SELESAI", label: "Belum Mulai" },
  { key: "PROSES", label: "Menunggu Edit" },
  { key: "REVISI", label: "Revisi" },
  { key: "SIAP_POSTING", label: "Siap Posting" },
  { key: "POSTED", label: "Sudah Posting" },
  { key: "SELESAI", label: "Selesai" },
  { key: "BATAL", label: "Batal" },
];

const LIMIT = 20;

export default function CCLaporanPage() {
  const [reports, setReports] = useState<CCReport[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [newBrand, setNewBrand] = useState<CCBrand>(DEFAULT_BRAND);
  const [creating, setCreating] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [brand, setBrand] = useState<BrandFilter>("ALL");

  // ── Debounce pencarian: hindari 1 request per ketikan ──────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  // Ganti filter → balik ke halaman 1
  useEffect(() => {
    setPage(1);
  }, [debouncedQ, filter, brand]);

  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    try {
      const sp = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (brand !== "ALL") sp.set("brand", brand);
      if (filter !== "ALL") sp.set("status", filter);
      if (debouncedQ) sp.set("q", debouncedQ);

      const res = await fetch(`/api/cc-reports?${sp.toString()}`, { signal: ctrl.signal });
      const json: CCReportListResponse = await res.json();
      if (json.success) {
        setReports(json.reports);
        setTotal(json.total);
        setTotalPages(json.totalPages);
      }
    } catch {
      /* aborted */
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, [page, brand, filter, debouncedQ]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const me = await getAuthUser().then(u => ({ ok: true, json: () => Promise.resolve({ success: true, user: u }) })).then((r) => r.json());
        const roles: string[] = me?.user?.roles ?? (me?.user?.role ? [me.user.role] : []);
        setCanManage(hasAnyRole(roles, CC_REPORT_MANAGE_ROLES as UserRole[]));
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const handleCreate = async () => {
    const t = title.trim();
    if (!t || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/cc-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t, brand: newBrand }),
      });
      const json = await res.json();
      if (json.success) {
        setTitle("");
        setPage(1);
        await load();
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

  const activeReport = reports.find((r) => r.id === activeId) ?? null;

  const showing = reports.length;
  const startIdx = total === 0 ? 0 : (page - 1) * LIMIT + 1;

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
                Tambah judul konten + pilih brand tujuannya — take, editing, lalu posting.
              </p>
            </div>
          </div>

          {/* Buat konten baru */}
          <div className="mb-5 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <label className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                  Judul Konten Baru
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  placeholder="cth: Review ThinkPad X1 Carbon Gen 9"
                  className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none transition focus:ring-4 focus:ring-gray-900/5"
                />
              </div>

              {/*  Brand tujuan konten */}
              <div className="sm:w-44">
                <label className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                  Untuk Brand
                </label>
                <div className="relative mt-2">
                  <span
                    className="pointer-events-none absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full"
                    style={{ background: BRAND_META[newBrand].color }}
                  />
                  <select
                    value={newBrand}
                    onChange={(e) => setNewBrand(e.target.value as CCBrand)}
                    className="w-full appearance-none rounded-xl border border-gray-200 bg-white py-2.5 pl-8 pr-8 text-sm font-bold text-gray-800 outline-none transition focus:ring-4 focus:ring-gray-900/5"
                  >
                    {CC_BRANDS.map((b) => (
                      <option key={b} value={b}>{BRAND_META[b].label}</option>
                    ))}
                  </select>
                  <svg
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                    width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </div>

              <button
                onClick={handleCreate}
                disabled={!title.trim() || creating}
                className="rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-gray-800 disabled:opacity-40 sm:flex-shrink-0"
              >
                {creating ? "Menyimpan…" : "+ Tambah"}
              </button>
            </div>
          </div>

          {/* ── Tab brand ── */}
          <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {BRAND_TABS.map((b) => {
              const active = brand === b.key;
              return (
                <button
                  key={b.key}
                  onClick={() => setBrand(b.key)}
                  className={`flex items-center justify-center gap-1.5 rounded-2xl border px-2 py-2.5 text-xs font-bold transition ${active
                      ? "border-gray-900 bg-gray-900 text-white shadow-sm"
                      : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-800"
                    }`}
                >
                  <span
                    className="h-2 w-2 flex-shrink-0 rounded-full ring-1 ring-white/40"
                    style={{ background: b.color }}
                  />
                  <span className="truncate">{b.label}</span>
                </button>
              );
            })}
          </div>

          {/* Toolbar status + search */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1 rounded-xl border border-gray-200 p-1">
              {FILTERS.map((f) => (
                <button key={f.key} onClick={() => setFilter(f.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${filter === f.key ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-50"
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

          {/* Info hasil */}
          <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-gray-400">
            {loading
              ? "Memuat…"
              : total === 0
                ? "Tidak ada konten"
                : `Menampilkan ${startIdx}–${startIdx + showing - 1} dari ${total} konten`}
          </p>

          {/* Tabel */}
          <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60 text-left text-[11px] font-bold uppercase tracking-wide text-gray-400">
                    <th className="px-5 py-3">Judul Konten</th>
                    <th className="px-4 py-3">Brand</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Device</th>
                    <th className="px-4 py-3 text-center">Take</th>
                    <th className="px-4 py-3 text-center">Edit</th>
                    <th className="px-4 py-3 text-center">Platform</th>
                    <th className="px-4 py-3 text-center">Selesai</th>
                    <th className="px-5 py-3">Dibuat</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    [...Array(5)].map((_, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td colSpan={9} className="px-5 py-4">
                          <div className="h-4 animate-pulse rounded bg-gray-100" />
                        </td>
                      </tr>
                    ))
                  ) : withStatus.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-5 py-16 text-center text-sm text-gray-400">
                        {debouncedQ || filter !== "ALL" || brand !== "ALL"
                          ? "Tidak ada konten yang cocok dengan filter."
                          : "Belum ada konten. Tambah judul di atas untuk mulai."}
                      </td>
                    </tr>
                  ) : (
                    withStatus.map((r) => {
                      const meta = CC_STATUS_META[r.status as CCStatus];
                      const bm = BRAND_META[r.brand] ?? BRAND_META[DEFAULT_BRAND];
                      return (
                        <tr
                          key={r.id}
                          onClick={() => setActiveId(r.id)}
                          className="cursor-pointer border-b border-gray-50 transition last:border-0 hover:bg-gray-50/70"
                        >
                          <td className="px-5 py-3.5 font-bold text-gray-800">{r.title}</td>
                          <td className="px-4 py-3.5">
                            <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-bold ${bm.className}`}>
                              {bm.label}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-bold ${meta.className}`}>
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-gray-600">
                            {r.device?.trim() ? r.device : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3.5 text-center"><Dot done={r.take_done} /></td>
                          <td className="px-4 py-3.5 text-center"><Dot done={r.edit_done} /></td>
                          <td className="px-4 py-3.5 text-center font-bold tabular-nums text-gray-700">
                            {r.posting_count ?? r.postings?.length ?? 0}
                          </td>
                          <td className="px-4 py-3.5 text-center"><Dot done={Boolean(r.posting_done)} /></td>
                          <td className="whitespace-nowrap px-5 py-3.5 text-gray-400">{fmtDateTime(r.created_at)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-bold text-gray-600 transition hover:bg-gray-50 disabled:opacity-30"
              >
                ← Sebelumnya
              </button>
              <span className="text-xs font-bold text-gray-500">
                Halaman {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-bold text-gray-600 transition hover:bg-gray-50 disabled:opacity-30"
              >
                Berikutnya →
              </button>
            </div>
          )}
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
      
    </span>
  ) : (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-50 text-xs font-black text-gray-300">
      —
    </span>
  );
}