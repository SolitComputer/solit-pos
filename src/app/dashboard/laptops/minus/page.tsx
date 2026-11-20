"use client";

import { useEffect, useState, useMemo } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { UserRole, PERMISSIONS, hasPermission, hasAnyRole, MINUS_REVIEW_ROLES } from "@/lib/permissions";
import { getAuthUser } from "@/hooks/useAuthUser";
import {
  Package, Wrench, AlertTriangle,
} from "lucide-react";
import QcDecisionModal from "./QcDecisionModal";
import AntrianSparepartTab from "./AntrianSparepartTab";
// ConditionChecklist sama yang dipakai di units/page.tsx & Data Barang.
// Di sini dipaksa readOnly buat view-only kepala.
import ConditionChecklist from "@/components/inventory/ConditionChecklist";

// ─── Types ────────────────────────────────────────────────────────────────────
interface MinusUnit {
  id: string;
  // ✅ laptop_id nullable — SN Lepas (unit lepas folder) laptop_id=NULL.
  laptop_id: string | null;
  serial_number: string;
  grade: string;
  condition_note: string;
  purchase_price: number;
  selling_price: number;
  status: string;
  notes: string;
  repair_status: string | null;
  repair_notes: string | null;
  // Riwayat cek kondisi (JSON) — dipakai di kolom tambahan khusus kepala
  // untuk taksir biaya sparepart sebelum ambil keputusan.
  condition_checks: Record<string, unknown> | null;
  // ── BARU ──
  analisa: string | null;
  progress_pengerjaan: string | null;
  minus_status: string; // 'BELUM_DIATASI' | 'SUDAH_DIATASI'
  qc_status?: string | null;
  qc_marked_minus_at?: string | null;
  qc_marked_minus_by_name?: string | null;
  created_at: string;
  // ✅ SN-First hybrid read: field identitas di unit-level (optional fallback
  //    kalau SN Lepas), parent laptop jadi secondary source.
  laptop_name?: string | null;
  brand?: string | null;
  cpu?: string | null;
  ram?: string | null;
  storage?: string | null;
  // ✅ Flag dari backend (Patch 5.1) — unit tanpa parent folder.
  is_sn_lepas?: boolean;
  // Parent laptop (optional — NULL kalau SN Lepas)
  laptop?: {
    id: string | null;
    laptop_name: string | null;
    brand: string | null;
    cpu: string | null;
    ram: string | null;
    storage: string | null;
  };
}

const fmt = (n: number) => "Rp " + (n || 0).toLocaleString("id-ID");


// ─── Main Page ────────────────────────────────────────────────────────────────
function MinusContent() {
  const [units, setUnits] = useState<MinusUnit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);

  // Filters
  const [search, setSearch] = useState("");
  const [filterRepair, setFilterRepair] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterMinusStatus, setFilterMinusStatus] = useState<"ALL" | "BELUM_DIATASI" | "SUDAH_DIATASI">("ALL");
  // Tab: BARANG_MINUS = unit yang ditandai MINUS oleh Team QC (satu-satunya
  // pintu masuk) | ANTRIAN = daftar sparepart menunggu dibeli.
  // Tab lama "UMUM" (Perbaikan Umum, flow teknisi) sudah dihapus — data
  // existing dibiarkan di DB sesuai keputusan Rayhan.
  const [activeTab, setActiveTab] = useState<"BARANG_MINUS" | "ANTRIAN">("BARANG_MINUS");

  // Modals
  const [editTarget, setEditTarget] = useState<MinusUnit | null>(null);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  // Modal view-only buat Riwayat Cek Kondisi — khusus role kepala.
  const [conditionViewTarget, setConditionViewTarget] = useState<MinusUnit | null>(null);

  // canEdit: role yang boleh buka QcDecisionModal (keputusan Perbaiki/MSJ/Matot).
  // TEKNISI dihapus — teknisi hanya tangani laptop customer, bukan stok Solit.
  const canEdit = userRole
    ? hasPermission(userRole, (PERMISSIONS.EDIT_MINUS_LAPTOPS ?? ["ADMIN", "PENGELOLA_BARANG"]) as UserRole[])
    : false;
  const canReview = hasAnyRole(userRoles, MINUS_REVIEW_ROLES);
  // canSeeHeadColumns: role kepala (+ Admin super-user) yang boleh lihat
  // kolom sensitif (Harga Modal, Harga Jual, Riwayat Cek Kondisi) untuk
  // taksir kelayakan perbaikan secara ekonomi.
  const canSeeHeadColumns = hasAnyRole(userRoles, ["ADMIN", "KEPALA_TEKNISI", "KEPALA_PENGELOLA_BARANG"] as UserRole[]);

  useEffect(() => {
    getAuthUser().then(u => ({ success: true, user: u }))
      .then(r => {
        setUserRole(r.user?.role ?? null);
        const roles: string[] =
          Array.isArray(r.user?.roles) && r.user.roles.length > 0
            ? r.user.roles
            : r.user?.role ? [r.user.role] : [];
        setUserRoles(roles as UserRole[]);
      })
      .catch(() => { setUserRole(null); setUserRoles([]); });
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

  // handleDecision + endpoint /api/laptops/minus/decision dihapus — keputusan
  // sekarang HANYA lewat QcDecisionModal yang panggil
  // /api/laptops/pengelola/decision (Perbaiki/MSJ/Matot).

  const filtered = useMemo(() => {
    // API /api/laptops/minus sudah filter server-side ke qc_status=FROM_QC,
    // jadi client cuma perlu handle pencarian + sort.
    let list = [...units];
    if (search.trim()) {
      const t = search.toLowerCase();
      list = list.filter(u =>
        u.laptop?.laptop_name?.toLowerCase().includes(t) ||
        u.serial_number?.toLowerCase().includes(t) ||
        u.laptop?.brand?.toLowerCase().includes(t) ||
        u.laptop?.cpu?.toLowerCase().includes(t) ||
        u.analisa?.toLowerCase().includes(t)
      );
    }
    // Urutkan dari tanggal MARK MINUS terbaru → paling lama.
    // qc_marked_minus_at lebih relevan dari created_at karena ini menandai
    // kapan unit masuk antrian keputusan Pengelola Barang.
    list.sort((a, b) => {
      const dateA = a.qc_marked_minus_at ? new Date(a.qc_marked_minus_at).getTime()
        : (a.created_at ? new Date(a.created_at).getTime() : 0);
      const dateB = b.qc_marked_minus_at ? new Date(b.qc_marked_minus_at).getTime()
        : (b.created_at ? new Date(b.created_at).getTime() : 0);
      return dateB - dateA;
    });
    return list;
  }, [units, search]);

  // Counts
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

  // (needsAttention dihapus — alert "perlu analisa" khusus flow teknisi lama)

  const fmtDate = (iso: string) => {
    if (!iso) return "—";
    return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
  };

  return (
    <>
      <main className="min-h-screen bg-gradient-to-br from-gray-50 to-white p-4 sm:p-6 lg:p-8">
        <div className="max-w-full mx-auto space-y-5">

          {/* Header */}
          <div className="flex flex-wrap items-end justify-between gap-3">
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
                    Barang Minus
                  </h1>
                  <p className="text-xs text-gray-400 mt-0.5">Keputusan Pengelola Barang untuk unit yang ditandai MINUS oleh Team QC</p>
                </div>
              </div>
            </div>
            <button onClick={fetchUnits}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-2 rounded-xl transition-all bg-white hover:bg-gray-50 hover:border-gray-300">
              <svg className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>

          {/* Alert needsAttention dihapus — alert khusus flow teknisi lama */}

          {/* ── Tab Strip: Barang Minus (dari Team QC) + Antrian Sparepart ──
              Tab lama "Perbaikan Umum" dihapus — sesuai keputusan Rayhan,
              satu-satunya pintu masuk ke Barang Minus = "Tandai MINUS" dari
              Team QC. Data lama (219 unit) dibiarkan di DB & di-handle manual. */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex">
              <button
                onClick={() => setActiveTab("BARANG_MINUS")}
                className={`flex-1 h-12 px-3 flex items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold transition-all border-b-2 ${activeTab === "BARANG_MINUS"
                    ? "text-indigo-700 border-indigo-600 bg-indigo-50/60"
                    : "text-gray-400 border-transparent hover:text-indigo-600 hover:bg-indigo-50/30"
                  }`}
              >
                <AlertTriangle size={16} />
                <span>Barang Minus</span>
                <span className={`inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full text-[11px] font-bold ${activeTab === "BARANG_MINUS" ? "bg-indigo-600 text-white" : "bg-indigo-100 text-indigo-600"
                  }`}>
                  {units.length}
                </span>
              </button>
              <button
                onClick={() => setActiveTab("ANTRIAN")}
                className={`flex-1 h-12 px-3 flex items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold transition-all border-b-2 ${activeTab === "ANTRIAN"
                    ? "text-emerald-700 border-emerald-600 bg-emerald-50/60"
                    : "text-gray-400 border-transparent hover:text-emerald-600 hover:bg-emerald-50/30"
                  }`}
              >
                <Package size={16} />
                <span>Antrian Sparepart</span>
              </button>
            </div>
          </div>

          {/* ─── Tab ANTRIAN: render komponen khusus (sembunyikan Summary/Filter/Table) ─── */}
          {activeTab === "ANTRIAN" && <AntrianSparepartTab />}

          {/* Summary Cards (metrik teknisi: Belum Terpegang/Proses/Selesai)
              dihapus — tidak relevan untuk flow Barang Minus dari Team QC.
              Pengelola Barang langsung putusin per unit via QcDecisionModal. */}

          {/* Search bar — HANYA tampil di tab BARANG_MINUS. Filter kompleks
              teknisi-flow (Status Perbaikan, Belum/Sudah Diatasi, Status Unit)
              sudah dihapus karena tidak relevan untuk flow baru — Pengelola
              Barang langsung putusin per unit via QcDecisionModal. */}
          <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-4 ${activeTab !== "BARANG_MINUS" ? "hidden" : ""}`}>
            <div className="flex gap-2 flex-wrap items-center">
              <div className="relative flex-1 min-w-[180px] group">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 group-focus-within:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input type="text" placeholder="Cari nama laptop, SN, brand, CPU, analisa..." value={search} onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-9 border border-gray-200 rounded-xl pl-8 pr-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-400 focus:bg-white transition-all" />
              </div>
              {search && (
                <button onClick={() => setSearch("")}
                  className="h-9 px-3 bg-gray-100 text-gray-600 rounded-xl text-xs font-medium hover:bg-gray-200 transition">
                  Reset
                </button>
              )}
              <p className="text-xs text-gray-400 ml-auto">
                <span className="font-semibold text-gray-700">{filtered.length}</span> dari <span className="font-semibold text-gray-700">{units.length}</span> unit
              </p>
            </div>
          </div>

          {/* Table — hanya tampil di tab BARANG_MINUS (tab ANTRIAN render
              AntrianSparepartTab component di atas) */}
          {activeTab === "BARANG_MINUS" && (isLoading ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
              <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin mx-auto" />
              <p className="text-xs text-gray-400 mt-3">Memuat data...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-20 text-center">
              <div className="text-5xl mb-3"><Wrench size={48} className="mx-auto text-gray-300" /></div>
              <p className="text-gray-500 font-semibold text-base">Belum ada unit Barang Minus</p>
              <p className="text-gray-400 text-sm mt-1">Unit muncul di sini begitu Team QC menandai sebagai MINUS</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto" style={{ scrollbarWidth: "thin" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {/* Kolom standar — SEMUA role Pengelola Barang lihat ini */}
                      <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Nama Laptop</th>
                      <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Brand</th>
                      <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">CPU</th>
                      <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">RAM</th>
                      <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Storage</th>
                      <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">SN</th>
                      <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Grade</th>
                      {/* Kolom sensitif — KHUSUS role kepala untuk taksir profit
                          sparepart sebelum ambil keputusan. */}
                      {canSeeHeadColumns && (
                        <>
                          <th className="px-4 py-3 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Harga Modal</th>
                          <th className="px-4 py-3 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Harga Jual</th>
                          <th className="px-4 py-3 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Riwayat Cek Kondisi</th>
                        </>
                      )}
                      <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider min-w-[200px]">Keterangan Team QC</th>
                      <th className="px-4 py-3 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map((unit, idx) => (
                      <tr key={unit.id}
                        onClick={() => canEdit && setEditTarget(unit)}
                        className={`transition-colors hover:bg-gray-50 ${canEdit ? "cursor-pointer" : ""} ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/30"}`}
                      >
                        <td className="px-4 py-3.5 max-w-[200px]">
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold text-gray-800 truncate text-sm"
                               title={unit.laptop_name ?? unit.laptop?.laptop_name ?? ""}>
                              {/* ✅ Hybrid read: unit prioritas, fallback laptop */}
                              {unit.laptop_name ?? unit.laptop?.laptop_name ?? "—"}
                            </p>
                            {/* ✅ Badge LEPAS untuk SN Lepas (unit tanpa folder) */}
                            {unit.is_sn_lepas && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-sky-100 text-sky-700 border border-sky-200 flex-shrink-0">
                                🆓 LEPAS
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-gray-600">{unit.brand ?? unit.laptop?.brand ?? "—"}</td>
                        <td className="px-4 py-3.5 text-xs text-gray-600">{unit.cpu ?? unit.laptop?.cpu ?? "—"}</td>
                        <td className="px-4 py-3.5 text-xs text-gray-600">{unit.ram ?? unit.laptop?.ram ?? "—"}</td>
                        <td className="px-4 py-3.5 text-xs text-gray-600">{unit.storage ?? unit.laptop?.storage ?? "—"}</td>
                        <td className="px-4 py-3.5 text-xs font-mono text-gray-700">{unit.serial_number}</td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                            unit.grade === "A" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : unit.grade === "B" ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-red-50 text-red-700 border-red-200"
                          }`}>
                            {unit.grade || "—"}
                          </span>
                        </td>
                        {/* Kolom sensitif — khusus kepala */}
                        {canSeeHeadColumns && (
                          <>
                            <td className="px-4 py-3.5 text-right text-xs text-gray-700 font-semibold tabular-nums whitespace-nowrap">
                              {fmt(unit.purchase_price)}
                            </td>
                            <td className="px-4 py-3.5 text-right text-xs text-gray-800 font-bold tabular-nums whitespace-nowrap">
                              {fmt(unit.selling_price)}
                            </td>
                            <td className="px-4 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                              {unit.condition_checks && Object.keys(unit.condition_checks).length > 0 ? (
                                <button onClick={() => setConditionViewTarget(unit)}
                                  className="h-7 px-2.5 text-[11px] font-semibold text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 transition inline-flex items-center gap-1">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                  </svg>
                                  Lihat
                                </button>
                              ) : (
                                <span className="text-[11px] text-gray-300 italic">—</span>
                              )}
                            </td>
                          </>
                        )}
                        {/* Keterangan Team QC — alasan tandai MINUS */}
                        <td className="px-4 py-3.5 max-w-[240px]">
                          <div className="bg-indigo-50/60 border-l-2 border-indigo-400 rounded-r-lg px-2 py-1.5 space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {unit.qc_marked_minus_at && (
                                <span className="text-[9px] text-indigo-500 font-mono">
                                  {fmtDate(unit.qc_marked_minus_at)}
                                </span>
                              )}
                              {unit.qc_marked_minus_by_name && (
                                <span className="text-[10px] text-indigo-600">
                                  oleh <span className="font-semibold">{unit.qc_marked_minus_by_name}</span>
                                </span>
                              )}
                            </div>
                            {unit.analisa ? (
                              <p className="text-xs text-gray-800 line-clamp-3" title={unit.analisa}>
                                {unit.analisa}
                              </p>
                            ) : (
                              <p className="text-[11px] text-amber-600 italic">— alasan tidak tersimpan —</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          {canEdit && (
                            <button onClick={(e) => { e.stopPropagation(); setEditTarget(unit); }}
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg border text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100 transition">
                              Putuskan
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
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
          ))}
        </div>
      </main>

      {/* EditRepairModal (flow teknisi UMUM) dihapus — sekarang semua
          keputusan Pengelola Barang lewat QcDecisionModal di bawah. */}

      {editTarget && activeTab === "BARANG_MINUS" && (
        <QcDecisionModal
          unit={{
            id: editTarget.id,
            serial_number: editTarget.serial_number,
            condition_note: editTarget.condition_note,
            analisa: editTarget.analisa,
            // ✅ Pass hybrid read + is_sn_lepas flag biar modal render correct
            laptop_name: editTarget.laptop_name ?? editTarget.laptop?.laptop_name ?? null,
            brand: editTarget.brand ?? editTarget.laptop?.brand ?? null,
            cpu: editTarget.cpu ?? editTarget.laptop?.cpu ?? null,
            ram: editTarget.ram ?? editTarget.laptop?.ram ?? null,
            storage: editTarget.storage ?? editTarget.laptop?.storage ?? null,
            is_sn_lepas: editTarget.is_sn_lepas,
          }}
          onClose={() => setEditTarget(null)}
          onSuccess={(msg) => {
            // Unit sudah pindah ke tempat lain (SERVICE/MSJ/dihapus) → remove dari list
            setUnits(prev => prev.filter(u => u.id !== editTarget.id));
            setAlertMsg(msg);
            setEditTarget(null);
          }}
        />
      )}

      {/* Modal view-only Riwayat Cek Kondisi — pakai ConditionChecklist
          komponen yang sudah ada, dipaksa readOnly supaya cuma lihat. */}
      {conditionViewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConditionViewTarget(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[85vh] flex flex-col">
            <div className="h-1 w-full bg-gradient-to-r from-sky-400 via-sky-600 to-sky-800" />
            <div className="px-5 py-4 bg-sky-600">
              <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest">Riwayat Cek Kondisi</p>
              <h3 className="text-sm font-bold text-white mt-0.5 truncate">
                SN: <span className="font-mono">{conditionViewTarget.serial_number}</span> · {conditionViewTarget.laptop?.laptop_name}
              </h3>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4">
              <ConditionChecklist
                value={(conditionViewTarget.condition_checks ?? {}) as any}
                onChange={() => { /* read-only, no-op */ }}
                readOnly={true}
              />
              {(!conditionViewTarget.condition_checks || Object.keys(conditionViewTarget.condition_checks).length === 0) && (
                <p className="text-sm text-gray-400 text-center py-6">Belum ada hasil cek kondisi</p>
              )}
            </div>
            <div className="px-5 py-4 border-t border-gray-100">
              <button onClick={() => setConditionViewTarget(null)}
                className="w-full h-10 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition">
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {alertMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-gray-700 text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2.5">
            <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            {alertMsg}
            <button onClick={() => setAlertMsg(null)} className="ml-2 text-white/50 hover:text-white transition text-base leading-none">×</button>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin { animation: spin 1s linear infinite; }
 `}</style>
    </>
  );
}

export default function MinusPage() {
  return (
    <DashboardLayout>
      <MinusContent />
    </DashboardLayout>
  );
}