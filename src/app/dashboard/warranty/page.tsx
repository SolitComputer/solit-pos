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

// ─── Status styles with enhanced icons ────────────────────────────────────────
const STATUS_STYLE: Record<string, { badge: string; dot: string; label: string; bg: string; icon: string }> = {
  ACTIVE: {
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
    label: "Aktif",
    bg: "border-l-emerald-500",
    icon: "✅",
  },
  EXPIRING_SOON: {
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-400",
    label: "Segera Berakhir",
    bg: "border-l-amber-400",
    icon: "⚠️",
  },
  EXPIRED: {
    badge: "bg-red-50 text-red-600 border-red-200",
    dot: "bg-red-500",
    label: "Kadaluarsa",
    bg: "border-l-red-400",
    icon: "❌",
  },
  VOID: {
    badge: "bg-gray-100 text-gray-500 border-gray-200",
    dot: "bg-gray-400",
    label: "Dibatalkan",
    bg: "border-l-gray-300",
    icon: "🚫",
  },
};

function AlertModal({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fadeIn">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center animate-scaleIn">
        <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-gray-700 text-sm font-medium mb-5">{message}</p>
        <button
          onClick={onClose}
          className="w-full h-11 bg-gray-800 text-white rounded-xl text-sm font-semibold hover:bg-gray-900 transition-all duration-200 shadow-md"
        >
          OK
        </button>
      </div>
    </div>
  );
}

const fmt = (d: string) =>
  new Date(d).toLocaleDateString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
  });

// Loading Skeleton Component
function WarrantySkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse space-y-3">
      <div className="flex justify-between">
        <div className="space-y-2 flex-1">
          <div className="h-4 bg-gray-200 rounded w-40" />
          <div className="h-3 bg-gray-200 rounded w-56" />
          <div className="h-3 bg-gray-200 rounded w-32" />
        </div>
        <div className="h-8 bg-gray-200 rounded-full w-20" />
      </div>
      <div className="flex gap-2">
        <div className="h-3 bg-gray-200 rounded w-24" />
        <div className="h-3 bg-gray-200 rounded w-28" />
      </div>
    </div>
  );
}

// Stat Card Component
function StatCard({ label, value, icon, color, bg, border }: any) {
  return (
    <div className={`bg-white rounded-2xl border ${border} shadow-sm hover:shadow-md transition-all duration-300 p-4 relative overflow-hidden group`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">{label}</p>
          <p className={`text-2xl font-extrabold mt-1 ${color} group-hover:scale-105 transition-transform origin-left`}>
            {value}
          </p>
        </div>
        <div className={`text-2xl opacity-60 group-hover:opacity-100 transition-opacity`}>
          {icon}
        </div>
      </div>
      <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${bg} opacity-60 group-hover:opacity-100 transition-opacity`} />
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
  const [editForm, setEditForm] = useState({
    warranty_end: "", notes: "", technician_notes: "", status: "",
  });
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
    if (filterStatus !== "ALL") {
      list = list.filter(w => w.computed_status === filterStatus);
    }
    return list;
  }, [warranties, search, filterStatus]);

  // Stats
  const stats = useMemo(() => ({
    active: warranties.filter(w => w.computed_status === "ACTIVE").length,
    expiringSoon: warranties.filter(w => w.computed_status === "EXPIRING_SOON").length,
    expired: warranties.filter(w => w.computed_status === "EXPIRED").length,
    void: warranties.filter(w => w.computed_status === "VOID").length,
  }), [warranties]);

  const openEdit = (w: Warranty) => {
    setEditTarget(w);
    setEditForm({
      warranty_end: w.warranty_end,
      notes: w.notes || "",
      technician_notes: w.technician_notes || "",
      status: w.computed_status,
    });
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
      if (!result.success) {
        setAlertModal(result.message);
        return;
      }
      setEditTarget(null);
      fetchWarranties();
    } catch {
      setAlertModal("Terjadi kesalahan");
    } finally {
      setEditLoading(false);
    }
  };

  // Perpanjang garansi
  const extendWarranty = (days: number) => {
    const current = new Date(editForm.warranty_end);
    current.setDate(current.getDate() + days);
    setEditForm(prev => ({
      ...prev,
      warranty_end: current.toISOString().split("T")[0],
    }));
  };

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">

        {/* Header dengan animasi */}
        <div className="flex flex-wrap items-end justify-between gap-3 animate-slideIn">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1 h-7 bg-gray-300 rounded-full" />
              <div className="w-7 h-7 bg-gray-800 rounded-lg flex items-center justify-center shadow-sm">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-gray-800">
                Garansi
              </h1>
            </div>
            <p className="text-sm text-gray-400 ml-10">
              Kelola data garansi laptop customer — <span className="text-gray-600 font-medium">Warranty Management</span>
            </p>
          </div>
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all duration-200 group ${
              showArchived
                ? "bg-gray-800 text-white border-gray-800 shadow-md"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300"
            }`}
          >
            <svg className="w-4 h-4 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <polyline points="21 8 21 21 3 21 3 8" />
              <rect x="1" y="3" width="22" height="5" />
              <line x1="10" y1="12" x2="14" y2="12" />
            </svg>
            {showArchived ? "Sembunyikan Arsip" : "Tampilkan Arsip"}
          </button>
        </div>

        {/* Stats Cards dengan desain modern */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-fadeUp" style={{ animationDelay: "0.05s" }}>
          <StatCard 
            label="Aktif" 
            value={stats.active} 
            icon="✅" 
            color="text-emerald-600" 
            bg="bg-emerald-500"
            border="border-emerald-100"
          />
          <StatCard 
            label="Segera Berakhir" 
            value={stats.expiringSoon} 
            icon="⚠️" 
            color="text-amber-600" 
            bg="bg-amber-500"
            border="border-amber-100"
          />
          <StatCard 
            label="Kadaluarsa" 
            value={stats.expired} 
            icon="❌" 
            color="text-red-600" 
            bg="bg-red-500"
            border="border-red-100"
          />
          <StatCard 
            label="Dibatalkan" 
            value={stats.void} 
            icon="🚫" 
            color="text-gray-500" 
            bg="bg-gray-500"
            border="border-gray-100"
          />
        </div>

        {/* Search + Filter dengan desain premium */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 p-5 space-y-4">
          <div className="relative group">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-gray-600 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Cari berdasarkan SN, customer, invoice, atau laptop..."
              className="w-full border border-gray-200 rounded-xl h-11 pl-9 pr-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all duration-200"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          
          {/* Filter tabs dengan desain modern */}
          <div className="flex flex-wrap gap-2 pt-2">
            {[
              { value: "ALL", label: "Semua", count: warranties.length, icon: "📋" },
              { value: "ACTIVE", label: "Aktif", count: stats.active, icon: "✅" },
              { value: "EXPIRING_SOON", label: "Segera Berakhir", count: stats.expiringSoon, icon: "⚠️" },
              { value: "EXPIRED", label: "Kadaluarsa", count: stats.expired, icon: "❌" },
              { value: "VOID", label: "Dibatalkan", count: stats.void, icon: "🚫" },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setFilterStatus(opt.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                  filterStatus === opt.value
                    ? "bg-gray-800 text-white shadow-md transform scale-105"
                    : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 hover:border-gray-300"
                }`}
              >
                <span>{opt.icon}</span>
                <span>{opt.label}</span>
                <span className={`ml-1 tabular-nums px-1.5 py-0.5 rounded-full text-[10px] ${
                  filterStatus === opt.value 
                    ? "bg-white/20 text-white" 
                    : "bg-gray-100 text-gray-500"
                }`}>
                  {opt.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* List Garansi */}
        <div className="space-y-3">
          {isLoading ? (
            Array(4).fill(0).map((_, i) => <WarrantySkeleton key={i} />)
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center animate-fadeIn">
              <div className="text-6xl mb-4 animate-bounce">🛡️</div>
              <p className="text-gray-500 font-semibold text-base">Tidak ada data garansi</p>
              <p className="text-gray-400 text-sm mt-2">
                {search || filterStatus !== "ALL" 
                  ? "Coba ubah filter atau kata pencarian" 
                  : "Garansi akan otomatis dibuat setelah transaksi berhasil"}
              </p>
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

      {/* ── Edit Modal dengan desain premium ── */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditTarget(null)} />
          <div className="relative bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden animate-slideUp">
            {/* Header dengan warna abu-abu */}
            <div className="bg-gray-800 px-5 py-4 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-white text-base">Edit Garansi</h2>
                  <p className="text-xs text-gray-300 mt-0.5 font-mono">{editTarget.serial_number}</p>
                </div>
                <button onClick={() => setEditTarget(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/20 transition-all duration-200">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-5 py-5 space-y-4">
              <form onSubmit={handleEdit} className="space-y-5">

                {/* Info transaksi dengan desain lebih baik */}
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Informasi Transaksi</p>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Customer</span>
                      <span className="font-semibold text-gray-700">{editTarget.customer_name}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Laptop</span>
                      <span className="text-gray-700 text-right max-w-[60%] truncate font-medium">{editTarget.laptop_name}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Invoice</span>
                      <span className="font-mono text-gray-600 text-[11px]">{editTarget.invoice_number}</span>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t border-gray-100">
                      <span className="text-gray-400">Mulai Garansi</span>
                      <span className="text-gray-700 font-semibold">{fmt(editTarget.warranty_start)}</span>
                    </div>
                  </div>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-1">
                    <span>📊</span> Status
                  </label>
                  <select
                    value={editForm.status}
                    onChange={e => setEditForm(p => ({ ...p, status: e.target.value }))}
                    className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all duration-200 cursor-pointer"
                  >
                    <option value="ACTIVE">✅ Aktif</option>
                    <option value="EXPIRING_SOON">⚠️ Segera Berakhir</option>
                    <option value="EXPIRED">❌ Kadaluarsa</option>
                    <option value="VOID">🚫 Dibatalkan</option>
                  </select>
                </div>

                {/* Tanggal akhir */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-1">
                    <span>📅</span> Tanggal Akhir Garansi
                  </label>
                  <input
                    type="date"
                    value={editForm.warranty_end}
                    onChange={e => setEditForm(p => ({ ...p, warranty_end: e.target.value }))}
                    className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all duration-200"
                    required
                  />
                  {/* Quick extend buttons */}
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="text-[11px] text-gray-400">Perpanjang:</span>
                    {[7, 14, 30, 90].map(d => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => extendWarranty(d)}
                        className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-[11px] font-medium transition-all duration-200 hover:scale-105"
                      >
                        +{d} hari
                      </button>
                    ))}
                  </div>
                </div>

                {/* Catatan Garansi */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-1">
                    <span>📝</span> Catatan Garansi
                  </label>
                  <textarea
                    value={editForm.notes}
                    onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))}
                    rows={2}
                    placeholder="Catatan untuk customer..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all duration-200 resize-none"
                  />
                </div>

                {/* Catatan teknisi */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-1">
                    <span>🔧</span> Catatan Teknisi (internal)
                  </label>
                  <textarea
                    value={editForm.technician_notes}
                    onChange={e => setEditForm(p => ({ ...p, technician_notes: e.target.value }))}
                    rows={2}
                    placeholder="Catatan internal teknisi..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all duration-200 resize-none"
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4 border-t border-gray-100">
                  <button type="button" onClick={() => setEditTarget(null)}
                    className="flex-1 h-11 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-all duration-200">
                    Batal
                  </button>
                  <button type="submit" disabled={editLoading}
                    className="flex-1 h-11 bg-gray-800 text-white rounded-xl text-sm font-medium hover:bg-gray-900 transition-all duration-200 disabled:opacity-50 shadow-md">
                    {editLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
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
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-30px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(15px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
        .animate-scaleIn { animation: scaleIn 0.25s ease-out; }
        .animate-slideIn { animation: slideIn 0.4s ease-out; }
        .animate-fadeUp { animation: fadeUp 0.4s ease-out; }
        .animate-slideUp { animation: slideUp 0.3s ease-out; }
        .animate-bounce { animation: bounce 1s ease-in-out infinite; }
      `}</style>
    </DashboardLayout>
  );
}

// ─── Warranty Card yang ditingkatkan ─────────────────────────────────────────
function WarrantyCard({
  warranty: w, canEdit, onEdit, index,
}: {
  warranty: Warranty; canEdit: boolean; onEdit: () => void; index?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const s = STATUS_STYLE[w.computed_status] || STATUS_STYLE.VOID;
  const progressPercent = w.computed_status === "ACTIVE" && w.warranty_duration > 0
    ? ((w.warranty_duration - w.days_left) / w.warranty_duration) * 100
    : 0;

  return (
    <div className={`group bg-white rounded-2xl border border-gray-100 border-l-4 ${s.bg} shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden animate-fadeUp`} style={{ animationDelay: `${(index || 0) * 50}ms` }}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Avatar sederhana */}
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 text-xs font-bold">
                {w.customer_name.charAt(0).toUpperCase()}
              </div>
              <h2 className="font-bold text-gray-800 text-sm group-hover:text-gray-600 transition-colors">
                {w.customer_name}
              </h2>
              <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border font-semibold ${s.badge}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${s.dot} animate-pulse`} />
                <span>{s.icon}</span>
                {s.label}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1.5 truncate">{w.laptop_name}</p>
            <div className="flex items-center gap-2 mt-1">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <p className="text-[11px] text-gray-400 font-mono">{w.serial_number}</p>
            </div>
          </div>

          {/* Sisa hari dengan visual progress */}
          <div className="text-right flex-shrink-0">
            {w.computed_status === "EXPIRED" ? (
              <div className="flex flex-col items-end">
                <div className="text-sm font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">Kadaluarsa</div>
              </div>
            ) : w.computed_status === "VOID" ? (
              <div className="text-sm font-bold text-gray-400">Dibatalkan</div>
            ) : (
              <>
                <p className={`text-2xl font-extrabold ${w.days_left <= 7 ? "text-amber-500" : "text-emerald-600"}`}>
                  {w.days_left}
                </p>
                <p className="text-[11px] text-gray-400">hari lagi</p>
                {/* Progress bar */}
                {w.computed_status === "ACTIVE" && w.warranty_duration > 0 && (
                  <div className="mt-2 w-20 h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all duration-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Info baris dengan icon */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-4 pt-3 border-t border-gray-100 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 5h18M5 5v14a2 2 0 002 2h10a2 2 0 002-2V5" />
            </svg>
            <span>{w.customer_phone || "—"}</span>
          </div>
          <span className="text-gray-200">•</span>
          <div className="flex items-center gap-1">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>Mulai: {fmt(w.warranty_start)}</span>
          </div>
          <span className="text-gray-200">•</span>
          <div className="flex items-center gap-1">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>Berakhir: {fmt(w.warranty_end)}</span>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-all duration-200 group/btn"
        >
          <svg className="w-3.5 h-3.5 group-hover/btn:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <polyline points="6 9 12 15 18 9" />
          </svg>
          {expanded ? "Sembunyikan Detail" : "Lihat Detail"}
        </button>
        
        <div className="flex items-center gap-3">
          <a href={`/receipt/${w.invoice_number}`}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-800 transition-all duration-200 group/btn">
            Receipt
            <svg className="w-3.5 h-3.5 group-hover/btn:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </a>
          {canEdit && (
            <button onClick={onEdit}
              className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-all duration-200 group/btn">
              <svg className="w-3.5 h-3.5 group-hover/btn:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Expanded detail dengan animasi */}
      {expanded && (
        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/30 animate-slideDown">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div className="flex items-start gap-2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400 mt-0.5">
                <rect x="2" y="4" width="20" height="16" rx="2" />
              </svg>
              <div>
                <span className="text-gray-400 text-[10px] uppercase tracking-wide">Invoice</span>
                <p className="font-mono text-gray-700 text-[11px] mt-0.5">{w.invoice_number}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400 mt-0.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <div>
                <span className="text-gray-400 text-[10px] uppercase tracking-wide">Durasi</span>
                <p className="text-gray-700 font-medium mt-0.5">{w.warranty_duration} hari</p>
              </div>
            </div>
            {w.last_edited_by && (
              <div className="col-span-2 flex items-start gap-2 pt-1 border-t border-gray-100">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400 mt-0.5">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <div>
                  <span className="text-gray-400 text-[10px] uppercase tracking-wide">Terakhir diedit</span>
                  <p className="text-gray-700 text-[11px] mt-0.5">
                    {w.last_edited_by} — {w.last_edited_at ? fmt(w.last_edited_at) : "—"}
                  </p>
                </div>
              </div>
            )}
          </div>
          
          {w.notes && (
            <div className="mt-3 bg-blue-50/50 border border-blue-100 rounded-xl px-3 py-2.5 text-xs text-blue-800">
              <div className="flex items-center gap-1.5 mb-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
                <span className="font-semibold text-blue-700">Catatan Garansi</span>
              </div>
              <p className="text-blue-900">{w.notes}</p>
            </div>
          )}
          
          {w.technician_notes && (
            <div className="mt-3 bg-amber-50/50 border border-amber-100 rounded-xl px-3 py-2.5 text-xs text-amber-800">
              <div className="flex items-center gap-1.5 mb-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <span className="font-semibold text-amber-700">Catatan Teknisi</span>
              </div>
              <p className="text-amber-900">{w.technician_notes}</p>
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slideDown { animation: slideDown 0.3s ease-out; }
      `}</style>
    </div>
  );
}