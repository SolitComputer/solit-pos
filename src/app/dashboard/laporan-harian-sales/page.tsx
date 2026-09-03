"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Phone,
  Laptop2,
  CheckCircle2,
  XCircle,
  Send,
  RefreshCw,
  Trash2,
  Plus,
  X,
  Pencil,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Inbox,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";

interface SalesReportEntry {
  id: string;
  phone_number: string;
  interest: string;
  purchased: boolean;
  filled_by: string;
  filled_by_name: string;
  created_at: string;
}

type Period = "today" | "week" | "month";

const periodLabels: Record<Period, string> = {
  today: "Hari ini",
  week: "Minggu ini",
  month: "Bulan ini",
};

// Jumlah baris yang ditampilkan per halaman tabel.
const ROWS_PER_PAGE = 10;

// Palet lembut untuk avatar inisial "By" — dipilih deterministik dari nama,
// supaya orang yang sama selalu dapat warna yang sama.
const AVATAR_PALETTE = [
  "bg-blue-50 text-blue-600",
  "bg-emerald-50 text-emerald-600",
  "bg-amber-50 text-amber-600",
  "bg-violet-50 text-violet-600",
  "bg-rose-50 text-rose-600",
  "bg-cyan-50 text-cyan-600",
];

function avatarStyle(name: string) {
  const sum = name.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_PALETTE[sum % AVATAR_PALETTE.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export default function LaporanHarianSalesPage() {
  // --- Form Tambah/Edit ---
  const [phoneNumber, setPhoneNumber] = useState("");
  const [interest, setInterest] = useState("");
  const [purchased, setPurchased] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [showModal, setShowModal] = useState(false);
  // null = mode "Tambah", terisi = mode "Edit" untuk entry ini
  const [editingEntry, setEditingEntry] = useState<SalesReportEntry | null>(null);

  // --- Data & filter ---
  const [entries, setEntries] = useState<SalesReportEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("today");
  const [listError, setListError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // --- Pagination ---
  const [currentPage, setCurrentPage] = useState(1);

  // --- Konfirmasi hapus ---
  const [deleteTarget, setDeleteTarget] = useState<SalesReportEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchEntries = useCallback(async (p: Period) => {
    try {
      setLoading(true);
      setListError("");
      const res = await fetch(`/api/sales-reports?period=${p}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Gagal mengambil data");
      setEntries(json.data || []);
      setLastUpdated(new Date());
    } catch (err: any) {
      setListError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries(period);
  }, [period, fetchEntries]);

  // Balik ke halaman 1 setiap ganti periode.
  useEffect(() => {
    setCurrentPage(1);
  }, [period]);

  // Statistik ringkas dari data yang sedang tampil (sesuai periode aktif).
  const stats = useMemo(() => {
    const total = entries.length;
    const beli = entries.filter((e) => e.purchased).length;
    const convRate = total > 0 ? Math.round((beli / total) * 100) : 0;
    return { total, beli, tidak: total - beli, convRate };
  }, [entries]);

  // Potongan data untuk halaman aktif.
  const totalPages = Math.max(1, Math.ceil(entries.length / ROWS_PER_PAGE));
  const paginatedEntries = useMemo(() => {
    const start = (currentPage - 1) * ROWS_PER_PAGE;
    return entries.slice(start, start + ROWS_PER_PAGE);
  }, [entries, currentPage]);

  const pageStart = entries.length === 0 ? 0 : (currentPage - 1) * ROWS_PER_PAGE + 1;
  const pageEnd = Math.min(currentPage * ROWS_PER_PAGE, entries.length);

  // Jaga-jaga kalau halaman aktif jadi tidak valid lagi (mis. setelah hapus data).
  useEffect(() => {
    setCurrentPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const resetForm = () => {
    setPhoneNumber("");
    setInterest("");
    setPurchased(false);
    setFormError("");
  };

  const openAddModal = () => {
    setEditingEntry(null);
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (entry: SalesReportEntry) => {
    setEditingEntry(entry);
    setFormError("");
    setPhoneNumber(entry.phone_number);
    setInterest(entry.interest);
    setPurchased(entry.purchased);
    setShowModal(true);
  };

  const closeFormModal = () => {
    setShowModal(false);
    setEditingEntry(null);
    resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!phoneNumber.trim() || !interest.trim()) {
      setFormError("Nomor telepon dan minat wajib diisi");
      return;
    }

    const isEditing = Boolean(editingEntry);

    try {
      setSubmitting(true);
      const res = await fetch(
        isEditing ? `/api/sales-reports?id=${editingEntry!.id}` : "/api/sales-reports",
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone_number: phoneNumber.trim(),
            interest: interest.trim(),
            purchased,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || (isEditing ? "Gagal memperbarui laporan" : "Gagal menyimpan laporan"));
      }

      closeFormModal();
      fetchEntries(period);
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      const res = await fetch(`/api/sales-reports?id=${deleteTarget.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Gagal menghapus");
      setEntries((prev) => prev.filter((e) => e.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err: any) {
      setListError(err.message);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-4 p-3 sm:p-6 pb-16">
        {/* Header halaman — judul + meta + aksi utama, senada dengan halaman Dashboard */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
              Laporan Harian Sales
            </h1>
            <p className="text-gray-400 text-xs sm:text-sm mt-1 max-w-md">
              Catat setiap chat masuk: nomor telepon, minat, dan status pembelian. Setiap laporan bernilai 1 poin di leaderboard.
            </p>
            {lastUpdated && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-400 bg-white border border-gray-100 px-2 py-0.5 rounded-full mt-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Diperbarui {lastUpdated.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => fetchEntries(period)}
              className="flex items-center justify-center gap-1.5 h-10 px-3 sm:px-4 rounded-full text-xs sm:text-sm font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={openAddModal}
              className="flex items-center justify-center gap-1.5 h-10 px-3 sm:px-4 rounded-full text-xs sm:text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 active:scale-[0.98] transition-all shadow-sm shadow-violet-200"
            >
              <Plus className="w-4 h-4" />
              Tambah Laporan
            </button>
          </div>
        </div>

        {/* Panel ringkasan — dasar putih bersih + blob warna pekat, senada dengan panel "Distribusi Penjualan" di Dashboard */}
        <div className="relative overflow-hidden rounded-3xl bg-white border border-gray-100 shadow-sm px-5 py-5 sm:px-7 sm:py-6">
          <div className="pointer-events-none absolute -right-14 -top-24 h-72 w-72 rounded-full bg-violet-300/60 blur-2xl" />
          <div className="pointer-events-none absolute right-24 -bottom-16 h-56 w-56 rounded-full bg-blue-300/50 blur-2xl" />
          <div className="pointer-events-none absolute right-52 top-2 h-28 w-28 rounded-full bg-fuchsia-300/40 blur-2xl hidden sm:block" />

          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-gray-900">Ringkasan {periodLabels[period].toLowerCase()}</h2>
              <p className="text-gray-500 text-xs mt-0.5">Jumlah laporan dan status pembelian yang tercatat</p>
            </div>
            <div className="flex bg-gray-50 rounded-full border border-gray-100 p-0.5">
              {(["today", "week", "month"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 text-[11px] font-medium rounded-full transition-colors ${
                    period === p ? "bg-violet-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  {periodLabels[p]}
                </button>
              ))}
            </div>
          </div>

          <div className="relative grid grid-cols-3 gap-3 mt-5">
            <StatCard label="Total Laporan" value={stats.total} caption={periodLabels[period]} />
            <StatCard
              label="Beli"
              value={stats.beli}
              caption="dari total laporan"
              delta={entries.length > 0 ? `${stats.convRate}%` : undefined}
              deltaClass="bg-emerald-50 text-emerald-600"
            />
            <StatCard
              label="Tidak Beli"
              value={stats.tidak}
              caption="dari total laporan"
              delta={entries.length > 0 ? `${100 - stats.convRate}%` : undefined}
              deltaClass="bg-gray-100 text-gray-500"
            />
          </div>
        </div>

        {/* Modal Form Tambah/Edit */}
        {showModal && (
          <div
            onClick={closeFormModal}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl border border-gray-200/70 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">
                  {editingEntry ? "Edit Laporan" : "Tambah Laporan"}
                </h2>
                <button
                  onClick={closeFormModal}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-5 space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Nomor Telepon</label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="08xxxxxxxxxx"
                      className="w-full pl-8 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-violet-400 focus:bg-white transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Minat (Laptop)</label>
                  <div className="relative">
                    <Laptop2 className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      value={interest}
                      onChange={(e) => setInterest(e.target.value)}
                      placeholder="Contoh: Thinkpad T480, RAM 8GB"
                      className="w-full pl-8 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-violet-400 focus:bg-white transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1.5 block">Status</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPurchased(true)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        purchased ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Beli
                    </button>
                    <button
                      type="button"
                      onClick={() => setPurchased(false)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        !purchased ? "bg-gray-800 border-gray-800 text-white" : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                      }`}
                    >
                      <XCircle className="w-3.5 h-3.5" /> Tidak
                    </button>
                  </div>
                </div>

                {formError && <p className="text-xs text-red-600">{formError}</p>}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 transition-colors disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  {submitting ? "Menyimpan..." : editingEntry ? "Simpan Perubahan" : "Simpan Laporan"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Modal Konfirmasi Hapus */}
        {deleteTarget && (
          <div
            onClick={() => !deleting && setDeleteTarget(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl border border-gray-200/70 w-full max-w-sm shadow-xl p-5"
            >
              <div className="w-11 h-11 rounded-full bg-red-50 flex items-center justify-center mb-3">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <h2 className="text-sm font-semibold text-gray-900">Hapus laporan ini?</h2>
              <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                Laporan untuk{" "}
                <span className="font-medium text-gray-700">{deleteTarget.phone_number}</span> ({deleteTarget.interest}) akan
                dihapus permanen dan tidak bisa dikembalikan.
              </p>

              <div className="flex gap-2 mt-5">
                <button
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                  className="flex-1 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  {deleting ? "Menghapus..." : "Hapus"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* List */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900">Riwayat Laporan</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">Daftar laporan pada periode {periodLabels[period].toLowerCase()}</p>
          </div>

          {listError && <p className="text-xs text-red-600 px-4 py-3">{listError}</p>}

          {loading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div className="py-12 flex flex-col items-center text-center px-6">
              <div className="w-11 h-11 rounded-full bg-violet-50 flex items-center justify-center mb-3">
                <Inbox className="w-5 h-5 text-violet-300" />
              </div>
              <p className="text-sm font-medium text-gray-700">Belum ada laporan untuk periode ini</p>
              <p className="text-xs text-gray-400 mt-1 max-w-[220px]">
                Laporan chat masuk yang kamu catat akan muncul di sini.
              </p>
              <button
                onClick={openAddModal}
                className="mt-4 text-xs font-semibold text-violet-600 hover:underline"
              >
                Tambah laporan pertama →
              </button>
            </div>
          ) : (
            <>
              {/* Tabel — laptop/desktop */}
              <div className="overflow-x-auto hidden sm:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50/80 border-b border-gray-100">
                      <th className="px-4 sm:px-5 py-2.5 text-left text-[11px] font-medium text-gray-500">No. telepon</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-500">Minat</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-500">By</th>
                      <th className="px-4 py-2.5 text-center text-[11px] font-medium text-gray-500">Status</th>
                      <th className="px-4 sm:px-5 py-2.5 w-20 text-right text-[11px] font-medium text-gray-500">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {paginatedEntries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-4 sm:px-5 py-3 font-medium text-gray-900 whitespace-nowrap tabular-nums">
                          {entry.phone_number}
                          <div className="text-[10px] font-normal text-gray-400 mt-0.5">
                            {new Date(entry.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 max-w-[160px] truncate">{entry.interest}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 ${avatarStyle(
                                entry.filled_by_name
                              )}`}
                            >
                              {initials(entry.filled_by_name)}
                            </span>
                            <span className="text-gray-600">{entry.filled_by_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge purchased={entry.purchased} />
                        </td>
                        <td className="px-4 sm:px-5 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEditModal(entry)}
                              className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                              title="Edit"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(entry)}
                              className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                              title="Hapus"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Kartu — mobile */}
              <div className="sm:hidden divide-y divide-gray-50">
                {paginatedEntries.map((entry) => (
                  <div key={entry.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 ${avatarStyle(
                            entry.filled_by_name
                          )}`}
                        >
                          {initials(entry.filled_by_name)}
                        </span>
                        <div>
                          <p className="text-sm font-medium text-gray-900 tabular-nums">{entry.phone_number}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            {entry.filled_by_name} ·{" "}
                            {new Date(entry.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>
                      <StatusBadge purchased={entry.purchased} />
                    </div>
                    <p className="text-xs text-gray-600 pl-9">{entry.interest}</p>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => openEditModal(entry)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                      <button
                        onClick={() => setDeleteTarget(entry)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border border-red-100 text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" /> Hapus
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-4 sm:px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-2">
                  <p className="text-[11px] text-gray-400">
                    Menampilkan <span className="font-medium text-gray-600">{pageStart}–{pageEnd}</span> dari{" "}
                    <span className="font-medium text-gray-600">{entries.length}</span> laporan
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[11px] text-gray-500 min-w-[3ch] text-center tabular-nums">
                      {currentPage}/{totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

function StatCard({
  label,
  value,
  caption,
  delta,
  deltaClass,
}: {
  label: string;
  value: number;
  caption: string;
  delta?: string;
  deltaClass?: string;
}) {
  return (
    <div className="relative bg-white rounded-2xl border border-gray-100 shadow-sm px-3 py-3 sm:px-4 sm:py-3.5">
      <p className="text-[10px] font-semibold tracking-wide text-gray-500 uppercase">{label}</p>
      <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1 tabular-nums">{value}</p>
      <div className="flex items-center justify-between mt-1.5 gap-1">
        <span className="text-[11px] text-gray-400 truncate">{caption}</span>
        {delta && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${deltaClass}`}>{delta}</span>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ purchased }: { purchased: boolean }) {
  if (purchased) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-600">
        <CheckCircle2 className="w-3 h-3" /> Beli
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-500">
      <XCircle className="w-3 h-3" /> Tidak
    </span>
  );
}