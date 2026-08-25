"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { useEffect, useState, useCallback, useMemo } from "react";

interface FixedAsset {
  id: string;
  nama_aset: string;
  nominal: number;
  keterangan: string | null;
  created_by_name: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
}

interface FormState {
  nama_aset: string;
  nominal: string;
  keterangan: string;
}

const EMPTY_FORM: FormState = { nama_aset: "", nominal: "", keterangan: "" };

function formatIDR(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function AssetIcon({ className }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 21h18" />
      <path d="M5 21V7l7-4 7 4v14" />
      <path d="M9 21v-6h6v6" />
      <path d="M9 11h.01M15 11h.01M9 15h.01M15 15h.01" />
    </svg>
  );
}

function StackIcon({ className }: { className?: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 2 2 7l10 5 10-5-10-5Z" />
      <path d="m2 17 10 5 10-5" />
      <path d="m2 12 10 5 10-5" />
    </svg>
  );
}

function WalletIcon({ className }: { className?: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  );
}

export default function FixedAssetsContent() {
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<FixedAsset | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/fixed-assets", { cache: "no-store" });
      const d = await res.json();
      if (!d.success) throw new Error(d.message || "Gagal memuat data aset");
      setAssets(d.data || []);
    } catch (err: any) {
      setError(err.message || "Gagal memuat data aset");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const totalNominal = useMemo(
    () => assets.reduce((sum, a) => sum + (Number(a.nominal) || 0), 0),
    [assets]
  );

  const maxNominal = useMemo(
    () => assets.reduce((m, a) => Math.max(m, Number(a.nominal) || 0), 0),
    [assets]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter(
      (a) =>
        a.nama_aset.toLowerCase().includes(q) ||
        (a.keterangan || "").toLowerCase().includes(q)
    );
  }, [assets, query]);

  function openCreateModal() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setModalOpen(true);
  }

  function openEditModal(asset: FixedAsset) {
    setEditingId(asset.id);
    setForm({
      nama_aset: asset.nama_aset,
      nominal: String(asset.nominal),
      keterangan: asset.keterangan || "",
    });
    setError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nama_aset.trim()) {
      setError("Nama aset wajib diisi");
      return;
    }
    const nominalNumber = Number(form.nominal);
    if (!Number.isFinite(nominalNumber) || nominalNumber < 0) {
      setError("Nominal tidak valid");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        nama_aset: form.nama_aset.trim(),
        nominal: nominalNumber,
        keterangan: form.keterangan.trim() || null,
      };
      const res = await fetch(
        editingId ? `/api/fixed-assets/${editingId}` : "/api/fixed-assets",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const d = await res.json();
      if (!d.success) throw new Error(d.message || "Gagal menyimpan aset");
      setModalOpen(false);
      await fetchAssets();
    } catch (err: any) {
      setError(err.message || "Gagal menyimpan aset");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/fixed-assets/${deleteTarget.id}`, { method: "DELETE" });
      const d = await res.json();
      if (!d.success) throw new Error(d.message || "Gagal menghapus aset");
      setDeleteTarget(null);
      await fetchAssets();
    } catch (err: any) {
      setError(err.message || "Gagal menghapus aset");
    } finally {
      setDeleting(false);
    }
  }

  const nominalPreview = Number(form.nominal);
  const hasNominalPreview = form.nominal.trim() !== "" && Number.isFinite(nominalPreview);

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
        {/* Header — RESPONSIVE FIX: judul & deskripsi di-scale, tombol lebih compact di HP */}
        <div className="flex items-start justify-between gap-3 sm:gap-4 mb-5 sm:mb-6 pb-4 sm:pb-5 border-b border-gray-100 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-[#1a1a2e] flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#1a1a2e]/20">
              <AssetIcon className="text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-black text-[#1a1a2e] tracking-tight">Data Aset Tetap</h1>
              <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
                Catatan aset tetap perusahaan — input manual, tidak terhubung ke modul lain
              </p>
            </div>
          </div>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 sm:gap-2 rounded-full bg-[#1a1a2e] text-white text-xs sm:text-sm font-semibold pl-3.5 pr-4 sm:pl-4 sm:pr-5 py-2 sm:py-2.5 hover:bg-[#2d2d4a] active:scale-[0.98] transition-all shadow-lg shadow-[#1a1a2e]/25 flex-shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Tambah Aset
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="rounded-2xl bg-white border border-gray-100 p-4 shadow-sm shadow-gray-100/80 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-[#1a1a2e]/5 flex items-center justify-center">
                <StackIcon className="text-[#1a1a2e]/60" />
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Jumlah Aset</p>
            </div>
            <p className="text-xl sm:text-2xl font-black text-[#1a1a2e]">{assets.length}</p>
          </div>

          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a1a2e] to-[#2d2d4a] p-4 shadow-lg shadow-[#1a1a2e]/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl">
            <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-amber-400/20 blur-2xl" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
                  <WalletIcon className="text-amber-300" />
                </div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-white/50">Total Nilai Aset</p>
              </div>
              <p className="text-xl sm:text-2xl font-black text-white truncate">{formatIDR(totalNominal)}</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 text-red-600 text-sm px-4 py-3 border border-red-100">
            {error}
          </div>
        )}

        {/* Search */}
        {assets.length > 0 && (
          <div className="relative mb-3">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari nama aset..."
              className="w-full rounded-xl border border-gray-100 bg-gray-50/60 pl-10 pr-9 py-2.5 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-[#1a1a2e]/10 focus:border-gray-200 transition"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="Hapus pencarian"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* List */}
        <div className="rounded-2xl border border-gray-100 overflow-hidden bg-white">
          <div className="h-1 bg-gradient-to-r from-amber-300 via-amber-400 to-amber-300" />
          {loading ? (
            <div className="divide-y divide-gray-50">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                  <div className="w-10 h-10 rounded-xl bg-gray-100 animate-pulse flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-32 bg-gray-100 rounded animate-pulse" />
                    <div className="h-2.5 w-20 bg-gray-100 rounded animate-pulse" />
                  </div>
                  <div className="h-3 w-16 bg-gray-100 rounded animate-pulse" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-center px-6">
              <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center mb-3">
                <AssetIcon className="text-gray-300" />
              </div>
              <p className="text-sm font-medium text-gray-500">
                {assets.length === 0 ? "Belum ada data aset" : "Tidak ditemukan"}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {assets.length === 0
                  ? 'Klik "Tambah Aset" untuk mulai mencatat.'
                  : `Tidak ada aset yang cocok dengan "${query}"`}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filtered.map((asset) => {
                const pct = maxNominal > 0 ? Math.max(4, (Number(asset.nominal) / maxNominal) * 100) : 0;
                return (
                  <div
                    key={asset.id}
                    // RESPONSIVE FIX: padding row & gap dikurangi di HP biar lega untuk teks
                    className="group flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 sm:py-3.5 hover:bg-gray-50/60 transition-colors"
                  >
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#1a1a2e]/5 flex items-center justify-center flex-shrink-0">
                      <AssetIcon className="text-[#1a1a2e]/70" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-800 truncate">{asset.nama_aset}</p>
                      <p className="text-xs text-gray-400 truncate mt-0.5">
                        {asset.keterangan || formatDate(asset.created_at)}
                      </p>
                    </div>

                    <div className="hidden md:block w-16 flex-shrink-0">
                      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      {/* RESPONSIVE FIX: nominal text-xs di HP biar baris gak sempit karena angka panjang */}
                      <p className="text-xs sm:text-sm font-bold text-[#1a1a2e] tabular-nums">{formatIDR(asset.nominal)}</p>
                      <p className="text-[10px] sm:text-[11px] text-gray-300 mt-0.5">{formatDate(asset.created_at)}</p>
                    </div>

                    <div className="flex items-center gap-0.5 flex-shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
                      <button
                        onClick={() => openEditModal(asset)}
                        className="p-2 rounded-lg text-gray-400 hover:text-[#1a1a2e] hover:bg-gray-100 transition"
                        aria-label="Edit"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setDeleteTarget(asset)}
                        className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                        aria-label="Hapus"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Add/Edit modal — RESPONSIVE FIX: padding p-5 di HP + max-h/overflow-y-auto biar aman saat keyboard muncul */}
        {modalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
            onClick={closeModal}
          >
            <div
              className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-sm p-5 sm:p-6 max-h-[92dvh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-[#1a1a2e]/5 flex items-center justify-center flex-shrink-0">
                  <AssetIcon className="text-[#1a1a2e]" />
                </div>
                <h2 className="text-base font-bold text-[#1a1a2e]">
                  {editingId ? "Edit Aset" : "Tambah Aset"}
                </h2>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Nama Aset</label>
                  <input
                    type="text"
                    value={form.nama_aset}
                    onChange={(e) => setForm((f) => ({ ...f, nama_aset: e.target.value }))}
                    placeholder="Contoh: Motor Honda Beat 2022"
                    className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#1a1a2e]/15 focus:border-[#1a1a2e]/30 transition"
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Nominal (Rp)</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={form.nominal}
                    onChange={(e) => setForm((f) => ({ ...f, nominal: e.target.value }))}
                    placeholder="0"
                    className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#1a1a2e]/15 focus:border-[#1a1a2e]/30 transition"
                    required
                  />
                  {hasNominalPreview && (
                    <p className="text-xs text-amber-600 font-medium mt-1.5">
                      ≈ {formatIDR(nominalPreview)}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Keterangan (opsional)</label>
                  <textarea
                    value={form.keterangan}
                    onChange={(e) => setForm((f) => ({ ...f, keterangan: e.target.value }))}
                    placeholder="Catatan tambahan..."
                    rows={2}
                    className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#1a1a2e]/15 focus:border-[#1a1a2e]/30 transition resize-none"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={saving}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 transition disabled:opacity-50"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#1a1a2e] hover:bg-[#2d2d4a] transition disabled:opacity-50"
                  >
                    {saving ? "Menyimpan..." : "Simpan"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete confirm modal — RESPONSIVE FIX: padding p-5 di HP */}
        {deleteTarget && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
            onClick={() => !deleting && setDeleteTarget(null)}
          >
            <div
              className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-xs p-5 sm:p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center mb-4">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
              </div>
              <h2 className="text-base font-bold text-gray-800 mb-1.5">Hapus Aset?</h2>
              <p className="text-sm text-gray-500 mb-1 leading-relaxed">
                <span className="font-semibold text-gray-700">{deleteTarget.nama_aset}</span> akan dihapus
                permanen dan tidak bisa dikembalikan.
              </p>
              <p className="text-xs font-semibold text-red-500 mb-5">
                Nilai: {formatIDR(deleteTarget.nominal)}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 transition disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition disabled:opacity-50"
                >
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