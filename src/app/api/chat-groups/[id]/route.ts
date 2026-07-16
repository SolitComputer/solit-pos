import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { getGroupCreationScopeMulti, isRoleAddable, getGroupRole } from "@/lib/chatGroups";

export const runtime = "nodejs";

async function getHandler(_req: NextRequest, ctx: any, user: AuthUser) {
    const { id: groupId } = await ctx.params;
    const myRole = await getGroupRole(groupId, user.id);
    if (!myRole) return NextResponse.json({ success: false, message: "Kamu bukan anggota grup ini" }, { status: 403 });

    const { data: group } = await supabaseAdmin
        .from("chat_groups").select("id, name, description, avatar_url, created_by, created_at, is_default")
        .eq("id", groupId).maybeSingle();
    if (!group) return NextResponse.json({ success: false, message: "Grup tidak ditemukan" }, { status: 404 });

    const { data: members, error: memberErr } = await supabaseAdmin
        .from("chat_group_members")
        .select("user_id, role, joined_at, users!chat_group_members_user_id_fkey(id, name, role)")
        .eq("group_id", groupId);
    if (memberErr) return NextResponse.json({ success: false, message: memberErr.message }, { status: 500 });

    return NextResponse.json({
        success: true,
        group: { ...group, my_role: myRole },
        members: (members ?? []).map((m: any) => ({
            id: m.users.id, name: m.users.name, role: m.users.role,
            group_role: m.role, joined_at: m.joined_at,
        })),
    });
}

async function patchHandler(req: NextRequest, ctx: any, user: AuthUser) {
    const { id: groupId } = await ctx.params;
    let body: any;
    try { body = await req.json(); }
    catch { return NextResponse.json({ success: false, message: "Body tidak valid" }, { status: 400 }); }

    const { data: group } = await supabaseAdmin
        .from("chat_groups").select("id, is_default, created_by").eq("id", groupId).maybeSingle();
    if (!group) return NextResponse.json({ success: false, message: "Grup tidak ditemukan" }, { status: 404 });
    if (group.is_default) return NextResponse.json({ success: false, message: "Grup All Team tidak bisa diubah" }, { status: 400 });

    const myRole = await getGroupRole(groupId, user.id);
    if (!myRole) return NextResponse.json({ success: false, message: "Kamu bukan anggota grup ini" }, { status: 403 });

    const userRoles: string[] = (user as any).roles ?? [user.role];
    const scope = getGroupCreationScopeMulti(userRoles);
    const isOwner = myRole === "owner" || group.created_by === user.id;
    const canManage = isOwner || scope.addableRoles === "ALL";
    if (!canManage) return NextResponse.json({ success: false, message: "Hanya pembuat grup yang bisa mengubah grup ini" }, { status: 403 });

    const action = body.action as "rename" | "add_members" | "remove_member";

    if (action === "rename") {
        const name = (body.name ?? "").trim();
        if (!name) return NextResponse.json({ success: false, message: "Nama grup wajib diisi" }, { status: 400 });
        const { error } = await supabaseAdmin.from("chat_groups")
            .update({ name, updated_at: new Date().toISOString() }).eq("id", groupId);
        if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
    }

    if (action === "add_members") {
        const memberIds: string[] = Array.isArray(body.member_ids) ? [...new Set(body.member_ids)] as string[] : [];
        if (memberIds.length === 0) return NextResponse.json({ success: false, message: "Pilih minimal 1 anggota" }, { status: 400 });

        const { data: targetUsers } = await supabaseAdmin.from("users").select("id, name, role").in("id", memberIds);
        if (!targetUsers || targetUsers.length !== memberIds.length) {
            return NextResponse.json({ success: false, message: "Beberapa anggota tidak ditemukan" }, { status: 404 });
        }
        if (scope.addableRoles !== "ALL") {
            const invalid = targetUsers.filter(u => !isRoleAddable(scope, u.role));
            if (invalid.length > 0) {
                return NextResponse.json({ success: false, message: `Tidak diizinkan menambahkan: ${invalid.map(u => u.name).join(", ")}` }, { status: 403 });
            }
        }
        const rows = memberIds.map(id => ({ group_id: groupId, user_id: id, role: "member", added_by: user.id }));
        const { error } = await supabaseAdmin.from("chat_group_members")
            .upsert(rows, { onConflict: "group_id,user_id", ignoreDuplicates: true });
        if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
    }

    if (action === "remove_member") {
        const targetId = body.user_id as string;
        if (!targetId) return NextResponse.json({ success: false, message: "user_id wajib" }, { status: 400 });
        if (targetId === group.created_by) {
            return NextResponse.json({ success: false, message: "Tidak bisa menghapus pembuat grup" }, { status: 400 });
        }
        const { error } = await supabaseAdmin.from("chat_group_members")
            .delete().eq("group_id", groupId).eq("user_id", targetId);
        if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, message: "Action tidak dikenal" }, { status: 400 });
}

async function deleteHandler(_req: NextRequest, ctx: any, user: AuthUser) {
    const { id: groupId } = await ctx.params;
    const { data: group } = await supabaseAdmin
        .from("chat_groups").select("id, is_default, created_by").eq("id", groupId).maybeSingle();
    if (!group) return NextResponse.json({ success: false, message: "Grup tidak ditemukan" }, { status: 404 });
    if (group.is_default) return NextResponse.json({ success: false, message: "Grup All Team tidak bisa dihapus" }, { status: 400 });

    const myRole = await getGroupRole(groupId, user.id);
    if (!myRole) return NextResponse.json({ success: false, message: "Kamu bukan anggota grup ini" }, { status: 403 });

    if (group.created_by === user.id) {
        const { error } = await supabaseAdmin.from("chat_groups").delete().eq("id", groupId);
        if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        return NextResponse.json({ success: true, dissolved: true });
    }

    const { error } = await supabaseAdmin.from("chat_group_members")
        .delete().eq("group_id", groupId).eq("user_id", user.id);
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    return NextResponse.json({ success: true, dissolved: false });
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);