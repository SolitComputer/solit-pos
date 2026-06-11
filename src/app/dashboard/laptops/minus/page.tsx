"use client";

import { useEffect, useState, useMemo } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { UserRole, PERMISSIONS, hasPermission } from "@/lib/permissions";

// ─── Types ────────────────────────────────────────────────────────────────────
interface MinusUnit {
  id: string;
  laptop_id: string;
  serial_number: string;
  grade: string;
  condition_note: string;
  purchase_price: number;
  selling_price: number;
  status: string;
  notes: string;
  repair_status: string | null;
  repair_notes: string | null;
  created_at: string;
  laptop?: {
    id: string;
    laptop_name: string;
    brand: string;
    cpu: string;
    ram: string;
    storage: string;
  };
}

// ─── Repair Status Config ─────────────────────────────────────────────────────
const REPAIR_STATUS: Record<string, { label: string; badge: string; dot: string; emoji: string }> = {
  WAITING_PARTS: { label: "Menunggu Sparepart", badge: "bg-gray-100 text-gray-700 border-gray-200", dot: "bg-gray-500", emoji: "🔄" },
  NOT_STARTED: { label: "Belum Terpegang", badge: "bg-gray-100 text-gray-600 border-gray-200", dot: "bg-gray-400", emoji: "⏸️" },
  GIVE_UP: { label: "Nyerah", badge: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-500", emoji: "🚫" },
  DEAD: { label: "Mati Total", badge: "bg-rose-50 text-rose-700 border-rose-200", dot: "bg-rose-500", emoji: "💀" },
  HARD_PARTS: { label: "Sparepart Susah", badge: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500", emoji: "🔍" },
  DONE: { label: "Selesai", badge: "bg-gray-100 text-gray-700 border-gray-200", dot: "bg-gray-500", emoji: "✅" },
  OTHER: { label: "Lain-lain", badge: "bg-gray-100 text-gray-700 border-gray-200", dot: "bg-gray-500", emoji: "📝" },
};

const UNIT_STATUS: Record<string, { label: string; badge: string }> = {
  SERVICE: { label: "Service", badge: "bg-red-50 text-red-700 border-red-200" },
  BELUM_SIAP: { label: "Belum Siap", badge: "bg-red-50 text-red-700 border-red-200" },
  SIAP_JUAL: { label: "Siap Jual", badge: "bg-red-50 text-red-700 border-red-200" },
};

const fmt = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");

// ─── Edit Repair Modal ────────────────────────────────────────────────────────
function EditRepairModal({
  unit,
  onClose,
  onSuccess,
}: {
  unit: MinusUnit;
  onClose: () => void;
  onSuccess: (updated: MinusUnit) => void;
}) {
  const [repairStatus, setRepairStatus] = useState(unit.repair_status || "NOT_STARTED");
  const [repairNotes, setRepairNotes] = useState(unit.repair_notes || "");
  const [unitStatus, setUnitStatus] = useState(unit.status);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // Jika DONE, otomatis suggest SIAP_JUAL
  useEffect(() => {
    if (repairStatus === "DONE") setUnitStatus("SIAP_JUAL");
    else if (repairStatus === "DEAD" || repairStatus === "GIVE_UP") setUnitStatus("SERVICE");
  }, [repairStatus]);

  const handleSave = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/laptops/minus", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unit_id: unit.id,
          repair_status: repairStatus,
          repair_notes: repairNotes.trim() || null,
          status: unitStatus,
        }),
      });
      const result = await res.json();
      if (!result.success) { setError(result.message || "Gagal"); return; }
      onSuccess({ ...unit, repair_status: repairStatus, repair_notes: repairNotes, status: unitStatus });
      onClose();
    } catch {
      setError("Terjadi kesalahan koneksi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden">

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-bold text-gray-800 text-base">Update Status Perbaikan</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              <span className="font-mono bg-gray-100 px-1.5 rounded text-gray-600">{unit.serial_number}</span>
              {" · "}{unit.laptop?.laptop_name}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* Status pilihan grid */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2.5">
              Status Perbaikan
            </label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(REPAIR_STATUS).map(([key, val]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setRepairStatus(key)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all ${repairStatus === key
                      ? `${val.badge} shadow-sm scale-[1.01]`
                      : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                >
                  <span className="text-base flex-shrink-0">{val.emoji}</span>
                  <div>
                    <p className="text-xs font-semibold leading-tight">{val.label}</p>
                  </div>
                  {repairStatus === key && (
                    <svg className="w-3.5 h-3.5 ml-auto flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Catatan perbaikan */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Catatan Perbaikan
              {repairStatus === "OTHER" && <span className="text-red-400 ml-1 normal-case font-normal">*wajib untuk lain-lain</span>}
            </label>
            <textarea
              value={repairNotes}
              onChange={e => setRepairNotes(e.target.value)}
              rows={3}
              placeholder={
                repairStatus === "OTHER"
                  ? "Jelaskan kondisi laptop ini..."
                  : repairStatus === "WAITING_PARTS"
                    ? "Sparepart apa yang ditunggu? Est. kapan?"
                    : "Catatan tambahan (opsional)..."
              }
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 transition resize-none"
            />
          </div>

          {/* Status unit */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Status Unit
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "SERVICE", label: "Service", icon: "🔧" },
                { value: "BELUM_SIAP", label: "Belum Siap", icon: "⏳" },
                { value: "SIAP_JUAL", label: "Siap Jual", icon: "✅" },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setUnitStatus(opt.value)}
                  className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition ${unitStatus === opt.value
                      ? "bg-gray-700 text-white border-gray-700"
                      : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                    }`}
                >
                  <span className="text-sm">{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
            {unitStatus === "SIAP_JUAL" && repairStatus !== "DONE" && (
              <p className="text-[10px] text-amber-600 mt-1.5 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                Unit akan pindah ke halaman Siap Jual setelah disimpan
              </p>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={loading || (repairStatus === "OTHER" && !repairNotes.trim())}
            className="flex-1 h-10 bg-gray-700 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MinusPage() {
  const [units, setUnits] = useState<MinusUnit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<UserRole | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [filterRepair, setFilterRepair] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");

  // Modals
  const [editTarget, setEditTarget] = useState<MinusUnit | null>(null);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);

  const canEdit = userRole ? hasPermission(userRole, PERMISSIONS.EDIT_MINUS_LAPTOPS ?? ["ADMIN", "PENGELOLA_BARANG", "TEKNISI"] as UserRole[]) : false;

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(r => setUserRole(r.user?.role ?? null))
      .catch(() => setUserRole(null));
  }, []);

  const fetchUnits = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/laptops/minus");
      const result = await res.json();
      if (result.success) {
        setUnits((result.data || []).map((u: MinusUnit) => ({
          ...u,
          purchase_price: Math.round(Number(u.purchase_price) || 0),
          selling_price: Math.round(Number(u.selling_price) || 0),
        })));
      }
    } catch {
      setUnits([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchUnits(); }, []);

  const filtered = useMemo(() => {
    let list = [...units];
    if (filterStatus !== "ALL") list = list.filter(u => u.status === filterStatus);
    if (filterRepair !== "ALL") {
      if (filterRepair === "NONE") list = list.filter(u => !u.repair_status);
      else list = list.filter(u => u.repair_status === filterRepair);
    }
    if (search.trim()) {
      const t = search.toLowerCase();
      list = list.filter(u =>
        u.laptop?.laptop_name?.toLowerCase().includes(t) ||
        u.serial_number?.toLowerCase().includes(t) ||
        u.laptop?.brand?.toLowerCase().includes(t) ||
        u.repair_notes?.toLowerCase().includes(t)
      );
    }
    const ORDER: Record<string, number> = {
      NOT_STARTED: 0, WAITING_PARTS: 1, HARD_PARTS: 2, OTHER: 3, GIVE_UP: 4, DEAD: 5, DONE: 6,
    };
    list.sort((a, b) => {
      const repairDiff =
        (ORDER[a.repair_status || "NOT_STARTED"] ?? 9) -
        (ORDER[b.repair_status || "NOT_STARTED"] ?? 9);
      if (repairDiff !== 0) return repairDiff;
      return (a.laptop?.laptop_name ?? "").localeCompare(b.laptop?.laptop_name ?? "", "id");
    });
    return list;
  }, [units, filterStatus, filterRepair, search]);

  // Count per repair status
  const repairCounts = useMemo(() => {
    const c: Record<string, number> = { ALL: units.length, NONE: 0 };
    units.forEach(u => {
      const key = u.repair_status || "NONE";
      c[key] = (c[key] || 0) + 1;
    });
    return c;
  }, [units]);

  const statusCounts = {
    ALL: units.length,
    SERVICE: units.filter(u => u.status === "SERVICE").length,
    BELUM_SIAP: units.filter(u => u.status === "BELUM_SIAP").length,
  };

  const fmtDate = (iso: string) => {
    if (!iso) return "—";
    return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
  };

  return (
    <DashboardLayout>
      <main className="min-h-screen bg-gradient-to-br from-gray-50 to-white p-4 sm:p-6 lg:p-8">
        <div className="max-w-full mx-auto space-y-5">

          {/* Header dengan desain premium */}
          <div className="flex flex-wrap items-end justify-between gap-3 animate-fadeIn">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-1 h-7 bg-gradient-to-b from-gray-600 to-gray-800 rounded-full" />
                <div className="w-8 h-8 bg-gradient-to-br from-gray-600 to-gray-800 rounded-xl flex items-center justify-center shadow-md">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                    <path d="M12 9v4m0 4h.01" />
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-900 bg-clip-text text-transparent">
                    Laptop Minus
                  </h1>
                  <p className="text-xs text-gray-400 mt-0.5">Unit dalam perbaikan atau belum siap</p>
                </div>
              </div>
            </div>
            <button
              onClick={fetchUnits}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-2 rounded-xl transition-all duration-200 bg-white hover:bg-gray-50 hover:border-gray-300"
            >
              <svg className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total Unit", value: units.length, color: "text-gray-800", bar: "bg-gray-600", icon: "📦" },
              { label: "Belum Terpegang", value: repairCounts["NOT_STARTED"] || 0, color: "text-gray-600", bar: "bg-gray-400", icon: "⏸️" },
              { label: "Proses", value: (repairCounts["WAITING_PARTS"] || 0) + (repairCounts["HARD_PARTS"] || 0), color: "text-gray-700", bar: "bg-gray-500", icon: "🔄" },
              { label: "Selesai", value: repairCounts["DONE"] || 0, color: "text-gray-700", bar: "bg-gray-500", icon: "✅" },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 relative overflow-hidden group hover:shadow-md transition-all duration-300">
                <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${s.bar} opacity-60 group-hover:opacity-100 transition-opacity`} />
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{s.label}</p>
                    <p className={`text-2xl font-extrabold mt-1 ${s.color}`}>{s.value}</p>
                  </div>
                  <div className="text-xl opacity-60">{s.icon}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Repair Status Quick Filter */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
              <span>🔧</span> Status Perbaikan
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
              <button
                onClick={() => setFilterRepair("ALL")}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition border ${filterRepair === "ALL"
                    ? "bg-gray-700 text-white border-gray-700 shadow-md"
                    : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                  }`}
              >
                Semua ({repairCounts["ALL"] || 0})
              </button>
              <button
                onClick={() => setFilterRepair("NONE")}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition border ${filterRepair === "NONE"
                    ? "bg-gray-700 text-white border-gray-700 shadow-md"
                    : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                  }`}
              >
                Belum diset ({repairCounts["NONE"] || 0})
              </button>
              {Object.entries(REPAIR_STATUS).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => setFilterRepair(key)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition border ${filterRepair === key
                      ? `${val.badge} shadow-sm`
                      : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                    }`}
                >
                  {val.emoji} {val.label}
                  {repairCounts[key] > 0 && (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${filterRepair === key ? "bg-white/30" : "bg-gray-100 text-gray-500"
                      }`}>
                      {repairCounts[key]}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Unit Status + Search */}
            <div className="flex gap-2 flex-wrap">
              {[
                { value: "ALL", label: "Semua Status", count: statusCounts.ALL, icon: "📋" },
                { value: "SERVICE", label: "Service", count: statusCounts.SERVICE, icon: "🔧" },
                { value: "BELUM_SIAP", label: "Belum Siap", count: statusCounts.BELUM_SIAP, icon: "⏳" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFilterStatus(opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border flex items-center gap-1 ${filterStatus === opt.value
                      ? "bg-gray-700 text-white border-gray-700 shadow-md"
                      : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                    }`}
                >
                  <span>{opt.icon}</span>
                  {opt.label}
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] ${filterStatus === opt.value ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
                    }`}>
                    {opt.count}
                  </span>
                </button>
              ))}
              <div className="relative flex-1 min-w-[180px] group">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 group-focus-within:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Cari nama, SN, catatan..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-9 border border-gray-200 rounded-xl pl-8 pr-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all duration-200"
                />
              </div>
              {(search || filterRepair !== "ALL" || filterStatus !== "ALL") && (
                <button
                  onClick={() => { setSearch(""); setFilterRepair("ALL"); setFilterStatus("ALL"); }}
                  className="h-9 px-3 bg-gray-100 text-gray-600 rounded-xl text-xs font-medium hover:bg-gray-200 transition-all duration-200"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
              <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin mx-auto" />
              <p className="text-xs text-gray-400 mt-3">Memuat data...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-20 text-center">
              <div className="text-5xl mb-3 animate-bounce">🔧</div>
              <p className="text-gray-500 font-semibold text-base">Tidak ada unit ditemukan</p>
              <p className="text-gray-400 text-sm mt-1">Coba ubah filter pencarian</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto" style={{ scrollbarWidth: "thin" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Laptop</th>
                      <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">SN</th>
                      <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Status Unit</th>
                      <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Status Perbaikan</th>
                      <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider min-w-[200px]">Catatan</th>
                      <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Tgl Masuk</th>
                      <th className="px-4 py-3 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map((unit, idx) => {
                      const rs = unit.repair_status ? REPAIR_STATUS[unit.repair_status] : null;
                      const ust = UNIT_STATUS[unit.status];
                      
                      return (
                        <tr
                          key={unit.id}
                          className={`transition-colors hover:bg-gray-50 ${
                            idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                          }`}
                        >
                          <td className="px-4 py-3.5 max-w-[200px]">
                            <p className="font-semibold text-gray-800 truncate text-sm" title={unit.laptop?.laptop_name}>
                              {unit.laptop?.laptop_name || "—"}
                            </p>
                            <p className="text-[11px] text-gray-400 mt-0.5">
                              {[unit.laptop?.brand, unit.laptop?.cpu].filter(Boolean).join(" · ")}
                            </p>
                            <p className="text-[10px] text-gray-300 mt-0.5">
                              {unit.laptop?.ram} · {unit.laptop?.storage}
                            </p>
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className="font-mono text-xs text-gray-700 bg-gray-100 px-2 py-1 rounded">
                              {unit.serial_number}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            {ust && (
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${ust.badge}`}>
                                {ust.label}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            {rs ? (
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${rs.badge}`}>
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${rs.dot}`} />
                                {rs.emoji} {rs.label}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300 italic">Belum diset</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 max-w-[220px]">
                            {unit.repair_notes ? (
                              <p className="text-xs text-gray-600 line-clamp-2" title={unit.repair_notes}>
                                {unit.repair_notes}
                              </p>
                            ) : unit.condition_note ? (
                              <p className="text-xs text-gray-400 line-clamp-1" title={unit.condition_note}>
                                {unit.condition_note}
                              </p>
                            ) : (
                              <span className="text-gray-300 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className="text-xs text-gray-500">{fmtDate(unit.created_at)}</span>
                          </td>
                          <td className="px-4 py-3.5 text-right whitespace-nowrap">
                            {canEdit && (
                              <button
                                onClick={() => setEditTarget(unit)}
                                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 hover:border-gray-300 transition-all duration-200"
                              >
                                Update
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/40">
                <p className="text-xs text-gray-400">
                  Menampilkan <span className="font-semibold text-gray-700">{filtered.length}</span> dari{" "}
                  <span className="font-semibold text-gray-700">{units.length}</span> unit
                </p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modal */}
      {editTarget && (
        <EditRepairModal
          unit={editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={(updated) => {
            setUnits((prev) => prev.map((u) => u.id === updated.id ? { ...u, ...updated } : u));
            setAlertMsg(
              updated.status === "SIAP_JUAL"
                ? "Unit dipindahkan ke Siap Jual ✅"
                : "Status perbaikan diperbarui ✅"
            );
          }}
        />
      )}
      {alertMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fadeIn">
          <div className="bg-gray-700 text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2.5">
            <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            {alertMsg}
            <button onClick={() => setAlertMsg(null)} className="ml-2 text-white/50 hover:text-white transition">×</button>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-fadeIn { animation: fadeIn 0.4s ease-out; }
        .animate-bounce { animation: bounce 1s ease-in-out infinite; }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin { animation: spin 1s linear infinite; }
      `}</style>
    </DashboardLayout>
  );
}