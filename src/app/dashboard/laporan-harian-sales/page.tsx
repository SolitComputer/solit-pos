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
  ShieldCheck,
  ClipboardCheck,
  Building2,
  MessageSquareText,
} from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { getCurrentUserClient } from "@/lib/auth-client";

type Channel = "WA" | "FB" | "OLX" | "CAROUSEL" | "MITRA" | "RESELLER";

const CHANNELS: Channel[] = ["WA", "FB", "OLX", "CAROUSEL", "MITRA", "RESELLER"];

const channelLabels: Record<Channel, string> = {
  WA: "WhatsApp",
  FB: "Facebook",
  OLX: "OLX",
  CAROUSEL: "Carousell",
  MITRA: "Mitra",
  RESELLER: "Reseller",
};

const channelBadgeClass: Record<Channel, string> = {
  WA: "bg-emerald-50 text-emerald-600",
  FB: "bg-blue-50 text-blue-600",
  OLX: "bg-orange-50 text-orange-600",
  CAROUSEL: "bg-cyan-50 text-cyan-600",
  MITRA: "bg-violet-50 text-violet-600",
  RESELLER: "bg-amber-50 text-amber-600",
};

// Mitra & Reseller cukup dicatat nama mitranya saja, tanpa nomor telepon.
const NO_PHONE_CHANNELS: Channel[] = ["MITRA", "RESELLER"];

// Role yang boleh audit — HARUS disamakan dengan SALES_REPORT_AUDIT_ROLES di
// src/lib/permissions.ts (server-side, sumber kebenaran sesungguhnya). Ini
// cuma dipakai untuk sembunyikan/tampilkan tombol di UI.
const AUDIT_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO", "KEPALA_MARKETING", "MARKETING", "PKL_MARKETING"];

interface SalesReportEntry {
  id: string;
  channel: Channel;
  phone_number: string | null;
  partner_name: string | null;
  interest: string;
  keterangan: string | null;
  purchased: boolean;
  filled_by: string;
  filled_by_name: string;
  audited: boolean;
  audited_by: string | null;
  audited_by_name: string | null;
  audited_at: string | null;
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

function canAuditRole(user: any): boolean {
  const roles: string[] = Array.isArray(user?.roles) && user.roles.length > 0 ? user.roles : (user?.role ? [user.role] : []);
  return roles.some((r) => AUDIT_ROLES.includes(r));
}

export default function LaporanHarianSalesPage() {
   // --- User & permission ---
  const [currentUser, setCurrentUser] = useState<any>(null);
  useEffect(() => {
    getCurrentUserClient().then((u) => setCurrentUser(u));
  }, []);
  const canAudit = canAuditRole(currentUser);

  // Baca ?channel=WA|FB|OLX|CAROUSEL|MITRA|RESELLER dari URL (dikirim oleh
  // link sidebar "Laporan Sales") supaya tab channel langsung ke-preselect
  // begitu halaman dibuka. Pakai window.location.search langsung (bukan
  // useSearchParams) supaya tidak perlu Suspense boundary — pola yang sama
  // dipakai di ProfileView.tsx untuk baca query "solitcoins".
  useEffect(() => {
    try {
      const c = new URLSearchParams(window.location.search).get("channel");
      if (c && (CHANNELS as string[]).includes(c)) {
        setChannelFilter(c as Channel);
      }
    } catch { /* ignore */ }
  }, []);

  // --- Form Tambah/Edit ---
  const [channel, setChannel] = useState<Channel>("WA");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [interest, setInterest] = useState("");
  const [keterangan, setKeterangan] = useState("");
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
  const [channelFilter, setChannelFilter] = useState<Channel | "ALL">("ALL");
  const [listError, setListError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // --- Pagination ---
  const [currentPage, setCurrentPage] = useState(1);

  // --- Konfirmasi hapus ---
  const [deleteTarget, setDeleteTarget] = useState<SalesReportEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  // --- Audit (verifikasi 2 langkah) ---
  const [auditTarget, setAuditTarget] = useState<SalesReportEntry | null>(null);
  const [auditStep, setAuditStep] = useState<1 | 2>(1);
  const [auditing, setAuditing] = useState(false);
  const [auditError, setAuditError] = useState("");

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

  // Balik ke halaman 1 setiap ganti periode atau tab channel.
  useEffect(() => {
    setCurrentPage(1);
  }, [period, channelFilter]);

  // Statistik ringkas dari data yang sedang tampil (sesuai periode aktif, semua channel).
  const stats = useMemo(() => {
    const total = entries.length;
    const beli = entries.filter((e) => e.purchased).length;
    const convRate = total > 0 ? Math.round((beli / total) * 100) : 0;
    return { total, beli, tidak: total - beli, convRate };
  }, [entries]);

  const filteredEntries = useMemo(() => {
    if (channelFilter === "ALL") return entries;
    return entries.filter((e) => e.channel === channelFilter);
  }, [entries, channelFilter]);

  // Potongan data untuk halaman aktif.
  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / ROWS_PER_PAGE));
  const paginatedEntries = useMemo(() => {
    const start = (currentPage - 1) * ROWS_PER_PAGE;
    return filteredEntries.slice(start, start + ROWS_PER_PAGE);
  }, [filteredEntries, currentPage]);

  const pageStart = filteredEntries.length === 0 ? 0 : (currentPage - 1) * ROWS_PER_PAGE + 1;
  const pageEnd = Math.min(currentPage * ROWS_PER_PAGE, filteredEntries.length);

  useEffect(() => {
    setCurrentPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const resetForm = () => {
    setChannel("WA");
    setPhoneNumber("");
    setPartnerName("");
    setInterest("");
    setKeterangan("");
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
    setChannel(entry.channel);
    setPhoneNumber(entry.phone_number ?? "");
    setPartnerName(entry.partner_name ?? "");
    setInterest(entry.interest);
    setKeterangan(entry.keterangan ?? "");
    setPurchased(entry.purchased);
    setShowModal(true);
  };

  const closeFormModal = () => {
    setShowModal(false);
    setEditingEntry(null);
    resetForm();
  };

  const isNoPhoneChannel = NO_PHONE_CHANNELS.includes(channel);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!interest.trim()) {
      setFormError("Minat wajib diisi");
      return;
    }
    if (isNoPhoneChannel && !partnerName.trim()) {
      setFormError("Nama mitra/reseller wajib diisi");
      return;
    }
    if (!isNoPhoneChannel && !phoneNumber.trim()) {
      setFormError("Nomor telepon wajib diisi");
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
            channel,
            phone_number: isNoPhoneChannel ? "" : phoneNumber.trim(),
            partner_name: isNoPhoneChannel ? partnerName.trim() : "",
            interest: interest.trim(),
            keterangan: keterangan.trim(),
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

  // --- Audit flow: klik "Audit" -> Langkah 1 (review data) -> Langkah 2 (konfirmasi final) ---
  const openAuditModal = (entry: SalesReportEntry) => {
    setAuditTarget(entry);
    setAuditStep(1);
    setAuditError("");
  };

  const closeAuditModal = () => {
    if (auditing) return;
    setAuditTarget(null);
    setAuditStep(1);
    setAuditError("");
  };

  const confirmAudit = async () => {
    if (!auditTarget) return;
    try {
      setAuditing(true);
      setAuditError("");
      const res = await fetch("/api/sales-reports/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: auditTarget.id }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Gagal mengaudit laporan");
      setEntries((prev) => prev.map((e) => (e.id === auditTarget.id ? json.data : e)));
      setAuditTarget(null);
      setAuditStep(1);
    } catch (err: any) {
      setAuditError(err.message);
    } finally {
      setAuditing(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-4 p-3 sm:p-6 pb-16">
        {/* Header halaman */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
              Laporan Harian Sales
            </h1>
            <p className="text-gray-400 text-xs sm:text-sm mt-1 max-w-md">
              Catat setiap leads masuk dari semua channel: WA, FB, OLX, Carousell, Mitra & Reseller. Setiap laporan bernilai 1 poin di leaderboard, dan setiap audit oleh tim Marketing bernilai 0,5 poin lencana.
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

        {/* Panel ringkasan */}
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
                  <label className="text-xs font-medium text-gray-600 mb-1.5 block">Channel</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {CHANNELS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setChannel(c)}
                        className={`py-2 rounded-lg text-[11px] font-semibold border transition-colors ${
                          channel === c ? "bg-violet-600 border-violet-600 text-white" : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                        }`}
                      >
                        {channelLabels[c]}
                      </button>
                    ))}
                  </div>
                </div>

                {isNoPhoneChannel ? (
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Nama Mitra/Reseller</label>
                    <div className="relative">
                      <Building2 className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        value={partnerName}
                        onChange={(e) => setPartnerName(e.target.value)}
                        placeholder="Contoh: Toko Jaya Komputer"
                        className="w-full pl-8 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-violet-400 focus:bg-white transition-colors"
                      />
                    </div>
                  </div>
                ) : (
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
                )}

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
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Keterangan (opsional)</label>
                  <div className="relative">
                    <MessageSquareText className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
                    <textarea
                      value={keterangan}
                      onChange={(e) => setKeterangan(e.target.value)}
                      placeholder="Catatan tambahan tentang leads ini..."
                      rows={2}
                      className="w-full pl-8 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-violet-400 focus:bg-white transition-colors resize-none"
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
                <span className="font-medium text-gray-700">
                  {deleteTarget.phone_number || deleteTarget.partner_name}
                </span>{" "}
                ({deleteTarget.interest}) akan dihapus permanen dan tidak bisa dikembalikan.
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

        {/* Modal Audit — verifikasi 2 langkah */}
        {auditTarget && (
          <div
            onClick={closeAuditModal}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl border border-gray-200/70 w-full max-w-sm shadow-xl p-5"
            >
              <div className="w-11 h-11 rounded-full bg-fuchsia-50 flex items-center justify-center mb-3">
                <ShieldCheck className="w-5 h-5 text-fuchsia-600" />
              </div>

              {auditStep === 1 ? (
                <>
                  <h2 className="text-sm font-semibold text-gray-900">Langkah 1 — Periksa Data</h2>
                  <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                    Pastikan data leads berikut sudah benar sebelum diaudit:
                  </p>
                  <div className="mt-3 space-y-1.5 text-xs bg-gray-50 border border-gray-100 rounded-xl p-3">
                    <p><span className="text-gray-400">Channel:</span> <span className="font-medium text-gray-700">{channelLabels[auditTarget.channel]}</span></p>
                    <p><span className="text-gray-400">Kontak:</span> <span className="font-medium text-gray-700">{auditTarget.phone_number || auditTarget.partner_name}</span></p>
                    <p><span className="text-gray-400">Minat:</span> <span className="font-medium text-gray-700">{auditTarget.interest}</span></p>
                    {auditTarget.keterangan && (
                      <p><span className="text-gray-400">Keterangan:</span> <span className="font-medium text-gray-700">{auditTarget.keterangan}</span></p>
                    )}
                    <p><span className="text-gray-400">Diinput oleh:</span> <span className="font-medium text-gray-700">{auditTarget.filled_by_name}</span></p>
                  </div>
                  <div className="flex gap-2 mt-5">
                    <button
                      onClick={closeAuditModal}
                      className="flex-1 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      Batal
                    </button>
                    <button
                      onClick={() => setAuditStep(2)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold bg-fuchsia-600 text-white hover:bg-fuchsia-700 transition-colors"
                    >
                      Lanjut Verifikasi
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-sm font-semibold text-gray-900">Langkah 2 — Konfirmasi Audit</h2>
                  <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                    Data sudah benar dan siap diaudit. Setelah dikonfirmasi, laporan ini{" "}
                    <span className="font-medium text-gray-700">tidak bisa diedit/dihapus lagi</span> oleh tim sales, dan kamu akan mendapat{" "}
                    <span className="font-medium text-fuchsia-600">+0,5 poin</span> lencana audit.
                  </p>
                  {auditError && <p className="text-xs text-red-600 mt-2">{auditError}</p>}
                  <div className="flex gap-2 mt-5">
                    <button
                      onClick={() => setAuditStep(1)}
                      disabled={auditing}
                      className="flex-1 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      Kembali
                    </button>
                    <button
                      onClick={confirmAudit}
                      disabled={auditing}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold bg-fuchsia-600 text-white hover:bg-fuchsia-700 transition-colors disabled:opacity-50"
                    >
                      {auditing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ClipboardCheck className="w-3.5 h-3.5" />}
                      {auditing ? "Mengaudit..." : "Ya, Audit Sekarang"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* List */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900">Riwayat Laporan</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">Daftar laporan pada periode {periodLabels[period].toLowerCase()}</p>
          </div>

          {/* Tab channel */}
          <div className="px-4 sm:px-5 py-2.5 border-b border-gray-100 flex gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
            <button
              onClick={() => setChannelFilter("ALL")}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
                channelFilter === "ALL" ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-500 hover:bg-gray-100"
              }`}
            >
              Semua
            </button>
            {CHANNELS.map((c) => (
              <button
                key={c}
                onClick={() => setChannelFilter(c)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
                  channelFilter === c ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                }`}
              >
                {channelLabels[c]}
              </button>
            ))}
          </div>

          {listError && <p className="text-xs text-red-600 px-4 py-3">{listError}</p>}

          {loading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="py-12 flex flex-col items-center text-center px-6">
              <div className="w-11 h-11 rounded-full bg-violet-50 flex items-center justify-center mb-3">
                <Inbox className="w-5 h-5 text-violet-300" />
              </div>
              <p className="text-sm font-medium text-gray-700">Belum ada laporan untuk filter ini</p>
              <p className="text-xs text-gray-400 mt-1 max-w-[220px]">
                Laporan leads yang kamu catat akan muncul di sini.
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
                          {/* Tabel — laptop/desktop. Struktur kolom mengikuti papan tulis:
                  No | Nama/Kontak | Minat | Keterangan | Transaksi | Audit.
                  Kolom Channel disembunyikan saat tab spesifik aktif (WA/FB/dst)
                  karena sudah jelas dari tab yang dipilih — cuma tampil saat
                  tab "Semua". */}
              <div className="overflow-x-auto hidden sm:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50/80 border-b border-gray-100">
                      <th className="px-4 sm:px-5 py-2.5 text-left text-[11px] font-medium text-gray-500 w-10">No</th>
                      {channelFilter === "ALL" && (
                        <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-500">Channel</th>
                      )}
                      <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-500">Nama / Kontak</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-500">Minat</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-500">Keterangan</th>
                      <th className="px-4 py-2.5 text-center text-[11px] font-medium text-gray-500">Transaksi</th>
                      <th className="px-4 py-2.5 text-center text-[11px] font-medium text-gray-500">Audit</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-500">Diinput Oleh</th>
                      <th className="px-4 sm:px-5 py-2.5 w-20 text-right text-[11px] font-medium text-gray-500">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {paginatedEntries.map((entry, idx) => (
                      <tr key={entry.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-4 sm:px-5 py-3 text-gray-400 tabular-nums">{pageStart + idx}</td>
                        {channelFilter === "ALL" && (
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${channelBadgeClass[entry.channel]}`}>
                              {channelLabels[entry.channel]}
                            </span>
                          </td>
                        )}
                        <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap tabular-nums">
                          {entry.phone_number || entry.partner_name}
                          <div className="text-[10px] font-normal text-gray-400 mt-0.5">
                            {new Date(entry.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 max-w-[140px] truncate">{entry.interest}</td>
                        <td className="px-4 py-3 text-gray-500 max-w-[160px] truncate">{entry.keterangan || "—"}</td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge purchased={entry.purchased} />
                        </td>
                        <td className="px-4 py-3 text-center">
                          {entry.audited ? (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-fuchsia-50 text-fuchsia-600"
                              title={`Diaudit oleh ${entry.audited_by_name ?? "-"}`}
                            >
                              <ShieldCheck className="w-3 h-3" /> Terverifikasi
                            </span>
                          ) : canAudit ? (
                            <button
                              onClick={() => openAuditModal(entry)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-fuchsia-600 text-white hover:bg-fuchsia-700 transition-colors"
                            >
                              <ClipboardCheck className="w-3 h-3" /> Audit
                            </button>
                          ) : (
                            <span className="text-[11px] text-gray-300 font-medium">Menunggu</span>
                          )}
                        </td>
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
                        <td className="px-4 sm:px-5 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEditModal(entry)}
                              disabled={entry.audited}
                              className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-300"
                              title={entry.audited ? "Sudah diaudit" : "Edit"}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(entry)}
                              disabled={entry.audited}
                              className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-300"
                              title={entry.audited ? "Sudah diaudit" : "Hapus"}
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
                          <p className="text-sm font-medium text-gray-900 tabular-nums">{entry.phone_number || entry.partner_name}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            {entry.filled_by_name} ·{" "}
                            {new Date(entry.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>
                      <StatusBadge purchased={entry.purchased} />
                    </div>
                    <div className="flex items-center gap-1.5 pl-9">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${channelBadgeClass[entry.channel]}`}>
                        {channelLabels[entry.channel]}
                      </span>
                      {entry.audited && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-fuchsia-50 text-fuchsia-600">
                          <ShieldCheck className="w-2.5 h-2.5" /> Terverifikasi
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 pl-9">{entry.interest}</p>
                    {entry.keterangan && <p className="text-[11px] text-gray-400 pl-9">{entry.keterangan}</p>}
                    <div className="flex items-center gap-2 pt-1">
                      {!entry.audited && canAudit && (
                        <button
                          onClick={() => openAuditModal(entry)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border border-fuchsia-200 text-fuchsia-600 hover:bg-fuchsia-50 transition-colors"
                        >
                          <ClipboardCheck className="w-3 h-3" /> Audit
                        </button>
                      )}
                      <button
                        onClick={() => openEditModal(entry)}
                        disabled={entry.audited}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
                      >
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                      <button
                        onClick={() => setDeleteTarget(entry)}
                        disabled={entry.audited}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border border-red-100 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
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
                    <span className="font-medium text-gray-600">{filteredEntries.length}</span> laporan
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