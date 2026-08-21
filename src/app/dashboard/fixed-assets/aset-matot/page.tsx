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
        <Link href="/dashboard/fixed-assets" className="text-xs text-gray-400 hover:text-gray-600 transition inline-flex items-center gap-1 mb-4">
          ← Kembali ke Aset Tetap
        </Link>

        <div className="flex items-start justify-between gap-4 mb-6 pb-5 border-b border-gray-100 flex-wrap">
          <div>
            <h1 className="text-2xl font-black text-[#1a1a2e] tracking-tight">Aset Matot</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Barang sampah / perintilan dari unit minus yang tidak layak dijual — berdiri sendiri
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 rounded-full bg-[#1a1a2e] text-white text-sm font-semibold pl-4 pr-5 py-2.5 hover:bg-[#2d2d4a] transition"
          >
            + Tambah Manual
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 text-red-600 text-sm px-4 py-3 border border-red-100">{error}</div>
        )}

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari nama barang, keterangan, atau SN asal..."
          className="w-full rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-2.5 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-[#1a1a2e]/10 mb-3"
        />

        <div className="rounded-2xl border border-gray-100 overflow-hidden bg-white">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">Memuat...</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">Belum ada aset matot</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filtered.map((item) => (
                <div key={item.id} className="flex items-start gap-3 px-4 py-3.5 hover:bg-gray-50/60 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-800">{item.nama_barang}</p>
                    {item.asal_serial_number && (
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        Dari SN: <span className="font-mono">{item.asal_serial_number}</span>
                      </p>
                    )}
                    {item.keterangan && <p className="text-xs text-gray-500 mt-1">{item.keterangan}</p>}
                    {item.kondisi && <p className="text-[11px] text-amber-600 mt-0.5">Kondisi: {item.kondisi}</p>}
                    <p className="text-[11px] text-gray-300 mt-1">
                      {formatDate(item.created_at)} {item.created_by_name ? `· ${item.created_by_name}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => setDeleteTarget(item)}
                    className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition flex-shrink-0"
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
        </div>

        {showForm && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4" onClick={() => !saving && setShowForm(false)}>
            <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-base font-bold text-[#1a1a2e] mb-4">Tambah Aset Matot</h2>
              <form onSubmit={handleSubmit} className="space-y-3">
                <input
                  value={form.nama_barang}
                  onChange={(e) => setForm(f => ({ ...f, nama_barang: e.target.value }))}
                  placeholder="Nama barang / perintilan"
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#1a1a2e]/15"
                  required autoFocus
                />
                <textarea
                  value={form.keterangan}
                  onChange={(e) => setForm(f => ({ ...f, keterangan: e.target.value }))}
                  placeholder="Keterangan"
                  rows={2}
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#1a1a2e]/15 resize-none"
                />
                <input
                  value={form.kondisi}
                  onChange={(e) => setForm(f => ({ ...f, kondisi: e.target.value }))}
                  placeholder="Kondisi (opsional)"
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#1a1a2e]/15"
                />
                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={() => setShowForm(false)} disabled={saving}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 transition">
                    Batal
                  </button>
                  <button type="submit" disabled={saving}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#1a1a2e] hover:bg-[#2d2d4a] transition disabled:opacity-50">
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
              <h2 className="text-base font-bold text-gray-800 mb-1.5">Hapus item?</h2>
              <p className="text-sm text-gray-500 mb-5">{deleteTarget.nama_barang} akan dihapus permanen.</p>
              <div className="flex gap-2">
                <button onClick={() => setDeleteTarget(null)} disabled={deleting}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 transition">
                  Batal
                </button>
                <button onClick={handleDelete} disabled={deleting}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition">
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