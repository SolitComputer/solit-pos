"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Link from "next/link";
import { useEffect, useState, useCallback, useMemo } from "react";

interface DeadAsset {
  id: string;
  nama_barang: string;
  keterangan: string | null;
  kondisi: string | null;
  asal_serial_number: string | null;
  asal_laptop_name: string | null;
  created_by_name: string | null;
  created_at: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

export default function AsetMatotPage() {
  const [items, setItems] = useState<DeadAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nama_barang: "", keterangan: "", kondisi: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeadAsset | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dead-assets", { cache: "no-store" });
      const d = await res.json();
      if (!d.success) throw new Error(d.message || "Gagal memuat data");
      setItems(d.data || []);
    } catch (e: any) {
      setError(e.message || "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i =>
      i.nama_barang.toLowerCase().includes(q) ||
      (i.keterangan || "").toLowerCase().includes(q) ||
      (i.asal_serial_number || "").toLowerCase().includes(q)
    );
  }, [items, query]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nama_barang.trim()) { setError("Nama barang wajib diisi"); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/dead-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.message || "Gagal menyimpan");
      setShowForm(false);
      setForm({ nama_barang: "", keterangan: "", kondisi: "" });
      await fetchItems();
    } catch (e: any) {
      setError(e.message || "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/dead-assets/${deleteTarget.id}`, { method: "DELETE" });
      const d = await res.json();
      if (!d.success) throw new Error(d.message || "Gagal menghapus");
      setDeleteTarget(null);
      await fetchItems();
    } catch (e: any) {
      setError(e.message || "Gagal menghapus");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
        {/* Hero header */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f0c29] to-[#1a1545] px-5 sm:px-8 py-6 sm:py-7 mb-6 shadow-xl shadow-[#1a1545]/20">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.15]"
            style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.7) 1px, transparent 1px)", backgroundSize: "18px 18px" }}
          />
          <div className="pointer-events-none absolute -top-16 -right-10 w-64 h-64 rounded-full bg-violet-500/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-10 w-64 h-64 rounded-full bg-emerald-500/10 blur-3xl" />

          <div className="relative">
            <Link
              href="/dashboard/fixed-assets"
              className="text-xs text-white/50 hover:text-white/85 transition inline-flex items-center gap-1 mb-4"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Kembali ke Aset Tetap
            </Link>

            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-white/25 to-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 shadow-inner">
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white">
                      <path d="M21 8v13H3V8" />
                      <path d="M1 3h22v5H1z" />
                      <path d="M10 12h4" />
                    </svg>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Aset Matot</h1>
                </div>
                <p className="text-sm text-white/50 max-w-md leading-relaxed">
                  Barang sampah / perintilan dari unit minus yang tidak layak dijual — berdiri sendiri
                </p>
                {!loading && (
                  <div className="mt-3.5 inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur px-3 py-1.5 text-xs font-semibold text-white/80 border border-white/10 shadow-inner">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    {items.length} item tercatat
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-2 rounded-full bg-white text-[#1a1545] text-sm font-bold pl-4 pr-5 py-2.5 hover:bg-white/95 active:scale-[0.97] transition-all shadow-lg shadow-black/30 hover:shadow-xl hover:-translate-y-0.5 flex-shrink-0"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Tambah Manual
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-2xl bg-red-50 text-red-600 text-sm px-4 py-3 border border-red-100 shadow-sm shadow-red-100 flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            {error}
          </div>
        )}

        <div className="relative mb-4">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari nama barang, keterangan, atau SN asal..."
            className="w-full rounded-2xl border border-gray-100 bg-white pl-10 pr-4 py-3 text-sm outline-none shadow-sm shadow-gray-200/60 focus:shadow-md focus:shadow-[#1a1545]/10 focus:ring-2 focus:ring-[#1a1545]/15 focus:border-[#1a1545]/20 transition-shadow"
          />
        </div>

        {loading ? (
          <div className="space-y-2.5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm shadow-gray-200/50 animate-pulse">
                <div className="h-4 w-1/3 bg-gray-100 rounded mb-2.5" />
                <div className="h-3 w-1/2 bg-gray-100 rounded mb-2" />
                <div className="h-3 w-1/4 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-gray-200 bg-white py-16 px-6 text-center shadow-sm shadow-gray-200/40">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center mx-auto mb-3 shadow-inner">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-300">
                <path d="M21 8v13H3V8" />
                <path d="M1 3h22v5H1z" />
                <path d="M10 12h4" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-gray-500">
              {query ? "Tidak ada hasil yang cocok" : "Belum ada aset matot"}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {query ? "Coba kata kunci lain" : "Barang yang ditambahkan akan muncul di sini"}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-3.5 rounded-2xl border-l-[3px] border-l-violet-200 border-y border-r border-y-gray-100 border-r-gray-100 bg-white px-4 py-3.5 shadow-sm shadow-gray-200/60 hover:shadow-lg hover:shadow-gray-300/40 hover:border-l-violet-400 hover:-translate-y-0.5 transition-all duration-200"
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-md shadow-violet-500/30">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white">
                    <path d="M21 8v13H3V8" />
                    <path d="M1 3h22v5H1z" />
                    <path d="M10 12h4" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-800">{item.nama_barang}</p>
                  {item.asal_serial_number && (
                    <p className="text-[11px] text-gray-400 mt-1">
                      Dari SN: <span className="font-mono bg-gray-50 px-1.5 py-0.5 rounded text-gray-500 shadow-inner">{item.asal_serial_number}</span>
                    </p>
                  )}
                  {item.keterangan && <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{item.keterangan}</p>}
                  {item.kondisi && (
                    <span className="inline-block text-[11px] font-semibold text-amber-700 bg-gradient-to-r from-amber-50 to-amber-100 border border-amber-200/60 px-2 py-0.5 rounded-full mt-1.5 shadow-sm">
                      Kondisi: {item.kondisi}
                    </span>
                  )}
                  <p className="text-[11px] text-gray-300 mt-1.5">
                    {formatDate(item.created_at)} {item.created_by_name ? `· ${item.created_by_name}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => setDeleteTarget(item)}
                  className="p-2 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50 hover:shadow-sm transition flex-shrink-0"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {showForm && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4" onClick={() => !saving && setShowForm(false)}>
            <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="relative overflow-hidden bg-gradient-to-br from-[#0f0c29] to-[#1a1545] px-6 py-5 flex items-center gap-3">
                <div
                  className="pointer-events-none absolute inset-0 opacity-[0.12]"
                  style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.7) 1px, transparent 1px)", backgroundSize: "16px 16px" }}
                />
                <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-white/25 to-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 shadow-inner">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </div>
                <h2 className="relative text-base font-bold text-white">Tambah Aset Matot</h2>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-3.5">
                <div>
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5 block">Nama Barang</label>
                  <input
                    value={form.nama_barang}
                    onChange={(e) => setForm(f => ({ ...f, nama_barang: e.target.value }))}
                    placeholder="Nama barang / perintilan"
                    className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none shadow-sm focus:ring-2 focus:ring-[#1a1545]/15 focus:border-[#1a1545]/30 transition"
                    required autoFocus
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5 block">Keterangan</label>
                  <textarea
                    value={form.keterangan}
                    onChange={(e) => setForm(f => ({ ...f, keterangan: e.target.value }))}
                    placeholder="Keterangan"
                    rows={2}
                    className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none shadow-sm focus:ring-2 focus:ring-[#1a1545]/15 focus:border-[#1a1545]/30 resize-none transition"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5 block">Kondisi (opsional)</label>
                  <input
                    value={form.kondisi}
                    onChange={(e) => setForm(f => ({ ...f, kondisi: e.target.value }))}
                    placeholder="Kondisi (opsional)"
                    className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none shadow-sm focus:ring-2 focus:ring-[#1a1545]/15 focus:border-[#1a1545]/30 transition"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={() => setShowForm(false)} disabled={saving}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 transition">
                    Batal
                  </button>
                  <button type="submit" disabled={saving}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[#0f0c29] to-[#1a1545] shadow-lg shadow-[#1a1545]/30 hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0 disabled:shadow-lg">
                    {saving ? "Menyimpan..." : "Simpan"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4" onClick={() => !deleting && setDeleteTarget(null)}>
            <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-xs p-6" onClick={(e) => e.stopPropagation()}>
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-50 to-red-100 flex items-center justify-center mb-4 shadow-inner">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500">
                  <path d="M12 9v4M12 17h.01" />
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <h2 className="text-base font-bold text-gray-800 mb-1.5">Hapus item?</h2>
              <p className="text-sm text-gray-500 mb-5">
                <span className="font-semibold text-gray-700">{deleteTarget.nama_barang}</span> akan dihapus permanen.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setDeleteTarget(null)} disabled={deleting}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 transition">
                  Batal
                </button>
                <button onClick={handleDelete} disabled={deleting}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 shadow-lg shadow-red-600/30 hover:bg-red-700 hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0">
                  {deleting ? "Menghapus..." : "Hapus"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}