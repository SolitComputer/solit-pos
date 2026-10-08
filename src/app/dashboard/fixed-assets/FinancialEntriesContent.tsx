"use client";

import { useEffect, useState, useCallback, useMemo, type ReactNode } from "react";

// ── Tipe & konfigurasi per modul ────────────────────────────────────────────
export type EntryType = "utang" | "piutang" | "modal_service";

type ApiResp<T> = { success: boolean; data?: T; message?: string };

interface FinancialEntry {
  id: string;
  entry_type: EntryType;
  nama: string;
  kategori: string | null;
  nominal: number | string;
  tanggal: string | null;
  keterangan: string | null;
  created_by_name: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
}

interface NominalHistory {
  id: string;
  nominal_lama: number | string;
  nominal_baru: number | string;
  changed_by_name: string | null;
  created_at: string;
}

interface FormState {
  nama: string;
  kategori: string;
  nominal: string;
  tanggal: string;
  keterangan: string;
}

const EMPTY_FORM: FormState = { nama: "", kategori: "", nominal: "", tanggal: "", keterangan: "" };

interface TypeConfig {
  title: string;
  subtitle: string;
  totalLabel: string;
  namaLabel: string;
  namaPlaceholder: string;
  addLabel: string;
  tile: string; // warna kotak ikon
  Icon: (p: { size?: number; className?: string }) => ReactNode;
}

const CONFIG: Record<EntryType, TypeConfig> = {
  utang: {
    title: "Data Utang",
    subtitle: "Catatan utang perusahaan, input manual",
    totalLabel: "Total utang",
    namaLabel: "Pihak (kreditur)",
    namaPlaceholder: "Contoh: Supplier Jaya / Bank BCA",
    addLabel: "Tambah Utang",
    tile: "bg-rose-50 text-rose-600",
    Icon: UtangIcon,
  },
  piutang: {
    title: "Data Piutang",
    subtitle: "Catatan piutang perusahaan, input manual",
    totalLabel: "Total piutang",
    namaLabel: "Pihak (debitur)",
    namaPlaceholder: "Contoh: Toko Ahmad / Budi",
    addLabel: "Tambah Piutang",
    tile: "bg-emerald-50 text-emerald-600",
    Icon: PiutangIcon,
  },
  modal_service: {
    title: "Data Modal Service",
    subtitle: "Catatan modal service, input manual",
    totalLabel: "Total modal service",
    namaLabel: "Nama / Sumber",
    namaPlaceholder: "Contoh: Modal awal service, Setoran owner",
    addLabel: "Tambah Modal",
    tile: "bg-indigo-50 text-indigo-600",
    Icon: ModalIcon,
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function toNum(v: number | string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatIDR(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatThousand(raw: string): string {
  if (!raw.trim()) return "";
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function errMsg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

// ═════════════════════════════════════════════════════════════════════════════
// Component
// ═════════════════════════════════════════════════════════════════════════════
export default function FinancialEntriesContent({ entryType }: { entryType: EntryType }) {
  const cfg = CONFIG[entryType];
  const Icon = cfg.Icon;

  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kategoriFilter, setKategoriFilter] = useState<string>("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<FinancialEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [historyTarget, setHistoryTarget] = useState<FinancialEntry | null>(null);
  const [historyItems, setHistoryItems] = useState<NominalHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/financial-entries?type=${entryType}`, { cache: "no-store" });
      const d: ApiResp<FinancialEntry[]> = await res.json();
      if (!d.success) throw new Error(d.message || "Gagal memuat data");
      setEntries(d.data || []);
    } catch (e) {
      setError(errMsg(e, "Gagal memuat data"));
    } finally {
      setLoading(false);
    }
  }, [entryType]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const totalNominal = useMemo(
    () => entries.reduce((sum, e) => sum + toNum(e.nominal), 0),
    [entries]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (q && !(e.nama.toLowerCase().includes(q) || (e.keterangan || "").toLowerCase().includes(q))) {
        return false;
      }
      if (kategoriFilter !== "all") {
        const k = (e.kategori || "").trim();
        if (kategoriFilter === "__none__") return !k;
        return k === kategoriFilter;
      }
      return true;
    });
  }, [entries, query, kategoriFilter]);

  // Kategori "buat sendiri": kumpulkan kategori unik dari entri yang sudah ada,
  // jadi tiap kategori baru yang diketik otomatis muncul di dropdown berikutnya.
  const kategoriOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) {
      if (e.kategori && e.kategori.trim()) set.add(e.kategori.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "id-ID"));
  }, [entries]);

  function openCreateModal() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setModalOpen(true);
  }

  function openEditModal(entry: FinancialEntry) {
    setEditingId(entry.id);
    setForm({
      nama: entry.nama,
      kategori: entry.kategori || "",
      nominal: String(toNum(entry.nominal)),
      tanggal: entry.tanggal || "",
      keterangan: entry.keterangan || "",
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
    if (!form.nama.trim()) {
      setError("Nama wajib diisi");
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
        entry_type: entryType,
        nama: form.nama.trim(),
        kategori: entryType === "piutang" ? (form.kategori.trim() || null) : null,
        nominal: nominalNumber,
        tanggal: form.tanggal || null,
        keterangan: form.keterangan.trim() || null,
      };
      const res = await fetch(
        editingId ? `/api/financial-entries/${editingId}` : "/api/financial-entries",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const d: ApiResp<FinancialEntry> = await res.json();
      if (!d.success) throw new Error(d.message || "Gagal menyimpan data");
      setModalOpen(false);
      await fetchEntries();
    } catch (err) {
      setError(errMsg(err, "Gagal menyimpan data"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/financial-entries/${deleteTarget.id}`, { method: "DELETE" });
      const d: ApiResp<null> = await res.json();
      if (!d.success) throw new Error(d.message || "Gagal menghapus data");
      setDeleteTarget(null);
      await fetchEntries();
    } catch (err) {
      setError(errMsg(err, "Gagal menghapus data"));
    } finally {
      setDeleting(false);
    }
  }

  async function openHistory(entry: FinancialEntry) {
    setHistoryTarget(entry);
    setHistoryItems([]);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/financial-entries/${entry.id}/history`, { cache: "no-store" });
      const d: ApiResp<NominalHistory[]> = await res.json();
      if (d.success) setHistoryItems(d.data || []);
    } catch {
      // abaikan; modal tetap tampil kosong
    } finally {
      setHistoryLoading(false);
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 pt-5 sm:pt-7 pb-28 sm:pb-10 max-w-6xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between gap-4 mb-5">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-black text-[#1a1a2e] tracking-tight">{cfg.title}</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">{cfg.subtitle}</p>
        </div>
        <button
          onClick={openCreateModal}
          className="hidden sm:inline-flex items-center gap-2 rounded-full bg-[#1a1a2e] text-white text-sm font-semibold pl-4 pr-5 py-2.5 hover:bg-[#2d2d4a] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1a1a2e]/20 transition-all shadow-lg shadow-[#1a1a2e]/25 flex-shrink-0"
        >
          <PlusIcon className="text-amber-300" />
          {cfg.addLabel}
        </button>
      </header>

      {/* Ringkasan */}
      <section className="relative overflow-hidden rounded-3xl bg-[#1a1a2e] text-white shadow-xl shadow-[#1a1a2e]/20 mb-5 p-5 sm:p-7">
        <div className="absolute -right-16 -top-20 w-64 h-64 rounded-full bg-amber-400/10 blur-3xl" aria-hidden="true" />
        <div className="relative flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.tile}`}>
            <Icon size={22} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white/50">{cfg.totalLabel}</p>
            {loading ? (
              <div className="h-9 w-56 rounded-lg bg-white/10 animate-pulse mt-1.5" />
            ) : (
              <p className="text-2xl sm:text-3xl font-black tabular-nums tracking-tight mt-1 break-all">
                {formatIDR(totalNominal)}
              </p>
            )}
          </div>
          <div className="ml-auto text-right flex-shrink-0">
            <p className="text-[11px] text-white/40">Jumlah entri</p>
            <p className="text-lg font-bold tabular-nums">
              {loading ? "—" : entries.length}
              <span className="text-xs font-medium text-white/40 ml-1">data</span>
            </p>
          </div>
        </div>
      </section>

      {/* Error halaman */}
      {error && !modalOpen && (
        <div role="alert" className="mb-4 rounded-xl bg-red-50 text-red-600 text-sm px-4 py-3 border border-red-100">
          {error}
        </div>
      )}

      {/* Toolbar search */}
      {entries.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-4 mb-4">
          <div className="relative flex-1">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari nama atau keterangan..."
              className="w-full rounded-xl border border-gray-200 bg-white pl-10 pr-9 py-2.5 text-sm outline-none focus:ring-4 focus:ring-[#1a1a2e]/5 focus:border-[#1a1a2e]/30 transition"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="Hapus pencarian"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
              >
                <CloseIcon size={14} />
              </button>
            )}
          </div>
          {kategoriOptions.length > 0 && (
            <select
              value={kategoriFilter}
              onChange={(e) => setKategoriFilter(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:ring-4 focus:ring-[#1a1a2e]/5 focus:border-[#1a1a2e]/30 transition sm:w-52"
            >
              <option value="all">Semua kategori</option>
              {kategoriOptions.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
              <option value="__none__">Tanpa kategori</option>
            </select>
          )}
          <p className="text-xs text-gray-500 sm:flex-shrink-0">
            Menampilkan <span className="font-semibold text-gray-800 tabular-nums">{filtered.length}</span> dari{" "}
            <span className="tabular-nums">{entries.length}</span> entri
          </p>
        </div>
      )}

      {/* Daftar */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="rounded-2xl bg-white border border-gray-100 p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-xl bg-gray-100 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-3/4 bg-gray-100 rounded animate-pulse" />
                  <div className="h-2.5 w-1/3 bg-gray-100 rounded animate-pulse" />
                </div>
              </div>
              <div className="border-t border-dashed border-gray-200 pt-3">
                <div className="h-4 w-1/2 bg-gray-100 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-16 flex flex-col items-center justify-center text-center px-6">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${cfg.tile}`}>
            <Icon size={22} />
          </div>
          <p className="text-sm font-semibold text-gray-700">
            {entries.length === 0 ? "Belum ada data" : "Tidak ditemukan"}
          </p>
          <p className="text-xs text-gray-500 mt-1 max-w-xs">
            {entries.length === 0
              ? `Klik "${cfg.addLabel}" untuk mulai mencatat.`
              : `Tidak ada entri yang cocok dengan "${query}"`}
          </p>
          {entries.length === 0 ? (
            <button
              onClick={openCreateModal}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-[#1a1a2e] bg-amber-100 hover:bg-amber-200 transition"
            >
              <PlusIcon />
              {cfg.addLabel}
            </button>
          ) : (
            <button
              onClick={() => {
                setQuery("");
                setKategoriFilter("all");
              }}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition"
            >
              Tampilkan semua
            </button>
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          {filtered.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              tile={cfg.tile}
              Icon={Icon}
              onEdit={() => openEditModal(entry)}
              onDelete={() => setDeleteTarget(entry)}
              onHistory={() => openHistory(entry)}
            />
          ))}
        </ul>
      )}

      {/* FAB mobile */}
      {!modalOpen && (
        <button
          onClick={openCreateModal}
          aria-label={cfg.addLabel}
          className="sm:hidden fixed right-4 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-40 inline-flex items-center gap-2 pl-4 pr-5 h-12 rounded-full bg-[#1a1a2e] text-white text-sm font-bold shadow-xl shadow-[#1a1a2e]/30 active:scale-95 transition"
        >
          <PlusIcon className="text-amber-300" />
          {cfg.addLabel}
        </button>
      )}

      {/* Add/Edit modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
          onClick={closeModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="fe-modal-title"
            className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-md max-h-[92dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#1a1a2e] px-5 sm:px-6 pt-4 pb-5 rounded-t-3xl">
              <div className="sm:hidden mx-auto w-10 h-1.5 rounded-full bg-white/20 mb-4" />
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.tile}`}>
                    <Icon size={22} />
                  </div>
                  <h2 id="fe-modal-title" className="text-base font-bold text-white">
                    {editingId ? `Edit ${cfg.title.replace("Data ", "")}` : cfg.addLabel}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  aria-label="Tutup"
                  className="p-2 -m-1 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition disabled:opacity-50"
                >
                  <CloseIcon />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-5 sm:p-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-6 space-y-4">
              <div>
                <label htmlFor="fe-nama" className="block text-xs font-semibold text-gray-600 mb-1.5">{cfg.namaLabel}</label>
                <input
                  id="fe-nama"
                  type="text"
                  value={form.nama}
                  onChange={(e) => setForm((f) => ({ ...f, nama: e.target.value }))}
                  placeholder={cfg.namaPlaceholder}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50/60 px-3.5 py-2.5 text-sm outline-none focus:bg-white focus:ring-4 focus:ring-[#1a1a2e]/5 focus:border-[#1a1a2e]/30 transition"
                  required
                  autoFocus
                />
              </div>

              {entryType === "piutang" && (
                <div>
                  <label htmlFor="fe-kategori" className="block text-xs font-semibold text-gray-600 mb-1.5">
                    Kategori <span className="font-normal text-gray-400">(opsional)</span>
                  </label>
                  <input
                    id="fe-kategori"
                    type="text"
                    list="fe-kategori-list"
                    value={form.kategori}
                    onChange={(e) => setForm((f) => ({ ...f, kategori: e.target.value }))}
                    placeholder="Pilih atau ketik kategori baru..."
                    className="w-full rounded-xl border border-gray-200 bg-gray-50/60 px-3.5 py-2.5 text-sm outline-none focus:bg-white focus:ring-4 focus:ring-[#1a1a2e]/5 focus:border-[#1a1a2e]/30 transition"
                  />
                  <datalist id="fe-kategori-list">
                    {kategoriOptions.map((k) => (
                      <option key={k} value={k} />
                    ))}
                  </datalist>
                </div>
              )}

              <div>
                <label htmlFor="fe-nominal" className="block text-xs font-semibold text-gray-600 mb-1.5">Nominal</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400">Rp</span>
                  <input
                    id="fe-nominal"
                    type="text"
                    inputMode="numeric"
                    value={formatThousand(form.nominal)}
                    onChange={(e) => setForm((f) => ({ ...f, nominal: e.target.value.replace(/\D/g, "") }))}
                    placeholder="0"
                    className="w-full rounded-xl border border-gray-200 bg-gray-50/60 pl-10 pr-3.5 py-3 text-base font-bold text-[#1a1a2e] tabular-nums outline-none focus:bg-white focus:ring-4 focus:ring-[#1a1a2e]/5 focus:border-[#1a1a2e]/30 transition"
                    required
                  />
                </div>
                {editingId && (
                  <p className="text-[11px] text-gray-400 mt-1.5">
                    Kalau nominal diubah, perubahannya otomatis tercatat di Riwayat Nominal.
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="fe-tanggal" className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Tanggal <span className="font-normal text-gray-400">(opsional)</span>
                </label>
                <input
                  id="fe-tanggal"
                  type="date"
                  value={form.tanggal}
                  onChange={(e) => setForm((f) => ({ ...f, tanggal: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50/60 px-3.5 py-2.5 text-sm outline-none focus:bg-white focus:ring-4 focus:ring-[#1a1a2e]/5 focus:border-[#1a1a2e]/30 transition"
                />
              </div>

              <div>
                <label htmlFor="fe-ket" className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Keterangan <span className="font-normal text-gray-400">(opsional)</span>
                </label>
                <textarea
                  id="fe-ket"
                  value={form.keterangan}
                  onChange={(e) => setForm((f) => ({ ...f, keterangan: e.target.value }))}
                  placeholder="Catatan tambahan..."
                  rows={3}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50/60 px-3.5 py-2.5 text-sm outline-none focus:bg-white focus:ring-4 focus:ring-[#1a1a2e]/5 focus:border-[#1a1a2e]/30 transition resize-none"
                />
              </div>

              {error && (
                <div role="alert" className="rounded-xl bg-red-50 text-red-600 text-sm px-3.5 py-2.5 border border-red-100">
                  {error}
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="flex-1 px-4 py-3 sm:py-2.5 rounded-xl text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 sm:py-2.5 rounded-xl text-sm font-semibold text-white bg-[#1a1a2e] hover:bg-[#2d2d4a] transition disabled:opacity-50"
                >
                  {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  {saving ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-sm p-5 sm:p-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sm:hidden mx-auto w-10 h-1.5 rounded-full bg-gray-200 mb-5" />
            <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center mb-4">
              <TrashIcon className="text-red-500" size={18} />
            </div>
            <h2 className="text-base font-bold text-gray-800 mb-1.5">Hapus Data?</h2>
            <p className="text-sm text-gray-500 leading-relaxed">
              <span className="font-semibold text-gray-700">{deleteTarget.nama}</span> akan dihapus permanen
              beserta riwayat nominalnya.
            </p>
            <div className="mt-3 mb-5 flex items-center justify-between rounded-xl bg-gray-50 px-3.5 py-2.5">
              <span className="text-xs text-gray-500">Nominal</span>
              <span className="text-sm font-bold text-red-600 tabular-nums">{formatIDR(toNum(deleteTarget.nominal))}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 px-4 py-3 sm:py-2.5 rounded-xl text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition disabled:opacity-50"
              >
                Batal
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 sm:py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition disabled:opacity-50"
              >
                {deleting && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {deleting ? "Menghapus..." : "Hapus"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Riwayat Nominal modal */}
      {historyTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => setHistoryTarget(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-md max-h-[85dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#1a1a2e] px-5 sm:px-6 pt-4 pb-5 rounded-t-3xl flex-shrink-0">
              <div className="sm:hidden mx-auto w-10 h-1.5 rounded-full bg-white/20 mb-4" />
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-white/10 text-amber-300 flex items-center justify-center flex-shrink-0">
                    <HistoryIcon size={20} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-white">Riwayat Nominal</h2>
                    <p className="text-xs text-white/50 truncate">{historyTarget.nama}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setHistoryTarget(null)}
                  aria-label="Tutup"
                  className="p-2 -m-1 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition"
                >
                  <CloseIcon />
                </button>
              </div>
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto">
              {/* Nominal saat ini */}
              <div className="mb-4 flex items-center justify-between rounded-xl bg-gray-50 px-3.5 py-2.5">
                <span className="text-xs font-semibold text-gray-500">Nominal saat ini</span>
                <span className="text-sm font-bold text-[#1a1a2e] tabular-nums">{formatIDR(toNum(historyTarget.nominal))}</span>
              </div>

              {historyLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />
                  ))}
                </div>
              ) : historyItems.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm font-semibold text-gray-600">Belum ada perubahan nominal</p>
                  <p className="text-xs text-gray-400 mt-1">Perubahan nominal pertama akan muncul di sini.</p>
                </div>
              ) : (
                <ol className="relative space-y-4 before:absolute before:left-[7px] before:top-1 before:bottom-1 before:w-px before:bg-gray-200">
                  {historyItems.map((log) => (
                    <li key={log.id} className="relative pl-6">
                      <span className="absolute left-0 top-1 w-3.5 h-3.5 rounded-full bg-amber-400 ring-4 ring-amber-50" />
                      <p className="text-xs text-gray-400 tabular-nums">{formatDateTime(log.created_at)}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-sm text-gray-400 line-through tabular-nums">{formatIDR(toNum(log.nominal_lama))}</span>
                        <ArrowIcon />
                        <span className="text-sm font-bold text-[#1a1a2e] tabular-nums">{formatIDR(toNum(log.nominal_baru))}</span>
                      </div>
                      {log.changed_by_name && (
                        <p className="text-[11px] text-gray-500 mt-0.5">oleh {log.changed_by_name}</p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Kartu entrii
// ═════════════════════════════════════════════════════════════════════════════
function EntryCard({
  entry,
  tile,
  Icon,
  onEdit,
  onDelete,
  onHistory,
}: {
  entry: FinancialEntry;
  tile: string;
  Icon: (p: { size?: number; className?: string }) => ReactNode;
  onEdit: () => void;
  onDelete: () => void;
  onHistory: () => void;
}) {
  const edited = entry.updated_at && entry.updated_at !== entry.created_at;

  return (
    <li className="group relative flex flex-col rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition">
      <div className="flex items-start gap-3 p-4 pb-3">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${tile}`}>
          <Icon size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900 leading-snug break-words line-clamp-2">{entry.nama}</p>
          {entry.kategori && (
            <span className="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
              {entry.kategori}
            </span>
          )}
          {entry.tanggal && (
            <p className="text-[11px] text-gray-500 mt-0.5 tabular-nums">{formatDate(entry.tanggal)}</p>
          )}
        </div>
        <div className="flex items-center -mr-1.5 -mt-1 flex-shrink-0">
          <button
            onClick={onEdit}
            className="p-2 rounded-lg text-gray-400 hover:text-[#1a1a2e] hover:bg-gray-100 transition"
            aria-label={`Edit ${entry.nama}`}
          >
            <EditIcon />
          </button>
          <button
            onClick={onDelete}
            className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
            aria-label={`Hapus ${entry.nama}`}
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      {entry.keterangan && (
        <p className="px-4 -mt-1 mb-3 text-xs text-gray-500 leading-relaxed line-clamp-2 break-words">
          {entry.keterangan}
        </p>
      )}

      <div className="mt-auto mx-4 border-t border-dashed border-gray-200" aria-hidden="true" />

      <div className="px-4 pt-3 pb-4">
        <p className="text-lg font-black text-[#1a1a2e] tabular-nums tracking-tight">{formatIDR(toNum(entry.nominal))}</p>

        <div className="flex items-center justify-between gap-2 mt-3 text-[11px] text-gray-400">
          <span className="truncate">
            {edited
              ? `Diubah ${entry.updated_by_name || ""}`.trim()
              : entry.created_by_name
                ? `Dicatat ${entry.created_by_name}`
                : "Dicatat"}
          </span>
          <span className="flex-shrink-0 tabular-nums">{formatDate(edited ? entry.updated_at : entry.created_at)}</span>
        </div>

        <div className="mt-3 pt-3 border-t border-dashed border-gray-200 flex items-center">
          <button
            onClick={onHistory}
            className="inline-flex items-center gap-1.5 rounded-lg text-gray-500 text-xs font-semibold px-2.5 py-1.5 hover:bg-gray-100 transition ml-auto"
          >
            <HistoryIcon size={13} />
            Riwayat Nominal
          </button>
        </div>
      </div>
    </li>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function UtangIcon({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M17 12h.01M7 12h.01" />
    </svg>
  );
}

function PiutangIcon({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 10l5-5" />
      <path d="M4 5h5v5" />
      <path d="M11 20a7 7 0 1 0 0-14" />
      <path d="M11 13h.01M11 17h.01" />
    </svg>
  );
}

function ModalIcon({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
      <path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className={className} aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

function TrashIcon({ className, size = 15 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  );
}

function CloseIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function HistoryIcon({ className, size = 15 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M3 3v5h5" />
      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}