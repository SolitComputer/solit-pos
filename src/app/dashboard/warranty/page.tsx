"use client";

import { useEffect, useState, useMemo } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { UserRole, PERMISSIONS, hasPermission } from "@/lib/permissions";
import { getAuthUser } from "@/hooks/useAuthUser";

interface Warranty {
  id: string;
  invoice_number: string;
  serial_number: string;
  customer_name: string;
  customer_phone: string;
  laptop_name: string;
  warranty_start: string;
  warranty_end: string;
  warranty_duration: number;
  status: string;
  computed_status: string;
  manual_status_override?: boolean;
  days_left: number;
  notes: string;
  technician_notes: string;
  last_edited_by: string;
  last_edited_at: string;
  created_at: string;
}

const STATUS_STYLE: Record<string, { badge: string; dot: string; label: string; avatar: string }> = {
  ACTIVE: {
    badge: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    dot: "bg-emerald-500",
    label: "Aktif",
    avatar: "bg-emerald-900",
  },
  EXPIRING_SOON: {
    badge: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    dot: "bg-amber-400",
    label: "Segera Berakhir",
    avatar: "bg-amber-700",
  },
  EXPIRED: {
    badge: "bg-red-50 text-red-600 ring-1 ring-red-200",
    dot: "bg-red-400",
    label: "Kadaluarsa",
    avatar: "bg-red-800",
  },
  VOID: {
    badge: "bg-gray-100 text-gray-500 ring-1 ring-gray-200",
    dot: "bg-gray-400",
    label: "Dibatalkan",
    avatar: "bg-gray-500",
  },
};

// ─── Alert Modal ─────────────────────────────────────────────────────────────
function AlertModal({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 text-center animate-scaleIn">
        <div className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-gray-700 text-sm font-medium mb-4 leading-relaxed">{message}</p>
        <button
          onClick={onClose}
          className="w-full h-10 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 active:scale-[0.98] transition-all"
        >
          OK
        </button>
      </div>
    </div>
  );
}

// ─── Date Formatters ──────────────────────────────────────────────────────────
const fmt = (d: string) =>
  new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

const fmtShort = (d: string) =>
  new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short" });

// ─── Skeleton Card ────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gray-200 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-3.5 bg-gray-200 rounded-lg w-28" />
            <div className="h-5 bg-gray-100 rounded-full w-20" />
          </div>
          <div className="h-3 bg-gray-200 rounded-lg w-44" />
          <div className="h-2.5 bg-gray-100 rounded-lg w-32" />
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <div className="h-6 bg-gray-200 rounded-lg w-8" />
          <div className="h-2.5 bg-gray-100 rounded-lg w-6" />
        </div>
      </div>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
        <div className="h-3 bg-gray-100 rounded-lg w-40" />
        <div className="h-3 bg-gray-100 rounded-lg w-14" />
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function WarrantyPage() {
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [showArchived, setShowArchived] = useState(false);
  const [editTarget, setEditTarget] = useState<Warranty | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editForm, setEditForm] = useState({ warranty_end: "", notes: "", technician_notes: "", status: "" });
  const [alertModal, setAlertModal] = useState<string | null>(null);
  const canEdit = userRole ? hasPermission(userRole, PERMISSIONS.EDIT_WARRANTY) : false;

  useEffect(() => {
    getAuthUser().then(u => ({ success: true, user: u }))
      .then(r => setUserRole(r.user?.role ?? null))
      .catch(() => setUserRole(null));
  }, []);

  const fetchWarranties = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/warranty?archived=${showArchived}`);
      const result = await res.json();
      setWarranties(result.data || []);
    } catch {
      setWarranties([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchWarranties(); }, [showArchived]);

  const filtered = useMemo(() => {
    let list = [...warranties];
    if (search.trim()) {
      const kw = search.toLowerCase();
      list = list.filter(w =>
        w.serial_number?.toLowerCase().includes(kw) ||
        w.customer_name?.toLowerCase().includes(kw) ||
        w.customer_phone?.toLowerCase().includes(kw) ||
        w.laptop_name?.toLowerCase().includes(kw) ||
        w.invoice_number?.toLowerCase().includes(kw)
      );
    }
    if (filterStatus !== "ALL") list = list.filter(w => w.computed_status === filterStatus);
    return list;
  }, [warranties, search, filterStatus]);

  const stats = useMemo(() => ({
    active: warranties.filter(w => w.computed_status === "ACTIVE").length,
    expiringSoon: warranties.filter(w => w.computed_status === "EXPIRING_SOON").length,
    expired: warranties.filter(w => w.computed_status === "EXPIRED").length,
    void: warranties.filter(w => w.computed_status === "VOID").length,
  }), [warranties]);

  const openEdit = (w: Warranty) => {
    setEditTarget(w);
    setEditForm({ warranty_end: w.warranty_end, notes: w.notes || "", technician_notes: w.technician_notes || "", status: w.computed_status });
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setEditLoading(true);
    try {
      const res = await fetch(`/api/warranty/${editTarget.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const result = await res.json();
      if (!result.success) { setAlertModal(result.message); return; }
      setEditTarget(null);
      fetchWarranties();
    } catch {
      setAlertModal("Terjadi kesalahan");
    } finally {
      setEditLoading(false);
    }
  };

  const extendWarranty = (days: number) => {
    const current = new Date(editForm.warranty_end);
    current.setDate(current.getDate() + days);
    setEditForm(prev => ({ ...prev, warranty_end: current.toISOString().split("T")[0] }));
  };

  const FILTERS = [
    { value: "ALL", label: "Semua", count: warranties.length },
    { value: "ACTIVE", label: "Aktif", count: stats.active },
    { value: "EXPIRING_SOON", label: "Berakhir", count: stats.expiringSoon },
    { value: "EXPIRED", label: "Expired", count: stats.expired },
    { value: "VOID", label: "Void", count: stats.void },
  ];

  return (
    <DashboardLayout>
      {/* ── Page Wrapper: narrow on mobile, wider on desktop ── */}
      <div className="min-h-screen bg-gray-50/50">
        <div className="max-w-2xl lg:max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7 space-y-5">

          {/* ── Header ── */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {/* Icon */}
              <div className="w-10 h-10 sm:w-11 sm:h-11 bg-gradient-to-br from-gray-800 to-gray-950 rounded-2xl flex items-center justify-center shadow-lg shadow-gray-900/25 ring-1 ring-gray-700/30 flex-shrink-0">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              {/* Title */}
              <div>
                <h1 className="text-base sm:text-lg font-bold text-gray-900 leading-tight tracking-tight">Garansi</h1>
                <p className="text-[11px] sm:text-xs text-gray-400 font-medium">Warranty Management</p>
              </div>
            </div>

            {/* Archive toggle */}
            <button
              onClick={() => setShowArchived(!showArchived)}
              className={`flex items-center gap-1.5 px-3 py-2 sm:px-4 rounded-xl text-xs font-semibold transition-all duration-200 flex-shrink-0 ${
                showArchived
                  ? "bg-gray-900 text-white shadow-md shadow-gray-900/20"
                  : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50 hover:border-gray-300"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <polyline points="21 8 21 21 3 21 3 8" />
                <rect x="1" y="3" width="22" height="5" />
              </svg>
              <span className="hidden xs:inline sm:inline">{showArchived ? "Sembunyikan Arsip" : "Arsip"}</span>
              <span className="xs:hidden sm:hidden">{showArchived ? "Tutup" : "Arsip"}</span>
            </button>
          </div>

          {/* ── Stats Row ── */}
          {/*
            BEFORE: grid-cols-4 dengan teks kecil dan spacing sempit.
            AFTER:  grid-cols-4 tetap, tapi padding dan font scale responsif
                    sm ke atas lebih lega. Di mobile, angka lebih besar dan
                    label tetap terbaca. Bar bawah lebih tebal biar keliatan.
          */}
          <div className="grid grid-cols-4 gap-2 sm:gap-3">
            {[
              { label: "Aktif", value: stats.active, color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-100", bar: "bg-emerald-400" },
              { label: "Berakhir", value: stats.expiringSoon, color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-100", bar: "bg-amber-400" },
              { label: "Expired", value: stats.expired, color: "text-red-600", bg: "bg-red-50", border: "border-red-100", bar: "bg-red-400" },
              { label: "Void", value: stats.void, color: "text-gray-500", bg: "bg-gray-50", border: "border-gray-200", bar: "bg-gray-300" },
            ].map((s) => (
              <div
                key={s.label}
                className={`${s.bg} border ${s.border} rounded-2xl p-3 sm:p-4 flex flex-col items-center justify-center gap-1 relative overflow-hidden`}
              >
                {/* Accent bar bottom */}
                <div className={`absolute bottom-0 left-0 right-0 h-[3px] ${s.bar} opacity-70 rounded-b-2xl`} />
                <div className={`text-2xl sm:text-3xl font-black tabular-nums leading-none ${s.color}`}>
                  {s.value}
                </div>
                <div className="text-[9px] sm:text-[10px] text-gray-500 font-semibold tracking-wide text-center leading-tight">
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* ── Search + Filter ── */}
          {/*
            BEFORE: space-y-2.5 biasa, input dan filter pill rapat.
            AFTER:  space-y-3, input lebih tinggi di sm, filter pill
                    punya scrollbar yang mulus dan gap lebih consistent.
          */}
          <div className="space-y-3">
            {/* Search input */}
            <div className="relative">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Cari SN, customer, invoice, laptop..."
                className="w-full border border-gray-200 rounded-xl h-11 pl-10 pr-10 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-all placeholder:text-gray-400 shadow-sm"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-gray-200 hover:bg-gray-300 text-gray-500 transition-all"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>

            {/* Filter pills */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
              {FILTERS.map(f => (
                <button
                  key={f.value}
                  onClick={() => setFilterStatus(f.value)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                    filterStatus === f.value
                      ? "bg-gray-900 text-white shadow-md shadow-gray-900/20"
                      : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50 hover:border-gray-300"
                  }`}
                >
                  {f.label}
                  <span className={`tabular-nums text-[10px] px-1.5 py-0.5 rounded-md font-bold leading-none ${
                    filterStatus === f.value ? "bg-white/20 text-white/90" : "bg-gray-100 text-gray-400"
                  }`}>
                    {f.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Result count hint ── */}
          {/*
            BARU: Tambah row kecil yang menunjukkan jumlah hasil filter.
                  Membantu UX di mobile ketika user filter/search sesuatu.
          */}
          {!isLoading && (search || filterStatus !== "ALL") && (
            <div className="flex items-center gap-2 -mt-1">
              <span className="text-xs text-gray-400 font-medium">
                {filtered.length === 0
                  ? "Tidak ada hasil"
                  : `${filtered.length} garansi ditemukan`}
              </span>
              {(search || filterStatus !== "ALL") && (
                <button
                  onClick={() => { setSearch(""); setFilterStatus("ALL"); }}
                  className="text-xs text-gray-500 hover:text-gray-700 font-semibold underline underline-offset-2 transition-colors"
                >
                  Reset
                </button>
              )}
            </div>
          )}

          {/* ── List ── */}
          {/*
            BEFORE: space-y-2, list langsung tanpa padding wrapper.
            AFTER:  space-y-2.5, cards lebih bernapas. Di desktop, grid 2 col
                    kalau lebih dari 3 item (lg:grid-cols-2). Di mobile tetap 1 col.
          */}
          <div className={`${
            filtered.length > 2 && !isLoading
              ? "grid grid-cols-1 lg:grid-cols-2 gap-2.5"
              : "space-y-2.5"
          }`}>
            {isLoading ? (
              Array(4).fill(0).map((_, i) => <SkeletonCard key={i} />)
            ) : filtered.length === 0 ? (
              // Empty state — span full width di grid
              <div className="col-span-full bg-white rounded-2xl border border-gray-100 shadow-sm p-12 sm:p-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.8">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <p className="text-gray-700 font-semibold text-sm mb-1">Tidak ada data garansi</p>
                <p className="text-gray-400 text-xs leading-relaxed max-w-[200px] mx-auto">
                  {search || filterStatus !== "ALL"
                    ? "Coba ubah filter atau kata pencarian"
                    : "Garansi dibuat otomatis setelah transaksi selesai"}
                </p>
                {(search || filterStatus !== "ALL") && (
                  <button
                    onClick={() => { setSearch(""); setFilterStatus("ALL"); }}
                    className="mt-4 px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-semibold rounded-xl transition-all"
                  >
                    Hapus Filter
                  </button>
                )}
              </div>
            ) : (
              filtered.map((w, idx) => (
                <WarrantyCard
                  key={w.id}
                  warranty={w}
                  canEdit={canEdit}
                  onEdit={() => openEdit(w)}
                  index={idx}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Edit Modal ── */}
      {/*
        BEFORE: hanya items-end di mobile (slide from bottom).
        AFTER:  tetap slide from bottom di mobile, tapi di sm ke atas
                centered dengan max-w-lg yang lebih lega. Form field juga
                lebih besar dan enak di-tap di mobile.
      */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditTarget(null)} />
          <div className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[94dvh] sm:max-h-[88dvh] overflow-hidden animate-slideUp">

            {/* Modal Header */}
            <div className="bg-gradient-to-br from-gray-800 to-gray-950 px-5 sm:px-6 pt-5 pb-4 flex-shrink-0">
              {/* Drag handle — mobile only */}
              <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4 sm:hidden" />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-bold text-white text-sm sm:text-base tracking-tight leading-tight">Edit Garansi</h2>
                  <p className="text-xs text-gray-400 mt-0.5 font-mono truncate">{editTarget.serial_number}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5 truncate">{editTarget.customer_name} · {editTarget.laptop_name}</p>
                </div>
                <button
                  onClick={() => setEditTarget(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-all flex-shrink-0 mt-0.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto flex-1 px-5 sm:px-6 py-5">
              <form onSubmit={handleEdit} className="space-y-4">

                {/* Info block */}
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-2.5">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Info Transaksi</p>
                  {[
                    { label: "Customer", value: editTarget.customer_name },
                    { label: "Laptop", value: editTarget.laptop_name },
                    { label: "Invoice", value: editTarget.invoice_number, mono: true },
                    { label: "Mulai", value: fmt(editTarget.warranty_start) },
                  ].map(row => (
                    <div key={row.label} className="flex justify-between items-center gap-4">
                      <span className="text-xs text-gray-400 flex-shrink-0">{row.label}</span>
                      <span className={`font-semibold text-gray-700 text-right text-xs truncate ${row.mono ? "font-mono" : ""}`}>
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Status */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-2">Status</label>
                  <select
                    value={editForm.status}
                    onChange={e => setEditForm(p => ({ ...p, status: e.target.value }))}
                    className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-all cursor-pointer"
                  >
                    <option value="ACTIVE">Aktif</option>
                    <option value="EXPIRING_SOON">Segera Berakhir</option>
                    <option value="EXPIRED">Kadaluarsa</option>
                    <option value="VOID">Dibatalkan</option>
                  </select>
                </div>

                {/* Tanggal Akhir */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-2">Tanggal Akhir Garansi</label>
                  <input
                    type="date"
                    value={editForm.warranty_end}
                    onChange={e => setEditForm(p => ({ ...p, warranty_end: e.target.value }))}
                    className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-all"
                    required
                  />
                  {/* Extend buttons */}
                  <div className="flex flex-wrap items-center gap-2 mt-2.5">
                    <span className="text-[10px] text-gray-400 font-medium">Perpanjang:</span>
                    {[7, 14, 30, 90].map(d => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => extendWarranty(d)}
                        className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 active:scale-95 text-gray-600 rounded-lg text-[11px] font-semibold transition-all"
                      >
                        +{d}h
                      </button>
                    ))}
                  </div>
                </div>

                {/* Catatan Garansi */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-2">Catatan Garansi</label>
                  <textarea
                    value={editForm.notes}
                    onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))}
                    rows={2}
                    placeholder="Catatan untuk customer..."
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-all resize-none leading-relaxed"
                  />
                </div>

                {/* Catatan Teknisi */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-2">Catatan Teknisi <span className="text-gray-400 font-normal">(internal)</span></label>
                  <textarea
                    value={editForm.technician_notes}
                    onChange={e => setEditForm(p => ({ ...p, technician_notes: e.target.value }))}
                    rows={2}
                    placeholder="Catatan internal teknisi..."
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-all resize-none leading-relaxed"
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setEditTarget(null)}
                    className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 active:scale-[0.98] transition-all"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={editLoading}
                    className="flex-1 h-11 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 active:scale-[0.98] transition-all disabled:opacity-50 shadow-md shadow-gray-900/20"
                  >
                    {editLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Menyimpan...
                      </span>
                    ) : "Simpan Perubahan"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {alertModal && <AlertModal message={alertModal} onClose={() => setAlertModal(null)} />}

      <style jsx>{`
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.93); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        .animate-scaleIn  { animation: scaleIn  0.2s  ease-out; }
        .animate-slideUp  { animation: slideUp  0.25s ease-out; }
        .scrollbar-hide   { -ms-overflow-style: none; scrollbar-width: none; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
      `}</style>
    </DashboardLayout>
  );
}

// ─── Warranty Card ─────────────────────────────────────────────────────────────
/*
  BEFORE: Info hierarchy kurang jelas, action buttons rapat, padding tidak
          consistent di mobile. "Receipt" dan "Edit" terasa kecil dan sulit di-tap.
  AFTER:
  - Avatar lebih besar (w-10 h-10) biar proporsional di semua ukuran
  - Nama customer font-size lebih tegas
  - Serial number tetap font-mono kecil (identitas visual laptop)
  - Days left: angka besar tapi ada layout yang lebih rapi
  - Meta row: icon-text pair lebih readable, phone & date lebih bersih
  - Action buttons ("Receipt", "Edit") punya padding lebih besar → enak di-tap di HP
  - Expanded section: grid 3 col di sm ke atas, 2 col di mobile
*/
function WarrantyCard({
  warranty: w, canEdit, onEdit, index,
}: {
  warranty: Warranty; canEdit: boolean; onEdit: () => void; index?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const s = STATUS_STYLE[w.computed_status] || STATUS_STYLE.VOID;

  const daysDisplay = () => {
    if (w.computed_status === "VOID")
      return (
        <span className="text-[11px] font-semibold text-gray-400 bg-gray-100 px-2.5 py-1 rounded-lg">Void</span>
      );
    if (w.computed_status === "EXPIRED")
      return (
        <span className="text-[11px] font-bold text-red-500 bg-red-50 px-2.5 py-1 rounded-lg ring-1 ring-red-200">Expired</span>
      );
    return (
      <div className="text-right flex flex-col items-end leading-none">
        <span className={`text-[22px] font-black tabular-nums ${w.days_left <= 7 ? "text-amber-500" : "text-gray-800"}`}>
          {w.days_left}
        </span>
        <span className="text-[9px] text-gray-400 font-semibold uppercase tracking-widest mt-0.5">hari</span>
      </div>
    );
  };

  return (
    <div
      className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-200 overflow-hidden"
      style={{ animationDelay: `${(index || 0) * 30}ms` }}
    >
      {/* ── Main Row ── */}
      <div className="px-4 pt-4 pb-0 flex items-start gap-3">
        {/* Avatar */}
        <div className={`w-10 h-10 rounded-full ${s.avatar} flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-sm mt-0.5`}>
          {(w.customer_name || "?").charAt(0).toUpperCase()}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 pb-3.5">
          {/* Name + badge */}
          <div className="flex items-start gap-2 flex-wrap">
            <span className="font-bold text-gray-900 text-sm sm:text-[15px] leading-tight truncate max-w-[160px] sm:max-w-none">
              {w.customer_name}
            </span>
            <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0 ${s.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
              {s.label}
            </span>
          </div>
          {/* Laptop name */}
          <p className="text-xs text-gray-600 font-medium mt-0.5 truncate leading-snug">
            {w.laptop_name}
          </p>
          {/* Serial number */}
          <p className="text-[11px] text-gray-300 font-mono mt-0.5 truncate">
            {w.serial_number}
          </p>
        </div>

        {/* Right: Days left + Expand button */}
        <div className="flex-shrink-0 flex items-start gap-1.5 pt-0.5">
          {daysDisplay()}
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-7 h-7 flex items-center justify-center rounded-xl text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-all mt-0.5"
            aria-label={expanded ? "Tutup detail" : "Lihat detail"}
          >
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Meta Row ── */}
      {/*
        BEFORE: semua dalam satu flex, phone & date nempel rapat.
        AFTER:  dibagi 2 bagian — kiri (date + phone), kanan (receipt + edit).
                Di mobile, font sedikit lebih besar biar enak dibaca.
                Action buttons punya area klik yang lebih luas (py-2.5 border-t).
      */}
      <div className="px-4 py-2.5 border-t border-gray-100 flex items-center justify-between gap-2">
        {/* Date & phone */}
        <div className="flex items-center gap-2 text-[11px] sm:text-xs text-gray-400 min-w-0 flex-1">
          <svg className="w-3 h-3 flex-shrink-0 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span className="truncate">{fmtShort(w.warranty_start)} – {fmtShort(w.warranty_end)}</span>
          {w.customer_phone && (
            <>
              <span className="text-gray-200 flex-shrink-0">·</span>
              <span className="truncate hidden xs:block sm:block">{w.customer_phone}</span>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <a
            href={`/receipt/${w.invoice_number}`}
            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg font-semibold transition-all"
          >
            Receipt
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
          {canEdit && (
            <button
              onClick={onEdit}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg font-semibold transition-all"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit
            </button>
          )}
        </div>
      </div>

      {/* ── Expanded Detail ── */}
      {/*
        BEFORE: grid-cols-2 kaku, layout rapat, catatan tidak ada header yang jelas.
        AFTER:
        - grid-cols-2 sm:grid-cols-3 di info chips
        - Badge pills untuk invoice, durasi, last edited lebih readable
        - Catatan garansi & teknisi lebih jelas hierarchy-nya
        - Semua spacing lebih konsisten
      */}
      {expanded && (
        <div className="px-4 py-4 border-t border-gray-100 bg-gray-50/60 space-y-3 animate-expandDown">
          {/* Info chips */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div className="bg-white rounded-xl px-3 py-2.5 border border-gray-100 shadow-sm">
              <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-1">Invoice</p>
              <p className="font-mono text-gray-700 text-[11px] truncate">{w.invoice_number}</p>
            </div>
            <div className="bg-white rounded-xl px-3 py-2.5 border border-gray-100 shadow-sm">
              <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-1">Durasi</p>
              <p className="font-semibold text-gray-700 text-xs">{w.warranty_duration} hari</p>
            </div>
            {w.customer_phone && (
              <div className="bg-white rounded-xl px-3 py-2.5 border border-gray-100 shadow-sm col-span-2 sm:col-span-1">
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-1">Telepon</p>
                <a href={`tel:${w.customer_phone}`} className="font-semibold text-blue-600 text-xs hover:underline">
                  {w.customer_phone}
                </a>
              </div>
            )}
          </div>

          {/* Last edited */}
          {w.last_edited_by && (
            <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
              <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>Diedit oleh</span>
              <span className="font-semibold text-gray-600">{w.last_edited_by}</span>
              {w.last_edited_at && <span>· {fmt(w.last_edited_at)}</span>}
            </div>
          )}

          {/* Catatan Garansi */}
          {w.notes && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-3.5 py-3 text-xs">
              <p className="text-[9px] font-bold text-blue-400 uppercase tracking-widest mb-1.5">Catatan Garansi</p>
              <p className="text-blue-800 leading-relaxed">{w.notes}</p>
            </div>
          )}

          {/* Catatan Teknisi */}
          {w.technician_notes && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-3.5 py-3 text-xs">
              <p className="text-[9px] font-bold text-amber-400 uppercase tracking-widest mb-1.5">Catatan Teknisi</p>
              <p className="text-amber-800 leading-relaxed">{w.technician_notes}</p>
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        @keyframes expandDown {
          from { opacity: 0; max-height: 0; }
          to   { opacity: 1; max-height: 600px; }
        }
        .animate-expandDown { animation: expandDown 0.25s ease-out; overflow: hidden; }
      `}</style>
    </div>
  );
}