// src/lib/permissions.ts
// Gabungan HEAD (punya Ikmal) + origin/develop (punya teman):
// 1. Tambah DISPATCH_PREPARATION permission (sales pilih metode kirim)
// 2. Tambah route /dashboard/preparation/siap-kirim
// 3. PREPARATION_DELIVERY_PERSON_ROLES tetap hanya PENGANTARAN
// 4. Multi-Role Helpers (mergeMenuGroups, getEffectivePermissions, dll) dari HEAD

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
  | "PKL_MARKETING"
  | "PKL_SALES"
  | "PKL_PENYEDIA_BARANG"
  | "PKL_SOTECH"
  | "PKL_ONPOINT"
  | "PKL_TEKNISI"
  | "PKL_KONTEN"
  | "KEPALA_PENGELOLA_BARANG"
  | "CUSTOMER_SERVICE";

// ─── Default Redirect ─────────────────────────────────────────────────────────
// Ambil dari HEAD (punya Ikmal) karena PENGANTARAN redirect ke /dashboard/preparation/pengantaran
export const ROLE_DEFAULT_REDIRECT: Record<UserRole, string> = {
  ADMIN: "/dashboard",
  PROGRAMMER: "/dashboard",
  ASISTEN_CEO: "/dashboard",
  KEPALA_SALES: "/dashboard",
  CREW_SALES: "/dashboard",
  ACCOUNTING: "/dashboard",
  PENGELOLA_BARANG: "/dashboard/laptops",
  KEPALA_PENGELOLA_BARANG: "/dashboard/laptops",
  TEKNISI: "/dashboard/service/antrian",
  KEPALA_TEKNISI: "/dashboard/service/antrian",
  PENGANTARAN: "/dashboard/preparation/pengantaran",
  MARKETING: "/dashboard/laptops",
  KEBERSIHAN: "/dashboard",
  KEPALA_MARKETING: "/dashboard",
  SOTECH: "/dashboard",
  PENYEDIA_BARANG: "/dashboard/preparation/antrian",
  KEPALA_PENYEDIA_BARANG: "/dashboard/preparation/antrian",
  KONTEN: "/dashboard",
  KEPALA_ONPOINT: "/dashboard",
  ONPOINT: "/dashboard",
  KEPALA_SOTECH: "/dashboard",
  PKL: "/dashboard/laptops/ready",
  PKL_MARKETING: "/dashboard/laptops/ready",
  PKL_SALES: "/dashboard/laptops/ready",
  PKL_PENYEDIA_BARANG: "/dashboard/laptops/ready",
  PKL_SOTECH: "/dashboard/laptops/ready",
  PKL_ONPOINT: "/dashboard/laptops/ready",
  PKL_TEKNISI: "/dashboard/laptops/ready",
  PKL_KONTEN: "/dashboard/laptops/ready",
  CUSTOMER_SERVICE: "/dashboard/service/antrian",
};

// ─── Base Role Groups ─────────────────────────────────────────────────────────
const FULL_ACCESS: UserRole[] = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];

const ALL_ROLES: UserRole[] = [
  "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
  "KEPALA_SALES", "KEPALA_MARKETING", "KEPALA_TEKNISI",
  "CREW_SALES", "SOTECH", "ACCOUNTING", "PENGELOLA_BARANG",
  "TEKNISI", "PENGANTARAN", "MARKETING", "KEBERSIHAN",
  "PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG", "KEPALA_PENGELOLA_BARANG", "KONTEN",
  "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH",
  "PKL", "PKL_MARKETING", "PKL_SALES", "PKL_PENYEDIA_BARANG",
  "PKL_SOTECH", "PKL_ONPOINT", "PKL_TEKNISI", "PKL_KONTEN",
  "CUSTOMER_SERVICE",
];

const SALES_ACCESS: UserRole[] = [
  "KEPALA_SALES", "CREW_SALES", "SOTECH", "PENGANTARAN",
  "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH",
];

const TRANSACTION_VIEW: UserRole[] = [
  "PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG", "KONTEN",
  "TEKNISI", "KEPALA_TEKNISI",        // ← tambah
  "KEPALA_PENGELOLA_BARANG",           // ← tambah
];

const SELLER_FOLLOWUP_ROLES: UserRole[] = [...FULL_ACCESS, "KEPALA_MARKETING", "MARKETING"];

// ─── Preparation Roles ────────────────────────────────────────────────────────

/** Sales yang bisa CREATE format penyiapan */
const PREPARATION_SALES_ROLES: UserRole[] = [
  "KEPALA_SALES", "CREW_SALES", "SOTECH", "KEPALA_SOTECH",
  "KEPALA_ONPOINT", "ONPOINT",
];

/** Penyedia barang yang cek & tandai done */
const PREPARATION_PENYEDIA_ROLES: UserRole[] = [
  "PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG",
];

/** Siapa yang buat format penyiapan (Sales + Admin) */
export const PREPARATION_CREATE_ROLES: UserRole[] = [...FULL_ACCESS, ...PREPARATION_SALES_ROLES];

/** Siapa yang bisa terima & done-in penyiapan (Penyedia + Admin) */
export const PREPARATION_DONE_ROLES: UserRole[] = [...FULL_ACCESS, ...PREPARATION_PENYEDIA_ROLES];

/**
 * Siapa yang bisa DISPATCH (pilih metode pengiriman) setelah penyedia done.
 * Dari origin/develop — Sales/Kepala Sales, BUKAN penyedia barang.
 */
export const PREPARATION_DISPATCH_ROLES: UserRole[] = [...FULL_ACCESS, ...PREPARATION_SALES_ROLES];

/** Role yang boleh handle delivery tracking */
export const PREPARATION_DELIVERY_ROLES: UserRole[] = [
  ...FULL_ACCESS, "PENGANTARAN", ...PREPARATION_PENYEDIA_ROLES,
];

/** Semua yang bisa lihat penyiapan */
export const PREPARATION_VIEW_ROLES: UserRole[] = [
  ...FULL_ACCESS,
  ...PREPARATION_SALES_ROLES,
  ...PREPARATION_PENYEDIA_ROLES,
  "PENGANTARAN",
];

/** Role yang MENJADI pengantar (bukan yang assign) */
export const PREPARATION_DELIVERY_PERSON_ROLES: UserRole[] = ["PENGANTARAN"];

// ─── Voice / HT Roles ────────────────────────────────────────────────────────
export const DELIVERY_VOICE_ROLES: UserRole[] = [
  ...FULL_ACCESS, ...SALES_ACCESS,
  "PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG",
];

export const DELIVERY_VOICE_TARGET_ROLES: UserRole[] = [
  ...FULL_ACCESS, "KEPALA_SALES", "CREW_SALES",
  "PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG",
];

// ─── Service Roles ────────────────────────────────────────────────────────────
export const SERVICE_VIEW_ROLES: UserRole[] = [
  ...FULL_ACCESS, "TEKNISI", "KEPALA_TEKNISI", "CUSTOMER_SERVICE",
];
export const SERVICE_CREATE_ROLES: UserRole[] = [
  ...FULL_ACCESS, "KEPALA_TEKNISI", "CUSTOMER_SERVICE", "TEKNISI",
];
export const SERVICE_TEKNISI_ROLES: UserRole[] = [
  ...FULL_ACCESS, "TEKNISI", "KEPALA_TEKNISI",
];

// ─── Route Permissions ────────────────────────────────────────────────────────
export const ROUTE_PERMISSIONS: Record<string, UserRole[]> = {
  "/dashboard/laptops/create": [...FULL_ACCESS, "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG"],
  "/dashboard/laptops/edit": [...FULL_ACCESS, "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG"],
  "/dashboard/laptops": [
    ...FULL_ACCESS, "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG", "TEKNISI", "KEPALA_TEKNISI",
    "KEPALA_SALES", "CREW_SALES", "SOTECH", "ACCOUNTING",
    "PENGANTARAN", "MARKETING", "KEBERSIHAN", "KEPALA_MARKETING",
    "PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG", "KONTEN",
    "KEPALA_SOTECH", "KEPALA_ONPOINT", "ONPOINT", "PKL", "CUSTOMER_SERVICE",
  ],
  "/dashboard/laptops/ready": [
    ...FULL_ACCESS, "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG", "KEPALA_SALES", "CREW_SALES", "SOTECH",
    "ACCOUNTING", "PENGANTARAN", "MARKETING", "KEBERSIHAN", "KEPALA_MARKETING",
    "PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG", "KONTEN",
    "KEPALA_ONPOINT", "ONPOINT", "PKL", "KEPALA_SOTECH",
    "PKL_MARKETING", "PKL_SALES", "PKL_PENYEDIA_BARANG",
    "PKL_SOTECH", "PKL_ONPOINT", "PKL_TEKNISI", "PKL_KONTEN",
    "TEKNISI", "KEPALA_TEKNISI", "CUSTOMER_SERVICE",
  ],
  "/dashboard/laptops/minus": [...FULL_ACCESS, "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG", "TEKNISI", "KEPALA_TEKNISI"],
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
  "/dashboard/users": ALL_ROLES.filter(r => !r.startsWith("PKL")),
  "/dashboard/attendance": [...ALL_ROLES],
  "/dashboard/attendance/overtime": [...ALL_ROLES],

  "/dashboard/service": [...SERVICE_VIEW_ROLES],
  "/dashboard/service/antrian": [...SERVICE_VIEW_ROLES],
  "/dashboard/service/done": [...SERVICE_VIEW_ROLES],
  "/dashboard/service/history": [...SERVICE_VIEW_ROLES],

  "/payment": [
    ...FULL_ACCESS, "KEPALA_SALES", "CREW_SALES", "SOTECH", "PENGANTARAN",
    "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH", "PKL",
  ],

  "/api/messages": ALL_ROLES.filter(r => !r.startsWith("PKL")),
  "/api/group-chat": ALL_ROLES.filter(r => !r.startsWith("PKL")),
  "/api/push/subscribe": [...ALL_ROLES],

  "/api/laptops/create": [...FULL_ACCESS, "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG"],
  "/api/laptops": [
    ...FULL_ACCESS, "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG", "KEPALA_SALES", "CREW_SALES", "SOTECH",
    "TEKNISI", "KEPALA_TEKNISI", "ACCOUNTING", "PENGANTARAN",
    "MARKETING", "KEBERSIHAN", "KEPALA_MARKETING",
    "PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG", "KONTEN",
    "KEPALA_SOTECH", "KEPALA_ONPOINT", "ONPOINT",
    "PKL", "PKL_MARKETING", "PKL_SALES", "PKL_PENYEDIA_BARANG",
    "PKL_SOTECH", "PKL_ONPOINT", "PKL_TEKNISI", "PKL_KONTEN",
    "CUSTOMER_SERVICE",
  ],
  "/api/laptops/minus": [...FULL_ACCESS, "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG", "TEKNISI", "KEPALA_TEKNISI"],
  "/api/dashboard": [...ALL_ROLES],
  "/api/transaction/create": [
    ...FULL_ACCESS, "KEPALA_SALES", "CREW_SALES", "SOTECH", "PENGANTARAN",
    "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH",
    "PKL", "PKL_MARKETING", "PKL_SALES", "PKL_PENYEDIA_BARANG",
    "PKL_SOTECH", "PKL_ONPOINT", "PKL_TEKNISI", "PKL_KONTEN",
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
    "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH",
    "PKL", "PKL_MARKETING", "PKL_SALES", "PKL_PENYEDIA_BARANG",
    "PKL_SOTECH", "PKL_ONPOINT", "PKL_TEKNISI", "PKL_KONTEN",
  ],
  "/api/units/hold": [
    ...FULL_ACCESS, "KEPALA_SALES", "CREW_SALES", "SOTECH", "PENGANTARAN",
    "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH",
    "PKL", "PKL_MARKETING", "PKL_SALES", "PKL_PENYEDIA_BARANG",
    "PKL_SOTECH", "PKL_ONPOINT", "PKL_TEKNISI", "PKL_KONTEN",
  ],
  "/api/units/confirm-payment": [...FULL_ACCESS, "KEPALA_SALES"],
  "/api/users": [...FULL_ACCESS],
  "/api/attendance/manual": [...ALL_ROLES],
  "/api/attendance/salary": [...ALL_ROLES],
  "/api/attendance/leave": [...ALL_ROLES],
  "/api/attendance/day-off": [...ALL_ROLES],
  "/api/attendance/date-off": [...ALL_ROLES],
  "/api/attendance/shift-config": [
    ...FULL_ACCESS, "KEPALA_TEKNISI", "KEPALA_SALES", "KEPALA_MARKETING",
    "KEPALA_ONPOINT", "KEPALA_PENYEDIA_BARANG", "KEPALA_SOTECH",
  ],
  "/api/attendance/schedule": [...FULL_ACCESS],
  "/api/attendance/users": [...ALL_ROLES],
  "/api/attendance/overtime": [...ALL_ROLES],
  "/api/attendance/overtime/rates": [
    ...FULL_ACCESS, "KEPALA_SALES", "KEPALA_MARKETING", "KEPALA_TEKNISI",
    "KEPALA_ONPOINT", "KEPALA_PENYEDIA_BARANG", "KEPALA_SOTECH",
  ],
  "/api/attendance": [...ALL_ROLES],
  "/api/service": [...SERVICE_VIEW_ROLES],

  "/dashboard/pkl-reports": [
    ...FULL_ACCESS,
    "KEPALA_SALES", "KEPALA_MARKETING", "KEPALA_TEKNISI",
    "KEPALA_ONPOINT", "KEPALA_PENYEDIA_BARANG", "KEPALA_SOTECH",
    "PKL", "PKL_MARKETING", "PKL_SALES", "PKL_PENYEDIA_BARANG",
    "PKL_SOTECH", "PKL_ONPOINT", "PKL_TEKNISI", "PKL_KONTEN",
  ],
  "/api/pkl-reports": [
    ...FULL_ACCESS,
    "KEPALA_SALES", "KEPALA_MARKETING", "KEPALA_TEKNISI",
    "KEPALA_ONPOINT", "KEPALA_PENYEDIA_BARANG", "KEPALA_SOTECH",
    "PKL", "PKL_MARKETING", "PKL_SALES", "PKL_PENYEDIA_BARANG",
    "PKL_SOTECH", "PKL_ONPOINT", "PKL_TEKNISI", "PKL_KONTEN",
  ],

  "/dashboard/management-seller": [...SELLER_FOLLOWUP_ROLES],
  "/api/seller-followups": [...SELLER_FOLLOWUP_ROLES],

  // ── Preparation routes (dari origin/develop) ───────────────────────────────
  "/dashboard/preparation": [...PREPARATION_VIEW_ROLES],
  // Antrian & Done = khusus Penyedia Barang + Admin
  "/dashboard/preparation/antrian": [...PREPARATION_DONE_ROLES],
  "/dashboard/preparation/done": [...PREPARATION_DONE_ROLES],
  // Siap Kirim = Sales lihat dan dispatch (BARU dari origin/develop)
  "/dashboard/preparation/siap-kirim": [...PREPARATION_DISPATCH_ROLES],
  // Pengantaran = role Pengantaran + Admin + Penyedia (untuk monitor)
  "/dashboard/preparation/pengantaran": [...PREPARATION_DELIVERY_ROLES],
  "/dashboard/preparation/history": [...PREPARATION_VIEW_ROLES],

  "/api/preparation": [...PREPARATION_VIEW_ROLES],
  "/api/preparation/my-deliveries": [...PREPARATION_DELIVERY_ROLES],
  "/api/preparation/dispatch": [...PREPARATION_DISPATCH_ROLES],
};

// ─── PERMISSIONS object ───────────────────────────────────────────────────────
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
    "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH",
    "PKL", "PKL_MARKETING", "PKL_SALES", "PKL_PENYEDIA_BARANG",
    "PKL_SOTECH", "PKL_ONPOINT", "PKL_TEKNISI", "PKL_KONTEN",
  ] as UserRole[],

  EDIT_TRANSACTION: [
    ...FULL_ACCESS, "KEPALA_SALES", "CREW_SALES",
    "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH",
  ] as UserRole[],

  RESTORE_TRANSACTION: [...FULL_ACCESS, "KEPALA_SALES"] as UserRole[],

  RESERVE_UNIT: [
    ...FULL_ACCESS,
    "KEPALA_SALES", "CREW_SALES", "SOTECH", "PENGANTARAN",
    "PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG",
    "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH",
    "PKL", "PKL_MARKETING", "PKL_SALES", "PKL_PENYEDIA_BARANG",
    "PKL_SOTECH", "PKL_ONPOINT", "PKL_TEKNISI", "PKL_KONTEN",
  ] as UserRole[],

  VIEW_LAPTOPS: [
    ...FULL_ACCESS, "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG", "TEKNISI", "KEPALA_TEKNISI", "KEPALA_SALES",
    "CREW_SALES", "SOTECH", "ACCOUNTING", "PENGANTARAN", "MARKETING",
    "KEBERSIHAN", "KEPALA_MARKETING", "PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG", "KONTEN",
    "KEPALA_SOTECH", "KEPALA_ONPOINT", "ONPOINT", "PKL", "CUSTOMER_SERVICE",
  ] as UserRole[],
  CREATE_LAPTOP: [...FULL_ACCESS, "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG"] as UserRole[],
  EDIT_LAPTOP: [...FULL_ACCESS, "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG"] as UserRole[],

  VIEW_BARCODE: [
    ...FULL_ACCESS, "KEPALA_SALES", "CREW_SALES", "SOTECH", "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG",
    "TEKNISI", "KEPALA_TEKNISI", "ACCOUNTING", "PENGANTARAN", "MARKETING", "KEPALA_MARKETING",
  ] as UserRole[],

  VIEW_UNITS: [
    ...FULL_ACCESS, "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG", "TEKNISI", "KEPALA_TEKNISI", "KEPALA_SALES",
    "CREW_SALES", "SOTECH", "ACCOUNTING", "PENGANTARAN", "MARKETING", "KEPALA_MARKETING",
    "KEPALA_SOTECH", "KEPALA_ONPOINT", "ONPOINT",
  ] as UserRole[],
  CREATE_UNITS: [...FULL_ACCESS, "PENGELOLA_BARANG"] as UserRole[],
  EDIT_UNITS: [...FULL_ACCESS, "PENGELOLA_BARANG"] as UserRole[],

  VIEW_WARRANTY: [
    ...FULL_ACCESS, "TEKNISI", "KEPALA_TEKNISI", "KEPALA_SALES", "CREW_SALES",
    "SOTECH", "ACCOUNTING", "PENGANTARAN", "KEPALA_MARKETING",
  ] as UserRole[],
  EDIT_WARRANTY: [...FULL_ACCESS, "TEKNISI", "KEPALA_TEKNISI"] as UserRole[],

  VIEW_READY_LAPTOPS: [
    ...FULL_ACCESS, "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG", "KEPALA_SALES", "CREW_SALES", "SOTECH",
    "ACCOUNTING", "PENGANTARAN", "MARKETING", "KEBERSIHAN", "KEPALA_MARKETING",
    "PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG", "KONTEN",
    "TEKNISI", "KEPALA_TEKNISI",
    "PKL", "PKL_MARKETING", "PKL_SALES", "PKL_PENYEDIA_BARANG",
    "PKL_SOTECH", "PKL_ONPOINT", "PKL_TEKNISI", "PKL_KONTEN",
    "CUSTOMER_SERVICE",
  ] as UserRole[],
  VIEW_MINUS_LAPTOPS: [...FULL_ACCESS, "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG", "TEKNISI", "KEPALA_TEKNISI"] as UserRole[],
  EDIT_MINUS_LAPTOPS: [...FULL_ACCESS, "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG", "TEKNISI", "KEPALA_TEKNISI"] as UserRole[],

  VIEW_SERVICE: [...SERVICE_VIEW_ROLES] as UserRole[],
  CREATE_SERVICE: [...SERVICE_CREATE_ROLES] as UserRole[],
  UPDATE_SERVICE_STATUS: [...SERVICE_TEKNISI_ROLES] as UserRole[],
  COMPLETE_SERVICE: [...SERVICE_TEKNISI_ROLES] as UserRole[],
  CONFIRM_SERVICE_PICKUP: [...SERVICE_VIEW_ROLES] as UserRole[],

  VIEW_SELLER_FOLLOWUP: [...SELLER_FOLLOWUP_ROLES] as UserRole[],
  MANAGE_SELLER_FOLLOWUP: [...SELLER_FOLLOWUP_ROLES] as UserRole[],
  FOLLOWUP_SELLER: [...FULL_ACCESS, "KEPALA_MARKETING", "CREW_SALES"] as UserRole[],

  // ── Preparation permissions ─────────────────────────────────────────────────
  VIEW_PREPARATION: [...PREPARATION_VIEW_ROLES] as UserRole[],
  CREATE_PREPARATION: [...PREPARATION_CREATE_ROLES] as UserRole[],
  DONE_PREPARATION: [...PREPARATION_DONE_ROLES] as UserRole[],
  /** Sales pilih metode pengiriman setelah penyedia done (dari origin/develop) */
  DISPATCH_PREPARATION: [...PREPARATION_DISPATCH_ROLES] as UserRole[],
  DELIVERY_PREPARATION: [...PREPARATION_DELIVERY_ROLES] as UserRole[],

  // ── Voice HT ────────────────────────────────────────────────────────────────
  DELIVERY_VOICE: [...DELIVERY_VOICE_ROLES] as UserRole[],
  DELIVERY_VOICE_TARGET: [...DELIVERY_VOICE_TARGET_ROLES] as UserRole[],
} as const;

export function hasPermission(
  role: UserRole,
  allowed: readonly UserRole[] | UserRole[]
): boolean {
  return (allowed as UserRole[]).includes(role);
}

// ─── Division management ──────────────────────────────────────────────────────
export const DIVISION_MAP: Record<string, UserRole[]> = {
  KEPALA_TEKNISI: ["TEKNISI", "PKL_TEKNISI"],
  KEPALA_SALES: ["CREW_SALES", "PENGANTARAN", "PKL_SALES"],
  KEPALA_MARKETING: ["KONTEN", "PKL_MARKETING", "PKL_KONTEN"],
  KEPALA_ONPOINT: ["ONPOINT", "PKL_ONPOINT"],
  KEPALA_PENYEDIA_BARANG: ["PENYEDIA_BARANG", "PKL_PENYEDIA_BARANG"],
  KEPALA_SOTECH: ["SOTECH", "PKL_SOTECH"],
  ADMIN: ["PENGELOLA_BARANG"],
};

export const PKL_ROLES: UserRole[] = [
  "PKL", "PKL_MARKETING", "PKL_SALES", "PKL_PENYEDIA_BARANG",
  "PKL_SOTECH", "PKL_ONPOINT", "PKL_TEKNISI", "PKL_KONTEN",
];

export const PKL_VISIBLE_ROLES: UserRole[] = PKL_ROLES;

export function isPKLRole(role?: string): boolean {
  if (!role) return false;
  return role === "PKL" || role.startsWith("PKL_");
}

export function isFullAccess(role: string): boolean {
  return (["ADMIN", "PROGRAMMER", "ASISTEN_CEO"] as string[]).includes(role);
}
export function isDivisionHead(role: string): boolean {
  return Object.keys(DIVISION_MAP).includes(role);
}
export function getSubordinateRoles(headRole: string): UserRole[] {
  return DIVISION_MAP[headRole] ?? [];
}
export function isSubordinate(headRole: string, targetRole: string): boolean {
  return (getSubordinateRoles(headRole) as string[]).includes(targetRole);
}
export function canManageAttendance(role: string): boolean {
  return isFullAccess(role) || isDivisionHead(role);
}
export function canApproveOvertime(role: string): boolean {
  return isFullAccess(role) || isDivisionHead(role);
}
export function getManageableRoles(role: string): UserRole[] {
  if (isFullAccess(role)) return [...ALL_ROLES];
  if (isDivisionHead(role)) return getSubordinateRoles(role);
  return [];
}
export function canManageTargetRole(actorRole: string, targetRole: string): boolean {
  if (isFullAccess(actorRole)) return true;
  return isSubordinate(actorRole, targetRole);
}
export function canViewOvertimePay(role: string): boolean {
  const PAY_VIEW: UserRole[] = [
    "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
    "KEPALA_SALES", "KEPALA_MARKETING", "KEPALA_TEKNISI",
    "KEPALA_PENYEDIA_BARANG", "KEPALA_ONPOINT", "KEPALA_SOTECH",
  ];
  return (PAY_VIEW as string[]).includes(role);
}
export function canViewSalary(role: string): boolean {
  return (["ADMIN", "ASISTEN_CEO", "PROGRAMMER"] as string[]).includes(role);
}
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

// ─── Multi-Role Helpers (dari HEAD / punya Ikmal) ─────────────────────────────

/**
 * Ambil primary role (role pertama / role utama).
 * Dipakai untuk redirect, sidebar menu, dan display label.
 */
export function getPrimaryRole(roles: string[]): UserRole {
  return (roles[0] as UserRole) ?? "CREW_SALES";
}

/**
 * Cek apakah user (dengan array roles) punya permission tertentu.
 * Return true jika SALAH SATU role-nya ada di allowed list.
 */
export function hasAnyRole(
  userRoles: string[],
  allowed: readonly UserRole[] | UserRole[]
): boolean {
  return userRoles.some(r => (allowed as string[]).includes(r));
}

/**
 * Gabungkan semua route permissions dari semua roles yang dimiliki user.
 * Dipakai di middleware untuk cek akses route.
 */
export function getEffectivePermissions(userRoles: string[]): Set<string> {
  const routes = new Set<string>();
  for (const [route, allowedRoles] of Object.entries(ROUTE_PERMISSIONS)) {
    if (userRoles.some(r => (allowedRoles as string[]).includes(r))) {
      routes.add(route);
    }
  }
  return routes;
}

/**
 * Gabungkan menu sidebar dari semua roles (union, deduplicate by href).
 * Primary role punya prioritas urutan group.
 */
export function mergeMenuGroups(
  roleMenus: Record<string, any[]>,
  userRoles: string[]
): any[] {
  const seenHrefs = new Set<string>();
  const result: any[] = [];

  for (const role of userRoles) {
    const groups = roleMenus[role] ?? [];
    for (const group of groups) {
      let existingGroup = result.find((g: any) => g.label === group.label);
      if (!existingGroup) {
        existingGroup = { label: group.label, items: [] };
        result.push(existingGroup);
      }
      for (const item of group.items) {
        if (!seenHrefs.has(item.href)) {
          seenHrefs.add(item.href);
          existingGroup.items.push(item);
        }
      }
    }
  }

  return result;
}

/**
 * Ambil default redirect terbaik dari semua roles.
 * Priority: FULL_ACCESS → /dashboard, lainnya ikut primary role.
 */
export function getEffectiveRedirect(
  userRoles: string[],
  redirectMap: Record<string, string>
): string {
  const PRIORITY_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];
  for (const r of userRoles) {
    if (PRIORITY_ROLES.includes(r)) return "/dashboard";
  }
  const primary = getPrimaryRole(userRoles);
  return redirectMap[primary] ?? "/dashboard";
}

/**
 * Cek apakah user memiliki akses penuh (salah satu rolenya FULL_ACCESS).
 */
export function isFullAccessMulti(userRoles: string[]): boolean {
  return userRoles.some(r => isFullAccess(r));
}


export function getEffectiveSubordinates(userRoles: string[]): UserRole[] {
  const result = new Set<UserRole>();
  for (const role of userRoles) {
    for (const sub of getSubordinateRoles(role)) {
      result.add(sub);
    }
  }
  return Array.from(result);
}