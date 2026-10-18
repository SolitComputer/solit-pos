import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Hanya role ADMIN yang boleh kelola Penghargaan Custom (sesuai permintaanmu
// "hanya role admin") — sengaja LEBIH KETAT dari FULL_ACCESS_ROLES
// (ADMIN/PROGRAMMER/ASISTEN_CEO) yang dipakai fitur lain di halaman Lencana.
// Tinggal tambah role lain ke array ini kalau nanti mau dilonggarkan.
const CUSTOM_AWARD_MANAGE_ROLES = ["ADMIN"];

function canManageAwards(user: AuthUser): boolean {
    const u = user as any;
    const roles: string[] = Array.isArray(u.roles) && u.roles.length > 0 ? u.roles : (u.role ? [u.role] : []);
    return roles.some((r) => CUSTOM_AWARD_MANAGE_ROLES.includes(r));
}

const COLOR_SCHEMES = ["gold", "amber", "violet", "blue", "orange", "teal", "rose", "emerald", "cyan", "sky", "fuchsia"];

async function getHandler(req: NextRequest, _ctx: any, user: AuthUser) {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    let query = supabase
        .from("custom_awards")
        .select("id, user_id, title, period_label, icon, color_scheme, note, created_by, created_at")
        .order("created_at", { ascending: false });

    if (userId) query = query.eq("user_id", userId);

    const { data: rows, error } = await query;
    if (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    // 1 query tambahan untuk ambil nama+role pemilik & pemberi (bukan N+1)
    const involvedIds = Array.from(new Set((rows ?? []).flatMap((r) => [r.user_id, r.created_by])));
    const safeIds = involvedIds.length ? involvedIds : ["00000000-0000-0000-0000-000000000000"];
    const { data: usersData } = await supabase.from("users").select("id, name, role").in("id", safeIds);
    const userMap = new Map((usersData ?? []).map((u) => [u.id, u]));

    const data = (rows ?? []).map((r) => ({
        ...r,
        recipient_name: userMap.get(r.user_id)?.name ?? "Unknown",
        recipient_role: userMap.get(r.user_id)?.role ?? "",
        created_by_name: userMap.get(r.created_by)?.name ?? "Unknown",
    }));

    return NextResponse.json({ success: true, data, canManage: canManageAwards(user) });
}

async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
    if (!canManageAwards(user)) {
        return NextResponse.json({ success: false, message: "Hanya Admin yang bisa membuat penghargaan" }, { status: 403 });
    }

    const body = await req.json();
    const targetUserId: string = body.user_id;
    const title: string = (body.title || "").trim();
    const periodLabel: string | null = body.period_label ? String(body.period_label).trim() : null;
    const icon: string = body.icon || "trophy";
    const colorScheme: string = COLOR_SCHEMES.includes(body.color_scheme) ? body.color_scheme : "gold";
    const note: string | null = body.note ? String(body.note).trim() : null;

    if (!targetUserId || !title) {
        return NextResponse.json({ success: false, message: "Karyawan dan judul penghargaan wajib diisi" }, { status: 400 });
    }

    const { data, error } = await supabase
        .from("custom_awards")
        .insert({
            user_id: targetUserId,
            title,
            period_label: periodLabel,
            icon,
            color_scheme: colorScheme,
            note,
            created_by: user.id,
        })
        .select()
        .single();

    if (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, data });
}

async function deleteHandler(req: NextRequest, _ctx: any, user: AuthUser) {
    if (!canManageAwards(user)) {
        return NextResponse.json({ success: false, message: "Hanya Admin yang bisa menghapus penghargaan" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
        return NextResponse.json({ success: false, message: "id wajib diisi" }, { status: 400 });
    }

    const { error } = await supabase.from("custom_awards").delete().eq("id", id);
    if (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
export const DELETE = withAuth(deleteHandler);