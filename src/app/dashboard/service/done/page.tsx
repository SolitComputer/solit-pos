"use client";

import { useState, useEffect, useRef } from "react";
import ServiceConfirmDialog from "@/components/service/ServiceConfirmDialog";
import ServiceStatusBadge from "@/components/service/ServiceStatusBadge";
import ServiceDetailModal from "@/components/service/ServiceDetailModal";
import ServicePaymentModal from "@/components/service/ServicePaymentModal";
import type { ServiceOrder, ServiceStatus } from "@/types/service";
import DashboardLayout from "@/components/layout/DashboardLayout";

const DONE_STATUSES: ServiceStatus[] = ["DONE", "GAGAL_DIPERBAIKI"];

function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function getDuration(masuk: string, selesai?: string) {
  if (!selesai) return "—";
  const diff = Math.floor((new Date(selesai).getTime() - new Date(masuk).getTime()) / 60000);
  if (diff < 60) return `${diff} mnt`;
  const h = Math.floor(diff / 60);
  return h < 24 ? `${h} j ${diff % 60} mnt` : `${Math.floor(h / 24)} hr ${h % 24} j`;
}

function fmtRupiah(n?: number) {
  if (!n) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

type DialogState = {
  open: boolean;
  orderId: string;
  action: "tidak_jadi" | "diambil_langsung" | "";
  title: string;
  description: string;
  confirmLabel: string;
  confirmClass?: string;
  requireReason?: boolean;
};
const DIALOG_CLOSED: DialogState = {
  open: false, orderId: "", action: "", title: "", description: "", confirmLabel: ""
};

type PickupChoiceState = { open: boolean; order: ServiceOrder | null };

function useDoneRealtime() {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const fallbackRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchREST = async () => {
    try {
      const params = DONE_STATUSES.map(s => `status=${s}`).join("&");
      const res = await fetch(`/api/service?${params}`);
      const json = await res.json();
      if (json.success) setOrders(json.data ?? []);
    } finally { setLoading(false); }
  };

  const connect = () => {
    esRef.current?.close();
    if (typeof EventSource === "undefined") { fetchREST(); return; }
    const es = new EventSource("/api/service/stream/internal");
    esRef.current = es;
    const handle = (e: MessageEvent) => {
      try {
        const all: ServiceOrder[] = JSON.parse(e.data).orders ?? [];
        setOrders(all.filter(o => (DONE_STATUSES as string[]).includes(o.status)));
        setConnected(true); setLoading(false);
        if (fallbackRef.current) { clearInterval(fallbackRef.current); fallbackRef.current = null; }
      } catch { }
    };
    es.addEventListener("init", handle);
    es.addEventListener("update", handle);
    es.addEventListener("error", () => {
      setConnected(false); es.close(); esRef.current = null;
      if (!fallbackRef.current) fallbackRef.current = setInterval(fetchREST, 15_000);
      reconnectRef.current = setTimeout(connect, 10_000);
    });
  };

  useEffect(() => {
    fetchREST(); connect();
    return () => {
      esRef.current?.close();
      if (fallbackRef.current) clearInterval(fallbackRef.current);
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, []); // eslint-disable-line

  const refresh = () => { setLoading(true); fetchREST(); };
  return { orders, loading, connected, refresh };
}

// ── Icons ──────────────────────────────────────────────────────────────────────
const IconRefresh = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
  </svg>
);
const IconCheckCircle = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);
const IconXCircle = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
  </svg>
);
const IconEmptyCheck = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);
const IconDollar = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
  </svg>
);
const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const IconInfo = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

// ── Stat Card ──────────────────────────────────────────────────────────────────
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

// ── Skeleton Row ───────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr className="border-b border-gray-50">
      {[48, 96, 80, 88, 64, 64, 80, 64, 100].map((w, i) => (
        <td key={i} className="px-4 py-3.5">
          <div className="h-3 rounded-full bg-gray-100 animate-pulse" style={{ width: w }} />
        </td>
      ))}
    </tr>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function DonePage() {
  const { orders, loading, connected, refresh } = useDoneRealtime();
  const [dialog, setDialog] = useState<DialogState>(DIALOG_CLOSED);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [paymentOrder, setPaymentOrder] = useState<ServiceOrder | null>(null);
  const [pickupChoice, setPickupChoice] = useState<PickupChoiceState>({ open: false, order: null });
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleDiambilClick = (order: ServiceOrder) => {
    if (order.status === "DONE") {
      setPaymentOrder(order);
    } else {
      setPickupChoice({ open: true, order });
    }
  };

  const handleGagalWithPayment = () => {
    if (!pickupChoice.order) return;
    setPaymentOrder(pickupChoice.order);
    setPickupChoice({ open: false, order: null });
  };

  const handleGagalWithoutPayment = () => {
    if (!pickupChoice.order) return;
    setDialog({
      open: true,
      orderId: pickupChoice.order.id,
      action: "diambil_langsung",
      title: "Konfirmasi Laptop Diambil",
      description: `Laptop "${pickupChoice.order.nama} — ${pickupChoice.order.type_laptop}" dikonfirmasi sudah diambil tanpa payment?`,
      confirmLabel: "Ya, Sudah Diambil",
      confirmClass: "bg-emerald-600 hover:bg-emerald-700",
    });
    setPickupChoice({ open: false, order: null });
  };

  const handleConfirmDialog = async () => {
    const res = await fetch(`/api/service/${dialog.orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: dialog.action === "diambil_langsung" ? "diambil" : dialog.action,
      }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || "Gagal");
    setDialog(DIALOG_CLOSED);
    showToast(
      dialog.action === "diambil_langsung"
        ? "Laptop berhasil ditandai sudah diambil."
        : "Order ditandai tidak jadi."
    );
    refresh();
  };

  const openTidakJadiDialog = (order: ServiceOrder) => {
    setDialog({
      open: true,
      orderId: order.id,
      action: "tidak_jadi",
      title: "Tandai Tidak Jadi",
      description: `Order "${order.nama}" akan masuk ke History dengan status TIDAK JADI. Tulis alasannya.`,
      confirmLabel: "Tandai Tidak Jadi",
      confirmClass: "bg-red-600 hover:bg-red-700",
      requireReason: true,
    });
  };

  const handlePaymentConfirm = async (payment: {
    payment_amount: number;
    payment_note: string;
    payment_method: "CASH" | "TRANSFER" | "QRIS";
    hasil_analisa?: string;
  }) => {
    if (!paymentOrder) return;
    const res = await fetch(`/api/service/${paymentOrder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "diambil", ...payment }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || "Gagal");
    setPaymentOrder(null);
    showToast("Laptop berhasil ditandai sudah diambil & payment tersimpan!");
    refresh();
  };

  const doneOrders = orders.filter(o => o.status === "DONE");
  const gagalOrders = orders.filter(o => o.status === "GAGAL_DIPERBAIKI");

  const COLUMNS = ["No", "Pelanggan", "Laptop", "Selesai", "Total Waktu", "Teknisi", "Payment", "Status", "Aksi"];

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-[#F7F7F8]">

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#1a1a2e] flex items-center justify-center shrink-0 text-white">
                <IconCheckCircle />
              </div>
              <div>
                <h1 className="text-base font-black text-[#1a1a2e] leading-tight tracking-tight">
                  Selesai & Gagal
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
                    {orders.length} order menunggu diambil
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={refresh}
              className="w-9 h-9 rounded-xl border border-gray-100 bg-white text-gray-400 hover:text-gray-700 hover:border-gray-200 hover:bg-gray-50 transition flex items-center justify-center"
              title="Refresh"
            >
              <IconRefresh />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* ── Stat Cards ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={<IconCheckCircle />}
              label="Selesai — menunggu diambil"
              count={doneOrders.length}
              colorClass="border-emerald-100 text-emerald-800"
              accentBar="bg-emerald-500"
            />
            <StatCard
              icon={<IconXCircle />}
              label="Gagal Diperbaiki"
              count={gagalOrders.length}
              colorClass="border-rose-100 text-rose-800"
              accentBar="bg-rose-500"
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
                  {[1, 2, 3].map(i => <SkeletonRow key={i} />)}
                </tbody>
              </table>
            </div>
          ) : orders.length === 0 ? (
            /* ── Empty State ── */
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="flex flex-col items-center justify-center py-24 text-center px-6">
                <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-5 text-emerald-400">
                  <IconEmptyCheck />
                </div>
                <p className="text-sm font-black text-[#1a1a2e]">Belum ada order selesai</p>
                <p className="text-xs text-gray-400 mt-1.5 max-w-xs leading-relaxed">
                  Order yang sudah selesai atau gagal diperbaiki akan muncul di sini untuk dikonfirmasi pengambilan.
                </p>
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

                        {/* Selesai */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="text-[11px] text-gray-400 font-medium">{formatDate(o.tanggal_selesai)}</span>
                        </td>

                        {/* Total Waktu */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="text-[11px] font-mono font-bold text-gray-500 bg-gray-50 px-2 py-0.5 rounded-lg">
                            {getDuration(o.tanggal_masuk, o.tanggal_selesai)}
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

                        {/* Payment */}
                        <td className="px-4 py-3.5 min-w-[120px]">
                          {o.payment_amount ? (
                            <div>
                              <p className="text-[12px] font-bold text-emerald-700">{fmtRupiah(o.payment_amount)}</p>
                              <p className="text-[10px] text-gray-400 mt-0.5 font-medium">{o.payment_method || "CASH"}</p>
                            </div>
                          ) : (
                            <span className={`text-[11px] font-medium ${o.status === "GAGAL_DIPERBAIKI" ? "text-gray-300" : "text-amber-500"}`}>
                              {o.status === "GAGAL_DIPERBAIKI" ? "—" : "Konfirmasi saat diambil"}
                            </span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3.5">
                          <ServiceStatusBadge status={o.status} />
                        </td>

                        {/* Aksi */}
                        <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              onClick={() => handleDiambilClick(o)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 ring-1 ring-emerald-200 transition whitespace-nowrap"
                            >
                              ✓ Diambil
                            </button>
                            {o.status === "DONE" && (
                              <button
                                onClick={() => openTidakJadiDialog(o)}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 ring-1 ring-rose-200 transition whitespace-nowrap"
                              >
                                Tidak Jadi
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              <div className="px-5 py-2.5 border-t border-gray-50 flex items-center justify-between">
                <p className="text-[11px] text-gray-300 font-medium">Klik baris untuk melihat detail</p>
                <p className="text-[11px] text-gray-300 font-medium">{orders.length} order</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Modals ────────────────────────────────────────────────────────── */}
        <ServiceDetailModal orderId={detailId} onClose={() => setDetailId(null)} />

        <ServiceConfirmDialog
          open={dialog.open}
          title={dialog.title}
          description={dialog.description}
          confirmLabel={dialog.confirmLabel}
          confirmClass={dialog.confirmClass}
          requireReason={dialog.requireReason}
          reasonLabel="Alasan Tidak Jadi"
          reasonPlaceholder="Tuliskan alasannya..."
          onCancel={() => setDialog(DIALOG_CLOSED)}
          onConfirm={handleConfirmDialog}
        />

        <ServicePaymentModal
          open={!!paymentOrder}
          order={paymentOrder}
          onClose={() => setPaymentOrder(null)}
          onConfirm={handlePaymentConfirm}
        />

        {/* ── Pickup Choice Modal (GAGAL_DIPERBAIKI) ────────────────────────── */}
        {pickupChoice.open && pickupChoice.order && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setPickupChoice({ open: false, order: null })}
            />
            <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">

              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#1a1a2e] flex items-center justify-center shrink-0 text-white">
                    <IconCheckCircle />
                  </div>
                  <div>
                    <h2 className="text-[15px] font-black text-[#1a1a2e] leading-tight">Konfirmasi Pengambilan</h2>
                    <p className="text-[11px] text-gray-400 mt-0.5 font-medium">
                      {pickupChoice.order.nama} · {pickupChoice.order.type_laptop}
                    </p>
                  </div>
                </div>
              </div>

              {/* Modal Body */}
              <div className="px-6 py-5">
                {/* Warning banner */}
                <div className="flex items-start gap-2.5 p-3.5 bg-rose-50 border border-rose-100 rounded-xl mb-5">
                  <span className="text-rose-500 mt-0.5 shrink-0"><IconInfo /></span>
                  <p className="text-[12px] text-rose-700 leading-relaxed">
                    Laptop ini <strong className="font-black">gagal diperbaiki</strong>. Apakah ada biaya diagnosa / penanganan yang perlu ditagihkan?
                  </p>
                </div>

                <p className="text-[12px] text-gray-500 font-semibold mb-3 uppercase tracking-wider">Pilih opsi pengambilan</p>

                <div className="space-y-2.5">
                  {/* Dengan payment */}
                  <button
                    onClick={handleGagalWithPayment}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 border-gray-100 hover:border-emerald-300 hover:bg-emerald-50/50 transition text-left group"
                  >
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 group-hover:bg-emerald-200 flex items-center justify-center shrink-0 transition text-emerald-700">
                      <IconDollar />
                    </div>
                    <div>
                      <p className="text-[13px] font-bold text-[#1a1a2e]">Ada Biaya</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">Isi nominal biaya diagnosa / penanganan</p>
                    </div>
                  </button>

                  {/* Tanpa payment */}
                  <button
                    onClick={handleGagalWithoutPayment}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 border-gray-100 hover:border-gray-300 hover:bg-gray-50 transition text-left group"
                  >
                    <div className="w-9 h-9 rounded-xl bg-gray-100 group-hover:bg-gray-200 flex items-center justify-center shrink-0 transition text-gray-600">
                      <IconCheck />
                    </div>
                    <div>
                      <p className="text-[13px] font-bold text-[#1a1a2e]">Gratis / Tanpa Biaya</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">Laptop langsung dikembalikan ke pelanggan</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 pb-5">
                <button
                  onClick={() => setPickupChoice({ open: false, order: null })}
                  className="w-full py-2.5 text-[13px] font-semibold text-gray-400 hover:text-gray-600 transition rounded-xl hover:bg-gray-50"
                >
                  Batal
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Toast ─────────────────────────────────────────────────────────── */}
        {toast && (
          <div
            className={`
              fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl
              text-sm font-bold text-white
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