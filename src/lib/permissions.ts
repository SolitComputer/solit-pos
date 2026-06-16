// src/lib/permissions.ts

// ─── Role Types ───────────────────────────────────────────────────────────────
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
  | "ASISTEN_CEO"
  | "PENYEDIA_BARANG"
  | "KEPALA_PENYEDIA_BARANG"
  | "KONTEN"
  | "KEPALA_ONPOINT"
  | "ONPOINT"
  | "KEPALA_SOTECH"
  | "PKL"
  | "CUSTOMER_SERVICE";

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
  PENYEDIA_BARANG: "/dashboard/transactions",
  KEPALA_PENYEDIA_BARANG: "/dashboard/transactions",
  KONTEN: "/dashboard",
  KEPALA_ONPOINT: "/dashboard",
  ONPOINT: "/dashboard",
  KEPALA_SOTECH: "/dashboard",
  PKL: "/dashboard/laptops/ready",
  CUSTOMER_SERVICE: "/dashboard",
};

// ─── Base Role Groups ─────────────────────────────────────────────────────────
const FULL_ACCESS: UserRole[] = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];

const ALL_ROLES: UserRole[] = [
  "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
  "KEPALA_SALES", "KEPALA_MARKETING", "KEPALA_TEKNISI",
  "CREW_SALES", "SOTECH", "ACCOUNTING", "PENGELOLA_BARANG",
  "TEKNISI", "PENGANTARAN", "MARKETING", "KEBERSIHAN",
  "PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG", "KONTEN",
  "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH", "PKL", "CUSTOMER_SERVICE",
];

const SALES_ACCESS: UserRole[] = [
  "KEPALA_SALES", "CREW_SALES", "SOTECH", "PENGANTARAN",
  "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH",
];

const TRANSACTION_VIEW: UserRole[] = ["PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG", "KONTEN", "TEKNISI"];

// ─── Route Permissions ────────────────────────────────────────────────────────
export const ROUTE_PERMISSIONS: Record<string, UserRole[]> = {
  "/dashboard/laptops/create": [...FULL_ACCESS, "PENGELOLA_BARANG"],
  "/dashboard/laptops/edit": [...FULL_ACCESS, "PENGELOLA_BARANG"],
  "/dashboard/laptops": [
    ...FULL_ACCESS, "PENGELOLA_BARANG", "TEKNISI", "KEPALA_TEKNISI",
    "KEPALA_SALES", "CREW_SALES", "SOTECH", "ACCOUNTING",
    "PENGANTARAN", "MARKETING", "KEBERSIHAN", "KEPALA_MARKETING",
    "PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG", "KONTEN",
    "KEPALA_SOTECH",
    "KEPALA_ONPOINT", "ONPOINT", "PKL",
  ],
  "/dashboard/laptops/ready": [
    ...FULL_ACCESS, "PENGELOLA_BARANG", "KEPALA_SALES", "CREW_SALES", "SOTECH",
    "ACCOUNTING", "PENGANTARAN", "MARKETING", "KEBERSIHAN", "KEPALA_MARKETING",
    "PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG", "KONTEN", "KEPALA_ONPOINT", "ONPOINT", "PKL", "KEPALA_SOTECH",
    "TEKNISI", "KEPALA_TEKNISI", "PKL",
  ],
  "/dashboard/laptops/minus": [...FULL_ACCESS, "PENGELOLA_BARANG", "TEKNISI", "KEPALA_TEKNISI"],
  "/dashboard/warranty": [
    ...FULL_ACCESS, "TEKNISI", "KEPALA_TEKNISI",
    "KEPALA_SALES", "CREW_SALES", "SOTECH", "ACCOUNTING",
    "PENGANTARAN", "KEPALA_MARKETING",
  ],
  "/dashboard/transactions": [
    ...FULL_ACCESS, "KEPALA_SALES", "CREW_SALES", "SOTECH", "ACCOUNTING",
    "PENGELOLA_BARANG", "PENGANTARAN", "KEBERSIHAN", "KEPALA_MARKETING",
    "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH",
    ...TRANSACTION_VIEW,
  ],
  "/dashboard": [...ALL_ROLES],
  "/dashboard/reports": [...FULL_ACCESS, "ACCOUNTING"],
  "/dashboard/users": [...ALL_ROLES],
  "/dashboard/attendance": [...ALL_ROLES],
  "/api/messages": [...ALL_ROLES],
  "/payment": [
    ...FULL_ACCESS, "KEPALA_SALES", "CREW_SALES", "SOTECH", "PENGANTARAN",
    "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH", "PKL",
  ],
  "/api/laptops/create": [...FULL_ACCESS, "PENGELOLA_BARANG"],
  "/api/laptops": [
    ...FULL_ACCESS, "PENGELOLA_BARANG", "KEPALA_SALES", "CREW_SALES", "SOTECH",
    "TEKNISI", "KEPALA_TEKNISI", "ACCOUNTING", "PENGANTARAN",
    "MARKETING", "KEBERSIHAN", "KEPALA_MARKETING",
    "PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG", "KONTEN",
    "KEPALA_SOTECH",
    "KEPALA_ONPOINT", "ONPOINT", "PKL",
  ],
  "/api/laptops/minus": [...FULL_ACCESS, "PENGELOLA_BARANG", "TEKNISI", "KEPALA_TEKNISI"],
  "/api/dashboard": [...ALL_ROLES],
  "/api/transaction/create": [
    ...FULL_ACCESS, "KEPALA_SALES", "CREW_SALES", "SOTECH", "PENGANTARAN",
    "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH", "PKL",
  ],
  "/api/transaction": [
    ...FULL_ACCESS, "KEPALA_SALES", "ACCOUNTING", "CREW_SALES", "SOTECH",
    "PENGELOLA_BARANG", "PENGANTARAN", "KEBERSIHAN", "KEPALA_MARKETING",
    ...TRANSACTION_VIEW,
    "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH",
  ],
  "/api/warranty": [
    ...FULL_ACCESS, "TEKNISI", "KEPALA_TEKNISI", "KEPALA_SALES",
    "CREW_SALES", "SOTECH", "ACCOUNTING", "PENGANTARAN", "KEPALA_MARKETING",
  ],
  "/api/reports": [...FULL_ACCESS, "ACCOUNTING"],
  "/api/units/reserve": [
    ...FULL_ACCESS, "KEPALA_SALES", "CREW_SALES", "SOTECH", "PENGANTARAN",
    "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH", "PKL",
  ],
  "/api/units/hold": [
    ...FULL_ACCESS, "KEPALA_SALES", "CREW_SALES", "SOTECH", "PENGANTARAN",
    "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH", "PKL",
  ],
  "/api/units/confirm-payment": [
    ...FULL_ACCESS, "KEPALA_SALES",
  ],
  "/api/users": [...FULL_ACCESS],
  "/api/attendance/manual": [...ALL_ROLES],
  "/api/attendance/salary": [...ALL_ROLES],
  "/api/attendance/leave": [...ALL_ROLES],
  "/api/attendance/day-off": [...ALL_ROLES],
  "/api/attendance/date-off": [...ALL_ROLES],
  "/api/attendance/shift-config": [
    ...FULL_ACCESS,
    "KEPALA_TEKNISI", "KEPALA_SALES", "KEPALA_MARKETING",
    "KEPALA_ONPOINT", "KEPALA_PENYEDIA_BARANG", "KEPALA_SOTECH",
  ],
  "/api/attendance/schedule": [...FULL_ACCESS],
  "/api/attendance/users": [...ALL_ROLES],
  "/api/attendance/overtime": [...ALL_ROLES],
  // ✅ Semua kepala divisi bisa set rates lembur divisinya
  "/api/attendance/overtime/rates": [
    ...FULL_ACCESS,
    "KEPALA_SALES", "KEPALA_MARKETING", "KEPALA_TEKNISI",
    "KEPALA_ONPOINT", "KEPALA_PENYEDIA_BARANG", "KEPALA_SOTECH",
  ],
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
    ...TRANSACTION_VIEW,
  ] as UserRole[],

  CREATE_TRANSACTION: [
    ...FULL_ACCESS, "KEPALA_SALES", "CREW_SALES", "SOTECH", "PENGANTARAN",
    "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH", "PKL",
  ] as UserRole[],

  EDIT_TRANSACTION: [
    ...FULL_ACCESS, "KEPALA_SALES", "CREW_SALES",
    "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH",
  ] as UserRole[],

  RESTORE_TRANSACTION: [...FULL_ACCESS, "KEPALA_SALES"] as UserRole[],

  // ✅ FIX: RESERVE_UNIT sudah benar, tidak berubah
  RESERVE_UNIT: [
    ...FULL_ACCESS,
    "KEPALA_SALES", "CREW_SALES", "SOTECH", "PENGANTARAN",
    "PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG",
    "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH", "PKL",
  ] as UserRole[],

  VIEW_LAPTOPS: [
    ...FULL_ACCESS, "PENGELOLA_BARANG", "TEKNISI", "KEPALA_TEKNISI", "KEPALA_SALES",
    "CREW_SALES", "SOTECH", "ACCOUNTING", "PENGANTARAN", "MARKETING",
    "KEBERSIHAN", "KEPALA_MARKETING", "PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG", "KONTEN",
    "KEPALA_SOTECH",
    "KEPALA_ONPOINT", "ONPOINT", "PKL",
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
    "KEPALA_SOTECH",
    "KEPALA_ONPOINT", "ONPOINT",
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
    "PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG", "KONTEN",
    "TEKNISI", "KEPALA_TEKNISI", "PKL",
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

export const DIVISION_MAP: Record<string, UserRole[]> = {
  KEPALA_TEKNISI: ["TEKNISI"],
  KEPALA_SALES: ["CREW_SALES", "PENGANTARAN"],
  KEPALA_MARKETING: ["KONTEN"],
  KEPALA_ONPOINT: ["ONPOINT"],
  KEPALA_PENYEDIA_BARANG: ["PENYEDIA_BARANG"],
  KEPALA_SOTECH: ["SOTECH"],
  ADMIN: ["PENGELOLA_BARANG"],
};

/** Full access check — ADMIN / PROGRAMMER / ASISTEN_CEO */
export function isFullAccess(role: string): boolean {
  return (FULL_ACCESS as string[]).includes(role);
}

/** Apakah role adalah kepala divisi (punya bawahan di DIVISION_MAP) */
export function isDivisionHead(role: string): boolean {
  return Object.keys(DIVISION_MAP).includes(role);
}

/** Ambil daftar role bawahan dari seorang kepala divisi */
export function getSubordinateRoles(headRole: string): UserRole[] {
  return DIVISION_MAP[headRole] ?? [];
}

/** Apakah targetRole adalah bawahan langsung dari headRole */
export function isSubordinate(headRole: string, targetRole: string): boolean {
  return (getSubordinateRoles(headRole) as string[]).includes(targetRole);
}

/**
 * Apakah user bisa mengelola absensi orang lain?
 * Full access → semua | Kepala divisi → divisinya saja
 */
export function canManageAttendance(role: string): boolean {
  return isFullAccess(role) || isDivisionHead(role);
}

/** Apakah user bisa approve lembur? */
export function canApproveOvertime(role: string): boolean {
  return isFullAccess(role) || isDivisionHead(role);
}

/**
 * Daftar role yang boleh DIKELOLA seorang user.
 * Full access → semua role | Kepala divisi → bawahan divisinya | lainnya → none
 */
export function getManageableRoles(role: string): UserRole[] {
  if (isFullAccess(role)) return [...ALL_ROLES];
  if (isDivisionHead(role)) return getSubordinateRoles(role);
  return [];
}

/**
 * Apakah `actorRole` boleh mengelola data milik user ber-role `targetRole`?
 * Full access → selalu | Kepala divisi → hanya jika target adalah bawahannya
 */
export function canManageTargetRole(actorRole: string, targetRole: string): boolean {
  if (isFullAccess(actorRole)) return true;
  return isSubordinate(actorRole, targetRole);
}

/** Apakah user bisa melihat data bayaran lembur? */
export function canViewOvertimePay(role: string): boolean {
  const PAY_VIEW: UserRole[] = [
    "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
    "KEPALA_SALES", "KEPALA_MARKETING", "KEPALA_TEKNISI",
    "KEPALA_PENYEDIA_BARANG", "KEPALA_ONPOINT", "KEPALA_SOTECH",
  ];
  return (PAY_VIEW as string[]).includes(role);
}

/** Apakah user bisa melihat data gaji/salary? */
export function canViewSalary(role: string): boolean {
  return (["ADMIN", "ASISTEN_CEO", "PROGRAMMER"] as string[]).includes(role);
}

/** Label nama divisi dari kepala */
export function getDivisionLabel(headRole: string): string {
  const labels: Record<string, string> = {
    KEPALA_TEKNISI: "Divisi Teknisi",
    KEPALA_SALES: "Divisi Sales",
    KEPALA_MARKETING: "Divisi Marketing",
    KEPALA_ONPOINT: "Divisi Onpoint",
    KEPALA_PENYEDIA_BARANG: "Divisi Penyedia Barang",
    KEPALA_SOTECH: "Divisi Sotech",
    ADMIN: "Pengelola Barang",
  };
  return labels[headRole] ?? headRole.replace(/_/g, " ");
}