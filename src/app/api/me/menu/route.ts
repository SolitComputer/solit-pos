// src/app/api/me/menu/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { expandRolesWithParents } from "@/lib/permissions";
import { expandDynamicParents, getDynamicMenuGroups } from "@/lib/dynamicPermissions";

async function getHandler(_req: NextRequest, _ctx: any, user: AuthUser) {
  const userRoles = user.roles ?? [user.role];
  const effective = await expandDynamicParents(expandRolesWithParents(userRoles));
  const groups = await getDynamicMenuGroups(effective);
  return NextResponse.json({ success: true, groups });
}

export const GET = withAuth(getHandler);