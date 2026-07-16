"use client";
// src/app/dashboard/service/antrian/page.tsx

import { useState, useEffect, useRef } from "react";
import ServiceFormModal from "@/components/service/ServiceFormModal";
import ServiceConfirmDialog from "@/components/service/ServiceConfirmDialog";
import ServicePriceDialog from "@/components/service/ServicePriceDialog";
import ServiceSparepartDialog from "@/components/service/ServiceSparepartDialog";
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

function fmtRupiah(n?: number | null) {
  const num = Number(n ?? 0);
  if (!num) return null;
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(num);
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

type PriceDialogState = {
  open: boolean;
  orderId: string;
  action: "mulai" | "sparepart" | "";
  title: string;
  description: string;
  confirmLabel: string;
  confirmClass?: string;
  priceLabel: string;
  defaultPrice: number;
  withReason: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  reasonRequired?: boolean;
};
const PRICE_DIALOG_CLOSED: PriceDialogState = {
  open: false, orderId: "", action: "", title: "", description: "",
  confirmLabel: "", priceLabel: "", defaultPrice: 0, withReason: false,
};

type SparepartDialogState = {
  open: boolean;
  orderId: string;
  orderName: string;
  orderType: string;
  defaultPrice: number;
};
const SPAREPART_DIALOG_CLOSED: SparepartDialogState = {
  open: false, orderId: "", orderName: "", orderType: "", defaultPrice: 0
};

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
  }, []);

  const refresh = () => { setLoading(true); fetchREST(); };
  return { orders, loading, connected, refresh };
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const IconRefresh = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
  </svg>
);

const IconPlus = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const IconClipboard = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
    <rect x="9" y="3" width="6" height="4" rx="1" />
    <line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="13" y2="16" />
  </svg>
);

const IconWrench = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
  </svg>
);

const IconQueue = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

const IconPart = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" /><path d="M19.07 4.93l-1.41 1.41M5.34 18.66l-1.41 1.41M19.07 19.07l-1.41-1.41M5.34 5.34L3.93 3.93" />
    <path d="M12 2v2m0 16v2M2 12h2m16 0h2" />
  </svg>
);

const IconCheck = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconX = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({
  icon, label, count, color, bgColor, borderColor, accentColor
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  color: string;
  bgColor: string;
  borderColor: string;
  accentColor: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${borderColor} bg-white px-5 py-4 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5`}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${accentColor}`} aria-hidden />
      <div className="flex items-center justify-between gap-4 pl-2">
        <div className="min-w-0">
          <p className={`text-3xl font-black tracking-tight tabular-nums leading-none ${color}`}>
            {count}
          </p>
          <p className="mt-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">
            {label}
          </p>
        </div>
        <div className={`shrink-0 grid place-items-center w-11 h-11 rounded-xl ${bgColor} ${color}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

// ── Action Types & Button ─────────────────────────────────────────────────────
type ActionColor = "blue" | "green" | "orange" | "rose" | "purple";

type ActionItem = {
  label: string;
  color: ActionColor;
  onClick: () => void;
};

const ACTION_VARIANTS: Record<ActionColor, string> = {
  blue: "bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200 focus-visible:ring-blue-300",
  green: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200 focus-visible:ring-emerald-300",
  orange: "bg-orange-50 text-orange-700 hover:bg-orange-100 border-orange-200 focus-visible:ring-orange-300",
  rose: "bg-rose-50 text-rose-700 hover:bg-rose-100 border-rose-200 focus-visible:ring-rose-300",
  purple: "bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-200 focus-visible:ring-purple-300",
};

function ActionBtn({
  label,
  color,
  onClick,
  size = "sm",
  block = false,
}: {
  label: string;
  color: ActionColor;
  onClick: () => void;
  /** sm = di dalam tabel · md = di dalam card (mobile, target sentuh lebih besar) */
  size?: "sm" | "md";
  /** block = lebar penuh mengikuti grid parent */
  block?: boolean;
}) {
  const sizing =
    size === "md"
      ? "h-9 px-3 text-xs"
      : "h-7 px-3 text-[11px] min-w-[72px]";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        inline-flex items-center justify-center whitespace-nowrap rounded-lg border
        font-bold tracking-tight transition-all duration-150
        outline-none focus-visible:ring-2 focus-visible:ring-offset-1
        active:scale-95
        ${block ? "w-full" : ""}
        ${sizing}
        ${ACTION_VARIANTS[color]}
      `}
    >
      {label}
    </button>
  );
}

/**
 * Grup tombol aksi — dipakai di dua tempat:
 * - variant="table" → 1 baris, rata kanan, TIDAK pernah wrap (flex-nowrap)
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
    const cols = actions.length >= 3 ? "grid-cols-3" : "grid-cols-2";
    return (
      <div className={`grid ${cols} gap-2`}>
        {actions.map(a => (
          <ActionBtn key={a.label} label={a.label} color={a.color} onClick={a.onClick} size="md" block />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-nowrap items-center justify-end gap-1.5">
      {actions.map(a => (
        <ActionBtn key={a.label} label={a.label} color={a.color} onClick={a.onClick} size="sm" />
      ))}
    </div>
  );
}

// ── Skeletons ─────────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr className="border-b border-gray-50">
      {[28, 110, 130, 170, 90, 60, 100, 90, 80, 150].map((w, i) => (
        <td key={i} className="px-4 py-4 first:pl-5 last:pr-5">
          <div className="h-3 rounded-full bg-gray-100 animate-pulse" style={{ width: w }} />
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

// ── Estimasi cell (dipakai tabel & card) ──────────────────────────────────────
function EstimasiValue({ order, align = "left" }: { order: ServiceOrder; align?: "left" | "right" }) {
  const est = Number(order.estimasi_harga ?? 0);
  const sp = Number(order.biaya_sparepart ?? 0);
  const total = est + sp;

  if (total <= 0) return <span className="text-xs font-medium text-gray-300">—</span>;

  return (
    <div className={`flex flex-col ${align === "right" ? "items-end text-right" : ""}`}>
      <span className="text-xs font-black tabular-nums text-indigo-600">{fmtRupiah(total)}</span>
      {sp > 0 && (
        <span className="mt-0.5 text-[10px] font-medium text-gray-400">
          jasa {fmtRupiah(est) ?? "Rp 0"} + part {fmtRupiah(sp)}
        </span>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AntrianPage() {
  const { user } = useAuthUser();
  const { orders, loading, connected, refresh } = useAntrianRealtime();
  const [formOpen, setFormOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(DIALOG_CLOSED);
  const [priceDialog, setPriceDialog] = useState<PriceDialogState>(PRICE_DIALOG_CLOSED);
  const [sparepartDialog, setSparepartDialog] = useState<SparepartDialogState>(SPAREPART_DIALOG_CLOSED);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const userRoles = user?.roles ?? (user?.role ? [user.role] : []);
  const canCreate = userRoles.some(r => (SERVICE_CREATE_ROLES as string[]).includes(r));
  const canAction = userRoles.some(r => (SERVICE_TEKNISI_ROLES as string[]).includes(r));

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const openDialog = (order: ServiceOrder, action: DialogState["action"]) => {
    const configs: Record<string, Omit<DialogState, "open" | "orderId" | "action">> = {
      mulai: {
        title: "Mulai Pengerjaan",
        description: `Anda akan memulai pengerjaan untuk "${order.nama} — ${order.type_laptop}". Pastikan semua persiapan sudah lengkap.`,
        confirmLabel: "Ya, Mulai Kerjakan",
        confirmClass: "bg-blue-600 hover:bg-blue-700",
      },
      sparepart: {
        title: "Menunggu Sparepart",
        description: "Tulis keterangan sparepart yang dibutuhkan untuk melanjutkan pengerjaan.",
        confirmLabel: "Tandai Menunggu Sparepart",
        confirmClass: "bg-orange-600 hover:bg-orange-700",
        requireReason: true,
        reasonLabel: "Keterangan Sparepart",
        reasonPlaceholder: "Contoh: Butuh baterai 14.8V 4400mAh untuk Acer Aspire",
      },
      done: {
        title: "Tandai Selesai",
        description: `Konfirmasi penyelesaian untuk "${order.nama} — ${order.type_laptop}". Payment akan dikonfirmasi saat pelanggan mengambil laptop.`,
        confirmLabel: "Ya, Tandai Selesai",
        confirmClass: "bg-emerald-600 hover:bg-emerald-700",
      },
      gagal_diperbaiki: {
        title: "Tandai Gagal Diperbaiki",
        description: `Konfirmasi kegagalan perbaikan untuk "${order.nama} — ${order.type_laptop}". Berikan alasan yang jelas.`,
        confirmLabel: "Tandai Gagal Diperbaiki",
        confirmClass: "bg-rose-600 hover:bg-rose-700",
        requireReason: true,
        reasonLabel: "Alasan Gagal",
        reasonPlaceholder: "Contoh: Komponen motherboard sudah tidak tersedia di pasaran",
      },
    };
    if (!action || !configs[action]) return;
    setDialog({ open: true, orderId: order.id, action, ...configs[action] });
  };

  const openPriceDialog = (order: ServiceOrder, action: "mulai" | "sparepart") => {
    if (action === "mulai") {
      setPriceDialog({
        open: true,
        orderId: order.id,
        action: "mulai",
        title: "Mulai Pengerjaan",
        description: `Masukkan estimasi / kisaran biaya servis untuk "${order.nama} — ${order.type_laptop}". Nilai ini masih bisa diubah saat pelanggan mengambil.`,
        confirmLabel: "Mulai Kerjakan",
        confirmClass: "bg-blue-600 hover:bg-blue-700",
        priceLabel: "Estimasi Biaya Servis",
        defaultPrice: Number(order.estimasi_harga ?? 0),
        withReason: false,
      });
    } else {
      setSparepartDialog({
        open: true,
        orderId: order.id,
        orderName: order.nama,
        orderType: order.type_laptop,
        defaultPrice: Number(order.biaya_sparepart ?? 0)
      });
    }
  };

  /**
   * Sumber tunggal daftar tombol aksi per status.
   * Kombinasi tombol PERSIS sama dengan versi sebelumnya — hanya dipindah ke satu tempat
   * supaya tabel (desktop) dan card (mobile) selalu konsisten.
   */
  const getActions = (o: ServiceOrder): ActionItem[] => {
    if (!canAction) return [];

    switch (o.status) {
      case "ANTRIAN":
        return [
          { label: "Mulai", color: "blue", onClick: () => openPriceDialog(o, "mulai") },
          { label: "Gagal", color: "rose", onClick: () => openDialog(o, "gagal_diperbaiki") },
        ];
      case "SEDANG_DIKERJAKAN":
        return [
          { label: "Sparepart", color: "orange", onClick: () => openPriceDialog(o, "sparepart") },
          { label: "Selesai", color: "green", onClick: () => openDialog(o, "done") },
          { label: "Gagal", color: "rose", onClick: () => openDialog(o, "gagal_diperbaiki") },
        ];
      case "MENUNGGU_SPAREPART":
        return [
          { label: "Lanjut", color: "purple", onClick: () => openPriceDialog(o, "mulai") },
          { label: "Gagal", color: "rose", onClick: () => openDialog(o, "gagal_diperbaiki") },
        ];
      default:
        return [];
    }
  };

  const handlePriceConfirm = async (price: number, reason?: string) => {
    const body: Record<string, unknown> = { action: priceDialog.action };
    if (priceDialog.action === "mulai") body.estimasi_harga = price;
    if (priceDialog.action === "sparepart") {
      body.biaya_sparepart = price;
      body.alasan = reason;
    }
    const res = await fetch(`/api/service/${priceDialog.orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || "Gagal memperbarui status");
    setPriceDialog(PRICE_DIALOG_CLOSED);
    showToast(priceDialog.action === "mulai" ? " Pengerjaan dimulai!" : " Ditandai menunggu sparepart.");
    refresh();
  };

  const handleSparepartConfirm = async (payload: { price: number; reason?: string; accessory_id?: string; unit_id?: string }) => {
    const body: Record<string, unknown> = { 
      action: "sparepart",
      biaya_sparepart: payload.price,
      alasan: payload.reason,
      accessories_used: payload.accessory_id ? [{
        accessory_id: payload.accessory_id,
        unit_id: payload.unit_id,
        qty: 1
      }] : undefined
    };

    const res = await fetch(`/api/service/${sparepartDialog.orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || "Gagal memperbarui status");
    setSparepartDialog(SPAREPART_DIALOG_CLOSED);
    showToast(" Ditandai menunggu sparepart.");
    refresh();
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
        ? " Order ditandai selesai! Payment dikonfirmasi saat pelanggan mengambil."
        : " Status berhasil diperbarui!"
    );
    refresh();
  };

  const grouped = {
    ANTRIAN: orders.filter(o => o.status === "ANTRIAN"),
    SEDANG_DIKERJAKAN: orders.filter(o => o.status === "SEDANG_DIKERJAKAN"),
    MENUNGGU_SPAREPART: orders.filter(o => o.status === "MENUNGGU_SPAREPART"),
  };

  const queue = [...orders].sort(
    (a, b) => new Date(a.tanggal_masuk).getTime() - new Date(b.tanggal_masuk).getTime()
  );
  const COLUMNS = ["#", "Pelanggan", "Laptop", "Keluhan", "Masuk", "Durasi", "Teknisi", "Estimasi", "Status", "Aksi"];

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">

        {/* ── Top Header ──────────────────────────────────────────────────────── */}
        <div className="sticky top-0 z-20 border-b border-gray-200/60 bg-white/80 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5">

            <div className="flex items-center gap-4">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-gray-200 bg-white text-[#1a1a2e] shadow-sm">
                <IconWrench />
              </div>

              <div className="min-w-0">
                <h1 className="truncate text-xl font-black tracking-tight text-[#1a1a2e]">
                  Antrian Servis
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
                  <span className="text-xs font-semibold text-gray-400 tabular-nums">
                    {orders.length} order aktif
                  </span>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={refresh}
                title="Refresh"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-gray-200 bg-white text-gray-400 outline-none transition-all hover:border-gray-300 hover:bg-gray-50 hover:text-gray-700 focus-visible:ring-2 focus-visible:ring-gray-300 active:scale-95"
              >
                <IconRefresh />
              </button>

              {canCreate && (
                <button
                  type="button"
                  onClick={() => setFormOpen(true)}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1a1a2e] to-[#2d2d4a] px-5 text-sm font-bold text-white shadow-sm outline-none transition-all hover:shadow-lg hover:shadow-[#1a1a2e]/30 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/40 focus-visible:ring-offset-2 active:scale-95 sm:flex-none"
                >
                  <IconPlus />
                  Buat Formulir
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">

          {/* ── Stat Cards ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              icon={<IconQueue />}
              label="Antrian"
              count={grouped.ANTRIAN.length}
              color="text-yellow-600"
              bgColor="bg-yellow-50"
              borderColor="border-yellow-100"
              accentColor="bg-yellow-400"
            />
            <StatCard
              icon={<IconWrench />}
              label="Sedang Dikerjakan"
              count={grouped.SEDANG_DIKERJAKAN.length}
              color="text-blue-600"
              bgColor="bg-blue-50"
              borderColor="border-blue-100"
              accentColor="bg-blue-500"
            />
            <StatCard
              icon={<IconPart />}
              label="Tunggu Sparepart"
              count={grouped.MENUNGGU_SPAREPART.length}
              color="text-orange-600"
              bgColor="bg-orange-50"
              borderColor="border-orange-100"
              accentColor="bg-orange-400"
            />
          </div>

          {/* ── Loading ──────────────────────────────────────────────────────── */}
          {loading ? (
            <>
              {/* Desktop skeleton */}
              <div className="hidden overflow-hidden rounded-2xl border border-gray-200/60 bg-white shadow-sm lg:block">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/80">
                        {COLUMNS.map(h => (
                          <th
                            key={h}
                            className="whitespace-nowrap px-4 py-3.5 text-left text-[10px] font-black uppercase tracking-wider text-gray-400 first:pl-5 last:pr-5"
                          >
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

              {/* Mobile skeleton */}
              <div className="space-y-3 lg:hidden">
                {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
              </div>
            </>
          ) : orders.length === 0 ? (
            /* ── Empty State ── */
            <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm">
              <div className="flex flex-col items-center justify-center px-6 py-20 text-center sm:py-24">
                <div className="mb-6 grid h-20 w-20 place-items-center rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 text-gray-300">
                  <IconClipboard />
                </div>
                <h3 className="text-lg font-black tracking-tight text-[#1a1a2e]">Antrian Kosong</h3>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-gray-400">
                  Semua order sudah selesai, atau belum ada order servis yang masuk hari ini.
                </p>
                {canCreate && (
                  <button
                    type="button"
                    onClick={() => setFormOpen(true)}
                    className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-[#1a1a2e] to-[#2d2d4a] px-6 text-sm font-bold text-white shadow-sm outline-none transition-all hover:shadow-lg hover:shadow-[#1a1a2e]/30 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/40 focus-visible:ring-offset-2 active:scale-95"
                  >
                    <IconPlus />
                    Buat Formulir Baru
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* ── Desktop / Laptop: Table ─────────────────────────────────── */}
              <div className="hidden overflow-hidden rounded-2xl border border-gray-200/60 bg-white shadow-sm lg:block">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gradient-to-r from-gray-50/90 to-white">
                        {COLUMNS.map((h, i) => (
                          <th
                            key={h}
                            className={`
                              whitespace-nowrap px-4 py-3.5 text-[10px] font-black uppercase tracking-wider text-gray-400
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
                      {queue.map((o, idx) => {
                        const actions = getActions(o);
                        return (
                          <tr
                            key={o.id}
                            className="group cursor-pointer transition-colors duration-150 hover:bg-blue-50/40"
                            onClick={() => setDetailId(o.id)}
                          >
                            {/* # */}
                            <td className="py-4 pl-5 pr-4 align-middle">
                              <span className="font-mono text-xs font-black tabular-nums text-gray-300 transition group-hover:text-gray-500">
                                {String(idx + 1).padStart(2, "0")}
                              </span>
                            </td>

                            {/* Pelanggan */}
                            <td className="px-4 py-4 align-middle">
                              <p className="text-sm font-bold leading-tight text-[#1a1a2e]">{o.nama}</p>
                              <p className="mt-0.5 text-xs font-medium tabular-nums text-gray-400">{o.no_hp}</p>
                            </td>

                            {/* Laptop */}
                            <td className="min-w-[160px] px-4 py-4 align-middle">
                              <p className="text-sm font-semibold leading-tight text-gray-700">{o.type_laptop}</p>
                              <p className="mt-0.5 text-xs text-gray-400">
                                {[o.cpu, o.ram].filter(Boolean).join(" · ") || "—"}
                              </p>
                            </td>

                            {/* Keluhan */}
                            <td className="max-w-[220px] px-4 py-4 align-middle">
                              <p className="line-clamp-2 text-xs leading-relaxed text-gray-500">{o.keluhan}</p>
                            </td>

                            {/* Masuk */}
                            <td className="whitespace-nowrap px-4 py-4 align-middle">
                              <span className="text-xs font-medium text-gray-400">{formatDate(o.tanggal_masuk)}</span>
                            </td>

                            {/* Durasi */}
                            <td className="whitespace-nowrap px-4 py-4 align-middle">
                              <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-bold tabular-nums ${getDurationColor(o.tanggal_masuk)}`}>
                                {getDuration(o.tanggal_masuk)}
                              </span>
                            </td>

                            {/* Teknisi */}
                            <td className="px-4 py-4 align-middle">
                              {o.dikerjakan_by_user?.name ? (
                                <div className="flex items-center gap-2">
                                  <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-purple-100 to-purple-200">
                                    <span className="text-[9px] font-black uppercase text-purple-700">
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

                            {/* Estimasi = estimasi_harga + biaya_sparepart */}
                            <td className="min-w-[130px] whitespace-nowrap px-4 py-4 align-middle">
                              <EstimasiValue order={o} />
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
                              <ActionGroup actions={actions} variant="table" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 bg-gray-50/40 px-5 py-3">
                  <p className="text-xs font-medium text-gray-400">
                     Klik baris untuk melihat detail lengkap
                  </p>
                  <p className="text-xs font-bold text-gray-400">
                    Total: <span className="tabular-nums text-[#1a1a2e]">{orders.length}</span> order
                  </p>
                </div>
              </div>

              {/* ── Mobile / Tablet: Card List ──────────────────────────────── */}
              <div className="space-y-3 lg:hidden">
                {queue.map((o, idx) => {
                  const actions = getActions(o);
                  return (
                    <div
                      key={o.id}
                      onClick={() => setDetailId(o.id)}
                      className="cursor-pointer overflow-hidden rounded-2xl border border-gray-200/60 bg-white shadow-sm transition-all active:scale-[0.99]"
                    >
                      {/* Head */}
                      <div className="flex items-start justify-between gap-3 px-4 pt-4">
                        <div className="flex min-w-0 items-start gap-2.5">
                          <span className="mt-0.5 shrink-0 rounded-md bg-gray-50 px-1.5 py-0.5 font-mono text-[10px] font-black tabular-nums text-gray-400">
                            {String(idx + 1).padStart(2, "0")}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold leading-tight text-[#1a1a2e]">{o.nama}</p>
                            <p className="mt-0.5 text-xs font-medium tabular-nums text-gray-400">{o.no_hp}</p>
                          </div>
                        </div>
                        <div className="shrink-0">
                          <ServiceStatusBadge status={o.status} />
                        </div>
                      </div>

                      {/* Laptop + keluhan */}
                      <div className="mt-3 px-4">
                        <p className="text-sm font-semibold leading-tight text-gray-700">{o.type_laptop}</p>
                        <p className="mt-0.5 text-xs text-gray-400">
                          {[o.cpu, o.ram].filter(Boolean).join(" · ") || "—"}
                        </p>
                        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-gray-500">{o.keluhan}</p>
                      </div>

                      {/* Meta */}
                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 px-4">
                        <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-bold tabular-nums ${getDurationColor(o.tanggal_masuk)}`}>
                          {getDuration(o.tanggal_masuk)}
                        </span>
                        <span className="text-xs font-medium text-gray-400">{formatDate(o.tanggal_masuk)}</span>

                        {o.dikerjakan_by_user?.name && (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gradient-to-br from-purple-100 to-purple-200">
                              <span className="text-[8px] font-black uppercase text-purple-700">
                                {o.dikerjakan_by_user.name.charAt(0)}
                              </span>
                            </span>
                            <span className="text-xs font-semibold text-gray-600">{o.dikerjakan_by_user.name}</span>
                          </span>
                        )}
                      </div>

                      {/* Estimasi */}
                      <div className="mt-3 flex items-center justify-between gap-3 border-t border-gray-50 px-4 pt-3">
                        <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                          Estimasi
                        </span>
                        <EstimasiValue order={o} align="right" />
                      </div>

                      {/* Aksi — grid full-width, tinggi seragam, mudah dipencet */}
                      {actions.length > 0 && (
                        <div
                          className="mt-3 border-t border-gray-50 bg-gray-50/40 px-4 py-3"
                          onClick={e => e.stopPropagation()}
                        >
                          <ActionGroup actions={actions} variant="card" />
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="flex items-center justify-between px-1 pt-1">
                  <p className="text-xs font-medium text-gray-400"> Ketuk kartu untuk detail</p>
                  <p className="text-xs font-bold text-gray-400">
                    Total: <span className="tabular-nums text-[#1a1a2e]">{orders.length}</span> order
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Modals ──────────────────────────────────────────────────────── */}
        <ServiceFormModal
          open={formOpen}
          onClose={() => setFormOpen(false)}
          onSuccess={() => { showToast(" Formulir berhasil dibuat!"); refresh(); }}
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

        <ServicePriceDialog
          open={priceDialog.open}
          title={priceDialog.title}
          description={priceDialog.description}
          confirmLabel={priceDialog.confirmLabel}
          confirmClass={priceDialog.confirmClass}
          priceLabel={priceDialog.priceLabel}
          priceRequired={false}
          defaultPrice={priceDialog.defaultPrice}
          withReason={priceDialog.withReason}
          reasonLabel={priceDialog.reasonLabel}
          reasonPlaceholder={priceDialog.reasonPlaceholder}
          reasonRequired={priceDialog.reasonRequired}
          onCancel={() => setPriceDialog(PRICE_DIALOG_CLOSED)}
          onConfirm={handlePriceConfirm}
        />

        <ServiceSparepartDialog
          open={sparepartDialog.open}
          orderId={sparepartDialog.orderId}
          orderName={sparepartDialog.orderName}
          orderType={sparepartDialog.orderType}
          defaultPrice={sparepartDialog.defaultPrice}
          onCancel={() => setSparepartDialog(SPAREPART_DIALOG_CLOSED)}
          onConfirm={handleSparepartConfirm}
        />

        <ServiceDetailModal orderId={detailId} onClose={() => setDetailId(null)} />

        {/* ── Toast ───────────────────────────────────────────────────────── */}
        {toast && (
          <div
            className={`
              fixed bottom-6 left-4 right-4 z-50 flex items-center gap-3 rounded-2xl px-5 py-3.5
              text-sm font-bold text-white shadow-xl ring-1 ring-black/5
              transition-all animate-in slide-in-from-right-5 duration-300
              sm:bottom-8 sm:left-auto sm:right-8 sm:max-w-md
              ${toast.type === "success" ? "bg-gradient-to-r from-[#1a1a2e] to-[#2d2d4a]" : "bg-gradient-to-r from-rose-500 to-rose-600"}
            `}
          >
            <span className="shrink-0">
              {toast.type === "success" ? <IconCheck /> : <IconX />}
            </span>
            <span className="leading-snug">{toast.msg}</span>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}