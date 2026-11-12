import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { VEHICLE_APPROVAL_ROLES } from "@/lib/permissions";

// Service-role client (dipakai di API routes, bypass RLS) — dibuat sekali di module top
export const supabaseVehicles: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// "Admin" untuk fitur ini = HANYA role ADMIN literal (CRUD master + approve/reject)
export const VEHICLE_ADMIN_ROLES: string[] = ["ADMIN"];

// === Multi-cabang (Model A) ===
export type VehicleBranch = "UTAMA" | "JOGJA";

/**
 * Role yang HANYA boleh lihat kendaraan Cabang Jogja.
 * Isi sesuai role karyawan Jogja di sistem kamu.
 * Contoh: ["SALES_JOGJA", "KEPALA_JOGJA"] — kalau role-nya ada.
 * Kalau kosong, tidak ada pembatasan Jogja-only (semua role lihat semua branch).
 */
export const VEHICLE_JOGJA_ONLY_ROLES: string[] = [
  "SOLIT_JOGJA",
];

/** Role yang boleh pilih/filter branch (Admin + Programmer). */
export const VEHICLE_BRANCH_FILTER_ROLES: string[] = [
  "ADMIN",
  "PROGRAMMER",
  "ASISTEN_CEO",
];

/**
 * Tentukan scope branch user untuk MELIHAT kendaraan.
 * - Role Jogja → ["JOGJA"] (eksklusif, dikunci backend)
 * - Selain Jogja → null (bisa lihat semua branch)
 */
export function getVehicleBranchScope(roles: string[]): VehicleBranch[] | null {
  const isJogjaOnly = roles.some((r) => VEHICLE_JOGJA_ONLY_ROLES.includes(r));
  return isJogjaOnly ? ["JOGJA"] : null;
}

/**
 * User ID khusus yang boleh ACC pengajuan kendaraan Cabang JOGJA.
 * Pakai ID (bukan role) karena approver cabang biasanya 1 orang specific
 * (Kepala Cabang), bukan semua karyawan cabang.
 *
 * Contoh: Fadriansyah = a8e2697f-24a0-4a76-9002-141750b5eefd
 */
export const VEHICLE_JOGJA_APPROVER_IDS: string[] = [
  "a8e2697f-24a0-4a76-9002-141750b5eefd", // Fadriansyah
];

/**
 * Tentukan scope branch APPROVAL — pengajuan branch mana yang boleh di-ACC user.
 * - KEPALA_SALES (by role) → ["UTAMA"]
 * - Fadriansyah (by ID)    → ["JOGJA"]
 * - Lain                    → []
 *
 * Dipakai di /api/vehicles/borrow (queue filter) &
 * /api/vehicles/borrow/[id] (validasi APPROVE/REJECT).
 */
export function getApproverBranchScope(userId: string, roles: string[]): VehicleBranch[] {
  const scope = new Set<VehicleBranch>();
  if (roles.includes("KEPALA_SALES")) scope.add("UTAMA");
  if (VEHICLE_JOGJA_APPROVER_IDS.includes(userId)) scope.add("JOGJA");
  return Array.from(scope);
}

export type Requester = {
  id: string;
  name: string;
  roles: string[];
  isAdmin: boolean;
  canApprove: boolean; // boleh ACC/Tolak pengajuan peminjaman (khusus Kepala Sales)
  branchScope: VehicleBranch[] | null; // null = akses semua branch, array = eksklusif
  canFilterBranch: boolean;            // boleh pakai UI filter branch (Admin dkk)
};

// Ambil identitas pemanggil. Prefer header x-user-* yang di-set middleware,
// fallback ke getCurrentUser() kalau header gak ada. Return null kalau belum login.
export async function getRequester(request: NextRequest): Promise<Requester | null> {
  const rolesHeader = request.headers.get("x-user-roles") || "";
  const singleRole = request.headers.get("x-user-role");
  let roles = rolesHeader
    ? rolesHeader.split(",").filter(Boolean)
    : singleRole
      ? [singleRole]
      : [];
  let id = request.headers.get("x-user-id") || "";
  let name = decodeURIComponent(request.headers.get("x-user-name") || "");
  const headerId = id; // FIX debug — simpan buat log kalau fallback dipake

  if (roles.length === 0 || !id) {
    const user = await getCurrentUser();
    if (!user) return null;
    if (roles.length === 0) roles = user.roles?.length ? user.roles : [user.role];
    if (!id) id = user.id;
    if (!name) name = user.name;

    // FIX debug — kalau fallback ke session dipake, itu wajar;
    // tapi kalau BEDA sama header, ada ketidakcocokan yang perlu di-audit.
    if (process.env.NODE_ENV !== "production" && headerId && headerId !== user.id) {
      console.warn("[getRequester] Header id != session id!", {
        headerId,
        sessionId: user.id,
        sessionName: user.name,
      });
    }
  }
  if (!id) return null;

  const isAdmin = roles.some((r) => VEHICLE_ADMIN_ROLES.includes(r));
  // canApprove = bisa ACC pengajuan apapun (by role KEPALA_SALES ATAU by ID approver Jogja)
  const canApproveByRole = roles.some((r) => (VEHICLE_APPROVAL_ROLES as readonly string[]).includes(r));
  const canApproveById = VEHICLE_JOGJA_APPROVER_IDS.includes(id);
  const canApprove = canApproveByRole || canApproveById;
  const branchScope = getVehicleBranchScope(roles);
  const canFilterBranch = roles.some((r) => VEHICLE_BRANCH_FILTER_ROLES.includes(r));
  return { id, name, roles, isAdmin, canApprove, branchScope, canFilterBranch };
}

export type VehicleRow = {
  id: string;
  name: string;
  type: "MOTOR" | "MOBIL";
  status: "TERSEDIA" | "DIPAKAI" | "MAINTENANCE";
  battery_level: string | null;
  fuel_level: string | null;
  branch: VehicleBranch; // UTAMA / JOGJA
};

export type UserLite = { id: string; name: string; role: string };

export type BorrowRequestRow = {
  id: string;
  vehicle_id: string;
  user_id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED";
  requested_at: string;
  approved_by: string | null;
  approved_at: string | null;
  rejection_note: string | null;
  actual_start: string | null;
  actual_end: string | null;
  return_fuel_level: string | null;
  return_condition: "BAIK" | "LECET" | "RUSAK" | null;
  duration_minutes: number | null;
  // hasil enrich:
  vehicle?: VehicleRow | null;
  borrower?: UserLite | null;
  approver?: UserLite | null;
};

// Enrich manual (pola yang sama dengan fitur Lembur) — dua query lookup lalu map.
// Menghindari ambiguitas 2 FK ke tabel users saat pakai embed otomatis.
export async function enrichRequests(rows: BorrowRequestRow[]): Promise<BorrowRequestRow[]> {
  if (!rows.length) return rows;

  const userIds = [
    ...new Set(
      [
        ...rows.map((r) => r.user_id),
        ...rows.filter((r) => r.approved_by).map((r) => r.approved_by as string),
      ].filter(Boolean)
    ),
  ];
  const vehicleIds = [...new Set(rows.map((r) => r.vehicle_id).filter(Boolean))];

  const [usersRes, vehiclesRes] = await Promise.all([
    userIds.length
      ? supabaseVehicles.from("users").select("id, name, role").in("id", userIds)
      : Promise.resolve({ data: [] as UserLite[] }),
    vehicleIds.length
      ? supabaseVehicles
        .from("vehicles")
        .select("id, name, type, status, battery_level, fuel_level, branch")
        .in("id", vehicleIds)
      : Promise.resolve({ data: [] as VehicleRow[] }),
  ]);

  const usersMap: Record<string, UserLite> = {};
  (usersRes.data ?? []).forEach((u: any) => {
    usersMap[u.id] = { id: u.id, name: u.name, role: u.role };
  });
  const vehiclesMap: Record<string, VehicleRow> = {};
  (vehiclesRes.data ?? []).forEach((v: any) => {
    vehiclesMap[v.id] = v;
  });

  return rows.map((r) => ({
    ...r,
    vehicle: vehiclesMap[r.vehicle_id] ?? null,
    borrower: usersMap[r.user_id] ?? null,
    approver: r.approved_by ? usersMap[r.approved_by] ?? null : null,
  }));
}
