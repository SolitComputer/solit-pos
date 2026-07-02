"use client";
// src/components/layout/Sidebar.tsx
// ── MERGE NOTES ──────────────────────────────────────────────────────────────
// Gabungan dua versi Sidebar:
//  • Versi A (teman)  : basic + useDeliveryBadge
//  • Versi B (Ikmal)  : + usePrepNotify / usePrepAlarm / unlockAudio / banner alarm
// Strategi: UNION. Semua fitur & menu per-role dipertahankan (tidak ada yang hilang).
// Fix: banner alarm versi B tadinya ditulis sebagai block-statement di body fungsi
//      (jadi TIDAK pernah ter-render). Di sini banner dipindah ke dalam return JSX.
// v2: Tambah ITEM_MISSIONS ke semua role kecuali PKL (semua varian).

import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { usePrepNotify } from "@/hooks/usePrepNotify";
import { usePrepAlarm, ALARM_KEYS } from "@/lib/prepAlarm";
import { unlockAudio } from "@/lib/preparationSound";
import { UserRole } from "@/lib/auth";
import { mergeMenuGroups } from "@/lib/permissions";
import { useDeliveryBadge } from "@/hooks/useDeliveryBadge";

const CACHE_KEY = "solit_sidebar_user";

function getCachedUser() {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function setCachedUser(user: any) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(user)); } catch { }
}

interface MenuItem { name: string; href: string; icon: React.ReactNode }
interface MenuGroup { label: string; items: MenuItem[] }

const Icons = {
  dashboard: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  attendance: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2" />
    </svg>
  ),
  overtime: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  riwayat: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  laptop: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  ),
  garansi: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  payment: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <rect x="1" y="4" width="22" height="16" rx="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  ),
  scanner: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M4 7V5a1 1 0 011-1h2" /><path d="M20 7V5a1 1 0 00-1-1h-2" />
      <path d="M4 17v2a1 1 0 001 1h2" /><path d="M20 17v2a1 1 0 01-1 1h-2" />
      <path d="M7 12h10" />
    </svg>
  ),
  logout: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  log: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  ),
  loginLog: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" />
      <polyline points="10 17 15 12 10 7" />
      <line x1="15" y1="12" x2="3" y2="12" />
    </svg>
  ),
  reports: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  ),
  laptopReady: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M9 12l2 2 4-4" />
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  ),
  laptopMinus: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M12 9v4m0 4h.01" />
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  ),
  pendingOrders: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" ry="1" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  ),
  users: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  ),
  code: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  ),
  serviceQueue: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
    </svg>
  ),
  serviceDone: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  serviceHistory: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M3 3v5h5" /><path d="M3.05 13A9 9 0 1021 12a9 9 0 00-8.83 7.5" />
    </svg>
  ),
  pklReport: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M9 13h6M9 17h4M9 9h1" />
    </svg>
  ),
  accessories: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" />
      <path d="M8 12h.01M12 12h.01M16 12h.01" />
    </svg>
  ),
  monitorChat: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ),
  managementSeller: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3z" />
      <path d="M8 11c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3z" />
      <path d="M8 13c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
      <path d="M16 13c-.29 0-.62.02-.97.05C16.19 13.89 17 15.02 17 16.35V19h7v-2c0-2.66-5.33-4-8-4z" />
    </svg>
  ),
  deliveryRoute: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" />
      <path d="M8 19h7a3 3 0 003-3v-6M16 5H9a3 3 0 00-3 3v6" />
    </svg>
  ),
  // ── Missions icon ──────────────────────────────────────────────────────────
  missions: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  ),
};

// ── Shared items ──────────────────────────────────────────────────────────────
const ITEM_ABSENSI: MenuItem = { name: "Absensi", href: "/dashboard/attendance", icon: Icons.attendance };
const ITEM_LEMBUR: MenuItem = { name: "Lembur", href: "/dashboard/attendance/overtime", icon: Icons.overtime };
const ITEM_USERS: MenuItem = { name: "Management User", href: "/dashboard/users", icon: Icons.users };
const ITEM_PKL_REPORT: MenuItem = {
  name: "Laporan Kerja PKL",
  href: "/dashboard/pkl-reports",
  icon: Icons.pklReport,
};
const ITEM_ACCESSORIES: MenuItem = {
  name: "Data Aksesori",
  href: "/dashboard/accessories",
  icon: Icons.accessories,
};
const ITEM_MANAGEMENT_SELLER: MenuItem = {
  name: "Management Seller",
  href: "/dashboard/management-seller",
  icon: Icons.managementSeller,
};
const ITEM_PREPARATION: MenuItem = {
  name: "Dashboard Penyiapan",
  href: "/dashboard/preparation",
  icon: Icons.pendingOrders,
};
const ITEM_PREPARATION_HISTORY: MenuItem = {
  name: "Riwayat Pengantaran",
  href: "/dashboard/preparation/history",
  icon: Icons.deliveryRoute,
};
const ITEM_SIAP_KIRIM: MenuItem = {
  name: "Siap Dikirim 🔔",
  href: "/dashboard/preparation/siap-kirim",
  icon: Icons.serviceQueue,
};
const ITEM_PREPARATION_PENGANTARAN: MenuItem = {
  name: "Tugas Antar Saya",
  href: "/dashboard/preparation/pengantaran",
  icon: Icons.deliveryRoute,
};
const ITEM_ANTRIAN_MASUK: MenuItem = {
  name: "Antrian Masuk", href: "/dashboard/preparation/antrian", icon: Icons.serviceQueue,
};
// ── Missions item (semua role kecuali PKL) ────────────────────────────────────
const ITEM_MISSIONS: MenuItem = {
  name: "Misi Pekerjaan",
  href: "/dashboard/missions",
  icon: Icons.missions,
};

// ── Preparation groups (UNION dari kedua versi; dedupe by href otomatis di mergeMenuGroups) ──
const PREPARATION_PENYEDIA_MENU: MenuGroup = {
  label: "Penyiapan Barang",
  items: [
    { name: "Dashboard Penyiapan", href: "/dashboard/preparation", icon: Icons.pendingOrders },
    ITEM_ANTRIAN_MASUK,
    { name: "Selesai Disiapkan", href: "/dashboard/preparation/done", icon: Icons.serviceDone },
  ],
};

const PREPARATION_SALES_MENU: MenuGroup = {
  label: "Penyiapan Barang",
  items: [
    { name: "Dashboard Penyiapan", href: "/dashboard/preparation", icon: Icons.pendingOrders },
    ITEM_ANTRIAN_MASUK,
  ],
};

const PREPARATION_SALES_DELIVERY_MENU: MenuGroup = {
  label: "Pengantaran",
  items: [
    { name: "Siap Dikirim 🔔", href: "/dashboard/preparation/siap-kirim", icon: Icons.serviceQueue },
    { name: "Sedang Diantar", href: "/dashboard/preparation/sedang-diantar", icon: Icons.deliveryRoute },
    { name: "Riwayat Pengantaran", href: "/dashboard/preparation/history", icon: Icons.serviceHistory },
  ],
};

const PREPARATION_PENGANTARAN_MENU: MenuGroup = {
  label: "Pengantaran",
  items: [
    ITEM_ANTRIAN_MASUK,
    { name: "Tugas Antar Saya", href: "/dashboard/preparation/pengantaran", icon: Icons.deliveryRoute },
    { name: "Sedang Diantar", href: "/dashboard/preparation/sedang-diantar", icon: Icons.pendingOrders },
    { name: "Riwayat Pengantaran", href: "/dashboard/preparation/history", icon: Icons.serviceHistory },
  ],
};

const ADMIN_PENYEDIA_MENU: MenuGroup = {
  label: "Penyedia Barang",
  items: [
    { name: "Semua Penyiapan", href: "/dashboard/preparation", icon: Icons.pendingOrders },
    { name: "Antrian Masuk", href: "/dashboard/preparation/antrian", icon: Icons.serviceQueue },
    { name: "Selesai Disiapkan", href: "/dashboard/preparation/done", icon: Icons.serviceDone },
  ],
};

const ADMIN_PENGANTARAN_MENU: MenuGroup = {
  label: "Pengantaran",
  items: [
    { name: "Siap Dikirim", href: "/dashboard/preparation/siap-kirim", icon: Icons.serviceQueue },
    { name: "Sedang Diantar", href: "/dashboard/preparation/sedang-diantar", icon: Icons.deliveryRoute },
    { name: "Riwayat Pengantaran", href: "/dashboard/preparation/history", icon: Icons.serviceHistory },
  ],
};

// ── Shared group builders ─────────────────────────────────────────────────────
// ITEM_MISSIONS disertakan di sini agar semua role yang pakai ADMIN_OVERVIEW dapat menu Misi
const ADMIN_OVERVIEW: MenuGroup = {
  label: "Overview",
  items: [
    { name: "Dashboard", href: "/dashboard", icon: Icons.dashboard },
    ITEM_ABSENSI, ITEM_LEMBUR, ITEM_PKL_REPORT,
    ITEM_MISSIONS,
    { name: "Log Aktivitas", href: "/dashboard/activity-log", icon: Icons.log },
    { name: "Log Login", href: "/dashboard/login-logs", icon: Icons.loginLog },
    { name: "Laporan Keuangan", href: "/dashboard/reports", icon: Icons.reports },
    { name: "Manajemen User", href: "/dashboard/users", icon: Icons.users },
    { name: "Monitor Chat", href: "/dashboard/admin-chat", icon: Icons.monitorChat },
  ],
};

const ADMIN_INVENTARIS: MenuGroup = {
  label: "Inventaris",
  items: [
    { name: "Data Laptop", href: "/dashboard/laptops", icon: Icons.laptop },
    { name: "Garansi", href: "/dashboard/warranty", icon: Icons.garansi },
    { name: "Laptop Siap Jual", href: "/dashboard/laptops/ready", icon: Icons.laptopReady },
    { name: "Laptop Minus", href: "/dashboard/laptops/minus", icon: Icons.laptopMinus },
    ITEM_ACCESSORIES,
  ],
};

const ADMIN_TRANSAKSI: MenuGroup = {
  label: "Transaksi",
  items: [
    { name: "Buat Payment", href: "/payment/create", icon: Icons.payment },
    { name: "DP & Ambil Dulu", href: "/dashboard/pending-orders", icon: Icons.pendingOrders },
    { name: "Riwayat Transaksi", href: "/dashboard/transactions", icon: Icons.riwayat },
    ITEM_MANAGEMENT_SELLER,
    { name: "Scanner", href: "/scan", icon: Icons.scanner },
  ],
};

const SERVICE_MENU: MenuGroup = {
  label: "Servis",
  items: [
    { name: "Antrian", href: "/dashboard/service/antrian", icon: Icons.serviceQueue },
    { name: "Selesai (Done)", href: "/dashboard/service/done", icon: Icons.serviceDone },
    { name: "Riwayat Servis", href: "/dashboard/service/history", icon: Icons.serviceHistory },
  ],
};

// ITEM_MISSIONS disertakan di sini agar semua role yang pakai SALES_OVERVIEW() dapat menu Misi
// Role yang pakai function ini: KEPALA_SALES, CREW_SALES, SOTECH, PENGANTARAN,
// KEPALA_ONPOINT, ONPOINT, KEPALA_SOTECH, KEPALA_MARKETING, ACCOUNTING
const SALES_OVERVIEW = (extra: MenuItem[] = []): MenuGroup => ({
  label: "Overview",
  items: [
    { name: "Dashboard", href: "/dashboard", icon: Icons.dashboard },
    ITEM_ABSENSI, ITEM_LEMBUR, ITEM_PKL_REPORT,
    ITEM_MISSIONS,
    ...extra,
  ],
});

const SALES_INVENTARIS: MenuGroup = {
  label: "Inventaris",
  items: [
    { name: "Data Laptop", href: "/dashboard/laptops", icon: Icons.laptop },
    { name: "Garansi", href: "/dashboard/warranty", icon: Icons.garansi },
    { name: "Laptop Siap Jual", href: "/dashboard/laptops/ready", icon: Icons.laptopReady },
  ],
};

const SALES_TRANSAKSI: MenuGroup = {
  label: "Transaksi",
  items: [
    { name: "Riwayat", href: "/dashboard/transactions", icon: Icons.riwayat },
    { name: "Buat Payment", href: "/payment/create", icon: Icons.payment },
    { name: "DP & Ambil Dulu", href: "/dashboard/pending-orders", icon: Icons.pendingOrders },
    { name: "Scanner", href: "/scan", icon: Icons.scanner },
  ],
};

const PENGANTARAN_TRANSAKSI: MenuGroup = {
  label: "Transaksi",
  items: [
    { name: "Riwayat", href: "/dashboard/transactions", icon: Icons.riwayat },
    { name: "Buat Payment", href: "/payment/create", icon: Icons.payment },
    { name: "DP & Ambil Dulu", href: "/dashboard/pending-orders", icon: Icons.pendingOrders },
    { name: "Scanner", href: "/scan", icon: Icons.scanner },
  ],
};

// ── PKL shared menu — SENGAJA tidak ada ITEM_MISSIONS ────────────────────────
const PKL_MENU: MenuGroup[] = [
  {
    label: "Overview",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: Icons.dashboard },
      ITEM_ABSENSI, ITEM_PKL_REPORT,
    ],
  },
  {
    label: "Inventaris",
    items: [
      { name: "Data Laptop", href: "/dashboard/laptops", icon: Icons.laptop },
      { name: "Laptop Siap Jual", href: "/dashboard/laptops/ready", icon: Icons.laptopReady },
    ],
  },
  {
    label: "Transaksi",
    items: [{ name: "Buat Payment", href: "/payment/create", icon: Icons.payment }],
  },
  {
    label: "Tools",
    items: [{ name: "Scanner", href: "/scan", icon: Icons.scanner }],
  },
];

// ── PKL Sales menu — SENGAJA tidak ada ITEM_MISSIONS ─────────────────────────
const PKL_SALES_MENU: MenuGroup[] = [
  {
    label: "Overview",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: Icons.dashboard },
      ITEM_ABSENSI, ITEM_PKL_REPORT,
    ],
  },
  {
    label: "Inventaris",
    items: [
      { name: "Data Laptop", href: "/dashboard/laptops", icon: Icons.laptop },
      { name: "Laptop Siap Jual", href: "/dashboard/laptops/ready", icon: Icons.laptopReady },
    ],
  },
  {
    label: "Transaksi",
    items: [
      { name: "Riwayat", href: "/dashboard/transactions", icon: Icons.riwayat },
      { name: "Buat Payment", href: "/payment/create", icon: Icons.payment },
      { name: "Scanner", href: "/scan", icon: Icons.scanner },
    ],
  },
  PREPARATION_SALES_MENU,
  PREPARATION_PENYEDIA_MENU,
  PREPARATION_SALES_DELIVERY_MENU,
];

// ── PKL Penyedia menu — SENGAJA tidak ada ITEM_MISSIONS ──────────────────────
const PKL_PENYEDIA_MENU: MenuGroup[] = [
  {
    label: "Overview",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: Icons.dashboard },
      ITEM_ABSENSI, ITEM_PKL_REPORT,
    ],
  },
  {
    label: "Inventaris",
    items: [
      { name: "Data Laptop", href: "/dashboard/laptops", icon: Icons.laptop },
      { name: "Laptop Siap Jual", href: "/dashboard/laptops/ready", icon: Icons.laptopReady },
    ],
  },
  PREPARATION_PENYEDIA_MENU,
  {
    label: "Transaksi",
    items: [{ name: "Buat Payment", href: "/payment/create", icon: Icons.payment }],
  },
  {
    label: "Tools",
    items: [{ name: "Scanner", href: "/scan", icon: Icons.scanner }],
  },
];

// ── Role → Menu mapping ───────────────────────────────────────────────────────
const ROLE_MENUS: Record<UserRole, MenuGroup[]> = {
  // ── ADMIN & setara ──────────────────────────────────────────────────────────
  ADMIN: [
    ADMIN_OVERVIEW, // sudah include ITEM_MISSIONS
    ADMIN_INVENTARIS, ADMIN_TRANSAKSI, ADMIN_PENYEDIA_MENU, ADMIN_PENGANTARAN_MENU, SERVICE_MENU,
  ],

  PROGRAMMER: [
    {
      label: "Overview",
      items: [
        { name: "Dashboard", href: "/dashboard", icon: Icons.dashboard },
        ITEM_ABSENSI, ITEM_LEMBUR, ITEM_PKL_REPORT,
        ITEM_MISSIONS, // ✅
        { name: "Log Aktivitas", href: "/dashboard/activity-log", icon: Icons.log },
        { name: "Log Login", href: "/dashboard/login-logs", icon: Icons.loginLog },
        { name: "Laporan Keuangan", href: "/dashboard/reports", icon: Icons.reports },
        { name: "Manajemen User", href: "/dashboard/users", icon: Icons.users },
        { name: "Monitor Chat", href: "/dashboard/admin-chat", icon: Icons.monitorChat },
      ],
    },
    ADMIN_INVENTARIS, ADMIN_TRANSAKSI, ADMIN_PENYEDIA_MENU, ADMIN_PENGANTARAN_MENU, SERVICE_MENU,
  ],

  ASISTEN_CEO: [
    {
      label: "Overview",
      items: [
        { name: "Dashboard", href: "/dashboard", icon: Icons.dashboard },
        ITEM_ABSENSI, ITEM_LEMBUR, ITEM_PKL_REPORT,
        ITEM_MISSIONS, // ✅
        { name: "Log Aktivitas", href: "/dashboard/activity-log", icon: Icons.log },
        { name: "Log Login", href: "/dashboard/login-logs", icon: Icons.loginLog },
        { name: "Laporan Keuangan", href: "/dashboard/reports", icon: Icons.reports },
        { name: "Manajemen User", href: "/dashboard/users", icon: Icons.users },
      ],
    },
    ADMIN_INVENTARIS, ADMIN_TRANSAKSI, ADMIN_PENYEDIA_MENU, ADMIN_PENGANTARAN_MENU, SERVICE_MENU,
  ],

  // ── SALES ──────────────────────────────────────────────────────────────────
  // SALES_OVERVIEW() sudah include ITEM_MISSIONS
  KEPALA_SALES: [
    SALES_OVERVIEW([ITEM_USERS]),
    SALES_INVENTARIS, SALES_TRANSAKSI,
    PREPARATION_SALES_MENU, PREPARATION_PENYEDIA_MENU, PREPARATION_SALES_DELIVERY_MENU,
  ],

  CREW_SALES: [
    SALES_OVERVIEW([ITEM_USERS]),
    SALES_INVENTARIS, SALES_TRANSAKSI,
    PREPARATION_SALES_MENU, PREPARATION_PENYEDIA_MENU, PREPARATION_SALES_DELIVERY_MENU,
  ],

  SOTECH: [
    SALES_OVERVIEW([ITEM_USERS]),
    SALES_INVENTARIS, SALES_TRANSAKSI,
    PREPARATION_SALES_MENU, PREPARATION_SALES_DELIVERY_MENU,
  ],

  PENGANTARAN: [
    SALES_OVERVIEW([ITEM_USERS]),
    SALES_INVENTARIS, PENGANTARAN_TRANSAKSI,
    PREPARATION_PENGANTARAN_MENU,
  ],

  KEPALA_ONPOINT: [
    SALES_OVERVIEW([ITEM_USERS]),
    SALES_INVENTARIS, SALES_TRANSAKSI,
    PREPARATION_PENYEDIA_MENU,
  ],

  ONPOINT: [
    SALES_OVERVIEW([ITEM_USERS]),
    SALES_INVENTARIS, SALES_TRANSAKSI,
    PREPARATION_SALES_MENU, PREPARATION_SALES_DELIVERY_MENU,
  ],

  KEPALA_SOTECH: [
    SALES_OVERVIEW([ITEM_USERS]),
    SALES_INVENTARIS, SALES_TRANSAKSI,
    PREPARATION_SALES_MENU, PREPARATION_PENYEDIA_MENU, PREPARATION_SALES_DELIVERY_MENU,
  ],

  // ── TEKNISI ────────────────────────────────────────────────────────────────
  TEKNISI: [
    {
      label: "Overview",
      items: [
        { name: "Dashboard", href: "/dashboard", icon: Icons.dashboard },
        ITEM_ABSENSI, ITEM_LEMBUR, ITEM_USERS,
        ITEM_MISSIONS, // ✅
      ],
    },
    {
      label: "Inventaris",
      items: [
        { name: "Data Laptop", href: "/dashboard/laptops", icon: Icons.laptop },
        { name: "Garansi", href: "/dashboard/warranty", icon: Icons.garansi },
        { name: "Laptop Minus", href: "/dashboard/laptops/minus", icon: Icons.laptopMinus },
      ],
    },
    {
      label: "Transaksi",
      items: [{ name: "Riwayat Transaksi", href: "/dashboard/transactions", icon: Icons.riwayat }],
    },
    SERVICE_MENU,
    { label: "Tools", items: [{ name: "Scanner", href: "/scan", icon: Icons.scanner }] },
  ],

  KEPALA_TEKNISI: [
    {
      label: "Overview",
      items: [
        { name: "Dashboard", href: "/dashboard", icon: Icons.dashboard },
        ITEM_ABSENSI, ITEM_LEMBUR, ITEM_USERS, ITEM_PKL_REPORT,
        ITEM_MISSIONS, // ✅
      ],
    },
    {
      label: "Inventaris",
      items: [
        { name: "Data Laptop", href: "/dashboard/laptops", icon: Icons.laptop },
        { name: "Garansi", href: "/dashboard/warranty", icon: Icons.garansi },
        { name: "Laptop Siap Jual", href: "/dashboard/laptops/ready", icon: Icons.laptopReady },
        { name: "Laptop Minus", href: "/dashboard/laptops/minus", icon: Icons.laptopMinus },
        ITEM_ACCESSORIES,
      ],
    },
    SERVICE_MENU,
    { label: "Tools", items: [{ name: "Scanner", href: "/scan", icon: Icons.scanner }] },
  ],

  // ── ACCOUNTING ─────────────────────────────────────────────────────────────
  ACCOUNTING: [
    SALES_OVERVIEW([ // sudah include ITEM_MISSIONS
      { name: "Laporan Keuangan", href: "/dashboard/reports", icon: Icons.reports },
      ITEM_USERS,
    ]),
    {
      label: "Inventaris",
      items: [
        { name: "Data Laptop", href: "/dashboard/laptops", icon: Icons.laptop },
        { name: "Laptop Siap Jual", href: "/dashboard/laptops/ready", icon: Icons.laptopReady },
        { name: "Laptop Minus", href: "/dashboard/laptops/minus", icon: Icons.laptopMinus },
        ITEM_ACCESSORIES,
      ],
    },
    {
      label: "Transaksi",
      items: [
        { name: "Riwayat", href: "/dashboard/transactions", icon: Icons.riwayat },
        { name: "DP & Ambil Dulu", href: "/dashboard/pending-orders", icon: Icons.pendingOrders },
      ],
    },
  ],

  // ── PENGELOLA BARANG ───────────────────────────────────────────────────────
  PENGELOLA_BARANG: [
    {
      label: "Overview",
      items: [
        { name: "Dashboard", href: "/dashboard", icon: Icons.dashboard },
        ITEM_ABSENSI, ITEM_LEMBUR,
        { name: "Riwayat", href: "/dashboard/transactions", icon: Icons.riwayat },
        ITEM_USERS,
        ITEM_MISSIONS, // ✅
      ],
    },
    {
      label: "Inventaris",
      items: [
        { name: "Data Laptop", href: "/dashboard/laptops", icon: Icons.laptop },
        { name: "Laptop Siap Jual", href: "/dashboard/laptops/ready", icon: Icons.laptopReady },
        { name: "Laptop Minus", href: "/dashboard/laptops/minus", icon: Icons.laptopMinus },
        ITEM_ACCESSORIES,
      ],
    },
    { label: "Tools", items: [{ name: "Scanner", href: "/scan", icon: Icons.scanner }] },
  ],

  KEPALA_PENGELOLA_BARANG: [
    {
      label: "Overview",
      items: [
        { name: "Dashboard", href: "/dashboard", icon: Icons.dashboard },
        ITEM_ABSENSI, ITEM_LEMBUR, ITEM_USERS, ITEM_PKL_REPORT,
        ITEM_MISSIONS, // ✅
      ],
    },
    {
      label: "Inventaris",
      items: [
        { name: "Data Laptop", href: "/dashboard/laptops", icon: Icons.laptop },
        { name: "Laptop Siap Jual", href: "/dashboard/laptops/ready", icon: Icons.laptopReady },
        { name: "Laptop Minus", href: "/dashboard/laptops/minus", icon: Icons.laptopMinus },
      ],
    },
    { label: "Tools", items: [{ name: "Scanner", href: "/scan", icon: Icons.scanner }] },
  ],

  // ── MARKETING ──────────────────────────────────────────────────────────────
  MARKETING: [
    {
      label: "Overview",
      items: [ITEM_ABSENSI, ITEM_LEMBUR, ITEM_USERS, ITEM_MISSIONS], // ✅
    },
    {
      label: "Inventaris",
      items: [
        { name: "Data Laptop", href: "/dashboard/laptops", icon: Icons.laptop },
        { name: "Laptop Siap Jual", href: "/dashboard/laptops/ready", icon: Icons.laptopReady },
      ],
    },
  ],

  KEPALA_MARKETING: [
    SALES_OVERVIEW([ITEM_USERS]), // sudah include ITEM_MISSIONS
    {
      label: "Inventaris",
      items: [
        { name: "Data Laptop", href: "/dashboard/laptops", icon: Icons.laptop },
        { name: "Garansi", href: "/dashboard/warranty", icon: Icons.garansi },
        { name: "Laptop Siap Jual", href: "/dashboard/laptops/ready", icon: Icons.laptopReady },
      ],
    },
    {
      label: "Transaksi",
      items: [
        { name: "Riwayat Transaksi", href: "/dashboard/transactions", icon: Icons.riwayat },
        ITEM_MANAGEMENT_SELLER,
        { name: "Laporan Keuangan", href: "/dashboard/reports", icon: Icons.reports },
      ],
    },
    PREPARATION_SALES_MENU, PREPARATION_PENYEDIA_MENU, PREPARATION_SALES_DELIVERY_MENU,
  ],

  // ── KEBERSIHAN ─────────────────────────────────────────────────────────────
  KEBERSIHAN: [
    {
      label: "Overview",
      items: [
        ITEM_ABSENSI, ITEM_LEMBUR,
        { name: "Dashboard", href: "/dashboard", icon: Icons.dashboard },
        { name: "Riwayat", href: "/dashboard/transactions", icon: Icons.riwayat },
        ITEM_USERS,
        ITEM_MISSIONS, // ✅
      ],
    },
    {
      label: "Inventaris",
      items: [
        { name: "Data Laptop", href: "/dashboard/laptops", icon: Icons.laptop },
        { name: "Laptop Siap Jual", href: "/dashboard/laptops/ready", icon: Icons.laptopReady },
      ],
    },
  ],

  // ── PENYEDIA BARANG ────────────────────────────────────────────────────────
  PENYEDIA_BARANG: [
    {
      label: "Overview",
      items: [
        { name: "Dashboard", href: "/dashboard", icon: Icons.dashboard },
        ITEM_ABSENSI, ITEM_LEMBUR, ITEM_USERS,
        ITEM_MISSIONS, // ✅
      ],
    },
    {
      label: "Inventaris",
      items: [
        { name: "Data Laptop", href: "/dashboard/laptops", icon: Icons.laptop },
        { name: "Laptop Siap Jual", href: "/dashboard/laptops/ready", icon: Icons.laptopReady },
      ],
    },
    PREPARATION_PENYEDIA_MENU,
    {
      label: "Transaksi",
      items: [{ name: "Riwayat Transaksi", href: "/dashboard/transactions", icon: Icons.riwayat }],
    },
  ],

  KEPALA_PENYEDIA_BARANG: [
    {
      label: "Overview",
      items: [
        { name: "Dashboard", href: "/dashboard", icon: Icons.dashboard },
        ITEM_ABSENSI, ITEM_LEMBUR, ITEM_USERS, ITEM_PKL_REPORT,
        ITEM_MISSIONS, // ✅
      ],
    },
    {
      label: "Inventaris",
      items: [
        { name: "Data Laptop", href: "/dashboard/laptops", icon: Icons.laptop },
        { name: "Laptop Siap Jual", href: "/dashboard/laptops/ready", icon: Icons.laptopReady },
      ],
    },
    PREPARATION_PENYEDIA_MENU,
    {
      label: "Transaksi",
      items: [{ name: "Riwayat Transaksi", href: "/dashboard/transactions", icon: Icons.riwayat }],
    },
  ],

  // ── KONTEN ─────────────────────────────────────────────────────────────────
  KONTEN: [
    {
      label: "Overview",
      items: [ITEM_ABSENSI, ITEM_LEMBUR, ITEM_USERS, ITEM_MISSIONS], // ✅
    },
    {
      label: "Inventaris",
      items: [
        { name: "Data Laptop", href: "/dashboard/laptops", icon: Icons.laptop },
        { name: "Laptop Siap Jual", href: "/dashboard/laptops/ready", icon: Icons.laptopReady },
      ],
    },
    {
      label: "Transaksi",
      items: [{ name: "Riwayat Transaksi", href: "/dashboard/transactions", icon: Icons.riwayat }],
    },
  ],

  // ── CUSTOMER SERVICE ───────────────────────────────────────────────────────
  CUSTOMER_SERVICE: [
    {
      label: "Overview",
      items: [
        { name: "Dashboard", href: "/dashboard", icon: Icons.dashboard },
        ITEM_ABSENSI, ITEM_LEMBUR, ITEM_USERS,
        ITEM_MISSIONS, // ✅
      ],
    },
    {
      label: "Inventaris",
      items: [
        { name: "Data Laptop", href: "/dashboard/laptops", icon: Icons.laptop },
        { name: "Laptop Siap Jual", href: "/dashboard/laptops/ready", icon: Icons.laptopReady },
      ],
    },
    {
      label: "Transaksi",
      items: [
        { name: "Buat Payment", href: "/payment/create", icon: Icons.payment },
        { name: "Scanner", href: "/scan", icon: Icons.scanner },
      ],
    },
    SERVICE_MENU,
  ],

  // ── PKL — TIDAK ada ITEM_MISSIONS ─────────────────────────────────────────
  PKL: PKL_MENU,
  PKL_MARKETING: PKL_MENU,
  PKL_SALES: PKL_SALES_MENU,
  PKL_PENYEDIA_BARANG: PKL_PENYEDIA_MENU,
  PKL_SOTECH: PKL_MENU,
  PKL_ONPOINT: PKL_MENU,
  PKL_TEKNISI: PKL_MENU,
  PKL_KONTEN: PKL_MENU,
};

// ── Role meta ─────────────────────────────────────────────────────────────────
const ROLE_META: Record<UserRole, { label: string; className: string }> = {
  ADMIN: { label: "Admin / CEO", className: "bg-violet-50 text-violet-700" },
  KEPALA_SALES: { label: "Kepala Sales", className: "bg-emerald-50 text-emerald-700" },
  CREW_SALES: { label: "Crew Sales", className: "bg-sky-50 text-sky-700" },
  ACCOUNTING: { label: "Accounting", className: "bg-amber-50 text-amber-700" },
  PENGELOLA_BARANG: { label: "Pengelola Barang", className: "bg-blue-50 text-blue-700" },
  TEKNISI: { label: "Teknisi", className: "bg-orange-50 text-orange-700" },
  KEPALA_TEKNISI: { label: "Kepala Teknisi", className: "bg-red-50 text-red-700" },
  PENGANTARAN: { label: "Pengantaran", className: "bg-teal-50 text-teal-700" },
  MARKETING: { label: "Marketing", className: "bg-pink-50 text-pink-700" },
  KEBERSIHAN: { label: "Kebersihan", className: "bg-cyan-50 text-cyan-700" },
  KEPALA_MARKETING: { label: "Kepala Marketing", className: "bg-rose-50 text-rose-700" },
  PROGRAMMER: { label: "Programmer", className: "bg-indigo-50 text-indigo-700" },
  SOTECH: { label: "Sotech", className: "bg-lime-50 text-lime-700" },
  ASISTEN_CEO: { label: "Asisten CEO", className: "bg-purple-50 text-purple-700" },
  PENYEDIA_BARANG: { label: "Penyedia Barang", className: "bg-yellow-50 text-yellow-700" },
  KEPALA_PENYEDIA_BARANG: { label: "Kepala Penyedia Barang", className: "bg-orange-50 text-orange-700" },
  KONTEN: { label: "Konten", className: "bg-fuchsia-50 text-fuchsia-700" },
  KEPALA_ONPOINT: { label: "Kepala Onpoint", className: "bg-green-50 text-green-700" },
  ONPOINT: { label: "Onpoint", className: "bg-emerald-50 text-emerald-700" },
  KEPALA_SOTECH: { label: "Kepala Sotech", className: "bg-lime-50 text-lime-700" },
  CUSTOMER_SERVICE: { label: "Customer Service", className: "bg-sky-50 text-sky-700" },
  KEPALA_PENGELOLA_BARANG: { label: "Kepala Pengelola Barang", className: "bg-blue-50 text-blue-700" },
  PKL: { label: "PKL", className: "bg-amber-50 text-amber-700" },
  PKL_MARKETING: { label: "PKL Marketing", className: "bg-amber-50 text-amber-700" },
  PKL_SALES: { label: "PKL Sales", className: "bg-amber-50 text-amber-700" },
  PKL_PENYEDIA_BARANG: { label: "PKL Penyedia Barang", className: "bg-amber-50 text-amber-700" },
  PKL_SOTECH: { label: "PKL Sotech", className: "bg-amber-50 text-amber-700" },
  PKL_ONPOINT: { label: "PKL Onpoint", className: "bg-amber-50 text-amber-700" },
  PKL_TEKNISI: { label: "PKL Teknisi", className: "bg-amber-50 text-amber-700" },
  PKL_KONTEN: { label: "PKL Konten", className: "bg-amber-50 text-amber-700" },
};

function getInitials(name: string): string {
  return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

// ── Multi-role: tampilkan semua role sebagai badge bertumpuk ──────────────────
function RoleBadges({ user }: { user: any }) {
  const roles: string[] = user?.roles?.length > 0 ? user.roles : [user?.role].filter(Boolean);
  if (roles.length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5 mt-0.5">
      {roles.map(role => {
        const meta = ROLE_META[role as UserRole];
        return (
          <span
            key={role}
            className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-md w-fit ${meta?.className ?? "bg-gray-50 text-gray-700"}`}
          >
            {meta?.label ?? role}
          </span>
        );
      })}
    </div>
  );
}

// ── NavItem dengan badge support ──────────────────────────────────────────────
function NavItem({ item, isActive, onClick, badge }: {
  item: MenuItem; isActive: boolean; onClick?: () => void; badge?: number;
}) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`group flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30 ${isActive
        ? "bg-[#1a1a2e] text-white shadow-sm"
        : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
        }`}
    >
      <span className={`flex-shrink-0 ${isActive ? "text-white/70" : "text-gray-400 group-hover:text-gray-600"}`}>
        {item.icon}
      </span>
      <span className="flex-1 truncate">{item.name}</span>
      {badge && badge > 0 ? (
        <span className={`ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black tabular-nums ${isActive ? "bg-white text-[#1a1a2e]" : "bg-red-500 text-white"}`}>
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}

function SidebarContent({ user, loading, groups, pathname, onClose, onLogout, badges }: {
  user: any; loading: boolean; groups: MenuGroup[]; pathname: string;
  onClose?: () => void; onLogout: () => void;
  badges?: Record<string, number>;
}) {
  const initials = user?.name ? getInitials(user.name) : "?";

  const navRef = useRef<HTMLElement>(null);
  const scrollKey = `sidebar_scroll_${onClose ? "m" : "d"}`;

  useEffect(() => {
    if (loading) return;
    const el = navRef.current;
    if (!el) return;
    const saved = sessionStorage.getItem(scrollKey);
    if (saved) {
      requestAnimationFrame(() => { el.scrollTop = parseInt(saved, 10); });
    }
  }, [loading, scrollKey]);

  const handleNavScroll = useCallback(() => {
    const el = navRef.current;
    if (el) sessionStorage.setItem(scrollKey, String(el.scrollTop));
  }, [scrollKey]);

  return (
    <div className="flex flex-col h-full overflow-hidden select-none">

      {/* ── Logo + User ── */}
      <div className="px-4 pt-5 pb-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg overflow-hidden flex-shrink-0 bg-[#1a1a2e]">
              <img
                src="/assets/solit03.jpeg"
                alt="Solit"
                className="w-full h-full object-cover"
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>
            <span className="text-sm font-bold text-[#1a1a2e] tracking-tight">Solit POS</span>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="lg:hidden p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
              aria-label="Tutup sidebar"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {loading || !user ? (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gray-100 animate-pulse flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
              <div className="h-2.5 w-14 bg-gray-100 rounded animate-pulse" />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#1a1a2e] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-800 truncate">{user?.name || "—"}</p>
              <RoleBadges user={user} />
            </div>
          </div>
        )}
      </div>

      <div className="mx-4 h-px bg-gray-100 flex-shrink-0" />

      {/* ── Nav ── */}
      <nav
        ref={navRef}
        onScroll={handleNavScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-3 space-y-3"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#e5e7eb transparent" }}
      >
        {loading ? (
          <div className="space-y-1 pt-1">
            {[1, 2, 3, 4].map(i => (
              <div
                key={i}
                className="h-9 rounded-xl bg-gray-100 animate-pulse mb-1"
                style={{ animationDelay: `${i * 40}ms` }}
              />
            ))}
          </div>
        ) : (
          groups.map(group => (
            <div key={group.label}>
              <p className="text-[10px] font-bold text-gray-300 uppercase tracking-[0.07em] px-3 mb-1">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map(item => {
                  const isActive = (() => {
                    if (pathname === item.href) return true;
                    if (item.href === "/dashboard") return false;
                    if (item.href === "/dashboard/attendance") {
                      return pathname === "/dashboard/attendance";
                    }
                    if (item.href === "/dashboard/preparation") {
                      return pathname === "/dashboard/preparation" ||
                        (pathname.startsWith("/dashboard/preparation/") &&
                          !pathname.startsWith("/dashboard/preparation/antrian") &&
                          !pathname.startsWith("/dashboard/preparation/done") &&
                          !pathname.startsWith("/dashboard/preparation/history") &&
                          !pathname.startsWith("/dashboard/preparation/pengantaran") &&
                          !pathname.startsWith("/dashboard/preparation/sedang-diantar") &&
                          !pathname.startsWith("/dashboard/preparation/siap-kirim"));
                    }
                    if (item.href === "/dashboard/laptops") {
                      return (
                        pathname === "/dashboard/laptops" ||
                        (pathname.startsWith("/dashboard/laptops/") &&
                          !pathname.startsWith("/dashboard/laptops/ready") &&
                          !pathname.startsWith("/dashboard/laptops/minus"))
                      );
                    }
                    if (item.href.startsWith("/dashboard/service/")) {
                      return pathname === item.href;
                    }
                    return pathname.startsWith(item.href);
                  })();

                  return (
                    <NavItem
                      key={item.href}
                      item={item}
                      isActive={isActive}
                      onClick={onClose}
                      badge={badges?.[item.href]}
                    />
                  );
                })}
              </div>
            </div>
          ))
        )}
      </nav>

      {/* ── Logout ── */}
      <div className="p-3 pb-5 border-t border-gray-100 flex-shrink-0">
        <button
          onClick={onLogout}
          className="w-full group flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-all"
        >
          <span className="flex-shrink-0 group-hover:text-red-500">{Icons.logout}</span>
          <span>Keluar</span>
        </button>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const hasFetched = useRef(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const cached = getCachedUser();
    if (cached) {
      setUser(cached);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    const fetchUser = async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) { window.location.href = "/login"; return; }
        const result = await res.json();
        const fresh = result.user ?? null;
        setUser(fresh);
        setCachedUser(fresh);
      } catch { } finally { setLoading(false); }
    };
    fetchUser();
  }, []);

  useEffect(() => { setOpen(false); }, [pathname]);

  const handleLogout = async () => {
    sessionStorage.removeItem(CACHE_KEY);
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  // ✅ Multi-role: ambil semua roles, merge menu
  const userRoles: string[] =
    Array.isArray(user?.roles) && user.roles.length > 0
      ? user.roles
      : user?.role
        ? [user.role]
        : [];

  const groups: MenuGroup[] = userRoles.length > 0
    ? mergeMenuGroups(ROLE_MENUS as Record<string, MenuGroup[]>, userRoles)
    : [];

  // ✅ Prep notify + alarm
  const prep = usePrepNotify(userRoles, user?.id);

  useEffect(() => {
    const unlock = () => { unlockAudio(); window.removeEventListener("pointerdown", unlock); };
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  const onAntrian = pathname.startsWith("/dashboard/preparation/antrian");
  const onSiapKirim = pathname.startsWith("/dashboard/preparation/siap-kirim");

  usePrepAlarm(onAntrian ? [] : prep.menungguUnacked.map((id) => ({ id })), ALARM_KEYS.MENUNGGU, true);
  usePrepAlarm(onSiapKirim ? [] : prep.siapKirimUnacked.map((id) => ({ id })), ALARM_KEYS.SIAP_KIRIM, true);

  // ✅ Delivery badge + badge antrian/siap-kirim
  const deliveryBadge = useDeliveryBadge(user?.id, user?.role);
  const badges: Record<string, number> = {
    "/dashboard/preparation/pengantaran": deliveryBadge,
    "/dashboard/preparation/antrian": prep.menungguUnacked.length,
    "/dashboard/preparation/siap-kirim": prep.siapKirimUnacked.length,
  };

  void mounted;

  return (
    <>
      {/* ── Banner alarm global ── */}
      {!onAntrian && prep.menungguUnacked.length > 0 && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] w-full max-w-sm px-2">
          <button
            onClick={() => { prep.ackMenunggu(prep.menungguUnacked); router.push("/dashboard/preparation/antrian"); }}
            className="w-full bg-red-600 text-white px-4 py-2.5 rounded-full shadow-2xl shadow-red-900/40 flex items-center justify-center gap-2 active:scale-[0.98] transition"
          >
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span className="text-sm font-black">🔔 {prep.menungguUnacked.length} penyiapan baru — buka antrian</span>
          </button>
        </div>
      )}
      {!onSiapKirim && prep.siapKirimUnacked.length > 0 && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-[59] w-full max-w-sm px-2"
          style={{ top: (!onAntrian && prep.menungguUnacked.length > 0) ? 64 : 12 }}
        >
          <button
            onClick={() => { prep.ackSiapKirim(prep.siapKirimUnacked); router.push("/dashboard/preparation/siap-kirim"); }}
            className="w-full bg-orange-600 text-white px-4 py-2.5 rounded-full shadow-2xl shadow-orange-900/40 flex items-center justify-center gap-2 active:scale-[0.98] transition"
          >
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span className="text-sm font-black">📦 {prep.siapKirimUnacked.length} barang siap — pilih pengiriman</span>
          </button>
        </div>
      )}

      {/* Mobile toggle button */}
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-50 p-2 rounded-xl bg-white border border-gray-200 shadow-sm text-gray-600 hover:bg-gray-50 transition"
        aria-label="Buka menu"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Mobile overlay */}
      <div
        className={`lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Mobile sidebar */}
      <aside
        className={`lg:hidden fixed top-0 left-0 z-50 h-full w-56 bg-white border-r border-gray-100 shadow-2xl transition-transform duration-250 ease-out will-change-transform ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <SidebarContent
          user={user} loading={loading} groups={groups} pathname={pathname}
          onClose={() => setOpen(false)} onLogout={handleLogout} badges={badges}
        />
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-56 xl:w-60 bg-white border-r border-gray-100 flex-shrink-0 h-screen sticky top-0 overflow-hidden self-start">
        <SidebarContent
          user={user} loading={loading} groups={groups} pathname={pathname}
          onLogout={handleLogout} badges={badges}
        />
      </aside>
    </>
  );
}