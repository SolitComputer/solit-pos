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
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
  </svg>
);
const IconSearch = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);
const IconHistory = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="12 8 12 12 14 14" />
    <path d="M3.05 11a9 9 0 1 0 .5-4H1" />
    <polyline points="1 3 1 7 5 7" />
  </svg>
);
const IconDoc = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="13" y2="17" />
  </svg>
);
const IconXSmall = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
  </svg>
);

// ── Skeleton Row ───────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr className="border-b border-gray-50">
      {[40, 96, 80, 120, 80, 80, 80, 64, 80, 60, 60, 60, 64, 100].map((w, i) => (
        <td key={i} className="px-4 py-3.5">
          <div className="h-3 rounded-full bg-gray-100 animate-pulse" style={{ width: w }} />
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
      <div className="min-h-screen bg-[#F7F7F8]">

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#1a1a2e] flex items-center justify-center shrink-0 text-white">
                <IconHistory />
              </div>
              <div>
                <h1 className="text-base font-black text-[#1a1a2e] leading-tight tracking-tight">
                  Riwayat Servis
                </h1>
                <p className="text-[11px] text-gray-400 font-medium mt-0.5">
                  {orders.length} total riwayat tersimpan
                </p>
              </div>
            </div>
            <button
              onClick={fetchOrders}
              className="w-9 h-9 rounded-xl border border-gray-100 bg-white text-gray-400 hover:text-gray-700 hover:border-gray-200 hover:bg-gray-50 transition flex items-center justify-center"
              title="Refresh"
            >
              <IconRefresh />
            </button>
          </div>
        </div>

        {/* ── Filter Bar ────────────────────────────────────────────────────── */}
        <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300">
              <IconSearch />
            </span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari nama, no HP, laptop..."
              className="w-full pl-9 pr-3 py-2 text-[13px] border border-gray-100 bg-gray-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/10 focus:border-[#1a1a2e]/30 focus:bg-white transition placeholder:text-gray-300"
            />
          </div>

          {/* Status Filter Pills */}
          <div className="flex items-center gap-1.5">
            {(["ALL", ...HISTORY_STATUSES] as const).map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition ${
                  filterStatus === s
                    ? "bg-[#1a1a2e] text-white shadow-sm"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {s === "ALL" ? "Semua" : STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* ── Stat Cards ──────────────────────────────────────────────────── */}
          {!loading && orders.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {/* Sudah Diambil */}
              <div className="relative overflow-hidden rounded-2xl border border-emerald-100 bg-white px-5 py-4 text-emerald-800">
                <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl bg-emerald-500" />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-3xl font-black tracking-tight leading-none">{sudahDiambilCount}</p>
                    <p className="text-xs font-semibold mt-1.5 opacity-70">Sudah Diambil</p>
                  </div>
                  <div className="opacity-20">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Tidak Jadi */}
              <div className="relative overflow-hidden rounded-2xl border border-red-100 bg-white px-5 py-4 text-red-800">
                <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl bg-red-400" />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-3xl font-black tracking-tight leading-none">{tidakJadiCount}</p>
                    <p className="text-xs font-semibold mt-1.5 opacity-70">Tidak Jadi</p>
                  </div>
                  <div className="opacity-20">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Table Area ──────────────────────────────────────────────────── */}
          {loading ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    {COLUMNS.map(h => (
                      <th key={h} className="px-4 py-3.5 text-left text-[10px] font-black text-gray-400 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3, 4].map(i => <SkeletonRow key={i} />)}
                </tbody>
              </table>
            </div>
          ) : filtered.length === 0 ? (
            /* ── Empty State ── */
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="flex flex-col items-center justify-center py-24 text-center px-6">
                <div className="w-16 h-16 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mb-5 text-gray-300">
                  <IconDoc />
                </div>
                <p className="text-sm font-black text-[#1a1a2e]">Tidak ada riwayat</p>
                <p className="text-xs text-gray-400 mt-1.5 max-w-xs leading-relaxed">
                  {search
                    ? `Tidak ada hasil untuk "${search}". Coba kata kunci lain.`
                    : "Belum ada order yang selesai atau tidak jadi."}
                </p>
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="mt-4 px-4 py-2 text-xs font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-xl transition"
                  >
                    Hapus pencarian
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* ── Main Table ── */
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      {COLUMNS.map(h => (
                        <th
                          key={h}
                          className="px-4 py-3.5 text-left text-[10px] font-black text-gray-400 uppercase tracking-wider whitespace-nowrap first:pl-5"
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
                        ? "bg-red-50/40 hover:bg-red-50/70"
                        : isFromGagal
                        ? "bg-rose-50/20 hover:bg-rose-50/40"
                        : "hover:bg-blue-50/30";

                      return (
                        <tr key={o.id} className={`transition-colors duration-100 ${rowBg}`}>

                          {/* # */}
                          <td className="pl-5 pr-4 py-3.5">
                            <span className="text-[11px] font-mono font-bold text-gray-300">
                              {String(idx + 1).padStart(2, "0")}
                            </span>
                          </td>

                          {/* Pelanggan */}
                          <td className="px-4 py-3.5 min-w-[130px]">
                            <p className="font-bold text-[#1a1a2e] text-[13px] leading-tight">{o.nama}</p>
                            <p className="text-[11px] text-gray-400 mt-0.5 font-medium">{o.no_hp}</p>
                            {o.alamat && (
                              <p className="text-[10px] text-gray-300 truncate max-w-[120px] mt-0.5">{o.alamat}</p>
                            )}
                          </td>

                          {/* Laptop */}
                          <td className="px-4 py-3.5 min-w-[140px]">
                            <p className="font-semibold text-gray-700 text-[13px] leading-tight">{o.type_laptop}</p>
                            <p className="text-[11px] text-gray-400 mt-0.5">
                              {[o.cpu, o.ram, o.storage].filter(Boolean).join(" · ") || "—"}
                            </p>
                          </td>

                          {/* Keluhan */}
                          <td className="px-4 py-3.5 max-w-[160px]">
                            <p className="text-[12px] text-gray-500 leading-relaxed line-clamp-2">{o.keluhan}</p>
                          </td>

                          {/* Jam Masuk */}
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className="text-[11px] text-gray-400 font-medium">{formatDate(o.tanggal_masuk)}</span>
                          </td>

                          {/* Jam Done */}
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className="text-[11px] text-gray-400 font-medium">{formatDate(o.tanggal_selesai)}</span>
                          </td>

                          {/* Jam Diambil */}
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className="text-[11px] text-gray-400 font-medium">{formatDate(o.tanggal_diambil)}</span>
                          </td>

                          {/* Durasi Servis */}
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className="text-[11px] font-mono font-bold text-gray-500 bg-gray-50 px-2 py-0.5 rounded-lg">
                              {getDuration(o.tanggal_masuk, o.tanggal_selesai)}
                            </span>
                          </td>

                          {/* Payment */}
                          <td className="px-4 py-3.5 whitespace-nowrap min-w-[110px]">
                            {fmtRupiah(o.payment_amount) ? (
                              <div>
                                <p className="text-[12px] font-bold text-emerald-700">{fmtRupiah(o.payment_amount)}</p>
                                <p className="text-[10px] text-gray-400 mt-0.5 font-medium">{o.payment_method || "CASH"}</p>
                              </div>
                            ) : isFromGagal ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-gray-100 text-gray-500 text-[10px] font-bold">
                                Gratis
                              </span>
                            ) : (
                              <span className="text-[11px] text-gray-300">—</span>
                            )}
                          </td>

                          {/* Dibuat oleh */}
                          <td className="px-4 py-3.5">
                            <UserCell name={o.created_by_user?.name} color="blue" />
                          </td>

                          {/* Dikerjakan oleh */}
                          <td className="px-4 py-3.5">
                            <UserCell name={o.dikerjakan_by_user?.name} color="violet" />
                          </td>

                          {/* Diambil oleh */}
                          <td className="px-4 py-3.5">
                            <UserCell name={o.diambil_by_user?.name} color="emerald" />
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3.5">
                            <ServiceStatusBadge status={o.status} />
                          </td>

                          {/* Ket. */}
                          <td className="px-4 py-3.5 max-w-[160px]">
                            {isFromGagal ? (
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-100 text-rose-700 text-[10px] font-bold whitespace-nowrap">
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
                              <p className="text-[11px] text-red-500 leading-relaxed line-clamp-2">
                                {o.alasan_tidak_jadi}
                              </p>
                            ) : (
                              <span className="text-[11px] text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              <div className="px-5 py-2.5 border-t border-gray-50 flex items-center justify-between">
                <p className="text-[11px] text-gray-300 font-medium">
                  Menampilkan {filtered.length} dari {orders.length} riwayat
                </p>
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="text-[11px] text-gray-400 hover:text-gray-600 font-semibold transition"
                  >
                    Hapus filter
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
  if (!name) return <span className="text-[11px] text-gray-300 font-medium">—</span>;

  const colorMap: Record<string, string> = {
    blue:   "bg-blue-100 text-blue-600",
    violet: "bg-violet-100 text-violet-600",
    emerald:"bg-emerald-100 text-emerald-600",
  };

  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${colorMap[color]}`}>
        <span className="text-[9px] font-black uppercase">{name.charAt(0)}</span>
      </div>
      <span className="text-[12px] text-gray-600 font-medium whitespace-nowrap">{name}</span>
    </div>
  );
}
