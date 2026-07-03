"use client";
// src/app/dashboard/service/history/page.tsx

import { useEffect, useState, useCallback } from "react";
import ServiceStatusBadge from "@/components/service/ServiceStatusBadge";
import type { ServiceOrder, ServiceStatus } from "@/types/service";
import { STATUS_LABEL } from "@/types/service";
import DashboardLayout from "@/components/layout/DashboardLayout";

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function getDuration(masuk: string, selesai?: string): string {
  if (!selesai) return "—";
  const diff = Math.floor((new Date(selesai).getTime() - new Date(masuk).getTime()) / 1000 / 60);
  if (diff < 60) return `${diff} mnt`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h} j ${diff % 60} mnt`;
  return `${Math.floor(h / 24)} hr ${h % 24} j`;
}

function fmtRupiah(n?: number) {
  if (!n) return null;
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

const HISTORY_STATUSES: ServiceStatus[] = ["SUDAH_DIAMBIL", "TIDAK_JADI"];

// ── Icons ──────────────────────────────────────────────────────────────────────
const IconRefresh = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
  </svg>
);

const IconSearch = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const IconHistory = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="12 8 12 12 14 14" />
    <path d="M3.05 11a9 9 0 1 0 .5-4H1" />
    <polyline points="1 3 1 7 5 7" />
  </svg>
);

const IconDoc = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="13" y2="17" />
  </svg>
);

const IconXSmall = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
  </svg>
);

const IconCheckCircle = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const IconXCircle = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
  </svg>
);

const IconFilter = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="22 3 2 3 10 13.46 10 21 14 18 14 13.46 22 3" />
  </svg>
);

// ── Skeleton Row ───────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr className="border-b border-gray-50">
      {[40, 96, 80, 120, 80, 80, 80, 64, 80, 60, 60, 60, 64, 100].map((w, i) => (
        <td key={i} className="px-4 py-4">
          <div className="h-3 rounded-full bg-gradient-to-r from-gray-100 to-gray-50 animate-pulse" style={{ width: w }} />
        </td>
      ))}
    </tr>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function HistoryPage() {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<ServiceStatus | "ALL">("ALL");

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = HISTORY_STATUSES.map(s => `status=${s}`).join("&");
      const res = await fetch(`/api/service?${params}`);
      const json = await res.json();
      if (json.success) setOrders(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const filtered = orders.filter(o => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      o.nama.toLowerCase().includes(q) ||
      o.no_hp.includes(q) ||
      o.type_laptop.toLowerCase().includes(q) ||
      o.keluhan.toLowerCase().includes(q);
    const matchStatus = filterStatus === "ALL" || o.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const sudahDiambilCount = orders.filter(o => o.status === "SUDAH_DIAMBIL").length;
  const tidakJadiCount = orders.filter(o => o.status === "TIDAK_JADI").length;

  const COLUMNS = [
    "No", "Pelanggan", "Laptop", "Keluhan",
    "Jam Masuk", "Jam Done", "Jam Diambil", "Durasi Servis",
    "Payment", "Dibuat oleh", "Dikerjakan oleh", "Diambil oleh",
    "Status", "Ket.",
  ];

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="bg-white/70 backdrop-blur-md border-b border-gray-200/60 px-6 py-5 sticky top-0 z-20">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <IconHistory />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800 tracking-tight">
                  Riwayat Servis
                </h1>
                <p className="text-xs text-gray-400 font-medium mt-0.5">
                  {orders.length} total riwayat tersimpan
                </p>
              </div>
            </div>
            <button
              onClick={fetchOrders}
              className="p-2.5 rounded-lg border border-gray-200 bg-white text-gray-400 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-all"
              title="Refresh"
            >
              <IconRefresh />
            </button>
          </div>
        </div>

        {/* ── Filter Bar ────────────────────────────────────────────────────── */}
        <div className="bg-white/70 backdrop-blur-sm border-b border-gray-200/60 px-6 py-4 sticky top-[73px] z-10">
          <div className="flex flex-wrap items-center gap-3 max-w-7xl mx-auto">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <IconSearch />
              </span>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cari nama, no HP, laptop..."
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 bg-white/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 focus:bg-white transition-all placeholder:text-gray-400"
              />
            </div>

            {/* Status Filter Pills */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50/50 rounded-lg">
                <IconFilter />
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Status:</span>
              </div>
              {(["ALL", ...HISTORY_STATUSES] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    filterStatus === s
                      ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/20"
                      : "bg-white/50 text-gray-500 hover:bg-gray-100 border border-gray-200"
                  }`}
                >
                  {s === "ALL" ? "Semua" : STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

          {/* ── Stat Cards ──────────────────────────────────────────────────── */}
          {!loading && orders.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Sudah Diambil */}
              <div className="relative overflow-hidden rounded-xl border border-emerald-100 bg-white p-5 transition-all hover:shadow-lg hover:-translate-y-0.5 duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-3xl font-bold bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">
                      {sudahDiambilCount}
                    </p>
                    <p className="text-xs font-semibold mt-1 text-gray-500">Sudah Diambil</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/20">
                    <IconCheckCircle />
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500 w-full opacity-20" />
              </div>

              {/* Tidak Jadi */}
              <div className="relative overflow-hidden rounded-xl border border-rose-100 bg-white p-5 transition-all hover:shadow-lg hover:-translate-y-0.5 duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-3xl font-bold bg-gradient-to-r from-rose-500 to-pink-500 bg-clip-text text-transparent">
                      {tidakJadiCount}
                    </p>
                    <p className="text-xs font-semibold mt-1 text-gray-500">Tidak Jadi</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-gradient-to-br from-rose-500 to-pink-500 text-white shadow-lg shadow-rose-500/20">
                    <IconXCircle />
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-rose-500 to-pink-500 w-full opacity-20" />
              </div>
            </div>
          )}

          {/* ── Table Area ──────────────────────────────────────────────────── */}
          {loading ? (
            <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gradient-to-r from-slate-50/80 to-white">
                      {COLUMNS.map(h => (
                        <th key={h} className="px-4 py-3.5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap first:pl-5">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)}
                  </tbody>
                </table>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            /* ── Empty State ── */
            <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm">
              <div className="flex flex-col items-center justify-center py-24 text-center px-6">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-dashed border-indigo-200 flex items-center justify-center mb-6 text-indigo-400">
                  <IconDoc />
                </div>
                <h3 className="text-lg font-bold text-slate-800">
                  {search ? "Tidak Ditemukan" : "Belum Ada Riwayat"}
                </h3>
                <p className="text-sm text-gray-400 mt-2 max-w-md leading-relaxed">
                  {search
                    ? `Tidak ada hasil untuk "${search}". Coba kata kunci lain.`
                    : "Order yang sudah selesai atau tidak jadi akan muncul di sini."}
                </p>
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="mt-6 px-5 py-2.5 text-sm font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-all"
                  >
                    Hapus Pencarian
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* ── Main Table ── */
            <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gradient-to-r from-slate-50/80 to-white">
                      {COLUMNS.map((h, i) => (
                        <th
                          key={h}
                          className={`px-4 py-3.5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap ${i === 0 ? 'pl-5' : ''}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map((o, idx) => {
                      const isFromGagal = o.status === "SUDAH_DIAMBIL" && !!o.alasan_tidak_jadi;
                      const isTidakJadi = o.status === "TIDAK_JADI";

                      const rowBg = isTidakJadi
                        ? "bg-gradient-to-r from-rose-50/40 to-white hover:from-rose-50/60"
                        : isFromGagal
                        ? "bg-gradient-to-r from-amber-50/20 to-white hover:from-amber-50/40"
                        : "hover:bg-indigo-50/20";

                      return (
                        <tr key={o.id} className={`transition-all duration-150 ${rowBg}`}>

                          {/* # */}
                          <td className="pl-5 pr-4 py-4">
                            <span className="text-xs font-mono font-bold text-gray-300">
                              {String(idx + 1).padStart(2, "0")}
                            </span>
                          </td>

                          {/* Pelanggan */}
                          <td className="px-4 py-4 min-w-[130px]">
                            <p className="font-semibold text-slate-800 text-sm leading-tight">{o.nama}</p>
                            <p className="text-xs text-gray-400 mt-0.5 font-medium">{o.no_hp}</p>
                            {o.alamat && (
                              <p className="text-[10px] text-gray-300 truncate max-w-[120px] mt-0.5">{o.alamat}</p>
                            )}
                          </td>

                          {/* Laptop */}
                          <td className="px-4 py-4 min-w-[140px]">
                            <p className="font-semibold text-gray-700 text-sm leading-tight">{o.type_laptop}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {[o.cpu, o.ram, o.storage].filter(Boolean).join(" · ") || "—"}
                            </p>
                          </td>

                          {/* Keluhan */}
                          <td className="px-4 py-4 max-w-[160px]">
                            <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{o.keluhan}</p>
                          </td>

                          {/* Jam Masuk */}
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className="text-xs text-gray-400 font-medium">{formatDate(o.tanggal_masuk)}</span>
                          </td>

                          {/* Jam Done */}
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className="text-xs text-gray-400 font-medium">{formatDate(o.tanggal_selesai)}</span>
                          </td>

                          {/* Jam Diambil */}
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className="text-xs text-gray-400 font-medium">{formatDate(o.tanggal_diambil)}</span>
                          </td>

                          {/* Durasi Servis */}
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className="text-xs font-semibold text-gray-600 bg-gray-50 px-2.5 py-1 rounded-lg">
                              {getDuration(o.tanggal_masuk, o.tanggal_selesai)}
                            </span>
                          </td>

                          {/* Payment */}
                          <td className="px-4 py-4 whitespace-nowrap min-w-[110px]">
                            {fmtRupiah(o.payment_amount) ? (
                              <div className="flex flex-col">
                                <p className="text-xs font-bold text-emerald-600">{fmtRupiah(o.payment_amount)}</p>
                                <p className="text-[10px] text-gray-400 mt-0.5 font-medium">{o.payment_method || "CASH"}</p>
                              </div>
                            ) : isFromGagal ? (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-gray-100 text-gray-500 text-[10px] font-bold">
                                Gratis
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>

                          {/* Dibuat oleh */}
                          <td className="px-4 py-4">
                            <UserCell name={o.created_by_user?.name} color="blue" />
                          </td>

                          {/* Dikerjakan oleh */}
                          <td className="px-4 py-4">
                            <UserCell name={o.dikerjakan_by_user?.name} color="violet" />
                          </td>

                          {/* Diambil oleh */}
                          <td className="px-4 py-4">
                            <UserCell name={o.diambil_by_user?.name} color="emerald" />
                          </td>

                          {/* Status */}
                          <td className="px-4 py-4">
                            <ServiceStatusBadge status={o.status} />
                          </td>

                          {/* Ket. */}
                          <td className="px-4 py-4 max-w-[160px]">
                            {isFromGagal ? (
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-100 text-amber-700 text-[10px] font-bold whitespace-nowrap">
                                  <IconXSmall />
                                  Gagal Diperbaiki
                                </span>
                                {o.alasan_tidak_jadi && (
                                  <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-2 mt-1">
                                    {o.alasan_tidak_jadi}
                                  </p>
                                )}
                              </div>
                            ) : isTidakJadi && o.alasan_tidak_jadi ? (
                              <p className="text-[11px] text-rose-500 leading-relaxed line-clamp-2">
                                {o.alasan_tidak_jadi}
                              </p>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 bg-gradient-to-r from-slate-50/30 to-white">
                <p className="text-xs text-gray-400 font-medium">
                  Menampilkan <span className="font-semibold text-slate-600">{filtered.length}</span> dari <span className="font-semibold text-slate-600">{orders.length}</span> riwayat
                </p>
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="text-xs text-indigo-500 hover:text-indigo-700 font-semibold transition-all"
                  >
                    ✕ Hapus filter
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

// ── User Cell helper ───────────────────────────────────────────────────────────
function UserCell({ name, color }: { name?: string; color: "blue" | "violet" | "emerald" }) {
  if (!name) return <span className="text-xs text-gray-300 font-medium">—</span>;

  const colorMap: Record<string, string> = {
    blue:   "bg-gradient-to-br from-blue-100 to-blue-200 text-blue-700",
    violet: "bg-gradient-to-br from-indigo-100 to-purple-200 text-indigo-700",
    emerald:"bg-gradient-to-br from-emerald-100 to-teal-200 text-emerald-700",
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${colorMap[color]}`}>
        <span className="text-[9px] font-bold uppercase">{name.charAt(0)}</span>
      </div>
      <span className="text-xs text-gray-600 font-medium whitespace-nowrap">{name}</span>
    </div>
  );
}