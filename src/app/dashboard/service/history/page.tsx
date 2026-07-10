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

function fmtRupiah(n?: number | null) {
  const num = Number(n ?? 0);
  if (!num) return null;
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(num);
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
const IconX = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const IconLaptop = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <line x1="2" y1="20" x2="22" y2="20" />
  </svg>
);
const IconUser = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);
const IconClock = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);
const IconPhone = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.01 1.18 2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
  </svg>
);
const IconMapPin = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
  </svg>
);
const IconDollar = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
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

// ── Detail Modal ───────────────────────────────────────────────────────────────
function HistoryDetailModal({
  order,
  onClose,
}: {
  order: ServiceOrder | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!order) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [order, onClose]);

  if (!order) return null;

  const isFromGagal = order.status === "SUDAH_DIAMBIL" && !!order.alasan_tidak_jadi;
  const isTidakJadi = order.status === "TIDAK_JADI";
  const isBad = isTidakJadi || isFromGagal;

  // Inisial avatar dari nama pelanggan
  const initials = order.nama
    .split(" ")
    .slice(0, 2)
    .map((w: string) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[3px]"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative h-full w-full max-w-[420px] bg-white shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">

        {/* ── HERO HEADER ─────────────────────────────────────────────────── */}
        <div className={`relative px-5 pt-5 pb-6 shrink-0 overflow-hidden ${
          isBad
            ? "bg-gradient-to-br from-rose-50 via-rose-50/60 to-white"
            : "bg-gradient-to-br from-[#1a1a2e]/[0.03] via-blue-50/40 to-white"
        }`}>
          {/* Dekoratif circle blur di pojok */}
          <div className={`absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-20 blur-2xl pointer-events-none ${
            isBad ? "bg-rose-400" : "bg-blue-400"
          }`} />

          {/* Top bar: close button */}
          <div className="flex items-center justify-between mb-4">
            <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${
              isBad
                ? "bg-rose-100 text-rose-500"
                : "bg-[#1a1a2e]/8 text-[#1a1a2e]/50"
            }`}>
              Riwayat Servis
            </span>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg bg-white/80 hover:bg-white border border-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-700 transition shadow-sm"
              aria-label="Tutup"
            >
              <IconX />
            </button>
          </div>

          {/* Avatar + nama */}
          <div className="flex items-center gap-3.5">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 font-black text-[15px] shadow-sm ${
              isBad
                ? "bg-rose-500 text-white"
                : "bg-[#1a1a2e] text-white"
            }`}>
              {initials}
            </div>
            <div className="min-w-0">
              <h2 className="text-[16px] font-black text-[#1a1a2e] leading-tight truncate">
                {order.nama}
              </h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="flex items-center gap-1 text-[11px] text-gray-400 font-medium">
                  <IconPhone />
                  {order.no_hp}
                </span>
                {order.alamat && (
                  <>
                    <span className="text-gray-200">·</span>
                    <span className="flex items-center gap-1 text-[11px] text-gray-400 font-medium truncate max-w-[140px]">
                      <IconMapPin />
                      {order.alamat}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Status pills */}
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <ServiceStatusBadge status={order.status} />
            {isFromGagal && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-100 text-rose-600 text-[10px] font-black">
                <IconXSmall />
                Gagal Diperbaiki
              </span>
            )}
          </div>
        </div>

        {/* ── BODY (scrollable) ───────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* ── LAPTOP CARD ── */}
          <div className="mx-4 mt-4">
            <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center text-blue-500">
                  <IconLaptop />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-blue-400">Laptop</span>
              </div>
              <p className="text-[14px] font-black text-[#1a1a2e] leading-tight">{order.type_laptop}</p>
              {(order.cpu || order.ram || order.storage) && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[order.cpu, order.ram, order.storage].filter(Boolean).map((spec, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-md bg-white border border-blue-100 text-[11px] text-blue-700 font-semibold">
                      {spec}
                    </span>
                  ))}
                </div>
              )}
              {order.kelengkapan && (
                <p className="text-[11px] text-gray-400 mt-2 pt-2 border-t border-blue-100">
                  <span className="font-bold text-blue-400">Kelengkapan: </span>{order.kelengkapan}
                </p>
              )}
            </div>
          </div>

          {/* ── KELUHAN + ANALISA ── */}
          <div className="mx-4 mt-3 space-y-2">
            <div className="rounded-2xl border border-violet-100 bg-violet-50/30 p-4">
              <div className="flex items-center gap-2 mb-2.5">
                <div className="w-6 h-6 rounded-lg bg-violet-100 flex items-center justify-center text-violet-500 shrink-0">
                  <IconDoc />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-violet-400">Keluhan</span>
              </div>
              <p className="text-[13px] text-gray-600 leading-relaxed whitespace-pre-line">
                {order.keluhan}
              </p>
            </div>

            {order.hasil_analisa && (
              <div className="rounded-2xl border border-violet-100 bg-white p-4">
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="w-6 h-6 rounded-lg bg-violet-100 flex items-center justify-center text-violet-500 shrink-0">
                    <IconDoc />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-violet-400">Hasil Analisa</span>
                </div>
                <p className="text-[13px] text-gray-600 leading-relaxed whitespace-pre-line">
                  {order.hasil_analisa}
                </p>
              </div>
            )}
          </div>

          {/* ── TIMELINE ── */}
          <div className="mx-4 mt-3">
            <div className="rounded-2xl border border-amber-100 bg-amber-50/30 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center text-amber-500">
                  <IconClock />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">Timeline</span>
              </div>

              {/* Visual timeline */}
              <div className="space-y-0">
                {[
                  { dot: "bg-blue-400",    label: "Masuk",        value: formatDate(order.tanggal_masuk) },
                  { dot: "bg-violet-400",  label: "Selesai",      value: formatDate(order.tanggal_selesai) },
                  { dot: "bg-emerald-400", label: "Diambil",      value: formatDate(order.tanggal_diambil) },
                ].map((item, i, arr) => (
                  <div key={i} className="flex gap-3">
                    {/* Dot + line */}
                    <div className="flex flex-col items-center">
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1 ${item.value === "—" ? "bg-gray-200" : item.dot}`} />
                      {i < arr.length - 1 && (
                        <div className="w-px flex-1 bg-gray-100 my-0.5" style={{ minHeight: 16 }} />
                      )}
                    </div>
                    {/* Content */}
                    <div className="pb-3 min-w-0 flex-1 flex items-start justify-between gap-2">
                      <span className="text-[11px] text-gray-400 font-medium mt-0.5 shrink-0">{item.label}</span>
                      <span className="text-[11px] text-gray-600 font-semibold text-right">{item.value}</span>
                    </div>
                  </div>
                ))}

                {/* Durasi chip */}
                <div className="flex items-center gap-2 pt-1 mt-1 border-t border-amber-100">
                  <span className="text-[11px] text-gray-400 font-medium">Durasi servis</span>
                  <span className="ml-auto font-mono text-[11px] font-black text-amber-700 bg-amber-100 px-2 py-0.5 rounded-lg">
                    {getDuration(order.tanggal_masuk, order.tanggal_selesai)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── PAYMENT ── */}
          <div className="mx-4 mt-3">
            {fmtRupiah(order.payment_amount) ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-500 p-4 text-white">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center">
                    <IconDollar />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-100">Payment</span>
                </div>
                <p className="text-[24px] font-black leading-none tracking-tight">
                  {fmtRupiah(order.payment_amount)}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-black">
                    {order.payment_method || "CASH"}
                  </span>
                  {order.payment_note && (
                    <span className="text-[11px] text-emerald-100 italic truncate">{order.payment_note}</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400">
                    <IconDollar />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-300">Payment</span>
                </div>
                <p className="text-[13px] text-gray-400 font-medium">
                  {isFromGagal ? "Gratis / Tanpa biaya" : "—"}
                </p>
              </div>
            )}
          </div>

          {/* ── TIM ── */}
          <div className="mx-4 mt-3">
            <div className="rounded-2xl border border-gray-100 bg-white p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400">
                  <IconUser />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-300">Tim</span>
              </div>
              <div className="space-y-2.5">
                <TeamRow label="Dibuat oleh"    name={order.created_by_user?.name}    color="blue" />
                <TeamRow label="Dikerjakan oleh" name={order.dikerjakan_by_user?.name} color="violet" />
                <TeamRow label="Diambil oleh"   name={order.diambil_by_user?.name}    color="emerald" />
              </div>
            </div>
          </div>

          {/* ── ALASAN GAGAL / TIDAK JADI ── */}
          {order.alasan_tidak_jadi && (
            <div className="mx-4 mt-3">
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="w-6 h-6 rounded-lg bg-rose-100 flex items-center justify-center text-rose-500">
                    <IconXSmall />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-rose-400">
                    {isFromGagal ? "Alasan Gagal Diperbaiki" : "Alasan Tidak Jadi"}
                  </span>
                </div>
                <p className="text-[13px] text-rose-700 leading-relaxed whitespace-pre-line font-medium">
                  {order.alasan_tidak_jadi}
                </p>
              </div>
            </div>
          )}

          {/* Bottom padding */}
          <div className="h-5" />
        </div>

        {/* ── FOOTER ──────────────────────────────────────────────────────── */}
        <div className="px-4 py-3 border-t border-gray-100 bg-white shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-[#1a1a2e] hover:bg-[#2a2a4e] text-[13px] font-bold text-white transition"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal sub-components ───────────────────────────────────────────────────────
function TeamRow({ label, name, color }: { label: string; name?: string; color: "blue" | "violet" | "emerald" }) {
  const colorMap = {
    blue:    "bg-blue-100 text-blue-600",
    violet:  "bg-violet-100 text-violet-600",
    emerald: "bg-emerald-100 text-emerald-600",
  };
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-gray-400 font-medium shrink-0">{label}</span>
      {name ? (
        <div className="flex items-center gap-2">
          <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${colorMap[color]}`}>
            <span className="text-[9px] font-black uppercase">{name.charAt(0)}</span>
          </div>
          <span className="text-[12px] text-gray-700 font-semibold">{name}</span>
        </div>
      ) : (
        <span className="text-[11px] text-gray-300">—</span>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function HistoryPage() {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<ServiceStatus | "ALL">("ALL");
  const [selectedOrder, setSelectedOrder] = useState<ServiceOrder | null>(null);

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
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Hint bar */}
              <div className="px-5 py-2 border-b border-gray-50 bg-gray-50/60 flex items-center gap-2">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-gray-300 shrink-0">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <p className="text-[11px] text-gray-300 font-medium">
                  Klik baris untuk melihat detail lengkap
                </p>
              </div>

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
                        <tr
                          key={o.id}
                          onClick={() => setSelectedOrder(o)}
                          className={`transition-colors duration-100 cursor-pointer ${rowBg}`}
                        >
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

                          {/* Keluhan — tetap truncate, detail di modal */}
                          <td className="px-4 py-3.5 max-w-[160px]">
                            <p className="text-[12px] text-gray-500 leading-relaxed line-clamp-2">
                              {o.keluhan}
                            </p>
                            {o.keluhan.length > 70 && (
                              <p className="text-[10px] text-gray-300 mt-0.5 font-medium">
                                klik untuk lihat semua
                              </p>
                            )}
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

                        {/* Payment + breakdown estimasi/sparepart */}
                          <td className="px-4 py-3.5 whitespace-nowrap min-w-[110px]">
                            {fmtRupiah(o.payment_amount) ? (
                              <div>
                                <p className="text-[12px] font-bold text-emerald-700">{fmtRupiah(o.payment_amount)}</p>
                                <p className="text-[10px] text-gray-400 mt-0.5 font-medium">{o.payment_method || "CASH"}</p>
                                {(Number(o.estimasi_harga ?? 0) > 0 || Number(o.biaya_sparepart ?? 0) > 0) && (
                                  <p className="text-[10px] text-gray-300 mt-0.5">
                                    jasa {fmtRupiah(o.estimasi_harga) ?? "Rp 0"}
                                    {Number(o.biaya_sparepart ?? 0) > 0 && ` + part ${fmtRupiah(o.biaya_sparepart)}`}
                                  </p>
                                )}
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

      {/* ── Detail Modal ── */}
      <HistoryDetailModal
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
      />
    </DashboardLayout>
  );
}

// ── User Cell helper ───────────────────────────────────────────────────────────
function UserCell({ name, color }: { name?: string; color: "blue" | "violet" | "emerald" }) {
  if (!name) return <span className="text-[11px] text-gray-300 font-medium">—</span>;

  const colorMap: Record<string, string> = {
    blue:    "bg-blue-100 text-blue-600",
    violet:  "bg-violet-100 text-violet-600",
    emerald: "bg-emerald-100 text-emerald-600",
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