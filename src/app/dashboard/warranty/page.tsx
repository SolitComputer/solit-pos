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

// ─── Status styles ────────────────────────────────────────────────────────────
const STATUS_STYLE: Record<string, { badge: string; dot: string; label: string; bg: string }> = {
  ACTIVE: {
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot:   "bg-emerald-500",
    label: "Aktif",
    bg:    "border-l-emerald-500",
  },
  EXPIRING_SOON: {
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    dot:   "bg-amber-400",
    label: "Segera Berakhir",
    bg:    "border-l-amber-400",
  },
  EXPIRED: {
    badge: "bg-red-50 text-red-600 border-red-200",
    dot:   "bg-red-500",
    label: "Kadaluarsa",
    bg:    "border-l-red-400",
  },
  VOID: {
    badge: "bg-gray-100 text-gray-500 border-gray-200",
    dot:   "bg-gray-400",
    label: "Dibatalkan",
    bg:    "border-l-gray-300",
  },
};

const fmt = (d: string) =>
  new Date(d).toLocaleDateString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
  });

export default function WarrantyPage() {
  const [warranties, setWarranties]     = useState<Warranty[]>([]);
  const [isLoading, setIsLoading]       = useState(true);
  const [userRole, setUserRole]         = useState<UserRole | null>(null);
  const [search, setSearch]             = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [showArchived, setShowArchived] = useState(false);
  const [editTarget, setEditTarget]     = useState<Warranty | null>(null);
  const [editLoading, setEditLoading]   = useState(false);
  const [editForm, setEditForm] = useState({
    warranty_end: "", notes: "", technician_notes: "", status: "",
  });

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
    active:       warranties.filter(w => w.computed_status === "ACTIVE").length,
    expiringSoon: warranties.filter(w => w.computed_status === "EXPIRING_SOON").length,
    expired:      warranties.filter(w => w.computed_status === "EXPIRED").length,
    void:         warranties.filter(w => w.computed_status === "VOID").length,
  }), [warranties]);

  const openEdit = (w: Warranty) => {
    setEditTarget(w);
    setEditForm({
      warranty_end:      w.warranty_end,
      notes:             w.notes || "",
      technician_notes:  w.technician_notes || "",
      status:            w.computed_status,
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
      if (!result.success) { alert(result.message); return; }
      setEditTarget(null);
      fetchWarranties();
    } catch { alert("Terjadi kesalahan"); }
    finally { setEditLoading(false); }
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
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 bg-[#1a1a2e] rounded-lg flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-[#1a1a2e] tracking-tight">Garansi</h1>
            </div>
            <p className="text-gray-400 text-sm ml-9">Kelola data garansi laptop customer</p>
          </div>
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition ${
              showArchived
                ? "bg-gray-800 text-white border-gray-800"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="21 8 21 21 3 21 3 8" />
              <rect x="1" y="3" width="22" height="5" />
              <line x1="10" y1="12" x2="14" y2="12" />
            </svg>
            {showArchived ? "Sembunyikan Arsip" : "Tampilkan Arsip"}
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Aktif",          value: stats.active,       color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-100" },
            { label: "Segera Berakhir", value: stats.expiringSoon, color: "text-amber-600",  bg: "bg-amber-50",  border: "border-amber-100" },
            { label: "Kadaluarsa",     value: stats.expired,      color: "text-red-600",     bg: "bg-red-50",    border: "border-red-100" },
            { label: "Dibatalkan",     value: stats.void,         color: "text-gray-500",    bg: "bg-gray-50",   border: "border-gray-100" },
          ].map(s => (
            <div key={s.label} className={`bg-white rounded-2xl border ${s.border} shadow-sm p-4`}>
              <p className="text-xs text-gray-400">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Search + Filter */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Cari SN, customer, invoice, laptop..."
                className="w-full border border-gray-200 rounded-xl h-10 pl-9 pr-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/10 focus:border-[#1a1a2e] transition"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
          {/* Filter tabs */}
          <div className="flex flex-wrap gap-2">
            {[
              { value: "ALL",           label: "Semua",           count: warranties.length },
              { value: "ACTIVE",        label: "Aktif",           count: stats.active },
              { value: "EXPIRING_SOON", label: "Segera Berakhir", count: stats.expiringSoon },
              { value: "EXPIRED",       label: "Kadaluarsa",      count: stats.expired },
              { value: "VOID",          label: "Dibatalkan",      count: stats.void },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setFilterStatus(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                  filterStatus === opt.value
                    ? "bg-[#1a1a2e] text-white border-[#1a1a2e]"
                    : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                }`}
              >
                {opt.label}
                <span className={`ml-1.5 tabular-nums ${filterStatus === opt.value ? "text-gray-400" : "text-gray-300"}`}>
                  {opt.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="space-y-2.5">
          {isLoading ? (
            Array(4).fill(0).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse space-y-3">
                <div className="flex justify-between">
                  <div className="h-4 bg-gray-100 rounded w-40" />
                  <div className="h-5 bg-gray-100 rounded-full w-20" />
                </div>
                <div className="h-3 bg-gray-100 rounded w-full" />
                <div className="h-3 bg-gray-100 rounded w-3/4" />
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <div className="text-4xl mb-3">🛡️</div>
              <p className="text-gray-500 font-medium">Tidak ada data garansi</p>
              <p className="text-gray-400 text-sm mt-1">Garansi akan otomatis dibuat setelah transaksi berhasil</p>
            </div>
          ) : (
            filtered.map(w => (
              <WarrantyCard
                key={w.id}
                warranty={w}
                canEdit={canEdit}
                onEdit={() => openEdit(w)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Edit Modal ── */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEditTarget(null)} />
          <div className="relative bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <div>
                <h2 className="font-semibold text-gray-800 text-base">Edit Garansi</h2>
                <p className="text-xs text-gray-400 mt-0.5 font-mono">{editTarget.serial_number}</p>
              </div>
              <button onClick={() => setEditTarget(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-5 py-5">
              <form onSubmit={handleEdit} className="space-y-4">

                {/* Info transaksi */}
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Customer</span>
                    <span className="font-semibold text-gray-700">{editTarget.customer_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Laptop</span>
                    <span className="text-gray-700 text-right max-w-[60%] truncate">{editTarget.laptop_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Invoice</span>
                    <span className="font-mono text-gray-600">{editTarget.invoice_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Mulai Garansi</span>
                    <span className="text-gray-700">{fmt(editTarget.warranty_start)}</span>
                  </div>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Status</label>
                  <select
                    value={editForm.status}
                    onChange={e => setEditForm(p => ({ ...p, status: e.target.value }))}
                    className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/10 focus:border-[#1a1a2e] transition"
                  >
                    <option value="ACTIVE">Aktif</option>
                    <option value="EXPIRING_SOON">Segera Berakhir</option>
                    <option value="EXPIRED">Kadaluarsa</option>
                    <option value="VOID">Dibatalkan</option>
                  </select>
                </div>

                {/* Tanggal akhir */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">
                    Tanggal Akhir Garansi
                  </label>
                  <input
                    type="date"
                    value={editForm.warranty_end}
                    onChange={e => setEditForm(p => ({ ...p, warranty_end: e.target.value }))}
                    className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/10 focus:border-[#1a1a2e] transition"
                    required
                  />
                  {/* Quick extend */}
                  <div className="flex gap-2 mt-2">
                    <span className="text-xs text-gray-400 self-center">Perpanjang:</span>
                    {[7, 14, 30, 90].map(d => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => extendWarranty(d)}
                        className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-xs font-medium transition"
                      >
                        +{d}h
                      </button>
                    ))}
                  </div>
                </div>

                {/* Catatan */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Catatan Garansi</label>
                  <textarea
                    value={editForm.notes}
                    onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))}
                    rows={2}
                    placeholder="Catatan untuk customer..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/10 focus:border-[#1a1a2e] transition resize-none"
                  />
                </div>

                {/* Catatan teknisi */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Catatan Teknisi (internal)</label>
                  <textarea
                    value={editForm.technician_notes}
                    onChange={e => setEditForm(p => ({ ...p, technician_notes: e.target.value }))}
                    rows={2}
                    placeholder="Catatan internal teknisi..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/10 focus:border-[#1a1a2e] transition resize-none"
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setEditTarget(null)}
                    className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition">
                    Batal
                  </button>
                  <button type="submit" disabled={editLoading}
                    className="flex-1 h-10 bg-[#1a1a2e] text-white rounded-xl text-sm font-medium hover:bg-[#16213e] transition disabled:opacity-50">
                    {editLoading ? "Menyimpan..." : "Simpan Perubahan"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

// ─── Warranty Card ────────────────────────────────────────────────────────────
function WarrantyCard({
  warranty: w, canEdit, onEdit,
}: {
  warranty: Warranty; canEdit: boolean; onEdit: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const s = STATUS_STYLE[w.computed_status] || STATUS_STYLE.VOID;

  return (
    <div className={`bg-white rounded-2xl border border-gray-100 border-l-4 ${s.bg} shadow-sm hover:shadow-md transition-shadow overflow-hidden`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-gray-800 text-sm">{w.customer_name}</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold flex-shrink-0 inline-flex items-center gap-1.5 ${s.badge}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                {s.label}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{w.laptop_name}</p>
            <p className="text-xs text-gray-400 mt-0.5 font-mono">{w.serial_number}</p>
          </div>

          {/* Sisa hari */}
          <div className="text-right flex-shrink-0">
            {w.computed_status === "EXPIRED" ? (
              <p className="text-sm font-bold text-red-500">Kadaluarsa</p>
            ) : w.computed_status === "VOID" ? (
              <p className="text-sm font-bold text-gray-400">Dibatalkan</p>
            ) : (
              <>
                <p className={`text-xl font-extrabold ${w.days_left <= 7 ? "text-amber-500" : "text-emerald-600"}`}>
                  {w.days_left}
                </p>
                <p className="text-xs text-gray-400">hari lagi</p>
              </>
            )}
          </div>
        </div>

        {/* Info baris */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-xs text-gray-500">
          <span>{w.customer_phone || "—"}</span>
          <span className="text-gray-200">·</span>
          <span>Mulai: {fmt(w.warranty_start)}</span>
          <span className="text-gray-200">·</span>
          <span>Berakhir: {fmt(w.warranty_end)}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition"
          >
            {expanded ? "Sembunyikan" : "Detail"}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={`transition-transform ${expanded ? "rotate-180" : ""}`}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <a href={`/receipt/${w.invoice_number}`}
            className="text-xs font-semibold text-gray-500 hover:text-gray-800 transition flex items-center gap-1">
            Receipt
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </a>
          {canEdit && (
            <button onClick={onEdit}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition flex items-center gap-1">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 py-3 border-t border-gray-100 bg-white space-y-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <div><span className="text-gray-400">Invoice:</span> <span className="font-mono text-gray-700">{w.invoice_number}</span></div>
            <div><span className="text-gray-400">Durasi:</span> <span className="text-gray-700">{w.warranty_duration} hari</span></div>
            {w.last_edited_by && (
              <div className="col-span-2">
                <span className="text-gray-400">Terakhir diedit:</span>{" "}
                <span className="text-gray-700">{w.last_edited_by} — {w.last_edited_at ? fmt(w.last_edited_at) : "—"}</span>
              </div>
            )}
          </div>
          {w.notes && (
            <div className="bg-blue-50 rounded-xl px-3 py-2 text-xs text-blue-700">
              <span className="font-semibold">Catatan: </span>{w.notes}
            </div>
          )}
          {w.technician_notes && (
            <div className="bg-amber-50 rounded-xl px-3 py-2 text-xs text-amber-700">
              <span className="font-semibold">Teknisi: </span>{w.technician_notes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}