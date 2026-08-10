import {
  isFullAccess,
  isDivisionHead,
  getSubordinateRoles,
} from "@/lib/permissions";

export interface AttendanceScope {
  all: boolean;
  pklOnly: boolean;        // ← true jika user adalah PKL (lihat sesama PKL)
  visibleIds: string[];
  manageableIds: string[];
}

// Helper: cek apakah role adalah PKL (termasuk PKL-Marketing, PKL-Sales, dll)
export function isPKLRole(role: string): boolean {
  return role === "PKL" || role.startsWith("PKL_") || role.startsWith("PKL-");
}

export async function getAttendanceScope(
  supabase: any,
  user: { id: string; role: string; roles?: string[] }
): Promise<AttendanceScope> {
  // ✅ FIX: dulu cuma baca user.role (single/primary role) — user dengan
  // banyak role (mis. Kepala Pengelola Barang + Kepala Teknisi + Kepala
  // Penyedia Barang) cuma dicek dari role pertamanya, jadi bawahan dari
  // role ke-2/ke-3 gak pernah kehitung. Sekarang gabungkan semua role dulu.
  const userRoles: string[] = Array.isArray(user.roles) && user.roles.length > 0
    ? user.roles
    : [user.role];

  // ─── FULL ACCESS (ADMIN, PROGRAMMER, ASISTEN_CEO) ─────────────────────────
  // Mereka bisa lihat SEMUA user termasuk PKL — filter PKL/non-PKL dilakukan di UI
  if (userRoles.some(r => isFullAccess(r))) {
    return { all: true, pklOnly: false, visibleIds: [], manageableIds: [] };
  }

  // ─── PKL (semua varian): hanya bisa lihat sesama PKL ─────────────────────
  if (userRoles.some(r => isPKLRole(r))) {
    const { data, error } = await supabase
      .from("users")
      .select("id")
      .or("role.eq.PKL,role.like.PKL_%,role.like.PKL-%")
      .eq("is_active", true);

    if (error) {
      console.error("[getAttendanceScope] gagal ambil sesama PKL:", error.message);
      // Fallback: dirinya saja
      return { all: false, pklOnly: true, visibleIds: [user.id], manageableIds: [] };
    }

    const pklIds = (data ?? []).map((u: any) => u.id);
    // Pastikan user sendiri selalu masuk
    const finalIds = [...new Set([user.id, ...pklIds])];

    return {
      all: false,
      pklOnly: true,
      visibleIds: finalIds,
      manageableIds: [], // PKL tidak bisa manage siapapun
    };
  }

  // ─── KEPALA DIVISI: dirinya + bawahannya ─────────────────────────────────
  // ✅ FIX: gabungkan bawahan dari SEMUA role kepala yang dimiliki user,
  // bukan cuma dari role pertama — biar kombinasi multi-role (mis. Kepala
  // Pengelola Barang + Kepala Teknisi) dapat bawahan dari kedua divisi.
  if (userRoles.some(r => isDivisionHead(r))) {
    const subordinateRoles = Array.from(
      new Set(userRoles.flatMap(r => getSubordinateRoles(r)))
    );
    let subIds: string[] = [];

    if (subordinateRoles.length > 0) {
      const { data, error } = await supabase
        .from("users")
        .select("id")
        .in("role", subordinateRoles)
        .eq("is_active", true);

      if (error) {
        console.error("[getAttendanceScope] gagal ambil bawahan:", error.message);
      } else {
        subIds = (data ?? []).map((u: any) => u.id);
      }
    }

    return {
      all: false,
      pklOnly: false,
      visibleIds: [...new Set([user.id, ...subIds])],
      manageableIds: subIds,
    };
  }

  // ─── USER BIASA: hanya dirinya saja ─────────────────────────────────────
  return { all: false, pklOnly: false, visibleIds: [user.id], manageableIds: [] };
}