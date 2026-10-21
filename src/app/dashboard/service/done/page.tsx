"use client";

import { useState, useEffect, useRef } from "react";
import ServiceConfirmDialog from "@/components/service/ServiceConfirmDialog";
import ServiceStatusBadge from "@/components/service/ServiceStatusBadge";
import ServiceDetailModal from "@/components/service/ServiceDetailModal";
import ServicePaymentModal from "@/components/service/ServicePaymentModal";
import ServiceCicilanModal from "@/components/service/ServiceCicilanModal";
import ServiceSparepartDialog from "@/components/service/ServiceSparepartDialog"; //  NEW
import ServicePriceDialog from "@/components/service/ServicePriceDialog"; //  NEW — dipakai tombol Estimasi
import ServicePrepaymentModal from "@/components/service/ServicePrepaymentModal"; //  NEW — Bayar di muka
import type { ServiceOrder, ServiceStatus } from "@/types/service";
import DashboardLayout from "@/components/layout/DashboardLayout";

//  CHANGED — Data Services = SEMUA order yang belum tuntas diambil/dibatalkan
const DONE_STATUSES: ServiceStatus[] = [
  "ANTRIAN", "SEDANG_DIKERJAKAN", "MENUNGGU_SPAREPART",
  "DONE", "GAGAL_DIPERBAIKI", "DIBATALKAN",
];

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
  action: "tidak_jadi" | "diambil_langsung" | "bayar_lunas" | "batal_service" | "batal_diambil" | "klaim_garansi" | ""; //  CHANGED
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

const IconPart = () => ( //  NEW
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.7 2.7-2-2z" />
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
type ActionColor = "emerald" | "rose" | "amber" | "indigo" | "slate"; //  CHANGED — + Sparepart(indigo), Estimasi(slate)

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
  amber: "bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200 focus-visible:ring-amber-300",
  indigo: "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-200 focus-visible:ring-indigo-300", //  NEW
  slate: "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-300 focus-visible:ring-slate-400", //  NEW
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

  const sp = Number(order.biaya_sparepart ?? 0); //  FIX — cuma tampilkan biaya sparepart, gak dijumlah sama estimasi_harga

  if (sp > 0) {
    return (
      <div className={`flex flex-col ${alignCls}`}>
        <p className="text-xs font-black tabular-nums text-indigo-600">{fmtRupiah(sp)}</p>
        <p className="mt-0.5 text-[10px] font-medium text-amber-500">sparepart · belum dibayar</p>
      </div>
    );
  }

  return <span className="text-xs font-medium text-amber-500">Konfirmasi saat diambil</span>;
}

//  NEW — daftar sparepart yang sudah dimasukkan ke order
function SparepartCell({ order }: { order: ServiceOrder }) {
  const items = (order.sparepart_items ?? "").split("\n").map(s => s.trim()).filter(Boolean);
  if (items.length === 0) return <span className="text-xs font-medium text-gray-300">—</span>;
  return (
    <div className="flex flex-col gap-1">
      {items.map((it, i) => (
        <span key={i} className="inline-flex w-fit items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
          <IconPart />
          <span className="max-w-[180px] truncate">{it}</span>
        </span>
      ))}
    </div>
  );
}

// ── Skeletons ──────────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr className="border-b border-gray-50">
      {[28, 110, 130, 130, 80, 100, 120, 100, 80, 190].map((w, i) => (
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
  const [sparepartOrder, setSparepartOrder] = useState<ServiceOrder | null>(null); //  NEW — popup Sparepart
  const [estimasiOrder, setEstimasiOrder] = useState<ServiceOrder | null>(null); //  NEW — popup Estimasi
  const [prepaymentOrder, setPrepaymentOrder] = useState<ServiceOrder | null>(null); //  NEW — popup Bayar di muka
  const [estimasiChoice, setEstimasiChoice] = useState<ServiceOrder | null>(null); //  NEW — popup pilih Estimasi / Garansi
  const [pickupChoice, setPickupChoice] = useState<PickupChoiceState>({ open: false, order: null });
  const [search, setSearch] = useState(""); //  NEW — searchbar
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleDiambilClick = (order: ServiceOrder) => {
    if (order.payment_status === "LUNAS" && order.payment_amount) { //  FIX — payment_status bisa default "LUNAS" walau belum ada duit masuk sama sekali
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
      dialog.action === "diambil_langsung" || dialog.action === "batal_diambil"
        ? " Laptop berhasil ditandai sudah diambil."
        : dialog.action === "klaim_garansi"
          ? " Klaim garansi — laptop sudah diambil."
          : dialog.action === "bayar_lunas"
            ? " Pelunasan berhasil dicatat." //  CHANGED — lunas tidak lagi auto-diambil (2 langkah)
            : dialog.action === "batal_service"
              ? " Servis dibatalkan — menunggu diambil pelanggan."
              : " Order ditandai tidak jadi."
    );
    refresh();
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

  //  NEW — Sparepart (stok / manual), tidak ubah status perbaikan
  const handleSparepartConfirm = async (payload: {
    mode: "stock" | "manual";
    reason: string;
    price?: number;
    accessory_id?: string;
    unit_id?: string;
    serial_number?: string;
  }) => {
    if (!sparepartOrder) return;
    const res = await fetch(`/api/service/${sparepartOrder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "sparepart",
        alasan: payload.reason,
        sparepart_mode: payload.mode,
        sparepart_modal: payload.mode === "manual" ? payload.price : undefined,
        accessories_used:
          payload.mode === "stock" && payload.accessory_id
            ? [{ accessory_id: payload.accessory_id, unit_id: payload.unit_id, qty: 1 }]
            : undefined,
      }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || "Gagal mencatat sparepart");
    setSparepartOrder(null);
    showToast(" Sparepart dicatat.");
    refresh();
  };

  //  NEW — Estimasi (perkiraan, TIDAK masuk cashflow, tidak ubah status)
  const handleEstimasiConfirm = async (price: number) => {
    if (!estimasiOrder) return;
    const res = await fetch(`/api/service/${estimasiOrder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_estimasi", estimasi_harga: price }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || "Gagal menyimpan estimasi");
    setEstimasiOrder(null);
    showToast(" Estimasi biaya diperbarui.");
    refresh();
  };

  //  NEW — Bayar di muka (Lunas / DP), status servis tidak berubah
  const handlePrepaymentConfirm = async (payload: {
    payment_amount: number;
    payment_status: "LUNAS" | "DP";
    total_tagihan?: number;
    payment_method: "CASH" | "TRANSFER" | "QRIS";
    payment_note?: string;
    payment_proof_url: string;
  }) => {
    if (!prepaymentOrder) return;
    const res = await fetch(`/api/service/${prepaymentOrder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "bayar_dimuka", ...payload }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || "Gagal menyimpan pembayaran");
    setPrepaymentOrder(null);
    showToast(payload.payment_status === "LUNAS" ? " Pembayaran lunas dicatat." : " DP dicatat.");
    refresh();
  };

  //  NEW — Batal Services (langkah 1): isi alasan → status DIBATALKAN
  const openBatalDialog = (order: ServiceOrder) => {
    setDialog({
      open: true,
      orderId: order.id,
      action: "batal_service",
      title: "Batal Services",
      description: `Batalkan servis "${order.nama} — ${order.type_laptop}"? Laptop akan menunggu diambil pelanggan, lalu masuk Riwayat. Tulis alasannya.`,
      confirmLabel: "Batalkan Servis",
      confirmClass: "bg-rose-600 hover:bg-rose-700",
      requireReason: true,
    });
  };

  //  NEW — Batal Services (langkah 2): laptop (dibatalkan) sudah diambil → Riwayat
  const handleBatalDiambilClick = (order: ServiceOrder) => {
    setDialog({
      open: true,
      orderId: order.id,
      action: "batal_diambil",
      title: "Konfirmasi Laptop Diambil",
      description: `Laptop "${order.nama} — ${order.type_laptop}" (dibatalkan) sudah diambil pelanggan? Order akan masuk ke Riwayat.`,
      confirmLabel: "Ya, Sudah Diambil",
      confirmClass: "bg-emerald-600 hover:bg-emerald-700",
    });
  };

  //  NEW — Klaim Garansi: nominal 0, konfirmasi → laptop diambil → masuk Riwayat
  const openGaransiDialog = (order: ServiceOrder) => {
    setDialog({
      open: true,
      orderId: order.id,
      action: "klaim_garansi",
      title: "Klaim Garansi",
      description: `Klaim garansi untuk "${order.nama} — ${order.type_laptop}". Nominal Rp 0 (gratis). Konfirmasi laptop sudah diambil pelanggan?`,
      confirmLabel: "Diambil",
      confirmClass: "bg-amber-500 hover:bg-amber-600",
    });
  };

  /**
   * Sumber tunggal daftar tombol aksi per order (Data Services).
   * Tools (Sparepart/Estimasi) selalu ada; lifecycle pembayaran & pengambilan menyesuaikan state.
   */
  const getActions = (o: ServiceOrder): ActionItem[] => {
    //  Order sudah dibatalkan → tinggal konfirmasi diambil (langkah 2)
    if (o.status === "DIBATALKAN") {
      return [
        { key: "batal_diambil", label: "Diambil", color: "emerald", icon: <IconCheck />, onClick: () => handleBatalDiambilClick(o) },
      ];
    }

    // Tools CS — selalu tersedia, tidak mengubah status
    const actions: ActionItem[] = [
      { key: "sparepart", label: "Sparepart", color: "indigo", icon: <IconPart />, onClick: () => setSparepartOrder(o) },
      { key: "estimasi", label: "Estimasi", color: "slate", icon: <IconDollar />, onClick: () => setEstimasiChoice(o) },
    ];

    if (o.payment_status === "DP") {
      // Masih ada sisa → lunasi / cicil
      actions.push(
        { key: "lunas", label: "Lunas", color: "emerald", icon: <IconCheckLg />, onClick: () => handleLunasClick(o) },
        { key: "cicil", label: "Cicil", color: "amber", icon: <IconDollar />, onClick: () => handleCicilClick(o) },
      );
    } else if (o.payment_status === "LUNAS" && o.payment_amount) {
      // Sudah lunas → kalau servis sudah kelar, boleh diambil
      if (o.status === "DONE" || o.status === "GAGAL_DIPERBAIKI") {
        actions.push({ key: "diambil", label: "Diambil", color: "emerald", icon: <IconCheck />, onClick: () => handleDiambilClick(o) });
      }
    } else {
      // Belum ada pembayaran → Bayar (di muka). Yg masih proses bisa Batal, yg sudah kelar bisa Diambil.
      actions.push({ key: "bayar", label: "Bayar", color: "emerald", icon: <IconDollar />, onClick: () => setPrepaymentOrder(o) });
      if (o.status === "DONE" || o.status === "GAGAL_DIPERBAIKI") {
        actions.push({ key: "diambil", label: "Diambil", color: "emerald", icon: <IconCheck />, onClick: () => handleDiambilClick(o) });
      } else {
        actions.push({ key: "batal", label: "Batal", color: "rose", icon: <IconBan />, onClick: () => openBatalDialog(o) });
      }
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
    payment_proof_url?: string; //  NEW
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

  //  NEW — filter pencarian (dipakai di tabel & card)
  const q = search.trim().toLowerCase();
  const filtered = q
    ? orders.filter(o =>
      o.nama.toLowerCase().includes(q) ||
      o.no_hp.includes(q) ||
      o.type_laptop.toLowerCase().includes(q) ||
      o.keluhan.toLowerCase().includes(q))
    : orders;

  const COLUMNS = ["No", "Pelanggan", "Laptop", "Selesai", "Total Waktu", "Teknisi", "Sparepart", "Payment", "Status", "Aksi"];

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
                  Data Services
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
                    {orders.length} order aktif
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

          {/*  NEW — Search */}
          <div className="relative max-w-md">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-300">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            </span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari nama, no HP, laptop, keluhan..."
              className="h-10 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-9 text-sm outline-none transition placeholder:text-gray-300 focus:border-[#1a1a2e]/30 focus:ring-2 focus:ring-[#1a1a2e]/10"
            />
            {search && (
              <button onClick={() => setSearch("")} aria-label="Hapus pencarian" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            )}
          </div>

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
                      {filtered.map((o, idx) => (
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

                          {/* Sparepart — daftar part yang dimasukkan */}
                          <td className="min-w-[150px] max-w-[220px] px-4 py-4 align-middle">
                            <SparepartCell order={o} />
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
                {filtered.map((o, idx) => (
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

                    {/*  NEW — Sparepart */}
                    {(o.sparepart_items ?? "").trim() && (
                      <div className="mt-3 border-t border-gray-50 px-4 pt-3">
                        <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Sparepart</span>
                        <div className="mt-1.5"><SparepartCell order={o} /></div>
                      </div>
                    )}

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
          reasonLabel="Alasan"
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

        {/*  NEW — Sparepart (stok / manual) */}
        <ServiceSparepartDialog
          open={!!sparepartOrder}
          orderId={sparepartOrder?.id ?? ""}
          orderName={sparepartOrder?.nama ?? ""}
          orderType={sparepartOrder?.type_laptop ?? ""}
          defaultPrice={Number(sparepartOrder?.biaya_sparepart ?? 0)}
          onCancel={() => setSparepartOrder(null)}
          onConfirm={handleSparepartConfirm}
        />

        {/*  NEW — Estimasi biaya (perkiraan) */}
        <ServicePriceDialog
          open={!!estimasiOrder}
          title="Estimasi Biaya Servis"
          description={estimasiOrder ? `Perkiraan biaya untuk "${estimasiOrder.nama} — ${estimasiOrder.type_laptop}". Cuma perkiraan, tidak masuk cashflow & bisa diubah kapan saja.` : ""}
          confirmLabel="Simpan Estimasi"
          confirmClass="bg-[#1a1a2e] hover:bg-[#2d2d4a]"
          priceLabel="Estimasi Biaya"
          priceRequired
          defaultPrice={Number(estimasiOrder?.estimasi_harga ?? 0)}
          onCancel={() => setEstimasiOrder(null)}
          onConfirm={handleEstimasiConfirm}
        />

        {/*  NEW — Bayar di muka (Lunas / DP) */}
        <ServicePrepaymentModal
          open={!!prepaymentOrder}
          order={prepaymentOrder}
          onClose={() => setPrepaymentOrder(null)}
          onConfirm={handlePrepaymentConfirm}
        />

        {/*  NEW — Chooser: Estimasi Bayar / Klaim Garansi */}
        {estimasiChoice && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEstimasiChoice(null)} />
            <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="border-b border-gray-100 bg-gradient-to-r from-slate-50/80 to-white px-6 py-5">
                <h2 className="text-base font-black tracking-tight text-slate-800">Estimasi / Garansi</h2>
                <p className="mt-0.5 truncate text-xs font-medium text-gray-400">
                  {estimasiChoice.nama} · {estimasiChoice.type_laptop}
                </p>
              </div>
              <div className="space-y-3 px-6 py-6">
                <button
                  type="button"
                  onClick={() => { setEstimasiOrder(estimasiChoice); setEstimasiChoice(null); }}
                  className="group flex w-full items-center gap-3 rounded-xl border-2 border-gray-200 px-4 py-3.5 text-left outline-none transition-all hover:border-[#1a1a2e]/40 hover:bg-[#1a1a2e]/5 active:scale-[0.99]"
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#1a1a2e] text-white"><IconDollar /></div>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-800">Estimasi Bayar</p>
                    <p className="mt-0.5 text-xs text-gray-400">Isi perkiraan biaya servis (tidak masuk cashflow)</p>
                  </div>
                </button>

                {!estimasiChoice.payment_amount && (
                  <button
                    type="button"
                    onClick={() => { openGaransiDialog(estimasiChoice); setEstimasiChoice(null); }}
                    className="group flex w-full items-center gap-3 rounded-xl border-2 border-gray-200 px-4 py-3.5 text-left outline-none transition-all hover:border-amber-300 hover:bg-amber-50/50 active:scale-[0.99]"
                  >
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-800">Klaim Garansi</p>
                      <p className="mt-0.5 text-xs text-gray-400">Nominal Rp 0 — konfirmasi laptop langsung diambil</p>
                    </div>
                  </button>
                )}
              </div>
              <div className="px-6 pb-6">
                <button type="button" onClick={() => setEstimasiChoice(null)} className="h-10 w-full rounded-xl text-sm font-bold text-gray-400 transition hover:bg-gray-50 hover:text-gray-600">Batal</button>
              </div>
            </div>
          </div>
        )}

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