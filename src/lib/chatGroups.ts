import { supabaseAdmin } from "@/services/supabaseAdmin";
import { UserRole, isFullAccess, isDivisionHead, getSubordinateRoles } from "@/lib/permissions";

export { DEFAULT_GROUP_ID } from "@/lib/chatGroupsShared";
import { DEFAULT_GROUP_ID } from "@/lib/chatGroupsShared";

export interface GroupCreationScope {
    canCreate: boolean;
    addableRoles: UserRole[] | "ALL";
}

// Union subordinate dari semua role yang dipegang user (support multi-role)
export function getGroupCreationScopeMulti(userRoles: string[]): GroupCreationScope {
    if (userRoles.some(r => isFullAccess(r))) return { canCreate: true, addableRoles: "ALL" };
    const subs = new Set<UserRole>();
    for (const r of userRoles) {
        if (isDivisionHead(r)) getSubordinateRoles(r).forEach(s => subs.add(s));
    }
    return { canCreate: subs.size > 0, addableRoles: Array.from(subs) };
}

export function isRoleAddable(scope: GroupCreationScope, targetRole: string): boolean {
    if (scope.addableRoles === "ALL") return true;
    return (scope.addableRoles as string[]).includes(targetRole);
}

export async function isGroupMember(groupId: string, userId: string): Promise<boolean> {
    if (groupId === DEFAULT_GROUP_ID) return true; // grup default terbuka untuk semua non-PKL
    const { data } = await supabaseAdmin
        .from("chat_group_members")
        .select("user_id")
        .eq("group_id", groupId)
        .eq("user_id", userId)
        .maybeSingle();
    return !!data;
}

export async function getGroupRole(groupId: string, userId: string): Promise<"owner" | "member" | null> {
    const { data } = await supabaseAdmin
        .from("chat_group_members")
        .select("role")
        .eq("group_id", groupId)
        .eq("user_id", userId)
        .maybeSingle();
    return (data?.role as "owner" | "member") ?? null;
}