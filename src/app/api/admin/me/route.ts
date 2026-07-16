// src/app/api/me/permissions/route.ts
//
// Dipakai oleh komponen client (mis. halaman Data Laptop) untuk tahu:
// "role saya boleh create/edit/delete di halaman ini atau cuma view?"
// Hanya relevan untuk dynamic role — untuk role lama, tombol CRUD tetap
// dikontrol seperti sekarang (PERMISSIONS.* di permissions.ts).
import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { expandRolesWithParents } from "@/lib/permissions";
import { expandDynamicParents, getPermissionMapForRoles } from "@/lib/dynamicPermissions";

async function getHandler(_req: NextRequest, _ctx: any, user: AuthUser) {
  const userRoles = user.roles ?? [user.role];
  const effectiveStatic = expandRolesWithParents(userRoles);
  const effectiveAll = await expandDynamicParents(effectiveStatic);
  const permissions = await getPermissionMapForRoles(effectiveAll);
  return NextResponse.json({ success: true, permissions });
}

export const GET = withAuth(getHandler);