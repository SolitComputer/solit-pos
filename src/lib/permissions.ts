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
  "PKL_PENGANTARAN", "PKL_CUSTOMER_SERVICE",
  "PKL_PENGELOLA_BARANG",
  "CUSTOMER_SERVICE",
];

const SALES_ACCESS: UserRole[] = [
  "KEPALA_SALES", "CREW_SALES", "SOTECH", "PENGANTARAN",
  "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH",
];

// UNION: versi Ikmal lebih lengkap (tambah KEPALA_TEKNISI, KEPALA_PENGELOLA_BARANG)
const TRANSACTION_VIEW: UserRole[] = [
  "PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG", "KONTEN",
  "TEKNISI", "KEPALA_TEKNISI",
  "KEPALA_PENGELOLA_BARANG",
];

const SELLER_FOLLOWUP_ROLES: UserRole[] = [...FULL_ACCESS, "KEPALA_MARKETING", "MARKETING"];

// ─── Preparation Roles ────────────────────────────────────────────────────────

/** PKL (anak magang) — dipakai di grup preparation (dari versi teman/develop) */
const PKL_PREP_ROLES: UserRole[] = [
  "PKL", "PKL_MARKETING", "PKL_SALES", "PKL_PENYEDIA_BARANG",
  "PKL_SOTECH", "PKL_ONPOINT", "PKL_TEKNISI", "PKL_KONTEN",
  "PKL_PENGANTARAN",   // ← NEW
];

/** Sales yang bisa CREATE format penyiapan (UNION kedua versi) */
const PREPARATION_SALES_ROLES: UserRole[] = [
  "KEPALA_SALES", "CREW_SALES", "SOTECH", "KEPALA_SOTECH",
  "KEPALA_ONPOINT", "ONPOINT",
  "KEPALA_MARKETING", // dari versi teman
  "PKL_SALES",        // dari versi Ikmal
];

/** Penyedia barang yang cek & tandai done */
const PREPARATION_PENYEDIA_ROLES: UserRole[] = [
  "PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG",
  "PKL_PENYEDIA_BARANG", // ← PKL penyedia = sama seperti penyedia barang (receive/check/done)
];

/**
 * Role tambahan (DI LUAR penyedia inti) yang atas permintaan bisnis diberi
 * akses PENUH fitur penyedia barang (receive/check/done/view). (dari versi Ikmal)
 * ⚠️ MERGE-CONFLICT (DONE): versi teman TIDAK memberi role ini akses "done".
 *    Kalau ingin batasi "done" hanya penyedia+admin, kosongkan array ini
 *    (biarkan tetap dipakai di VIEW_ROLES saja).
 */
const PREPARATION_PENYEDIA_EXTRA_ROLES: UserRole[] = [
  "KEPALA_SALES", "CREW_SALES", "KEPALA_MARKETING",
  "KEPALA_SOTECH", "KEPALA_ONPOINT", "KONTEN", "PKL_SALES",
];

/** Buat format penyiapan (Sales + PKL + Admin) — UNION */
export const PREPARATION_CREATE_ROLES: UserRole[] = Array.from(new Set<UserRole>([
  ...FULL_ACCESS, ...PREPARATION_SALES_ROLES, ...PKL_PREP_ROLES,
]));

/** Terima & DONE penyiapan — HANYA penyedia barang inti + admin */
export const PREPARATION_DONE_ROLES: UserRole[] = Array.from(new Set<UserRole>([
  ...FULL_ACCESS,
  ...PREPARATION_PENYEDIA_ROLES,

]));

/** Dispatch pilih metode kirim (Sales + PKL + Admin) — PENGANTARAN tidak termasuk */
export const PREPARATION_DISPATCH_ROLES: UserRole[] = Array.from(new Set<UserRole>([
  ...FULL_ACCESS, ...PREPARATION_SALES_ROLES, ...PKL_PREP_ROLES,
]));

/** BATALKAN pesanan — HANYA Admin, Programmer, Kepala Sales (dari versi teman) */
export const PREPARATION_CANCEL_ROLES: UserRole[] = ["ADMIN", "PROGRAMMER", "KEPALA_SALES"];
export const PREPARATION_FORCE_COMPLETE_ROLES: UserRole[] = ["ADMIN", "PROGRAMMER", "KEPALA_SALES"];

/** Role yang handle delivery tracking */
export const PREPARATION_DELIVERY_ROLES: UserRole[] = [
  ...FULL_ACCESS, "PENGANTARAN", ...PREPARATION_PENYEDIA_ROLES,
];

/** Role yang bisa LIHAT antrian masuk (done roles + sales view-only) (dari versi teman) */
export const PREPARATION_ANTRIAN_VIEW_ROLES: UserRole[] = Array.from(new Set<UserRole>([
  ...PREPARATION_DONE_ROLES,
  "KEPALA_SALES", "CREW_SALES", "KEPALA_MARKETING", "KEPALA_SOTECH", "SOTECH", "ONPOINT",
  "KEPALA_ONPOINT", "KONTEN", "PKL_SALES",
  "PENGANTARAN",
]));

/** Semua yang bisa LIHAT penyiapan (UNION kedua versi) */
export const PREPARATION_VIEW_ROLES: UserRole[] = Array.from(new Set<UserRole>([
  ...FULL_ACCESS,
  ...PREPARATION_SALES_ROLES,
  ...PREPARATION_PENYEDIA_ROLES,
  ...PREPARATION_PENYEDIA_EXTRA_ROLES,
  ...PKL_PREP_ROLES,
  "KEPALA_ONPOINT", "PENGANTARAN",
]));

/** Role yang MENJADI pengantar (bukan yang assign) */
export const PREPARATION_DELIVERY_PERSON_ROLES: UserRole[] = ["PENGANTARAN", "PKL_PENGANTARAN"];

// ─── Voice / HT Roles ────────────────────────────────────────────────────────
export const DELIVERY_VOICE_ROLES: UserRole[] = [
  ...FULL_ACCESS, ...SALES_ACCESS,
  "PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG",
  "PKL_PENYEDIA_BARANG",
];

export const DELIVERY_VOICE_TARGET_ROLES: UserRole[] = [
  ...FULL_ACCESS, "KEPALA_SALES", "CREW_SALES",
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
    "PKL_SALES",
    // ✅ ADD: semua PKL variants biar konsisten
    "PKL_MARKETING", "PKL_PENYEDIA_BARANG", "PKL_SOTECH", "PKL_ONPOINT",
    "PKL_TEKNISI", "PKL_KONTEN", "PKL_PENGANTARAN",
    "PKL_CUSTOMER_SERVICE", "PKL_PENGELOLA_BARANG",
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
    "PKL_SALES", // UNION (dari versi Ikmal)
  ],
  "/dashboard/transactions": [
    ...FULL_ACCESS, "KEPALA_SALES", "CREW_SALES", "SOTECH", "ACCOUNTING",
    "PENGELOLA_BARANG", "PENGANTARAN", "KEBERSIHAN", "KEPALA_MARKETING",
    "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH",
    ...TRANSACTION_VIEW,
    "PKL_SALES", // UNION (dari versi Ikmal)
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
    ...FULL_ACCESS, "KEPALA_SALES", "CREW_SALES", "SOTECH",
    // PENGANTARAN sengaja TIDAK diikutkan — kurir tidak boleh melakukan pembayaran
    "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH", "PKL",
    "PKL_SALES", // UNION (dari versi Ikmal)
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
    // ✅ ADD: 3 PKL variants baru
    "PKL_PENGANTARAN", "PKL_CUSTOMER_SERVICE", "PKL_PENGELOLA_BARANG",
  ],
  "/api/laptops/minus": [...FULL_ACCESS, "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG", "TEKNISI", "KEPALA_TEKNISI"],
  "/api/dashboard": [...ALL_ROLES],
  "/api/transaction/create": [
    ...FULL_ACCESS, "KEPALA_SALES", "CREW_SALES", "SOTECH",
    // PENGANTARAN sengaja TIDAK diikutkan — kurir tidak boleh membuat transaksi
    "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH",
    "PKL", "PKL_MARKETING", "PKL_SALES", "PKL_PENYEDIA_BARANG",
    "PKL_SOTECH", "PKL_ONPOINT", "PKL_TEKNISI", "PKL_KONTEN",
  ],
  "/api/transaction": [
    ...FULL_ACCESS, "KEPALA_SALES", "ACCOUNTING", "CREW_SALES", "SOTECH",
    "PENGELOLA_BARANG", "PENGANTARAN", "KEBERSIHAN", "KEPALA_MARKETING",
    ...TRANSACTION_VIEW,
    "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH",
    "PKL_SALES", // UNION (dari versi Ikmal)
  ],
  "/api/warranty": [
    ...FULL_ACCESS, "TEKNISI", "KEPALA_TEKNISI", "KEPALA_SALES",
    "CREW_SALES", "SOTECH", "ACCOUNTING", "PENGANTARAN", "KEPALA_MARKETING",
    "PKL_SALES", // UNION (dari versi Ikmal)
  ],
  "/api/reports": [...FULL_ACCESS, "ACCOUNTING"],
  "/api/units/reserve": [
    ...FULL_ACCESS, "KEPALA_SALES", "CREW_SALES", "SOTECH",
    // PENGANTARAN sengaja TIDAK diikutkan — kurir tidak boleh reserve stok
    "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH",
    "PKL", "PKL_MARKETING", "PKL_SALES", "PKL_PENYEDIA_BARANG",
    "PKL_SOTECH", "PKL_ONPOINT", "PKL_TEKNISI", "PKL_KONTEN",
  ],
  "/api/units/hold": [
    ...FULL_ACCESS, "KEPALA_SALES", "CREW_SALES", "SOTECH",
    // PENGANTARAN sengaja TIDAK diikutkan — kurir tidak boleh hold stok
    "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH",
    "PKL", "PKL_MARKETING", "PKL_SALES", "PKL_PENYEDIA_BARANG",
    "PKL_SOTECH", "PKL_ONPOINT", "PKL_TEKNISI", "PKL_KONTEN",
  ],
  "/api/units/confirm-payment": [
    ...FULL_ACCESS,
    "KEPALA_SALES",
    "KEPALA_SOTECH", // ✅ ADD
    "SOTECH",        // ✅ ADD
  ], "/api/users": [...FULL_ACCESS],
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

  // ── Preparation routes ─────────────────────────────────────────────────────
  "/dashboard/preparation": [...PREPARATION_VIEW_ROLES],
  // Antrian: pakai ANTRIAN_VIEW (done roles + sales view-only) — superset dari kedua versi
  "/dashboard/preparation/antrian": [...PREPARATION_ANTRIAN_VIEW_ROLES],
  "/dashboard/preparation/done": [...PREPARATION_DONE_ROLES],
  "/dashboard/preparation/siap-kirim": [...PREPARATION_DISPATCH_ROLES],
  "/dashboard/preparation/pengantaran": [...PREPARATION_DELIVERY_ROLES],
  "/dashboard/preparation/history": [...PREPARATION_VIEW_ROLES],

  "/api/preparation": [...PREPARATION_VIEW_ROLES],
  "/api/preparation/my-deliveries": [...PREPARATION_DELIVERY_ROLES],
  "/api/preparation/dispatch": [...PREPARATION_DISPATCH_ROLES],
  // Route cancel tidak ada di kedua versi; kalau kamu punya endpointnya, pakai:
  // "/api/preparation/cancel": [...PREPARATION_CANCEL_ROLES],

  "/dashboard/missions": [...ALL_ROLES],
  "/dashboard/missions/progress": [...ALL_ROLES],
  "/dashboard/missions/history": [...ALL_ROLES],
  "/api/missions": [...ALL_ROLES],
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
    "PKL_SALES", // UNION (dari versi Ikmal)
  ] as UserRole[],

  CREATE_TRANSACTION: [
    ...FULL_ACCESS, "KEPALA_SALES", "CREW_SALES", "SOTECH",
    // PENGANTARAN sengaja TIDAK diikutkan — kurir tidak boleh membuat transaksi
    "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH",
    "PKL", "PKL_MARKETING", "PKL_SALES", "PKL_PENYEDIA_BARANG",
    "PKL_SOTECH", "PKL_ONPOINT", "PKL_TEKNISI", "PKL_KONTEN",
  ] as UserRole[],

  EDIT_TRANSACTION: [
    ...FULL_ACCESS, "KEPALA_SALES", "CREW_SALES",
    "KEPALA_ONPOINT", "ONPOINT", "KEPALA_SOTECH",
    "PKL_SALES",
  ] as UserRole[],

  RESTORE_TRANSACTION: [...FULL_ACCESS, "KEPALA_SALES"] as UserRole[],

  RESERVE_UNIT: [
    ...FULL_ACCESS,
    "KEPALA_SALES", "CREW_SALES", "SOTECH",
    // PENGANTARAN sengaja TIDAK diikutkan — kurir tidak boleh reserve unit
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
    // ✅ ADD: semua PKL variants boleh lihat laptop
    "PKL_MARKETING", "PKL_SALES", "PKL_PENYEDIA_BARANG",
    "PKL_SOTECH", "PKL_ONPOINT", "PKL_TEKNISI", "PKL_KONTEN",
    "PKL_PENGANTARAN", "PKL_CUSTOMER_SERVICE", "PKL_PENGELOLA_BARANG",
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
    // ✅ ADD: semua PKL boleh VIEW units (view-only, tidak bisa edit/create)
    "PKL", "PKL_MARKETING", "PKL_SALES", "PKL_PENYEDIA_BARANG",
    "PKL_SOTECH", "PKL_ONPOINT", "PKL_TEKNISI", "PKL_KONTEN",
    "PKL_PENGANTARAN", "PKL_CUSTOMER_SERVICE", "PKL_PENGELOLA_BARANG",
    "CUSTOMER_SERVICE",
  ] as UserRole[],
  CREATE_UNITS: [...FULL_ACCESS, "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG", "KEPALA_TEKNISI"] as UserRole[],
  EDIT_UNITS: [...FULL_ACCESS, "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG", "KEPALA_TEKNISI"] as UserRole[],

  VIEW_WARRANTY: [
    ...FULL_ACCESS, "TEKNISI", "KEPALA_TEKNISI", "KEPALA_SALES", "CREW_SALES",
    "SOTECH", "ACCOUNTING", "PENGANTARAN", "KEPALA_MARKETING",
    "PKL_SALES", // UNION (dari versi Ikmal)
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
  /** Sales pilih metode pengiriman setelah penyedia done */
  DISPATCH_PREPARATION: [...PREPARATION_DISPATCH_ROLES] as UserRole[],
  DELIVERY_PREPARATION: [...PREPARATION_DELIVERY_ROLES] as UserRole[],
  /** Batalkan pesanan (dari versi teman) */
  CANCEL_PREPARATION: [...PREPARATION_CANCEL_ROLES] as UserRole[],
  FORCE_COMPLETE_PREPARATION: [...PREPARATION_FORCE_COMPLETE_ROLES] as UserRole[],

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

export const DIVISION_MAP: Record<string, UserRole[]> = {
  KEPALA_TEKNISI: [
    "TEKNISI", "PKL_TEKNISI",
    "CUSTOMER_SERVICE", "PKL_CUSTOMER_SERVICE",     // ← NEW
    "PENGELOLA_BARANG",
  ],
  KEPALA_SALES: ["CREW_SALES", "PENGANTARAN", "PKL_SALES", "PKL_PENGANTARAN"],
  KEPALA_MARKETING: ["KONTEN", "PKL_MARKETING", "PKL_KONTEN"],
  KEPALA_ONPOINT: ["ONPOINT", "PKL_ONPOINT"],
  KEPALA_PENYEDIA_BARANG: ["PENYEDIA_BARANG", "PKL_PENYEDIA_BARANG"],
  KEPALA_SOTECH: ["SOTECH", "PKL_SOTECH"],
  KEPALA_PENGELOLA_BARANG: [
    "PENGELOLA_BARANG", "PKL_PENGELOLA_BARANG",     // ← NEW
    "TEKNISI", "PKL_TEKNISI",
    "CUSTOMER_SERVICE", "PKL_CUSTOMER_SERVICE",     // ← NEW (dual, sesuai request)
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
  "KEPALA_SALES", "CREW_SALES", "SOTECH", "KEPALA_SOTECH",
  "ACCOUNTING", "PENGANTARAN",
  "MARKETING", "KEPALA_MARKETING",
  "PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG", "KONTEN",
  "KEPALA_ONPOINT", "ONPOINT",
  "KEPALA_TEKNISI", "TEKNISI",
  "PKL", "CUSTOMER_SERVICE",
  // ✅ ADD: semua PKL variants
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
/**
 * PKL inherit akses dari role induknya. Contoh:
 *   PKL_SALES  → akses = CREW_SALES
 *   PKL_TEKNISI → akses = TEKNISI
 * PKL polos (tanpa suffix) tetap standalone — tidak inherit apapun.
 */
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

/** Ambil parent role dari PKL variant. Return null kalau bukan PKL bervariant. */
export function getPKLParentRole(role: string): UserRole | null {
  return (PKL_PARENT_ROLE[role as UserRole] ?? null) as UserRole | null;
}

/**
 * Expand userRoles dengan parent role dari tiap PKL variant.
 * Contoh: ["PKL_SALES"] → ["PKL_SALES", "CREW_SALES"]
 * Dipakai untuk permission check biar PKL otomatis inherit akses induknya.
 */
export function expandRolesWithParents(userRoles: string[]): string[] {
  const set = new Set<string>(userRoles);
  for (const r of userRoles) {
    const parent = PKL_PARENT_ROLE[r as UserRole];
    if (parent) set.add(parent);
  }
  return Array.from(set);
}

/** Effective primary role — kalau PKL variant, pakai parent-nya. */
export function getEffectivePrimaryRole(userRoles: string[]): UserRole {
  const primary = (userRoles[0] as UserRole) ?? "CREW_SALES";
  return (PKL_PARENT_ROLE[primary] ?? primary) as UserRole;
}

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
    KEPALA_PENGELOLA_BARANG: "Divisi Pengelola Barang",
    ADMIN: "Pengelola Barang",
  };
  return labels[headRole] ?? headRole.replace(/_/g, " ");
}

// ─── Multi-Role Helpers ───────────────────────────────────────────────────────

/** Ambil primary role (role pertama / role utama). */
export function getPrimaryRole(roles: string[]): UserRole {
  return (roles[0] as UserRole) ?? "CREW_SALES";
}

/** True jika SALAH SATU role user ada di allowed list. */
export function hasAnyRole(
  userRoles: string[],
  allowed: readonly UserRole[] | UserRole[]
): boolean {
  return userRoles.some(r => (allowed as string[]).includes(r));
}

/** Gabungkan semua route permissions dari semua roles (untuk middleware). */
export function getEffectivePermissions(userRoles: string[]): Set<string> {
  const routes = new Set<string>();
  for (const [route, allowedRoles] of Object.entries(ROUTE_PERMISSIONS)) {
    if (userRoles.some(r => (allowedRoles as string[]).includes(r))) {
      routes.add(route);
    }
  }
  return routes;
}

/** Gabungkan menu sidebar dari semua roles (union, dedupe by href). */
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

/** Default redirect terbaik dari semua roles. */
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

/** True jika salah satu role user FULL_ACCESS. */
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