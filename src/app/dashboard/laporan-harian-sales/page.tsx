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

// Aksen warna kecil per-channel (dot di tab & garis kiri baris tabel) —
// dekorasi presentasional saja, mengikuti keluarga warna channelBadgeClass.
const channelDotClass: Record<Channel, string> = {
  WA: "bg-emerald-500",
  FB: "bg-blue-500",
  OLX: "bg-orange-500",
  CAROUSEL: "bg-cyan-500",
  MITRA: "bg-violet-500",
  RESELLER: "bg-amber-500",
};

const channelBorderClass: Record<Channel, string> = {
  WA: "border-l-emerald-400",
  FB: "border-l-blue-400",
  OLX: "border-l-orange-400",
  CAROUSEL: "border-l-cyan-400",
  MITRA: "border-l-violet-400",
  RESELLER: "border-l-amber-400",
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
      <div className="max-w-5xl mx-auto space-y-4 sm:space-y-5 p-3 sm:p-6 pb-16">
        {/* Animasi dekoratif blob di panel ringkasan — satu momen gerak yang halus,
            dimatikan otomatis kalau user mengaktifkan prefers-reduced-motion. */}
        <style>{`
          @keyframes spBlobFloatA { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(12px, -16px) scale(1.06); } }
          @keyframes spBlobFloatB { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(-14px, 12px) scale(1.04); } }
          .sp-blob-a { animation: spBlobFloatA 10s ease-in-out infinite; }
          .sp-blob-b { animation: spBlobFloatB 12s ease-in-out infinite; }
          @media (prefers-reduced-motion: reduce) {
            .sp-blob-a, .sp-blob-b { animation: none; }
          }
        `}</style>

        {/* Header halaman */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3.5">
          <div className="min-w-0 flex items-start gap-3">
            <span className="mt-0.5 w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-500 flex items-center justify-center shrink-0 shadow-sm shadow-violet-200">
              <Send className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
                Laporan Harian Sales
              </h1>
              <p className="text-gray-400 text-xs sm:text-sm mt-1 max-w-md leading-relaxed">
                Catat setiap leads masuk dari semua channel: WA, FB, OLX, Carousell, Mitra & Reseller. Setiap laporan bernilai 1 poin di leaderboard, dan setiap audit oleh tim Marketing bernilai 0,5 poin lencana.
              </p>
              {lastUpdated && (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-400 bg-white border border-gray-100 px-2.5 py-1 rounded-full mt-2 shadow-sm shadow-gray-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Diperbarui {lastUpdated.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => fetchEntries(period)}
              className="flex items-center justify-center gap-1.5 h-10 px-3 sm:px-4 rounded-full text-xs sm:text-sm font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 active:scale-[0.97] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={openAddModal}
              className="flex items-center justify-center gap-1.5 h-10 px-3.5 sm:px-4 rounded-full text-xs sm:text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 active:scale-[0.97] transition-all shadow-sm shadow-violet-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
            >
              <Plus className="w-4 h-4" />
              Tambah Laporan
            </button>
          </div>
        </div>

        {/* Panel ringkasan */}
        <div className="relative overflow-hidden rounded-3xl bg-white border border-gray-100 shadow-sm px-4 py-5 sm:px-7 sm:py-6">
          <div className="pointer-events-none absolute -right-14 -top-24 h-72 w-72 rounded-full bg-violet-300/60 blur-2xl sp-blob-a" />
          <div className="pointer-events-none absolute right-24 -bottom-16 h-56 w-56 rounded-full bg-blue-300/50 blur-2xl sp-blob-b" style={{ animationDelay: "1.5s" }} />
          <div className="pointer-events-none absolute right-52 top-2 h-28 w-28 rounded-full bg-fuchsia-300/40 blur-2xl hidden sm:block sp-blob-a" style={{ animationDelay: "3s" }} />

          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-gray-900">Ringkasan {periodLabels[period].toLowerCase()}</h2>
              <p className="text-gray-500 text-xs mt-0.5">Jumlah laporan dan status pembelian yang tercatat</p>
            </div>
            <div className="flex bg-gray-50/80 backdrop-blur-sm rounded-full border border-gray-100 p-0.5 self-start sm:self-auto">
              {(["today", "week", "month"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 text-[11px] font-medium rounded-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 ${
                    period === p ? "bg-violet-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  {periodLabels[p]}
                </button>
              ))}
            </div>
          </div>

          <div className="relative flex flex-col lg:flex-row gap-3 lg:gap-4 mt-5">
            {/* Ring konversi — fokus visual utama panel, dihitung dari stats.convRate yang sudah ada */}
            <div className="flex items-center gap-4 bg-white/70 backdrop-blur-sm rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5 lg:w-64 shrink-0">
              <ConversionRing percent={stats.convRate} hasData={entries.length > 0} />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold tracking-wide text-gray-500 uppercase">Tingkat Konversi</p>
                <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                  {entries.length > 0
                    ? `${stats.beli} dari ${stats.total} leads berhasil dikonversi`
                    : "Belum ada laporan pada periode ini"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5 sm:gap-3 flex-1">
              <StatCard
                label="Total Laporan"
                value={stats.total}
                caption={periodLabels[period]}
                icon={Inbox}
                iconClass="bg-violet-50 text-violet-600"
              />
              <StatCard
                label="Beli"
                value={stats.beli}
                caption="dari total laporan"
                delta={entries.length > 0 ? `${stats.convRate}%` : undefined}
                deltaClass="bg-emerald-50 text-emerald-600"
                icon={CheckCircle2}
                iconClass="bg-emerald-50 text-emerald-600"
              />
              <StatCard
                label="Tidak Beli"
                value={stats.tidak}
                caption="dari total laporan"
                delta={entries.length > 0 ? `${100 - stats.convRate}%` : undefined}
                deltaClass="bg-gray-100 text-gray-500"
                icon={XCircle}
                iconClass="bg-gray-100 text-gray-500"
              />
            </div>
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
              className="bg-white rounded-2xl border border-gray-200/70 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 sticky top-0 bg-white/95 backdrop-blur-sm z-10">
                <div className="w-9 h-9 rounded-full bg-violet-50 flex items-center justify-center shrink-0">
                  {editingEntry ? (
                    <Pencil className="w-4 h-4 text-violet-600" />
                  ) : (
                    <Plus className="w-4 h-4 text-violet-600" />
                  )}
                </div>
                <h2 className="text-sm font-semibold text-gray-900 flex-1">
                  {editingEntry ? "Edit Laporan" : "Tambah Laporan"}
                </h2>
                <button
                  onClick={closeFormModal}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1.5 block">Channel</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {CHANNELS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setChannel(c)}
                        className={`inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-semibold border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 ${
                          channel === c ? "bg-violet-600 border-violet-600 text-white shadow-sm shadow-violet-200" : "bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${channel === c ? "bg-white/80" : channelDotClass[c]}`} />
                        {channelLabels[c]}
                      </button>
                    ))}
                  </div>
                </div>

                {isNoPhoneChannel ? (
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Nama Mitra/Reseller</label>
                    <div className="relative">
                      <Building2 className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        value={partnerName}
                        onChange={(e) => setPartnerName(e.target.value)}
                        placeholder="Contoh: Toko Jaya Komputer"
                        className="w-full pl-8 pr-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 focus:bg-white transition-colors"
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Nomor Telepon</label>
                    <div className="relative">
                      <Phone className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="08xxxxxxxxxx"
                        className="w-full pl-8 pr-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 focus:bg-white transition-colors"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Minat (Laptop)</label>
                  <div className="relative">
                    <Laptop2 className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      value={interest}
                      onChange={(e) => setInterest(e.target.value)}
                      placeholder="Contoh: Thinkpad T480, RAM 8GB"
                      className="w-full pl-8 pr-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 focus:bg-white transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Keterangan (opsional)</label>
                  <div className="relative">
                    <MessageSquareText className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-3 pointer-events-none" />
                    <textarea
                      value={keterangan}
                      onChange={(e) => setKeterangan(e.target.value)}
                      placeholder="Catatan tambahan tentang leads ini..."
                      rows={2}
                      className="w-full pl-8 pr-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 focus:bg-white transition-colors resize-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1.5 block">Status</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPurchased(true)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 ${
                        purchased ? "bg-emerald-600 border-emerald-600 text-white shadow-sm shadow-emerald-200" : "bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Beli
                    </button>
                    <button
                      type="button"
                      onClick={() => setPurchased(false)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500/30 ${
                        !purchased ? "bg-gray-800 border-gray-800 text-white shadow-sm shadow-gray-200" : "bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      <XCircle className="w-3.5 h-3.5" /> Tidak
                    </button>
                  </div>
                </div>

                {formError && (
                  <p className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    {formError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 active:scale-[0.99] transition-all disabled:opacity-50 disabled:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 shadow-sm shadow-violet-200"
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
              className="bg-white rounded-2xl border border-gray-200/70 w-full max-w-sm shadow-2xl p-5 max-h-[85vh] overflow-y-auto"
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
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/30"
                >
                  Batal
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 active:scale-[0.99] transition-all disabled:opacity-50 disabled:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 shadow-sm shadow-red-200"
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
              className="bg-white rounded-2xl border border-gray-200/70 w-full max-w-sm shadow-2xl p-5 max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-11 h-11 rounded-full bg-fuchsia-50 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5 text-fuchsia-600" />
                </div>
                <span className="text-[11px] font-semibold text-fuchsia-600 bg-fuchsia-50 px-2 py-1 rounded-full">
                  Langkah {auditStep} / 2
                </span>
              </div>

              {auditStep === 1 ? (
                <>
                  <h2 className="text-sm font-semibold text-gray-900">Periksa Data</h2>
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
                      className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/30"
                    >
                      Batal
                    </button>
                    <button
                      onClick={() => setAuditStep(2)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold bg-fuchsia-600 text-white hover:bg-fuchsia-700 active:scale-[0.99] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500/40 shadow-sm shadow-fuchsia-200"
                    >
                      Lanjut Verifikasi
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-sm font-semibold text-gray-900">Konfirmasi Audit</h2>
                  <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                    Data sudah benar dan siap diaudit. Setelah dikonfirmasi, laporan ini{" "}
                    <span className="font-medium text-gray-700">tidak bisa diedit/dihapus lagi</span> oleh tim sales, dan kamu akan mendapat{" "}
                    <span className="font-medium text-fuchsia-600">+0,5 poin</span> lencana audit.
                  </p>
                  {auditError && (
                    <p className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mt-3">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      {auditError}
                    </p>
                  )}
                  <div className="flex gap-2 mt-5">
                    <button
                      onClick={() => setAuditStep(1)}
                      disabled={auditing}
                      className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/30"
                    >
                      Kembali
                    </button>
                    <button
                      onClick={confirmAudit}
                      disabled={auditing}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold bg-fuchsia-600 text-white hover:bg-fuchsia-700 active:scale-[0.99] transition-all disabled:opacity-50 disabled:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500/40 shadow-sm shadow-fuchsia-200"
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

          {/* Tab channel — fade di kedua ujung sebagai penanda ada konten yang bisa di-scroll */}
          <div className="relative border-b border-gray-100">
            <div
              className="px-4 sm:px-5 py-2.5 flex gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden"
              style={{ scrollbarWidth: "none" }}
            >
              <button
                onClick={() => setChannelFilter("ALL")}
                className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/30 ${
                  channelFilter === "ALL" ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                }`}
              >
                Semua
              </button>
              {CHANNELS.map((c) => (
                <button
                  key={c}
                  onClick={() => setChannelFilter(c)}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/30 ${
                    channelFilter === c ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${channelDotClass[c]}`} />
                  {channelLabels[c]}
                </button>
              ))}
            </div>
            <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-white to-transparent sm:hidden" />
          </div>

          {listError && (
            <p className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 px-4 sm:px-5 py-3">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {listError}
            </p>
          )}

          {loading ? (
            <div className="p-4 sm:p-5 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="h-8 w-8 rounded-full bg-gray-100 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-1/3 bg-gray-100 rounded-full" />
                    <div className="h-2.5 w-1/5 bg-gray-100 rounded-full" />
                  </div>
                  <div className="h-5 w-14 bg-gray-100 rounded-full shrink-0" />
                </div>
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
                className="mt-4 text-xs font-semibold text-violet-600 hover:underline focus:outline-none"
              >
                Tambah laporan pertama →
              </button>
            </div>
          ) : (
            <>
              {/* Tabel — laptop/desktop (md ke atas). Struktur kolom mengikuti papan tulis:
                  No | Nama/Kontak | Minat | Keterangan | Transaksi | Audit.
                  Kolom Channel disembunyikan saat tab spesifik aktif (WA/FB/dst)
                  karena sudah jelas dari tab yang dipilih — cuma tampil saat
                  tab "Semua". Keterangan & Diinput Oleh baru tampil mulai layar
                  lg supaya tabel tidak sesak di layar medium/tablet. */}
              <div className="overflow-x-auto hidden md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50/80 border-b border-gray-100">
                      <th className="px-4 sm:px-5 py-2.5 text-left text-[11px] font-medium text-gray-500 w-10">No</th>
                      {channelFilter === "ALL" && (
                        <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-500">Channel</th>
                      )}
                      <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-500">Nama / Kontak</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-500">Minat</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-500 hidden lg:table-cell">Keterangan</th>
                      <th className="px-4 py-2.5 text-center text-[11px] font-medium text-gray-500">Transaksi</th>
                      <th className="px-4 py-2.5 text-center text-[11px] font-medium text-gray-500">Audit</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-500 hidden lg:table-cell">Diinput Oleh</th>
                      <th className="px-4 sm:px-5 py-2.5 w-20 text-right text-[11px] font-medium text-gray-500">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {paginatedEntries.map((entry, idx) => (
                      <tr key={entry.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className={`pl-3 sm:pl-4 pr-4 py-3 text-gray-400 tabular-nums border-l-4 ${channelBorderClass[entry.channel]}`}>{pageStart + idx}</td>
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
                        <td className="px-4 py-3 text-gray-600 max-w-[140px] truncate" title={entry.interest}>{entry.interest}</td>
                        <td className="px-4 py-3 text-gray-500 max-w-[160px] truncate hidden lg:table-cell" title={entry.keterangan || undefined}>{entry.keterangan || "—"}</td>
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
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-fuchsia-600 text-white hover:bg-fuchsia-700 active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500/40"
                            >
                              <ClipboardCheck className="w-3 h-3" /> Audit
                            </button>
                          ) : (
                            <span className="text-[11px] text-gray-300 font-medium">Menunggu</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap hidden lg:table-cell">
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
                              className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/30"
                              title={entry.audited ? "Sudah diaudit" : "Edit"}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(entry)}
                              disabled={entry.audited}
                              className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/30"
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

              {/* Kartu — mobile & tablet kecil (di bawah md) */}
              <div className="md:hidden divide-y divide-gray-50">
                {paginatedEntries.map((entry) => (
                  <div key={entry.id} className={`p-4 space-y-2.5 border-l-4 ${channelBorderClass[entry.channel]}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ${avatarStyle(
                            entry.filled_by_name
                          )}`}
                        >
                          {initials(entry.filled_by_name)}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 tabular-nums truncate">{entry.phone_number || entry.partner_name}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                            {entry.filled_by_name} ·{" "}
                            {new Date(entry.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>
                      <StatusBadge purchased={entry.purchased} />
                    </div>
                    <div className="flex items-center gap-1.5 pl-10 flex-wrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${channelBadgeClass[entry.channel]}`}>
                        {channelLabels[entry.channel]}
                      </span>
                      {entry.audited && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-fuchsia-50 text-fuchsia-600">
                          <ShieldCheck className="w-2.5 h-2.5" /> Terverifikasi
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 pl-10">{entry.interest}</p>
                    {entry.keterangan && <p className="text-[11px] text-gray-400 pl-10">{entry.keterangan}</p>}
                    <div className="flex items-center gap-2 pt-1">
                      {!entry.audited && canAudit && (
                        <button
                          onClick={() => openAuditModal(entry)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border border-fuchsia-200 text-fuchsia-600 hover:bg-fuchsia-50 active:scale-[0.98] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500/40"
                        >
                          <ClipboardCheck className="w-3 h-3" /> Audit
                        </button>
                      )}
                      <button
                        onClick={() => openEditModal(entry)}
                        disabled={entry.audited}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 active:scale-[0.98] transition-all disabled:opacity-40 disabled:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/30"
                      >
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                      <button
                        onClick={() => setDeleteTarget(entry)}
                        disabled={entry.audited}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border border-red-100 text-red-500 hover:bg-red-50 active:scale-[0.98] transition-all disabled:opacity-40 disabled:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/30"
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
                    <span className="font-medium text-gray-600">{pageStart}–{pageEnd}</span> dari{" "}
                    <span className="font-medium text-gray-600">{filteredEntries.length}</span> laporan
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50 active:scale-95 transition-all disabled:opacity-40 disabled:hover:bg-transparent disabled:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/30"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[11px] text-gray-500 min-w-[3ch] text-center tabular-nums">
                      {currentPage}/{totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50 active:scale-95 transition-all disabled:opacity-40 disabled:hover:bg-transparent disabled:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/30"
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

function ConversionRing({
  percent,
  hasData,
  size = 76,
  strokeWidth = 8,
}: {
  percent: number;
  hasData: boolean;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = circumference - (hasData ? clamped / 100 : 0) * circumference;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#EEECFB" strokeWidth={strokeWidth} />
        {hasData && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="url(#salesConvGradient)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-[stroke-dashoffset] duration-700 ease-out"
          />
        )}
        <defs>
          <linearGradient id="salesConvGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7C3AED" />
            <stop offset="100%" stopColor="#10B981" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold text-gray-900">{hasData ? `${clamped}%` : "—"}</span>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  caption,
  delta,
  deltaClass,
  icon: Icon,
  iconClass,
}: {
  label: string;
  value: number;
  caption: string;
  delta?: string;
  deltaClass?: string;
  icon?: React.ComponentType<{ className?: string }>;
  iconClass?: string;
}) {
  return (
    <div className="relative bg-white rounded-2xl border border-gray-100 shadow-sm px-3 py-3 sm:px-4 sm:py-3.5 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between gap-1">
        <p className="text-[10px] font-semibold tracking-wide text-gray-500 uppercase truncate">{label}</p>
        {Icon && (
          <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${iconClass ?? "bg-gray-100 text-gray-500"}`}>
            <Icon className="w-3 h-3" />
          </span>
        )}
      </div>
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
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-100">
        <CheckCircle2 className="w-3 h-3" /> Beli
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-500 ring-1 ring-inset ring-gray-200">
      <XCircle className="w-3 h-3" /> Tidak
    </span>
  );
}