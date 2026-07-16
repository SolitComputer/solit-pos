import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { getGroupCreationScopeMulti, isRoleAddable } from "@/lib/chatGroups";

export const runtime = "nodejs";

async function getHandler(_req: NextRequest, _ctx: any, user: AuthUser) {
    const userRoles: string[] = (user as any).roles ?? [user.role];
    const scope = getGroupCreationScopeMulti(userRoles);
    if (!scope.canCreate) return NextResponse.json({ success: true, users: [], can_create: false });

    const { data, error } = await supabaseAdmin.from("users").select("id, name, role").neq("id", user.id);
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

    const users = (data ?? []).filter(u => isRoleAddable(scope, u.role));
    return NextResponse.json({ success: true, users, can_create: true });
}

export const GET = withAuth(getHandler);