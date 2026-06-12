"use client";

import { useEffect, useState, useMemo } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { UserRole, PERMISSIONS, hasPermission } from "@/lib/permissions";

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
  days_left: number;
  notes: string;
  technician_notes: string;
  last_edited_by: string;
  last_edited_at: string;
  created_at: string;
}

const STATUS_STYLE: Record<string, { badge: string; dot: string; label: string; accent: string; glow: string }> = {
  ACTIVE: {
    badge: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    dot: "bg-emerald-500",
    label: "Aktif",
    accent: "border-l-emerald-400",
    glow: "shadow-emerald-100",
  },
  EXPIRING_SOON: {
    badge: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    dot: "bg-amber-400",
    label: "Segera Berakhir",
    accent: "border-l-amber-400",
    glow: "shadow-amber-100",
  },
  EXPIRED: {
    badge: "bg-red-50 text-red-600 ring-1 ring-red-200",
    dot: "bg-red-400",
    label: "Kadaluarsa",
    accent: "border-l-red-400",
    glow: "shadow-red-100",
  },
  VOID: {
    badge: "bg-gray-100 text-gray-500 ring-1 ring-gray-200",
    dot: "bg-gray-400",
    label: "Dibatalkan",
    accent: "border-l-gray-300",
    glow: "shadow-gray-100",
  },
};

function AlertModal({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center animate-scaleIn">
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-gray-700 text-sm font-medium mb-4">{message}</p>
        <button onClick={onClose}
          className="w-full h-10 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-all">
          OK
        </button>
      </div>
    </div>
  );
}

const fmt = (d: string) =>
  new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

const fmtShort = (d: string) =>
  new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short" });

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gray-200" />
          <div className="space-y-1.5">
            <div className="h-3.5 bg-gray-200 rounded w-32" />
            <div className="h-3 bg-gray-200 rounded w-48" />
          </div>
        </div>
        <div className="h-6 bg-gray-200 rounded-full w-20" />
      </div>
      <div className="flex gap-4 mt-3 pt-3 border-t border-gray-100">
        <div className="h-3 bg-gray-200 rounded w-24" />
        <div className="h-3 bg-gray-200 rounded w-28" />
        <div className="h-3 bg-gray-200 rounded w-16" />
      </div>
    </div>
  );
}

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
    fetch("/api/auth/me")
      .then(r => r.json())
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
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gray-900 rounded-xl flex items-center justify-center shadow-lg shadow-gray-900/20">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 leading-tight">Garansi</h1>
              <p className="text-xs text-gray-400">Warranty Management</p>
            </div>
          </div>
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              showArchived
                ? "bg-gray-900 text-white shadow-md"
                : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" />
            </svg>
            {showArchived ? "Sembunyikan Arsip" : "Arsip"}
          </button>
        </div>

        {/* ── Stats Row ── */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Aktif", value: stats.active, color: "text-emerald-600", bg: "bg-emerald-50", dot: "bg-emerald-500" },
            { label: "Berakhir", value: stats.expiringSoon, color: "text-amber-600", bg: "bg-amber-50", dot: "bg-amber-400" },
            { label: "Expired", value: stats.expired, color: "text-red-600", bg: "bg-red-50", dot: "bg-red-400" },
            { label: "Void", value: stats.void, color: "text-gray-500", bg: "bg-gray-50", dot: "bg-gray-400" },
          ].map((s) => (
            <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center border border-white/80`}>
              <div className={`text-xl font-black ${s.color}`}>{s.value}</div>
              <div className="text-[10px] text-gray-500 font-medium mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Search + Filter ── */}
        <div className="space-y-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Cari SN, customer, invoice, laptop..."
              className="w-full border border-gray-200 rounded-xl h-10 pl-9 pr-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-all"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>

          {/* Filter pills */}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
            {FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setFilterStatus(f.value)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  filterStatus === f.value
                    ? "bg-gray-900 text-white shadow-md"
                    : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"
                }`}
              >
                {f.label}
                <span className={`tabular-nums text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
                  filterStatus === f.value ? "bg-white/20 text-white" : "bg-gray-100 text-gray-400"
                }`}>
                  {f.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ── List ── */}
        <div className="space-y-2">
          {isLoading ? (
            Array(4).fill(0).map((_, i) => <SkeletonCard key={i} />)
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <div className="text-4xl mb-3">🛡️</div>
              <p className="text-gray-600 font-semibold text-sm">Tidak ada data garansi</p>
              <p className="text-gray-400 text-xs mt-1">
                {search || filterStatus !== "ALL"
                  ? "Coba ubah filter atau pencarian"
                  : "Garansi dibuat otomatis setelah transaksi"}
              </p>
            </div>
          ) : (
            filtered.map((w, idx) => (
              <WarrantyCard key={w.id} warranty={w} canEdit={canEdit} onEdit={() => openEdit(w)} index={idx} />
            ))
          )}
        </div>
      </div>

      {/* ── Edit Modal ── */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditTarget(null)} />
          <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden animate-slideUp">
            
            {/* Modal Header */}
            <div className="bg-gray-900 px-5 py-4 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-white text-sm">Edit Garansi</h2>
                  <p className="text-xs text-gray-400 mt-0.5 font-mono">{editTarget.serial_number}</p>
                </div>
                <button onClick={() => setEditTarget(null)}
                  className="w-7 h-7 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-all">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto flex-1 px-5 py-4">
              <form onSubmit={handleEdit} className="space-y-4">

                {/* Info */}
                <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-100 space-y-2 text-xs">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Info Transaksi</p>
                  {[
                    { label: "Customer", value: editTarget.customer_name },
                    { label: "Laptop", value: editTarget.laptop_name },
                    { label: "Invoice", value: editTarget.invoice_number, mono: true },
                    { label: "Mulai", value: fmt(editTarget.warranty_start) },
                  ].map(row => (
                    <div key={row.label} className="flex justify-between items-center">
                      <span className="text-gray-400">{row.label}</span>
                      <span className={`font-semibold text-gray-700 text-right max-w-[60%] truncate ${row.mono ? "font-mono text-[11px]" : ""}`}>
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Status */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Status</label>
                  <select
                    value={editForm.status}
                    onChange={e => setEditForm(p => ({ ...p, status: e.target.value }))}
                    className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-all cursor-pointer"
                  >
                    <option value="ACTIVE">✅ Aktif</option>
                    <option value="EXPIRING_SOON">⚠️ Segera Berakhir</option>
                    <option value="EXPIRED">❌ Kadaluarsa</option>
                    <option value="VOID">🚫 Dibatalkan</option>
                  </select>
                </div>

                {/* Tanggal Akhir */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Tanggal Akhir Garansi</label>
                  <input
                    type="date"
                    value={editForm.warranty_end}
                    onChange={e => setEditForm(p => ({ ...p, warranty_end: e.target.value }))}
                    className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-all"
                    required
                  />
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className="text-[10px] text-gray-400">Perpanjang:</span>
                    {[7, 14, 30, 90].map(d => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => extendWarranty(d)}
                        className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-md text-[11px] font-semibold transition-all hover:scale-105"
                      >
                        +{d}h
                      </button>
                    ))}
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Catatan Garansi</label>
                  <textarea
                    value={editForm.notes}
                    onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))}
                    rows={2}
                    placeholder="Catatan untuk customer..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-all resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Catatan Teknisi (internal)</label>
                  <textarea
                    value={editForm.technician_notes}
                    onChange={e => setEditForm(p => ({ ...p, technician_notes: e.target.value }))}
                    rows={2}
                    placeholder="Catatan internal teknisi..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-all resize-none"
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-3 border-t border-gray-100">
                  <button type="button" onClick={() => setEditTarget(null)}
                    className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-all">
                    Batal
                  </button>
                  <button type="submit" disabled={editLoading}
                    className="flex-1 h-10 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-all disabled:opacity-50 shadow-md">
                    {editLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Menyimpan...
                      </span>
                    ) : "Simpan"}
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
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-scaleIn { animation: scaleIn 0.2s ease-out; }
        .animate-slideUp { animation: slideUp 0.25s ease-out; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
      `}</style>
    </DashboardLayout>
  );
}

// ─── Warranty Card ──────────────────────────────────────────────────────────
function WarrantyCard({
  warranty: w, canEdit, onEdit, index,
}: {
  warranty: Warranty; canEdit: boolean; onEdit: () => void; index?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const s = STATUS_STYLE[w.computed_status] || STATUS_STYLE.VOID;

  const daysDisplay = () => {
    if (w.computed_status === "VOID") return <span className="text-xs font-semibold text-gray-400">Void</span>;
    if (w.computed_status === "EXPIRED") return <span className="text-xs font-bold text-red-500">Expired</span>;
    return (
      <div className="text-right">
        <span className={`text-lg font-black tabular-nums ${w.days_left <= 7 ? "text-amber-500" : "text-emerald-600"}`}>
          {w.days_left}
        </span>
        <span className="text-[10px] text-gray-400 ml-0.5">hr</span>
      </div>
    );
  };

  return (
    <div
      className={`group bg-white rounded-2xl border border-gray-100 border-l-4 ${s.accent} shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden`}
      style={{ animationDelay: `${(index || 0) * 30}ms` }}
    >
      {/* Main Row */}
      <div className="px-4 py-3 flex items-center gap-3">
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-gray-900 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
          {w.customer_name.charAt(0).toUpperCase()}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-900 text-sm truncate">{w.customer_name}</span>
            <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0 ${s.badge}`}>
              <span className={`w-1 h-1 rounded-full ${s.dot}`} />
              {s.label}
            </span>
          </div>
          <p className="text-xs text-gray-400 truncate mt-0.5">{w.laptop_name}</p>
          <p className="text-[11px] text-gray-300 font-mono mt-0.5 truncate">{w.serial_number}</p>
        </div>

        {/* Days left */}
        <div className="flex-shrink-0 flex items-center gap-2">
          {daysDisplay()}
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-50 transition-all"
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

      {/* Meta Row */}
      <div className="px-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-3 text-[11px] text-gray-400">
          <span>{fmtShort(w.warranty_start)} – {fmtShort(w.warranty_end)}</span>
          {w.customer_phone && (
            <>
              <span className="text-gray-200">·</span>
              <span>{w.customer_phone}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <a href={`/receipt/${w.invoice_number}`}
            className="text-[11px] text-gray-400 hover:text-gray-700 font-semibold transition-colors">
            Receipt ↗
          </a>
          {canEdit && (
            <button onClick={onEdit}
              className="text-[11px] text-blue-500 hover:text-blue-700 font-semibold transition-colors flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Expanded Detail */}
      {expanded && (
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/60 space-y-2.5 animate-expandDown">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-white rounded-xl px-3 py-2 border border-gray-100">
              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-0.5">Invoice</p>
              <p className="font-mono text-gray-700 text-[11px]">{w.invoice_number}</p>
            </div>
            <div className="bg-white rounded-xl px-3 py-2 border border-gray-100">
              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-0.5">Durasi</p>
              <p className="font-semibold text-gray-700">{w.warranty_duration} hari</p>
            </div>
          </div>

          {w.last_edited_by && (
            <p className="text-[11px] text-gray-400">
              Diedit oleh <span className="font-semibold text-gray-600">{w.last_edited_by}</span>
              {w.last_edited_at && <> · {fmt(w.last_edited_at)}</>}
            </p>
          )}

          {w.notes && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-xs">
              <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wide mb-0.5">Catatan Garansi</p>
              <p className="text-blue-800">{w.notes}</p>
            </div>
          )}

          {w.technician_notes && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 text-xs">
              <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wide mb-0.5">Catatan Teknisi</p>
              <p className="text-amber-800">{w.technician_notes}</p>
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        @keyframes expandDown {
          from { opacity: 0; max-height: 0; }
          to { opacity: 1; max-height: 400px; }
        }
        .animate-expandDown { animation: expandDown 0.25s ease-out; }
      `}</style>
    </div>
  );
}