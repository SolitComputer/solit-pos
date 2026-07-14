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

/** Versi pendek untuk card mobile (tanpa tahun) */
function formatDateShort(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit", month: "short",
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
const IconDocSm = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
const IconInfoSm = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

// ── Shared helpers (dipakai tabel & card) ──────────────────────────────────────
function UserCell({ name, color }: { name?: string; color: "blue" | "violet" | "emerald" }) {
  if (!name) return <span className="text-[11px] font-medium text-gray-300">—</span>;

  const colorMap: Record<string, string> = {
    blue: "bg-blue-100 text-blue-600",
    violet: "bg-violet-100 text-violet-600",
    emerald: "bg-emerald-100 text-emerald-600",
  };

  return (
    <div className="flex items-center gap-1.5">
      <div className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${colorMap[color]}`}>
        <span className="text-[9px] font-black uppercase">{name.charAt(0)}</span>
      </div>
      <span className="whitespace-nowrap text-[12px] font-semibold text-gray-600">{name}</span>
    </div>
  );
}

function PaymentCell({ order, align = "left" }: { order: ServiceOrder; align?: "left" | "right" }) {
  const isFromGagal = order.status === "SUDAH_DIAMBIL" && !!order.alasan_tidak_jadi;
  const paid = fmtRupiah(order.payment_amount);
  const alignCls = align === "right" ? "items-end text-right" : "items-start";

  if (paid) {
    const est = Number(order.estimasi_harga ?? 0);
    const sp = Number(order.biaya_sparepart ?? 0);
    return (
      <div className={`flex flex-col ${alignCls}`}>
        <p className="text-[12px] font-black tabular-nums text-emerald-700">{paid}</p>
        <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">
          {order.payment_method || "CASH"}
        </p>
        {(est > 0 || sp > 0) && (
          <p className="mt-0.5 text-[10px] font-medium text-gray-300">
            jasa {fmtRupiah(est) ?? "Rp 0"}
            {sp > 0 && ` + part ${fmtRupiah(sp)}`}
          </p>
        )}
      </div>
    );
  }

  if (isFromGagal) {
    return (
      <span className="inline-flex items-center rounded-lg bg-gray-100 px-2 py-0.5 text-[10px] font-black text-gray-500">
        Gratis
      </span>
    );
  }

  return <span className="text-[11px] font-medium text-gray-300">—</span>;
}

function KetCell({ order, align = "left" }: { order: ServiceOrder; align?: "left" | "right" }) {
  const isFromGagal = order.status === "SUDAH_DIAMBIL" && !!order.alasan_tidak_jadi;
  const isTidakJadi = order.status === "TIDAK_JADI";
  const alignCls = align === "right" ? "items-end text-right" : "items-start";

  if (isFromGagal) {
    return (
      <div className={`flex flex-col gap-1 ${alignCls}`}>
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-700">
          <IconXSmall />
          Gagal Diperbaiki
        </span>
        {order.alasan_tidak_jadi && (
          <p className="line-clamp-2 text-[11px] leading-relaxed text-gray-500">
            {order.alasan_tidak_jadi}
          </p>
        )}
      </div>
    );
  }

  if (isTidakJadi && order.alasan_tidak_jadi) {
    return (
      <p className={`line-clamp-2 text-[11px] leading-relaxed text-red-500 ${align === "right" ? "text-right" : ""}`}>
        {order.alasan_tidak_jadi}
      </p>
    );
  }

  return <span className="text-[11px] font-medium text-gray-300">—</span>;
}

// ── Skeletons ──────────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr className="border-b border-gray-50">
      {[28, 110, 120, 150, 90, 90, 90, 70, 90, 80, 80, 80, 80, 110].map((w, i) => (
        <td key={i} className="px-4 py-3.5 first:pl-5 last:pr-5">
          <div className="h-3 animate-pulse rounded-full bg-gray-100" style={{ width: w }} />
        </td>
      ))}
    </tr>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="h-3 w-32 animate-pulse rounded-full bg-gray-100" />
          <div className="h-3 w-24 animate-pulse rounded-full bg-gray-100" />
        </div>
        <div className="h-5 w-24 animate-pulse rounded-full bg-gray-100" />
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-3 w-full animate-pulse rounded-full bg-gray-100" />
        <div className="h-3 w-2/3 animate-pulse rounded-full bg-gray-100" />
      </div>
      <div className="mt-4 h-10 animate-pulse rounded-xl bg-gray-50" />
    </div>
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
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[3px] animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Panel — bottom sheet di HP, side panel di laptop */}
      <div
        className="
          relative flex w-full max-h-[92vh] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl
          animate-in slide-in-from-bottom duration-200
          sm:h-full sm:max-h-none sm:max-w-[420px] sm:rounded-none sm:slide-in-from-right
        "
      >
        {/* Grab handle (mobile only) */}
        <div className="flex justify-center pt-2.5 sm:hidden">
          <span className="h-1 w-10 rounded-full bg-gray-200" aria-hidden />
        </div>

        {/* ── HERO HEADER ─────────────────────────────────────────────────── */}
        <div
          className={`relative shrink-0 overflow-hidden px-5 pb-6 pt-4 sm:pt-5 ${
            isBad
              ? "bg-gradient-to-br from-rose-50 via-rose-50/60 to-white"
              : "bg-gradient-to-br from-[#1a1a2e]/[0.03] via-blue-50/40 to-white"
          }`}
        >
          {/* Dekoratif circle blur di pojok */}
          <div
            className={`pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-20 blur-2xl ${
              isBad ? "bg-rose-400" : "bg-blue-400"
            }`}
          />

          {/* Top bar: close button */}
          <div className="mb-4 flex items-center justify-between">
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${
                isBad ? "bg-rose-100 text-rose-500" : "bg-[#1a1a2e]/8 text-[#1a1a2e]/50"
              }`}
            >
              Riwayat Servis
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup"
              className="grid h-8 w-8 place-items-center rounded-lg border border-gray-100 bg-white/80 text-gray-400 shadow-sm outline-none transition hover:bg-white hover:text-gray-700 focus-visible:ring-2 focus-visible:ring-gray-300 active:scale-95"
            >
              <IconX />
            </button>
          </div>

          {/* Avatar + nama */}
          <div className="flex items-center gap-3.5">
            <div
              className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-[15px] font-black shadow-sm ${
                isBad ? "bg-rose-500 text-white" : "bg-[#1a1a2e] text-white"
              }`}
            >
              {initials}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-[16px] font-black leading-tight text-[#1a1a2e]">
                {order.nama}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1 text-[11px] font-medium tabular-nums text-gray-400">
                  <IconPhone />
                  {order.no_hp}
                </span>
                {order.alamat && (
                  <>
                    <span className="text-gray-200">·</span>
                    <span className="flex max-w-[160px] items-center gap-1 truncate text-[11px] font-medium text-gray-400">
                      <IconMapPin />
                      {order.alamat}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Status pills */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <ServiceStatusBadge status={order.status} />
            {isFromGagal && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-black text-rose-600">
                <IconXSmall />
                Gagal Diperbaiki
              </span>
            )}
          </div>
        </div>

        {/* ── BODY (scrollable) ───────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto overscroll-contain">

          {/* ── LAPTOP CARD ── */}
          <div className="mx-4 mt-4">
            <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
              <div className="mb-3 flex items-center gap-2">
                <div className="grid h-6 w-6 place-items-center rounded-lg bg-blue-100 text-blue-500">
                  <IconLaptop />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-blue-400">Laptop</span>
              </div>
              <p className="text-[14px] font-black leading-tight text-[#1a1a2e]">{order.type_laptop}</p>
              {(order.cpu || order.ram || order.storage) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[order.cpu, order.ram, order.storage].filter(Boolean).map((spec, i) => (
                    <span
                      key={i}
                      className="rounded-md border border-blue-100 bg-white px-2 py-0.5 text-[11px] font-semibold text-blue-700"
                    >
                      {spec}
                    </span>
                  ))}
                </div>
              )}
              {order.kelengkapan && (
                <p className="mt-2 border-t border-blue-100 pt-2 text-[11px] text-gray-400">
                  <span className="font-bold text-blue-400">Kelengkapan: </span>{order.kelengkapan}
                </p>
              )}
            </div>
          </div>

          {/* ── KELUHAN + ANALISA ── */}
          <div className="mx-4 mt-3 space-y-2">
            <div className="rounded-2xl border border-violet-100 bg-violet-50/30 p-4">
              <div className="mb-2.5 flex items-center gap-2">
                <div className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-500">
                  <IconDocSm />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-violet-400">Keluhan</span>
              </div>
              <p className="whitespace-pre-line text-[13px] leading-relaxed text-gray-600">
                {order.keluhan}
              </p>
            </div>

            {order.hasil_analisa && (
              <div className="rounded-2xl border border-violet-100 bg-white p-4">
                <div className="mb-2.5 flex items-center gap-2">
                  <div className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-500">
                    <IconDocSm />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-violet-400">Hasil Analisa</span>
                </div>
                <p className="whitespace-pre-line text-[13px] leading-relaxed text-gray-600">
                  {order.hasil_analisa}
                </p>
              </div>
            )}
          </div>

          {/* ── TIMELINE ── */}
          <div className="mx-4 mt-3">
            <div className="rounded-2xl border border-amber-100 bg-amber-50/30 p-4">
              <div className="mb-3 flex items-center gap-2">
                <div className="grid h-6 w-6 place-items-center rounded-lg bg-amber-100 text-amber-500">
                  <IconClock />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">Timeline</span>
              </div>

              {/* Visual timeline */}
              <div className="space-y-0">
                {[
                  { dot: "bg-blue-400",    label: "Masuk",   value: formatDate(order.tanggal_masuk) },
                  { dot: "bg-violet-400",  label: "Selesai", value: formatDate(order.tanggal_selesai) },
                  { dot: "bg-emerald-400", label: "Diambil", value: formatDate(order.tanggal_diambil) },
                ].map((item, i, arr) => (
                  <div key={i} className="flex gap-3">
                    {/* Dot + line */}
                    <div className="flex flex-col items-center">
                      <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.value === "—" ? "bg-gray-200" : item.dot}`} />
                      {i < arr.length - 1 && (
                        <div className="my-0.5 w-px flex-1 bg-gray-100" style={{ minHeight: 16 }} />
                      )}
                    </div>
                    {/* Content */}
                    <div className="flex min-w-0 flex-1 items-start justify-between gap-2 pb-3">
                      <span className="mt-0.5 shrink-0 text-[11px] font-medium text-gray-400">{item.label}</span>
                      <span className="text-right text-[11px] font-bold tabular-nums text-gray-600">{item.value}</span>
                    </div>
                  </div>
                ))}

                {/* Durasi chip */}
                <div className="mt-1 flex items-center gap-2 border-t border-amber-100 pt-2">
                  <span className="text-[11px] font-medium text-gray-400">Durasi servis</span>
                  <span className="ml-auto rounded-lg bg-amber-100 px-2 py-0.5 font-mono text-[11px] font-black tabular-nums text-amber-700">
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
                <div className="mb-3 flex items-center gap-2">
                  <div className="grid h-6 w-6 place-items-center rounded-lg bg-white/20">
                    <IconDollar />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-100">Payment</span>
                </div>
                <p className="text-[24px] font-black leading-none tracking-tight tabular-nums">
                  {fmtRupiah(order.payment_amount)}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide">
                    {order.payment_method || "CASH"}
                  </span>
                  {order.payment_note && (
                    <span className="truncate text-[11px] italic text-emerald-100">{order.payment_note}</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <div className="grid h-6 w-6 place-items-center rounded-lg bg-gray-100 text-gray-400">
                    <IconDollar />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-300">Payment</span>
                </div>
                <p className="text-[13px] font-medium text-gray-400">
                  {isFromGagal ? "Gratis / Tanpa biaya" : "—"}
                </p>
              </div>
            )}
          </div>

          {/* ── TIM ── */}
          <div className="mx-4 mt-3">
            <div className="rounded-2xl border border-gray-100 bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <div className="grid h-6 w-6 place-items-center rounded-lg bg-gray-100 text-gray-400">
                  <IconUser />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-300">Tim</span>
              </div>
              <div className="space-y-2.5">
                <TeamRow label="Dibuat oleh"     name={order.created_by_user?.name}     color="blue" />
                <TeamRow label="Dikerjakan oleh" name={order.dikerjakan_by_user?.name}  color="violet" />
                <TeamRow label="Diambil oleh"    name={order.diambil_by_user?.name}     color="emerald" />
              </div>
            </div>
          </div>

          {/* ── ALASAN GAGAL / TIDAK JADI ── */}
          {order.alasan_tidak_jadi && (
            <div className="mx-4 mt-3">
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                <div className="mb-2.5 flex items-center gap-2">
                  <div className="grid h-6 w-6 place-items-center rounded-lg bg-rose-100 text-rose-500">
                    <IconXSmall />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-rose-400">
                    {isFromGagal ? "Alasan Gagal Diperbaiki" : "Alasan Tidak Jadi"}
                  </span>
                </div>
                <p className="whitespace-pre-line text-[13px] font-medium leading-relaxed text-rose-700">
                  {order.alasan_tidak_jadi}
                </p>
              </div>
            </div>
          )}

          {/* Bottom padding */}
          <div className="h-5" />
        </div>

        {/* ── FOOTER ──────────────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            className="h-11 w-full rounded-xl bg-[#1a1a2e] text-[13px] font-black text-white outline-none transition hover:bg-[#2a2a4e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/40 focus-visible:ring-offset-2 active:scale-[0.99]"
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
    blue: "bg-blue-100 text-blue-600",
    violet: "bg-violet-100 text-violet-600",
    emerald: "bg-emerald-100 text-emerald-600",
  };
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="shrink-0 text-[11px] font-medium text-gray-400">{label}</span>
      {name ? (
        <div className="flex items-center gap-2">
          <div className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${colorMap[color]}`}>
            <span className="text-[9px] font-black uppercase">{name.charAt(0)}</span>
          </div>
          <span className="text-[12px] font-bold text-gray-700">{name}</span>
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
        <div className="sticky top-0 z-20 border-b border-gray-100 bg-white px-4 py-3.5 sm:px-6 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#1a1a2e] text-white">
                <IconHistory />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-base font-black leading-tight tracking-tight text-[#1a1a2e]">
                  Riwayat Servis
                </h1>
                <p className="mt-0.5 text-[11px] font-medium tabular-nums text-gray-400">
                  {orders.length} total riwayat tersimpan
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={fetchOrders}
              title="Refresh"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-gray-100 bg-white text-gray-400 outline-none transition hover:border-gray-200 hover:bg-gray-50 hover:text-gray-700 focus-visible:ring-2 focus-visible:ring-gray-300 active:scale-95"
            >
              <IconRefresh />
            </button>
          </div>
        </div>

        {/* ── Filter Bar ────────────────────────────────────────────────────── */}
        <div className="border-b border-gray-100 bg-white px-4 py-3 sm:px-6">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3">

            {/* Search */}
            <div className="relative w-full sm:max-w-sm">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-300">
                <IconSearch />
              </span>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cari nama, no HP, laptop..."
                className="h-9 w-full rounded-xl border border-gray-100 bg-gray-50 pl-9 pr-8 text-[13px] outline-none transition placeholder:text-gray-300 focus:border-[#1a1a2e]/30 focus:bg-white focus:ring-2 focus:ring-[#1a1a2e]/10"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Hapus pencarian"
                  className="absolute right-2 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-md text-gray-300 transition hover:bg-gray-100 hover:text-gray-500"
                >
                  <IconXSmall />
                </button>
              )}
            </div>

            {/* Status chips — scrollable di HP, biasa di laptop */}
            <div className="-mx-4 flex snap-x items-center gap-1.5 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:overflow-visible sm:px-0 sm:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {(["ALL", ...HISTORY_STATUSES] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFilterStatus(s)}
                  className={`
                    inline-flex h-9 shrink-0 snap-start items-center justify-center whitespace-nowrap rounded-xl px-3.5
                    text-[11px] font-black tracking-tight outline-none transition
                    focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30 active:scale-95
                    ${filterStatus === s
                      ? "bg-[#1a1a2e] text-white shadow-sm"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"}
                  `}
                >
                  {s === "ALL" ? "Semua" : STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-5 px-4 py-5 sm:px-6">

          {/* ── Stat Cards ──────────────────────────────────────────────────── */}
          {!loading && orders.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div className="relative overflow-hidden rounded-2xl border border-emerald-100 bg-white px-4 py-4 text-emerald-800 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:px-5">
                <span className="absolute inset-y-0 left-0 w-1 bg-emerald-500" aria-hidden />
                <div className="flex items-center justify-between gap-3 pl-2">
                  <div className="min-w-0">
                    <p className="text-3xl font-black leading-none tracking-tight tabular-nums">{sudahDiambilCount}</p>
                    <p className="mt-1.5 text-[11px] font-bold uppercase tracking-wider opacity-70">Sudah Diambil</p>
                  </div>
                  <div className="shrink-0 opacity-20">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="relative overflow-hidden rounded-2xl border border-red-100 bg-white px-4 py-4 text-red-800 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:px-5">
                <span className="absolute inset-y-0 left-0 w-1 bg-red-400" aria-hidden />
                <div className="flex items-center justify-between gap-3 pl-2">
                  <div className="min-w-0">
                    <p className="text-3xl font-black leading-none tracking-tight tabular-nums">{tidakJadiCount}</p>
                    <p className="mt-1.5 text-[11px] font-bold uppercase tracking-wider opacity-70">Tidak Jadi</p>
                  </div>
                  <div className="shrink-0 opacity-20">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Content ─────────────────────────────────────────────────────── */}
          {loading ? (
            <>
              {/* Desktop skeleton */}
              <div className="hidden overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm lg:block">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/60">
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
          ) : filtered.length === 0 ? (
            /* ── Empty State ── */
            <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
              <div className="flex flex-col items-center justify-center px-6 py-20 text-center sm:py-24">
                <div className="mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-gray-100 bg-gray-50 text-gray-300">
                  <IconDoc />
                </div>
                <p className="text-sm font-black text-[#1a1a2e]">Tidak ada riwayat</p>
                <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-gray-400">
                  {search
                    ? `Tidak ada hasil untuk "${search}". Coba kata kunci lain.`
                    : "Belum ada order yang selesai atau tidak jadi."}
                </p>
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="mt-4 inline-flex h-9 items-center rounded-xl bg-gray-100 px-4 text-xs font-black text-gray-500 outline-none transition hover:bg-gray-200 focus-visible:ring-2 focus-visible:ring-gray-300 active:scale-95"
                  >
                    Hapus pencarian
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* ══ Desktop / Laptop: Table ══════════════════════════════════ */}
              <div className="hidden overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm lg:block">
                {/* Hint bar */}
                <div className="flex items-center gap-2 border-b border-gray-50 bg-gray-50/60 px-5 py-2">
                  <span className="shrink-0 text-gray-300">
                    <IconInfoSm />
                  </span>
                  <p className="text-[11px] font-medium text-gray-300">
                    Klik baris untuk melihat detail lengkap
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/60">
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
                            className={`group cursor-pointer transition-colors duration-100 ${rowBg}`}
                          >
                            {/* No */}
                            <td className="w-px whitespace-nowrap py-3.5 pl-5 pr-4 align-top">
                              <span className="font-mono text-[11px] font-black tabular-nums text-gray-300 transition group-hover:text-gray-500">
                                {String(idx + 1).padStart(2, "0")}
                              </span>
                            </td>

                            {/* Pelanggan */}
                            <td className="min-w-[140px] px-4 py-3.5 align-top">
                              <p className="text-[13px] font-black leading-tight text-[#1a1a2e]">{o.nama}</p>
                              <p className="mt-0.5 text-[11px] font-medium tabular-nums text-gray-400">{o.no_hp}</p>
                              {o.alamat && (
                                <p className="mt-0.5 max-w-[130px] truncate text-[10px] text-gray-300">{o.alamat}</p>
                              )}
                            </td>

                            {/* Laptop */}
                            <td className="min-w-[150px] px-4 py-3.5 align-top">
                              <p className="text-[13px] font-bold leading-tight text-gray-700">{o.type_laptop}</p>
                              <p className="mt-0.5 text-[11px] text-gray-400">
                                {[o.cpu, o.ram, o.storage].filter(Boolean).join(" · ") || "—"}
                              </p>
                            </td>

                            {/* Keluhan — tetap truncate, detail di modal */}
                            <td className="max-w-[180px] px-4 py-3.5 align-top">
                              <p className="line-clamp-2 text-[12px] leading-relaxed text-gray-500">
                                {o.keluhan}
                              </p>
                              {o.keluhan.length > 70 && (
                                <p className="mt-0.5 text-[10px] font-medium text-gray-300">
                                  klik untuk lihat semua
                                </p>
                              )}
                            </td>

                            {/* Jam Masuk */}
                            <td className="whitespace-nowrap px-4 py-3.5 align-top">
                              <span className="text-[11px] font-medium tabular-nums text-gray-400">
                                {formatDate(o.tanggal_masuk)}
                              </span>
                            </td>

                            {/* Jam Done */}
                            <td className="whitespace-nowrap px-4 py-3.5 align-top">
                              <span className="text-[11px] font-medium tabular-nums text-gray-400">
                                {formatDate(o.tanggal_selesai)}
                              </span>
                            </td>

                            {/* Jam Diambil */}
                            <td className="whitespace-nowrap px-4 py-3.5 align-top">
                              <span className="text-[11px] font-medium tabular-nums text-gray-400">
                                {formatDate(o.tanggal_diambil)}
                              </span>
                            </td>

                            {/* Durasi Servis */}
                            <td className="w-px whitespace-nowrap px-4 py-3.5 align-top">
                              <span className="inline-flex items-center rounded-lg bg-gray-50 px-2 py-0.5 font-mono text-[11px] font-black tabular-nums text-gray-500">
                                {getDuration(o.tanggal_masuk, o.tanggal_selesai)}
                              </span>
                            </td>

                            {/* Payment + breakdown estimasi/sparepart */}
                            <td className="min-w-[120px] whitespace-nowrap px-4 py-3.5 align-top">
                              <PaymentCell order={o} />
                            </td>

                            {/* Dibuat oleh */}
                            <td className="px-4 py-3.5 align-top">
                              <UserCell name={o.created_by_user?.name} color="blue" />
                            </td>

                            {/* Dikerjakan oleh */}
                            <td className="px-4 py-3.5 align-top">
                              <UserCell name={o.dikerjakan_by_user?.name} color="violet" />
                            </td>

                            {/* Diambil oleh */}
                            <td className="px-4 py-3.5 align-top">
                              <UserCell name={o.diambil_by_user?.name} color="emerald" />
                            </td>

                            {/* Status */}
                            <td className="w-px whitespace-nowrap px-4 py-3.5 align-top">
                              <ServiceStatusBadge status={o.status} />
                            </td>

                            {/* Ket. */}
                            <td className="max-w-[170px] py-3.5 pl-4 pr-5 align-top">
                              <KetCell order={o} align="right" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-2 border-t border-gray-50 px-5 py-2.5">
                  <p className="text-[11px] font-medium tabular-nums text-gray-300">
                    Menampilkan {filtered.length} dari {orders.length} riwayat
                  </p>
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="text-[11px] font-bold text-gray-400 outline-none transition hover:text-gray-600"
                    >
                      Hapus filter
                    </button>
                  )}
                </div>
              </div>

              {/* ══ Mobile / Tablet: Card List ═══════════════════════════════ */}
              <div className="space-y-3 lg:hidden">
                {filtered.map((o, idx) => {
                  const isFromGagal = o.status === "SUDAH_DIAMBIL" && !!o.alasan_tidak_jadi;
                  const isTidakJadi = o.status === "TIDAK_JADI";

                  const cardTone = isTidakJadi
                    ? "border-red-100 bg-red-50/40"
                    : isFromGagal
                    ? "border-rose-100 bg-rose-50/30"
                    : "border-gray-100 bg-white";

                  return (
                    <div
                      key={o.id}
                      onClick={() => setSelectedOrder(o)}
                      className={`cursor-pointer overflow-hidden rounded-2xl border shadow-sm transition-all active:scale-[0.99] ${cardTone}`}
                    >
                      {/* Head */}
                      <div className="flex items-start justify-between gap-3 px-4 pt-4">
                        <div className="flex min-w-0 items-start gap-2.5">
                          <span className="mt-0.5 shrink-0 rounded-md bg-white/70 px-1.5 py-0.5 font-mono text-[10px] font-black tabular-nums text-gray-400">
                            {String(idx + 1).padStart(2, "0")}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-black leading-tight text-[#1a1a2e]">{o.nama}</p>
                            <p className="mt-0.5 text-[11px] font-medium tabular-nums text-gray-400">{o.no_hp}</p>
                          </div>
                        </div>
                        <div className="shrink-0">
                          <ServiceStatusBadge status={o.status} />
                        </div>
                      </div>

                      {/* Laptop + keluhan */}
                      <div className="mt-3 px-4">
                        <p className="text-[13px] font-bold leading-tight text-gray-700">{o.type_laptop}</p>
                        <p className="mt-0.5 text-[11px] text-gray-400">
                          {[o.cpu, o.ram, o.storage].filter(Boolean).join(" · ") || "—"}
                        </p>
                        <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-gray-500">
                          {o.keluhan}
                        </p>
                      </div>

                      {/* Timeline ringkas */}
                      <div className="mt-3 grid grid-cols-3 gap-2 px-4">
                        {[
                          { label: "Masuk", value: formatDateShort(o.tanggal_masuk) },
                          { label: "Done", value: formatDateShort(o.tanggal_selesai) },
                          { label: "Diambil", value: formatDateShort(o.tanggal_diambil) },
                        ].map(t => (
                          <div key={t.label} className="rounded-xl bg-white/70 px-2.5 py-2">
                            <p className="text-[9px] font-black uppercase tracking-wider text-gray-300">{t.label}</p>
                            <p className="mt-0.5 text-[11px] font-bold leading-tight tabular-nums text-gray-600">
                              {t.value}
                            </p>
                          </div>
                        ))}
                      </div>

                      {/* Durasi + Payment */}
                      <div className="mt-3 flex items-start justify-between gap-3 border-t border-gray-100/70 px-4 pt-3">
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-wider text-gray-300">Durasi</p>
                          <span className="mt-1 inline-flex items-center rounded-lg bg-gray-50 px-2 py-0.5 font-mono text-[11px] font-black tabular-nums text-gray-500">
                            {getDuration(o.tanggal_masuk, o.tanggal_selesai)}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-right text-[9px] font-black uppercase tracking-wider text-gray-300">Payment</p>
                          <div className="mt-1">
                            <PaymentCell order={o} align="right" />
                          </div>
                        </div>
                      </div>

                      {/* Tim */}
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-gray-100/70 px-4 pt-3">
                        <UserCell name={o.created_by_user?.name} color="blue" />
                        <UserCell name={o.dikerjakan_by_user?.name} color="violet" />
                        <UserCell name={o.diambil_by_user?.name} color="emerald" />
                      </div>

                      {/* Ket. */}
                      {(isFromGagal || (isTidakJadi && o.alasan_tidak_jadi)) && (
                        <div className="mt-3 border-t border-gray-100/70 px-4 pt-3">
                          <KetCell order={o} />
                        </div>
                      )}

                      <div className="h-4" />
                    </div>
                  );
                })}

                {/* Footer mobile */}
                <div className="flex items-center justify-between gap-2 px-1 pt-1">
                  <p className="text-[11px] font-medium tabular-nums text-gray-400">
                    Menampilkan {filtered.length} dari {orders.length} riwayat
                  </p>
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="text-[11px] font-bold text-gray-400 outline-none transition hover:text-gray-600"
                    >
                      Hapus filter
                    </button>
                  )}
                </div>
              </div>
            </>
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