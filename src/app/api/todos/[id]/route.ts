import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyToken } from "@/lib/auth";

const TODO_ROLES = ["ADMIN", "PROGRAMMER"];
// Role yang boleh edit/delete todo milik orang lain
const ADMIN_ROLES = ["ADMIN", "PROGRAMMER"];

function getSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );
}

async function getAuthedUser(request: NextRequest) {
    const token = request.cookies.get("token")?.value;
    if (!token) return null;
    const user = await verifyToken(token);
    if (!user) return null;
    const roles: string[] = (user as any).roles ?? [user.role];
    if (!roles.some((r) => TODO_ROLES.includes(r))) return null;
    return { ...user, roles };
}

function isAdmin(user: { roles: string[] }): boolean {
    return user.roles.some((r) => ADMIN_ROLES.includes(r));
}

// PATCH /api/todos/[id]
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const user = await getAuthedUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const { id } = await params;
    const body = await request.json();

    const allowed = ["title", "description", "is_done", "priority", "due_date"];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
        if (key in body) updates[key] = body[key];
    }

    if (updates.title !== undefined) {
        const title = String(updates.title).trim();
        if (!title) return NextResponse.json({ error: "Judul tidak boleh kosong" }, { status: 400 });
        if (title.length > 200) return NextResponse.json({ error: "Judul terlalu panjang" }, { status: 400 });
        updates.title = title;
    }

    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "Tidak ada data yang diupdate" }, { status: 400 });
    }

    const supabase = getSupabase();

    // Cek ownership dulu
    const { data: existing } = await supabase
        .from("todos")
        .select("user_id, is_done")
        .eq("id", id)
        .single();

    if (!existing) return NextResponse.json({ error: "Todo tidak ditemukan" }, { status: 404 });

    // Hanya pemilik atau admin yang boleh edit
    const isOwner = existing.user_id === user.id;
    if (!isOwner && !isAdmin(user)) {
        return NextResponse.json({ error: "Tidak memiliki akses untuk mengedit todo ini" }, { status: 403 });
    }

    // Leaderboard Programmer: 3 poin per tugas yang DISELESAIKAN (is_done
    // false → true). Board ini shared — siapa pun yang menekan toggle
    // (bukan cuma pemiliknya) yang tercatat sebagai penyelesai. Kalau
    // dibuka lagi (is_done → false), field-nya direset ke null supaya
    // tidak "nyangkut" ke penyelesai lama kalau nanti diselesaikan ulang
    // oleh orang lain.
    if ("is_done" in updates) {
        if (updates.is_done === true && !existing.is_done) {
            const { data: completerData } = await supabase
                .from("users")
                .select("name")
                .eq("id", user.id)
                .single();
            updates.completed_by = user.id;
            updates.completed_by_name = completerData?.name ?? null;
            updates.completed_at = new Date().toISOString();
        } else if (updates.is_done === false) {
            updates.completed_by = null;
            updates.completed_by_name = null;
            updates.completed_at = null;
        }
    }

    const { data, error } = await supabase
        .from("todos")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Todo tidak ditemukan" }, { status: 404 });

    return NextResponse.json({ todo: data });
}

// DELETE /api/todos/[id]
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const user = await getAuthedUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const { id } = await params;
    const supabase = getSupabase();

    // Cek ownership dulu
    const { data: existing } = await supabase
        .from("todos")
        .select("user_id")
        .eq("id", id)
        .single();

    if (!existing) return NextResponse.json({ error: "Todo tidak ditemukan" }, { status: 404 });

    // Hanya pemilik atau admin yang boleh hapus
    const isOwner = existing.user_id === user.id;
    if (!isOwner && !isAdmin(user)) {
        return NextResponse.json({ error: "Tidak memiliki akses untuk menghapus todo ini" }, { status: 403 });
    }

    const { error } = await supabase
        .from("todos")
        .delete()
        .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
}