// src/lib/permissions.ts

export type UserRole =
  | "ADMIN"
  | "KEPALA_SALES"
  | "CREW_SALES"
  | "ACCOUNTING"
  | "PENGELOLA_BARANG"
  | "TEKNISI"
  | "KEPALA_TEKNISI"
  | "PENGANTARAN"
  | "MARKETING"
  | "KEBERSIHAN"
  | "KEPALA_MARKETING"
  | "PROGRAMMER"
  | "SOTECH"
  | "ASISTEN_CEO";

export const ROLE_DEFAULT_REDIRECT: Record<UserRole, string> = {
  ADMIN: "/dashboard",
  PROGRAMMER: "/dashboard",
  ASISTEN_CEO: "/dashboard",
  KEPALA_SALES: "/dashboard",
  CREW_SALES: "/dashboard",
  ACCOUNTING: "/dashboard",
  PENGELOLA_BARANG: "/dashboard/laptops",
  TEKNISI: "/dashboard/laptops",
  KEPALA_TEKNISI: "/dashboard/laptops",
  PENGANTARAN: "/dashboard",
  MARKETING: "/dashboard/laptops",
  KEBERSIHAN: "/dashboard",
  KEPALA_MARKETING: "/dashboard",
  SOTECH: "/dashboard",
};

// ✅ Full access roles — akses ke semua halaman
const FULL_ACCESS: UserRole[] = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];

// Semua role yang ada — untuk route yang bisa diakses semua orang
const ALL_ROLES: UserRole[] = [
  "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
  "KEPALA_SALES", "KEPALA_MARKETING", "KEPALA_TEKNISI",
  "CREW_SALES", "SOTECH", "ACCOUNTING", "PENGELOLA_BARANG",
  "TEKNISI", "PENGANTARAN", "MARKETING", "KEBERSIHAN",
];

const SALES_ACCESS: UserRole[] = ["KEPALA_SALES", "CREW_SALES", "SOTECH", "PENGANTARAN"];

export const ROUTE_PERMISSIONS: Record<string, UserRole[]> = {
  // ── Laptop ──────────────────────────────────────────────────────────────
  "/dashboard/laptops/create": [...FULL_ACCESS, "PENGELOLA_BARANG"],
  "/dashboard/laptops/edit": [...FULL_ACCESS, "PENGELOLA_BARANG"],
  "/dashboard/laptops": [
    ...FULL_ACCESS, "PENGELOLA_BARANG", "TEKNISI", "KEPALA_TEKNISI",
    "KEPALA_SALES", "CREW_SALES", "SOTECH", "ACCOUNTING",
    "PENGANTARAN", "MARKETING", "KEBERSIHAN", "KEPALA_MARKETING",
  ],
  "/dashboard/laptops/ready": [
    ...FULL_ACCESS, "PENGELOLA_BARANG", "KEPALA_SALES", "CREW_SALES", "SOTECH",
    "ACCOUNTING", "PENGANTARAN", "MARKETING", "KEBERSIHAN", "KEPALA_MARKETING",
  ],
  "/dashboard/laptops/minus": [...FULL_ACCESS, "PENGELOLA_BARANG", "TEKNISI", "KEPALA_TEKNISI"],

  // ── Warranty ─────────────────────────────────────────────────────────────
  "/dashboard/warranty": [
    ...FULL_ACCESS, "TEKNISI", "KEPALA_TEKNISI",
    "KEPALA_SALES", "CREW_SALES", "SOTECH", "ACCOUNTING",
    "PENGANTARAN", "KEPALA_MARKETING",
  ],

  // ── Transactions ─────────────────────────────────────────────────────────
  "/dashboard/transactions": [
    ...FULL_ACCESS, "KEPALA_SALES", "CREW_SALES", "SOTECH", "ACCOUNTING",
    "PENGELOLA_BARANG", "PENGANTARAN", "KEBERSIHAN", "KEPALA_MARKETING",
  ],

  // ── Dashboard utama ───────────────────────────────────────────────────────
  "/dashboard": [...ALL_ROLES],

  // ── Reports ──────────────────────────────────────────────────────────────
  "/dashboard/reports": [...FULL_ACCESS, "ACCOUNTING"],

  // ── Users ────────────────────────────────────────────────────────────────
  "/dashboard/users": [...FULL_ACCESS],

  // ── Attendance ───────────────────────────────────────────────────────────
  "/dashboard/attendance": [...ALL_ROLES],

  // ── Payment ──────────────────────────────────────────────────────────────
  "/payment": [...FULL_ACCESS, "KEPALA_SALES", "CREW_SALES", "SOTECH", "PENGANTARAN"],

  // ── API: Laptops ─────────────────────────────────────────────────────────
  "/api/laptops/create": [...FULL_ACCESS, "PENGELOLA_BARANG"],
  "/api/laptops": [
    ...FULL_ACCESS, "PENGELOLA_BARANG", "KEPALA_SALES", "CREW_SALES", "SOTECH",
    "TEKNISI", "KEPALA_TEKNISI", "ACCOUNTING", "PENGANTARAN",
    "MARKETING", "KEBERSIHAN", "KEPALA_MARKETING",
  ],
  "/api/laptops/minus": [...FULL_ACCESS, "PENGELOLA_BARANG", "TEKNISI", "KEPALA_TEKNISI"],

  // ── API: Dashboard ───────────────────────────────────────────────────────
  "/api/dashboard": [...ALL_ROLES],

  // ── API: Transactions ────────────────────────────────────────────────────
  "/api/transaction/create": [...FULL_ACCESS, "KEPALA_SALES", "CREW_SALES", "SOTECH", "PENGANTARAN"],
  "/api/transaction": [
    ...FULL_ACCESS, "KEPALA_SALES", "ACCOUNTING", "CREW_SALES", "SOTECH",
    "PENGELOLA_BARANG", "PENGANTARAN", "KEBERSIHAN", "KEPALA_MARKETING",
  ],

  // ── API: Warranty ────────────────────────────────────────────────────────
  "/api/warranty": [
    ...FULL_ACCESS, "TEKNISI", "KEPALA_TEKNISI", "KEPALA_SALES",
    "CREW_SALES", "SOTECH", "ACCOUNTING", "PENGANTARAN", "KEPALA_MARKETING",
  ],

  // ── API: Reports ─────────────────────────────────────────────────────────
  "/api/reports": [...FULL_ACCESS, "ACCOUNTING"],

  // ── API: Units ───────────────────────────────────────────────────────────
  "/api/units/reserve": [...FULL_ACCESS, "KEPALA_SALES", "CREW_SALES", "SOTECH", "PENGANTARAN"],
  "/api/units/hold": [...FULL_ACCESS, "KEPALA_SALES", "CREW_SALES", "SOTECH", "PENGANTARAN"],
  "/api/units/confirm-payment": [...FULL_ACCESS, "KEPALA_SALES"],

  // ── API: Users ───────────────────────────────────────────────────────────
  "/api/users": [...FULL_ACCESS],

  // ── API: Attendance ──────────────────────────────────────────────────────
  "/api/attendance/manual": [...FULL_ACCESS],
  "/api/attendance/salary": [...FULL_ACCESS],
  "/api/attendance/leave": [...ALL_ROLES],
  "/api/attendance/day-off": [...ALL_ROLES],
  "/api/attendance/date-off": [...ALL_ROLES],
  "/api/attendance/shift-config": [...FULL_ACCESS],
  "/api/attendance/schedule": [...FULL_ACCESS],
  "/api/attendance/users": [...FULL_ACCESS],
  "/api/attendance/overtime": [...ALL_ROLES],
  "/api/attendance/overtime/rates": [...FULL_ACCESS, "KEPALA_SALES", "KEPALA_MARKETING", "KEPALA_TEKNISI"],
  "/dashboard/attendance/overtime": [...ALL_ROLES],
  "/api/attendance": [...ALL_ROLES],
};

export const PERMISSIONS = {
  VIEW_DASHBOARD: [...ALL_ROLES] as UserRole[],

  VIEW_FINANCIALS: [...FULL_ACCESS, "ACCOUNTING"] as UserRole[],
  VIEW_REPORTS: [...FULL_ACCESS, "ACCOUNTING"] as UserRole[],

  VIEW_TRANSACTIONS: [
    ...FULL_ACCESS, "KEPALA_SALES", "ACCOUNTING", "CREW_SALES", "SOTECH",
    "PENGELOLA_BARANG", "PENGANTARAN", "KEBERSIHAN", "KEPALA_MARKETING", "MARKETING",
  ] as UserRole[],
  CREATE_TRANSACTION: [...FULL_ACCESS, "KEPALA_SALES", "CREW_SALES", "SOTECH", "PENGANTARAN"] as UserRole[],
  EDIT_TRANSACTION: [...FULL_ACCESS, "KEPALA_SALES"] as UserRole[],
  RESTORE_TRANSACTION: [...FULL_ACCESS, "KEPALA_SALES"] as UserRole[],

  VIEW_LAPTOPS: [
    ...FULL_ACCESS, "PENGELOLA_BARANG", "TEKNISI", "KEPALA_TEKNISI", "KEPALA_SALES",
    "CREW_SALES", "SOTECH", "ACCOUNTING", "PENGANTARAN", "MARKETING",
    "KEBERSIHAN", "KEPALA_MARKETING",
  ] as UserRole[],
  CREATE_LAPTOP: [...FULL_ACCESS, "PENGELOLA_BARANG"] as UserRole[],
  EDIT_LAPTOP: [...FULL_ACCESS, "PENGELOLA_BARANG"] as UserRole[],

  VIEW_BARCODE: [
    ...FULL_ACCESS, "KEPALA_SALES", "CREW_SALES", "SOTECH", "PENGELOLA_BARANG",
    "TEKNISI", "KEPALA_TEKNISI", "ACCOUNTING", "PENGANTARAN", "MARKETING", "KEPALA_MARKETING",
  ] as UserRole[],

  VIEW_UNITS: [
    ...FULL_ACCESS, "PENGELOLA_BARANG", "TEKNISI", "KEPALA_TEKNISI", "KEPALA_SALES",
    "CREW_SALES", "SOTECH", "ACCOUNTING", "PENGANTARAN", "MARKETING", "KEPALA_MARKETING",
  ] as UserRole[],
  CREATE_UNITS: [...FULL_ACCESS, "PENGELOLA_BARANG"] as UserRole[],
  EDIT_UNITS: [...FULL_ACCESS, "PENGELOLA_BARANG"] as UserRole[],

  VIEW_WARRANTY: [
    ...FULL_ACCESS, "TEKNISI", "KEPALA_TEKNISI", "KEPALA_SALES", "CREW_SALES",
    "SOTECH", "ACCOUNTING", "PENGANTARAN", "KEPALA_MARKETING",
  ] as UserRole[],
  EDIT_WARRANTY: [...FULL_ACCESS, "TEKNISI", "KEPALA_TEKNISI"] as UserRole[],

  VIEW_READY_LAPTOPS: [
    ...FULL_ACCESS, "PENGELOLA_BARANG", "KEPALA_SALES", "CREW_SALES", "SOTECH",
    "ACCOUNTING", "PENGANTARAN", "MARKETING", "KEBERSIHAN", "KEPALA_MARKETING",
  ] as UserRole[],
  VIEW_MINUS_LAPTOPS: [...FULL_ACCESS, "PENGELOLA_BARANG", "TEKNISI", "KEPALA_TEKNISI"] as UserRole[],
  EDIT_MINUS_LAPTOPS: [...FULL_ACCESS, "PENGELOLA_BARANG", "TEKNISI", "KEPALA_TEKNISI"] as UserRole[],
} as const;

export function hasPermission(
  role: UserRole,
  allowed: readonly UserRole[] | UserRole[]
): boolean {
  return (allowed as UserRole[]).includes(role);
}