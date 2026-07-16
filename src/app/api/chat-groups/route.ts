import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { getGroupCreationScopeMulti, isRoleAddable } from "@/lib/chatGroups";

export const runtime = "nodejs";

async function getHandler(_req: NextRequest, _ctx: any, user: AuthUser) {
    const { data: memberships, error } = await supabaseAdmin
        .from("chat_group_members")
        .select("group_id, role, chat_groups!inner(id, name, description, avatar_url, created_by, created_at, is_default)")
        .eq("user_id", user.id);

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

    const groups = (memberships ?? [])
        .map((m: any) => ({ ...m.chat_groups, my_role: m.role }))
        .filter((g: any) => !g.is_default)
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return NextResponse.json({ success: true, groups });
}

async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
    let body: any;
    try { body = await req.json(); }
    catch { return NextResponse.json({ success: false, message: "Body tidak valid" }, { status: 400 }); }

    const name: string = (body.name ?? "").trim();
    const description: string = (body.description ?? "").trim();
    const memberIds: string[] = Array.isArray(body.member_ids) ? [...new Set(body.member_ids)] as string[] : [];

    if (!name) return NextResponse.json({ success: false, message: "Nama grup wajib diisi" }, { status: 400 });
    if (name.length > 60) return NextResponse.json({ success: false, message: "Nama grup maksimal 60 karakter" }, { status: 400 });
    if (memberIds.length === 0) return NextResponse.json({ success: false, message: "Pilih minimal 1 anggota" }, { status: 400 });
    if (memberIds.includes(user.id)) {
        return NextResponse.json({ success: false, message: "Tidak perlu menambahkan diri sendiri" }, { status: 400 });
    }

    const userRoles: string[] = (user as any).roles ?? [user.role];
    const scope = getGroupCreationScopeMulti(userRoles);
    if (!scope.canCreate) {
        return NextResponse.json({ success: false, message: "Kamu tidak punya izin membuat grup" }, { status: 403 });
    }

    const { data: targetUsers, error: userErr } = await supabaseAdmin
        .from("users").select("id, name, role").in("id", memberIds);
    if (userErr) return NextResponse.json({ success: false, message: userErr.message }, { status: 500 });
    if (!targetUsers || targetUsers.length !== memberIds.length) {
        return NextResponse.json({ success: false, message: "Beberapa anggota tidak ditemukan" }, { status: 404 });
    }

    const invalid = targetUsers.filter(u => !isRoleAddable(scope, u.role));
    if (invalid.length > 0) {
        return NextResponse.json({
            success: false,
            message: `Kamu hanya bisa menambahkan bawahan divisimu. Tidak diizinkan: ${invalid.map(u => u.name).join(", ")}`,
        }, { status: 403 });
    }

    const { data: group, error: groupErr } = await supabaseAdmin
        .from("chat_groups")
        .insert({ name, description: description || null, created_by: user.id })
        .select("id, name, description, avatar_url, created_by, created_at, is_default")
        .single();
    if (groupErr) return NextResponse.json({ success: false, message: groupErr.message }, { status: 500 });

    const memberRows = [
        { group_id: group.id, user_id: user.id, role: "owner", added_by: user.id },
        ...memberIds.map(id => ({ group_id: group.id, user_id: id, role: "member", added_by: user.id })),
    ];
    const { error: memErr } = await supabaseAdmin.from("chat_group_members").insert(memberRows);
    if (memErr) {
        await supabaseAdmin.from("chat_groups").delete().eq("id", group.id); // rollback
        return NextResponse.json({ success: false, message: memErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, group: { ...group, my_role: "owner" } });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);