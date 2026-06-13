import {
  isFullAccess,
  isDivisionHead,
  getSubordinateRoles,
} from "@/lib/permissions";

export interface AttendanceScope {
  all: boolean;
  visibleIds: string[];
  manageableIds: string[];
}

export async function getAttendanceScope(
  supabase: any,
  user: { id: string; role: string }
): Promise<AttendanceScope> {
  if (isFullAccess(user.role)) {
    return { all: true, visibleIds: [], manageableIds: [] };
  }

  if (isDivisionHead(user.role)) {
    const subordinateRoles = getSubordinateRoles(user.role);
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
      visibleIds: [...new Set([user.id, ...subIds])],
      manageableIds: subIds,
    };
  }

  // User biasa → hanya dirinya
  return { all: false, visibleIds: [user.id], manageableIds: [] };
}