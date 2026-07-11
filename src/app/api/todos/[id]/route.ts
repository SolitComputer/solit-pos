import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyToken } from "@/lib/auth";

const TODO_ROLES = ["ADMIN", "PROGRAMMER"];

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
    return user;
}

// PATCH /api/todos/[id] — update (toggle done, edit title, dll)
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const user = await getAuthedUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const { id } = await params;
    const body = await request.json();

    // Whitelist field yang boleh diupdate
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

    // Pastikan todo ini milik user yang sedang login
    const { data, error } = await supabase
        .from("todos")
        .update(updates)
        .eq("id", id)
        .eq("user_id", user.id) // ownership check
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

    const { error, count } = await supabase
        .from("todos")
        .delete({ count: "exact" })
        .eq("id", id)
        .eq("user_id", user.id); // ownership check

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (count === 0) return NextResponse.json({ error: "Todo tidak ditemukan" }, { status: 404 });

    return NextResponse.json({ success: true });
}