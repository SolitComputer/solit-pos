"use client";
// src/app/dashboard/service/antrian/page.tsx

import { useState, useEffect, useRef } from "react";
import ServiceFormModal from "@/components/service/ServiceFormModal";
import ServiceConfirmDialog from "@/components/service/ServiceConfirmDialog";
import ServiceStatusBadge from "@/components/service/ServiceStatusBadge";
import ServiceDetailModal from "@/components/service/ServiceDetailModal";
// ✅ ServicePaymentModal DIHAPUS — payment sekarang di halaman Done
import type { ServiceOrder, ServiceStatus } from "@/types/service";
import { useAuthUser } from "@/hooks/useAuthUser";
import { SERVICE_CREATE_ROLES, SERVICE_TEKNISI_ROLES, hasPermission } from "@/lib/permissions";
import type { UserRole } from "@/lib/permissions";
import DashboardLayout from "@/components/layout/DashboardLayout";

const AKTIF_STATUSES: ServiceStatus[] = ["ANTRIAN", "SEDANG_DIKERJAKAN", "MENUNGGU_SPAREPART"];

function getDuration(masuk: string) {
  const diff = Math.floor((Date.now() - new Date(masuk).getTime()) / 60000);
  if (diff < 60) return `${diff} mnt`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h} j ${diff % 60} mnt`;
  return `${Math.floor(h / 24)} hr ${h % 24} j`;
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

type DialogState = {
  open: boolean;
  orderId: string;
  // ✅ Tambah "done" ke union type
  action: "mulai" | "sparepart" | "gagal_diperbaiki" | "done" | "";
  title: string;
  description: string;
  confirmLabel: string;
  confirmClass?: string;
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
};

const DIALOG_CLOSED: DialogState = { open: false, orderId: "", action: "", title: "", description: "", confirmLabel: "" };

function useAntrianRealtime() {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const fallbackRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchREST = async () => {
    try {
      const params = AKTIF_STATUSES.map(s => `status=${s}`).join("&");
      const res = await fetch(`/api/service?${params}`);
      const json = await res.json();
      if (json.success) setOrders(json.data ?? []);
    } finally {
      setLoading(false);
    }
  };

  const connect = () => {
    esRef.current?.close();
    if (typeof EventSource === "undefined") { fetchREST(); return; }

    const es = new EventSource("/api/service/stream/internal");
    esRef.current = es;

    const handle = (e: MessageEvent) => {
      try {
        const all: ServiceOrder[] = JSON.parse(e.data).orders ?? [];
        setOrders(all.filter(o => (AKTIF_STATUSES as string[]).includes(o.status)));
        setConnected(true);
        setLoading(false);
        if (fallbackRef.current) { clearInterval(fallbackRef.current); fallbackRef.current = null; }
      } catch { }
    };

    es.addEventListener("init", handle);
    es.addEventListener("update", handle);
    es.addEventListener("error", () => {
      setConnected(false);
      es.close();
      esRef.current = null;
      if (!fallbackRef.current) fallbackRef.current = setInterval(fetchREST, 15_000);
      reconnectRef.current = setTimeout(connect, 10_000);
    });
  };

  useEffect(() => {
    fetchREST();
    connect();
    return () => {
      esRef.current?.close();
      if (fallbackRef.current) clearInterval(fallbackRef.current);
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, []); // eslint-disable-line

  const refresh = () => { setLoading(true); fetchREST(); };
  return { orders, loading, connected, refresh };
}

export default function AntrianPage() {
  const { user } = useAuthUser();
  const { orders, loading, connected, refresh } = useAntrianRealtime();
  const [formOpen, setFormOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(DIALOG_CLOSED);
  const [detailId, setDetailId] = useState<string | null>(null);
  // ✅ HAPUS: paymentOrder state
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const canCreate = user ? hasPermission(user.role as UserRole, SERVICE_CREATE_ROLES) : false;
  const canAction = user ? hasPermission(user.role as UserRole, SERVICE_TEKNISI_ROLES) : false;

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const openDialog = (order: ServiceOrder, action: DialogState["action"]) => {
    const configs: Record<string, Omit<DialogState, "open" | "orderId" | "action">> = {
      mulai: {
        title: "Mulai Pengerjaan",
        description: `Tandai "${order.nama} — ${order.type_laptop}" sebagai sedang dikerjakan?`,
        confirmLabel: "Ya, Mulai Kerjakan",
        confirmClass: "bg-blue-600 hover:bg-blue-700",
      },
      sparepart: {
        title: "Menunggu Sparepart",
        description: "Tulis keterangan sparepart yang dibutuhkan.",
        confirmLabel: "Tandai Menunggu Sparepart",
        confirmClass: "bg-orange-600 hover:bg-orange-700",
        requireReason: true,
        reasonLabel: "Keterangan Sparepart",
        reasonPlaceholder: "cth: butuh baterai 14.8V...",
      },
      // ✅ Done sekarang cukup dialog konfirmasi biasa, TANPA payment
      done: {
        title: "Tandai Selesai",
        description: `Tandai "${order.nama} — ${order.type_laptop}" sebagai SELESAI? Payment akan dikonfirmasi saat pelanggan mengambil laptop.`,
        confirmLabel: "Ya, Tandai Selesai",
        confirmClass: "bg-emerald-600 hover:bg-emerald-700",
      },
      gagal_diperbaiki: {
        title: "Tandai Gagal Diperbaiki",
        description: `Tandai "${order.nama} — ${order.type_laptop}" sebagai GAGAL diperbaiki? Tulis alasannya.`,
        confirmLabel: "Tandai Gagal Diperbaiki",
        confirmClass: "bg-rose-600 hover:bg-rose-700",
        requireReason: true,
        reasonLabel: "Alasan Gagal",
        reasonPlaceholder: "cth: komponen sudah tidak tersedia...",
      },
    };
    if (!action || !configs[action]) return;
    setDialog({ open: true, orderId: order.id, action, ...configs[action] });
  };

  const handleDialogConfirm = async (reason?: string) => {
    const res = await fetch(`/api/service/${dialog.orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: dialog.action, alasan: reason }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || "Gagal memperbarui status");
    setDialog(DIALOG_CLOSED);
    // ✅ Pesan berbeda untuk action done
    showToast(
      dialog.action === "done"
        ? "Order ditandai selesai! Payment dikonfirmasi saat pelanggan mengambil."
        : "Status berhasil diperbarui!"
    );
    refresh();
  };

  const grouped = {
    ANTRIAN: orders.filter(o => o.status === "ANTRIAN"),
    SEDANG_DIKERJAKAN: orders.filter(o => o.status === "SEDANG_DIKERJAKAN"),
    MENUNGGU_SPAREPART: orders.filter(o => o.status === "MENUNGGU_SPAREPART"),
  };

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-[#1a1a2e]">Antrian Servis</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-xs text-gray-400">{orders.length} order aktif</p>
                <span className="text-gray-300">·</span>
                {connected ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                    </span>
                    Live
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">Polling</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={refresh} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition" title="Refresh">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
                </svg>
              </button>
              {canCreate && (
                <button
                  onClick={() => setFormOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-[#1a1a2e] text-white text-sm font-semibold rounded-xl hover:bg-[#2d2d4a] transition"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Buat Formulir
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-20 bg-white rounded-2xl animate-pulse border border-gray-100" />)}
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-gray-400">
                  <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
                  <rect x="9" y="3" width="6" height="4" rx="1" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-600">Tidak ada antrian aktif</p>
              <p className="text-xs text-gray-400 mt-1">Semua order sudah selesai atau belum ada order masuk</p>
              {canCreate && (
                <button onClick={() => setFormOpen(true)} className="mt-4 px-4 py-2 bg-[#1a1a2e] text-white text-sm font-semibold rounded-xl hover:bg-[#2d2d4a] transition">
                  + Buat Formulir Baru
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Antrian", count: grouped.ANTRIAN.length, color: "text-yellow-700 bg-yellow-50 border-yellow-200" },
                  { label: "Sedang Dikerjakan", count: grouped.SEDANG_DIKERJAKAN.length, color: "text-blue-700 bg-blue-50 border-blue-200" },
                  { label: "Menunggu Sparepart", count: grouped.MENUNGGU_SPAREPART.length, color: "text-orange-700 bg-orange-50 border-orange-200" },
                ].map(s => (
                  <div key={s.label} className={`rounded-xl px-4 py-3 border ${s.color}`}>
                    <p className="text-2xl font-bold">{s.count}</p>
                    <p className="text-xs font-medium mt-0.5 opacity-80">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Table */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        {["No", "Pelanggan", "Laptop", "Keluhan", "Masuk", "Durasi", "Oleh", "Status", "Aksi"].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map(o => (
                        <tr
                          key={o.id}
                          className="border-b border-gray-50 hover:bg-gray-50 transition cursor-pointer"
                          onClick={() => setDetailId(o.id)}
                        >
                          <td className="px-4 py-3 text-gray-400 text-xs font-mono">{o.no_urut}</td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-gray-800 text-sm">{o.nama}</p>
                            <p className="text-xs text-gray-400">{o.no_hp}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-700 text-sm">{o.type_laptop}</p>
                            <p className="text-xs text-gray-400">{[o.cpu, o.ram].filter(Boolean).join(" · ") || "—"}</p>
                          </td>
                          <td className="px-4 py-3 max-w-[180px]">
                            <p className="text-xs text-gray-600 line-clamp-2">{o.keluhan}</p>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(o.tanggal_masuk)}</td>
                          <td className="px-4 py-3 text-xs text-gray-500 font-mono whitespace-nowrap">{getDuration(o.tanggal_masuk)}</td>
                          <td className="px-4 py-3 text-xs text-gray-500">{o.dikerjakan_by_user?.name || "—"}</td>
                          <td className="px-4 py-3"><ServiceStatusBadge status={o.status} /></td>
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            {canAction && (
                              <div className="flex items-center gap-1 flex-wrap">
                                {o.status === "ANTRIAN" && (
                                  <>
                                    <Btn label="Mulai" color="blue" onClick={() => openDialog(o, "mulai")} />
                                    <Btn label="Gagal" color="rose" onClick={() => openDialog(o, "gagal_diperbaiki")} />
                                  </>
                                )}
                                {o.status === "SEDANG_DIKERJAKAN" && (
                                  <>
                                    <Btn label="Sparepart" color="orange" onClick={() => openDialog(o, "sparepart")} />
                                    {/* ✅ Done sekarang buka dialog biasa, bukan payment modal */}
                                    <Btn label="Done" color="green" onClick={() => openDialog(o, "done")} />
                                    <Btn label="Gagal" color="rose" onClick={() => openDialog(o, "gagal_diperbaiki")} />
                                  </>
                                )}
                                {o.status === "MENUNGGU_SPAREPART" && (
                                  <>
                                    <Btn label="Lanjut" color="blue" onClick={() => openDialog(o, "mulai")} />
                                    <Btn label="Gagal" color="rose" onClick={() => openDialog(o, "gagal_diperbaiki")} />
                                  </>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="px-4 py-2 text-xs text-gray-400 border-t border-gray-50">
                  Klik baris untuk melihat detail lengkap
                </p>
              </div>
            </>
          )}
        </div>

        {/* Modals */}
        <ServiceFormModal
          open={formOpen}
          onClose={() => setFormOpen(false)}
          onSuccess={() => { showToast("Formulir berhasil dibuat!"); refresh(); }}
        />

        <ServiceConfirmDialog
          open={dialog.open}
          title={dialog.title}
          description={dialog.description}
          confirmLabel={dialog.confirmLabel}
          confirmClass={dialog.confirmClass}
          requireReason={dialog.requireReason}
          reasonLabel={dialog.reasonLabel}
          reasonPlaceholder={dialog.reasonPlaceholder}
          onCancel={() => setDialog(DIALOG_CLOSED)}
          onConfirm={handleDialogConfirm}
        />

        <ServiceDetailModal orderId={detailId} onClose={() => setDetailId(null)} />

        {/* ✅ ServicePaymentModal DIHAPUS dari sini */}

        {toast && (
          <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${toast.type === "success" ? "bg-emerald-600" : "bg-red-600"}`}>
            {toast.msg}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function Btn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  const map: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700 hover:bg-blue-100",
    green: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
    orange: "bg-orange-50 text-orange-700 hover:bg-orange-100",
    rose: "bg-rose-50 text-rose-700 hover:bg-rose-100",
  };
  return (
    <button onClick={onClick} className={`px-2 py-1 rounded-lg text-xs font-semibold transition ${map[color] || map.blue}`}>
      {label}
    </button>
  );
}