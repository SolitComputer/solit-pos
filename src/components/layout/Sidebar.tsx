"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { usePrepNotify } from "@/hooks/usePrepNotify";
import { usePrepAlarm, ALARM_KEYS } from "@/lib/prepAlarm";
import { unlockAudio } from "@/lib/preparationSound";
import { UserRole } from "@/lib/auth";
import { mergeMenuGroups, isPKLRole, expandRolesWithParents, AI_CEO_ROLES } from "@/lib/permissions";
import { useDeliveryBadge } from "@/hooks/useDeliveryBadge";
import { useNotificationSettings } from "@/hooks/useNotificationSound";

const CACHE_KEY = "solit_sidebar_userit";
const RAIL_KEY = "solit_sidebar_rail";
const WIDTH_KEY = "solit_sidebar_width";
const GROUPS_KEY = "solit_sidebar_groups_open";
const MIN_W = 208;
const MAX_W = 360;
const DEFAULT_W = 240;
const RAIL_W = 74;

// ── Single source untuk active-state ─────────────────────────────────────────
function isItemActive(href: string, pathname: string): boolean {
  if (pathname === href) return true;
  if (href === "/dashboard") return false;
  if (href === "/dashboard/attendance") return pathname === "/dashboard/attendance";

  if (href.startsWith("/dashboard/data-barang")) {
    return (
      pathname === "/dashboard/data-barang" ||
      pathname.startsWith("/dashboard/data-barang/")
    );
  }

  if (href === "/dashboard/laptops/ready") {
    return pathname === "/dashboard/laptops/ready";
  }
  if (href === "/dashboard/laptops/minus") {
    return pathname === "/dashboard/laptops/minus";
  }

  if (href === "/dashboard/preparation") {
    return (
      pathname === "/dashboard/preparation" ||
      (pathname.startsWith("/dashboard/preparation/") &&
        !pathname.startsWith("/dashboard/preparation/antrian") &&
        !pathname.startsWith("/dashboard/preparation/done") &&
        !pathname.startsWith("/dashboard/preparation/history") &&
        !pathname.startsWith("/dashboard/preparation/pengantaran") &&
        !pathname.startsWith("/dashboard/preparation/sedang-diantar") &&
        !pathname.startsWith("/dashboard/preparation/siap-kirim") &&
        !pathname.startsWith("/dashboard/preparation/statistik"))
    );
  }

  if (href === "/dashboard/laptops") {
    return (
      pathname === "/dashboard/laptops" ||
      (pathname.startsWith("/dashboard/laptops/") &&
        !pathname.startsWith("/dashboard/laptops/ready") &&
        !pathname.startsWith("/dashboard/laptops/minus"))
    );
  }
  if (href.startsWith("/dashboard/service/")) return pathname === href;
  if (href === "/dashboard/missions") return pathname === "/dashboard/missions";
  if (href === "/dashboard/missions/all") return pathname === "/dashboard/missions/all";
  if (href === "/dashboard/todos") return pathname === "/dashboard/todos";
  if (href === "/dashboard/akutansi") {
    return pathname === "/dashboard/akutansi" || pathname.startsWith("/dashboard/akutansi/");
  }
  return pathname.startsWith(href);
}

function getCachedUser() {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setCachedUser(user: any) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(user));
  } catch { }
}

interface MenuItem {
  name: string;
  href: string;
  icon: React.ReactNode;
}
interface MenuGroup {
  label: string;
  items: MenuItem[];
}

const Icons = {
  dashboard: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="8" rx="2" /><rect x="3" y="13" width="8" height="8" rx="2" /><rect x="13" y="13" width="8" height="8" rx="2" /></svg>),
  attendance: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /><path d="M9 14.5l2 2 4-4.5" /></svg>),
  overtime: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>),
  riwayat: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5" /><path d="M8.5 13h7M8.5 17h7" /></svg>),
  laptop: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M2 20h20" /></svg>),
  garansi: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.5l7.5 3v6c0 5-3.2 8.7-7.5 10-4.3-1.3-7.5-5-7.5-10v-6z" /><path d="M9 12l2 2 4-4.5" /></svg>),
  payment: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /><path d="M6 15h4" /></svg>),
  scanner: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8V6a2 2 0 012-2h2" /><path d="M16 4h2a2 2 0 012 2v2" /><path d="M20 16v2a2 2 0 01-2 2h-2" /><path d="M8 20H6a2 2 0 01-2-2v-2" /><path d="M4 12h16" /></svg>),
  logout: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H6a2 2 0 01-2-2V5a2 2 0 012-2h3" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>),
  log: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3a1 1 0 011-1h4a1 1 0 011 1v1" /><path d="M9 13l2 2 4-4.5" /></svg>),
  loginLog: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 21h3a2 2 0 002-2V5a2 2 0 00-2-2h-3" /><path d="M8 17l-5-5 5-5" /><path d="M3 12h12" /></svg>),
  reports: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v16a2 2 0 002 2h16" /><rect x="7" y="13" width="3" height="5" rx="0.5" /><rect x="12" y="9" width="3" height="9" rx="0.5" /><rect x="17" y="6" width="3" height="12" rx="0.5" /></svg>),
  laptopReady: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M2 20h20" /><path d="M9 10l2 2 4-4" /></svg>),
  laptopMinus: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M2 20h20" /><path d="M9 10h6" /></svg>),
  pendingOrders: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l2 3h6l2-3h4" /><path d="M5.5 5h13l2.5 7v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6z" /></svg>),
  users: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="8" r="4" /><path d="M22.5 21v-2a4 4 0 00-3-3.87" /><path d="M16.5 3.2a4 4 0 010 7.6" /></svg>),
  leaderboard: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4h10v5a5 5 0 01-10 0z" /><path d="M7 5H4.5a2 2 0 000 4H7M17 5h2.5a2 2 0 010 4H17" /><path d="M12 14v3" /><path d="M8 21h8" /></svg>),
  code: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l-6-6 6-6" /><path d="M15 6l6 6-6 6" /></svg>),
  serviceQueue: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.7 2.7-2-2z" /></svg>),
  serviceDone: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>),
  serviceHistory: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 109-9 9 9 0 00-7 3.4" /><path d="M3 4v4.5H7.5" /><path d="M12 8v4l3 2" /></svg>),
  pklReport: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3h6l4 4v13a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z" /><path d="M14 3v4h4" /><circle cx="12" cy="13" r="1.8" /><path d="M9 18c0-1.7 1.3-3 3-3s3 1.3 3 3" /></svg>),
  accessories: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="6.5" cy="6.5" r="1.4" /><circle cx="12" cy="6.5" r="1.4" /><circle cx="17.5" cy="6.5" r="1.4" /><circle cx="6.5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="17.5" cy="12" r="1.4" /><circle cx="6.5" cy="17.5" r="1.4" /><circle cx="12" cy="17.5" r="1.4" /><circle cx="17.5" cy="17.5" r="1.4" /></svg>),
  barang: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5l8 4.5 8-4.5" /><path d="M12 12v9" /></svg>),
  allUnits: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></svg>),
  monitorChat: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" /><circle cx="12" cy="12" r="3" /></svg>),
  cashflow: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h13" /><path d="M13 3l4 4-4 4" /><path d="M20 17H7" /><path d="M11 21l-4-4 4-4" /></svg>),
  managementSeller: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0112 0" /><circle cx="17.5" cy="9.5" r="2.3" /><path d="M15.5 20a5 5 0 016.5-3.8" /></svg>),
  deliveryRoute: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="19" r="2.2" /><circle cx="18" cy="5" r="2.2" /><path d="M8 19h6a3 3 0 003-3V9M16 5H10a3 3 0 00-3 3v3" /></svg>),
  notifSound: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15V9h4l5-4v14l-5-4H4z" /><path d="M17 8.5a5 5 0 010 7" /><path d="M19.5 6a8 8 0 010 12" /></svg>),
  missions: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3v18" /><path d="M6 4h11l-2.5 4L17 12H6" /></svg>),
  ccReport: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="15" height="14" rx="2" /><path d="M17 9l5-3v12l-5-3" /></svg>),
  missionDashboard: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /></svg>),
  missionProgress: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 8-5-16-3 8H2" /></svg>),
  missionHistory: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 109-9 9 9 0 00-7 3.4" /><path d="M3 4v4.5H7.5" /><path d="M12 7.5v5l3.5 2" /></svg>),
  customerBirthday: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 21v-7a2 2 0 012-2h12a2 2 0 012 2v7" /><path d="M2 21h20" /><path d="M12 12V7" /><circle cx="12" cy="5.5" r="1.5" /><path d="M4 17c1 1 2 1 3 0s2-1 3 0 2 1 3 0 2-1 3 0 2 1 3 0" /></svg>),
  employeeBirthday: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="9" width="18" height="12" rx="1.5" /><path d="M3 13h18" /><path d="M12 9v12" /><path d="M12 9c-1.8 0-3.2-1.2-3.2-2.7S9.5 4 12 6c2.5-2 3.2-.2 3.2 1.3S13.8 9 12 9z" /></svg>),
  leadsChat: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.4 8.4 0 01-8.9 8.4 8.7 8.7 0 01-3.5-.8L3 21l1.9-5.4a8.4 8.4 0 01-.8-3.6A8.4 8.4 0 0112.5 3a8.4 8.4 0 018.5 8.5z" /></svg>),
  salesResult: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8" /><path d="M15 6h6v6" /></svg>),
  missionAll: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 6l1.5 1.5L9 5" /><path d="M12 6h9" /><path d="M5 12l1.5 1.5L9 11" /><path d="M12 12h9" /><path d="M5 18l1.5 1.5L9 17" /><path d="M12 18h9" /></svg>),
  todo: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="6" height="6" rx="1.2" /><path d="M4.5 7l1.2 1.2L7.5 6" /><rect x="3" y="14" width="6" height="6" rx="1.2" /><path d="M4.5 17l1.2 1.2L7.5 16" /><path d="M12 6h9M12 17h9" /></svg>),
  accounting: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4.5c2.5-1 5.5-1 8 .3v14c-2.5-1.3-5.5-1.3-8-.3z" /><path d="M22 4.5c-2.5-1-5.5-1-8 .3v14c2.5-1.3 5.5-1.3 8-.3z" /></svg>),
  patchNotes: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>),
  aiCeo: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l1.8 4.2L18 8l-4.2 1.8L12 14l-1.8-4.2L6 8l4.2-1.8z" /><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" /></svg>),
};

const ITEM_DASHBOARD: MenuItem = { name: "Dashboard", href: "/dashboard", icon: Icons.dashboard };
const ITEM_ABSENSI: MenuItem = { name: "Absensi", href: "/dashboard/attendance", icon: Icons.attendance };
const ITEM_LEMBUR: MenuItem = { name: "Lembur", href: "/dashboard/attendance/overtime", icon: Icons.overtime };
const ITEM_USERS: MenuItem = { name: "Management User", href: "/dashboard/users", icon: Icons.users };
const ITEM_PKL_REPORT: MenuItem = { name: "Laporan Kerja PKL", href: "/dashboard/pkl-reports", icon: Icons.pklReport };
const ITEM_ACCESSORIES: MenuItem = { name: "Data Aksesori", href: "/dashboard/accessories", icon: Icons.accessories };
const ITEM_ALL_UNITS: MenuItem = { name: "Barang Terjual", href: "/dashboard/units", icon: Icons.allUnits };
const ITEM_MANAGEMENT_SELLER: MenuItem = { name: "Management Seller", href: "/dashboard/management-seller", icon: Icons.managementSeller };
const ITEM_MISSIONS: MenuItem = { name: "Misi Pekerjaan", href: "/dashboard/missions", icon: Icons.missions };
const ITEM_CASHFLOW: MenuItem = { name: "Cashflow", href: "/dashboard/cashflow", icon: Icons.cashflow };
const ITEM_CC_REPORT: MenuItem = { name: "Laporan Konten (CC)", href: "/dashboard/cc-reports", icon: Icons.ccReport };
const ITEM_CUSTOMER_BIRTHDAY: MenuItem = { name: "Ultah Customer", href: "/dashboard/customer-birthdays", icon: Icons.customerBirthday };
const ITEM_TODOS: MenuItem = { name: "To-Do List", href: "/dashboard/todos", icon: Icons.todo };
const ITEM_PATCH_NOTES: MenuItem = { name: "Patch Notes", href: "/dashboard/admin/patch-notes", icon: Icons.patchNotes };
const ITEM_AI_CEO: MenuItem = { name: "AI CEO", href: "/dashboard/ai-ceo", icon: Icons.aiCeo };
const ITEM_AKUNTANSI: MenuItem = { name: "Akuntansi", href: "/dashboard/akutansi", icon: Icons.accounting };

const ITEM_LOG_AKTIVITAS: MenuItem = { name: "Log Aktivitas", href: "/dashboard/activity-log", icon: Icons.log };
const ITEM_LOG_LOGIN: MenuItem = { name: "Log Login", href: "/dashboard/login-logs", icon: Icons.loginLog };
const ITEM_LAPORAN_KEUANGAN: MenuItem = { name: "Laporan Keuangan", href: "/dashboard/reports", icon: Icons.reports };
const ITEM_MONITOR_CHAT: MenuItem = { name: "Monitor Chat", href: "/dashboard/admin-chat", icon: Icons.monitorChat };
const ITEM_LEADS_CHAT: MenuItem = { name: "Leads Chat Masuk", href: "/dashboard/leads-chat", icon: Icons.leadsChat };
const ITEM_HASIL_PENJUALAN: MenuItem = { name: "Hasil Penjualan", href: "/dashboard/hasil-penjualan", icon: Icons.salesResult };
const ITEM_ULTAH_KARYAWAN: MenuItem = { name: "Ultah Karyawan", href: "/dashboard/employee-birthdays", icon: Icons.employeeBirthday };

const ITEM_ANTRIAN_MASUK: MenuItem = { name: "Antrian Masuk", href: "/dashboard/preparation/antrian", icon: Icons.serviceQueue };
const ITEM_RIWAYAT_PENYEDIA: MenuItem = { name: "Dashboard Barang", href: "/dashboard/riwayat-penyedia", icon: Icons.leaderboard };
const ITEM_DATA_BARANG: MenuItem = { name: "Data Barang", href: "/dashboard/data-barang?tab=laptops", icon: Icons.barang };
const ITEM_LAPTOP_SIAP_JUAL: MenuItem = { name: "Barang Siap Jual", href: "/dashboard/laptops/ready", icon: Icons.laptopReady };
const ITEM_LAPTOP_MINUS: MenuItem = { name: "Barang Minus", href: "/dashboard/laptops/minus", icon: Icons.laptopMinus };
const ITEM_LEADERBOARD_PEKERJAAN: MenuItem = { name: "Leaderboard Pekerjaan", href: "/dashboard/missions/leaderboard", icon: Icons.leaderboard };

const GROUP_ABSENSI_SIMPLE: MenuGroup = { label: "Absensi", items: [ITEM_ABSENSI] };
const GROUP_ABSENSI: MenuGroup = { label: "Absensi", items: [ITEM_ABSENSI, ITEM_LEMBUR] };
const GROUP_ABSENSI_WITH_PKL: MenuGroup = { label: "Absensi", items: [ITEM_ABSENSI, ITEM_LEMBUR, ITEM_PKL_REPORT] };
const GROUP_LOG: MenuGroup = { label: "Log", items: [ITEM_LOG_LOGIN, ITEM_LOG_AKTIVITAS] };
const GROUP_KEUANGAN: MenuGroup = { label: "Keuangan", items: [ITEM_LAPORAN_KEUANGAN, ITEM_CASHFLOW, ITEM_AKUNTANSI] };
const GROUP_MANAGEMENT: MenuGroup = { label: "Management", items: [ITEM_USERS, ITEM_MANAGEMENT_SELLER, ITEM_MONITOR_CHAT] };
const GROUP_MARKETING: MenuGroup = { label: "Marketing", items: [ITEM_CC_REPORT, ITEM_LEADS_CHAT, ITEM_HASIL_PENJUALAN] };
const GROUP_ULTAH: MenuGroup = { label: "Ultah", items: [ITEM_CUSTOMER_BIRTHDAY, ITEM_ULTAH_KARYAWAN] };

const MISSIONS_MENU: MenuGroup = {
  label: "Misi Pekerjaan",
  items: [
    { name: "Dashboard Misi", href: "/dashboard/missions", icon: Icons.missionDashboard },
    { name: "Progress Misi", href: "/dashboard/missions/progress", icon: Icons.missionProgress },
    { name: "Riwayat Misi", href: "/dashboard/missions/history", icon: Icons.missionHistory },
  ],
};

const MISSION_FULL_ACCESS_ROLES: UserRole[] = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO", "ACCOUNTING"];
const ITEM_MISSION_ALL: MenuItem = { name: "Semua Misi", href: "/dashboard/missions/all", icon: Icons.missionAll };

const PREPARATION_PENYEDIA_MENU: MenuGroup = {
  label: "Penyiapan Barang",
  items: [
    { name: "Dashboard Penyiapan", href: "/dashboard/preparation", icon: Icons.pendingOrders },
    ITEM_ANTRIAN_MASUK,
    { name: "Selesai Disiapkan", href: "/dashboard/preparation/done", icon: Icons.serviceDone },
    ITEM_RIWAYAT_PENYEDIA,
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
    { name: "Dashboard Pengantaran", href: "/dashboard/preparation/statistik", icon: Icons.dashboard },
    { name: "Siap Dikirim ", href: "/dashboard/preparation/siap-kirim", icon: Icons.serviceQueue },
    { name: "Sedang Diantar", href: "/dashboard/preparation/sedang-diantar", icon: Icons.deliveryRoute },
    { name: "Riwayat Pengantaran", href: "/dashboard/preparation/history", icon: Icons.serviceHistory },
  ],
};

const PREPARATION_PENGANTARAN_MENU: MenuGroup = {
  label: "Pengantaran",
  items: [
    { name: "Dashboard Pengantaran", href: "/dashboard/preparation/statistik", icon: Icons.dashboard },
    ITEM_ANTRIAN_MASUK,
    { name: "Tugas Antar Saya", href: "/dashboard/preparation/pengantaran", icon: Icons.deliveryRoute },
    { name: "Sedang Diantar", href: "/dashboard/preparation/sedang-diantar", icon: Icons.pendingOrders },
    { name: "Riwayat Pengantaran", href: "/dashboard/preparation/history", icon: Icons.serviceHistory },
  ],
};

const ADMIN_PENYEDIA_MENU: MenuGroup = {
  label: "Penyedia Barang",
  items: [
    ITEM_RIWAYAT_PENYEDIA,
    { name: "Semua Penyiapan", href: "/dashboard/preparation", icon: Icons.pendingOrders },
    { name: "Antrian Masuk", href: "/dashboard/preparation/antrian", icon: Icons.serviceQueue },
    { name: "Selesai Disiapkan", href: "/dashboard/preparation/done", icon: Icons.serviceDone },
  ],
};

const ADMIN_PENGANTARAN_MENU: MenuGroup = {
  label: "Pengantaran",
  items: [
    { name: "Dashboard Pengantaran", href: "/dashboard/preparation/statistik", icon: Icons.dashboard },
    { name: "Siap Dikirim", href: "/dashboard/preparation/siap-kirim", icon: Icons.serviceQueue },
    { name: "Sedang Diantar", href: "/dashboard/preparation/sedang-diantar", icon: Icons.deliveryRoute },
    { name: "Riwayat Pengantaran", href: "/dashboard/preparation/history", icon: Icons.serviceHistory },
    { name: "Suara Notifikasi", href: "/dashboard/admin/notifikasi-pengantaran", icon: Icons.notifSound },
  ],
};

const ADMIN_UTAMA: MenuGroup = {
  label: "Utama",
  items: [ITEM_DASHBOARD, ITEM_LEADERBOARD_PEKERJAAN, ITEM_TODOS, ITEM_PATCH_NOTES],
};

const ADMIN_CORE_GROUPS: MenuGroup[] = [
  ADMIN_UTAMA, GROUP_ABSENSI_WITH_PKL, GROUP_LOG, GROUP_KEUANGAN,
  GROUP_MANAGEMENT, GROUP_MARKETING, GROUP_ULTAH,
];

const ADMIN_INVENTARIS: MenuGroup = {
  label: "Inventaris",
  items: [
    ITEM_DATA_BARANG, ITEM_LAPTOP_SIAP_JUAL, ITEM_LAPTOP_MINUS, ITEM_ALL_UNITS,
    { name: "Garansi", href: "/dashboard/warranty", icon: Icons.garansi },
  ],
};

const ADMIN_TRANSAKSI: MenuGroup = {
  label: "Transaksi",
  items: [
    { name: "Buat Payment", href: "/payment/create", icon: Icons.payment },
    { name: "Riwayat Pending", href: "/dashboard/pending-orders", icon: Icons.pendingOrders },
    { name: "Riwayat Transaksi", href: "/dashboard/transactions", icon: Icons.riwayat },
    ITEM_MANAGEMENT_SELLER,
    { name: "Scanner", href: "/scan", icon: Icons.scanner },
  ],
};

const SERVICE_MENU: MenuGroup = {
  label: "Servis",
  items: [
    { name: "Dashboard Servis", href: "/dashboard/service/statistik", icon: Icons.dashboard },
    { name: "Antrian", href: "/dashboard/service/antrian", icon: Icons.serviceQueue },
    { name: "Selesai (Done)", href: "/dashboard/service/done", icon: Icons.serviceDone },
    { name: "Riwayat Servis", href: "/dashboard/service/history", icon: Icons.serviceHistory },
  ],
};

const SALES_OVERVIEW = (extra: MenuItem[] = []): MenuGroup[] => [
  { label: "Utama", items: [ITEM_DASHBOARD, ...extra] },
  GROUP_ABSENSI_WITH_PKL,
  { label: "Ultah", items: [ITEM_CUSTOMER_BIRTHDAY, ITEM_ULTAH_KARYAWAN] },
];

const SALES_INVENTARIS: MenuGroup = {
  label: "Inventaris",
  items: [ITEM_DATA_BARANG, ITEM_LAPTOP_SIAP_JUAL, { name: "Garansi", href: "/dashboard/warranty", icon: Icons.garansi }],
};

const SALES_TRANSAKSI: MenuGroup = {
  label: "Transaksi",
  items: [
    { name: "Riwayat", href: "/dashboard/transactions", icon: Icons.riwayat },
    { name: "Buat Payment", href: "/payment/create", icon: Icons.payment },
    { name: "Riwayat Pending", href: "/dashboard/pending-orders", icon: Icons.pendingOrders },
    ITEM_MANAGEMENT_SELLER,
    { name: "Scanner", href: "/scan", icon: Icons.scanner },
  ],
};

const PENGANTARAN_TRANSAKSI: MenuGroup = {
  label: "Transaksi",
  items: [
    { name: "Riwayat", href: "/dashboard/transactions", icon: Icons.riwayat },
    { name: "Buat Payment", href: "/payment/create", icon: Icons.payment },
    { name: "Riwayat Pending", href: "/dashboard/pending-orders", icon: Icons.pendingOrders },
    { name: "Scanner", href: "/scan", icon: Icons.scanner },
  ],
};

const PKL_INVENTARIS_BASIC: MenuGroup = {
  label: "Inventaris",
  items: [ITEM_DATA_BARANG, ITEM_LAPTOP_SIAP_JUAL],
};

const PKL_MENU: MenuGroup[] = [
  { label: "Utama", items: [ITEM_DASHBOARD] },
  { label: "Absensi", items: [ITEM_ABSENSI, ITEM_PKL_REPORT] },
  PKL_INVENTARIS_BASIC,
  { label: "Transaksi", items: [{ name: "Buat Payment", href: "/payment/create", icon: Icons.payment }] },
  { label: "Tools", items: [{ name: "Scanner", href: "/scan", icon: Icons.scanner }] },
];

const PKL_SALES_MENU: MenuGroup[] = [
  { label: "Utama", items: [ITEM_DASHBOARD] },
  { label: "Absensi", items: [ITEM_ABSENSI, ITEM_PKL_REPORT] },
  PKL_INVENTARIS_BASIC,
  {
    label: "Transaksi",
    items: [
      { name: "Riwayat", href: "/dashboard/transactions", icon: Icons.riwayat },
      { name: "Buat Payment", href: "/payment/create", icon: Icons.payment },
      { name: "Scanner", href: "/scan", icon: Icons.scanner },
    ],
  },
  PREPARATION_SALES_MENU, PREPARATION_PENYEDIA_MENU, PREPARATION_SALES_DELIVERY_MENU,
];

const PKL_PENYEDIA_MENU: MenuGroup[] = [
  { label: "Utama", items: [ITEM_DASHBOARD] },
  { label: "Absensi", items: [ITEM_ABSENSI, ITEM_PKL_REPORT] },
  PKL_INVENTARIS_BASIC,
  PREPARATION_PENYEDIA_MENU,
  { label: "Transaksi", items: [{ name: "Buat Payment", href: "/payment/create", icon: Icons.payment }] },
  { label: "Tools", items: [{ name: "Scanner", href: "/scan", icon: Icons.scanner }] },
];

const ROLE_MENUS: Record<UserRole, MenuGroup[]> = {
  ADMIN: [
    ...ADMIN_CORE_GROUPS,
    ADMIN_INVENTARIS, ADMIN_TRANSAKSI, ADMIN_PENYEDIA_MENU, ADMIN_PENGANTARAN_MENU, SERVICE_MENU,
  ],

  PROGRAMMER: [
    ...ADMIN_CORE_GROUPS,
    ADMIN_INVENTARIS, ADMIN_TRANSAKSI, ADMIN_PENYEDIA_MENU, ADMIN_PENGANTARAN_MENU, SERVICE_MENU,
  ],

  KEPALA_ZENITH: [
    ...SALES_OVERVIEW([ITEM_USERS]), SALES_INVENTARIS, SALES_TRANSAKSI,
    PREPARATION_SALES_MENU, PREPARATION_PENYEDIA_MENU, PREPARATION_SALES_DELIVERY_MENU,
  ],

  ASISTEN_CEO: [
    { label: "Utama", items: [ITEM_DASHBOARD] },
    GROUP_ABSENSI_WITH_PKL,
    GROUP_LOG,
    { label: "Keuangan", items: [ITEM_LAPORAN_KEUANGAN] },
    { label: "Management", items: [ITEM_USERS] },
    { label: "Marketing", items: [ITEM_CC_REPORT, ITEM_LEADS_CHAT, ITEM_HASIL_PENJUALAN] },
    GROUP_ULTAH,
    ADMIN_INVENTARIS, ADMIN_TRANSAKSI, ADMIN_PENYEDIA_MENU, ADMIN_PENGANTARAN_MENU, SERVICE_MENU,
  ],

  KEPALA_SALES: [
    { label: "Utama", items: [ITEM_DASHBOARD, ITEM_USERS] },
    GROUP_ABSENSI_SIMPLE,
    { label: "Ultah", items: [ITEM_CUSTOMER_BIRTHDAY, ITEM_ULTAH_KARYAWAN] },
    SALES_INVENTARIS,
    SALES_TRANSAKSI,
    PREPARATION_SALES_MENU,
    PREPARATION_PENYEDIA_MENU,
  ],

  CREW_SALES: [
    ...SALES_OVERVIEW([ITEM_USERS]), SALES_INVENTARIS, SALES_TRANSAKSI,
    PREPARATION_SALES_MENU, PREPARATION_PENYEDIA_MENU, PREPARATION_SALES_DELIVERY_MENU,
  ],

  SOTECH: [
    ...SALES_OVERVIEW([ITEM_USERS]), SALES_INVENTARIS, SALES_TRANSAKSI,
    PREPARATION_SALES_MENU, PREPARATION_SALES_DELIVERY_MENU,
  ],

  PENGANTARAN: [
    ...SALES_OVERVIEW([ITEM_USERS]), SALES_INVENTARIS, PENGANTARAN_TRANSAKSI, PREPARATION_PENGANTARAN_MENU,
  ],

  KEPALA_ONPOINT: [
    ...SALES_OVERVIEW([ITEM_USERS]), SALES_INVENTARIS, SALES_TRANSAKSI,
    PREPARATION_SALES_MENU, PREPARATION_PENYEDIA_MENU, PREPARATION_SALES_DELIVERY_MENU,
  ],

  ONPOINT: [
    ...SALES_OVERVIEW([ITEM_USERS]), SALES_INVENTARIS, SALES_TRANSAKSI,
    PREPARATION_SALES_MENU, PREPARATION_SALES_DELIVERY_MENU,
  ],

  KEPALA_SOTECH: [
    ...SALES_OVERVIEW([ITEM_USERS]), SALES_INVENTARIS, SALES_TRANSAKSI,
    PREPARATION_SALES_MENU, PREPARATION_PENYEDIA_MENU, PREPARATION_SALES_DELIVERY_MENU,
  ],

  TEKNISI: [
    { label: "Utama", items: [ITEM_DASHBOARD] },
    GROUP_ABSENSI,
    { label: "Management", items: [ITEM_USERS] },
    {
      label: "Inventaris",
      items: [ITEM_DATA_BARANG, { name: "Garansi", href: "/dashboard/warranty", icon: Icons.garansi }, ITEM_LAPTOP_MINUS],
    },
    { label: "Transaksi", items: [{ name: "Riwayat Transaksi", href: "/dashboard/transactions", icon: Icons.riwayat }] },
    SERVICE_MENU,
    { label: "Tools", items: [{ name: "Scanner", href: "/scan", icon: Icons.scanner }] },
  ],

  KEPALA_TEKNISI: [
    { label: "Utama", items: [ITEM_DASHBOARD] },
    GROUP_ABSENSI_WITH_PKL,
    { label: "Management", items: [ITEM_USERS] },
    {
      label: "Inventaris",
      items: [
        ITEM_DATA_BARANG, ITEM_LAPTOP_SIAP_JUAL, ITEM_LAPTOP_MINUS, ITEM_ALL_UNITS,
        { name: "Garansi", href: "/dashboard/warranty", icon: Icons.garansi },
      ],
    },
    SERVICE_MENU,
    { label: "Tools", items: [{ name: "Scanner", href: "/scan", icon: Icons.scanner }] },
  ],

  ACCOUNTING: [
    { label: "Utama", items: [ITEM_DASHBOARD] },
    GROUP_ABSENSI_WITH_PKL,
    GROUP_LOG,
    GROUP_KEUANGAN,
    { label: "Management", items: [ITEM_USERS, ITEM_MONITOR_CHAT] },
    { label: "Marketing", items: [ITEM_CC_REPORT, ITEM_LEADS_CHAT, ITEM_HASIL_PENJUALAN] },
    GROUP_ULTAH,
    ADMIN_INVENTARIS, ADMIN_TRANSAKSI, ADMIN_PENYEDIA_MENU, ADMIN_PENGANTARAN_MENU, SERVICE_MENU,
  ],

  PURCHASING: [
    { label: "Utama", items: [ITEM_DASHBOARD] },
    GROUP_ABSENSI,
    { label: "Keuangan", items: [ITEM_LAPORAN_KEUANGAN, ITEM_CASHFLOW] },
    { label: "Management", items: [ITEM_USERS] },
    {
      label: "Inventaris",
      items: [
        { name: "Data Laptop", href: "/dashboard/laptops", icon: Icons.laptop },
        { name: "Barang Siap Jual", href: "/dashboard/laptops/ready", icon: Icons.laptopReady },
      ],
    },
    { label: "Transaksi", items: [{ name: "Riwayat Transaksi", href: "/dashboard/transactions", icon: Icons.riwayat }] },
  ],

  PENGELOLA_BARANG: [
    { label: "Utama", items: [ITEM_DASHBOARD] },
    GROUP_ABSENSI,
    { label: "Management", items: [ITEM_USERS] },
    { label: "Inventaris", items: [ITEM_DATA_BARANG, ITEM_LAPTOP_SIAP_JUAL, ITEM_LAPTOP_MINUS] },
    { label: "Transaksi", items: [{ name: "Riwayat", href: "/dashboard/transactions", icon: Icons.riwayat }] },
    { label: "Tools", items: [{ name: "Scanner", href: "/scan", icon: Icons.scanner }] },
  ],

  KEPALA_PENGELOLA_BARANG: [
    { label: "Utama", items: [ITEM_DASHBOARD] },
    GROUP_ABSENSI_WITH_PKL,
    { label: "Management", items: [ITEM_USERS] },
    {
      label: "Inventaris",
      items: [
        ITEM_DATA_BARANG, ITEM_LAPTOP_SIAP_JUAL, ITEM_LAPTOP_MINUS, ITEM_ALL_UNITS,
        { name: "Garansi", href: "/dashboard/warranty", icon: Icons.garansi },
      ],
    },
    { label: "Transaksi", items: [{ name: "Riwayat Transaksi", href: "/dashboard/transactions", icon: Icons.riwayat }] },
    { label: "Tools", items: [{ name: "Scanner", href: "/scan", icon: Icons.scanner }] },
  ],

  MARKETING: [
    GROUP_ABSENSI,
    { label: "Management", items: [ITEM_USERS] },
    { label: "Marketing", items: [ITEM_CC_REPORT, ITEM_LEADS_CHAT, ITEM_HASIL_PENJUALAN] },
    { label: "Inventaris", items: [ITEM_DATA_BARANG, ITEM_LAPTOP_SIAP_JUAL] },
  ],

  KEPALA_MARKETING: [
    ...SALES_OVERVIEW([ITEM_USERS]),
    { label: "Marketing", items: [ITEM_CC_REPORT, ITEM_LEADS_CHAT, ITEM_HASIL_PENJUALAN] },
    {
      label: "Inventaris",
      items: [
        ITEM_DATA_BARANG, ITEM_LAPTOP_SIAP_JUAL,
        { name: "Garansi", href: "/dashboard/warranty", icon: Icons.garansi },
      ],
    },
    {
      label: "Transaksi",
      items: [
        { name: "Riwayat Transaksi", href: "/dashboard/transactions", icon: Icons.riwayat },
        ITEM_MANAGEMENT_SELLER,
        ITEM_LAPORAN_KEUANGAN,
      ],
    },
    PREPARATION_SALES_MENU, PREPARATION_PENYEDIA_MENU, PREPARATION_SALES_DELIVERY_MENU,
  ],

  KEBERSIHAN: [
    { label: "Utama", items: [ITEM_DASHBOARD] },
    GROUP_ABSENSI,
    { label: "Management", items: [ITEM_USERS] },
    { label: "Inventaris", items: [ITEM_DATA_BARANG, ITEM_LAPTOP_SIAP_JUAL] },
    { label: "Transaksi", items: [{ name: "Riwayat", href: "/dashboard/transactions", icon: Icons.riwayat }] },
  ],

  PENYEDIA_BARANG: [
    { label: "Utama", items: [ITEM_DASHBOARD] },
    GROUP_ABSENSI,
    { label: "Management", items: [ITEM_USERS] },
    { label: "Inventaris", items: [ITEM_DATA_BARANG, ITEM_LAPTOP_SIAP_JUAL] },
    PREPARATION_PENYEDIA_MENU,
    { label: "Transaksi", items: [{ name: "Riwayat Transaksi", href: "/dashboard/transactions", icon: Icons.riwayat }] },
  ],

  KEPALA_PENYEDIA_BARANG: [
    { label: "Utama", items: [ITEM_DASHBOARD] },
    GROUP_ABSENSI_WITH_PKL,
    { label: "Management", items: [ITEM_USERS] },
    { label: "Inventaris", items: [ITEM_DATA_BARANG, ITEM_LAPTOP_SIAP_JUAL] },
    PREPARATION_PENYEDIA_MENU,
    { label: "Transaksi", items: [{ name: "Riwayat Transaksi", href: "/dashboard/transactions", icon: Icons.riwayat }] },
  ],

  KONTEN: [
    GROUP_ABSENSI,
    { label: "Management", items: [ITEM_USERS] },
    { label: "Marketing", items: [ITEM_CC_REPORT, ITEM_LEADS_CHAT] },
    { label: "Inventaris", items: [ITEM_DATA_BARANG, ITEM_LAPTOP_SIAP_JUAL] },
    { label: "Transaksi", items: [{ name: "Riwayat Transaksi", href: "/dashboard/transactions", icon: Icons.riwayat }] },
  ],

  CUSTOMER_SERVICE: [
    { label: "Utama", items: [ITEM_DASHBOARD] },
    GROUP_ABSENSI,
    { label: "Management", items: [ITEM_USERS] },
    { label: "Inventaris", items: [ITEM_DATA_BARANG, ITEM_LAPTOP_SIAP_JUAL] },
    {
      label: "Transaksi",
      items: [
        { name: "Buat Payment", href: "/payment/create", icon: Icons.payment },
        { name: "Scanner", href: "/scan", icon: Icons.scanner },
      ],
    },
    SERVICE_MENU,
  ],

  PKL: PKL_MENU,
  PKL_MARKETING: PKL_MENU,
  PKL_SALES: PKL_SALES_MENU,
  PKL_PENYEDIA_BARANG: PKL_PENYEDIA_MENU,
  PKL_SOTECH: PKL_MENU,
  PKL_ONPOINT: PKL_MENU,
  PKL_TEKNISI: PKL_MENU,
  PKL_KONTEN: PKL_MENU,
  PKL_PENGANTARAN: [...PKL_MENU],
  PKL_CUSTOMER_SERVICE: [...PKL_MENU],
  PKL_PENGELOLA_BARANG: [...PKL_MENU],
};

const MISSION_HREFS = new Set([...MISSIONS_MENU.items.map((i) => i.href), ITEM_MISSION_ALL.href]);

(Object.keys(ROLE_MENUS) as UserRole[]).forEach((role) => {
  ROLE_MENUS[role] = ROLE_MENUS[role]
    .map((g) => ({ ...g, items: g.items.filter((it) => !MISSION_HREFS.has(it.href)) }))
    .filter((g) => g.items.length > 0);

  if (!isPKLRole(role)) {
    const missionsForRole: MenuGroup = { label: MISSIONS_MENU.label, items: [...MISSIONS_MENU.items] };
    if (role !== "ADMIN") {
      missionsForRole.items = missionsForRole.items.filter((it) => it.href !== "/dashboard/missions/leaderboard");
    }
    if (MISSION_FULL_ACCESS_ROLES.includes(role)) {
      missionsForRole.items.push(ITEM_MISSION_ALL);
    }
    ROLE_MENUS[role] = [...ROLE_MENUS[role], missionsForRole];
  }
});

const PKL_MENU_INHERIT: Partial<Record<UserRole, UserRole>> = {
  PKL_MARKETING: "MARKETING",
  PKL_SALES: "CREW_SALES",
  PKL_SOTECH: "SOTECH",
  PKL_ONPOINT: "ONPOINT",
  PKL_KONTEN: "KONTEN",
  PKL_TEKNISI: "TEKNISI",
  PKL_PENGANTARAN: "PENGANTARAN",
  PKL_CUSTOMER_SERVICE: "CUSTOMER_SERVICE",
  PKL_PENGELOLA_BARANG: "PENGELOLA_BARANG",
};

const PKL_STRIP_HREFS = new Set<string>([
  ...MISSIONS_MENU.items.map((i) => i.href),
  ITEM_MISSIONS.href,
  ITEM_MISSION_ALL.href,
]);

(Object.entries(PKL_MENU_INHERIT) as [UserRole, UserRole][]).forEach(([pklRole, parentRole]) => {
  const inherited: MenuGroup[] = ROLE_MENUS[parentRole].map((g) => ({ label: g.label, items: [...g.items] }));
  const stripped = inherited
    .map((g) => ({ ...g, items: g.items.filter((it) => !PKL_STRIP_HREFS.has(it.href)) }))
    .filter((g) => g.items.length > 0);
  const absensiIdx = stripped.findIndex((g) => g.label === "Absensi");
  if (absensiIdx >= 0) {
    const alreadyHas = stripped[absensiIdx].items.some((it) => it.href === ITEM_PKL_REPORT.href);
    if (!alreadyHas) stripped[absensiIdx].items.push(ITEM_PKL_REPORT);
  } else {
    stripped.push({ label: "Absensi", items: [ITEM_PKL_REPORT] });
  }
  ROLE_MENUS[pklRole] = stripped;
});

const DATA_BARANG_LEGACY_HREFS = new Set<string>(["/dashboard/laptops", "/dashboard/accessories"]);

(Object.keys(ROLE_MENUS) as UserRole[]).forEach((role) => {
  ROLE_MENUS[role] = ROLE_MENUS[role]
    .map((group) => {
      let inserted = false;
      const items: MenuItem[] = [];
      for (const item of group.items) {
        if (DATA_BARANG_LEGACY_HREFS.has(item.href)) {
          if (!inserted) { items.push(ITEM_DATA_BARANG); inserted = true; }
          continue;
        }
        items.push(item);
      }
      return { ...group, items };
    })
    .filter((group) => group.items.length > 0);
});

const GROUP_ORDER: string[] = [
  "Utama",
  "Keuangan",
  "Inventaris",
  "Transaksi",
  "Penyedia Barang",
  "Penyiapan Barang",
  "Pengantaran",
  "Servis",
  "Misi Pekerjaan",
  "Marketing",
  "Absensi",
  "Log",
  "Ultah",
  "Management",
];

function sortGroupsByCanonicalOrder(groups: MenuGroup[]): MenuGroup[] {
  return [...groups].sort((a, b) => {
    const rankA = GROUP_ORDER.indexOf(a.label);
    const rankB = GROUP_ORDER.indexOf(b.label);
    const safeA = rankA === -1 ? GROUP_ORDER.length : rankA;
    const safeB = rankB === -1 ? GROUP_ORDER.length : rankB;
    return safeA - safeB;
  });
}

(Object.keys(ROLE_MENUS) as UserRole[]).forEach((role) => {
  ROLE_MENUS[role] = sortGroupsByCanonicalOrder(ROLE_MENUS[role]);
});

const DATA_BARANG_ALLOWED_ROLES = new Set<UserRole>([
  "ADMIN", "PROGRAMMER", "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG", "KEPALA_SOTECH",
]);

(Object.keys(ROLE_MENUS) as UserRole[]).forEach((role) => {
  if (DATA_BARANG_ALLOWED_ROLES.has(role)) return;
  ROLE_MENUS[role] = ROLE_MENUS[role]
    .map((group) => ({
      ...group,
      items: group.items.filter((it) => !it.href.startsWith("/dashboard/data-barang")),
    }))
    .filter((group) => group.items.length > 0);
});

(Object.keys(ROLE_MENUS) as UserRole[]).forEach((role) => {
  if (!(AI_CEO_ROLES as string[]).includes(role)) return;
  const utamaIdx = ROLE_MENUS[role].findIndex((g) => g.label === "Utama");
  if (utamaIdx >= 0) {
    const already = ROLE_MENUS[role][utamaIdx].items.some((it) => it.href === ITEM_AI_CEO.href);
    if (!already) ROLE_MENUS[role][utamaIdx].items.push(ITEM_AI_CEO);
  } else {
    ROLE_MENUS[role] = [{ label: "Utama", items: [ITEM_AI_CEO] }, ...ROLE_MENUS[role]];
  }
});

const ROLE_META: Record<UserRole, { label: string; className: string }> = {
  ADMIN: { label: "Admin / CEO", className: "bg-violet-50 text-violet-700" },
  KEPALA_SALES: { label: "Kepala Sales", className: "bg-emerald-50 text-emerald-700" },
  CREW_SALES: { label: "Crew Sales", className: "bg-sky-50 text-sky-700" },
  ACCOUNTING: { label: "Accounting", className: "bg-amber-50 text-amber-700" },
  PURCHASING: { label: "Purchasing", className: "bg-violet-50 text-violet-600" },
  PENGELOLA_BARANG: { label: "Pengelola Barang", className: "bg-blue-50 text-blue-700" },
  KEPALA_PENGELOLA_BARANG: { label: "Kepala Pengelola Barang", className: "bg-blue-50 text-blue-800" },
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
  PKL: { label: "PKL", className: "bg-amber-50 text-amber-700" },
  PKL_MARKETING: { label: "PKL Marketing", className: "bg-amber-50 text-amber-700" },
  PKL_SALES: { label: "PKL Sales", className: "bg-amber-50 text-amber-700" },
  PKL_PENYEDIA_BARANG: { label: "PKL Penyedia Barang", className: "bg-amber-50 text-amber-700" },
  PKL_SOTECH: { label: "PKL Sotech", className: "bg-amber-50 text-amber-700" },
  PKL_ONPOINT: { label: "PKL Onpoint", className: "bg-amber-50 text-amber-700" },
  PKL_TEKNISI: { label: "PKL Teknisi", className: "bg-amber-50 text-amber-700" },
  PKL_KONTEN: { label: "PKL Konten", className: "bg-amber-50 text-amber-700" },
  PKL_PENGANTARAN: { label: "PKL Pengantaran", className: "bg-amber-50 text-amber-700" },
  PKL_CUSTOMER_SERVICE: { label: "PKL Customer Service", className: "bg-amber-50 text-amber-700" },
  PKL_PENGELOLA_BARANG: { label: "PKL Pengelola Barang", className: "bg-amber-50 text-amber-700" },
  KEPALA_ZENITH: { label: "Kepala Zenith", className: "bg-purple-50 text-purple-700" },
};

function getInitials(name: string): string {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function RoleBadges({ user }: { user: any }) {
  const roles: string[] = user?.roles?.length > 0 ? user.roles : [user?.role].filter(Boolean);
  if (roles.length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5 mt-0.5">
      {roles.map((role) => {
        const meta = ROLE_META[role as UserRole];
        return (
          <span key={role} className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-md w-fit ${meta?.className ?? "bg-gray-50 text-gray-700"}`}>
            {meta?.label ?? role}
          </span>
        );
      })}
    </div>
  );
}

function NavItem({ item, isActive, onClick, badge, rail }: { item: MenuItem; isActive: boolean; onClick?: () => void; badge?: number; rail?: boolean; }) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      title={rail ? item.name : undefined}
      className={`group relative flex items-center rounded-xl text-sm font-medium outline-none transition-all duration-200 ease-out focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30 ${rail ? "justify-center py-2.5" : "gap-2.5 px-3 py-2 hover:translate-x-0.5"} ${isActive ? "bg-gradient-to-r from-[#1a1a2e] to-[#2d2d4a] text-white shadow-md shadow-[#1a1a2e]/20" : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"}`}
    >
      {!rail && (
        <span className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-full bg-white transition-all duration-300 ease-out ${isActive ? "h-5 opacity-90" : "h-0 opacity-0"}`} />
      )}
      <span className={`flex-shrink-0 transition-transform duration-200 group-hover:scale-110 ${isActive ? (rail ? "text-white" : "text-white/80") : "text-gray-400 group-hover:text-gray-600"}`}>
        {item.icon}
      </span>
      {!rail && <span className="flex-1 truncate">{item.name}</span>}
      {badge && badge > 0 ? (
        <span
          style={{ animation: "solitBadgePop 0.3s ease-out both" }}
          className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black tabular-nums ${rail ? "absolute top-0.5 right-1" : "ml-auto"} ${isActive ? "bg-white text-[#1a1a2e]" : "bg-red-500 text-white shadow-sm shadow-red-500/40"}`}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}

function SidebarContent({
  user, loading, groups, pathname, onClose, onLogout, badges, rail, onToggleRail, openMap, onToggleGroup,
}: {
  user: any; loading: boolean; groups: MenuGroup[]; pathname: string;
  onClose?: () => void; onLogout: () => void; badges?: Record<string, number>;
  rail?: boolean; onToggleRail?: () => void;
  openMap: Record<string, boolean>; onToggleGroup: (label: string) => void;
}) {
  const initials = user?.name ? getInitials(user.name) : "?";
  const navRef = useRef<HTMLElement>(null);
  const scrollKey = `sidebar_scroll_${onClose ? "m" : "d"}`;

  useEffect(() => {
    if (loading) return;
    const el = navRef.current;
    if (!el) return;
    const saved = sessionStorage.getItem(scrollKey);
    if (saved) requestAnimationFrame(() => { el.scrollTop = parseInt(saved, 10); });
  }, [loading, scrollKey]);

  const handleNavScroll = useCallback(() => {
    const el = navRef.current;
    if (el) sessionStorage.setItem(scrollKey, String(el.scrollTop));
  }, [scrollKey]);

  return (
    <div className="flex flex-col h-full overflow-hidden select-none">
      <div className={`pt-5 pb-4 flex-shrink-0 ${rail ? "px-2" : "px-4"}`}>
        <div className={`flex items-center mb-5 ${rail ? "justify-center" : "justify-between"}`}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg overflow-hidden flex-shrink-0 bg-[#1a1a2e]">
              <img src="/assets/solit03.jpeg" alt="Solit" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            </div>
            {!rail && <span className="text-sm font-bold text-[#1a1a2e] tracking-tight">Solit POS</span>}
          </div>
          {onToggleRail && (
            <button onClick={onToggleRail} className={`hidden lg:flex p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition ${rail ? "mx-auto mt-2" : ""}`} title={rail ? "Perbesar sidebar" : "Perkecil sidebar"} aria-label={rail ? "Perbesar sidebar" : "Perkecil sidebar"}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" style={{ transform: rail ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
                <polyline points="11 17 6 12 11 7" />
                <polyline points="18 17 13 12 18 7" />
              </svg>
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="lg:hidden p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition" aria-label="Tutup sidebar">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {loading || !user ? (
          <div className={`flex items-center gap-3 ${rail ? "justify-center" : ""}`}>
            <div className="w-9 h-9 rounded-xl bg-gray-100 animate-pulse flex-shrink-0" />
            {!rail && (
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
                <div className="h-2.5 w-14 bg-gray-100 rounded animate-pulse" />
              </div>
            )}
          </div>
        ) : rail ? (
          <div className="flex justify-center">
            <div className="w-9 h-9 rounded-xl bg-[#1a1a2e] flex items-center justify-center text-white text-xs font-bold" title={user?.name || ""}>
              {initials}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#1a1a2e] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{initials}</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-800 truncate">{user?.name || "—"}</p>
              <RoleBadges user={user} />
            </div>
          </div>
        )}
      </div>

      <div className={`h-px bg-gray-100 flex-shrink-0 ${rail ? "mx-2" : "mx-4"}`} />

      <nav ref={navRef} onScroll={handleNavScroll} className={`flex-1 overflow-y-auto overflow-x-hidden py-3 ${rail ? "px-2 space-y-1" : "px-3 space-y-2"}`} style={{ scrollbarWidth: "thin", scrollbarColor: "#e5e7eb transparent" }}>
        {loading ? (
          <div className="space-y-1 pt-1">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-9 rounded-xl bg-gray-100 animate-pulse mb-1" style={{ animationDelay: `${i * 40}ms` }} />
            ))}
          </div>
        ) : rail ? (
          groups.map((group, gi) => (
            <div key={group.label} className="space-y-0.5">
              {group.items.map((item) => (
                <NavItem key={item.href} item={item} isActive={isItemActive(item.href, pathname)} onClick={onClose} badge={badges?.[item.href]} rail />
              ))}
              {gi < groups.length - 1 && <div className="mx-2 my-1.5 h-px bg-gray-100" />}
            </div>
          ))
        ) : (
          groups.map((group, gi) => {
            const isOpen = openMap[group.label] ?? true;
            const hasActive = group.items.some((it) => isItemActive(it.href, pathname));
            return (
              <div key={group.label} style={{ animation: "solitGroupIn 0.3s ease-out both", animationDelay: `${gi * 50}ms` }}>
                <button onClick={() => onToggleGroup(group.label)} className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition group/cat">
                  <span className={`text-[10px] font-bold uppercase tracking-[0.07em] flex-1 text-left truncate ${hasActive ? "text-[#1a1a2e]" : "text-gray-400 group-hover/cat:text-gray-600"}`}>
                    {group.label}
                  </span>
                  {hasActive && !isOpen && <span className="w-1.5 h-1.5 rounded-full bg-[#1a1a2e] animate-pulse" />}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-gray-300 group-hover/cat:text-gray-500 flex-shrink-0" style={{ transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform .25s ease" }}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                <div className={`grid transition-all duration-300 ease-out ${isOpen ? "grid-rows-[1fr] opacity-100 mt-0.5" : "grid-rows-[0fr] opacity-0"}`}>
                  <div className="overflow-hidden min-h-0">
                    <div className="space-y-0.5">
                      {group.items.map((item) => (
                        <NavItem key={item.href} item={item} isActive={isItemActive(item.href, pathname)} onClick={onClose} badge={badges?.[item.href]} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </nav>

      <div className={`pb-5 border-t border-gray-100 flex-shrink-0 ${rail ? "p-2" : "p-3"}`}>
        <button onClick={onLogout} title={rail ? "Keluar" : undefined} className={`w-full group flex items-center rounded-xl text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-all ${rail ? "justify-center py-2.5" : "gap-3 px-3 py-2"}`}>
          <span className="flex-shrink-0 group-hover:text-red-500">{Icons.logout}</span>
          {!rail && <span>Keluar</span>}
        </button>
      </div>
    </div>
  );
}

function dedupeGroups(groups: MenuGroup[]): MenuGroup[] {
  const byLabel = new Map<string, MenuGroup>();
  for (const group of groups) {
    const existing = byLabel.get(group.label);
    if (!existing) {
      byLabel.set(group.label, { label: group.label, items: [...group.items] });
      continue;
    }
    const seen = new Set(existing.items.map((it) => it.href));
    for (const item of group.items) {
      if (!seen.has(item.href)) {
        existing.items.push(item);
        seen.add(item.href);
      }
    }
  }
  return Array.from(byLabel.values());
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const hasFetched = useRef(false);

  const [dynamicGroups, setDynamicGroups] = useState<MenuGroup[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    fetch("/api/me/menu")
      .then((r) => r.json())
      .then((d) => { if (d.success) setDynamicGroups(d.groups); })
      .catch(() => { });
  }, [user?.id]);

  const [rail, setRail] = useState(false);
  const [width, setWidth] = useState(DEFAULT_W);
  const [dragging, setDragging] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const widthRef = useRef(DEFAULT_W);
  useEffect(() => { widthRef.current = width; }, [width]);

  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const cached = getCachedUser();
    if (cached) { setUser(cached); setLoading(false); }
    try {
      setRail(localStorage.getItem(RAIL_KEY) === "1");
      const w = parseInt(localStorage.getItem(WIDTH_KEY) || "", 10);
      if (!Number.isNaN(w)) setWidth(Math.min(MAX_W, Math.max(MIN_W, w)));
    } catch { }
    const raf = requestAnimationFrame(() => setHydrated(true));
    return () => cancelAnimationFrame(raf);
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

  const userRoles: string[] =
    Array.isArray(user?.roles) && user.roles.length > 0
      ? user.roles
      : user?.role ? [user.role] : [];

  const effectiveRoles = expandRolesWithParents(userRoles);

  const staticGroups: MenuGroup[] =
    effectiveRoles.length > 0
      ? dedupeGroups(mergeMenuGroups(ROLE_MENUS as Record<string, MenuGroup[]>, effectiveRoles))
      : [];

  const groups: MenuGroup[] = dedupeGroups([
    ...staticGroups,
    ...dynamicGroups.map((g) => ({
      label: g.label,
      items: g.items.map((it) => ({ ...it, icon: Icons.dashboard })),
    })),
  ]);

  const groupsSig = groups.map((g) => g.label).join("|");

  useEffect(() => {
    if (groups.length === 0) return;
    let saved: Record<string, boolean> | null = null;
    try { saved = JSON.parse(sessionStorage.getItem(GROUPS_KEY) || "null"); } catch { }
    setOpenMap(() => {
      const next: Record<string, boolean> = {};
      for (const g of groups) {
        next[g.label] =
          saved && Object.prototype.hasOwnProperty.call(saved, g.label)
            ? saved[g.label]
            : g.items.some((it) => isItemActive(it.href, pathname));
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupsSig]);

  useEffect(() => {
    const active = groups.find((g) => g.items.some((it) => isItemActive(it.href, pathname)));
    if (!active) return;
    setOpenMap((prev) => prev[active.label] ? prev : { ...prev, [active.label]: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, groupsSig]);

  const toggleGroup = useCallback((label: string) => {
    setOpenMap((prev) => {
      const next = { ...prev, [label]: !(prev[label] ?? true) };
      try { sessionStorage.setItem(GROUPS_KEY, JSON.stringify(next)); } catch { }
      return next;
    });
  }, []);

  const toggleRail = useCallback(() => {
    setRail((v) => {
      const n = !v;
      try { localStorage.setItem(RAIL_KEY, n ? "1" : "0"); } catch { }
      return n;
    });
  }, []);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    const startX = e.clientX;
    const startW = widthRef.current;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    const onMove = (ev: MouseEvent) => {
      const next = Math.min(MAX_W, Math.max(MIN_W, startW + (ev.clientX - startX)));
      setWidth(next);
    };
    const onUp = () => {
      setDragging(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      try { localStorage.setItem(WIDTH_KEY, String(widthRef.current)); } catch { }
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  const prep = usePrepNotify(userRoles, user?.id);
  const { sound_key: notifSoundKey, custom_sound_url: notifCustomUrl } = useNotificationSettings(user?.id ?? null);

  useEffect(() => {
    const unlock = () => { unlockAudio(); window.removeEventListener("pointerdown", unlock); };
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  const onAntrian = pathname.startsWith("/dashboard/preparation/antrian");
  const onSiapKirim = pathname.startsWith("/dashboard/preparation/siap-kirim");

  usePrepAlarm(onAntrian ? [] : prep.menungguUnacked.map((id) => ({ id })), ALARM_KEYS.MENUNGGU, true, 4000, notifSoundKey, notifCustomUrl);
  usePrepAlarm(onSiapKirim ? [] : prep.siapKirimUnacked.map((id) => ({ id })), ALARM_KEYS.SIAP_KIRIM, true, 4000, notifSoundKey, notifCustomUrl);

  const deliveryBadge = useDeliveryBadge(user?.id, user?.role);
  const badges: Record<string, number> = {
    "/dashboard/preparation/pengantaran": deliveryBadge,
    "/dashboard/preparation/antrian": prep.menungguUnacked.length,
    "/dashboard/preparation/siap-kirim": prep.siapKirimUnacked.length,
  };

  const sharedContentProps = {
    user, loading, groups, pathname,
    onLogout: handleLogout, badges, openMap, onToggleGroup: toggleGroup,
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: "@keyframes solitNavIn { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } } @keyframes solitGroupIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } } @keyframes solitBadgePop { 0% { transform: scale(0.6); opacity: 0; } 60% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }" }} />

      {!onAntrian && prep.menungguUnacked.length > 0 && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] w-full max-w-sm px-2">
          <button onClick={() => { prep.ackMenunggu(prep.menungguUnacked); router.push("/dashboard/preparation/antrian"); }} className="w-full bg-red-600 text-white px-4 py-2.5 rounded-full shadow-2xl shadow-red-900/40 flex items-center justify-center gap-2 active:scale-[0.98] transition">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span className="text-sm font-black">{prep.menungguUnacked.length} penyiapan baru — buka antrian</span>
          </button>
        </div>
      )}
      {!onSiapKirim && prep.siapKirimUnacked.length > 0 && (
        <div className="fixed left-1/2 -translate-x-1/2 z-[59] w-full max-w-sm px-2" style={{ top: !onAntrian && prep.menungguUnacked.length > 0 ? 64 : 12 }}>
          <button onClick={() => { prep.ackSiapKirim(prep.siapKirimUnacked); router.push("/dashboard/preparation/siap-kirim"); }} className="w-full bg-orange-600 text-white px-4 py-2.5 rounded-full shadow-2xl shadow-orange-900/40 flex items-center justify-center gap-2 active:scale-[0.98] transition">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span className="text-sm font-black">{prep.siapKirimUnacked.length} barang siap — pilih pengiriman</span>
          </button>
        </div>
      )}

      <button onClick={() => setOpen(true)} className="lg:hidden fixed top-0 left-0 z-50 w-12 h-12 flex items-center justify-center text-gray-600 hover:bg-gray-50 transition" aria-label="Buka menu">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      <div className={`lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`} onClick={() => setOpen(false)} aria-hidden="true" />

      <aside className={`lg:hidden fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-gray-100 shadow-2xl transition-transform duration-300 ease-out will-change-transform ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <SidebarContent {...sharedContentProps} onClose={() => setOpen(false)} />
      </aside>

      <aside style={{ width: rail ? RAIL_W : width, transition: dragging || !hydrated ? "none" : "width 0.2s ease-out" }} className="relative hidden lg:flex lg:flex-col bg-white border-r border-gray-100 flex-shrink-0 h-screen sticky top-0 overflow-hidden self-start">
        <SidebarContent {...sharedContentProps} rail={rail} onToggleRail={toggleRail} />
        {!rail && (
          <div onMouseDown={startResize} className="absolute top-0 right-0 z-20 h-full w-1.5 cursor-col-resize group/resize" title="Geser untuk ubah lebar">
            <div className="mx-auto h-full w-px bg-transparent group-hover/resize:bg-[#1a1a2e]/30 transition-colors" />
          </div>
        )}
      </aside>
    </>
  );
}