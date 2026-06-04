export type UserRole =
  | "ADMIN"
  | "KEPALA_SALES"
  | "CREW_SALES"
  | "ACCOUNTING"
  | "PENGELOLA_BARANG"
  | "TEKNISI"
  | "PENGANTARAN"
  | "MARKETING"
  | "KEBERSIHAN"
  | "KEPALA_MARKETING"; 

export const ROLE_DEFAULT_REDIRECT: Record<UserRole, string> = {
  ADMIN:             "/dashboard",
  KEPALA_SALES:      "/dashboard",
  CREW_SALES:        "/dashboard",
  ACCOUNTING:        "/dashboard",
  PENGELOLA_BARANG:  "/dashboard/laptops",
  TEKNISI:           "/dashboard/laptops",
  PENGANTARAN:       "/dashboard",
  MARKETING:         "/dashboard/laptops",
  KEBERSIHAN:        "/dashboard",
  KEPALA_MARKETING:  "/dashboard", 
};

export const ROUTE_PERMISSIONS: Record<string, UserRole[]> = {
  "/dashboard/laptops/create": ["ADMIN", "PENGELOLA_BARANG"],
  "/dashboard/laptops/edit":   ["ADMIN", "PENGELOLA_BARANG"],
  "/dashboard/laptops":        ["ADMIN", "PENGELOLA_BARANG", "TEKNISI", "KEPALA_SALES", "CREW_SALES", "ACCOUNTING", "PENGANTARAN", "MARKETING", "KEBERSIHAN", "KEPALA_MARKETING"],
  "/dashboard/warranty":       ["ADMIN", "TEKNISI", "KEPALA_SALES", "CREW_SALES", "ACCOUNTING", "PENGANTARAN", "KEPALA_MARKETING"],
  "/dashboard/transactions":   ["ADMIN", "KEPALA_SALES", "ACCOUNTING", "CREW_SALES", "PENGELOLA_BARANG", "PENGANTARAN", "KEBERSIHAN", "KEPALA_MARKETING"],
  "/dashboard":                ["ADMIN", "ACCOUNTING", "KEPALA_SALES", "CREW_SALES", "PENGELOLA_BARANG", "PENGANTARAN", "KEBERSIHAN", "KEPALA_MARKETING"],
  "/payment":                  ["ADMIN", "KEPALA_SALES", "CREW_SALES", "PENGANTARAN"],
  "/api/laptops/create":       ["ADMIN", "PENGELOLA_BARANG"],
  "/api/laptops":              ["ADMIN", "PENGELOLA_BARANG", "KEPALA_SALES", "CREW_SALES", "TEKNISI", "ACCOUNTING", "PENGANTARAN", "MARKETING", "KEBERSIHAN", "KEPALA_MARKETING"],
  "/api/dashboard":            ["ADMIN", "ACCOUNTING", "KEPALA_SALES", "CREW_SALES", "PENGELOLA_BARANG", "PENGANTARAN", "KEBERSIHAN", "KEPALA_MARKETING"],
  "/api/transaction/create":   ["ADMIN", "KEPALA_SALES", "CREW_SALES", "PENGANTARAN"],
  "/api/transaction":          ["ADMIN", "KEPALA_SALES", "ACCOUNTING", "CREW_SALES", "PENGELOLA_BARANG", "PENGANTARAN", "KEBERSIHAN", "KEPALA_MARKETING"],
  "/api/warranty":             ["ADMIN", "TEKNISI", "KEPALA_SALES", "CREW_SALES", "ACCOUNTING", "PENGANTARAN", "KEPALA_MARKETING"],
  "/dashboard/reports":        ["ADMIN", "ACCOUNTING"],
  "/api/reports":              ["ADMIN", "ACCOUNTING"],
  "/dashboard/laptops/ready":  ["ADMIN", "PENGELOLA_BARANG", "KEPALA_SALES", "CREW_SALES", "ACCOUNTING", "PENGANTARAN", "MARKETING", "KEBERSIHAN", "KEPALA_MARKETING"],
  "/dashboard/laptops/minus":  ["ADMIN", "PENGELOLA_BARANG", "TEKNISI"],
  "/api/units/reserve":        ["ADMIN", "KEPALA_SALES", "CREW_SALES", "PENGANTARAN"],
  "/api/units/hold":           ["ADMIN", "KEPALA_SALES", "CREW_SALES", "PENGANTARAN"],
  "/api/units/confirm-payment":["ADMIN", "KEPALA_SALES"],
  "/api/laptops/minus":        ["ADMIN", "PENGELOLA_BARANG", "TEKNISI"],
  "/dashboard/users":          ["ADMIN"],
  "/api/users":                ["ADMIN"],
  "/dashboard/attendance": ["ADMIN", "KEPALA_SALES", "CREW_SALES", "ACCOUNTING", "PENGELOLA_BARANG", "TEKNISI", "PENGANTARAN", "MARKETING", "KEBERSIHAN", "KEPALA_MARKETING"],
};

export const PERMISSIONS = {
  VIEW_DASHBOARD:      ["ADMIN", "ACCOUNTING", "KEPALA_SALES", "CREW_SALES", "PENGELOLA_BARANG", "PENGANTARAN", "KEBERSIHAN", "KEPALA_MARKETING"] as UserRole[],

  VIEW_FINANCIALS:     ["ADMIN", "ACCOUNTING"] as UserRole[],
  VIEW_REPORTS:        ["ADMIN", "ACCOUNTING"] as UserRole[],

  VIEW_TRANSACTIONS:   ["ADMIN", "KEPALA_SALES", "ACCOUNTING", "CREW_SALES", "PENGELOLA_BARANG", "PENGANTARAN", "KEBERSIHAN", "KEPALA_MARKETING"] as UserRole[],
  CREATE_TRANSACTION:  ["ADMIN", "KEPALA_SALES", "CREW_SALES", "PENGANTARAN"] as UserRole[],
  EDIT_TRANSACTION:    ["ADMIN", "KEPALA_SALES"] as UserRole[],
  RESTORE_TRANSACTION: ["ADMIN", "KEPALA_SALES"] as UserRole[],

  VIEW_LAPTOPS:        ["ADMIN", "PENGELOLA_BARANG", "TEKNISI", "KEPALA_SALES", "CREW_SALES", "ACCOUNTING", "PENGANTARAN", "MARKETING", "KEBERSIHAN", "KEPALA_MARKETING"] as UserRole[],
  CREATE_LAPTOP:       ["ADMIN", "PENGELOLA_BARANG"] as UserRole[],
  EDIT_LAPTOP:         ["ADMIN", "PENGELOLA_BARANG"] as UserRole[],

  VIEW_BARCODE:        ["ADMIN", "KEPALA_SALES", "CREW_SALES", "PENGELOLA_BARANG", "TEKNISI", "ACCOUNTING", "PENGANTARAN", "MARKETING", "KEPALA_MARKETING"] as UserRole[],
  VIEW_UNITS:          ["ADMIN", "PENGELOLA_BARANG", "TEKNISI", "KEPALA_SALES", "CREW_SALES", "ACCOUNTING", "PENGANTARAN", "MARKETING", "KEPALA_MARKETING"] as UserRole[],
  CREATE_UNITS:        ["ADMIN", "PENGELOLA_BARANG"] as UserRole[],
  EDIT_UNITS:          ["ADMIN", "PENGELOLA_BARANG"] as UserRole[],

  VIEW_WARRANTY:       ["ADMIN", "TEKNISI", "KEPALA_SALES", "CREW_SALES", "ACCOUNTING", "PENGANTARAN", "KEPALA_MARKETING"] as UserRole[],
  EDIT_WARRANTY:       ["ADMIN", "TEKNISI"] as UserRole[],

  VIEW_READY_LAPTOPS:  ["ADMIN", "PENGELOLA_BARANG", "KEPALA_SALES", "CREW_SALES", "ACCOUNTING", "PENGANTARAN", "MARKETING", "KEBERSIHAN", "KEPALA_MARKETING"] as UserRole[],
  VIEW_MINUS_LAPTOPS:  ["ADMIN", "PENGELOLA_BARANG", "TEKNISI"] as UserRole[],
  EDIT_MINUS_LAPTOPS:  ["ADMIN", "PENGELOLA_BARANG", "TEKNISI"] as UserRole[],
} as const;

export function hasPermission(
  role: UserRole,
  allowed: readonly UserRole[] | UserRole[]
): boolean {
  return (allowed as UserRole[]).includes(role);
}