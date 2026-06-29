"use client";
// src/app/dashboard/service/antrian/page.tsx

import { useState, useEffect, useRef } from "react";
import ServiceFormModal from "@/components/service/ServiceFormModal";
import ServiceConfirmDialog from "@/components/service/ServiceConfirmDialog";
import ServiceStatusBadge from "@/components/service/ServiceStatusBadge";
import ServiceDetailModal from "@/components/service/ServiceDetailModal";
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

function getDurationColor(masuk: string) {
  const diff = Math.floor((Date.now() - new Date(masuk).getTime()) / 60000);
  if (diff < 60) return "text-emerald-600 bg-emerald-50";
  if (diff < 180) return "text-amber-600 bg-amber-50";
  return "text-rose-600 bg-rose-50";
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

// ── Icons ─────────────────────────────────────────────────────────────────────
const IconRefresh = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
  </svg>
);
const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const IconClipboard = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
    <rect x="9" y="3" width="6" height="4" rx="1" />
    <line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="13" y2="16" />
  </svg>
);
const IconWrench = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
  </svg>
);
const IconQueue = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);
const IconPart = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" /><path d="M19.07 4.93l-1.41 1.41M5.34 18.66l-1.41 1.41M19.07 19.07l-1.41-1.41M5.34 5.34L3.93 3.93" />
    <path d="M12 2v2m0 16v2M2 12h2m16 0h2" />
  </svg>
);

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({
  icon, label, count, colorClass, accentBar,
}: {
  icon: React.ReactNode; label: string; count: number; colorClass: string; accentBar: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border px-5 py-4 bg-white ${colorClass}`}>
      <div className={`absolute top-0 left-0 w-1 h-full rounded-l-2xl ${accentBar}`} />
      <div className="flex items-center justify-between">
        <div>
          <p className="text-3xl font-black tracking-tight leading-none">{count}</p>
          <p className="text-xs font-semibold mt-1.5 opacity-70">{label}</p>
        </div>
        <div className="opacity-20">{icon}</div>
      </div>
    </div>
  );
}

// ── Action Button ─────────────────────────────────────────────────────────────
function ActionBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  const map: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700 hover:bg-blue-100 ring-blue-200",
    green: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 ring-emerald-200",
    orange: "bg-orange-50 text-orange-700 hover:bg-orange-100 ring-orange-200",
    rose: "bg-rose-50 text-rose-700 hover:bg-rose-100 ring-rose-200",
  };
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ring-1 ${map[color] || map.blue}`}
    >
      {label}
    </button>
  );
}

// ── Skeleton Row ──────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr className="border-b border-gray-50">
      {[48, 96, 80, 160, 72, 56, 64, 64, 100].map((w, i) => (
        <td key={i} className="px-4 py-3.5">
          <div className="h-3 rounded-full bg-gray-100 animate-pulse" style={{ width: w }} />
        </td>
      ))}
    </tr>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AntrianPage() {
  const { user } = useAuthUser();
  const { orders, loading, connected, refresh } = useAntrianRealtime();
  const [formOpen, setFormOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(DIALOG_CLOSED);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  // ✅ AFTER — ganti 2 baris ini
  const userRoles = user?.roles ?? (user?.role ? [user.role] : []);
  const canCreate = userRoles.some(r => (SERVICE_CREATE_ROLES as string[]).includes(r));
  const canAction = userRoles.some(r => (SERVICE_TEKNISI_ROLES as string[]).includes(r));

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

  const COLUMNS = ["#", "Pelanggan", "Laptop", "Keluhan", "Masuk", "Durasi", "Teknisi", "Status", "Aksi"];

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-[#F7F7F8]">

        {/* ── Top Header Bar ──────────────────────────────────────────────── */}
        <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-20">
          <div className="flex items-center justify-between">
            {/* Left: title + live dot */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#1a1a2e] flex items-center justify-center shrink-0">
                <IconWrench />
              </div>
              <div>
                <h1 className="text-base font-black text-[#1a1a2e] leading-tight tracking-tight">
                  Antrian Servis
                </h1>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {connected ? (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-semibold">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                      </span>
                      Live
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] text-gray-400 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-300 inline-block" />
                      Polling
                    </span>
                  )}
                  <span className="text-gray-200 text-xs">·</span>
                  <span className="text-[11px] text-gray-400 font-medium">
                    {orders.length} order aktif
                  </span>
                </div>
              </div>
            </div>

            {/* Right: actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={refresh}
                className="w-9 h-9 rounded-xl border border-gray-100 bg-white text-gray-400 hover:text-gray-700 hover:border-gray-200 hover:bg-gray-50 transition flex items-center justify-center"
                title="Refresh"
              >
                <IconRefresh />
              </button>
              {canCreate && (
                <button
                  onClick={() => setFormOpen(true)}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-[#1a1a2e] text-white text-xs font-bold rounded-xl hover:bg-[#2d2d4a] transition shadow-sm"
                >
                  <IconPlus />
                  Buat Formulir
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* ── Stat Cards ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              icon={<IconQueue />}
              label="Antrian"
              count={grouped.ANTRIAN.length}
              colorClass="border-yellow-100 text-yellow-800"
              accentBar="bg-yellow-400"
            />
            <StatCard
              icon={<IconWrench />}
              label="Sedang Dikerjakan"
              count={grouped.SEDANG_DIKERJAKAN.length}
              colorClass="border-blue-100 text-blue-800"
              accentBar="bg-blue-500"
            />
            <StatCard
              icon={<IconPart />}
              label="Tunggu Sparepart"
              count={grouped.MENUNGGU_SPAREPART.length}
              colorClass="border-orange-100 text-orange-800"
              accentBar="bg-orange-400"
            />
          </div>

          {/* ── Table Area ──────────────────────────────────────────────────── */}
          {loading ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    {COLUMNS.map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-wider whitespace-nowrap">
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
          ) : orders.length === 0 ? (
            /* ── Empty State ── */
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="flex flex-col items-center justify-center py-24 text-center px-6">
                <div className="w-16 h-16 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mb-5 text-gray-300">
                  <IconClipboard />
                </div>
                <p className="text-sm font-black text-[#1a1a2e]">Antrian kosong</p>
                <p className="text-xs text-gray-400 mt-1.5 max-w-xs leading-relaxed">
                  Semua order sudah selesai, atau belum ada order servis yang masuk hari ini.
                </p>
                {canCreate && (
                  <button
                    onClick={() => setFormOpen(true)}
                    className="mt-6 flex items-center gap-1.5 px-5 py-2.5 bg-[#1a1a2e] text-white text-xs font-bold rounded-xl hover:bg-[#2d2d4a] transition shadow-sm"
                  >
                    <IconPlus />
                    Buat Formulir Baru
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
                    {orders.map((o, idx) => (
                      <tr
                        key={o.id}
                        className="hover:bg-blue-50/30 transition-colors duration-100 cursor-pointer group"
                        onClick={() => setDetailId(o.id)}
                      >
                        {/* # */}
                        <td className="pl-5 pr-4 py-3.5">
                          <span className="text-[11px] font-mono font-bold text-gray-300 group-hover:text-gray-400 transition">
                            {String(idx + 1).padStart(2, "0")}
                          </span>
                        </td>

                        {/* Pelanggan */}
                        <td className="px-4 py-3.5">
                          <p className="font-bold text-[#1a1a2e] text-[13px] leading-tight">{o.nama}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5 font-medium">{o.no_hp}</p>
                        </td>

                        {/* Laptop */}
                        <td className="px-4 py-3.5 min-w-[140px]">
                          <p className="font-semibold text-gray-700 text-[13px] leading-tight">{o.type_laptop}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            {[o.cpu, o.ram].filter(Boolean).join(" · ") || "—"}
                          </p>
                        </td>

                        {/* Keluhan */}
                        <td className="px-4 py-3.5 max-w-[200px]">
                          <p className="text-[12px] text-gray-500 leading-relaxed line-clamp-2">{o.keluhan}</p>
                        </td>

                        {/* Masuk */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="text-[11px] text-gray-400 font-medium">{formatDate(o.tanggal_masuk)}</span>
                        </td>

                        {/* Durasi */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${getDurationColor(o.tanggal_masuk)}`}>
                            {getDuration(o.tanggal_masuk)}
                          </span>
                        </td>

                        {/* Teknisi */}
                        <td className="px-4 py-3.5">
                          {o.dikerjakan_by_user?.name ? (
                            <div className="flex items-center gap-1.5">
                              <div className="w-5 h-5 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
                                <span className="text-[9px] font-black text-violet-600 uppercase">
                                  {o.dikerjakan_by_user.name.charAt(0)}
                                </span>
                              </div>
                              <span className="text-[12px] text-gray-600 font-medium">{o.dikerjakan_by_user.name}</span>
                            </div>
                          ) : (
                            <span className="text-[11px] text-gray-300 font-medium">—</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3.5">
                          <ServiceStatusBadge status={o.status} />
                        </td>

                        {/* Aksi */}
                        <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                          {canAction && (
                            <div className="flex items-center gap-1 flex-wrap">
                              {o.status === "ANTRIAN" && (
                                <>
                                  <ActionBtn label="Mulai" color="blue" onClick={() => openDialog(o, "mulai")} />
                                  <ActionBtn label="Gagal" color="rose" onClick={() => openDialog(o, "gagal_diperbaiki")} />
                                </>
                              )}
                              {o.status === "SEDANG_DIKERJAKAN" && (
                                <>
                                  <ActionBtn label="Sparepart" color="orange" onClick={() => openDialog(o, "sparepart")} />
                                  <ActionBtn label="Done" color="green" onClick={() => openDialog(o, "done")} />
                                  <ActionBtn label="Gagal" color="rose" onClick={() => openDialog(o, "gagal_diperbaiki")} />
                                </>
                              )}
                              {o.status === "MENUNGGU_SPAREPART" && (
                                <>
                                  <ActionBtn label="Lanjut" color="blue" onClick={() => openDialog(o, "mulai")} />
                                  <ActionBtn label="Gagal" color="rose" onClick={() => openDialog(o, "gagal_diperbaiki")} />
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

              {/* Footer */}
              <div className="px-5 py-2.5 border-t border-gray-50 flex items-center justify-between">
                <p className="text-[11px] text-gray-300 font-medium">
                  Klik baris untuk melihat detail lengkap
                </p>
                <p className="text-[11px] text-gray-300 font-medium">
                  {orders.length} order
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Modals ──────────────────────────────────────────────────────── */}
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

        {/* ── Toast ───────────────────────────────────────────────────────── */}
        {toast && (
          <div
            className={`
              fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl
              text-sm font-bold text-white transition-all
              ${toast.type === "success" ? "bg-[#1a1a2e]" : "bg-rose-600"}
            `}
          >
            {toast.type === "success" ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            )}
            {toast.msg}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}