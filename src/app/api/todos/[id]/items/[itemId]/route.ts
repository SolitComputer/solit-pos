// C:\Users\SOLIT\Documents\SOLIT_POS\solit-pos\src\app\api\todos\[id]\items\[itemId]\route.ts
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

// PATCH /api/todos/[id]/items/[itemId] — toggle is_done atau edit title
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; itemId: string }> }
) {
    const user = await getAuthedUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const { id: todo_id, itemId } = await params;
    const body = await request.json();

    const allowed = ["title", "is_done", "position"];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
        if (key in body) updates[key] = body[key];
    }

    if (updates.title !== undefined) {
        const title = String(updates.title).trim();
        if (!title) return NextResponse.json({ error: "Judul tidak boleh kosong" }, { status: 400 });
        if (title.length > 300) return NextResponse.json({ error: "Judul terlalu panjang" }, { status: 400 });
        updates.title = title;
    }

    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "Tidak ada data yang diupdate" }, { status: 400 });
    }

    const supabase = getSupabase();

    // Update item — gunakan user_id untuk ownership check
    const { data, error } = await supabase
        .from("todo_items")
        .update(updates)
        .eq("id", itemId)
        .eq("todo_id", todo_id)
        .eq("user_id", user.id)
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Item tidak ditemukan" }, { status: 404 });

    return NextResponse.json({ item: data });
}

// DELETE /api/todos/[id]/items/[itemId]
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; itemId: string }> }
) {
    const user = await getAuthedUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const { id: todo_id, itemId } = await params;
    const supabase = getSupabase();

    const { error, count } = await supabase
        .from("todo_items")
        .delete({ count: "exact" })
        .eq("id", itemId)
        .eq("todo_id", todo_id)
        .eq("user_id", user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (count === 0) return NextResponse.json({ error: "Item tidak ditemukan" }, { status: 404 });

    return NextResponse.json({ success: true });
}