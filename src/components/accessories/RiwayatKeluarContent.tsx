"use client";
import { useEffect, useState } from "react";
import { useAuthUser } from "@/hooks/useAuthUser";

// ─── Source metadata (label + accent) ────────────────────────────────────────
const SOURCE_META: Record<string, { label: string; cls: string; dot: string }> = {
  transaction: { label: "Penjualan", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  service: { label: "Servis", cls: "bg-indigo-50 text-indigo-700 border-indigo-200", dot: "bg-indigo-500" },
  manual: { label: "Manual", cls: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" },
};
const sourceMeta = (type: string) =>
  SOURCE_META[type] ?? { label: type || "-", cls: "bg-gray-50 text-gray-600 border-gray-200", dot: "bg-gray-400" };

export default function RiwayatKeluarContent() {
  const { user } = useAuthUser();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    activeMonth: 0,
    cancelled: 0,
    manual: 0
  });

  const [filterSource, setFilterSource] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState({
    accessory_id: "",
    unit_id: "",
    qty: 1,
    taken_by_role: "PENGELOLA_BARANG",
    notes: ""
  });

  const [accessories, setAccessories] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"].includes(user?.role || "");

  useEffect(() => {
    fetchData();
  }, [filterSource, filterStatus]);

  useEffect(() => {
    if (showModal && isAdmin) {
      fetchAccessories();
    }
  }, [showModal]);

  useEffect(() => {
    if (modalData.accessory_id) {
      fetchUnits(modalData.accessory_id);
    } else {
      setUnits([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalData.accessory_id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterSource) params.append("source", filterSource);
      if (filterStatus) params.append("status", filterStatus);

      const res = await fetch(`/api/accessory-outflows?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        calculateStats(json.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (rows: any[]) => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let activeMonth = 0;
    let cancelled = 0;
    let manual = 0;

    rows.forEach(row => {
      const created = new Date(row.created_at);
      if (row.status === "active" && created.getMonth() === currentMonth && created.getFullYear() === currentYear) {
        activeMonth++;
      }
      if (row.status === "cancelled") {
        cancelled++;
      }
      if (row.source_type === "manual") {
        manual++;
      }
    });

    setStats({ activeMonth, cancelled, manual });
  };

  const fetchAccessories = async () => {
    try {
      const res = await fetch(`/api/accessories`);
      const json = await res.json();
      if (json.success) {
        setAccessories(json.data.filter((a: any) => a.stock > 0));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchUnits = async (accId: string) => {
    try {
      const res = await fetch(`/api/accessories/${accId}`);
      const json = await res.json();
      if (json.success && json.data.units) {
        setUnits(json.data.units.filter((u: any) => u.status === "TERSEDIA"));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/accessory-outflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...modalData,
          unit_id: modalData.unit_id || null, // null if empty string
        })
      });
      const json = await res.json();
      if (json.success) {
        setShowModal(false);
        setModalData({ accessory_id: "", unit_id: "", qty: 1, taken_by_role: "PENGELOLA_BARANG", notes: "" });
        fetchData();
      } else {
        alert(json.error || "Gagal mencatat pengeluaran");
      }
    } catch (err) {
      console.error(err);
      alert("Terjadi kesalahan jaringan");
    } finally {
      setSubmitting(false);
    }
  };

  const hasFilters = Boolean(filterSource || filterStatus);
  const COL_COUNT = 8;

  return (
    <div className="space-y-5">
      {/* ── Stat Cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 animate-slideDown">
        {/* Aktif Bulan Ini */}
        <div className="group relative bg-white rounded-2xl border border-gray-100 shadow-sm p-4 overflow-hidden transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Aktif Bulan Ini</div>
              <div className="mt-1.5 text-2xl font-bold text-gray-900 tabular-nums">{stats.activeMonth}</div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 flex-shrink-0">
              <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" /><polyline points="9 12 11.5 14.5 15.5 9.5" />
              </svg>
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-emerald-400 to-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        {/* Dibatalkan */}
        <div className="group relative bg-white rounded-2xl border border-gray-100 shadow-sm p-4 overflow-hidden transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Dibatalkan</div>
              <div className="mt-1.5 text-2xl font-bold text-red-600 tabular-nums">{stats.cancelled}</div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center text-red-500 flex-shrink-0">
              <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-red-400 to-red-600 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        {/* Input Manual */}
        <div className="group relative bg-white rounded-2xl border border-gray-100 shadow-sm p-4 overflow-hidden transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Input Manual</div>
              <div className="mt-1.5 text-2xl font-bold text-amber-600 tabular-nums">{stats.manual}</div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 flex-shrink-0">
              <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-amber-400 to-amber-600 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>

      {/* ── Header & Filters ───────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <select
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value)}
              className="h-9 pl-3 pr-8 text-sm font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-xl appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-gray-400/20 focus:border-gray-400 focus:bg-white transition-all"
            >
              <option value="">Semua Sumber</option>
              <option value="transaction">Penjualan</option>
              <option value="service">Servis</option>
              <option value="manual">Manual</option>
            </select>
            <svg className="w-4 h-4 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
          </div>

          <div className="relative">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="h-9 pl-3 pr-8 text-sm font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-xl appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-gray-400/20 focus:border-gray-400 focus:bg-white transition-all"
            >
              <option value="">Semua Status</option>
              <option value="active">Aktif</option>
              <option value="cancelled">Dibatalkan</option>
            </select>
            <svg className="w-4 h-4 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
          </div>

          {hasFilters && (
            <button
              onClick={() => { setFilterSource(""); setFilterStatus(""); }}
              className="h-9 px-3 text-sm font-medium text-gray-500 bg-gray-100 rounded-xl hover:bg-gray-200 active:scale-[0.97] transition-all flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              Reset
            </button>
          )}

          {!loading && (
            <span className="text-[12px] text-gray-400 font-medium tabular-nums ml-0.5">
              {data.length} entri
            </span>
          )}
        </div>

        {isAdmin && (
          <button
            onClick={() => setShowModal(true)}
            className="h-9 px-4 bg-gray-800 text-white rounded-xl text-sm font-semibold hover:bg-gray-900 active:scale-[0.97] transition-all shadow-lg shadow-gray-800/20 flex items-center justify-center gap-2 flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Tambah Manual
          </button>
        )}
      </div>

      {/* ── Table ──────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden animate-slideUp">
        <div className="overflow-x-auto table-scroll">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400 bg-gray-50/80 border-b border-gray-100">
                <th className="px-5 py-3 whitespace-nowrap font-semibold">Waktu</th>
                <th className="px-5 py-3 font-semibold">Aksesoris</th>
                <th className="px-5 py-3 font-semibold text-center">Qty</th>
                <th className="px-5 py-3 font-semibold">Sumber</th>
                <th className="px-5 py-3 font-semibold">Oleh</th>
                <th className="px-5 py-3 font-semibold">Divisi</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: COL_COUNT }).map((__, j) => (
                      <td key={j} className="px-5 py-3.5">
                        <div className="h-3.5 rounded-full skeleton" style={{ width: `${50 + ((i + j) % 4) * 12}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={COL_COUNT} className="px-5 py-16 text-center">
                    <div className="flex flex-col items-center gap-3 animate-fadeIn">
                      <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-300">
                        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 14" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-500">
                          {hasFilters ? "Tidak ada hasil" : "Belum ada riwayat pengeluaran"}
                        </p>
                        <p className="text-[12px] text-gray-400 mt-0.5">
                          {hasFilters ? "Coba ubah atau reset filter di atas." : "Pengeluaran aksesoris akan tampil di sini."}
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                data.map((row) => {
                  const src = sourceMeta(row.source_type);
                  const isCancelled = row.status === "cancelled";
                  return (
                    <tr key={row.id} className={`data-row ${isCancelled ? "bg-gray-50/40" : ""}`}>
                      <td className={`px-5 py-3.5 whitespace-nowrap text-gray-500 tabular-nums ${isCancelled ? "opacity-60" : ""}`}>
                        {new Date(row.created_at).toLocaleString("id-ID", {
                          day: "2-digit", month: "short", year: "numeric",
                          hour: "2-digit", minute: "2-digit"
                        })}
                      </td>
                      <td className={`px-5 py-3.5 ${isCancelled ? "opacity-60" : ""}`}>
                        <div className={`font-semibold text-gray-900 ${isCancelled ? "line-through" : ""}`}>{row.accessory?.name || "-"}</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">{row.accessory?.category || "-"}</div>
                      </td>
                      <td className={`px-5 py-3.5 whitespace-nowrap text-center ${isCancelled ? "opacity-60" : ""}`}>
                        <span className="inline-flex items-center justify-center min-w-[26px] px-2 py-0.5 rounded-lg text-[12px] font-bold tabular-nums bg-gray-100 text-gray-700 ring-1 ring-gray-200">
                          {row.qty}
                        </span>
                      </td>
                      <td className={`px-5 py-3.5 whitespace-nowrap ${isCancelled ? "opacity-60" : ""}`}>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11.5px] font-semibold border ${src.cls}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${src.dot}`} />
                          {src.label}
                        </span>
                      </td>
                      <td className={`px-5 py-3.5 whitespace-nowrap text-gray-700 font-medium ${isCancelled ? "opacity-60" : ""}`}>
                        {row.creator?.name || "-"}
                      </td>
                      <td className={`px-5 py-3.5 whitespace-nowrap ${isCancelled ? "opacity-60" : ""}`}>
                        {row.taken_by_role ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-500 border border-gray-200">
                            {row.taken_by_role.replace(/_/g, " ")}
                          </span>
                        ) : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {isCancelled ? (
                          <span className="inline-flex items-center gap-1 text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-lg text-[11px] font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Batal
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg text-[11px] font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Aktif
                          </span>
                        )}
                      </td>
                      <td className={`px-5 py-3.5 text-[13px] text-gray-500 max-w-xs truncate ${isCancelled ? "opacity-60" : ""}`} title={row.notes || ""}>
                        {row.notes || <span className="text-gray-300">-</span>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal Tambah Manual ────────────────────────────────── */}
      {showModal && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-fadeIn">
          <div className="relative bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-popIn">
            <div className="h-0.5 w-full bg-gradient-to-r from-gray-300 via-gray-700 to-gray-900" />
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gray-800 flex items-center justify-center text-white shadow-lg shadow-gray-800/20 flex-shrink-0">
                  <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-gray-900 leading-none">Catat Pengeluaran Manual</h3>
                  <p className="text-[11.5px] text-gray-400 mt-1">Kurangi stok aksesoris di luar transaksi</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 active:scale-90 transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <form onSubmit={handleManualSubmit} className="p-6 space-y-5">
              {/* Aksesoris Field */}
              <div className="relative">
                <label className="block text-[12.5px] font-semibold text-gray-700 mb-1.5">Aksesoris <span className="text-red-500">*</span></label>
                <div className="relative">
                  <select
                    required
                    value={modalData.accessory_id}
                    onChange={(e) => setModalData({ ...modalData, accessory_id: e.target.value })}
                    className="w-full h-11 pl-4 pr-10 text-[13.5px] bg-gray-50/50 border border-gray-200/80 rounded-xl appearance-none cursor-pointer focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-400 focus:bg-white hover:bg-gray-50 transition-all text-gray-800"
                  >
                    <option value="" className="text-gray-400">Pilih Aksesoris</option>
                    {accessories.map((acc) => (
                      <option key={acc.id} value={acc.id}>{acc.name} (Stok: {acc.stock})</option>
                    ))}
                  </select>
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-[1fr_110px] gap-4">
                {/* Unit Spesifik */}
                <div className="relative">
                  <label className="block text-[12.5px] font-semibold text-gray-700 mb-1.5">Unit Spesifik <span className="font-normal text-gray-400 ml-0.5">(Opsional)</span></label>
                  <div className="relative">
                    <select
                      value={modalData.unit_id}
                      onChange={(e) => setModalData({ ...modalData, unit_id: e.target.value })}
                      disabled={!modalData.accessory_id}
                      className="w-full h-11 pl-4 pr-10 text-[13.5px] bg-gray-50/50 border border-gray-200/80 rounded-xl appearance-none cursor-pointer focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-400 focus:bg-white hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-50/50 text-gray-800"
                    >
                      <option value="">-- Tidak ada --</option>
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>{u.serial_number}</option>
                      ))}
                    </select>
                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                    </div>
                  </div>
                </div>
                
                {/* Qty */}
                <div>
                  <label className="block text-[12.5px] font-semibold text-gray-700 mb-1.5">Qty <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={modalData.qty}
                    onChange={(e) => setModalData({ ...modalData, qty: parseInt(e.target.value) || 1 })}
                    className="w-full h-11 px-4 text-[14px] bg-gray-50/50 border border-gray-200/80 rounded-xl focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-400 focus:bg-white hover:bg-gray-50 transition-all tabular-nums text-gray-800 font-medium"
                  />
                </div>
              </div>

              {/* Divisi Terkait */}
              <div className="relative">
                <label className="block text-[12.5px] font-semibold text-gray-700 mb-1.5">Divisi Terkait <span className="text-red-500">*</span></label>
                <div className="relative">
                  <select
                    required
                    value={modalData.taken_by_role}
                    onChange={(e) => setModalData({ ...modalData, taken_by_role: e.target.value })}
                    className="w-full h-11 pl-4 pr-10 text-[13.5px] bg-gray-50/50 border border-gray-200/80 rounded-xl appearance-none cursor-pointer focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-400 focus:bg-white hover:bg-gray-50 transition-all text-gray-800"
                  >
                    <option value="SALES">SALES</option>
                    <option value="TEKNISI">TEKNISI</option>
                    <option value="PENGELOLA_BARANG">PENGELOLA BARANG</option>
                  </select>
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                  </div>
                </div>
              </div>

              {/* Keterangan */}
              <div>
                <label className="block text-[12.5px] font-semibold text-gray-700 mb-1.5">Keterangan <span className="text-red-500">*</span></label>
                <textarea
                  required
                  rows={3}
                  value={modalData.notes}
                  onChange={(e) => setModalData({ ...modalData, notes: e.target.value })}
                  placeholder="Alasan / keperluan pengeluaran manual..."
                  className="w-full px-4 py-3 text-[13.5px] bg-gray-50/50 border border-gray-200/80 rounded-xl focus:outline-none focus:ring-4 focus:ring-gray-900/5 focus:border-gray-400 focus:bg-white hover:bg-gray-50 transition-all resize-none placeholder:text-gray-400 text-gray-800"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 h-11 rounded-xl text-[13.5px] font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 active:scale-[0.97] transition-all"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 h-11 rounded-xl text-[13.5px] font-bold text-white bg-gray-900 hover:bg-black active:scale-[0.97] disabled:opacity-70 disabled:active:scale-100 transition-all shadow-lg shadow-gray-900/20 hover:shadow-gray-900/30 flex items-center gap-2.5"
                >
                  {submitting && (
                    <svg className="w-4 h-4 animate-spin text-white/80" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" /></svg>
                  )}
                  {submitting ? "Menyimpan..." : "Simpan Catatan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        @keyframes rk-fadeIn    { from{opacity:0}to{opacity:1} }
        @keyframes rk-popIn     { from{opacity:0;transform:scale(0.94) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes rk-slideDown { from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:translateY(0)} }
        @keyframes rk-slideUp   { from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)} }
        @keyframes rk-shimmer   { 0%{background-position:-600px 0}100%{background-position:600px 0} }
        .animate-fadeIn    { animation: rk-fadeIn 0.2s ease-out; }
        .animate-popIn     { animation: rk-popIn 0.25s cubic-bezier(0.34,1.56,0.64,1); }
        .animate-slideDown { animation: rk-slideDown 0.3s ease-out; }
        .animate-slideUp   { animation: rk-slideUp 0.3s ease-out; }
        .skeleton { background: linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 37%,#f1f5f9 63%); background-size:600px 100%; animation: rk-shimmer 1.4s infinite linear; }
        .table-scroll { scrollbar-width: thin; scrollbar-color: #d1d5db #f9fafb; }
        .table-scroll::-webkit-scrollbar { height: 6px; width: 6px; }
        .table-scroll::-webkit-scrollbar-track { background: #f9fafb; }
        .table-scroll::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 99px; }
        .table-scroll::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
        .data-row { transition: background-color 0.15s ease; }
        .data-row:hover { background-color: #f8fafc; }
        .data-row:hover td:first-child { box-shadow: inset 3px 0 0 #374151; }
      `}</style>
    </div>
  );
}
