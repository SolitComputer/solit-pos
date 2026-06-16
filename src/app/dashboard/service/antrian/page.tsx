"use client";
// src/app/dashboard/service/antrian/page.tsx

import { useEffect, useState, useCallback } from "react";
import ServiceFormModal from "@/components/service/ServiceFormModal";
import ServiceConfirmDialog from "@/components/service/ServiceConfirmDialog";
import ServiceStatusBadge from "@/components/service/ServiceStatusBadge";
import type { ServiceOrder, ServiceStatus } from "@/types/service";
import { useAuthUser } from "@/hooks/useAuthUser";
import { SERVICE_CREATE_ROLES, SERVICE_TEKNISI_ROLES, hasPermission } from "@/lib/permissions";
import type { UserRole } from "@/lib/permissions";
import DashboardLayout from "@/components/layout/DashboardLayout";

const AKTIF_STATUSES: ServiceStatus[] = ["ANTRIAN", "SEDANG_DIKERJAKAN", "MENUNGGU_SPAREPART"];

function getDuration(masuk: string, selesai?: string): string {
  const start = new Date(masuk).getTime();
  const end = selesai ? new Date(selesai).getTime() : Date.now();
  const diff = Math.floor((end - start) / 1000 / 60);
  if (diff < 60) return `${diff} mnt`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  if (h < 24) return `${h} j ${m} mnt`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return `${d} hr ${rh} j`;
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

type DialogState = {
  open: boolean;
  orderId: string;
  action: "mulai" | "sparepart" | "done" | "";
  title: string;
  description: string;
  confirmLabel: string;
  confirmClass?: string;
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
};

const DIALOG_CLOSED: DialogState = {
  open: false, orderId: "", action: "",
  title: "", description: "", confirmLabel: "",
};

export default function AntrianPage() {
  const { user } = useAuthUser();
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(DIALOG_CLOSED);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const canCreate = user ? hasPermission(user.role as UserRole, SERVICE_CREATE_ROLES) : false;
  const canUpdateStatus = user ? hasPermission(user.role as UserRole, SERVICE_TEKNISI_ROLES) : false;

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = AKTIF_STATUSES.map(s => `status=${s}`).join("&");
      const res = await fetch(`/api/service?${params}`);
      const json = await res.json();
      if (json.success) setOrders(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const openDialog = (order: ServiceOrder, action: DialogState["action"]) => {
    const configs: Record<string, Omit<DialogState, "open" | "orderId" | "action">> = {
      mulai: {
        title: "Mulai Pengerjaan",
        description: `Tandai "${order.nama} — ${order.type_laptop}" sebagai sedang dikerjakan oleh kamu?`,
        confirmLabel: "Ya, Mulai Kerjakan",
        confirmClass: "bg-blue-600 hover:bg-blue-700",
      },
      sparepart: {
        title: "Menunggu Sparepart",
        description: `Tandai order ini sebagai menunggu sparepart? Tulis keterangan sparepart yang dibutuhkan.`,
        confirmLabel: "Tandai Menunggu Sparepart",
        confirmClass: "bg-orange-600 hover:bg-orange-700",
        requireReason: true,
        reasonLabel: "Keterangan Sparepart",
        reasonPlaceholder: "cth: butuh baterai 14.8V model XYZ...",
      },
      done: {
        title: "Selesaikan Pekerjaan",
        description: `Tandai "${order.nama} — ${order.type_laptop}" sebagai SELESAI dikerjakan?`,
        confirmLabel: "Ya, Tandai Selesai",
        confirmClass: "bg-emerald-600 hover:bg-emerald-700",
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
    // ✅ Tutup dialog dulu, baru toast + refresh
    setDialog(DIALOG_CLOSED);
    showToast("Status berhasil diperbarui!");
    fetchOrders();
  };

  const groupedOrders = {
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
              <p className="text-xs text-gray-400 mt-0.5">{orders.length} order aktif</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchOrders}
                className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition"
                title="Refresh"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
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

        {/* Content */}
        <div className="p-6 space-y-6">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-24 bg-white rounded-2xl animate-pulse border border-gray-100" />
              ))}
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
                <button
                  onClick={() => setFormOpen(true)}
                  className="mt-4 px-4 py-2 bg-[#1a1a2e] text-white text-sm font-semibold rounded-xl hover:bg-[#2d2d4a] transition"
                >
                  + Buat Formulir Baru
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Antrian", count: groupedOrders.ANTRIAN.length, color: "text-yellow-700 bg-yellow-50 border-yellow-200" },
                  { label: "Sedang Dikerjakan", count: groupedOrders.SEDANG_DIKERJAKAN.length, color: "text-blue-700 bg-blue-50 border-blue-200" },
                  { label: "Menunggu Sparepart", count: groupedOrders.MENUNGGU_SPAREPART.length, color: "text-orange-700 bg-orange-50 border-orange-200" },
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
                        {["No", "Pelanggan", "Laptop", "Keluhan", "Masuk", "Durasi", "Dikerjakan oleh", "Status", "Aksi"].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map(o => (
                        <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                          <td className="px-4 py-3 text-gray-400 text-xs font-mono">{o.no_urut}</td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-gray-800 text-sm">{o.nama}</p>
                            <p className="text-xs text-gray-400">{o.no_hp}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-700 text-sm">{o.type_laptop}</p>
                            <p className="text-xs text-gray-400">
                              {[o.cpu, o.ram, o.storage].filter(Boolean).join(" · ") || "—"}
                            </p>
                          </td>
                          <td className="px-4 py-3 max-w-[200px]">
                            <p className="text-xs text-gray-600 line-clamp-2">{o.keluhan}</p>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                            {formatDate(o.tanggal_masuk)}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap font-mono">
                            {getDuration(o.tanggal_masuk)}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {o.dikerjakan_by_user?.name || "—"}
                          </td>
                          <td className="px-4 py-3">
                            <ServiceStatusBadge status={o.status} />
                          </td>
                          <td className="px-4 py-3">
                            {canUpdateStatus && (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {o.status === "ANTRIAN" && (
                                  <ActionBtn label="Mulai" color="blue" onClick={() => openDialog(o, "mulai")} />
                                )}
                                {o.status === "SEDANG_DIKERJAKAN" && (
                                  <>
                                    <ActionBtn label="Sparepart" color="orange" onClick={() => openDialog(o, "sparepart")} />
                                    <ActionBtn label="Done" color="green" onClick={() => openDialog(o, "done")} />
                                  </>
                                )}
                                {o.status === "MENUNGGU_SPAREPART" && (
                                  <ActionBtn label="Lanjut Kerja" color="blue" onClick={() => openDialog(o, "mulai")} />
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modals */}
        <ServiceFormModal
          open={formOpen}
          onClose={() => setFormOpen(false)}
          onSuccess={() => {
            showToast("Formulir berhasil dibuat!");
            fetchOrders();
          }}
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

        {/* Toast */}
        {toast && (
          <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white transition-all ${toast.type === "success" ? "bg-emerald-600" : "bg-red-600"
            }`}>
            {toast.msg}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function ActionBtn({
  label, color, onClick,
}: {
  label: string;
  color: "blue" | "green" | "orange" | "red";
  onClick: () => void;
}) {
  const colorMap = {
    blue: "bg-blue-50 text-blue-700 hover:bg-blue-100",
    green: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
    orange: "bg-orange-50 text-orange-700 hover:bg-orange-100",
    red: "bg-red-50 text-red-700 hover:bg-red-100",
  };
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${colorMap[color]}`}
    >
      {label}
    </button>
  );
}