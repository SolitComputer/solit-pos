import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import {
  PREPARATION_DISPATCH_ROLES,
  PREPARATION_DONE_ROLES,
  PREPARATION_DELIVERY_PERSON_ROLES,
} from "@/lib/permissions";

import { supabaseAdmin as admin } from "@/services/supabaseAdmin";

// Yang boleh ambil daftar pengantar = dispatch (Sales) + done (Penyedia) + Admin
const ASSIGN_DRIVER_ROLES = [
  ...new Set([...PREPARATION_DISPATCH_ROLES, ...PREPARATION_DONE_ROLES]),
];

async function getHandler(_req: NextRequest, _ctx: any, _user: AuthUser) {
  try {
    const { data, error } = await admin
      .from("users")
      .select("id, name, role, roles, is_active")
      .or("role.in.(PENGANTARAN,PKL_PENGANTARAN),roles.ov.{PENGANTARAN,PKL_PENGANTARAN}")
      .order("name", { ascending: true });

    if (error) throw error;

    const mapped = (data ?? [])
      .filter((u: any) => u.is_active !== false)
      .map((u: any) => {
        const userRoles: string[] = Array.isArray(u.roles) && u.roles.length > 0 ? u.roles : [u.role];
        const deliveryRole = userRoles.find((r: string) => PREPARATION_DELIVERY_PERSON_ROLES.includes(r as any)) || u.role;
        return {
          id: u.id,
          name: u.name,
          role: deliveryRole,
          roles: userRoles,
        };
      });

    return NextResponse.json({ success: true, data: mapped });
  } catch (err) {
    console.error("[GET /api/preparation/delivery-users]", err);
    return NextResponse.json({ success: false, message: "Gagal mengambil daftar pengantar" }, { status: 500 });
  }
}

export const GET = withAuth(getHandler, ASSIGN_DRIVER_ROLES);