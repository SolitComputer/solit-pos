export type UserRole =
  | "ADMIN"
  | "KEPALA_SALES"
  | "CREW_SALES"
  | "ACCOUNTING"
  | "PENGELOLA_BARANG"
  | "TEKNISI";

export const ROLE_DEFAULT_REDIRECT: Record<UserRole, string> = {
  ADMIN:            "/dashboard",
  KEPALA_SALES:     "/dashboard",
  CREW_SALES:       "/dashboard",
  ACCOUNTING:       "/dashboard",
  PENGELOLA_BARANG: "/dashboard/laptops",
  TEKNISI:          "/dashboard/laptops",
};

export const ROUTE_PERMISSIONS: Record<string, UserRole[]> = {
  "/dashboard/laptops/create": ["ADMIN", "PENGELOLA_BARANG"],
  "/dashboard/laptops/edit":   ["ADMIN", "PENGELOLA_BARANG"],
  "/dashboard/laptops":        ["ADMIN", "PENGELOLA_BARANG", "TEKNISI", "KEPALA_SALES", "CREW_SALES", "ACCOUNTING"],
  "/dashboard/warranty":       ["ADMIN", "TEKNISI", "KEPALA_SALES", "CREW_SALES", "ACCOUNTING"],
  "/dashboard/transactions":   ["ADMIN", "KEPALA_SALES", "ACCOUNTING", "CREW_SALES", "PENGELOLA_BARANG"],
  "/dashboard":                ["ADMIN", "ACCOUNTING", "KEPALA_SALES", "CREW_SALES", "PENGELOLA_BARANG"],
  "/payment":                  ["ADMIN", "KEPALA_SALES", "CREW_SALES"],
  "/api/laptops/create":       ["ADMIN", "PENGELOLA_BARANG"],
  "/api/laptops":              ["ADMIN", "PENGELOLA_BARANG", "KEPALA_SALES", "CREW_SALES", "TEKNISI", "ACCOUNTING"],
  "/api/dashboard":            ["ADMIN", "ACCOUNTING", "KEPALA_SALES", "CREW_SALES", "PENGELOLA_BARANG"],
  "/api/transaction/create":   ["ADMIN", "KEPALA_SALES", "CREW_SALES"],
  "/api/transaction":          ["ADMIN", "KEPALA_SALES", "ACCOUNTING", "CREW_SALES", "PENGELOLA_BARANG"],
  "/api/warranty":             ["ADMIN", "TEKNISI", "KEPALA_SALES", "CREW_SALES", "ACCOUNTING"],
};

export const PERMISSIONS = {
  VIEW_DASHBOARD:      ["ADMIN", "ACCOUNTING", "KEPALA_SALES", "CREW_SALES", "PENGELOLA_BARANG"] as UserRole[],

  VIEW_FINANCIALS:     ["ADMIN", "ACCOUNTING"] as UserRole[],

  VIEW_TRANSACTIONS:   ["ADMIN", "KEPALA_SALES", "ACCOUNTING", "CREW_SALES", "PENGELOLA_BARANG"] as UserRole[],
  CREATE_TRANSACTION:  ["ADMIN", "KEPALA_SALES", "CREW_SALES"]                                   as UserRole[],
  EDIT_TRANSACTION:    ["ADMIN", "KEPALA_SALES"]                                                  as UserRole[],
  RESTORE_TRANSACTION: ["ADMIN", "KEPALA_SALES"]                                                  as UserRole[],

  VIEW_LAPTOPS:        ["ADMIN", "PENGELOLA_BARANG", "TEKNISI", "KEPALA_SALES", "CREW_SALES", "ACCOUNTING"] as UserRole[],
  CREATE_LAPTOP:       ["ADMIN", "PENGELOLA_BARANG"]                                                        as UserRole[],
  EDIT_LAPTOP:         ["ADMIN", "PENGELOLA_BARANG"]                                                        as UserRole[],

  VIEW_BARCODE:        ["ADMIN", "KEPALA_SALES", "CREW_SALES", "PENGELOLA_BARANG", "TEKNISI", "ACCOUNTING"] as UserRole[],
  VIEW_UNITS:          ["ADMIN", "PENGELOLA_BARANG", "TEKNISI", "KEPALA_SALES", "CREW_SALES", "ACCOUNTING"] as UserRole[],
  CREATE_UNITS:        ["ADMIN", "PENGELOLA_BARANG"]                                                        as UserRole[],
  EDIT_UNITS:          ["ADMIN", "PENGELOLA_BARANG"]                                                        as UserRole[],

  VIEW_WARRANTY:       ["ADMIN", "TEKNISI", "KEPALA_SALES", "CREW_SALES", "ACCOUNTING"] as UserRole[],
  EDIT_WARRANTY:       ["ADMIN", "TEKNISI"]                                              as UserRole[],
} as const;

export function hasPermission(
  role: UserRole,
  allowed: readonly UserRole[] | UserRole[]
): boolean {
  return (allowed as UserRole[]).includes(role);
}