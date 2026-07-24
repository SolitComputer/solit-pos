export type UserRole =
  | "ADMIN"
  | "KEPALA_SALES"
  | "CREW_SALES"
  | "ACCOUNTING"
  | "PURCHASING"
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
  | "KEPALA_ZENITH"
  | "PKL_PENYEDIA_BARANG"
  | "PKL_SOTECH"
  | "PKL_ONPOINT"
  | "PKL_TEKNISI"
  | "PKL_KONTEN"
  | "PKL_PENGANTARAN"
  | "PKL_CUSTOMER_SERVICE"
  | "PKL_PENGELOLA_BARANG"
  | "KEPALA_PENGELOLA_BARANG"
  | "CUSTOMER_SERVICE";


export const ROLE_DEFAULT_REDIRECT: Record<UserRole, string> = {
  ADMIN: "/dashboard",
  PROGRAMMER: "/dashboard",
  ASISTEN_CEO: "/dashboard",
  KEPALA_SALES: "/dashboard",
  CREW_SALES: "/dashboard",
  ACCOUNTING: "/dashboard",
  PURCHASING: "/dashboard/cashflow",
  PENGELOLA_BARANG: "/dashboard/laptops",
  KEPALA_PENGELOLA_BARANG: "/dashboard/laptops",
  TEKNISI: "/dashboard/service/antrian",
  KEPALA_TEKNISI: "/dashboard/service/antrian",
  PENGANTARAN: "/dashboard/preparation/pengantaran",
  PKL_CUSTOMER_SERVICE: "/dashboard/service/antrian",
  PKL_PENGELOLA_BARANG: "/dashboard/laptops",
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
  PKL_PENGANTARAN: "/dashboard/preparation/pengantaran",
  CUSTOMER_SERVICE: "/dashboard/service/antrian",
  KEPALA_ZENITH: "/dashboard",
};

// ─── Base Role Groups ─────────────────────────────────────────────────────────
const FULL_ACCESS: UserRole[] = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO", "ACCOUNTING"];

const ALL_ROLES: UserRole[] = [
  "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
  "KEPALA_SALES", "KEPALA_ZENITH", "KEPALA_MARKETING", "KEPALA_TEKNISI",
  "CREW_SALES", "SOTECH", "ACCOUNTING", "PURCHASING",
  "PENGELOLA_BARANG",
  "TEKNISI", "PENGANTARAN", "MARKETING", "KEBERSIHAN",
  "PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG", "KEPALA_PENGELOLA_BARANG", "KONTEN",
  "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH",
  "PKL", "PKL_MARKETING", "PKL_SALES", "PKL_PENYEDIA_BARANG",
  "PKL_SOTECH", "PKL_ONPOINT", "PKL_TEKNISI", "PKL_KONTEN",
  "PKL_PENGANTARAN", "PKL_CUSTOMER_SERVICE",
  "PKL_PENGELOLA_BARANG",
  "CUSTOMER_SERVICE",
];

export const ALL_STATIC_ROLES: string[] = [...ALL_ROLES];

const SALES_ACCESS: UserRole[] = [
  "KEPALA_SALES", "CREW_SALES", "SOTECH", "PENGANTARAN", "ONPOINT",
  "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH", "KEPALA_ZENITH",
];

const TRANSACTION_VIEW: UserRole[] = [
  "PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG", "KONTEN",
  "TEKNISI", "KEPALA_TEKNISI",
  "KEPALA_PENGELOLA_BARANG",
];

// ─── Management Seller / PIC Follow-up ────────────────────────────────────────

/** Boleh membuka halaman Management Seller */
export const SELLER_FOLLOWUP_VIEW_ROLES: UserRole[] = [
  ...FULL_ACCESS, "KEPALA_MARKETING", "KEPALA_SALES", "KEPALA_ZENITH", "CREW_SALES",
];

/** Melihat SEMUA data lintas PIC (tidak difilter ownership) */
export const SELLER_FOLLOWUP_SUPERVISOR_ROLES: UserRole[] = [
  ...FULL_ACCESS, "KEPALA_MARKETING", "KEPALA_SALES", "KEPALA_ZENITH",
];

/** Role yang SECARA STRUKTURAL boleh follow-up — masih dicek whitelist + ownership */
export const SELLER_FOLLOWUP_ACTOR_ROLES: UserRole[] = ["CREW_SALES", "KEPALA_MARKETING"];

/** Archive / reactivate / assign ulang PIC */
export const SELLER_FOLLOWUP_MANAGE_ROLES: UserRole[] = [...FULL_ACCESS];

/** Hanya Admin & Programmer yang boleh ubah checklist akses PIC */
export const SELLER_PIC_MANAGE_ROLES: UserRole[] = ["ADMIN", "PROGRAMMER"];

/** Role yang muncul sebagai kandidat di dropdown checklist PIC */
export const SELLER_PIC_CANDIDATE_ROLES: UserRole[] = ["CREW_SALES", "KEPALA_MARKETING"];

/** Role yang bisa akses halaman "Semua Unit" (global inventory view lintas laptop) */
export const ALL_UNITS_ROLES: UserRole[] = [
  ...FULL_ACCESS, "KEPALA_PENGELOLA_BARANG", "KEPALA_TEKNISI",
];
// ─── Akuntansi ────────────────────────────────────────────────────────────────
export const AKUNTANSI_ROLES: UserRole[] = ["ADMIN", "PROGRAMMER", "ACCOUNTING"];
/** Yang boleh konfirmasi / edit / hapus jurnal */
export const AKUNTANSI_MANAGE_ROLES: UserRole[] = ["ADMIN", "PROGRAMMER", "ACCOUNTING"];
export function humanizeRoleKey(role: string): string {
  return role
    .split("_")
    .map((w) => (w.length ? w[0] + w.slice(1).toLowerCase() : w))
    .join(" ");
}
export function getLegacyPageAccess(role: string, pageRoute: string): boolean {
  const matchedRoute = Object.keys(ROUTE_PERMISSIONS)
    .filter((r) => pageRoute === r || pageRoute.startsWith(r + "/"))
    .sort((a, b) => b.length - a.length)[0];

  if (!matchedRoute) return true;
  return (ROUTE_PERMISSIONS[matchedRoute] as string[]).includes(role);
}

// ─── Pengambilan Barang (Item Outflow) ────────────────────────────────────
export const ITEM_OUTFLOW_ROLES: UserRole[] = [
  "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
  "TEKNISI", "KEPALA_TEKNISI",
  "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG",
];

// ─── Preparation Roles ────────────────────────────────────────────────────────
const PKL_PREP_ROLES: UserRole[] = [
  "PKL", "PKL_MARKETING", "PKL_SALES", "PKL_PENYEDIA_BARANG",
  "PKL_SOTECH", "PKL_ONPOINT", "PKL_TEKNISI", "PKL_KONTEN",
  "PKL_PENGANTARAN",
];

const PREPARATION_SALES_ROLES: UserRole[] = [
  "KEPALA_SALES", "CREW_SALES", "SOTECH", "KEPALA_SOTECH",
  "KEPALA_ONPOINT", "ONPOINT", "KEPALA_ZENITH",
  "KEPALA_MARKETING",
  "PKL_SALES",
];

const PREPARATION_PENYEDIA_ROLES: UserRole[] = [
  "PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG",
  "PKL_PENYEDIA_BARANG",
];

const PREPARATION_PENYEDIA_EXTRA_ROLES: UserRole[] = [
  "KEPALA_SALES", "KEPALA_ZENITH", "CREW_SALES", "KEPALA_MARKETING",
  "KEPALA_SOTECH", "KEPALA_ONPOINT", "KONTEN", "PKL_SALES",
];

export const PREPARATION_CREATE_ROLES: UserRole[] = Array.from(new Set<UserRole>([
  ...FULL_ACCESS, ...PREPARATION_SALES_ROLES, ...PKL_PREP_ROLES,
]));


export const PREPARATION_DONE_ROLES: UserRole[] = Array.from(new Set<UserRole>([
  ...FULL_ACCESS,
  ...PREPARATION_PENYEDIA_ROLES,
  ...PREPARATION_PENYEDIA_EXTRA_ROLES, // tambahan: role yg memang muncul di menu "Selesai Disiapkan"
]));

export const PREPARATION_DISPATCH_ROLES: UserRole[] = Array.from(new Set<UserRole>([
  ...FULL_ACCESS, ...PREPARATION_SALES_ROLES, ...PKL_PREP_ROLES,
]));

export const PREPARATION_CANCEL_ROLES: UserRole[] = ["ADMIN", "PROGRAMMER", "KEPALA_SALES", "KEPALA_ZENITH",];
export const PREPARATION_FORCE_COMPLETE_ROLES: UserRole[] = ["ADMIN", "PROGRAMMER", "KEPALA_SALES", "KEPALA_ZENITH",];

export const PREPARATION_DELIVERY_ROLES: UserRole[] = [
  ...FULL_ACCESS, "PENGANTARAN", ...PREPARATION_PENYEDIA_ROLES,
];

export const PREPARATION_ANTRIAN_VIEW_ROLES: UserRole[] = Array.from(new Set<UserRole>([
  ...PREPARATION_DONE_ROLES,
  "KEPALA_SALES", "KEPALA_ZENITH", "CREW_SALES", "KEPALA_MARKETING", "KEPALA_SOTECH", "SOTECH",
  "ONPOINT", "KEPALA_ONPOINT", "KONTEN", "PKL_SALES",
  "PENGANTARAN",
]));

export const PROVIDER_PERFORMANCE_ROLES: UserRole[] = [
  "KEPALA_PENYEDIA_BARANG", "PENYEDIA_BARANG", "PKL_PENYEDIA_BARANG",
];

export const PROVIDER_PERFORMANCE_VIEW_ROLES: UserRole[] = [...PREPARATION_ANTRIAN_VIEW_ROLES];

export const PREPARATION_VIEW_ROLES: UserRole[] = Array.from(new Set<UserRole>([
  ...FULL_ACCESS,
  ...PREPARATION_SALES_ROLES,
  ...PREPARATION_PENYEDIA_ROLES,
  ...PREPARATION_PENYEDIA_EXTRA_ROLES,
  ...PKL_PREP_ROLES,
  "KEPALA_ONPOINT", "PENGANTARAN",
]));

export const PREPARATION_DELIVERY_PERSON_ROLES: UserRole[] = ["PENGANTARAN", "PKL_PENGANTARAN"];

export const DELIVERY_LEADERBOARD_VIEW_ROLES: UserRole[] = Array.from(new Set<UserRole>([
  ...FULL_ACCESS,
  ...PREPARATION_SALES_ROLES,
  "PENGANTARAN", "PKL_PENGANTARAN"
]));

// ─── Voice / HT Roles ────────────────────────────────────────────────────────
export const DELIVERY_VOICE_ROLES: UserRole[] = [
  ...FULL_ACCESS, ...SALES_ACCESS,
  "PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG",
  "PKL_PENYEDIA_BARANG",
];

export const DELIVERY_VOICE_TARGET_ROLES: UserRole[] = [
  ...FULL_ACCESS, "KEPALA_SALES", "KEPALA_ZENITH", "CREW_SALES",
  "PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG",
  "PKL_PENYEDIA_BARANG",
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

export const CASHFLOW_ROLES: UserRole[] = ["ADMIN", "PROGRAMMER", "ACCOUNTING", "PURCHASING"];

// PURCHASING boleh lihat & input cashflow, tapi tidak boleh audit uang keluar.
export const CASHFLOW_AUDIT_OUT_ROLES: UserRole[] = ["ADMIN", "PROGRAMMER", "ACCOUNTING"];

// Tidak ada role SUPERADMIN di sistem ini — ADMIN & PROGRAMMER dipakai sebagai
// pemegang akses penuh yang boleh mengatur whitelist akun audit uang keluar.
export const CASHFLOW_AUDIT_ACCESS_MANAGE_ROLES: UserRole[] = ["ADMIN", "PROGRAMMER"];

export const CC_REPORT_ROLES: UserRole[] = [
  ...FULL_ACCESS, "KEPALA_MARKETING", "MARKETING", "KONTEN",
];
export const CC_REPORT_MANAGE_ROLES: UserRole[] = [
  ...FULL_ACCESS, "KEPALA_MARKETING",
];

export const TODO_ROLES: UserRole[] = ["ADMIN", "PROGRAMMER"];
export const MONITORING_CEO_ROLES: UserRole[] = ["ADMIN", "PROGRAMMER"];

// ─── Notification Sound Settings — atur suara notif pengantaran per akun ─────
export const NOTIFICATION_SETTINGS_ROLES: UserRole[] = [...FULL_ACCESS];
export const NOTIF_SOUND_KEYS = ["default", "urgent", "bell", "double_beep", "custom"] as const;

// ─── Route Permissions ────────────────────────────────────────────────────────
export const ROUTE_PERMISSIONS: Record<string, UserRole[]> = {
  "/dashboard/laptops/create": [...FULL_ACCESS, "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG", "KEPALA_TEKNISI"],
  "/dashboard/laptops/edit": [...FULL_ACCESS, "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG"],
  "/dashboard/units": [...ALL_UNITS_ROLES],
  "/api/item-outflows": [...ITEM_OUTFLOW_ROLES],
  "/dashboard/laptops": [
    ...FULL_ACCESS, "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG", "TEKNISI", "KEPALA_TEKNISI",
    "KEPALA_SALES", "KEPALA_ZENITH", "CREW_SALES", "SOTECH", "ACCOUNTING", "PURCHASING",
    "PENGANTARAN", "MARKETING", "KEBERSIHAN", "KEPALA_MARKETING",
    "PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG", "KONTEN",
    "KEPALA_SOTECH", "KEPALA_ONPOINT", "ONPOINT", "PKL", "CUSTOMER_SERVICE",
    "PKL_SALES",
    "PKL_MARKETING", "PKL_PENYEDIA_BARANG", "PKL_SOTECH", "PKL_ONPOINT",
    "PKL_TEKNISI", "PKL_KONTEN", "PKL_PENGANTARAN",
    "PKL_CUSTOMER_SERVICE", "PKL_PENGELOLA_BARANG",
  ],
  "/dashboard/laptops/ready": [
    ...FULL_ACCESS, "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG", "KEPALA_SALES", "KEPALA_ZENITH", "CREW_SALES", "SOTECH",
    "ACCOUNTING", "PURCHASING", "PENGANTARAN", "MARKETING", "KEBERSIHAN", "KEPALA_MARKETING",
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
    "PENGANTARAN", "KEPALA_MARKETING", "KEPALA_ZENITH",
    "KEPALA_ONPOINT", "KEPALA_SOTECH",
    "PKL_SALES",
  ],

  "/dashboard/transactions": [
    ...FULL_ACCESS, "KEPALA_SALES", "CREW_SALES", "SOTECH", "ACCOUNTING",
    "PENGELOLA_BARANG", "PENGANTARAN", "KEBERSIHAN", "KEPALA_MARKETING",
    "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH", "KEPALA_ZENITH",
    ...TRANSACTION_VIEW,
    "PKL_SALES",
  ],
  "/dashboard": [...ALL_ROLES],
  "/dashboard/reports": [...FULL_ACCESS, "ACCOUNTING", "PURCHASING"],
  "/dashboard/users": ALL_ROLES.filter(r => !r.startsWith("PKL")),
  "/dashboard/attendance": [...ALL_ROLES],
  "/dashboard/attendance/overtime": [...ALL_ROLES],

  "/dashboard/service": [...SERVICE_VIEW_ROLES],
  "/dashboard/service/antrian": [...SERVICE_VIEW_ROLES],
  "/dashboard/service/done": [...SERVICE_VIEW_ROLES],
  "/dashboard/service/history": [...SERVICE_VIEW_ROLES],
  "/dashboard/service/statistik": [...SERVICE_VIEW_ROLES],

  "/payment": [
    ...FULL_ACCESS, "KEPALA_SALES", "CREW_SALES", "SOTECH",
    "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH", "PKL",
    "PKL_SALES", "KEPALA_ZENITH",
  ],

  "/api/messages": ALL_ROLES.filter(r => !r.startsWith("PKL")),
  "/api/group-chat": ALL_ROLES.filter(r => !r.startsWith("PKL")),
  "/api/chat-groups": ALL_ROLES.filter(r => !r.startsWith("PKL")),
  "/api/push/subscribe": [...ALL_ROLES],

  "/api/laptops/create": [...FULL_ACCESS, "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG", "KEPALA_TEKNISI"],
  "/api/laptops": [
    ...FULL_ACCESS, "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG", "KEPALA_SALES", "KEPALA_ZENITH", "CREW_SALES", "SOTECH",
    "TEKNISI", "KEPALA_TEKNISI", "ACCOUNTING", "PURCHASING", "PENGANTARAN",
    "MARKETING", "KEBERSIHAN", "KEPALA_MARKETING",
    "PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG", "KONTEN",
    "KEPALA_SOTECH", "KEPALA_ONPOINT", "ONPOINT",
    "PKL", "PKL_MARKETING", "PKL_SALES", "PKL_PENYEDIA_BARANG",
    "PKL_SOTECH", "PKL_ONPOINT", "PKL_TEKNISI", "PKL_KONTEN",
    "CUSTOMER_SERVICE",
    "PKL_PENGANTARAN", "PKL_CUSTOMER_SERVICE", "PKL_PENGELOLA_BARANG",
  ],
  "/api/laptops/minus": [...FULL_ACCESS, "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG", "TEKNISI", "KEPALA_TEKNISI"],
  "/api/dashboard": [...ALL_ROLES],
  "/api/transaction/create": [
    ...FULL_ACCESS, "KEPALA_SALES", "CREW_SALES", "SOTECH",
    "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH", "KEPALA_ZENITH",
    "PKL", "PKL_MARKETING", "PKL_SALES", "PKL_PENYEDIA_BARANG",
    "PKL_SOTECH", "PKL_ONPOINT", "PKL_TEKNISI", "PKL_KONTEN",
  ],
  "/api/transaction": [
    ...FULL_ACCESS, "KEPALA_SALES", "ACCOUNTING", "PURCHASING", "CREW_SALES", "SOTECH",
    "PENGELOLA_BARANG", "PENGANTARAN", "KEBERSIHAN", "KEPALA_MARKETING", "KEPALA_ZENITH",
    ...TRANSACTION_VIEW,
    "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH",
    "PKL_SALES",
  ],

  "/api/warranty": [
    ...FULL_ACCESS, "TEKNISI", "KEPALA_TEKNISI", "KEPALA_SALES",
    "CREW_SALES", "SOTECH", "ACCOUNTING", "PENGANTARAN", "KEPALA_MARKETING",
    "KEPALA_ONPOINT", "KEPALA_SOTECH", "KEPALA_ZENITH",
    "PKL_SALES",
  ],

  "/api/reports": [...FULL_ACCESS, "ACCOUNTING", "PURCHASING"],
  "/api/units/reserve": [
    ...FULL_ACCESS, "KEPALA_SALES", "CREW_SALES", "SOTECH",
    "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH", "KEPALA_ZENITH",
    "PKL", "PKL_MARKETING", "PKL_SALES", "PKL_PENYEDIA_BARANG",
    "PKL_SOTECH", "PKL_ONPOINT", "PKL_TEKNISI", "PKL_KONTEN",
  ],
  "/api/units/hold": [
    ...FULL_ACCESS, "KEPALA_SALES", "CREW_SALES", "SOTECH", "KEPALA_ZENITH",
    "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH",
    "PKL", "PKL_MARKETING", "PKL_SALES", "PKL_PENYEDIA_BARANG",
    "PKL_SOTECH", "PKL_ONPOINT", "PKL_TEKNISI", "PKL_KONTEN",
  ],

  "/api/units/confirm-payment": [
    ...FULL_ACCESS,
    "KEPALA_SALES",
    "KEPALA_ZENITH",
    "KEPALA_SOTECH",
    "SOTECH",
    "KEPALA_ONPOINT",
  ],

  "/api/users": [...FULL_ACCESS],
  "/api/attendance/manual": [...ALL_ROLES],
  "/api/attendance/salary": [...ALL_ROLES],
  "/api/attendance/leave": [...ALL_ROLES],
  "/api/attendance/day-off": [...ALL_ROLES],
  "/api/attendance/date-off": [...ALL_ROLES],
  "/api/attendance/shift-config": [
    ...FULL_ACCESS, "KEPALA_TEKNISI", "KEPALA_SALES", "KEPALA_ZENITH", "KEPALA_MARKETING",
    "KEPALA_ONPOINT", "KEPALA_PENYEDIA_BARANG", "KEPALA_SOTECH",
  ],
  "/api/attendance/schedule": [...FULL_ACCESS],
  "/api/attendance/users": [...ALL_ROLES],
  "/api/attendance/overtime": [...ALL_ROLES],
  "/api/attendance/overtime/rates": [
    ...FULL_ACCESS, "KEPALA_SALES", "KEPALA_ZENITH", "KEPALA_MARKETING", "KEPALA_TEKNISI",
    "KEPALA_ONPOINT", "KEPALA_PENYEDIA_BARANG", "KEPALA_SOTECH",
  ],
  "/api/attendance": [...ALL_ROLES],
  "/api/service": [...SERVICE_VIEW_ROLES],

  // AFTER
  "/dashboard/pkl-reports": [
    ...FULL_ACCESS,
    "KEPALA_SALES", "KEPALA_ZENITH", "KEPALA_MARKETING", "KEPALA_TEKNISI",
    "KEPALA_ONPOINT", "KEPALA_PENYEDIA_BARANG", "KEPALA_SOTECH",
    "PKL", "PKL_MARKETING", "PKL_SALES", "PKL_PENYEDIA_BARANG",
    "PKL_SOTECH", "PKL_ONPOINT", "PKL_TEKNISI", "PKL_KONTEN",
    "PKL_PENGANTARAN", "PKL_CUSTOMER_SERVICE", "PKL_PENGELOLA_BARANG", // ditambahkan
  ],
  "/api/pkl-reports": [
    ...FULL_ACCESS,
    "KEPALA_SALES", "KEPALA_ZENITH", "KEPALA_MARKETING", "KEPALA_TEKNISI",
    "KEPALA_ONPOINT", "KEPALA_PENYEDIA_BARANG", "KEPALA_SOTECH",
    "PKL", "PKL_MARKETING", "PKL_SALES", "PKL_PENYEDIA_BARANG",
    "PKL_SOTECH", "PKL_ONPOINT", "PKL_TEKNISI", "PKL_KONTEN",
    "PKL_PENGANTARAN", "PKL_CUSTOMER_SERVICE", "PKL_PENGELOLA_BARANG", // ditambahkan
  ],

  "/dashboard/management-seller": [...SELLER_FOLLOWUP_VIEW_ROLES],
  "/api/seller-followups": [...SELLER_FOLLOWUP_VIEW_ROLES],
  "/api/seller-pics": [...SELLER_FOLLOWUP_VIEW_ROLES],

  // ── Preparation routes ─────────────────────────────────────────────────────
  "/dashboard/preparation": [...PREPARATION_VIEW_ROLES],
  "/dashboard/preparation/antrian": [...PREPARATION_ANTRIAN_VIEW_ROLES],
  "/dashboard/preparation/done": [...PREPARATION_DONE_ROLES],
  "/dashboard/preparation/siap-kirim": [...PREPARATION_DISPATCH_ROLES],
  "/dashboard/preparation/pengantaran": [...PREPARATION_DELIVERY_ROLES],
  "/dashboard/preparation/history": [...PREPARATION_VIEW_ROLES],
  "/dashboard/preparation/statistik": [...DELIVERY_LEADERBOARD_VIEW_ROLES],

  "/api/preparation": [...PREPARATION_VIEW_ROLES],
  "/api/preparation/my-deliveries": [...PREPARATION_DELIVERY_ROLES],
  "/api/preparation/dispatch": [...PREPARATION_DISPATCH_ROLES],

  "/dashboard/preparation/riwayat-penyedia": [...PROVIDER_PERFORMANCE_VIEW_ROLES],
  "/api/preparation/provider-performance": [...PROVIDER_PERFORMANCE_VIEW_ROLES],

  // ── Cashflow ───────────────────────────────────────────────────────────────
  "/dashboard/cashflow": [...CASHFLOW_ROLES],
  "/dashboard/customer-birthdays": [...ALL_ROLES],
  "/api/transaction/customer-birthdays": [...ALL_ROLES],
  "/api/cashflow": [...CASHFLOW_ROLES],
  "/api/cashflow/audit-access": [...CASHFLOW_ROLES],

  "/dashboard/missions": [...ALL_ROLES],
  "/dashboard/missions/progress": [...ALL_ROLES],
  "/dashboard/missions/history": [...ALL_ROLES],
  "/api/missions": [...ALL_ROLES],

  // ── Content Creator ────────────────────────────────────────────────────────
  "/dashboard/cc-reports": [...CC_REPORT_ROLES],
  "/api/cc-reports": [...CC_REPORT_ROLES],

  // ── To-Do List — ADMIN & PROGRAMMER only ──────────────────────────────────
  "/dashboard/todos": [...TODO_ROLES],
  "/api/todos": [...TODO_ROLES],

  "/dashboard/akutansi": [...AKUNTANSI_ROLES],
  "/dashboard/monitoring-ceo": [...MONITORING_CEO_ROLES],
  "/dashboard/admin/notifikasi-pengantaran": [...NOTIFICATION_SETTINGS_ROLES],
  "/api/akutansi": [...AKUNTANSI_ROLES],
  "/api/notification-settings": [...NOTIFICATION_SETTINGS_ROLES],
};

// ─── PERMISSIONS object ───────────────────────────────────────────────────────
export const PERMISSIONS = {
  VIEW_DASHBOARD: [...ALL_ROLES] as UserRole[],

  VIEW_FINANCIALS: ["ADMIN", "ACCOUNTING", "PROGRAMMER"] as UserRole[],
  VIEW_REPORTS: [...FULL_ACCESS, "ACCOUNTING", "PURCHASING"] as UserRole[],

  VIEW_TRANSACTIONS: [
    ...FULL_ACCESS, "KEPALA_SALES", "ACCOUNTING", "PURCHASING", "CREW_SALES", "SOTECH",
    "PENGELOLA_BARANG", "PENGANTARAN", "KEBERSIHAN", "KEPALA_MARKETING", "MARKETING",
    ...TRANSACTION_VIEW,
    "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH", "KEPALA_ZENITH",
    "PKL_SALES",
  ] as UserRole[],

  CREATE_TRANSACTION: [
    ...FULL_ACCESS, "KEPALA_SALES", "CREW_SALES", "SOTECH",
    "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH", "KEPALA_ZENITH",
    "PKL", "PKL_MARKETING", "PKL_SALES", "PKL_PENYEDIA_BARANG",
    "PKL_SOTECH", "PKL_ONPOINT", "PKL_TEKNISI", "PKL_KONTEN",
  ] as UserRole[],

  EDIT_TRANSACTION: [
    ...FULL_ACCESS, "KEPALA_SALES", "CREW_SALES", "KEPALA_ZENITH",
    "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH",
    "PKL_SALES",
  ] as UserRole[],

  RESTORE_TRANSACTION: [
    ...FULL_ACCESS,
    "KEPALA_SALES",
    "KEPALA_ZENITH",
    "KEPALA_SOTECH",
    "KEPALA_ONPOINT",
  ] as UserRole[],

  RESERVE_UNIT: [
    ...FULL_ACCESS,
    "KEPALA_SALES", "KEPALA_ZENITH", "CREW_SALES", "SOTECH",
    "PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG",
    "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH",
    "PKL", "PKL_MARKETING", "PKL_SALES", "PKL_PENYEDIA_BARANG",
    "PKL_SOTECH", "PKL_ONPOINT", "PKL_TEKNISI", "PKL_KONTEN",
  ] as UserRole[],

  VIEW_LAPTOPS: [
    ...FULL_ACCESS, "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG", "TEKNISI", "KEPALA_TEKNISI",
    "KEPALA_SALES", "KEPALA_ZENITH", "CREW_SALES", "SOTECH", "ACCOUNTING", "PURCHASING", "PENGANTARAN", "MARKETING",
    "KEBERSIHAN", "KEPALA_MARKETING", "PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG", "KONTEN",
    "KEPALA_SOTECH", "KEPALA_ONPOINT", "ONPOINT", "PKL", "CUSTOMER_SERVICE",
    "PKL_MARKETING", "PKL_SALES", "PKL_PENYEDIA_BARANG",
    "PKL_SOTECH", "PKL_ONPOINT", "PKL_TEKNISI", "PKL_KONTEN",
    "PKL_PENGANTARAN", "PKL_CUSTOMER_SERVICE", "PKL_PENGELOLA_BARANG",
  ] as UserRole[],
  CREATE_LAPTOP: [...FULL_ACCESS, "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG", "KEPALA_TEKNISI"] as UserRole[],
  EDIT_LAPTOP: [...FULL_ACCESS, "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG"] as UserRole[],

  VIEW_BARCODE: [
    ...FULL_ACCESS, "KEPALA_SALES", "KEPALA_ZENITH", "CREW_SALES", "SOTECH", "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG",
    "TEKNISI", "KEPALA_TEKNISI", "ACCOUNTING", "PENGANTARAN", "MARKETING", "KEPALA_MARKETING",
    "KEPALA_ONPOINT", "KEPALA_SOTECH",
  ] as UserRole[],

  VIEW_UNITS: [
    ...FULL_ACCESS, "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG", "TEKNISI", "KEPALA_TEKNISI",
    "KEPALA_SALES", "KEPALA_ZENITH", "CREW_SALES", "SOTECH", "ACCOUNTING", "PENGANTARAN", "MARKETING", "KEPALA_MARKETING",
    "KEPALA_SOTECH", "KEPALA_ONPOINT", "ONPOINT",
    "PKL", "PKL_MARKETING", "PKL_SALES", "PKL_PENYEDIA_BARANG",
    "PKL_SOTECH", "PKL_ONPOINT", "PKL_TEKNISI", "PKL_KONTEN",
    "PKL_PENGANTARAN", "PKL_CUSTOMER_SERVICE", "PKL_PENGELOLA_BARANG",
    "CUSTOMER_SERVICE",
  ] as UserRole[],
  CREATE_UNITS: [...FULL_ACCESS, "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG", "KEPALA_TEKNISI"] as UserRole[],
  EDIT_UNITS: [...FULL_ACCESS, "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG", "KEPALA_TEKNISI"] as UserRole[],

  VIEW_ALL_UNITS: [...ALL_UNITS_ROLES] as UserRole[],

  VIEW_WARRANTY: [
    ...FULL_ACCESS, "TEKNISI", "KEPALA_TEKNISI", "KEPALA_SALES", "CREW_SALES",
    "SOTECH", "ACCOUNTING", "PENGANTARAN", "KEPALA_MARKETING", "KEPALA_ZENITH",
    "KEPALA_ONPOINT", "KEPALA_SOTECH",
    "PKL_SALES",
  ] as UserRole[],
  EDIT_WARRANTY: [...FULL_ACCESS, "TEKNISI", "KEPALA_TEKNISI"] as UserRole[],

  VIEW_READY_LAPTOPS: [
    ...FULL_ACCESS, "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG", "KEPALA_SALES", "KEPALA_ZENITH", "CREW_SALES", "SOTECH",
    "ACCOUNTING", "PURCHASING", "PENGANTARAN", "MARKETING", "KEBERSIHAN", "KEPALA_MARKETING",
    "PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG", "KONTEN",
    "TEKNISI", "KEPALA_TEKNISI",
    "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH",
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

  // ── Management Seller ──────────────────────────────────────────────────────
  VIEW_SELLER_FOLLOWUP: [...SELLER_FOLLOWUP_VIEW_ROLES] as UserRole[],
  VIEW_ALL_SELLER_FOLLOWUP: [...SELLER_FOLLOWUP_SUPERVISOR_ROLES] as UserRole[],
  MANAGE_SELLER_FOLLOWUP: [...SELLER_FOLLOWUP_MANAGE_ROLES] as UserRole[],
  FOLLOWUP_SELLER: [...SELLER_FOLLOWUP_ACTOR_ROLES] as UserRole[],
  VIEW_SELLER_PIC: [...SELLER_FOLLOWUP_VIEW_ROLES] as UserRole[],
  MANAGE_SELLER_PIC: [...SELLER_PIC_MANAGE_ROLES] as UserRole[],

  // ── Preparation permissions ─────────────────────────────────────────────────
  VIEW_PREPARATION: [...PREPARATION_VIEW_ROLES] as UserRole[],
  CREATE_PREPARATION: [...PREPARATION_CREATE_ROLES] as UserRole[],
  DONE_PREPARATION: [...PREPARATION_DONE_ROLES] as UserRole[],
  DISPATCH_PREPARATION: [...PREPARATION_DISPATCH_ROLES] as UserRole[],
  DELIVERY_PREPARATION: [...PREPARATION_DELIVERY_ROLES] as UserRole[],
  CANCEL_PREPARATION: [...PREPARATION_CANCEL_ROLES] as UserRole[],
  FORCE_COMPLETE_PREPARATION: [...PREPARATION_FORCE_COMPLETE_ROLES] as UserRole[],

  VIEW_PROVIDER_PERFORMANCE: [...PROVIDER_PERFORMANCE_VIEW_ROLES] as UserRole[],

  // ── Voice HT ────────────────────────────────────────────────────────────────
  DELIVERY_VOICE: [...DELIVERY_VOICE_ROLES] as UserRole[],
  DELIVERY_VOICE_TARGET: [...DELIVERY_VOICE_TARGET_ROLES] as UserRole[],

  // ── Cashflow ───────────────────────────────────────────────────────────────
  VIEW_CASHFLOW: [...CASHFLOW_ROLES] as UserRole[],
  MANAGE_CASHFLOW: [...CASHFLOW_ROLES] as UserRole[],
  AUDIT_CASHFLOW: [...CASHFLOW_ROLES] as UserRole[],
  MANAGE_CASHFLOW_AUDIT_ACCESS: [...CASHFLOW_AUDIT_ACCESS_MANAGE_ROLES] as UserRole[],

  // ── Content Creator ─────────────────────────────────────────────────────────
  VIEW_CC_REPORT: [...CC_REPORT_ROLES] as UserRole[],
  MANAGE_CC_REPORT: [...CC_REPORT_ROLES] as UserRole[],
  DELETE_CC_REPORT: [...CC_REPORT_MANAGE_ROLES] as UserRole[],

  // ── To-Do List ──────────────────────────────────────────────────────────────
  VIEW_TODOS: [...TODO_ROLES] as UserRole[],
  MANAGE_TODOS: [...TODO_ROLES] as UserRole[],

  // ── Notification Sound Settings ─────────────────────────────────────────────
  MANAGE_NOTIFICATION_SETTINGS: [...NOTIFICATION_SETTINGS_ROLES] as UserRole[],
} as const;

export function hasPermission(
  role: UserRole,
  allowed: readonly UserRole[] | UserRole[]
): boolean {
  return (allowed as UserRole[]).includes(role);
}

export const DIVISION_MAP: Record<string, UserRole[]> = {
  KEPALA_TEKNISI: [
    "TEKNISI", "PKL_TEKNISI",
    "CUSTOMER_SERVICE", "PKL_CUSTOMER_SERVICE",
    "PENGELOLA_BARANG",
  ],
  KEPALA_SALES: ["CREW_SALES", "PENGANTARAN", "PKL_SALES", "PKL_PENGANTARAN"],
  KEPALA_ZENITH: ["CREW_SALES", "PENGANTARAN", "PKL_SALES", "PKL_PENGANTARAN"],
  KEPALA_MARKETING: ["KONTEN", "PKL_MARKETING", "PKL_KONTEN"],
  KEPALA_ONPOINT: ["ONPOINT", "PKL_ONPOINT"],
  KEPALA_PENYEDIA_BARANG: ["PENYEDIA_BARANG", "PKL_PENYEDIA_BARANG"],
  KEPALA_SOTECH: ["SOTECH", "PKL_SOTECH"],
  KEPALA_PENGELOLA_BARANG: [
    "PENGELOLA_BARANG", "PKL_PENGELOLA_BARANG",
    "TEKNISI", "PKL_TEKNISI",
    "CUSTOMER_SERVICE", "PKL_CUSTOMER_SERVICE",
  ],
  ADMIN: ["PENGELOLA_BARANG"],
};

export const PKL_ROLES: UserRole[] = [
  "PKL", "PKL_MARKETING", "PKL_SALES", "PKL_PENYEDIA_BARANG",
  "PKL_SOTECH", "PKL_ONPOINT", "PKL_TEKNISI", "PKL_KONTEN",
  "PKL_PENGANTARAN",
  "PKL_CUSTOMER_SERVICE",
  "PKL_PENGELOLA_BARANG",
];

export const PKL_VISIBLE_ROLES: UserRole[] = PKL_ROLES;

export const LAPTOP_VIEW_ROLES: UserRole[] = [
  "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
  "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG",
  "KEPALA_SALES", "KEPALA_ZENITH", "CREW_SALES", "SOTECH", "KEPALA_SOTECH",
  "ACCOUNTING", "PURCHASING", "PENGANTARAN",
  "MARKETING", "KEPALA_MARKETING",
  "PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG", "KONTEN",
  "KEPALA_ONPOINT", "ONPOINT",
  "KEPALA_TEKNISI", "TEKNISI",
  "PKL", "CUSTOMER_SERVICE",
  "PKL_MARKETING", "PKL_SALES", "PKL_PENYEDIA_BARANG",
  "PKL_SOTECH", "PKL_ONPOINT", "PKL_TEKNISI", "PKL_KONTEN",
  "PKL_PENGANTARAN", "PKL_CUSTOMER_SERVICE", "PKL_PENGELOLA_BARANG",
];

export const LAPTOP_READY_VIEW_ROLES: UserRole[] = [
  ...LAPTOP_VIEW_ROLES,
];

export const LAPTOP_DELETE_ROLES: UserRole[] = [
  "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
  "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG",
  "KEPALA_TEKNISI",
];

// ─── PKL → Parent Role Mapping ────────────────────────────────────────────────
export const PKL_PARENT_ROLE: Partial<Record<UserRole, UserRole>> = {
  PKL_SALES: "CREW_SALES",
  PKL_MARKETING: "MARKETING",
  PKL_PENYEDIA_BARANG: "PENYEDIA_BARANG",
  PKL_SOTECH: "SOTECH",
  PKL_ONPOINT: "ONPOINT",
  PKL_TEKNISI: "TEKNISI",
  PKL_KONTEN: "KONTEN",
  PKL_PENGANTARAN: "PENGANTARAN",
  PKL_CUSTOMER_SERVICE: "CUSTOMER_SERVICE",
  PKL_PENGELOLA_BARANG: "PENGELOLA_BARANG",
};

export function getPKLParentRole(role: string): UserRole | null {
  return (PKL_PARENT_ROLE[role as UserRole] ?? null) as UserRole | null;
}

export function expandRolesWithParents(userRoles: string[]): string[] {
  const set = new Set<string>(userRoles);
  for (const r of userRoles) {
    const parent = PKL_PARENT_ROLE[r as UserRole];
    if (parent) set.add(parent);
  }
  return Array.from(set);
}

export function getEffectivePrimaryRole(userRoles: string[]): UserRole {
  const primary = (userRoles[0] as UserRole) ?? "CREW_SALES";
  return (PKL_PARENT_ROLE[primary] ?? primary) as UserRole;
}

export function isPKLRole(role?: string): boolean {
  if (!role) return false;
  return role === "PKL" || role.startsWith("PKL_");
}

export function isFullAccess(role: string): boolean {
  return (["ADMIN", "PROGRAMMER", "ASISTEN_CEO", "ACCOUNTING"] as string[]).includes(role);
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
    "KEPALA_SALES", "KEPALA_ZENITH", "KEPALA_MARKETING", "KEPALA_TEKNISI",
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
    KEPALA_ZENITH: "Divisi Sales",
    KEPALA_MARKETING: "Divisi Marketing",
    KEPALA_ONPOINT: "Divisi Onpoint",
    KEPALA_PENYEDIA_BARANG: "Divisi Penyedia Barang",
    KEPALA_SOTECH: "Divisi Sotech",
    KEPALA_PENGELOLA_BARANG: "Divisi Pengelola Barang",
    ADMIN: "Pengelola Barang",
  };
  return labels[headRole] ?? headRole.replace(/_/g, " ");
}

// ─── Multi-Role Helpers ───────────────────────────────────────────────────────

export function getPrimaryRole(roles: string[]): UserRole {
  return (roles[0] as UserRole) ?? "CREW_SALES";
}

export function hasAnyRole(
  userRoles: string[],
  allowed: readonly UserRole[] | UserRole[]
): boolean {
  return userRoles.some(r => (allowed as string[]).includes(r));
}

export function getEffectivePermissions(userRoles: string[]): Set<string> {
  const routes = new Set<string>();
  for (const [route, allowedRoles] of Object.entries(ROUTE_PERMISSIONS)) {
    if (userRoles.some(r => (allowedRoles as string[]).includes(r))) {
      routes.add(route);
    }
  }
  return routes;
}

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