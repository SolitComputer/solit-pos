export type UserRole =
  | "ADMIN"
  | "KEPALA_SALES"
  | "CREW_SALES"
  | "ACCOUNTING"
  | "PENGELOLA_BARANG"
  | "TEKNISI";                        

export const ROLE_DEFAULT_REDIRECT: Record<UserRole, string> = {
  ADMIN:             "/dashboard",
  KEPALA_SALES:      "/payment/create",
  CREW_SALES:        "/payment/create",
  ACCOUNTING:        "/dashboard",
  PENGELOLA_BARANG:  "/dashboard/laptops",
  TEKNISI:           "/dashboard/laptops",  
};

export const ROUTE_PERMISSIONS: Record<string, UserRole[]> = {
  "/dashboard/laptops/create":   ["ADMIN", "PENGELOLA_BARANG"],
  "/dashboard/laptops/edit":     ["ADMIN", "PENGELOLA_BARANG"],
  "/dashboard/laptops":          ["ADMIN", "PENGELOLA_BARANG", "TEKNISI"],   
  "/dashboard/warranty":         ["ADMIN", "TEKNISI"],                       
  "/dashboard/transactions":     ["ADMIN", "KEPALA_SALES", "ACCOUNTING"],
  "/dashboard":                  ["ADMIN", "ACCOUNTING"],
  "/payment":                    ["ADMIN", "KEPALA_SALES", "CREW_SALES"],
  "/api/laptops/create":         ["ADMIN", "PENGELOLA_BARANG"],
  "/api/laptops":                ["ADMIN", "PENGELOLA_BARANG", "KEPALA_SALES", "CREW_SALES", "TEKNISI"], 
  "/api/dashboard":              ["ADMIN", "ACCOUNTING"],
  "/api/transaction/create":     ["ADMIN", "KEPALA_SALES", "CREW_SALES"],
  "/api/transaction":            ["ADMIN", "KEPALA_SALES", "ACCOUNTING"],
  "/api/warranty":               ["ADMIN", "TEKNISI"],                     
};

export const PERMISSIONS = {
  VIEW_DASHBOARD:     ["ADMIN", "ACCOUNTING"]                                               as UserRole[],
  VIEW_BARCODE:       ["ADMIN", "KEPALA_SALES", "CREW_SALES", "PENGELOLA_BARANG", "TEKNISI"] as UserRole[], 
  CREATE_TRANSACTION: ["ADMIN", "KEPALA_SALES", "CREW_SALES"]                               as UserRole[],
  EDIT_TRANSACTION:   ["ADMIN", "KEPALA_SALES"]                                             as UserRole[],
  CREATE_LAPTOP:      ["ADMIN", "PENGELOLA_BARANG"]                                         as UserRole[],
  EDIT_LAPTOP:        ["ADMIN", "PENGELOLA_BARANG"]                                         as UserRole[],
  VIEW_UNITS:         ["ADMIN", "KEPALA_SALES", "CREW_SALES", "PENGELOLA_BARANG", "TEKNISI"] as UserRole[], 
  VIEW_WARRANTY:      ["ADMIN", "TEKNISI"]                                                  as UserRole[], 
  EDIT_WARRANTY:      ["ADMIN", "TEKNISI"]                                                  as UserRole[], 
};

export function hasPermission(role: UserRole, allowed: UserRole[]): boolean {
  return allowed.includes(role);
}