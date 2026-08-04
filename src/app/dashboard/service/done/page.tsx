"use client";

import { useState, useEffect, useRef } from "react";
import ServiceConfirmDialog from "@/components/service/ServiceConfirmDialog";
import ServiceStatusBadge from "@/components/service/ServiceStatusBadge";
import ServiceDetailModal from "@/components/service/ServiceDetailModal";
import ServicePaymentModal from "@/components/service/ServicePaymentModal";
import ServiceCicilanModal from "@/components/service/ServiceCicilanModal";
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
  action: "tidak_jadi" | "diambil_langsung" | "bayar_lunas" | ""; //  NEW — bayar_lunas
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
  }, []);

  const refresh = () => { setLoading(true); fetchREST(); };
  return { orders, loading, connected, refresh };
}

// ── Icons ──────────────────────────────────────────────────────────────────────
const IconRefresh = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
  </svg>
);

const IconCheckCircle = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const IconXCircle = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
  </svg>
);

const IconEmptyCheck = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const IconDollar = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
  </svg>
);

const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconCheckLg = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconBan = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
  </svg>
);

const IconInfo = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const IconClock = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);

// ── Stat Card ──────────────────────────────────────────────────────────────────
function StatCard({
  icon, label, count, gradient, iconBg, borderColor
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  gradient: string;
  iconBg: string;
  borderColor: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${borderColor} bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className={`bg-gradient-to-r ${gradient} bg-clip-text text-3xl font-black leading-none tracking-tight tabular-nums text-transparent`}>
            {count}
          </p>
          <p className="mt-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">
            {label}
          </p>
        </div>
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${iconBg} text-white shadow-sm`}>
          {icon}
        </div>
      </div>
      <span className={`absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r ${gradient} opacity-20`} aria-hidden />
    </div>
  );
}

// ── Action Types & Button ──────────────────────────────────────────────────────
type ActionColor = "emerald" | "rose" | "amber"; //  NEW — amber untuk tombol "Cicil"

type ActionItem = {
  key: string;
  label: string;
  color: ActionColor;
  icon: React.ReactNode;
  onClick: () => void;
};

const ACTION_VARIANTS: Record<ActionColor, string> = {
  emerald: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200 focus-visible:ring-emerald-300",
  rose: "bg-rose-50 text-rose-700 hover:bg-rose-100 border-rose-200 focus-visible:ring-rose-300",
  amber: "bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200 focus-visible:ring-amber-300", //  NEW
};

function ActionBtn({
  label,
  color,
  icon,
  onClick,
  size = "sm",
  block = false,
}: {
  label: string;
  color: ActionColor;
  icon: React.ReactNode;
  onClick: () => void;
  /** sm = di dalam tabel · md = di dalam card (target sentuh mobile) */
  size?: "sm" | "md";
  block?: boolean;
}) {
  const sizing =
    size === "md"
      ? "h-9 px-3 text-xs"
      : "h-7 px-3 text-[11px] min-w-[92px]";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border
        font-bold tracking-tight transition-all duration-150
        outline-none focus-visible:ring-2 focus-visible:ring-offset-1
        active:scale-95
        ${block ? "w-full" : ""}
        ${sizing}
        ${ACTION_VARIANTS[color]}
      `}
    >
      <span className="shrink-0">{icon}</span>
      {label}
    </button>
  );
}

/**
 * Grup tombol aksi — dipakai di dua tempat:
 * - variant="table" → 1 baris, rata kanan, TIDAK pernah wrap
 * - variant="card"  → grid full-width, tombol sejajar & mudah dipencet di HP
 */
function ActionGroup({
  actions,
  variant,
}: {
  actions: ActionItem[];
  variant: "table" | "card";
}) {
  if (actions.length === 0) return null;

  if (variant === "card") {
    const cols = actions.length >= 2 ? "grid-cols-2" : "grid-cols-1";
    return (
      <div className={`grid ${cols} gap-2`}>
        {actions.map(a => (
          <ActionBtn key={a.key} label={a.label} color={a.color} icon={a.icon} onClick={a.onClick} size="md" block />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-nowrap items-center justify-end gap-1.5">
      {actions.map(a => (
        <ActionBtn key={a.key} label={a.label} color={a.color} icon={a.icon} onClick={a.onClick} size="sm" />
      ))}
    </div>
  );
}

// ── Payment Value (dipakai tabel & card) ───────────────────────────────────────
function PaymentValue({ order, align = "left" }: { order: ServiceOrder; align?: "left" | "right" }) {
  const alignCls = align === "right" ? "items-end text-right" : "";

  if (order.payment_status === "DP") { //  NEW — tampilkan progress DP
    const total = Number(order.total_tagihan ?? 0);
    const paid = Number(order.payment_amount ?? 0);
    const sisa = Math.max(total - paid, 0);
    return (
      <div className={`flex flex-col ${alignCls}`}>
        <p className="text-xs font-black tabular-nums text-amber-600">
          {fmtRupiah(paid)} / {fmtRupiah(total)}
        </p>
        <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-500">
          DP · sisa {fmtRupiah(sisa)}
        </p>
      </div>
    );
  }

  if (order.payment_amount) {
    return (
      <div className={`flex flex-col ${alignCls}`}>
        <p className="text-xs font-black tabular-nums text-emerald-600">{fmtRupiah(order.payment_amount)}</p>
        <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">
          {order.payment_method || "CASH"}
        </p>
      </div>
    );
  }

  if (order.status === "GAGAL_DIPERBAIKI") {
    return <span className="text-xs font-medium text-gray-300">—</span>;
  }

  const est = Number(order.estimasi_harga ?? 0);
  const sp = Number(order.biaya_sparepart ?? 0);
  const total = est + sp;

  if (total > 0) {
    return (
      <div className={`flex flex-col ${alignCls}`}>
        <p className="text-xs font-black tabular-nums text-indigo-600">{fmtRupiah(total)}</p>
        <p className="mt-0.5 text-[10px] font-medium text-amber-500">estimasi · belum dibayar</p>
      </div>
    );
  }

  return <span className="text-xs font-medium text-amber-500">Konfirmasi saat diambil</span>;
}

// ── Skeletons ──────────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr className="border-b border-gray-50">
      {[28, 110, 130, 130, 80, 100, 100, 80, 190].map((w, i) => (
        <td key={i} className="px-4 py-4 first:pl-5 last:pr-5">
          <div
            className="h-3 animate-pulse rounded-full bg-gradient-to-r from-gray-100 to-gray-50"
            style={{ width: w }}
          />
        </td>
      ))}
    </tr>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-gray-200/60 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="h-3 w-32 animate-pulse rounded-full bg-gray-100" />
          <div className="h-3 w-24 animate-pulse rounded-full bg-gray-100" />
        </div>
        <div className="h-5 w-20 animate-pulse rounded-full bg-gray-100" />
      </div>
      <div className="mt-4 h-3 w-full animate-pulse rounded-full bg-gray-100" />
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="h-9 animate-pulse rounded-lg bg-gray-100" />
        <div className="h-9 animate-pulse rounded-lg bg-gray-100" />
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function DonePage() {
  const { orders, loading, connected, refresh } = useDoneRealtime();
  const [dialog, setDialog] = useState<DialogState>(DIALOG_CLOSED);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [paymentOrder, setPaymentOrder] = useState<ServiceOrder | null>(null);
  const [cicilanOrder, setCicilanOrder] = useState<ServiceOrder | null>(null); //  NEW — order yang lagi diisi cicilan
  const [pickupChoice, setPickupChoice] = useState<PickupChoiceState>({ open: false, order: null });
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleDiambilClick = (order: ServiceOrder) => {
    if (order.payment_status === "LUNAS") {
      //  NEW — sudah lunas dari pembayaran di muka, tinggal konfirmasi pengambilan fisik (gak perlu bayar lagi)
      setDialog({
        open: true,
        orderId: order.id,
      action: "diambil_langsung",
        title: "Konfirmasi Laptop Diambil",
        description: `Laptop "${order.nama} — ${order.type_laptop}" sudah lunas dibayar di muka. Konfirmasi laptop sudah diambil pelanggan?`,
        confirmLabel: "Ya, Sudah Diambil",
        confirmClass: "bg-emerald-600 hover:bg-emerald-700",
      });
    } else if (order.status === "DONE") {
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

  const handleConfirmDialog = async (reason?: string) => {
    const res = await fetch(`/api/service/${dialog.orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: dialog.action === "diambil_langsung" ? "diambil" : dialog.action,
        ...(reason ? { alasan: reason } : {}),
      }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || "Gagal");
    setDialog(DIALOG_CLOSED);
    showToast(
      dialog.action === "diambil_langsung"
        ? " Laptop berhasil ditandai sudah diambil."
        : dialog.action === "bayar_lunas" //  NEW
        ? " Pelunasan berhasil, laptop sudah diambil."
        : " Order ditandai tidak jadi."
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
      confirmClass: "bg-rose-600 hover:bg-rose-700",
      requireReason: true,
    });
  };

 //  NEW — klik "Lunas": konfirmasi lalu lunasi sisa DP sekaligus (masuk Riwayat)
  const handleLunasClick = (order: ServiceOrder) => {
    const sisa = Number(order.total_tagihan ?? 0) - Number(order.payment_amount ?? 0);
    setDialog({
      open: true,
      orderId: order.id,
      action: "bayar_lunas",
      title: "Konfirmasi Pelunasan",
      description: `Lunasi sisa tagihan "${order.nama} — ${order.type_laptop}" sebesar ${fmtRupiah(sisa)}?`,
      confirmLabel: "Ya, Lunas",
      confirmClass: "bg-emerald-600 hover:bg-emerald-700",
    });
  };

  //  NEW — klik "Cicil": buka popup input nominal cicilan
  const handleCicilClick = (order: ServiceOrder) => {
    setCicilanOrder(order);
  };

  //  NEW — submit nominal cicilan dari ServiceCicilanModal
  const handleCicilanConfirm = async (cicilanAmount: number) => {
    if (!cicilanOrder) return;
    const res = await fetch(`/api/service/${cicilanOrder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "bayar_cicilan", cicilan_amount: cicilanAmount }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || "Gagal");
    setCicilanOrder(null);
    showToast(
      json.data?.payment_status === "LUNAS"
        ? " Cicilan diterima, laptop sudah lunas & diambil."
        : " Cicilan diterima, sisa tagihan diperbarui."
    );
    refresh();
  };

  /**
   * Sumber tunggal daftar tombol aksi per order.
   * Kombinasi tombol PERSIS sama seperti sebelumnya:
   * - "Diambil" selalu ada
   * - "Tidak Jadi" hanya untuk status DONE
   *  NEW — kalau order lagi DP, tombolnya jadi "Lunas" & "Cicil"
   */
  const getActions = (o: ServiceOrder): ActionItem[] => {
    if (o.payment_status === "DP") { //  NEW
      return [
        {
          key: "lunas",
          label: "Lunas",
          color: "emerald",
          icon: <IconCheckLg />,
          onClick: () => handleLunasClick(o),
        },
        {
          key: "cicil",
          label: "Cicil",
          color: "amber",
          icon: <IconDollar />,
          onClick: () => handleCicilClick(o),
        },
      ];
    }

    const actions: ActionItem[] = [
      {
        key: "diambil",
        label: "Diambil",
        color: "emerald",
        icon: <IconCheck />,
        onClick: () => handleDiambilClick(o),
      },
    ];

    if (o.status === "DONE") {
      actions.push({
        key: "tidak_jadi",
        label: "Tidak Jadi",
        color: "rose",
        icon: <IconBan />,
        onClick: () => openTidakJadiDialog(o),
      });
    }

    return actions;
  };

  const handlePaymentConfirm = async (payment: {
    payment_amount: number;
    payment_note: string;
    payment_method: "CASH" | "TRANSFER" | "QRIS" | "DP"; //  NEW
    hasil_analisa?: string;
    payment_status?: "LUNAS" | "DP"; //  NEW
    total_tagihan?: number; //  NEW
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
    showToast(" Laptop berhasil ditandai sudah diambil & payment tersimpan!");
    refresh();
  };

  const doneOrders = orders.filter(o => o.status === "DONE");
  const gagalOrders = orders.filter(o => o.status === "GAGAL_DIPERBAIKI");

  const COLUMNS = ["No", "Pelanggan", "Laptop", "Selesai", "Total Waktu", "Teknisi", "Payment", "Status", "Aksi"];

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="sticky top-0 z-20 border-b border-gray-200/60 bg-white/70 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 sm:py-5">
            <div className="flex min-w-0 items-center gap-4">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20">
                <IconCheckCircle />
              </div>

              <div className="min-w-0">
                <h1 className="truncate text-xl font-black tracking-tight text-slate-800">
                  Selesai &amp; Gagal
                </h1>

                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {connected ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Live</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-2 py-0.5">
                      <span className="h-2 w-2 rounded-full bg-gray-300" />
                      <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Polling</span>
                    </span>
                  )}
                  <span className="text-gray-300">·</span>
                  <span className="truncate text-xs font-semibold text-gray-400 tabular-nums">
                    {orders.length} order menunggu diambil
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={refresh}
              title="Refresh"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-gray-200 bg-white text-gray-400 outline-none transition-all hover:border-gray-300 hover:bg-gray-50 hover:text-gray-700 focus-visible:ring-2 focus-visible:ring-gray-300 active:scale-95"
            >
              <IconRefresh />
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">

          {/* ── Stat Cards ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard
              icon={<IconCheckCircle />}
              label="Selesai — menunggu diambil"
              count={doneOrders.length}
              gradient="from-emerald-500 to-teal-500"
              iconBg="bg-gradient-to-br from-emerald-500 to-teal-500"
              borderColor="border-emerald-100"
            />
            <StatCard
              icon={<IconXCircle />}
              label="Gagal Diperbaiki"
              count={gagalOrders.length}
              gradient="from-rose-500 to-pink-500"
              iconBg="bg-gradient-to-br from-rose-500 to-pink-500"
              borderColor="border-rose-100"
            />
          </div>

          {/* ── Content ─────────────────────────────────────────────────────── */}
          {loading ? (
            <>
             {/* Desktop skeleton */}
              <div className="hidden overflow-hidden rounded-2xl border border-gray-200/60 bg-white shadow-sm lg:block">
                <div className="max-h-[65vh] overflow-auto"> {/*  NEW — freeze header */}
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        {COLUMNS.map(h => (
                          <th
                            key={h}
                            className="sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-4 py-3.5 text-left text-[10px] font-black uppercase tracking-wider text-gray-400 first:pl-5 last:pr-5"
                          >
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
              </div>

              {/* Mobile skeleton */}
              <div className="space-y-3 lg:hidden">
                {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
              </div>
            </>
          ) : orders.length === 0 ? (
            /* ── Empty State ── */
            <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm">
              <div className="flex flex-col items-center justify-center px-6 py-20 text-center sm:py-24">
                <div className="mb-6 grid h-20 w-20 place-items-center rounded-2xl border-2 border-dashed border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 text-emerald-400">
                  <IconEmptyCheck />
                </div>
                <h3 className="text-lg font-black tracking-tight text-slate-800">Belum Ada Order Selesai</h3>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-gray-400">
                  Order yang sudah selesai atau gagal diperbaiki akan muncul di sini untuk dikonfirmasi pengambilan.
                </p>
              </div>
            </div>
          ) : (
            <>
            {/* ── Desktop / Laptop: Table ─────────────────────────────────── */}
              <div className="hidden overflow-hidden rounded-2xl border border-gray-200/60 bg-white shadow-sm lg:block">
                <div className="max-h-[65vh] overflow-auto"> {/*  NEW — dibatasi tinggi + scroll 2 arah, header freeze di dalam sini */}
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        {COLUMNS.map((h, i) => (
                          <th
                            key={h}
                            className={`
                              sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-4 py-3.5 text-[10px] font-black uppercase tracking-wider text-gray-400
                              ${i === 0 ? "pl-5" : ""}
                              ${i === COLUMNS.length - 1 ? "pr-5 text-right" : "text-left"}
                            `}
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
                          className="group cursor-pointer transition-colors duration-150 hover:bg-indigo-50/30"
                          onClick={() => setDetailId(o.id)}
                        >
                          {/* No */}
                          <td className="py-4 pl-5 pr-4 align-middle">
                            <span className="font-mono text-xs font-black tabular-nums text-gray-300 transition group-hover:text-gray-500">
                              {String(idx + 1).padStart(2, "0")}
                            </span>
                          </td>

                          {/* Pelanggan */}
                          <td className="px-4 py-4 align-middle">
                            <p className="text-sm font-bold leading-tight text-slate-800">{o.nama}</p>
                            <p className="mt-0.5 text-xs font-medium tabular-nums text-gray-400">{o.no_hp}</p>
                          </td>

                          {/* Laptop */}
                          <td className="min-w-[160px] px-4 py-4 align-middle">
                            <p className="text-sm font-semibold leading-tight text-gray-700">{o.type_laptop}</p>
                            <p className="mt-0.5 text-xs text-gray-400">
                              {[o.cpu, o.ram].filter(Boolean).join(" · ") || "—"}
                            </p>
                          </td>

                          {/* Selesai */}
                          <td className="whitespace-nowrap px-4 py-4 align-middle">
                            <span className="text-xs font-medium text-gray-400">{formatDate(o.tanggal_selesai)}</span>
                          </td>

                          {/* Total Waktu */}
                          <td className="whitespace-nowrap px-4 py-4 align-middle">
                            <span className="inline-flex items-center gap-1.5 text-gray-500">
                              <IconClock />
                              <span className="text-xs font-bold tabular-nums text-gray-600">
                                {getDuration(o.tanggal_masuk, o.tanggal_selesai)}
                              </span>
                            </span>
                          </td>

                          {/* Teknisi */}
                          <td className="px-4 py-4 align-middle">
                            {o.dikerjakan_by_user?.name ? (
                              <div className="flex items-center gap-2">
                                <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-100 to-purple-100">
                                  <span className="text-[9px] font-black uppercase text-indigo-700">
                                    {o.dikerjakan_by_user.name.charAt(0)}
                                  </span>
                                </div>
                                <span className="whitespace-nowrap text-xs font-semibold text-gray-600">
                                  {o.dikerjakan_by_user.name}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs font-medium text-gray-300">—</span>
                            )}
                          </td>

                          {/* Payment — kalau belum dibayar, tampilkan ekspektasi (estimasi + sparepart) */}
                          <td className="min-w-[140px] px-4 py-4 align-middle">
                            <PaymentValue order={o} />
                          </td>

                          {/* Status */}
                          <td className="whitespace-nowrap px-4 py-4 align-middle">
                            <ServiceStatusBadge status={o.status} />
                          </td>

                          {/* Aksi — selalu 1 baris, rata kanan, lebar tombol seragam */}
                          <td
                            className="w-px whitespace-nowrap py-4 pl-4 pr-5 align-middle"
                            onClick={e => e.stopPropagation()}
                          >
                            <ActionGroup actions={getActions(o)} variant="table" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Footer */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 bg-gradient-to-r from-slate-50/40 to-white px-5 py-3">
                  <p className="text-xs font-medium text-gray-400">
                    Klik baris untuk melihat detail lengkap
                  </p>
                  <p className="text-xs font-bold text-gray-400">
                    Total: <span className="tabular-nums text-slate-800">{orders.length}</span> order
                  </p>
                </div>
              </div>

              {/* ── Mobile / Tablet: Card List ──────────────────────────────── */}
              <div className="space-y-3 lg:hidden">
                {orders.map((o, idx) => (
                  <div
                    key={o.id}
                    onClick={() => setDetailId(o.id)}
                    className="cursor-pointer overflow-hidden rounded-2xl border border-gray-200/60 bg-white shadow-sm transition-all active:scale-[0.99]"
                  >
                    {/* Head */}
                    <div className="flex items-start justify-between gap-3 px-4 pt-4">
                      <div className="flex min-w-0 items-start gap-2.5">
                        <span className="mt-0.5 shrink-0 rounded-md bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-black tabular-nums text-gray-400">
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold leading-tight text-slate-800">{o.nama}</p>
                          <p className="mt-0.5 text-xs font-medium tabular-nums text-gray-400">{o.no_hp}</p>
                        </div>
                      </div>
                      <div className="shrink-0">
                        <ServiceStatusBadge status={o.status} />
                      </div>
                    </div>

                    {/* Laptop */}
                    <div className="mt-3 px-4">
                      <p className="text-sm font-semibold leading-tight text-gray-700">{o.type_laptop}</p>
                      <p className="mt-0.5 text-xs text-gray-400">
                        {[o.cpu, o.ram].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>

                    {/* Meta */}
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 px-4">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1 text-gray-500">
                        <IconClock />
                        <span className="text-xs font-bold tabular-nums text-gray-600">
                          {getDuration(o.tanggal_masuk, o.tanggal_selesai)}
                        </span>
                      </span>

                      <span className="text-xs font-medium text-gray-400">{formatDate(o.tanggal_selesai)}</span>

                      {o.dikerjakan_by_user?.name && (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-100 to-purple-100">
                            <span className="text-[8px] font-black uppercase text-indigo-700">
                              {o.dikerjakan_by_user.name.charAt(0)}
                            </span>
                          </span>
                          <span className="text-xs font-semibold text-gray-600">{o.dikerjakan_by_user.name}</span>
                        </span>
                      )}
                    </div>

                    {/* Payment */}
                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-gray-50 px-4 pt-3">
                      <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                        Payment
                      </span>
                      <PaymentValue order={o} align="right" />
                    </div>

                    {/* Aksi — grid full-width, tinggi seragam */}
                    <div
                      className="mt-3 border-t border-gray-50 bg-slate-50/40 px-4 py-3"
                      onClick={e => e.stopPropagation()}
                    >
                      <ActionGroup actions={getActions(o)} variant="card" />
                    </div>
                  </div>
                ))}

                <div className="flex items-center justify-between px-1 pt-1">
                  <p className="text-xs font-medium text-gray-400"> Ketuk kartu untuk detail</p>
                  <p className="text-xs font-bold text-gray-400">
                    Total: <span className="tabular-nums text-slate-800">{orders.length}</span> order
                  </p>
                </div>
              </div>
            </>
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

        {/*  NEW — Popup nominal cicilan */}
        <ServiceCicilanModal
          open={!!cicilanOrder}
          order={cicilanOrder}
          onClose={() => setCicilanOrder(null)}
          onConfirm={handleCicilanConfirm}
        />

        {/* ── Pickup Choice Modal (GAGAL_DIPERBAIKI) ────────────────────────── */}
        {pickupChoice.open && pickupChoice.order && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setPickupChoice({ open: false, order: null })}
            />

            <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-200">

              {/* Modal Header */}
              <div className="border-b border-gray-100 bg-gradient-to-r from-slate-50/80 to-white px-6 py-5">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-rose-500 to-pink-500 text-white shadow-lg shadow-rose-500/20">
                    <IconInfo />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base font-black leading-tight tracking-tight text-slate-800">
                      Konfirmasi Pengambilan
                    </h2>
                    <p className="mt-0.5 truncate text-xs font-medium text-gray-400">
                      {pickupChoice.order.nama} · {pickupChoice.order.type_laptop}
                    </p>
                  </div>
                </div>
              </div>

              {/* Modal Body */}
              <div className="px-6 py-6">
                {/* Warning banner */}
                <div className="mb-6 flex items-start gap-3 rounded-xl border border-rose-100 bg-gradient-to-r from-rose-50 to-pink-50 p-4">
                  <div className="mt-0.5 shrink-0 rounded-lg bg-rose-100 p-1 text-rose-600">
                    <IconInfo />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-rose-800">Perhatian</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-rose-600">
                      Laptop ini <strong className="font-black">gagal diperbaiki</strong>. Apakah ada biaya diagnosa / penanganan yang perlu ditagihkan?
                    </p>
                  </div>
                </div>

                <p className="mb-3 text-[10px] font-black uppercase tracking-wider text-gray-400">
                  Pilih Opsi Pengambilan
                </p>

                <div className="space-y-3">
                  {/* Dengan payment */}
                  <button
                    type="button"
                    onClick={handleGagalWithPayment}
                    className="group flex w-full items-center gap-3 rounded-xl border-2 border-gray-200 px-4 py-3.5 text-left outline-none transition-all hover:border-emerald-300 hover:bg-emerald-50/50 focus-visible:ring-2 focus-visible:ring-emerald-300 active:scale-[0.99]"
                  >
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/20 transition-all group-hover:shadow-lg group-hover:shadow-emerald-500/30">
                      <IconDollar />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-800">Ada Biaya</p>
                      <p className="mt-0.5 text-xs text-gray-400">Isi nominal biaya diagnosa / penanganan</p>
                    </div>
                  </button>

                  {/* Tanpa payment */}
                  <button
                    type="button"
                    onClick={handleGagalWithoutPayment}
                    className="group flex w-full items-center gap-3 rounded-xl border-2 border-gray-200 px-4 py-3.5 text-left outline-none transition-all hover:border-gray-300 hover:bg-gray-50/50 focus-visible:ring-2 focus-visible:ring-gray-300 active:scale-[0.99]"
                  >
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-gray-400 to-gray-500 text-white shadow-md shadow-gray-400/20 transition-all group-hover:shadow-lg group-hover:shadow-gray-400/30">
                      <IconCheckLg />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-800">Gratis / Tanpa Biaya</p>
                      <p className="mt-0.5 text-xs text-gray-400">Laptop langsung dikembalikan ke pelanggan</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 pb-6">
                <button
                  type="button"
                  onClick={() => setPickupChoice({ open: false, order: null })}
                  className="h-10 w-full rounded-xl text-sm font-bold text-gray-400 outline-none transition hover:bg-gray-50 hover:text-gray-600 focus-visible:ring-2 focus-visible:ring-gray-300"
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
              fixed bottom-6 left-4 right-4 z-50 flex items-center gap-3 rounded-2xl px-5 py-3.5
              text-sm font-bold text-white shadow-xl ring-1 ring-black/5
              transition-all animate-in slide-in-from-right-5 duration-300
              sm:bottom-8 sm:left-auto sm:right-8 sm:max-w-md
              ${toast.type === "success"
                ? "bg-gradient-to-r from-emerald-500 to-teal-600"
                : "bg-gradient-to-r from-rose-500 to-pink-600"}
            `}
          >
            <span className="shrink-0">
              {toast.type === "success" ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              )}
            </span>
            <span className="leading-snug">{toast.msg}</span>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}